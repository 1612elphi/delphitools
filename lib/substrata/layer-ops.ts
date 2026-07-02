/**
 * Layer mutations — the action layer over the doc store. Each goes through
 * `update()`, which is where command/patch history will hook in (M1-8), so these
 * call sites become undoable for free without changing. One-way: they mutate the
 * doc; the reconciler renders the result.
 *
 * `mapLayer` is flat for now; it gains group recursion additively in M2.
 */

import { getSnapshot, update, updateTransient } from "./doc-store";
import { newId } from "./doc-model";
import { setActiveLayer } from "./selection";
import type { BlendMode, Layer, SubstrataDoc, Transform } from "./doc-model";

function mapLayer(layers: Layer[], id: string, fn: (layer: Layer) => Layer): Layer[] {
  return layers.map((l) => (l.id === id ? fn(l) : l));
}

/** Commit a layer transform (the one place a Fabric interaction writes back). */
export function setTransform(id: string, transform: Transform): void {
  update((doc) => ({
    ...doc,
    layers: mapLayer(doc.layers, id, (l) => ({ ...l, transform })),
    updatedAt: Date.now(),
  }));
}

/**
 * Set a layer's opacity (0–1). `transient: true` routes through the coalesced
 * gesture path (live canvas update, no per-frame history) — used while dragging
 * the Inspector opacity slider; the slider's release commits the single step.
 */
export function setOpacity(id: string, opacity: number, opts?: { transient?: boolean }): void {
  const apply = (doc: SubstrataDoc): SubstrataDoc => ({
    ...doc,
    layers: mapLayer(doc.layers, id, (l) => ({ ...l, opacity })),
    updatedAt: Date.now(),
  });
  if (opts?.transient) updateTransient(apply);
  else update(apply);
}

/** Set a layer's compositing blend mode. */
export function setBlendMode(id: string, blendMode: BlendMode): void {
  update((doc) => ({
    ...doc,
    layers: mapLayer(doc.layers, id, (l) => ({ ...l, blendMode })),
    updatedAt: Date.now(),
  }));
}

export function setVisibility(id: string, visible: boolean): void {
  update((doc) => ({
    ...doc,
    layers: mapLayer(doc.layers, id, (l) => ({ ...l, visible })),
    updatedAt: Date.now(),
  }));
}

export function toggleVisibility(id: string): void {
  update((doc) => ({
    ...doc,
    layers: mapLayer(doc.layers, id, (l) => ({ ...l, visible: !l.visible })),
    updatedAt: Date.now(),
  }));
}

/** Toggle a layer's lock (locked layers aren't selectable/draggable on canvas). */
export function toggleLock(id: string): void {
  update((doc) => ({
    ...doc,
    layers: mapLayer(doc.layers, id, (l) => ({ ...l, locked: !l.locked })),
    updatedAt: Date.now(),
  }));
}

/** Duplicate a layer in place (offset a touch) and select the copy. Flat for now;
 *  group children clone additively with grouping (M2). */
export function duplicateLayer(id: string): void {
  const doc = getSnapshot();
  if (!doc) return;
  const idx = doc.layers.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const src = doc.layers[idx];
  const copy: Layer = {
    ...src,
    id: newId(),
    filters: [...src.filters],
    effects: [...src.effects],
    transform: { ...src.transform, x: src.transform.x + 24, y: src.transform.y + 24 },
  };
  setActiveLayer(copy.id);
  update((d) => {
    const layers = [...d.layers];
    const i = layers.findIndex((l) => l.id === id);
    layers.splice(i + 1, 0, copy);
    return { ...d, layers, updatedAt: Date.now() };
  });
}

/** Delete a layer. The canvas drops the object + clears selection on reconcile. */
export function deleteLayer(id: string): void {
  update((doc) => ({
    ...doc,
    layers: doc.layers.filter((l) => l.id !== id),
    updatedAt: Date.now(),
  }));
}

/** Reorder the (flat) layer stack to match `orderedIds` (bottom → top in doc order). */
export function setLayerOrder(orderedIds: string[]): void {
  update((doc) => {
    const byId = new Map(doc.layers.map((l) => [l.id, l]));
    const layers = orderedIds
      .map((lid) => byId.get(lid))
      .filter((l): l is Layer => l !== undefined);
    // Guard: if the id set didn't cover every layer, keep the original order.
    if (layers.length !== doc.layers.length) return doc;
    return { ...doc, layers, updatedAt: Date.now() };
  });
}
