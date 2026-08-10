import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { service } from '@ember/service';
import Icon from 'delphitools-v2/components/icon';
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
	rgbToOklch,
	oklabToRgb,
	lchToLab,
	maxOklchChroma,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';
import { colourFromQuery } from 'delphitools-v2/lib/colour-query';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

const DEFAULT_COLOUR = '#3b82f6';
const COPIED_MS = 1500;

/**
 * Each Tailwind level with the OKLCH lightness it aims for. The Next app held
 * the levels and the lightnesses in two structures keyed by level; one list of
 * pairs cannot fall out of step with itself.
 */
const SHADE_TARGETS: [level: number, lightness: number][] = [
	[50, 0.97],
	[100, 0.93],
	[200, 0.87],
	[300, 0.78],
	[400, 0.66],
	[500, 0.55],
	[600, 0.47],
	[700, 0.4],
	[800, 0.33],
	[900, 0.27],
	[950, 0.2],
];

export type GenerationMode =
	'classic' | 'hue-shift' | 'luminance-anchored' | 'vivid' | 'muted';

// Labels and descriptions carried over from the Next app, verbatim.
export const GENERATION_MODES: {
	value: GenerationMode;
	label: string;
	description: string;
}[] = [
	{
		value: 'classic',
		label: 'Classic',
		description:
			'Standard Tailwind-style generation with uniform hue',
	},
	{
		value: 'hue-shift',
		label: 'Hue Shift',
		description: 'Warm tones for lighter shades, cool for darker',
	},
	{
		value: 'luminance-anchored',
		label: 'Luminance Anchored',
		description: 'Anchors to true white/black for better contrast',
	},
	{
		value: 'vivid',
		label: 'Vivid',
		description: 'Maximizes saturation across all shades',
	},
	{
		value: 'muted',
		label: 'Muted',
		description: 'Subtle, desaturated tones throughout',
	},
];

export interface Shade {
	level: number;
	hex: string;
	oklch: Triple;
}

/**
 * How much of the base colour's saturation a mode keeps: at the light end of
 * the ramp, across the middle, and at the dark end. Above 1 pushes toward the
 * edge of sRGB, and saturation is capped there.
 */
const MODE_RAMPS: Record<
	GenerationMode,
	[light: number, mid: number, dark: number]
> = {
	classic: [0.75, 1, 0.85],
	'hue-shift': [0.75, 1, 0.85],
	'luminance-anchored': [0.5, 1, 0.6],
	vivid: [1, 1.35, 1.15],
	muted: [0.3, 0.5, 0.4],
};

/**
 * The saturation multiplier at `index`, easing into the middle over two levels
 * at each end. Stepping instead — one flat bucket over 50 and 100, the middle
 * value from 200 on — put a near-doubling of chroma between 100 and 200, and
 * 100 came out visibly grey beside both its neighbours.
 */
function rampScale(index: number, mode: GenerationMode): number {
	const [light, mid, dark] = MODE_RAMPS[mode];
	const fromEnd = SHADE_TARGETS.length - 1 - index;
	if (index < 2) return light + (mid - light) * (index / 2);
	if (fromEnd < 2) return dark + (mid - dark) * (fromEnd / 2);
	return mid;
}

/** The OKLCH the level at `index` lands on, as [L, chroma, hue]. */
function shadeParams(
	index: number,
	targetL: number,
	baseSat: number,
	baseH: number,
	mode: GenerationMode,
): Triple {
	const fromEnd = SHADE_TARGETS.length - 1 - index;
	const l =
		mode !== 'luminance-anchored'
			? targetL
			: index < 2
				? targetL + (1 - targetL) * 0.3
				: fromEnd < 2
					? targetL * 0.8
					: targetL;
	// ±15 degrees, warm at the light end and cool at the dark end
	const h =
		mode === 'hue-shift'
			? (baseH + (targetL - 0.5) * 2 * 15 + 360) % 360
			: baseH;
	const sat = Math.min(1, baseSat * rampScale(index, mode));
	return [l, sat * maxOklchChroma(l, h), h];
}

/** Null when the base colour does not parse, which blanks the whole output. */
export function generateShades(
	baseHex: string,
	mode: GenerationMode,
): Shade[] | null {
	const rgb = hexToRgb(baseHex);
	if (!rgb) return null;

	// Only saturation and hue come from the base colour: lightness is the
	// ramp's. Saturation is chroma as a fraction of the most this hue can hold
	// at that lightness, not chroma itself — sRGB holds two to three times as
	// much chroma at L 0.7 as it does at L 0.95, so a ramp built on a fixed
	// chroma reads as vivid at one end and grey at the other. Tailwind's own
	// palettes sit within a tenth of the sRGB edge at every level.
	const [baseL, baseC, baseH] = rgbToOklch(...rgb);
	const baseMax = maxOklchChroma(baseL, baseH);
	const baseSat = baseMax > 0 ? Math.min(1, baseC / baseMax) : 0;

	return SHADE_TARGETS.map(([level, targetL], index) => {
		const oklch = shadeParams(index, targetL, baseSat, baseH, mode);
		return {
			level,
			hex: rgbToHex(...oklabToRgb(...lchToLab(...oklch))),
			oklch,
		};
	});
}

/**
 * `?color=3b82f6` — the link palette-genny's shade button builds, with or
 * without the leading #. Null for anything that is not a six-digit hex, so a
 * junk link falls back to the default rather than an empty tool.
 *
 * Takes the query string rather than reading location, so it is testable.
 */
function colourFromUrl(): string | null {
	if (typeof window === 'undefined') return null;
	return colourFromQuery(window.location.search);
}

export default class TailwindShadesTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked baseColour = colourFromUrl() ?? DEFAULT_COLOUR;
	@tracked colourName = 'primary';
	@tracked mode: GenerationMode = 'classic';
	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get modes() {
		return GENERATION_MODES;
	}

	get modeLabel() {
		return (
			GENERATION_MODES.find((m) => m.value === this.mode)
				?.label ?? ''
		);
	}

	get modeDescription() {
		return (
			GENERATION_MODES.find((m) => m.value === this.mode)
				?.description ?? ''
		);
	}

	get shades() {
		return generateShades(this.baseColour, this.mode);
	}

	/** Half-typed hex paints nothing rather than reaching a style attribute. */
	get baseFillStyle() {
		return htmlSafe(
			hexToRgb(this.baseColour)
				? `background-color: ${this.baseColour}`
				: '',
		);
	}

	get pickerHex() {
		return hexToRgb(this.baseColour) ? this.baseColour : '#000000';
	}

	get rows() {
		const shades = this.shades;
		if (!shades) return [];
		return shades.map((shade) => {
			const value = this.colourNotation.format(shade.hex);
			return {
				level: shade.level,
				hex: shade.hex,
				value,
				title: `${shade.level}: ${value}`,
				fillStyle: htmlSafe(
					`background-color: ${shade.hex}`,
				),
				// The light half of the ramp needs dark text on it, and back.
				lightText: shade.level >= 500,
			};
		});
	}

	get cssBlock() {
		const shades = this.shades;
		if (!shades) return '';
		const lines = shades
			.map(
				(s) =>
					`  --${this.colourName}-${s.level}: ${this.colourNotation.format(s.hex)};`,
			)
			.join('\n');
		return `:root {\n${lines}\n}`;
	}

	get oklchBlock() {
		const shades = this.shades;
		if (!shades) return '';
		const lines = shades
			.map(
				(s) =>
					`  --${this.colourName}-${s.level}: oklch(${s.oklch[0].toFixed(3)} ${s.oklch[1].toFixed(3)} ${s.oklch[2].toFixed(1)});`,
			)
			.join('\n');
		return `:root {\n${lines}\n}`;
	}

	/** Trailing comma so it pastes straight into a theme's colour map. */
	get tailwindBlock() {
		const shades = this.shades;
		if (!shades) return '';
		const entries = shades
			.map(
				(s) =>
					`      ${s.level}: '${this.colourNotation.format(s.hex)}',`,
			)
			.join('\n');
		return `${this.colourName}: {\n${entries}\n    },`;
	}

	get codeBlocks() {
		return [
			// wording carried over from the Next app
			{
				key: 'css',
				label: 'CSS Variables',
				code: this.cssBlock,
			},
			{
				key: 'oklch',
				// wording carried over from the Next app
				label: 'CSS Variables (OKLCH)',
				code: this.oklchBlock,
			},
			{
				key: 'tailwind',
				// wording carried over from the Next app
				label: 'Tailwind Config',
				code: this.tailwindBlock,
			},
		];
	}

	setBaseColour = (event: Event) => {
		this.baseColour = (event.target as HTMLInputElement).value;
	};

	setColourName = (event: Event) => {
		this.colourName = (event.target as HTMLInputElement).value
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '');
	};

	chooseMode = (value: string) => {
		this.mode = value as GenerationMode;
	};

	copy = async (value: string, key: string) => {
		await navigator.clipboard.writeText(value);
		this.copied = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copyValue = (value: string, key: string) => void this.copy(value, key);

	<template>
		<div class="dt-shades">
			<div class="dt-shades-inputs">
				<div class="dt-shades-field">
					{{! wording carried over from the Next app }}
					<span class="dt-shades-label">Base
						Colour</span>
					<div class="dt-shades-combo">
						<span class="dt-shades-picker">
							<span
								style={{this.baseFillStyle}}
								aria-hidden="true"
							></span>
							<input
								type="color"
								value={{this.pickerHex}}
								aria-label="Pick base colour"
								{{on
									"input"
									this.setBaseColour
								}}
							/>
						</span>
						<input
							type="text"
							class="dt-shades-hex"
							value={{this.baseColour}}
							placeholder={{DEFAULT_COLOUR}}
							aria-label="Base colour"
							{{on
								"input"
								this.setBaseColour
							}}
						/>
					</div>
				</div>

				<div class="dt-shades-field">
					{{! wording carried over from the Next app }}
					<span class="dt-shades-label">Colour
						Name</span>
					<input
						type="text"
						class="dt-shades-name"
						value={{this.colourName}}
						placeholder="primary"
						aria-label="Colour name"
						{{on
							"input"
							this.setColourName
						}}
					/>
				</div>

				<div class="dt-shades-field">
					{{! wording carried over from the Next app }}
					<span class="dt-shades-label">Generation
						Mode</span>
					<Select
						@value={{this.mode}}
						@onValueChange={{this.chooseMode}}
					>
						<SelectTrigger
							class="dt-shades-mode"
						>
							<SelectValue
							>{{this.modeLabel}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{{#each
								this.modes
								key="value"
								as |option|
							}}
								<SelectItem
									@value={{option.value}}
								>{{option.label}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
					<p
						class="dt-shades-mode-desc"
					>{{this.modeDescription}}</p>
				</div>
			</div>

			{{#if this.rows}}
				<div class="dt-shades-section">
					<div class="dt-shades-section-head">
						{{! wording carried over from the Next app }}
						<span
							class="dt-shades-label"
						>Generated Shades</span>
					</div>

					<div class="dt-shades-strip">
						{{#each
							this.rows key="level"
							as |row|
						}}
							<button
								type="button"
								class="dt-shades-cell"
								style={{row.fillStyle}}
								title={{row.title}}
								aria-label="Copy
									{{row.level}}"
								{{on
									"click"
									(fn
										this.copyValue
										row.value
										row.hex
									)
								}}
							>
								<span
									class="dt-shades-cell-level
										{{if
											row.lightText
											'is-light'
										}}"
								>{{row.level}}</span>
							</button>
						{{/each}}
					</div>

					<div class="dt-shades-rows">
						{{#each
							this.rows key="level"
							as |row|
						}}
							<div
								class="dt-shades-row"
							>
								<span
									class="dt-shades-level"
								>{{row.level}}</span>
								<span
									class="dt-shades-swatch"
									style={{row.fillStyle}}
									aria-hidden="true"
								></span>
								<span
									class="dt-shades-value"
								>{{row.value}}</span>
								<button
									type="button"
									class="dt-shades-copy
										{{if
											(eq
												this.copied
												row.hex
											)
											'is-copied'
										}}"
									aria-label="Copy
										{{row.level}}"
									{{on
										"click"
										(fn
											this.copyValue
											row.value
											row.hex
										)
									}}
								>
									<Icon
										@name={{if
											(eq
												this.copied
												row.hex
											)
											"check"
											"copy"
										}}
									/>
								</button>
							</div>
						{{/each}}
					</div>
				</div>

				<div class="dt-shades-code">
					{{#each
						this.codeBlocks key="key"
						as |block|
					}}
						<div class="dt-shades-block">
							<div
								class="dt-shades-block-head"
							>
								<span
									class="dt-shades-label"
								>{{block.label}}</span>
								<button
									type="button"
									class="dt-shades-block-copy"
									{{on
										"click"
										(fn
											this.copyValue
											block.code
											block.key
										)
									}}
								>
									<Icon
										@name={{if
											(eq
												this.copied
												block.key
											)
											"check"
											"copy"
										}}
									/>
									Copy
								</button>
							</div>
							<pre
							>{{block.code}}</pre>
						</div>
					{{/each}}
				</div>
			{{/if}}
		</div>
	</template>
}
