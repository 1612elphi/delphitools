import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';

export function normalizeHex(hex: string): string | null {
	const stripped = hex.replace(/^#+/, '');
	return /^[a-f\d]{6}$/i.test(stripped) ? `#${stripped}` : null;
}

// reject style injection
export function cssColour(value: string): string {
	return /^[a-zA-Z0-9#(),.%\s/-]*$/.test(value) ? value : '';
}

export interface DeferredHexInputSignature {
	Element: HTMLInputElement;
	Args: {
		value: string;
		onChange: (value: string) => void;
		label?: string;
	};
}

export class DeferredHexInput extends Component<DeferredHexInputSignature> {
	commit = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const parsed = normalizeHex(input.value);
		if (parsed !== null && parsed !== this.args.value) {
			this.args.onChange(parsed);
		}
		input.value = parsed ?? this.args.value;
	};

	onKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		(event.target as HTMLInputElement).blur();
	};

	<template>
		<input
			type="text"
			class="dt-cf-hex"
			value={{@value}}
			aria-label={{@label}}
			spellcheck="false"
			autocomplete="off"
			...attributes
			{{on "blur" this.commit}}
			{{on "keydown" this.onKeydown}}
		/>
	</template>
}

export interface ColourSwatchCellSignature {
	Element: HTMLDivElement;
	Args: {
		colour: string;
		onChange: (hex: string) => void;
		label?: string;
		fillOpacity?: number;
	};
}

export class ColourSwatchCell extends Component<ColourSwatchCellSignature> {
	get fillStyle() {
		const { colour, fillOpacity } = this.args;
		return htmlSafe(
			`background-color: ${cssColour(colour)}${fillOpacity === undefined ? '' : `; opacity: ${fillOpacity}`}`,
		);
	}

	pick = (event: Event) => {
		this.args.onChange((event.target as HTMLInputElement).value);
	};

	<template>
		<div class="dt-cf-swatch" ...attributes>
			<div
				class="dt-cf-swatch-fill"
				style={{this.fillStyle}}
				aria-hidden="true"
			></div>
			<input
				type="color"
				class="dt-cf-swatch-input"
				value={{@colour}}
				aria-label={{@label}}
				{{on "input" this.pick}}
			/>
		</div>
	</template>
}
