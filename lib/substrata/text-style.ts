/**
 * Text style presets (Ruby 2026-07-06: "basic text styles — regular text,
 * outline, on a pill, on a rectangle"). A preset QUICK-SETS the layer's
 * explicit fill/stroke/plate fields; the active preset is DERIVED from them
 * (the duotone-pairs pattern) — so styles stay editable data, not modes.
 * Pure — shared by the TEXT tool (creation), the bloom, and the Inspector.
 */

import { hexToRgb } from "./colour-convert";
import type { TextLayer, TextPlate } from "./doc-model";

export type TextStylePreset = "regular" | "outline" | "pill" | "rectangle";

/** Preset order + labels (standard type vocabulary — functional chrome,
 *  Ruby's own words for the styles). */
export const TEXT_STYLE_PRESETS: Array<{ id: TextStylePreset; label: string }> = [
  { id: "regular", label: "Regular" },
  { id: "outline", label: "Outline" },
  { id: "pill", label: "Pill" },
  { id: "rectangle", label: "Rectangle" },
];

export interface TextStyleFields {
  fill: string;
  stroke: TextLayer["stroke"];
  plate: TextPlate | null;
}

/** Ink that reads on a given plate colour — relative luminance split. */
export function contrastInk(bg: string): string {
  const rgb = hexToRgb(bg);
  if (!rgb) return "#1d1d1d";
  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return lum > 0.55 ? "#1d1d1d" : "#f4f1ea";
}

/** The fields a preset sets, built around ONE accent colour (the current
 *  colour at creation / the layer's accent on a style switch). Stroke width
 *  and plate padding scale with the type size — taste numbers. */
export function styleFields(preset: TextStylePreset, accent: string, fontSize: number): TextStyleFields {
  switch (preset) {
    case "regular":
      return { fill: accent, stroke: null, plate: null };
    case "outline":
      return {
        fill: "transparent",
        stroke: { colour: accent, width: Math.max(2, Math.round(fontSize / 16)) },
        plate: null,
      };
    case "pill":
    case "rectangle":
      return {
        fill: contrastInk(accent),
        stroke: null,
        plate: { shape: preset, colour: accent, padding: Math.round(fontSize * 0.35) },
      };
  }
}

/** Which preset a layer's fields currently express. */
export function deriveTextStyle(layer: Pick<TextLayer, "stroke" | "plate">): TextStylePreset {
  if (layer.plate) return layer.plate.shape;
  if (layer.stroke) return "outline";
  return "regular";
}

/** The layer's accent — the colour a style switch or colour-sink pick should
 *  re-express the style around. */
export function textAccent(layer: Pick<TextLayer, "fill" | "stroke" | "plate">): string {
  return layer.plate?.colour ?? layer.stroke?.colour ?? layer.fill;
}
