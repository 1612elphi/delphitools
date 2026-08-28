const SHORT = 3;
const LONG = 4;

const IFD_OFFSET = 8;
const ENTRY_COUNT = 11;
const IFD_SIZE = 2 + ENTRY_COUNT * 12 + 4;
const BITS_OFFSET = IFD_OFFSET + IFD_SIZE;
const PIXEL_OFFSET = BITS_OFFSET + 8;

export function encodeTiff(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
): ArrayBuffer {
	const pixelBytes = width * height * 4;
	const buffer = new ArrayBuffer(PIXEL_OFFSET + pixelBytes);
	const view = new DataView(buffer);

	view.setUint8(0, 0x49);
	view.setUint8(1, 0x49);
	view.setUint16(2, 42, true);
	view.setUint32(4, IFD_OFFSET, true);

	view.setUint16(IFD_OFFSET, ENTRY_COUNT, true);
	let entry = IFD_OFFSET + 2;

	// tiff requires sorted tags
	const tag = (
		id: number,
		type: number,
		count: number,
		value: number,
	) => {
		view.setUint16(entry, id, true);
		view.setUint16(entry + 2, type, true);
		view.setUint32(entry + 4, count, true);
		if (type === SHORT && count === 1) {
			view.setUint16(entry + 8, value, true);
		} else {
			view.setUint32(entry + 8, value, true);
		}
		entry += 12;
	};

	tag(256, LONG, 1, width);
	tag(257, LONG, 1, height);
	// bits use an offset
	tag(258, SHORT, 4, BITS_OFFSET);
	// no compression
	tag(259, SHORT, 1, 1);
	// photometric rgb
	tag(262, SHORT, 1, 2);
	// strip offsets
	tag(273, LONG, 1, PIXEL_OFFSET);
	// samples per pixel
	tag(277, SHORT, 1, 4);
	// rows per strip
	tag(278, LONG, 1, height);
	// strip byte counts
	tag(279, LONG, 1, pixelBytes);
	// chunky planar layout
	tag(284, SHORT, 1, 1);
	// unassociated alpha
	tag(338, SHORT, 1, 2);

	// no more ifds
	view.setUint32(entry, 0, true);

	for (let i = 0; i < 4; i++) {
		view.setUint16(BITS_OFFSET + i * 2, 8, true);
	}

	new Uint8Array(buffer, PIXEL_OFFSET, pixelBytes).set(rgba);
	return buffer;
}
