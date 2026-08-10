// libjxl (the emscripten build from @jsquash/jxl) copied verbatim into
// /public/jxl/ — jxl_enc.js + jxl_enc.wasm, re-copy from
// node_modules/@jsquash/jxl/codec/enc/ on a version bump.
//
// Loaded at RUNTIME through a bundler-ignored dynamic import so the emscripten
// glue never enters the module graph. The Next app needs this because Turbopack
// deadlocks trying to trace it; Vite would merely fail to resolve the absolute
// path at build time, but the outcome is the same and the codec is served
// as-is either way. `/* @vite-ignore */` is Vite's spelling of the magic
// comment that `webpackIgnore`/`turbopackIgnore` provide elsewhere.
//
// locateFile points the codec at the self-hosted wasm. This single-threaded
// build needs no SharedArrayBuffer, so the static export needs no COOP/COEP
// headers.

import { JXL_ENCODE_DEFAULTS } from './jxl-defaults';

interface JxlEncoderModule {
	encode(
		data: Uint8ClampedArray,
		width: number,
		height: number,
		options: Record<string, unknown>,
	): Uint8Array | null;
}

const CODEC_URL = '/jxl/jxl_enc.js';

// Vite needs more persuasion than webpack here. `/* @vite-ignore */` only
// suppresses analysis of a NON-literal specifier: written inline as a string,
// Rolldown still resolves it and the build fails with UNRESOLVED_IMPORT. Moving
// it to a variable fixes the build, but the dev server then rewrites the
// request to `/jxl/jxl_enc.js?import` and tries to transform the emscripten
// glue as an ES module, which fails.
//
// Building the import through `new Function` keeps it out of Vite's transform
// in both modes, so dev and production take the same path. Safe here because
// the URL is a constant, and the static export sets no CSP that would block it.
// The body is a fixed literal and the only argument is the CODEC_URL constant
// above; nothing reaches this from user input.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const rawImport = new Function('u', 'return import(u)') as (
	u: string,
) => Promise<{ default: (opts: unknown) => Promise<JxlEncoderModule> }>;

let modulePromise: Promise<JxlEncoderModule> | null = null;

export function getJxlModule(): Promise<JxlEncoderModule> {
	modulePromise ??= (async () => {
		const { default: factory } = await rawImport(CODEC_URL);
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
	// Copy out of the WASM heap into a standalone buffer.
	return new Blob([new Uint8Array(result)], { type: 'image/jxl' });
}
