/**
 * RMBG-1.4 background removal, through transformers.js.
 *
 * Everything here runs in the browser. The model weights are fetched from the
 * Hugging Face hub on first use and left to the browser's HTTP cache;
 * transformers.js has its own Cache API layer and it is switched off, because
 * it is unreliable on iOS Safari.
 *
 * The ONNX runtime is a different matter from the weights. transformers.js
 * falls back to a jsdelivr URL only when nothing has set `wasmPaths`, and a
 * bundler that can resolve the binary sets it: Rolldown emits
 * ort-wasm-simd-threaded.jsep.wasm into the build and rewrites the reference,
 * exactly as Turbopack does for the Next app. Both builds therefore self-host
 * the same 21.6 MB binary, byte for byte. Nothing here has to arrange that,
 * but a build that suddenly stops emitting it has silently moved the runtime
 * onto a CDN.
 *
 * The import is dynamic so none of this reaches the main bundle: it is roughly
 * 835 kB of JavaScript, plus that binary, before a single weight is
 * downloaded, and 55 tools that do not need it would otherwise pay for it.
 *
 * ponytail: inference runs on the main thread, so the wasm path janks. A
 * worker is the upgrade if that becomes the complaint.
 */

/**
 * RMBG-1.4, the same model Substrata's lib/substrata/bg-removal.ts uses, so
 * the two share hub files in the browser cache. Licence is CC BY-NC-ND and is
 * acknowledged in ACKNOWLEDGEMENTS.md.
 *
 * The Next tool carries a second "precise" mode behind a flag pinned to false,
 * waiting on RMBG-2.0 becoming public. It is not ported: the branch renders
 * nothing today, and the model id it names does not resolve.
 */
export const MODEL_ID = 'briaai/RMBG-1.4';

export type Device = 'webgpu' | 'wasm';

export interface LoadProgress {
	/** 0-100, only while weights are downloading. */
	percent: number;
}

/** The shape of a mask as transformers.js hands it back. */
interface MaskImage {
	width: number;
	height: number;
	data: Uint8Array | Uint8ClampedArray;
	toCanvas?: () => HTMLCanvasElement;
}

interface SegmentationResult {
	mask?: MaskImage;
}

export interface Remover {
	device: Device;
	segment: (image: string) => Promise<SegmentationResult[]>;
	dispose: () => void;
}

type Pipeline = ((image: string) => Promise<SegmentationResult[]>) & {
	dispose?: () => void;
};

/**
 * Builds the segmentation pipeline, preferring WebGPU.
 *
 * The fallback is tried on load failure and again on the first run: a pipeline
 * can compile on WebGPU and then fail inside OrtRun, which Substrata's port
 * hit and the standalone Next tool does not handle.
 */
export async function loadRemover(
	onProgress: (progress: LoadProgress) => void,
): Promise<Remover> {
	const { pipeline, env } = await import('@huggingface/transformers');

	env.allowLocalModels = false;
	env.useBrowserCache = false;

	const progress_callback = (event: {
		status: string;
		progress?: number;
	}) => {
		if (
			event.status === 'progress' &&
			event.progress !== undefined
		) {
			onProgress({ percent: Math.round(event.progress) });
		}
	};

	const build = async (device: Device) =>
		(await pipeline('image-segmentation', MODEL_ID, {
			device,
			dtype: 'fp32',
			progress_callback,
		})) as unknown as Pipeline;

	let device: Device = 'webgpu';
	let pipe: Pipeline;
	try {
		pipe = await build('webgpu');
	} catch {
		device = 'wasm';
		pipe = await build('wasm');
	}

	return {
		get device() {
			return device;
		},
		segment: async (image: string) => {
			try {
				return await pipe(image);
			} catch (error) {
				if (device === 'wasm') throw error;
				// Compiled on WebGPU, failed inside the run. Rebuild
				// once on wasm rather than surfacing a crash.
				pipe.dispose?.();
				device = 'wasm';
				pipe = await build('wasm');
				return await pipe(image);
			}
		},
		dispose: () => pipe.dispose?.(),
	};
}

/** A mask as a canvas, whatever shape transformers.js returned it in. */
export function maskToCanvas(mask: MaskImage): HTMLCanvasElement {
	if (typeof mask.toCanvas === 'function') return mask.toCanvas();

	const canvas = document.createElement('canvas');
	canvas.width = mask.width;
	canvas.height = mask.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context');

	// Single-channel grey, so each source byte fills one RGBA pixel.
	const image = ctx.createImageData(mask.width, mask.height);
	for (let i = 0; i < mask.data.length; i++) {
		const value = mask.data[i]!;
		image.data[i * 4] = value;
		image.data[i * 4 + 1] = value;
		image.data[i * 4 + 2] = value;
		image.data[i * 4 + 3] = 255;
	}
	ctx.putImageData(image, 0, 0);
	return canvas;
}

/**
 * The source image with the mask's red channel written into its alpha, as a
 * PNG data URL. The mask is scaled to the source, because the model works at
 * its own resolution.
 */
export function applyMask(
	source: HTMLImageElement,
	mask: HTMLCanvasElement,
): string {
	const { naturalWidth: width, naturalHeight: height } = source;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context');

	ctx.drawImage(source, 0, 0);
	const image = ctx.getImageData(0, 0, width, height);

	const scaled = document.createElement('canvas');
	scaled.width = width;
	scaled.height = height;
	const scaledCtx = scaled.getContext('2d');
	if (!scaledCtx) throw new Error('no 2d context');
	scaledCtx.drawImage(mask, 0, 0, width, height);
	const maskData = scaledCtx.getImageData(0, 0, width, height).data;

	for (let i = 0; i < image.data.length; i += 4) {
		image.data[i + 3] = maskData[i]!;
	}

	ctx.putImageData(image, 0, 0);
	return canvas.toDataURL('image/png');
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = 'anonymous';
		image.onload = () => resolve(image);
		image.onerror = () =>
			reject(new Error('image failed to decode'));
		image.src = src;
	});
}
