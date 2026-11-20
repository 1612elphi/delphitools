import { channel } from 'delphitools-v2/lib/channel';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import type { ImageAsset } from 'delphitools-v2/lib/errata/write/types';

/** Ids that are safe as zip entry names. */
export const IMAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGES_BYTES = 128 * 1024 * 1024;
/** Larger sides are scaled down on insert. */
export const MAX_INSERT_SIDE = 4000;
// opened image side pixels
const MAX_SIDE = 20000;
// 160 MB of rgba
const MAX_AREA = 40e6;
/** css px to pt */
export const PX_PT = 0.75;
// smallest decoded bitmap width
const MIN_BUCKET = 64;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const be32 = (b: Uint8Array, i: number) =>
	((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>>
	0;

function jpegSize(b: Uint8Array): [number, number] | null {
	let i = 2;
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) return null;
		const m = b[i + 1]!;
		if (m === 0xff) {
			i++;
			continue;
		}
		// standalone markers
		if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
			i += 2;
			continue;
		}
		// SOF markers, no DHT/DAC
		if (
			m >= 0xc0 &&
			m <= 0xcf &&
			m !== 0xc4 &&
			m !== 0xc8 &&
			m !== 0xcc
		)
			return [be16(b, i + 7), be16(b, i + 5)];
		i += 2 + be16(b, i + 2);
	}
	return null;
}

/** The EXIF orientation of a JPEG, 1 when it has none. */
export function jpegOrientation(b: Uint8Array): number {
	let i = 2;
	while (i + 4 < b.length && b[i] === 0xff) {
		const m = b[i + 1]!;
		const len = be16(b, i + 2);
		// scan start ends metadata
		if (m === 0xda) break;
		const t = i + 10;
		if (
			m === 0xe1 &&
			b[i + 4] === 0x45 &&
			b[i + 5] === 0x78 &&
			b[i + 6] === 0x69 &&
			b[i + 7] === 0x66 &&
			t + 8 < b.length
		) {
			const le = b[t] === 0x49;
			const u16 = (at: number) =>
				le ? b[at]! | (b[at + 1]! << 8) : be16(b, at);
			const u32 = (at: number) =>
				le
					? (u16(at) | (u16(at + 2) << 16)) >>> 0
					: be32(b, at);
			const ifd = t + u32(t + 4);
			const n = ifd + 2 <= b.length ? u16(ifd) : 0;
			for (let e = 0; e < n; e++) {
				const at = ifd + 2 + e * 12;
				if (at + 10 > b.length) break;
				if (u16(at) === 0x0112) return u16(at + 8);
			}
			return 1;
		}
		i += 2 + len;
	}
	return 1;
}

/** PNG or JPEG by magic bytes, with the header size when it reads. */
export function headerOf(
	bytes: Uint8Array,
): { mime: ImageAsset['mime']; size: [number, number] | null } | null {
	if (bytes.length >= 24 && PNG.every((v, i) => bytes[i] === v))
		return {
			mime: 'image/png',
			size: [be32(bytes, 16), be32(bytes, 20)],
		};
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
		return { mime: 'image/jpeg', size: jpegSize(bytes) };
	return null;
}

/** A PNG or JPEG by its magic bytes and header size; null for anything else or a size or pixel area out of range. */
export function sniffImage(bytes: Uint8Array): ImageAsset | null {
	const head = headerOf(bytes);
	if (!head?.size) return null;
	const [width, height] = head.size;
	if (!(
		width >= 1 &&
		height >= 1 &&
		width <= MAX_SIDE &&
		height <= MAX_SIDE &&
		width * height <= MAX_AREA
	))
		return null;
	return { mime: head.mime, bytes, width, height };
}

async function encode(
	bitmap: ImageBitmap,
	w: number,
	h: number,
	type: ImageAsset['mime'],
): Promise<ImageAsset | null> {
	const canvas = new OffscreenCanvas(w, h);
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
	const blob = await canvas.convertToBlob({ type, quality: 0.92 });
	return sniffImage(new Uint8Array(await blob.arrayBuffer()));
}

/** Upright PNG and JPEG keep their bytes; other formats the browser decodes, svg included, become PNG; over MAX_INSERT_SIDE scales down while decoding. Throws when the file is no image or a PNG or JPEG is over MAX_AREA. */
export async function decodeImageFile(file: Blob): Promise<ImageAsset> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const known = sniffImage(bytes);
	if (
		known &&
		bytes.length <= MAX_IMAGE_BYTES &&
		Math.max(known.width, known.height) <= MAX_INSERT_SIDE &&
		(known.mime === 'image/png' || jpegOrientation(bytes) === 1)
	)
		return known;
	// sniffImage refuses bombs
	if (!known && headerOf(bytes)) throw new Error('image');
	const bitmap = await decodeImage(file, MAX_INSERT_SIDE);
	try {
		const { width: w, height: h } = bitmap;
		let out = await encode(
			bitmap,
			w,
			h,
			known?.mime ?? 'image/png',
		);
		// png photos exceed cap
		if (out && out.bytes.length > MAX_IMAGE_BYTES)
			out = await encode(bitmap, w, h, 'image/jpeg');
		if (!out || out.bytes.length > MAX_IMAGE_BYTES)
			throw new Error('image');
		return out;
	} finally {
		bitmap.close();
	}
}

/** w by h scaled down to fit maxW by maxH. */
export function fit(
	w: number,
	h: number,
	maxW: number,
	maxH: number,
): { w: number; h: number } {
	const k = Math.min(1, maxW / w, maxH / h);
	return k < 1 ? { w: w * k, h: h * k } : { w, h };
}

/** Display size in pt: the pixel size at 96 dpi, scaled to fit the box. */
export const fitSize = (
	asset: Pick<ImageAsset, 'width' | 'height'>,
	maxW: number,
	maxH: number,
) => fit(asset.width * PX_PT, asset.height * PX_PT, maxW, maxH);

type Decoded = ImageBitmap | 'loading' | 'failed';

// by asset: ids repeat
const bitmaps = new WeakMap<ImageAsset, Map<number, Decoded>>();
const readyAt = new WeakMap<ImageAsset, number>();
let generation = 0;
let frame = 0;

/** The generation of decoded bitmaps; bumps at most once a frame. */
export const bitmapsReady = channel(0);

/** A bitmap of the asset decoded after generation. */
export const readySince = (asset: ImageAsset, gen: number) =>
	(readyAt.get(asset) ?? 0) > gen;

function ready(asset: ImageAsset) {
	readyAt.set(asset, generation + 1);
	frame ||= requestAnimationFrame(() => {
		frame = 0;
		bitmapsReady.set(++generation);
	});
}

// powers of two
function bucketOf(asset: ImageAsset, px: number): number {
	let b = MIN_BUCKET;
	while (b < px && b < asset.width) b *= 2;
	return Math.min(b, asset.width);
}

/** A bitmap at least px wide (or the full image) to draw the asset px device pixels wide; while it decodes the widest one decoded so far, else null. */
export function bitmapFor(asset: ImageAsset, px: number): ImageBitmap | null {
	let sizes = bitmaps.get(asset);
	if (!sizes) bitmaps.set(asset, (sizes = new Map<number, Decoded>()));
	const w = bucketOf(asset, px);
	const hit = sizes.get(w);
	if (hit && typeof hit !== 'string') return hit;
	if (!hit) {
		sizes.set(w, 'loading');
		const blob = new Blob([asset.bytes as BlobPart], {
			type: asset.mime,
		});
		const h = Math.max(
			1,
			Math.round((asset.height * w) / asset.width),
		);
		createImageBitmap(
			blob,
			w < asset.width
				? {
						resizeWidth: w,
						resizeHeight: h,
						resizeQuality: 'high',
					}
				: {},
		).then(
			(bitmap) => {
				if (bitmaps.get(asset) !== sizes) {
					bitmap.close();
					return;
				}
				sizes.set(w, bitmap);
				ready(asset);
			},
			() => sizes.set(w, 'failed'),
		);
	}
	let best: ImageBitmap | null = null;
	for (const b of sizes.values())
		if (typeof b !== 'string' && (!best || b.width > best.width))
			best = b;
	return best;
}

/** Closes the decoded bitmaps of an asset no document uses. */
export function releaseBitmaps(asset: ImageAsset) {
	for (const b of bitmaps.get(asset)?.values() ?? [])
		if (typeof b !== 'string') b.close();
	bitmaps.delete(asset);
}
