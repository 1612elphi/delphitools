import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import { carryColour, colourFromUrl } from 'delphitools-v2/lib/colour-query';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import {
	hexToRgb,
	rgbToHex,
	rgbToHsl,
	rgbToXyz,
	xyzToLab,
	labToLch,
	rgbToOklab,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';
import {
	parseColour,
	type ColourFormat,
} from 'delphitools-v2/lib/colour-parse';

export type { ColourFormat };

export interface ColourValues {
	hex: string;
	rgb: Triple;
	hsl: Triple;
	lab: Triple;
	lch: Triple;
	oklab: Triple;
	oklch: Triple;
}

export const FORMATS: {
	id: ColourFormat;
	name: string;
	placeholder: string;
}[] = [
	{ id: 'hex', name: 'HEX', placeholder: '#3b82f6' },
	{ id: 'rgb', name: 'RGB', placeholder: '59, 130, 246' },
	{
		id: 'rgb-decimal',
		name: 'Decimal RGB',
		placeholder: '0.2314, 0.5098, 0.9647',
	},
	{ id: 'hsl', name: 'HSL', placeholder: '217, 91%, 60%' },
	{ id: 'lab', name: 'LAB', placeholder: '54.5, 8.5, -65.5' },
	{ id: 'lch', name: 'LCH', placeholder: '54.5, 66.0, 277.5' },
	{ id: 'oklab', name: 'OKLAB', placeholder: '0.64, -0.01, -0.15' },
	{ id: 'oklch', name: 'OKLCH', placeholder: '0.64, 0.15, 264' },
];

export function convert(
	format: ColourFormat,
	value: string,
): ColourValues | null {
	const parsed = parseColour(format, value);
	if (!parsed) return null;

	const rgb = parsed.map((n) =>
		Math.max(0, Math.min(255, Math.round(n))),
	) as Triple;
	const lab = xyzToLab(...rgbToXyz(...rgb));
	const oklab = rgbToOklab(...rgb);

	return {
		hex: rgbToHex(...rgb),
		rgb,
		hsl: rgbToHsl(...rgb),
		lab,
		lch: labToLch(...lab),
		oklab,
		oklch: labToLch(...oklab),
	};
}

export function formatOutput(format: ColourFormat, v: ColourValues): string {
	switch (format) {
		case 'hex':
			return v.hex;
		case 'rgb':
			return `rgb(${v.rgb.join(', ')})`;
		case 'rgb-decimal':
			return `rgb(${v.rgb.map((n) => (n / 255).toFixed(4)).join(', ')})`;
		case 'hsl':
			return `hsl(${v.hsl[0].toFixed(1)}, ${v.hsl[1].toFixed(1)}%, ${v.hsl[2].toFixed(1)}%)`;
		case 'lab':
			return `lab(${v.lab[0].toFixed(2)} ${v.lab[1].toFixed(2)} ${v.lab[2].toFixed(2)})`;
		case 'lch':
			return `lch(${v.lch[0].toFixed(2)} ${v.lch[1].toFixed(2)} ${v.lch[2].toFixed(1)})`;
		case 'oklab':
			return `oklab(${v.oklab[0].toFixed(4)} ${v.oklab[1].toFixed(4)} ${v.oklab[2].toFixed(4)})`;
		case 'oklch':
			return `oklch(${v.oklch[0].toFixed(4)} ${v.oklch[1].toFixed(4)} ${v.oklch[2].toFixed(1)})`;
	}
}

const EXAMPLES: [string, string][] = [
	['HEX', '#3b82f6'],
	['RGB', '59, 130, 246'],
	['Decimal RGB', '0.2314, 0.5098, 0.9647'],
	['HSL', '217, 91%, 60%'],
	['LAB', '54.5 8.5 -65.5'],
	['LCH', '54.5 66.0 277.5'],
	['OKLAB', '0.64 -0.01 -0.15'],
	['OKLCH', '0.64 0.15 264'],
];

const COPIED_MS = 1500;

export default class ColourConverterTool extends Component {
	@tracked inputFormat: ColourFormat = 'hex';
	@tracked inputValue = colourFromUrl() ?? '#3b82f6';
	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get formats() {
		return FORMATS;
	}

	get examples() {
		return EXAMPLES.map(([label, example]) => ({ label, example }));
	}

	@cached
	get values() {
		return convert(this.inputFormat, this.inputValue);
	}

	get formatName() {
		return (
			FORMATS.find((f) => f.id === this.inputFormat)?.name ??
			''
		);
	}

	get placeholder() {
		return (
			FORMATS.find((f) => f.id === this.inputFormat)
				?.placeholder ?? ''
		);
	}

	get swatchHex() {
		return this.values?.hex ?? '#ffffff';
	}

	get swatchStyle() {
		return htmlSafe(`background-color: ${this.swatchHex}`);
	}

	get rows() {
		const values = this.values;
		if (!values) return [];
		return FORMATS.map((format) => {
			const output = formatOutput(format.id, values);
			return {
				id: format.id,
				name: format.name,
				output,
				isCopied: this.copied === output,
			};
		});
	}

	setValue = (event: Event) => {
		this.inputValue = (event.target as HTMLInputElement).value;
	};

	chooseFormat = (id: string) => {
		const next = id as ColourFormat;
		const values = this.values;
		if (values) this.inputValue = formatOutput(next, values);
		this.inputFormat = next;
	};

	pickColour = (event: Event) => {
		const hex = (event.target as HTMLInputElement).value;
		if (!hexToRgb(hex)) return;
		this.inputFormat = 'hex';
		this.inputValue = hex;
	};

	copy = async (value: string) => {
		await navigator.clipboard.writeText(value);
		this.copied = value;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copyRow = (value: string) => void this.copy(value);

	<template>
		<div class="dt-cc" {{carryColour this.values.hex}}>
			<div class="dt-cc-input">
				<span class="dt-cc-swatch">
					<span
						style={{this.swatchStyle}}
						aria-hidden="true"
					></span>
					<input
						type="color"
						value={{this.swatchHex}}
						aria-label="Pick colour"
						{{on "input" this.pickColour}}
					/>
				</span>

				<span class="dt-cc-field">
					<span class="dt-cc-label">Format</span>
					<Select
						@value={{this.inputFormat}}
						@onValueChange={{this.chooseFormat}}
					>
						<SelectTrigger>
							<SelectValue
							>{{this.formatName}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{{#each
								this.formats
								key="id"
								as |format|
							}}
								<SelectItem
									@value={{format.id}}
								>{{format.name}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
				</span>

				<span class="dt-cc-field is-wide">
					<span class="dt-cc-label">Value</span>
					<input
						type="text"
						class="dt-cc-value"
						value={{this.inputValue}}
						placeholder={{this.placeholder}}
						aria-label="Colour value"
						{{on "input" this.setValue}}
					/>
				</span>
			</div>

			<div class="dt-cc-section">
				<span class="dt-cc-heading">All Formats</span>
			</div>

			{{#if this.rows}}
				<div class="dt-cc-table">
					{{#each this.rows key="id" as |row|}}
						<div class="dt-cc-row">
							<span
								class="dt-cc-name"
							>{{row.name}}</span>
							<code
								class="dt-cc-out"
							>{{row.output}}</code>
							<button
								type="button"
								class="dt-cc-copy"
								aria-label="Copy
									{{row.name}}"
								{{on
									"click"
									(fn
										this.copyRow
										row.output
									)
								}}
							>
								<Icon
									@name={{if
										row.isCopied
										"check"
										"copy"
									}}
								/>
							</button>
						</div>
					{{/each}}
				</div>
			{{else}}
				<p class="dt-cc-empty">Enter a valid colour
					value to see conversions</p>
			{{/if}}

			<div class="dt-cc-section is-top">
				<span class="dt-cc-heading">Format Examples</span>
			</div>
			<div class="dt-cc-examples">
				{{#each this.examples key="label" as |example|}}
					<div class="dt-cc-example">
						<span
							class="dt-cc-example-label"
						>{{example.label}}</span>
						<code>{{example.example}}</code>
					</div>
				{{/each}}
			</div>
		</div>
	</template>
}
