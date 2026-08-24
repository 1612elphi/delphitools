export interface PixelMask {
	data: Uint8Array;
	width: number;
	height: number;
}

export interface MaskBounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function rectMask(
	width: number,
	height: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): PixelMask {
	const data = new Uint8Array(width * height);
	const xa = Math.max(0, Math.round(Math.min(x0, x1)));
	// typedarray fill negative indexing
	const xb = Math.max(xa, Math.min(width, Math.round(Math.max(x0, x1))));
	const ya = Math.max(0, Math.round(Math.min(y0, y1)));
	const yb = Math.max(ya, Math.min(height, Math.round(Math.max(y0, y1))));
	for (let y = ya; y < yb; y++)
		data.fill(255, y * width + xa, y * width + xb);
	return { data, width, height };
}

function scratchContext(
	width: number,
	height: number,
): CanvasRenderingContext2D {
	const c = document.createElement('canvas');
	c.width = width;
	c.height = height;
	return c.getContext('2d')!;
}

function alphaToMask(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
): Uint8Array {
	const px = ctx.getImageData(0, 0, width, height).data;
	const data = new Uint8Array(width * height);
	for (let i = 0; i < data.length; i++)
		if (px[i * 4 + 3]! >= 128) data[i] = 255;
	return data;
}

export function polygonMask(
	width: number,
	height: number,
	points: { x: number; y: number }[],
): PixelMask {
	if (points.length < 3)
		return { data: new Uint8Array(width * height), width, height };
	const ctx = scratchContext(width, height);
	ctx.beginPath();
	ctx.moveTo(points[0]!.x, points[0]!.y);
	for (let i = 1; i < points.length; i++)
		ctx.lineTo(points[i]!.x, points[i]!.y);
	ctx.closePath();
	ctx.fill();
	return { data: alphaToMask(ctx, width, height), width, height };
}

function matcher(
	data: Uint8ClampedArray,
	seedIndex: number,
	tolerance: number,
): (i: number) => boolean {
	const s = seedIndex * 4;
	const r = data[s]!;
	const g = data[s + 1]!;
	const b = data[s + 2]!;
	const a = data[s + 3]!;
	return (i) => {
		const j = i * 4;
		return (
			Math.abs(data[j]! - r) <= tolerance &&
			Math.abs(data[j + 1]! - g) <= tolerance &&
			Math.abs(data[j + 2]! - b) <= tolerance &&
			Math.abs(data[j + 3]! - a) <= tolerance
		);
	};
}

export function floodMask(
	image: ImageData,
	seedX: number,
	seedY: number,
	tolerance: number,
): PixelMask {
	const { width, height } = image;
	const data = new Uint8Array(width * height);
	const sx = Math.floor(seedX);
	const sy = Math.floor(seedY);
	if (sx < 0 || sy < 0 || sx >= width || sy >= height)
		return { data, width, height };
	const match = matcher(image.data, sy * width + sx, tolerance);

	const stack = [sy * width + sx];
	while (stack.length) {
		const idx = stack.pop()!;
		if (data[idx] || !match(idx)) continue;
		const y = (idx / width) | 0;
		const row = y * width;
		let x0 = idx - row;
		let x1 = x0;
		while (x0 > 0 && !data[row + x0 - 1] && match(row + x0 - 1))
			x0--;
		while (
			x1 < width - 1 &&
			!data[row + x1 + 1] &&
			match(row + x1 + 1)
		)
			x1++;
		data.fill(255, row + x0, row + x1 + 1);
		for (const ny of [y - 1, y + 1]) {
			if (ny < 0 || ny >= height) continue;
			let inRun = false;
			for (let x = x0; x <= x1; x++) {
				const k = ny * width + x;
				if (!data[k] && match(k)) {
					if (!inRun) stack.push(k);
					inRun = true;
				} else inRun = false;
			}
		}
	}
	return { data, width, height };
}

export function globalMask(
	image: ImageData,
	seedX: number,
	seedY: number,
	tolerance: number,
): PixelMask {
	const { width, height } = image;
	const data = new Uint8Array(width * height);
	const sx = Math.floor(seedX);
	const sy = Math.floor(seedY);
	if (sx < 0 || sy < 0 || sx >= width || sy >= height)
		return { data, width, height };
	const match = matcher(image.data, sy * width + sx, tolerance);
	for (let i = 0; i < data.length; i++) if (match(i)) data[i] = 255;
	return { data, width, height };
}

export function invertMask(mask: PixelMask): PixelMask {
	const data = new Uint8Array(mask.data.length);
	for (let i = 0; i < data.length; i++) data[i] = mask.data[i] ? 0 : 255;
	return { data, width: mask.width, height: mask.height };
}

function morphMask(
	mask: PixelMask,
	radius: number,
	op: GlobalCompositeOperation,
): PixelMask {
	const r = Math.max(1, Math.round(radius));
	const stamp = maskToCanvas(mask);
	const ctx = scratchContext(mask.width, mask.height);
	ctx.drawImage(stamp, 0, 0);
	ctx.globalCompositeOperation = op;
	// 16-facet disk approximation
	const FACETS = 16;
	for (let i = 0; i < FACETS; i++) {
		const a = (i / FACETS) * 2 * Math.PI;
		ctx.drawImage(stamp, Math.cos(a) * r, Math.sin(a) * r);
	}
	return {
		data: alphaToMask(ctx, mask.width, mask.height),
		width: mask.width,
		height: mask.height,
	};
}

export function growMask(mask: PixelMask, radius: number): PixelMask {
	return morphMask(mask, radius, 'source-over');
}

export function shrinkMask(mask: PixelMask, radius: number): PixelMask {
	return morphMask(mask, radius, 'destination-in');
}

export function maskBounds(mask: PixelMask): MaskBounds | null {
	const { data, width, height } = mask;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			if (!data[row + x]) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			maxY = y;
		}
	}
	if (maxX < 0) return null;
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function maskArea(mask: PixelMask): number {
	let n = 0;
	for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) n++;
	return n;
}

const MS_SEGMENTS: readonly (readonly [number, number])[][] = [
	[],
	[[3, 2]],
	[[2, 1]],
	[[3, 1]],
	[[1, 0]],
	[
		[1, 0],
		[3, 2],
	],
	[[2, 0]],
	[[3, 0]],
	[[0, 3]],
	[[0, 2]],
	[
		[0, 3],
		[2, 1],
	],
	[[0, 1]],
	[[1, 3]],
	[[1, 2]],
	[[2, 3]],
	[],
];

export function traceOutline(mask: PixelMask): Path2D {
	const { data, width, height } = mask;
	const path = new Path2D();
	// doubled coordinates create keys
	const stride = 2 * width + 1;
	const key = (x: number, y: number) =>
		Math.round(2 * y) * stride + Math.round(2 * x);
	const segs = new Map<number, number>();

	const at = (px: number, py: number) =>
		px >= 0 &&
		py >= 0 &&
		px < width &&
		py < height &&
		data[py * width + px]
			? 1
			: 0;
	for (let cy = 0; cy <= height; cy++) {
		for (let cx = 0; cx <= width; cx++) {
			const cell =
				(at(cx - 1, cy - 1) << 3) |
				(at(cx, cy - 1) << 2) |
				(at(cx, cy) << 1) |
				at(cx - 1, cy);
			for (const [from, to] of MS_SEGMENTS[cell]!) {
				const p = edgePoint(cx, cy, from);
				const q = edgePoint(cx, cy, to);
				segs.set(key(p.x, p.y), key(q.x, q.y));
			}
		}
	}

	for (const start of segs.keys()) {
		if (!segs.has(start)) continue;
		path.moveTo(
			(start % stride) / 2,
			Math.floor(start / stride) / 2,
		);
		let cur = start;
		for (;;) {
			const next = segs.get(cur);
			segs.delete(cur);
			if (next === undefined || next === start) break;
			path.lineTo(
				(next % stride) / 2,
				Math.floor(next / stride) / 2,
			);
			cur = next;
		}
		path.closePath();
	}
	return path;
}

function edgePoint(
	cx: number,
	cy: number,
	edge: number,
): { x: number; y: number } {
	switch (edge) {
		case 0:
			return { x: cx, y: cy - 0.5 };
		case 1:
			return { x: cx + 0.5, y: cy };
		case 2:
			return { x: cx, y: cy + 0.5 };
		default:
			return { x: cx - 0.5, y: cy };
	}
}

export function maskToCanvas(mask: PixelMask): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = mask.width;
	c.height = mask.height;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(mask.width, mask.height);
	for (let i = 0; i < mask.data.length; i++) {
		const j = i * 4;
		img.data[j] = 255;
		img.data[j + 1] = 255;
		img.data[j + 2] = 255;
		img.data[j + 3] = mask.data[i]!;
	}
	ctx.putImageData(img, 0, 0);
	return c;
}

const EDGE_FLOOR = 24;

export function sobelField(image: ImageData): {
	mag: Uint8Array;
	width: number;
	height: number;
} {
	const { data, width, height } = image;
	const lum = new Uint8Array(width * height);
	for (let i = 0; i < lum.length; i++) {
		const j = i * 4;
		lum[i] =
			(data[j]! * 77 +
				data[j + 1]! * 150 +
				data[j + 2]! * 29) >>
			8;
	}
	const mag = new Uint8Array(width * height);
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			const tl = lum[i - width - 1]!;
			const t = lum[i - width]!;
			const tr = lum[i - width + 1]!;
			const l = lum[i - 1]!;
			const r = lum[i + 1]!;
			const bl = lum[i + width - 1]!;
			const b = lum[i + width]!;
			const br = lum[i + width + 1]!;
			const gx = tr + 2 * r + br - tl - 2 * l - bl;
			const gy = bl + 2 * b + br - tl - 2 * t - tr;
			mag[i] = Math.min(
				255,
				Math.round(Math.hypot(gx, gy) / 4),
			);
		}
	}
	return { mag, width, height };
}

export function snapToEdge(
	field: { mag: Uint8Array; width: number; height: number },
	x: number,
	y: number,
	radius: number,
): { x: number; y: number } {
	const { mag, width, height } = field;
	const r2 = radius * radius;
	let bestMag = 0;
	let bestD2 = Infinity;
	let bx = -1;
	let by = -1;
	const py0 = Math.max(0, Math.floor(y - radius));
	const py1 = Math.min(height - 1, Math.ceil(y + radius));
	const px0 = Math.max(0, Math.floor(x - radius));
	const px1 = Math.min(width - 1, Math.ceil(x + radius));
	for (let py = py0; py <= py1; py++) {
		for (let px = px0; px <= px1; px++) {
			const dx = px + 0.5 - x;
			const dy = py + 0.5 - y;
			const d2 = dx * dx + dy * dy;
			if (d2 > r2) continue;
			const m = mag[py * width + px]!;
			if (m < EDGE_FLOOR) continue;
			if (m > bestMag || (m === bestMag && d2 < bestD2)) {
				bestMag = m;
				bestD2 = d2;
				bx = px;
				by = py;
			}
		}
	}
	return bx < 0 ? { x, y } : { x: bx + 0.5, y: by + 0.5 };
}
