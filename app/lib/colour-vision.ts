import { hexToRgb, rgbToHex, type Triple } from './colour-maths';

export type SimulationType =
	| 'normal'
	| 'protanopia'
	| 'deuteranopia'
	| 'tritanopia'
	| 'protanomaly'
	| 'deuteranomaly'
	| 'tritanomaly'
	| 'achromatopsia'
	| 'achromatomaly';

export type Matrix = readonly [Triple, Triple, Triple];

// preserve cli parity
export const MATRICES: Record<SimulationType, Matrix> = {
	normal: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
	protanopia: [
		[0.567, 0.433, 0],
		[0.558, 0.442, 0],
		[0, 0.242, 0.758],
	],
	deuteranopia: [
		[0.625, 0.375, 0],
		[0.7, 0.3, 0],
		[0, 0.3, 0.7],
	],
	tritanopia: [
		[0.95, 0.05, 0],
		[0, 0.433, 0.567],
		[0, 0.475, 0.525],
	],
	protanomaly: [
		[0.817, 0.183, 0],
		[0.333, 0.667, 0],
		[0, 0.125, 0.875],
	],
	deuteranomaly: [
		[0.8, 0.2, 0],
		[0.258, 0.742, 0],
		[0, 0.142, 0.858],
	],
	tritanomaly: [
		[0.967, 0.033, 0],
		[0, 0.733, 0.267],
		[0, 0.183, 0.817],
	],
	achromatopsia: [
		[0.299, 0.587, 0.114],
		[0.299, 0.587, 0.114],
		[0.299, 0.587, 0.114],
	],
	achromatomaly: [
		[0.618, 0.32, 0.062],
		[0.163, 0.775, 0.062],
		[0.163, 0.32, 0.516],
	],
};

export function applyMatrix(
	matrix: Matrix,
	r: number,
	g: number,
	b: number,
): Triple {
	return [
		Math.round(
			matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b,
		),
		Math.round(
			matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b,
		),
		Math.round(
			matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b,
		),
	];
}

export function simulateHex(hex: string, type: SimulationType): string | null {
	const rgb = hexToRgb(hex);
	if (!rgb) return null;
	return rgbToHex(...applyMatrix(MATRICES[type], ...rgb));
}
