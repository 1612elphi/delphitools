import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { cssColour } from 'delphitools-v2/components/colour-field';
import {
	beginTransient,
	commitTransient,
	isGestureActive,
} from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import 'delphicanon/components/canon-colour-well.css';

export interface ColourWellSignature {
	Args: {
		hex: string;
		onApply: (hex: string, transient: boolean) => void;
		label: string;
	};
	Element: HTMLDivElement;
}

const HEX = /^[\da-f]{6}$/i;

export default class ColourWell extends Component<ColourWellSignature> {
	get digits(): string {
		const hex = this.args.hex.replace('#', '');
		return HEX.test(hex) ? hex.toLowerCase() : '';
	}

	get swatchStyle() {
		return htmlSafe(`background: ${cssColour(this.args.hex)}`);
	}

	open = () => {
		const apply = this.args.onApply;
		let streaming = false;
		editorUi.openRingFor({
			hex: this.args.hex,
			alpha: 1,
			send: (hex, _alpha, final) => {
				if (!streaming && !final) {
					streaming = !isGestureActive();
					if (streaming) beginTransient();
				}
				apply(hex, isGestureActive());
				if (final && streaming) {
					commitTransient();
					streaming = false;
				}
			},
		});
	};

	typed = (event: Event) => {
		const field = event.target as HTMLInputElement;
		const digits = field.value.replace(/[^\da-f]/gi, '');
		if (HEX.test(digits) && digits.toLowerCase() !== this.digits)
			this.args.onApply(`#${digits.toLowerCase()}`, false);
		field.value = this.digits;
	};

	done = (event: KeyboardEvent) => {
		if (event.key === 'Enter')
			(event.target as HTMLInputElement).blur();
	};

	<template>
		<div class="canon-colour-well" ...attributes>
			<button
				type="button"
				class="canon-colour-well-swatch sub-ip-well-swatch"
				style={{this.swatchStyle}}
				aria-label={{@label}}
				title={{@label}}
				{{on "click" this.open}}
			></button>
			<div class="canon-colour-well-cell">
				<span class="canon-colour-well-field">
					<span
						class="canon-colour-well-hash"
						aria-hidden="true"
					>#</span>
					<input
						type="text"
						value={{this.digits}}
						placeholder="000000"
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
		</div>
	</template>
}
