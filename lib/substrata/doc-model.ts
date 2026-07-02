/**
 * Document model (M1-2) — the single source of truth for a Substrata scene. Per
 * §5/§6: the doc model is authoritative; Fabric is a pure render target (one-way
 * doc → Fabric, M1-3). Undo/redo (M1-8) patches THIS, never Fabric JSON.
 *
 * ✅ RATIFIED — schema v1, signed off 2026-06-29: blend-mode = all 16 canvas
 * tokens; group nesting unlimited; bit-depth + colour-mode document-wide on the
 * artboard; default artboard 2000×1500. Downstream code MAY harden against this.
 * Changes from here are ADDITIVE only and must bump the Dexie/.substrata schema
 * version non-destructively (§13). Forward-staged refinements (typed `type`
 * unions, fuller text/shape models) are flagged inline and don't change v1 shape.
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
 * out). `type` keys into the filter registry (lib/substrata/filters.ts), which
 * declares each filter's category/tier/params; narrowing `type` to a typed
 * union stays an M3 option (additive, no v1 shape change).
 */
export interface Filter {
  id: string;
  type: string;
  enabled: boolean;
  /** colours are strings (Duotone/Vignette), numerics are numbers — value kinds
   *  follow the registry's ParamSpecs (hard validation is an M3 concern).
   *  Widened additively from number-only — every v1 doc written before the
   *  widening remains valid, so SCHEMA_VERSION stays 1. */
  params: Record<string, number | string>;
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
   * Both arrays are editable via the FX module (fx-ops.ts); rendering them is
   * the M3 engine — until then params are stored/undoable but move no pixels.
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
  /** v1 minimal; the full text model (per-range styles etc.) is added additively in M2 */
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
}

export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  /** v1 minimal; the shape param union is added additively in M2 (PIECES) */
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

// ── factories ────────────────────────────────────────────────────────────────
// Client-only (crypto.randomUUID / Date.now); never called during prerender.

/** Stable id for documents and layers. Secure-context only. */
export function newId(): string {
  return crypto.randomUUID();
}

export function identityTransform(): Transform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, angle: 0, flipX: false, flipY: false };
}

/**
 * A new, empty scene at the default artboard. `name` is document data; the UI
 * supplies the ∑CG placeholder ("Untitled scene") when it is blank — we don't
 * author copy here.
 */
export function createEmptyDoc(name = ""): SubstrataDoc {
  const now = Date.now();
  return {
    id: newId(),
    schemaVersion: SCHEMA_VERSION,
    name,
    artboard: { ...DEFAULT_ARTBOARD },
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createRasterLayer(opts: {
  name: string;
  blobHash: string;
  naturalWidth: number;
  naturalHeight: number;
  transform: Transform;
}): RasterLayer {
  return {
    kind: "raster",
    id: newId(),
    name: opts.name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    transform: opts.transform,
    filters: [],
    effects: [],
    blobHash: opts.blobHash,
    naturalWidth: opts.naturalWidth,
    naturalHeight: opts.naturalHeight,
  };
}
