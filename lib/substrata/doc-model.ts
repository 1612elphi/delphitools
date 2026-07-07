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

/**
 * v2 = the ratified M2-1 extension (2026-07-02): ShapeLayer gained its
 * discriminated param union + Gradient/ShapeStroke fill model (landed with
 * PIECES). The remaining ratified kinds (full TextLayer, PathLayer,
 * FreehandLayer) land additively WITHIN v2 — restore defaults missing fields.
 * v1 docs contain no shape layers (the kind was never instantiable), so
 * loading one only needs the version stamp, no field migration.
 */
export const SCHEMA_VERSION = 2 as const;

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
   *  Widened additively from number-only — every doc written before the
   *  widening remains valid, so that change alone didn't bump the schema. */
  params: Record<string, number | string>;
}

/**
 * Where an effect composites relative to the layer's own pixels:
 *   - "outer": drawn BEHIND the layer (drop shadow, outer glow, outer stroke)
 *   - "inner": drawn IN FRONT, clipped to the layer's alpha (inner shadow/glow)
 * Declared per type in the effect registry (lib/substrata/effects.ts) as
 * descriptive taxonomy; the renderer (effect-render.ts) routes per type —
 * stroke straddles both phases via its `position` param.
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

/** Non-destructive layer crop (MOVE·Crop, ratified 2026-07-07): a stored rect
 *  in LAYER space — intrinsic, unscaled, origin = the content's top-left
 *  (centre − dims/2); the transform scales it (the ShapeParams convention).
 *  Only meaningful for layers with intrinsic dims (layerDims non-null:
 *  raster/shape/freehand); the reconciler ignores it elsewhere. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  /** Non-destructive crop — null/absent = uncropped. Additive optional within
   *  schema v2 (the Filter.params widening precedent; no schema bump). */
  crop?: CropRect | null;
  /**
   * Per-layer non-destructive stack, composited in order:
   *   outer effects → (layer content + filters) → inner effects
   *   → then opacity/blendMode composite this layer onto those below.
   * Both arrays are editable via the FX module (fx-ops.ts). Tier-0 filters
   * render via filter-sync/filter-factory (M3); Tier-1 filters and effects are
   * stored/undoable but move no pixels until their engines land.
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

/** A background plate drawn behind the text — the "on a pill / on a rectangle"
 *  text styles (Ruby 2026-07-06). Padding in scene px around the text bounds. */
export interface TextPlate {
  shape: "pill" | "rectangle";
  colour: string;
  padding: number;
}

export type TextAlign = "left" | "center" | "right" | "justify";

export interface TextLayer extends BaseLayer {
  kind: "text";
  /** v1: point text + styles; the full ratified model (area mode,
   *  per-range deltas…) is added additively within schema v2. */
  text: string;
  /** a font-choice id (sans/serif/mono → system stacks via fonts.ts) or an
   *  uploaded family name; unknown families fall back to the sans stack */
  fontFamily: string;
  fontSize: number;
  fill: string;
  /** outline style — glyph stroke (null = none) */
  stroke: { colour: string; width: number } | null;
  /** pill/rectangle styles (null = none). Style PRESETS quick-set fill/stroke/
   *  plate; the active preset is DERIVED from these fields (duotone precedent). */
  plate: TextPlate | null;
  /** Object-level typography (ratified M2-1), additive within schema v2 —
   *  optional with defaults at the consumers so pre-existing docs restore
   *  untouched (the Filter.params widening precedent; no schema bump). */
  align?: TextAlign; // default "left"
  /** multiple of the font size (fabric's lineHeight; default 1.16) */
  lineHeight?: number;
  /** tracking in fabric units — 1/1000 em (default 0) */
  charSpacing?: number;
  direction?: "ltr" | "rtl"; // default "ltr"
}

export interface GradientStop {
  /** 0–1 along the gradient axis */
  offset: number;
  colour: string;
}

/**
 * Gradient fill (ratified M2-1). Coords are RELATIVE (0–1) to the shape's
 * intrinsic bounds, so the gradient tracks the shape through any transform.
 * linear: the x1,y1 → x2,y2 line · radial: r1 (inner) / r2 (outer) circles.
 */
export interface Gradient {
  type: "linear" | "radial";
  stops: GradientStop[];
  coords: { x1: number; y1: number; x2: number; y2: number; r1?: number; r2?: number };
}

/** Vector stroke on a shape — the stroke EFFECT (effects.ts) stays the
 *  separate any-layer outline; this is the shape's own drawn stroke. */
export interface ShapeStroke {
  colour: string;
  width: number;
  dash?: number[];
}

/**
 * Ratified M2-1 param union — intrinsic geometry UNSCALED (the transform
 * scales it; centre-origin like every kind). Adding a shape = a new arm here
 * + its geometry in shape-geometry.ts.
 */
export type ShapeParams =
  | { shape: "rectangle"; width: number; height: number; cornerRadius: number }
  | { shape: "ellipse"; rx: number; ry: number }
  | { shape: "line"; length: number }
  | { shape: "polygon"; sides: number; radius: number }
  | { shape: "star"; points: number; outerRadius: number; innerRadius: number }
  // preset-gallery symbol (2026-07-07, additive within v2): a vendored path
  // (preset-shapes.ts) whose 256-grid maps onto width×height
  | { shape: "symbol"; symbolId: string; width: number; height: number };

export type PieceShape = ShapeParams["shape"];

export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  params: ShapeParams;
  /** a line renders stroke-only and ignores fill */
  fill: string | Gradient;
  stroke: ShapeStroke | null;
}

/** perfect-freehand's option shape (ratified M2-1) — persisted per layer so a
 *  stroke re-renders identically forever, whatever the library's defaults do. */
export interface FreehandStrokeOptions {
  size: number;
  /** pressure→width effect, 0–1 */
  thinning: number;
  smoothing: number;
  streamline: number;
  /** true when drawn with a mouse/finger; false = real pen pressure recorded */
  simulatePressure: boolean;
}

export interface FreehandLayer extends BaseLayer {
  kind: "freehand";
  /**
   * [x, y, pressure] in layer-local coords (centre-origin like every kind) —
   * the TRUTH. The rendered outline path is a derived artifact and is never
   * persisted (ratified M2-1).
   */
  rawPoints: [number, number, number][];
  strokeOptions: FreehandStrokeOptions;
  fill: string;
}

export interface GroupLayer extends BaseLayer {
  kind: "group";
  children: Layer[];
}

export type Layer = RasterLayer | TextLayer | ShapeLayer | FreehandLayer | GroupLayer;

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

/** A ruler guideline (2026-07-07 ratification: rulers ship with drag-out
 *  guides). `axis:"x"` = a VERTICAL line at scene x = pos; `axis:"y"` = a
 *  horizontal line at scene y = pos. Document content (per-scene, undoable,
 *  autosaved) — additive within v2; older docs restore with `guides: []`. */
export interface Guide {
  id: string;
  axis: "x" | "y";
  pos: number;
}

export interface SubstrataDoc {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  artboard: Artboard;
  layers: Layer[];
  guides: Guide[];
  createdAt: number;
  updatedAt: number;
}

/** Forward-stamp a doc loaded from ANY persistence surface (Dexie autosave,
 *  a .substrata file): v1 predates shape layers so the shape alone is already
 *  valid v2; `guides` landed additively within v2 — default it for docs saved
 *  before. One stamp point so the surfaces can't drift. */
export function stampLoadedDoc(doc: SubstrataDoc): SubstrataDoc {
  return { ...doc, guides: doc.guides ?? [], schemaVersion: SCHEMA_VERSION };
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
    guides: [],
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

export function createTextLayer(opts: {
  name: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  stroke: TextLayer["stroke"];
  plate: TextPlate | null;
  align?: TextAlign;
  transform: Transform;
}): TextLayer {
  return {
    kind: "text",
    id: newId(),
    name: opts.name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    transform: opts.transform,
    filters: [],
    effects: [],
    text: opts.text,
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    fill: opts.fill,
    stroke: opts.stroke,
    plate: opts.plate,
    align: opts.align,
  };
}

export function createFreehandLayer(opts: {
  name: string;
  rawPoints: [number, number, number][];
  strokeOptions: FreehandStrokeOptions;
  fill: string;
  transform: Transform;
}): FreehandLayer {
  return {
    kind: "freehand",
    id: newId(),
    name: opts.name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    transform: opts.transform,
    filters: [],
    effects: [],
    rawPoints: opts.rawPoints,
    strokeOptions: opts.strokeOptions,
    fill: opts.fill,
  };
}

export function createShapeLayer(opts: {
  name: string;
  params: ShapeParams;
  fill: string | Gradient;
  stroke: ShapeStroke | null;
  transform: Transform;
}): ShapeLayer {
  return {
    kind: "shape",
    id: newId(),
    name: opts.name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    transform: opts.transform,
    filters: [],
    effects: [],
    params: opts.params,
    fill: opts.fill,
    stroke: opts.stroke,
  };
}
