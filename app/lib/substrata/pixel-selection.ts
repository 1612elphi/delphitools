/**
 * Pixel-selection store — the SELECT tool's live mask (M2-10). TRANSIENT UI
 * state, deliberately NOT part of the document model (the selection.ts
 * precedent: selections aren't document truth — undo never restores one, and
 * autosave never persists one). Same shape as every other store here:
 * module-level state + subscribe + getters/actions, bound to React via
 * useSyncExternalStore.
 *
 * The mask's DOMAIN is the artboard (scene coords, origin at the artboard's
 * top-left) — one binary `PixelMask` from select-mask.ts, whatever subtool
 * produced it (marquee/lasso/wand). This store derives and carries the two
 * things every consumer wants alongside it: the tight `bounds` and the
 * marching-ants `outline` (a scene-space Path2D the overlay strokes directly).
 *
 * `epoch` bumps on EVERY change (set or clear) — the headless harness polls it
 * and consumers use it as a cheap memo/effect key instead of deep-comparing a
 * megapixel Uint8Array. The alpha canvas (maskToCanvas) is derived lazily and
 * cached per epoch: the overlay and the extract/cut bakes (select-ops.ts) may
 * each want it, and rasterising the mask is O(pixels).
 *
 * SSR-safe: module evaluation touches no browser API.
 */

import type { MaskBounds, PixelMask } from './select-mask';
import { maskBounds, maskToCanvas, traceOutline } from './select-mask';

type Listener = () => void;

export interface PixelSelection {
	/** artboard-domain binary mask (select-mask.ts conventions) */
	mask: PixelMask;
	/** tight bounds of the selected pixels, in mask (= scene) coords */
	bounds: MaskBounds;
	/** the selection outline in scene coords — stroke it for marching ants */
	outline: Path2D;
	/** the store epoch at which this selection was adopted */
	epoch: number;
}

let current: PixelSelection | null = null;
let epoch = 0;
const listeners = new Set<Listener>();

// Lazily-derived alpha canvas, cached per epoch (see getSelectionAlphaCanvas).
let alphaCanvas: HTMLCanvasElement | null = null;
let alphaEpoch = -1;

function emit(): void {
	for (const l of listeners) l();
}

/** The live pixel selection, or null when nothing is selected. Stable
 *  reference between changes (useSyncExternalStore snapshot contract). */
export function getPixelSelection(): PixelSelection | null {
	return current;
}

export function subscribePixelSelection(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Adopt a new mask as THE selection, deriving bounds + outline once here so no
 * consumer re-traces. An EMPTY mask (maskBounds null — a shrink that consumed
 * everything, a wand miss) CLEARS instead: "empty selection" and "no
 * selection" are deliberately one state, so the contextual popup and the
 * extract/cut gates only ever check `!== null`.
 */
export function setPixelSelectionMask(mask: PixelMask): void {
	const bounds = maskBounds(mask);
	if (!bounds) {
		clearPixelSelection();
		return;
	}
	epoch += 1;
	current = { mask, bounds, outline: traceOutline(mask), epoch };
	emit();
}

/** Drop the selection (deselect). No-op when already clear. */
export function clearPixelSelection(): void {
	if (!current) return;
	epoch += 1;
	current = null;
	alphaCanvas = null; // free the derived canvas with the mask it mirrors
	emit();
}

/**
 * The mask rasterised to an alpha canvas (maskToCanvas), lazily built and
 * cached per epoch — selected pixels opaque, everything else transparent.
 * Scene-space: draw it at (0,0) to cover the artboard. This is the canvas the
 * extract/cut bakes push through the inverse layer transform (select-ops.ts).
 */
export function getSelectionAlphaCanvas(): HTMLCanvasElement | null {
	if (!current) return null;
	if (!alphaCanvas || alphaEpoch !== current.epoch) {
		alphaCanvas = maskToCanvas(current.mask);
		alphaEpoch = current.epoch;
	}
	return alphaCanvas;
}
