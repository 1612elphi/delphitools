/* Web Worker that hosts MuPDF off the main thread.
 *
 * Opening a PDF, walking its images, re-encoding them and saving are all
 * synchronous wasm calls; running them here keeps the tab responsive instead of
 * freezing it for the length of a compress. The main-thread client
 * (pdf-compress.ts) talks to this worker over the message protocol below.
 *
 * The ~10 MB mupdf runtime is loaded at RUNTIME through a bundler-ignored dynamic
 * import (the lib/jxl.ts idiom): mupdf.js is served from /public/mupdf/ and pulls
 * its sibling wasm relative to its own URL, so it never enters the module graph.
 */

import {
	resizeTo,
	STRUCTURAL_OPTIONS,
	type CompressOptions,
} from './pdf-compress-core';

// ── minimal typings for the mupdf objects this worker touches ────────────────

interface MupdfBuffer {
	asUint8Array(): Uint8Array;
	getLength(): number;
	destroy(): void;
}

interface MupdfPixmap {
	getWidth(): number;
	getHeight(): number;
	getNumberOfComponents(): number;
	warp(points: number[][], width: number, height: number): MupdfPixmap;
	asJPEG(quality: number, invertCmyk: boolean): Uint8Array;
	destroy(): void;
}

interface MupdfImage {
	toPixmap(): MupdfPixmap;
	destroy(): void;
}

interface MupdfObject {
	isStream(): boolean;
	isName(): boolean;
	isNull(): boolean;
	isBoolean(): boolean;
	asName(): string;
	asBoolean(): boolean;
	get(key: string): MupdfObject;
	put(key: string, value: unknown): void;
	delete(key: string): void;
	readRawStream(): MupdfBuffer;
	writeRawStream(buf: Uint8Array): void;
}

interface MupdfPdfDocument {
	countObjects(): number;
	countPages(): number;
	newIndirect(num: number): MupdfObject;
	newName(name: string): MupdfObject;
	loadImage(ref: MupdfObject): MupdfImage;
	subsetFonts(): void;
	saveToBuffer(options: Record<string, unknown>): MupdfBuffer;
	destroy(): void;
}

interface MupdfModule {
	PDFDocument: new (data: Uint8Array) => MupdfPdfDocument;
}

const MODULE_URL = '/mupdf/mupdf.js';

// See lib/jxl.ts for why the import goes through `new Function`: a literal
// specifier makes Rolldown resolve the /public path at build time (and fail),
// and the dev server otherwise tries to transform mupdf.js as an app module.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const rawImport = new Function('u', 'return import(u)') as (
	u: string,
) => Promise<MupdfModule>;

let modulePromise: Promise<MupdfModule> | null = null;

function getMupdf(): Promise<MupdfModule> {
	modulePromise ??= rawImport(MODULE_URL);
	return modulePromise;
}

/**
 * Re-encode every eligible image XObject as JPEG in place, returning how many
 * were replaced. Left untouched: 1-bit stencil masks, images that carry their
 * own soft mask (JPEG cannot hold alpha), anything MuPDF cannot decode, and any
 * image whose JPEG would not be smaller than the stream it already has.
 */
function recompressImages(
	doc: MupdfPdfDocument,
	quality: number,
	maxEdge: number,
): number {
	const count = doc.countObjects();
	let touched = 0;
	for (let num = 1; num < count; num++) {
		const ref = doc.newIndirect(num);
		if (!ref.isStream()) continue;
		const subtype = ref.get('Subtype');
		if (!subtype.isName() || subtype.asName() !== 'Image') continue;
		const imageMask = ref.get('ImageMask');
		if (imageMask.isBoolean() && imageMask.asBoolean()) continue;
		if (!ref.get('SMask').isNull()) continue;

		let image: MupdfImage | null = null;
		let pix: MupdfPixmap | null = null;
		let scaled: MupdfPixmap | null = null;
		try {
			image = doc.loadImage(ref);
			pix = image.toPixmap();
			const target = resizeTo(
				pix.getWidth(),
				pix.getHeight(),
				maxEdge,
			);
			const out = target
				? (scaled = pix.warp(
						[
							[0, 0],
							[pix.getWidth(), 0],
							[
								pix.getWidth(),
								pix.getHeight(),
							],
							[0, pix.getHeight()],
						],
						target.w,
						target.h,
					))
				: pix;

			const cmyk = out.getNumberOfComponents() === 4;
			const jpeg = out.asJPEG(quality, cmyk);
			const raw = ref.readRawStream();
			const originalLength = raw.getLength();
			raw.destroy();
			if (jpeg.length >= originalLength) continue;

			ref.writeRawStream(jpeg);
			ref.put('Filter', doc.newName('DCTDecode'));
			ref.put('Width', out.getWidth());
			ref.put('Height', out.getHeight());
			ref.put('BitsPerComponent', 8);
			ref.put(
				'ColorSpace',
				doc.newName(
					cmyk
						? 'DeviceCMYK'
						: out.getNumberOfComponents() ===
							  1
							? 'DeviceGray'
							: 'DeviceRGB',
				),
			);
			ref.delete('DecodeParms');
			touched++;
		} catch {
			// Unsupported codec (JPEG2000/JBIG2) or odd colour space: skip it.
		} finally {
			scaled?.destroy();
			pix?.destroy();
			image?.destroy();
		}
	}
	return touched;
}

// ── message protocol ─────────────────────────────────────────────────────────

interface InMessage {
	id: number;
	bytes: ArrayBuffer;
	options: CompressOptions;
}

type OutMessage =
	| {
			id: number;
			ok: true;
			bytes: ArrayBuffer;
			pageCount: number;
			imagesTouched: number;
	  }
	| { id: number; ok: false; error: string };

// A `/// <reference lib="webworker" />` would leak into the whole program and
// clash with lib.dom, so the worker global is typed locally instead.
declare const self: {
	onmessage: ((event: MessageEvent<InMessage>) => void) | null;
	postMessage(message: OutMessage, transfer?: Transferable[]): void;
};

self.onmessage = (event: MessageEvent<InMessage>) => {
	void handleMessage(event.data);
};

async function handleMessage(msg: InMessage): Promise<void> {
	try {
		const { PDFDocument } = await getMupdf();
		const doc = new PDFDocument(new Uint8Array(msg.bytes));
		let buffer: MupdfBuffer | null = null;
		try {
			const imagesTouched = msg.options.recompressImages
				? recompressImages(
						doc,
						Math.min(
							100,
							Math.max(
								1,
								Math.round(
									msg
										.options
										.quality,
								),
							),
						),
						Math.max(
							0,
							Math.round(
								msg.options
									.maxEdge,
							),
						),
					)
				: 0;
			doc.subsetFonts();
			buffer = doc.saveToBuffer(STRUCTURAL_OPTIONS);
			// asUint8Array is a view into the wasm heap; copy into a fresh,
			// transferable buffer before anything frees or grows the heap.
			const bytes = new Uint8Array(buffer.asUint8Array());
			self.postMessage(
				{
					id: msg.id,
					ok: true,
					bytes: bytes.buffer,
					pageCount: doc.countPages(),
					imagesTouched,
				},
				[bytes.buffer],
			);
		} finally {
			buffer?.destroy();
			doc.destroy();
		}
	} catch (err) {
		self.postMessage({ id: msg.id, ok: false, error: String(err) });
	}
}
