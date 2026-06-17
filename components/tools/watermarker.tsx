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
      <div className="border-2 border-border">
        <div className="grid grid-cols-2 border-b border-border">
          {/* Base Image */}
          <div className="border-r border-border">
            <div className="px-4 py-3 border-b border-border">
              <label className="font-bold text-sm">Base Image</label>
            </div>
            {!baseImage ? (
              <div
                onDrop={handleBaseDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border m-4 p-6 text-center hover:border-primary/50 transition-colors cursor-pointer h-36 flex flex-col items-center justify-center"
                onClick={() => document.getElementById("base-input")?.click()}
              >
                <input
                  id="base-input"
                  type="file"
                  accept="image/*"
                  onChange={handleBaseSelect}
                  className="hidden"
                />
                <Upload className="size-7 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drop image here</p>
                <p className="text-xs text-muted-foreground mt-0.5">or click to select</p>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={baseImage}
                  alt="Base"
                  className="w-full h-44 object-contain bg-muted/30"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between min-h-8 bg-black/50">
                  <span
                    className="text-xs text-white/80 px-2"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {baseSize.width} × {baseSize.height}
                  </span>
                  <button
                    onClick={() => { setBaseImage(null); setResultImage(null); }}
                    className="flex items-center justify-center w-8 h-8 text-white/70 hover:text-white hover:bg-black/40 transition-colors border-l border-white/20"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Watermark */}
          <div>
            <div className="px-4 py-3 border-b border-border">
              <label className="font-bold text-sm">Watermark (PNG)</label>
            </div>
            {!watermark ? (
              <div
                onDrop={handleWatermarkDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border m-4 p-6 text-center hover:border-primary/50 transition-colors cursor-pointer h-36 flex flex-col items-center justify-center"
                onClick={() => document.getElementById("watermark-input")?.click()}
              >
                <input
                  id="watermark-input"
                  type="file"
                  accept="image/png"
                  onChange={handleWatermarkSelect}
                  className="hidden"
                />
                <Upload className="size-7 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drop watermark here</p>
                <p className="text-xs text-muted-foreground mt-0.5">transparent PNG</p>
              </div>
            ) : (
              <div className="relative">
                <div
                  className="w-full h-44 flex items-center justify-center"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                  }}
                >
                  <img
                    src={watermark}
                    alt="Watermark"
                    className="max-w-full max-h-full object-contain p-4"
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between min-h-8 bg-black/50">
                  <span
                    className="text-xs text-white/80 px-2"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {watermarkSize.width} × {watermarkSize.height}
                  </span>
                  <button
                    onClick={() => { setWatermark(null); setResultImage(null); }}
                    className="flex items-center justify-center w-8 h-8 text-white/70 hover:text-white hover:bg-black/40 transition-colors border-l border-white/20"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hint row when neither image loaded */}
        {!baseImage && !watermark && (
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Paste an image to load it directly.</p>
          </div>
        )}
      </div>

      {/* Settings & Preview */}
      {bothLoaded && (
        <div className="border-2 border-border">
          {/* Position */}
          <div className="border-b-2 border-border">
            <div className="px-4 pt-4 pb-2">
              <label className="font-bold block mb-3">Position</label>
              <div className="flex items-center gap-3">
                {/* 3×3 grid */}
                <div className="segmented grid-cols-3 shrink-0" style={{ width: "9rem" }}>
                  {positions.map((pos) => (
                    <Button
                      key={pos.id}
                      variant={position === pos.id && position !== "random" ? "default" : "outline"}
                      onClick={() => { setPosition(pos.id); setResultImage(null); }}
                      className="h-12 text-base font-medium"
                    >
                      {pos.label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant={position === "random" ? "default" : "outline"}
                  size="sm"
                  onClick={generateRandomPosition}
                  className="gap-1.5"
                >
                  <Shuffle className="size-3.5" />
                  Random
                </Button>
              </div>
            </div>
          </div>

          {/* Sliders section */}
          <div className="border-b-2 border-border">
            {/* Opacity */}
            <div className="flex items-center border-b border-border">
              <span className="w-24 shrink-0 px-4 py-4 font-bold text-sm">Opacity</span>
              <div className="flex-1 px-4 py-4">
                <Slider
                  value={[opacity]}
                  onValueChange={([v]) => setOpacity(v)}
                  min={5}
                  max={100}
                  step={5}
                />
              </div>
              <span
                className="w-16 shrink-0 px-4 py-4 text-sm text-right text-muted-foreground border-l border-border"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {opacity}%
              </span>
            </div>

            {/* Scale */}
            <div className="flex items-center border-b border-border">
              <span className="w-24 shrink-0 px-4 py-4 font-bold text-sm">Size</span>
              <div className="flex-1 px-4 py-4">
                <Slider
                  value={[scale]}
                  onValueChange={([v]) => setScale(v)}
                  min={5}
                  max={50}
                  step={5}
                />
              </div>
              <span
                className="w-16 shrink-0 px-4 py-4 text-sm text-right text-muted-foreground border-l border-border"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {scale}%
              </span>
            </div>

            {/* Padding */}
            <div className="flex items-center">
              <span className="w-24 shrink-0 px-4 py-4 font-bold text-sm">Padding</span>
              <div className="flex-1 px-4 py-4">
                <Slider
                  value={[padding]}
                  onValueChange={([v]) => setPadding(v)}
                  min={0}
                  max={20}
                  step={1}
                />
              </div>
              <span
                className="w-16 shrink-0 px-4 py-4 text-sm text-right text-muted-foreground border-l border-border"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {padding}%
              </span>
            </div>
          </div>

          {/* Blend Mode */}
          <div className="border-b-2 border-border p-4">
            <label className="font-bold block mb-3">Blend Mode</label>
            <Tabs value={blendMode} onValueChange={(v) => setBlendMode(v as BlendMode)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="normal">Normal</TabsTrigger>
                <TabsTrigger value="multiply">Multiply</TabsTrigger>
                <TabsTrigger value="screen">Screen</TabsTrigger>
                <TabsTrigger value="overlay">Overlay</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Preview */}
          {resultImage && (
            <div className="border-b-2 border-border">
              <div className="px-4 py-3 border-b border-border">
                <label className="font-bold text-sm">Preview</label>
              </div>
              <div className="bg-muted/30">
                <img
                  src={resultImage}
                  alt="Result"
                  className="w-full object-contain max-h-96"
                />
              </div>
              <div className="px-4 py-2 border-t border-border">
                <span
                  className="text-xs text-muted-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {baseSize.width} × {baseSize.height} px
                </span>
              </div>
            </div>
          )}

          {/* Actions bar */}
          <div className="flex items-stretch min-h-14">
            <Button
              onClick={downloadResult}
              disabled={!resultImage}
              className={cn(
                "flex-1 h-auto self-stretch text-lg font-bold gap-2",
                "rounded-none border-0"
              )}
            >
              <Download className="size-4" />
              Download
            </Button>
            <Button
              variant="outline"
              onClick={clear}
              className="h-auto self-stretch rounded-none border-0 border-l border-border px-5 gap-2"
            >
              <Trash2 className="size-4" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
