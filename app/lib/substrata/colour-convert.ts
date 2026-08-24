export interface RGB {
	r: number;
	g: number;
	b: number;
}

export interface OKLab {
	L: number;
	a: number;
	b: number;
}

export interface OKLCH {
	L: number;
	C: number;
	h: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, v));

export function hexToRgb(hex: string): RGB | null {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
	if (!m) return null;
	return {
		r: parseInt(m[1]!, 16),
		g: parseInt(m[2]!, 16),
		b: parseInt(m[3]!, 16),
	};
}

export function rgbToHex({ r, g, b }: RGB): string {
	return (
		'#' +
		[r, g, b]
			.map((x) =>
				Math.round(clamp(x, 0, 255))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

export function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
	return c <= 0.0031308
		? 12.92 * c
		: 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function rgbToOklab({ r, g, b }: RGB): OKLab {
	const lr = srgbToLinear(r / 255);
	const lg = srgbToLinear(g / 255);
	const lb = srgbToLinear(b / 255);

	const l = Math.cbrt(
		0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
	);
	const m = Math.cbrt(
		0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
	);
	const s = Math.cbrt(
		0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
	);

	return {
		L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	};
}

export function oklabToRgb({ L, a, b }: OKLab): RGB {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

	const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	return {
		r: clamp(Math.round(linearToSrgb(lr) * 255), 0, 255),
		g: clamp(Math.round(linearToSrgb(lg) * 255), 0, 255),
		b: clamp(Math.round(linearToSrgb(lb) * 255), 0, 255),
	};
}

export function oklabToOklch({ L, a, b }: OKLab): OKLCH {
	const C = Math.sqrt(a * a + b * b);
	let h = (Math.atan2(b, a) * 180) / Math.PI;
	if (h < 0) h += 360;
	return { L, C, h };
}

export function oklchToOklab({ L, C, h }: OKLCH): OKLab {
	const hr = (h * Math.PI) / 180;
	return { L, a: C * Math.cos(hr), b: C * Math.sin(hr) };
}

export function clampOklch({ L, C, h }: OKLCH): OKLCH {
	return {
		L: clamp(L, 0, 1),
		C: clamp(C, 0, 0.4),
		h: ((h % 360) + 360) % 360,
	};
}

export const rgbToOklch = (rgb: RGB): OKLCH => oklabToOklch(rgbToOklab(rgb));
export const oklchToRgb = (oklch: OKLCH): RGB =>
	oklabToRgb(oklchToOklab(clampOklch(oklch)));

export function hexToOklch(hex: string): OKLCH | null {
	const rgb = hexToRgb(hex);
	return rgb ? rgbToOklch(rgb) : null;
}

export const oklchToHex = (oklch: OKLCH): string => rgbToHex(oklchToRgb(oklch));
