"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Upload, Download, X, Maximize, Minimize, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PaperSizeCombobox } from "@/components/ui/paper-size-combobox";
import { findPaperSize } from "@/lib/paper-sizes";
import { cn } from "@/lib/utils";
import { PDFDocument, degrees } from "pdf-lib";
import { PAPER_SIZES, MM_TO_POINTS } from "@/lib/imposition";
import {
  ZINE_FOLDS,
  buildFoldLayout,
  getFoldOption,
  type ZineFoldId,
  type ZineFoldLayout,
  type ZineSide,
} from "@/lib/zine-folds";
import { useFilePaste } from "@/hooks/use-file-paste";

// Types
interface ZineImage {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  fitMode: "fit" | "fill";
}

const DPI_OPTIONS = [72, 150, 300, 600];

// Small schematic of each fold, used in the fold-type picker.
function FoldGlyph({ id, className }: { id: ZineFoldId; className?: string }) {
  if (id === "accordion") {
    return (
      <svg
        viewBox="0 0 44 28"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={className}
        aria-hidden="true"
      >
        <polyline points="3,23 11,5 19,23 27,5 35,23 42,9" />
      </svg>
    );
  }
  if (id === "mini-8") {
    // 4×2 grid with the central fold-and-cut slit highlighted.
    return (
      <svg
        viewBox="0 0 44 28"
        fill="none"
        stroke="currentColor"
        className={className}
        aria-hidden="true"
      >
        <rect x="2" y="2" width="40" height="24" rx="2.5" strokeWidth={1.6} />
        <path d="M12 2v24M22 2v24M32 2v24M2 14h40" strokeWidth={1} opacity={0.55} />
        <path d="M12 14h20" strokeWidth={2.6} strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

// Compact segmented button group (house style shared by the Panels + DPI pickers).
function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="segmented h-9"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => (
        <Button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          variant={value === opt.value ? "default" : "outline"}
          className="h-full text-sm font-medium"
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function ZineImposerTool() {
  // --- Fold configuration ---
  const [foldId, setFoldId] = useState<ZineFoldId>("mini-8");
  const [panels, setPanels] = useState(8);
  const [doubleSided, setDoubleSided] = useState(false);
  const [split, setSplit] = useState(false);

  // Memoise so the layout object is referentially stable across renders —
  // generatePreview depends on it, and an unstable ref would loop the effect.
  const layout: ZineFoldLayout = useMemo(
    () => buildFoldLayout(foldId, { panels, doubleSided, split }),
    [foldId, panels, doubleSided, split]
  );
  const foldOption = getFoldOption(foldId);
  const pageCount = layout.pageCount;
  const duplexLabel = layout.duplexFlip === "long-edge" ? "long edge" : "short edge";

  const [images, setImages] = useState<(ZineImage | null)[]>(() =>
    Array(pageCount).fill(null)
  );
  const [paperSizeId, setPaperSizeId] = useState("a4");
  const paperSize = findPaperSize(paperSizeId) ?? PAPER_SIZES[0];
  const [bleedEnabled, setBleedEnabled] = useState(false);
  const [selectedDpi, setSelectedDpi] = useState(300);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const loadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Resize the slot array whenever the page count changes, preserving existing
  // images where the index still exists.
  useEffect(() => {
    setImages((prev) => {
      if (prev.length === pageCount) return prev;
      // Release cached HTMLImageElements for slots that no longer exist.
      for (let i = pageCount; i < prev.length; i++) {
        if (prev[i]) loadedImagesRef.current.delete(prev[i]!.id);
      }
      const next = Array<ZineImage | null>(pageCount).fill(null);
      for (let i = 0; i < Math.min(prev.length, pageCount); i++) {
        next[i] = prev[i];
      }
      return next;
    });
  }, [pageCount]);

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Load image and get dimensions
  const loadImage = (file: File): Promise<ZineImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const id = generateId();
          const zineImage: ZineImage = {
            id,
            dataUrl: reader.result as string,
            width: img.width,
            height: img.height,
            fitMode: "fill",
          };
          loadedImagesRef.current.set(id, img);
          resolve(zineImage);
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle file upload for a specific slot
  const handleFileUpload = async (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) return;

    try {
      const zineImage = await loadImage(file);
      setImages((prev) => {
        const newImages = [...prev];
        // Release the outgoing slot's cached bitmap before replacing it.
        if (newImages[index]) {
          loadedImagesRef.current.delete(newImages[index]!.id);
        }
        newImages[index] = zineImage;
        return newImages;
      });
    } catch (err) {
      console.error("Failed to load image:", err);
    }
  };

  // Handle bulk upload — fills empty slots in order
  const handleBulkUpload = async (files: FileList | null) => {
    if (!files) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    // Decode everything first, then commit in one go. Settling per-file lets a
    // failed decode drop out without aborting the rest.
    const settled = await Promise.all(
      imageFiles.map((file) =>
        loadImage(file).catch((err) => {
          console.error("Failed to load image:", err);
          return null;
        })
      )
    );
    const loaded = settled.filter((img): img is ZineImage => img !== null);
    if (loaded.length === 0) return;

    // One functional updater recomputes empty slots from the latest state, so
    // concurrent updates during the awaits above aren't clobbered.
    setImages((prev) => {
      const next = [...prev];
      let slotIndex = 0;
      for (const img of loaded) {
        while (slotIndex < next.length && next[slotIndex] !== null) slotIndex++;
        if (slotIndex >= next.length) break;
        next[slotIndex++] = img;
      }
      return next;
    });
  };

  useFilePaste(async (file: File) => {
    try {
      const zineImage = await loadImage(file);
      setImages((prev) => {
        const emptyIndex = prev.findIndex((img) => img === null);
        if (emptyIndex === -1) return prev;
        const newImages = [...prev];
        newImages[emptyIndex] = zineImage;
        return newImages;
      });
    } catch { /* ignore load failures */ }
  }, "image/*");

  // Remove image from slot
  const removeImage = (index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      if (newImages[index]) {
        loadedImagesRef.current.delete(newImages[index]!.id);
      }
      newImages[index] = null;
      return newImages;
    });
  };

  // Toggle fit mode
  const toggleFitMode = (index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      if (newImages[index]) {
        newImages[index] = {
          ...newImages[index]!,
          fitMode: newImages[index]!.fitMode === "fit" ? "fill" : "fit",
        };
      }
      return newImages;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!images[index]) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex === index) return;
    setDragOverIndex(index);
    e.dataTransfer.dropEffect = draggedIndex !== null ? "move" : "copy";
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    // Check if this is a file drop from outside
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        try {
          const zineImage = await loadImage(file);
          setImages((prev) => {
            const newImages = [...prev];
            // Release the outgoing slot's cached bitmap before replacing it.
            if (newImages[targetIndex]) {
              loadedImagesRef.current.delete(newImages[targetIndex]!.id);
            }
            newImages[targetIndex] = zineImage;
            return newImages;
          });
        } catch (err) {
          console.error("Failed to load dropped image:", err);
        }
      }
      setDraggedIndex(null);
      return;
    }

    // Internal reorder
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    setImages((prev) => {
      const newImages = [...prev];
      const draggedImage = newImages[draggedIndex];
      const targetImage = newImages[targetIndex];
      newImages[draggedIndex] = targetImage;
      newImages[targetIndex] = draggedImage;
      return newImages;
    });

    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Draw image on canvas with fit/fill mode + rotation
  const drawImageOnCanvas = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number,
    fitMode: "fit" | "fill",
    rotation: number
  ) => {
    ctx.save();

    const centerX = targetX + targetWidth / 2;
    const centerY = targetY + targetHeight / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    const imgAspect = img.width / img.height;
    const targetAspect = targetWidth / targetHeight;

    let drawWidth: number, drawHeight: number;
    let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;

    if (fitMode === "fit") {
      if (imgAspect > targetAspect) {
        drawWidth = targetWidth;
        drawHeight = targetWidth / imgAspect;
      } else {
        drawHeight = targetHeight;
        drawWidth = targetHeight * imgAspect;
      }
    } else {
      drawWidth = targetWidth;
      drawHeight = targetHeight;

      if (imgAspect > targetAspect) {
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) / 2;
      } else {
        sourceHeight = img.width / targetAspect;
        sourceY = (img.height - sourceHeight) / 2;
      }
    }

    ctx.drawImage(
      img,
      sourceX, sourceY, sourceWidth, sourceHeight,
      -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight
    );

    ctx.restore();
  };

  // Draw fold creases (dashed grey) and cut lines (solid red) for one side.
  const drawGuides = (
    ctx: CanvasRenderingContext2D,
    side: ZineSide,
    width: number,
    height: number
  ) => {
    // Fold lines are drawn on every side. Cut lines only matter where they exist.
    ctx.strokeStyle = "#888888";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 4]);

    for (const fold of layout.foldLines) {
      ctx.beginPath();
      if (fold.axis === "v") {
        const x = fold.pos * width;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      } else {
        const y = fold.pos * height;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Cut lines (only on the front; cuts are a single-sided concept here)
    if (side.side === "front" && layout.cutLines.length > 0) {
      ctx.strokeStyle = "#cc0000";
      ctx.lineWidth = 2;
      for (const cut of layout.cutLines) {
        ctx.beginPath();
        ctx.moveTo(cut.x1 * width, cut.y1 * height);
        ctx.lineTo(cut.x2 * width, cut.y2 * height);
        ctx.stroke();

        // Label at the midpoint
        const mx = ((cut.x1 + cut.x2) / 2) * width;
        const my = ((cut.y1 + cut.y2) / 2) * height;
        ctx.fillStyle = "#cc0000";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("✂ CUT", mx, my - 6);
      }
    }
  };

  // Draw page-number badges for one side.
  const drawPageNumbers = (
    ctx: CanvasRenderingContext2D,
    side: ZineSide,
    cellWidth: number,
    cellHeight: number
  ) => {
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const placement of side.placements) {
      const x = placement.col * cellWidth + cellWidth / 2;
      const y = placement.row * cellHeight + cellHeight / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((placement.rotation * Math.PI) / 180);

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(placement.page.toString(), 0, 0);

      ctx.restore();
    }
  };

  // Generate one preview image per side.
  const generatePreview = useCallback(async () => {
    const hasImages = images.some((img) => img !== null);
    if (!hasImages) {
      setPreviews([]);
      return;
    }

    // Wait for any pending image loads
    const loadPromises = images.map((img) => {
      if (!img) return Promise.resolve();
      if (loadedImagesRef.current.has(img.id)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const htmlImg = new Image();
        htmlImg.onload = () => {
          loadedImagesRef.current.set(img.id, htmlImg);
          resolve();
        };
        htmlImg.onerror = () => resolve();
        htmlImg.src = img.dataUrl;
      });
    });
    await Promise.all(loadPromises);

    const scale = 2; // px per mm
    const sheetWidthMm = Math.max(paperSize.widthMm, paperSize.heightMm); // landscape
    const sheetHeightMm = Math.min(paperSize.widthMm, paperSize.heightMm);
    const sheetWidthPx = sheetWidthMm * scale;
    const sheetHeightPx = sheetHeightMm * scale;
    const cellWidthPx = sheetWidthPx / layout.cols;
    const cellHeightPx = sheetHeightPx / layout.rows;

    const result: string[] = [];

    for (const side of layout.sides) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = sheetWidthPx;
      canvas.height = sheetHeightPx;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);

      for (const placement of side.placements) {
        const zineImage = images[placement.page - 1];
        if (!zineImage) continue;
        const htmlImg = loadedImagesRef.current.get(zineImage.id);
        if (!htmlImg) continue;

        drawImageOnCanvas(
          ctx,
          htmlImg,
          placement.col * cellWidthPx,
          placement.row * cellHeightPx,
          cellWidthPx,
          cellHeightPx,
          zineImage.fitMode,
          placement.rotation
        );
      }

      drawGuides(ctx, side, sheetWidthPx, sheetHeightPx);
      drawPageNumbers(ctx, side, cellWidthPx, cellHeightPx);

      result.push(canvas.toDataURL());
    }

    setPreviews(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, paperSize, layout]);

  // Regenerate previews when images or settings change
  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  // Helper to crop image to target aspect ratio using canvas
  const cropImageToAspect = (
    img: HTMLImageElement,
    targetAspect: number
  ): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      const imgAspect = img.width / img.height;
      let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;

      if (imgAspect > targetAspect) {
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) / 2;
      } else {
        sourceHeight = img.width / targetAspect;
        sourceY = (img.height - sourceHeight) / 2;
      }

      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

      resolve(canvas.toDataURL("image/png"));
    });
  };

  // Generate PDF — one page per side.
  const generatePdf = async () => {
    setIsGenerating(true);

    try {
      const pdfDoc = await PDFDocument.create();

      const sheetWidthMm = Math.max(paperSize.widthMm, paperSize.heightMm); // landscape
      const sheetHeightMm = Math.min(paperSize.widthMm, paperSize.heightMm);
      const sheetWidthPt = sheetWidthMm * MM_TO_POINTS;
      const sheetHeightPt = sheetHeightMm * MM_TO_POINTS;
      const cellWidthPt = sheetWidthPt / layout.cols;
      const cellHeightPt = sheetHeightPt / layout.rows;
      const targetAspect = cellWidthPt / cellHeightPt;

      for (const side of layout.sides) {
        const page = pdfDoc.addPage([sheetWidthPt, sheetHeightPt]);

        for (const placement of side.placements) {
          const zineImage = images[placement.page - 1];
          if (!zineImage) continue;

          const htmlImg = loadedImagesRef.current.get(zineImage.id);
          let imageDataUrl = zineImage.dataUrl;

          // For fill mode, pre-crop to target aspect ratio
          if (zineImage.fitMode === "fill" && htmlImg) {
            imageDataUrl = await cropImageToAspect(htmlImg, targetAspect);
          }

          const imageBytes = await fetch(imageDataUrl).then((r) => r.arrayBuffer());
          let embeddedImage;
          try {
            if (imageDataUrl.includes("image/png")) {
              embeddedImage = await pdfDoc.embedPng(imageBytes);
            } else {
              embeddedImage = await pdfDoc.embedJpg(imageBytes);
            }
          } catch {
            try {
              embeddedImage = await pdfDoc.embedJpg(imageBytes);
            } catch {
              embeddedImage = await pdfDoc.embedPng(imageBytes);
            }
          }

          let drawWidth: number, drawHeight: number;
          if (zineImage.fitMode === "fit") {
            const imgAspect = embeddedImage.width / embeddedImage.height;
            if (imgAspect > targetAspect) {
              drawWidth = cellWidthPt;
              drawHeight = cellWidthPt / imgAspect;
            } else {
              drawHeight = cellHeightPt;
              drawWidth = cellHeightPt * imgAspect;
            }
          } else {
            drawWidth = cellWidthPt;
            drawHeight = cellHeightPt;
          }

          // PDF origin is bottom-left; row 0 is the top row.
          const cellX = placement.col * cellWidthPt;
          const cellY = (layout.rows - 1 - placement.row) * cellHeightPt;

          const offsetX = (cellWidthPt - drawWidth) / 2;
          const offsetY = (cellHeightPt - drawHeight) / 2;

          if (placement.rotation === 180) {
            page.drawImage(embeddedImage, {
              x: cellX + cellWidthPt - offsetX,
              y: cellY + cellHeightPt - offsetY,
              width: drawWidth,
              height: drawHeight,
              rotate: degrees(180),
            });
          } else {
            page.drawImage(embeddedImage, {
              x: cellX + offsetX,
              y: cellY + offsetY,
              width: drawWidth,
              height: drawHeight,
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const sidesTag = layout.sides.length > 1 ? "-duplex" : "";
      link.download = `zine-${foldId}-${paperSize.id}${sidesTag}${bleedEnabled ? "-bleed" : ""}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Clear all images
  const clearAll = () => {
    loadedImagesRef.current.clear();
    setImages(Array(pageCount).fill(null));
  };

  const imageCount = images.filter((img) => img !== null).length;

  // Page dimensions for the digital-artist guide
  const sheetWidthMm = Math.max(paperSize.widthMm, paperSize.heightMm);
  const sheetHeightMm = Math.min(paperSize.widthMm, paperSize.heightMm);
  const pageWidthMm = sheetWidthMm / layout.cols;
  const pageHeightMm = sheetHeightMm / layout.rows;
  const pageWidthPx = Math.round((pageWidthMm / 25.4) * selectedDpi);
  const pageHeightPx = Math.round((pageHeightMm / 25.4) * selectedDpi);

  return (
    <div className="space-y-8">
      {/* Configuration */}
      <div className="border-2 border-border">
        {/* Fold type — segmented tab picker with mini diagrams */}
        <div className="border-b-2 border-border p-4">
          <span className="font-bold block mb-3">Fold type</span>
          <div
            className="segmented grid-cols-2 -mx-4 -mb-4 border-x-0 border-b-0"
            role="tablist"
            aria-label="Fold type"
          >
            {ZINE_FOLDS.map((f) => {
              const selected = f.id === foldId;
              return (
                <Button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFoldId(f.id)}
                  variant={selected ? "default" : "outline"}
                  className="flex h-auto items-center justify-start gap-3 p-3 text-left"
                >
                  <FoldGlyph
                    id={f.id}
                    className={cn(
                      "h-7 w-11 shrink-0",
                      selected ? "" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold leading-tight">{f.name}</div>
                    <div className={cn("text-xs", selected ? "opacity-80" : "text-muted-foreground")}>
                      {f.tagline}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Options + sheet setup */}
        <div className="grid lg:grid-cols-2">
          {/* Fold options */}
          <div className="border-b-2 border-border p-4 space-y-4 lg:border-b-0 lg:border-r-2">
            <span className="font-bold block">Options</span>
            <p className="text-sm text-muted-foreground">{foldOption.description}</p>

            {foldOption.configurablePanels || foldOption.supportsDoubleSided || foldOption.supportsSplit ? (
              <div className="space-y-4">
                {foldOption.configurablePanels && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Panels
                    </span>
                    <SegmentedControl
                      ariaLabel="Panels"
                      options={(foldOption.panelOptions ?? []).map((p) => ({ value: p, label: String(p) }))}
                      value={panels}
                      onChange={setPanels}
                    />
                  </div>
                )}

                {foldOption.supportsDoubleSided && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="double-sided" className="text-sm font-medium cursor-pointer">
                        Double-sided
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {doubleSided
                          ? `Front + back · print flip on ${duplexLabel}`
                          : "Single side · fold-out strip"}
                      </p>
                    </div>
                    <Switch id="double-sided" checked={doubleSided} onCheckedChange={setDoubleSided} />
                  </div>
                )}

                {foldOption.supportsSplit && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="split" className="text-sm font-medium cursor-pointer">
                        Split in half (two-up)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {split
                          ? "Two copies stacked · cut in half · shorter panels"
                          : "One full-height strip"}
                      </p>
                    </div>
                    <Switch id="split" checked={split} onCheckedChange={setSplit} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Fixed {pageCount}-page layout — no options to set.
              </p>
            )}
          </div>

          {/* Sheet & output */}
          <div className="border-b-2 border-border p-4 space-y-3 lg:border-b-0">
            <span className="font-bold block">Sheet &amp; output</span>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Paper size
              </span>
              <PaperSizeCombobox
                value={paperSizeId}
                onValueChange={setPaperSizeId}
                triggerClassName="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Reference DPI
              </span>
              <SegmentedControl
                ariaLabel="Reference DPI"
                options={DPI_OPTIONS.map((dpi) => ({ value: dpi, label: String(dpi) }))}
                value={selectedDpi}
                onChange={setSelectedDpi}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <Label htmlFor="bleed" className="text-sm font-medium cursor-pointer">
                Add 3mm bleed
              </Label>
              <Switch id="bleed" checked={bleedEnabled} onCheckedChange={setBleedEnabled} />
            </div>
          </div>
        </div>

        {/* Page dimensions — compact stats strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t-2 border-border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Each page
          </span>
          <span className="font-mono font-medium">
            {pageWidthMm.toFixed(1)} × {pageHeightMm.toFixed(1)} mm
          </span>
          <span className="font-mono text-muted-foreground">
            {pageWidthPx} × {pageHeightPx} px @ {selectedDpi} dpi
          </span>
          <span className="font-mono text-muted-foreground">
            {(pageWidthMm / pageHeightMm).toFixed(3)}:1
          </span>
          <span className="font-mono text-muted-foreground">
            {pageWidthMm < pageHeightMm ? "Portrait" : "Landscape"}
          </span>
        </div>
      </div>

      {/* Bulk Upload Zone */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          handleBulkUpload(e.dataTransfer.files);
        }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-border p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.multiple = true;
          input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            handleBulkUpload(target.files);
          };
          input.click();
        }}
      >
        <Upload className="size-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">Drop images here to fill empty slots</p>
        <p className="text-sm text-muted-foreground mt-1">
          or click to select multiple files, or paste
        </p>
      </div>

      {/* Image Grid */}
      <div className="border-2 border-border">
        <div className="flex items-center justify-between gap-3 border-b-2 border-border p-4">
          <span className="font-bold">
            Zine pages <span className="font-normal text-muted-foreground">· drag to reorder</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {imageCount}/{pageCount} filled
              {layout.sides.length > 1 &&
                " · " +
                  layout.sides
                    .map((s) => {
                      const pages = s.placements.map((p) => p.page);
                      return `${s.side} ${Math.min(...pages)}–${Math.max(...pages)}`;
                    })
                    .join(", ")}
            </span>
            {imageCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-7">
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 p-4">
          {images.map((image, index) => (
            <div
              key={image ? image.id : `empty-${index}`}
              draggable={!!image}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative aspect-[3/4] border-2 border-border overflow-hidden transition-all",
                image
                  ? "border-solid bg-card cursor-grab active:cursor-grabbing"
                  : "border-dashed hover:border-primary/50 cursor-pointer",
                draggedIndex === index && "opacity-50 border-primary",
                dragOverIndex === index && "border-primary bg-primary/5",
              )}
              onClick={() => {
                if (!image) {
                  fileInputRefs.current[index]?.click();
                }
              }}
            >
              <input
                ref={(el) => { fileInputRefs.current[index] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(index, e.target.files)}
              />

              {image ? (
                <>
                  <img
                    src={image.dataUrl}
                    alt={`Page ${index + 1}`}
                    className={cn(
                      "size-full",
                      image.fitMode === "fill" ? "object-cover" : "object-contain"
                    )}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity">
                    <div className="absolute top-2 left-2">
                      <GripVertical className="size-5 text-white/80" />
                    </div>

                    <div className="absolute top-2 right-2 size-6 bg-black/50 flex items-center justify-center">
                      <span className="text-xs font-bold text-white">
                        {index + 1}
                      </span>
                    </div>

                    <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFitMode(index);
                        }}
                      >
                        {image.fitMode === "fill" ? (
                          <><Minimize className="size-3 mr-1" /> Fit</>
                        ) : (
                          <><Maximize className="size-3 mr-1" /> Fill</>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index);
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Upload className="size-6 mb-2" />
                  <span className="text-xs font-medium">Page {index + 1}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Preview Section */}
      {previews.length > 0 && (
        <div className="border-2 border-border">
          <div className="border-b-2 border-border p-4">
            <Label className="font-bold block mb-1">Imposition Preview</Label>
            <p className="text-sm text-muted-foreground">
              {layout.sides.length > 1
                ? `Double-sided print. Print both pages, flip on the ${duplexLabel}.`
                : "Single-sided print."}
              {layout.cutLines.length > 0 && " The red line shows where to cut."}
            </p>
          </div>
          <div className={cn("grid", layout.sides.length > 1 && "sm:grid-cols-2")}>
            {/* Drive the map off the current layout (not the async `previews`
                array) so a shrinking side count can't index a missing side. */}
            {layout.sides.map((side, i) =>
              previews[i] ? (
                <div
                  key={side.side}
                  className="border-b border-border last:border-b-0 sm:border-b-0 sm:[&:not(:last-child)]:border-r"
                >
                  {layout.sides.length > 1 && (
                    <span className="block border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {side.side}
                    </span>
                  )}
                  <img
                    src={previews[i]}
                    alt={`Zine imposition preview ${side.side}`}
                    className="w-full p-4"
                  />
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      {/* Generate Button */}
      <Button
        size="lg"
        className="h-14 w-full rounded-none border-0 text-lg font-bold"
        onClick={generatePdf}
        disabled={imageCount === 0 || isGenerating}
      >
        {isGenerating ? (
          "Generating PDF..."
        ) : (
          <>
            <Download className="size-5 mr-2" />
            Download Zine PDF
          </>
        )}
      </Button>

      {/* Instructions */}
      <div className="border-2 border-border">
        <p className="border-b-2 border-border p-4 font-bold text-foreground">How to fold your zine:</p>
        <ol className="list-decimal list-inside space-y-1 p-4 text-sm text-muted-foreground">
          {layout.instructions.map((step, i) => (
            <li key={`${i}-${step}`}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
