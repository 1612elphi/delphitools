import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import press from 'delphicanon/modifiers/canon-press';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import 'delphicanon/components/canon-colour-strip.css';

interface NotationStripSignature {
	Args: { hex: string };
	Element: HTMLDivElement;
}

export default class NotationStrip extends Component<NotationStripSignature> {
	@service declare colourNotation: ColourNotationService;
	@service('canon-toast') declare toast: CanonToastService;

	get value() {
		return this.colourNotation.format(this.args.hex);
	}

	get name() {
		return getColourName(this.args.hex);
	}

	get swatchStyle() {
		return htmlSafe(`background: ${this.args.hex}`);
	}

	copy = () => void this.toast.copy(this.value);

	<template>
		<div class="canon-colour-strip" ...attributes>
			<button
				type="button"
				class="canon-colour-strip-single"
				aria-label="{{this.name}} {{this.value}}"
				{{press}}
				{{on "click" this.copy}}
			>
				<span
					class="canon-colour-strip-swatch"
					style={{this.swatchStyle}}
				></span>
				<span class="canon-colour-strip-text">
					<span
						class="canon-colour-strip-name"
					>{{this.name}}</span>
					<span
						class="canon-colour-strip-value"
					>{{this.value}}</span>
				</span>
			</button>
		</div>
	</template>
}
