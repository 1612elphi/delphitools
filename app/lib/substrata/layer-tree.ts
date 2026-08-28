/* groups keep identity transforms */

import type { GroupLayer, Layer } from './doc-model';

export function isGroup(l: Layer): l is GroupLayer {
	return l.kind === 'group';
}

export function findLayer(layers: readonly Layer[], id: string): Layer | null {
	for (const l of layers) {
		if (l.id === id) return l;
		if (isGroup(l)) {
			const hit = findLayer(l.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

export function collectIds(
	layers: readonly Layer[],
	into: string[] = [],
): string[] {
	for (const l of layers) {
		into.push(l.id);
		if (isGroup(l)) collectIds(l.children, into);
	}
	return into;
}

export function leafLayers(layer: Layer, into: Layer[] = []): Layer[] {
	if (isGroup(layer)) {
		for (const c of layer.children) leafLayers(c, into);
	} else {
		into.push(layer);
	}
	return into;
}

export function mapLayerInTree(
	layers: Layer[],
	id: string,
	fn: (l: Layer) => Layer,
): Layer[] {
	let changed = false;
	const next = layers.map((l) => {
		if (l.id === id) {
			changed = true;
			return fn(l);
		}
		if (isGroup(l)) {
			const children = mapLayerInTree(l.children, id, fn);
			if (children !== l.children) {
				changed = true;
				return { ...l, children };
			}
		}
		return l;
	});
	return changed ? next : layers;
}

export function removeLayers(
	layers: Layer[],
	ids: ReadonlySet<string>,
): { layers: Layer[]; removed: Layer[] } {
	const removed: Layer[] = [];
	const walk = (list: Layer[]): Layer[] => {
		let changed = false;
		const out: Layer[] = [];
		for (const l of list) {
			if (ids.has(l.id)) {
				removed.push(l);
				changed = true;
				continue;
			}
			if (isGroup(l)) {
				const children = walk(l.children);
				if (children !== l.children) {
					changed = true;
					out.push({ ...l, children });
					continue;
				}
			}
			out.push(l);
		}
		return changed ? out : list;
	};
	const nextLayers = walk(layers);
	return { layers: nextLayers, removed };
}

export function parentIdOf(
	layers: readonly Layer[],
	id: string,
): string | null | undefined {
	if (layers.some((l) => l.id === id)) return null;
	for (const l of layers) {
		if (isGroup(l)) {
			const hit = parentIdOf(l.children, id);
			if (hit !== undefined) return hit ?? l.id;
		}
	}
	return undefined;
}

export function siblingListOf(
	layers: readonly Layer[],
	id: string,
): readonly Layer[] | null {
	if (layers.some((l) => l.id === id)) return layers;
	for (const l of layers) {
		if (isGroup(l)) {
			const hit = siblingListOf(l.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

export interface LeafRenderEntry {
	layer: Layer;
	visible: boolean;
	locked: boolean;
	opacity: number;
}

export function leafRenderList(
	layers: readonly Layer[],
	into: LeafRenderEntry[] = [],
	visible = true,
	locked = false,
	opacity = 1,
): LeafRenderEntry[] {
	for (const l of layers) {
		const v = visible && l.visible;
		const k = locked || l.locked;
		const o = opacity * l.opacity;
		if (isGroup(l)) leafRenderList(l.children, into, v, k, o);
		else into.push({ layer: l, visible: v, locked: k, opacity: o });
	}
	return into;
}

export function selectableLeafIds(layers: readonly Layer[]): string[] {
	return leafRenderList(layers)
		.filter((e) => e.visible && !e.locked)
		.map((e) => e.layer.id);
}

export interface PanelRow {
	layer: Layer;
	depth: number;
	parentId: string | null;
	lastChild: boolean;
	trail: boolean[];
}

export function flattenForPanel(
	layers: readonly Layer[],
	collapsed: ReadonlySet<string>,
	depth = 0,
	parentId: string | null = null,
	into: PanelRow[] = [],
	trail: boolean[] = [],
): PanelRow[] {
	const display = [...layers].reverse();
	display.forEach((l, i) => {
		const lastChild = i === display.length - 1;
		into.push({ layer: l, depth, parentId, lastChild, trail });
		if (isGroup(l) && !collapsed.has(l.id)) {
			flattenForPanel(
				l.children,
				collapsed,
				depth + 1,
				l.id,
				into,
				[...trail, lastChild],
			);
		}
	});
	return into;
}
