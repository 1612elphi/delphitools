export interface ConversionOptions {
  headingSensitivity: "low" | "medium" | "high";
  detectLists: boolean;
  addPageBreaks: boolean;
}

export interface ConversionStats {
  pages: number;
  words: number;
  headings: number;
  lists: number;
}

export interface ConversionResult {
  markdown: string;
  stats: ConversionStats;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
}

interface TextLine {
  items: TextItem[];
  y: number;
  minX: number;
}

const DEFAULT_OPTIONS: ConversionOptions = {
  headingSensitivity: "medium",
  detectLists: true,
  addPageBreaks: true,
};

// Font size thresholds for heading detection (relative to base font size)
const HEADING_THRESHOLDS = {
  low: { h1: 1.8, h2: 1.5, h3: 1.3 },
  medium: { h1: 1.5, h2: 1.3, h3: 1.2 },
  high: { h1: 1.3, h2: 1.2, h3: 1.1 },
};

// Bullet patterns for list detection
const BULLET_PATTERNS = /^[\u2022\u2023\u25E6\u2043\u2219•\-\*\>]\s*/;
const NUMBERED_PATTERN = /^(\d+[\.\)]\s*|[a-zA-Z][\.\)]\s*)/;

function isBold(fontName: string): boolean {
  const lower = fontName.toLowerCase();
  return lower.includes("bold") || lower.includes("heavy") || lower.includes("black");
}

function isItalic(fontName: string): boolean {
  const lower = fontName.toLowerCase();
  return lower.includes("italic") || lower.includes("oblique");
}

function groupItemsIntoLines(items: TextItem[], lineThreshold = 3): TextLine[] {
  if (items.length === 0) return [];

  // Sort by y position (top to bottom), then by x position (left to right)
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > lineThreshold) {
      return b.y - a.y; // Higher y = higher on page in PDF coordinates
    }
    return a.x - b.x;
  });

  const lines: TextLine[] = [];
  let currentLine: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= lineThreshold) {
      currentLine.push(item);
    } else {
      // Sort current line by x position
      currentLine.sort((a, b) => a.x - b.x);
      lines.push({
        items: currentLine,
        y: currentY,
        minX: Math.min(...currentLine.map((i) => i.x)),
      });
      currentLine = [item];
      currentY = item.y;
    }
  }

  // Don't forget the last line
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push({
      items: currentLine,
      y: currentY,
      minX: Math.min(...currentLine.map((i) => i.x)),
    });
  }

  return lines;
}

function calculateBaseFontSize(items: TextItem[]): number {
  if (items.length === 0) return 12;

  // Find the most common font size (likely body text)
  const fontSizeCounts = new Map<number, number>();
  for (const item of items) {
    const rounded = Math.round(item.fontSize);
    fontSizeCounts.set(rounded, (fontSizeCounts.get(rounded) || 0) + item.str.length);
  }

  let maxCount = 0;
  let baseFontSize = 12;
  for (const [size, count] of fontSizeCounts) {
    if (count > maxCount) {
      maxCount = count;
      baseFontSize = size;
    }
  }

  return baseFontSize;
}

function lineToMarkdown(
  line: TextLine,
  baseFontSize: number,
  options: ConversionOptions,
  baseIndent: number
): { text: string; isHeading: boolean; isList: boolean } {
  const thresholds = HEADING_THRESHOLDS[options.headingSensitivity];
  const lineText = line.items.map((item) => item.str).join("");
  const trimmedText = lineText.trim();

  if (!trimmedText) {
    return { text: "", isHeading: false, isList: false };
  }

  // Calculate average font size for the line
  const totalChars = line.items.reduce((sum, item) => sum + item.str.length, 0);
  const weightedFontSize =
    line.items.reduce((sum, item) => sum + item.fontSize * item.str.length, 0) / totalChars;
  const fontRatio = weightedFontSize / baseFontSize;

  // Check if line is a heading based on font size
  let headingLevel = 0;
  if (fontRatio >= thresholds.h1) {
    headingLevel = 1;
  } else if (fontRatio >= thresholds.h2) {
    headingLevel = 2;
  } else if (fontRatio >= thresholds.h3) {
    headingLevel = 3;
  }

  if (headingLevel > 0) {
    const prefix = "#".repeat(headingLevel);
    return { text: `${prefix} ${trimmedText}`, isHeading: true, isList: false };
  }

  // Check for lists
  if (options.detectLists) {
    const bulletMatch = trimmedText.match(BULLET_PATTERNS);
    if (bulletMatch) {
      const content = trimmedText.slice(bulletMatch[0].length);
      const formattedContent = applyInlineFormatting(content, line.items.slice(bulletMatch[0].length));
      return { text: `- ${formattedContent}`, isHeading: false, isList: true };
    }

    const numberedMatch = trimmedText.match(NUMBERED_PATTERN);
    if (numberedMatch) {
      const content = trimmedText.slice(numberedMatch[0].length);
      const formattedContent = applyInlineFormatting(content, line.items);
      // Extract number for ordered list
      const num = numberedMatch[1].replace(/[\.\)]\s*$/, "");
      const numericNum = /^\d+$/.test(num) ? num : "1";
      return { text: `${numericNum}. ${formattedContent}`, isHeading: false, isList: true };
    }

    // Check for indentation-based lists (items significantly indented from baseline)
    const indentDiff = line.minX - baseIndent;
    if (indentDiff > 20) {
      const formattedContent = applyInlineFormatting(trimmedText, line.items);
      return { text: `  - ${formattedContent}`, isHeading: false, isList: true };
    }
  }

  // Regular paragraph with inline formatting
  const formattedText = applyInlineFormatting(trimmedText, line.items);
  return { text: formattedText, isHeading: false, isList: false };
}

function applyInlineFormatting(text: string, items: TextItem[]): string {
  if (items.length === 0) return text;

  // Build formatted text by checking font properties
  let result = "";
  let currentBold = false;
  let currentItalic = false;

  for (const item of items) {
    const itemBold = isBold(item.fontName);
    const itemItalic = isItalic(item.fontName);

    // Close tags if formatting changes
    if (currentItalic && !itemItalic) {
      result += "*";
      currentItalic = false;
    }
    if (currentBold && !itemBold) {
      result += "**";
      currentBold = false;
    }

    // Open tags if formatting changes
    if (!currentBold && itemBold) {
      result += "**";
      currentBold = true;
    }
    if (!currentItalic && itemItalic) {
      result += "*";
      currentItalic = true;
    }

    result += item.str;
  }

  // Close any remaining tags
  if (currentItalic) result += "*";
  if (currentBold) result += "**";

  return result;
}

// Dynamic import to avoid SSR issues
async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

export async function convertPdfToMarkdown(
  data: ArrayBuffer,
  options: Partial<ConversionOptions> = {},
  onProgress?: (current: number, total: number) => void
): Promise<ConversionResult> {
  const opts: ConversionOptions = { ...DEFAULT_OPTIONS, ...options };
  const pdfjs = await getPdfJs();

  const pdf = await pdfjs.getDocument({ data }).promise;
  const numPages = pdf.numPages;

  const markdownParts: string[] = [];
  let totalWords = 0;
  let totalHeadings = 0;
  let totalLists = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) {
      onProgress(pageNum, numPages);
    }

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items: TextItem[] = [];

    for (const item of textContent.items) {
      if ("str" in item && item.str.trim()) {
        const transform = item.transform;
        items.push({
          str: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width,
          height: item.height,
          fontSize: Math.abs(transform[0]) || Math.abs(transform[3]) || 12,
          fontName: item.fontName || "",
        });
      }
    }

    if (items.length === 0) continue;

    const baseFontSize = calculateBaseFontSize(items);
    const lines = groupItemsIntoLines(items);

    // Calculate base indent (leftmost position that appears frequently)
    const xPositions = lines.map((l) => Math.round(l.minX));
    const xCounts = new Map<number, number>();
    for (const x of xPositions) {
      xCounts.set(x, (xCounts.get(x) || 0) + 1);
    }
    let baseIndent = Math.min(...xPositions);
    let maxCount = 0;
    for (const [x, count] of xCounts) {
      if (count > maxCount) {
        maxCount = count;
        baseIndent = x;
      }
    }

    const pageMarkdown: string[] = [];
    let previousY = lines[0]?.y || 0;
    let inList = false;

    for (const line of lines) {
      const { text, isHeading, isList } = lineToMarkdown(line, baseFontSize, opts, baseIndent);

      if (!text) continue;

      // Add paragraph breaks for large vertical gaps
      const yGap = previousY - line.y;
      if (yGap > baseFontSize * 1.5 && pageMarkdown.length > 0 && !isHeading) {
        // Add blank line for paragraph break
        if (!inList || !isList) {
          pageMarkdown.push("");
        }
      }

      pageMarkdown.push(text);
      previousY = line.y;

      // Track stats
      totalWords += text.split(/\s+/).filter((w) => w.length > 0).length;
      if (isHeading) totalHeadings++;
      if (isList) totalLists++;
      inList = isList;
    }

    if (pageMarkdown.length > 0) {
      markdownParts.push(pageMarkdown.join("\n"));
    }

    // Add page break marker
    if (opts.addPageBreaks && pageNum < numPages) {
      markdownParts.push("\n---\n");
    }
  }

  return {
    markdown: markdownParts.join("\n\n"),
    stats: {
      pages: numPages,
      words: totalWords,
      headings: totalHeadings,
      lists: totalLists,
    },
  };
}
