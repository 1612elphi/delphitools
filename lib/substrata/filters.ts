/**
 * Filter registry — the filters[] counterpart of effects.ts: the single source
 * of truth for the INSIDE-only, per-layer adjustments (the family Gaussian blur
 * and Levels belong to — they transform the layer's visible pixels and never
 * draw outside them; that's the filter/effect line). The v1 list is the SPEC §9
 * contract: Tier 0 = Fabric built-ins, Tier 1 = the four custom GLSL filters.
 *
 * `category` is UI taxonomy ONLY — how the FX panel's add-picker groups the
 * pipeline. "filter" = every adjustment, spatial AND colour (brightness, blur,
 * levels…). "colour" = the film-sim/LUT family (Ruby's third layer-property
 * type, category name TBD): whole-image looks picked from PRESETS named after
 * film stocks and movies — the preset names are authored copy → ∑CG gaps.
 * Both live in the SAME doc array (layer.filters) and composite in array
 * order; the doc model doesn't know the difference.
 *
 * Structural (modals pass): specs/defaults drive the FX panel; render functions
 * attach in M3, additively. Sharpen/Emboss/Edge are three registry types that
 * will share one Fabric Convolute with different kernels (M3-4). Labels are
 * standard graphics terms — functional chrome per Ruby's call, not authored
 * copy; British spelling (type keys keep Fabric/CSS-adjacent spellings).
 */

import type { FxDefinition, ParamSpec } from "./param-spec";

/** UI grouping for the add-picker / pipeline zones — not a doc-model concept. */
export type FilterCategory = "colour" | "filter";

export interface FilterDefinition extends FxDefinition {
  category: FilterCategory;
  /** SPEC §9: 0 = Fabric built-in, 1 = custom GLSL (+ Canvas2D fallback). */
  tier: 0 | 1;
}

/**
 * The film-sim preset shelf. Each entry becomes a card in the add-picker's
 * colour group and a swatch in the film-sim block's preset grid. `swatch` is a
 * representative placeholder gradient (visual data — replaced by real
 * LUT-derived looks in M3); `label` is a film-stock/movie-inspired NAME =
 * authored copy, so every one is a ∑CG gap for slopsieve.
 * The shelf size (8, matching the sketch's presets grid) is a placeholder count.
 */
export interface FilmSimPreset {
  id: string;
  label: string;
  /** gradient stops, light → dark (placeholder look) */
  swatch: [string, string, string];
}

// ∑CG (×8): film-sim preset names, one per entry below.
//   spec: each ≤ 14 chars, evocative film-stock or movie-inspired look name
//   (Ruby's call); Title Case; British spelling where applicable; all eight
//   distinct. The swatch next to each hints at the look's palette.
//   samples: a warm gold stock · a teal-orange blockbuster grade · a faded
//   pastel matinee · a cool blue night look · a silver monochrome · a green-cast
//   fuji-ish stock · a magenta vapour wash · a warm red kodachrome-ish stock.
export const FILM_SIM_PRESETS: FilmSimPreset[] = [
  { id: "sim-01", label: "∑CG", swatch: ["#d4952a", "#8a5a2a", "#2a1f14"] },
  { id: "sim-02", label: "∑CG", swatch: ["#e8833a", "#1f6f6b", "#132a2a"] },
  { id: "sim-03", label: "∑CG", swatch: ["#e8c8b8", "#b8c8c0", "#6a7a72"] },
  { id: "sim-04", label: "∑CG", swatch: ["#7a9ac8", "#3a4a6a", "#141a2a"] },
  { id: "sim-05", label: "∑CG", swatch: ["#e8e8e4", "#8a8a86", "#1d1d1c"] },
  { id: "sim-06", label: "∑CG", swatch: ["#a8c89a", "#4a7a4a", "#14231a"] },
  { id: "sim-07", label: "∑CG", swatch: ["#e89ab8", "#8a5a9a", "#2a1a2e"] },
  { id: "sim-08", label: "∑CG", swatch: ["#e0573f", "#8a3a2a", "#241412"] },
];

const amount = (def = 0): ParamSpec => ({
  kind: "slider",
  key: "amount",
  label: "Amount",
  min: -100,
  max: 100,
  step: 1,
  default: def,
});

const pct = (key: string, label: string, def: number): ParamSpec => ({
  kind: "slider",
  key,
  label,
  min: 0,
  max: 100,
  step: 1,
  default: def,
  unit: "%",
});

const level = (key: string, label: string, def: number): ParamSpec => ({
  kind: "slider",
  key,
  label,
  min: 0,
  max: 255,
  step: 1,
  default: def,
});

const gammaChannel = (key: string, label: string): ParamSpec => ({
  kind: "slider",
  key,
  label,
  min: 0.2,
  max: 2.2,
  step: 0.01,
  default: 1,
});

export const FILTER_REGISTRY: Record<string, FilterDefinition> = {
  // ── colour adjustments (filters, Tier 0) ───────────────────────────────────
  brightness: { type: "brightness", category: "filter", tier: 0, label: "Brightness", params: [amount()] },
  contrast: { type: "contrast", category: "filter", tier: 0, label: "Contrast", params: [amount()] },
  // Linear gain, mapped to a ColorMatrix in M3 (BUILD-PLAN M3-4).
  exposure: { type: "exposure", category: "filter", tier: 0, label: "Exposure", params: [amount()] },
  saturation: { type: "saturation", category: "filter", tier: 0, label: "Saturation", params: [amount()] },
  vibrance: { type: "vibrance", category: "filter", tier: 0, label: "Vibrance", params: [amount()] },
  "hue-rotate": {
    type: "hue-rotate",
    category: "filter",
    tier: 0,
    label: "Hue rotate",
    params: [{ kind: "stepper", key: "angle", label: "Angle", min: -180, max: 180, step: 1, default: 0, unit: "°" }],
  },
  // Warm/cool linear R/B gain, NOT Kelvin (SPEC §9).
  temperature: { type: "temperature", category: "filter", tier: 0, label: "Temperature", params: [amount()] },
  grayscale: { type: "grayscale", category: "filter", tier: 0, label: "Greyscale", params: [] },
  sepia: { type: "sepia", category: "filter", tier: 0, label: "Sepia", params: [] },
  invert: { type: "invert", category: "filter", tier: 0, label: "Invert", params: [] },
  // Threshold/Posterise carry a ship-as-GLSL vs defer call (M3-5); structurally
  // registered either way — deferring is a registry deletion, not a UI change.
  threshold: {
    type: "threshold",
    category: "filter",
    tier: 0,
    label: "Threshold",
    params: [level("level", "Level", 128)],
  },
  gamma: {
    type: "gamma",
    category: "filter",
    tier: 0,
    label: "Gamma",
    params: [gammaChannel("red", "Red"), gammaChannel("green", "Green"), gammaChannel("blue", "Blue")],
  },
  posterize: {
    type: "posterize",
    category: "filter",
    tier: 0,
    label: "Posterise",
    params: [{ kind: "stepper", key: "levels", label: "Levels", min: 2, max: 32, step: 1, default: 6 }],
  },

  // ── colour adjustments (filters, Tier 1 customs) ───────────────────────────
  levels: {
    type: "levels",
    category: "filter",
    tier: 1,
    label: "Levels",
    params: [
      level("inBlack", "In black", 0),
      level("inWhite", "In white", 255),
      { kind: "slider", key: "gamma", label: "Gamma", min: 0.1, max: 10, step: 0.01, default: 1 },
      level("outBlack", "Out black", 0),
      level("outWhite", "Out white", 255),
    ],
  },
  // The OkLab region model (shadow/mid/highlight masks, preserve-luminosity) is
  // an open design call (M3-7) — params land with it; the entry exists so the
  // pipeline/picker shape is real now.
  "colour-balance": { type: "colour-balance", category: "filter", tier: 1, label: "Colour balance", params: [] },
  // Preset colour-pairs (the modals.html `.presets` grid) arrive with M3-9.
  duotone: {
    type: "duotone",
    category: "filter",
    tier: 1,
    label: "Duotone",
    params: [
      { kind: "colour", key: "shadowColour", label: "Shadows", default: "#000000" },
      { kind: "colour", key: "highlightColour", label: "Highlights", default: "#ffffff" },
      pct("midpoint", "Midpoint", 50),
    ],
  },

  // ── spatial / texture filters ──────────────────────────────────────────────
  "gaussian-blur": {
    type: "gaussian-blur",
    category: "filter",
    tier: 0,
    label: "Gaussian blur",
    params: [{ kind: "slider", key: "radius", label: "Radius", min: 0, max: 50, step: 0.5, default: 10, unit: "px" }],
  },
  sharpen: { type: "sharpen", category: "filter", tier: 0, label: "Sharpen", params: [] },
  emboss: { type: "emboss", category: "filter", tier: 0, label: "Emboss", params: [] },
  "edge-detect": { type: "edge-detect", category: "filter", tier: 0, label: "Edge detect", params: [] },
  noise: { type: "noise", category: "filter", tier: 0, label: "Noise", params: [pct("amount", "Amount", 25)] },
  pixelate: {
    type: "pixelate",
    category: "filter",
    tier: 0,
    label: "Pixelate",
    params: [{ kind: "stepper", key: "blockSize", label: "Block size", min: 2, max: 64, step: 1, default: 8, unit: "px" }],
  },
  vignette: {
    type: "vignette",
    category: "filter",
    tier: 1,
    label: "Vignette",
    params: [
      pct("amount", "Amount", 50),
      pct("midpoint", "Midpoint", 50),
      pct("roundness", "Roundness", 0),
      pct("feather", "Feather", 50),
      { kind: "colour", key: "colour", label: "Colour", default: "#000000" },
    ],
  },

  // ── colour: the film-sim / LUT family (Ruby's third property type) ─────────
  // ONE type; the look is the `preset` param (one-per-type ⇒ one sim per layer;
  // picking another preset switches it). The real LUT engine + per-preset
  // grades are M3; intensity mixes the graded result over the original.
  "film-sim": {
    type: "film-sim",
    category: "colour",
    tier: 1,
    // ∑CG: type-level block-header fallback name for the film-sim/LUT family —
    //   the category itself is still unnamed (Ruby). Shown only when a preset
    //   label is missing; the block header normally shows the preset's name.
    //   spec: ≤ 12 chars, noun; British spelling. sample: "Film sim"
    label: "∑CG",
    params: [
      {
        kind: "presets",
        key: "preset",
        label: "Preset",
        default: FILM_SIM_PRESETS[0].id,
        options: FILM_SIM_PRESETS.map((p) => ({ value: p.id, label: p.label, swatch: p.swatch })),
      },
      pct("intensity", "Intensity", 100),
    ],
  },
  // NOTE: SPEC §9 also lists "Colour Overlay/Tint" at Tier 0 — that concept is
  // already ratified as the `colour-overlay` INNER EFFECT (effects.ts), which
  // works on any layer kind; it is deliberately not duplicated here.
};

export const getFilterDef = (type: string): FilterDefinition | undefined => FILTER_REGISTRY[type];
