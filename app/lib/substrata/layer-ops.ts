
import { getSnapshot, update, updateTransient } from './doc-store';
import { newId } from './doc-model';
import {
	collectIds,
	findLayer,
	isGroup,
	leafLayers,
	leafRenderList,
	mapLayerInTree,
	parentIdOf,
	removeLayers,
	siblingListOf,
} from './layer-tree';
import {
	getSelectedLayerIds,
	pruneSelection,
	setActiveLayer,
	setSelection,
} from './selection';
import type {
	BlendMode,
	CropRect,
	Gradient,
	GroupLayer,
	Layer,
	ShapeParams,
	ShapeStroke,
	SubstrataDoc,
	TextLayer,
	Transform,
} from './doc-model';

export function setTransform(id: string, transform: Transform): void {
	update((doc) => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => ({
			...l,
			transform,
		})),
		updatedAt: Date.now(),
	}));
}

/** one undo step */
export function setTransforms(
	entries: readonly { id: string; transform: Transform }[],
): void {
	if (entries.length === 0) return;
	update((doc) => {
		let layers = doc.layers;
		for (const { id, transform } of entries) {
			layers = mapLayerInTree(layers, id, (l) => ({
				...l,
				transform,
			}));
		}
		return { ...doc, layers, updatedAt: Date.now() };
	});
}

/** transient slider updates */
export function setOpacity(
	id: string,
	opacity: number,
	opts?: { transient?: boolean },
): void {
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => ({
			...l,
			opacity,
		})),
		updatedAt: Date.now(),
	});
	if (opts?.transient) updateTransient(apply);
	else update(apply);
}

export function setCrop(
	id: string,
	crop: CropRect | null,
	opts?: { transient?: boolean },
): void {
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => ({ ...l, crop })),
		updatedAt: Date.now(),
	});
	if (opts?.transient) updateTransient(apply);
	else update(apply);
}

export function setFill(
	id: string,
	fill: string | Gradient,
	opts?: { transient?: boolean },
): void {
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => {
			if (l.kind === 'shape') return { ...l, fill };
			if (l.kind === 'freehand' && typeof fill === 'string')
				return { ...l, fill };
			return l;
		}),
		updatedAt: Date.now(),
	});
	if (opts?.transient) updateTransient(apply);
	else update(apply);
}

export function setShapeStroke(
	id: string,
	stroke: ShapeStroke | null,
	opts?: { transient?: boolean },
): void {
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) =>
			l.kind === 'shape' ? { ...l, stroke } : l,
		),
		updatedAt: Date.now(),
	});
	if (opts?.transient) updateTransient(apply);
	else update(apply);
}

export function setTextProps(
	id: string,
	patch: Partial<
		Pick<
			TextLayer,
			| 'text'
			| 'fontFamily'
			| 'fontSize'
			| 'fill'
			| 'stroke'
			| 'plate'
			| 'name'
			| 'transform'
			| 'align'
			| 'lineHeight'
			| 'charSpacing'
			| 'direction'
		>
	>,
	opts?: { transient?: boolean },
): void {
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) =>
			l.kind === 'text' ? { ...l, ...patch } : l,
		),
		updatedAt: Date.now(),
	});
	if (opts?.transient) updateTransient(apply);
	else update(apply);
}

export function setShapeParams(id: string, params: ShapeParams): void {
	update((doc) => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) =>
			l.kind === 'shape' ? { ...l, params } : l,
		),
		updatedAt: Date.now(),
	}));
}

export function setBlendMode(id: string, blendMode: BlendMode): void {
	update((doc) => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => ({
			...l,
			blendMode,
		})),
		updatedAt: Date.now(),
	}));
}

export function toggleVisibility(id: string): void {
	update((doc) => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => ({
			...l,
			visible: !l.visible,
		})),
		updatedAt: Date.now(),
	}));
}

export function toggleLock(id: string): void {
	update((doc) => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => ({
			...l,
			locked: !l.locked,
		})),
		updatedAt: Date.now(),
	}));
}

function cloneLayer(src: Layer): Layer {
	const base = {
		...src,
		id: newId(),
		filters: src.filters.map((f) => ({
			...f,
			params: { ...f.params },
		})),
		effects: src.effects.map((e) => ({
			...e,
			params: { ...e.params },
		})),
	};
	if (isGroup(src))
		return {
			...(base as GroupLayer),
			children: src.children.map(cloneLayer),
		};
	return base;
}

export function insertAfter(
	layers: Layer[],
	targetId: string,
	node: Layer,
): Layer[] {
	const idx = layers.findIndex((l) => l.id === targetId);
	if (idx !== -1) {
		const out = [...layers];
		out.splice(idx + 1, 0, node);
		return out;
	}
	let changed = false;
	const next = layers.map((l) => {
		if (!isGroup(l) || changed) return l;
		const children = insertAfter(l.children, targetId, node);
		if (children !== l.children) {
			changed = true;
			return { ...l, children };
		}
		return l;
	});
	return changed ? next : layers;
}

/** groups keep identity transforms */
function nudgeLeaves(l: Layer): Layer {
	if (isGroup(l)) return { ...l, children: l.children.map(nudgeLeaves) };
	return {
		...l,
		transform: {
			...l.transform,
			x: l.transform.x + 24,
			y: l.transform.y + 24,
		},
	};
}

/** exclude selected descendants */
export function duplicateLayers(ids: readonly string[]): void {
	const doc = getSnapshot();
	if (!doc || ids.length === 0) return;
	const idSet = new Set(ids);
	const top = ids.filter((id) => {
		let p = findParentGroupOf(doc.layers, id);
		while (p) {
			if (idSet.has(p.id)) return false;
			p = findParentGroupOf(doc.layers, p.id);
		}
		return true;
	});
	const pairs = top.flatMap((id) => {
		const src = findLayer(doc.layers, id);
		return src ? [{ id, copy: nudgeLeaves(cloneLayer(src)) }] : [];
	});
	if (pairs.length === 0) return;
	update((d) => {
		let layers = d.layers;
		for (const { id, copy } of pairs)
			layers = insertAfter(layers, id, copy);
		return { ...d, layers, updatedAt: Date.now() };
	});
	setSelection(pairs.map((p) => p.copy.id));
}

export function duplicateLayer(id: string): void {
	duplicateLayers([id]);
}

export function deleteLayers(ids: readonly string[]): void {
	if (ids.length === 0) return;
	const idSet = new Set(ids);
	update((doc) => {
		const { layers } = removeLayers(doc.layers, idSet);
		return { ...doc, layers, updatedAt: Date.now() };
	});
	const doc = getSnapshot();
	if (doc) pruneSelection(new Set(collectIds(doc.layers)));
}

export function deleteLayer(id: string): void {
	deleteLayers([id]);
}

/** groups keep identity transforms */
export function groupLayers(ids: readonly string[]): string | null {
	const doc = getSnapshot();
	if (!doc || ids.length < 2) return null;
	const parent = findParentGroupOf(doc.layers, ids[0]!);
	const siblings = parent ? parent.children : doc.layers;
	const idSet = new Set(ids);
	const members = siblings.filter((l) => idSet.has(l.id));
	if (members.length !== idSet.size) return null;
	const maxIndex = Math.max(
		...members.map((m) => siblings.findIndex((l) => l.id === m.id)),
	);
	const insertAt = maxIndex - (members.length - 1);

	const group: GroupLayer = {
		kind: 'group',
		id: newId(),
		name: '',
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over',
		transform: {
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			flipX: false,
			flipY: false,
		},
		filters: [],
		effects: [],
		children: members,
	};

	update((d) => {
		const rebuild = (list: Layer[]): Layer[] => {
			const out = list.filter((l) => !idSet.has(l.id));
			out.splice(Math.min(insertAt, out.length), 0, group);
			return out;
		};
		const layers =
			parent === null
				? rebuild(d.layers)
				: mapLayerInTree(d.layers, parent.id, (g) =>
						isGroup(g)
							? {
									...g,
									children: rebuild(
										g.children,
									),
								}
							: g,
					);
		return { ...d, layers, updatedAt: Date.now() };
	});
	setActiveLayer(group.id);
	return group.id;
}

function findParentGroupOf(
	layers: readonly Layer[],
	id: string,
): GroupLayer | null {
	for (const l of layers) {
		if (isGroup(l)) {
			if (l.children.some((c) => c.id === id)) return l;
			const hit = findParentGroupOf(l.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

export function ungroupLayer(groupId: string): void {
	const doc = getSnapshot();
	const group = doc ? findLayer(doc.layers, groupId) : null;
	if (!group || !isGroup(group)) return;
	const childIds = group.children.map((c) => c.id);
	update((d) => {
		const dissolve = (list: Layer[]): Layer[] => {
			const idx = list.findIndex((l) => l.id === groupId);
			if (idx !== -1) {
				const out = [...list];
				out.splice(
					idx,
					1,
					...(list[idx] as GroupLayer).children,
				);
				return out;
			}
			let changed = false;
			const next = list.map((l) => {
				if (!isGroup(l) || changed) return l;
				const children = dissolve(l.children);
				if (children !== l.children) {
					changed = true;
					return { ...l, children };
				}
				return l;
			});
			return changed ? next : list;
		};
		return {
			...d,
			layers: dissolve(d.layers),
			updatedAt: Date.now(),
		};
	});
	setSelection(childIds);
}

export function nudgeSelection(dx: number, dy: number): void {
	const doc = getSnapshot();
	if (!doc) return;
	const effective = new Map(
		leafRenderList(doc.layers).map((e) => [e.layer.id, e]),
	);
	const seen = new Set<string>();
	const entries: { id: string; transform: Transform }[] = [];
	for (const id of getSelectedLayerIds()) {
		const l = findLayer(doc.layers, id);
		if (!l) continue;
		for (const leaf of leafLayers(l)) {
			const e = effective.get(leaf.id);
			if (!e || !e.visible || e.locked || seen.has(leaf.id))
				continue;
			seen.add(leaf.id);
			entries.push({
				id: leaf.id,
				transform: {
					...leaf.transform,
					x: leaf.transform.x + dx,
					y: leaf.transform.y + dy,
				},
			});
		}
	}
	setTransforms(entries);
}

/** reject descendant targets */
export function moveLayer(
	id: string,
	newParentId: string | null,
	index: number,
): void {
	const doc = getSnapshot();
	if (!doc) return;
	const node = findLayer(doc.layers, id);
	if (!node) return;
	if (newParentId !== null) {
		const target = findLayer(doc.layers, newParentId);
		if (
			!target ||
			!isGroup(target) ||
			collectIds([node]).includes(newParentId)
		)
			return;
	}
	const curList = siblingListOf(doc.layers, id);
	if (
		curList &&
		(parentIdOf(doc.layers, id) ?? null) === newParentId &&
		curList.findIndex((l) => l.id === id) ===
			Math.min(index, curList.length - 1)
	) {
		return;
	}
	update((d) => {
		const { layers: without, removed } = removeLayers(
			d.layers,
			new Set([id]),
		);
		if (removed.length !== 1) return d;
		const insert = (list: Layer[]): Layer[] => {
			const out = [...list];
			out.splice(
				Math.max(0, Math.min(index, out.length)),
				0,
				removed[0]!,
			);
			return out;
		};
		const layers =
			newParentId === null
				? insert(without)
				: mapLayerInTree(without, newParentId, (g) =>
						isGroup(g)
							? {
									...g,
									children: insert(
										g.children,
									),
								}
							: g,
					);
		return { ...d, layers, updatedAt: Date.now() };
	});
}

export type ReorderDirection = 'front' | 'forward' | 'backward' | 'back';

export function reorderLayers(
	ids: readonly string[],
	dir: ReorderDirection,
): void {
	const doc = getSnapshot();
	if (!doc || ids.length === 0) return;
	const list = siblingListOf(doc.layers, ids[0]!);
	if (!list || !ids.every((id) => list.some((l) => l.id === id))) return;
	const parentId = parentIdOf(doc.layers, ids[0]!) ?? null;

	const selected = new Set(ids);
	const order = list.map((l) => l.id);
	let next: string[];
	if (dir === 'front') {
		next = [
			...order.filter((id) => !selected.has(id)),
			...order.filter((id) => selected.has(id)),
		];
	} else if (dir === 'back') {
		next = [
			...order.filter((id) => selected.has(id)),
			...order.filter((id) => !selected.has(id)),
		];
	} else {
		next = [...order];
		if (dir === 'forward') {
			for (let i = next.length - 2; i >= 0; i--) {
				if (
					selected.has(next[i]!) &&
					!selected.has(next[i + 1]!)
				) {
					[next[i], next[i + 1]] = [
						next[i + 1]!,
						next[i]!,
					];
				}
			}
		} else {
			for (let i = 1; i < next.length; i++) {
				if (
					selected.has(next[i]!) &&
					!selected.has(next[i - 1]!)
				) {
					[next[i], next[i - 1]] = [
						next[i - 1]!,
						next[i]!,
					];
				}
			}
		}
	}
	if (next.some((id, i) => id !== order[i]))
		setSiblingOrder(parentId, next);
}

export function setSiblingOrder(
	parentId: string | null,
	orderedIds: string[],
): void {
	update((doc) => {
		const reorder = (list: Layer[]): Layer[] => {
			const byId = new Map(list.map((l) => [l.id, l]));
			const next = orderedIds
				.map((id) => byId.get(id))
				.filter((l): l is Layer => l !== undefined);
			return next.length === list.length ? next : list;
		};
		if (parentId === null) {
			const layers = reorder(doc.layers);
			return layers === doc.layers
				? doc
				: { ...doc, layers, updatedAt: Date.now() };
		}
		const layers = mapLayerInTree(doc.layers, parentId, (g) =>
			isGroup(g)
				? { ...g, children: reorder(g.children) }
				: g,
		);
		return layers === doc.layers
			? doc
			: { ...doc, layers, updatedAt: Date.now() };
	});
}
