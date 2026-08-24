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

export function getSelectedLayerIds(): readonly string[] {
	return selected;
}

export function getActiveLayerId(): string | null {
	return selected[selected.length - 1] ?? null;
}

export function getSelectionAnchor(): string | null {
	return anchorId ?? getActiveLayerId();
}

export function subscribeSelection(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function setActiveLayer(id: string | null): void {
	setSelection(id ? [id] : [], { anchor: id });
}

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

export function toggleInSelection(id: string): void {
	if (selected.includes(id)) {
		setSelection(selected.filter((s) => s !== id));
	} else {
		setSelection([...selected, id], { anchor: id });
	}
}

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
