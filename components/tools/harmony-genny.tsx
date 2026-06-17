"use client";

import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useColourNotation } from "@/hooks/use-colour-notation";
import { formatColour } from "@/lib/colour-notation";

// Colour utilities
function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055;
  return Math.max(0, Math.min(255, v * 255));
}

function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bVal = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  const c = Math.sqrt(a * a + bVal * bVal);
  let h = Math.atan2(bVal, a) * 180 / Math.PI;
  if (h < 0) h += 360;

  return [L, c, h];
}

function oklchToRgb(L: number, c: number, h: number): [number, number, number] {
  const hRad = h * Math.PI / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);

  const lr =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

type HarmonyType = "complementary" | "analogous" | "triadic" | "split-complementary" | "tetradic" | "monochromatic" | "double-complementary" | "compound" | "pentadic" | "analogous-accent" | "golden" | "near-complementary";

interface HarmonyInfo {
  name: string;
  description: string;
  angles: number[];
}

const HARMONIES: Record<HarmonyType, HarmonyInfo> = {
  complementary: {
    name: "Complementary",
    description: "Two colours opposite on the colour wheel",
    angles: [0, 180],
  },
  analogous: {
    name: "Analogous",
    description: "Three colours adjacent on the wheel",
    angles: [-30, 0, 30],
  },
  triadic: {
    name: "Triadic",
    description: "Three colours evenly spaced (120° apart)",
    angles: [0, 120, 240],
  },
  "split-complementary": {
    name: "Split-Complementary",
    description: "Base colour plus two adjacent to its complement",
    angles: [0, 150, 210],
  },
  tetradic: {
    name: "Tetradic (Square)",
    description: "Four colours evenly spaced (90° apart)",
    angles: [0, 90, 180, 270],
  },
  monochromatic: {
    name: "Monochromatic",
    description: "Single hue with varying lightness",
    angles: [0], // Special case - we vary lightness instead
  },
  "double-complementary": {
    name: "Double Complementary",
    description: "Two complementary pairs forming a rectangle",
    angles: [0, 60, 180, 240],
  },
  compound: {
    name: "Compound",
    description: "Analogous colours plus their complements",
    angles: [0, 30, 180, 210],
  },
  pentadic: {
    name: "Pentadic",
    description: "Five colours evenly spaced (72° apart)",
    angles: [0, 72, 144, 216, 288],
  },
  "analogous-accent": {
    name: "Analogous Accent",
    description: "Analogous colours with a complementary accent",
    angles: [-30, 0, 30, 180],
  },
  golden: {
    name: "Golden Ratio",
    description: "Colours spaced by the golden angle (137.5°)",
    angles: [0, 137.5, 275],
  },
  "near-complementary": {
    name: "Near Complementary",
    description: "Slightly off-complement for softer contrast",
    angles: [0, 165],
  },
};

interface ColourSwatch {
  hex: string;
  rgb: [number, number, number];
  oklch: [number, number, number];
  angle: number;
}

function generateHarmony(baseHex: string, type: HarmonyType): ColourSwatch[] | null {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return null;

  const [L, c, h] = rgbToOklch(...rgb);
  const harmony = HARMONIES[type];

  if (type === "monochromatic") {
    // Generate 5 shades with same hue
    const lightnesses = [0.85, 0.70, L, 0.40, 0.25];
    return lightnesses.map((newL, i) => {
      const newRgb = oklchToRgb(newL, c * (newL > 0.7 ? 0.5 : 1), h);
      const clampedRgb: [number, number, number] = [
        Math.round(Math.max(0, Math.min(255, newRgb[0]))),
        Math.round(Math.max(0, Math.min(255, newRgb[1]))),
        Math.round(Math.max(0, Math.min(255, newRgb[2]))),
      ];
      return {
        hex: rgbToHex(...clampedRgb),
        rgb: clampedRgb,
        oklch: [newL, c, h],
        angle: 0,
      };
    });
  }

  return harmony.angles.map(angle => {
    const newH = (h + angle + 360) % 360;
    const newRgb = oklchToRgb(L, c, newH);
    const clampedRgb: [number, number, number] = [
      Math.round(Math.max(0, Math.min(255, newRgb[0]))),
      Math.round(Math.max(0, Math.min(255, newRgb[1]))),
      Math.round(Math.max(0, Math.min(255, newRgb[2]))),
    ];
    return {
      hex: rgbToHex(...clampedRgb),
      rgb: clampedRgb,
      oklch: [L, c, newH],
      angle,
    };
  });
}

export function HarmonyGennyTool() {
  const [baseColour, setBaseColour] = useState("#3b82f6");
  const [harmonyType, setHarmonyType] = useState<HarmonyType>("complementary");
  const [colours, setColours] = useState<ColourSwatch[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { notation } = useColourNotation();

  useEffect(() => {
    const result = generateHarmony(baseColour, harmonyType);
    setColours(result);
  }, [baseColour, harmonyType]);

  // Pair each swatch with its position so render keys stay unique even when a
  // monochromatic harmony clamps two lightness levels to the same hex (angle is 0 for all).
  const swatches = colours?.map((colour, position) => ({ colour, position })) ?? [];

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyAllHex = () => {
    if (!colours) return;
    const values = colours.map(c => formatColour(c.hex, notation)).join(", ");
    copyValue(values, "all");
  };

  const copyAsCssVariables = () => {
    if (!colours) return;
    const vars = colours.map((c, i) => `  --harmony-${i + 1}: ${formatColour(c.hex, notation)};`).join("\n");
    copyValue(`:root {\n${vars}\n}`, "css");
  };

  const harmonyKeys = Object.keys(HARMONIES) as HarmonyType[];

  return (
    <div className="border-2 border-border">

      {/* ── Base colour input ─────────────────────────────────────────── */}
      <div className="border-b-2 border-border p-4">
        <label className="font-bold">Base Colour</label>
        <div className="mt-3 flex items-stretch border border-border">
          {/* Native colour picker swatch */}
          <div className="relative w-14 shrink-0 border-r border-border">
            <div
              className="size-full"
              style={{ backgroundColor: baseColour }}
              aria-hidden
            />
            <input
              type="color"
              value={baseColour}
              onChange={(e) => setBaseColour(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </div>
          {/* Hex text input */}
          <Input
            value={baseColour}
            onChange={(e) => setBaseColour(e.target.value)}
            placeholder="#3b82f6"
            className="flex-1 border-0 bg-transparent"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </div>
      </div>

      {/* ── Harmony type segmented (4 cols × 3 rows = 12) ────────────── */}
      <div className="border-b-2 border-border p-4">
        <label className="font-bold">Harmony Type</label>
        <div className="segmented mt-3 grid-cols-4 -mx-4 -mb-4 border-x-0 border-b-0">
          {harmonyKeys.map((key) => (
            <Button
              key={key}
              variant={harmonyType === key ? "default" : "outline"}
              onClick={() => setHarmonyType(key)}
              className="h-auto flex-col gap-0.5 py-2 text-left"
            >
              <span className="w-full text-xs font-bold leading-tight">
                {HARMONIES[key].name}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* ── Harmony description ───────────────────────────────────────── */}
      <div className="border-b-2 border-border px-4 py-3">
        <span className="font-bold">{HARMONIES[harmonyType].name}</span>
        <span className="ml-2 text-sm text-muted-foreground">{HARMONIES[harmonyType].description}</span>
      </div>

      {/* ── Colour wheel + swatch strip ───────────────────────────────── */}
      {colours && (
        <>
          {/* Wheel visualisation */}
          <div className="flex justify-center border-b-2 border-border py-6">
            <div className="relative w-56 h-56">
              {/* Colour wheel background */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "conic-gradient(from 90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                  opacity: 0.3,
                }}
              />
              <div className="absolute inset-7 rounded-full bg-background" />

              {/* Colour markers */}
              {colours.map((colour, i) => {
                const angle = (colour.oklch[2] - 90) * (Math.PI / 180);
                const radius = 88;
                const x = 112 + radius * Math.cos(angle);
                const y = 112 + radius * Math.sin(angle);

                return (
                  <div
                    key={i}
                    className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-4 border-background shadow-md"
                    style={{
                      left: x,
                      top: y,
                      backgroundColor: colour.hex,
                    }}
                  />
                );
              })}

              {/* Center swatch */}
              <div
                className="absolute inset-14 rounded-full border-4 border-background shadow-md"
                style={{ backgroundColor: baseColour }}
              />
            </div>
          </div>

          {/* Flush swatch strip */}
          <div className="flex border-b-2 border-border" style={{ height: "4rem" }}>
            {swatches.map(({ colour, position }) => (
              <button
                key={`${colour.hex}-${position}`}
                onClick={() => copyValue(formatColour(colour.hex, notation), colour.hex)}
                className="flex-1 transition-opacity hover:opacity-80"
                style={{ backgroundColor: colour.hex }}
                title={`Copy ${formatColour(colour.hex, notation)}`}
              />
            ))}
          </div>

          {/* Colours table */}
          <div className="border-b-2 border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <label className="font-bold">Harmony Colours</label>
            </div>
            {swatches.map(({ colour, position }) => (
              <div
                key={`row-${colour.hex}-${position}`}
                className="flex items-stretch border-b border-border last:border-b-0"
              >
                {/* Swatch cell */}
                <div className="relative w-12 shrink-0 border-r border-border">
                  <div className="size-full" style={{ backgroundColor: colour.hex }} aria-hidden />
                </div>

                {/* Hex value */}
                <div className="flex flex-1 items-center px-4 py-3">
                  <span
                    className="font-bold tracking-wide"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {formatColour(colour.hex, notation)}
                  </span>
                  {harmonyType !== "monochromatic" && (
                    <span className="ml-3 text-xs text-muted-foreground">
                      {colour.angle === 0 ? "Base" : `+${colour.angle}°`}
                    </span>
                  )}
                </div>

                {/* Copy action cell */}
                <button
                  type="button"
                  onClick={() => copyValue(formatColour(colour.hex, notation), colour.hex)}
                  className="flex w-12 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Copy colour"
                >
                  {copied === colour.hex ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>
            ))}
          </div>

          {/* Export actions */}
          <div className="border-b-2 border-border p-4">
            <label className="font-bold">Export</label>
            <div className="segmented mt-3 grid-cols-2 -mx-4 -mb-4 border-x-0 border-b-0">
              <Button variant="outline" onClick={copyAllHex} className="gap-2">
                {copied === "all" ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copy All
              </Button>
              <Button variant="outline" onClick={copyAsCssVariables} className="gap-2">
                {copied === "css" ? <Check className="size-4" /> : <Copy className="size-4" />}
                CSS Variables
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── All Harmonies preview table ───────────────────────────────── */}
      <div className="p-4">
        <label className="font-bold">All Harmonies</label>
        <div className="-mx-4 -mb-4 mt-3 border-t border-border">
          {harmonyKeys.map((key) => {
            const harmonyColours = generateHarmony(baseColour, key as HarmonyType);
            if (!harmonyColours) return null;

            const isActive = key === harmonyType;

            return (
              <button
                key={key}
                onClick={() => setHarmonyType(key as HarmonyType)}
                className={cn(
                  "flex w-full items-stretch border-b border-border last:border-b-0",
                  "transition-colors",
                  isActive ? "bg-muted" : "hover:bg-muted/50"
                )}
              >
                {/* Strip of colours */}
                <div className="flex h-12 w-32 shrink-0 border-r border-border">
                  {harmonyColours.map((c, i) => (
                    <div
                      key={i}
                      className="flex-1"
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>

                {/* Name + description */}
                <div className="flex min-w-0 flex-1 flex-col justify-center px-4 text-left">
                  <span className={cn("text-sm font-bold leading-tight", isActive && "text-primary")}>
                    {HARMONIES[key].name}
                  </span>
                  <span className="mt-0.5 truncate text-xs text-muted-foreground">
                    {HARMONIES[key].description}
                  </span>
                </div>

                {/* Active indicator cell */}
                <div className="flex w-8 items-center justify-center border-l border-border text-muted-foreground">
                  {isActive && <Check className="size-3.5 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
