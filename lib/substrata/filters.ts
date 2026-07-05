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
 * Rendering is LIVE for every entry: tier 0 maps to Fabric built-ins, tier 1
 * to the custom shaders in filter-shaders.ts — both via filter-factory.ts
 * (which owns ALL unit scaling). Labels are standard graphics terms —
 * functional chrome per Ruby's call, not authored copy; British spelling
 * (type keys keep Fabric/CSS-adjacent spellings).
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

// Preset names authored by Claude per Ruby's explicit grant (2026-07-03,
// "you're allowed to write names for them") — the ONE sanctioned exception to
// the no-copy rule; Ruby may rename any of them. Looks are inspired by popular
// film stocks / grades without using trademarked stock names.
export const FILM_SIM_PRESETS: FilmSimPreset[] = [
  { id: "sim-01", label: "Golden Hour", swatch: ["#d4952a", "#8a5a2a", "#2a1f14"] },
  { id: "sim-02", label: "Blockbuster", swatch: ["#e8833a", "#1f6f6b", "#132a2a"] },
  { id: "sim-03", label: "Matinee", swatch: ["#e8c8b8", "#b8c8c0", "#6a7a72"] },
  { id: "sim-04", label: "Nocturne", swatch: ["#7a9ac8", "#3a4a6a", "#141a2a"] },
  { id: "sim-05", label: "Gelatin Silver", swatch: ["#e8e8e4", "#8a8a86", "#1d1d1c"] },
  { id: "sim-06", label: "Evergreen", swatch: ["#a8c89a", "#4a7a4a", "#14231a"] },
  { id: "sim-07", label: "Vapourwave", swatch: ["#e89ab8", "#8a5a9a", "#2a1a2e"] },
  { id: "sim-08", label: "Carousel", swatch: ["#e0573f", "#8a3a2a", "#241412"] },
];

/**
 * The render side of each look (M3 film-sim engine): a lift/gamma/gain +
 * saturation grade fed to SubstrataFilmSim. Lives HERE beside the preset shelf
 * so a look is tuned in one place (swatch + grade together). Values are
 * curated starting points — taste QA is Ruby's.
 */
export interface FilmSimGrade {
  /** added to shadows, per channel 0–1 */
  lift: [number, number, number];
  /** per-channel multiplier (highlights) */
  gain: [number, number, number];
  /** per-channel power curve (<1 brightens) */
  gamma: [number, number, number];
  /** 0 = mono, 1 = unchanged, >1 = boosted */
  sat: number;
}

/**
 * Apply a grade to raw RGBA pixels in place — the ONE implementation of the
 * film-sim maths outside the GPU: SubstrataFilmSim's Canvas2D fallback and the
 * looks panel's thumbnail renderer both call it (keeping this module
 * fabric-free so panels can import it outside the canvas boundary).
 * Mirrors the GLSL exactly: lift/gain → clamp → per-channel gamma → saturation
 * about Rec.709 luma → intensity mix with the original.
 */
export function applyGradeToImageData(data: Uint8ClampedArray, grade: FilmSimGrade, intensity: number): void {
  const { lift, gain, gamma, sat } = grade;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  for (let i = 0; i < data.length; i += 4) {
    const graded = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const v = data[i + k] / 255;
      graded[k] = Math.pow(clamp01(v * gain[k] + lift[k] * (1 - v)), gamma[k]);
    }
    const lum = graded[0] * 0.2126 + graded[1] * 0.7152 + graded[2] * 0.0722;
    for (let k = 0; k < 3; k++) {
      const c = clamp01(lum + (graded[k] - lum) * sat);
      data[i + k] += (c * 255 - data[i + k]) * intensity;
    }
  }
}

export const FILM_SIM_GRADES: Record<string, FilmSimGrade> = {
  // Golden Hour — warm gold wash, soft shadows, gentle glow
  "sim-01": { lift: [0.05, 0.03, 0], gain: [1.06, 1.0, 0.86], gamma: [0.94, 0.98, 1.05], sat: 1.1 },
  // Blockbuster — teal shadows, orange highlights, punchy mids
  "sim-02": { lift: [0, 0.035, 0.055], gain: [1.09, 1.0, 0.85], gamma: [1.05, 1.0, 0.97], sat: 1.12 },
  // Matinee — lifted flat blacks, faded pastel warmth
  "sim-03": { lift: [0.09, 0.08, 0.075], gain: [1.0, 0.98, 0.94], gamma: [0.9, 0.9, 0.93], sat: 0.8 },
  // Nocturne — cool blue cast, deepened mids
  "sim-04": { lift: [0, 0.012, 0.05], gain: [0.9, 0.96, 1.08], gamma: [1.1, 1.05, 0.97], sat: 0.85 },
  // Gelatin Silver — true monochrome with a punchy print curve
  "sim-05": { lift: [0.01, 0.01, 0.01], gain: [1.03, 1.03, 1.03], gamma: [1.1, 1.1, 1.1], sat: 0 },
  // Evergreen — green-leaning mids, soft warm-off highlights
  "sim-06": { lift: [0.012, 0.03, 0.012], gain: [0.96, 1.05, 0.93], gamma: [1.0, 0.95, 1.02], sat: 1.05 },
  // Vapourwave — magenta lift, cyan-tinged highlights, saturated
  "sim-07": { lift: [0.07, 0.02, 0.09], gain: [1.05, 0.93, 1.1], gamma: [0.92, 1.0, 0.9], sat: 1.15 },
  // Carousel — deep warm reds, amber mids, rich contrast
  "sim-08": { lift: [0.025, 0.005, 0], gain: [1.1, 0.97, 0.88], gamma: [0.97, 1.04, 1.1], sat: 1.18 },
};

// ∑CG (×8): duotone preset-pair names (title/aria on the pair swatches).
//   spec: each ≤ 14 chars, evocative two-colour look name; Title Case; British
//   spelling; all eight distinct. The pair next to each is shadow → highlight.
//   samples: navy/cream "Heritage" · black/cyan "Xerox" · purple/yellow
//   "Nightclub" · forest/mint "Botanic" · crimson/peach "Darkroom" ·
//   charcoal/orange "Furnace" · indigo/rose "Dusk" · teal/sand "Lagoon".
export const DUOTONE_PAIRS: { id: string; label: string; shadow: string; highlight: string }[] = [
  { id: "duo-01", label: "∑CG", shadow: "#1a2456", highlight: "#f5e9d0" },
  { id: "duo-02", label: "∑CG", shadow: "#000000", highlight: "#00c2d1" },
  { id: "duo-03", label: "∑CG", shadow: "#3b1f5e", highlight: "#ffd166" },
  { id: "duo-04", label: "∑CG", shadow: "#16351f", highlight: "#baf2c5" },
  { id: "duo-05", label: "∑CG", shadow: "#641220", highlight: "#ffc49b" },
  { id: "duo-06", label: "∑CG", shadow: "#232323", highlight: "#ff7f2a" },
  { id: "duo-07", label: "∑CG", shadow: "#2d1b69", highlight: "#ff9ecd" },
  { id: "duo-08", label: "∑CG", shadow: "#0f4c4c", highlight: "#e8d5a3" },
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
    // slider, not stepper — clicking ± through 360 degrees is clunky (Ruby QA)
    params: [{ kind: "slider", key: "angle", label: "Angle", min: -180, max: 180, step: 1, default: 0, unit: "°" }],
  },
  // Warm/cool linear R/B gain, NOT Kelvin (SPEC §9).
  temperature: { type: "temperature", category: "filter", tier: 0, label: "Temperature", params: [amount()] },
  grayscale: { type: "grayscale", category: "filter", tier: 0, label: "Greyscale", params: [] },
  sepia: { type: "sepia", category: "filter", tier: 0, label: "Sepia", params: [] },
  invert: { type: "invert", category: "filter", tier: 0, label: "Invert", params: [] },
  // M3-5 RATIFIED (Ruby, 2026-07-03): threshold/posterise ship as custom
  // shaders (SubstrataThreshold/SubstrataPosterise) — tier 1, not the Fabric
  // built-ins SPEC §9 mistook them for.
  threshold: {
    type: "threshold",
    category: "filter",
    tier: 1,
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
    tier: 1,
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
  // M3-7 RATIFIED (Ruby, 2026-07-03): three sliders, one region — shifts are
  // midtone-weighted (fade out of shadows/highlights). Slider-end labels are
  // Photoshop's own conventional terms.
  "colour-balance": {
    type: "colour-balance",
    category: "filter",
    tier: 1,
    label: "Colour balance",
    params: [
      { kind: "slider", key: "cyanRed", label: "Cyan – Red", min: -100, max: 100, step: 1, default: 0 },
      { kind: "slider", key: "magentaGreen", label: "Magenta – Green", min: -100, max: 100, step: 1, default: 0 },
      { kind: "slider", key: "yellowBlue", label: "Yellow – Blue", min: -100, max: 100, step: 1, default: 0 },
    ],
  },
  // M3-9 RATIFIED (Ruby, 2026-07-03): preset colour pairs above the custom
  // pickers. Pairs QUICK-SET the two colour params (pairs kind = virtual).
  duotone: {
    type: "duotone",
    category: "filter",
    tier: 1,
    label: "Duotone",
    params: [
      {
        kind: "pairs",
        key: "pair",
        label: "Presets",
        options: DUOTONE_PAIRS.map((p) => ({
          value: p.id,
          label: p.label,
          colours: [p.shadow, p.highlight],
          writes: { shadowColour: p.shadow, highlightColour: p.highlight },
        })),
      },
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
  // Amount interpolates the convolution kernel identity→full (100 = the
  // classic kernel); edge-detect stays paramless (Ruby QA: doesn't need one).
  sharpen: { type: "sharpen", category: "filter", tier: 0, label: "Sharpen", params: [pct("amount", "Amount", 100)] },
  emboss: { type: "emboss", category: "filter", tier: 0, label: "Emboss", params: [pct("amount", "Amount", 100)] },
  "edge-detect": { type: "edge-detect", category: "filter", tier: 0, label: "Edge detect", params: [] },
  noise: {
    type: "noise",
    category: "filter",
    tier: 0,
    label: "Noise",
    params: [
      pct("amount", "Amount", 25),
      // mono = one grain across RGB (film-like); colour = per-channel grain
      // (sensor-like). Default mono — matches pre-param docs' rendered look.
      {
        kind: "select",
        key: "mode",
        label: "Mode",
        default: "mono",
        options: [
          { value: "mono", label: "Monochrome" },
          { value: "colour", label: "Colour" },
        ],
      },
    ],
  },
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
