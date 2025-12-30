"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

interface Shade {
  level: number;
  hex: string;
  rgb: [number, number, number];
  oklch: [number, number, number];
}

function generateShades(baseHex: string): Shade[] | null {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return null;

  const [, c, h] = rgbToOklch(...rgb);

  return SHADE_LEVELS.map(level => {
    const targetL = TARGET_LIGHTNESS[level];
    // Adjust chroma - reduce for very light/dark shades
    const chromaScale = level <= 100 ? 0.3 : level >= 900 ? 0.6 : 1;
    const adjustedC = c * chromaScale;

    const newRgb = oklchToRgb(targetL, adjustedC, h);
    const clampedRgb: [number, number, number] = [
      Math.round(Math.max(0, Math.min(255, newRgb[0]))),
      Math.round(Math.max(0, Math.min(255, newRgb[1]))),
      Math.round(Math.max(0, Math.min(255, newRgb[2]))),
    ];

    return {
      level,
      hex: rgbToHex(...clampedRgb),
      rgb: clampedRgb,
      oklch: [targetL, adjustedC, h],
    };
  });
}

// Inner component that reads URL params
function TailwindShadesInner() {
  const searchParams = useSearchParams();
  const colorFromUrl = searchParams.get("color");

  const [baseColour, setBaseColour] = useState(colorFromUrl || "#3b82f6");
  const [colourName, setColourName] = useState("primary");
  const [shades, setShades] = useState<Shade[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Update baseColour when URL parameter changes
  useEffect(() => {
    if (colorFromUrl) {
      setBaseColour(colorFromUrl);
    }
  }, [colorFromUrl]);

  useEffect(() => {
    const result = generateShades(baseColour);
    setShades(result);
  }, [baseColour]);

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const generateCssVariables = () => {
    if (!shades) return "";
    return shades.map(s => `  --${colourName}-${s.level}: ${s.hex};`).join("\n");
  };

  const generateTailwindConfig = () => {
    if (!shades) return "";
    const entries = shades.map(s => `      ${s.level}: '${s.hex}',`).join("\n");
    return `${colourName}: {\n${entries}\n    },`;
  };

  const generateOklchVariables = () => {
    if (!shades) return "";
    return shades.map(s =>
      `  --${colourName}-${s.level}: oklch(${s.oklch[0].toFixed(3)} ${s.oklch[1].toFixed(3)} ${s.oklch[2].toFixed(1)});`
    ).join("\n");
  };

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="font-bold">Base Colour</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={baseColour}
              onChange={(e) => setBaseColour(e.target.value)}
              className="w-14 h-10 rounded border cursor-pointer"
            />
            <Input
              value={baseColour}
              onChange={(e) => setBaseColour(e.target.value)}
              placeholder="#3b82f6"
              className="font-mono flex-1"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="font-bold">Colour Name</label>
          <Input
            value={colourName}
            onChange={(e) => setColourName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="primary"
            className="font-mono"
          />
        </div>
      </div>

      {/* Shade Preview */}
      {shades && (
        <div className="space-y-3">
          <label className="font-bold">Generated Shades</label>
          <div className="grid grid-cols-11 gap-1 h-24 rounded-lg overflow-hidden">
            {shades.map((shade) => (
              <button
                key={shade.level}
                onClick={() => copyValue(shade.hex, shade.hex)}
                className="relative group h-full"
                style={{ backgroundColor: shade.hex }}
                title={`${shade.level}: ${shade.hex}`}
              >
                <div className="absolute inset-0 flex items-end justify-center pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className={`text-xs font-bold ${shade.level < 500 ? "text-gray-900" : "text-white"}`}>
                    {shade.level}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Shade Details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {shades.map((shade) => (
              <button
                key={shade.level}
                onClick={() => copyValue(shade.hex, shade.hex)}
                className="p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors text-left"
              >
                <div
                  className="w-full h-8 rounded mb-2"
                  style={{ backgroundColor: shade.hex }}
                />
                <div className="font-bold text-sm">{shade.level}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {shade.hex}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Code Output */}
      {shades && (
        <div className="space-y-4">
          {/* CSS Variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
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
            <pre className="p-4 rounded-lg border bg-muted/50 text-sm font-mono overflow-x-auto">
{`:root {
${generateCssVariables()}
}`}
            </pre>
          </div>

          {/* OKLCH Variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
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
            <pre className="p-4 rounded-lg border bg-muted/50 text-sm font-mono overflow-x-auto">
{`:root {
${generateOklchVariables()}
}`}
            </pre>
          </div>

          {/* Tailwind Config */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
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
            <pre className="p-4 rounded-lg border bg-muted/50 text-sm font-mono overflow-x-auto">
{generateTailwindConfig()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// Exported component with Suspense boundary
export function TailwindShadesTool() {
  return (
    <Suspense fallback={<div className="space-y-6 animate-pulse"><div className="h-10 bg-muted rounded" /><div className="h-24 bg-muted rounded" /></div>}>
      <TailwindShadesInner />
    </Suspense>
  );
}
