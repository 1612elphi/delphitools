type Listener = () => void;

export type ModalId =
	| 'export'
	| 'canvas-size'
	| 'new-scene'
	| 'onboarding'
	| 'shortcuts'
	| 'about-substrata'
	| 'about-delphitools';

let open: ModalId | null = null;
const listeners = new Set<Listener>();

function emit(): void {
	for (const l of listeners) l();
}

export function getOpenModal(): ModalId | null {
	return open;
}

export function openModal(id: ModalId): void {
	if (open === id) return;
	open = id;
	emit();
}

export function closeModal(): void {
	if (open === null) return;
	open = null;
	emit();
}

export function subscribeModal(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
