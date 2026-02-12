"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, Download, X, ImageIcon, Link as LinkIcon, ChevronDown, Lock, Unlock, Archive } from "lucide-react";
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
  progressive: boolean;
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

interface TiffOptions {
  // uncompressed only
}

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
    return { width: resize.width || img.naturalWidth, height: resize.height || img.naturalHeight };
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}

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

  let offset = headerSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (bpp === 32) {
        view.setUint8(offset, data[i + 2]);     // B
        view.setUint8(offset + 1, data[i + 1]); // G
        view.setUint8(offset + 2, data[i]);     // R
        view.setUint8(offset + 3, data[i + 3]); // A
        offset += 4;
      } else {
        view.setUint8(offset, data[i + 2]);     // B
        view.setUint8(offset + 1, data[i + 1]); // G
        view.setUint8(offset + 2, data[i]);     // R
        offset += 3;
      }
    }
    // Pad row to 4-byte boundary
    while (offset % 4 !== 0) {
      view.setUint8(offset, 0);
      offset++;
    }
  }

  return new Blob([buffer], { type: "image/bmp" });
}

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
    jpeg: { quality: 90, progressive: false, backgroundColour: "#ffffff" },
    webp: { quality: 90, lossless: false },
    avif: { quality: 80 },
    gif: { maxColours: 256, quantization: "rgb565" },
    bmp: { bitDepth: 32 },
    tiff: {},
    ico: { sizes: [32], multiSize: false },
  });

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
    const results: ConvertedImage[] = [];

    for (const file of images) {
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
      } catch (err) {
        console.error(`Failed to convert ${file.name}:`, err);
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

  return (
    <div className="space-y-6">
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
      <div className="space-y-3">
        <label className="font-bold block">Convert to</label>
        <div className="flex flex-wrap gap-2">
          {(["png", "jpeg", "webp", "avif", "gif", "bmp", "tiff", "ico"] as ImageFormat[]).map((fmt) => (
            <Button
              key={fmt}
              variant={targetFormat === fmt ? "default" : "outline"}
              onClick={() => setTargetFormat(fmt)}
              className="uppercase font-bold"
              size="lg"
              disabled={fmt === "avif" && avifSupported === false}
              title={fmt === "avif" && avifSupported === false ? "AVIF encoding not supported in your browser" : undefined}
            >
              {fmt}
            </Button>
          ))}
          <Button
            variant="outline"
            className="uppercase font-bold"
            size="lg"
            asChild
          >
            <Link href="/tools/image-tracer">
              <LinkIcon className="size-4 mr-1.5" />
              SVG
            </Link>
          </Button>
        </div>
        {targetFormat === "avif" && avifSupported === false && (
          <p className="text-sm text-destructive">
            Your browser does not support AVIF encoding. Try Chrome or Edge.
          </p>
        )}
      </div>

      {/* Format Options */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between font-bold">
            Format Options
            <ChevronDown className="size-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 pt-2 pb-1">
            {targetFormat === "png" && (
              <>
                <div className="flex items-center justify-between">
                  <Label>Preserve transparency</Label>
                  <Switch
                    checked={formatOptions.png.transparency}
                    onCheckedChange={(v) => updateFormatOption("png", "transparency", v)}
                  />
                </div>
                {!formatOptions.png.transparency && (
                  <div className="flex items-center gap-3">
                    <Label>Background</Label>
                    <input
                      type="color"
                      value={formatOptions.png.backgroundColour}
                      onChange={(e) => updateFormatOption("png", "backgroundColour", e.target.value)}
                      className="size-8 rounded border cursor-pointer"
                    />
                  </div>
                )}
              </>
            )}

            {targetFormat === "jpeg" && (
              <>
                <div className="space-y-2">
                  <Label>Quality: {formatOptions.jpeg.quality}%</Label>
                  <Slider
                    value={[formatOptions.jpeg.quality]}
                    onValueChange={([v]) => updateFormatOption("jpeg", "quality", v)}
                    min={1}
                    max={100}
                    step={1}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Progressive</Label>
                  <Switch
                    checked={formatOptions.jpeg.progressive}
                    onCheckedChange={(v) => updateFormatOption("jpeg", "progressive", v)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label>Background for transparent images</Label>
                  <input
                    type="color"
                    value={formatOptions.jpeg.backgroundColour}
                    onChange={(e) => updateFormatOption("jpeg", "backgroundColour", e.target.value)}
                    className="size-8 rounded border cursor-pointer"
                  />
                </div>
              </>
            )}

            {targetFormat === "webp" && (
              <>
                <div className="flex items-center justify-between">
                  <Label>Lossless</Label>
                  <Switch
                    checked={formatOptions.webp.lossless}
                    onCheckedChange={(v) => updateFormatOption("webp", "lossless", v)}
                  />
                </div>
                {!formatOptions.webp.lossless && (
                  <div className="space-y-2">
                    <Label>Quality: {formatOptions.webp.quality}%</Label>
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
                <Label>Quality: {formatOptions.avif.quality}%</Label>
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
                  <Label>Max colours: {formatOptions.gif.maxColours}</Label>
                  <Slider
                    value={[formatOptions.gif.maxColours]}
                    onValueChange={([v]) => updateFormatOption("gif", "maxColours", v)}
                    min={2}
                    max={256}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantization</Label>
                  <Select
                    value={formatOptions.gif.quantization}
                    onValueChange={(v) => updateFormatOption("gif", "quantization", v as GifOptions["quantization"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rgb565">RGB565 (best quality)</SelectItem>
                      <SelectItem value="rgb444">RGB444 (smaller)</SelectItem>
                      <SelectItem value="rgba4444">RGBA4444 (with transparency)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {targetFormat === "bmp" && (
              <div className="space-y-2">
                <Label>Bit depth</Label>
                <RadioGroup
                  value={String(formatOptions.bmp.bitDepth)}
                  onValueChange={(v) => updateFormatOption("bmp", "bitDepth", Number(v) as 24 | 32)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="24" id="bmp-24" />
                    <Label htmlFor="bmp-24">24-bit (no transparency)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="32" id="bmp-32" />
                    <Label htmlFor="bmp-32">32-bit (with alpha)</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {targetFormat === "tiff" && (
              <p className="text-sm text-muted-foreground">
                TIFF output is uncompressed. Files may be large.
              </p>
            )}

            {targetFormat === "ico" && (
              <>
                <div className="space-y-2">
                  <Label>Icon size</Label>
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[16, 32, 48, 64, 128, 256].map((s) => (
                        <SelectItem key={s} value={String(s)}>{s}x{s}px</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Multi-size ICO (embed all standard sizes)</Label>
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
                  <p className="text-sm text-muted-foreground">
                    Sizes: {formatOptions.ico.sizes.sort((a, b) => a - b).join(", ")}px
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
          <Button variant="ghost" className="w-full justify-between font-bold">
            Resize
            <ChevronDown className="size-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 pt-2 pb-1">
            <RadioGroup
              value={resize.mode}
              onValueChange={(v) => setResize((prev) => ({ ...prev, mode: v as ResizeMode }))}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="original" id="resize-original" />
                <Label htmlFor="resize-original">Original size</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="resize-custom" />
                <Label htmlFor="resize-custom">Custom dimensions</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percentage" id="resize-percentage" />
                <Label htmlFor="resize-percentage">Percentage</Label>
              </div>
            </RadioGroup>

            {resize.mode === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Width"
                  value={resize.width || ""}
                  onChange={(e) => setResize((prev) => ({ ...prev, width: Number(e.target.value) }))}
                  className="w-28"
                />
                <span className="text-muted-foreground font-bold">&times;</span>
                <Input
                  type="number"
                  placeholder="Height"
                  value={resize.height || ""}
                  onChange={(e) => setResize((prev) => ({ ...prev, height: Number(e.target.value) }))}
                  className="w-28"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setResize((prev) => ({ ...prev, lockAspectRatio: !prev.lockAspectRatio }))}
                  title={resize.lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                >
                  {resize.lockAspectRatio ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                </Button>
              </div>
            )}

            {resize.mode === "percentage" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={resize.percentage}
                    onChange={(e) => setResize((prev) => ({ ...prev, percentage: Number(e.target.value) }))}
                    className="w-24"
                    min={1}
                    max={1000}
                  />
                  <span className="text-muted-foreground font-bold">%</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[25, 50, 75, 150, 200].map((p) => (
                    <Button
                      key={p}
                      variant={resize.percentage === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => setResize((prev) => ({ ...prev, percentage: p }))}
                    >
                      {p}%
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

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
            {converted.length >= 2 && (
              <Button variant="outline" onClick={downloadAllAsZip}>
                <Archive className="size-4 mr-2" />
                Download All as ZIP
              </Button>
            )}
          </div>

          <div className="grid gap-3">
            {converted.map((img, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card"
              >
                <div className="size-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                  {img.targetFormat === "ico" || img.targetFormat === "bmp" || img.targetFormat === "tiff" ? (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  ) : (
                    <img
                      src={img.url}
                      alt={img.name}
                      className="size-full object-cover"
                    />
                  )}
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
