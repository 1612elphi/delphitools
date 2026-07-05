/**
 * Document → Fabric reconciler (M1-3). STRICT one-way: the doc model is the only
 * source of truth (§5/§12); this diffs the live Fabric scene against the doc and
 * creates/updates/removes objects to match. Fabric is never read back as truth —
 * interactive edits (M1-10) commit to the doc and re-enter through here.
 *
 * v1 renders the artboard + raster layers. GROUPS FLATTEN AWAY (M2): they are
 * organisational folders (layer-tree.ts) — the reconciler walks the leaf list
 * in doc order and composes each leaf's EFFECTIVE visibility/lock from its
 * ancestors. Tier-0 pixel filters render via filter-sync (M3); text/shape
 * rendering, Tier-1 filters, and effects are added additively in later
 * milestones; an unhandled layer kind is skipped, never half-rendered.
 *
 * Convention: a layer's transform.x/y is the object CENTRE in scene coordinates
 * (objects use originX/originY = "center").
 */

import type { Canvas, FabricObject } from "fabric";
import { Ellipse, Gradient as FabricGradient, Line, Path, Pattern, Polygon, Rect } from "fabric";
import type { SubstrataDoc, FreehandLayer, Layer, ShapeLayer, ShapeParams, Gradient, TextLayer } from "./doc-model";
import { EffectsImage } from "./effects-image";
import { SubstrataText } from "./text-object";
import { resolveFontCss } from "./fonts";
import { leafRenderList } from "./layer-tree";
import { getRaster } from "./raster-cache";
import { outlineToPathD, strokeOutline } from "./freehand";
import { polygonPoints, starPoints } from "./shape-geometry";
import { syncImageEffects, syncImageFilters } from "./filter-sync";

const ARTBOARD_KEY = "__artboard__";

/** Build the transparency-checker tile (2×2 of 10px squares) for a theme. */
function checkerSource(dark: boolean): HTMLCanvasElement {
  const [a, b] = dark ? ["#404040", "#333333"] : ["#ffffff", "#cccccc"];
  const c = document.createElement("canvas");
  c.width = 20;
  c.height = 20;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 20, 20);
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 10, 10);
  ctx.fillRect(10, 10, 10, 10);
  return c;
}

/**
 * Cached checkerboard Pattern for a transparent artboard (background === null).
 * Lives in artboard space, so it pans/zooms with the canvas and layers composite
 * over it (revealing transparency wherever nothing is painted). Theme-aware,
 * rebuilt when the light/dark class flips.
 */
function getCheckerPattern(state: ReconcileState): Pattern {
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  if (!state.checker || state.checker.dark !== dark) {
    state.checker = { dark, pattern: new Pattern({ source: checkerSource(dark), repeat: "repeat" }) };
  }
  return state.checker.pattern;
}

/** Reverse map (Fabric object → layer id) so canvas events can resolve the layer
 *  without Fabric becoming a source of truth. WeakMap so disposed objects GC. */
const layerIdOf = new WeakMap<FabricObject, string>();

export function getLayerIdForObject(obj: FabricObject): string | undefined {
  return layerIdOf.get(obj);
}

export interface ReconcileState {
  /** layer id (or ARTBOARD_KEY) → its Fabric object */
  byId: Map<string, FabricObject>;
  /** cached transparency checker (rebuilt on theme flip) */
  checker?: { dark: boolean; pattern: Pattern };
}

export function createReconcileState(): ReconcileState {
  return { byId: new Map() };
}

export function reconcile(canvas: Canvas, doc: SubstrataDoc, state: ReconcileState): void {
  const { byId } = state;
  const desired: FabricObject[] = [];
  const seen = new Set<string>([ARTBOARD_KEY]);

  // Artboard background (always at the back, non-interactive).
  let artboard = byId.get(ARTBOARD_KEY) as Rect | undefined;
  if (!artboard) {
    artboard = new Rect({ selectable: false, evented: false, hoverCursor: "default" });
    byId.set(ARTBOARD_KEY, artboard);
    canvas.add(artboard);
  }
  artboard.set({
    left: 0,
    top: 0,
    width: doc.artboard.width,
    height: doc.artboard.height,
    // A colour fills opaque; a null (transparent) background shows the checker.
    fill: doc.artboard.background ?? getCheckerPattern(state),
    originX: "left",
    originY: "top",
  });
  artboard.setCoords();
  desired.push(artboard);

  // Clip the whole canvas to the artboard: it's a frame. Layers can be positioned
  // freely (dragged past an edge), but only the part inside the artboard renders —
  // the same crop export uses, made visible while editing. This is the artboard
  // boundary, NOT a layer mask (the no-masks rule, §6/§11, is about per-layer
  // masking as an editing feature). The canvas clipPath is viewport-transformed
  // by Fabric, so it tracks pan/zoom.
  const clip = (canvas.clipPath instanceof Rect ? canvas.clipPath : new Rect({ originX: "left", originY: "top" })) as Rect;
  clip.set({ left: 0, top: 0, width: doc.artboard.width, height: doc.artboard.height });
  clip.setCoords();
  canvas.clipPath = clip;

  // Leaf layers in document order (groups flatten; flags compose down the tree).
  for (const entry of leafRenderList(doc.layers)) {
    const obj = syncLayer(canvas, entry.layer, entry.visible, entry.locked, byId);
    if (obj) {
      desired.push(obj);
      seen.add(entry.layer.id);
    }
  }

  // Drop Fabric objects whose layer no longer exists.
  for (const [key, obj] of byId) {
    if (!seen.has(key)) {
      canvas.remove(obj);
      byId.delete(key);
    }
  }

  // Restack to match document order (first in `desired` ends up at the back).
  for (const obj of desired) canvas.bringObjectToFront(obj);

  canvas.requestRenderAll();
}

function syncLayer(
  canvas: Canvas,
  layer: Layer,
  /** effective flags — the layer's own composed with its group ancestors' */
  visible: boolean,
  locked: boolean,
  byId: Map<string, FabricObject>,
): FabricObject | null {
  // Every leaf kind renders (raster/shape/freehand/text); groups flatten.
  const obj =
    layer.kind === "raster"
      ? syncRasterContent(canvas, layer, byId)
      : layer.kind === "shape"
        ? syncShapeContent(canvas, layer, byId)
        : layer.kind === "freehand"
          ? syncFreehandContent(canvas, layer, byId)
          : layer.kind === "text"
            ? syncTextContent(canvas, layer, byId)
            : null;
  if (!obj) return null;
  // Never clobber a live in-canvas edit — the doc catches up on
  // editing:exited (the second controlled Fabric→doc path).
  if (obj instanceof SubstrataText && obj.isEditing) return obj;

  const t = layer.transform;
  obj.set({
    left: t.x,
    top: t.y,
    scaleX: t.scaleX,
    scaleY: t.scaleY,
    angle: t.angle,
    flipX: t.flipX,
    flipY: t.flipY,
    opacity: layer.opacity,
    visible,
    globalCompositeOperation: layer.blendMode,
    originX: "center",
    originY: "center",
    // MOVE interaction: a layer is selectable/draggable unless (effectively)
    // locked. Interactive edits commit back to the doc via object:modified (the
    // one controlled Fabric→doc path); the doc stays authoritative.
    selectable: !locked,
    evented: !locked,
  });
  if (layer.kind === "raster") {
    // FX stacks (M3): both signature-diffed inside, so this is cheap per pass.
    syncImageFilters(obj as EffectsImage, layer.filters);
    syncImageEffects(obj as EffectsImage, layer.effects);
  }
  obj.setCoords();
  return obj;
}

function syncRasterContent(
  canvas: Canvas,
  layer: Layer & { kind: "raster" },
  byId: Map<string, FabricObject>,
): FabricObject | null {
  const src = getRaster(layer.blobHash);
  if (!src) return null; // not decoded yet — a later reconcile will pick it up

  let obj = byId.get(layer.id) as EffectsImage | undefined;
  if (!obj) {
    // Content-addressed source is immutable per layer, so the element is set once.
    obj = new EffectsImage(src);
    byId.set(layer.id, obj);
    layerIdOf.set(obj, layer.id);
    canvas.add(obj);
  }
  return obj;
}

/** Doc Gradient → fabric Gradient. Relative 0–1 coords map straight onto
 *  fabric's "percentage" gradientUnits (resolved against object dims). */
function toFabricFill(fill: ShapeLayer["fill"]): string | FabricGradient<unknown, "linear" | "radial"> {
  if (typeof fill === "string") return fill;
  const g = fill as Gradient;
  return new FabricGradient({
    type: g.type,
    gradientUnits: "percentage",
    coords: g.coords,
    colorStops: g.stops.map((s) => ({ offset: s.offset, color: s.colour })),
  });
}

function buildShapeObject(p: ShapeParams): FabricObject {
  switch (p.shape) {
    case "rectangle":
      return new Rect({ width: p.width, height: p.height, rx: p.cornerRadius, ry: p.cornerRadius });
    case "ellipse":
      return new Ellipse({ rx: p.rx, ry: p.ry });
    case "line":
      return new Line([-p.length / 2, 0, p.length / 2, 0]);
    case "polygon":
      return new Polygon(polygonPoints(p.sides, p.radius));
    case "star":
      return new Polygon(starPoints(p.points, p.outerRadius, p.innerRadius));
  }
}

/** In-place geometry update (all verified against fabric 7.4.0: Ellipse._set
 *  doubles rx/ry into width/height, Line._set recomputes on coord props,
 *  Polyline.setDimensions is public). Params stay INTRINSIC — the transform
 *  scales them — so a settings edit rebuilds geometry, not scale. */
function updateShapeGeometry(obj: FabricObject, p: ShapeParams): void {
  switch (p.shape) {
    case "rectangle":
      obj.set({ width: p.width, height: p.height, rx: p.cornerRadius, ry: p.cornerRadius });
      break;
    case "ellipse":
      obj.set({ rx: p.rx, ry: p.ry });
      break;
    case "line":
      obj.set({ x1: -p.length / 2, y1: 0, x2: p.length / 2, y2: 0 });
      break;
    case "polygon":
    case "star": {
      const poly = obj as Polygon;
      poly.points = p.shape === "polygon" ? polygonPoints(p.sides, p.radius) : starPoints(p.points, p.outerRadius, p.innerRadius);
      poly.setDimensions();
      break;
    }
  }
  obj.set("dirty", true);
}

/** Geometry identity per freehand Path — the doc is immutable, so reference
 *  equality on rawPoints/strokeOptions is the change signal (no JSON of
 *  hundreds of points per reconcile pass). */
const freehandBuiltFor = new WeakMap<FabricObject, { pts: unknown; opts: unknown }>();

/** Freehand stroke → fabric.Path of the perfect-freehand outline (fill-only —
 *  the stroke's body IS a filled polygon). Points are layer-local (centre-
 *  normalised at commit), so the Path centres like every other kind. A stroke's
 *  geometry is immutable after commit; a rebuild only happens if a future
 *  editor mutates points/options. */
function syncFreehandContent(
  canvas: Canvas,
  layer: FreehandLayer,
  byId: Map<string, FabricObject>,
): FabricObject | null {
  let obj = byId.get(layer.id);
  const built = obj && freehandBuiltFor.get(obj);
  if (obj && built && (built.pts !== layer.rawPoints || built.opts !== layer.strokeOptions)) {
    canvas.remove(obj);
    byId.delete(layer.id);
    obj = undefined;
  }
  if (!obj) {
    const d = outlineToPathD(strokeOutline(layer.rawPoints, layer.strokeOptions));
    if (!d) return null; // degenerate stroke (fewer than 3 outline points)
    obj = new Path(d);
    freehandBuiltFor.set(obj, { pts: layer.rawPoints, opts: layer.strokeOptions });
    byId.set(layer.id, obj);
    layerIdOf.set(obj, layer.id);
    canvas.add(obj);
  }
  obj.set({ fill: layer.fill, stroke: null, strokeWidth: 0 });
  return obj;
}

/** Text layer → SubstrataText (IText + style plate). Content props set every
 *  pass (cheap — fabric no-ops unchanged values); the plate is compared so
 *  its cache-pad/dirty only churn on real changes. */
function syncTextContent(
  canvas: Canvas,
  layer: TextLayer,
  byId: Map<string, FabricObject>,
): FabricObject {
  let obj = byId.get(layer.id) as SubstrataText | undefined;
  if (!obj) {
    obj = new SubstrataText(layer.text);
    byId.set(layer.id, obj);
    layerIdOf.set(obj, layer.id);
    canvas.add(obj);
  }
  if (obj.isEditing) return obj; // syncLayer skips the rest too
  obj.set({
    text: layer.text,
    fontFamily: resolveFontCss(layer.fontFamily),
    fontSize: layer.fontSize,
    fill: layer.fill,
    stroke: layer.stroke?.colour ?? null,
    strokeWidth: layer.stroke?.width ?? 0,
    // outline style has a transparent fill — keep the editing caret visible
    cursorColor: layer.stroke?.colour ?? layer.fill,
  });
  if (JSON.stringify(obj.plate) !== JSON.stringify(layer.plate)) {
    obj.plate = layer.plate;
    obj.set("dirty", true);
  }
  return obj;
}

/** Fabric object kind per layer, so a params.shape change recreates instead of
 *  mis-mutating (not reachable from the tool today — shape type is fixed at
 *  draw time — but cheap to be correct about). */
const shapeKindOf = new WeakMap<FabricObject, ShapeParams["shape"]>();

function syncShapeContent(
  canvas: Canvas,
  layer: ShapeLayer,
  byId: Map<string, FabricObject>,
): FabricObject {
  const p = layer.params;
  let obj = byId.get(layer.id);
  if (obj && shapeKindOf.get(obj) !== p.shape) {
    canvas.remove(obj);
    byId.delete(layer.id);
    obj = undefined;
  }
  if (!obj) {
    obj = buildShapeObject(p);
    shapeKindOf.set(obj, p.shape);
    byId.set(layer.id, obj);
    layerIdOf.set(obj, layer.id);
    canvas.add(obj);
  } else {
    updateShapeGeometry(obj, p);
  }
  obj.set({
    // A line renders stroke-only; fill would paint nothing but costs a fill pass.
    fill: p.shape === "line" ? null : toFabricFill(layer.fill),
    stroke: layer.stroke?.colour ?? null,
    strokeWidth: layer.stroke?.width ?? 0,
    strokeDashArray: layer.stroke?.dash ?? null,
  });
  return obj;
}
