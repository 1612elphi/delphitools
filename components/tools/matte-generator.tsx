"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MatteType = "color" | "blur" | "gradient";
type AspectRatio = "1:1" | "4:5";

const ASPECT_RATIOS: { value: AspectRatio; label: string; description: string }[] = [
  { value: "1:1", label: "1:1", description: "Square" },
  { value: "4:5", label: "4:5", description: "Instagram Portrait" },
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
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [padding, setPadding] = useState(40);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [dominantColor, setDominantColor] = useState<string>("#888888");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Calculate output dimensions based on aspect ratio
  const getOutputDimensions = () => {
    if (aspectRatio === "4:5") {
      return { width: outputSize, height: Math.round(outputSize * 5 / 4) };
    }
    return { width: outputSize, height: outputSize };
  };

  // Extract dominant color for gradient preview
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
        setResultImage(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const generateMatte = () => {
    if (!sourceImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { width: canvasWidth, height: canvasHeight } = getOutputDimensions();
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Draw matte background
      if (matteType === "color") {
        ctx.fillStyle = matteColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      } else if (matteType === "blur") {
        // Draw blurred, scaled image as background
        ctx.filter = "blur(50px)";
        const scale = Math.max(
          canvasWidth / img.width,
          canvasHeight / img.height
        );
        const scaledWidth = img.width * scale * 1.2;
        const scaledHeight = img.height * scale * 1.2;
        ctx.drawImage(
          img,
          (canvasWidth - scaledWidth) / 2,
          (canvasHeight - scaledHeight) / 2,
          scaledWidth,
          scaledHeight
        );
        ctx.filter = "none";
      } else if (matteType === "gradient") {
        // Extract dominant colors and create gradient
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.drawImage(img, 0, 0, 1, 1);
          const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
          const baseColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
          const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
          gradient.addColorStop(0, baseColor);
          gradient.addColorStop(1, adjustBrightness(baseColor, -30));
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
      }

      // Calculate image placement with padding
      const availableWidth = canvasWidth - padding * 2;
      const availableHeight = canvasHeight - padding * 2;
      const scale = Math.min(
        availableWidth / img.width,
        availableHeight / img.height
      );
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const x = (canvasWidth - scaledWidth) / 2;
      const y = (canvasHeight - scaledHeight) / 2;

      // Draw the image centered
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

      setResultImage(canvas.toDataURL("image/png"));
    };
    img.src = sourceImage;
  };

  const adjustBrightness = (color: string, amount: number): string => {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return color;
    const r = Math.max(0, Math.min(255, parseInt(match[1]) + amount));
    const g = Math.max(0, Math.min(255, parseInt(match[2]) + amount));
    const b = Math.max(0, Math.min(255, parseInt(match[3]) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  };

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

  const isSquare = imageSize.width === imageSize.height;

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Drop Zone */}
      {!sourceImage && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
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
            Works best with non-square images
          </p>
        </div>
      )}

      {/* Source Preview & Settings */}
      {sourceImage && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-bold">Source Image</label>
              {isSquare && (
                <p className="text-sm text-muted-foreground">
                  Image is already square
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="size-4 mr-2" /> Clear
            </Button>
          </div>

          {/* Live Preview */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Preview</label>
            <div className="flex justify-center">
              <div
                className="relative rounded border overflow-hidden"
                style={{
                  width: aspectRatio === "4:5" ? "224px" : "280px",
                  height: "280px",
                  background:
                    matteType === "color"
                      ? matteColor
                      : matteType === "gradient"
                        ? `linear-gradient(135deg, ${dominantColor}, ${adjustBrightness(dominantColor, -30)})`
                        : undefined,
                }}
              >
                {/* Blurred background for blur mode */}
                {matteType === "blur" && (
                  <img
                    src={sourceImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover scale-125"
                    style={{ filter: "blur(20px)" }}
                  />
                )}
                {/* Centered image with padding */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ padding: `${(padding / outputSize) * (aspectRatio === "4:5" ? 224 : 280)}px` }}
                >
                  <img
                    src={sourceImage}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground text-center">
              {imageSize.width} × {imageSize.height} px
              {!isSquare && (
                <span className="ml-2">
                  ({imageSize.width > imageSize.height ? "landscape" : "portrait"})
                </span>
              )}
            </div>
          </div>

          {/* Matte Type Selection */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Matte Style</label>
            <div className="flex flex-wrap gap-2">
              {[
                { type: "blur" as const, label: "Blurred Background" },
                { type: "color" as const, label: "Solid Colour" },
                { type: "gradient" as const, label: "Gradient" },
              ].map((option) => (
                <button
                  key={option.type}
                  onClick={() => {
                    setMatteType(option.type);
                    setResultImage(null);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-lg border transition-colors",
                    matteType === option.type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:border-primary/50"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Colour picker for solid color matte */}
          {matteType === "color" && (
            <div className="space-y-2">
              <label className="font-bold text-sm">Matte Colour</label>
              <div className="flex flex-wrap gap-2 items-center">
                {presetColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setMatteColor(color);
                      setResultImage(null);
                    }}
                    className={cn(
                      "size-10 rounded-lg border-2 transition-all",
                      matteColor === color
                        ? "border-primary ring-2 ring-primary ring-offset-2"
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
                    onChange={(e) => {
                      setMatteColor(e.target.value);
                      setResultImage(null);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div
                    className="size-10 rounded-lg border-2 border-dashed border-muted flex items-center justify-center text-muted-foreground hover:border-primary/50 transition-colors"
                    title="Custom colour"
                  >
                    +
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Output Settings */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="font-bold text-sm">Aspect Ratio</label>
              <div className="flex gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => {
                      setAspectRatio(ratio.value);
                      setResultImage(null);
                    }}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-sm transition-colors flex-1",
                      aspectRatio === ratio.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:border-primary/50"
                    )}
                    title={ratio.description}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {ASPECT_RATIOS.find((r) => r.value === aspectRatio)?.description}
              </p>
            </div>
            <div className="space-y-2">
              <label className="font-bold text-sm">Output Width (px)</label>
              <div className="flex gap-2">
                {[1080, 1200, 1440, 2048].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setOutputSize(size);
                      setResultImage(null);
                    }}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-sm transition-colors",
                      outputSize === size
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:border-primary/50"
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="font-bold text-sm">Padding (px)</label>
              <Input
                type="number"
                min={0}
                max={200}
                value={padding}
                onChange={(e) => {
                  setPadding(
                    Math.max(0, Math.min(200, parseInt(e.target.value) || 0))
                  );
                  setResultImage(null);
                }}
                className="h-12"
              />
            </div>
          </div>

          <Button size="lg" className="w-full h-14" onClick={generateMatte}>
            Generate Matte
          </Button>
        </div>
      )}

      {/* Result */}
      {resultImage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-bold">Result</label>
            <Button onClick={downloadResult}>
              <Download className="size-4 mr-2" /> Download
            </Button>
          </div>
          <div className="rounded border bg-card p-4 flex justify-center">
            <img
              src={resultImage}
              alt="Result"
              className="max-w-full max-h-80 rounded"
            />
          </div>
          <div className="text-sm text-muted-foreground text-center">
            {getOutputDimensions().width} × {getOutputDimensions().height} px
          </div>
        </div>
      )}
    </div>
  );
}
