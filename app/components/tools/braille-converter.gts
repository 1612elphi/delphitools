import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadText } from 'delphitools-v2/lib/download';
import {
	dots,
	fromBraille,
	looksLikeBraille,
	toBraille,
} from 'delphitools-v2/lib/braille';

type Mode = 'auto' | 'braille' | 'text';

const MODES: { mode: Mode; label: string }[] = [
	{ mode: 'auto', label: 'Auto' },
	{ mode: 'braille', label: 'To braille' },
	{ mode: 'text', label: 'To text' },
];
const COPIED_MS = 2000;

export default class BrailleConverterTool extends Component {
	@tracked input = '';
	@tracked mode: Mode = 'auto';
	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get toText() {
		return (
			this.mode === 'text' ||
			(this.mode === 'auto' && looksLikeBraille(this.input))
		);
	}

	get output() {
		return this.toText
			? fromBraille(this.input)
			: toBraille(this.input);
	}

	get cells() {
		return [...this.output].map((char) => ({
			char,
			dots: dots(char),
		}));
	}

	setInput = (event: Event) => {
		this.input = (event.target as HTMLTextAreaElement).value;
	};

	setMode = (mode: Mode) => {
		this.mode = mode;
	};

	copy = () => {
		void navigator.clipboard.writeText(this.output);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	download = () => downloadText(this.output, 'braille.txt');

	<template>
		<div class="dt-brl-frame">
			<div class="segmented dt-brl-modes">
				{{#each MODES as |option|}}
					<button
						type="button"
						class="dt-brl-mode
							{{if
								(eq
									option.mode
									this.mode
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setMode
								option.mode
							)
						}}
					>{{option.label}}</button>
				{{/each}}
			</div>

			<textarea
				class="dt-brl-input"
				aria-label="Input"
				spellcheck="false"
				value={{this.input}}
				{{on "input" this.setInput}}
			></textarea>

			<div class="dt-brl-output {{if this.toText 'is-text'}}">
				{{~#each this.cells as |cell|~}}
					{{~#if cell.dots~}}
						<span
							class="dt-brl-cell"
							title={{cell.dots}}
						>{{cell.char}}</span>
					{{~else~}}
						{{cell.char}}
					{{~/if~}}
				{{~/each~}}
			</div>

			<div class="dt-brl-actions">
				<button
					type="button"
					class="dt-brl-copy"
					{{on "click" this.copy}}
				>
					<Icon
						@name={{if
							this.copied
							"check"
							"copy"
						}}
					/>
					{{if this.copied "Copied" "Copy"}}
				</button>
				<button
					type="button"
					class="dt-brl-download"
					{{on "click" this.download}}
				>
					<DownloadLabel />
				</button>
			</div>
		</div>
	</template>
}
