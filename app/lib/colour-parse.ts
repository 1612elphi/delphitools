import {
	hexToRgb,
	hslToRgb,
	xyzToRgb,
	labToXyz,
	lchToLab,
	oklabToRgb,
	type Triple,
} from './colour-maths';

export type ColourFormat =
	| 'hex'
	| 'rgb'
	| 'rgb-decimal'
	| 'hsl'
	| 'lab'
	| 'lch'
	| 'oklab'
	| 'oklch';

const THREE_SIGNED = /(-?[\d.]+)\s*,?\s*(-?[\d.]+)%?\s*,?\s*(-?[\d.]+)%?/;

function three(value: string): Triple | null {
	const m = THREE_SIGNED.exec(value);
	if (!m) return null;
	const nums = [
		Number.parseFloat(m[1]!),
		Number.parseFloat(m[2]!),
		Number.parseFloat(m[3]!),
	];
	return nums.every(Number.isFinite) ? (nums as Triple) : null;
}

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

function cssNamedColour(name: string): Triple | null {
	if (typeof document === 'undefined') return null;
	if (!/^[a-z]+$/i.test(name)) return null;
	const ctx = document
		.createElement('canvas')
		.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	// fillstyle ignores invalid colours
	ctx.fillStyle = '#010203';
	ctx.fillStyle = name;
	if (ctx.fillStyle === '#010203') return null;
	ctx.fillRect(0, 0, 1, 1);
	const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
	return [r, g, b];
}

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
