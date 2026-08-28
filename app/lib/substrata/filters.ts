import type { FxDefinition, ParamSpec } from './param-spec';

export type FilterCategory = 'colour' | 'filter';

export interface FilterDefinition extends FxDefinition {
	category: FilterCategory;
	tier: 0 | 1;
}

export interface FilmSimPreset {
	id: string;
	label: string;
	swatch: [string, string, string];
}

export const FILM_SIM_PRESETS: FilmSimPreset[] = [
	{
		id: 'sim-01',
		label: 'Golden Hour',
		swatch: ['#d4952a', '#8a5a2a', '#2a1f14'],
	},
	{
		id: 'sim-02',
		label: 'Blockbuster',
		swatch: ['#e8833a', '#1f6f6b', '#132a2a'],
	},
	{
		id: 'sim-03',
		label: 'Matinee',
		swatch: ['#e8c8b8', '#b8c8c0', '#6a7a72'],
	},
	{
		id: 'sim-04',
		label: 'Nocturne',
		swatch: ['#7a9ac8', '#3a4a6a', '#141a2a'],
	},
	{
		id: 'sim-05',
		label: 'Gelatin Silver',
		swatch: ['#e8e8e4', '#8a8a86', '#1d1d1c'],
	},
	{
		id: 'sim-06',
		label: 'Evergreen',
		swatch: ['#a8c89a', '#4a7a4a', '#14231a'],
	},
	{
		id: 'sim-07',
		label: 'Vapourwave',
		swatch: ['#e89ab8', '#8a5a9a', '#2a1a2e'],
	},
	{
		id: 'sim-08',
		label: 'Carousel',
		swatch: ['#e0573f', '#8a3a2a', '#241412'],
	},
];

export interface FilmSimGrade {
	lift: [number, number, number];
	gain: [number, number, number];
	gamma: [number, number, number];
	sat: number;
}

export function applyGradeToImageData(
	data: Uint8ClampedArray,
	grade: FilmSimGrade,
	intensity: number,
): void {
	const { lift, gain, gamma, sat } = grade;
	const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
	for (let i = 0; i < data.length; i += 4) {
		const graded = [0, 0, 0];
		for (let k = 0; k < 3; k++) {
			const v = data[i + k]! / 255;
			graded[k] = Math.pow(
				clamp01(v * gain[k]! + lift[k]! * (1 - v)),
				gamma[k]!,
			);
		}
		const lum =
			graded[0]! * 0.2126 +
			graded[1]! * 0.7152 +
			graded[2]! * 0.0722;
		for (let k = 0; k < 3; k++) {
			const c = clamp01(lum + (graded[k]! - lum) * sat);
			data[i + k]! += (c * 255 - data[i + k]!) * intensity;
		}
	}
}

export const FILM_SIM_GRADES: Record<string, FilmSimGrade> = {
	'sim-01': {
		lift: [0.05, 0.03, 0],
		gain: [1.06, 1.0, 0.86],
		gamma: [0.94, 0.98, 1.05],
		sat: 1.1,
	},
	'sim-02': {
		lift: [0, 0.035, 0.055],
		gain: [1.09, 1.0, 0.85],
		gamma: [1.05, 1.0, 0.97],
		sat: 1.12,
	},
	'sim-03': {
		lift: [0.09, 0.08, 0.075],
		gain: [1.0, 0.98, 0.94],
		gamma: [0.9, 0.9, 0.93],
		sat: 0.8,
	},
	'sim-04': {
		lift: [0, 0.012, 0.05],
		gain: [0.9, 0.96, 1.08],
		gamma: [1.1, 1.05, 0.97],
		sat: 0.85,
	},
	'sim-05': {
		lift: [0.01, 0.01, 0.01],
		gain: [1.03, 1.03, 1.03],
		gamma: [1.1, 1.1, 1.1],
		sat: 0,
	},
	'sim-06': {
		lift: [0.012, 0.03, 0.012],
		gain: [0.96, 1.05, 0.93],
		gamma: [1.0, 0.95, 1.02],
		sat: 1.05,
	},
	'sim-07': {
		lift: [0.07, 0.02, 0.09],
		gain: [1.05, 0.93, 1.1],
		gamma: [0.92, 1.0, 0.9],
		sat: 1.15,
	},
	'sim-08': {
		lift: [0.025, 0.005, 0],
		gain: [1.1, 0.97, 0.88],
		gamma: [0.97, 1.04, 1.1],
		sat: 1.18,
	},
};

export const DUOTONE_PAIRS: {
	id: string;
	label: string;
	shadow: string;
	highlight: string;
}[] = [
	{
		id: 'duo-01',
		label: 'Heritage',
		shadow: '#1a2456',
		highlight: '#f5e9d0',
	},
	{
		id: 'duo-02',
		label: 'Xerox',
		shadow: '#000000',
		highlight: '#00c2d1',
	},
	{
		id: 'duo-03',
		label: 'Nightclub',
		shadow: '#3b1f5e',
		highlight: '#ffd166',
	},
	{
		id: 'duo-04',
		label: 'Botanic',
		shadow: '#16351f',
		highlight: '#baf2c5',
	},
	{
		id: 'duo-05',
		label: 'Darkroom',
		shadow: '#641220',
		highlight: '#ffc49b',
	},
	{
		id: 'duo-06',
		label: 'Furnace',
		shadow: '#232323',
		highlight: '#ff7f2a',
	},
	{
		id: 'duo-07',
		label: 'Dusk',
		shadow: '#2d1b69',
		highlight: '#ff9ecd',
	},
	{
		id: 'duo-08',
		label: 'Lagoon',
		shadow: '#0f4c4c',
		highlight: '#e8d5a3',
	},
];

const amount = (def = 0): ParamSpec => ({
	kind: 'slider',
	key: 'amount',
	label: 'Amount',
	min: -100,
	max: 100,
	step: 1,
	default: def,
});

const pct = (key: string, label: string, def: number): ParamSpec => ({
	kind: 'slider',
	key,
	label,
	min: 0,
	max: 100,
	step: 1,
	default: def,
	unit: '%',
});

const level = (key: string, label: string, def: number): ParamSpec => ({
	kind: 'slider',
	key,
	label,
	min: 0,
	max: 255,
	step: 1,
	default: def,
});

const gammaChannel = (key: string, label: string): ParamSpec => ({
	kind: 'slider',
	key,
	label,
	min: 0.2,
	max: 2.2,
	step: 0.01,
	default: 1,
});

export const FILTER_REGISTRY: Record<string, FilterDefinition> = {
	brightness: {
		type: 'brightness',
		category: 'filter',
		tier: 0,
		label: 'Brightness',
		params: [amount()],
	},
	contrast: {
		type: 'contrast',
		category: 'filter',
		tier: 0,
		label: 'Contrast',
		params: [amount()],
	},
	exposure: {
		type: 'exposure',
		category: 'filter',
		tier: 0,
		label: 'Exposure',
		params: [amount()],
	},
	saturation: {
		type: 'saturation',
		category: 'filter',
		tier: 0,
		label: 'Saturation',
		params: [amount()],
	},
	vibrance: {
		type: 'vibrance',
		category: 'filter',
		tier: 0,
		label: 'Vibrance',
		params: [amount()],
	},
	'hue-rotate': {
		type: 'hue-rotate',
		category: 'filter',
		tier: 0,
		label: 'Hue rotate',
		params: [
			{
				kind: 'slider',
				key: 'angle',
				label: 'Angle',
				min: -180,
				max: 180,
				step: 1,
				default: 0,
				unit: '°',
			},
		],
	},
	temperature: {
		type: 'temperature',
		category: 'filter',
		tier: 0,
		label: 'Temperature',
		params: [amount()],
	},
	grayscale: {
		type: 'grayscale',
		category: 'filter',
		tier: 0,
		label: 'Greyscale',
		params: [],
	},
	sepia: {
		type: 'sepia',
		category: 'filter',
		tier: 0,
		label: 'Sepia',
		params: [],
	},
	invert: {
		type: 'invert',
		category: 'filter',
		tier: 0,
		label: 'Invert',
		params: [],
	},
	// custom shader filters
	threshold: {
		type: 'threshold',
		category: 'filter',
		tier: 1,
		label: 'Threshold',
		params: [level('level', 'Level', 128)],
	},
	gamma: {
		type: 'gamma',
		category: 'filter',
		tier: 0,
		label: 'Gamma',
		params: [
			gammaChannel('red', 'Red'),
			gammaChannel('green', 'Green'),
			gammaChannel('blue', 'Blue'),
		],
	},
	posterize: {
		type: 'posterize',
		category: 'filter',
		tier: 1,
		label: 'Posterise',
		params: [
			{
				kind: 'stepper',
				key: 'levels',
				label: 'Levels',
				min: 2,
				max: 32,
				step: 1,
				default: 6,
			},
		],
	},

	levels: {
		type: 'levels',
		category: 'filter',
		tier: 1,
		label: 'Levels',
		params: [
			level('inBlack', 'In black', 0),
			level('inWhite', 'In white', 255),
			{
				kind: 'slider',
				key: 'gamma',
				label: 'Gamma',
				min: 0.1,
				max: 10,
				step: 0.01,
				default: 1,
			},
			level('outBlack', 'Out black', 0),
			level('outWhite', 'Out white', 255),
		],
	},
	'colour-balance': {
		type: 'colour-balance',
		category: 'filter',
		tier: 1,
		label: 'Colour balance',
		params: [
			{
				kind: 'slider',
				key: 'cyanRed',
				label: 'Cyan – Red',
				min: -100,
				max: 100,
				step: 1,
				default: 0,
			},
			{
				kind: 'slider',
				key: 'magentaGreen',
				label: 'Magenta – Green',
				min: -100,
				max: 100,
				step: 1,
				default: 0,
			},
			{
				kind: 'slider',
				key: 'yellowBlue',
				label: 'Yellow – Blue',
				min: -100,
				max: 100,
				step: 1,
				default: 0,
			},
		],
	},
	duotone: {
		type: 'duotone',
		category: 'filter',
		tier: 1,
		label: 'Duotone',
		params: [
			{
				kind: 'pairs',
				key: 'pair',
				label: 'Presets',
				options: DUOTONE_PAIRS.map((p) => ({
					value: p.id,
					label: p.label,
					colours: [p.shadow, p.highlight],
					writes: {
						shadowColour: p.shadow,
						highlightColour: p.highlight,
					},
				})),
			},
			{
				kind: 'colour',
				key: 'shadowColour',
				label: 'Shadows',
				default: '#000000',
			},
			{
				kind: 'colour',
				key: 'highlightColour',
				label: 'Highlights',
				default: '#ffffff',
			},
			pct('midpoint', 'Midpoint', 50),
		],
	},

	'gaussian-blur': {
		type: 'gaussian-blur',
		category: 'filter',
		tier: 0,
		label: 'Gaussian blur',
		params: [
			{
				kind: 'slider',
				key: 'radius',
				label: 'Radius',
				min: 0,
				max: 50,
				step: 0.5,
				default: 10,
				unit: 'px',
			},
		],
	},
	sharpen: {
		type: 'sharpen',
		category: 'filter',
		tier: 0,
		label: 'Sharpen',
		params: [pct('amount', 'Amount', 100)],
	},
	emboss: {
		type: 'emboss',
		category: 'filter',
		tier: 0,
		label: 'Emboss',
		params: [pct('amount', 'Amount', 100)],
	},
	'edge-detect': {
		type: 'edge-detect',
		category: 'filter',
		tier: 0,
		label: 'Edge detect',
		params: [],
	},
	noise: {
		type: 'noise',
		category: 'filter',
		tier: 0,
		label: 'Noise',
		params: [
			pct('amount', 'Amount', 25),
			// mono shares rgb grain
			{
				kind: 'select',
				key: 'mode',
				label: 'Mode',
				default: 'mono',
				options: [
					{ value: 'mono', label: 'Monochrome' },
					{ value: 'colour', label: 'Colour' },
				],
			},
		],
	},
	pixelate: {
		type: 'pixelate',
		category: 'filter',
		tier: 0,
		label: 'Pixelate',
		params: [
			{
				kind: 'stepper',
				key: 'blockSize',
				label: 'Block size',
				min: 2,
				max: 64,
				step: 1,
				default: 8,
				unit: 'px',
			},
		],
	},
	vignette: {
		type: 'vignette',
		category: 'filter',
		tier: 1,
		label: 'Vignette',
		params: [
			pct('amount', 'Amount', 50),
			pct('midpoint', 'Midpoint', 50),
			pct('roundness', 'Roundness', 0),
			pct('feather', 'Feather', 50),
			{
				kind: 'colour',
				key: 'colour',
				label: 'Colour',
				default: '#000000',
			},
		],
	},

	'film-sim': {
		type: 'film-sim',
		category: 'colour',
		tier: 1,
		label: 'Film sim',
		params: [
			{
				kind: 'presets',
				key: 'preset',
				label: 'Preset',
				default: FILM_SIM_PRESETS[0]!.id,
				options: FILM_SIM_PRESETS.map((p) => ({
					value: p.id,
					label: p.label,
					swatch: p.swatch,
				})),
			},
			pct('intensity', 'Intensity', 100),
		],
	},
};

export const getFilterDef = (type: string): FilterDefinition | undefined =>
	FILTER_REGISTRY[type];
