import { loadLayout, saveLayout } from './layout-storage';

export type ModuleId =
	| 'tool'
	| 'effects'
	| 'layers'
	| 'inspector'
	| 'colour'
	| 'looks'
	| 'arrange';

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

// defer persisted pins for ssr
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
