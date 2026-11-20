// row 0 starts rightwards
const DIFFUSION: Record<string, { div: number; rows: number[][] }> = {
	'floyd-steinberg': { div: 16, rows: [[7], [3, 5, 1]] },
	atkinson: {
		div: 8,
		rows: [
			[1, 1],
			[1, 1, 1],
			[0, 1, 0],
		],
	},
	jarvis: {
		div: 48,
		rows: [
			[7, 5],
			[3, 5, 7, 5, 3],
			[1, 3, 5, 3, 1],
		],
	},
	stucki: {
		div: 42,
		rows: [
			[8, 4],
			[2, 4, 8, 4, 2],
			[1, 2, 4, 2, 1],
		],
	},
	burkes: {
		div: 32,
		rows: [
			[8, 4],
			[2, 4, 8, 4, 2],
		],
	},
	sierra: {
		div: 32,
		rows: [
			[5, 3],
			[2, 4, 5, 4, 2],
			[0, 2, 3, 2, 0],
		],
	},
	'sierra-lite': { div: 4, rows: [[2], [1, 1, 0]] },
};

const BAYER: Record<string, number> = {
	'bayer-2': 2,
	'bayer-4': 4,
	'bayer-8': 8,
};

export const DITHER_ALGORITHMS = [
	{ id: 'floyd-steinberg', label: 'Floyd–Steinberg' },
	{ id: 'atkinson', label: 'Atkinson' },
	{ id: 'jarvis', label: 'Jarvis–Judice–Ninke' },
	{ id: 'stucki', label: 'Stucki' },
	{ id: 'burkes', label: 'Burkes' },
	{ id: 'sierra', label: 'Sierra' },
	{ id: 'sierra-lite', label: 'Sierra Lite' },
	{ id: 'bayer-2', label: 'Bayer 2 × 2' },
	{ id: 'bayer-4', label: 'Bayer 4 × 4' },
	{ id: 'bayer-8', label: 'Bayer 8 × 8' },
] as const;

export type DitherAlgorithm = (typeof DITHER_ALGORITHMS)[number]['id'];

// fabric needs index signature
export type DitherOptions = {
	algorithm: DitherAlgorithm;
	/** false: luminance only */
	colour: boolean;
	/** per channel, 2 and up */
	levels: number;
	/** side of one dithered cell in px */
	scale: number;
};

export function bayerMatrix(size: number): number[][] {
	let m = [[0]];
	while (m.length < size) {
		const n = m.length;
		const next = Array.from({ length: n * 2 }, () =>
			new Array<number>(n * 2).fill(0),
		);
		for (let y = 0; y < n; y++)
			for (let x = 0; x < n; x++) {
				const v = m[y]![x]! * 4;
				next[y]![x] = v;
				next[y]![x + n] = v + 2;
				next[y + n]![x] = v + 3;
				next[y + n]![x + n] = v + 1;
			}
		m = next;
	}
	return m;
}

function ditherPlane(
	plane: Float32Array,
	w: number,
	h: number,
	algorithm: string,
	levels: number,
): void {
	const step = 255 / (levels - 1);
	const quantise = (v: number) =>
		Math.min(255, Math.max(0, Math.round(v / step) * step));
	const size = BAYER[algorithm];
	if (size) {
		const m = bayerMatrix(size);
		for (let y = 0, i = 0; y < h; y++)
			for (let x = 0; x < w; x++, i++)
				plane[i] = quantise(
					plane[i]! +
						((m[y % size]![x % size]! +
							0.5) /
							(size * size) -
							0.5) *
							step,
				);
		return;
	}
	const { div, rows } =
		DIFFUSION[algorithm] ?? DIFFUSION['floyd-steinberg']!;
	for (let y = 0, i = 0; y < h; y++)
		for (let x = 0; x < w; x++, i++) {
			const old = plane[i]!;
			const next = quantise(old);
			plane[i] = next;
			const error = (old - next) / div;
			if (!error) continue;
			for (let r = 0; r < rows.length && y + r < h; r++) {
				const row = rows[r]!;
				const first = r ? -((row.length - 1) >> 1) : 1;
				for (let k = 0; k < row.length; k++) {
					const nx = x + first + k;
					if (nx >= 0 && nx < w)
						plane[i + r * w + first + k]! +=
							error * row[k]!;
				}
			}
		}
}

/** Dithers RGBA pixels in place. Alpha is kept. */
export function dither(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	options: DitherOptions,
): void {
	const scale = Math.max(1, Math.round(options.scale));
	const levels = Math.max(2, Math.round(options.levels));
	const w = Math.ceil(width / scale);
	const h = Math.ceil(height / scale);
	const channels = options.colour ? 3 : 1;
	const planes = Array.from(
		{ length: channels },
		() => new Float32Array(w * h),
	);
	// cells average their block
	for (let cy = 0; cy < h; cy++)
		for (let cx = 0; cx < w; cx++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let n = 0;
			const yEnd = Math.min(height, (cy + 1) * scale);
			const xEnd = Math.min(width, (cx + 1) * scale);
			for (let y = cy * scale; y < yEnd; y++)
				for (let x = cx * scale; x < xEnd; x++) {
					const i = (y * width + x) * 4;
					r += data[i]!;
					g += data[i + 1]!;
					b += data[i + 2]!;
					n++;
				}
			const c = cy * w + cx;
			if (options.colour) {
				planes[0]![c] = r / n;
				planes[1]![c] = g / n;
				planes[2]![c] = b / n;
			} else
				planes[0]![c] =
					(0.2126 * r + 0.7152 * g + 0.0722 * b) /
					n;
		}
	for (const plane of planes)
		ditherPlane(plane, w, h, options.algorithm, levels);
	const [red, green = red, blue = red] = planes as [
		Float32Array,
		Float32Array?,
		Float32Array?,
	];
	for (let y = 0; y < height; y++) {
		const row = Math.floor(y / scale) * w;
		for (let x = 0; x < width; x++) {
			const c = row + Math.floor(x / scale);
			const i = (y * width + x) * 4;
			data[i] = red[c]!;
			data[i + 1] = green[c]!;
			data[i + 2] = blue[c]!;
		}
	}
}
