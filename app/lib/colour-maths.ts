/**
 * Colour conversions shared by the Colour tools.
 *
 * The Next app repeated these per tool — palette-genny carried its own copy
 * under a "kept for local use" comment, and colour-converter and
 * colour-notation had a second and third. This is the one copy; both
 * directions live here so the round-trip tools do not grow a fourth.
 *
 * Every triple is [0-255, 0-255, 0-255] for RGB unless the name says otherwise.
 * Whites are D65, matching CSS.
 */

export type Triple = [number, number, number];

// ── sRGB ────────────────────────────────────────────────────────────────────

/** `#aabbcc` or `aabbcc`; null for anything else, including 3- and 8-digit. */
export function hexToRgb(hex: string): Triple | null {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return null;
	// three groups, and exec returned non-null
	return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** Clamps and rounds, so an out-of-gamut conversion still yields valid hex. */
export function rgbToHex(r: number, g: number, b: number): string {
	return (
		'#' +
		[r, g, b]
			.map((c) =>
				Math.round(Math.max(0, Math.min(255, c)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

/** sRGB 0–255 to linear-light 0–1. */
export function srgbToLinear(c: number): number {
	c /= 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear-light 0–1 back to sRGB, clamped and rounded to 0–255. */
export function linearToSrgb(c: number): number {
	const v =
		c <= 0.0031308
			? 12.92 * c
			: 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
	return Math.round(Math.max(0, Math.min(255, v * 255)));
}

// ── HSL and HSV ─────────────────────────────────────────────────────────────

/** [hue 0–360, saturation 0–100, lightness 0–100]. */
export function rgbToHsl(r: number, g: number, b: number): Triple {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	let h = 0,
		s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}
	return [h * 360, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): Triple {
	h /= 360;
	s /= 100;
	l /= 100;

	if (s === 0) return [l * 255, l * 255, l * 255];

	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return [
		hue2rgb(p, q, h + 1 / 3) * 255,
		hue2rgb(p, q, h) * 255,
		hue2rgb(p, q, h - 1 / 3) * 255,
	];
}

/** [hue 0–360, saturation 0–100, value 0–100]. */
export function rgbToHsv(r: number, g: number, b: number): Triple {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	const s = max === 0 ? 0 : d / max;

	if (max !== min) {
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}
	return [h * 360, s * 100, max * 100];
}

// ── CIE XYZ, LAB and LCH ────────────────────────────────────────────────────

export function rgbToXyz(r: number, g: number, b: number): Triple {
	const lr = srgbToLinear(r),
		lg = srgbToLinear(g),
		lb = srgbToLinear(b);
	return [
		0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb,
		0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb,
		0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb,
	];
}

export function xyzToRgb(x: number, y: number, z: number): Triple {
	return [
		linearToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
		linearToSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
		linearToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
	];
}

const XN = 0.95047,
	YN = 1.0,
	ZN = 1.08883;

export function xyzToLab(x: number, y: number, z: number): Triple {
	const f = (t: number) =>
		t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
	const fx = f(x / XN),
		fy = f(y / YN),
		fz = f(z / ZN);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyz(l: number, a: number, b: number): Triple {
	const fy = (l + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;
	const f = (t: number) =>
		t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787;
	return [XN * f(fx), YN * f(fy), ZN * f(fz)];
}

/** Polar form of LAB or OKLAB: [L, chroma, hue 0–360]. */
export function labToLch(l: number, a: number, b: number): Triple {
	let h = (Math.atan2(b, a) * 180) / Math.PI;
	if (h < 0) h += 360;
	return [l, Math.sqrt(a * a + b * b), h];
}

/** Inverse of labToLch; also serves OKLCH to OKLAB. */
export function lchToLab(l: number, c: number, h: number): Triple {
	const rad = (h * Math.PI) / 180;
	return [l, c * Math.cos(rad), c * Math.sin(rad)];
}

// ── OKLAB and OKLCH ─────────────────────────────────────────────────────────

export function rgbToOklab(r: number, g: number, b: number): Triple {
	const lr = srgbToLinear(r),
		lg = srgbToLinear(g),
		lb = srgbToLinear(b);
	const l = Math.cbrt(
		0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
	);
	const m = Math.cbrt(
		0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
	);
	const s = Math.cbrt(
		0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
	);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

/** Linear-light sRGB, unclamped, so callers can see how far out of gamut a value is. */
function oklabToLinearRgb(L: number, a: number, b: number): Triple {
	const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
	const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
	const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
}

export function oklabToRgb(L: number, a: number, b: number): Triple {
	return oklabToLinearRgb(L, a, b).map(linearToSrgb) as Triple;
}

/**
 * The largest chroma that still fits in sRGB at this lightness and hue, found
 * by bisection. The sRGB solid is convex in OKLab, so a ray out from the
 * neutral axis crosses its surface once and the search cannot land in a hole.
 * 0.5 is above the whole gamut: the most saturated sRGB colour is blue, at
 * chroma 0.313.
 *
 * Callers scale by this rather than clamping the channels afterwards, because
 * per-channel clamping moves hue and lightness as well as chroma.
 */
export function maxOklchChroma(l: number, h: number): number {
	let lo = 0;
	let hi = 0.5;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		const inGamut = oklabToLinearRgb(...lchToLab(l, mid, h)).every(
			(v) => v >= -1e-5 && v <= 1 + 1e-5,
		);
		if (inGamut) lo = mid;
		else hi = mid;
	}
	return lo;
}

/** sRGB 0–255 to OKLCH, as [L 0–1, chroma, hue 0–360]. */
export function rgbToOklch(r: number, g: number, b: number): Triple {
	return labToLch(...rgbToOklab(r, g, b));
}

// ── YCbCr ───────────────────────────────────────────────────────────────────

/** ITU-R BT.601, studio swing, rounded to integers. */
export function rgbToYcbcr(r: number, g: number, b: number): Triple {
	return [
		Math.round(16 + (65.481 * r + 128.553 * g + 24.966 * b) / 255),
		Math.round(128 + (-37.797 * r - 74.203 * g + 112.0 * b) / 255),
		Math.round(128 + (112.0 * r - 93.786 * g - 18.214 * b) / 255),
	];
}

/**
 * Naive device CMYK (no profile, no black generation beyond the plain K pull),
 * percentages 0–100. This is the arithmetic every "what is this in CMYK"
 * readout uses; it is NOT a print-accurate separation, which needs an ICC
 * profile for the target press.
 */
export function rgbToCmyk(
	r: number,
	g: number,
	b: number,
): [number, number, number, number] {
	const k = 1 - Math.max(r, g, b) / 255;
	if (k === 1) return [0, 0, 0, 100];
	const pct = (c: number) =>
		Math.round(((1 - c / 255 - k) / (1 - k)) * 100);
	return [pct(r), pct(g), pct(b), Math.round(k * 100)];
}

// ── Contrast ────────────────────────────────────────────────────────────────

/** WCAG relative luminance, 0–1. */
export function luminance(r: number, g: number, b: number): number {
	const [lr, lg, lb] = [r, g, b].map((c) => {
		c /= 255;
		return c <= 0.03928
			? c / 12.92
			: Math.pow((c + 0.055) / 1.055, 2.4);
	}) as Triple;
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2.1 contrast ratio, 1–21. Null if either string is not a hex colour. */
export function contrastRatio(one: string, two: string): number | null {
	const rgbOne = hexToRgb(one);
	const rgbTwo = hexToRgb(two);
	if (!rgbOne || !rgbTwo) return null;

	const lumOne = luminance(...rgbOne);
	const lumTwo = luminance(...rgbTwo);
	return (
		(Math.max(lumOne, lumTwo) + 0.05) /
		(Math.min(lumOne, lumTwo) + 0.05)
	);
}

/**
 * Black or white, whichever reads on the given fill. The 0.4 threshold is the
 * Next app's, not the WCAG midpoint — it biases toward black text.
 */
export function contrastText(hex: string): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return '#000000';
	return luminance(...rgb) > 0.4 ? '#000000' : '#ffffff';
}
