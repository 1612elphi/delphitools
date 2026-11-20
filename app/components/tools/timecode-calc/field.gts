import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import {
	digitsOf,
	fieldWidth,
	register,
} from 'delphitools-v2/components/tools/timecode-calc/smpte';

export interface TimecodeFieldSignature {
	Args: {
		value?: string;
		dropFrame: boolean;
		label: string;
		onChange: (text: string) => void;
	};
}

const wholeSelected = (input: HTMLInputElement) =>
	input.value !== '' &&
	input.selectionStart === 0 &&
	input.selectionEnd === input.value.length;

export default class TimecodeField extends Component<TimecodeFieldSignature> {
	@tracked digits = digitsOf(this.args.value ?? '');

	get text() {
		return register(this.digits, this.args.dropFrame);
	}

	get placeholder() {
		return register('0', this.args.dropFrame);
	}

	#fill(input: HTMLInputElement, digits: string) {
		this.digits = digits.slice(-fieldWidth);
		input.value = this.text;
		const end = input.value.length;
		input.setSelectionRange(end, end);
		this.args.onChange(this.text);
	}

	keys = modifier((input: HTMLInputElement) => {
		const before = (event: InputEvent) => {
			if (event.isComposing) return;
			const { inputType } = event;
			const all = wholeSelected(input);
			if (inputType.startsWith('insert')) {
				event.preventDefault();
				const data =
					event.data ??
					event.dataTransfer?.getData('text') ??
					'';
				const typed = data.replace(/\D/g, '');
				if (!typed && !all) return;
				this.#fill(
					input,
					all ? typed : this.digits + typed,
				);
			} else if (inputType.startsWith('delete')) {
				event.preventDefault();
				this.#fill(
					input,
					all ? '' : this.digits.slice(0, -1),
				);
			}
		};
		const after = () => this.#fill(input, digitsOf(input.value));
		input.addEventListener('beforeinput', before);
		input.addEventListener('input', after);
		return () => {
			input.removeEventListener('beforeinput', before);
			input.removeEventListener('input', after);
		};
	});

	selectAll = (event: FocusEvent) => {
		const input = event.target as HTMLInputElement;
		requestAnimationFrame(() => input.select());
	};

	<template>
		<CanonTextCell
			class="tcc-field"
			inputmode="numeric"
			autocomplete="off"
			spellcheck="false"
			aria-label={{@label}}
			@value={{this.text}}
			@placeholder={{this.placeholder}}
			{{this.keys}}
			{{on "focus" this.selectAll}}
		/>
	</template>
}
