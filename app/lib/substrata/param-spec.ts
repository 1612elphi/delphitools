interface BaseParam {
	key: string;
	label: string;
}

interface NumericParam extends BaseParam {
	min: number;
	max: number;
	step: number;
	default: number;
	/** stored values omit units */
	unit?: string;
}

/** drag creates one undo */
export interface SliderParam extends NumericParam {
	kind: 'slider';
}

/** click creates one undo */
export interface StepperParam extends NumericParam {
	kind: 'stepper';
}

export interface ColourParam extends BaseParam {
	kind: 'colour';
	default: string;
}

export interface SelectParam extends BaseParam {
	kind: 'select';
	default: string;
	options: { value: string; label: string }[];
}

export interface PresetsParam extends BaseParam {
	kind: 'presets';
	default: string;
	options: { value: string; label: string; swatch: string[] }[];
}

/** pairs write other parameters */
export interface PairsParam extends BaseParam {
	kind: 'pairs';
	options: {
		value: string;
		label: string;
		colours: [string, string];
		writes: Record<string, string>;
	}[];
}

export type ParamSpec =
	| SliderParam
	| StepperParam
	| ColourParam
	| SelectParam
	| PresetsParam
	| PairsParam;

export interface FxDefinition {
	type: string;
	label: string;
	params: ParamSpec[];
}

export function defaultParams(
	specs: ParamSpec[],
): Record<string, number | string> {
	const out: Record<string, number | string> = {};
	for (const s of specs) {
		if (s.kind === 'pairs') continue; // pairs store no value
		out[s.key] = s.default;
	}
	return out;
}
