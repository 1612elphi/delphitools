/**
 * Tiny top-bar status toasts. A toast is fired by a semantic KEY (an identifier,
 * not copy); the display string + icon live in the toast slot's registry and are
 * \u2211CG (filled via slopsieve). One toast at a time; it auto-clears, and firing the
 * same key again re-triggers the animation via a bumped `seq`. Client-only.
 */

export type ToastId =
	| 'canvas-fit'
	| 'saved'
	| 'storage-off'
	| 'image-added'
	| 'zoom-100'
	| 'copied'
	| 'paste-empty'
	| 'exported'
	| 'wand-needs-layer'
	| 'open-failed';

export interface ToastState {
	id: ToastId;
	seq: number;
}

const DEFAULT_MS = 1800;

let current: ToastState | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function toast(id: ToastId, ms = DEFAULT_MS): void {
	seq += 1;
	current = { id, seq };
	emit();
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		current = null;
		emit();
	}, ms);
}

export function getToast(): ToastState | null {
	return current;
}

export function subscribeToast(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
