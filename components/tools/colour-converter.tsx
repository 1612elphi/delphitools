"use client";

import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Colour conversion utilities
function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [r * 255, g * 255, b * 255];
}

// Linear RGB conversions
function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, v * 255)));
}

// RGB to XYZ (D65)
function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  return [
    0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb,
    0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb,
    0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb,
  ];
}

function xyzToRgb(x: number, y: number, z: number): [number, number, number] {
  const lr =  3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const lb =  0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

// XYZ to LAB
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.pow(t, 1/3) : 7.787 * t + 16/116;
  const fx = f(x / xn), fy = f(y / yn), fz = f(z / zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToXyz(l: number, a: number, b: number): [number, number, number] {
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const f = (t: number) => t > 0.206893 ? t * t * t : (t - 16/116) / 7.787;
  return [xn * f(fx), yn * f(fy), zn * f(fz)];
}

// LAB to LCH
function labToLch(l: number, a: number, b: number): [number, number, number] {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return [l, c, h];
}

function lchToLab(l: number, c: number, h: number): [number, number, number] {
  const hRad = h * Math.PI / 180;
  return [l, c * Math.cos(hRad), c * Math.sin(hRad)];
}

// OKLAB/OKLCH conversions
function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  const lr =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

function oklabToOklch(l: number, a: number, b: number): [number, number, number] {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return [l, c, h];
}

function oklchToOklab(l: number, c: number, h: number): [number, number, number] {
  const hRad = h * Math.PI / 180;
  return [l, c * Math.cos(hRad), c * Math.sin(hRad)];
}

type ColourFormat = "hex" | "rgb" | "hsl" | "lab" | "lch" | "oklab" | "oklch";

interface ColourValues {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  lab: [number, number, number];
  lch: [number, number, number];
  oklab: [number, number, number];
  oklch: [number, number, number];
}

export function ColourConverterTool() {
  const [inputFormat, setInputFormat] = useState<ColourFormat>("hex");
  const [inputValue, setInputValue] = useState("#3b82f6");
  const [colours, setColours] = useState<ColourValues | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const parseAndConvert = (format: ColourFormat, value: string): ColourValues | null => {
    let rgb: [number, number, number];

    try {
      switch (format) {
        case "hex":
          const parsed = hexToRgb(value);
          if (!parsed) return null;
          rgb = parsed;
          break;
        case "rgb": {
          const match = value.match(/(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/);
          if (!match) return null;
          rgb = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          break;
        }
        case "hsl": {
          const match = value.match(/([\d.]+)\s*,?\s*([\d.]+)%?\s*,?\s*([\d.]+)%?/);
          if (!match) return null;
          rgb = hslToRgb(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
          break;
        }
        case "lab": {
          const match = value.match(/([\d.-]+)\s*,?\s*([\d.-]+)\s*,?\s*([\d.-]+)/);
          if (!match) return null;
          const xyz = labToXyz(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
          rgb = xyzToRgb(...xyz);
          break;
        }
        case "lch": {
          const match = value.match(/([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)/);
          if (!match) return null;
          const lab = lchToLab(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
          const xyz = labToXyz(...lab);
          rgb = xyzToRgb(...xyz);
          break;
        }
        case "oklab": {
          const match = value.match(/([\d.-]+)\s*,?\s*([\d.-]+)\s*,?\s*([\d.-]+)/);
          if (!match) return null;
          rgb = oklabToRgb(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
          break;
        }
        case "oklch": {
          const match = value.match(/([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)/);
          if (!match) return null;
          const oklab = oklchToOklab(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
          rgb = oklabToRgb(...oklab);
          break;
        }
        default:
          return null;
      }

      // Clamp RGB values
      rgb = rgb.map(v => Math.max(0, Math.min(255, Math.round(v)))) as [number, number, number];

      // Convert to all formats
      const hex = rgbToHex(...rgb);
      const hsl = rgbToHsl(...rgb);
      const xyz = rgbToXyz(...rgb);
      const lab = xyzToLab(...xyz);
      const lch = labToLch(...lab);
      const oklab = rgbToOklab(...rgb);
      const oklch = oklabToOklch(...oklab);

      return { hex, rgb, hsl, lab, lch, oklab, oklch };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const result = parseAndConvert(inputFormat, inputValue);
    setColours(result);
  }, [inputFormat, inputValue]);

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  };

  const formatOutput = (format: ColourFormat, values: ColourValues): string => {
    switch (format) {
      case "hex": return values.hex;
      case "rgb": return `rgb(${values.rgb.join(", ")})`;
      case "hsl": return `hsl(${values.hsl[0].toFixed(1)}, ${values.hsl[1].toFixed(1)}%, ${values.hsl[2].toFixed(1)}%)`;
      case "lab": return `lab(${values.lab[0].toFixed(2)} ${values.lab[1].toFixed(2)} ${values.lab[2].toFixed(2)})`;
      case "lch": return `lch(${values.lch[0].toFixed(2)} ${values.lch[1].toFixed(2)} ${values.lch[2].toFixed(1)})`;
      case "oklab": return `oklab(${values.oklab[0].toFixed(4)} ${values.oklab[1].toFixed(4)} ${values.oklab[2].toFixed(4)})`;
      case "oklch": return `oklch(${values.oklch[0].toFixed(4)} ${values.oklch[1].toFixed(4)} ${values.oklch[2].toFixed(1)})`;
    }
  };

  const formats: { id: ColourFormat; name: string; placeholder: string }[] = [
    { id: "hex", name: "HEX", placeholder: "#3b82f6" },
    { id: "rgb", name: "RGB", placeholder: "59, 130, 246" },
    { id: "hsl", name: "HSL", placeholder: "217, 91%, 60%" },
    { id: "lab", name: "LAB", placeholder: "54.5, 8.5, -65.5" },
    { id: "lch", name: "LCH", placeholder: "54.5, 66.0, 277.5" },
    { id: "oklab", name: "OKLAB", placeholder: "0.64, -0.01, -0.15" },
    { id: "oklch", name: "OKLCH", placeholder: "0.64, 0.15, 264" },
  ];

  return (
    <div className="space-y-6">
      {/* Colour Preview */}
      <div className="flex gap-4">
        <div
          className="w-32 h-32 rounded-xl border shadow-inner"
          style={{ backgroundColor: colours?.hex || "#ffffff" }}
        />
        <div className="flex-1 space-y-3">
          <div>
            <label className="font-bold text-sm">Input Format</label>
            <select
              value={inputFormat}
              onChange={(e) => {
                const newFormat = e.target.value as ColourFormat;
                if (colours) {
                  setInputValue(formatOutput(newFormat, colours));
                }
                setInputFormat(newFormat);
              }}
              className="w-full h-10 px-3 mt-1 rounded-lg border bg-background"
            >
              {formats.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-sm">Value</label>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={formats.find(f => f.id === inputFormat)?.placeholder}
              className="mt-1 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Conversions */}
      {colours ? (
        <div className="space-y-3">
          <label className="font-bold">All Formats</label>
          <div className="grid gap-2">
            {formats.map((format) => {
              const output = formatOutput(format.id, colours);
              const isCopied = copied === output;

              return (
                <div
                  key={format.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="w-16 font-bold text-sm">{format.name}</div>
                  <code className="flex-1 font-mono text-sm">{output}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyValue(output)}
                  >
                    {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground border rounded-lg border-dashed">
          Enter a valid colour value to see conversions
        </div>
      )}

      {/* Quick Reference */}
      <div className="p-4 rounded-lg border bg-muted/30 text-sm">
        <div className="font-bold mb-2">Format Examples</div>
        <div className="grid gap-2 sm:grid-cols-2 text-muted-foreground">
          <div><span className="font-mono">HEX:</span> #3b82f6</div>
          <div><span className="font-mono">RGB:</span> 59, 130, 246</div>
          <div><span className="font-mono">HSL:</span> 217, 91%, 60%</div>
          <div><span className="font-mono">LAB:</span> 54.5 8.5 -65.5</div>
          <div><span className="font-mono">LCH:</span> 54.5 66.0 277.5</div>
          <div><span className="font-mono">OKLCH:</span> 0.64 0.15 264</div>
        </div>
      </div>
    </div>
  );
}
