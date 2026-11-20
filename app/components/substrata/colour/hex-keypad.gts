import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import {
	hexOf,
	type HexDigits,
} from 'delphitools-v2/lib/substrata/colour-ring/model';

interface Signature {
	Args: {
		digits: HexDigits;
		onChange: () => void;
		onDone: () => void;
	};
	Element: HTMLDivElement;
}

const LETTERS = [
	['a', 'b', 'c'],
	['d', 'e', 'f'],
];
const DIGITS = [
	['7', '8', '9'],
	['4', '5', '6'],
	['1', '2', '3'],
];

const upper = (s: string) => s.toUpperCase();

export default class HexKeypad extends Component<Signature> {
	letters = LETTERS;
	digitRows = DIGITS;

	get display() {
		const { digits } = this.args.digits;
		return `#${digits.toUpperCase()}${'·'.repeat(Math.max(0, 6 - digits.length))}`;
	}

	get sampleStyle() {
		const colour = this.args.digits.colour;
		return htmlSafe(
			`background: ${colour ? hexOf(colour) : 'transparent'}`,
		);
	}

	type = (text: string) => {
		if (this.args.digits.insert(text)) this.args.onChange();
	};

	deleteBackward = () => {
		if (this.args.digits.deleteBackward()) this.args.onChange();
	};

	clear = () => {
		this.args.digits.clear();
		this.args.onChange();
	};

	paste = async () => {
		try {
			const text = await navigator.clipboard.readText();
			if (this.args.digits.paste(text)) this.args.onChange();
		} catch {
			/* clipboard read refused */
		}
	};

	keys = modifier((pad: HTMLElement) => {
		pad.focus({ preventScroll: true });
		const down = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key === 'Enter' || e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.args.onDone();
			} else if (
				e.key === 'Backspace' ||
				e.key === 'Delete'
			) {
				e.preventDefault();
				this.deleteBackward();
			} else if (/^[\da-f]$/i.test(e.key)) {
				e.preventDefault();
				this.type(e.key);
			}
		};
		const pasted = (e: ClipboardEvent) => {
			const text = e.clipboardData?.getData('text/plain');
			if (!text) return;
			e.preventDefault();
			if (this.args.digits.paste(text)) this.args.onChange();
		};
		pad.addEventListener('keydown', down);
		pad.addEventListener('paste', pasted);
		return () => {
			pad.removeEventListener('keydown', down);
			pad.removeEventListener('paste', pasted);
		};
	});

	<template>
		<div
			class="sub-hexpad"
			role="group"
			aria-label="Hex"
			tabindex="-1"
			...attributes
			{{this.keys}}
		>
			<div class="sub-hexpad-readout">
				<output
					class="sub-hexpad-display"
					aria-label="Hex"
				>{{this.display}}</output>
				<span
					class="sub-hexpad-sample"
					style={{this.sampleStyle}}
				></span>
			</div>
			{{#each this.letters as |row|}}
				<div class="sub-hexpad-row">
					{{#each row as |d|}}
						<button
							type="button"
							class="sub-hexpad-key is-letter"
							{{on
								"click"
								(fn this.type d)
							}}
						>{{upper d}}</button>
					{{/each}}
				</div>
			{{/each}}
			{{#each this.digitRows as |row|}}
				<div class="sub-hexpad-row">
					{{#each row as |d|}}
						<button
							type="button"
							class="sub-hexpad-key"
							{{on
								"click"
								(fn this.type d)
							}}
						>{{d}}</button>
					{{/each}}
				</div>
			{{/each}}
			<div class="sub-hexpad-row">
				<button
					type="button"
					class="sub-hexpad-key is-word"
					{{on "click" this.clear}}
				>Clear</button>
				<button
					type="button"
					class="sub-hexpad-key"
					{{on "click" (fn this.type "0")}}
				>0</button>
				<button
					type="button"
					class="sub-hexpad-key"
					aria-label="Delete"
					title="Delete"
					{{on "click" this.deleteBackward}}
				><Icon @name="delete" /></button>
			</div>
			<div class="sub-hexpad-row is-two">
				<button
					type="button"
					class="sub-hexpad-key is-word"
					{{on "click" this.paste}}
				><Icon @name="clipboard-paste" />Paste</button>
				<button
					type="button"
					class="sub-hexpad-key is-word is-done"
					{{on "click" @onDone}}
				>Done</button>
			</div>
		</div>
	</template>
}
