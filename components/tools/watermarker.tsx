"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [scale, setScale] = useState(20);
  const [padding, setPadding] = useState(5);
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
    if (file) readBaseFile(file);
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
    if (file) readWatermarkFile(file);
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

      ctx.drawImage(baseImg, 0, 0);

      const wmWidth = (baseImg.width * scale) / 100;
      const wmHeight = (watermarkImg.height / watermarkImg.width) * wmWidth;

      const padX = (baseImg.width * padding) / 100;
      const padY = (baseImg.height * padding) / 100;

      let x = 0;
      let y = 0;

      if (position === "random") {
        x = padX + randomPos.x * (baseImg.width - wmWidth - padX * 2);
        y = padY + randomPos.y * (baseImg.height - wmHeight - padY * 2);
      } else {
        const col = position[1];
        const row = position[0];

        if (col === "l") x = padX;
        else if (col === "c") x = (baseImg.width - wmWidth) / 2;
        else if (col === "r") x = baseImg.width - wmWidth - padX;

        if (row === "t") y = padY;
        else if (row === "m") y = (baseImg.height - wmHeight) / 2;
        else if (row === "b") y = baseImg.height - wmHeight - padY;
      }

      ctx.globalAlpha = opacity / 100;
      ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;

      ctx.drawImage(watermarkImg, x, y, wmWidth, wmHeight);

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

  const bothLoaded = baseImage && watermark;

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Upload Areas */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Base Image */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Base Image</label>
          {!baseImage ? (
            <div
              onDrop={handleBaseDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer h-44 flex flex-col items-center justify-center"
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
              <p className="text-xs text-muted-foreground mt-1">or click to select</p>
            </div>
          ) : (
            <div className="relative group rounded-lg overflow-hidden ring-1 ring-border">
              <img
                src={baseImage}
                alt="Base"
                className="w-full h-44 object-contain bg-muted/30"
              />
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between">
                <span className="text-xs text-white/80">{baseSize.width} × {baseSize.height}</span>
                <button
                  onClick={() => { setBaseImage(null); setResultImage(null); }}
                  className="p-1.5 rounded-md bg-black/40 text-white hover:bg-black/60 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Watermark */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Watermark (PNG)</label>
          {!watermark ? (
            <div
              onDrop={handleWatermarkDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer h-44 flex flex-col items-center justify-center"
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
              <p className="text-xs text-muted-foreground mt-1">transparent PNG</p>
            </div>
          ) : (
            <div className="relative group rounded-lg overflow-hidden ring-1 ring-border">
              <div className="w-full h-44 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex items-center justify-center">
                <img
                  src={watermark}
                  alt="Watermark"
                  className="max-w-full max-h-full object-contain p-4"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between">
                <span className="text-xs text-white/80">{watermarkSize.width} × {watermarkSize.height}</span>
                <button
                  onClick={() => { setWatermark(null); setResultImage(null); }}
                  className="p-1.5 rounded-md bg-black/40 text-white hover:bg-black/60 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings & Preview */}
      {bothLoaded && (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          {/* Controls */}
          <div className="space-y-5 min-w-0">
            {/* Position */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Position</label>
              <div className="flex items-center gap-3">
                <div className="grid grid-cols-3 gap-1">
                  {positions.map((pos) => (
                    <button
                      key={pos.id}
                      onClick={() => { setPosition(pos.id); setResultImage(null); }}
                      className={cn(
                        "size-9 rounded-md border transition-colors text-base",
                        position === pos.id && position !== "random"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:border-primary/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
                <Button
                  variant={position === "random" ? "default" : "outline"}
                  size="sm"
                  onClick={generateRandomPosition}
                >
                  <Shuffle className="size-3.5 mr-1.5" />
                  Random
                </Button>
              </div>
            </div>

            {/* Opacity */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Opacity</label>
                <span className="text-sm tabular-nums text-muted-foreground">{opacity}%</span>
              </div>
              <Slider
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                min={5}
                max={100}
                step={5}
              />
            </div>

            {/* Scale */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Size</label>
                <span className="text-sm tabular-nums text-muted-foreground">{scale}%</span>
              </div>
              <Slider
                value={[scale]}
                onValueChange={([v]) => setScale(v)}
                min={5}
                max={50}
                step={5}
              />
            </div>

            {/* Padding */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Padding</label>
                <span className="text-sm tabular-nums text-muted-foreground">{padding}%</span>
              </div>
              <Slider
                value={[padding]}
                onValueChange={([v]) => setPadding(v)}
                min={0}
                max={20}
                step={1}
              />
            </div>

            {/* Blend Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Blend Mode</label>
              <Tabs value={blendMode} onValueChange={(v) => setBlendMode(v as BlendMode)}>
                <TabsList>
                  <TabsTrigger value="normal">Normal</TabsTrigger>
                  <TabsTrigger value="multiply">Multiply</TabsTrigger>
                  <TabsTrigger value="screen">Screen</TabsTrigger>
                  <TabsTrigger value="overlay">Overlay</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" onClick={downloadResult} disabled={!resultImage}>
                <Download className="size-4 mr-2" />
                Download
              </Button>
              <Button variant="outline" size="lg" onClick={clear}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {/* Live Preview */}
          {resultImage && (
            <div className="flex flex-col items-center gap-3">
              <label className="text-sm font-medium text-muted-foreground self-start">Preview</label>
              <div className="rounded-lg overflow-hidden shadow-lg ring-1 ring-border">
                <img
                  src={resultImage}
                  alt="Result"
                  className="max-w-[320px] max-h-[320px] w-auto"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {baseSize.width} × {baseSize.height} px
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
