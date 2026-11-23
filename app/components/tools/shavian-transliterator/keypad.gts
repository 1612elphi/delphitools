import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import press from 'delphicanon/modifiers/canon-press';
import { getShavianLetter } from 'delphitools-v2/lib/shavian/phoneme-map';

interface KeypadSignature {
	Args: {
		field: HTMLTextAreaElement | null;
		onInput: (text: string) => void;
	};
}

// ruby's theotech ude layout
const ROWS = [
	'𐑑𐑓𐑫𐑳𐑤𐑮𐑴𐑵𐑝𐑛',
	'𐑬𐑣𐑔𐑖𐑱𐑲𐑠𐑞𐑙𐑶',
	'𐑒𐑧𐑩𐑗𐑦𐑰𐑡𐑪𐑨𐑜',
	'·𐑐𐑕𐑢𐑥𐑯𐑘𐑟𐑚,',
	'𐑸𐑺𐑼𐑭𐑾𐑿𐑷𐑽𐑻𐑹',
].map((row) =>
	[...row].map((key) => ({
		key,
		name: getShavianLetter(key)?.name ?? key,
	})),
);

const HELD: Record<string, string[]> = {
	',': ['.', ',', ';', ':', "'", '"'],
	'·': ['·', '!', '?', '(', ')', '&'],
};

const HOLD_MS = 350;

export default class ShavianKeypad extends Component<KeypadSignature> {
	@tracked held: string[] | null = null;

	#timer = 0;
	#opened = false;

	#replace(text: string, from?: number) {
		const field = this.args.field;
		if (!field) return;
		field.setRangeText(
			text,
			from ?? field.selectionStart,
			field.selectionEnd,
			'end',
		);
		field.focus();
		this.args.onInput(field.value);
	}

	type = (text: string) => {
		// the hold already opened the strip
		if (this.#opened) {
			this.#opened = false;
			return;
		}
		this.held = null;
		this.#replace(text);
	};

	back = () => {
		const field = this.args.field;
		if (!field) return;
		const { selectionStart: start, selectionEnd: end } = field;
		// a shavian letter is two utf-16 units
		const last =
			start === end
				? ([...field.value.slice(0, start)].pop()
						?.length ?? 0)
				: 0;
		this.#replace('', start - last);
	};

	hold = (key: string) => {
		const values = HELD[key];
		if (!values) return;
		this.#timer = window.setTimeout(() => {
			this.#opened = true;
			this.held = values;
		}, HOLD_MS);
	};

	release = () => window.clearTimeout(this.#timer);

	// keys never take focus from the field
	keepFocus = (event: Event) => event.preventDefault();

	willDestroy() {
		super.willDestroy();
		this.release();
	}

	<template>
		{{! template-lint-disable no-pointer-down-event-binding no-invalid-interactive }}
		<div
			class="sh-keypad"
			role="group"
			aria-label="Shavian keys"
			{{on "mousedown" this.keepFocus}}
			{{on "pointerup" this.release}}
			{{on "pointerleave" this.release}}
		>
			{{#if this.held}}
				<div class="sh-keypad-row sh-keypad-row--held">
					{{#each this.held as |value|}}
						<button
							type="button"
							class="sh-key"
							{{press}}
							{{on
								"click"
								(fn
									this.type
									value
								)
							}}
						>{{value}}</button>
					{{/each}}
				</div>
			{{/if}}
			{{#each ROWS as |row|}}
				<div class="sh-keypad-row">
					{{#each row as |cell|}}
						<button
							type="button"
							class="sh-key"
							aria-label={{cell.name}}
							title={{cell.name}}
							{{press}}
							{{on
								"pointerdown"
								(fn
									this.hold
									cell.key
								)
							}}
							{{on
								"click"
								(fn
									this.type
									cell.key
								)
							}}
						>{{cell.key}}</button>
					{{/each}}
				</div>
			{{/each}}
			<div class="sh-keypad-row sh-keypad-row--end">
				<button
					type="button"
					class="sh-key sh-key--word"
					{{press}}
					{{on "click" (fn this.type "\n")}}
				>Return</button>
				<button
					type="button"
					class="sh-key sh-key--word"
					{{press}}
					{{on "click" (fn this.type " ")}}
				>Space</button>
				<button
					type="button"
					class="sh-key sh-key--word"
					{{press}}
					{{on "click" this.back}}
				>Delete</button>
			</div>
		</div>
	</template>
}

interface FieldSignature {
	Args: {
		text: string;
		onInput: (event: Event) => void;
	};
	Element: HTMLTextAreaElement;
}

export const ShavianField: TOC<FieldSignature> = <template>
	<div class="sh-reverse">
		<span
			class="gl-picture-heading sh-reverse-heading"
		>Shavian</span>
		<textarea
			class="sh-reverse-field"
			aria-label="Shavian input"
			placeholder="Type or paste"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			value={{@text}}
			{{on "input" @onInput}}
			...attributes
		></textarea>
	</div>
</template>;
