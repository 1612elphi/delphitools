export interface IcoFrame {
	/** zero encodes 256. */
	size: number;
	data: Uint8Array;
}

const DIR_SIZE = 6;
const ENTRY_SIZE = 16;

export function buildIco(frames: IcoFrame[]): ArrayBuffer {
	const ordered = [...frames].sort((a, b) => a.size - b.size);
	const headerSize = DIR_SIZE + ordered.length * ENTRY_SIZE;
	const total = ordered.reduce((n, f) => n + f.data.length, headerSize);

	const buffer = new ArrayBuffer(total);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	view.setUint16(0, 0, true);
	view.setUint16(2, 1, true); // icon type
	view.setUint16(4, ordered.length, true);

	let offset = headerSize;

	ordered.forEach((frame, i) => {
		const entry = DIR_SIZE + i * ENTRY_SIZE;
		const dim = frame.size < 256 ? frame.size : 0;

		view.setUint8(entry, dim);
		view.setUint8(entry + 1, dim);
		view.setUint8(entry + 2, 0); // png palette count
		view.setUint8(entry + 3, 0);
		view.setUint16(entry + 4, 1, true); // colour planes
		view.setUint16(entry + 6, 32, true); // bits per pixel
		view.setUint32(entry + 8, frame.data.length, true);
		view.setUint32(entry + 12, offset, true);

		bytes.set(frame.data, offset);
		offset += frame.data.length;
	});

	return buffer;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
	const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}
