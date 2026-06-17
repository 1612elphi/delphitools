"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useFilePaste } from "@/hooks/use-file-paste";

export function ArtworkEnhancerTool() {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [opacity, setOpacity] = useState(2);
  const [noiseScale, setNoiseScale] = useState(1);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [noiseSeed, setNoiseSeed] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readFile(file);
    }
  }, []);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setImage(dataUrl);
        setResultImage(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  useFilePaste(readFile, "image/*");

  const generateNoise = useCallback(() => {
    setNoiseSeed(Math.random());
  }, []);

  // Process image whenever inputs change
  useEffect(() => {
    if (!image) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Create noise layer
      const noiseCanvas = document.createElement("canvas");
      noiseCanvas.width = img.width;
      noiseCanvas.height = img.height;
      const noiseCtx = noiseCanvas.getContext("2d");
      if (!noiseCtx) return;

      // Generate colour noise
      const imageData = noiseCtx.createImageData(img.width, img.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        // Random RGB values for colour noise
        data[i] = Math.floor(Math.random() * 256);     // R
        data[i + 1] = Math.floor(Math.random() * 256); // G
        data[i + 2] = Math.floor(Math.random() * 256); // B
        data[i + 3] = 255; // Full alpha (we'll control opacity via globalAlpha)
      }

      noiseCtx.putImageData(imageData, 0, 0);

      // If noise scale > 1, we need to scale up the noise (makes it blockier)
      if (noiseScale > 1) {
        const scaledNoiseCanvas = document.createElement("canvas");
        scaledNoiseCanvas.width = img.width;
        scaledNoiseCanvas.height = img.height;
        const scaledCtx = scaledNoiseCanvas.getContext("2d");
        if (scaledCtx) {
          scaledCtx.imageSmoothingEnabled = false;
          // Draw smaller, then scale up
          const smallWidth = Math.ceil(img.width / noiseScale);
          const smallHeight = Math.ceil(img.height / noiseScale);

          const smallCanvas = document.createElement("canvas");
          smallCanvas.width = smallWidth;
          smallCanvas.height = smallHeight;
          const smallCtx = smallCanvas.getContext("2d");
          if (smallCtx) {
            const smallImageData = smallCtx.createImageData(smallWidth, smallHeight);
            const smallData = smallImageData.data;
            for (let i = 0; i < smallData.length; i += 4) {
              smallData[i] = Math.floor(Math.random() * 256);
              smallData[i + 1] = Math.floor(Math.random() * 256);
              smallData[i + 2] = Math.floor(Math.random() * 256);
              smallData[i + 3] = 255;
            }
            smallCtx.putImageData(smallImageData, 0, 0);
            scaledCtx.drawImage(smallCanvas, 0, 0, img.width, img.height);

            // Apply overlay blend mode with opacity
            ctx.globalCompositeOperation = "overlay";
            ctx.globalAlpha = opacity / 100;
            ctx.drawImage(scaledNoiseCanvas, 0, 0);
          }
        }
      } else {
        // Apply overlay blend mode with opacity
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = opacity / 100;
        ctx.drawImage(noiseCanvas, 0, 0);
      }

      // Reset composite operation
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // Save result
      setResultImage(canvas.toDataURL("image/png"));
    };
    img.src = image;
  }, [image, opacity, noiseScale, noiseSeed]);

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement("a");
    link.download = `${fileName || "artwork"}-enhanced.png`;
    link.href = resultImage;
    link.click();
  };

  const clearImage = () => {
    setImage(null);
    setResultImage(null);
    setFileName("");
  };

  return (
    <div className="space-y-6">
      <div className="border-2 border-border">
        {!image ? (
          /* Upload drop zone */
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed m-4 p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("artwork-upload")?.click()}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleSelect}
              className="hidden"
              id="artwork-upload"
            />
            <Upload className="size-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-1">Drop your artwork here</p>
            <p className="text-sm text-muted-foreground">or click to browse, or paste</p>
          </div>
        ) : (
          <>
            {/* Controls — two columns, each breathes with p-4 */}
            <div className="grid grid-cols-2 border-b-2 border-border">
              {/* Noise Opacity */}
              <div className="p-4 border-r border-border">
                <div className="flex items-center justify-between mb-3">
                  <label className="font-bold">Noise Opacity</label>
                  <span
                    className="text-sm text-muted-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {opacity}%
                  </span>
                </div>
                <Slider
                  value={[opacity]}
                  onValueChange={([v]) => setOpacity(v)}
                  min={1}
                  max={20}
                  step={1}
                />
                <p className="text-xs text-muted-foreground mt-2">Classic trick uses 2% opacity</p>
              </div>

              {/* Noise Scale */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="font-bold">Noise Scale</label>
                  <span
                    className="text-sm text-muted-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {noiseScale}x
                  </span>
                </div>
                <Slider
                  value={[noiseScale]}
                  onValueChange={([v]) => setNoiseScale(v)}
                  min={1}
                  max={4}
                  step={1}
                />
                <p className="text-xs text-muted-foreground mt-2">Higher = blockier noise</p>
              </div>
            </div>

            {/* Preview — full-bleed */}
            <div className="border-b-2 border-border">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <label className="font-bold">Preview</label>
                <span
                  className="text-xs text-muted-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {imageSize.width} × {imageSize.height}px
                </span>
              </div>
              <div
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                }}
              >
                {resultImage && (
                  <img
                    src={resultImage}
                    alt="Enhanced artwork"
                    className="w-full h-auto max-h-[600px] object-contain"
                  />
                )}
              </div>
            </div>

            {/* Action bar */}
            <div className="flex min-h-14 items-stretch">
              <Button
                variant="outline"
                onClick={generateNoise}
                className="h-auto gap-2 self-stretch rounded-none border-0 px-5 font-semibold"
              >
                <RefreshCw className="size-4" />
                Regenerate
              </Button>
              <Button
                variant="ghost"
                onClick={clearImage}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5"
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
              <Button
                onClick={downloadResult}
                disabled={!resultImage}
                className="h-auto flex-1 gap-2 self-stretch rounded-none border-l border-border text-base font-bold"
              >
                <Download className="size-4" />
                Download PNG
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Info */}
      <div className="border border-border bg-muted/30 p-4 text-sm">
        <p className="font-bold mb-1">About this technique</p>
        <p className="text-muted-foreground">
          Adding colour noise at low opacity with overlay blend mode is a classic
          digital art trick. It adds subtle texture and colour variation that makes
          artwork feel more organic and cohesive, similar to the natural grain in
          traditional media.
        </p>
      </div>

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
