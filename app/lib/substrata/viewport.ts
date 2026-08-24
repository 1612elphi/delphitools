export interface ViewportController {
	zoomIn: () => void;
	zoomOut: () => void;
	fit: () => void;
	setZoom: (z: number) => void;
	reset: () => void;
	cycle: () => void;
}

let controller: ViewportController | null = null;
let zoom = 1;
const listeners = new Set<() => void>();

export function registerViewportController(c: ViewportController | null): void {
	controller = c;
}

export function reportZoom(z: number): void {
	if (Math.abs(z - zoom) < 1e-4) return;
	zoom = z;
	for (const l of listeners) l();
}

export function getZoom(): number {
	return zoom;
}

export function subscribeViewport(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export const viewport = {
	zoomIn: () => controller?.zoomIn(),
	zoomOut: () => controller?.zoomOut(),
	fit: () => controller?.fit(),
	reset: () => controller?.reset(),
	setZoom: (z: number) => controller?.setZoom(z),
	cycle: () => controller?.cycle(),
};
