import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import {
	ColourSwatchCell,
	DeferredHexInput,
} from 'delphitools-v2/components/colour-field';
import {
	beginTransient,
	commitTransient,
} from 'delphitools-v2/lib/substrata/doc-store';

export interface TransientColourCellSignature {
	Element: HTMLDivElement;
	Args: {
		value: string;
		/** transient picker update */
		onApply: (hex: string, transient: boolean) => void;
		swatchAria: string;
		hexAria: string;
	};
}

/** groups picker changes */
export class TransientColourCell extends Component<TransientColourCellSignature> {
	#dragging = false;
	#settleTimer: number | null = null;

	// commit active gesture
	willDestroy() {
		super.willDestroy();
		if (this.#settleTimer !== null)
			window.clearTimeout(this.#settleTimer);
		if (this.#dragging) {
			commitTransient();
			this.#dragging = false;
		}
	}

	settle = () => {
		if (this.#settleTimer !== null) {
			window.clearTimeout(this.#settleTimer);
			this.#settleTimer = null;
		}
		if (!this.#dragging) return;
		commitTransient();
		this.#dragging = false;
	};

	stream = (hex: string) => {
		if (!this.#dragging) {
			this.#dragging = true;
			beginTransient();
		}
		this.args.onApply(hex, true);
		if (this.#settleTimer !== null)
			window.clearTimeout(this.#settleTimer);
		this.#settleTimer = window.setTimeout(this.settle, 600);
	};

	commit = (hex: string) => this.args.onApply(hex, false);

	<template>
		{{! use bubbling focusout }}
		<div class="sub-tc" ...attributes {{on "focusout" this.settle}}>
			<ColourSwatchCell
				@colour={{@value}}
				@onChange={{this.stream}}
				@label={{@swatchAria}}
				class="sub-tc-swatch"
			/>
			<DeferredHexInput
				@value={{@value}}
				@onChange={{this.commit}}
				@label={{@hexAria}}
				class="sub-tc-hex"
			/>
		</div>
	</template>
}
