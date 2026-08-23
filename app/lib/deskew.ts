/**
 * Perspective correction: a quadrilateral drawn on the source becomes the
 * output rectangle. The transform is the planar homography fitted to the
 * four corner pairs (Hartley & Zisserman, Multiple View Geometry, §4.1,
 * the direct linear transform with h33 fixed to 1).
 */

export interface Point {
	x: number;
	y: number;
}

/** Corners in source pixels, clockwise from top-left. */
export type Quad = [Point, Point, Point, Point];

export interface Size {
	width: number;
	height: number;
}

export interface Aspect {
	label: string;
	/** long edge over short edge; null keeps the measured size */
	ratio: number | null;
}

export const ASPECTS: Aspect[] = [
	{ label: 'Auto', ratio: null },
	{ label: 'A4', ratio: Math.SQRT2 },
	{ label: 'Letter', ratio: 11 / 8.5 },
	{ label: '1:1', ratio: 1 },
	{ label: '4:3', ratio: 4 / 3 },
	{ label: '3:2', ratio: 3 / 2 },
	{ label: '16:9', ratio: 16 / 9 },
];

/** The starting quad: the image with each edge pulled in by `inset`. */
export function insetQuad(width: number, height: number, inset = 0.12): Quad {
	const dx = width * inset;
	const dy = height * inset;
	return [
		{ x: dx, y: dy },
		{ x: width - dx, y: dy },
		{ x: width - dx, y: height - dy },
		{ x: dx, y: height - dy },
	];
}

const dist = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

/** The longer of each opposite edge pair, so no edge is downsampled. */
export function outputSize(quad: Quad): Size {
	const [tl, tr, br, bl] = quad;
	return {
		width: Math.max(
			1,
			Math.round(Math.max(dist(tl, tr), dist(bl, br))),
		),
		height: Math.max(
			1,
			Math.round(Math.max(dist(tl, bl), dist(tr, br))),
		),
	};
}

/** Forces `ratio` on the measured size, keeping its orientation and long edge. */
export function fitAspect(size: Size, ratio: number | null): Size {
	if (ratio === null) return size;
	if (size.width >= size.height) {
		return {
			width: size.width,
			height: Math.max(1, Math.round(size.width / ratio)),
		};
	}
	return {
		width: Math.max(1, Math.round(size.height / ratio)),
		height: size.height,
	};
}

/**
 * The eight coefficients a..h of the map from an output pixel (u, v) of a
 * width × height rectangle to the source pixel (x, y):
 *
 *   x = (a·u + b·v + c) / (g·u + h·v + 1)
 *   y = (d·u + e·v + f) / (g·u + h·v + 1)
 *
 * Null when the quad is degenerate (a corner on another, three in a line,
 * a bow tie): the fit does not reproduce the corners, or the denominator
 * changes sign over the rectangle.
 */
export function homography(
	quad: Quad,
	width: number,
	height: number,
): number[] | null {
	const rect: Point[] = [
		{ x: 0, y: 0 },
		{ x: width, y: 0 },
		{ x: width, y: height },
		{ x: 0, y: height },
	];
	const rows: number[][] = [];
	for (let i = 0; i < 4; i++) {
		const { x: u, y: v } = rect[i]!;
		const { x, y } = quad[i]!;
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}
	const h = solve(rows);
	if (!h.every(Number.isFinite)) return null;
	const [a, b, c, d, e, f, g, k] = h as Coefficients;
	const tolerance = 1e-6 * Math.max(width, height);
	for (let i = 0; i < 4; i++) {
		const { x: u, y: v } = rect[i]!;
		const den = g * u + k * v + 1;
		if (den <= 0) return null;
		const { x, y } = quad[i]!;
		if (
			Math.abs((a * u + b * v + c) / den - x) > tolerance ||
			Math.abs((d * u + e * v + f) / den - y) > tolerance
		)
			return null;
	}
	return h;
}

type Coefficients = [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

/** Gauss-Jordan with partial pivoting on an n × (n + 1) augmented matrix. */
function solve(m: number[][]): number[] {
	const n = m.length;
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!))
				pivot = r;
		}
		const row = m[pivot]!;
		m[pivot] = m[col]!;
		m[col] = row;
		const head = row[col]!;
		if (head === 0) continue;
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const other = m[r]!;
			const factor = other[col]! / head;
			if (factor === 0) continue;
			for (let c = col; c <= n; c++)
				other[c]! -= factor * row[c]!;
		}
	}
	return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * Resamples `quad` out of `source` into a width × height image, bilinear.
 * Transparent when the quad is degenerate.
 */
export function warp(
	source: ImageData,
	quad: Quad,
	width: number,
	height: number,
): ImageData {
	const out = new ImageData(width, height);
	const coefficients = homography(quad, width, height);
	if (!coefficients) return out;
	const [a, b, c, d, e, f, g, h] = coefficients as Coefficients;

	const src = source.data;
	const dst = out.data;
	const sw = source.width;
	const sh = source.height;
	const maxX = sw - 1;
	const maxY = sh - 1;
	let o = 0;

	for (let v = 0; v < height; v++) {
		// Pixel centres map to pixel centres; the numerators and the
		// denominator are affine in u, so each row is three additions per pixel.
		const vc = v + 0.5;
		let xn = a * 0.5 + b * vc + c;
		let yn = d * 0.5 + e * vc + f;
		let den = g * 0.5 + h * vc + 1;
		for (let u = 0; u < width; u++, o += 4) {
			const x = xn / den - 0.5;
			const y = yn / den - 0.5;
			xn += a;
			yn += d;
			den += g;

			let x0 = Math.floor(x);
			let y0 = Math.floor(y);
			const fx = x - x0;
			const fy = y - y0;
			let x1 = x0 + 1;
			let y1 = y0 + 1;
			if (x0 < 0) x0 = 0;
			else if (x0 > maxX) x0 = maxX;
			if (x1 < 0) x1 = 0;
			else if (x1 > maxX) x1 = maxX;
			if (y0 < 0) y0 = 0;
			else if (y0 > maxY) y0 = maxY;
			if (y1 < 0) y1 = 0;
			else if (y1 > maxY) y1 = maxY;

			const i00 = (y0 * sw + x0) * 4;
			const i10 = (y0 * sw + x1) * 4;
			const i01 = (y1 * sw + x0) * 4;
			const i11 = (y1 * sw + x1) * 4;
			const w00 = (1 - fx) * (1 - fy);
			const w10 = fx * (1 - fy);
			const w01 = (1 - fx) * fy;
			const w11 = fx * fy;

			dst[o] =
				src[i00]! * w00 +
				src[i10]! * w10 +
				src[i01]! * w01 +
				src[i11]! * w11;
			dst[o + 1] =
				src[i00 + 1]! * w00 +
				src[i10 + 1]! * w10 +
				src[i01 + 1]! * w01 +
				src[i11 + 1]! * w11;
			dst[o + 2] =
				src[i00 + 2]! * w00 +
				src[i10 + 2]! * w10 +
				src[i01 + 2]! * w01 +
				src[i11 + 2]! * w11;
			dst[o + 3] =
				src[i00 + 3]! * w00 +
				src[i10 + 3]! * w10 +
				src[i01 + 3]! * w01 +
				src[i11 + 3]! * w11;
		}
	}
	return out;
}
