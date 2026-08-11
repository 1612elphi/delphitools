import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { service } from '@ember/service';
import Icon from 'delphitools-v2/components/icon';
import { colourFromUrl } from 'delphitools-v2/lib/colour-query';
import {
	hexToRgb,
	rgbToHex,
	rgbToOklch,
	oklabToRgb,
	lchToLab,
} from 'delphitools-v2/lib/colour-maths';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

type HarmonyType =
	| 'complementary'
	| 'analogous'
	| 'triadic'
	| 'split-complementary'
	| 'tetradic'
	| 'monochromatic'
	| 'double-complementary'
	| 'compound'
	| 'pentadic'
	| 'analogous-accent'
	| 'golden'
	| 'near-complementary';

interface HarmonyInfo {
	name: string;
	description: string;
	/** Hue offsets from the base, in degrees; unused by monochromatic. */
	angles: number[];
}

// Names and descriptions carried over verbatim from the Next app.
const HARMONIES: Record<HarmonyType, HarmonyInfo> = {
	complementary: {
		name: 'Complementary',
		description: 'Two colours opposite on the colour wheel',
		angles: [0, 180],
	},
	analogous: {
		name: 'Analogous',
		description: 'Three colours adjacent on the wheel',
		angles: [-30, 0, 30],
	},
	triadic: {
		name: 'Triadic',
		description: 'Three colours evenly spaced (120° apart)',
		angles: [0, 120, 240],
	},
	'split-complementary': {
		name: 'Split-Complementary',
		description: 'Base colour plus two adjacent to its complement',
		angles: [0, 150, 210],
	},
	tetradic: {
		name: 'Tetradic (Square)',
		description: 'Four colours evenly spaced (90° apart)',
		angles: [0, 90, 180, 270],
	},
	monochromatic: {
		name: 'Monochromatic',
		description: 'Single hue with varying lightness',
		angles: [0],
	},
	'double-complementary': {
		name: 'Double Complementary',
		description: 'Two complementary pairs forming a rectangle',
		angles: [0, 60, 180, 240],
	},
	compound: {
		name: 'Compound',
		description: 'Analogous colours plus their complements',
		angles: [0, 30, 180, 210],
	},
	pentadic: {
		name: 'Pentadic',
		description: 'Five colours evenly spaced (72° apart)',
		angles: [0, 72, 144, 216, 288],
	},
	'analogous-accent': {
		name: 'Analogous Accent',
		description: 'Analogous colours with a complementary accent',
		angles: [-30, 0, 30, 180],
	},
	golden: {
		name: 'Golden Ratio',
		description: 'Colours spaced by the golden angle (137.5°)',
		angles: [0, 137.5, 275],
	},
	'near-complementary': {
		name: 'Near Complementary',
		description: 'Slightly off-complement for softer contrast',
		angles: [0, 165],
	},
};

const HARMONY_KEYS = Object.keys(HARMONIES) as HarmonyType[];

/** OKLCH lightnesses for the monochromatic ramp; the middle step takes the base's. */
const MONO_LIGHTNESS = [0.85, 0.7, null, 0.4, 0.25];

// Both are pixel values against `.dt-harmony-wheel`, which the partial fixes at
// 14rem square: 112 is its centre, 88 puts the markers just outside the hole.
const WHEEL_CENTRE = 112;
const WHEEL_RADIUS = 88;

const COPIED_MS = 1500;

interface HarmonySwatch {
	hex: string;
	/** OKLCH hue of this swatch, which is where its wheel marker sits. */
	hue: number;
	angle: number;
}

function oklchToHex(l: number, c: number, h: number): string {
	return rgbToHex(...oklabToRgb(...lchToLab(l, c, h)));
}

/** Null when the base does not parse, which blanks every dependent block. */
function generateHarmony(
	baseHex: string,
	type: HarmonyType,
): HarmonySwatch[] | null {
	const rgb = hexToRgb(baseHex);
	if (!rgb) return null;

	const [L, c, h] = rgbToOklch(...rgb);

	if (type === 'monochromatic') {
		return MONO_LIGHTNESS.map((step) => {
			const l = step ?? L;
			// The two lightest steps halve their chroma: a near-white
			// tint at full chroma reads as a different colour.
			return {
				hex: oklchToHex(l, c * (l > 0.7 ? 0.5 : 1), h),
				hue: h,
				angle: 0,
			};
		});
	}

	return HARMONIES[type].angles.map((angle) => {
		const hue = (h + angle + 360) % 360;
		return { hex: oklchToHex(L, c, hue), hue, angle };
	});
}

export default class HarmonyGennyTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked baseColour = colourFromUrl() ?? '#3b82f6';
	@tracked harmonyType: HarmonyType = 'complementary';
	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get harmonyInfo() {
		return HARMONIES[this.harmonyType];
	}

	get harmonyTypes() {
		return HARMONY_KEYS.map((key) => ({
			key,
			name: HARMONIES[key].name,
			isActive: key === this.harmonyType,
		}));
	}

	/** Null while the base hex is unparseable, matching the Next app. */
	get validBase(): string | null {
		return hexToRgb(this.baseColour) ? this.baseColour : null;
	}

	// The text field takes free-form input and this value reaches a style
	// attribute, so an unparseable entry paints nothing rather than being trusted.
	get baseFillStyle() {
		return htmlSafe(
			this.validBase
				? `background-color: ${this.validBase}`
				: '',
		);
	}

	/** `<input type="color">` resets itself on a value it cannot parse. */
	get pickerValue() {
		return this.validBase ?? '#000000';
	}

	get showAngles() {
		return this.harmonyType !== 'monochromatic';
	}

	get swatches() {
		return generateHarmony(this.baseColour, this.harmonyType);
	}

	get rows() {
		const swatches = this.swatches;
		if (!swatches) return null;
		return swatches.map((swatch) => {
			const rad = ((swatch.hue - 90) * Math.PI) / 180;
			const x = WHEEL_CENTRE + WHEEL_RADIUS * Math.cos(rad);
			const y = WHEEL_CENTRE + WHEEL_RADIUS * Math.sin(rad);
			return {
				hex: swatch.hex,
				value: this.colourNotation.format(swatch.hex),
				angleLabel:
					swatch.angle === 0
						? 'Base'
						: `${swatch.angle > 0 ? '+' : ''}${swatch.angle}°`,
				fillStyle: htmlSafe(
					`background-color: ${swatch.hex}`,
				),
				markerStyle: htmlSafe(
					`left: ${x.toFixed(2)}px; top: ${y.toFixed(2)}px; background-color: ${swatch.hex}`,
				),
				isCopied: this.copied === swatch.hex,
			};
		});
	}

	/** Every harmony previewed against the current base, for the bottom table. */
	get allHarmonies() {
		return HARMONY_KEYS.map((key) => ({
			key,
			info: HARMONIES[key],
			isActive: key === this.harmonyType,
			fills: (
				generateHarmony(this.baseColour, key) ?? []
			).map((swatch) =>
				htmlSafe(`background-color: ${swatch.hex}`),
			),
		})).filter((harmony) => harmony.fills.length > 0);
	}

	setBase = (event: Event) => {
		this.baseColour = (event.target as HTMLInputElement).value;
	};

	chooseHarmony = (type: HarmonyType) => {
		this.harmonyType = type;
	};

	copy = async (value: string, label: string) => {
		await navigator.clipboard.writeText(value);
		this.copied = label;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copySwatch = (hex: string) =>
		this.copy(this.colourNotation.format(hex), hex);

	copyAll = () => {
		const swatches = this.swatches;
		if (!swatches) return;
		void this.copy(
			swatches
				.map((s) => this.colourNotation.format(s.hex))
				.join(', '),
			'all',
		);
	};

	copyCss = () => {
		const swatches = this.swatches;
		if (!swatches) return;
		const vars = swatches
			.map(
				(s, i) =>
					`  --harmony-${i + 1}: ${this.colourNotation.format(s.hex)};`,
			)
			.join('\n');
		void this.copy(`:root {\n${vars}\n}`, 'css');
	};

	<template>
		<div class="dt-harmony">
			<div class="dt-harmony-base">
				<span class="dt-harmony-label">Base Colour</span>
				<div class="dt-harmony-base-field">
					<span class="dt-harmony-picker">
						<span
							style={{this.baseFillStyle}}
							aria-hidden="true"
						></span>
						<input
							type="color"
							value={{this.pickerValue}}
							aria-label="Pick base colour"
							{{on
								"input"
								this.setBase
							}}
						/>
					</span>
					<input
						type="text"
						class="dt-harmony-hex"
						value={{this.baseColour}}
						placeholder="#3b82f6"
						aria-label="Base colour"
						{{on "input" this.setBase}}
					/>
				</div>
			</div>

			<div class="dt-harmony-types">
				<span class="dt-harmony-label">Harmony Type</span>
				<div class="segmented dt-harmony-type-grid">
					{{#each
						this.harmonyTypes key="key"
						as |option|
					}}
						<button
							type="button"
							class="dt-harmony-type
								{{if
									option.isActive
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.chooseHarmony
									option.key
								)
							}}
						>{{option.name}}</button>
					{{/each}}
				</div>
			</div>

			{{! wording carried over from the Next app }}
			<div class="dt-harmony-desc">
				<span
					class="dt-harmony-desc-name"
				>{{this.harmonyInfo.name}}</span>
				<span
					class="dt-harmony-desc-text"
				>{{this.harmonyInfo.description}}</span>
			</div>

			{{#if this.rows}}
				<div class="dt-harmony-wheel-wrap">
					<div class="dt-harmony-wheel">
						<span
							class="dt-harmony-wheel-ring"
						></span>
						<span
							class="dt-harmony-wheel-hole"
						></span>
						{{#each
							this.rows key="@index"
							as |row|
						}}
							<span
								class="dt-harmony-marker"
								style={{row.markerStyle}}
							></span>
						{{/each}}
						<span
							class="dt-harmony-wheel-centre"
							style={{this.baseFillStyle}}
						></span>
					</div>
				</div>

				<div class="dt-harmony-strip">
					{{#each
						this.rows key="@index"
						as |row|
					}}
						<button
							type="button"
							class="dt-harmony-strip-cell"
							style={{row.fillStyle}}
							title="Copy {{row.value}}"
							aria-label="Copy {{row.value}}"
							{{on
								"click"
								(fn
									this.copySwatch
									row.hex
								)
							}}
						></button>
					{{/each}}
				</div>

				<div class="dt-harmony-table">
					<div class="dt-harmony-table-head">
						<span
							class="dt-harmony-label"
						>Harmony Colours</span>
					</div>
					{{#each
						this.rows key="@index"
						as |row|
					}}
						<div class="dt-harmony-row">
							<span
								class="dt-harmony-row-swatch"
								style={{row.fillStyle}}
								aria-hidden="true"
							></span>
							<div
								class="dt-harmony-row-value"
							>
								<span
									class="dt-harmony-value"
								>{{row.value}}</span>
								{{#if
									this.showAngles
								}}
									<span
										class="dt-harmony-angle"
									>{{row.angleLabel}}</span>
								{{/if}}
							</div>
							<button
								type="button"
								class="dt-harmony-copy"
								aria-label="Copy colour"
								{{on
									"click"
									(fn
										this.copySwatch
										row.hex
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

				<div class="dt-harmony-export">
					<span
						class="dt-harmony-label"
					>Export</span>
					<div
						class="segmented dt-harmony-export-grid"
					>
						<button
							type="button"
							{{on
								"click"
								this.copyAll
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"all"
									)
									"check"
									"copy"
								}}
							/>
							Copy All
						</button>
						<button
							type="button"
							{{on
								"click"
								this.copyCss
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"css"
									)
									"check"
									"copy"
								}}
							/>
							CSS Variables
						</button>
					</div>
				</div>
			{{/if}}

			<div class="dt-harmony-all">
				<span class="dt-harmony-label">All Harmonies</span>
				<div class="dt-harmony-all-list">
					{{#each
						this.allHarmonies key="key"
						as |harmony|
					}}
						<button
							type="button"
							class="dt-harmony-all-row
								{{if
									harmony.isActive
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.chooseHarmony
									harmony.key
								)
							}}
						>
							<span
								class="dt-harmony-all-strip"
							>
								{{#each
									harmony.fills
									key="@index"
									as |fill|
								}}
									<span
										class="dt-harmony-all-cell"
										style={{fill}}
									></span>
								{{/each}}
							</span>
							{{! wording carried over from the Next app }}
							<span
								class="dt-harmony-all-info"
							>
								<span
									class="dt-harmony-all-name"
								>{{harmony.info.name}}</span>
								<span
									class="dt-harmony-all-desc"
								>{{harmony.info.description}}</span>
							</span>
							<span
								class="dt-harmony-all-check"
							>
								{{#if
									harmony.isActive
								}}
									<Icon
										@name="check"
									/>
								{{/if}}
							</span>
						</button>
					{{/each}}
				</div>
			</div>
		</div>
	</template>
}
