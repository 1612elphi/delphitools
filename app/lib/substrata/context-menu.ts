export type MenuState =
	| { kind: 'layer'; x: number; y: number; ids: readonly string[] }
	| {
			kind: 'canvas';
			x: number;
			y: number;
			scene: { x: number; y: number };
	  };

let state: MenuState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function getLayerMenu(): MenuState | null {
	return state;
}

export function subscribeLayerMenu(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function openLayerMenu(
	x: number,
	y: number,
	ids: readonly string[],
): void {
	if (ids.length === 0) return;
	state = { kind: 'layer', x, y, ids };
	emit();
}

export function openCanvasMenu(
	x: number,
	y: number,
	scene: { x: number; y: number },
): void {
	state = { kind: 'canvas', x, y, scene };
	emit();
}

export function closeLayerMenu(): void {
	if (!state) return;
	state = null;
	emit();
}
