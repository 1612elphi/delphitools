import type { PandocConvertResult, PandocQueryOptions } from './pandoc-core';

// wasm exceeds deployment file limit
const WASM_URL = 'https://unpkg.com/pandoc-wasm@1.0.1/src/pandoc.wasm';

export type EngineState = 'idle' | 'loading' | 'ready' | 'error';

export interface LoadProgress {
	receivedBytes: number;
	totalBytes: number;
	ratio: number | null;
}

interface Pending {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let engineState: EngineState = 'idle';
let nextId = 1;
const pending = new Map<number, Pending>();

export function getEngineState(): EngineState {
	return engineState;
}

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL('./pandoc.worker.ts', import.meta.url), {
		type: 'module',
	});
	w.addEventListener('message', (event: MessageEvent) => {
		const msg = event.data as {
			type?: string;
			id: number;
			ok: boolean;
			data: unknown;
			error: string;
		};
		if (msg?.type !== 'result') return;
		const entry = pending.get(msg.id);
		if (!entry) return;
		pending.delete(msg.id);
		if (msg.ok) entry.resolve(msg.data);
		else entry.reject(new Error(msg.error));
	});
	worker = w;
	return w;
}

async function fetchWasm(
	onProgress?: (p: LoadProgress) => void,
): Promise<ArrayBuffer> {
	const res = await fetch(WASM_URL);
	if (!res.ok)
		throw new Error(
			`Could not download the pandoc engine (HTTP ${res.status}).`,
		);
	if (!res.body) return res.arrayBuffer();

	const totalBytes = Number(res.headers.get('content-length')) || 0;
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			received += value.length;
			onProgress?.({
				receivedBytes: received,
				totalBytes,
				// decoded bytes exceed header
				ratio:
					totalBytes > 0 && received <= totalBytes
						? received / totalBytes
						: null,
			});
		}
	}

	const out = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return decompressIfNeeded(out);
}

// supports compressed wasm responses
async function decompressIfNeeded(
	bytes: Uint8Array<ArrayBuffer>,
): Promise<ArrayBuffer> {
	const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
	if (!isGzip) return bytes.buffer;

	if (typeof DecompressionStream === 'undefined') {
		throw new Error(
			"This browser can't decompress the converter engine (no DecompressionStream). Please update your browser.",
		);
	}
	const stream = new Response(bytes).body!.pipeThrough(
		new DecompressionStream('gzip'),
	);
	return new Response(stream).arrayBuffer();
}

export function loadEngine(
	onProgress?: (p: LoadProgress) => void,
): Promise<void> {
	if (readyPromise) return readyPromise;

	readyPromise = (async () => {
		engineState = 'loading';
		try {
			const buffer = await fetchWasm(onProgress);
			const w = ensureWorker();
			await new Promise<void>((resolve, reject) => {
				const onMessage = (event: MessageEvent) => {
					const msg = event.data as {
						type?: string;
						error?: string;
					};
					if (msg?.type === 'ready') {
						w.removeEventListener(
							'message',
							onMessage,
						);
						resolve();
					} else if (msg?.type === 'init-error') {
						w.removeEventListener(
							'message',
							onMessage,
						);
						reject(new Error(msg.error));
					}
				};
				w.addEventListener('message', onMessage);
				w.postMessage({ type: 'init', wasm: buffer }, [
					buffer,
				]);
			});
			engineState = 'ready';
		} catch (err) {
			engineState = 'error';
			readyPromise = null;
			throw err;
		}
	})();

	return readyPromise;
}

function call<T>(payload: Record<string, unknown>): Promise<T> {
	const w = ensureWorker();
	const id = nextId++;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, {
			resolve: resolve as (v: unknown) => void,
			reject,
		});
		w.postMessage({ ...payload, id });
	});
}

export function convert(
	options: Record<string, unknown>,
	stdin: string | null,
	files: Record<string, Blob | string> = {},
): Promise<PandocConvertResult> {
	return call<PandocConvertResult>({
		type: 'convert',
		options,
		stdin,
		files,
	});
}

export function query<T = unknown>(options: PandocQueryOptions): Promise<T> {
	return call<T>({ type: 'query', options });
}

export function disposeEngine(): void {
	if (worker) {
		worker.terminate();
		worker = null;
	}
	pending.clear();
	readyPromise = null;
	engineState = 'idle';
}
