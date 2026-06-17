"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useColourNotation } from "@/hooks/use-colour-notation";
import { formatColour } from "@/lib/colour-notation";
import { cn } from "@/lib/utils";

// Colour utilities
function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

// Convert to OKLCH for perceptually uniform adjustments
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

// Tailwind shade levels
const SHADE_LEVELS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// Target lightness for each shade (approximate Tailwind values)
const TARGET_LIGHTNESS: Record<number, number> = {
  50: 0.97,
  100: 0.93,
  200: 0.87,
  300: 0.78,
  400: 0.66,
  500: 0.55,
  600: 0.47,
  700: 0.40,
  800: 0.33,
  900: 0.27,
  950: 0.20,
};

// Generation modes
type GenerationMode = "classic" | "hue-shift" | "luminance-anchored" | "vivid" | "muted";

const GENERATION_MODES: { value: GenerationMode; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Standard Tailwind-style generation with uniform hue" },
  { value: "hue-shift", label: "Hue Shift", description: "Warm tones for lighter shades, cool for darker" },
  { value: "luminance-anchored", label: "Luminance Anchored", description: "Anchors to true white/black for better contrast" },
  { value: "vivid", label: "Vivid", description: "Maximizes saturation across all shades" },
  { value: "muted", label: "Muted", description: "Subtle, desaturated tones throughout" },
];

interface Shade {
  level: number;
  hex: string;
  rgb: [number, number, number];
  oklch: [number, number, number];
}

interface ShadeParams {
  targetL: number;
  adjustedC: number;
  adjustedH: number;
}

function getShadeParams(
  level: number,
  baseL: number,
  baseC: number,
  baseH: number,
  mode: GenerationMode
): ShadeParams {
  const targetL = TARGET_LIGHTNESS[level];

  switch (mode) {
    case "classic": {
      // Original approach - reduce chroma for extremes
      const chromaScale = level <= 100 ? 0.3 : level >= 900 ? 0.6 : 1;
      return { targetL, adjustedC: baseC * chromaScale, adjustedH: baseH };
    }

    case "hue-shift": {
      // Shift hue towards warm (orange/yellow) for lighter, cool (blue) for darker
      const chromaScale = level <= 100 ? 0.4 : level >= 900 ? 0.7 : 1;
      const lightnessFactor = (targetL - 0.5) * 2; // -1 to 1
      const hueShift = lightnessFactor * 15; // ±15 degrees
      let adjustedH = baseH + hueShift;
      if (adjustedH < 0) adjustedH += 360;
      if (adjustedH >= 360) adjustedH -= 360;
      return { targetL, adjustedC: baseC * chromaScale, adjustedH };
    }

    case "luminance-anchored": {
      // Anchor extremes closer to true white/black
      let adjustedL = targetL;
      if (level <= 100) {
        // Push lighter shades closer to white
        adjustedL = targetL + (1 - targetL) * 0.3;
      } else if (level >= 900) {
        // Push darker shades closer to black
        adjustedL = targetL * 0.8;
      }
      // Reduce chroma more aggressively at extremes for cleaner whites/blacks
      const chromaScale = level <= 100 ? 0.15 : level >= 900 ? 0.4 : 1;
      return { targetL: adjustedL, adjustedC: baseC * chromaScale, adjustedH: baseH };
    }

    case "vivid": {
      // Maximize chroma - only slight reduction at extremes
      const chromaScale = level <= 100 ? 0.6 : level >= 950 ? 0.8 : 1.1;
      const boostedC = Math.min(baseC * chromaScale, 0.4); // Cap to stay in gamut
      return { targetL, adjustedC: boostedC, adjustedH: baseH };
    }

    case "muted": {
      // Desaturated throughout
      const chromaScale = level <= 100 ? 0.15 : level >= 900 ? 0.3 : 0.5;
      return { targetL, adjustedC: baseC * chromaScale, adjustedH: baseH };
    }

    default:
      return { targetL, adjustedC: baseC, adjustedH: baseH };
  }
}

function generateShades(baseHex: string, mode: GenerationMode = "classic"): Shade[] | null {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return null;

  const [baseL, baseC, baseH] = rgbToOklch(...rgb);

  return SHADE_LEVELS.map(level => {
    const { targetL, adjustedC, adjustedH } = getShadeParams(level, baseL, baseC, baseH, mode);

    const newRgb = oklchToRgb(targetL, adjustedC, adjustedH);
    const clampedRgb: [number, number, number] = [
      Math.round(Math.max(0, Math.min(255, newRgb[0]))),
      Math.round(Math.max(0, Math.min(255, newRgb[1]))),
      Math.round(Math.max(0, Math.min(255, newRgb[2]))),
    ];

    return {
      level,
      hex: rgbToHex(...clampedRgb),
      rgb: clampedRgb,
      oklch: [targetL, adjustedC, adjustedH],
    };
  });
}

// Inner component that reads URL params
function TailwindShadesInner() {
  const searchParams = useSearchParams();
  const colorFromUrl = searchParams.get("color");

  const [baseColour, setBaseColour] = useState(colorFromUrl || "#3b82f6");
  const [colourName, setColourName] = useState("primary");
  const [mode, setMode] = useState<GenerationMode>("classic");
  const [shades, setShades] = useState<Shade[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { notation } = useColourNotation();

  // Update baseColour when URL parameter changes
  useEffect(() => {
    if (colorFromUrl) {
      setBaseColour(colorFromUrl);
    }
  }, [colorFromUrl]);

  useEffect(() => {
    const result = generateShades(baseColour, mode);
    setShades(result);
  }, [baseColour, mode]);

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const generateCssVariables = () => {
    if (!shades) return "";
    return shades.map(s => `  --${colourName}-${s.level}: ${formatColour(s.hex, notation)};`).join("\n");
  };

  const generateTailwindConfig = () => {
    if (!shades) return "";
    const entries = shades.map(s => `      ${s.level}: '${formatColour(s.hex, notation)}',`).join("\n");
    return `${colourName}: {\n${entries}\n    },`;
  };

  const generateOklchVariables = () => {
    if (!shades) return "";
    return shades.map(s =>
      `  --${colourName}-${s.level}: oklch(${s.oklch[0].toFixed(3)} ${s.oklch[1].toFixed(3)} ${s.oklch[2].toFixed(1)});`
    ).join("\n");
  };

  return (
    <div className="border-2 border-border">
      {/* Input row */}
      <div className="p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Base Colour */}
          <div className="space-y-2">
            <label className="font-bold">Base Colour</label>
            <div className="flex items-stretch border border-border">
              {/* Colour swatch cell */}
              <div className="relative w-12 shrink-0">
                <div
                  className="absolute inset-0 size-full"
                  style={{ backgroundColor: baseColour }}
                  aria-hidden
                />
                <input
                  type="color"
                  value={baseColour}
                  onChange={(e) => setBaseColour(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Pick base colour"
                />
              </div>
              <Input
                value={baseColour}
                onChange={(e) => setBaseColour(e.target.value)}
                placeholder="#3b82f6"
                className="flex-1 border-0 border-l border-border bg-transparent"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </div>
          </div>

          {/* Colour Name */}
          <div className="space-y-2">
            <label className="font-bold">Colour Name</label>
            <Input
              value={colourName}
              onChange={(e) => setColourName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="primary"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </div>

          {/* Generation Mode */}
          <div className="space-y-2">
            <label className="font-bold">Generation Mode</label>
            <Select value={mode} onValueChange={(v) => setMode(v as GenerationMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENERATION_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {GENERATION_MODES.find((m) => m.value === mode)?.description}
            </p>
          </div>
        </div>
      </div>

      {/* Shade strip + table */}
      {shades && (
        <>
          <div className="border-t-2 border-border">
            <div className="px-4 pt-4 pb-2">
              <label className="font-bold">Generated Shades</label>
            </div>

            {/* Flush colour strip — 11 cells */}
            <div className="flex h-20 -mx-0 border-t border-border border-b border-b-border">
              {shades.map((shade) => (
                <button
                  key={shade.level}
                  onClick={() => copyValue(formatColour(shade.hex, notation), shade.hex)}
                  className="relative flex-1 group"
                  style={{ backgroundColor: shade.hex }}
                  title={`${shade.level}: ${formatColour(shade.hex, notation)}`}
                >
                  <span
                    className={cn(
                      "absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity",
                      shade.level < 500 ? "text-black/70" : "text-white/80"
                    )}
                  >
                    {shade.level}
                  </span>
                </button>
              ))}
            </div>

            {/* Shade table — shade | swatch | hex | copy */}
            <div>
              {shades.map((shade) => {
                const value = formatColour(shade.hex, notation);
                const isCopied = copied === shade.hex;
                return (
                  <div
                    key={shade.level}
                    className="flex items-stretch border-b border-border last:border-b-0"
                  >
                    {/* Level label */}
                    <span className="flex w-16 shrink-0 items-center px-4 text-sm font-bold tabular-nums">
                      {shade.level}
                    </span>

                    {/* Colour swatch */}
                    <div className="relative w-12 shrink-0 border-l border-border">
                      <div
                        className="absolute inset-0 size-full"
                        style={{ backgroundColor: shade.hex }}
                        aria-hidden
                      />
                    </div>

                    {/* Hex/value */}
                    <span
                      className="flex flex-1 items-center border-l border-border px-4 text-sm text-muted-foreground"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      {value}
                    </span>

                    {/* Copy button */}
                    <button
                      type="button"
                      onClick={() => copyValue(value, shade.hex)}
                      aria-label={`Copy ${shade.level}`}
                      className="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {isCopied ? (
                        <Check className="size-4 text-green-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Code Output */}
          <div className="border-t-2 border-border">
            {/* CSS Variables */}
            <div className="border-b-2 border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <label className="font-bold">CSS Variables</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyValue(`:root {\n${generateCssVariables()}\n}`, "css")}
                >
                  {copied === "css" ? <Check className="size-4 mr-1" /> : <Copy className="size-4 mr-1" />}
                  Copy
                </Button>
              </div>
              <pre
                className="p-4 text-sm bg-muted/30 overflow-x-auto"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
{`:root {
${generateCssVariables()}
}`}
              </pre>
            </div>

            {/* OKLCH Variables */}
            <div className="border-b-2 border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <label className="font-bold">CSS Variables (OKLCH)</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyValue(`:root {\n${generateOklchVariables()}\n}`, "oklch")}
                >
                  {copied === "oklch" ? <Check className="size-4 mr-1" /> : <Copy className="size-4 mr-1" />}
                  Copy
                </Button>
              </div>
              <pre
                className="p-4 text-sm bg-muted/30 overflow-x-auto"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
{`:root {
${generateOklchVariables()}
}`}
              </pre>
            </div>

            {/* Tailwind Config */}
            <div>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <label className="font-bold">Tailwind Config</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyValue(generateTailwindConfig(), "tailwind")}
                >
                  {copied === "tailwind" ? <Check className="size-4 mr-1" /> : <Copy className="size-4 mr-1" />}
                  Copy
                </Button>
              </div>
              <pre
                className="p-4 text-sm bg-muted/30 overflow-x-auto"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
{generateTailwindConfig()}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Exported component with Suspense boundary
export function TailwindShadesTool() {
  return (
    <Suspense fallback={<div className="border-2 border-border animate-pulse"><div className="h-10 m-4 bg-muted" /><div className="h-24 bg-muted" /></div>}>
      <TailwindShadesInner />
    </Suspense>
  );
}
