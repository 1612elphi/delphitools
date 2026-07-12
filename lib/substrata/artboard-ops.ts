/**
 * Artboard mutations — the action layer over the doc store for the Canvas size
 * modal. Goes through `update()`, so resizing/recolouring the artboard is a
 * single undoable step for free. One-way: mutates the doc; the reconciler
 * re-renders the artboard rect + re-clips the canvas.
 */

import { update } from "./doc-store";
import type { Artboard, Layer } from "./doc-model";
import { isGroup } from "./layer-tree";

/** Patch the artboard (width/height/resolution/background/…). Undoable. */
export function setArtboard(patch: Partial<Artboard>): void {
  update((doc) => ({
    ...doc,
    artboard: { ...doc.artboard, ...patch },
    updatedAt: Date.now(),
  }));
}

/** Nearest artboard anchor per axis — 0 | ½ | 1 of the span, i.e. the corners,
 *  edge midpoints and centre (the ratified M7-8 anchor set, decomposed). */
const anchorOf = (c: number, span: number): number =>
  c < span / 4 ? 0 : c > (3 * span) / 4 ? 1 : 0.5;

/**
 * Magic resize (M7-8; Ruby's 2026-07-08 ratification: ANCHOR + PROPORTIONAL).
 * One `update()` — artboard patch + layer reflow + guide rescale — so the whole
 * resize is a single undoable step. Every leaf layer (hidden/locked included:
 * this is a document-level op, not a selection op) scales by the smaller axis
 * factor and keeps its offset from its nearest artboard anchor, scaled; groups
 * stay identity (folder semantics) and recurse. Guides rescale proportionally
 * along their axis. Angles, flips and crops ride along untouched — a documented
 * v1 approximation, per the Substrata scope philosophy.
 */
export function resizeArtboardReflow(patch: Partial<Artboard> & { width: number; height: number }): void {
  update((doc) => {
    const { width: W, height: H } = doc.artboard;
    const { width: W2, height: H2 } = patch;
    const s = Math.min(W2 / W, H2 / H);
    const reflow = (layers: Layer[]): Layer[] =>
      layers.map((l) => {
        if (isGroup(l)) return { ...l, children: reflow(l.children) };
        const t = l.transform;
        const ax = anchorOf(t.x, W);
        const ay = anchorOf(t.y, H);
        return {
          ...l,
          transform: {
            ...t,
            x: ax * W2 + (t.x - ax * W) * s,
            y: ay * H2 + (t.y - ay * H) * s,
            scaleX: t.scaleX * s,
            scaleY: t.scaleY * s,
          },
        };
      });
    return {
      ...doc,
      artboard: { ...doc.artboard, ...patch },
      layers: reflow(doc.layers),
      guides: doc.guides.map((g) => ({ ...g, pos: g.pos * (g.axis === "x" ? W2 / W : H2 / H) })),
      updatedAt: Date.now(),
    };
  });
}
