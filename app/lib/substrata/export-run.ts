import {
	exportFilename,
	formatMeta,
	resolveExportDims,
	verifyExportBlob,
	type ExportOptions,
} from './export-core';
import { encodeCanvas } from './export-encode';
import { exportRendererReady, renderForExport } from './export-source';
import { getSnapshot } from './doc-store';
import { getActiveLayerId } from './selection';
import { leafRenderList } from './layer-tree';
import { downloadBlob } from 'delphitools-v2/lib/download';

const NO_ALPHA_FLATTEN = '#ffffff';
const SHRINK_FACTOR = 0.7;
const MAX_ATTEMPTS = 3;

export type ExportOutcome =
	| {
			ok: true;
			blob: Blob;
			width: number;
			height: number;
			effectiveScale: number;
			downscaled: boolean;
			filename: string;
	  }
	| {
			ok: false;
			reason: 'not-ready' | 'encode-failed' | 'verify-failed';
	  };

function currentRenderPlan(options: ExportOptions) {
	const doc = getSnapshot();
	if (!doc || !exportRendererReady()) return null;
	const soloLayerId =
		options.scope === 'layer' ? getActiveLayerId() : null;
	if (options.scope === 'layer' && !soloLayerId) return null;
	return {
		doc,
		soloLayerId,
		flattenBackground: formatMeta(options.format).alpha
			? undefined
			: NO_ALPHA_FLATTEN,
	};
}

export async function runExport(
	options: ExportOptions,
	{ download = true }: { download?: boolean } = {},
): Promise<ExportOutcome> {
	const plan = currentRenderPlan(options);
	if (!plan) return { ok: false, reason: 'not-ready' };
	const { doc } = plan;

	const dims = resolveExportDims(
		doc.artboard.width,
		doc.artboard.height,
		options.scale,
	);
	// transparent exports may pass
	const expectContent =
		plan.soloLayerId !== null ||
		doc.artboard.background !== null ||
		leafRenderList(doc.layers).some((e) => e.visible);

	let scale = dims.effectiveScale;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const canvas = renderForExport({
			scale,
			soloLayerId: plan.soloLayerId,
			flattenBackground: plan.flattenBackground,
		});
		if (!canvas) return { ok: false, reason: 'not-ready' };

		let blob: Blob;
		try {
			blob = await encodeCanvas(
				canvas,
				options.format,
				options.quality,
			);
		} catch {
			return { ok: false, reason: 'encode-failed' };
		}

		if (await verifyExportBlob(blob, expectContent)) {
			const filename = exportFilename(
				doc.name,
				canvas.width,
				canvas.height,
				formatMeta(options.format).ext,
			);
			if (download) downloadBlob(blob, filename);
			return {
				ok: true,
				blob,
				width: canvas.width,
				height: canvas.height,
				effectiveScale: scale,
				downscaled: dims.downscaled || attempt > 0,
				filename,
			};
		}
		scale *= SHRINK_FACTOR;
	}
	return { ok: false, reason: 'verify-failed' };
}
