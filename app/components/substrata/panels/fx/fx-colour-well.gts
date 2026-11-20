import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { pickColour, stringOf, write, type FxContext } from './fx-context';

interface Signature {
	Args: { ctx: FxContext; key: string; label: string };
	Element: HTMLDivElement;
}

export default class FxColourWell extends Component<Signature> {
	get hex() {
		return stringOf(this.args.ctx, this.args.key).toLowerCase();
	}

	get digits() {
		return this.hex.replace('#', '').toUpperCase();
	}

	get swatchStyle() {
		return htmlSafe(`background: ${this.hex}`);
	}

	open = () => pickColour(this.args.ctx, this.args.key);

	typed = (event: Event) => {
		const field = event.target as HTMLInputElement;
		const digits = field.value
			.replace(/[^\da-f]/gi, '')
			.toLowerCase();
		if (digits.length === 6 && `#${digits}` !== this.hex)
			write(this.args.ctx, { [this.args.key]: `#${digits}` });
		field.value = this.digits;
	};

	done = (event: KeyboardEvent) => {
		if (event.key === 'Enter')
			(event.target as HTMLInputElement).blur();
	};

	<template>
		<div class="sub-fxp-well" ...attributes>
			<button
				type="button"
				class="sub-fxp-well-swatch"
				style={{this.swatchStyle}}
				aria-label={{@label}}
				aria-haspopup="dialog"
				{{on "click" this.open}}
			></button>
			<span class="sub-fxp-well-field">
				<span aria-hidden="true">#</span>
				<input
					type="text"
					value={{this.digits}}
					maxlength="7"
					spellcheck="false"
					autocomplete="off"
					autocapitalize="off"
					aria-label="Hex"
					{{on "change" this.typed}}
					{{on "keydown" this.done}}
				/>
			</span>
		</div>
	</template>
}
