import {
	hexToRgb,
	hslToRgb,
	xyzToRgb,
	labToXyz,
	lchToLab,
	oklabToRgb,
	type Triple,
} from './colour-maths';

/**
 * Colour-string parsing, shared by colour-converter (which knows the notation
 * from its format picker) and colour-atlas (which guesses it from the string).
 * Moved out of colour-converter.gts so the atlas does not import a tool
 * component's chunk.
 */

export type ColourFormat =
	| 'hex'
	| 'rgb'
	| 'rgb-decimal'
	| 'hsl'
	| 'lab'
	| 'lch'
	| 'oklab'
	| 'oklch';

/**
 * Whatever the separators, three numbers in order is enough to go on. One
 * pattern replaces the Next app's eight near-identical ones, which differed
 * only in whether they admitted a minus sign — inconsistently, so LCH rejected
 * negative input that OKLAB accepted. Out-of-range numbers are clamped later
 * either way.
 */
const THREE_SIGNED = /(-?[\d.]+)\s*,?\s*(-?[\d.]+)%?\s*,?\s*(-?[\d.]+)%?/;

function three(value: string): Triple | null {
	const m = THREE_SIGNED.exec(value);
	if (!m) return null;
	const nums = [
		Number.parseFloat(m[1]!),
		Number.parseFloat(m[2]!),
		Number.parseFloat(m[3]!),
	];
	// A lone "." parses as NaN and would otherwise poison every conversion.
	return nums.every(Number.isFinite) ? (nums as Triple) : null;
}

/** The input, read in the named notation, as sRGB. Null if it does not parse. */
export function parseColour(
	format: ColourFormat,
	value: string,
): Triple | null {
	if (format === 'hex') return hexToRgb(value);

	const parts = three(value);
	if (!parts) return null;

	switch (format) {
		case 'rgb':
			return parts;
		case 'rgb-decimal':
			return parts.map((n) => n * 255) as Triple;
		case 'hsl':
			return hslToRgb(...parts);
		case 'lab':
			return xyzToRgb(...labToXyz(...parts));
		case 'lch':
			return xyzToRgb(...labToXyz(...lchToLab(...parts)));
		case 'oklab':
			return oklabToRgb(...parts);
		case 'oklch':
			return oklabToRgb(...lchToLab(...parts));
	}
}

/**
 * A CSS named colour (`rebeccapurple`, `tomato`, ...) as sRGB. The browser owns
 * the list, so a 1x1 canvas paints the name and reads the pixel back — the same
 * trick colour-palette-dialog uses for oklch. This resolves every CSS keyword
 * with no data table, and deliberately does NOT parse the fancy names from
 * color-name-list, which would drag that ~176 kB dictionary into the eager
 * front-page bundle (see colour-names.ts). Only bare word tokens reach here.
 */
function cssNamedColour(name: string): Triple | null {
	if (typeof document === 'undefined') return null;
	if (!/^[a-z]+$/i.test(name)) return null;
	const ctx = document
		.createElement('canvas')
		.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	// An unknown name leaves fillStyle at its default (#000), so paint over a
	// known non-black first and require the pixel to actually change.
	ctx.fillStyle = '#010203';
	ctx.fillStyle = name;
	if (ctx.fillStyle === '#010203') return null;
	ctx.fillRect(0, 0, 1, 1);
	const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
	return [r, g, b];
}

/**
 * A pasted colour with the notation read off the string itself: hex with or
 * without the #, a CSS colour keyword, or any css functional form (an alpha
 * suffix parses too — the fourth number is ignored). Null when nothing matches.
 */
export function detectColour(value: string): Triple | null {
	const v = value.trim();
	const hex = hexToRgb(v);
	if (hex) return hex;
	const named = cssNamedColour(v);
	if (named) return named;
	const m = /^(rgb|hsl|lab|lch|oklab|oklch)a?\(/i.exec(v);
	if (!m) return null;
	return parseColour(m[1]!.toLowerCase() as ColourFormat, v);
}
