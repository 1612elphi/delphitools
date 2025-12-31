"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUpDown, Wand2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

function ComplianceBadge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
      pass ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400" : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
    }`}>
      {pass ? <Check className="size-4" /> : <X className="size-4" />}
      <span className="font-medium text-sm">{label}</span>
    </div>
  );
}

export function ContrastCheckerTool() {
  const [background, setBackground] = useState("#1a1a2e");
  const [foreground, setForeground] = useState("#eaeaea");
  const [ratio, setRatio] = useState<number | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Colour Inputs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="font-bold">Background Colour</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={isValidHex(background) ? background : "#000000"}
              onChange={(e) => setBackground(e.target.value)}
              className="w-14 h-10 rounded border cursor-pointer"
            />
            <Input
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="#1a1a2e"
              className="font-mono flex-1"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="font-bold">Foreground Colour</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={isValidHex(foreground) ? foreground : "#ffffff"}
              onChange={(e) => setForeground(e.target.value)}
              className="w-14 h-10 rounded border cursor-pointer"
            />
            <Input
              value={foreground}
              onChange={(e) => setForeground(e.target.value)}
              placeholder="#eaeaea"
              className="font-mono flex-1"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={flipColors}>
          <ArrowUpDown className="size-4 mr-2" />
          Flip Colours
        </Button>
        <Button variant="outline" onClick={fixColors} disabled={compliance?.aaNormal}>
          <Wand2 className="size-4 mr-2" />
          Fix to AA
        </Button>
        <Button variant="outline" onClick={fixToAAA} disabled={compliance?.aaaNormal}>
          <Wand2 className="size-4 mr-2" />
          Fix to AAA
        </Button>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <label className="font-bold">Preview</label>
        <div
          className="p-8 rounded-lg border"
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

      {/* Contrast Ratio */}
      <div className="p-6 rounded-lg border bg-muted/30 text-center">
        <div className="text-sm text-muted-foreground mb-1">Contrast Ratio</div>
        <div className="text-5xl font-bold mb-2">
          {ratio ? `${ratio.toFixed(2)}:1` : "—"}
        </div>
        {ratio && (
          <div className="text-sm text-muted-foreground">
            {ratio >= WCAG.AAA_NORMAL ? "Excellent" : ratio >= WCAG.AA_NORMAL ? "Good" : ratio >= WCAG.AA_LARGE ? "Acceptable for large text" : "Poor"}
          </div>
        )}
      </div>

      {/* WCAG Compliance */}
      {compliance && (
        <div className="space-y-3">
          <label className="font-bold">WCAG 2.1 Compliance</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Level AA</div>
              <div className="flex flex-wrap gap-2">
                <ComplianceBadge pass={compliance.aaNormal} label="Normal Text (4.5:1)" />
                <ComplianceBadge pass={compliance.aaLarge} label="Large Text (3:1)" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Level AAA</div>
              <div className="flex flex-wrap gap-2">
                <ComplianceBadge pass={compliance.aaaNormal} label="Normal Text (7:1)" />
                <ComplianceBadge pass={compliance.aaaLarge} label="Large Text (4.5:1)" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="p-4 rounded-lg border bg-card">
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
