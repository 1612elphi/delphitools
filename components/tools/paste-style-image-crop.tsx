"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PasteStyleCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PasteStyleDragMode =
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w"
  | "move"
  | null;

export function usePasteStyleImageCrop(opts: {
  imageRef: React.RefObject<HTMLImageElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCroppedBlob: (blob: Blob) => void;
}) {
  const { imageRef, canvasRef, onCroppedBlob } = opts;

  const [isCropping, setIsCropping] = useState(false);
  const [cropArea, setCropArea] = useState<PasteStyleCropArea | null>(null);
  const [dragMode, setDragMode] = useState<PasteStyleDragMode>(null);
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    initialCrop: PasteStyleCropArea;
  } | null>(null);
  const [imageScale, setImageScale] = useState({ x: 1, y: 1 });

  const rafRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const startCropping = useCallback(() => {
    const el = imageRef.current;
    if (el) {
      setCropArea({
        x: 0,
        y: 0,
        width: el.width,
        height: el.height,
      });
      setImageScale({
        x: el.naturalWidth / el.width,
        y: el.naturalHeight / el.height,
      });
      setIsCropping(true);
    }
  }, [imageRef]);

  const cancelCropping = useCallback(() => {
    setIsCropping(false);
    setCropArea(null);
  }, []);

  const handleDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    mode: PasteStyleDragMode,
  ) => {
    if (e.type !== "touchstart") {
      e.preventDefault();
    }
    e.stopPropagation();
    if (!cropArea) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    setDragMode(mode);
    setDragStart({
      mouseX: clientX,
      mouseY: clientY,
      initialCrop: { ...cropArea },
    });
  };

  const handleDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!dragMode || !dragStart || !imageRef.current) return;
      if (e.cancelable) e.preventDefault();

      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

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
    },
    [dragMode, dragStart, imageRef],
  );

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

  const applyCrop = useCallback(() => {
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
      canvas.height,
    );

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCroppedBlob(blob);
          setIsCropping(false);
          setCropArea(null);
        }
      },
      "image/png",
    );
  }, [canvasRef, cropArea, imageRef, onCroppedBlob]);

  return {
    isCropping,
    cropArea,
    imageScale,
    startCropping,
    cancelCropping,
    applyCrop,
    handleDragStart,
  };
}

export function PasteStyleCropOverlay({
  isCropping,
  cropArea,
  imageScale,
  onDragStart,
}: {
  isCropping: boolean;
  cropArea: PasteStyleCropArea | null;
  imageScale: { x: number; y: number };
  onDragStart: (
    e: React.MouseEvent | React.TouchEvent,
    mode: Exclude<PasteStyleDragMode, null>,
  ) => void;
}) {
  if (!isCropping || !cropArea) return null;

  return (
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
        onMouseDown={(e) => onDragStart(e, "move")}
        onTouchStart={(e) => onDragStart(e, "move")}
      />

      <div
        className="absolute top-0 left-0 right-0 h-2 -translate-y-1/2 pointer-events-auto cursor-ns-resize"
        onMouseDown={(e) => onDragStart(e, "n")}
        onTouchStart={(e) => onDragStart(e, "n")}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-2 translate-y-1/2 pointer-events-auto cursor-ns-resize"
        onMouseDown={(e) => onDragStart(e, "s")}
        onTouchStart={(e) => onDragStart(e, "s")}
      />
      <div
        className="absolute top-0 bottom-0 left-0 w-2 -translate-x-1/2 pointer-events-auto cursor-ew-resize"
        onMouseDown={(e) => onDragStart(e, "w")}
        onTouchStart={(e) => onDragStart(e, "w")}
      />
      <div
        className="absolute top-0 bottom-0 right-0 w-2 translate-x-1/2 pointer-events-auto cursor-ew-resize"
        onMouseDown={(e) => onDragStart(e, "e")}
        onTouchStart={(e) => onDragStart(e, "e")}
      />

      <div
        className="absolute top-0 left-0 w-4 h-4 bg-white border border-border -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-nwse-resize shadow-md"
        onMouseDown={(e) => onDragStart(e, "nw")}
        onTouchStart={(e) => onDragStart(e, "nw")}
      />
      <div
        className="absolute top-0 right-0 w-4 h-4 bg-white border border-border translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-nesw-resize shadow-md"
        onMouseDown={(e) => onDragStart(e, "ne")}
        onTouchStart={(e) => onDragStart(e, "ne")}
      />
      <div
        className="absolute bottom-0 left-0 w-4 h-4 bg-white border border-border -translate-x-1/2 translate-y-1/2 pointer-events-auto cursor-nesw-resize shadow-md"
        onMouseDown={(e) => onDragStart(e, "sw")}
        onTouchStart={(e) => onDragStart(e, "sw")}
      />
      <div
        className="absolute bottom-0 right-0 w-4 h-4 bg-white border border-border translate-x-1/2 translate-y-1/2 pointer-events-auto cursor-nwse-resize shadow-md"
        onMouseDown={(e) => onDragStart(e, "se")}
        onTouchStart={(e) => onDragStart(e, "se")}
      />

      {cropArea.width > 50 && cropArea.height > 30 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground font-mono text-sm px-2 py-1 rounded shadow-sm whitespace-nowrap">
          {Math.round(cropArea.width * imageScale.x)}
          {" × "}
          {Math.round(cropArea.height * imageScale.y)} px
        </div>
      )}
    </div>
  );
}
