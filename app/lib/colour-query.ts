import { modifier } from 'ember-modifier';
import { hexToRgb } from './colour-maths';
import { flowHooks } from './flow-hooks';

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

/** The carried colour from the current page URL; null outside a browser. */
export function colourFromUrl(): string | null {
	if (typeof window === 'undefined') return null;
	return colourFromQuery(window.location.search);
}

/**
 * Makes a colour tool a workflow source: `<div {{carryColour this.hex}}>`
 * pushes whatever it shows, and the flow's Next carries it as `?color=`.
 */
export const carryColour = modifier(
	(_element: Element, [hex]: [string | undefined]) => {
		const flow = flowHooks.current;
		if (flow) flow.colour = hex ?? null;
		return () => {
			if (flowHooks.current) flowHooks.current.colour = null;
		};
	},
);
