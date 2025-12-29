"use client";

import { useState, useCallback } from "react";
import { Upload, Download, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type ImageFormat = "png" | "jpeg" | "webp";

interface ConvertedImage {
  name: string;
  originalFormat: string;
  targetFormat: ImageFormat;
  dataUrl: string;
  size: number;
}

export function ImageConverterTool() {
  const [images, setImages] = useState<File[]>([]);
  const [targetFormat, setTargetFormat] = useState<ImageFormat>("webp");
  const [quality, setQuality] = useState(0.9);
  const [converted, setConverted] = useState<ConvertedImage[]>([]);
  const [converting, setConverting] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    setImages((prev) => [...prev, ...files]);
    setConverted([]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter((f) =>
        f.type.startsWith("image/")
      );
      setImages((prev) => [...prev, ...files]);
      setConverted([]);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setConverted([]);
  };

  const convertImages = async () => {
    setConverting(true);
    const results: ConvertedImage[] = [];

    for (const file of images) {
      try {
        const dataUrl = await convertImage(file, targetFormat, quality);
        const base64Length = dataUrl.split(",")[1]?.length || 0;
        const size = Math.round((base64Length * 3) / 4);

        results.push({
          name: file.name.replace(/\.[^.]+$/, `.${targetFormat}`),
          originalFormat: file.type.split("/")[1] || "unknown",
          targetFormat,
          dataUrl,
          size,
        });
      } catch (err) {
        console.error(`Failed to convert ${file.name}:`, err);
      }
    }

    setConverted(results);
    setConverting(false);
  };

  const convertImage = (
    file: File,
    format: ImageFormat,
    quality: number
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context failed"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const mimeType = `image/${format}`;
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const downloadImage = (img: ConvertedImage) => {
    const link = document.createElement("a");
    link.download = img.name;
    link.href = img.dataUrl;
    link.click();
  };

  const downloadAll = () => {
    converted.forEach((img) => downloadImage(img));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const clearAll = () => {
    setImages([]);
    setConverted([]);
  };

  return (
    <div className="space-y-8">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Drop images here</p>
        <p className="text-sm text-muted-foreground mt-1">
          or click to select files
        </p>
      </div>

      {/* Format Selection */}
      <div className="space-y-4">
        <div className="space-y-3">
          <label className="font-bold block">Convert to</label>
          <div className="flex gap-2">
            {(["png", "jpeg", "webp"] as ImageFormat[]).map((fmt) => (
              <Button
                key={fmt}
                variant={targetFormat === fmt ? "default" : "outline"}
                onClick={() => setTargetFormat(fmt)}
                className="flex-1 uppercase font-bold"
                size="lg"
              >
                {fmt}
              </Button>
            ))}
          </div>
        </div>

        {targetFormat !== "png" && (
          <div className="space-y-3">
            <label className="font-bold block">
              Quality: {Math.round(quality * 100)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        )}
      </div>

      {/* Image List */}
      {images.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">
              {images.length} image{images.length !== 1 ? "s" : ""} selected
            </h3>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </div>

          <div className="grid gap-3">
            {images.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card"
              >
                <div className="size-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSize(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeImage(index)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold"
            onClick={convertImages}
            disabled={converting}
          >
            {converting ? (
              "Converting..."
            ) : (
              <>
                <ImageIcon className="size-5 mr-2" />
                Convert to {targetFormat.toUpperCase()}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Converted Results */}
      {converted.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Converted</h3>
            <Button onClick={downloadAll}>
              <Download className="size-4 mr-2" />
              Download All
            </Button>
          </div>

          <div className="grid gap-3">
            {converted.map((img, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card"
              >
                <div className="size-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{img.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSize(img.size)}
                  </p>
                </div>
                <Button onClick={() => downloadImage(img)}>
                  <Download className="size-4 mr-2" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
