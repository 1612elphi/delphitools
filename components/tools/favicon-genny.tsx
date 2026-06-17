"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFilePaste } from "@/hooks/use-file-paste";

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

  useFilePaste(readFile, "image/*");

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

  const downloadAsIco = async () => {
    // Get the 16, 32, 48, 64 sized favicons
    const icoSizes = [16, 32, 48, 64];
    const icoFavicons = favicons.filter((f) => icoSizes.includes(f.size));

    if (icoFavicons.length === 0) return;

    // Convert data URLs to PNG buffers
    const pngBuffers: { size: number; data: Uint8Array }[] = [];

    for (const favicon of icoFavicons) {
      const response = await fetch(favicon.dataUrl);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      pngBuffers.push({
        size: favicon.size,
        data: new Uint8Array(arrayBuffer),
      });
    }

    // Sort by size ascending
    pngBuffers.sort((a, b) => a.size - b.size);

    // ICO file format:
    // ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes each) + image data
    const numImages = pngBuffers.length;
    const headerSize = 6 + numImages * 16;

    // Calculate total size
    let totalSize = headerSize;
    for (const buf of pngBuffers) {
      totalSize += buf.data.length;
    }

    const icoBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(icoBuffer);
    const bytes = new Uint8Array(icoBuffer);

    // ICONDIR header
    view.setUint16(0, 0, true); // Reserved (0)
    view.setUint16(2, 1, true); // Type (1 = ICO)
    view.setUint16(4, numImages, true); // Number of images

    // Write ICONDIRENTRY for each image and copy image data
    let dataOffset = headerSize;

    for (let i = 0; i < pngBuffers.length; i++) {
      const entryOffset = 6 + i * 16;
      const { size, data } = pngBuffers[i];

      // ICONDIRENTRY (16 bytes)
      view.setUint8(entryOffset + 0, size < 256 ? size : 0); // Width (0 means 256)
      view.setUint8(entryOffset + 1, size < 256 ? size : 0); // Height
      view.setUint8(entryOffset + 2, 0); // Colour palette (0 for PNG)
      view.setUint8(entryOffset + 3, 0); // Reserved
      view.setUint16(entryOffset + 4, 1, true); // Colour planes
      view.setUint16(entryOffset + 6, 32, true); // Bits per pixel
      view.setUint32(entryOffset + 8, data.length, true); // Image size
      view.setUint32(entryOffset + 12, dataOffset, true); // Image offset

      // Copy image data
      bytes.set(data, dataOffset);
      dataOffset += data.length;
    }

    // Download the ICO file
    const blob = new Blob([icoBuffer], { type: "image/x-icon" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "favicon.ico";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
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

      <div className="border-2 border-border">
        {/* Drop Zone */}
        {!sourceImage ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed m-4 p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
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
              PNG, JPG, SVG or any image format, or paste
            </p>
          </div>
        ) : (
          /* Source image header bar */
          <div>
            <div className="flex min-h-14 items-stretch border-b border-border">
              <span className="flex flex-1 items-center px-4 font-bold">
                {fileName || "Source Image"}
              </span>
              <Button
                variant="ghost"
                onClick={clear}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5 text-muted-foreground"
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-4 p-4">
              <div className="shrink-0 border border-border bg-white">
                <img
                  src={sourceImage}
                  alt="Source"
                  className="size-24 object-contain"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Image will be centre-cropped to a square for each size.
              </p>
            </div>
          </div>
        )}

        {/* Generating state */}
        {generating && (
          <div className="border-t-2 border-border p-6 text-center text-muted-foreground">
            Generating favicons…
          </div>
        )}

        {/* Generated Favicons */}
        {favicons.length > 0 && (
          <>
            {/* Action bar */}
            <div className="flex min-h-14 items-stretch border-t-2 border-border">
              <span className="flex flex-1 items-center px-4 font-bold">
                Generated Favicons
              </span>
              <Button
                variant="outline"
                onClick={downloadAsIco}
                className="h-auto gap-2 self-stretch rounded-none border-0 border-l border-border px-5"
              >
                <Download className="size-4" />
                Download .ico
              </Button>
              <Button
                onClick={downloadAll}
                className="h-auto gap-2 self-stretch rounded-none border-0 border-l border-border px-6 font-semibold"
              >
                <Download className="size-4" />
                Download All
              </Button>
            </div>

            {/* Favicon preview table */}
            <div className="border-t border-border">
              {favicons.map((favicon) => (
                <button
                  key={favicon.size}
                  onClick={() => downloadFavicon(favicon)}
                  className="flex w-full items-stretch border-b border-border last:border-b-0 hover:bg-muted transition-colors group"
                >
                  {/* Swatch cell */}
                  <div className="flex w-20 shrink-0 items-center justify-center border-r border-border bg-muted/30 p-2">
                    <div className="flex items-center justify-center bg-white border border-border"
                      style={{ width: Math.min(favicon.size, 48) + 8, height: Math.min(favicon.size, 48) + 8 }}
                    >
                      <img
                        src={favicon.dataUrl}
                        alt={`${favicon.size}×${favicon.size}`}
                        style={{ width: Math.min(favicon.size, 48), height: Math.min(favicon.size, 48) }}
                        className="object-contain"
                      />
                    </div>
                  </div>
                  {/* Size label cell */}
                  <div className="flex flex-1 items-center px-4 py-3 text-left">
                    <div>
                      <div className="font-bold">{favicon.size}×{favicon.size}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getSizeLabel(favicon.size)}
                      </div>
                    </div>
                  </div>
                  {/* Download hint cell */}
                  <div className="flex items-center px-4 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <Download className="size-3.5 mr-1.5" />
                    Download PNG
                  </div>
                </button>
              ))}
            </div>

            {/* HTML Snippet */}
            <div className="border-t-2 border-border">
              <div className="p-4 pb-2">
                <label className="font-bold">HTML Snippet</label>
              </div>
              <pre
                className="overflow-x-auto px-4 pb-4 text-sm text-muted-foreground"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >{`<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon-512x512.png">`}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
