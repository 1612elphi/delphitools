"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Info,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFNumber,
  PDFRef,
  PDFHexString,
  PDFString,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.624/pdf.worker.min.mjs`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = "error" | "warning" | "info";
type CheckCategory =
  | "document"
  | "geometry"
  | "fonts"
  | "colour"
  | "images"
  | "transparency";

interface PreflightIssue {
  severity: Severity;
  category: CheckCategory;
  message: string;
  page?: number;
  details?: string;
}

interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageInfo {
  number: number;
  width: number;
  height: number;
  mediaBox: PageBox;
  trimBox?: PageBox;
  bleedBox?: PageBox;
  cropBox?: PageBox;
}

interface FontInfo {
  name: string;
  embedded: boolean;
  type?: string;
}

interface PreflightReport {
  fileName: string;
  fileSize: number;
  pdfVersion: string;
  pageCount: number;
  encrypted: boolean;
  pages: PageInfo[];
  fonts: FontInfo[];
  issues: PreflightIssue[];
}

interface PdfFile {
  name: string;
  size: number;
  buffer: ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Convert 4-element PDF array [llx, lly, urx, ury] to a PageBox */
function arrayToBox(arr: PDFArray): PageBox {
  const nums: number[] = [];
  for (let i = 0; i < arr.size(); i++) {
    const val = arr.get(i);
    if (val instanceof PDFNumber) {
      nums.push(val.asNumber());
    } else if (val instanceof PDFRef) {
      nums.push(0);
    }
  }
  if (nums.length < 4) return { x: 0, y: 0, width: 612, height: 792 };
  const [llx, lly, urx, ury] = nums;
  return {
    x: Math.min(llx, urx),
    y: Math.min(lly, ury),
    width: Math.abs(urx - llx),
    height: Math.abs(ury - lly),
  };
}

function ptsToMm(pts: number): number {
  return pts * 0.352778;
}

const CATEGORY_LABELS: Record<CheckCategory, string> = {
  document: "Document",
  geometry: "Geometry",
  fonts: "Fonts",
  colour: "Colour",
  images: "Images",
  transparency: "Transparency",
};

// ---------------------------------------------------------------------------
// Structural analysis with pdf-lib
// ---------------------------------------------------------------------------

async function analyseWithPdfLib(
  buffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): Promise<PreflightReport> {
  const issues: PreflightIssue[] = [];
  const pages: PageInfo[] = [];
  const fontsMap = new Map<string, FontInfo>();

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    throw new Error("PARSE_ERROR");
  }

  // PDF version
  const context = doc.context;
  const headerBytes = new Uint8Array(buffer.slice(0, 20));
  const headerStr = String.fromCharCode(...headerBytes);
  const versionMatch = headerStr.match(/%PDF-(\d+\.\d+)/);
  const pdfVersion = versionMatch ? versionMatch[1] : "unknown";

  // Encryption check
  const trailer = context.trailerInfo;
  const encrypted = !!trailer.Encrypt;
  if (encrypted) {
    issues.push({
      severity: "warning",
      category: "document",
      message: "PDF is encrypted or has security restrictions",
      details:
        "Some features may be restricted. Ensure the printer can process this file.",
    });
  }

  const pdfPages = doc.getPages();
  const pageCount = pdfPages.length;

  if (pageCount === 0) {
    issues.push({
      severity: "error",
      category: "document",
      message: "PDF contains no pages",
    });
  }

  // Analyse each page
  let firstWidth = 0;
  let firstHeight = 0;

  for (let i = 0; i < pdfPages.length; i++) {
    const page = pdfPages[i];
    const pageNum = i + 1;

    // MediaBox
    const mediaBoxRaw = page.node.get(PDFName.of("MediaBox"));
    let mediaBox: PageBox;
    if (mediaBoxRaw instanceof PDFArray) {
      mediaBox = arrayToBox(mediaBoxRaw);
    } else {
      mediaBox = {
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: page.getHeight(),
      };
    }

    // TrimBox
    let trimBox: PageBox | undefined;
    const trimBoxRaw = page.node.get(PDFName.of("TrimBox"));
    if (trimBoxRaw instanceof PDFArray) {
      trimBox = arrayToBox(trimBoxRaw);
    }

    // BleedBox
    let bleedBox: PageBox | undefined;
    const bleedBoxRaw = page.node.get(PDFName.of("BleedBox"));
    if (bleedBoxRaw instanceof PDFArray) {
      bleedBox = arrayToBox(bleedBoxRaw);
    }

    // CropBox
    let cropBox: PageBox | undefined;
    const cropBoxRaw = page.node.get(PDFName.of("CropBox"));
    if (cropBoxRaw instanceof PDFArray) {
      cropBox = arrayToBox(cropBoxRaw);
    }

    pages.push({
      number: pageNum,
      width: mediaBox.width,
      height: mediaBox.height,
      mediaBox,
      trimBox,
      bleedBox,
      cropBox,
    });

    // Bleed checks
    if (!bleedBox) {
      issues.push({
        severity: "warning",
        category: "geometry",
        message: "No BleedBox defined",
        page: pageNum,
        details:
          "Without a bleed area, content may be cut off at the page edge. Most printers require at least 3mm bleed.",
      });
    } else if (trimBox) {
      const bleedLeft = trimBox.x - bleedBox.x;
      const bleedBottom = trimBox.y - bleedBox.y;
      const bleedRight =
        bleedBox.x + bleedBox.width - (trimBox.x + trimBox.width);
      const bleedTop =
        bleedBox.y + bleedBox.height - (trimBox.y + trimBox.height);
      const minBleed = Math.min(bleedLeft, bleedBottom, bleedRight, bleedTop);
      if (minBleed < 8.5) {
        issues.push({
          severity: "warning",
          category: "geometry",
          message: `Bleed margin is only ${ptsToMm(minBleed).toFixed(1)}mm (minimum 3mm recommended)`,
          page: pageNum,
          details: `Smallest bleed margin found: ${minBleed.toFixed(1)}pt (${ptsToMm(minBleed).toFixed(1)}mm). Printers typically require at least 3mm.`,
        });
      }
    }

    if (!trimBox) {
      issues.push({
        severity: "info",
        category: "geometry",
        message: "No TrimBox defined",
        page: pageNum,
        details:
          "The TrimBox defines the finished page size after cutting. Without it, the MediaBox is used as the trim size.",
      });
    }

    // Page size consistency
    if (i === 0) {
      firstWidth = mediaBox.width;
      firstHeight = mediaBox.height;
    } else {
      if (
        Math.abs(mediaBox.width - firstWidth) > 1 ||
        Math.abs(mediaBox.height - firstHeight) > 1
      ) {
        issues.push({
          severity: "warning",
          category: "geometry",
          message: "Page size differs from page 1",
          page: pageNum,
          details: `Page ${pageNum}: ${mediaBox.width.toFixed(0)} x ${mediaBox.height.toFixed(0)}pt vs page 1: ${firstWidth.toFixed(0)} x ${firstHeight.toFixed(0)}pt`,
        });
      }
    }

    // ----- Font extraction -----
    const resourcesRaw = page.node.get(PDFName.of("Resources"));
    let resources: PDFDict | undefined;
    if (resourcesRaw instanceof PDFDict) {
      resources = resourcesRaw;
    } else if (resourcesRaw instanceof PDFRef) {
      const resolved = context.lookup(resourcesRaw);
      if (resolved instanceof PDFDict) resources = resolved;
    }

    if (resources) {
      const fontsRaw = resources.get(PDFName.of("Font"));
      let fontsDict: PDFDict | undefined;
      if (fontsRaw instanceof PDFDict) {
        fontsDict = fontsRaw;
      } else if (fontsRaw instanceof PDFRef) {
        const resolved = context.lookup(fontsRaw);
        if (resolved instanceof PDFDict) fontsDict = resolved;
      }

      if (fontsDict) {
        const fontEntries = fontsDict.entries();
        for (const [, fontValue] of fontEntries) {
          let fontDict: PDFDict | undefined;
          if (fontValue instanceof PDFDict) {
            fontDict = fontValue;
          } else if (fontValue instanceof PDFRef) {
            const resolved = context.lookup(fontValue);
            if (resolved instanceof PDFDict) fontDict = resolved;
          }

          if (!fontDict) continue;

          // Font name
          const baseFontRaw = fontDict.get(PDFName.of("BaseFont"));
          let fontName = "Unknown";
          if (baseFontRaw instanceof PDFName) {
            fontName = baseFontRaw.decodeText();
          } else if (
            baseFontRaw instanceof PDFHexString ||
            baseFontRaw instanceof PDFString
          ) {
            fontName = baseFontRaw.decodeText();
          }

          // Clean up font name (remove subset prefix like ABCDEF+)
          fontName = fontName.replace(/^[A-Z]{6}\+/, "");

          // Font type
          const subtypeRaw = fontDict.get(PDFName.of("Subtype"));
          let fontType: string | undefined;
          if (subtypeRaw instanceof PDFName) {
            fontType = subtypeRaw.decodeText();
          }

          // Check embedding
          let embedded = false;
          const descriptorRaw = fontDict.get(PDFName.of("FontDescriptor"));
          let descriptor: PDFDict | undefined;
          if (descriptorRaw instanceof PDFDict) {
            descriptor = descriptorRaw;
          } else if (descriptorRaw instanceof PDFRef) {
            const resolved = context.lookup(descriptorRaw);
            if (resolved instanceof PDFDict) descriptor = resolved;
          }

          if (descriptor) {
            const ff1 = descriptor.get(PDFName.of("FontFile"));
            const ff2 = descriptor.get(PDFName.of("FontFile2"));
            const ff3 = descriptor.get(PDFName.of("FontFile3"));
            embedded = !!(ff1 || ff2 || ff3);
          }

          // Type1 standard 14 fonts don't need embedding
          const standard14 = [
            "Courier",
            "Courier-Bold",
            "Courier-BoldOblique",
            "Courier-Oblique",
            "Helvetica",
            "Helvetica-Bold",
            "Helvetica-BoldOblique",
            "Helvetica-Oblique",
            "Symbol",
            "Times-Bold",
            "Times-BoldItalic",
            "Times-Italic",
            "Times-Roman",
            "ZapfDingbats",
          ];
          if (!embedded && standard14.includes(fontName)) {
            embedded = true;
          }

          // Composite fonts (Type0) with descendant CIDFonts
          if (!embedded && fontType === "Type0") {
            const descendants = fontDict.get(PDFName.of("DescendantFonts"));
            if (descendants instanceof PDFArray) {
              for (let d = 0; d < descendants.size(); d++) {
                let cidFont: PDFDict | undefined;
                const desc = descendants.get(d);
                if (desc instanceof PDFDict) cidFont = desc;
                else if (desc instanceof PDFRef) {
                  const resolved = context.lookup(desc);
                  if (resolved instanceof PDFDict) cidFont = resolved;
                }
                if (cidFont) {
                  const cidDesc = cidFont.get(PDFName.of("FontDescriptor"));
                  let cidDescriptor: PDFDict | undefined;
                  if (cidDesc instanceof PDFDict) cidDescriptor = cidDesc;
                  else if (cidDesc instanceof PDFRef) {
                    const resolved = context.lookup(cidDesc);
                    if (resolved instanceof PDFDict) cidDescriptor = resolved;
                  }
                  if (cidDescriptor) {
                    const ff1 = cidDescriptor.get(PDFName.of("FontFile"));
                    const ff2 = cidDescriptor.get(PDFName.of("FontFile2"));
                    const ff3 = cidDescriptor.get(PDFName.of("FontFile3"));
                    if (ff1 || ff2 || ff3) embedded = true;
                  }
                }
              }
            }
          }

          const key = `${fontName}:${fontType ?? ""}`;
          if (!fontsMap.has(key)) {
            fontsMap.set(key, { name: fontName, embedded, type: fontType });
          }
        }
      }

      // ----- Transparency detection -----
      const groupRaw = page.node.get(PDFName.of("Group"));
      let groupDict: PDFDict | undefined;
      if (groupRaw instanceof PDFDict) groupDict = groupRaw;
      else if (groupRaw instanceof PDFRef) {
        const resolved = context.lookup(groupRaw);
        if (resolved instanceof PDFDict) groupDict = resolved;
      }
      if (groupDict) {
        const sRaw = groupDict.get(PDFName.of("S"));
        if (sRaw instanceof PDFName && sRaw.decodeText() === "Transparency") {
          if (parseFloat(pdfVersion) < 1.4) {
            issues.push({
              severity: "error",
              category: "transparency",
              message: "Transparency used in a PDF older than 1.4",
              page: pageNum,
              details:
                "PDF versions before 1.4 do not support transparency. This may cause rendering issues.",
            });
          } else {
            issues.push({
              severity: "info",
              category: "transparency",
              message: "Page uses transparency group",
              page: pageNum,
              details:
                "This page has a transparency group. Ensure your printer/RIP supports transparency or flatten before printing.",
            });
          }
        }
      }

      // Check ExtGState for transparency
      const extGStateRaw = resources.get(PDFName.of("ExtGState"));
      let extGStateDict: PDFDict | undefined;
      if (extGStateRaw instanceof PDFDict) extGStateDict = extGStateRaw;
      else if (extGStateRaw instanceof PDFRef) {
        const resolved = context.lookup(extGStateRaw);
        if (resolved instanceof PDFDict) extGStateDict = resolved;
      }

      if (extGStateDict) {
        const gsEntries = extGStateDict.entries();
        let hasTransparency = false;
        for (const [, gsValue] of gsEntries) {
          let gsDict: PDFDict | undefined;
          if (gsValue instanceof PDFDict) gsDict = gsValue;
          else if (gsValue instanceof PDFRef) {
            const resolved = context.lookup(gsValue);
            if (resolved instanceof PDFDict) gsDict = resolved;
          }
          if (!gsDict) continue;

          const caRaw = gsDict.get(PDFName.of("ca"));
          if (caRaw instanceof PDFNumber && caRaw.asNumber() < 1) {
            hasTransparency = true;
          }

          const caStrokeRaw = gsDict.get(PDFName.of("CA"));
          if (caStrokeRaw instanceof PDFNumber && caStrokeRaw.asNumber() < 1) {
            hasTransparency = true;
          }

          const smaskRaw = gsDict.get(PDFName.of("SMask"));
          if (
            smaskRaw &&
            !(smaskRaw instanceof PDFName && smaskRaw.decodeText() === "None")
          ) {
            hasTransparency = true;
          }
        }

        if (hasTransparency) {
          if (parseFloat(pdfVersion) < 1.4) {
            issues.push({
              severity: "error",
              category: "transparency",
              message: "Transparency effects used in a PDF older than 1.4",
              page: pageNum,
              details:
                "Opacity or soft mask settings require PDF 1.4+. This may not render correctly.",
            });
          } else {
            issues.push({
              severity: "info",
              category: "transparency",
              message:
                "Page uses transparency effects (opacity or soft mask)",
              page: pageNum,
              details:
                "Elements with reduced opacity or soft masks were detected. Consider flattening transparency for older RIPs.",
            });
          }
        }
      }
    }
  }

  // Font issues
  const fonts = Array.from(fontsMap.values());
  for (const font of fonts) {
    if (!font.embedded) {
      issues.push({
        severity: "error",
        category: "fonts",
        message: `Font "${font.name}" is not embedded`,
        details:
          "Non-embedded fonts may render incorrectly or cause missing text at the printer. Embed all fonts before sending to print.",
      });
    }
    if (font.type === "Type3") {
      issues.push({
        severity: "warning",
        category: "fonts",
        message: `Font "${font.name}" is a Type 3 font`,
        details:
          "Type 3 fonts are bitmap-based and may not scale well. Consider replacing with an outline font.",
      });
    }
  }

  // Document-level info
  if (parseFloat(pdfVersion) < 1.3) {
    issues.push({
      severity: "info",
      category: "document",
      message: `PDF version ${pdfVersion} is quite old`,
      details:
        "Modern print workflows typically use PDF 1.4+ or PDF/X standards.",
    });
  }

  return {
    fileName,
    fileSize,
    pdfVersion,
    pageCount,
    encrypted,
    pages,
    fonts,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Image & colour-space analysis with pdf.js
// ---------------------------------------------------------------------------

async function analyseWithPdfJs(
  buffer: ArrayBuffer
): Promise<{ pdfDoc: PDFDocumentProxy; issues: PreflightIssue[] }> {
  const issues: PreflightIssue[] = [];

  const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
  const pdfDoc = await loadingTask.promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const opList = await page.getOperatorList();

    let imageCount = 0;
    const colourSpaces = new Set<string>();

    for (let j = 0; j < opList.fnArray.length; j++) {
      const fn = opList.fnArray[j];

      // paintImageXObject=82, paintJpegXObject=83, paintImageXObjectRepeat=85
      if (fn === 82 || fn === 83 || fn === 85) {
        imageCount++;
      }

      // setFillColorSpace=33, setStrokeColorSpace=34
      if (fn === 33 || fn === 34) {
        const args = opList.argsArray[j];
        if (args && args[0]) {
          const csName =
            typeof args[0] === "string" ? args[0] : String(args[0]);
          colourSpaces.add(csName);
        }
      }
    }

    const hasRGB = Array.from(colourSpaces).some(
      (cs) =>
        cs.includes("RGB") ||
        cs.includes("DeviceRGB") ||
        cs === "rgb"
    );
    const hasCMYK = Array.from(colourSpaces).some(
      (cs) =>
        cs.includes("CMYK") ||
        cs.includes("DeviceCMYK") ||
        cs === "cmyk"
    );

    if (hasRGB) {
      issues.push({
        severity: "warning",
        category: "colour",
        message: "RGB colour space detected",
        page: i,
        details:
          "RGB colours may shift when converted to CMYK for print. Consider converting to CMYK before sending to a commercial printer.",
      });
    }

    if (hasRGB && hasCMYK) {
      issues.push({
        severity: "warning",
        category: "colour",
        message: "Mixed colour spaces (RGB and CMYK)",
        page: i,
        details:
          "This page uses both RGB and CMYK colour spaces. Mixed colour spaces can cause inconsistent colour output.",
      });
    }

    if (imageCount > 0) {
      issues.push({
        severity: "info",
        category: "images",
        message: `${imageCount} image${imageCount > 1 ? "s" : ""} found`,
        page: i,
        details:
          "Ensure images are at least 300 DPI for print. Low-resolution images may appear pixelated.",
      });
    }

    page.cleanup();
  }

  return { pdfDoc, issues };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PdfPreflightTool() {
  const [file, setFile] = useState<PdfFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [report, setReport] = useState<PreflightReport | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ---- File handling ----

  const validateAndLoadFile = useCallback((candidate: File) => {
    setError(null);

    if (candidate.type && candidate.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }

    if (!candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a file with a .pdf extension.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;

      const header = new Uint8Array(buffer.slice(0, 5));
      const magic = String.fromCharCode(...header);
      if (!magic.startsWith("%PDF")) {
        setError("The file does not appear to be a valid PDF.");
        return;
      }

      setFile({ name: candidate.name, size: candidate.size, buffer });
    };
    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
    };
    reader.readAsArrayBuffer(candidate);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) validateAndLoadFile(dropped);
    },
    [validateAndLoadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) validateAndLoadFile(selected);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [validateAndLoadFile]
  );

  const handleClear = useCallback(() => {
    setFile(null);
    setError(null);
    setReport(null);
    setAnalysing(false);
    setPdfDoc(null);
    setCurrentPage(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ---- Analysis trigger ----

  useEffect(() => {
    if (!file) {
      setReport(null);
      setPdfDoc(null);
      return;
    }

    let cancelled = false;

    async function runAnalysis(f: PdfFile) {
      setAnalysing(true);
      setError(null);
      setReport(null);
      setPdfDoc(null);
      setCurrentPage(1);

      try {
        // Phase 1: structural analysis with pdf-lib
        const structReport = await analyseWithPdfLib(f.buffer, f.name, f.size);
        if (cancelled) return;

        // Phase 2: image/colour analysis with pdf.js
        try {
          const { pdfDoc: doc, issues: pdjsIssues } = await analyseWithPdfJs(
            f.buffer
          );
          if (cancelled) {
            doc.destroy();
            return;
          }
          structReport.issues.push(...pdjsIssues);
          setPdfDoc(doc);
        } catch {
          structReport.issues.push({
            severity: "warning",
            category: "document",
            message: "Could not render page previews",
            details:
              "The page preview and image analysis could not be loaded. Structural analysis is still available.",
          });
        }

        if (!cancelled) {
          setReport(structReport);
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        if (msg === "PARSE_ERROR") {
          setError("Could not parse this PDF file.");
        } else if (msg.includes("encrypted") || msg.includes("password")) {
          setError(
            "This PDF is encrypted or password-protected and cannot be analysed."
          );
        } else {
          setError("Could not parse this PDF file.");
        }
      } finally {
        if (!cancelled) setAnalysing(false);
      }
    }

    runAnalysis(file);

    return () => {
      cancelled = true;
    };
  }, [file]);

  // ---- Page rendering ----

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !report) return;

    let cancelled = false;

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current || !report) return;

      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });

      const desiredWidth = 600;
      const scale = desiredWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Render page content (pdf.js v5 requires the canvas property)
      await page.render({
        canvas,
        viewport: scaledViewport,
      }).promise;

      if (cancelled) return;

      // Draw box overlays
      const pageInfo = report.pages[currentPage - 1];
      if (!pageInfo) return;

      const mediaBox = pageInfo.mediaBox;

      function drawBox(box: PageBox | undefined, colour: string) {
        if (!box || !ctx || !canvas) return;

        // Transform PDF coordinates (bottom-left origin) to canvas (top-left origin)
        const x1 = (box.x - mediaBox.x) * scale;
        const y1 =
          canvas.height - (box.y + box.height - mediaBox.y) * scale;
        const w = box.width * scale;
        const h = box.height * scale;

        ctx.save();
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x1, y1, w, h);
        ctx.restore();
      }

      drawBox(pageInfo.trimBox, "#3b82f6");
      drawBox(pageInfo.bleedBox, "#ef4444");
      drawBox(pageInfo.cropBox, "#22c55e");
    }

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, report]);

  // ---- Derived data ----

  const errorCount =
    report?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warningCount =
    report?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const infoCount =
    report?.issues.filter((i) => i.severity === "info").length ?? 0;

  const issuesByCategory = report
    ? (Object.keys(CATEGORY_LABELS) as CheckCategory[]).reduce(
        (acc, cat) => {
          const catIssues = report.issues.filter((i) => i.category === cat);
          if (catIssues.length > 0) acc[cat] = catIssues;
          return acc;
        },
        {} as Record<CheckCategory, PreflightIssue[]>
      )
    : {};

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
            isDragActive
              ? "border-primary bg-primary/5"
              : "hover:border-primary/50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop a PDF here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to select a file
          </p>
        </div>
      ) : (
        /* File Info */
        <div className="border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <FileText className="size-10 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatSize(file.size)}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClear}>
              <X className="size-4" />
              <span className="sr-only">Remove file</span>
            </Button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Analysing spinner */}
      {analysing && (
        <div className="flex items-center justify-center gap-3 py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Analysing PDF...</span>
        </div>
      )}

      {/* Report */}
      {report && !analysing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left panel: page preview */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Page Preview</h3>

            {pdfDoc ? (
              <>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto"
                    style={{ display: "block" }}
                  />
                </div>

                {/* Page navigation */}
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    <span className="sr-only">Previous page</span>
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    Page {currentPage} of {report.pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={currentPage >= report.pageCount}
                    onClick={() =>
                      setCurrentPage((p) =>
                        Math.min(report.pageCount, p + 1)
                      )
                    }
                  >
                    <ChevronRight className="size-4" />
                    <span className="sr-only">Next page</span>
                  </Button>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-blue-500" />
                    Trim
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-red-500" />
                    Bleed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-green-500" />
                    Crop
                  </span>
                </div>
              </>
            ) : (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                Page preview unavailable
              </div>
            )}

            {/* Page dimensions info */}
            {report.pages[currentPage - 1] && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">Page size:</span>{" "}
                  {report.pages[currentPage - 1].width.toFixed(0)} x{" "}
                  {report.pages[currentPage - 1].height.toFixed(0)}pt (
                  {ptsToMm(report.pages[currentPage - 1].width).toFixed(0)} x{" "}
                  {ptsToMm(report.pages[currentPage - 1].height).toFixed(0)}
                  mm)
                </p>
                {report.pages[currentPage - 1].trimBox && (
                  <p>
                    <span className="font-medium">Trim:</span>{" "}
                    {report.pages[currentPage - 1].trimBox!.width.toFixed(0)} x{" "}
                    {report.pages[currentPage - 1].trimBox!.height.toFixed(0)}pt
                  </p>
                )}
                {report.pages[currentPage - 1].bleedBox && (
                  <p>
                    <span className="font-medium">Bleed:</span>{" "}
                    {report.pages[currentPage - 1].bleedBox!.width.toFixed(0)}{" "}
                    x{" "}
                    {report.pages[currentPage - 1].bleedBox!.height.toFixed(0)}
                    pt
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right panel: report */}
          <div className="space-y-4">
            {/* Pass / fail badge */}
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg p-4",
                errorCount === 0
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : "bg-red-500/10 text-red-700 dark:text-red-400"
              )}
            >
              {errorCount === 0 ? (
                <>
                  <CircleCheck className="size-6 shrink-0" />
                  <div>
                    <p className="font-semibold">Ready for print</p>
                    <p className="text-sm opacity-80">
                      No critical issues found
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CircleX className="size-6 shrink-0" />
                  <div>
                    <p className="font-semibold">Issues found</p>
                    <p className="text-sm opacity-80">
                      {errorCount} error{errorCount !== 1 ? "s" : ""} must be
                      resolved before printing
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Severity summary */}
            <div className="flex flex-wrap gap-2">
              {errorCount > 0 && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-400">
                  {errorCount} error{errorCount !== 1 ? "s" : ""}
                </span>
              )}
              {warningCount > 0 && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  {warningCount} warning{warningCount !== 1 ? "s" : ""}
                </span>
              )}
              {infoCount > 0 && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400">
                  {infoCount} info
                </span>
              )}
              {report.issues.length === 0 && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-500/10 text-green-700 dark:text-green-400">
                  All checks passed
                </span>
              )}
            </div>

            <Separator />

            {/* Document summary */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">PDF Version</span>
              <span>{report.pdfVersion}</span>
              <span className="text-muted-foreground">Pages</span>
              <span>{report.pageCount}</span>
              <span className="text-muted-foreground">File Size</span>
              <span>{formatSize(report.fileSize)}</span>
              <span className="text-muted-foreground">Encrypted</span>
              <span>{report.encrypted ? "Yes" : "No"}</span>
              <span className="text-muted-foreground">Fonts</span>
              <span>
                {report.fonts.length} (
                {report.fonts.filter((f) => f.embedded).length} embedded)
              </span>
            </div>

            {/* Font list */}
            {report.fonts.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2">Fonts</h4>
                  <div className="space-y-1">
                    {report.fonts.map((font, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate mr-2">
                          {font.name}
                          {font.type && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({font.type})
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-xs shrink-0",
                            font.embedded
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          )}
                        >
                          {font.embedded ? "Embedded" : "Not embedded"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Issues by category */}
            {Object.keys(issuesByCategory).length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold">Issues</h4>
                  {(
                    Object.entries(issuesByCategory) as [
                      CheckCategory,
                      PreflightIssue[],
                    ][]
                  ).map(([category, catIssues]) => (
                    <div key={category}>
                      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        {CATEGORY_LABELS[category]}
                      </h5>
                      <div className="space-y-2">
                        {catIssues.map((issue, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={cn(
                              "w-full text-left rounded-lg border p-3 transition-colors",
                              issue.page
                                ? "hover:bg-muted/50 cursor-pointer"
                                : "cursor-default"
                            )}
                            onClick={() => {
                              if (issue.page) setCurrentPage(issue.page);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              {issue.severity === "error" && (
                                <CircleX className="size-4 shrink-0 mt-0.5 text-red-500" />
                              )}
                              {issue.severity === "warning" && (
                                <TriangleAlert className="size-4 shrink-0 mt-0.5 text-amber-500" />
                              )}
                              {issue.severity === "info" && (
                                <Info className="size-4 shrink-0 mt-0.5 text-blue-500" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">
                                  {issue.message}
                                  {issue.page && (
                                    <span className="text-xs text-muted-foreground font-normal ml-1.5">
                                      p.{issue.page}
                                    </span>
                                  )}
                                </p>
                                {issue.details && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {issue.details}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
