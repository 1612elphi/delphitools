import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import { colourFromUrl } from 'delphitools-v2/lib/colour-query';
import {
	contrastRatio,
	hexToRgb,
	rgbToHex,
	rgbToHsl,
	hslToRgb,
	luminance,
} from 'delphitools-v2/lib/colour-maths';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

// wcag 2.1 thresholds
const AA_NORMAL = 4.5;
const AA_LARGE = 3;
const AAA_NORMAL = 7;
const AAA_LARGE = 4.5;

const HEX = /^#[0-9a-f]{6}$/i;

function isHex(value: string): boolean {
	return HEX.test(value);
}

// searches nearest passing lightness
function fixContrast(
	colourToFix: string,
	reference: string,
	target: number,
): string {
	const rgb = hexToRgb(colourToFix);
	const refRgb = hexToRgb(reference);
	if (!rgb || !refRgb) return colourToFix;

	const [h, s] = rgbToHsl(...rgb);
	const referenceIsLighter = luminance(...rgb) < luminance(...refRgb);
	const start = referenceIsLighter ? 100 : 0;
	const step = referenceIsLighter ? -1 : 1;

	for (let i = 0; i <= 100; i++) {
		const hex = rgbToHex(...hslToRgb(h, s, start + step * i));
		const ratio = contrastRatio(hex, reference);
		if (ratio !== null && ratio >= target) return hex;
	}
	return colourToFix;
}

interface CheckRow {
	key: string;
	level: string;
	label: string;
	threshold: string;
	pass: boolean;
	markClass: string;
}

export default class ContrastCheckerTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked background = '#1a1a2e';
	@tracked foreground = colourFromUrl() ?? '#eaeaea';

	get ratio() {
		return contrastRatio(this.foreground, this.background);
	}

	get ratioLabel() {
		const ratio = this.ratio;
		return ratio === null ? '—' : `${ratio.toFixed(2)}:1`;
	}

	get verdict() {
		const ratio = this.ratio;
		if (ratio === null) return null;
		if (ratio >= AAA_NORMAL) return 'Excellent';
		if (ratio >= AA_NORMAL) return 'Good';
		if (ratio >= AA_LARGE) return 'Acceptable for large text';
		return 'Poor';
	}

	get aaMet() {
		return this.ratio !== null && this.ratio >= AA_NORMAL;
	}

	get aaaMet() {
		return this.ratio !== null && this.ratio >= AAA_NORMAL;
	}

	get rows(): CheckRow[] {
		const ratio = this.ratio;
		if (ratio === null) return [];
		return [
			{
				key: 'aa-normal',
				level: 'AA',
				label: 'Normal text',
				threshold: '4.5:1',
				pass: ratio >= AA_NORMAL,
			},
			{
				key: 'aa-large',
				level: 'AA',
				label: 'Large text',
				threshold: '3:1',
				pass: ratio >= AA_LARGE,
			},
			{
				key: 'aaa-normal',
				level: 'AAA',
				label: 'Normal text',
				threshold: '7:1',
				pass: ratio >= AAA_NORMAL,
			},
			{
				key: 'aaa-large',
				level: 'AAA',
				label: 'Large text',
				threshold: '4.5:1',
				pass: ratio >= AAA_LARGE,
			},
		].map((row) => ({
			...row,
			markClass: `dt-contrast-mark ${row.pass ? 'is-pass' : 'is-fail'}`,
		}));
	}

	get backgroundSwatch() {
		return isHex(this.background) ? this.background : '#000000';
	}

	get foregroundSwatch() {
		return isHex(this.foreground) ? this.foreground : '#ffffff';
	}

	get backgroundStyle() {
		return htmlSafe(`background-color: ${this.backgroundSwatch}`);
	}

	get foregroundStyle() {
		return htmlSafe(`background-color: ${this.foregroundSwatch}`);
	}

	get previewStyle() {
		return htmlSafe(`background-color: ${this.backgroundSwatch}`);
	}

	get inkStyle() {
		return htmlSafe(`color: ${this.foregroundSwatch}`);
	}

	get backgroundNotation() {
		return this.inNotation(this.background);
	}

	get foregroundNotation() {
		return this.inNotation(this.foreground);
	}

	inNotation(hex: string) {
		if (this.colourNotation.notation === 'hex') return null;
		if (!isHex(hex)) return null;
		return this.colourNotation.format(hex);
	}

	setBackground = (event: Event) => {
		this.background = (event.target as HTMLInputElement).value;
	};

	setForeground = (event: Event) => {
		this.foreground = (event.target as HTMLInputElement).value;
	};

	flip = () => {
		const background = this.background;
		this.background = this.foreground;
		this.foreground = background;
	};

	fixToAa = () => {
		this.foreground = fixContrast(
			this.foreground,
			this.background,
			AA_NORMAL,
		);
	};

	fixToAaa = () => {
		this.foreground = fixContrast(
			this.foreground,
			this.background,
			AAA_NORMAL,
		);
	};

	<template>
		<div class="dt-contrast">
			<div class="dt-contrast-inputs">
				<div class="dt-contrast-row">
					<span class="dt-contrast-swatch">
						<span
							style={{this.backgroundStyle}}
							aria-hidden="true"
						></span>
						<input
							type="color"
							value={{this.backgroundSwatch}}
							aria-label="Pick background"
							{{on
								"input"
								this.setBackground
							}}
						/>
					</span>
					<span class="dt-contrast-field">
						<span
							class="dt-contrast-label"
						>Background</span>
						<input
							type="text"
							class="dt-contrast-hex"
							value={{this.background}}
							placeholder="#1a1a2e"
							aria-label="Background"
							{{on
								"input"
								this.setBackground
							}}
						/>
						{{#if this.backgroundNotation}}
							<span
								class="dt-contrast-alt"
							>{{this.backgroundNotation}}</span>
						{{/if}}
					</span>
				</div>

				<div class="dt-contrast-row">
					<span class="dt-contrast-swatch">
						<span
							style={{this.foregroundStyle}}
							aria-hidden="true"
						></span>
						<input
							type="color"
							value={{this.foregroundSwatch}}
							aria-label="Pick foreground"
							{{on
								"input"
								this.setForeground
							}}
						/>
					</span>
					<span class="dt-contrast-field">
						<span
							class="dt-contrast-label"
						>Foreground</span>
						<input
							type="text"
							class="dt-contrast-hex"
							value={{this.foreground}}
							placeholder="#eaeaea"
							aria-label="Foreground"
							{{on
								"input"
								this.setForeground
							}}
						/>
						{{#if this.foregroundNotation}}
							<span
								class="dt-contrast-alt"
							>{{this.foregroundNotation}}</span>
						{{/if}}
					</span>
				</div>
			</div>

			<div class="segmented dt-contrast-actions">
				<button type="button" {{on "click" this.flip}}>
					<Icon @name="arrow-up-down" />
					Flip
				</button>
				<button
					type="button"
					disabled={{this.aaMet}}
					{{on "click" this.fixToAa}}
				>
					<Icon @name="wand-2" />
					Fix to AA
				</button>
				<button
					type="button"
					disabled={{this.aaaMet}}
					{{on "click" this.fixToAaa}}
				>
					<Icon @name="wand-2" />
					Fix to AAA
				</button>
			</div>

			<div class="dt-contrast-ratio">
				<span class="dt-contrast-label">Contrast Ratio</span>
				<span
					class="dt-contrast-ratio-value"
				>{{this.ratioLabel}}</span>
				{{#if this.verdict}}
					<span
						class="dt-contrast-verdict"
					>{{this.verdict}}</span>
				{{/if}}
			</div>

			<div class="dt-contrast-block">
				<div class="dt-contrast-head">
					<span
						class="dt-contrast-heading"
					>Preview</span>
				</div>
				<div
					class="dt-contrast-preview"
					style={{this.previewStyle}}
				>
					<p
						class="dt-contrast-large"
						style={{this.inkStyle}}
					>Large Text (24px+)</p>
					<p
						class="dt-contrast-normal"
						style={{this.inkStyle}}
					>Normal text at 16px. The quick brown
						fox jumps over the lazy dog.</p>
					<p
						class="dt-contrast-small"
						style={{this.inkStyle}}
					>Small text at 14px for fine print and
						captions.</p>
				</div>
			</div>

			{{#if this.rows}}
				<div class="dt-contrast-block">
					<div class="dt-contrast-head is-ruled">
						<span
							class="dt-contrast-heading"
						>WCAG 2.1 Compliance</span>
					</div>
					{{#each this.rows key="key" as |row|}}
						<div class="dt-contrast-check">
							<span
								class="dt-contrast-level"
							>{{row.level}}</span>
							<span
								class="dt-contrast-desc"
							>
								<span
								>{{row.label}}</span>
								<span
									class="dt-contrast-threshold"
								>{{row.threshold}}</span>
							</span>
							<span
								class={{row.markClass}}
							>
								<Icon
									@name={{if
										row.pass
										"check"
										"x"
									}}
								/>
							</span>
						</div>
					{{/each}}
				</div>
			{{/if}}

			<div class="dt-contrast-about">
				<span class="dt-contrast-about-title">About WCAG
					Contrast Requirements</span>
				<ul>
					<li><strong>AA Normal:</strong>
						4.5:1 minimum for text smaller
						than 18pt (or 14pt bold)</li>
					<li><strong>AA Large:</strong>
						3:1 minimum for text 18pt+ (or
						14pt+ bold)</li>
					<li><strong>AAA Normal:</strong>
						7:1 minimum for enhanced
						accessibility</li>
					<li><strong>AAA Large:</strong>
						4.5:1 minimum for large text
						enhanced accessibility</li>
				</ul>
			</div>
		</div>
	</template>
}
