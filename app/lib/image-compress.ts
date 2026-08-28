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

let worker: Worker | null = null;
let seq = 0;

interface Pending {
	resolve: (blob: Blob) => void;
	reject: (error: Error) => void;
}

const pending = new Map<number, Pending>();

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker('/compress/compress-worker.js', {
			type: 'module',
		});
		worker.onmessage = (event: MessageEvent) => {
			const { id, ok, bytes, mime, error } = event.data as {
				id: number;
				ok: boolean;
				// blobpart requires arraybuffer
				bytes?: Uint8Array<ArrayBuffer>;
				mime?: string;
				error?: string;
			};
			const p = pending.get(id);
			if (!p) return;
			pending.delete(id);
			if (ok && bytes && mime)
				p.resolve(new Blob([bytes], { type: mime }));
			else p.reject(new Error(error ?? 'Compression failed'));
		};
		worker.onerror = (event) => {
			// worker errors reject pending
			for (const p of pending.values())
				p.reject(
					new Error(
						event.message ||
							'Compression worker error',
					),
				);
			pending.clear();
			worker?.terminate();
			worker = null;
		};
	}
	return worker;
}

export function compressImageData(
	imageData: ImageData,
	format: CompressFormat,
	{ quality = 75, level = 2 }: { quality?: number; level?: number } = {},
): Promise<Blob> {
	const id = seq++;
	const { promise, resolve, reject } = Promise.withResolvers<Blob>();
	pending.set(id, { resolve, reject });
	getWorker().postMessage({
		id,
		format,
		data: imageData.data,
		width: imageData.width,
		height: imageData.height,
		quality: Math.min(100, Math.max(1, Math.round(quality))),
		level: Math.min(6, Math.max(0, Math.round(level))),
	});
	return promise;
}
