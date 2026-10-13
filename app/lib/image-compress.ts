/** worker assets bypass bundles. */

export type CompressFormat = 'mozjpeg' | 'webp' | 'oxipng' | 'avif';

export const COMPRESS_EXTENSIONS: Record<CompressFormat, string> = {
	mozjpeg: 'jpg',
	webp: 'webp',
	oxipng: 'png',
	avif: 'avif',
};

export const OPAQUE_FORMATS: CompressFormat[] = ['mozjpeg'];

/** oxipng ignores quality. */
export const QUALITY_FORMATS: CompressFormat[] = ['mozjpeg', 'webp', 'avif'];

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function savingsPercent(before: number, after: number): number {
	if (before <= 0) return 0;
	return Math.round(((after - before) / before) * 100);
}

/** a dead worker fires no event and posts no message (e.g. killed under
 *  memory pressure mid-wasm); past this budget the machine fails the
 *  request and recycles the worker instead of spinning forever. */
export const REQUEST_TIMEOUT_MS = 120_000;

/** avif legitimately encodes for minutes on large images. */
export const AVIF_TIMEOUT_MS = 600_000;

interface CompressResponse {
	id: number;
	ok: boolean;
	// blobpart requires arraybuffer
	bytes?: Uint8Array<ArrayBuffer>;
	mime?: string;
	error?: string;
}

interface EncodeRequest {
	id: number;
	format: CompressFormat;
	data: Uint8ClampedArray;
	width: number;
	height: number;
	quality: number;
	level: number;
}

interface Pending {
	resolve: (blob: Blob) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout> | undefined;
	timeoutMs: number;
}

/**
 * Worker lifecycle machine.
 *
 *   idle ──request──▶ ready ──request──▶ ready (reuse the live worker)
 *                      │ └──response──▶ ready (settle one request)
 *                      └──error/timeout──▶ idle
 *                          (recycle: reject everything, terminate)
 *
 * All worker and pending mutation lives in transition(); message handlers
 * and watchdog timers only dispatch events into it. 'recycling' is entered
 * and left inside a single synchronous transition (terminate() is atomic),
 * so no request can post to a half-dead worker.
 */
export function createCompressor({
	spawnWorker = defaultSpawn,
	requestTimeoutMs = REQUEST_TIMEOUT_MS,
}: {
	spawnWorker?: () => Worker;
	requestTimeoutMs?: number;
} = {}): {
	compressImageData: (
		imageData: ImageData,
		format: CompressFormat,
		options?: {
			quality?: number;
			level?: number;
			timeoutMs?: number;
		},
	) => Promise<Blob>;
} {
	let phase: 'idle' | 'ready' | 'recycling' = 'idle';
	let worker: Worker | null = null;
	let seq = 0;
	const pending = new Map<number, Pending>();

	function spawn(): void {
		worker = spawnWorker();
		worker.onmessage = (event: MessageEvent) =>
			transition({
				type: 'response',
				data: event.data as CompressResponse,
			});
		worker.onerror = (event: ErrorEvent) =>
			transition({
				type: 'error',
				message:
					event.message ||
					'Compression worker error',
			});
	}

	/** pull a request out of pending and disarm its watchdog */
	function take(id: number): Pending | undefined {
		const entry = pending.get(id);
		if (!entry) return undefined;
		pending.delete(id);
		if (entry.timer !== undefined) clearTimeout(entry.timer);
		return entry;
	}

	function recycle(reason: string): void {
		phase = 'recycling';
		for (const entry of pending.values()) {
			if (entry.timer !== undefined)
				clearTimeout(entry.timer);
			entry.reject(new Error(reason));
		}
		pending.clear();
		worker?.terminate();
		worker = null;
		phase = 'idle';
	}

	function transition(
		event:
			| { type: 'request'; request: EncodeRequest }
			| { type: 'response'; data: CompressResponse }
			| { type: 'error'; message: string }
			| { type: 'timeout'; id: number },
	): void {
		switch (event.type) {
			case 'request': {
				if (phase === 'idle' || !worker) {
					spawn();
					phase = 'ready';
				}
				worker!.postMessage(event.request);
				return;
			}
			case 'response': {
				if (phase !== 'ready') return; // stale traffic from a recycled worker
				const entry = take(event.data.id);
				if (!entry) return;
				const { ok, bytes, mime, error } = event.data;
				if (ok && bytes && mime)
					entry.resolve(
						new Blob([bytes], {
							type: mime,
						}),
					);
				else
					entry.reject(
						new Error(
							error ??
								'Compression failed',
						),
					);
				return;
			}
			case 'error': {
				if (phase !== 'ready') return;
				recycle(event.message);
				return;
			}
			case 'timeout': {
				if (phase !== 'ready') return;
				const entry = pending.get(event.id);
				if (!entry) return;
				recycle(
					`Compression timed out after ${Math.round(entry.timeoutMs / 1000)}s; encode worker recycled`,
				);
				return;
			}
		}
	}

	function compressImageData(
		imageData: ImageData,
		format: CompressFormat,
		{
			quality = 75,
			level = 2,
			timeoutMs = requestTimeoutMs,
		}: {
			quality?: number;
			level?: number;
			timeoutMs?: number;
		} = {},
	): Promise<Blob> {
		const id = seq++;
		const { promise, resolve, reject } =
			Promise.withResolvers<Blob>();
		const entry: Pending = {
			resolve,
			reject,
			timer: undefined,
			timeoutMs,
		};
		pending.set(id, entry);
		if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
			entry.timer = setTimeout(
				() => transition({ type: 'timeout', id }),
				timeoutMs,
			);
		}
		transition({
			type: 'request',
			request: {
				id,
				format,
				data: imageData.data,
				width: imageData.width,
				height: imageData.height,
				quality: Math.min(
					100,
					Math.max(1, Math.round(quality)),
				),
				level: Math.min(
					6,
					Math.max(0, Math.round(level)),
				),
			},
		});
		return promise;
	}

	return { compressImageData };
}

function defaultSpawn(): Worker {
	return new Worker('/compress/compress-worker.js', {
		type: 'module',
	});
}

const { compressImageData } = createCompressor();
export { compressImageData };
