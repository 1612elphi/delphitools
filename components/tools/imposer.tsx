"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload,
  Download,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Printer,
  ScissorsLineDashed,
  Info,
  BookOpen,
  Library,
  Copy,
  BookMarked,
  LayoutGrid,
  Grid3X3,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaperSizeCombobox, findPaperSize } from "@/components/ui/paper-size-combobox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PDFDocument, degrees } from "pdf-lib";
import {
  PAPER_SIZES,
  IMPOSITION_LAYOUTS,
  DUPLEX_AWARE_LAYOUTS,
  getLayoutById,
  getOuterEdges,
  MM_TO_POINTS,
  type ImpositionConfig,
  type ImpositionResult,
  type PaperSize,
  type PagePlacement,
  type SheetDefinition,
} from "@/lib/imposition";

// ---------------------------------------------------------------------------
// pdfjs-dist — dynamic import to avoid SSG DOMMatrix errors
// ---------------------------------------------------------------------------

type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GANG_RUN_OPTIONS = [2, 4, 6, 8, 9];

const SCALING_OPTIONS = [
  { value: "fit" as const, label: "Fit (no crop)" },
  { value: "fill" as const, label: "Fill (may crop)" },
  { value: "actual" as const, label: "Actual size" },
];

const LAYOUT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "saddle-stitch": BookOpen,
  "perfect-bind": Library,
  "step-and-repeat": Copy,
  "four-up-booklet": BookMarked,
  "gang-run": LayoutGrid,
  "custom-nup": Grid3X3,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImposerTool() {
  // --- PDF state ---
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);

  // Cached page thumbnails (canvas image bitmaps keyed by 1-indexed page number)
  const pageThumbnailsRef = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // --- Layout config state ---
  const [layoutId, setLayoutId] = useState("saddle-stitch");
  const [paperSizeId, setPaperSizeId] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [marginMm, setMarginMm] = useState(5);
  const [gutterMm, setGutterMm] = useState(2);
  const [creepMm, setCreepMm] = useState(0);
  const [scaling, setScaling] = useState<"fit" | "fill" | "actual">("fit");
  const [blankHandling, setBlankHandling] = useState<"auto" | "leave-empty">("auto");
  const [cropMarks, setCropMarks] = useState(true);
  const [nUp, setNUp] = useState(4);
  const [customRows, setCustomRows] = useState(2);
  const [customCols, setCustomCols] = useState(2);
  const [duplexFlip, setDuplexFlip] = useState<"long-edge" | "short-edge">("long-edge");
  const [customPaperW, setCustomPaperW] = useState(320);
  const [customPaperH, setCustomPaperH] = useState(450);
  const [inferredPaper, setInferredPaper] = useState<{ widthMm: number; heightMm: number; label: string } | null>(null);

  // --- UI state ---
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState("");
  const [printGuideOpen, setPrintGuideOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);

  // --- Paginated stack state ---
  const [activeSheet, setActiveSheet] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [blankMode, setBlankMode] = useState(!pdfBytes);
  const [blankPageCount, setBlankPageCount] = useState(12);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Derived ---
  const paperSize = paperSizeId === "infer" && inferredPaper
    ? { id: "infer", label: inferredPaper.label, widthMm: inferredPaper.widthMm, heightMm: inferredPaper.heightMm }
    : paperSizeId === "custom"
      ? { id: "custom", label: "Custom", widthMm: customPaperW, heightMm: customPaperH }
      : findPaperSize(paperSizeId) ?? PAPER_SIZES[0];
  const layout = getLayoutById(layoutId);
  const showDuplexSelector = DUPLEX_AWARE_LAYOUTS.has(layoutId);

  const config: ImpositionConfig = {
    layoutId,
    paperSize,
    orientation,
    marginMm,
    gutterMm,
    creepMm,
    scaling,
    blankHandling,
    cropMarks,
    nUp: layoutId === "gang-run" ? nUp : undefined,
    customGrid: layoutId === "custom-nup" ? [customRows, customCols] : undefined,
    duplexFlip: showDuplexSelector ? duplexFlip : undefined,
  };

  const sourcePages = pdfPageCount || blankPageCount;
  const result: ImpositionResult | null = layout
    ? layout.calculate(sourcePages, config)
    : null;

  const sheetW = effectiveSheetW(paperSize, orientation);
  const sheetH = effectiveSheetH(paperSize, orientation);

  // --- Auto-suggest landscape for 2-up layouts ---
  useEffect(() => {
    if (
      layoutId === "saddle-stitch" ||
      layoutId === "perfect-bind" ||
      layoutId === "step-and-repeat"
    ) {
      setOrientation("landscape");
    }
  }, [layoutId]);

  // Reset active sheet when result changes
  useEffect(() => {
    setActiveSheet(0);
    setIsFlipped(false);
  }, [layoutId, paperSizeId, orientation, marginMm, gutterMm, creepMm, pdfPageCount]);

  // Default blank mode based on PDF presence
  useEffect(() => {
    setBlankMode(!pdfBytes);
  }, [pdfBytes]);

  // ---------------------------------------------------------------------------
  // PDF loading
  // ---------------------------------------------------------------------------

  const loadPdf = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setPdfBytes(bytes);
    setPdfFileName(file.name);
    pageThumbnailsRef.current.clear();

    try {
      const pdfjs = await getPdfJs();
      const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      setPdfDoc(doc);
      setPdfPageCount(doc.numPages);

      // Infer paper size from first page
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const wMm = (viewport.width / 72) * 25.4;
      const hMm = (viewport.height / 72) * 25.4;
      // Try to match a known size (within 2mm tolerance)
      const match = PAPER_SIZES.find(
        (s) =>
          (Math.abs(s.widthMm - wMm) < 2 && Math.abs(s.heightMm - hMm) < 2) ||
          (Math.abs(s.widthMm - hMm) < 2 && Math.abs(s.heightMm - wMm) < 2)
      );
      setInferredPaper({
        widthMm: Math.round(wMm * 10) / 10,
        heightMm: Math.round(hMm * 10) / 10,
        label: match ? match.label : `${Math.round(wMm)} \u00d7 ${Math.round(hMm)} mm`,
      });
    } catch (err) {
      console.error("Failed to load PDF:", err);
      setPdfPageCount(0);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      loadPdf(file);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      loadPdf(file);
    }
  };

  const clearPdf = () => {
    setPdfBytes(null);
    setPdfFileName("");
    setPdfPageCount(0);
    setPdfDoc(null);
    setInferredPaper(null);
    pageThumbnailsRef.current.clear();
  };

  // ---------------------------------------------------------------------------
  // Render a single PDF page to a canvas (for thumbnails in sheet preview)
  // ---------------------------------------------------------------------------

  const renderPageToCanvas = useCallback(
    async (pageNum: number, width: number, height: number): Promise<HTMLCanvasElement | null> => {
      if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages) return null;

      const cacheKey = pageNum;
      const cached = pageThumbnailsRef.current.get(cacheKey);
      if (cached) return cached;

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const scaleX = width / viewport.width;
        const scaleY = height / viewport.height;
        const scale = Math.min(scaleX, scaleY);
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: scaledViewport } as never).promise;
        pageThumbnailsRef.current.set(cacheKey, canvas);
        return canvas;
      } catch (err) {
        console.error(`Failed to render page ${pageNum}:`, err);
        return null;
      }
    },
    [pdfDoc]
  );

  // ---------------------------------------------------------------------------
  // Sheet preview rendering (canvas-based, used when not in blank mode)
  // ---------------------------------------------------------------------------

  const drawSheetSide = useCallback(
    async (
      canvas: HTMLCanvasElement,
      placements: PagePlacement[],
      sw: number,
      sh: number,
    ) => {
      const maxW = 480;
      const scale = maxW / sw;
      const w = Math.round(sw * scale);
      const h = Math.round(sh * scale);

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);

      for (const p of placements) {
        const px = p.x * scale;
        const py = p.y * scale;
        const pw = p.width * scale;
        const ph = p.height * scale;

        if (p.pageNumber === 0) {
          ctx.fillStyle = "#f0f0f0";
          ctx.fillRect(px, py, pw, ph);
          ctx.strokeStyle = "#d0d0d0";
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, pw, ph);
        } else {
          let drawnThumbnail = false;
          if (pdfDoc && p.pageNumber <= pdfDoc.numPages) {
            const thumb = await renderPageToCanvas(p.pageNumber, pw * 2, ph * 2);
            if (thumb) {
              ctx.save();
              const cx = px + pw / 2;
              const cy = py + ph / 2;
              ctx.translate(cx, cy);
              ctx.rotate((p.rotation * Math.PI) / 180);

              const tScaleX = pw / thumb.width;
              const tScaleY = ph / thumb.height;
              const tScale = Math.min(tScaleX, tScaleY);
              const tw = thumb.width * tScale;
              const th2 = thumb.height * tScale;

              ctx.drawImage(thumb, -tw / 2, -th2 / 2, tw, th2);
              ctx.restore();
              drawnThumbnail = true;
            }
          }

          if (!drawnThumbnail) {
            ctx.fillStyle = "#e8edf3";
            ctx.fillRect(px, py, pw, ph);
          }

          ctx.strokeStyle = "#b0b8c4";
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, pw, ph);

          // Page number badge
          ctx.save();
          const cx = px + pw / 2;
          const cy = py + ph / 2;
          ctx.translate(cx, cy);
          const badgeR = Math.min(pw, ph) * 0.18;
          ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
          ctx.beginPath();
          ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.max(10, badgeR * 0.9)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(p.pageNumber), 0, 0);
          ctx.restore();

          if (p.rotation !== 0) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.font = `${Math.max(8, badgeR * 0.5)}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${p.rotation}\u00B0`, 0, badgeR + 10);
            ctx.restore();
          }
        }
      }

      // Crop marks — only on outer edges, not in gutters
      if (cropMarks) {
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 0.5;
        const markLen = 10;
        const edges = getOuterEdges(placements);
        for (let i = 0; i < placements.length; i++) {
          const p = placements[i];
          const e = edges[i];
          const px = p.x * scale;
          const py = p.y * scale;
          const pw = p.width * scale;
          const ph = p.height * scale;
          // TL: left arm if left outer, top arm if top outer
          if (e.left || e.top) drawCropMarkArms(ctx, px, py, markLen, e.left, e.top);
          // TR: right arm if right outer, top arm if top outer
          if (e.right || e.top) drawCropMarkArms(ctx, px + pw, py, markLen, e.right, e.top);
          // BL: left arm if left outer, bottom arm if bottom outer
          if (e.left || e.bottom) drawCropMarkArms(ctx, px, py + ph, markLen, e.left, e.bottom);
          // BR: right arm if right outer, bottom arm if bottom outer
          if (e.right || e.bottom) drawCropMarkArms(ctx, px + pw, py + ph, markLen, e.right, e.bottom);
        }
      }

      // Fold lines
      if (
        layoutId === "saddle-stitch" ||
        layoutId === "perfect-bind" ||
        layoutId === "step-and-repeat"
      ) {
        ctx.save();
        ctx.strokeStyle = "#6688bb";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (layoutId === "four-up-booklet") {
        ctx.save();
        ctx.strokeStyle = "#6688bb";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    },
    [pdfDoc, cropMarks, layoutId, renderPageToCanvas]
  );

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  const totalSheets = result?.totalSheets ?? 0;

  const goToSheet = useCallback((index: number) => {
    setActiveSheet(index);
    setIsFlipped(false);
  }, []);

  const prevSheet = useCallback(() => {
    if (activeSheet > 0) goToSheet(activeSheet - 1);
  }, [activeSheet, goToSheet]);

  const nextSheet = useCallback(() => {
    if (activeSheet < totalSheets - 1) goToSheet(activeSheet + 1);
  }, [activeSheet, totalSheets, goToSheet]);

  const flipCard = useCallback(() => {
    setIsFlipped((f) => !f);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); prevSheet(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nextSheet(); }
      else if (e.key === " ") { e.preventDefault(); flipCard(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prevSheet, nextSheet, flipCard]);

  // ---------------------------------------------------------------------------
  // PDF export
  // ---------------------------------------------------------------------------

  const generateImposedPdf = async () => {
    if (!pdfBytes || !result || !layout) return;

    setIsGenerating(true);
    setGenerateProgress("Loading source PDF...");

    try {
      const srcDoc = await PDFDocument.load(pdfBytes);
      const outputDoc = await PDFDocument.create();

      const effectiveW =
        orientation === "landscape"
          ? Math.max(paperSize.widthMm, paperSize.heightMm)
          : Math.min(paperSize.widthMm, paperSize.heightMm);
      const effectiveH =
        orientation === "landscape"
          ? Math.min(paperSize.widthMm, paperSize.heightMm)
          : Math.max(paperSize.widthMm, paperSize.heightMm);

      const sheetWPt = effectiveW * MM_TO_POINTS;
      const sheetHPt = effectiveH * MM_TO_POINTS;

      setGenerateProgress("Embedding source pages...");
      const srcPages = srcDoc.getPages();
      const embeddedPages = await outputDoc.embedPages(srcPages);

      for (let si = 0; si < result.sheets.length; si++) {
        const sheet = result.sheets[si];
        setGenerateProgress(
          `Generating sheet ${si + 1} of ${result.sheets.length}...`
        );

        const frontPage = outputDoc.addPage([sheetWPt, sheetHPt]);
        drawPlacementsOnPage(frontPage, sheet.front, embeddedPages, sheetWPt, sheetHPt);
        if (cropMarks) drawCropMarksOnPdfPage(frontPage, sheet.front, sheetHPt);

        const backPage = outputDoc.addPage([sheetWPt, sheetHPt]);
        drawPlacementsOnPage(backPage, sheet.back, embeddedPages, sheetWPt, sheetHPt);
        if (cropMarks) drawCropMarksOnPdfPage(backPage, sheet.back, sheetHPt);
      }

      setGenerateProgress("Saving PDF...");
      const outBytes = await outputDoc.save();

      const blob = new Blob([new Uint8Array(outBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `imposed-${layoutId}-${paperSizeId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate imposed PDF:", err);
    } finally {
      setIsGenerating(false);
      setGenerateProgress("");
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const activeSheetData = result?.sheets[activeSheet];

  return (
    <div className="space-y-6">
      {/* PDF Upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "hover:border-primary/50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileInput}
        />
        {pdfFileName ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="size-8 text-primary" />
            <div className="text-left">
              <p className="font-medium">{pdfFileName}</p>
              <p className="text-sm text-muted-foreground">
                {pdfPageCount} page{pdfPageCount !== 1 ? "s" : ""} &mdash;{" "}
                <button
                  className="underline hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearPdf();
                  }}
                >
                  remove
                </button>
              </p>
            </div>
          </div>
        ) : (
          <>
            <Upload className="size-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Drop a PDF here, or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">
              All processing happens locally in your browser
            </p>
          </>
        )}
      </div>

      {/* ── Configuration ─────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Layout Selector — Rich Combobox */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Layout</span>
          <Popover open={layoutOpen} onOpenChange={setLayoutOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-expanded={layoutOpen}
                className="flex items-center gap-3 w-full h-auto px-3 py-2.5 rounded-md border border-input bg-background text-left hover:bg-muted transition-colors"
              >
                {(() => {
                  const layout = getLayoutById(layoutId);
                  const IconComp = LAYOUT_ICONS[layoutId];
                  return (
                    <>
                      {IconComp && <IconComp className="size-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{layout?.name}</span>
                        <span className="text-muted-foreground text-xs"> — {layout?.useCase}</span>
                      </div>
                      {layoutOpen ? (
                        <ChevronUp className="size-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      )}
                    </>
                  );
                })()}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="p-1 w-[var(--radix-popover-trigger-width)]"
              align="start"
            >
              <div role="listbox">
                {IMPOSITION_LAYOUTS.map((l) => {
                  const IconComp = LAYOUT_ICONS[l.id];
                  const isSelected = l.id === layoutId;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => { setLayoutId(l.id); setLayoutOpen(false); }}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 rounded-sm text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 border-l-2 border-primary"
                          : "hover:bg-muted border-l-2 border-transparent"
                      )}
                    >
                      {IconComp && <IconComp className={cn("size-5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.description}</div>
                      </div>
                      {isSelected && <Check className="size-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Two-card grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Sheet Setup Card */}
          <div className="rounded-lg border bg-card/60 p-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3 block">
              Sheet Setup
            </span>
            <div className="space-y-3">
              {/* Paper size */}
              <div className="space-y-1.5">
                <LabelWithInfo
                  label="Paper"
                  info="The physical sheet your printer will use. SRA sizes include extra bleed area for trimming."
                />
                <PaperSizeCombobox
                  value={paperSizeId}
                  onValueChange={setPaperSizeId}
                  showInfer
                  showCustom
                  hasInferred={!!inferredPaper}
                  inferredLabel={inferredPaper?.label}
                />
              </div>

              {/* Custom paper dimensions */}
              {paperSizeId === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={50} max={1000}
                    value={customPaperW}
                    onChange={(e) => setCustomPaperW(Math.max(50, parseFloat(e.target.value) || 50))}
                    className="w-20 h-8"
                  />
                  <span className="text-muted-foreground text-xs">&times;</span>
                  <Input
                    type="number" min={50} max={1000}
                    value={customPaperH}
                    onChange={(e) => setCustomPaperH(Math.max(50, parseFloat(e.target.value) || 50))}
                    className="w-20 h-8"
                  />
                  <span className="text-xs text-muted-foreground">mm</span>
                </div>
              )}

              {/* Orientation */}
              <div className="space-y-1.5">
                <LabelWithInfo
                  label="Orientation"
                  info="How the sheet feeds through the printer. Landscape is usually needed for side-by-side layouts like saddle stitch."
                />
                <div className="grid grid-cols-2 h-9 rounded-md border border-input overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOrientation("portrait")}
                    className={cn(
                      "text-sm font-medium transition-colors",
                      orientation === "portrait"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    Portrait
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation("landscape")}
                    className={cn(
                      "text-sm font-medium transition-colors border-l border-input",
                      orientation === "landscape"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    Landscape
                  </button>
                </div>
              </div>

              {/* Scaling */}
              <div className="space-y-1.5">
                <LabelWithInfo
                  label="Scaling"
                  info="How your pages are sized to fit each cell. 'Fit' shows the whole page with possible white space. 'Fill' crops to fill the cell. 'Actual' uses the original page dimensions."
                />
                <Select
                  value={scaling}
                  onValueChange={(v) => setScaling(v as typeof scaling)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCALING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duplex flip — conditional */}
              {showDuplexSelector && (
                <div className="space-y-1.5">
                  <LabelWithInfo
                    label="Duplex flip"
                    info="How your printer flips the paper for double-sided printing. Long edge is standard for most booklets. Short edge (tumble) flips top-to-bottom."
                  />
                  <div className="grid grid-cols-2 h-9 rounded-md border border-input overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setDuplexFlip("long-edge")}
                      className={cn(
                        "text-sm font-medium transition-colors",
                        duplexFlip === "long-edge"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      Long edge
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuplexFlip("short-edge")}
                      className={cn(
                        "text-sm font-medium transition-colors border-l border-input",
                        duplexFlip === "short-edge"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      Short edge
                    </button>
                  </div>
                </div>
              )}

              {/* Gang-run copies — conditional */}
              {layoutId === "gang-run" && (
                <div className="space-y-1.5">
                  <LabelWithInfo
                    label="Copies / sheet"
                    info="How many identical copies of your page to fit on each sheet."
                  />
                  <div className="grid grid-cols-5 h-9 rounded-md border border-input overflow-hidden">
                    {GANG_RUN_OPTIONS.map((n, i) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNUp(n)}
                        className={cn(
                          "text-sm font-medium transition-colors",
                          i > 0 && "border-l border-input",
                          nUp === n
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom N-up grid — conditional */}
              {layoutId === "custom-nup" && (
                <div className="space-y-1.5">
                  <LabelWithInfo
                    label="Grid"
                    info="Number of rows and columns for your custom page grid."
                  />
                  <div className="flex items-center gap-1.5 h-9">
                    <Input
                      type="number" min={1} max={10}
                      value={customRows}
                      onChange={(e) => setCustomRows(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="w-14 h-full"
                    />
                    <span className="text-muted-foreground text-sm">&times;</span>
                    <Input
                      type="number" min={1} max={10}
                      value={customCols}
                      onChange={(e) => setCustomCols(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="w-14 h-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Spacing & Finishing Card */}
          <div className="rounded-lg border bg-card/60 p-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3 block">
              Spacing & Finishing
            </span>
            <div className="space-y-3">
              <SliderWithInfo
                label="Margins"
                value={marginMm}
                onChange={setMarginMm}
                min={0} max={20} step={1}
                unit="mm"
                info="Distance from the sheet edge to the nearest page cell. Keeps content away from the unprintable area and gives the guillotine room to trim."
              />
              <SliderWithInfo
                label="Gutter"
                value={gutterMm}
                onChange={setGutterMm}
                min={0} max={10} step={1}
                unit="mm"
                info="Gap between adjacent page cells on the same side of the sheet. On fold-based layouts this is the spine area; on cut layouts it's the cutting channel."
              />
              {layoutId === "saddle-stitch" && (
                <SliderWithInfo
                  label="Creep"
                  value={creepMm}
                  onChange={setCreepMm}
                  min={0} max={2} step={0.1}
                  unit="mm" decimals={1}
                  info="Compensates for paper thickness in saddle-stitched booklets. Inner sheets push outward when nested, so their content shifts toward the spine. This nudges inner pages outward to keep trim consistent."
                />
              )}

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <LabelWithInfo
                    label="Crop marks"
                    info="Small lines printed at page corners to guide the guillotine when trimming. Essential for professional print finishing."
                  />
                  <Switch checked={cropMarks} onCheckedChange={setCropMarks} />
                </div>
                <div className="flex items-center justify-between">
                  <LabelWithInfo
                    label="Leave blanks empty"
                    info="When a signature needs padding, this controls whether blank pages are added automatically or left as empty space on the sheet."
                  />
                  <Switch
                    checked={blankHandling === "leave-empty"}
                    onCheckedChange={(checked) => setBlankHandling(checked ? "leave-empty" : "auto")}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <LabelWithInfo
                    label="Blank mode"
                    info="Preview the imposition layout without uploading a PDF. Useful for planning your print setup."
                  />
                  <div className="flex items-center gap-2">
                    {blankMode && !pdfBytes && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setBlankPageCount(Math.max(4, blankPageCount - 4))}
                          disabled={blankPageCount <= 4}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <div className="flex items-center gap-0.5">
                          <span className="text-xs font-medium w-6 text-center tabular-nums">{blankPageCount}</span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                                <Info className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                              Page count must be divisible by 4 — each physical sheet has a front and back, and each side holds two pages when folded.
                            </PopoverContent>
                          </Popover>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setBlankPageCount(blankPageCount + 4)}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <Switch
                      checked={blankMode}
                      onCheckedChange={setBlankMode}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview area */}
      <div className="space-y-4">
        {result && (
          <>
            {/* Summary bar */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">
                {pdfPageCount || sourcePages} page
                {(pdfPageCount || sourcePages) !== 1 ? "s" : ""}{" "}
                &rarr; {result.totalSheets} sheet
                {result.totalSheets !== 1 ? "s" : ""} (duplex)
                {result.blanksAdded > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; {result.blanksAdded} blank
                    {result.blanksAdded !== 1 ? "s" : ""} added
                  </span>
                )}
              </p>
            </div>

            {/* Paginated stack preview */}
            {activeSheetData && (
              <PaginatedSheetStack
                sheet={activeSheetData}
                sheetIndex={activeSheet}
                totalSheets={totalSheets}
                isFlipped={isFlipped}
                blankMode={blankMode}
                cropMarks={cropMarks}
                layoutId={layoutId}
                sheetW={sheetW}
                sheetH={sheetH}
                onFlip={flipCard}
                onPrev={prevSheet}
                onNext={nextSheet}
                onGoTo={goToSheet}
                drawSheetSide={drawSheetSide}
              />
            )}
          </>
        )}

        {!result && (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>Select a layout to see the sheet preview</p>
          </div>
        )}
      </div>

      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          size="lg"
          className="flex-1 h-12 font-bold"
          onClick={generateImposedPdf}
          disabled={!pdfBytes || isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-5 mr-2 animate-spin" />
              {generateProgress || "Generating..."}
            </>
          ) : (
            <>
              <Download className="size-5 mr-2" />
              Download Imposed PDF
            </>
          )}
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="h-12"
          onClick={() => setPrintGuideOpen((o) => !o)}
        >
          <Printer className="size-5 mr-2" />
          Print Guide
          {printGuideOpen ? (
            <ChevronUp className="size-4 ml-1" />
          ) : (
            <ChevronDown className="size-4 ml-1" />
          )}
        </Button>
      </div>

      {/* Print Order Helper */}
      {printGuideOpen && result && (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ScissorsLineDashed className="size-5 text-muted-foreground" />
            <h3 className="font-bold text-sm">Manual Duplex Printing Guide</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            If your printer does not support automatic duplex, follow these steps.
            The imposed PDF alternates front and back pages (page 1 = Sheet 1 front,
            page 2 = Sheet 1 back, etc.).
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            {result.sheets.map((sheet) => {
              const pdfPage = (sheet.sheetNumber - 1) * 2 + 1;
              return (
                <li key={sheet.sheetNumber} className="space-y-0.5">
                  <span className="font-medium">
                    Print PDF page {pdfPage}
                  </span>{" "}
                  (Sheet {sheet.sheetNumber} front).
                  <br />
                  <span className="ml-5 text-muted-foreground">
                    Flip the paper along the{" "}
                    <strong>
                      {duplexFlip === "short-edge" ? "short edge" : "long edge"}
                    </strong>
                    , then print PDF page {pdfPage + 1} (Sheet {sheet.sheetNumber} back).
                  </span>
                </li>
              );
            })}
          </ol>
          {(layoutId === "saddle-stitch" || layoutId === "four-up-booklet") && (
            <p className="text-sm text-muted-foreground pt-2">
              After printing all sheets, nest them together (Sheet 1 outermost) and
              staple along the spine fold.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SliderWithInfo — labeled slider with value display and info popover
// ---------------------------------------------------------------------------

function LabelWithInfo({ label, info }: { label: string; info: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <Info className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="max-w-[260px] text-xs leading-relaxed">
          {info}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SliderWithInfo({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  info,
  decimals = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  info: string;
  decimals?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <Info className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-[260px] text-xs leading-relaxed">
              {info}
            </PopoverContent>
          </Popover>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.toFixed(decimals)}{unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaginatedSheetStack — single-sheet view with 3D flip animation
// ---------------------------------------------------------------------------

function PaginatedSheetStack({
  sheet,
  sheetIndex,
  totalSheets,
  isFlipped,
  blankMode,
  cropMarks,
  layoutId,
  sheetW,
  sheetH,
  onFlip,
  onPrev,
  onNext,
  onGoTo,
  drawSheetSide,
}: {
  sheet: SheetDefinition;
  sheetIndex: number;
  totalSheets: number;
  isFlipped: boolean;
  blankMode: boolean;
  cropMarks: boolean;
  layoutId: string;
  sheetW: number;
  sheetH: number;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  drawSheetSide: (
    canvas: HTMLCanvasElement,
    placements: PagePlacement[],
    sheetW: number,
    sheetH: number,
  ) => Promise<void>;
}) {
  const useDots = totalSheets <= 10;
  const aspectRatio = sheetW / sheetH;

  return (
    <div className="space-y-3">
      {/* Sheet label */}
      <p className="text-sm font-medium text-center">
        Sheet {sheetIndex + 1} &mdash; {isFlipped ? "Back" : "Front"}
      </p>

      {/* Stack container with shadow layers */}
      <div
        className="relative mx-auto cursor-pointer"
        style={{ maxWidth: 480, aspectRatio: String(aspectRatio) }}
        onClick={onFlip}
      >
        {/* Shadow layers to suggest a stack */}
        {totalSheets > 1 && (
          <>
            <div
              className="absolute inset-0 bg-muted/30 border rounded-lg"
              style={{ transform: "translate(6px, 6px)", zIndex: 0 }}
            />
            {totalSheets > 2 && (
              <div
                className="absolute inset-0 bg-muted/20 border rounded-lg"
                style={{ transform: "translate(3px, 3px)", zIndex: 1 }}
              />
            )}
          </>
        )}

        {/* 3D flip container */}
        <div
          className="relative w-full h-full"
          style={{ perspective: "1200px", zIndex: 2 }}
        >
          <div
            className="relative w-full h-full transition-transform duration-600 ease-in-out"
            style={{
              transformStyle: "preserve-3d",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transition: "transform 0.6s ease",
            }}
          >
            {/* Front face */}
            <div
              className="absolute inset-0 rounded-lg border overflow-hidden"
              style={{ backfaceVisibility: "hidden" }}
            >
              {blankMode ? (
                <BlankModeSheet
                  placements={sheet.front}
                  sheetW={sheetW}
                  sheetH={sheetH}
                  cropMarks={cropMarks}
                  layoutId={layoutId}
                  bgColor="#e8edf3"
                />
              ) : (
                <CanvasSheetFace
                  placements={sheet.front}
                  sheetW={sheetW}
                  sheetH={sheetH}
                  draw={drawSheetSide}
                />
              )}
            </div>

            {/* Back face */}
            <div
              className="absolute inset-0 rounded-lg border overflow-hidden"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              {blankMode ? (
                <BlankModeSheet
                  placements={sheet.back}
                  sheetW={sheetW}
                  sheetH={sheetH}
                  cropMarks={cropMarks}
                  layoutId={layoutId}
                  bgColor="#f0eee8"
                />
              ) : (
                <CanvasSheetFace
                  placements={sheet.back}
                  sheetW={sheetW}
                  sheetH={sheetH}
                  draw={drawSheetSide}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          disabled={sheetIndex === 0}
          className="h-8 px-2.5 gap-1 text-xs"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onFlip(); }}
          className="h-8 px-3 text-xs"
        >
          Flip
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          disabled={sheetIndex === totalSheets - 1}
          className="h-8 px-2.5 gap-1 text-xs"
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>

      {/* Dot / counter navigation */}
      {totalSheets > 1 && (
        <div className="flex items-center justify-center">
          {useDots ? (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSheets }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onGoTo(i)}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    i === sheetIndex
                      ? "bg-primary"
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                />
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground font-medium">
              Sheet {sheetIndex + 1} / {totalSheets}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CanvasSheetFace — renders one side via canvas (PDF thumbnail mode)
// ---------------------------------------------------------------------------

function CanvasSheetFace({
  placements,
  sheetW,
  sheetH,
  draw,
}: {
  placements: PagePlacement[];
  sheetW: number;
  sheetH: number;
  draw: (
    canvas: HTMLCanvasElement,
    placements: PagePlacement[],
    sheetW: number,
    sheetH: number,
  ) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, placements, sheetW, sheetH);
  }, [draw, placements, sheetW, sheetH]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full bg-white"
      style={{ objectFit: "contain" }}
    />
  );
}

// ---------------------------------------------------------------------------
// BlankModeSheet — DOM-based template preview
// ---------------------------------------------------------------------------

function BlankModeSheet({
  placements,
  sheetW,
  sheetH,
  cropMarks,
  layoutId,
  bgColor,
}: {
  placements: PagePlacement[];
  sheetW: number;
  sheetH: number;
  cropMarks: boolean;
  layoutId: string;
  bgColor: string;
}) {
  const showFoldV =
    layoutId === "saddle-stitch" ||
    layoutId === "perfect-bind" ||
    layoutId === "step-and-repeat" ||
    layoutId === "four-up-booklet";
  const showFoldH = layoutId === "four-up-booklet";

  return (
    <div className="relative w-full h-full bg-white">
      {/* Crop marks (SVG overlay) — outer edges only */}
      {cropMarks && (() => {
        const edges = getOuterEdges(placements);
        const ml = 2.5; // mark length in percent
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
            {placements.map((p, i) => {
              const e = edges[i];
              const x1 = (p.x / sheetW) * 100;
              const y1 = (p.y / sheetH) * 100;
              const x2 = ((p.x + p.width) / sheetW) * 100;
              const y2 = ((p.y + p.height) / sheetH) * 100;
              return (
                <g key={i} stroke="#333" strokeWidth="0.5">
                  {/* TL */}
                  {e.left && <line x1={`${x1 - ml}%`} y1={`${y1}%`} x2={`${x1}%`} y2={`${y1}%`} />}
                  {e.top && <line x1={`${x1}%`} y1={`${y1 - ml}%`} x2={`${x1}%`} y2={`${y1}%`} />}
                  {/* TR */}
                  {e.right && <line x1={`${x2 + ml}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y1}%`} />}
                  {e.top && <line x1={`${x2}%`} y1={`${y1 - ml}%`} x2={`${x2}%`} y2={`${y1}%`} />}
                  {/* BL */}
                  {e.left && <line x1={`${x1 - ml}%`} y1={`${y2}%`} x2={`${x1}%`} y2={`${y2}%`} />}
                  {e.bottom && <line x1={`${x1}%`} y1={`${y2 + ml}%`} x2={`${x1}%`} y2={`${y2}%`} />}
                  {/* BR */}
                  {e.right && <line x1={`${x2 + ml}%`} y1={`${y2}%`} x2={`${x2}%`} y2={`${y2}%`} />}
                  {e.bottom && <line x1={`${x2}%`} y1={`${y2 + ml}%`} x2={`${x2}%`} y2={`${y2}%`} />}
                </g>
              );
            })}
          </svg>
        );
      })()}

      {/* Fold lines */}
      {showFoldV && (
        <div
          className="absolute top-0 bottom-0 border-l border-dashed"
          style={{ left: "50%", borderColor: "#6688bb", zIndex: 5 }}
        />
      )}
      {showFoldH && (
        <div
          className="absolute left-0 right-0 border-t border-dashed"
          style={{ top: "50%", borderColor: "#6688bb", zIndex: 5 }}
        />
      )}

      {/* Page cells */}
      {placements.map((p, i) => {
        const left = (p.x / sheetW) * 100;
        const top = (p.y / sheetH) * 100;
        const width = (p.width / sheetW) * 100;
        const height = (p.height / sheetH) * 100;

        return (
          <div
            key={i}
            className="absolute flex flex-col items-center justify-center"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              backgroundColor: p.pageNumber === 0 ? "#f0f0f0" : bgColor,
              border: "1.5px dashed #999",
            }}
          >
            {p.pageNumber === 0 ? (
              <span className="text-xs text-muted-foreground">blank</span>
            ) : (
              <>
                <span className="text-2xl font-bold text-foreground/70 leading-none">
                  {p.pageNumber}
                </span>
                {p.rotation !== 0 && (
                  <span className="text-xs text-muted-foreground mt-1">
                    {p.rotation}&deg;
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground mt-1">
                  {p.width.toFixed(1)} &times; {p.height.toFixed(1)} mm
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (outside component to avoid re-creation)
// ---------------------------------------------------------------------------

function effectiveSheetW(
  paperSize: PaperSize,
  orientation: "portrait" | "landscape"
): number {
  return orientation === "landscape"
    ? Math.max(paperSize.widthMm, paperSize.heightMm)
    : Math.min(paperSize.widthMm, paperSize.heightMm);
}

function effectiveSheetH(
  paperSize: PaperSize,
  orientation: "portrait" | "landscape"
): number {
  return orientation === "landscape"
    ? Math.min(paperSize.widthMm, paperSize.heightMm)
    : Math.max(paperSize.widthMm, paperSize.heightMm);
}

/**
 * Draw crop mark arms at a corner point. Each arm is independently toggled
 * so we only draw arms that point toward the sheet edge, not into gutters.
 */
function drawCropMarkArms(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  drawHorizontal: boolean,
  drawVertical: boolean,
) {
  if (!drawHorizontal && !drawVertical) return;
  ctx.beginPath();
  if (drawHorizontal) {
    // Determine direction from position relative to canvas center
    // (this is called with correct sign already via the outer-edge logic)
    ctx.moveTo(x - len, y);
    ctx.lineTo(x, y);
    ctx.moveTo(x + len, y);
    ctx.lineTo(x, y);
  }
  if (drawVertical) {
    ctx.moveTo(x, y - len);
    ctx.lineTo(x, y);
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// PDF generation helpers
// ---------------------------------------------------------------------------

type EmbeddedPage = Awaited<ReturnType<PDFDocument["embedPages"]>>[number];
type PDFPage = ReturnType<PDFDocument["addPage"]>;

function drawPlacementsOnPage(
  page: PDFPage,
  placements: PagePlacement[],
  embeddedPages: EmbeddedPage[],
  sheetWPt: number,
  sheetHPt: number
) {
  for (const p of placements) {
    if (p.pageNumber === 0) continue;
    const pageIndex = p.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= embeddedPages.length) continue;

    const embedded = embeddedPages[pageIndex];
    const xPt = p.x * MM_TO_POINTS;
    const yPt = sheetHPt - (p.y * MM_TO_POINTS + p.height * MM_TO_POINTS);
    const wPt = p.width * MM_TO_POINTS;
    const hPt = p.height * MM_TO_POINTS;

    if (p.rotation === 0) {
      page.drawPage(embedded, {
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
      });
    } else if (p.rotation === 180) {
      page.drawPage(embedded, {
        x: xPt + wPt,
        y: yPt + hPt,
        width: wPt,
        height: hPt,
        rotate: degrees(180),
      });
    } else if (p.rotation === 90) {
      page.drawPage(embedded, {
        x: xPt + wPt,
        y: yPt,
        width: hPt,
        height: wPt,
        rotate: degrees(90),
      });
    } else if (p.rotation === 270) {
      page.drawPage(embedded, {
        x: xPt,
        y: yPt + hPt,
        width: hPt,
        height: wPt,
        rotate: degrees(270),
      });
    }
  }
}

function drawCropMarksOnPdfPage(
  page: PDFPage,
  placements: PagePlacement[],
  sheetHPt: number
) {
  const markLen = 18; // ~6mm / 1/4" — industry standard
  const offset = 3;   // gap between mark and trim line

  const edges = getOuterEdges(placements);

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const e = edges[i];

    const x1 = p.x * MM_TO_POINTS;
    const y1Pdf = sheetHPt - p.y * MM_TO_POINTS;           // top in PDF coords
    const x2 = (p.x + p.width) * MM_TO_POINTS;
    const y2Pdf = sheetHPt - (p.y + p.height) * MM_TO_POINTS; // bottom in PDF coords

    // TL corner: left arm if left outer, top arm if top outer
    if (e.left) drawPdfMarkH(page, x1, y1Pdf, -1, offset, markLen);
    if (e.top) drawPdfMarkV(page, x1, y1Pdf, 1, offset, markLen);
    // TR corner
    if (e.right) drawPdfMarkH(page, x2, y1Pdf, 1, offset, markLen);
    if (e.top) drawPdfMarkV(page, x2, y1Pdf, 1, offset, markLen);
    // BL corner
    if (e.left) drawPdfMarkH(page, x1, y2Pdf, -1, offset, markLen);
    if (e.bottom) drawPdfMarkV(page, x1, y2Pdf, -1, offset, markLen);
    // BR corner
    if (e.right) drawPdfMarkH(page, x2, y2Pdf, 1, offset, markLen);
    if (e.bottom) drawPdfMarkV(page, x2, y2Pdf, -1, offset, markLen);
  }
}

function drawPdfMarkH(page: PDFPage, x: number, y: number, dir: number, offset: number, len: number) {
  page.drawLine({
    start: { x: x + dir * offset, y },
    end: { x: x + dir * (offset + len), y },
    thickness: 0.25,
  });
}

function drawPdfMarkV(page: PDFPage, x: number, y: number, dir: number, offset: number, len: number) {
  page.drawLine({
    start: { x, y: y + dir * offset },
    end: { x, y: y + dir * (offset + len) },
    thickness: 0.25,
  });
}
