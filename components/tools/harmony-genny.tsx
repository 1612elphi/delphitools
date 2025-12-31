"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    const result = generateHarmony(baseColour, harmonyType);
    setColours(result);
  }, [baseColour, harmonyType]);

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyAllHex = () => {
    if (!colours) return;
    const hexes = colours.map(c => c.hex).join(", ");
    copyValue(hexes, "all");
  };

  const copyAsCssVariables = () => {
    if (!colours) return;
    const vars = colours.map((c, i) => `  --harmony-${i + 1}: ${c.hex};`).join("\n");
    copyValue(`:root {\n${vars}\n}`, "css");
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
          <label className="font-bold">Harmony Type</label>
          <select
            value={harmonyType}
            onChange={(e) => setHarmonyType(e.target.value as HarmonyType)}
            className="w-full h-10 px-3 rounded-lg border bg-background"
          >
            {Object.entries(HARMONIES).map(([key, info]) => (
              <option key={key} value={key}>{info.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Harmony Description */}
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="font-bold">{HARMONIES[harmonyType].name}</div>
        <div className="text-sm text-muted-foreground">
          {HARMONIES[harmonyType].description}
        </div>
      </div>

      {/* Colour Wheel Visualization */}
      {colours && (
        <div className="flex justify-center">
          <div className="relative w-64 h-64">
            {/* Colour wheel background */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                opacity: 0.3,
              }}
            />
            <div className="absolute inset-8 rounded-full bg-background" />

            {/* Colour markers */}
            {colours.map((colour, i) => {
              const angle = (colour.oklch[2] - 90) * (Math.PI / 180);
              const radius = 100;
              const x = 128 + radius * Math.cos(angle);
              const y = 128 + radius * Math.sin(angle);

              return (
                <div
                  key={i}
                  className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-4 border-white shadow-lg"
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
              className="absolute inset-16 rounded-full border-4 border-white shadow-lg"
              style={{ backgroundColor: baseColour }}
            />
          </div>
        </div>
      )}

      {/* Colour Swatches */}
      {colours && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-bold">Harmony Colours</label>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={copyAllHex}>
                {copied === "all" ? <Check className="size-4 mr-1" /> : <Copy className="size-4 mr-1" />}
                Copy All
              </Button>
              <Button size="sm" variant="ghost" onClick={copyAsCssVariables}>
                {copied === "css" ? <Check className="size-4 mr-1" /> : <Copy className="size-4 mr-1" />}
                CSS Variables
              </Button>
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(colours.length, 5)}, 1fr)` }}>
            {colours.map((colour, i) => (
              <button
                key={i}
                onClick={() => copyValue(colour.hex, colour.hex)}
                className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors"
              >
                <div
                  className="w-full aspect-square rounded-lg mb-3 border"
                  style={{ backgroundColor: colour.hex }}
                />
                <div className="text-center">
                  <div className="font-mono text-sm font-bold">{colour.hex}</div>
                  {harmonyType !== "monochromatic" && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {colour.angle === 0 ? "Base" : `+${colour.angle}°`}
                    </div>
                  )}
                </div>
                <div className="text-xs text-primary mt-2 opacity-0 hover:opacity-100 text-center">
                  Click to copy
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All Harmonies Preview */}
      <div className="space-y-3">
        <label className="font-bold">All Harmonies</label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(HARMONIES).map(([key, info]) => {
            const harmonyColours = generateHarmony(baseColour, key as HarmonyType);
            if (!harmonyColours) return null;

            const isActive = key === harmonyType;

            return (
              <button
                key={key}
                onClick={() => setHarmonyType(key as HarmonyType)}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  isActive ? "bg-primary/10 border-primary" : "bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex gap-1 mb-2">
                  {harmonyColours.map((c, i) => (
                    <div
                      key={i}
                      className="flex-1 h-8 first:rounded-l-md last:rounded-r-md"
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                <div className="font-bold text-sm">{info.name}</div>
                <div className="text-xs text-muted-foreground">{info.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
