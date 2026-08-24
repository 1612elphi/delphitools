import type { BlendMode } from 'delphitools-v2/lib/substrata/doc-model';

export const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
	{ value: 'source-over', label: 'Normal' },
	{ value: 'multiply', label: 'Multiply' },
	{ value: 'screen', label: 'Screen' },
	{ value: 'overlay', label: 'Overlay' },
	{ value: 'darken', label: 'Darken' },
	{ value: 'lighten', label: 'Lighten' },
	{ value: 'color-dodge', label: 'Colour Dodge' },
	{ value: 'color-burn', label: 'Colour Burn' },
	{ value: 'hard-light', label: 'Hard Light' },
	{ value: 'soft-light', label: 'Soft Light' },
	{ value: 'difference', label: 'Difference' },
	{ value: 'exclusion', label: 'Exclusion' },
	{ value: 'hue', label: 'Hue' },
	{ value: 'saturation', label: 'Saturation' },
	{ value: 'color', label: 'Colour' },
	{ value: 'luminosity', label: 'Luminosity' },
];
