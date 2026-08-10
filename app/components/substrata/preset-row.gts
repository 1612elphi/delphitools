import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';

/**
 * Preset-first value controls (Ruby, 2026-07-06: "a simple editor for simple
 * people" — most shape parameters offer a few good presets plus a custom (…)
 * escape hatch). Shared by the PIECES settings bloom and the Inspector's
 * shape section, so both surfaces read identically.
 */

export interface StepBtnSignature {
	Element: HTMLButtonElement;
	Args: {
		/** kebab-case lucide name */
		icon: string;
		aria: string;
		onClick: () => void;
		disabled?: boolean;
	};
}

export const StepBtn: TOC<StepBtnSignature> = <template>
	<button
		type="button"
		class="sub-step-btn"
		aria-label={{@aria}}
		title={{@aria}}
		disabled={{@disabled}}
		...attributes
		{{on "click" @onClick}}
	>
		<Icon @name={{@icon}} />
	</button>
</template>;

export interface StepperSignature {
	Element: HTMLSpanElement;
	Args: {
		value: number;
		onChange: (value: number) => void;
		min: number;
		max: number;
		step?: number;
		unit?: string;
	};
}

/** Compact value + up/down stepper (the omnibar Nudge cell's pattern). */
export class Stepper extends Component<StepperSignature> {
	get step() {
		return this.args.step ?? 1;
	}

	clampTo = (value: number) => {
		this.args.onChange(
			Math.min(this.args.max, Math.max(this.args.min, value)),
		);
	};

	up = () => this.clampTo(this.args.value + this.step);
	down = () => this.clampTo(this.args.value - this.step);

	get atMax() {
		return this.args.value >= this.args.max;
	}

	get atMin() {
		return this.args.value <= this.args.min;
	}

	<template>
		<span class="sub-stepper" ...attributes>
			<span class="sub-stepper-value">
				{{@value}}{{if @unit " "}}{{@unit}}
			</span>
			<StepBtn
				@icon="chevron-up"
				@aria="Increase"
				@onClick={{this.up}}
				@disabled={{this.atMax}}
			/>
			<StepBtn
				@icon="chevron-down"
				@aria="Decrease"
				@onClick={{this.down}}
				@disabled={{this.atMin}}
			/>
		</span>
	</template>
}

/** Rounded-square glyph for corner-radius presets — visual, not copy. */
export const CornerPresetIcon: TOC<{ Args: { r: number } }> = <template>
	<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
		<rect
			x="1.5"
			y="1.5"
			width="11"
			height="11"
			rx={{@r}}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
		/>
	</svg>
</template>;

export interface PresetOption {
	value: number;
	/** number-ish text (self-labelling data) — or supply cornerR instead */
	label?: string;
	/** renders a CornerPresetIcon with this radius in place of the label */
	cornerR?: number;
	/** required with icon-only options */
	aria?: string;
}

function matches(a: number, b: number, eps: number): boolean {
	return Math.abs(a - b) <= eps;
}

function hasCorner(option: PresetOption): boolean {
	return option.cornerR !== undefined;
}

// Glint cannot narrow `cornerR` through the template's hasCorner guard
function cornerOf(option: PresetOption): number {
	return option.cornerR ?? 0;
}

function ariaOf(option: PresetOption): string | undefined {
	return option.aria ?? option.label;
}

export interface PresetRowSignature {
	Element: HTMLDivElement;
	Args: {
		options: PresetOption[];
		value: number;
		onChange: (value: number) => void;
		/** preset-match tolerance (fractional presets round to px) */
		eps?: number;
		min: number;
		max: number;
		step?: number;
		unit?: string;
	};
}

/**
 * A flush strip of preset buttons + an (…) cell revealing a custom Stepper.
 * The strip highlights the matching preset, or the (…) cell when the live
 * value is off-menu. Every path writes through `onChange` (callers make each
 * commit one undo step / one settings patch).
 */
export class PresetRow extends Component<PresetRowSignature> {
	@tracked open = false;

	get eps() {
		return this.args.eps ?? 0.5;
	}

	get isCustom() {
		return !this.args.options.some((o) =>
			matches(o.value, this.args.value, this.eps),
		);
	}

	get rounded() {
		return Math.round(this.args.value);
	}

	get stripStyle() {
		return htmlSafe(
			`grid-template-columns: repeat(${this.args.options.length + 1}, minmax(0, 1fr))`,
		);
	}

	toggleOpen = () => {
		this.open = !this.open;
	};

	<template>
		<div class="sub-preset-row" ...attributes>
			<span
				class="segmented sub-preset-strip"
				style={{this.stripStyle}}
			>
				{{#each @options key="value" as |o|}}
					<button
						type="button"
						class="sub-seg-cell
							{{if
								(matches
									o.value
									@value
									this.eps
								)
								'is-active'
							}}"
						aria-label={{ariaOf o}}
						title={{ariaOf o}}
						{{on
							"click"
							(fn @onChange o.value)
						}}
					>
						{{#if (hasCorner o)}}
							<CornerPresetIcon
								@r={{cornerOf
									o
								}}
							/>
						{{else}}
							{{o.label}}
						{{/if}}
					</button>
				{{/each}}
				<button
					type="button"
					class="sub-seg-cell
						{{if this.isCustom 'is-active'}}
						{{if this.open 'is-active'}}"
					aria-label="Custom"
					{{on "click" this.toggleOpen}}
				>
					<Icon @name="ellipsis" />
				</button>
			</span>
			{{#if this.open}}
				<Stepper
					@value={{this.rounded}}
					@onChange={{@onChange}}
					@min={{@min}}
					@max={{@max}}
					@step={{@step}}
					@unit={{@unit}}
				/>
			{{/if}}
		</div>
	</template>
}
