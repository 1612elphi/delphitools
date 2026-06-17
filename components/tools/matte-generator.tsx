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

      <div className="border-2 border-border">

        {/* Drop Zone — shown before image loaded */}
        {!sourceImage && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed m-4 p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
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

        {/* Main workspace — image loaded */}
        {sourceImage && (
          <>
            {/* Source info bar */}
            <div className="flex min-h-12 items-stretch border-b-2 border-border">
              <div className="flex flex-1 items-center gap-3 px-4">
                <ImageIcon className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {imageSize.width} × {imageSize.height}
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={clear}
                className="h-auto self-stretch rounded-none border-l border-border px-4"
              >
                <Trash2 className="size-4 mr-2" />
                Clear
              </Button>
            </div>

            {/* Two-column layout: controls + preview */}
            <div className="grid lg:grid-cols-[1fr_auto]">

              {/* Controls column */}
              <div className="border-r-0 lg:border-r-2 lg:border-border">

                {/* Matte Style */}
                <div className="border-b-2 border-border">
                  <label className="block px-4 pt-4 pb-2 font-bold">Style</label>
                  <div className="segmented grid-cols-3 -mx-[1px] border-x-0">
                    {STYLE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.type}
                        variant={matteType === opt.type ? "default" : "outline"}
                        onClick={() => setMatteType(opt.type)}
                        className="flex items-center gap-2"
                      >
                        <opt.icon className="size-4" />
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Colour picker — solid matte only */}
                {matteType === "color" && (
                  <div className="border-b-2 border-border">
                    <label className="block px-4 pt-4 pb-2 font-bold">Matte Colour</label>
                    {/* Colour swatches as a flush table row */}
                    <div className="flex border-t border-border -mx-[1px] border-x-0">
                      {presetColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setMatteColor(color)}
                          className={cn(
                            "relative flex-1 h-10 border-l border-border first:border-l-0 transition-all",
                            matteColor === color ? "ring-2 ring-inset ring-primary" : ""
                          )}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                      {/* Custom colour swatch cell */}
                      <div className="relative w-10 shrink-0 border-l border-border">
                        <div
                          className="size-full h-10 flex items-center justify-center text-lg"
                          style={{ backgroundColor: matteColor }}
                          title="Custom colour"
                        >
                          <span
                            className="text-xs font-bold leading-none select-none"
                            style={{
                              color: matteColor === "#ffffff" || matteColor === "#f5f5f5" || matteColor === "#fafafa"
                                ? "#000000"
                                : "#ffffff",
                            }}
                          >
                            +
                          </span>
                        </div>
                        <input
                          type="color"
                          value={matteColor}
                          onChange={(e) => setMatteColor(e.target.value)}
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                        />
                      </div>
                    </div>
                    <p className="px-4 pb-3 pt-2 text-xs text-muted-foreground">
                      Click the coloured cells to select, or the last cell to pick a custom colour.
                    </p>
                  </div>
                )}

                {/* Aspect Ratio */}
                <div className="border-b-2 border-border">
                  <label className="block px-4 pt-4 pb-2 font-bold">Aspect Ratio</label>
                  <div className="segmented grid-cols-5 -mx-[1px] border-x-0">
                    {RATIO_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        variant={isPresetRatio(preset.w, preset.h) ? "default" : "outline"}
                        onClick={() => selectPresetRatio(preset.w, preset.h)}
                        title={preset.description}
                        className="tabular-nums"
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <Button
                      variant={customRatio ? "default" : "outline"}
                      onClick={() => setCustomRatio(true)}
                    >
                      Custom
                    </Button>
                  </div>
                  {/* Swap + custom inputs row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={swapRatio}
                      disabled={isSquare}
                      className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
                      title={isSquare ? "Square — nothing to rotate" : `Rotate to ${ratioH}:${ratioW}`}
                      aria-label="Rotate matte orientation"
                    >
                      <RotateCw className="size-4" />
                      Swap
                    </button>
                    {customRatio && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={32}
                          value={ratioW}
                          onChange={(e) => setRatioW(Math.max(1, Math.min(32, parseInt(e.target.value) || 1)))}
                          className="w-20 text-center"
                          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        />
                        <span className="text-muted-foreground font-medium">:</span>
                        <Input
                          type="number"
                          min={1}
                          max={32}
                          value={ratioH}
                          onChange={(e) => setRatioH(Math.max(1, Math.min(32, parseInt(e.target.value) || 1)))}
                          className="w-20 text-center"
                          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Output Width */}
                <div className="border-b-2 border-border">
                  <label className="block px-4 pt-4 pb-2 font-bold">Output Width</label>
                  <div className="segmented grid-cols-4 -mx-[1px] border-x-0">
                    {SIZE_PRESETS.map((size) => (
                      <Button
                        key={size}
                        variant={outputSize === size && !customSize ? "default" : "outline"}
                        onClick={() => { setOutputSize(size); setCustomSize(""); }}
                        className="tabular-nums"
                      >
                        {size}px
                      </Button>
                    ))}
                  </div>
                  <div className="px-4 py-3">
                    <Input
                      type="number"
                      min={100}
                      max={8192}
                      placeholder="Custom px…"
                      value={customSize}
                      onChange={(e) => {
                        setCustomSize(e.target.value);
                        const v = parseInt(e.target.value);
                        if (v >= 100 && v <= 8192) {
                          setOutputSize(v);
                        }
                      }}
                      className="w-full"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    />
                  </div>
                </div>

                {/* Padding */}
                <div className={cn("p-4", !resultImage ? "border-b-2 border-border" : "")}>
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-bold">Padding</label>
                    <span
                      className="text-sm tabular-nums text-muted-foreground"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      {padding}px
                    </span>
                  </div>
                  <Slider
                    value={[padding]}
                    onValueChange={([v]) => setPadding(v)}
                    min={0}
                    max={200}
                    step={10}
                  />
                </div>

              </div>

              {/* Preview column */}
              <div className="border-t-2 lg:border-t-0 border-border flex flex-col">
                <label className="block px-4 pt-4 pb-2 font-bold">Preview</label>
                <div className="flex flex-1 items-center justify-center p-4 bg-muted/30">
                  <div
                    className="relative overflow-hidden border border-border"
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
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                </div>
                <p
                  className="text-xs text-muted-foreground text-center px-4 pb-3"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {getOutputDimensions().width} × {getOutputDimensions().height} px
                </p>
              </div>

            </div>

            {/* Download — flush primary action */}
            {resultImage && (
              <div className="border-t-2 border-border">
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-bold rounded-none border-0"
                  onClick={downloadResult}
                >
                  <Download className="size-5 mr-2" />
                  Download {getOutputDimensions().width} × {getOutputDimensions().height}
                </Button>
              </div>
            )}

          </>
        )}

      </div>
    </div>
  );
}
