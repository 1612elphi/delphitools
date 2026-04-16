"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, X, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClipResult {
  originalWidth: number;
  originalHeight: number;
  clippedWidth: number;
  clippedHeight: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  url: string;
  blob: Blob;
  fileName: string;
}

function findBoundingBox(
  imageData: ImageData
): { top: number; right: number; bottom: number; left: number } | null {
  const { width, height, data } = imageData;
  let top = height;
  let bottom = 0;
  let left = width;
  let right = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (top > bottom || left > right) return null;

  return { top, right: width - 1 - right, bottom: height - 1 - bottom, left };
}

export function ImageClipperTool() {
  const [result, setResult] = useState<ClipResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const processImage = useCallback((file: File) => {
    setError(null);
    setProcessing(true);

    const img = new Image();
    const fileUrl = URL.createObjectURL(file);
    img.onload = () => {
      if (!isMountedRef.current) {
        URL.revokeObjectURL(fileUrl);
        return;
      }
      const { naturalWidth: w, naturalHeight: h } = img;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, w, h);
      const bounds = findBoundingBox(imageData);

      if (!bounds) {
        setError("Image is fully transparent — nothing to clip.");
        setProcessing(false);
        URL.revokeObjectURL(fileUrl);
        return;
      }

      const clippedWidth = w - bounds.left - bounds.right;
      const clippedHeight = h - bounds.top - bounds.bottom;

      if (clippedWidth === w && clippedHeight === h) {
        setPreview(fileUrl);
        setResult({
          originalWidth: w,
          originalHeight: h,
          clippedWidth: w,
          clippedHeight: h,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          url: fileUrl,
          blob: file,
          fileName: file.name,
        });
        setProcessing(false);
        return;
      }

      const outCanvas = document.createElement("canvas");
      outCanvas.width = clippedWidth;
      outCanvas.height = clippedHeight;
      const outCtx = outCanvas.getContext("2d")!;
      outCtx.drawImage(
        canvas,
        bounds.left,
        bounds.top,
        clippedWidth,
        clippedHeight,
        0,
        0,
        clippedWidth,
        clippedHeight
      );

      outCanvas.toBlob((blob) => {
        if (!isMountedRef.current) {
          URL.revokeObjectURL(fileUrl);
          return;
        }
        if (!blob) {
          setError("Failed to encode clipped image.");
          setProcessing(false);
          URL.revokeObjectURL(fileUrl);
          return;
        }

        const url = URL.createObjectURL(blob);
        setPreview(url);
        setResult({
          originalWidth: w,
          originalHeight: h,
          clippedWidth,
          clippedHeight,
          ...bounds,
          url,
          blob,
          fileName: file.name.replace(/\.png$/i, "-clipped.png"),
        });
        setProcessing(false);
        URL.revokeObjectURL(fileUrl);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(fileUrl);
      if (!isMountedRef.current) return;
      setError("Failed to load image.");
      setProcessing(false);
    };
    img.src = fileUrl;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type === "image/png") processImage(file);
      else setError("Only PNG files are supported.");
    },
    [processImage]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processImage(file);
    },
    [processImage]
  );

  const handleDownload = useCallback(() => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = result.fileName;
    a.click();
  }, [result]);

  const reset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setResult(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [preview]);

  const noChange = result && result.originalWidth === result.clippedWidth && result.originalHeight === result.clippedHeight;

  return (
    <div className="space-y-4">
      {!result && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center transition-colors hover:border-muted-foreground/50 cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Drop a PNG here or click to upload</p>
            <p className="text-sm text-muted-foreground">
              Transparent edges will be trimmed automatically
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {processing && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Scissors className="h-4 w-4 animate-pulse" />
          <span>Clipping…</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {result.originalWidth} × {result.originalHeight}
                {" → "}
                {result.clippedWidth} × {result.clippedHeight}
              </p>
              {noChange ? (
                <p className="text-xs text-muted-foreground">
                  No transparent edges found — image is already minimal
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Trimmed {result.top}px top, {result.right}px right, {result.bottom}px bottom, {result.left}px left
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={reset}>
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
              <Button size="sm" onClick={handleDownload}>
                <Download className="mr-1 h-3 w-3" />
                Download
              </Button>
            </div>
          </div>

          {preview && (
            <div className="flex items-center justify-center rounded-lg border bg-[repeating-conic-gradient(oklch(0.9_0_0)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4 dark:bg-[repeating-conic-gradient(oklch(0.3_0_0)_0%_25%,transparent_0%_50%)]">
              <img
                src={preview}
                alt="Clipped result"
                className="max-h-96 max-w-full object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
