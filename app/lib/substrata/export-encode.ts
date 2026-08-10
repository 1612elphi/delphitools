/**
 * Export encoders (M6) — canvas → Blob. PNG/JPEG/WebP use the native
 * `canvas.toBlob` encoder; JXL goes through the vendored libjxl WASM inside a
 * /public module worker (public/jxl/jxl-worker.js) so a multi-second encode
 * never freezes the editor. Fabric-free; the orchestrator and the size
 * estimate share these paths.
 */

import { formatMeta, type ExportFormat } from './export-core';
import { canvasToBlob } from './blobs';
import { JXL_ENCODE_DEFAULTS } from 'delphitools-v2/lib/jxl-defaults';

// ── JXL worker bridge ────────────────────────────────────────────────────────

interface Pending {
	resolve: (blob: Blob) => void;
	reject: (err: Error) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

/** Workers need a secure context; over file:// JXL is simply unavailable. */
export function jxlAvailable(): boolean {
	return (
		typeof Worker !== 'undefined' &&
		typeof window !== 'undefined' &&
		window.isSecureContext === true
	);
}

function getJxlWorker(): Worker {
	if (!worker) {
		worker = new Worker('/jxl/jxl-worker.js', { type: 'module' });
		worker.onmessage = (event: MessageEvent) => {
			const { id, ok, bytes, error } = event.data as {
				id: number;
				ok: boolean;
				// transferred buffers are always plain ArrayBuffers (BlobPart-safe)
				bytes?: Uint8Array<ArrayBuffer>;
				error?: string;
			};
			const p = pending.get(id);
			if (!p) return;
			pending.delete(id);
			if (ok && bytes)
				p.resolve(
					new Blob([bytes], {
						type: 'image/jxl',
					}),
				);
			else
				p.reject(
					new Error(
						error ?? 'JXL encoding failed',
					),
				);
		};
		worker.onerror = (event) => {
			// A dead worker fails everything in flight; the next encode respawns it.
			for (const p of pending.values())
				p.reject(
					new Error(
						event.message ||
							'JXL worker error',
					),
				);
			pending.clear();
			worker?.terminate();
			worker = null;
		};
	}
	return worker;
}

function encodeJxl(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	const { data, width, height } = ctx.getImageData(
		0,
		0,
		canvas.width,
		canvas.height,
	);
	const id = ++seq;
	return new Promise<Blob>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		getJxlWorker().postMessage(
			{
				id,
				data,
				width,
				height,
				options: {
					...JXL_ENCODE_DEFAULTS,
					quality,
					lossless: quality >= 100,
				},
			},
			[data.buffer],
		);
	});
}

// ── entry ────────────────────────────────────────────────────────────────────

/** Encode a rendered canvas in the chosen format. Quality is 1–100 and only
 *  applies to lossy formats. Throws when the browser silently falls back to a
 *  different format (mislabelled file guard, SPEC §5 blob.type detect). */
export async function encodeCanvas(
	canvas: HTMLCanvasElement,
	format: ExportFormat,
	quality: number,
): Promise<Blob> {
	const meta = formatMeta(format);
	if (format === 'jxl') return encodeJxl(canvas, quality);
	const blob = await canvasToBlob(
		canvas,
		meta.mime,
		meta.lossy ? quality : undefined,
	);
	if (blob.type && blob.type !== meta.mime) {
		throw new Error(
			`Encoder produced ${blob.type} instead of ${meta.mime}`,
		);
	}
	return blob;
}
