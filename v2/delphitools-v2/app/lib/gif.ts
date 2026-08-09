// Single-frame GIF89a: median-cut palette, then LZW as specified in the GIF89a
// spec, section 22 (Table Based Image Data) and appendix F. The Next app gets
// both halves from `gifenc`, which is not installed here.
//
// ponytail: one frame, no dithering, no interlacing, and the palette is a plain
// median cut rather than gifenc's. A photo at 256 colours looks like a photo at
// 256 colours; banding on a smooth gradient is the visible ceiling, and
// Floyd-Steinberg over `indices` is where that would be fixed.

export type GifQuantisation = 'rgb565' | 'rgb444' | 'rgba4444';

/** Channel masks per mode, matching the precision each name claims. */
const MASKS: Record<GifQuantisation, [number, number, number]> = {
	rgb565: [0xf8, 0xfc, 0xf8],
	rgb444: [0xf0, 0xf0, 0xf0],
	rgba4444: [0xf0, 0xf0, 0xf0],
};

/** GIF alpha is one bit. Anything below this becomes the transparent index. */
const ALPHA_CUTOFF = 128;

const MAX_CODE = 4096;

interface Bucket {
	r: number;
	g: number;
	b: number;
	count: number;
}

/** A growable byte sink; the LZW stream is not sized until it is written. */
class Bytes {
	#buf = new Uint8Array(4096);
	#len = 0;

	push(byte: number) {
		this.#grow(1);
		this.#buf[this.#len++] = byte;
	}

	pushAll(src: ArrayLike<number>) {
		this.#grow(src.length);
		this.#buf.set(src, this.#len);
		this.#len += src.length;
	}

	get bytes(): Uint8Array<ArrayBuffer> {
		return this.#buf.subarray(0, this.#len);
	}

	#grow(extra: number) {
		if (this.#len + extra <= this.#buf.length) return;
		let size = this.#buf.length * 2;
		while (size < this.#len + extra) size *= 2;
		const next = new Uint8Array(size);
		next.set(this.#buf.subarray(0, this.#len));
		this.#buf = next;
	}
}

function channel(bucket: Bucket, axis: number): number {
	return axis === 0 ? bucket.r : axis === 1 ? bucket.g : bucket.b;
}

/** The axis with the widest spread, and that spread. */
function widestAxis(box: Bucket[]): [number, number] {
	let axis = 0;
	let widest = 0;
	for (let a = 0; a < 3; a++) {
		let lo = 255;
		let hi = 0;
		for (const bucket of box) {
			const v = channel(bucket, a);
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		if (hi - lo > widest) {
			widest = hi - lo;
			axis = a;
		}
	}
	return [axis, widest];
}

/**
 * Repeatedly split the box with the widest colour spread at its pixel-count
 * median, until there are `target` boxes or nothing left worth splitting.
 */
function medianCut(buckets: Bucket[], target: number): Bucket[][] {
	const boxes: Bucket[][] = [buckets];

	while (boxes.length < target) {
		let chosen = -1;
		let chosenAxis = 0;
		let widest = 0;

		for (let i = 0; i < boxes.length; i++) {
			const box = boxes[i]!;
			if (box.length < 2) continue;
			const [axis, spread] = widestAxis(box);
			if (spread > widest) {
				widest = spread;
				chosen = i;
				chosenAxis = axis;
			}
		}
		if (chosen < 0) break;

		const box = boxes[chosen]!;
		box.sort(
			(a, b) =>
				channel(a, chosenAxis) - channel(b, chosenAxis),
		);

		const total = box.reduce(
			(sum, bucket) => sum + bucket.count,
			0,
		);
		let seen = 0;
		let split = 1;
		for (let i = 0; i < box.length - 1; i++) {
			seen += box[i]!.count;
			if (seen * 2 >= total) {
				split = i + 1;
				break;
			}
		}

		boxes.splice(chosen, 1, box.slice(0, split), box.slice(split));
	}

	return boxes;
}

interface Quantised {
	palette: number[];
	indices: Uint8Array;
	transparentIndex: number | null;
	tableSize: number;
}

function quantise(
	rgba: Uint8ClampedArray,
	pixels: number,
	maxColours: number,
	mode: GifQuantisation,
): Quantised {
	const [mr, mg, mb] = MASKS[mode];
	const alphaAware = mode === 'rgba4444';

	const histogram = new Map<number, Bucket>();
	let anyTransparent = false;

	for (let p = 0; p < pixels; p++) {
		const i = p * 4;
		if (alphaAware && rgba[i + 3]! < ALPHA_CUTOFF) {
			anyTransparent = true;
			continue;
		}
		const r = rgba[i]! & mr;
		const g = rgba[i + 1]! & mg;
		const b = rgba[i + 2]! & mb;
		const key = (r << 16) | (g << 8) | b;
		const bucket = histogram.get(key);
		if (bucket) bucket.count++;
		else histogram.set(key, { r, g, b, count: 1 });
	}

	const wanted = Math.max(1, maxColours - (anyTransparent ? 1 : 0));
	const boxes =
		histogram.size === 0
			? [[{ r: 0, g: 0, b: 0, count: 1 }]]
			: medianCut([...histogram.values()], wanted);

	const palette: number[] = [];
	const colourToIndex = new Map<number, number>();

	boxes.forEach((box, index) => {
		let weight = 0;
		let r = 0;
		let g = 0;
		let b = 0;
		for (const bucket of box) {
			weight += bucket.count;
			r += bucket.r * bucket.count;
			g += bucket.g * bucket.count;
			b += bucket.b * bucket.count;
			colourToIndex.set(
				(bucket.r << 16) | (bucket.g << 8) | bucket.b,
				index,
			);
		}
		palette.push(
			Math.round(r / weight),
			Math.round(g / weight),
			Math.round(b / weight),
		);
	});

	const transparentIndex = anyTransparent ? boxes.length : null;
	const needed = boxes.length + (anyTransparent ? 1 : 0);

	// The colour table field encodes 2^(N+1) entries, and the LZW minimum code
	// size must be at least 2, so the smallest usable table is four.
	let tableSize = 4;
	while (tableSize < needed) tableSize *= 2;

	const indices = new Uint8Array(pixels);
	for (let p = 0; p < pixels; p++) {
		const i = p * 4;
		if (transparentIndex !== null && rgba[i + 3]! < ALPHA_CUTOFF) {
			indices[p] = transparentIndex;
			continue;
		}
		const key =
			((rgba[i]! & mr) << 16) |
			((rgba[i + 1]! & mg) << 8) |
			(rgba[i + 2]! & mb);
		indices[p] = colourToIndex.get(key) ?? 0;
	}

	return { palette, indices, transparentIndex, tableSize };
}

/** Variable-width LZW, codes packed least-significant bit first. */
function lzw(
	indices: Uint8Array,
	minCodeSize: number,
): Uint8Array<ArrayBuffer> {
	const clearCode = 1 << minCodeSize;
	const endCode = clearCode + 1;
	const out = new Bytes();

	let codeSize = minCodeSize + 1;
	let next = endCode + 1;
	let table = new Map<number, number>();

	let accumulator = 0;
	let bits = 0;

	const emit = (code: number) => {
		accumulator |= code << bits;
		bits += codeSize;
		while (bits >= 8) {
			out.push(accumulator & 0xff);
			accumulator >>= 8;
			bits -= 8;
		}
	};

	emit(clearCode);

	let prefix = indices[0]!;
	for (let i = 1; i < indices.length; i++) {
		const suffix = indices[i]!;
		const key = (prefix << 8) | suffix;
		const known = table.get(key);
		if (known !== undefined) {
			prefix = known;
			continue;
		}
		emit(prefix);
		if (next === MAX_CODE) {
			emit(clearCode);
			table = new Map();
			next = endCode + 1;
			codeSize = minCodeSize + 1;
		} else {
			table.set(key, next++);
			if (next > 1 << codeSize && codeSize < 12) codeSize++;
		}
		prefix = suffix;
	}

	emit(prefix);
	emit(endCode);
	if (bits > 0) out.push(accumulator & 0xff);

	return out.bytes;
}

export function encodeGif(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	maxColours: number,
	mode: GifQuantisation,
): Uint8Array<ArrayBuffer> {
	const { palette, indices, transparentIndex, tableSize } = quantise(
		rgba,
		width * height,
		Math.max(2, Math.min(256, Math.round(maxColours))),
		mode,
	);

	const out = new Bytes();
	out.pushAll([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"

	const sizeField = Math.log2(tableSize) - 1;
	out.pushAll([
		width & 0xff,
		width >> 8,
		height & 0xff,
		height >> 8,
		0x80 | (7 << 4) | sizeField, // global colour table, 8-bit source
		0, // background index
		0, // no pixel aspect ratio
	]);

	out.pushAll(palette);
	for (let i = palette.length; i < tableSize * 3; i++) out.push(0);

	if (transparentIndex !== null) {
		out.pushAll([
			0x21,
			0xf9,
			0x04,
			0x01,
			0,
			0,
			transparentIndex,
			0,
		]);
	}

	out.pushAll([
		0x2c,
		0,
		0,
		0,
		0, // image position
		width & 0xff,
		width >> 8,
		height & 0xff,
		height >> 8,
		0, // no local colour table, not interlaced
	]);

	const minCodeSize = Math.log2(tableSize);
	out.push(minCodeSize);

	const data = lzw(indices, minCodeSize);
	for (let i = 0; i < data.length; i += 255) {
		const chunk = data.subarray(i, i + 255);
		out.push(chunk.length);
		out.pushAll(chunk);
	}
	out.push(0); // block terminator
	out.push(0x3b); // trailer

	return out.bytes;
}
