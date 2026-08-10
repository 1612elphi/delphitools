/**
 * Remove Background (M7) — an async, non-destructive bake. RMBG-1.4 (the
 * background-remover tool's proven model — see the MODEL_ID note) via
 * @huggingface/transformers v4 produces a grayscale matte per raster SOURCE,
 * keyed by the layer's content blobHash: same pixels ⇒ same matte, a destructive edit repoints the hash
 * and re-bakes automatically, and undo snapshots keep rendering off the old
 * cached matte. The matte lives in a canvas's ALPHA channel so EffectsImage
 * can `destination-in` it onto the layer content at composite time — the
 * original RGBA is never touched and the header switch restores instantly.
 *
 * Hosting is Ruby's ratified call (2026-07-08): reuse the background-remover
 * tool's system — runtime fetch from the HF hub through the browser HTTP
 * cache (no self-hosted weights; Cache API off, it's unreliable on iOS
 * Safari), on the SAME transformers v3 the tool uses (v4 dropped RMBG-1.4's
 * model class from image-segmentation, and v4's only draw — BiRefNet — is
 * unrunnable in-browser; the v4 alias came and went 2026-07-08). WebGPU fp32
 * first; single-thread WASM fp32 fallback, engaged at LOAD time or at RUN
 * time (a pipeline can compile yet fail inside OrtRun).
 *
 * Store shape follows lut-data.ts: matteEpoch() bumps only when a matte
 * ARRIVES (EffectsImage mixes it into its cache-dirty check so cutouts pop
 * in); listeners fire on every status change (the FX panel shows progress).
 * Fabric-free on purpose — the panel imports this outside the canvas
 * boundary.
 *
 * ponytail: inference runs serially on the main thread (the WebGPU path is
 * async anyway; the WASM fallback janks) — a dedicated worker is the upgrade
 * path if fallback jank matters.
 */

import { getDB } from './db';
import { getRaster } from './raster-cache';
import { canvasToBlob } from './blobs';
import { getPersistenceEnabled } from './persistence-pref';

// RMBG-1.4 — the SAME model the standalone background-remover tool ships
// (proven on webgpu AND wasm in this stack; the browser HTTP cache is shared
// between tool and editor since both fetch the same hub files). Licence:
// CC BY-NC-ND, acknowledged in ACKNOWLEDGEMENTS.md — Ruby's 2026-07-08 call.
// BiRefNet-lite was tried first and is unrunnable in-browser today: WebGPU
// trips maxStorageBuffersPerShaderStage (11 > 10 on Apple silicon) and its
// static-1024² graph exhausts the wasm heap (std::bad_alloc, fp32 AND fp16,
// ORT 1.26-dev and 1.27 alike).
const MODEL_ID = 'briaai/RMBG-1.4';

export type MatteDevice = 'webgpu' | 'wasm';

export interface MatteStatus {
	state: 'queued' | 'downloading' | 'processing' | 'done' | 'error';
	/** model download %, only while downloading */
	progress?: number;
	device?: MatteDevice;
	/** technical error detail (Error.message) — data, not authored copy */
	detail?: string;
}

const mattes = new Map<string, HTMLCanvasElement>();
const status = new Map<string, MatteStatus>();
let epoch = 0;
const listeners = new Set<() => void>();

/** hashes whose bake is waiting on the shared model download */
const waitingDownload = new Set<string>();
let lastProgress = -1;

function notify(): void {
	for (const l of listeners) l();
}

function setStatus(hash: string, s: MatteStatus): void {
	status.set(hash, s);
	notify();
}

/** Bumped only when a matte finishes — EffectsImage compares it in
 *  isCacheDirty so the cutout recomposites exactly once per arrival. */
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

/** Inject a finished matte directly (the bake path lands here; also the dev
 *  rig's test seam — the verify harness composites without running the model). */
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

/**
 * Kick off (idempotent) the async bake of one source's matte. Errors are
 * sticky — a failed hash does NOT auto-retry (drawObject kicks every
 * composite; looping a failed 90 MB model fetch would be hostile). The FX
 * panel's retry goes through retryMatte.
 */
export function ensureMatte(hash: string): void {
	if (!hash || typeof document === 'undefined') return;
	if (mattes.has(hash) || status.has(hash)) return;
	setStatus(hash, { state: 'queued' });
	// serial queue — one inference at a time keeps peak memory sane
	chain = chain.then(() => bake(hash)).catch(() => undefined);
}

/** Clear a sticky error and re-kick. */
export function retryMatte(hash: string): void {
	if (status.get(hash)?.state !== 'error') return;
	status.delete(hash);
	ensureMatte(hash);
}

let chain: Promise<void> = Promise.resolve();

/**
 * What this file uses of a transformers.js segmentation pipeline. The library's
 * own type is a union across every dtype and device and does not narrow
 * usefully; `lib/bg-removal.ts` names the same shape for the same reason.
 */
type SegmentationPipeline = ((image: string) => Promise<unknown>) & {
	dispose?: () => Promise<void>;
};

interface DownloadProgress {
	status: string;
	progress?: number;
}

// The pipeline singleton — module-lifetime so re-bakes skip the load.
let pipePromise: Promise<{
	pipe: SegmentationPipeline;
	device: MatteDevice;
}> | null = null;

/** Set after a WebGPU RUNTIME failure — WebGPU pipelines can compile fine yet
 *  fail inside OrtRun (BiRefNet-lite trips maxStorageBuffersPerShaderStage,
 *  11 > 10, on real adapters). Sticky for the session so every later bake
 *  goes straight to WASM instead of failing the same way. */
let forceWasm = false;

function loadPipeline(): NonNullable<typeof pipePromise> {
	if (!pipePromise) {
		pipePromise = (async () => {
			const { pipeline, env } =
				await import('@huggingface/transformers');
			env.allowLocalModels = false;
			// Browser HTTP cache instead of the Cache API — unreliable on iOS
			// Safari (the background-remover call, carried over).
			env.useBrowserCache = false;
			const onProgress = (e: DownloadProgress) => {
				if (
					e.status !== 'progress' ||
					e.progress === undefined
				)
					return;
				const pct = Math.round(e.progress);
				if (pct === lastProgress) return; // don't flood renders per byte-tick
				lastProgress = pct;
				for (const h of waitingDownload)
					setStatus(h, {
						state: 'downloading',
						progress: pct,
					});
			};
			// fp32 on both devices — mirrors the v3 tool's field-proven config.
			// The localStorage flag is a QA escape hatch to force the CPU path.
			// logSeverityLevel 3 = errors only: ORT's W-level EP-assignment notes
			// otherwise land on console.error and trip the Next dev overlay.
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
					// load-time WebGPU failure — fall through to WASM below
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
			pipePromise = null; // a failed load may be transient (offline) — retry can rebuild
			throw err;
		});
	}
	return pipePromise;
}

/** Tear down the (broken) WebGPU pipeline and rebuild on WASM. */
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
		// persisted matte from an earlier session?
		if (await hydrateMatte(hash)) {
			putMatte(hash, mattes.get(hash)!);
			return;
		}
		const src = getRaster(hash);
		if (!src) {
			// source not decoded yet — drop the marker so a later kick retries
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
				// WebGPU ran aground at inference time (shader storage-buffer limits
				// etc.) — rebuild on WASM (fp32 weights re-fetch shows as download)
				// and retry this bake once.
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

/** Normalise the model's mask output into an ALPHA-channel canvas scaled to
 *  the source's pixel size (mask value → alpha, RGB left black — only alpha
 *  matters to destination-in). Handles the RawImage raw-data shape and the
 *  toCanvas fallback, the two cases this pipeline type actually produces
 *  (background-remover.tsx precedent). */
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
			id.data[i * 4 + 3] = px[i * 4]!; // grayscale rides in red
	} else {
		throw new Error('unrecognised mask shape');
	}
	actx.putImageData(id, 0, 0);
	if (mw === w && mh === h) return alpha;
	const scaled = document.createElement('canvas');
	scaled.width = w;
	scaled.height = h;
	scaled.getContext('2d')!.drawImage(alpha, 0, 0, w, h); // bilinear alpha upscale
	return scaled;
}

// ── IndexedDB matte cache (dexie v3 `mattes`) ────────────────────────────────
// Writes ride the persistence opt-in like every other IDB write; reads are
// unconditional (the table is simply empty when persistence was never on).

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
		// best-effort cache — quota/private-mode failures are non-fatal
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
