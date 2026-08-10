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
		/** transient=true while the OS picker streams; false = a single committed set */
		onApply: (hex: string, transient: boolean) => void;
		swatchAria: string;
		hexAria: string;
	};
}

/**
 * Native swatch + hex pair whose OS-picker drags coalesce into ONE undo step
 * (extracted from the FX panel's ColourRow so every doc-editing colour cell —
 * fx params, Inspector fill/stroke — shares the mechanism). The native picker
 * can stream changes while dragging (Chrome) and offers no reliable close
 * signal — the input may keep focus after the OS picker closes, so blur alone
 * can leave the transient gesture open forever. The gesture therefore settles
 * on whichever comes first: a pause in changes (trailing timer), the pair
 * blurring, or unmount. A long pause inside the OS picker splits into two
 * undo steps — acceptable. The hex field commits once on blur/Enter.
 */
export class TransientColourCell extends Component<TransientColourCellSignature> {
	#dragging = false;
	#settleTimer: number | null = null;

	// A still-open gesture must not outlive the cell (deselect mid-pick).
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
		{{! React's onBlur is focusout; the native blur event does not bubble }}
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
