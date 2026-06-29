/**
 * Layer mutations — the action layer over the doc store. Each goes through
 * `update()`, which is where command/patch history will hook in (M1-8), so these
 * call sites become undoable for free without changing. One-way: they mutate the
 * doc; the reconciler renders the result.
 *
 * `mapLayer` is flat for now; it gains group recursion additively in M2.
 */

import { update } from "./doc-store";
import type { Layer } from "./doc-model";

function mapLayer(layers: Layer[], id: string, fn: (layer: Layer) => Layer): Layer[] {
  return layers.map((l) => (l.id === id ? fn(l) : l));
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
