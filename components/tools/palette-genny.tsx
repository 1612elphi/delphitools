"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, Plus, Minus, Shuffle, Download, Lock, Unlock, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getColourName } from "@/lib/colour-names";
import Link from "next/link";

// ============================================================================
// COLOUR UTILITIES
// ============================================================================

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

function getLuminance(r: number, g: number, b: number): number {
  const [lr, lg, lb] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function getContrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000000";
  const luminance = getLuminance(...rgb);
  return luminance > 0.4 ? "#000000" : "#ffffff";
}

// ============================================================================
// PALETTE GENERATION STRATEGIES
// ============================================================================

function generateTrueRandomPalette(count: number): string[] {
  // Completely random - no constraints
  return Array.from({ length: count }, () => {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return rgbToHex(r, g, b);
  });
}

type PaletteStrategy =
  | "true-random"
  | "analogous"
  | "complementary"
  | "triadic"
  | "split-complementary"
  | "tetradic"
  | "monochromatic"
  | "random-cohesive"
  | "thermos"
  | "specimen"
  | "souvenir"
  | "curfew"
  | "telegraph";

interface PaletteColour {
  id: string;
  hex: string;
  locked: boolean;
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function clampOklch(L: number, c: number, h: number): [number, number, number] {
  // Clamp to valid ranges and adjust chroma if out of gamut
  L = Math.max(0, Math.min(1, L));
  c = Math.max(0, Math.min(0.4, c));
  h = ((h % 360) + 360) % 360;
  return [L, c, h];
}

function oklchToHex(L: number, c: number, h: number): string {
  const [cL, cC, cH] = clampOklch(L, c, h);
  const rgb = oklchToRgb(cL, cC, cH);
  return rgbToHex(
    Math.round(Math.max(0, Math.min(255, rgb[0]))),
    Math.round(Math.max(0, Math.min(255, rgb[1]))),
    Math.round(Math.max(0, Math.min(255, rgb[2])))
  );
}

function generateRandomBase(): [number, number, number] {
  // Generate a pleasant base colour in OKLCH
  const L = randomInRange(0.4, 0.75);
  const c = randomInRange(0.08, 0.2);
  const h = randomInRange(0, 360);
  return [L, c, h];
}

function generateAnalogousPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const spread = 40; // Total hue spread
  const step = spread / (count - 1);
  const startH = baseH - spread / 2;

  return Array.from({ length: count }, (_, i) => {
    const h = startH + step * i;
    const L = baseL + randomInRange(-0.1, 0.1);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateComplementaryPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const complementH = (baseH + 180) % 360;

  const colours: string[] = [];
  const halfCount = Math.ceil(count / 2);

  // Generate variations around base hue
  for (let i = 0; i < halfCount; i++) {
    const hVariation = randomInRange(-15, 15);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    colours.push(oklchToHex(L, c, baseH + hVariation));
  }

  // Generate variations around complement
  for (let i = halfCount; i < count; i++) {
    const hVariation = randomInRange(-15, 15);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    colours.push(oklchToHex(L, c, complementH + hVariation));
  }

  return colours;
}

function generateTriadicPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const angles = [baseH, (baseH + 120) % 360, (baseH + 240) % 360];

  return Array.from({ length: count }, (_, i) => {
    const angleIndex = i % 3;
    const h = angles[angleIndex] + randomInRange(-10, 10);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateSplitComplementaryPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const split1 = (baseH + 150) % 360;
  const split2 = (baseH + 210) % 360;
  const angles = [baseH, split1, split2];

  return Array.from({ length: count }, (_, i) => {
    const angleIndex = i % 3;
    const h = angles[angleIndex] + randomInRange(-10, 10);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateTetradicPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const angles = [baseH, (baseH + 90) % 360, (baseH + 180) % 360, (baseH + 270) % 360];

  return Array.from({ length: count }, (_, i) => {
    const angleIndex = i % 4;
    const h = angles[angleIndex] + randomInRange(-10, 10);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateMonochromaticPalette(count: number): string[] {
  const h = randomInRange(0, 360);
  const baseC = randomInRange(0.1, 0.2);

  // Distribute lightness evenly from light to dark
  const lMin = 0.3;
  const lMax = 0.85;
  const lStep = (lMax - lMin) / (count - 1);

  return Array.from({ length: count }, (_, i) => {
    const L = lMax - lStep * i;
    // Reduce chroma for very light and very dark colours
    const cMod = L < 0.4 || L > 0.75 ? 0.7 : 1;
    return oklchToHex(L, baseC * cMod, h);
  });
}

function generateRandomCohesivePalette(count: number): string[] {
  // Pick a random strategy
  const strategies = [
    generateAnalogousPalette,
    generateComplementaryPalette,
    generateTriadicPalette,
    generateSplitComplementaryPalette,
    generateTetradicPalette,
    generateMonochromaticPalette,
  ];

  const strategy = strategies[Math.floor(Math.random() * strategies.length)];
  return strategy(count);
}

// ============================================================================
// MOOD-BASED PALETTE STRATEGIES
// ============================================================================

function generateThermosPalette(count: number): string[] {
  // Warm, cozy, retro - copper, amber, cream
  // Hue: 15-55°, L: 0.45-0.75, C: 0.08-0.18
  return Array.from({ length: count }, () => {
    const h = randomInRange(15, 55);
    const L = randomInRange(0.45, 0.75);
    const c = randomInRange(0.08, 0.18);
    return oklchToHex(L, c, h);
  });
}

function generateSpecimenPalette(count: number): string[] {
  // Cool, clinical, preserved - pale blues, mint, grey
  // Hue: 170-220°, L: 0.6-0.9, C: 0.03-0.12
  return Array.from({ length: count }, () => {
    const h = randomInRange(170, 220);
    const L = randomInRange(0.6, 0.9);
    const c = randomInRange(0.03, 0.12);
    return oklchToHex(L, c, h);
  });
}

function generateSouvenirPalette(count: number): string[] {
  // Pastel, faded memories - soft, high lightness, low chroma
  // Any hue, L: 0.75-0.92, C: 0.04-0.10
  return Array.from({ length: count }, () => {
    const h = randomInRange(0, 360);
    const L = randomInRange(0.75, 0.92);
    const c = randomInRange(0.04, 0.10);
    return oklchToHex(L, c, h);
  });
}

function generateCurfewPalette(count: number): string[] {
  // Dark, nighttime, forbidden - deep shadows with hints of colour
  // Any hue, L: 0.15-0.35, C: 0.05-0.15
  return Array.from({ length: count }, () => {
    const h = randomInRange(0, 360);
    const L = randomInRange(0.15, 0.35);
    const c = randomInRange(0.05, 0.15);
    return oklchToHex(L, c, h);
  });
}

function generateTelegraphPalette(count: number): string[] {
  // Vintage, sepia, aged - muted warm browns and cream
  // Hue: 30-60°, L: 0.4-0.7, C: 0.02-0.08
  return Array.from({ length: count }, () => {
    const h = randomInRange(30, 60);
    const L = randomInRange(0.4, 0.7);
    const c = randomInRange(0.02, 0.08);
    return oklchToHex(L, c, h);
  });
}

function generatePalette(count: number, strategy: PaletteStrategy): string[] {
  switch (strategy) {
    case "true-random": return generateTrueRandomPalette(count);
    case "analogous": return generateAnalogousPalette(count);
    case "complementary": return generateComplementaryPalette(count);
    case "triadic": return generateTriadicPalette(count);
    case "split-complementary": return generateSplitComplementaryPalette(count);
    case "tetradic": return generateTetradicPalette(count);
    case "monochromatic": return generateMonochromaticPalette(count);
    case "random-cohesive": return generateRandomCohesivePalette(count);
    case "thermos": return generateThermosPalette(count);
    case "specimen": return generateSpecimenPalette(count);
    case "souvenir": return generateSouvenirPalette(count);
    case "curfew": return generateCurfewPalette(count);
    case "telegraph": return generateTelegraphPalette(count);
    default: return generateRandomCohesivePalette(count);
  }
}

// ============================================================================
// PALETTE COMPONENT
// ============================================================================

const STRATEGY_INFO: Record<PaletteStrategy, { name: string; description: string }> = {
  "true-random": { name: "Chaos", description: "Completely random, no rules" },
  "random-cohesive": { name: "Random", description: "Random cohesive palette" },
  "analogous": { name: "Analogous", description: "Adjacent hues on the colour wheel" },
  "complementary": { name: "Complementary", description: "Opposite hues for high contrast" },
  "triadic": { name: "Triadic", description: "Three evenly spaced hues" },
  "split-complementary": { name: "Split-Comp", description: "Base + two adjacent to complement" },
  "tetradic": { name: "Tetradic", description: "Four evenly spaced hues" },
  "monochromatic": { name: "Mono", description: "Single hue, varied lightness" },
  "thermos": { name: "Thermos", description: "Warm, cozy, retro tones" },
  "specimen": { name: "Specimen", description: "Cool, clinical, preserved" },
  "souvenir": { name: "Souvenir", description: "Soft, faded pastels" },
  "curfew": { name: "Curfew", description: "Dark, moody depths" },
  "telegraph": { name: "Telegraph", description: "Muted vintage sepia" },
};

const MIN_COLOURS = 2;
const MAX_COLOURS = 11;

export function PaletteGennyTool() {
  const [colours, setColours] = useState<PaletteColour[]>(() =>
    generatePalette(5, "random-cohesive").map(hex => ({
      id: generateId(),
      hex,
      locked: false,
    }))
  );
  const [strategy, setStrategy] = useState<PaletteStrategy>("random-cohesive");
  const [copied, setCopied] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Copy helpers
  const copyToClipboard = useCallback(async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  // Generate new palette (respecting locks)
  const regeneratePalette = useCallback(() => {
    setColours(prev => {
      const lockedIndices = prev.map((c, i) => c.locked ? i : -1).filter(i => i !== -1);
      const newHexes = generatePalette(prev.length, strategy);

      return prev.map((colour, i) => {
        if (colour.locked) {
          return colour;
        }
        return {
          id: generateId(),
          hex: newHexes[i],
          locked: false,
        };
      });
    });
  }, [strategy]);

  // Keyboard shortcut for regenerating palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on spacebar when not in an input/textarea
      if (e.code === "Space" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        regeneratePalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [regeneratePalette]);

  // Add colour
  const addColour = useCallback(() => {
    if (colours.length >= MAX_COLOURS) return;

    // Generate a colour that fits with the existing palette
    const lastColour = colours[colours.length - 1];
    const rgb = hexToRgb(lastColour.hex);
    if (rgb) {
      const [L, c, h] = rgbToOklch(...rgb);
      const newH = (h + randomInRange(20, 40)) % 360;
      const newL = L + randomInRange(-0.1, 0.1);
      const newHex = oklchToHex(newL, c, newH);

      setColours(prev => [...prev, {
        id: generateId(),
        hex: newHex,
        locked: false,
      }]);
    }
  }, [colours]);

  // Remove colour
  const removeColour = useCallback((id: string) => {
    if (colours.length <= MIN_COLOURS) return;
    setColours(prev => prev.filter(c => c.id !== id));
  }, [colours.length]);

  // Toggle lock
  const toggleLock = useCallback((id: string) => {
    setColours(prev => prev.map(c =>
      c.id === id ? { ...c, locked: !c.locked } : c
    ));
  }, []);

  // Update colour
  const updateColour = useCallback((id: string, hex: string) => {
    setColours(prev => prev.map(c =>
      c.id === id ? { ...c, hex } : c
    ));
  }, []);

  // Copy all as hex list
  const copyAllHex = useCallback(() => {
    const hexes = colours.map(c => c.hex).join(", ");
    copyToClipboard(hexes, "all-hex");
  }, [colours, copyToClipboard]);

  // Copy as CSS variables
  const copyAsCss = useCallback(() => {
    const vars = colours.map((c, i) => `  --palette-${i + 1}: ${c.hex};`).join("\n");
    copyToClipboard(`:root {\n${vars}\n}`, "css");
  }, [colours, copyToClipboard]);

  // Copy as JSON
  const copyAsJson = useCallback(() => {
    const json = JSON.stringify(colours.map(c => c.hex), null, 2);
    copyToClipboard(json, "json");
  }, [colours, copyToClipboard]);

  // Download as image
  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 1200;
    const height = 630;
    const padding = 40;
    const swatchHeight = height - padding * 2 - 80;
    const swatchWidth = (width - padding * 2 - (colours.length - 1) * 12) / colours.length;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Draw swatches
    colours.forEach((colour, i) => {
      const x = padding + i * (swatchWidth + 12);
      const y = padding;

      // Swatch
      ctx.fillStyle = colour.hex;
      ctx.beginPath();
      ctx.roundRect(x, y, swatchWidth, swatchHeight, 16);
      ctx.fill();

      // Hex label
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(colour.hex.toUpperCase(), x + swatchWidth / 2, height - padding - 20);
    });

    // Watermark
    ctx.fillStyle = "#999999";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("delphitools.com", width - padding, height - padding + 5);

    // Download
    const link = document.createElement("a");
    link.download = "palette.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [colours]);

  return (
    <div className="space-y-6">
      {/* Main Palette Display */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-lg border"
        style={{ minHeight: "320px" }}
      >
        <div className="flex h-80">
          {colours.map((colour, index) => (
            <div
              key={colour.id}
              className="relative flex-1 group transition-all duration-200 hover:flex-[1.5]"
              style={{ backgroundColor: colour.hex }}
            >
              {/* Colour overlay controls */}
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Lock button */}
                <button
                  onClick={() => toggleLock(colour.id)}
                  className={cn(
                    "absolute top-4 right-4 p-2 rounded-full transition-all",
                    colour.locked
                      ? "bg-white/90 text-black"
                      : "bg-black/20 hover:bg-black/40"
                  )}
                  style={{ color: colour.locked ? "#000" : getContrastText(colour.hex) }}
                >
                  {colour.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                </button>

                {/* Delete button (if more than MIN) */}
                {colours.length > MIN_COLOURS && (
                  <button
                    onClick={() => removeColour(colour.id)}
                    className="absolute top-4 left-4 p-2 rounded-full bg-black/20 hover:bg-red-500/80 transition-all"
                    style={{ color: getContrastText(colour.hex) }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}

                {/* Colour picker */}
                <label
                  className="cursor-pointer p-3 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur-sm transition-all"
                >
                  <input
                    type="color"
                    value={colour.hex}
                    onChange={(e) => updateColour(colour.id, e.target.value)}
                    className="sr-only"
                  />
                  <div
                    className="size-8 rounded-full border-2 border-white shadow-lg"
                    style={{ backgroundColor: colour.hex }}
                  />
                </label>

                {/* Copy hex button */}
                <button
                  onClick={() => copyToClipboard(colour.hex, colour.id)}
                  className="mt-3 px-4 py-2 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur-sm font-mono text-sm font-bold transition-all flex items-center gap-2"
                  style={{ color: getContrastText(colour.hex) }}
                >
                  {copied === colour.id ? (
                    <>
                      <Check className="size-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      {colour.hex.toUpperCase()}
                    </>
                  )}
                </button>
              </div>

              {/* Lock indicator (always visible when locked) */}
              {colour.locked && (
                <div className="absolute top-4 right-4 p-2 rounded-full bg-white/90">
                  <Lock className="size-4 text-black" />
                </div>
              )}

              {/* Hex label at bottom */}
              <div
                className="absolute bottom-4 left-0 right-0 text-center font-mono text-sm font-bold opacity-70 group-hover:opacity-100 transition-opacity"
                style={{ color: getContrastText(colour.hex) }}
              >
                {colour.hex.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Generate button */}
        <Button
          onClick={regeneratePalette}
          className="gap-2"
          size="lg"
        >
          <Shuffle className="size-4" />
          Generate
        </Button>

        {/* Strategy selector */}
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as PaletteStrategy)}
          className="h-11 px-4 rounded-lg border bg-background font-medium"
        >
          {Object.entries(STRATEGY_INFO).map(([key, info]) => (
            <option key={key} value={key}>{info.name}</option>
          ))}
        </select>

        {/* Add/Remove buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => removeColour(colours[colours.length - 1].id)}
            disabled={colours.length <= MIN_COLOURS}
          >
            <Minus className="size-4" />
          </Button>
          <span className="px-3 font-mono text-sm font-bold min-w-[3ch] text-center">
            {colours.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={addColour}
            disabled={colours.length >= MAX_COLOURS}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* Strategy description */}
      <div className="p-4 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        <span className="font-bold text-foreground">{STRATEGY_INFO[strategy].name}:</span>{" "}
        {STRATEGY_INFO[strategy].description}
      </div>

      {/* Export Options */}
      <div className="space-y-3">
        <label className="font-bold">Export</label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyAllHex} className="gap-2">
            {copied === "all-hex" ? <Check className="size-4" /> : <Copy className="size-4" />}
            Copy HEX
          </Button>
          <Button variant="outline" onClick={copyAsCss} className="gap-2">
            {copied === "css" ? <Check className="size-4" /> : <Copy className="size-4" />}
            CSS Variables
          </Button>
          <Button variant="outline" onClick={copyAsJson} className="gap-2">
            {copied === "json" ? <Check className="size-4" /> : <Copy className="size-4" />}
            JSON
          </Button>
          <Button variant="outline" onClick={downloadImage} className="gap-2">
            <Download className="size-4" />
            Download Image
          </Button>
        </div>
      </div>

      {/* Colour List (detailed view) */}
      <div className="space-y-3">
        <label className="font-bold">Colours</label>
        <div className="grid gap-2">
          {colours.map((colour, i) => {
            const rgb = hexToRgb(colour.hex);
            const oklch = rgb ? rgbToOklch(...rgb) : null;
            const colourName = getColourName(colour.hex);

            return (
              <div
                key={colour.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors"
              >
                {/* Swatch */}
                <label className="cursor-pointer">
                  <input
                    type="color"
                    value={colour.hex}
                    onChange={(e) => updateColour(colour.id, e.target.value)}
                    className="sr-only"
                  />
                  <div
                    className="size-12 rounded-lg border-2 border-border shadow-sm hover:scale-105 transition-transform"
                    style={{ backgroundColor: colour.hex }}
                  />
                </label>

                {/* Colour info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{colour.hex.toUpperCase()}</span>
                    <span className="text-sm text-muted-foreground capitalize">{colourName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {rgb && `rgb(${rgb.join(", ")})`}
                    {oklch && ` · oklch(${(oklch[0] * 100).toFixed(0)}% ${oklch[1].toFixed(3)} ${oklch[2].toFixed(0)})`}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleLock(colour.id)}
                    className={cn(colour.locked && "text-primary")}
                    title={colour.locked ? "Unlock colour" : "Lock colour"}
                  >
                    {colour.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(colour.hex, `list-${colour.id}`)}
                    title="Copy hex"
                  >
                    {copied === `list-${colour.id}` ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    title="Generate Tailwind shades"
                  >
                    <Link href={`/tools/tailwind-shades?color=${encodeURIComponent(colour.hex)}`}>
                      <Sparkles className="size-4" />
                    </Link>
                  </Button>
                  {colours.length > MIN_COLOURS && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeColour(colour.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Remove colour"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden canvas for image export */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Keyboard shortcuts hint */}
      <div className="text-xs text-muted-foreground text-center pt-4 border-t">
        Press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Space</kbd> to generate a new palette
      </div>
    </div>
  );
}
