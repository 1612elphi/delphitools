/**
 * Picker-card icon per FX registry type (kebab-case lucide names). A UI concern,
 * so it does not live in the effects/filters registries — but it is a plain .ts
 * rather than part of fx-panel.gts because scripts/gen-icons.mjs imports it:
 * names reached through a map are invisible to the generator's template scan.
 */
export const FX_ICONS: Record<string, string> = {
	brightness: 'sun',
	contrast: 'contrast',
	exposure: 'aperture',
	saturation: 'droplet',
	vibrance: 'droplets',
	'hue-rotate': 'rainbow',
	temperature: 'thermometer',
	grayscale: 'eclipse',
	sepia: 'coffee',
	invert: 'circle-slash',
	threshold: 'binary',
	gamma: 'spline',
	posterize: 'chart-column-big',
	levels: 'sliders-horizontal',
	'colour-balance': 'scale',
	duotone: 'blend',
	'gaussian-blur': 'circle-dashed',
	sharpen: 'focus',
	emboss: 'stamp',
	'edge-detect': 'scan-line',
	noise: 'grip',
	pixelate: 'grid-3x3',
	vignette: 'circle-dot',
	'drop-shadow': 'square-stack',
	'outer-glow': 'lightbulb',
	stroke: 'square',
	'inner-shadow': 'square-square',
	'inner-glow': 'sparkle',
	'colour-overlay': 'paint-bucket',
	'remove-background': 'scissors',
};

/** Unknown types fall back to the add glyph. */
export const FX_ICON_FALLBACK = 'plus';
