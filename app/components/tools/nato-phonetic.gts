import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadText } from 'delphitools-v2/lib/download';
import { MORSE } from 'delphitools-v2/lib/morse';
import { flagSvg, semaphoreSvg } from 'delphitools-v2/lib/signal-flags';
import {
	ALPHABETS,
	looksSpelled,
	spell,
	spellText,
	unspell,
	type SpellingAlphabet,
} from 'delphitools-v2/lib/spelling-alphabets';

const COPIED_MS = 2000;
const DIRECTIONS = ['Auto', 'Spell', 'Read'] as const;
type Direction = (typeof DIRECTIONS)[number];

const isSpace = (char: string) => /\s/.test(char);

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const flag = (letter: string) => htmlSafe(flagSvg(letter));
const semaphore = (letter: string) => htmlSafe(semaphoreSvg(letter));
const symbols = (letter: string) => [...(MORSE[letter] ?? '')];

export default class NatoPhoneticTool extends Component {
	@tracked input = '';
	@tracked alphabet: SpellingAlphabet = ALPHABETS[0]!;
	@tracked direction: Direction = 'Auto';
	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get reading() {
		return this.direction === 'Read'
			? true
			: this.direction === 'Auto' &&
					looksSpelled(this.input, this.alphabet);
	}

	get pairs() {
		return spell(this.input, this.alphabet);
	}

	get output() {
		return this.reading
			? unspell(this.input, this.alphabet)
			: spellText(this.input, this.alphabet);
	}

	get tiles() {
		const typed = this.reading ? '' : this.input.toUpperCase();
		return LETTERS.map((letter) => ({
			letter,
			word: this.alphabet.words[letter],
			used: typed.includes(letter),
		}));
	}

	setInput = (event: Event) => {
		this.input = (event.target as HTMLTextAreaElement).value;
	};

	selectAlphabet = (alphabet: SpellingAlphabet) => {
		this.alphabet = alphabet;
	};

	selectDirection = (direction: Direction) => {
		this.direction = direction;
	};

	addLetter = (letter: string) => {
		if (this.reading) this.direction = 'Spell';
		this.input += letter;
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

	download = () => downloadText(this.output, 'spelled.txt');

	<template>
		<div class="dt-nato-frame">
			<div class="dt-nato-head">
				<div class="segmented dt-nato-alphabets">
					{{#each
						ALPHABETS key="id"
						as |alphabet|
					}}
						<button
							type="button"
							class="dt-nato-seg
								{{if
									(eq
										alphabet
										this.alphabet
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.selectAlphabet
									alphabet
								)
							}}
						>{{alphabet.label}}</button>
					{{/each}}
				</div>
				<div class="segmented dt-nato-directions">
					{{#each DIRECTIONS as |direction|}}
						<button
							type="button"
							class="dt-nato-seg
								{{if
									(eq
										direction
										this.direction
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.selectDirection
									direction
								)
							}}
						>{{direction}}</button>
					{{/each}}
				</div>
			</div>

			<textarea
				class="dt-nato-input"
				aria-label="Input"
				placeholder="Type or paste"
				value={{this.input}}
				{{on "input" this.setInput}}
			></textarea>

			<div class="dt-nato-output">
				{{#if this.reading}}
					<p
						class="dt-nato-read"
					>{{this.output}}</p>
				{{else}}
					<div class="dt-nato-pairs">
						{{#each this.pairs as |pair|}}
							{{#if
								(isSpace
									pair.char
								)
							}}
								<span
									class="dt-nato-break"
								>/</span>
							{{else}}
								<span
									class="dt-nato-pair"
								>
									<span
										class="dt-nato-char"
									>{{pair.char}}</span>
									{{#if
										pair.word
									}}
										<span
											class="dt-nato-word"
										>{{pair.word}}</span>
									{{/if}}
								</span>
							{{/if}}
						{{/each}}
					</div>
				{{/if}}
			</div>

			{{#if this.input}}
				<div class="dt-nato-actions">
					<button
						type="button"
						class="dt-nato-copy"
						{{on "click" this.copy}}
					>
						<Icon
							@name={{if
								this.copied
								"check"
								"copy"
							}}
						/>
						{{if
							this.copied
							"Copied"
							"Copy"
						}}
					</button>
					<button
						type="button"
						class="dt-nato-download"
						{{on "click" this.download}}
					>
						<DownloadLabel />
					</button>
				</div>
			{{/if}}

			<div class="dt-nato-chart-head">
				<span class="dt-nato-chart-label">Chart</span>
				<span class="dt-nato-chart-hint">Tap to spell</span>
			</div>
			<div class="dt-nato-chart">
				{{#each this.tiles key="letter" as |tile|}}
					<button
						type="button"
						class="dt-nato-tile
							{{if
								tile.used
								'is-used'
							}}"
						{{on
							"click"
							(fn
								this.addLetter
								tile.letter
							)
						}}
					>
						<span
							class="dt-nato-tile-letter"
						>{{tile.letter}}</span>
						<span
							class="dt-nato-tile-morse"
							aria-hidden="true"
						>
							{{#each
								(symbols
									tile.letter
								)
								key="@index"
								as |mark|
							}}
								<span
									class={{if
										(eq
											mark
											"-"
										)
										"dt-nato-dah"
										"dt-nato-dit"
									}}
								></span>
							{{/each}}
						</span>
						{{semaphore tile.letter}}
						{{flag tile.letter}}
						<span
							class="dt-nato-tile-word"
						>{{tile.word}}</span>
					</button>
				{{/each}}
			</div>
		</div>
	</template>
}
