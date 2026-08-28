import { hexToRgb } from './colour-convert';
import type { TextLayer, TextPlate } from './doc-model';

export type TextStylePreset = 'regular' | 'outline' | 'pill' | 'rectangle';

export const TEXT_STYLE_PRESETS: Array<{ id: TextStylePreset; label: string }> =
	[
		{ id: 'regular', label: 'Regular' },
		{ id: 'outline', label: 'Outline' },
		{ id: 'pill', label: 'Pill' },
		{ id: 'rectangle', label: 'Rectangle' },
	];

export interface TextStyleFields {
	fill: string;
	stroke: TextLayer['stroke'];
	plate: TextPlate | null;
}

export function contrastInk(bg: string): string {
	const rgb = hexToRgb(bg);
	if (!rgb) return '#1d1d1d';
	const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
	return lum > 0.55 ? '#1d1d1d' : '#f4f1ea';
}

export function styleFields(
	preset: TextStylePreset,
	accent: string,
	fontSize: number,
): TextStyleFields {
	switch (preset) {
		case 'regular':
			return { fill: accent, stroke: null, plate: null };
		case 'outline':
			return {
				fill: 'transparent',
				stroke: {
					colour: accent,
					width: Math.max(
						2,
						Math.round(fontSize / 16),
					),
				},
				plate: null,
			};
		case 'pill':
		case 'rectangle':
			return {
				fill: contrastInk(accent),
				stroke: null,
				plate: {
					shape: preset,
					colour: accent,
					padding: Math.round(fontSize * 0.35),
				},
			};
	}
}

export function deriveTextStyle(
	layer: Pick<TextLayer, 'stroke' | 'plate'>,
): TextStylePreset {
	if (layer.plate) return layer.plate.shape;
	if (layer.stroke) return 'outline';
	return 'regular';
}

export function textAccent(
	layer: Pick<TextLayer, 'fill' | 'stroke' | 'plate'>,
): string {
	return layer.plate?.colour ?? layer.stroke?.colour ?? layer.fill;
}

/** legacy text defaults */
export const DEFAULT_TEXT_PROPS = {
	align: 'left',
	lineHeight: 1.16,
	charSpacing: 0,
	direction: 'ltr',
} as const;
