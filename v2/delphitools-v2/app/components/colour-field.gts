import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';

/**
 * Shared colour line-item primitives — the flush swatch + deferred hex input
 * pattern used across delphitools colour tools (gradient generator, Substrata
 * colour picker, …). DESIGN.md §10: native colour input as a full-cell swatch;
 * hex text commits on blur/Enter and reverts invalid drafts.
 */

/** Strip leading #(s), validate a 6-digit hex → "#rrggbb", or null if invalid. */
export function normalizeHex(hex: string): string | null {
	const stripped = hex.replace(/^#+/, '');
	return /^[a-f\d]{6}$/i.test(stripped) ? `#${stripped}` : null;
}

/**
 * A colour value safe to interpolate into a `style` attribute. Doc colours
 * come from opened .substrata files, which are only shallowly validated — a
 * value carrying `;` would smuggle extra declarations (e.g. a background-image
 * URL) into the attribute, from a tool whose contract is that nothing leaves
 * the browser. Whitelist covers hex, named colours and every functional
 * notation; anything else renders as no colour at all.
 */
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

/**
 * Hex text field that commits a normalised `#rrggbb` on blur/Enter. The input
 * is uncontrolled while focused — no onChange per keystroke — and an invalid
 * draft snaps back to the last committed value on commit.
 */
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
		// blur runs the commit
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
		/** preview alpha on the visible fill (the input stays fully opaque) */
		fillOpacity?: number;
	};
}

/**
 * Full-cell native colour swatch: a visible fill with an invisible
 * `type="color"` input over it, so clicking the cell opens the OS colour
 * picker. Size it via a class on the cell; the fill covers the cell.
 */
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
