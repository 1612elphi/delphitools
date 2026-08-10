import {
	hexToRgb,
	rgbToHsl,
	rgbToHsv,
	rgbToXyz,
	xyzToLab,
	rgbToOklab,
	rgbToOklch,
	rgbToYcbcr,
} from './colour-maths';

export type ColourNotation =
	| 'hex'
	| 'rgb'
	| 'hsl'
	| 'hsv'
	| 'rgb-decimal'
	| 'lab'
	| 'oklab'
	| 'oklch'
	| 'ycbcr';

export const COLOUR_NOTATIONS: {
	id: ColourNotation;
	label: string;
	example: string;
}[] = [
	{ id: 'hex', label: 'HEX', example: '#3b82f6' },
	{ id: 'rgb', label: 'RGB', example: 'rgb(59, 130, 246)' },
	{
		id: 'rgb-decimal',
		label: 'Decimal RGB',
		example: 'rgb(0.2314, 0.5098, 0.9647)',
	},
	{ id: 'hsl', label: 'HSL', example: 'hsl(217.0, 91.2%, 59.8%)' },
	{ id: 'hsv', label: 'HSV', example: 'hsv(217.0, 76.0%, 96.5%)' },
	{ id: 'lab', label: 'LAB', example: 'lab(54.50 8.50 -65.50)' },
	{
		id: 'oklab',
		label: 'OKLAB',
		example: 'oklab(0.6400 -0.0100 -0.1500)',
	},
	{ id: 'oklch', label: 'OKLCH', example: 'oklch(0.6400 0.1500 264.0)' },
	{ id: 'ycbcr', label: 'YCbCr', example: 'ycbcr(131, 186, 68)' },
];

/**
 * Format a hex colour string in the given notation.
 * Returns the hex string unchanged if parsing fails.
 */
export function formatColour(hex: string, notation: ColourNotation): string {
	if (notation === 'hex') return hex;

	const rgb = hexToRgb(hex);
	if (!rgb) return hex;

	switch (notation) {
		case 'rgb':
			return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
		case 'rgb-decimal':
			return `rgb(${(rgb[0] / 255).toFixed(4)}, ${(rgb[1] / 255).toFixed(4)}, ${(rgb[2] / 255).toFixed(4)})`;
		case 'hsl': {
			const [h, s, l] = rgbToHsl(...rgb);
			return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
		}
		case 'hsv': {
			const [h, s, v] = rgbToHsv(...rgb);
			return `hsv(${h.toFixed(1)}, ${s.toFixed(1)}%, ${v.toFixed(1)}%)`;
		}
		case 'lab': {
			const [l, a, b] = xyzToLab(...rgbToXyz(...rgb));
			return `lab(${l.toFixed(2)} ${a.toFixed(2)} ${b.toFixed(2)})`;
		}
		case 'oklab': {
			const [l, a, b] = rgbToOklab(...rgb);
			return `oklab(${l.toFixed(4)} ${a.toFixed(4)} ${b.toFixed(4)})`;
		}
		case 'oklch': {
			const [l, c, h] = rgbToOklch(...rgb);
			return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(1)})`;
		}
		case 'ycbcr': {
			const [y, cb, cr] = rgbToYcbcr(...rgb);
			return `ycbcr(${y}, ${cb}, ${cr})`;
		}
	}
}
