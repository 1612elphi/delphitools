/**
 * Layer mutations — the action layer over the doc store. Each goes through
 * `update()`, which is where command/patch history will hook in (M1-8), so these
 * call sites become undoable for free without changing. One-way: they mutate the
 * doc; the reconciler renders the result.
 *
 * `mapLayer` is flat for now; it gains group recursion additively in M2.
 */

import { update, updateTransient } from "./doc-store";
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
