"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, ImageIcon, Layers, Square, Blend, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useFilePaste } from "@/hooks/use-file-paste";

type MatteType = "blur" | "color" | "gradient";

const RATIO_PRESETS = [
  { label: "1:1", w: 1, h: 1, description: "Square" },
  { label: "4:5", w: 4, h: 5, description: "Portrait" },
  { label: "3:4", w: 3, h: 4, description: "Photo" },
  { label: "9:16", w: 9, h: 16, description: "Stories" },
] as const;

const SIZE_PRESETS = [1080, 1200, 1440, 2048] as const;

const MAX_PREVIEW = 280;

const STYLE_OPTIONS: { type: MatteType; label: string; icon: typeof Layers }[] = [
  { type: "blur", label: "Blurred", icon: Layers },
  { type: "color", label: "Solid", icon: Square },
  { type: "gradient", label: "Gradient", icon: Blend },
];

const presetColors = [
  "#ffffff",
  "#000000",
  "#f5f5f5",
  "#1a1a1a",
  "#fafafa",
  "#0a0a0a",
];

export function MatteGeneratorTool() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [matteType, setMatteType] = useState<MatteType>("blur");
  const [matteColor, setMatteColor] = useState("#ffffff");
  const [outputSize, setOutputSize] = useState(1080);
  const [customSize, setCustomSize] = useState("");
  const [ratioW, setRatioW] = useState(1);
  const [ratioH, setRatioH] = useState(1);
  const [customRatio, setCustomRatio] = useState(false);
  const [padding, setPadding] = useState(40);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [dominantColor, setDominantColor] = useState<string>("#888888");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getOutputDimensions = () => {
    const w = outputSize;
    const h = Math.round(outputSize * ratioH / ratioW);
    return { width: w, height: h };
  };

  useEffect(() => {
    if (!sourceImage) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, 1, 1);
        const pixel = ctx.getImageData(0, 0, 1, 1).data;
        setDominantColor(`rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`);
      }
    };
    img.src = sourceImage;
  }, [sourceImage]);

  const readFile = (file: File) => {
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setSourceImage(dataUrl);
        setResultImage(null);
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

  const adjustBrightness = (color: string, amount: number): string => {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return color;
    const r = Math.max(0, Math.min(255, parseInt(match[1]) + amount));
    const g = Math.max(0, Math.min(255, parseInt(match[2]) + amount));
    const b = Math.max(0, Math.min(255, parseInt(match[3]) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  };

  const generateMatte = useCallback(() => {
    if (!sourceImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dims = { width: outputSize, height: Math.round(outputSize * ratioH / ratioW) };

      canvas.width = dims.width;
      canvas.height = dims.height;

      if (matteType === "color") {
        ctx.fillStyle = matteColor;
        ctx.fillRect(0, 0, dims.width, dims.height);
      } else if (matteType === "blur") {
        ctx.filter = "blur(50px)";
        const scale = Math.max(
          dims.width / img.width,
          dims.height / img.height
        );
        const scaledWidth = img.width * scale * 1.2;
        const scaledHeight = img.height * scale * 1.2;
        ctx.drawImage(
          img,
          (dims.width - scaledWidth) / 2,
          (dims.height - scaledHeight) / 2,
          scaledWidth,
          scaledHeight
        );
        ctx.filter = "none";
      } else if (matteType === "gradient") {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.drawImage(img, 0, 0, 1, 1);
          const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
          const baseColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
          const gradient = ctx.createLinearGradient(0, 0, dims.width, dims.height);
          gradient.addColorStop(0, baseColor);
          gradient.addColorStop(1, adjustBrightness(baseColor, -30));
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, dims.width, dims.height);
        }
      }

      const availableWidth = dims.width - padding * 2;
      const availableHeight = dims.height - padding * 2;
      const scale = Math.min(
        availableWidth / img.width,
        availableHeight / img.height
      );
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const x = (dims.width - scaledWidth) / 2;
      const y = (dims.height - scaledHeight) / 2;

      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

      setResultImage(canvas.toDataURL("image/png"));
    };
    img.src = sourceImage;
  }, [sourceImage, matteType, matteColor, outputSize, ratioW, ratioH, padding]);

  useEffect(() => {
    if (sourceImage) {
      generateMatte();
    }
  }, [sourceImage, generateMatte]);

  const downloadResult = () => {
    if (!resultImage) return;
    const { width, height } = getOutputDimensions();
    const link = document.createElement("a");
    link.download = `${fileName}-matte-${width}x${height}.png`;
    link.href = resultImage;
    link.click();
  };

  const clear = () => {
    setSourceImage(null);
    setFileName("");
    setImageSize({ width: 0, height: 0 });
    setResultImage(null);
  };

  const selectPresetRatio = (w: number, h: number) => {
    setRatioW(w);
    setRatioH(h);
    setCustomRatio(false);
  };

  const swapRatio = () => {
    setRatioW(ratioH);
    setRatioH(ratioW);
  };

  const isPresetRatio = (w: number, h: number) =>
    !customRatio && ratioW === w && ratioH === h;

  const isSquare = ratioW === ratioH;
  const longerRatio = Math.max(ratioW, ratioH);
  const previewWidth = Math.round(MAX_PREVIEW * ratioW / longerRatio);
  const previewHeight = Math.round(MAX_PREVIEW * ratioH / longerRatio);
  const previewPaddingPx = (padding / outputSize) * previewWidth;

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Drop Zone */}
      {!sourceImage && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("matte-input")?.click()}
        >
          <input
            id="matte-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop image here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to select, or paste
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

            {/* Matte Style */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Style</label>
              <div className="flex gap-2">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => setMatteType(opt.type)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                      matteType === opt.type
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:border-primary/50"
                    )}
                  >
                    <opt.icon className="size-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Colour picker for solid color matte */}
            {matteType === "color" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Matte Colour</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setMatteColor(color)}
                      className={cn(
                        "size-9 rounded-lg border-2 transition-all",
                        matteColor === color
                          ? "border-primary ring-2 ring-primary/30 scale-110"
                          : "border-muted hover:border-primary/50"
                      )}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <div className="relative">
                    <input
                      type="color"
                      value={matteColor}
                      onChange={(e) => setMatteColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div
                      className="size-9 rounded-lg border-2 border-dashed border-muted flex items-center justify-center text-muted-foreground hover:border-primary/50 transition-colors text-sm"
                      title="Custom colour"
                    >
                      +
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Aspect Ratio</label>
              <div className="flex flex-wrap gap-2 items-center">
                {RATIO_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => selectPresetRatio(preset.w, preset.h)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm transition-colors",
                      isPresetRatio(preset.w, preset.h)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:border-primary/50"
                    )}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={() => setCustomRatio(true)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm transition-colors",
                    customRatio
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:border-primary/50"
                  )}
                >
                  Custom
                </button>
                <button
                  onClick={swapRatio}
                  disabled={isSquare}
                  className="p-1.5 rounded-lg border transition-colors hover:border-primary/50 disabled:opacity-40 disabled:pointer-events-none"
                  title={isSquare ? "Square — nothing to rotate" : `Rotate to ${ratioH}:${ratioW}`}
                  aria-label="Rotate matte orientation"
                >
                  <RotateCw className="size-4" />
                </button>
              </div>
              {customRatio && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={32}
                    value={ratioW}
                    onChange={(e) => setRatioW(Math.max(1, Math.min(32, parseInt(e.target.value) || 1)))}
                    className="w-20 font-mono text-center"
                  />
                  <span className="text-muted-foreground font-medium">:</span>
                  <Input
                    type="number"
                    min={1}
                    max={32}
                    value={ratioH}
                    onChange={(e) => setRatioH(Math.max(1, Math.min(32, parseInt(e.target.value) || 1)))}
                    className="w-20 font-mono text-center"
                  />
                </div>
              )}
            </div>

            {/* Output Width */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Output Width</label>
              <div className="flex flex-wrap gap-2 items-center">
                {SIZE_PRESETS.map((size) => (
                  <button
                    key={size}
                    onClick={() => { setOutputSize(size); setCustomSize(""); }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm transition-colors tabular-nums",
                      outputSize === size && !customSize
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:border-primary/50"
                    )}
                  >
                    {size}px
                  </button>
                ))}
                <Input
                  type="number"
                  min={100}
                  max={8192}
                  placeholder="Custom"
                  value={customSize}
                  onChange={(e) => {
                    setCustomSize(e.target.value);
                    const v = parseInt(e.target.value);
                    if (v >= 100 && v <= 8192) {
                      setOutputSize(v);
                    }
                  }}
                  className="w-28 font-mono text-sm"
                />
              </div>
            </div>

            {/* Padding */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Padding</label>
                <span className="text-sm tabular-nums text-muted-foreground">{padding}px</span>
              </div>
              <Slider
                value={[padding]}
                onValueChange={([v]) => setPadding(v)}
                min={0}
                max={200}
                step={10}
              />
            </div>

            {/* Download */}
            {resultImage && (
              <Button size="lg" className="w-full" onClick={downloadResult}>
                <Download className="size-4 mr-2" />
                Download {getOutputDimensions().width} × {getOutputDimensions().height}
              </Button>
            )}
          </div>

          {/* Live Preview */}
          <div className="flex flex-col items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground self-start">Preview</label>
            <div
              className="relative rounded-lg overflow-hidden shadow-lg ring-1 ring-border"
              style={{
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
                background:
                  matteType === "color"
                    ? matteColor
                    : matteType === "gradient"
                      ? `linear-gradient(135deg, ${dominantColor}, ${adjustBrightness(dominantColor, -30)})`
                      : undefined,
              }}
            >
              {matteType === "blur" && (
                <img
                  src={sourceImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover scale-125"
                  style={{ filter: "blur(20px)" }}
                />
              )}
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ padding: `${previewPaddingPx}px` }}
              >
                <img
                  src={sourceImage}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded-sm shadow-md"
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {getOutputDimensions().width} × {getOutputDimensions().height} px
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
