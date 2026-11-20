import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonTooltip from 'delphicanon/components/canon-tooltip';
import { IconSvg } from 'delphitools-v2/components/icon';
import { exportGloss } from 'delphitools-v2/components/tools/shavian-transliterator/export';
import {
	alphabet,
	carryEdits,
	editWord,
	inserting,
	isGuess,
	markers,
	piecesOf,
	removing,
	soundOf,
	swapping,
	tilesOf,
	withMarker,
	type Marker,
} from 'delphitools-v2/components/tools/shavian-transliterator/gloss';
import GlossEditor, {
	collapsedHeight,
} from 'delphitools-v2/components/tools/text-tool/gloss-editor';
import type { Sound } from 'delphitools-v2/components/tools/text-tool/gloss-pieces';
import GlossWord, {
	type WordLetter,
} from 'delphitools-v2/components/tools/text-tool/gloss-word';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import type { Alternative } from 'delphitools-v2/lib/shavian/alternatives';
import {
	loadCoreDictionary,
	loadFullDictionary,
} from 'delphitools-v2/lib/shavian/dictionary';
import { getShavianLetter } from 'delphitools-v2/lib/shavian/phoneme-map';
import {
	glossToText,
	markerPrefix,
	reResolveTokens,
	setCoreDictionary,
	setFullDictionary,
	tokenise,
	type GlossToken,
} from 'delphitools-v2/lib/shavian/transliterate';
import './shavian-transliterator/shavian-transliterator.css';

const defaultText = 'Mankind, be vigilant; we loved you.';
const coreOnlyStatus = 'Core dictionary only, uncommon words are guessed';
const markerTip =
	'A namer dot · marks a proper noun. An acroring ⸰ marks an initialism (like FBI), an acroarc ꤮ an acronym said as a word (like NASA).';

type DictStatus = 'loading-core' | 'loading-full' | 'core-only' | 'ready';

const InfoIcon = <template><IconSvg @name="info" /></template>;
const DownloadIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;

export default class ShavianTransliterator extends Component {
	@tracked input = defaultText;
	@tracked tokens: GlossToken[] = [];
	@tracked dictStatus: DictStatus = 'loading-core';
	@tracked selected: number | null = null;
	@tracked pictureHeight = 320;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const text = new URLSearchParams(window.location.search).get(
			'shavianText',
		);
		if (text !== null) this.input = text;
		void this.#loadDictionaries();
	}

	async #loadDictionaries() {
		const core = await loadCoreDictionary();
		if (this.isDestroyed) return;
		setCoreDictionary(core);
		this.dictStatus = 'loading-full';
		this.tokens = tokenise(this.input);
		this.#launch();
		try {
			const full = await loadFullDictionary();
			if (this.isDestroyed) return;
			setFullDictionary(full);
			this.tokens = reResolveTokens(this.tokens);
			this.dictStatus = 'ready';
		} catch (error) {
			console.error(
				'shavian full dictionary failed to load:',
				error,
			);
			if (!this.isDestroyed) this.dictStatus = 'core-only';
		}
	}

	#launch() {
		const query = new URLSearchParams(window.location.search);
		const word = Number(query.get('shavianWord'));
		const slot = this.tokens
			.flatMap((t, i) => (t.gloss ? [i] : []))
			.at(word - 1);
		if (!word || slot === undefined) return;
		this.selected = slot;
		if (query.has('shavianMarker'))
			this.setMarker(Number(query.get('shavianMarker')) % 4);
		const first = this.word?.phonemes[0]?.alternatives[0];
		if (query.has('shavianSwap') && first) this.#swap(0, first);
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

	get coreOnlyStatus() {
		return coreOnlyStatus;
	}

	get markerTip() {
		return markerTip;
	}

	get markerTitles() {
		return markers.map((m) => m.label);
	}

	get words() {
		return this.tokens.filter((t) => t.gloss);
	}

	get text() {
		return this.words.length ? glossToText(this.tokens) : '';
	}

	get tiles() {
		return tilesOf(this.tokens);
	}

	get word() {
		return this.selected === null
			? undefined
			: this.tokens[this.selected]?.gloss;
	}

	get wordIpa() {
		return `/${this.word?.ipa ?? ''}/`;
	}

	get markerIndex() {
		const marker = this.word?.marker;
		return markers.findIndex((m) => m.marker === marker);
	}

	get exportText() {
		return passAlong('Export Gloss');
	}

	get pieces() {
		return piecesOf(this.input, this.tokens);
	}

	@cached
	get letters(): WordLetter[] {
		const count = this.word?.phonemes.length ?? 0;
		const letterOf = (sound: Sound) => ({
			shavian: sound.glyph,
			ipa: sound.ipa,
		});
		return (this.word?.phonemes ?? []).map((phoneme, at) => ({
			key: `${this.selected}-${at}-${phoneme.shavian}`,
			sound: {
				glyph: phoneme.shavian,
				name:
					getShavianLetter(phoneme.shavian)
						?.name ?? '',
				ipa: phoneme.ipa,
			},
			alternatives: phoneme.alternatives.map(soundOf),
			edits: {
				pick: (sound: Sound) =>
					this.#swap(at, letterOf(sound)),
				insert: (after: boolean, sound: Sound) =>
					this.#edit((w) =>
						inserting(
							w,
							after ? at + 1 : at,
							letterOf(sound),
						),
					),
				remove:
					count > 1
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

	@cached
	get runs() {
		return this.tokens.map((token) => {
			const { gloss } = token;
			return {
				marker: gloss ? markerPrefix(gloss.marker) : '',
				text: gloss
					? gloss.phonemes
							.map((p) => p.shavian)
							.join('')
					: token.value,
				guess: gloss ? isGuess(gloss) : false,
			};
		});
	}

	#edit(edit: Parameters<typeof editWord>[2]) {
		if (this.selected === null) return;
		this.tokens = editWord(this.tokens, this.selected, edit);
	}

	#swap(at: number, alternative: Pick<Alternative, 'shavian' | 'ipa'>) {
		this.#edit((w) => swapping(w, at, alternative));
	}

	setInput = (text: string) => {
		this.input = text;
		this.selected = null;
		if (this.dictStatus !== 'loading-core')
			this.tokens = carryEdits(this.tokens, tokenise(text));
	};

	pick = (index: number) => {
		this.selected = this.selected === index ? null : index;
	};

	close = () => {
		this.selected = null;
	};

	setMarker = (index: number) => {
		const marker: Marker | undefined = markers[index]?.marker;
		if (marker) this.#edit((w) => withMarker(w, marker));
	};

	measured = (height: number) => {
		if (height + 2 !== this.pictureHeight)
			this.pictureHeight = height + 2;
	};

	exportImage = () => void exportGloss(this.tokens);

	<template>
		<CanonSplit
			class="shavian-transliterator"
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
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.word}}
					<GlossWord
						@latin={{this.word.latin}}
						@detail={{this.wordIpa}}
						@letters={{this.letters}}
						@alphabet={{alphabet}}
						@onClose={{this.close}}
					>
						<CanonRow
							@title="Marker"
							@form="flush"
						>
							<CanonTooltip
								@text={{this.markerTip}}
								as |tip|
							>
								<CanonButton
									{{tip.trigger}}
									@kind="cell"
									@icon={{InfoIcon}}
									@label="Marker"
								/>
							</CanonTooltip>
						</CanonRow>
						<CanonSegmented
							aria-label="Marker"
							@items={{this.markerTitles}}
							@selected={{this.markerIndex}}
							@columns={{2}}
							@onChange={{this.setMarker}}
						/>
					</GlossWord>
				{{/if}}
				<Result
					class="sh-result"
					@heading="Shavian"
					@text={{this.text}}
					@fileName="shavian.txt"
					@busy={{if
						this.loadingDetail
						true
						false
					}}
				>
					<:default>
						{{~#each this.runs as |run|~}}
							<span
								class={{if
									run.guess
									"sh-run--guess"
								}}
							><span
									class="sh-run-marker"
								>{{run.marker}}</span>{{run.text}}</span>
						{{~/each~}}
					</:default>
					<:extra>
						{{#if this.loadingDetail}}
							<CanonRow
								class="sh-loading"
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
							<div class="sh-legend">
								<span
									class="sh-legend-item"
								><span
										class="sh-legend-mark"
									>·</span>
									Marked</span>
								<span
									class="sh-legend-item sh-run--guess"
								>Guessed</span>
							</div>
							<CanonGrid>
								<CanonButton
									class="sh-export"
									@text={{this.exportText}}
									@icon={{DownloadIcon}}
									@onClick={{this.exportImage}}
								/>
							</CanonGrid>
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
