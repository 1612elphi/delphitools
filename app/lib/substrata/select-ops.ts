/**
 * Pixel-selection operations (M2-10) — the actions behind the SELECT tool's
 * contextual popup, per Ruby's 2026-07-07 ratification: extract (the default)
 * · cut (destructive) · invert · grow · shrink (+ deselect, which is just
 * pixel-selection.clearPixelSelection).
 *
 * Two tiers, deliberately different in weight:
 *   - invert/grow/shrink are PURE STORE updates (select-mask maths over the
 *     transient mask) — no doc write, no history entry, exactly like moving
 *     the layer selection around.
 *   - extract/cut BAKE pixels: the masked copy becomes a NEW content-addressed
 *     raster layer inserted right above the source (import-raster's
 *     hash→cache→persist flow), ONE update() = ONE undo step. Cut additionally
 *     repoints the source at a new "holed" raster in that same update; the old
 *     hash stays in the raster cache, so undo snapshots referencing it keep
 *     rendering (the STATE contract for destructive edits).
 *
 * All the resolution care lives in ONE idea: the mask arrives in ARTBOARD
 * (scene) space, but the bake works in LAYER space — the selection alpha
 * canvas is drawn through the INVERSE of the layer's centre-origin transform,
 * so the copy keeps the source's NATURAL resolution however the layer is
 * scaled/rotated/flipped on the scene (Canvas2D does the resampling of the
 * mask, never of the pixels being extracted).
 */

import type { RasterLayer } from './doc-model';
import { createRasterLayer } from './doc-model';
import { getSnapshot, update } from './doc-store';
import { findLayer, mapLayerInTree } from './layer-tree';
import { insertAfter } from './layer-ops';
import { getActiveLayerId, setSelection } from './selection';
import { getRaster } from './raster-cache';
import { bakeCanvasToHash } from './blobs';
import {
	getPixelSelection,
	getSelectionAlphaCanvas,
	setPixelSelectionMask,
} from './pixel-selection';
import type { MaskBounds, PixelMask } from './select-mask';
import { growMask, invertMask, maskBounds, shrinkMask } from './select-mask';

// ── store-only mask ops (no doc write, no history) ───────────────────────────

/**
 * Invert the selection against the FULL ARTBOARD domain — "everything but
 * this". If the mask predates an artboard resize (Canvas size modal), it's
 * re-domained first (padded/cropped, content anchored at scene 0,0) so the
 * inversion covers the artboard that exists NOW. An inverted full-artboard
 * selection comes out empty and clears (the store's empty-mask rule).
 */
export function invertSelection(): void {
	// The mask's domain always matches the artboard here: the reconciler clears
	// any dims-mismatched (or different-doc) mask on every doc emit, before the
	// popup/keymap could reach this op — no re-domaining needed.
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(invertMask(sel.mask));
}

/** Dilate the selection by `step` px (artboard px — the mask's own domain). */
export function growSelection(step = 2): void {
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(growMask(sel.mask, step));
}

/** Erode the selection by `step` px; shrinking to nothing clears (store rule). */
export function shrinkSelection(step = 2): void {
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(shrinkMask(sel.mask, step));
}

// ── extract / cut gates ──────────────────────────────────────────────────────

/**
 * Can extract/cut act right now? The ACTIVE layer must exist, be a raster,
 * and be unlocked — the popup disables its bake actions on this.
 * ponytail: v1 gates on the layer's OWN lock flag and the active layer only —
 * effective (group-composed) lock via leafRenderList, and multi-layer
 * extraction, are upgrades if anyone ever asks.
 */
export function canOperateOnActive(): boolean {
	const doc = getSnapshot();
	const id = getActiveLayerId();
	const layer = doc && id ? findLayer(doc.layers, id) : null;
	return layer !== null && layer.kind === 'raster' && !layer.locked;
}

// ── bake plumbing ────────────────────────────────────────────────────────────

/**
 * Rasterise the scene-space selection alpha into LAYER space (the source's
 * natural pixel grid). A layer pixel q maps to scene as p = t + R·S·(q − c)
 * (centre-origin transform; flips are negative scales; c = natural centre),
 * so scene → layer is q = S⁻¹·R⁻¹·(p − t) + c — composed here as ctx ops:
 * translate-to-centre ∘ inverse scale ∘ inverse rotate ∘ translate(−t).
 * Canvas2D resamples the mask on the way; edges come out anti-aliased, which
 * destination-in/out turn into pleasantly soft cuts.
 */
function sceneMaskToLayerSpace(
	alpha: HTMLCanvasElement,
	layer: RasterLayer,
): HTMLCanvasElement | null {
	const t = layer.transform;
	const sx = t.scaleX * (t.flipX ? -1 : 1);
	const sy = t.scaleY * (t.flipY ? -1 : 1);
	if (sx === 0 || sy === 0) return null; // degenerate pose — nothing to map
	const canvas = document.createElement('canvas');
	canvas.width = layer.naturalWidth;
	canvas.height = layer.naturalHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.translate(layer.naturalWidth / 2, layer.naturalHeight / 2);
	ctx.scale(1 / sx, 1 / sy);
	ctx.rotate((-t.angle * Math.PI) / 180);
	ctx.translate(-t.x, -t.y);
	ctx.drawImage(alpha, 0, 0);
	return canvas;
}

/** Read a canvas's alpha coverage back into a PixelMask so maskBounds can
 *  find the tight layer-space bounds. ANY coverage counts (alpha ≠ 0) — the
 *  crop must not shave the resampled anti-aliased edge off the mask. */
function alphaToMask(img: ImageData): PixelMask {
	const data = new Uint8Array(img.width * img.height);
	const px = img.data;
	for (let i = 0; i < data.length; i++)
		data[i] = px[i * 4 + 3] !== 0 ? 255 : 0;
	return { data, width: img.width, height: img.height };
}

interface ExtractBake {
	source: RasterLayer;
	sourceCanvas: HTMLCanvasElement;
	/** the selection alpha in the source's natural pixel grid */
	layerMask: HTMLCanvasElement;
	/** tight layer-space bounds of the mask (the crop rectangle) */
	bounds: MaskBounds;
	/** the extracted layer, fully built + its raster baked/cached */
	newLayer: RasterLayer;
}

/**
 * The shared half of extract/cut: mask → layer space → tight crop of the
 * masked source → baked raster → a ready-to-insert RasterLayer. Returns null
 * whenever there is nothing valid to do (no selection, gate fails, source
 * raster missing, selection doesn't touch the layer's pixels).
 *
 * The new layer copies the source's full pose (scale/angle/flips) so the
 * extracted pixels land EXACTLY where they were on the scene; its position is
 * the crop's centre-offset from the natural centre mapped through that pose
 * (R·S·d, added to the source centre). filters[]/effects[]/opacity/blend are
 * deep-copied so the piece keeps its visual identity in place.
 *
 * ponytail: the mask's domain is the artboard, so an extract CLIPS to the
 * artboard — a layer's off-canvas pixels can't be selected. Scene-domain
 * masks are the upgrade if that ever bites. Binary mask, no feathering —
 * softness only from resampling (grow+blur feather is a later nicety).
 */
async function bakeExtractedLayer(): Promise<ExtractBake | null> {
	if (!canOperateOnActive()) return null;
	const alpha = getSelectionAlphaCanvas();
	if (!alpha) return null;
	const doc = getSnapshot();
	const id = getActiveLayerId();
	const source = doc && id ? findLayer(doc.layers, id) : null;
	if (!source || source.kind !== 'raster') return null;
	const sourceCanvas = getRaster(source.blobHash);
	if (!sourceCanvas) return null;

	const layerMask = sceneMaskToLayerSpace(alpha, source);
	const mctx = layerMask?.getContext('2d');
	if (!layerMask || !mctx) return null;
	const bounds = maskBounds(
		alphaToMask(
			mctx.getImageData(
				0,
				0,
				layerMask.width,
				layerMask.height,
			),
		),
	);
	if (!bounds) return null; // selection misses this layer entirely

	// Masked copy at natural resolution, drawn straight into the tight crop:
	// source, then destination-in with the layer-space mask.
	const crop = document.createElement('canvas');
	crop.width = bounds.w;
	crop.height = bounds.h;
	const cctx = crop.getContext('2d');
	if (!cctx) return null;
	cctx.drawImage(sourceCanvas, -bounds.x, -bounds.y);
	cctx.globalCompositeOperation = 'destination-in';
	cctx.drawImage(layerMask, -bounds.x, -bounds.y);

	// Position: map the crop centre's offset from the natural centre through
	// the source pose (scale/flip then rotate) into scene coords.
	const t = source.transform;
	const sx = t.scaleX * (t.flipX ? -1 : 1);
	const sy = t.scaleY * (t.flipY ? -1 : 1);
	const dx = (bounds.x + bounds.w / 2 - source.naturalWidth / 2) * sx;
	const dy = (bounds.y + bounds.h / 2 - source.naturalHeight / 2) * sy;
	const rad = (t.angle * Math.PI) / 180;

	const hash = await bakeCanvasToHash(crop);
	const newLayer: RasterLayer = {
		...createRasterLayer({
			name: source.name, // layer names are data (the duplicate precedent), not copy
			blobHash: hash,
			naturalWidth: bounds.w,
			naturalHeight: bounds.h,
			transform: {
				...t,
				x:
					t.x +
					dx * Math.cos(rad) -
					dy * Math.sin(rad),
				y:
					t.y +
					dx * Math.sin(rad) +
					dy * Math.cos(rad),
			},
		}),
		opacity: source.opacity,
		blendMode: source.blendMode,
		filters: source.filters.map((f) => ({
			...f,
			params: { ...f.params },
		})),
		effects: source.effects.map((e) => ({
			...e,
			params: { ...e.params },
		})),
	};
	return { source, sourceCanvas, layerMask, bounds, newLayer };
}

/** One bake at a time: extract/cut cross real await windows (encode + hash),
 *  and a second click / Enter auto-repeat mid-flight would stack duplicate
 *  baked layers (review-caught). Callers no-op while a bake is in flight. */
let bakeInFlight = false;

/** The doc may have moved under the bake's awaits (undo mid-encode is one
 *  keypress away) — only write if the source layer still exists AND still has
 *  the pose+pixels the bake was computed from; otherwise the committed hole/
 *  copy would be projected through a stale transform (review-caught). */
function sourceStillMatches(source: RasterLayer): boolean {
	const doc = getSnapshot();
	const live = doc ? findLayer(doc.layers, source.id) : null;
	if (!live || live.kind !== 'raster') return false;
	return (
		live.blobHash === source.blobHash &&
		JSON.stringify(live.transform) ===
			JSON.stringify(source.transform)
	);
}

// ── the bakes ────────────────────────────────────────────────────────────────

/**
 * EXTRACT (the ratified default action): masked copy of the active raster →
 * a NEW layer inserted immediately ABOVE the source, non-destructively. The
 * new layer becomes the layer selection; the pixel mask stays live (the popup
 * keeps offering the other ops). ONE update() = ONE undo step. Returns the
 * new layer's id, or null when the gate fails / the selection misses.
 */
function withBakeGuard(
	fn: () => Promise<string | null>,
): Promise<string | null> {
	if (bakeInFlight) return Promise.resolve(null);
	bakeInFlight = true;
	return fn().finally(() => {
		bakeInFlight = false;
	});
}

export function extractSelection(): Promise<string | null> {
	return withBakeGuard(extractSelectionInner);
}

async function extractSelectionInner(): Promise<string | null> {
	const baked = await bakeExtractedLayer();
	if (!baked || !sourceStillMatches(baked.source)) return null;
	const { source, newLayer } = baked;
	// Select BEFORE the update so the reconcile applies it the moment the
	// Fabric object exists (import-raster's post-update selection race).
	setSelection([newLayer.id]);
	update((doc) => ({
		...doc,
		layers: insertAfter(doc.layers, source.id, newLayer),
		updatedAt: Date.now(),
	}));
	return newLayer.id;
}

/**
 * CUT (the ratified destructive op): extract, AND punch the selection out of
 * the source — a full natural-size copy with the layer-space mask erased
 * (destination-out), baked as a NEW content-addressed raster the source is
 * repointed at. Insert + repoint happen in the SAME update(), so the whole
 * cut is ONE undo step; the source's natural dims are unchanged (the hole
 * canvas is natural-size) and its OLD hash stays in the raster cache, so
 * undo snapshots that reference it keep rendering (STATE contract).
 */
export function cutSelection(): Promise<string | null> {
	return withBakeGuard(cutSelectionInner);
}

async function cutSelectionInner(): Promise<string | null> {
	const baked = await bakeExtractedLayer();
	if (!baked) return null;
	const { source, sourceCanvas, layerMask, newLayer } = baked;

	const holed = document.createElement('canvas');
	holed.width = source.naturalWidth;
	holed.height = source.naturalHeight;
	const ctx = holed.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(sourceCanvas, 0, 0);
	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage(layerMask, 0, 0);
	const holeHash = await bakeCanvasToHash(holed);

	if (!sourceStillMatches(source)) return null;
	setSelection([newLayer.id]); // before the update — the extract rationale
	update((doc) => {
		const layers = mapLayerInTree(
			insertAfter(doc.layers, source.id, newLayer),
			source.id,
			(l) =>
				l.kind === 'raster'
					? { ...l, blobHash: holeHash }
					: l,
		);
		return { ...doc, layers, updatedAt: Date.now() };
	});
	return newLayer.id;
}
