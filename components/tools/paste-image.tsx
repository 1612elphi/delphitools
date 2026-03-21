"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Download,
  Scissors,
  RotateCcw,
  Trash2,
  ClipboardPaste,
  Check,
  Printer,
  MousePointerSquareDashed
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function PasteImageTool() {
  const [image, setImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle paste from clipboard
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target?.result as string;
              setImage(result);
              setOriginalImage(result);
              setIsCropping(false);
              setCropArea(null);
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Constrain coordinates within the image container boundaries
  const getConstrainedCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    return { x, y };
  }, []);

  // Mouse events for cropping
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCropping || !containerRef.current) return;
    const { x, y } = getConstrainedCoordinates(e.clientX, e.clientY);
    setDragStart({ x, y });
    setCropArea({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCropping || !dragStart || !containerRef.current) return;
    const { x: currentX, y: currentY } = getConstrainedCoordinates(e.clientX, e.clientY);
    
    setCropArea({
      x: Math.min(dragStart.x, currentX),
      y: Math.min(dragStart.y, currentY),
      width: Math.abs(currentX - dragStart.x),
      height: Math.abs(currentY - dragStart.y),
    });
  };

  const handleMouseUp = () => {
    if (!isCropping) return;
    setDragStart(null);
  };

  // Touch events for mobile support
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isCropping || !containerRef.current) return;
    // e.preventDefault(); // removed to allow scrolling if not actively dragging
    const touch = e.touches[0];
    const { x, y } = getConstrainedCoordinates(touch.clientX, touch.clientY);
    setDragStart({ x, y });
    setCropArea({ x, y, width: 0, height: 0 });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isCropping || !dragStart || !containerRef.current) return;
    e.preventDefault(); // prevent scrolling while cropping
    const touch = e.touches[0];
    const { x: currentX, y: currentY } = getConstrainedCoordinates(touch.clientX, touch.clientY);
    
    setCropArea({
      x: Math.min(dragStart.x, currentX),
      y: Math.min(dragStart.y, currentY),
      width: Math.abs(currentX - dragStart.x),
      height: Math.abs(currentY - dragStart.y),
    });
  };

  // Apply crop
  const applyCrop = () => {
    if (!cropArea || !imageRef.current || !canvasRef.current) return;

    const img = imageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get the actual image scaling ratio
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    // Set canvas size to the mapped crop area
    canvas.width = cropArea.width * scaleX;
    canvas.height = cropArea.height * scaleY;

    // Draw the cropped portion
    ctx.drawImage(
      img,
      cropArea.x * scaleX,
      cropArea.y * scaleY,
      cropArea.width * scaleX,
      cropArea.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const croppedImage = canvas.toDataURL("image/png");
    setImage(croppedImage);
    setIsCropping(false);
    setCropArea(null);
  };

  // Download image
  const downloadImage = () => {
    if (!image) return;
    const link = document.createElement("a");
    link.href = image;
    link.download = `clipboard-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print image
  const printImage = () => {
    if (!image) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Image</title>
          <style>
            body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            img { max-width: 100%; height: auto; }
            @media print {
              body { margin: 0; }
              img { max-width: 100%; page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <img src="${image}" alt="Print Image" />
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // Reset to original
  const resetImage = () => {
    setImage(originalImage);
    setIsCropping(false);
    setCropArea(null);
  };

  // Clear everything
  const clearImage = () => {
    setImage(null);
    setOriginalImage(null);
    setIsCropping(false);
    setCropArea(null);
  };

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Empty State / Dropzone area */}
      {!image ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/50 transition-colors flex flex-col items-center justify-center min-h-[50vh] bg-muted/10">
          <ClipboardPaste className="size-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Press <kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">Ctrl</kbd> + <kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">V</kbd> to paste
          </h2>
          <p className="text-muted-foreground">
            Copy any image to your clipboard and paste it directly here.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          
          {/* Controls - Left Column */}
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Actions</Label>
              </div>

              <div className="flex flex-col gap-2">
                {!isCropping ? (
                  <Button onClick={() => setIsCropping(true)} className="w-full justify-start" variant="secondary">
                    <Scissors className="size-4 mr-2" /> Start Cropping
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={applyCrop} disabled={!cropArea || cropArea.width === 0} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                      <Check className="size-4 mr-2" /> Apply Crop
                    </Button>
                    <Button onClick={() => { setIsCropping(false); setCropArea(null); }} variant="outline" className="flex-1">
                      Cancel
                    </Button>
                  </div>
                )}

                {isCropping && (
                  <div className="flex items-start gap-2 p-3 mt-2 rounded-lg bg-primary/10 text-primary border border-primary/20 text-sm">
                    <MousePointerSquareDashed className="size-5 shrink-0 mt-0.5" />
                    <p>Click and drag on the image to select the area you want to crop.</p>
                  </div>
                )}

                <hr className="my-2" />

                <Button onClick={downloadImage} className="w-full justify-start">
                  <Download className="size-4 mr-2" /> Download Image
                </Button>
                
                <Button onClick={printImage} variant="outline" className="w-full justify-start">
                  <Printer className="size-4 mr-2" /> Print Image
                </Button>

                {image !== originalImage && (
                  <Button onClick={resetImage} variant="outline" className="w-full justify-start">
                    <RotateCcw className="size-4 mr-2" /> Reset to Original
                  </Button>
                )}

                <Button onClick={clearImage} variant="destructive" className="w-full justify-start mt-2">
                  <Trash2 className="size-4 mr-2" /> Clear & Paste New
                </Button>
              </div>
            </div>
          </div>

          {/* Image Preview - Right Column */}
          <div className="lg:col-span-2 flex justify-center bg-muted/30 rounded-xl border p-4 min-h-[50vh] overflow-hidden">
            <div
              ref={containerRef}
              className={`relative inline-block touch-none select-none ${isCropping ? "cursor-crosshair" : "cursor-default"}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
            >
              <img
                ref={imageRef}
                src={image}
                alt="Pasted content"
                className="max-w-full max-h-[70vh] rounded shadow-sm pointer-events-none"
                draggable={false}
              />

              {/* Crop Selection Overlay */}
              {isCropping && cropArea && (
                <div
                  className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
                  style={{
                    left: cropArea.x,
                    top: cropArea.y,
                    width: cropArea.width,
                    height: cropArea.height,
                  }}
                >
                  {cropArea.width > 20 && cropArea.height > 20 && (
                    <div className="absolute -top-7 left-0 bg-primary text-primary-foreground text-xs px-2 py-1 rounded shadow-sm whitespace-nowrap">
                      {Math.round(cropArea.width)} × {Math.round(cropArea.height)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}