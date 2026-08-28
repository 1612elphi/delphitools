import { update, getSnapshot } from './doc-store';
import { findLayer, mapLayerInTree } from './layer-tree';
import type { Layer } from './doc-model';
import { bakeCanvasToHash } from './blobs';

let baker: ((layerId: string) => HTMLCanvasElement | null) | null = null;

export function registerLayerBaker(b: typeof baker): void {
	baker = b;
}

export function canRasterize(layer: Layer): boolean {
	return (
		layer.kind === 'shape' ||
		layer.kind === 'freehand' ||
		layer.kind === 'text'
	);
}

export async function rasterizeLayer(id: string): Promise<boolean> {
	const doc = getSnapshot();
	const layer = doc ? findLayer(doc.layers, id) : null;
	if (!layer || !canRasterize(layer) || !baker) return false;
	const el = baker(id);
	if (!el || el.width === 0 || el.height === 0) return false;

	// scale race during bake
	const hash = await bakeCanvasToHash(el);

	// revalidate after async bake
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
			transform: {
				...l.transform,
				scaleX: 1,
				scaleY: 1,
				flipX: false,
				flipY: false,
			},
			filters: l.filters,
			effects: l.effects,
			kind: 'raster',
			blobHash: hash,
			naturalWidth: el.width,
			naturalHeight: el.height,
		})),
		updatedAt: Date.now(),
	}));
	return true;
}
