// fabric requires client boundary

import { getFilterBackend, WebGLFilterBackend } from 'fabric';
import type { FabricImage, StaticCanvas } from 'fabric';
import type { Effect, Filter } from './doc-model';
import type { EffectsImage } from './effects-image';
import { buildFabricFilters } from './filter-factory';
import { getEffectDef } from './effects';
import { defaultParams } from './param-spec';
import { isGestureActive } from './doc-store';
import { isLutLook, lutEpoch } from './lut-data';

const PREVIEW_PIXELS = 1_500_000;

// fabric protected members
interface ImageInternals {
	_element: CanvasImageSource;
	_originalElement: CanvasImageSource & {
		width: number;
		height: number;
		naturalWidth?: number;
		naturalHeight?: number;
	};
	_filterScalingX: number;
	_filterScalingY: number;
}
const internals = (img: FabricImage) => img as unknown as ImageInternals;

const appliedSig = new WeakMap<FabricImage, string>();
const proxies = new WeakMap<FabricImage, HTMLCanvasElement>();
const previewTargets = new WeakMap<FabricImage, HTMLCanvasElement>();

const pending = new Map<FabricImage, boolean>();
let rafId: number | null = null;

const previewKey = (img: FabricImage) => `${img.cacheKey}_sspreview`;

function sourceSize(img: FabricImage): { width: number; height: number } {
	const el = internals(img)._originalElement;
	return {
		width: el.naturalWidth || el.width,
		height: el.naturalHeight || el.height,
	};
}

export function syncImageFilters(
	img: FabricImage,
	stack: readonly Filter[],
): void {
	const size = sourceSize(img);
	const preview =
		isGestureActive() && size.width * size.height > PREVIEW_PIXELS;
	const enabled = stack.filter((f) => f.enabled);
	// lut epoch invalidates signature
	const hasLut = enabled.some(
		(f) =>
			f.type === 'film-sim' &&
			isLutLook(String(f.params.preset)),
	);
	const sig =
		(preview ? 'p|' : 'f|') +
		(hasLut ? `L${lutEpoch()}|` : '') +
		stackSig(enabled);
	if (appliedSig.get(img) === sig) return;
	appliedSig.set(img, sig);

	img.filters = buildFabricFilters(stack, size);
	pending.set(img, preview);
	rafId ??= requestAnimationFrame(flush);
}

const stackSig = (
	enabled: ReadonlyArray<{ type: string; params: unknown }>,
): string => JSON.stringify(enabled.map((e) => [e.type, e.params]));

const appliedEffects = new WeakMap<
	FabricImage,
	{ stack: readonly Effect[]; sig: string }
>();

export function syncImageEffects(
	img: EffectsImage,
	stack: readonly Effect[],
): void {
	const prev = appliedEffects.get(img);
	if (prev?.stack === stack) return;
	const enabled: Effect[] = [];
	for (const e of stack) {
		const def = e.enabled ? getEffectDef(e.type) : undefined;
		if (def)
			enabled.push({
				...e,
				params: {
					...defaultParams(def.params),
					...e.params,
				},
			});
	}
	const sig = stackSig(enabled);
	appliedEffects.set(img, { stack, sig });
	if (prev?.sig === sig) return;
	img.effects = enabled;
	img.set('dirty', true);
}

function flush(): void {
	rafId = null;
	const canvases = new Set<StaticCanvas>();
	for (const [img, preview] of pending) {
		if (preview) applyPreview(img);
		else applyFull(img);
		if (img.canvas) canvases.add(img.canvas);
	}
	pending.clear();
	for (const c of canvases) c.requestRenderAll();
}

function applyFull(img: FabricImage): void {
	const inner = internals(img);
	const target = previewTargets.get(img);
	if (target && inner._element === target) {
		inner._element = inner._originalElement;
		inner._filterScalingX = 1;
		inner._filterScalingY = 1;
	}
	img.applyFilters();
	const backend = getFilterBackend(false);
	if (backend instanceof WebGLFilterBackend)
		backend.evictCachesForKey(previewKey(img));
}

function applyPreview(img: FabricImage): void {
	const chain = img.filters.filter((f) => f && !f.isNeutralState());
	if (chain.length === 0) {
		applyFull(img);
		return;
	}
	const proxy = getProxy(img);
	let target = previewTargets.get(img);
	if (!target)
		previewTargets.set(
			img,
			(target = document.createElement('canvas')),
		);
	target.width = proxy.width;
	target.height = proxy.height;

	const backend = getFilterBackend();
	if (backend instanceof WebGLFilterBackend) {
		backend.applyFilters(
			chain,
			proxy,
			proxy.width,
			proxy.height,
			target,
			previewKey(img),
		);
	} else {
		backend.applyFilters(
			chain,
			proxy,
			proxy.width,
			proxy.height,
			target,
		);
	}

	const inner = internals(img);
	const { width, height } = sourceSize(img);
	inner._element = target;
	inner._filterScalingX = proxy.width / width;
	inner._filterScalingY = proxy.height / height;
	img.set('dirty', true);
}

function getProxy(img: FabricImage): HTMLCanvasElement {
	let proxy = proxies.get(img);
	if (!proxy) {
		const el = internals(img)._originalElement;
		const { width, height } = sourceSize(img);
		const scale = Math.sqrt(PREVIEW_PIXELS / (width * height));
		proxy = document.createElement('canvas');
		proxy.width = Math.max(1, Math.round(width * scale));
		proxy.height = Math.max(1, Math.round(height * scale));
		proxy.getContext('2d')!.drawImage(
			el,
			0,
			0,
			proxy.width,
			proxy.height,
		);
		proxies.set(img, proxy);
	}
	return proxy;
}
