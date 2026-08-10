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
 * A pasted colour with the notation read off the string itself: hex with or
 * without the #, or any css functional form (an alpha suffix parses too — the
 * fourth number is ignored). Null when nothing matches.
 */
export function detectColour(value: string): Triple | null {
	const v = value.trim();
	const hex = hexToRgb(v);
	if (hex) return hex;
	const m = /^(rgb|hsl|lab|lch|oklab|oklch)a?\(/i.exec(v);
	if (!m) return null;
	return parseColour(m[1]!.toLowerCase() as ColourFormat, v);
}
