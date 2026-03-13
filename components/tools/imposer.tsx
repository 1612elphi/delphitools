"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload,
  Download,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Printer,
  ScissorsLineDashed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PDFDocument, degrees } from "pdf-lib";
import {
  PAPER_SIZES,
  IMPOSITION_LAYOUTS,
  getLayoutById,
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

  // --- UI state ---
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState("");
  const [printGuideOpen, setPrintGuideOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Derived ---
  const paperSize = PAPER_SIZES.find((p) => p.id === paperSizeId) ?? PAPER_SIZES[0];
  const layout = getLayoutById(layoutId);

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
  };

  const sourcePages = pdfPageCount || 12; // default 12 for demo preview
  const result: ImpositionResult | null = layout
    ? layout.calculate(sourcePages, config)
    : null;

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
    // Reset so re-selecting the same file triggers change
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
    pageThumbnailsRef.current.clear();
  };

  // ---------------------------------------------------------------------------
  // Render a single PDF page to a canvas (for thumbnails in sheet preview)
  // ---------------------------------------------------------------------------

  const renderPageToCanvas = useCallback(
    async (pageNum: number, width: number, height: number): Promise<HTMLCanvasElement | null> => {
      if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages) return null;

      // Check cache
      const cacheKey = pageNum;
      const cached = pageThumbnailsRef.current.get(cacheKey);
      if (cached) return cached;

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        // Scale to fit the target dimensions
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
  // Sheet preview rendering (uses an effect to draw on a canvas)
  // ---------------------------------------------------------------------------

  const drawSheetSide = useCallback(
    async (
      canvas: HTMLCanvasElement,
      placements: PagePlacement[],
      sheetW: number,
      sheetH: number,
    ) => {
      // Scale to fit in preview area (max ~320px wide)
      const maxW = 320;
      const scale = maxW / sheetW;
      const w = Math.round(sheetW * scale);
      const h = Math.round(sheetH * scale);

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      // White background (paper)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);

      // Draw each placement
      for (const p of placements) {
        const px = p.x * scale;
        const py = p.y * scale;
        const pw = p.width * scale;
        const ph = p.height * scale;

        if (p.pageNumber === 0) {
          // Blank page
          ctx.fillStyle = "#f0f0f0";
          ctx.fillRect(px, py, pw, ph);
          ctx.strokeStyle = "#d0d0d0";
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, pw, ph);
        } else {
          // Try to render PDF page thumbnail
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

          // Rotation indicator
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

      // Crop marks
      if (cropMarks) {
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 0.5;
        const markLen = 6;
        for (const p of placements) {
          const px = p.x * scale;
          const py = p.y * scale;
          const pw = p.width * scale;
          const ph = p.height * scale;
          drawCropMark(ctx, px, py, markLen, "tl");
          drawCropMark(ctx, px + pw, py, markLen, "tr");
          drawCropMark(ctx, px, py + ph, markLen, "bl");
          drawCropMark(ctx, px + pw, py + ph, markLen, "br");
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

      // Embed all source pages up-front
      setGenerateProgress("Embedding source pages...");
      const srcPages = srcDoc.getPages();
      const embeddedPages = await outputDoc.embedPages(srcPages);

      for (let si = 0; si < result.sheets.length; si++) {
        const sheet = result.sheets[si];
        setGenerateProgress(
          `Generating sheet ${si + 1} of ${result.sheets.length}...`
        );

        // Front side
        const frontPage = outputDoc.addPage([sheetWPt, sheetHPt]);
        drawPlacementsOnPage(
          frontPage,
          sheet.front,
          embeddedPages,
          sheetWPt,
          sheetHPt
        );
        if (cropMarks) {
          drawCropMarksOnPdfPage(frontPage, sheet.front, sheetHPt);
        }

        // Back side
        const backPage = outputDoc.addPage([sheetWPt, sheetHPt]);
        drawPlacementsOnPage(
          backPage,
          sheet.back,
          embeddedPages,
          sheetWPt,
          sheetHPt
        );
        if (cropMarks) {
          drawCropMarksOnPdfPage(backPage, sheet.back, sheetHPt);
        }
      }

      setGenerateProgress("Saving PDF...");
      const outBytes = await outputDoc.save();

      // Download
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

      {/* Main layout: sidebar + preview */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar: configuration */}
        <div className="w-full lg:w-80 shrink-0 space-y-6">
          {/* Layout picker */}
          <div className="space-y-3">
            <Label className="font-bold text-sm">Layout</Label>
            <RadioGroup
              value={layoutId}
              onValueChange={setLayoutId}
              className="space-y-2"
            >
              {IMPOSITION_LAYOUTS.map((l) => (
                <label
                  key={l.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    layoutId === l.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/30"
                  )}
                >
                  <RadioGroupItem value={l.id} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm leading-tight">
                      {l.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {l.useCase}
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Gang-run N-up selector */}
          {layoutId === "gang-run" && (
            <div className="space-y-2">
              <Label className="font-bold text-sm">Copies per sheet</Label>
              <div className="flex flex-wrap gap-2">
                {GANG_RUN_OPTIONS.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={nUp === n ? "default" : "outline"}
                    onClick={() => setNUp(n)}
                  >
                    {n}-up
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Custom N-up grid */}
          {layoutId === "custom-nup" && (
            <div className="space-y-2">
              <Label className="font-bold text-sm">Grid (rows x columns)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={customRows}
                  onChange={(e) =>
                    setCustomRows(
                      Math.max(1, Math.min(10, parseInt(e.target.value) || 1))
                    )
                  }
                  className="w-20"
                />
                <span className="text-muted-foreground font-medium">&times;</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={customCols}
                  onChange={(e) =>
                    setCustomCols(
                      Math.max(1, Math.min(10, parseInt(e.target.value) || 1))
                    )
                  }
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">
                  = {customRows * customCols * 2} pages/sheet
                </span>
              </div>
            </div>
          )}

          <Separator />

          {/* Paper size */}
          <div className="space-y-2">
            <Label className="font-bold text-sm">Paper size</Label>
            <Select value={paperSizeId} onValueChange={setPaperSizeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPER_SIZES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Orientation */}
          <div className="space-y-2">
            <Label className="font-bold text-sm">Orientation</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={orientation === "portrait" ? "default" : "outline"}
                onClick={() => setOrientation("portrait")}
              >
                Portrait
              </Button>
              <Button
                size="sm"
                variant={orientation === "landscape" ? "default" : "outline"}
                onClick={() => setOrientation("landscape")}
              >
                Landscape
              </Button>
            </div>
          </div>

          {/* Margins */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="font-bold text-sm">Margins</Label>
              <span className="text-xs text-muted-foreground">{marginMm} mm</span>
            </div>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[marginMm]}
              onValueChange={([v]) => setMarginMm(v)}
            />
          </div>

          {/* Gutter */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="font-bold text-sm">Gutter</Label>
              <span className="text-xs text-muted-foreground">{gutterMm} mm</span>
            </div>
            <Slider
              min={0}
              max={10}
              step={1}
              value={[gutterMm]}
              onValueChange={([v]) => setGutterMm(v)}
            />
          </div>

          {/* Creep compensation — only for saddle stitch */}
          {layoutId === "saddle-stitch" && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="font-bold text-sm">Creep compensation</Label>
                <span className="text-xs text-muted-foreground">
                  {creepMm.toFixed(1)} mm
                </span>
              </div>
              <Slider
                min={0}
                max={2}
                step={0.1}
                value={[creepMm]}
                onValueChange={([v]) => setCreepMm(v)}
              />
              <p className="text-xs text-muted-foreground">
                Shifts inner pages outward to compensate for paper thickness
              </p>
            </div>
          )}

          <Separator />

          {/* Scaling */}
          <div className="space-y-2">
            <Label className="font-bold text-sm">Scaling</Label>
            <RadioGroup
              value={scaling}
              onValueChange={(v) => setScaling(v as typeof scaling)}
            >
              {SCALING_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`scale-${opt.value}`} />
                  <Label htmlFor={`scale-${opt.value}`} className="cursor-pointer text-sm">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Blank handling */}
          <div className="flex items-center gap-3">
            <Switch
              id="blank-handling"
              checked={blankHandling === "leave-empty"}
              onCheckedChange={(checked) =>
                setBlankHandling(checked ? "leave-empty" : "auto")
              }
            />
            <Label htmlFor="blank-handling" className="cursor-pointer text-sm">
              Leave blank pages empty
            </Label>
          </div>

          {/* Crop marks */}
          <div className="flex items-center gap-3">
            <Switch
              id="crop-marks"
              checked={cropMarks}
              onCheckedChange={setCropMarks}
            />
            <Label htmlFor="crop-marks" className="cursor-pointer text-sm">
              Crop marks
            </Label>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 min-w-0 space-y-4">
          {result && (
            <>
              {/* Summary */}
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

              {/* Sheet previews */}
              <ScrollArea className="max-h-[70vh]">
                <div className="space-y-6 pr-4">
                  {result.sheets.map((sheet) => (
                    <div
                      key={sheet.sheetNumber}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    >
                      <SheetSidePreview
                        sheet={sheet}
                        side="front"
                        sheetW={effectiveSheetW(paperSize, orientation)}
                        sheetH={effectiveSheetH(paperSize, orientation)}
                        draw={drawSheetSide}
                      />
                      <SheetSidePreview
                        sheet={sheet}
                        side="back"
                        sheetW={effectiveSheetW(paperSize, orientation)}
                        sheetH={effectiveSheetH(paperSize, orientation)}
                        draw={drawSheetSide}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {!result && (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p>Select a layout to see the sheet preview</p>
            </div>
          )}
        </div>
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
                    Flip the paper along the <strong>long edge</strong>, then print
                    PDF page {pdfPage + 1} (Sheet {sheet.sheetNumber} back).
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
// SheetSidePreview — renders one side of a sheet on a canvas
// ---------------------------------------------------------------------------

function SheetSidePreview({
  sheet,
  side,
  sheetW,
  sheetH,
  draw,
}: {
  sheet: SheetDefinition;
  side: "front" | "back";
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
  const placements = side === "front" ? sheet.front : sheet.back;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, placements, sheetW, sheetH);
  }, [draw, placements, sheetW, sheetH]);

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground text-center capitalize">
        Sheet {sheet.sheetNumber} — {side}
      </p>
      <canvas
        ref={canvasRef}
        className="border rounded bg-white mx-auto"
        style={{ maxWidth: "100%" }}
      />
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

function drawCropMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  corner: "tl" | "tr" | "bl" | "br"
) {
  ctx.beginPath();
  switch (corner) {
    case "tl":
      ctx.moveTo(x - len, y);
      ctx.lineTo(x, y);
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y);
      break;
    case "tr":
      ctx.moveTo(x + len, y);
      ctx.lineTo(x, y);
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y);
      break;
    case "bl":
      ctx.moveTo(x - len, y);
      ctx.lineTo(x, y);
      ctx.moveTo(x, y + len);
      ctx.lineTo(x, y);
      break;
    case "br":
      ctx.moveTo(x + len, y);
      ctx.lineTo(x, y);
      ctx.moveTo(x, y + len);
      ctx.lineTo(x, y);
      break;
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
    if (p.pageNumber === 0) continue; // blank
    const pageIndex = p.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= embeddedPages.length) continue;

    const embedded = embeddedPages[pageIndex];
    const xPt = p.x * MM_TO_POINTS;
    // PDF origin is bottom-left, layout origin is top-left
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
      // For 180 rotation, the origin shifts to top-right of the cell
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
  const markLen = 8; // points
  const offset = 2; // points - gap between mark and cell edge

  for (const p of placements) {
    const x1 = p.x * MM_TO_POINTS;
    const y1Pdf = sheetHPt - p.y * MM_TO_POINTS; // top edge in PDF coords
    const x2 = (p.x + p.width) * MM_TO_POINTS;
    const y2Pdf = sheetHPt - (p.y + p.height) * MM_TO_POINTS; // bottom edge

    const corners = [
      { x: x1, y: y1Pdf, dx: -1, dy: 1 },   // top-left
      { x: x2, y: y1Pdf, dx: 1, dy: 1 },     // top-right
      { x: x1, y: y2Pdf, dx: -1, dy: -1 },   // bottom-left
      { x: x2, y: y2Pdf, dx: 1, dy: -1 },     // bottom-right
    ];

    for (const c of corners) {
      // Horizontal mark
      page.drawLine({
        start: { x: c.x + c.dx * offset, y: c.y },
        end: { x: c.x + c.dx * (offset + markLen), y: c.y },
        thickness: 0.25,
      });
      // Vertical mark
      page.drawLine({
        start: { x: c.x, y: c.y + c.dy * offset },
        end: { x: c.x, y: c.y + c.dy * (offset + markLen) },
        thickness: 0.25,
      });
    }
  }
}
