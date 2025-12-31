"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

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
      {/* Upload Area */}
      {!image ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleSelect}
            className="hidden"
            id="image-upload"
          />
          <label htmlFor="image-upload" className="cursor-pointer">
            <Upload className="size-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-1">Drop your artwork here</p>
            <p className="text-sm text-muted-foreground">or click to browse</p>
          </label>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-bold">Noise Opacity</label>
                <span className="text-sm text-muted-foreground font-mono">{opacity}%</span>
              </div>
              <Slider
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                min={1}
                max={20}
                step={1}
              />
              <p className="text-xs text-muted-foreground">Classic trick uses 2% opacity</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-bold">Noise Scale</label>
                <span className="text-sm text-muted-foreground font-mono">{noiseScale}x</span>
              </div>
              <Slider
                value={[noiseScale]}
                onValueChange={([v]) => setNoiseScale(v)}
                min={1}
                max={4}
                step={1}
              />
              <p className="text-xs text-muted-foreground">Higher = blockier noise</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={generateNoise} className="gap-2">
              <RefreshCw className="size-4" />
              Regenerate Noise
            </Button>
            <Button variant="outline" onClick={clearImage} className="gap-2">
              <Trash2 className="size-4" />
              Clear
            </Button>
            <Button onClick={downloadResult} disabled={!resultImage} className="gap-2 ml-auto">
              <Download className="size-4" />
              Download
            </Button>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <label className="font-bold">Preview</label>
            <div className="border rounded-xl overflow-hidden bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]">
              {resultImage && (
                <img
                  src={resultImage}
                  alt="Enhanced artwork"
                  className="w-full h-auto max-h-[600px] object-contain"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {imageSize.width} × {imageSize.height}px
            </p>
          </div>
        </>
      )}

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Info */}
      <div className="p-4 rounded-lg border bg-muted/30 text-sm">
        <p className="font-bold mb-1">About this technique</p>
        <p className="text-muted-foreground">
          Adding colour noise at low opacity with overlay blend mode is a classic
          digital art trick. It adds subtle texture and colour variation that makes
          artwork feel more organic and cohesive, similar to the natural grain in
          traditional media.
        </p>
      </div>
    </div>
  );
}
