import type { EffectPhase } from './doc-model';
import type { FxDefinition, ParamSpec } from './param-spec';

export interface EffectDefinition extends FxDefinition {
	phase: EffectPhase;
}

const colour = (key: string, label: string, def: string): ParamSpec => ({
	kind: 'colour',
	key,
	label,
	default: def,
});

const offset = (key: string, label: string, def: number): ParamSpec => ({
	kind: 'stepper',
	key,
	label,
	min: -500,
	max: 500,
	step: 1,
	default: def,
	unit: 'px',
});

export const EFFECT_REGISTRY: Record<string, EffectDefinition> = {
	'drop-shadow': {
		type: 'drop-shadow',
		phase: 'outer',
		label: 'Drop shadow',
		params: [
			colour('colour', 'Colour', '#000000'),
			{
				kind: 'slider',
				key: 'opacity',
				label: 'Opacity',
				min: 0,
				max: 100,
				step: 1,
				default: 35,
				unit: '%',
			},
			{
				kind: 'slider',
				key: 'blur',
				label: 'Blur',
				min: 0,
				max: 250,
				step: 1,
				default: 24,
				unit: 'px',
			},
			offset('offsetX', 'Offset X', 8),
			offset('offsetY', 'Offset Y', 8),
			{
				kind: 'slider',
				key: 'spread',
				label: 'Spread',
				min: 0,
				max: 100,
				step: 1,
				default: 0,
				unit: 'px',
			},
		],
	},
	'outer-glow': {
		type: 'outer-glow',
		phase: 'outer',
		label: 'Outer glow',
		params: [
			colour('colour', 'Colour', '#ffffff'),
			{
				kind: 'slider',
				key: 'blur',
				label: 'Blur',
				min: 0,
				max: 250,
				step: 1,
				default: 40,
				unit: 'px',
			},
			{
				kind: 'slider',
				key: 'intensity',
				label: 'Intensity',
				min: 0,
				max: 100,
				step: 1,
				default: 50,
				unit: '%',
			},
		],
	},
	// renderer splits stroke phases
	stroke: {
		type: 'stroke',
		phase: 'outer',
		label: 'Stroke',
		params: [
			colour('colour', 'Colour', '#000000'),
			{
				kind: 'stepper',
				key: 'width',
				label: 'Width',
				min: 1,
				max: 100,
				step: 1,
				default: 2,
				unit: 'px',
			},
			{
				kind: 'select',
				key: 'position',
				label: 'Position',
				default: 'outer',
				options: [
					{ value: 'outer', label: 'Outer' },
					{ value: 'centre', label: 'Centre' },
					{ value: 'inner', label: 'Inner' },
				],
			},
		],
	},
	'inner-shadow': {
		type: 'inner-shadow',
		phase: 'inner',
		label: 'Inner shadow',
		params: [
			colour('colour', 'Colour', '#000000'),
			{
				kind: 'slider',
				key: 'opacity',
				label: 'Opacity',
				min: 0,
				max: 100,
				step: 1,
				default: 35,
				unit: '%',
			},
			{
				kind: 'slider',
				key: 'blur',
				label: 'Blur',
				min: 0,
				max: 250,
				step: 1,
				default: 18,
				unit: 'px',
			},
			offset('offsetX', 'Offset X', 6),
			offset('offsetY', 'Offset Y', 6),
		],
	},
	'inner-glow': {
		type: 'inner-glow',
		phase: 'inner',
		label: 'Inner glow',
		params: [
			colour('colour', 'Colour', '#ffffff'),
			{
				kind: 'slider',
				key: 'blur',
				label: 'Blur',
				min: 0,
				max: 250,
				step: 1,
				default: 24,
				unit: 'px',
			},
			{
				kind: 'slider',
				key: 'intensity',
				label: 'Intensity',
				min: 0,
				max: 100,
				step: 1,
				default: 50,
				unit: '%',
			},
		],
	},
	'colour-overlay': {
		type: 'colour-overlay',
		phase: 'inner',
		label: 'Colour overlay',
		params: [
			colour('colour', 'Colour', '#000000'),
			{
				kind: 'slider',
				key: 'opacity',
				label: 'Opacity',
				min: 0,
				max: 100,
				step: 1,
				default: 100,
				unit: '%',
			},
		],
	},
	// process before effects
	'remove-background': {
		type: 'remove-background',
		phase: 'inner',
		label: 'Remove background',
		params: [],
	},
};

export const getEffectDef = (type: string): EffectDefinition | undefined =>
	EFFECT_REGISTRY[type];
