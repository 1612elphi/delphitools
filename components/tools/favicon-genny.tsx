"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 512];

interface GeneratedFavicon {
  size: number;
  dataUrl: string;
}

export function FaviconGennyTool() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [favicons, setFavicons] = useState<GeneratedFavicon[]>([]);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      setSourceImage(dataUrl);
      generateFavicons(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const generateFavicons = async (imageDataUrl: string) => {
    setGenerating(true);
    const img = new Image();
    img.onload = () => {
      const generated: GeneratedFavicon[] = [];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      for (const size of FAVICON_SIZES) {
        canvas.width = size;
        canvas.height = size;
        ctx.clearRect(0, 0, size, size);

        // Calculate crop for square aspect ratio
        const srcSize = Math.min(img.width, img.height);
        const srcX = (img.width - srcSize) / 2;
        const srcY = (img.height - srcSize) / 2;

        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

        generated.push({
          size,
          dataUrl: canvas.toDataURL("image/png"),
        });
      }

      setFavicons(generated);
      setGenerating(false);
    };
    img.src = imageDataUrl;
  };

  const downloadFavicon = (favicon: GeneratedFavicon) => {
    const link = document.createElement("a");
    link.download = `favicon-${favicon.size}x${favicon.size}.png`;
    link.href = favicon.dataUrl;
    link.click();
  };

  const downloadAll = () => {
    favicons.forEach((favicon, i) => {
      setTimeout(() => downloadFavicon(favicon), i * 100);
    });
  };

  const clear = () => {
    setSourceImage(null);
    setFileName("");
    setFavicons([]);
  };

  const getSizeLabel = (size: number) => {
    if (size === 180) return "Apple Touch";
    if (size === 192) return "Android";
    if (size === 512) return "PWA";
    return `${size}×${size}`;
  };

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => document.getElementById("favicon-input")?.click()}
      >
        <input
          id="favicon-input"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Drop image here</p>
        <p className="text-sm text-muted-foreground mt-1">
          PNG, JPG, SVG or any image format
        </p>
      </div>

      {/* Source Preview */}
      {sourceImage && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-bold">Source Image</label>
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="size-4 mr-2" /> Clear
            </Button>
          </div>
          <div className="p-4 rounded-lg border bg-muted/30 flex items-center gap-4">
            <img
              src={sourceImage}
              alt="Source"
              className="size-24 object-contain rounded border bg-white"
            />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{fileName}</p>
              <p className="mt-1">Image will be cropped to square</p>
            </div>
          </div>
        </div>
      )}

      {/* Generated Favicons */}
      {favicons.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-bold">Generated Favicons</label>
            <Button onClick={downloadAll}>
              <Download className="size-4 mr-2" /> Download All
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {favicons.map((favicon) => (
              <button
                key={favicon.size}
                onClick={() => downloadFavicon(favicon)}
                className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-center justify-center h-20 mb-3">
                  <img
                    src={favicon.dataUrl}
                    alt={`${favicon.size}x${favicon.size}`}
                    style={{ width: Math.min(favicon.size, 64), height: Math.min(favicon.size, 64) }}
                    className="object-contain bg-white rounded border"
                  />
                </div>
                <div className="text-center">
                  <div className="font-bold">{favicon.size}×{favicon.size}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {getSizeLabel(favicon.size)}
                  </div>
                </div>
                <div className="mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to download
                </div>
              </button>
            ))}
          </div>

          {/* HTML Snippet */}
          <div className="space-y-2">
            <label className="font-bold">HTML Snippet</label>
            <pre className="p-4 rounded-lg border bg-muted/50 text-sm font-mono overflow-x-auto">
{`<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon-512x512.png">`}
            </pre>
          </div>
        </div>
      )}

      {generating && (
        <div className="text-center py-8 text-muted-foreground">
          Generating favicons...
        </div>
      )}
    </div>
  );
}
