"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Platform {
  name: string;
  ratios: { name: string; width: number; height: number }[];
}

const platforms: Platform[] = [
  {
    name: "Instagram",
    ratios: [
      { name: "Square (1:1)", width: 1, height: 1 },
      { name: "Portrait (4:5)", width: 4, height: 5 },
      { name: "Landscape (1.91:1)", width: 1.91, height: 1 },
      { name: "Stories/Reels (9:16)", width: 9, height: 16 },
    ],
  },
  {
    name: "Bluesky",
    ratios: [
      { name: "Square (1:1)", width: 1, height: 1 },
      { name: "Landscape (16:9)", width: 16, height: 9 },
      { name: "Portrait (3:4)", width: 3, height: 4 },
      { name: "Wide (2:1)", width: 2, height: 1 },
    ],
  },
  {
    name: "Threads",
    ratios: [
      { name: "Square (1:1)", width: 1, height: 1 },
      { name: "Portrait (4:5)", width: 4, height: 5 },
      { name: "Landscape (1.91:1)", width: 1.91, height: 1 },
      { name: "Stories (9:16)", width: 9, height: 16 },
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

  // Calculate crop dimensions based on image and aspect ratio
  const getCropDimensions = useCallback(() => {
    if (!imageSize.width || !imageSize.height) return { width: 0, height: 0 };

    const imgAspect = imageSize.width / imageSize.height;

    let cropWidth: number;
    let cropHeight: number;

    if (aspectRatio > imgAspect) {
      // Crop is wider than image - fit to width
      cropWidth = imageSize.width;
      cropHeight = imageSize.width / aspectRatio;
    } else {
      // Crop is taller than image - fit to height
      cropHeight = imageSize.height;
      cropWidth = imageSize.height * aspectRatio;
    }

    return { width: cropWidth, height: cropHeight };
  }, [imageSize, aspectRatio]);

  // Reset crop offset when ratio changes
  useEffect(() => {
    setCropOffset({ x: 0, y: 0 });
    setCroppedImage(null);
  }, [selectedPlatform, selectedRatio]);

  // Constrain crop offset to valid bounds
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

  const cropImage = () => {
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
  };

  const downloadCropped = () => {
    if (!croppedImage) return;
    const link = document.createElement("a");
    link.download = `${fileName}-${platforms[selectedPlatform].name.toLowerCase()}-${currentRatio.name.split(" ")[0].toLowerCase()}.png`;
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
          className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
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
            PNG, JPG, or any image format
          </p>
        </div>
      )}

      {/* Source Preview & Settings */}
      {sourceImage && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <label className="font-bold">Source Image</label>
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="size-4 mr-2" /> Clear
            </Button>
          </div>

          {/* Platform Selection */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Platform</label>
            <div className="flex flex-wrap gap-2">
              {platforms.map((platform, i) => (
                <button
                  key={platform.name}
                  onClick={() => {
                    setSelectedPlatform(i);
                    setSelectedRatio(0);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-lg border transition-colors",
                    selectedPlatform === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:border-primary/50"
                  )}
                >
                  {platform.name}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio Selection */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Aspect Ratio</label>
            <div className="flex flex-wrap gap-2">
              {platforms[selectedPlatform].ratios.map((ratio, i) => (
                <button
                  key={ratio.name}
                  onClick={() => setSelectedRatio(i)}
                  className={cn(
                    "px-4 py-2 rounded-lg border transition-colors",
                    selectedRatio === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:border-primary/50"
                  )}
                >
                  {ratio.name}
                </button>
              ))}
            </div>
          </div>

          {/* Preview with crop overlay */}
          <div className="space-y-2">
            <label className="font-bold text-sm flex items-center gap-2">
              <Move className="size-4" /> Drag to reposition crop
            </label>
            <div
              ref={previewRef}
              className="relative inline-block cursor-move select-none overflow-hidden rounded touch-none"
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              <img
                src={sourceImage}
                alt="Source"
                className="max-w-full max-h-96 pointer-events-none"
                draggable={false}
              />
              {/* Crop window - box-shadow creates the darkened overlay outside */}
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
                {/* Grid lines */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border border-white/30" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Crop Info */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="font-bold text-sm">Original Size</label>
              <div className="text-muted-foreground">
                {imageSize.width} × {imageSize.height} px
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-bold text-sm">Crop Size</label>
              <div className="text-muted-foreground">
                {Math.round(crop.width)} × {Math.round(crop.height)} px
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-bold text-sm">Position</label>
              <div className="text-muted-foreground">
                {Math.round(cropOffset.x)}, {Math.round(cropOffset.y)}
              </div>
            </div>
          </div>

          <Button size="lg" className="w-full h-14" onClick={cropImage}>
            Crop for {platforms[selectedPlatform].name}
          </Button>
        </div>
      )}

      {/* Cropped Result */}
      {croppedImage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-bold">Cropped Image</label>
            <Button onClick={downloadCropped}>
              <Download className="size-4 mr-2" /> Download
            </Button>
          </div>
          <div className="rounded border bg-card p-4 flex justify-center">
            <img
              src={croppedImage}
              alt="Cropped"
              className="max-w-full max-h-80 rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
