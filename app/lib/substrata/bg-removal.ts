import { getDB } from './db';
import { getRaster } from './raster-cache';
import { canvasToBlob } from './blobs';
import { getPersistenceEnabled } from './persistence-pref';

// birefnet buffer limit
const MODEL_ID = 'briaai/RMBG-1.4';

export type MatteDevice = 'webgpu' | 'wasm';

export interface MatteStatus {
	state: 'queued' | 'downloading' | 'processing' | 'done' | 'error';
	progress?: number;
	device?: MatteDevice;
	detail?: string;
}

const mattes = new Map<string, HTMLCanvasElement>();
const status = new Map<string, MatteStatus>();
let epoch = 0;
const listeners = new Set<() => void>();

const waitingDownload = new Set<string>();
let lastProgress = -1;

function notify(): void {
	for (const l of listeners) l();
}

function setStatus(hash: string, s: MatteStatus): void {
	status.set(hash, s);
	notify();
}

// increments after matte completion
export function matteEpoch(): number {
	return epoch;
}

export function subscribeMattes(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getMatte(hash: string): HTMLCanvasElement | undefined {
	return mattes.get(hash);
}

export function getMatteStatus(hash: string): MatteStatus | undefined {
	return status.get(hash);
}

export function putMatte(
	hash: string,
	matte: HTMLCanvasElement,
	device?: MatteDevice,
): void {
	mattes.set(hash, matte);
	setStatus(hash, { state: 'done', device });
	epoch++;
	notify();
}

// failures require manual retry
export function ensureMatte(hash: string): void {
	if (!hash || typeof document === 'undefined') return;
	if (mattes.has(hash) || status.has(hash)) return;
	setStatus(hash, { state: 'queued' });
	// limit inference memory
	chain = chain.then(() => bake(hash)).catch(() => undefined);
}

export function retryMatte(hash: string): void {
	if (status.get(hash)?.state !== 'error') return;
	status.delete(hash);
	ensureMatte(hash);
}

let chain: Promise<void> = Promise.resolve();

// narrow transformers pipeline type
type SegmentationPipeline = ((image: string) => Promise<unknown>) & {
	dispose?: () => Promise<void>;
};

interface DownloadProgress {
	status: string;
	progress?: number;
}

let pipePromise: Promise<{
	pipe: SegmentationPipeline;
	device: MatteDevice;
}> | null = null;

// skip failed webgpu
let forceWasm = false;

function loadPipeline(): NonNullable<typeof pipePromise> {
	if (!pipePromise) {
		pipePromise = (async () => {
			const { pipeline, env } =
				await import('@huggingface/transformers');
			env.allowLocalModels = false;
			// ios cache api fails
			env.useBrowserCache = false;
			const onProgress = (e: DownloadProgress) => {
				if (
					e.status !== 'progress' ||
					e.progress === undefined
				)
					return;
				const pct = Math.round(e.progress);
				if (pct === lastProgress) return;
				lastProgress = pct;
				for (const h of waitingDownload)
					setStatus(h, {
						state: 'downloading',
						progress: pct,
					});
			};
			// suppress ort dev overlay
			const session_options = {
				logSeverityLevel: 3,
			} as const;
			const forced =
				forceWasm ||
				!!localStorage.getItem('substrata:forceWasm');
			if (!forced) {
				try {
					const pipe = (await pipeline(
						'image-segmentation',
						MODEL_ID,
						{
							device: 'webgpu',
							dtype: 'fp32',
							progress_callback:
								onProgress,
							session_options,
						},
					)) as unknown as SegmentationPipeline;
					return {
						pipe,
						device: 'webgpu' as const,
					};
				} catch {
				}
			}
			const pipe = (await pipeline(
				'image-segmentation',
				MODEL_ID,
				{
					device: 'wasm',
					dtype: 'fp32',
					progress_callback: onProgress,
					session_options,
				},
			)) as unknown as SegmentationPipeline;
			return { pipe, device: 'wasm' as const };
		})().catch((err) => {
			// allow pipeline retries
			pipePromise = null;
			throw err;
		});
	}
	return pipePromise;
}

async function rebuildPipelineAsWasm(): Promise<{
	pipe: SegmentationPipeline;
	device: MatteDevice;
}> {
	forceWasm = true;
	const old = await pipePromise?.catch(() => null);
	void old?.pipe.dispose?.();
	pipePromise = null;
	return loadPipeline();
}

async function bake(hash: string): Promise<void> {
	try {
		if (await hydrateMatte(hash)) {
			putMatte(hash, mattes.get(hash)!);
			return;
		}
		const src = getRaster(hash);
		if (!src) {
			// retry after raster decode
			status.delete(hash);
			notify();
			return;
		}
		waitingDownload.add(hash);
		setStatus(hash, { state: 'downloading', progress: 0 });
		let { pipe, device } = await loadPipeline();
		waitingDownload.delete(hash);
		setStatus(hash, { state: 'processing', device });
		const url = URL.createObjectURL(await canvasToBlob(src));
		let result: unknown;
		try {
			try {
				result = await pipe(url);
			} catch (runErr) {
				if (device === 'wasm') throw runErr;
				waitingDownload.add(hash);
				setStatus(hash, {
					state: 'downloading',
					progress: 0,
				});
				({ pipe, device } =
					await rebuildPipelineAsWasm());
				waitingDownload.delete(hash);
				setStatus(hash, {
					state: 'processing',
					device,
				});
				result = await pipe(url);
			}
		} finally {
			URL.revokeObjectURL(url);
		}
		const mask = (result as { mask?: unknown }[] | undefined)?.[0]
			?.mask;
		if (!mask) throw new Error('segmentation returned no mask');
		const matte = matteFromMask(mask, src.width, src.height);
		putMatte(hash, matte, device);
		void persistMatte(hash, matte);
	} catch (err) {
		waitingDownload.delete(hash);
		setStatus(hash, {
			state: 'error',
			detail:
				err instanceof Error
					? err.message
					: String(err),
		});
	}
}

function matteFromMask(mask: unknown, w: number, h: number): HTMLCanvasElement {
	const m = mask as {
		width: number;
		height: number;
		data?: Uint8Array | Uint8ClampedArray;
		toCanvas?: () => HTMLCanvasElement;
	};
	const mw = m.width;
	const mh = m.height;
	const alpha = document.createElement('canvas');
	alpha.width = mw;
	alpha.height = mh;
	const actx = alpha.getContext('2d')!;
	const id = actx.createImageData(mw, mh);
	if (m.data && m.data.length >= mw * mh) {
		const channels = Math.round(m.data.length / (mw * mh));
		for (let i = 0; i < mw * mh; i++)
			id.data[i * 4 + 3] = m.data[i * channels]!;
	} else if (typeof m.toCanvas === 'function') {
		const px = m
			.toCanvas()
			.getContext('2d')!
			.getImageData(0, 0, mw, mh).data;
		for (let i = 0; i < mw * mh; i++)
			id.data[i * 4 + 3] = px[i * 4]!;
	} else {
		throw new Error('unrecognised mask shape');
	}
	actx.putImageData(id, 0, 0);
	if (mw === w && mh === h) return alpha;
	const scaled = document.createElement('canvas');
	scaled.width = w;
	scaled.height = h;
	scaled.getContext('2d')!.drawImage(alpha, 0, 0, w, h);
	return scaled;
}

// reads ignore persistence

async function persistMatte(
	hash: string,
	matte: HTMLCanvasElement,
): Promise<void> {
	if (typeof indexedDB === 'undefined' || !getPersistenceEnabled())
		return;
	try {
		const db = getDB();
		if (await db.mattes.get(hash)) return;
		await db.mattes.put({
			hash,
			blob: await canvasToBlob(matte),
			createdAt: Date.now(),
		});
	} catch {
		// ignore cache failures
	}
}

async function hydrateMatte(hash: string): Promise<boolean> {
	if (typeof indexedDB === 'undefined') return false;
	try {
		const rec = await getDB().mattes.get(hash);
		if (!rec) return false;
		const bitmap = await createImageBitmap(rec.blob);
		const c = document.createElement('canvas');
		c.width = bitmap.width;
		c.height = bitmap.height;
		c.getContext('2d')!.drawImage(bitmap, 0, 0);
		bitmap.close();
		mattes.set(hash, c);
		return true;
	} catch {
		return false;
	}
}
