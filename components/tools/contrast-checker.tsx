"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUpDown, Wand2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useColourNotation } from "@/hooks/use-colour-notation";
import { formatColour } from "@/lib/colour-notation";

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

// Calculate relative luminance per WCAG 2.1
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Calculate contrast ratio between two colors
function getContrastRatio(hex1: string, hex2: string): number | null {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return null;

  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

// Convert RGB to HSL
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

// Convert HSL to RGB
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
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// WCAG thresholds
const WCAG = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3,
  AAA_NORMAL: 7,
  AAA_LARGE: 4.5,
};

interface ComplianceResult {
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

function checkCompliance(ratio: number): ComplianceResult {
  return {
    aaNormal: ratio >= WCAG.AA_NORMAL,
    aaLarge: ratio >= WCAG.AA_LARGE,
    aaaNormal: ratio >= WCAG.AAA_NORMAL,
    aaaLarge: ratio >= WCAG.AAA_LARGE,
  };
}

// Find a color that meets the target contrast ratio by adjusting lightness
function fixContrast(
  colorToFix: string,
  referenceColor: string,
  targetRatio: number
): string {
  const rgb = hexToRgb(colorToFix);
  const refRgb = hexToRgb(referenceColor);
  if (!rgb || !refRgb) return colorToFix;

  const [h, s] = rgbToHsl(...rgb);
  const refLuminance = getLuminance(...refRgb);

  // Try lightness values from 0 to 100 to find one that meets the target
  // Determine if we need to go lighter or darker
  const currentLuminance = getLuminance(...rgb);
  const needsLighter = currentLuminance < refLuminance;

  // Search in the appropriate direction
  const startL = needsLighter ? 100 : 0;
  const endL = needsLighter ? 0 : 100;
  const step = needsLighter ? -1 : 1;

  let bestL = rgbToHsl(...rgb)[2];
  let bestRatio = getContrastRatio(colorToFix, referenceColor) || 1;

  for (let l = startL; needsLighter ? l >= endL : l <= endL; l += step) {
    const testRgb = hslToRgb(h, s, l);
    const testHex = rgbToHex(...testRgb);
    const ratio = getContrastRatio(testHex, referenceColor);

    if (ratio && ratio >= targetRatio) {
      // Found a valid lightness, but keep searching for the closest one
      if (Math.abs(l - rgbToHsl(...rgb)[2]) < Math.abs(bestL - rgbToHsl(...rgb)[2]) || bestRatio < targetRatio) {
        bestL = l;
        bestRatio = ratio;
      }
      break;
    }
  }

  const fixedRgb = hslToRgb(h, s, bestL);
  return rgbToHex(...fixedRgb);
}

export function ContrastCheckerTool() {
  const [background, setBackground] = useState("#1a1a2e");
  const [foreground, setForeground] = useState("#eaeaea");
  const [ratio, setRatio] = useState<number | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const { notation } = useColourNotation();

  useEffect(() => {
    const r = getContrastRatio(foreground, background);
    setRatio(r);
    if (r) {
      setCompliance(checkCompliance(r));
    }
  }, [foreground, background]);

  const flipColors = useCallback(() => {
    setBackground(foreground);
    setForeground(background);
  }, [foreground, background]);

  const fixColors = useCallback(() => {
    // Fix to meet AA Normal (4.5:1) by default
    const fixed = fixContrast(foreground, background, WCAG.AA_NORMAL);
    setForeground(fixed);
  }, [foreground, background]);

  const fixToAAA = useCallback(() => {
    const fixed = fixContrast(foreground, background, WCAG.AAA_NORMAL);
    setForeground(fixed);
  }, [foreground, background]);

  const isValidHex = (hex: string) => /^#[0-9A-Fa-f]{6}$/.test(hex);

  const monoStyle = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

  return (
    <div className="border-2 border-border">

      {/* Colour Inputs — two flush swatch rows */}
      <div className="border-b-2 border-border">
        {/* Background row */}
        <div className="flex items-stretch border-b border-border">
          {/* Swatch */}
          <div className="relative w-14 shrink-0">
            <div className="size-full" style={{ backgroundColor: isValidHex(background) ? background : "#000000" }} aria-hidden />
            <input
              type="color"
              value={isValidHex(background) ? background : "#000000"}
              onChange={(e) => setBackground(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </div>
          {/* Label + hex input */}
          <div className="flex flex-1 flex-col justify-center border-l border-border px-4 py-3">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Background</label>
            <input
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="#1a1a2e"
              className="border-0 bg-transparent p-0 text-sm focus:outline-none"
              style={monoStyle}
            />
            {notation !== "hex" && isValidHex(background) && (
              <div className="text-xs text-muted-foreground" style={monoStyle}>
                {formatColour(background, notation)}
              </div>
            )}
          </div>
        </div>

        {/* Foreground row */}
        <div className="flex items-stretch">
          {/* Swatch */}
          <div className="relative w-14 shrink-0">
            <div className="size-full" style={{ backgroundColor: isValidHex(foreground) ? foreground : "#ffffff" }} aria-hidden />
            <input
              type="color"
              value={isValidHex(foreground) ? foreground : "#ffffff"}
              onChange={(e) => setForeground(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </div>
          {/* Label + hex input */}
          <div className="flex flex-1 flex-col justify-center border-l border-border px-4 py-3">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Foreground</label>
            <input
              value={foreground}
              onChange={(e) => setForeground(e.target.value)}
              placeholder="#eaeaea"
              className="border-0 bg-transparent p-0 text-sm focus:outline-none"
              style={monoStyle}
            />
            {notation !== "hex" && isValidHex(foreground) && (
              <div className="text-xs text-muted-foreground" style={monoStyle}>
                {formatColour(foreground, notation)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action bar — Flip / Fix AA / Fix AAA */}
      <div className="segmented grid-cols-3 border-b-2 border-border">
        <Button variant="outline" onClick={flipColors} className="flex items-center gap-2">
          <ArrowUpDown className="size-4" />
          Flip
        </Button>
        <Button variant="outline" onClick={fixColors} disabled={compliance?.aaNormal} className="flex items-center gap-2">
          <Wand2 className="size-4" />
          Fix to AA
        </Button>
        <Button variant="outline" onClick={fixToAAA} disabled={compliance?.aaaNormal} className="flex items-center gap-2">
          <Wand2 className="size-4" />
          Fix to AAA
        </Button>
      </div>

      {/* Contrast ratio display */}
      <div className="border-b-2 border-border px-4 py-5 text-center">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Contrast Ratio</div>
        <div className="mt-1 text-5xl font-bold" style={monoStyle}>
          {ratio ? `${ratio.toFixed(2)}:1` : "—"}
        </div>
        {ratio && (
          <div className="mt-1 text-sm text-muted-foreground">
            {ratio >= WCAG.AAA_NORMAL ? "Excellent" : ratio >= WCAG.AA_NORMAL ? "Good" : ratio >= WCAG.AA_LARGE ? "Acceptable for large text" : "Poor"}
          </div>
        )}
      </div>

      {/* Preview — bleeds to edges */}
      <div className="border-b-2 border-border">
        <div className="px-4 py-3">
          <label className="font-bold">Preview</label>
        </div>
        <div
          className="px-6 py-8"
          style={{ backgroundColor: background }}
        >
          <p style={{ color: foreground }} className="text-4xl font-bold mb-2">
            Large Text (24px+)
          </p>
          <p style={{ color: foreground }} className="text-base mb-4">
            Normal text at 16px. The quick brown fox jumps over the lazy dog.
          </p>
          <p style={{ color: foreground }} className="text-sm">
            Small text at 14px for fine print and captions.
          </p>
        </div>
      </div>

      {/* WCAG compliance table */}
      {compliance && (
        <div className="border-b-2 border-border">
          <div className="px-4 py-3 border-b border-border">
            <label className="font-bold">WCAG 2.1 Compliance</label>
          </div>
          {/* Table rows */}
          {[
            { level: "AA", label: "Normal text", threshold: "4.5:1", pass: compliance.aaNormal },
            { level: "AA", label: "Large text", threshold: "3:1", pass: compliance.aaLarge },
            { level: "AAA", label: "Normal text", threshold: "7:1", pass: compliance.aaaNormal },
            { level: "AAA", label: "Large text", threshold: "4.5:1", pass: compliance.aaaLarge },
          ].map((row, i, arr) => (
            <div
              key={i}
              className={cn(
                "flex items-stretch",
                i < arr.length - 1 && "border-b border-border"
              )}
            >
              {/* Level badge cell */}
              <div className="flex w-16 shrink-0 items-center justify-center border-r border-border">
                <span className="text-xs font-bold text-muted-foreground">{row.level}</span>
              </div>
              {/* Description */}
              <div className="flex flex-1 items-center px-4 py-3">
                <span className="text-sm">{row.label}</span>
                <span className="ml-2 text-xs text-muted-foreground" style={monoStyle}>{row.threshold}</span>
              </div>
              {/* Pass/fail cell */}
              <div className={cn(
                "flex w-16 shrink-0 items-center justify-center border-l border-border",
                row.pass ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
              )}>
                {row.pass ? <Check className="size-4" /> : <X className="size-4" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info panel */}
      <div className="px-4 py-4">
        <div className="font-bold mb-2">About WCAG Contrast Requirements</div>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li><strong>AA Normal:</strong> 4.5:1 minimum for text smaller than 18pt (or 14pt bold)</li>
          <li><strong>AA Large:</strong> 3:1 minimum for text 18pt+ (or 14pt+ bold)</li>
          <li><strong>AAA Normal:</strong> 7:1 minimum for enhanced accessibility</li>
          <li><strong>AAA Large:</strong> 4.5:1 minimum for large text enhanced accessibility</li>
        </ul>
      </div>

    </div>
  );
}
