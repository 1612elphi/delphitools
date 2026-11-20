import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonStepper from 'delphicanon/components/canon-stepper';
import { evalField, formatField } from './logic';

export interface NumFieldSignature {
	Args: {
		value: number;
		onCommit: (value: number) => void;
		min?: number;
		max?: number;
		step?: number;
		decimals?: number;
		unit?: string;
		labelledBy?: string;
		label?: string;
	};
	Element: HTMLDivElement;
}

export default class NumField extends Component<NumFieldSignature> {
	@tracked draft: string | null = null;
	#commitTo: ((value: number) => void) | null = null;

	get min() {
		return this.args.min ?? -Infinity;
	}

	get max() {
		return this.args.max ?? Infinity;
	}

	get step() {
		return this.args.step ?? 1;
	}

	get text(): string {
		return (
			this.draft ??
			formatField(this.args.value, this.decimals)
		);
	}

	get decimals() {
		return this.args.decimals ?? 0;
	}

	get valueText(): string {
		return `${this.text} ${this.args.unit ?? ''}`.trim();
	}

	#clamp(value: number): number {
		const factor = 10 ** this.decimals;
		const rounded = Math.round(value * factor) / factor;
		return Math.min(this.max, Math.max(this.min, rounded));
	}

	#typed(): number {
		const typed =
			this.draft === null
				? null
				: evalField(this.draft, this.args.value);
		return typed ?? this.args.value;
	}

	#commit(value: number) {
		const next = this.#clamp(value);
		this.draft = null;
		if (next === this.#clamp(this.args.value)) return;
		(this.#commitTo ?? this.args.onCommit)(next);
	}

	nudge = (direction: -1 | 1, times = 1) => {
		this.#commit(this.#typed() + direction * times * this.step);
	};

	focus = (event: FocusEvent) => {
		this.#commitTo = this.args.onCommit;
		(event.target as HTMLInputElement).select();
	};

	input = (event: Event) => {
		this.draft = (event.target as HTMLInputElement).value;
	};

	blur = () => {
		if (this.draft !== null) this.#commit(this.#typed());
		this.#commitTo = null;
	};

	key = (event: KeyboardEvent) => {
		const field = event.target as HTMLInputElement;
		if (event.key === 'Enter') {
			field.blur();
		} else if (event.key === 'Escape') {
			this.draft = null;
			field.blur();
		} else if (
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			event.preventDefault();
			this.nudge(
				event.key === 'ArrowUp' ? 1 : -1,
				event.shiftKey ? 10 : 1,
			);
			requestAnimationFrame(() => field.select());
		}
	};

	<template>
		<CanonStepper
			class="sub-ip-num"
			@onStep={{this.nudge}}
			...attributes
		>
			<span class="canon-stepper-value">
				{{! template-lint-disable require-input-label no-redundant-role }}
				<input
					type="text"
					class="canon-stepper-field"
					role="spinbutton"
					inputmode="decimal"
					enterkeyhint="done"
					autocomplete="off"
					spellcheck="false"
					aria-valuenow={{@value}}
					aria-valuetext={{this.valueText}}
					aria-labelledby={{@labelledBy}}
					aria-label={{@label}}
					value={{this.text}}
					{{on "focus" this.focus}}
					{{on "input" this.input}}
					{{on "blur" this.blur}}
					{{on "keydown" this.key}}
				/>
				{{#if @unit}}
					<span
						class="canon-stepper-unit"
						aria-hidden="true"
					>{{@unit}}</span>
				{{/if}}
			</span>
		</CanonStepper>
	</template>
}
