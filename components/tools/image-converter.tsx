"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Upload, Download, X, ImageIcon, Link as LinkIcon, ChevronDown, Lock, Unlock, Archive, ArrowRight, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Link from "next/link";

type ImageFormat = "png" | "jpeg" | "webp" | "avif" | "gif" | "bmp" | "tiff" | "ico";

type ResizeMode = "original" | "custom" | "percentage";

interface ResizeOptions {
  mode: ResizeMode;
  width: number;
  height: number;
  percentage: number;
  lockAspectRatio: boolean;
}

interface PngOptions {
  transparency: boolean;
  backgroundColour: string;
}

interface JpegOptions {
  quality: number;
  backgroundColour: string;
}

interface WebpOptions {
  quality: number;
  lossless: boolean;
}

interface AvifOptions {
  quality: number;
}

interface GifOptions {
  maxColours: number;
  quantization: "rgb565" | "rgb444" | "rgba4444";
}

interface BmpOptions {
  bitDepth: 24 | 32;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface TiffOptions {}

interface IcoOptions {
  sizes: number[];
  multiSize: boolean;
}

interface FormatOptionsMap {
  png: PngOptions;
  jpeg: JpegOptions;
  webp: WebpOptions;
  avif: AvifOptions;
  gif: GifOptions;
  bmp: BmpOptions;
  tiff: TiffOptions;
  ico: IcoOptions;
}

interface ConvertedImage {
  name: string;
  originalFormat: string;
  targetFormat: ImageFormat;
  blob: Blob;
  size: number;
  url: string;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      mimeType,
      quality !== undefined ? quality / 100 : undefined
    );
  });
}

function prepareCanvas(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  fillBackground: boolean,
  backgroundColour: string
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d")!;
  if (fillBackground) {
    ctx.fillStyle = backgroundColour;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas;
}

function getTargetDimensions(
  img: HTMLImageElement,
  resize: ResizeOptions
): { width: number; height: number } {
  if (resize.mode === "percentage") {
    const scale = resize.percentage / 100;
    return {
      width: Math.round(img.naturalWidth * scale),
      height: Math.round(img.naturalHeight * scale),
    };
  }
  if (resize.mode === "custom") {
    const w = resize.width || img.naturalWidth;
    const h = resize.height || img.naturalHeight;
    if (resize.lockAspectRatio) {
      const aspect = img.naturalWidth / img.naturalHeight;
      if (resize.width && !resize.height) {
        return { width: w, height: Math.round(w / aspect) };
      }
      if (resize.height && !resize.width) {
        return { width: Math.round(h * aspect), height: h };
      }
      if (resize.width && resize.height) {
        return { width: w, height: Math.round(w / aspect) };
      }
    }
    return { width: w, height: h };
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function encodePng(canvas: HTMLCanvasElement, _options: PngOptions): Promise<Blob> {
  return canvasToBlob(canvas, "image/png");
}

async function encodeJpeg(canvas: HTMLCanvasElement, options: JpegOptions): Promise<Blob> {
  return canvasToBlob(canvas, "image/jpeg", options.quality);
}

async function encodeWebp(canvas: HTMLCanvasElement, options: WebpOptions): Promise<Blob> {
  if (options.lossless) {
    return canvasToBlob(canvas, "image/webp", 100);
  }
  return canvasToBlob(canvas, "image/webp", options.quality);
}

async function encodeAvif(canvas: HTMLCanvasElement, options: AvifOptions): Promise<Blob> {
  return canvasToBlob(canvas, "image/avif", options.quality);
}

async function encodeGif(canvas: HTMLCanvasElement, options: GifOptions): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  const palette = quantize(data, options.maxColours, { format: options.quantization });
  const index = applyPalette(data, palette, options.quantization);

  const gif = GIFEncoder();
  gif.writeFrame(index, width, height, { palette });
  gif.finish();

  const bytes = gif.bytes();
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

async function encodeBmp(canvas: HTMLCanvasElement, options: BmpOptions): Promise<Blob> {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  const bpp = options.bitDepth;
  const bytesPerPixel = bpp / 8;
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const headerSize = 14 + 40;
  const fileSize = headerSize + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // BMP file header (14 bytes)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, headerSize, true);

  // DIB header (BITMAPINFOHEADER, 40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // negative = top-down
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, bpp, true);
  view.setUint32(30, 0, true); // no compression
  view.setUint32(34, pixelDataSize, true);
  view.setUint32(38, 2835, true); // ~72 DPI horizontal
  view.setUint32(42, 2835, true); // ~72 DPI vertical

  for (let y = 0; y < height; y++) {
    const rowStart = headerSize + y * rowSize;
    let off = rowStart;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (bpp === 32) {
        view.setUint8(off++, data[i + 2]); // B
        view.setUint8(off++, data[i + 1]); // G
        view.setUint8(off++, data[i]);     // R
        view.setUint8(off++, data[i + 3]); // A
      } else {
        view.setUint8(off++, data[i + 2]); // B
        view.setUint8(off++, data[i + 1]); // G
        view.setUint8(off++, data[i]);     // R
      }
    }
    // Remaining bytes up to rowSize are already zeroed by ArrayBuffer
  }

  return new Blob([buffer], { type: "image/bmp" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function encodeTiff(canvas: HTMLCanvasElement, _options: TiffOptions): Promise<Blob> {
  const UTIF = await import("utif");
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const arrayBuffer = UTIF.encodeImage(imageData.data, width, height);
  return new Blob([arrayBuffer], { type: "image/tiff" });
}

async function encodeIco(canvas: HTMLCanvasElement, options: IcoOptions): Promise<Blob> {
  const sizes = options.multiSize ? options.sizes : [options.sizes[0] || 32];
  const pngBlobs: ArrayBuffer[] = [];

  for (const size of sizes) {
    const resized = document.createElement("canvas");
    resized.width = size;
    resized.height = size;
    const ctx = resized.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, size, size);
    const blob = await canvasToBlob(resized, "image/png");
    pngBlobs.push(await blob.arrayBuffer());
  }

  // ICO header: 6 bytes + 16 bytes per image + PNG data
  const headerSize = 6 + sizes.length * 16;
  const totalDataSize = pngBlobs.reduce((sum, b) => sum + b.byteLength, 0);
  const buffer = new ArrayBuffer(headerSize + totalDataSize);
  const view = new DataView(buffer);

  // ICO header
  view.setUint16(0, 0, true);     // reserved
  view.setUint16(2, 1, true);     // ICO type
  view.setUint16(4, sizes.length, true); // image count

  let dataOffset = headerSize;
  for (let i = 0; i < sizes.length; i++) {
    const dirOffset = 6 + i * 16;
    const size = sizes[i];
    const pngData = pngBlobs[i];

    view.setUint8(dirOffset, size >= 256 ? 0 : size);     // width (0 = 256)
    view.setUint8(dirOffset + 1, size >= 256 ? 0 : size); // height
    view.setUint8(dirOffset + 2, 0);   // colour palette
    view.setUint8(dirOffset + 3, 0);   // reserved
    view.setUint16(dirOffset + 4, 1, true);  // colour planes
    view.setUint16(dirOffset + 6, 32, true); // bits per pixel
    view.setUint32(dirOffset + 8, pngData.byteLength, true); // data size
    view.setUint32(dirOffset + 12, dataOffset, true);        // data offset

    new Uint8Array(buffer, dataOffset, pngData.byteLength).set(new Uint8Array(pngData));
    dataOffset += pngData.byteLength;
  }

  return new Blob([buffer], { type: "image/x-icon" });
}

export function ImageConverterTool() {
  const [images, setImages] = useState<File[]>([]);
  const [targetFormat, setTargetFormat] = useState<ImageFormat>("webp");
  const [converted, setConverted] = useState<ConvertedImage[]>([]);
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [avifSupported, setAvifSupported] = useState<boolean | null>(null);

  const [resize, setResize] = useState<ResizeOptions>({
    mode: "original",
    width: 0,
    height: 0,
    percentage: 100,
    lockAspectRatio: true,
  });

  const [formatOptions, setFormatOptions] = useState<FormatOptionsMap>({
    png: { transparency: true, backgroundColour: "#ffffff" },
    jpeg: { quality: 90, backgroundColour: "#ffffff" },
    webp: { quality: 90, lossless: false },
    avif: { quality: 80 },
    gif: { maxColours: 256, quantization: "rgb565" },
    bmp: { bitDepth: 32 },
    tiff: {},
    ico: { sizes: [32], multiSize: false },
  });

  const previewUrls = useMemo(() => {
    return images.map((file) => URL.createObjectURL(file));
  }, [images]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const result = canvas.toDataURL("image/avif").startsWith("data:image/avif");
    setAvifSupported(result);
  }, []);

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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const clearAll = () => {
    converted.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
    setConverted([]);
  };

  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const convertImages = async () => {
    setConverting(true);
    setConvertProgress(0);
    converted.forEach((img) => URL.revokeObjectURL(img.url));
    const results: ConvertedImage[] = [];

    for (let fi = 0; fi < images.length; fi++) {
      const file = images[fi];
      try {
        const img = await loadImage(file);
        const { width, height } = getTargetDimensions(img, resize);

        const needsBackground =
          targetFormat === "jpeg" ||
          (targetFormat === "png" && !formatOptions.png.transparency) ||
          (targetFormat === "bmp" && formatOptions.bmp.bitDepth === 24);

        const bgColour =
          targetFormat === "jpeg"
            ? formatOptions.jpeg.backgroundColour
            : targetFormat === "png"
              ? formatOptions.png.backgroundColour
              : "#ffffff";

        const canvas = prepareCanvas(img, width, height, needsBackground, bgColour);

        let blob: Blob;
        switch (targetFormat) {
          case "png":
            blob = await encodePng(canvas, formatOptions.png);
            break;
          case "jpeg":
            blob = await encodeJpeg(canvas, formatOptions.jpeg);
            break;
          case "webp":
            blob = await encodeWebp(canvas, formatOptions.webp);
            break;
          case "avif":
            blob = await encodeAvif(canvas, formatOptions.avif);
            break;
          case "gif":
            blob = await encodeGif(canvas, formatOptions.gif);
            break;
          case "bmp":
            blob = await encodeBmp(canvas, formatOptions.bmp);
            break;
          case "tiff":
            blob = await encodeTiff(canvas, formatOptions.tiff);
            break;
          case "ico":
            blob = await encodeIco(canvas, formatOptions.ico);
            break;
        }

        const ext = targetFormat === "jpeg" ? "jpg" : targetFormat;
        const url = URL.createObjectURL(blob);

        results.push({
          name: file.name.replace(/\.[^.]+$/, `.${ext}`),
          originalFormat: file.type.split("/")[1] || "unknown",
          targetFormat,
          blob,
          size: blob.size,
          url,
        });

        URL.revokeObjectURL(img.src);
        setConvertProgress(Math.round(((fi + 1) / images.length) * 100));
      } catch (err) {
        console.error(`Failed to convert ${file.name}:`, err);
        setConvertProgress(Math.round(((fi + 1) / images.length) * 100));
      }
    }

    setConverted(results);
    setConverting(false);
  };

  const downloadImage = (img: ConvertedImage) => {
    const link = document.createElement("a");
    link.download = img.name;
    link.href = img.url;
    link.click();
  };

  const downloadAllAsZip = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const img of converted) {
      zip.file(img.name, img.blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.download = "converted-images.zip";
    link.href = URL.createObjectURL(zipBlob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const updateFormatOption = <F extends ImageFormat>(
    format: F,
    key: keyof FormatOptionsMap[F],
    value: FormatOptionsMap[F][keyof FormatOptionsMap[F]]
  ) => {
    setFormatOptions((prev) => ({
      ...prev,
      [format]: { ...prev[format], [key]: value },
    }));
  };

  const formatDescriptions: Record<ImageFormat, string> = {
    png: "Lossless, transparency",
    jpeg: "Lossy, small files",
    webp: "Modern, versatile",
    avif: "Next-gen, smallest",
    gif: "Palette-based, legacy",
    bmp: "Uncompressed bitmap",
    tiff: "Archival, large",
    ico: "Icons & favicons",
  };

  const originalTotalSize = images.reduce((sum, f) => sum + f.size, 0);
  const convertedTotalSize = converted.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="space-y-8">
      {/* Scanner Bed Drop Zone */}
      <div
        onDrop={(e) => { handleDrop(e); setDragOver(false); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => document.getElementById("file-input")?.click()}
        className={`
          relative overflow-hidden cursor-pointer
          rounded-lg border-2 transition-all duration-300 ease-out
          ${dragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border/60 hover:border-primary/40 bg-muted/30"
          }
        `}
      >
        <input
          id="file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Corner marks */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-primary/30" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-primary/30" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-primary/30" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-primary/30" />

        {/* Content */}
        <div className="relative py-12 px-8 flex flex-col items-center gap-3">
          <div className={`
            p-3 rounded-full transition-all duration-300
            ${dragOver ? "bg-primary/15 scale-110" : "bg-muted/60"}
          `}>
            <Crosshair className={`size-8 transition-colors duration-300 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-sm tracking-wide uppercase">
              {dragOver ? "Release to scan" : "Load images"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Drop files or click to browse
            </p>
          </div>
        </div>
      </div>

      {/* Format Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Output Format</span>
          <span className="text-xs text-muted-foreground">{formatDescriptions[targetFormat]}</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {(["png", "jpeg", "webp", "avif", "gif", "bmp", "tiff", "ico"] as ImageFormat[]).map((fmt) => {
            const isActive = targetFormat === fmt;
            const isDisabled = fmt === "avif" && avifSupported === false;
            return (
              <button
                key={fmt}
                onClick={() => !isDisabled && setTargetFormat(fmt)}
                disabled={isDisabled}
                className={`
                  relative py-2.5 px-2 rounded-md text-xs font-bold uppercase tracking-wider
                  transition-all duration-200 ease-out
                  ${isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : isDisabled
                      ? "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                `}
                title={isDisabled ? "AVIF not supported in your browser" : undefined}
              >
                {fmt}
              </button>
            );
          })}
          <Link
            href="/tools/image-tracer"
            className="
              py-2.5 px-2 rounded-md text-xs font-bold uppercase tracking-wider text-center
              bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground
              transition-all duration-200 ease-out flex items-center justify-center gap-1
            "
          >
            <LinkIcon className="size-3" />
            SVG
          </Link>
        </div>
        {targetFormat === "avif" && avifSupported === false && (
          <p className="text-xs text-destructive">
            AVIF encoding requires Chrome or Edge.
          </p>
        )}
      </div>

      {/* Settings Panels */}
      <div className="space-y-2">
        {/* Format Options */}
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button className="
              w-full flex items-center justify-between py-2.5 px-3 rounded-md
              text-xs font-semibold uppercase tracking-widest text-muted-foreground
              hover:bg-muted/50 transition-colors duration-200
            ">
              <span className="flex items-center gap-2">
                <span className="w-1 h-3 rounded-full bg-primary" />
                {targetFormat.toUpperCase()} Settings
              </span>
              <ChevronDown className="size-3.5" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-3 pl-3 border-l-2 border-primary/15 space-y-4 py-3">
              {targetFormat === "png" && (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Transparency</Label>
                    <Switch
                      checked={formatOptions.png.transparency}
                      onCheckedChange={(v) => updateFormatOption("png", "transparency", v)}
                    />
                  </div>
                  {!formatOptions.png.transparency && (
                    <div className="flex items-center gap-3">
                      <Label className="text-sm">Fill colour</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formatOptions.png.backgroundColour}
                          onChange={(e) => updateFormatOption("png", "backgroundColour", e.target.value)}
                          className="size-7 rounded cursor-pointer border border-border"
                        />
                        <span className="text-xs text-muted-foreground font-mono">{formatOptions.png.backgroundColour}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {targetFormat === "jpeg" && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Quality</Label>
                      <span className="text-xs font-bold tabular-nums bg-muted px-2 py-0.5 rounded">{formatOptions.jpeg.quality}%</span>
                    </div>
                    <Slider
                      value={[formatOptions.jpeg.quality]}
                      onValueChange={([v]) => updateFormatOption("jpeg", "quality", v)}
                      min={1}
                      max={100}
                      step={1}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm">Background</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formatOptions.jpeg.backgroundColour}
                        onChange={(e) => updateFormatOption("jpeg", "backgroundColour", e.target.value)}
                        className="size-7 rounded cursor-pointer border border-border"
                      />
                      <span className="text-xs text-muted-foreground font-mono">{formatOptions.jpeg.backgroundColour}</span>
                    </div>
                  </div>
                </>
              )}

              {targetFormat === "webp" && (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Lossless</Label>
                    <Switch
                      checked={formatOptions.webp.lossless}
                      onCheckedChange={(v) => updateFormatOption("webp", "lossless", v)}
                    />
                  </div>
                  {!formatOptions.webp.lossless && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Quality</Label>
                        <span className="text-xs font-bold tabular-nums bg-muted px-2 py-0.5 rounded">{formatOptions.webp.quality}%</span>
                      </div>
                      <Slider
                        value={[formatOptions.webp.quality]}
                        onValueChange={([v]) => updateFormatOption("webp", "quality", v)}
                        min={1}
                        max={100}
                        step={1}
                      />
                    </div>
                  )}
                </>
              )}

              {targetFormat === "avif" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Quality</Label>
                    <span className="text-xs font-bold tabular-nums bg-muted px-2 py-0.5 rounded">{formatOptions.avif.quality}%</span>
                  </div>
                  <Slider
                    value={[formatOptions.avif.quality]}
                    onValueChange={([v]) => updateFormatOption("avif", "quality", v)}
                    min={1}
                    max={100}
                    step={1}
                  />
                </div>
              )}

              {targetFormat === "gif" && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Palette</Label>
                      <span className="text-xs font-bold tabular-nums bg-muted px-2 py-0.5 rounded">{formatOptions.gif.maxColours} colours</span>
                    </div>
                    <Slider
                      value={[formatOptions.gif.maxColours]}
                      onValueChange={([v]) => updateFormatOption("gif", "maxColours", v)}
                      min={2}
                      max={256}
                      step={1}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Quantization</Label>
                    <Select
                      value={formatOptions.gif.quantization}
                      onValueChange={(v) => updateFormatOption("gif", "quantization", v as GifOptions["quantization"])}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rgb565">RGB565 &mdash; best quality</SelectItem>
                        <SelectItem value="rgb444">RGB444 &mdash; smaller</SelectItem>
                        <SelectItem value="rgba4444">RGBA4444 &mdash; transparency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {targetFormat === "bmp" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Bit depth</Label>
                  <RadioGroup
                    value={String(formatOptions.bmp.bitDepth)}
                    onValueChange={(v) => updateFormatOption("bmp", "bitDepth", Number(v) as 24 | 32)}
                    className="flex gap-3"
                  >
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="24" id="bmp-24" />
                      <Label htmlFor="bmp-24" className="text-sm">24-bit</Label>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="32" id="bmp-32" />
                      <Label htmlFor="bmp-32" className="text-sm">32-bit (alpha)</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {targetFormat === "tiff" && (
                <p className="text-xs text-muted-foreground">
                  Uncompressed output. Expect large file sizes.
                </p>
              )}

              {targetFormat === "ico" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Size</Label>
                    <Select
                      value={String(formatOptions.ico.sizes[0])}
                      onValueChange={(v) =>
                        updateFormatOption("ico", "sizes",
                          formatOptions.ico.multiSize
                            ? [...new Set([Number(v), ...formatOptions.ico.sizes])]
                            : [Number(v)]
                        )
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[16, 32, 48, 64, 128, 256].map((s) => (
                          <SelectItem key={s} value={String(s)}>{s}&times;{s}px</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Multi-size bundle</Label>
                    <Switch
                      checked={formatOptions.ico.multiSize}
                      onCheckedChange={(v) => {
                        setFormatOptions((prev) => ({
                          ...prev,
                          ico: {
                            ...prev.ico,
                            multiSize: v,
                            sizes: v ? [16, 32, 48, 64, 128, 256] : [prev.ico.sizes[0] || 32],
                          },
                        }));
                      }}
                    />
                  </div>
                  {formatOptions.ico.multiSize && (
                    <p className="text-xs text-muted-foreground">
                      Embedding {[...formatOptions.ico.sizes].sort((a, b) => a - b).join(", ")}px
                    </p>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Resize */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="
              w-full flex items-center justify-between py-2.5 px-3 rounded-md
              text-xs font-semibold uppercase tracking-widest text-muted-foreground
              hover:bg-muted/50 transition-colors duration-200
            ">
              <span className="flex items-center gap-2">
                <span className="w-1 h-3 rounded-full bg-muted-foreground/30" />
                Resize
                {resize.mode !== "original" && (
                  <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold normal-case tracking-normal">
                    {resize.mode === "percentage" ? `${resize.percentage}%` : `${resize.width || "?"}x${resize.height || "?"}`}
                  </span>
                )}
              </span>
              <ChevronDown className="size-3.5" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-3 pl-3 border-l-2 border-muted space-y-4 py-3">
              <RadioGroup
                value={resize.mode}
                onValueChange={(v) => setResize((prev) => ({ ...prev, mode: v as ResizeMode }))}
                className="flex gap-3"
              >
                {([
                  ["original", "Original"],
                  ["custom", "Custom"],
                  ["percentage", "Scale %"],
                ] as const).map(([val, label]) => (
                  <div key={val} className="flex items-center space-x-1.5">
                    <RadioGroupItem value={val} id={`resize-${val}`} />
                    <Label htmlFor={`resize-${val}`} className="text-sm">{label}</Label>
                  </div>
                ))}
              </RadioGroup>

              {resize.mode === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="W"
                    value={resize.width || ""}
                    onChange={(e) => setResize((prev) => ({ ...prev, width: Number(e.target.value) }))}
                    className="w-24 h-9 text-xs tabular-nums"
                  />
                  <span className="text-muted-foreground text-xs">&times;</span>
                  <Input
                    type="number"
                    placeholder="H"
                    value={resize.height || ""}
                    onChange={(e) => setResize((prev) => ({ ...prev, height: Number(e.target.value) }))}
                    className="w-24 h-9 text-xs tabular-nums"
                  />
                  <button
                    onClick={() => setResize((prev) => ({ ...prev, lockAspectRatio: !prev.lockAspectRatio }))}
                    className={`p-1.5 rounded transition-colors ${resize.lockAspectRatio ? "text-primary" : "text-muted-foreground"}`}
                    title={resize.lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                  >
                    {resize.lockAspectRatio ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </button>
                </div>
              )}

              {resize.mode === "percentage" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={resize.percentage}
                      onChange={(e) => setResize((prev) => ({ ...prev, percentage: Number(e.target.value) }))}
                      className="w-20 h-9 text-xs tabular-nums"
                      min={1}
                      max={1000}
                    />
                    <span className="text-muted-foreground text-xs">%</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[25, 50, 75, 150, 200].map((p) => (
                      <button
                        key={p}
                        onClick={() => setResize((prev) => ({ ...prev, percentage: p }))}
                        className={`
                          px-2.5 py-1 rounded text-xs font-bold transition-all duration-200
                          ${resize.percentage === p
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }
                        `}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Image Queue */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {images.length} file{images.length !== 1 ? "s" : ""} queued
            </span>
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          </div>

          <div className="space-y-1.5">
            {images.map((file, index) => (
              <div
                key={index}
                className="group flex items-center gap-3 p-2 rounded-md hover:bg-muted/40 transition-colors duration-150"
              >
                <div className="size-10 rounded bg-muted/70 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={previewUrls[index]}
                    alt={file.name}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
                  {formatSize(file.size)}
                </span>
                <button
                  onClick={() => removeImage(index)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-all duration-150"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Convert Button */}
          <button
            onClick={convertImages}
            disabled={converting}
            className={`
              relative w-full overflow-hidden rounded-lg py-4 font-bold text-sm uppercase tracking-wider
              transition-all duration-300 ease-out
              ${converting
                ? "bg-primary/80 text-primary-foreground cursor-wait"
                : "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
              }
            `}
          >
            {/* Progress bar */}
            {converting && (
              <div
                className="absolute inset-y-0 left-0 bg-primary-foreground/10 transition-all duration-300"
                style={{ width: `${convertProgress}%` }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {converting ? (
                <>Processing {convertProgress}%</>
              ) : (
                <>
                  Convert to {targetFormat.toUpperCase()}
                  <ArrowRight className="size-4" />
                </>
              )}
            </span>
          </button>
        </div>
      )}

      {/* Results */}
      {converted.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Output</span>
              {originalTotalSize > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatSize(originalTotalSize)}
                  <ArrowRight className="size-2.5 inline mx-1" />
                  {formatSize(convertedTotalSize)}
                  {convertedTotalSize < originalTotalSize && (
                    <span className="text-primary ml-1">
                      -{Math.round((1 - convertedTotalSize / originalTotalSize) * 100)}%
                    </span>
                  )}
                  {convertedTotalSize > originalTotalSize && (
                    <span className="text-destructive ml-1">
                      +{Math.round((convertedTotalSize / originalTotalSize - 1) * 100)}%
                    </span>
                  )}
                </span>
              )}
            </div>
            {converted.length >= 2 && (
              <button
                onClick={downloadAllAsZip}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                <Archive className="size-3.5" />
                Download ZIP
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {converted.map((img, index) => {
              const originalFile = images[index];
              const sizeDelta = originalFile ? img.size - originalFile.size : 0;
              return (
                <div
                  key={index}
                  className="group flex items-center gap-3 p-2 rounded-md bg-card border border-border/50"
                >
                  <div className="size-10 rounded bg-muted/70 flex items-center justify-center overflow-hidden shrink-0">
                    {img.targetFormat === "ico" || img.targetFormat === "bmp" || img.targetFormat === "tiff" ? (
                      <ImageIcon className="size-5 text-muted-foreground" />
                    ) : (
                      <img
                        src={img.url}
                        alt={img.name}
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{img.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] tabular-nums text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                      {formatSize(img.size)}
                      {originalFile && sizeDelta !== 0 && (
                        <span className={sizeDelta < 0 ? "text-primary ml-1" : "text-destructive ml-1"}>
                          {sizeDelta < 0 ? "" : "+"}{Math.round((sizeDelta / originalFile.size) * 100)}%
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => downloadImage(img)}
                      className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Download className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
