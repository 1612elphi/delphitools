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
 * Drop shadow. Lives at the LAYER level (alongside opacity + blendMode), NOT in
 * the effects[] stack — on purpose, for engine reasons, even though the UI
 * surfaces it inside the Effects panel so it reads as an "effect" to the user:
 *   - It maps to Fabric's object-level `fabric.Shadow`, which works on ANY layer
 *     kind (raster/text/shape). The effects[] stack is raster-only pixel filters
 *     (`image.filters[]`) — a shadow there couldn't apply to text/shapes without
 *     rasterising them first.
 *   - A shadow draws OUTSIDE the layer's pixel bounds; a WebGL pixel filter only
 *     transforms pixels within the source texture, so it structurally can't.
 *   - One shadow per layer (like one opacity / one blend), not a reorderable
 *     stack — so a single field fits better than a list entry.
 */
export interface ShadowSpec {
  colour: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

/**
 * A non-destructive pixel effect entry (§6). DRAFT shape — `type` becomes a
 * typed discriminated union in M3 when the effect tiers are implemented.
 */
export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number>;
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
  shadow: ShadowSpec | null;
  /** ordered, non-destructive; empty until M3 */
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
