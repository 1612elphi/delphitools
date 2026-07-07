/**
 * Rasterize-layer command (M3-15, built 2026-07-07) — converts a shape/
 * freehand/text layer into an ordinary RasterLayer so the raster-only
 * pipelines (filters/effects, SELECT extract/cut) apply. The fabric side owns
 * rendering, so the canvas registers a baker here (the export-source bridge
 * pattern); this module does the hash/persist/doc-write half.
 *
 * Semantics: content bakes at its CURRENT scale with flips folded in
 * (scale resets to 1, flips clear); angle is never baked — it stays on the
 * transform, so the raster keeps rotating live. Same layer id/name/flags/
 * opacity/blend survive; one update() = one undo step, and undo restores the
 * vector layer intact (the old snapshot still references it).
 * ponytail: a scale change inside the bake's ~ms await window would bake at
 * the older scale — the SELECT bake-gate machinery is overkill here.
 */

import { update, getSnapshot } from "./doc-store";
import { findLayer, mapLayerInTree } from "./layer-tree";
import type { Layer } from "./doc-model";
import { bakeCanvasToHash } from "./blobs";

let baker: ((layerId: string) => HTMLCanvasElement | null) | null = null;

export function registerLayerBaker(b: typeof baker): void {
  baker = b;
}

export function canRasterize(layer: Layer): boolean {
  return layer.kind === "shape" || layer.kind === "freehand" || layer.kind === "text";
}

export async function rasterizeLayer(id: string): Promise<boolean> {
  const doc = getSnapshot();
  const layer = doc ? findLayer(doc.layers, id) : null;
  if (!layer || !canRasterize(layer) || !baker) return false;
  const el = baker(id);
  if (!el || el.width === 0 || el.height === 0) return false;

  const hash = await bakeCanvasToHash(el);

  // revalidate after the awaits: the layer must still exist as the same kind
  const now = getSnapshot();
  const live = now ? findLayer(now.layers, id) : null;
  if (!live || live.kind !== layer.kind) return false;

  update((d) => ({
    ...d,
    layers: mapLayerInTree(d.layers, id, (l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      blendMode: l.blendMode,
      // scale + flips are baked into the pixels; angle stays live
      transform: { ...l.transform, scaleX: 1, scaleY: 1, flipX: false, flipY: false },
      filters: l.filters,
      effects: l.effects,
      kind: "raster",
      blobHash: hash,
      naturalWidth: el.width,
      naturalHeight: el.height,
    })),
    updatedAt: Date.now(),
  }));
  return true;
}
