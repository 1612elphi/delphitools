/**
 * DRAFT document model (M1-2) — the proposed single source of truth for a
 * Substrata scene. Per §5/§6: the doc model is authoritative; Fabric is a pure
 * render target (one-way doc → Fabric, M1-3). Undo/redo (M1-8) patches THIS,
 * never Fabric JSON.
 *
 * ⚠️ DRAFT — DO NOT HARDEN AGAINST THIS YET. The schema (group nesting depth,
 * blend-mode enumeration, where bit-depth/colour-mode live, default artboard
 * dims) is gated on Ruby's sign-off (human gate after M1-2). It compiles so the
 * persistence + WebGL scaffolds have a real type to reference; expect churn.
 *
 * British spelling in our own fields (`colour…`); CSS/Fabric tokens keep their
 * own spelling.
 */

export const SCHEMA_VERSION = 1 as const;

export type LayerId = string;

/** Canvas compositing token stored on each layer; UI "Normal" ⇒ "source-over". */
export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** degrees */
  angle: number;
  flipX: boolean;
  flipY: boolean;
}

/**
 * A FILTER: a raster-only, INSIDE-only adjustment in the layer's filter stack
 * (`image.filters[]`) — brightness, blur, levels, etc. Order matters. A filter
 * only ever transforms the visible pixels of the layer and cannot draw outside
 * its bounds (that's the filter/effect line: filters stay in, effects can go
 * out). DRAFT shape — `type` becomes a typed union backed by a filter registry
 * in M3.
 */
export interface Filter {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number>;
}

/**
 * Where an effect composites relative to the layer's own pixels:
 *   - "outer": drawn BEHIND the layer (drop shadow, outer glow, outer stroke)
 *   - "inner": drawn IN FRONT, clipped to the layer's alpha (inner shadow/glow)
 * The phase per effect type is declared once in the effect registry
 * (lib/substrata/effects.ts) — the single, extensible source of truth.
 */
export type EffectPhase = "outer" | "inner";

/**
 * An EFFECT instance — drop/inner shadow, outer/inner glow, stroke, overlay…
 * Unlike a Filter, an effect works on ANY layer kind and may draw OUTSIDE the
 * layer bounds — that's the whole reason it's an effect and not a filter. `type`
 * keys into the effect registry, which declares the phase + params, so adding a
 * new effect happens in one place. Drop shadow is simply `type: "drop-shadow"`.
 */
export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  /** colours are strings, numerics are numbers; validated against the registry */
  params: Record<string, number | string>;
}

interface BaseLayer {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0–1 */
  opacity: number;
  blendMode: BlendMode;
  transform: Transform;
  /**
   * Per-layer non-destructive stack, composited in order:
   *   outer effects → (layer content + filters) → inner effects
   *   → then opacity/blendMode composite this layer onto those below.
   * Both arrays are empty until M3.
   */
  /** Filters (raster, inside-only adjustments), ordered & reorderable. */
  filters: Filter[];
  /** Effects (shadow/glow/stroke/overlay); can reach outside; phase per registry. */
  effects: Effect[];
}

export interface RasterLayer extends BaseLayer {
  kind: "raster";
  /** SHA-256 of the source raster in the blob store */
  blobHash: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  /** DRAFT — full text model (per-range styles etc.) lands in M2 */
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
}

export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  /** DRAFT — shape param union lands in M2 (PIECES) */
  shape: string;
  fill: string;
  stroke: string | null;
  strokeWidth: number;
}

export interface GroupLayer extends BaseLayer {
  kind: "group";
  children: Layer[];
}

export type Layer = RasterLayer | TextLayer | ShapeLayer | GroupLayer;

export type ColourMode = "rgb";

export interface Artboard {
  width: number;
  height: number;
  /** pixels-per-inch metadata; export uses pixel dims */
  resolution: number;
  /** working bit depth; 8-bit intermediate is the accepted v1 limit (§12) */
  bitDepth: 8;
  colourMode: ColourMode;
  /** CSS colour or null for transparent */
  background: string | null;
}

/**
 * A new scene opens INSTANTLY to this — no wizard, no template wall (§6). Other
 * sizes come from the preset picker (see ArtboardPreset); the default is just
 * the one you get without choosing.
 */
export const DEFAULT_ARTBOARD: Artboard = {
  width: 2000,
  height: 1500,
  resolution: 72,
  bitDepth: 8,
  colourMode: "rgb",
  background: "#ffffff",
};

/**
 * A selectable size for the new-scene preset panel (planned UI — Scene ▸ New
 * scene). `label` is ∑CG user-facing copy; WHICH presets to ship (social, print,
 * device, …) is a product decision still open. Dimensions are data, not copy.
 */
export interface ArtboardPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  resolution: number;
}

export interface SubstrataDoc {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  artboard: Artboard;
  layers: Layer[];
  createdAt: number;
  updatedAt: number;
}
