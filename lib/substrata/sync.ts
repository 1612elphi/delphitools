/**
 * Document → Fabric reconciler (M1-3). STRICT one-way: the doc model is the only
 * source of truth (§5/§12); this diffs the live Fabric scene against the doc and
 * creates/updates/removes objects to match. Fabric is never read back as truth —
 * interactive edits (M1-10) commit to the doc and re-enter through here.
 *
 * v1 renders the artboard + raster layers (flat). Text/shape/group layers,
 * pixel filters, and effects are added additively in later milestones; an
 * unhandled layer kind is skipped, never half-rendered.
 *
 * Convention: a layer's transform.x/y is the object CENTRE in scene coordinates
 * (objects use originX/originY = "center").
 */

import type { Canvas, FabricObject } from "fabric";
import { FabricImage, Rect } from "fabric";
import type { SubstrataDoc, Layer } from "./doc-model";
import { getRaster } from "./raster-cache";

const ARTBOARD_KEY = "__artboard__";

export interface ReconcileState {
  /** layer id (or ARTBOARD_KEY) → its Fabric object */
  byId: Map<string, FabricObject>;
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
    fill: doc.artboard.background ?? "rgba(0,0,0,0)",
    originX: "left",
    originY: "top",
  });
  artboard.setCoords();
  desired.push(artboard);

  // Layers, in document order.
  for (const layer of doc.layers) {
    const obj = syncLayer(canvas, layer, byId);
    if (obj) {
      desired.push(obj);
      seen.add(layer.id);
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
    visible: layer.visible,
    globalCompositeOperation: layer.blendMode,
    originX: "center",
    originY: "center",
    // Interaction is wired by the MOVE tool (M1-10); inert until then.
    selectable: false,
    evented: false,
  });
  obj.setCoords();
  return obj;
}
