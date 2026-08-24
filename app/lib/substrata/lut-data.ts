/** source licences: acknowledgements.md, state.md */

export interface LutLook {
	id: string;
	label: string;
	file: string;
	swatch: [string, string, string];
}

export const LUT_LOOKS: LutLook[] = [
	{
		id: 'lut-portra400',
		label: 'Portra 400',
		file: 'lut-portra400.png',
		swatch: ['#e8cdb0', '#a98e72', '#3d3128'],
	},
	{
		id: 'lut-ektar100',
		label: 'Ektar 100',
		file: 'lut-ektar100.png',
		swatch: ['#e85a3a', '#3a7ac8', '#22262e'],
	},
	{
		id: 'lut-kodachrome64',
		label: 'Kodachrome 64',
		file: 'lut-kodachrome64.png',
		swatch: ['#d84a30', '#c8a84a', '#1d1a16'],
	},
	{
		id: 'lut-velvia50',
		label: 'Velvia 50',
		file: 'lut-velvia50.png',
		swatch: ['#e83a6a', '#3aa84a', '#1a1428'],
	},
	{
		id: 'lut-provia100f',
		label: 'Provia 100F',
		file: 'lut-provia100f.png',
		swatch: ['#c8d8e8', '#6a8aa8', '#22303d'],
	},
	{
		id: 'lut-400h',
		label: 'Pro 400H',
		file: 'lut-400h.png',
		swatch: ['#d8e8d8', '#a8c8b8', '#5a7268'],
	},
	{
		id: 'lut-polaroid690',
		label: 'Polaroid 690',
		file: 'lut-polaroid690.png',
		swatch: ['#e8d8a8', '#b8927a', '#42342e'],
	},
	{
		id: 'lut-trix400',
		label: 'Tri-X 400',
		file: 'lut-trix400.png',
		swatch: ['#e8e8e8', '#7a7a7a', '#141414'],
	},
	{
		id: 'lut-vision3-2383',
		label: 'Vision3 2383',
		file: 'lut-vision3-2383.png',
		swatch: ['#e8a05a', '#3a6a6a', '#12201f'],
	},
	{
		id: 'lut-eterna-500',
		label: 'Eterna 500',
		file: 'lut-eterna-500.png',
		swatch: ['#c8d0b8', '#6a7a68', '#1d241d'],
	},
	{
		id: 'lut-gold-200',
		label: 'Gold 200',
		file: 'lut-gold-200.png',
		swatch: ['#e8c86a', '#a8823a', '#2e2214'],
	},
	{
		id: 'lut-portra-endura',
		label: 'Portra Endura',
		file: 'lut-portra-endura.png',
		swatch: ['#e8cdb0', '#b09478', '#3a2e26'],
	},
	{
		id: 'lut-ektachrome-100d',
		label: 'Ektachrome 100D',
		file: 'lut-ektachrome-100d.png',
		swatch: ['#b8d8e8', '#5a8ab8', '#1a2a3d'],
	},
	{
		id: 'lut-aerochrome',
		label: 'Aerochrome',
		file: 'lut-aerochrome.png',
		swatch: ['#e84a5a', '#b83a8a', '#2a1420'],
	},
	{
		id: 'lut-instax',
		label: 'Instax',
		file: 'lut-instax.png',
		swatch: ['#e8e0d0', '#a8b0b8', '#4a5258'],
	},
	{
		id: 'lut-trix-polymax',
		label: 'Tri-X Polymax',
		file: 'lut-trix-polymax.png',
		swatch: ['#e0e0e0', '#787878', '#181818'],
	},
];

export const isLutLook = (presetId: string): boolean =>
	LUT_LOOKS.some((l) => l.id === presetId);

export interface LoadedLut {
	size: number;
	table: Uint8ClampedArray;
	/** gpu texture source */
	strip: HTMLCanvasElement;
}

const loaded = new Map<string, LoadedLut>();
const inFlight = new Set<string>();
let epoch = 0;
const listeners = new Set<() => void>();

/** cache invalidation counter */
export function lutEpoch(): number {
	return epoch;
}

export function subscribeLuts(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getLoadedLut(id: string): LoadedLut | undefined {
	return loaded.get(id);
}

export function ensureLut(id: string): void {
	if (
		loaded.has(id) ||
		inFlight.has(id) ||
		typeof document === 'undefined'
	)
		return;
	const look = LUT_LOOKS.find((l) => l.id === id);
	if (!look) return;
	inFlight.add(id);
	const img = new Image();
	img.onload = () => {
		const height = img.naturalHeight;
		const width = img.naturalWidth;
		const strip = document.createElement('canvas');
		strip.width = width;
		strip.height = height;
		const ctx = strip.getContext('2d', {
			willReadFrequently: true,
		})!;
		ctx.drawImage(img, 0, 0);
		const pix = ctx.getImageData(0, 0, width, height).data;
		// packed lut voxel order
		const S = height;
		const table = new Uint8ClampedArray(S * S * S * 4);
		for (let y = 0; y < S; y++) {
			for (let x = 0; x < width; x++) {
				const b = Math.floor(x / S);
				const r = x % S;
				const src = (y * width + x) * 4;
				const dst = (r + y * S + b * S * S) * 4;
				table[dst] = pix[src]!;
				table[dst + 1] = pix[src + 1]!;
				table[dst + 2] = pix[src + 2]!;
				table[dst + 3] = 255;
			}
		}
		loaded.set(id, { size: S, table, strip });
		inFlight.delete(id);
		epoch++;
		for (const l of listeners) l();
	};
	img.onerror = () => {
		inFlight.delete(id);
	};
	img.src = `/substrata/luts/${look.file}`;
}

export function ensureAllLuts(): void {
	for (const l of LUT_LOOKS) ensureLut(l.id);
}

export function applyLutToImageData(
	data: Uint8ClampedArray,
	lut: LoadedLut,
	intensity: number,
): void {
	const { size: S, table } = lut;
	const m = S - 1;
	const at = (r: number, g: number, b: number, ch: number) =>
		table[(r + g * S + b * S * S) * 4 + ch]!;
	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	for (let i = 0; i < data.length; i += 4) {
		const fx = (data[i]! / 255) * m;
		const fy = (data[i + 1]! / 255) * m;
		const fz = (data[i + 2]! / 255) * m;
		const x0 = Math.floor(fx),
			y0 = Math.floor(fy),
			z0 = Math.floor(fz);
		const x1 = Math.min(x0 + 1, m),
			y1 = Math.min(y0 + 1, m),
			z1 = Math.min(z0 + 1, m);
		const tx = fx - x0,
			ty = fy - y0,
			tz = fz - z0;
		for (let ch = 0; ch < 3; ch++) {
			const graded = lerp(
				lerp(
					lerp(
						at(x0, y0, z0, ch),
						at(x1, y0, z0, ch),
						tx,
					),
					lerp(
						at(x0, y1, z0, ch),
						at(x1, y1, z0, ch),
						tx,
					),
					ty,
				),
				lerp(
					lerp(
						at(x0, y0, z1, ch),
						at(x1, y0, z1, ch),
						tx,
					),
					lerp(
						at(x0, y1, z1, ch),
						at(x1, y1, z1, ch),
						tx,
					),
					ty,
				),
				tz,
			);
			const prev = data[i + ch]!;
			data[i + ch] = prev + (graded - prev) * intensity;
		}
	}
}
