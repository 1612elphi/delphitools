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
