/**
 * Layer mutations — the action layer over the doc store. Each goes through
 * `update()`, the history choke point, so every op is undoable for free.
 * One-way: they mutate the doc; the reconciler renders the result.
 *
 * M2: id-addressed ops are TREE-AWARE (layer-tree.ts) — they find/patch layers
 * anywhere in the group nesting. Group semantics (identity transform, folder
 * only, effective flags) are documented in layer-tree.ts.
 */

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

/** Commit a layer transform (the one place a Fabric interaction writes back). */
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

/** Commit MANY transforms as ONE undo step (multi-selection drags, align,
 *  distribute). */
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

/**
 * Set a layer's opacity (0–1). `transient: true` routes through the coalesced
 * gesture path (live canvas update, no per-frame history) — used while dragging
 * the Inspector opacity slider; the slider's release commits the single step.
 */
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

/** Non-destructive layer crop (MOVE·Crop) — a CropRect in layer space, null
 *  clears it. Transient-aware like setOpacity: handle drags stream through
 *  the gesture path and settle to ONE undo step on release. */
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

/** Fill for shape/freehand layers — the M4 colour sink + the Inspector fill
 *  rows (incl. gradient authoring, shapes only: a freehand fill is
 *  string-typed, so a Gradient no-ops there). A flat colour REPLACES a
 *  gradient fill (v1 call — colour-sink.ts). Transient-aware: picker drags
 *  stream through the gesture path and settle to ONE undo step. */
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

/** A shape layer's vector stroke (Inspector rows). Transient-aware like setFill. */
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

/** Patch a text layer (content on editing-exit, font/size/style/accent from
 *  the bloom + Inspector). Transient-aware for streamed colour picks. */
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

/** Replace a shape layer's intrinsic params (Inspector after-the-fact edits —
 *  corner radius, sides, star points/inner). One undo step per commit; the
 *  reconciler updates the Fabric geometry in place. No-op on other kinds. */
export function setShapeParams(id: string, params: ShapeParams): void {
	update((doc) => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) =>
			l.kind === 'shape' ? { ...l, params } : l,
		),
		updatedAt: Date.now(),
	}));
}

/** Set a layer's compositing blend mode. */
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

export function setVisibility(id: string, visible: boolean): void {
	update((doc) => ({
		...doc,
		layers: mapLayerInTree(doc.layers, id, (l) => ({
			...l,
			visible,
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

/** Toggle a layer's lock (locked layers aren't selectable/draggable on canvas). */
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

/** Deep-clone a layer subtree with fresh ids (duplicate, group copies). */
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

/** Insert `node` right after `targetId` within its sibling list (anywhere in
 *  the tree). Returns the original list when the target is missing. */
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

/** Offset a copy so it's visibly a copy: leaves nudge +24/+24; a group node
 *  stays identity (folder semantics) and nudges its leaf descendants instead. */
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

/**
 * Duplicate the selection as ONE undo step. Only topmost selected nodes clone
 * (a selected child of a selected group rides along inside its group's copy);
 * each copy lands right after its source and the copies become the selection.
 */
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

/** Duplicate a single layer (kept for the M1 call sites). */
export function duplicateLayer(id: string): void {
	duplicateLayers([id]);
}

/** Delete layers (whole subtrees for group ids) as one undo step. */
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

/** Delete a single layer (kept for the M1 call sites). */
export function deleteLayer(id: string): void {
	deleteLayers([id]);
}

/**
 * Group layers: all ids must share ONE sibling list (top-level or the same
 * group) — the panel only enables Group when that holds. The new group takes
 * the topmost member's slot; members keep doc order as its children. The
 * group's own name starts empty (the panel renders the \u2211CG placeholder) and
 * its transform stays identity (folder semantics, layer-tree.ts).
 */
export function groupLayers(ids: readonly string[]): string | null {
	const doc = getSnapshot();
	if (!doc || ids.length < 2) return null;
	const parent = findParentGroupOf(doc.layers, ids[0]!); // null ⇒ root list
	const siblings = parent ? parent.children : doc.layers;
	const idSet = new Set(ids);
	const members = siblings.filter((l) => idSet.has(l.id));
	if (members.length !== idSet.size) return null; // not all in one sibling list
	const maxIndex = Math.max(
		...members.map((m) => siblings.findIndex((l) => l.id === m.id)),
	);
	const insertAt = maxIndex - (members.length - 1); // the topmost member's slot

	const group: GroupLayer = {
		kind: 'group',
		id: newId(),
		// empty ⇒ the panel renders its \u2211CG placeholder (the doc-name precedent)
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
		children: members, // doc order preserved (bottom → top)
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

/** The group whose children contain `id`, or null for top-level ids. */
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

/** Dissolve a group in place: children take its slot (same order). */
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

/** Arrow-key nudge (MOVE tool): shift every effectively visible + unlocked
 *  leaf of the selection by dx/dy scene px, as ONE undo step per press. */
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

/**
 * Move ONE layer (a group moves as a whole block) into `newParentId`'s
 * children (null = the root list) at doc-order `index` — its FINAL position in
 * the destination list (0 = bottom of the stack). The panel's cross-parent
 * drag lands here; a single update() ⇒ one undo step. No-ops when the layer or
 * target is missing, the target isn't a group, or the target sits inside the
 * moved subtree (a group must never become its own descendant).
 */
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
	// same-slot drop → no doc change, no history step
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

/**
 * Restack the selected ids within their (shared) sibling list — the context
 * menu's Bring/Send actions. Doc order is bottom→top, so "front" moves ids to
 * the END. forward/backward step each selected item one slot, skipping over
 * other selected items so a block moves as a block. No-op when the ids span
 * different sibling lists (cross-parent moves go through moveLayer/panel drag).
 */
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
			// walk top→bottom so a swap never collides with an already-moved item
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

/** Reorder ONE sibling list (root when parentId is null) to `orderedIds`
 *  (bottom → top in doc order). Ids must cover the list exactly. */
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
