/**
 * Selection store — which layers are selected. TRANSIENT UI state, deliberately
 * NOT part of the document model (§6: selections aren't document truth). Mirrors
 * the doc-store shape so components bind via useSyncExternalStore.
 *
 * MULTI-SELECT (M2): the selection is an ORDERED id list; the LAST id is the
 * primary/active layer — what the single-layer surfaces (Inspector transform,
 * FX stacks, the blend/opacity footer) operate on. `getActiveLayerId()` keeps
 * the M1 single-select API shape, so those callers didn't change. Shift-range
 * ANCHORING lives here; range EXPANSION is the caller's job (it needs doc
 * order, which this store deliberately doesn't know).
 */

type Listener = () => void;

let selected: readonly string[] = [];
let anchorId: string | null = null;
const listeners = new Set<Listener>();

function emit(): void {
	for (const l of listeners) l();
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** The full ordered selection (stable reference between changes). */
export function getSelectedLayerIds(): readonly string[] {
	return selected;
}

/** The primary/active layer — the most recently selected id. */
export function getActiveLayerId(): string | null {
	return selected[selected.length - 1] ?? null;
}

/** The shift-range anchor: the last plain-clicked id (falls back to primary). */
export function getSelectionAnchor(): string | null {
	return anchorId ?? getActiveLayerId();
}

export function subscribeSelection(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Single-select (the M1 API): replaces the whole selection. */
export function setActiveLayer(id: string | null): void {
	setSelection(id ? [id] : [], { anchor: id });
}

/** Replace the selection wholesale (deduped, order kept — last id = primary). */
export function setSelection(
	ids: readonly string[],
	opts?: { anchor?: string | null },
): void {
	const next = [...new Set(ids)];
	const nextAnchor = opts?.anchor !== undefined ? opts.anchor : anchorId;
	if (sameIds(next, selected) && nextAnchor === anchorId) return;
	selected = next;
	anchorId = nextAnchor;
	emit();
}

/** Cmd/ctrl-click: add (becomes primary + anchor) or remove an id. */
export function toggleInSelection(id: string): void {
	if (selected.includes(id)) {
		setSelection(selected.filter((s) => s !== id));
	} else {
		setSelection([...selected, id], { anchor: id });
	}
}

/** Drop ids that no longer exist in the doc (after delete/undo/redo). */
export function pruneSelection(existing: ReadonlySet<string>): void {
	if (
		selected.every((id) => existing.has(id)) &&
		(anchorId === null || existing.has(anchorId))
	)
		return;
	selected = selected.filter((id) => existing.has(id));
	if (anchorId !== null && !existing.has(anchorId)) anchorId = null;
	emit();
}
