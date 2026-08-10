import { hexToRgb, rgbToHex, type Triple } from './colour-maths';

/**
 * Colour-vision-deficiency simulation, shared by colorblind-sim and
 * colour-atlas. Moved out of colorblind-sim.gts so the atlas does not import a
 * tool component's chunk.
 */

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

/** Rows of an sRGB-to-sRGB mixing matrix, each row summing to 1. */
export type Matrix = readonly [Triple, Triple, Triple];

// Carried over byte-for-byte from the Next app so both render the same colours.
// Its comment credits Machado, Oliveira and Fernandes (2009), but the values are
// not that paper's: they are the older HCIRN/"Color Blindness Simulation" set,
// which also mixes gamma-encoded sRGB rather than linear light. Correcting
// either would break parity with the CLI and iOS repos.
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

// Every row is non-negative and sums to 1, so the result is already within
// 0-255 and needs no clamp.
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

/** Null when the hex does not parse, which blanks the dependent swatch. */
export function simulateHex(hex: string, type: SimulationType): string | null {
	const rgb = hexToRgb(hex);
	if (!rgb) return null;
	return rgbToHex(...applyMatrix(MATRICES[type], ...rgb));
}
