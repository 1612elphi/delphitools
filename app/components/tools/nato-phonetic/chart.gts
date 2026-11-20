import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { MORSE } from 'delphitools-v2/lib/morse';
import { flagSvg, semaphoreSvg } from 'delphitools-v2/lib/signal-flags';
import type { SpellingAlphabet } from 'delphitools-v2/lib/spelling-alphabets';

interface ChartSignature {
	Args: {
		alphabet: SpellingAlphabet;
		used: string;
		onLetter: (letter: string) => void;
	};
}

const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

const flag = (letter: string) => htmlSafe(flagSvg(letter));
const semaphore = (letter: string) => htmlSafe(semaphoreSvg(letter));
const symbols = (letter: string) => [...(MORSE[letter] ?? '')];
const isDah = (mark: string) => mark === '-';

export default class Chart extends Component<ChartSignature> {
	get tiles() {
		return letters.map((letter) => ({
			letter,
			word: this.args.alphabet.words[letter] ?? '',
			used: this.args.used.includes(letter),
		}));
	}

	<template>
		<div class="np-chart">
			{{#each this.tiles key="letter" as |tile|}}
				<button
					type="button"
					class="np-tile
						{{if
							tile.used
							'np-tile--used'
						}}"
					aria-label={{tile.word}}
					{{on
						"click"
						(fn @onLetter tile.letter)
					}}
				>
					<span
						class="np-tile-letter"
					>{{tile.letter}}</span>
					<span
						class="np-tile-morse"
						aria-hidden="true"
					>
						{{#each
							(symbols tile.letter)
							as |mark|
						}}
							<span
								class={{if
									(isDah
										mark
									)
									"np-dah"
									"np-dit"
								}}
							></span>
						{{/each}}
					</span>
					<span class="np-tile-signs">
						{{semaphore tile.letter}}
						{{flag tile.letter}}
					</span>
					<span
						class="np-tile-word"
					>{{tile.word}}</span>
				</button>
			{{/each}}
		</div>
	</template>
}
