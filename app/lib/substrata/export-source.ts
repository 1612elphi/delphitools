/**
 * Export render bridge (M6) — fabric-free registry, the viewport.ts pattern.
 * The canvas component owns the real Fabric instance; it registers a renderer
 * here and the export orchestrator/estimate call through it. Null until the
 * canvas mounts (export UI treats that as "not ready").
 */

export interface ExportRenderOptions {
	/** output multiplier relative to artboard pixels (fractional when clamped) */
	scale: number;
	/** render ONLY this layer (a group renders its leaves), transparent offscreen */
	soloLayerId?: string | null;
	/** fill a null artboard background with this colour (alpha-less formats) */
	flattenBackground?: string;
}

export type ExportRenderer = (
	opts: ExportRenderOptions,
) => HTMLCanvasElement | null;

let renderer: ExportRenderer | null = null;

export function registerExportRenderer(r: ExportRenderer | null): void {
	renderer = r;
}

export function exportRendererReady(): boolean {
	return renderer !== null;
}

/** Render artboard pixels for export. Null when the canvas isn't mounted. */
export function renderForExport(
	opts: ExportRenderOptions,
): HTMLCanvasElement | null {
	return renderer ? renderer(opts) : null;
}
