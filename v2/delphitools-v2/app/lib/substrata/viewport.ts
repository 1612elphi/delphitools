/**
 * Viewport store (M1-4 tail) — bridges the zoom UI (top bar / Workspace) and the
 * imperative Fabric viewport. The canvas owns the real viewportTransform; it
 * registers a controller here and reports its zoom back for display. The UI reads
 * `getZoom()` and calls `viewport.*` actions, which delegate to the controller.
 * Viewport state is NOT document truth (like selection).
 */

export interface ViewportController {
	zoomIn: () => void;
	zoomOut: () => void;
	fit: () => void;
	setZoom: (z: number) => void;
	reset: () => void;
	/** Cycle the % readout: 100% → fit → last manual zoom → … */
	cycle: () => void;
}

let controller: ViewportController | null = null;
let zoom = 1;
const listeners = new Set<() => void>();

export function registerViewportController(c: ViewportController | null): void {
	controller = c;
}

/** The canvas calls this whenever its zoom changes (wheel, fit, actions). */
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

/** UI-facing actions — no-op until the canvas registers a controller. */
export const viewport = {
	zoomIn: () => controller?.zoomIn(),
	zoomOut: () => controller?.zoomOut(),
	fit: () => controller?.fit(),
	reset: () => controller?.reset(),
	setZoom: (z: number) => controller?.setZoom(z),
	cycle: () => controller?.cycle(),
};
