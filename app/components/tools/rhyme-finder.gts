import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import press from 'delphicanon/modifiers/canon-press';
import {
	rhymeIndex,
	rhymesFor,
	type RhymeMode,
} from 'delphitools-v2/lib/rhymes';
import {
	loadCoreDictionary,
	loadFullDictionary,
} from 'delphitools-v2/lib/shavian/dictionary';
import type { Dictionary } from 'delphitools-v2/lib/shavian/transliterate';
import './rhyme-finder/rhyme-finder.css';

const MODES: RhymeMode[] = ['perfect', 'near'];
const MODE_NAMES = ['Perfect', 'Near'];
// ponytail: fixed cap per group, paging if anyone reads past 200
const SHOWN = 200;

export default class RhymeFinder extends Component {
	@tracked text =
		new URLSearchParams(window.location.search).get('rfWord') ?? '';
	@tracked mode: RhymeMode = 'perfect';
	@tracked common: Dictionary = new Map();
	@tracked dictionary: Dictionary = new Map();
	@tracked loading = true;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		void this.load();
	}

	async load() {
		try {
			this.common = this.dictionary =
				await loadCoreDictionary();
			const full = await loadFullDictionary();
			if (this.isDestroying) return;
			this.dictionary = full;
		} catch {
			// core dictionary still answers
		} finally {
			if (!this.isDestroying) this.loading = false;
		}
	}

	get modeIndex() {
		return MODES.indexOf(this.mode);
	}

	get word() {
		return this.text.trim().toLowerCase();
	}

	get phones() {
		return this.dictionary.get(this.word)?.join(' ') ?? '';
	}

	get groups() {
		const { word, dictionary, mode, common } = this;
		if (!word) return null;
		const index = rhymeIndex(dictionary, mode);
		return rhymesFor(word, dictionary, index, mode, common)?.map(
			({ syllables, words }) => ({
				title: `${syllables} ${syllables === 1 ? 'syllable' : 'syllables'}`,
				words: words.slice(0, SHOWN),
				more:
					words.length > SHOWN
						? `+${words.length - SHOWN} more`
						: '',
			}),
		);
	}

	get empty() {
		if (!this.word) return 'Type a word';
		if (!this.groups) return this.loading ? '' : 'Unknown word';
		return this.groups.length ? '' : 'No rhymes';
	}

	typed = (text: string) => (this.text = text);

	pickMode = (index: number) => (this.mode = MODES[index] ?? 'perfect');

	<template>
		<CanonSplit class="rhyme-finder">
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Word" />
					<CanonTextCell
						class="rhyme-finder-word"
						@value={{this.text}}
						@placeholder="Word"
						@onChange={{this.typed}}
						aria-label="Word"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
					/>
					{{#if this.phones}}
						<div
							class="rhyme-finder-phones"
						>{{this.phones}}</div>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Rhyme" />
					<CanonSegmented
						@items={{MODE_NAMES}}
						@selected={{this.modeIndex}}
						@onChange={{this.pickMode}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					{{#if this.loading}}
						<div
							class="rhyme-finder-loading"
						><CanonLoader /></div>
					{{/if}}
					{{#if this.empty}}
						<CanonEmptyRow
							@text={{this.empty}}
						/>
					{{/if}}
					{{#each
						this.groups key="title"
						as |group|
					}}
						<CanonHeading
							@text={{group.title}}
						/>
						<div class="rhyme-finder-words">
							{{#each
								group.words
								key="@identity"
								as |word|
							}}
								<button
									type="button"
									class="rhyme-finder-rhyme"
									{{press}}
									{{on
										"click"
										(fn
											this.typed
											word
										)
									}}
								>{{word}}</button>
							{{/each}}
							{{#if group.more}}
								<span
									class="rhyme-finder-more"
								>{{group.more}}</span>
							{{/if}}
						</div>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
