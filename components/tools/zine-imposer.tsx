"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Upload, Download, X, Maximize, Minimize, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PDFDocument, degrees } from "pdf-lib";

// Types
interface ZineImage {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  fitMode: "fit" | "fill";
}

interface PaperSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

interface PagePlacement {
  pageNumber: number;
  col: number;
  row: number;
  rotation: number;
}

// Constants
const PAPER_SIZES: PaperSize[] = [
  { id: "a4", label: "A4 (210 × 297mm)", widthMm: 210, heightMm: 297 },
  { id: "letter", label: "Letter (8.5 × 11\")", widthMm: 215.9, heightMm: 279.4 },
  { id: "a3", label: "A3 (297 × 420mm)", widthMm: 297, heightMm: 420 },
  { id: "tabloid", label: "Tabloid (11 × 17\")", widthMm: 279.4, heightMm: 431.8 },
  { id: "legal", label: "Legal (8.5 × 14\")", widthMm: 215.9, heightMm: 355.6 },
];

// Classic 8-page mini-zine imposition layout
// Single sheet in landscape, 4 columns x 2 rows
// When folded and cut, pages read in order 1-8
const ZINE_LAYOUT: PagePlacement[] = [
  // Top row (left to right): pages 5, 4, 3, 2 - all rotated 180°
  { pageNumber: 5, col: 0, row: 0, rotation: 180 },
  { pageNumber: 4, col: 1, row: 0, rotation: 180 },
  { pageNumber: 3, col: 2, row: 0, rotation: 180 },
  { pageNumber: 2, col: 3, row: 0, rotation: 180 },
  // Bottom row (left to right): pages 6, 7, 8, 1 - not rotated
  { pageNumber: 6, col: 0, row: 1, rotation: 0 },
  { pageNumber: 7, col: 1, row: 1, rotation: 0 },
  { pageNumber: 8, col: 2, row: 1, rotation: 0 },
  { pageNumber: 1, col: 3, row: 1, rotation: 0 },
];

const MM_TO_POINTS = 72 / 25.4;

const DPI_OPTIONS = [72, 150, 300, 600];

export function ZineImposerTool() {
  const [images, setImages] = useState<(ZineImage | null)[]>(Array(8).fill(null));
  const [paperSize, setPaperSize] = useState<PaperSize>(PAPER_SIZES[0]);
  const [bleedEnabled, setBleedEnabled] = useState(false);
  const [selectedDpi, setSelectedDpi] = useState(300);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const loadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

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
        newImages[index] = zineImage;
        return newImages;
      });
    } catch (err) {
      console.error("Failed to load image:", err);
    }
  };

  // Handle bulk upload
  const handleBulkUpload = async (files: FileList | null) => {
    if (!files) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const newImages = [...images];

    let slotIndex = 0;
    for (const file of imageFiles) {
      // Find next empty slot
      while (slotIndex < 8 && newImages[slotIndex] !== null) {
        slotIndex++;
      }
      if (slotIndex >= 8) break;

      try {
        const zineImage = await loadImage(file);
        newImages[slotIndex] = zineImage;
        slotIndex++;
      } catch (err) {
        console.error("Failed to load image:", err);
      }
    }

    setImages(newImages);
  };

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
    // Allow drop for both internal reorder and external file drops
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

  // Draw image on canvas with fit/fill mode
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

    // Move to center of target area
    const centerX = targetX + targetWidth / 2;
    const centerY = targetY + targetHeight / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    const imgAspect = img.width / img.height;
    const targetAspect = targetWidth / targetHeight;

    let drawWidth: number, drawHeight: number;
    let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;

    if (fitMode === "fit") {
      // Scale to fit inside target (may have empty space)
      if (imgAspect > targetAspect) {
        drawWidth = targetWidth;
        drawHeight = targetWidth / imgAspect;
      } else {
        drawHeight = targetHeight;
        drawWidth = targetHeight * imgAspect;
      }
    } else {
      // Scale to fill target (may crop)
      drawWidth = targetWidth;
      drawHeight = targetHeight;

      if (imgAspect > targetAspect) {
        // Image is wider - crop sides
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) / 2;
      } else {
        // Image is taller - crop top/bottom
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

  // Generate preview image
  const generatePreview = useCallback(async () => {
    const hasImages = images.some((img) => img !== null);
    if (!hasImages) {
      setPreview(null);
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

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Scale for preview (2px per mm)
    const scale = 2;

    // Sheet in landscape orientation (4 columns x 2 rows)
    const sheetWidthMm = paperSize.heightMm;
    const sheetHeightMm = paperSize.widthMm;
    const sheetWidthPx = sheetWidthMm * scale;
    const sheetHeightPx = sheetHeightMm * scale;
    const cellWidthPx = sheetWidthPx / 4;  // 4 columns
    const cellHeightPx = sheetHeightPx / 2; // 2 rows

    canvas.width = sheetWidthPx;
    canvas.height = sheetHeightPx;

    // Draw white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);

    // Draw all 8 pages
    for (const placement of ZINE_LAYOUT) {
      const imageIndex = placement.pageNumber - 1;
      const zineImage = images[imageIndex];
      if (!zineImage) continue;

      const htmlImg = loadedImagesRef.current.get(zineImage.id);
      if (!htmlImg) continue;

      const x = placement.col * cellWidthPx;
      const y = placement.row * cellHeightPx;

      drawImageOnCanvas(
        ctx,
        htmlImg,
        x,
        y,
        cellWidthPx,
        cellHeightPx,
        zineImage.fitMode,
        placement.rotation
      );
    }

    // Draw fold/cut lines
    drawGridLines(ctx, sheetWidthPx, sheetHeightPx, cellWidthPx);
    // Draw page numbers
    drawPageNumbers(ctx, ZINE_LAYOUT, cellWidthPx, cellHeightPx);

    setPreview(canvas.toDataURL());
  }, [images, paperSize, bleedEnabled]);

  // Draw fold/cut lines for 4x2 grid
  const drawGridLines = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    cellWidth: number
  ) => {
    ctx.strokeStyle = "#888888";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 4]);

    // Vertical fold lines (at 1/4, 1/2, 3/4)
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cellWidth * i, 0);
      ctx.lineTo(cellWidth * i, height);
      ctx.stroke();
    }

    // Horizontal fold line (full width)
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw the CUT line (solid, thicker, only middle section)
    ctx.strokeStyle = "#cc0000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cellWidth, height / 2);
    ctx.lineTo(cellWidth * 3, height / 2);
    ctx.stroke();

    // Add "CUT" label
    ctx.fillStyle = "#cc0000";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("✂ CUT", width / 2, height / 2 - 6);
  };

  // Draw page numbers on preview
  const drawPageNumbers = (
    ctx: CanvasRenderingContext2D,
    layout: PagePlacement[],
    cellWidth: number,
    cellHeight: number
  ) => {
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const placement of layout) {
      const x = placement.col * cellWidth + cellWidth / 2;
      const y = placement.row * cellHeight + cellHeight / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((placement.rotation * Math.PI) / 180);

      // Draw background circle
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();

      // Draw number
      ctx.fillStyle = "#ffffff";
      ctx.fillText(placement.pageNumber.toString(), 0, 0);

      ctx.restore();
    }
  };

  // Generate previews when images or settings change
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
        // Image is wider - crop sides
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) / 2;
      } else {
        // Image is taller - crop top/bottom
        sourceHeight = img.width / targetAspect;
        sourceY = (img.height - sourceHeight) / 2;
      }

      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

      resolve(canvas.toDataURL("image/png"));
    });
  };

  // Generate PDF
  const generatePdf = async () => {
    setIsGenerating(true);

    try {
      const pdfDoc = await PDFDocument.create();

      // Sheet in landscape orientation (4 columns x 2 rows)
      const sheetWidthPt = paperSize.heightMm * MM_TO_POINTS;
      const sheetHeightPt = paperSize.widthMm * MM_TO_POINTS;
      const cellWidthPt = sheetWidthPt / 4;  // 4 columns
      const cellHeightPt = sheetHeightPt / 2; // 2 rows
      const targetAspect = cellWidthPt / cellHeightPt;

      // Create single page
      const page = pdfDoc.addPage([sheetWidthPt, sheetHeightPt]);

      // Draw all 8 page images
      for (const placement of ZINE_LAYOUT) {
        const imageIndex = placement.pageNumber - 1;
        const zineImage = images[imageIndex];
        if (!zineImage) continue;

        const htmlImg = loadedImagesRef.current.get(zineImage.id);
        let imageDataUrl = zineImage.dataUrl;

        // For fill mode, pre-crop to target aspect ratio
        if (zineImage.fitMode === "fill" && htmlImg) {
          imageDataUrl = await cropImageToAspect(htmlImg, targetAspect);
        }

        // Embed the image
        const imageBytes = await fetch(imageDataUrl).then((r) => r.arrayBuffer());
        let embeddedImage;
        try {
          if (imageDataUrl.includes("image/png")) {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } else {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          }
        } catch {
          // Try the other format if first fails
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
          // Fill mode - image already cropped to correct aspect, fill the cell
          drawWidth = cellWidthPt;
          drawHeight = cellHeightPt;
        }

        // Calculate position (PDF origin is bottom-left)
        // row 0 is top, row 1 is bottom
        const cellX = placement.col * cellWidthPt;
        const cellY = placement.row === 0 ? cellHeightPt : 0;

        // Center the image in the cell
        const offsetX = (cellWidthPt - drawWidth) / 2;
        const offsetY = (cellHeightPt - drawHeight) / 2;

        if (placement.rotation === 180) {
          // For 180 degree rotation, draw from the opposite corner
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

      const pdfBytes = await pdfDoc.save();

      // Download the PDF
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `zine-${paperSize.id}${bleedEnabled ? "-bleed" : ""}.pdf`;
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
    setImages(Array(8).fill(null));
  };

  const imageCount = images.filter((img) => img !== null).length;

  return (
    <div className="space-y-8">
      {/* Settings Row */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-2">
          <Label className="font-bold">Paper Size</Label>
          <Select
            value={paperSize.id}
            onValueChange={(id) =>
              setPaperSize(PAPER_SIZES.find((p) => p.id === id)!)
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPER_SIZES.map((size) => (
                <SelectItem key={size.id} value={size.id}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="font-bold">Reference DPI</Label>
          <Select
            value={selectedDpi.toString()}
            onValueChange={(v) => setSelectedDpi(parseInt(v))}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DPI_OPTIONS.map((dpi) => (
                <SelectItem key={dpi} value={dpi.toString()}>
                  {dpi} DPI
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 h-10">
          <Switch
            id="bleed"
            checked={bleedEnabled}
            onCheckedChange={setBleedEnabled}
          />
          <Label htmlFor="bleed" className="cursor-pointer">
            Add 3mm bleed
          </Label>
        </div>

        {imageCount > 0 && (
          <Button variant="ghost" onClick={clearAll} className="ml-auto">
            Clear all
          </Button>
        )}
      </div>

      {/* Page Dimensions Guide */}
      {(() => {
        // Calculate page dimensions in landscape (4 cols x 2 rows)
        const sheetWidthMm = paperSize.heightMm; // Landscape
        const sheetHeightMm = paperSize.widthMm;
        const pageWidthMm = sheetWidthMm / 4;
        const pageHeightMm = sheetHeightMm / 2;
        const pageWidthPx = Math.round((pageWidthMm / 25.4) * selectedDpi);
        const pageHeightPx = Math.round((pageHeightMm / 25.4) * selectedDpi);

        return (
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="font-bold text-sm mb-2">Page Dimensions for Digital Artists</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Each page:</span>
                <p className="font-mono font-medium">
                  {pageWidthMm.toFixed(1)} × {pageHeightMm.toFixed(1)} mm
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">At {selectedDpi} DPI:</span>
                <p className="font-mono font-medium">
                  {pageWidthPx} × {pageHeightPx} px
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Aspect ratio:</span>
                <p className="font-mono font-medium">
                  {(pageWidthMm / pageHeightMm).toFixed(3)}:1
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Orientation:</span>
                <p className="font-mono font-medium">
                  {pageWidthMm < pageHeightMm ? "Portrait" : "Landscape"}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk Upload Zone */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          handleBulkUpload(e.dataTransfer.files);
        }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
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
          or click to select multiple files
        </p>
      </div>

      {/* 8-Slot Image Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="font-bold">Zine Pages (drag to reorder)</Label>
          <span className="text-sm text-muted-foreground">
            {imageCount}/8 pages filled
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {images.map((image, index) => (
            <div
              key={index}
              draggable={!!image}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative aspect-[3/4] border-2 rounded-lg overflow-hidden transition-all",
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
                  {/* Image preview */}
                  <img
                    src={image.dataUrl}
                    alt={`Page ${index + 1}`}
                    className={cn(
                      "size-full",
                      image.fitMode === "fill" ? "object-cover" : "object-contain"
                    )}
                  />

                  {/* Overlay controls */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity">
                    {/* Drag handle */}
                    <div className="absolute top-2 left-2">
                      <GripVertical className="size-5 text-white/80" />
                    </div>

                    {/* Page number */}
                    <div className="absolute top-2 right-2 size-6 rounded-full bg-black/50 flex items-center justify-center">
                      <span className="text-xs font-bold text-white">
                        {index + 1}
                      </span>
                    </div>

                    {/* Bottom controls */}
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
      {preview && (
        <div className="space-y-3">
          <Label className="font-bold">Imposition Preview</Label>
          <p className="text-sm text-muted-foreground">
            Single-sided print. The red line shows where to cut.
          </p>
          <img
            src={preview}
            alt="Zine imposition preview"
            className="w-full border rounded-lg"
          />
        </div>
      )}

      {/* Generate Button */}
      <Button
        size="lg"
        className="w-full h-14 text-lg font-bold"
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
      <div className="text-sm text-muted-foreground space-y-2 p-4 bg-muted/50 rounded-lg">
        <p className="font-medium text-foreground">How to fold your zine:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Print the single page (single-sided, landscape)</li>
          <li>Fold in half lengthwise (top edge to bottom edge)</li>
          <li>Unfold, then fold in half widthwise (right edge to left)</li>
          <li>Fold in half widthwise again</li>
          <li>Unfold completely — you&apos;ll see 8 panels</li>
          <li>Cut along the red line (center horizontal, middle two columns only)</li>
          <li>Fold lengthwise again, push ends together to form booklet</li>
        </ol>
      </div>
    </div>
  );
}
