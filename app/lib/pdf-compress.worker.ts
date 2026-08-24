// runs mupdf off-thread

import {
	resizeTo,
	STRUCTURAL_OPTIONS,
	type CompressOptions,
} from './pdf-compress-core';
import { rawImport } from 'delphitools-v2/lib/raw-import';

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

let modulePromise: Promise<MupdfModule> | null = null;

// loads mupdf outside bundling
function getMupdf(): Promise<MupdfModule> {
	modulePromise ??= rawImport<MupdfModule>(MODULE_URL);
	return modulePromise;
}

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
			// skips image decode failures
		} finally {
			scaled?.destroy();
			pix?.destroy();
			image?.destroy();
		}
	}
	return touched;
}

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

// avoids lib.dom conflict
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
			// copies wasm heap view
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
