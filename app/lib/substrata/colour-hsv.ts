/**
 * HSV / HSL ↔ sRGB for the colour picker's basic modes (hue cube, HSV triangle,
 * RGB/HSL sliders). Pure maths, framework-free. Channels: H∈[0,360), S/V/L∈[0,1],
 * RGB 0–255. Complements colour-convert.ts (sRGB↔OKLCH), which has no HSV/HSL.
 *
 * The picker stores HSV internally: hue and saturation survive value→0 and
 * saturation→0, which round-tripping through RGB would silently lose (grey has
 * no recoverable hue). So drags on the SV square keep the chosen hue steady.
 */

import type { RGB } from './colour-convert';

export interface HSV {
	h: number;
	s: number;
	v: number;
}

export interface HSL {
	h: number;
	s: number;
	l: number;
}

export const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

export function hsvToRgb({ h, s, v }: HSV): RGB {
	h = wrapHue(h);
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255),
	};
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
	h = wrapHue(h);
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255),
	};
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	if (d !== 0) {
		s = d / (1 - Math.abs(2 * l - 1));
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s, l };
}

/** HSV → HSL (both hue-based; shares the hue). */
export function hsvToHsl({ h, s, v }: HSV): HSL {
	const l = v * (1 - s / 2);
	const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
	return { h, s: sl, l };
}
