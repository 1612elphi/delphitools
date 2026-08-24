import { modifier } from 'ember-modifier';
import { hexToRgb } from './colour-maths';
import { flowHooks } from './flow-hooks';

export function colourFromQuery(search: string): string | null {
	const param = new URLSearchParams(search).get('color');
	if (!param) return null;
	const hex = param.startsWith('#') ? param : `#${param}`;
	return hexToRgb(hex) ? hex : null;
}

export function colourToQuery(hex: string): string {
	return hex.replace(/^#/, '');
}

export function colourFromUrl(): string | null {
	if (typeof window === 'undefined') return null;
	return colourFromQuery(window.location.search);
}

export const carryColour = modifier(
	(_element: Element, [hex]: [string | undefined]) => {
		const flow = flowHooks.current;
		if (flow) flow.colour = hex ?? null;
		return () => {
			if (flowHooks.current) flowHooks.current.colour = null;
		};
	},
);
