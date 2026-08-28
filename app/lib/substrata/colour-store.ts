import { hexToRgb, rgbToHex, type RGB } from './colour-convert';
import { hsvToRgb, rgbToHsv, type HSV } from './colour-hsv';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export interface ColourSnapshot {
	hsv: HSV;
	alpha: number;
	rgb: RGB;
	hex: string;
}

let hsv: HSV = rgbToHsv(hexToRgb('#3E6B33')!);
let alpha = 1;

const listeners = new Set<() => void>();

function compute(): ColourSnapshot {
	const rgb = hsvToRgb(hsv);
	return { hsv, alpha, rgb, hex: rgbToHex(rgb) };
}

let snapshot: ColourSnapshot = compute();

function commit(): void {
	snapshot = compute();
	for (const l of listeners) l();
}

export function getColour(): ColourSnapshot {
	return snapshot;
}

export function subscribeColour(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function setHsv(patch: Partial<HSV>): void {
	hsv = {
		h: patch.h ?? hsv.h,
		s: patch.s ?? hsv.s,
		v: patch.v ?? hsv.v,
	};
	commit();
}

export function setAlpha(a: number): void {
	alpha = clamp01(a);
	commit();
}

export function setRgb(rgb: RGB): void {
	hsv = rgbToHsv(rgb);
	commit();
}

export function setHex(hex: string): boolean {
	const rgb = hexToRgb(hex);
	if (!rgb) return false;
	hsv = rgbToHsv(rgb);
	commit();
	return true;
}
