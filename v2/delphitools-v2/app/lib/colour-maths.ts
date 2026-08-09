/**
 * Colour conversions shared by the Colour tools.
 *
 * The Next app repeated these per tool — palette-genny carried its own copy
 * under a "kept for local use" comment. With ten more Colour tools to port,
 * one copy is worth the shared import.
 */

/** `#aabbcc` or `aabbcc`; null for anything else, including 3- and 8-digit. */
export function hexToRgb(hex: string): [number, number, number] | null {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return null;
	// three groups, and exec returned non-null
	return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** sRGB 0–255 to linear-light 0–1. */
export function srgbToLinear(c: number): number {
	c /= 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB 0–255 to OKLCH, as [L 0–1, chroma, hue 0–360]. */
export function rgbToOklch(
	r: number,
	g: number,
	b: number,
): [number, number, number] {
	const lr = srgbToLinear(r);
	const lg = srgbToLinear(g);
	const lb = srgbToLinear(b);
	const l = Math.cbrt(
		0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
	);
	const m = Math.cbrt(
		0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
	);
	const s = Math.cbrt(
		0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
	);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bv = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	let h = (Math.atan2(bv, a) * 180) / Math.PI;
	if (h < 0) h += 360;
	return [L, Math.sqrt(a * a + bv * bv), h];
}

/** WCAG relative luminance, 0–1. */
export function luminance(r: number, g: number, b: number): number {
	const [lr, lg, lb] = [r, g, b].map((c) => {
		c /= 255;
		return c <= 0.03928
			? c / 12.92
			: Math.pow((c + 0.055) / 1.055, 2.4);
	}) as [number, number, number];
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
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
