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
import { FabricImage, Pattern, Rect } from "fabric";
import type { SubstrataDoc, Layer } from "./doc-model";
import { leafRenderList } from "./layer-tree";
import { getRaster } from "./raster-cache";
import { syncImageFilters } from "./filter-sync";

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
  // Only raster layers in v1; other kinds render in later milestones.
  if (layer.kind !== "raster") return null;

  const src = getRaster(layer.blobHash);
  if (!src) return null; // not decoded yet — a later reconcile will pick it up

  let obj = byId.get(layer.id) as FabricImage | undefined;
  if (!obj) {
    // Content-addressed source is immutable per layer, so the element is set once.
    obj = new FabricImage(src);
    byId.set(layer.id, obj);
    layerIdOf.set(obj, layer.id);
    canvas.add(obj);
  }

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
  // Filter stack (M3): signature-diffed inside, so this is cheap per pass.
  syncImageFilters(obj, layer.filters);
  obj.setCoords();
  return obj;
}
