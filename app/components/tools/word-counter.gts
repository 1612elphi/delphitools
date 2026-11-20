import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	averageWordLength,
	countText,
	statsReport,
	topWords,
} from 'delphitools-v2/components/tools/word-counter/count';
import Picture from 'delphitools-v2/components/tools/word-counter/picture';
import './word-counter/word-counter.css';

export {
	countText,
	statsReport,
	type TextStats,
} from 'delphitools-v2/components/tools/word-counter/count';

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const MoreIcon = <template><IconSvg @name="chevron-down" /></template>;
const FewerIcon = <template><IconSvg @name="chevron-up" /></template>;

const listed = { folded: 5, unfolded: 25 };

export default class WordCounter extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked text = '';
	@tracked unfolded = false;
	@tracked pictureHeight?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.text = query.get('wcText') ?? '';
		this.unfolded = query.get('wcMore') === '1';
	}

	get stats() {
		return countText(this.text);
	}

	get figures() {
		const { stats } = this;
		return [
			{ label: 'Words', value: stats.words },
			{ label: 'Characters', value: stats.characters },
			{ label: 'Sentences', value: stats.sentences },
			{ label: 'Paragraphs', value: stats.paragraphs },
		].map((figure) => ({
			...figure,
			text: figure.value.toLocaleString(),
		}));
	}

	get tiles() {
		const { stats } = this;
		return [
			{
				label: 'No Spaces',
				value: stats.charactersNoSpaces.toLocaleString(),
			},
			{ label: 'Lines', value: stats.lines.toLocaleString() },
			{
				label: 'Avg Word',
				value: `${averageWordLength(stats)} chars`,
			},
			{ label: 'Reading time', value: stats.readingTime },
			{ label: 'Speaking time', value: stats.speakingTime },
		];
	}

	get top() {
		return topWords(
			this.text,
			this.unfolded ? listed.unfolded : listed.folded + 1,
		);
	}

	get frequent() {
		const { top } = this;
		const most = top[0]?.count ?? 1;
		const shown = this.unfolded ? top : top.slice(0, listed.folded);
		return shown.map((row) => ({
			...row,
			times: `×${row.count}`,
			share: row.count / most,
		}));
	}

	get hasMore() {
		return this.top.length > listed.folded;
	}

	setText = (text: string) => (this.text = text);

	toggleMore = () => (this.unfolded = !this.unfolded);

	copyStats = () => void this.toast.copy(statsReport(this.stats));

	measured = (height: number) => {
		if (height + 2 !== this.pictureHeight)
			this.pictureHeight = height + 2;
	};

	<template>
		<CanonSplit
			class="word-counter"
			@halves={{true}}
			@collapsesTo={{150}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Picture
						@text={{this.text}}
						@words={{this.stats.words}}
						@onInput={{this.setText}}
						@onHeight={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonGrid @columns={{2}}>
						{{#each
							this.figures
							as |figure|
						}}
							<div
								class="wc-figure"
								role="group"
								aria-label={{figure.label}}
							>
								<CanonFigure
									@text={{figure.text}}
									@size={{32}}
								/>
								<span
									class="wc-figure-label"
								>{{figure.label}}</span>
							</div>
						{{/each}}
					</CanonGrid>
					<CanonTiles @items={{this.tiles}} />
					<CanonButton
						@kind="primary"
						@text="Copy Stats"
						@icon={{CopyIcon}}
						@iconStyle="oversized"
						@disabled={{if
							this.text
							false
							true
						}}
						@onClick={{this.copyStats}}
					/>
				</CanonRows>
				{{#if this.frequent.length}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Most Frequent"
						/>
						{{#each this.frequent as |row|}}
							<div
								class="wc-frequent"
								role="group"
								aria-label="{{row.word}} {{row.times}}"
							>
								<span
									class="wc-frequent-word"
								>{{row.word}}</span>
								<span
									class="wc-frequent-times"
								>{{row.times}}</span>
								<CanonBar
									class="wc-frequent-bar"
									@share={{row.share}}
								/>
							</div>
						{{/each}}
						{{#if this.hasMore}}
							<CanonButton
								@kind="cell"
								@text={{if
									this.unfolded
									"Show fewer"
									"Show more"
								}}
								@icon={{if
									this.unfolded
									FewerIcon
									MoreIcon
								}}
								@onClick={{this.toggleMore}}
							/>
						{{/if}}
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
