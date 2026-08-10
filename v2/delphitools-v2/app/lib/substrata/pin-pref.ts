/**
 * Pinned-modules store (§8 rail). A module is either peeked (hover-bloom from its
 * omnibar trigger) or pinned (rendered in the rail at uniform height). The same
 * content renders in one place or the other based on this state. Ordered array =
 * rail order. Persisted to localStorage (UI ergonomics, not document content —
 * see layout-storage).
 */

import { loadLayout, saveLayout } from './layout-storage';

export type ModuleId =
	| 'tool'
	| 'effects'
	| 'layers'
	| 'inspector'
	| 'colour'
	| 'looks'
	| 'arrange';

/** Runtime list of every module id (for validating persisted layout). Export and
 *  Canvas size are NOT modules — they're blocking modals (see lib/substrata/modal).
 *  Align + Rotate are consolidated into "arrange". "looks" = the film-sim/LUT
 *  gallery (pulled out of FX — Ruby, 2026-07-03). */
export const MODULE_IDS: readonly ModuleId[] = [
	'tool',
	'effects',
	'layers',
	'inspector',
	'colour',
	'looks',
	'arrange',
];

export function isModuleId(v: unknown): v is ModuleId {
	return (
		typeof v === 'string' &&
		(MODULE_IDS as readonly string[]).includes(v)
	);
}

const PINS_KEY = 'pinned';

// Starts empty so the first client render matches the prerendered HTML; the real
// persisted value is loaded post-mount by hydratePins() (avoids SSR mismatch).
let pinned: ModuleId[] = [];
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

function commit(next: ModuleId[]): void {
	pinned = next;
	saveLayout(PINS_KEY, pinned);
	emit();
}

/** Load pinned modules from localStorage (dropping unknown ids). Called once
 *  after mount — see hydrateLayoutPrefs in dock-pref. */
export function hydratePins(): void {
	const raw = loadLayout<unknown>(PINS_KEY, null);
	if (!Array.isArray(raw)) return;
	const seen = new Set<ModuleId>();
	for (const v of raw) if (isModuleId(v)) seen.add(v);
	const next = [...seen];
	if (
		next.length === pinned.length &&
		next.every((v, i) => v === pinned[i])
	)
		return;
	pinned = next;
	emit();
}

export function getPinned(): readonly ModuleId[] {
	return pinned;
}

export function isPinned(id: ModuleId): boolean {
	return pinned.includes(id);
}

export function togglePin(id: ModuleId): void {
	commit(
		pinned.includes(id)
			? pinned.filter((x) => x !== id)
			: [...pinned, id],
	);
}

/** Force a module open (pinned) or closed. */
export function setPinned(id: ModuleId, open: boolean): void {
	if (pinned.includes(id) === open) return;
	commit(open ? [...pinned, id] : pinned.filter((x) => x !== id));
}

export function subscribePins(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
