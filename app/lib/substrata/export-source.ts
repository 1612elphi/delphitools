export interface ExportRenderOptions {
	scale: number;
	soloLayerId?: string | null;
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

export function renderForExport(
	opts: ExportRenderOptions,
): HTMLCanvasElement | null {
	return renderer ? renderer(opts) : null;
}
