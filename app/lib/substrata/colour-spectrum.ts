import type { RGB } from './colour-convert';
import { linearToSrgb } from './colour-convert';

/** wavelengths in nm */
export const SPECTRUM_LO = 380;
export const SPECTRUM_HI = 700;

/** integration step: nm */
const STEP = 5;

const clamp = (v: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, v));

function g(x: number, mu: number, s1: number, s2: number): number {
	const t = (x - mu) / (x < mu ? s1 : s2);
	return Math.exp(-0.5 * t * t);
}

/** cie 1931 approximation */
function xBar(l: number): number {
	return (
		1.056 * g(l, 599.8, 37.9, 31.0) +
		0.362 * g(l, 442.0, 16.0, 26.7) -
		0.065 * g(l, 501.1, 20.4, 26.2)
	);
}

function yBar(l: number): number {
	return (
		0.821 * g(l, 568.8, 46.9, 40.5) +
		0.286 * g(l, 530.9, 16.3, 31.1)
	);
}

function zBar(l: number): number {
	return (
		1.217 * g(l, 437.0, 11.8, 36.0) +
		0.681 * g(l, 459.0, 26.0, 13.8)
	);
}

export function bandCentre(i: number, n: number): number {
	return SPECTRUM_LO + ((i + 0.5) / n) * (SPECTRUM_HI - SPECTRUM_LO);
}

function spdAt(l: number, bands: number[]): number {
	const n = bands.length;
	if (n === 0) return 0;
	if (n === 1) return bands[0]!;

	const first = bandCentre(0, n);
	const last = bandCentre(n - 1, n);
	if (l <= first) return bands[0]!;
	if (l >= last) return bands[n - 1]!;

	const pos = ((l - SPECTRUM_LO) / (SPECTRUM_HI - SPECTRUM_LO)) * n - 0.5;
	const i0 = Math.floor(pos);
	const i1 = i0 + 1;
	const f = pos - i0;
	return bands[i0]! * (1 - f) + bands[i1]! * f;
}

export function spectrumToRgb(bands: number[]): RGB {
	let X = 0;
	let Y = 0;
	let Z = 0;
	let yInt = 0;

	for (let l = SPECTRUM_LO; l <= SPECTRUM_HI; l += STEP) {
		const yb = yBar(l);
		yInt += yb;

		const s = spdAt(l, bands);
		X += s * xBar(l);
		Y += s * yb;
		Z += s * zBar(l);
	}

	const k = yInt > 0 ? 1 / yInt : 0;
	X *= k;
	Y *= k;
	Z *= k;

	// xyz to linear srgb
	let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
	let gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
	let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;

	// normalize out-of-gamut channels
	r = Math.max(0, r);
	gg = Math.max(0, gg);
	b = Math.max(0, b);
	const max = Math.max(r, gg, b);
	if (max > 1) {
		r /= max;
		gg /= max;
		b /= max;
	}

	return {
		r: clamp(Math.round(linearToSrgb(r) * 255), 0, 255),
		g: clamp(Math.round(linearToSrgb(gg) * 255), 0, 255),
		b: clamp(Math.round(linearToSrgb(b) * 255), 0, 255),
	};
}
