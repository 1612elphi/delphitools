import type { ModuleId } from './pin-pref';

export type DockDrag = { kind: 'module'; id: ModuleId } | { kind: 'omnibar' };

let active: DockDrag | null = null;
const listeners = new Set<() => void>();

export function getDockDrag(): DockDrag | null {
	return active;
}

export function subscribeDockDrag(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function startDockDrag(drag: DockDrag): void {
	active = drag;
	for (const l of listeners) l();
}

export function endDockDrag(): void {
	if (!active) return;
	active = null;
	for (const l of listeners) l();
}
