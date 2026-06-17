"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Copy, Check, Trash2, X, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useColourNotation } from "@/hooks/use-colour-notation";
import { formatColour } from "@/lib/colour-notation";
import { getColourName } from "@/lib/colour-names";
import { useFilePaste } from "@/hooks/use-file-paste";

interface Swatch {
  hex: string;
  p3: string | null;
}

const MAX_CANVAS_EDGE = 2000;

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function detectP3Support(): boolean {
  if (typeof CSS === "undefined" || !CSS.supports) return false;
  return CSS.supports("color", "color(display-p3 1 0 0)");
}

const LOUPE_RADIUS = 10;
const LOUPE_PIXEL_SIZE = 8;
const LOUPE_SIZE = (LOUPE_RADIUS * 2 + 1) * LOUPE_PIXEL_SIZE;

export function PixelPickerTool() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [p3Mode, setP3Mode] = useState(false);
  const [p3Supported] = useState(() => detectP3Support());
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [hoverPos, setHoverPos] = useState<{
    loupeLeft: number;
    loupeTop: number;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [activeSwatch, setActiveSwatch] = useState<number | null>(null);

  const { notation } = useColourNotation();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const p3CanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const drawImage = useCallback(
    (file: File) => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setImageFile(file);
      setSwatches([]);
      setActiveSwatch(null);

      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (Math.max(w, h) > MAX_CANVAS_EDGE) {
          const scale = MAX_CANVAS_EDGE / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);

        if (p3Supported) {
          const p3c = document.createElement("canvas");
          p3c.width = w;
          p3c.height = h;
          const p3ctx = p3c.getContext("2d", {
            colorSpace: "display-p3",
          } as CanvasRenderingContext2DSettings);
          if (p3ctx) {
            p3ctx.drawImage(img, 0, 0, w, h);
            p3CanvasRef.current = p3c;
          }
        }
      };
      img.src = url;
    },
    [imageUrl, p3Supported]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = Array.from(e.dataTransfer.files).find((f) =>
        f.type.startsWith("image/")
      );
      if (file) drawImage(file);
    },
    [drawImage]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) drawImage(file);
  };

  useFilePaste(drawImage, "image/*");

  const canvasToPixel = (
    e: React.MouseEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(
      ((e.clientX - rect.left) * canvas.width) / rect.width
    );
    const y = Math.floor(
      ((e.clientY - rect.top) * canvas.height) / rect.height
    );
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x, y };
  };

  const samplePixel = (x: number, y: number): Swatch | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!ctx) return null;
    const data = ctx.getImageData(x, y, 1, 1).data;
    const hex = rgbToHex(data[0], data[1], data[2]);

    let p3: string | null = null;
    if (p3Mode && p3CanvasRef.current) {
      const p3ctx = p3CanvasRef.current.getContext("2d", {
        colorSpace: "display-p3",
      } as CanvasRenderingContext2DSettings);
      if (p3ctx) {
        const p3data = p3ctx.getImageData(x, y, 1, 1).data;
        const [r, g, b] = [p3data[0] / 255, p3data[1] / 255, p3data[2] / 255];
        p3 = `color(display-p3 ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)})`;
      }
    }

    return { hex, p3 };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = canvasToPixel(e);
    if (!pos) return;
    const swatch = samplePixel(pos.x, pos.y);
    if (!swatch) return;
    const newSwatches = [...swatches, swatch];
    setSwatches(newSwatches);
    setActiveSwatch(newSwatches.length - 1);
  };

  const drawLoupe = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    const loupe = loupeCanvasRef.current;
    if (!canvas || !loupe) return;

    const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
    const lctx = loupe.getContext("2d");
    if (!ctx || !lctx) return;

    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = "#1a1a1a";
    lctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);

    const sx = Math.max(0, x - LOUPE_RADIUS);
    const sy = Math.max(0, y - LOUPE_RADIUS);
    const ex = Math.min(canvas.width, x + LOUPE_RADIUS + 1);
    const ey = Math.min(canvas.height, y + LOUPE_RADIUS + 1);
    const rw = ex - sx;
    const rh = ey - sy;

    if (rw > 0 && rh > 0) {
      const imageData = ctx.getImageData(sx, sy, rw, rh);
      const data = imageData.data;
      const offX = sx - (x - LOUPE_RADIUS);
      const offY = sy - (y - LOUPE_RADIUS);

      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const i = (py * rw + px) * 4;
          lctx.fillStyle = `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`;
          lctx.fillRect(
            (px + offX) * LOUPE_PIXEL_SIZE,
            (py + offY) * LOUPE_PIXEL_SIZE,
            LOUPE_PIXEL_SIZE,
            LOUPE_PIXEL_SIZE
          );
        }
      }
    }

    const cx = LOUPE_RADIUS * LOUPE_PIXEL_SIZE;
    const cy = LOUPE_RADIUS * LOUPE_PIXEL_SIZE;
    lctx.strokeStyle = "rgba(255,255,255,0.8)";
    lctx.lineWidth = 1.5;
    lctx.strokeRect(cx, cy, LOUPE_PIXEL_SIZE, LOUPE_PIXEL_SIZE);
    lctx.strokeStyle = "rgba(0,0,0,0.5)";
    lctx.lineWidth = 0.5;
    lctx.strokeRect(
      cx - 0.5,
      cy - 0.5,
      LOUPE_PIXEL_SIZE + 1,
      LOUPE_PIXEL_SIZE + 1
    );
  }, []);

  const handleCanvasMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(
        ((e.clientX - rect.left) * canvas.width) / rect.width
      );
      const y = Math.floor(
        ((e.clientY - rect.top) * canvas.height) / rect.height
      );
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        setHoverPos(null);
        return;
      }
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const cw = container.clientWidth;
      const ch = rect.height;
      const flipX = cssX + 20 + LOUPE_SIZE > cw;
      setHoverPos({
        loupeLeft: flipX ? cssX - 20 - LOUPE_SIZE : cssX + 20,
        loupeTop: Math.max(
          0,
          Math.min(ch - LOUPE_SIZE, cssY - LOUPE_SIZE / 2)
        ),
      });
      drawLoupe(x, y);
    },
    [drawLoupe]
  );

  const handleCanvasLeave = () => setHoverPos(null);

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  };

  const removeSwatch = (index: number) => {
    setSwatches((prev) => prev.filter((_, i) => i !== index));
    if (activeSwatch === index) {
      setActiveSwatch(null);
    } else if (activeSwatch !== null && activeSwatch > index) {
      setActiveSwatch(activeSwatch - 1);
    }
  };

  const clearSwatches = () => {
    setSwatches([]);
    setActiveSwatch(null);
  };

  const clearImage = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageFile(null);
    setImageUrl(null);
    setSwatches([]);
    setActiveSwatch(null);
    setHoverPos(null);
    p3CanvasRef.current = null;
  };

  const active = activeSwatch !== null ? swatches[activeSwatch] : null;

  return (
    <div className="border-2 border-border">
      {!imageFile ? (
        /* Drop zone — full-bleed, flush inside frame */
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-3 p-12 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => document.getElementById("pixel-picker-input")?.click()}
        >
          <input
            id="pixel-picker-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-10 text-muted-foreground" />
          <div>
            <p className="font-bold">Drop an image here</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              or click to select a file, or paste
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Top bar — filename + P3 toggle */}
          <div className="flex items-center border-b-2 border-border">
            <div className="flex flex-1 items-center gap-2 px-4 py-3 min-w-0">
              <span className="text-sm text-muted-foreground truncate">
                {imageFile.name}
              </span>
            </div>
            {p3Supported && (
              <div className="flex items-center gap-2 px-4 py-3 border-l border-border shrink-0">
                <Label htmlFor="p3-toggle" className="text-sm cursor-pointer">
                  Display P3
                </Label>
                <Switch
                  id="p3-toggle"
                  checked={p3Mode}
                  onCheckedChange={setP3Mode}
                />
              </div>
            )}
            <button
              type="button"
              onClick={clearImage}
              aria-label="Remove image"
              className="flex items-center justify-center w-12 h-full border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Canvas area — bleeds to frame edges */}
          <div ref={containerRef} className="relative border-b-2 border-border">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMove}
              onMouseLeave={handleCanvasLeave}
              className="block w-full cursor-crosshair"
              style={{ imageRendering: "auto" }}
            />

            {hoverPos && (
              <div
                className="pointer-events-none absolute border-2 border-background shadow-lg overflow-hidden"
                style={{
                  width: LOUPE_SIZE,
                  height: LOUPE_SIZE,
                  left: hoverPos.loupeLeft,
                  top: hoverPos.loupeTop,
                }}
              >
                <canvas
                  ref={loupeCanvasRef}
                  width={LOUPE_SIZE}
                  height={LOUPE_SIZE}
                  className="block"
                />
              </div>
            )}
          </div>

          {/* Hint bar */}
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-b-2 border-border">
            <Crosshair className="size-3.5 shrink-0" />
            <span>Click anywhere on the image to sample a colour</span>
          </div>

          {/* Active swatch detail */}
          {active && (() => {
            const value = formatColour(active.hex, notation);
            const name = getColourName(active.hex);
            const isCopied = copied === value;
            return (
              <div className="flex items-stretch border-b-2 border-border">
                {/* colour swatch cell */}
                <div
                  className="w-14 shrink-0 self-stretch"
                  style={{ backgroundColor: active.hex }}
                />
                {/* label / value */}
                <div className="flex-1 flex flex-col justify-center px-4 py-3 min-w-0 border-l border-border">
                  <span
                    className="font-bold text-sm"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {notation === "hex" ? active.hex.toUpperCase() : value}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize truncate mt-0.5">
                    {name}
                  </span>
                  {p3Mode && active.p3 && (
                    <span
                      className="text-xs text-muted-foreground mt-0.5 truncate"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      {active.p3}
                    </span>
                  )}
                </div>
                {/* copy action */}
                <button
                  type="button"
                  aria-label="Copy colour value"
                  onClick={() => copyValue(value)}
                  className="flex w-12 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                >
                  {isCopied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
            );
          })()}

          {/* Sampled swatches table */}
          {swatches.length > 0 && (
            <div className="border-b-2 border-border">
              {/* Table header */}
              <div className="flex items-center px-4 py-2 border-b border-border">
                <span className="flex-1 font-bold text-sm">Sampled colours</span>
                <button
                  type="button"
                  onClick={clearSwatches}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Trash2 className="size-3" />
                  Clear all
                </button>
              </div>

              {/* Rows */}
              {swatches.map((swatch, i) => {
                const swatchValue = formatColour(swatch.hex, notation);
                const isActive = activeSwatch === i;
                const isCopiedSwatch = copied === swatchValue;
                return (
                  <div
                    key={`${i}-${swatch.hex}`}
                    className={cn(
                      "flex items-stretch border-b border-border last:border-b-0 cursor-pointer transition-colors",
                      isActive ? "bg-muted" : "hover:bg-muted/50"
                    )}
                    onClick={() => setActiveSwatch(i)}
                  >
                    {/* swatch cell */}
                    <div
                      className="w-10 shrink-0 self-stretch"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    {/* hex + name */}
                    <div className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0 border-l border-border">
                      <span
                        className="text-sm font-bold shrink-0"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        {swatch.hex.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground truncate capitalize">
                        {getColourName(swatch.hex)}
                      </span>
                    </div>
                    {/* copy */}
                    <button
                      type="button"
                      aria-label="Copy colour value"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyValue(swatchValue);
                      }}
                      className="flex w-10 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                    >
                      {isCopiedSwatch ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                    {/* remove */}
                    <button
                      type="button"
                      aria-label="Remove swatch"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSwatch(i);
                      }}
                      className="flex w-10 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Colour space info */}
          <div className="px-4 py-3 text-sm text-muted-foreground">
            <span className="font-bold text-foreground">About colour spaces — </span>
            Colours are sampled in sRGB by default. Images with wide-gamut
            colour profiles (Display P3, Adobe RGB) are converted to sRGB, which
            may shift some colours.
            {p3Supported
              ? " Enable the Display P3 toggle to sample wide-gamut values and get color(display-p3 …) CSS output."
              : " Your browser does not support Display P3 colour sampling."}
          </div>
        </>
      )}
    </div>
  );
}
