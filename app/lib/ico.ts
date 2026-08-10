/**
 * ICO container around PNG frames.
 *
 * Layout is a 6-byte ICONDIR, one 16-byte ICONDIRENTRY per frame, then the
 * frame data. Storing PNG rather than BMP inside an ICO is Windows Vista and
 * later; every browser reads it.
 */

export interface IcoFrame {
	/** Square edge in pixels. 256 is written as 0; larger cannot be encoded. */
	size: number;
	data: Uint8Array;
}

const DIR_SIZE = 6;
const ENTRY_SIZE = 16;

/** Frames are written smallest first; the input order does not matter. */
export function buildIco(frames: IcoFrame[]): ArrayBuffer {
	const ordered = [...frames].sort((a, b) => a.size - b.size);
	const headerSize = DIR_SIZE + ordered.length * ENTRY_SIZE;
	const total = ordered.reduce((n, f) => n + f.data.length, headerSize);

	const buffer = new ArrayBuffer(total);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	view.setUint16(0, 0, true);
	view.setUint16(2, 1, true); // 1 = icon, 2 = cursor
	view.setUint16(4, ordered.length, true);

	let offset = headerSize;

	ordered.forEach((frame, i) => {
		const entry = DIR_SIZE + i * ENTRY_SIZE;
		// The width and height fields are one byte, so 256 wraps to 0 by
		// definition. Callers pass 16 to 64.
		const dim = frame.size < 256 ? frame.size : 0;

		view.setUint8(entry, dim);
		view.setUint8(entry + 1, dim);
		view.setUint8(entry + 2, 0); // palette entries, 0 for PNG
		view.setUint8(entry + 3, 0); // reserved
		view.setUint16(entry + 4, 1, true); // colour planes
		view.setUint16(entry + 6, 32, true); // bits per pixel
		view.setUint32(entry + 8, frame.data.length, true);
		view.setUint32(entry + 12, offset, true);

		bytes.set(frame.data, offset);
		offset += frame.data.length;
	});

	return buffer;
}

/** The bytes behind a `data:<type>;base64,<payload>` URL. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
	const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}
