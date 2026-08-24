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

export function invertSelection(): void {
	// reconciler validates mask dimensions
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(invertMask(sel.mask));
}

export function growSelection(step = 2): void {
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(growMask(sel.mask, step));
}

export function shrinkSelection(step = 2): void {
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(shrinkMask(sel.mask, step));
}

export function canOperateOnActive(): boolean {
	const doc = getSnapshot();
	const id = getActiveLayerId();
	const layer = doc && id ? findLayer(doc.layers, id) : null;
	return layer !== null && layer.kind === 'raster' && !layer.locked;
}

function sceneMaskToLayerSpace(
	alpha: HTMLCanvasElement,
	layer: RasterLayer,
): HTMLCanvasElement | null {
	const t = layer.transform;
	const sx = t.scaleX * (t.flipX ? -1 : 1);
	const sy = t.scaleY * (t.flipY ? -1 : 1);
	if (sx === 0 || sy === 0) return null;
	const canvas = document.createElement('canvas');
	canvas.width = layer.naturalWidth;
	canvas.height = layer.naturalHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	// invert layer transform
	ctx.translate(layer.naturalWidth / 2, layer.naturalHeight / 2);
	ctx.scale(1 / sx, 1 / sy);
	ctx.rotate((-t.angle * Math.PI) / 180);
	ctx.translate(-t.x, -t.y);
	ctx.drawImage(alpha, 0, 0);
	return canvas;
}

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
	layerMask: HTMLCanvasElement;
	bounds: MaskBounds;
	newLayer: RasterLayer;
}

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
	if (!bounds) return null;

	// apply layer-space mask
	const crop = document.createElement('canvas');
	crop.width = bounds.w;
	crop.height = bounds.h;
	const cctx = crop.getContext('2d');
	if (!cctx) return null;
	cctx.drawImage(sourceCanvas, -bounds.x, -bounds.y);
	cctx.globalCompositeOperation = 'destination-in';
	cctx.drawImage(layerMask, -bounds.x, -bounds.y);

	// retain scene position
	const t = source.transform;
	const sx = t.scaleX * (t.flipX ? -1 : 1);
	const sy = t.scaleY * (t.flipY ? -1 : 1);
	const dx = (bounds.x + bounds.w / 2 - source.naturalWidth / 2) * sx;
	const dy = (bounds.y + bounds.h / 2 - source.naturalHeight / 2) * sy;
	const rad = (t.angle * Math.PI) / 180;

	const hash = await bakeCanvasToHash(crop);
	const newLayer: RasterLayer = {
		...createRasterLayer({
			name: source.name,
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

// serialize raster bakes
let bakeInFlight = false;

// reject stale source
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
	// reconciliation needs selection first
	setSelection([newLayer.id]);
	update((doc) => ({
		...doc,
		layers: insertAfter(doc.layers, source.id, newLayer),
		updatedAt: Date.now(),
	}));
	return newLayer.id;
}

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
	// reconciliation needs selection first
	setSelection([newLayer.id]);
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
