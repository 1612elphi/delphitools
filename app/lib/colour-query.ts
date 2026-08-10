import { hexToRgb } from './colour-maths';

/**
 * The `?color=` convention for carrying a colour between tools. Moved out of
 * tailwind-shades.gts once colour-atlas became a second reader; both ends of
 * every link use this one parser.
 */
export function colourFromQuery(search: string): string | null {
	const param = new URLSearchParams(search).get('color');
	if (!param) return null;
	const hex = param.startsWith('#') ? param : `#${param}`;
	return hexToRgb(hex) ? hex : null;
}

/** The value as it goes into `?color=`: bare hex digits, no `#`. */
export function colourToQuery(hex: string): string {
	return hex.replace(/^#/, '');
}
