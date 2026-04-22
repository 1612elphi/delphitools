"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Download,
  Scissors,
  RotateCcw,
  X,
  ClipboardPaste,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFilePaste } from "@/hooks/use-file-paste";

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "move" | null;

export function PasteImageTool() {
  const [image, setImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; initialCrop: CropArea } | null>(null);
  
  const [imageScale, setImageScale] = useState({ x: 1, y: 1 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const rafRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const objectUrls = useRef<Set<string>>(new Set());

  const createSafeObjectURL = useCallback((blob: Blob | MediaSource) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  }, []);

  const revokeSafeObjectURL = useCallback((url: string | null) => {
    if (url && objectUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(url);
    }
  }, []);

  // Cleanup all Object URLs and timers on unmount
  useEffect(() => {
    const objurlcurr = objectUrls.current;
    return () => {
      objurlcurr.forEach(url => URL.revokeObjectURL(url));
      objurlcurr.clear();
      
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

  useFilePaste((file: File) => {
    const url = createSafeObjectURL(file);

    setImage(prev => {
      if (prev) revokeSafeObjectURL(prev);
      return url;
    });
    setOriginalImage(prev => {
      if (prev && prev !== url) revokeSafeObjectURL(prev);
      return url;
    });

    setIsCropping(false);
    setCropArea(null);
  }, "image/*");

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        if (isCropping) {
          setIsCropping(false);
          setCropArea(null);
        }
      }, 150);
    };
    
    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [isCropping]);

  const startCropping = () => {
    if (imageRef.current) {
      setCropArea({
        x: 0,
        y: 0,
        width: imageRef.current.width,
        height: imageRef.current.height,
      });
      setImageScale({
        x: imageRef.current.naturalWidth / imageRef.current.width,
        y: imageRef.current.naturalHeight / imageRef.current.height,
      });
      setIsCropping(true);
    }
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, mode: DragMode) => {
    if (e.type !== "touchstart") {
      e.preventDefault();
    }
    e.stopPropagation();
    if (!cropArea) return;

    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    setDragMode(mode);
    setDragStart({
      mouseX: clientX,
      mouseY: clientY,
      initialCrop: { ...cropArea },
    });
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragMode || !dragStart || !imageRef.current) return;
    if (e.cancelable) e.preventDefault();

    const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const dx = clientX - dragStart.mouseX;
    const dy = clientY - dragStart.mouseY;

    const { initialCrop } = dragStart;
    let newX = initialCrop.x;
    let newY = initialCrop.y;
    let newW = initialCrop.width;
    let newH = initialCrop.height;

    const minSize = 20;
    const maxW = imageRef.current.width;
    const maxH = imageRef.current.height;

    // Calculate new dimensions synchronously
    if (dragMode === "move") {
      newX = Math.max(0, Math.min(newX + dx, maxW - newW));
      newY = Math.max(0, Math.min(newY + dy, maxH - newH));
    } else {
      if (dragMode.includes("n")) {
        const proposedY = newY + dy;
        const proposedH = newH - dy;
        if (proposedH >= minSize && proposedY >= 0) {
          newY = proposedY;
          newH = proposedH;
        } else if (proposedY < 0) {
          newY = 0;
          newH = initialCrop.y + initialCrop.height;
        }
      } else if (dragMode.includes("s")) {
        const proposedH = newH + dy;
        if (proposedH >= minSize && newY + proposedH <= maxH) {
          newH = proposedH;
        } else if (newY + proposedH > maxH) {
          newH = maxH - newY;
        }
      }

      if (dragMode.includes("w")) {
        const proposedX = newX + dx;
        const proposedW = newW - dx;
        if (proposedW >= minSize && proposedX >= 0) {
          newX = proposedX;
          newW = proposedW;
        } else if (proposedX < 0) {
          newX = 0;
          newW = initialCrop.x + initialCrop.width;
        }
      } else if (dragMode.includes("e")) {
        const proposedW = newW + dx;
        if (proposedW >= minSize && newX + proposedW <= maxW) {
          newW = proposedW;
        } else if (newX + proposedW > maxW) {
          newW = maxW - newX;
        }
      }
    }

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      setCropArea({ x: newX, y: newY, width: newW, height: newH });
      rafRef.current = null;
    });

  }, [dragMode, dragStart]);

  const handleDragEnd = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setDragMode(null);
    setDragStart(null);
  }, []);

  useEffect(() => {
    if (dragMode) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleDragMove, { passive: false });
      window.addEventListener("touchend", handleDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleDragMove);
        window.removeEventListener("mouseup", handleDragEnd);
        window.removeEventListener("touchmove", handleDragMove);
        window.removeEventListener("touchend", handleDragEnd);
      };
    }
  }, [dragMode, handleDragMove, handleDragEnd]);

  const applyCrop = () => {
    if (!cropArea || !imageRef.current || !canvasRef.current) return;

    const img = imageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    canvas.width = cropArea.width * scaleX;
    canvas.height = cropArea.height * scaleY;

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

    canvas.toBlob((blob) => {
      if (blob) {
        const url = createSafeObjectURL(blob);
        setImage(prev => {
          if (prev && prev !== originalImage) revokeSafeObjectURL(prev);
          return url;
        });
        setIsCropping(false);
        setCropArea(null);
      }
    }, "image/png");
  };

  const downloadImage = () => {
    if (!image) return;
    const dateStamp = new Date().toLocaleDateString('en-CA');
    const link = document.createElement("a");
    link.href = image;
    link.download = `delphitools-paste-image-${dateStamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetImage = () => {
    if (image && image !== originalImage) revokeSafeObjectURL(image);
    setImage(originalImage);
    setIsCropping(false);
    setCropArea(null);
  };

  const clearImage = () => {
    if (image) revokeSafeObjectURL(image);
    if (originalImage && originalImage !== image) revokeSafeObjectURL(originalImage);
    
    setImage(null);
    setOriginalImage(null);
    setIsCropping(false);
    setCropArea(null);
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {!image ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/50 transition-colors flex flex-col items-center justify-center min-h-[50vh] bg-muted/10">
          <ClipboardPaste className="size-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Press <kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">Ctrl</kbd>/<kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">Cmd</kbd> + <kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">V</kbd> to paste
          </h2>
          <p className="text-muted-foreground">
            Copy any image to your clipboard and paste it directly here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!isCropping ? (
              <Button onClick={startCropping} variant="secondary" size="sm">
                <Scissors className="size-4 mr-2" /> Crop
              </Button>
            ) : (
              <>
                <Button onClick={applyCrop} size="sm">
                  <Check className="size-4 mr-2" /> Apply Crop
                </Button>
                <Button onClick={() => { setIsCropping(false); setCropArea(null); }} variant="outline" size="sm">
                  Cancel
                </Button>
              </>
            )}

            {!isCropping && (
              <>
                {image !== originalImage && (
                  <Button onClick={resetImage} variant="outline" size="sm">
                    <RotateCcw className="size-4 mr-2" /> Reset
                  </Button>
                )}
                <Button onClick={downloadImage} size="sm">
                  <Download className="size-4 mr-2" /> Download PNG
                </Button>
                <div className="flex-1" />
                <Button onClick={clearImage} variant="ghost" size="sm">
                  <X className="size-4 mr-2" /> Clear
                </Button>
              </>
            )}
          </div>

          <div className="flex justify-center bg-muted/30 rounded-xl border p-4 min-h-[50vh] overflow-hidden">
            <div
              ref={containerRef}
              className="relative inline-block touch-none select-none"
            >
              <img
                ref={imageRef}
                src={image}
                alt="Pasted content"
                className="max-w-full max-h-[70vh] rounded shadow-sm pointer-events-none"
                draggable={false}
              />

              {isCropping && cropArea && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: cropArea.x,
                    top: cropArea.y,
                    width: cropArea.width,
                    height: cropArea.height,
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)",
                  }}
                >
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 border border-white/50">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="border border-white/30" />
                    ))}
                  </div>

                  <div
                    className="absolute inset-0 pointer-events-auto cursor-move"
                    onMouseDown={(e) => handleDragStart(e, "move")}
                    onTouchStart={(e) => handleDragStart(e, "move")}
                  />

                  <div className="absolute top-0 left-0 right-0 h-2 -translate-y-1/2 pointer-events-auto cursor-ns-resize" onMouseDown={(e) => handleDragStart(e, "n")} onTouchStart={(e) => handleDragStart(e, "n")} />
                  <div className="absolute bottom-0 left-0 right-0 h-2 translate-y-1/2 pointer-events-auto cursor-ns-resize" onMouseDown={(e) => handleDragStart(e, "s")} onTouchStart={(e) => handleDragStart(e, "s")} />
                  <div className="absolute top-0 bottom-0 left-0 w-2 -translate-x-1/2 pointer-events-auto cursor-ew-resize" onMouseDown={(e) => handleDragStart(e, "w")} onTouchStart={(e) => handleDragStart(e, "w")} />
                  <div className="absolute top-0 bottom-0 right-0 w-2 translate-x-1/2 pointer-events-auto cursor-ew-resize" onMouseDown={(e) => handleDragStart(e, "e")} onTouchStart={(e) => handleDragStart(e, "e")} />

                  <div className="absolute top-0 left-0 w-4 h-4 bg-white border border-border -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-nwse-resize shadow-md" onMouseDown={(e) => handleDragStart(e, "nw")} onTouchStart={(e) => handleDragStart(e, "nw")} />
                  <div className="absolute top-0 right-0 w-4 h-4 bg-white border border-border translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-nesw-resize shadow-md" onMouseDown={(e) => handleDragStart(e, "ne")} onTouchStart={(e) => handleDragStart(e, "ne")} />
                  <div className="absolute bottom-0 left-0 w-4 h-4 bg-white border border-border -translate-x-1/2 translate-y-1/2 pointer-events-auto cursor-nesw-resize shadow-md" onMouseDown={(e) => handleDragStart(e, "sw")} onTouchStart={(e) => handleDragStart(e, "sw")} />
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-white border border-border translate-x-1/2 translate-y-1/2 pointer-events-auto cursor-nwse-resize shadow-md" onMouseDown={(e) => handleDragStart(e, "se")} onTouchStart={(e) => handleDragStart(e, "se")} />

                  {cropArea.width > 50 && cropArea.height > 30 && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground font-mono text-sm px-2 py-1 rounded shadow-sm whitespace-nowrap">
                      {Math.round(cropArea.width * imageScale.x)}
                      {" × "}
                      {Math.round(cropArea.height * imageScale.y)} px
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Contributed by{" "}
        <a href="https://github.com/himanshubalani" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          @himanshubalani
        </a>
      </p>
    </div>
  );
}
