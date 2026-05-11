"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, Move, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useFilePaste } from "@/hooks/use-file-paste";

interface Platform {
  name: string;
  ratios: { name: string; label: string; width: number; height: number }[];
}

const platforms: Platform[] = [
  {
    name: "Instagram",
    ratios: [
      { name: "Square", label: "1:1", width: 1, height: 1 },
      { name: "Portrait", label: "4:5", width: 4, height: 5 },
      { name: "Landscape", label: "1.91:1", width: 1.91, height: 1 },
      { name: "Reels", label: "9:16", width: 9, height: 16 },
    ],
  },
  {
    name: "Bluesky",
    ratios: [
      { name: "Square", label: "1:1", width: 1, height: 1 },
      { name: "Landscape", label: "16:9", width: 16, height: 9 },
      { name: "Portrait", label: "3:4", width: 3, height: 4 },
      { name: "Wide", label: "2:1", width: 2, height: 1 },
    ],
  },
  {
    name: "Threads",
    ratios: [
      { name: "Square", label: "1:1", width: 1, height: 1 },
      { name: "Portrait", label: "4:5", width: 4, height: 5 },
      { name: "Landscape", label: "1.91:1", width: 1.91, height: 1 },
      { name: "Stories", label: "9:16", width: 9, height: 16 },
    ],
  },
];

export function SocialCropperTool() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selectedPlatform, setSelectedPlatform] = useState(0);
  const [selectedRatio, setSelectedRatio] = useState(0);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const currentRatio = platforms[selectedPlatform].ratios[selectedRatio];
  const aspectRatio = currentRatio.width / currentRatio.height;

  const readFile = (file: File) => {
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setSourceImage(dataUrl);
        setCropOffset({ x: 0, y: 0 });
        setCroppedImage(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  useFilePaste(readFile, "image/*");

  const getCropDimensions = useCallback(() => {
    if (!imageSize.width || !imageSize.height) return { width: 0, height: 0 };

    const imgAspect = imageSize.width / imageSize.height;

    if (aspectRatio > imgAspect) {
      return { width: imageSize.width, height: imageSize.width / aspectRatio };
    }
    return { width: imageSize.height * aspectRatio, height: imageSize.height };
  }, [imageSize, aspectRatio]);

  useEffect(() => {
    setCropOffset({ x: 0, y: 0 });
    setCroppedImage(null);
  }, [selectedPlatform, selectedRatio]);

  const constrainOffset = useCallback(
    (offset: { x: number; y: number }) => {
      const crop = getCropDimensions();
      const maxX = Math.max(0, imageSize.width - crop.width);
      const maxY = Math.max(0, imageSize.height - crop.height);

      return {
        x: Math.max(0, Math.min(maxX, offset.x)),
        y: Math.max(0, Math.min(maxY, offset.y)),
      };
    },
    [getCropDimensions, imageSize]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - cropOffset.x, y: touch.clientY - cropOffset.y });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !previewRef.current) return;

      const rect = previewRef.current.getBoundingClientRect();
      const scale = imageSize.width / rect.width;

      const newOffset = {
        x: (e.clientX - dragStart.x) * scale,
        y: (e.clientY - dragStart.y) * scale,
      };

      setCropOffset(constrainOffset(newOffset));
    },
    [isDragging, dragStart, imageSize.width, constrainOffset]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !previewRef.current) return;
      e.preventDefault();

      const touch = e.touches[0];
      const rect = previewRef.current.getBoundingClientRect();
      const scale = imageSize.width / rect.width;

      const newOffset = {
        x: (touch.clientX - dragStart.x) * scale,
        y: (touch.clientY - dragStart.y) * scale,
      };

      setCropOffset(constrainOffset(newOffset));
    },
    [isDragging, dragStart, imageSize.width, constrainOffset]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const cropImage = useCallback(() => {
    if (!sourceImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const crop = getCropDimensions();
      canvas.width = crop.width;
      canvas.height = crop.height;

      ctx.drawImage(
        img,
        cropOffset.x,
        cropOffset.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
      );

      setCroppedImage(canvas.toDataURL("image/png"));
    };
    img.src = sourceImage;
  }, [sourceImage, getCropDimensions, cropOffset]);

  useEffect(() => {
    if (sourceImage) {
      cropImage();
    }
  }, [sourceImage, cropImage]);

  const downloadCropped = () => {
    if (!croppedImage) return;
    const link = document.createElement("a");
    link.download = `${fileName}-${platforms[selectedPlatform].name.toLowerCase()}-${currentRatio.label}.png`;
    link.href = croppedImage;
    link.click();
  };

  const clear = () => {
    setSourceImage(null);
    setFileName("");
    setImageSize({ width: 0, height: 0 });
    setCropOffset({ x: 0, y: 0 });
    setCroppedImage(null);
  };

  const crop = getCropDimensions();

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Drop Zone */}
      {!sourceImage && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("cropper-input")?.click()}
        >
          <input
            id="cropper-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop image here</p>
          <p className="text-sm text-muted-foreground mt-1">
            PNG, JPG, or any image format, or paste
          </p>
        </div>
      )}

      {/* Main workspace */}
      {sourceImage && (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          {/* Controls */}
          <div className="space-y-5 min-w-0">
            {/* Source info bar */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <ImageIcon className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{fileName}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {imageSize.width} × {imageSize.height}
              </span>
              <Button variant="ghost" size="sm" onClick={clear} className="ml-auto shrink-0">
                <Trash2 className="size-4" />
              </Button>
            </div>

            {/* Platform */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Platform</label>
              <Tabs value={String(selectedPlatform)} onValueChange={(v) => { setSelectedPlatform(Number(v)); setSelectedRatio(0); }}>
                <TabsList>
                  {platforms.map((p, i) => (
                    <TabsTrigger key={p.name} value={String(i)}>{p.name}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Ratio</label>
              <Tabs value={String(selectedRatio)} onValueChange={(v) => setSelectedRatio(Number(v))}>
                <TabsList className="flex-wrap h-auto gap-1">
                  {platforms[selectedPlatform].ratios.map((ratio, i) => (
                    <TabsTrigger key={ratio.name} value={String(i)} className="text-xs">
                      {ratio.label} {ratio.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Crop preview */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Move className="size-3.5" /> Drag to reposition
              </label>
              <div
                ref={previewRef}
                className={cn(
                  "relative inline-block cursor-move select-none overflow-hidden rounded-lg touch-none ring-1 ring-border",
                  isDragging && "cursor-grabbing"
                )}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
              >
                <img
                  src={sourceImage}
                  alt="Source"
                  className="max-w-full max-h-96 pointer-events-none"
                  draggable={false}
                />
                <div
                  className="absolute border-2 border-white pointer-events-none"
                  style={{
                    left: `${(cropOffset.x / imageSize.width) * 100}%`,
                    top: `${(cropOffset.y / imageSize.height) * 100}%`,
                    width: `${(crop.width / imageSize.width) * 100}%`,
                    height: `${(crop.height / imageSize.height) * 100}%`,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                  }}
                >
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="border border-white/20" />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Crop stats */}
            <div className="flex gap-6 text-sm text-muted-foreground">
              <span>Crop: {Math.round(crop.width)} × {Math.round(crop.height)} px</span>
              <span>Offset: {Math.round(cropOffset.x)}, {Math.round(cropOffset.y)}</span>
            </div>

            {/* Download */}
            {croppedImage && (
              <Button size="lg" className="w-full" onClick={downloadCropped}>
                <Download className="size-4 mr-2" />
                Download for {platforms[selectedPlatform].name}
              </Button>
            )}
          </div>

          {/* Result preview */}
          {croppedImage && (
            <div className="flex flex-col items-center gap-3">
              <label className="text-sm font-medium text-muted-foreground self-start">Result</label>
              <div className="rounded-lg overflow-hidden shadow-lg ring-1 ring-border">
                <img
                  src={croppedImage}
                  alt="Cropped"
                  className="max-h-[280px] w-auto"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {Math.round(crop.width)} × {Math.round(crop.height)} px
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
