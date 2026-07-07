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
import { Ellipse, Gradient as FabricGradient, Line, Path, Pattern, Point, Polygon, Rect, Shadow, util as fabricPathUtil } from "fabric";
import type { SubstrataDoc, FreehandLayer, Layer, ShapeLayer, ShapeParams, Gradient, TextLayer } from "./doc-model";
import { EffectsImage } from "./effects-image";
import { SubstrataText } from "./text-object";
import { resolveFontCss } from "./fonts";
import { findLayer, leafRenderList } from "./layer-tree";
import { getRaster } from "./raster-cache";
import { outlineToPathD, strokeOutline } from "./freehand";
import { polygonPoints, starPoints } from "./shape-geometry";
import { presetShape, SYMBOL_GRID } from "./preset-shapes";
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
    const obj = syncLayer(canvas, entry.layer, entry.visible, entry.locked, entry.opacity, byId);
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
  /** effective opacity — layer.opacity × its group ancestors' (leafRenderList) */
  opacity: number,
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
    opacity,
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

/** The hash each fabric image was built from — a raster layer's content is
 *  immutable PER HASH, but ops may repoint the layer to a NEW hash (SELECT's
 *  destructive cut bakes a holed copy). WeakMap so disposed objects GC. */
const rasterHashOf = new WeakMap<FabricObject, string>();

function syncRasterContent(
  canvas: Canvas,
  layer: Layer & { kind: "raster" },
  byId: Map<string, FabricObject>,
): FabricObject | null {
  const src = getRaster(layer.blobHash);
  if (!src) return null; // not decoded yet — a later reconcile will pick it up

  let obj = byId.get(layer.id) as EffectsImage | undefined;
  if (obj && rasterHashOf.get(obj) !== layer.blobHash) {
    // hash repointed (cut/bake) — rebuild like a shape-kind change so filters/
    // effects re-sync against the new pixels from a clean slate
    canvas.remove(obj);
    byId.delete(layer.id);
    obj = undefined;
  }
  if (!obj) {
    obj = new EffectsImage(src);
    rasterHashOf.set(obj, layer.blobHash);
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

/** A preset symbol's path commands, its 256 GRID scaled onto width×height
 *  (grid mapping keeps proportions consistent across symbols; arcs survive
 *  because makePathSimpler lowers everything to line/curve commands first). */
function symbolPath(symbolId: string, width: number, height: number) {
  const preset = presetShape(symbolId);
  const simple = fabricPathUtil.makePathSimpler(fabricPathUtil.parsePath(preset?.d ?? "M0,0"));
  return fabricPathUtil.transformPath(
    simple,
    [width / SYMBOL_GRID, 0, 0, height / SYMBOL_GRID, 0, 0],
    new Point(0, 0),
  );
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
    case "symbol":
      return new Path(symbolPath(p.symbolId, p.width, p.height));
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
    case "symbol": {
      // in-place path swap (drag-to-draw reshapes every move — no churn)
      (obj as Path)._setPath(symbolPath(p.symbolId, p.width, p.height), true);
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
  // Font/size/style apply even MID-EDIT (Ruby 2026-07-06: a font click must
  // restyle the text you're typing); only `text` itself stays fabric's until
  // editing:exited commits it (syncLayer also skips transform while editing).
  if (!obj.isEditing) obj.set({ text: layer.text });
  obj.set({
    fontFamily: resolveFontCss(layer.fontFamily),
    fontSize: layer.fontSize,
    fill: layer.fill,
    stroke: layer.stroke?.colour ?? null,
    strokeWidth: layer.stroke?.width ?? 0,
    // object-level typography (M2-1) — optional fields default here so
    // pre-existing docs render unchanged; applies mid-edit like font/size
    textAlign: layer.align ?? "left",
    lineHeight: layer.lineHeight ?? 1.16,
    charSpacing: layer.charSpacing ?? 0,
    direction: layer.direction ?? "ltr",
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

// ── export render (M6) ───────────────────────────────────────────────────────

/**
 * Render the artboard (or one layer soloed) to a fresh canvas at an exact
 * pixel multiplier, independent of the live pan/zoom. Uses Fabric's
 * toCanvasElement — its crop box is in VIEWPORT coordinates and its multiplier
 * composes with the current zoom (verified against installed 7.4.0 source) —
 * under a temporarily-identity viewportTransform, so the output dims are the
 * exact integer product artboard×scale (aiming through the live vpt floors a
 * float product one pixel short at many zooms). Controls are skipped by
 * toCanvasElement (skipControlsDrawing); a live ActiveSelection is safe —
 * children render through their full composed transform in the static path.
 * Everything mutated here (vpt, solo visibility, the artboard rect's checker
 * fill) is snapshotted and restored.
 */
export function renderExport(
  canvas: Canvas,
  state: ReconcileState,
  doc: SubstrataDoc,
  opts: {
    scale: number;
    soloLayerId?: string | null;
    flattenBackground?: string;
  },
): HTMLCanvasElement {
  const artboardObj = state.byId.get(ARTBOARD_KEY);
  const savedVisible = new Map<FabricObject, boolean>();

  // Solo: show only the target's leaves. The target itself is forced visible
  // (soloing a hidden layer means "show me this layer"), but flags INSIDE the
  // subtree still apply — a hidden child of a soloed group stays hidden.
  if (opts.soloLayerId) {
    const target = findLayer(doc.layers, opts.soloLayerId);
    const keep = new Set<string>();
    if (target) {
      for (const entry of leafRenderList([{ ...target, visible: true } as Layer])) {
        if (entry.visible) keep.add(entry.layer.id);
      }
    }
    for (const [key, obj] of state.byId) {
      if (key === ARTBOARD_KEY) continue;
      savedVisible.set(obj, obj.visible);
      obj.visible = keep.has(key);
    }
  }

  const savedArtboardVisible = artboardObj?.visible;
  const savedArtboardFill = artboardObj?.fill;
  // Never export the transparency checker: a solo export is transparent
  // offscreen by contract, and a null background is real alpha in the file —
  // unless the format can't carry alpha (flatten colour).
  if (artboardObj) {
    if (opts.soloLayerId) artboardObj.visible = false;
    else if (doc.artboard.background === null) {
      if (opts.flattenBackground) artboardObj.set("fill", opts.flattenBackground);
      else artboardObj.visible = false;
    }
  }

  // Render under an IDENTITY viewport so the output dims are the exact
  // integer product artboard×scale — aiming through the live transform made
  // fabric floor (W·zoom)·(scale/zoom), which lands one pixel short at many
  // zooms (review-caught: the wand's mask domain must equal the artboard).
  // toCanvasElement restores the vpt it reads at entry; we restore the real
  // one right after, and the requestRenderAll below repaints against it.
  const savedVpt = canvas.viewportTransform;
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
  let el: HTMLCanvasElement;
  try {
    el = canvas.toCanvasElement(opts.scale, {
      left: 0,
      top: 0,
      width: doc.artboard.width,
      height: doc.artboard.height,
    });
  } finally {
    canvas.viewportTransform = savedVpt;
  }

  for (const [obj, visible] of savedVisible) obj.visible = visible;
  if (artboardObj) {
    if (savedArtboardVisible !== undefined) artboardObj.visible = savedArtboardVisible;
    artboardObj.set("fill", savedArtboardFill ?? null);
  }
  // toCanvasElement fired after:render under the export viewport — the
  // top-context overlay (grid/guides) may have redrawn at export zoom; queue a
  // real frame so it repaints against the live viewport.
  canvas.requestRenderAll();
  return el;
}

// ── rasterize bake (M3-15) ───────────────────────────────────────────────────

/**
 * Render ONE layer's content to a tight standalone canvas for rasterize:
 * angle temporarily zeroed (it survives on the layer transform — never baked),
 * opacity forced to 1 (it stays a live layer property; baking it would
 * double-apply). Uses FabricObject.toCanvasElement, which sizes by
 * boundingRect + shadow allowance — text PLATES draw outside the text bbox
 * (cache-padded), so they get an INVISIBLE shadow whose blur inflates the
 * bake canvas symmetrically (fabric's own bounds mechanism; the shadow paints
 * nothing at alpha 0).
 */
export function bakeLayerObject(state: ReconcileState, layer: Layer): HTMLCanvasElement | null {
  const obj = state.byId.get(layer.id);
  if (!obj) return null;
  const saved = {
    angle: obj.angle,
    visible: obj.visible,
    opacity: obj.opacity,
    shadow: obj.shadow,
  };
  obj.set({ angle: 0, visible: true, opacity: 1 });
  if (layer.kind === "text" && layer.plate) {
    obj.set(
      "shadow",
      new Shadow({ color: "rgba(0,0,0,0)", blur: layer.plate.padding + 8, offsetX: 0, offsetY: 0 }),
    );
  }
  obj.setCoords();
  const el = obj.toCanvasElement({ enableRetinaScaling: false });
  obj.set(saved);
  obj.setCoords();
  return el;
}
