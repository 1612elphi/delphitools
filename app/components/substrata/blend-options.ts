import type { BlendMode } from 'delphitools-v2/lib/substrata/doc-model';

// Standard canvas compositing modes → their conventional names (British
// spelling). Treated as functional chrome labels, not authored copy. In the
// Next app this lives in inspector-panel.tsx; extracted here so the Layers
// footer can import it without importing the Inspector.
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
