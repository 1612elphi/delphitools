export const MODEL_ID = 'briaai/RMBG-1.4';

// fp16 preserves edge detail
const DTYPE = 'fp16';

export type Device = 'webgpu' | 'wasm';

export interface LoadProgress {
	percent: number;
}

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

export async function loadRemover(
	onProgress: (progress: LoadProgress) => void,
): Promise<Remover> {
	const { pipeline, env } = await import('@huggingface/transformers');

	env.allowLocalModels = false;
	// disable unreliable ios cache
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
			dtype: DTYPE,
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
				// webgpu run can fail
				pipe.dispose?.();
				device = 'wasm';
				pipe = await build('wasm');
				return await pipe(image);
			}
		},
		dispose: () => pipe.dispose?.(),
	};
}

export function maskToCanvas(mask: MaskImage): HTMLCanvasElement {
	if (typeof mask.toCanvas === 'function') return mask.toCanvas();

	const canvas = document.createElement('canvas');
	canvas.width = mask.width;
	canvas.height = mask.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context');

	// expand grayscale to rgba
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
