import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import {
	alphabet,
	alternativesOf,
	carryEdits,
	inserting,
	isGuess,
	piecesOf,
	removing,
	soundOf,
	stressRuns,
	swapping,
} from 'delphitools-v2/components/tools/ipa-transcriber/gloss';
import GlossEditor, {
	collapsedHeight,
} from 'delphitools-v2/components/tools/text-tool/gloss-editor';
import type { Sound } from 'delphitools-v2/components/tools/text-tool/gloss-pieces';
import GlossWord, {
	type WordLetter,
} from 'delphitools-v2/components/tools/text-tool/gloss-word';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import {
	toText,
	transcribe,
	type IpaToken,
	type IpaWord,
} from 'delphitools-v2/lib/ipa';
import {
	loadCoreDictionary,
	loadFullDictionary,
} from 'delphitools-v2/lib/shavian/dictionary';
import type { Dictionary } from 'delphitools-v2/lib/shavian/transliterate';
import './ipa-transcriber/ipa-transcriber.css';

const defaultText = 'Mankind, be vigilant; we loved you.';
const coreOnlyStatus = 'Core dictionary only, uncommon words are guessed';
const dash = '—';

type DictStatus = 'loading-core' | 'loading-full' | 'core-only' | 'ready';

export default class IpaTranscriber extends Component {
	@tracked input = defaultText;
	@tracked tokens: IpaToken[] = [];
	@tracked dictStatus: DictStatus = 'loading-core';
	@tracked selected: number | null = null;
	@tracked pictureHeight = 320;
	core: Dictionary = new Map();
	full: Dictionary = new Map();

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const text = query.get('ipaText');
		if (text !== null) this.input = text;
		void this.#loadDictionaries(Number(query.get('ipaWord')));
	}

	async #loadDictionaries(word: number) {
		const core = await loadCoreDictionary();
		if (this.isDestroyed) return;
		this.core = core;
		this.dictStatus = 'loading-full';
		this.#transcribe();
		const slot = this.tokens
			.flatMap((t, i) => (t.type === 'word' ? [i] : []))
			.at(word - 1);
		if (word && slot !== undefined) this.selected = slot;
		try {
			const full = await loadFullDictionary();
			if (this.isDestroyed) return;
			this.full = full;
			this.dictStatus = 'ready';
			this.#transcribe();
		} catch (error) {
			console.error(
				'ipa full dictionary failed to load:',
				error,
			);
			if (this.isDestroyed) return;
			this.dictStatus = 'core-only';
		}
	}

	#transcribe() {
		const { core, full } = this;
		this.tokens = carryEdits(
			this.tokens,
			transcribe(
				this.input,
				(word) => full.get(word) ?? core.get(word),
			),
		);
	}

	get coreOnlyStatus() {
		return coreOnlyStatus;
	}

	get loading() {
		return this.dictStatus === 'loading-core';
	}

	get loadingDetail() {
		return this.dictStatus === 'loading-core'
			? 'Loading dictionary…'
			: this.dictStatus === 'loading-full'
				? 'Loading full dictionary…'
				: undefined;
	}

	get coreOnly() {
		return this.dictStatus === 'core-only';
	}

	get words() {
		return this.tokens.filter((t) => t.type === 'word');
	}

	get pieces() {
		return piecesOf(this.input, this.tokens);
	}

	get text() {
		return this.words.length ? `/${toText(this.tokens)}/` : '';
	}

	get word(): IpaWord | undefined {
		const token =
			this.selected === null
				? undefined
				: this.tokens[this.selected];
		return token?.type === 'word' ? token : undefined;
	}

	get wordIpa() {
		return `/${this.word?.ipa ?? ''}/`;
	}

	get tiles() {
		const words = this.words.length;
		const guessed = this.words.filter(isGuess).length;
		const shown = (n: number) =>
			words ? n.toLocaleString() : dash;
		return [
			{ label: 'Words', value: shown(words) },
			{ label: 'Dictionary', value: shown(words - guessed) },
			{ label: 'Guessed', value: shown(guessed) },
		];
	}

	@cached
	get letters(): WordLetter[] {
		const symbols = this.word?.symbols ?? [];
		return symbols.map((symbol, at) => ({
			key: `${this.selected}-${at}-${symbol}`,
			sound: soundOf(symbol),
			alternatives: alternativesOf(symbol),
			edits: {
				pick: (sound: Sound) =>
					this.#edit((w) =>
						swapping(w, at, sound.glyph),
					),
				insert: (after: boolean, sound: Sound) =>
					this.#edit((w) =>
						inserting(
							w,
							after ? at + 1 : at,
							sound.glyph,
						),
					),
				remove:
					symbols.length > 1
						? () =>
								this.#edit(
									(w) =>
										removing(
											w,
											at,
										),
								)
						: undefined,
			},
		}));
	}

	#edit(edit: (word: IpaWord) => IpaWord | undefined) {
		const { selected, word } = this;
		const next = word && edit(word);
		if (selected === null || !next) return;
		this.tokens = this.tokens.map((t, i) =>
			i === selected ? next : t,
		);
	}

	setInput = (text: string) => {
		this.input = text;
		this.selected = null;
		if (!this.loading) this.#transcribe();
	};

	pick = (index: number) => {
		this.selected = this.selected === index ? null : index;
	};

	close = () => {
		this.selected = null;
	};

	measured = (height: number) => {
		if (height + 2 !== this.pictureHeight)
			this.pictureHeight = height + 2;
	};

	<template>
		<CanonSplit
			class="ipa-transcriber"
			@halves={{true}}
			@collapsesTo={{collapsedHeight}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<GlossEditor
						@text={{this.input}}
						@pieces={{this.pieces}}
						@selected={{this.selected}}
						@onInput={{this.setInput}}
						@onWord={{this.pick}}
						@onHeight={{this.measured}}
					>
						<:gloss as |piece|>
							{{~#each
								(stressRuns
									piece.gloss
								)
								as |run|
							~}}
								<span
									class={{if
										run.stress
										"ipa-stress"
									}}
								>{{run.text}}</span>
							{{~/each~}}
						</:gloss>
					</GlossEditor>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.word}}
					<GlossWord
						@latin={{this.word.value}}
						@detail={{this.wordIpa}}
						@letters={{this.letters}}
						@alphabet={{alphabet}}
						@onClose={{this.close}}
					/>
				{{/if}}
				<Result
					class="ipa-result"
					@heading="IPA"
					@text={{this.text}}
					@fileName="ipa.txt"
					@busy={{this.loading}}
				>
					<:default>
						<span class="ipa-slash">/</span>
						{{~#each
							this.tokens
							as |token|
						~}}
							{{~#if (isWord token)~}}
								<span
									class="ipa-word
										{{if
											(isGuess
												token
											)
											'ipa-word--guess'
										}}"
									title={{token.value}}
								>
									{{~#each
										(stressRuns
											token.ipa
										)
										as |run|
									~}}
										<span
											class={{if
												run.stress
												"ipa-stress"
											}}
										>{{run.text}}</span>
									{{~/each~}}
								</span>
							{{~else~}}
								<span
								>{{token.value}}</span>
							{{~/if~}}
						{{~/each~}}
						<span class="ipa-slash">/</span>
					</:default>
					<:extra>
						{{#if this.loadingDetail}}
							<CanonRow
								class="ipa-loading"
								@title="Loading"
								@detail={{this.loadingDetail}}
							>
								<CanonLoader />
							</CanonRow>
						{{/if}}
						{{#if this.coreOnly}}
							<CanonStatus
								@text={{this.coreOnlyStatus}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
						{{#if this.words.length}}
							<div class="ipa-legend">
								<span
									class="ipa-legend-item"
								>
									<span
										class="ipa-stress ipa-legend-mark"
									>ˈ</span>
									Stress
								</span>
								<span
									class="ipa-legend-item ipa-word--guess"
								>Guessed</span>
							</div>
						{{/if}}
					</:extra>
				</Result>
				<CanonRows @framed={{true}}>
					<CanonTiles @items={{this.tiles}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}

function isWord(token: IpaToken): token is IpaWord {
	return token.type === 'word';
}
