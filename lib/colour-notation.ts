export type ColourNotation =
  | "hex" | "rgb" | "hsl" | "hsv"
  | "rgb-decimal" | "lab" | "oklab" | "oklch" | "ycbcr";

export const COLOUR_NOTATIONS: { id: ColourNotation; label: string; example: string }[] = [
  { id: "hex", label: "HEX", example: "#3b82f6" },
  { id: "rgb", label: "RGB", example: "rgb(59, 130, 246)" },
  { id: "rgb-decimal", label: "Decimal RGB", example: "rgb(0.2314, 0.5098, 0.9647)" },
  { id: "hsl", label: "HSL", example: "hsl(217.0, 91.2%, 59.8%)" },
  { id: "hsv", label: "HSV", example: "hsv(217.0, 76.0%, 96.5%)" },
  { id: "lab", label: "LAB", example: "lab(54.50 8.50 -65.50)" },
  { id: "oklab", label: "OKLAB", example: "oklab(0.6400 -0.0100 -0.1500)" },
  { id: "oklch", label: "OKLCH", example: "oklch(0.6400 0.1500 264.0)" },
  { id: "ycbcr", label: "YCbCr", example: "ycbcr(131, 186, 68)" },
];

// ============================================================================
// Conversion utilities
// ============================================================================

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
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

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, v * 100];
}

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
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

// XYZ to CIE LAB
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x / xn), fy = f(y / yn), fz = f(z / zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// RGB to OKLAB
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

// OKLAB to OKLCH
function oklabToOklch(L: number, a: number, b: number): [number, number, number] {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return [L, c, h];
}

// RGB to YCbCr (ITU-R BT.601)
function rgbToYcbcr(r: number, g: number, b: number): [number, number, number] {
  const y = 16 + (65.481 * r + 128.553 * g + 24.966 * b) / 255;
  const cb = 128 + (-37.797 * r - 74.203 * g + 112.0 * b) / 255;
  const cr = 128 + (112.0 * r - 93.786 * g - 18.214 * b) / 255;
  return [Math.round(y), Math.round(cb), Math.round(cr)];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Format a hex colour string in the given notation.
 * Returns the hex string unchanged if parsing fails.
 */
export function formatColour(hex: string, notation: ColourNotation): string {
  if (notation === "hex") return hex;

  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  switch (notation) {
    case "rgb":
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    case "rgb-decimal":
      return `rgb(${(rgb[0] / 255).toFixed(4)}, ${(rgb[1] / 255).toFixed(4)}, ${(rgb[2] / 255).toFixed(4)})`;
    case "hsl": {
      const [h, s, l] = rgbToHsl(...rgb);
      return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
    }
    case "hsv": {
      const [h, s, v] = rgbToHsv(...rgb);
      return `hsv(${h.toFixed(1)}, ${s.toFixed(1)}%, ${v.toFixed(1)}%)`;
    }
    case "lab": {
      const xyz = rgbToXyz(...rgb);
      const [l, a, b] = xyzToLab(...xyz);
      return `lab(${l.toFixed(2)} ${a.toFixed(2)} ${b.toFixed(2)})`;
    }
    case "oklab": {
      const [l, a, b] = rgbToOklab(...rgb);
      return `oklab(${l.toFixed(4)} ${a.toFixed(4)} ${b.toFixed(4)})`;
    }
    case "oklch": {
      const oklab = rgbToOklab(...rgb);
      const [l, c, h] = oklabToOklch(...oklab);
      return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(1)})`;
    }
    case "ycbcr": {
      const [y, cb, cr] = rgbToYcbcr(...rgb);
      return `ycbcr(${y}, ${cb}, ${cr})`;
    }
  }
}
