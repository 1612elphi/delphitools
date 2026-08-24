// bypass bundler tracing

import { JXL_ENCODE_DEFAULTS } from './jxl-defaults';
import { rawImport } from 'delphitools-v2/lib/raw-import';

interface JxlEncoderModule {
	encode(
		data: Uint8ClampedArray,
		width: number,
		height: number,
		options: Record<string, unknown>,
	): Uint8Array | null;
}

const CODEC_URL = '/jxl/jxl_enc.js';

let modulePromise: Promise<JxlEncoderModule> | null = null;

export function getJxlModule(): Promise<JxlEncoderModule> {
	modulePromise ??= (async () => {
		const { default: factory } = await rawImport<{
			default: (opts: unknown) => Promise<JxlEncoderModule>;
		}>(CODEC_URL);
		return factory({
			noInitialRun: true,
			locateFile: (path: string) => `/jxl/${path}`,
		});
	})();
	return modulePromise;
}

export async function encodeJxl(
	canvas: HTMLCanvasElement,
	options: { quality: number; lossless: boolean },
): Promise<Blob> {
	const mod = await getJxlModule();
	const ctx = canvas.getContext('2d')!;
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const result = mod.encode(
		imageData.data,
		imageData.width,
		imageData.height,
		{
			...JXL_ENCODE_DEFAULTS,
			quality: options.lossless ? 100 : options.quality,
			lossless: options.lossless,
		},
	);
	if (!result) throw new Error('JXL encoding failed');
	// detach wasm memory
	return new Blob([new Uint8Array(result)], { type: 'image/jxl' });
}
