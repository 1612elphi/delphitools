"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useFilePaste } from "@/hooks/use-file-paste";

type Position = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br" | "random";
type BlendMode = "normal" | "multiply" | "screen" | "overlay";

const positions: { id: Position; label: string }[] = [
  { id: "tl", label: "↖" },
  { id: "tc", label: "↑" },
  { id: "tr", label: "↗" },
  { id: "ml", label: "←" },
  { id: "mc", label: "•" },
  { id: "mr", label: "→" },
  { id: "bl", label: "↙" },
  { id: "bc", label: "↓" },
  { id: "br", label: "↘" },
];

const blendModes: { id: BlendMode; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "multiply", label: "Multiply" },
  { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" },
];

export function WatermarkerTool() {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [watermark, setWatermark] = useState<string | null>(null);
  const [baseFileName, setBaseFileName] = useState("");
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 });
  const [watermarkSize, setWatermarkSize] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState<Position>("br");
  const [randomPos, setRandomPos] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(50);
  const [blendMode, setBlendMode] = useState<BlendMode>("normal");
  const [scale, setScale] = useState(20); // Watermark scale as % of image width
  const [padding, setPadding] = useState(5); // Padding as % of image
  const [resultImage, setResultImage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleBaseDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readBaseFile(file);
    }
  }, []);

  const handleBaseSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readBaseFile(file);
    }
  };

  const readBaseFile = (file: File) => {
    setBaseFileName(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setBaseSize({ width: img.width, height: img.height });
        setBaseImage(dataUrl);
        setResultImage(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleWatermarkDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readWatermarkFile(file);
    }
  }, []);

  const handleWatermarkSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readWatermarkFile(file);
    }
  };

  const readWatermarkFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setWatermarkSize({ width: img.width, height: img.height });
        setWatermark(dataUrl);
        setResultImage(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  useFilePaste((file: File) => {
    if (!baseImage) readBaseFile(file);
    else readWatermarkFile(file);
  }, "image/*");

  const generateRandomPosition = () => {
    setPosition("random");
    setRandomPos({
      x: Math.random(),
      y: Math.random(),
    });
    setResultImage(null);
  };

  // Auto-generate preview when settings change
  useEffect(() => {
    if (baseImage && watermark) {
      generateWatermark();
    }
  }, [baseImage, watermark, position, randomPos, opacity, blendMode, scale, padding]);

  const generateWatermark = () => {
    if (!baseImage || !watermark) return;

    const baseImg = new Image();
    const watermarkImg = new Image();

    let loadedCount = 0;
    const onLoad = () => {
      loadedCount++;
      if (loadedCount < 2) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = baseImg.width;
      canvas.height = baseImg.height;

      // Draw base image
      ctx.drawImage(baseImg, 0, 0);

      // Calculate watermark size
      const wmWidth = (baseImg.width * scale) / 100;
      const wmHeight = (watermarkImg.height / watermarkImg.width) * wmWidth;

      // Calculate padding
      const padX = (baseImg.width * padding) / 100;
      const padY = (baseImg.height * padding) / 100;

      // Calculate position
      let x = 0;
      let y = 0;

      if (position === "random") {
        x = padX + randomPos.x * (baseImg.width - wmWidth - padX * 2);
        y = padY + randomPos.y * (baseImg.height - wmHeight - padY * 2);
      } else {
        const col = position[1]; // l, c, r
        const row = position[0]; // t, m, b

        if (col === "l") x = padX;
        else if (col === "c") x = (baseImg.width - wmWidth) / 2;
        else if (col === "r") x = baseImg.width - wmWidth - padX;

        if (row === "t") y = padY;
        else if (row === "m") y = (baseImg.height - wmHeight) / 2;
        else if (row === "b") y = baseImg.height - wmHeight - padY;
      }

      // Apply blend mode and opacity
      ctx.globalAlpha = opacity / 100;
      ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;

      // Draw watermark
      ctx.drawImage(watermarkImg, x, y, wmWidth, wmHeight);

      // Reset
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      setResultImage(canvas.toDataURL("image/png"));
    };

    baseImg.onload = onLoad;
    watermarkImg.onload = onLoad;
    baseImg.src = baseImage;
    watermarkImg.src = watermark;
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement("a");
    link.download = `${baseFileName}-watermarked.png`;
    link.href = resultImage;
    link.click();
  };

  const clear = () => {
    setBaseImage(null);
    setWatermark(null);
    setBaseFileName("");
    setBaseSize({ width: 0, height: 0 });
    setWatermarkSize({ width: 0, height: 0 });
    setResultImage(null);
  };

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Upload Areas */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Base Image */}
        <div className="space-y-2">
          <label className="font-bold text-sm">Base Image</label>
          {!baseImage ? (
            <div
              onDrop={handleBaseDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer h-40 flex flex-col items-center justify-center"
              onClick={() => document.getElementById("base-input")?.click()}
            >
              <input
                id="base-input"
                type="file"
                accept="image/*"
                onChange={handleBaseSelect}
                className="hidden"
              />
              <Upload className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drop image here</p>
            </div>
          ) : (
            <div className="relative">
              <img
                src={baseImage}
                alt="Base"
                className="w-full h-40 object-contain rounded border bg-muted/30"
              />
              <button
                onClick={() => {
                  setBaseImage(null);
                  setResultImage(null);
                }}
                className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white hover:bg-black/70"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </div>

        {/* Watermark */}
        <div className="space-y-2">
          <label className="font-bold text-sm">Watermark (PNG)</label>
          {!watermark ? (
            <div
              onDrop={handleWatermarkDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer h-40 flex flex-col items-center justify-center"
              onClick={() => document.getElementById("watermark-input")?.click()}
            >
              <input
                id="watermark-input"
                type="file"
                accept="image/png"
                onChange={handleWatermarkSelect}
                className="hidden"
              />
              <Upload className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drop watermark here</p>
            </div>
          ) : (
            <div className="relative">
              <div className="w-full h-40 rounded border bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] flex items-center justify-center">
                <img
                  src={watermark}
                  alt="Watermark"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <button
                onClick={() => {
                  setWatermark(null);
                  setResultImage(null);
                }}
                className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white hover:bg-black/70"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings - only show when both images are loaded */}
      {baseImage && watermark && (
        <>
          {/* Position Grid */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Position</label>
            <div className="flex items-center gap-4">
              <div className="grid grid-cols-3 gap-1">
                {positions.map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => {
                      setPosition(pos.id);
                      setResultImage(null);
                    }}
                    className={cn(
                      "size-10 rounded border transition-colors text-lg",
                      position === pos.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:border-primary/50"
                    )}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
              <Button
                variant={position === "random" ? "default" : "outline"}
                onClick={generateRandomPosition}
                className="h-10"
              >
                <Shuffle className="size-4 mr-2" />
                Random
              </Button>
            </div>
          </div>

          {/* Opacity */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Opacity: {opacity}%</label>
            <Slider
              value={[opacity]}
              onValueChange={([v]) => setOpacity(v)}
              min={5}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* Scale */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Size: {scale}%</label>
            <Slider
              value={[scale]}
              onValueChange={([v]) => setScale(v)}
              min={5}
              max={50}
              step={5}
              className="w-full"
            />
          </div>

          {/* Blend Mode */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Blend Mode</label>
            <div className="flex flex-wrap gap-2">
              {blendModes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setBlendMode(mode.id)}
                  className={cn(
                    "px-4 py-2 rounded-lg border transition-colors",
                    blendMode === mode.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:border-primary/50"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {resultImage && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="font-bold">Preview</label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={clear}>
                    <Trash2 className="size-4 mr-2" /> Clear All
                  </Button>
                  <Button onClick={downloadResult}>
                    <Download className="size-4 mr-2" /> Download
                  </Button>
                </div>
              </div>
              <div className="rounded border bg-card p-4 flex justify-center">
                <img
                  src={resultImage}
                  alt="Result"
                  className="max-w-full max-h-96 rounded"
                />
              </div>
              <div className="text-sm text-muted-foreground text-center">
                {baseSize.width} × {baseSize.height} px
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
