import type { Layer, SubstrataDoc, Transform } from './doc-model';
import { getSnapshot } from './doc-store';
import { setTransforms } from './layer-ops';
import { findLayer, leafLayers, leafRenderList } from './layer-tree';
import { getSelectedLayerIds } from './selection';
import { layerDims } from './shape-geometry';

// ios arrangeaction: unlocked leaves
export type ArrangeAction =
	| 'alignLeft'
	| 'alignCentre'
	| 'alignRight'
	| 'alignTop'
	| 'alignMiddle'
	| 'alignBottom'
	| 'distributeHorizontally'
	| 'distributeVertically'
	| 'rotateLeft'
	| 'rotateRight'
	| 'flipHorizontal'
	| 'flipVertical';

export const ALIGNS: readonly ArrangeAction[] = [
	'alignLeft',
	'alignCentre',
	'alignRight',
	'alignTop',
	'alignMiddle',
	'alignBottom',
];
export const DISTRIBUTES: readonly ArrangeAction[] = [
	'distributeHorizontally',
	'distributeVertically',
];
export const TURNS: readonly ArrangeAction[] = [
	'rotateLeft',
	'rotateRight',
	'flipHorizontal',
	'flipVertical',
];

interface Dims {
	w: number;
	h: number;
}

function dimsOf(layer: Layer): Dims | null {
	const d = layerDims(layer);
	return d
		? {
				w: d.width * layer.transform.scaleX,
				h: d.height * layer.transform.scaleY,
			}
		: null;
}

export function arrangeLeaves(
	doc: SubstrataDoc,
	ids: readonly string[],
): Layer[] {
	const effective = new Map(
		leafRenderList(doc.layers).map((e) => [e.layer.id, e]),
	);
	const out: Layer[] = [];
	for (const id of ids) {
		const layer = findLayer(doc.layers, id);
		if (!layer) continue;
		for (const leaf of leafLayers(layer)) {
			const e = effective.get(leaf.id);
			if (
				e &&
				e.visible &&
				!e.locked &&
				!e.pinned &&
				!out.includes(leaf)
			)
				out.push(leaf);
		}
	}
	return out;
}

export function canArrange(
	action: ArrangeAction,
	doc: SubstrataDoc,
	ids: readonly string[],
): boolean {
	const leaves = arrangeLeaves(doc, ids);
	if (TURNS.includes(action)) return leaves.length > 0;
	const sized = leaves.filter((l) => dimsOf(l) !== null).length;
	return DISTRIBUTES.includes(action) ? sized >= 3 : sized > 0;
}

// ios islit semantics
export function isLit(
	action: ArrangeAction,
	doc: SubstrataDoc,
	ids: readonly string[],
): boolean {
	const key =
		action === 'flipHorizontal'
			? 'flipX'
			: action === 'flipVertical'
				? 'flipY'
				: null;
	if (!key) return false;
	const leaves = arrangeLeaves(doc, ids);
	return leaves.length > 0 && leaves.every((l) => l.transform[key]);
}

const wrap360 = (a: number) => ((a % 360) + 360) % 360;

export function arrangedTransforms(
	action: ArrangeAction,
	doc: SubstrataDoc,
	ids: readonly string[],
): { id: string; transform: Transform }[] {
	const leaves = arrangeLeaves(doc, ids);
	const sized = leaves.filter((l) => dimsOf(l) !== null);
	const { width, height } = doc.artboard;
	const align = (patch: (d: Dims) => Partial<Transform>) =>
		sized.map((l) => ({
			id: l.id,
			transform: { ...l.transform, ...patch(dimsOf(l)!) },
		}));
	const distribute = (axis: 'x' | 'y') => {
		const sorted = [...sized].sort(
			(a, b) => a.transform[axis] - b.transform[axis],
		);
		const lo = sorted[0]?.transform[axis] ?? 0;
		const hi = sorted.at(-1)?.transform[axis] ?? 0;
		const step = (hi - lo) / Math.max(1, sorted.length - 1);
		return sorted.map((l, i) => ({
			id: l.id,
			transform: { ...l.transform, [axis]: lo + i * step },
		}));
	};
	const each = (patch: (t: Transform) => Partial<Transform>) =>
		leaves.map((l) => ({
			id: l.id,
			transform: { ...l.transform, ...patch(l.transform) },
		}));
	switch (action) {
		case 'alignLeft':
			return align((d) => ({ x: d.w / 2 }));
		case 'alignCentre':
			return align(() => ({ x: width / 2 }));
		case 'alignRight':
			return align((d) => ({ x: width - d.w / 2 }));
		case 'alignTop':
			return align((d) => ({ y: d.h / 2 }));
		case 'alignMiddle':
			return align(() => ({ y: height / 2 }));
		case 'alignBottom':
			return align((d) => ({ y: height - d.h / 2 }));
		case 'distributeHorizontally':
			return sized.length >= 3 ? distribute('x') : [];
		case 'distributeVertically':
			return sized.length >= 3 ? distribute('y') : [];
		case 'rotateLeft':
			return each((t) => ({ angle: wrap360(t.angle - 90) }));
		case 'rotateRight':
			return each((t) => ({ angle: wrap360(t.angle + 90) }));
		case 'flipHorizontal':
			return each((t) => ({ flipX: !t.flipX }));
		case 'flipVertical':
			return each((t) => ({ flipY: !t.flipY }));
	}
}

export function arrange(action: ArrangeAction): void {
	const doc = getSnapshot();
	if (!doc) return;
	setTransforms(arrangedTransforms(action, doc, getSelectedLayerIds()));
}
