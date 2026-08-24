import { formatMeta, type ExportFormat } from './export-core';
import { canvasToBlob } from './blobs';
import { JXL_ENCODE_DEFAULTS } from 'delphitools-v2/lib/jxl-defaults';

interface Pending {
	resolve: (blob: Blob) => void;
	reject: (err: Error) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

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
