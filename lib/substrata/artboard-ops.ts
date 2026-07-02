/**
 * Artboard mutations — the action layer over the doc store for the Canvas size
 * modal. Goes through `update()`, so resizing/recolouring the artboard is a
 * single undoable step for free. One-way: mutates the doc; the reconciler
 * re-renders the artboard rect + re-clips the canvas.
 */

import { update } from "./doc-store";
import type { Artboard } from "./doc-model";

/** Patch the artboard (width/height/resolution/background/…). Undoable. */
export function setArtboard(patch: Partial<Artboard>): void {
  update((doc) => ({
    ...doc,
    artboard: { ...doc.artboard, ...patch },
    updatedAt: Date.now(),
  }));
}
