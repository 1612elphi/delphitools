/* Curated catalogue of the pandoc formats we surface in the Document Converter.
 *
 * Pandoc supports ~40 input and ~60 output formats; exposing all of them is
 * overwhelming. We split into Tier 1 (everyday) and Tier 2 (power-user, shown
 * under "More formats"). PDF is intentionally absent: pandoc cannot produce PDF
 * in the wasm sandbox (it needs an external engine). See the dossier.
 */

export type FormatKind = "text" | "binary" | "pdf";

export interface PandocFormat {
  /** pandoc -f/-t identifier */
  id: string;
  label: string;
  /** one-line descriptor shown under the label in the picker */
  subtitle: string;
  /** download file extension (no dot) */
  ext: string;
  kind: FormatKind;
  tier: 1 | 2;
  /** usable as a source format */
  input: boolean;
  /** usable as a target format */
  output: boolean;
}

export const AUTO_DETECT = "auto";

export const FORMATS: PandocFormat[] = [
  // ── Tier 1 — everyday ──────────────────────────────────────────────────
  { id: "markdown", label: "Markdown", subtitle: "Pandoc's extended Markdown", ext: "md", kind: "text", tier: 1, input: true, output: true },
  { id: "gfm", label: "Markdown (GitHub)", subtitle: "GFM — tables, tasks, footnotes", ext: "md", kind: "text", tier: 1, input: true, output: true },
  { id: "commonmark", label: "Markdown (CommonMark)", subtitle: "Strict CommonMark spec", ext: "md", kind: "text", tier: 1, input: true, output: true },
  { id: "html", label: "HTML", subtitle: "Web page or fragment · .html", ext: "html", kind: "text", tier: 1, input: true, output: true },
  { id: "pdf", label: "PDF", subtitle: "Print to PDF — via your browser", ext: "pdf", kind: "pdf", tier: 1, input: false, output: true },
  { id: "docx", label: "Word", subtitle: "Microsoft Word · .docx", ext: "docx", kind: "binary", tier: 1, input: true, output: true },
  { id: "odt", label: "OpenDocument", subtitle: "LibreOffice / OpenOffice · .odt", ext: "odt", kind: "binary", tier: 1, input: true, output: true },
  { id: "rtf", label: "Rich Text", subtitle: "Rich Text Format · .rtf", ext: "rtf", kind: "text", tier: 1, input: false, output: true },
  { id: "epub", label: "EPUB", subtitle: "E-book · .epub", ext: "epub", kind: "binary", tier: 1, input: true, output: true },
  { id: "latex", label: "LaTeX", subtitle: "TeX source · .tex", ext: "tex", kind: "text", tier: 1, input: true, output: true },
  { id: "plain", label: "Plain text", subtitle: "Unformatted text · .txt", ext: "txt", kind: "text", tier: 1, input: false, output: true },

  // ── Tier 2 — power-user ────────────────────────────────────────────────
  { id: "rst", label: "reStructuredText", subtitle: "Python docs · .rst", ext: "rst", kind: "text", tier: 2, input: true, output: true },
  { id: "org", label: "Org mode", subtitle: "Emacs Org · .org", ext: "org", kind: "text", tier: 2, input: true, output: true },
  { id: "mediawiki", label: "MediaWiki", subtitle: "Wikipedia markup", ext: "wiki", kind: "text", tier: 2, input: true, output: true },
  { id: "textile", label: "Textile", subtitle: "Textile markup", ext: "textile", kind: "text", tier: 2, input: true, output: true },
  { id: "asciidoc", label: "AsciiDoc", subtitle: "AsciiDoc · .adoc", ext: "adoc", kind: "text", tier: 2, input: false, output: true },
  { id: "docbook", label: "DocBook", subtitle: "DocBook XML", ext: "dbk", kind: "text", tier: 2, input: true, output: true },
  { id: "jats", label: "JATS", subtitle: "Journal article XML", ext: "xml", kind: "text", tier: 2, input: true, output: true },
  { id: "typst", label: "Typst", subtitle: "Typst markup · .typ", ext: "typ", kind: "text", tier: 2, input: true, output: true },
  { id: "ipynb", label: "Jupyter", subtitle: "Notebook · .ipynb", ext: "ipynb", kind: "text", tier: 2, input: true, output: true },
  { id: "json", label: "Pandoc JSON", subtitle: "Abstract syntax tree", ext: "json", kind: "text", tier: 2, input: true, output: true },
  { id: "native", label: "Pandoc native", subtitle: "Haskell AST", ext: "native", kind: "text", tier: 2, input: true, output: true },
  { id: "man", label: "man page", subtitle: "Unix manual · roff", ext: "man", kind: "text", tier: 2, input: false, output: true },
  { id: "pptx", label: "PowerPoint", subtitle: "Slides · .pptx", ext: "pptx", kind: "binary", tier: 2, input: false, output: true },
  { id: "revealjs", label: "reveal.js", subtitle: "HTML slide deck", ext: "html", kind: "text", tier: 2, input: false, output: true },
  { id: "beamer", label: "Beamer", subtitle: "LaTeX slides", ext: "tex", kind: "text", tier: 2, input: false, output: true },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

export function getFormat(id: string): PandocFormat | undefined {
  return BY_ID.get(id);
}

export function isBinaryFormat(id: string): boolean {
  return BY_ID.get(id)?.kind === "binary";
}

export const inputFormats = FORMATS.filter((f) => f.input);
export const outputFormats = FORMATS.filter((f) => f.output);

/** Guess a pandoc input format from a filename extension. */
export function guessFormatFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    md: "markdown",
    markdown: "markdown",
    mdown: "markdown",
    html: "html",
    htm: "html",
    docx: "docx",
    odt: "odt",
    epub: "epub",
    tex: "latex",
    latex: "latex",
    rst: "rst",
    org: "org",
    wiki: "mediawiki",
    textile: "textile",
    rtf: "rtf",
    json: "json",
    native: "native",
    ipynb: "ipynb",
    typ: "typst",
    dbk: "docbook",
    docbook: "docbook",
  };
  return map[ext] ?? null;
}

/**
 * File types we recognise but pandoc cannot read as input. Lets us reject them
 * up front with a clear message instead of the cryptic "received binary data"
 * error pandoc throws when fed a binary it can't parse.
 */
const UNREADABLE_INPUT: Record<string, string> = {
  pdf: "PDF",
  png: "PNG image",
  jpg: "JPEG image",
  jpeg: "JPEG image",
  gif: "GIF image",
  webp: "WebP image",
  svg: "SVG image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  ico: "icon",
  heic: "image",
  avif: "image",
  zip: "ZIP archive",
  gz: "archive",
  tar: "archive",
  rar: "archive",
  "7z": "archive",
  xlsx: "Excel spreadsheet",
  xls: "Excel spreadsheet",
  pptx: "PowerPoint file",
  ppt: "PowerPoint file",
  key: "Keynote file",
  pages: "Pages document",
  numbers: "Numbers spreadsheet",
  mp3: "audio file",
  wav: "audio file",
  mp4: "video file",
  mov: "video file",
};

/** Friendly label if the file is a type pandoc can't read as input, else null. */
export function unreadableInputLabel(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return UNREADABLE_INPUT[ext] ?? null;
}

/**
 * Best-effort guess of a pandoc input format from pasted text content. Used when
 * the source is left on "Auto-detect" and there's no filename to go on. Falls
 * back to Markdown, which is the most forgiving reader.
 */
export function guessFormatFromContent(text: string): string {
  const t = text.replace(/^﻿/, "").trimStart();
  if (!t) return "markdown";
  if (/^\{[\s\S]*"(pandoc-api-version|blocks)"/.test(t)) return "json";
  if (/\\documentclass|\\begin\s*\{document\}|\\section\s*\{/.test(t)) return "latex";
  if (/^<(\?xml|!doctype html|html|head|body|div|p|h[1-6]|article|section|table|ul|ol)[\s>/]/i.test(t)) return "html";
  if (/^#\+(title|options|begin_src|author)\b/im.test(t)) return "org";
  if (/^\.\.\s+\w+::|^={3,}\s*$|^-{3,}\s*$/m.test(t) && /::|`{2}/.test(t)) return "rst";
  return "markdown";
}
