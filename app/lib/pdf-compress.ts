/**
 * Main-thread client for the pdf-compressor Web Worker.
 *
 * All MuPDF work runs in pdf-compress.worker.ts so a compress never blocks the
 * UI. The worker is spawned on the first compress and kept alive for the rest of
 * the session, so the ~10 MB wasm instantiates at most once. See
 * pdf-compress-core.ts for the pure helpers this re-exports.
 */

export {
	formatBytes,
	savingsPercent,
	resizeTo,
	STRUCTURAL_OPTIONS,
} from './pdf-compress-core';
export type { CompressOptions, CompressResult } from './pdf-compress-core';

import type { CompressOptions, CompressResult } from './pdf-compress-core';

interface WorkerResult {
	id: number;
	ok: boolean;
	bytes?: ArrayBuffer;
	pageCount?: number;
	imagesTouched?: number;
	error?: string;
}

interface Pending {
	resolve: (result: CompressResult) => void;
	reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(
		new URL('./pdf-compress.worker.ts', import.meta.url),
		{
			type: 'module',
		},
	);
	w.addEventListener('message', (event: MessageEvent<WorkerResult>) => {
		const msg = event.data;
		const entry = pending.get(msg.id);
		if (!entry) return;
		pending.delete(msg.id);
		if (msg.ok && msg.bytes) {
			entry.resolve({
				bytes: new Uint8Array(msg.bytes),
				pageCount: msg.pageCount ?? 0,
				imagesTouched: msg.imagesTouched ?? 0,
			});
		} else {
			entry.reject(
				new Error(
					msg.error ?? 'PDF compression failed',
				),
			);
		}
	});
	w.addEventListener('error', (event) => {
		// A dead worker fails everything in flight; the next compress respawns it.
		for (const entry of pending.values())
			entry.reject(
				new Error(
					event.message ||
						'PDF compression worker error',
				),
			);
		pending.clear();
		worker?.terminate();
		worker = null;
	});
	worker = w;
	return w;
}

/**
 * Compress `input` in the worker. `input` is transferred (the caller must pass a
 * throwaway copy). Resolves with a fresh JS-owned buffer; rejects if MuPDF
 * cannot open the bytes as a PDF.
 */
export function compressPdf(
	input: ArrayBuffer,
	options: CompressOptions,
): Promise<CompressResult> {
	const w = ensureWorker();
	const id = nextId++;
	return new Promise<CompressResult>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		w.postMessage({ id, bytes: input, options }, [input]);
	});
}
