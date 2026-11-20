import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn, hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { LinkTo } from '@ember/routing';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDetentWheel from 'delphicanon/components/canon-detent-wheel';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import Icon from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	COLLECTION_CATEGORIES,
	CURATED_PALETTES,
	getPalettesByCategory,
	type CuratedPalette,
	type PaletteCollectionCategory,
} from 'delphitools-v2/lib/palette-collection';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import { COLOUR_NOTATIONS } from 'delphitools-v2/lib/colour-notation';
import Deck from 'delphitools-v2/components/tools/palette-collection/deck';
import 'delphicanon/components/canon-colour-card.css';
import './palette-collection/palette-collection.css';

const rowHeight = 56;
const wheelHeight = rowHeight * 7;

const shelves = Object.keys(
	COLLECTION_CATEGORIES,
) as PaletteCollectionCategory[];
const byCategory = getPalettesByCategory();
const views = ['Fan', 'Grid'];

function bands(colours: string[]) {
	return `linear-gradient(to right, ${colours
		.map(
			(c, i, all) =>
				`${c} ${(i / all.length) * 100}% ${((i + 1) / all.length) * 100}%`,
		)
		.join(', ')})`;
}

function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const asked = query.get('collectionCategory')?.toLowerCase();
	const found = CURATED_PALETTES.find(
		(p) => p.id === query.get('collectionPalette'),
	);
	const shelf = found
		? shelves.indexOf(found.category)
		: shelves.findIndex(
				(key) =>
					key === asked ||
					COLLECTION_CATEGORIES[
						key
					].label.toLowerCase() === asked,
			);
	return {
		shelf: Math.max(shelf, 0),
		palette: found ? byCategory[found.category].indexOf(found) : 0,
		grid: query.get('collectionView') === 'grid',
	};
}

export default class PaletteCollection extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked shelf: number;
	@tracked selected: number;
	@tracked grid: boolean;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.shelf = flags.shelf;
		this.selected = flags.palette;
		this.grid = flags.grid;
	}

	shelfPalettes = (index: number) => byCategory[shelves[index]!];

	get shown(): CuratedPalette[] {
		return this.shelfPalettes(this.shelf);
	}

	@cached
	get tiles() {
		const current = this.palette;
		return this.shown.map((palette, index) => ({
			index,
			name: palette.name,
			current: palette === current,
			ribbon: htmlSafe(
				`background: ${bands(palette.colors)}`,
			),
		}));
	}

	get palette(): CuratedPalette | undefined {
		return this.shown[
			Math.min(this.selected, this.shown.length - 1)
		];
	}

	get colours() {
		return (this.palette?.colors ?? []).map((hex) => ({
			name: getColourName(hex),
			value: this.colourNotation.format(hex),
			swatch: htmlSafe(`background: ${hex}`),
		}));
	}

	get notationLabel() {
		const { notation } = this.colourNotation;
		return (
			COLOUR_NOTATIONS.find((n) => n.id === notation)
				?.label ?? ''
		);
	}

	get detail() {
		const { palette } = this;
		return palette
			? `${COLLECTION_CATEGORIES[palette.category].label} · ${palette.colors.length}`
			: undefined;
	}

	get category() {
		return COLLECTION_CATEGORIES[shelves[this.shelf]!];
	}

	get coloursQuery() {
		return this.palette?.colors.join(',') ?? '';
	}

	shelfText = (index: number) =>
		COLLECTION_CATEGORIES[shelves[index]!].label;

	shelfRow = (index: number, focus: number) => ({
		title: this.shelfText(index),
		count: this.shelfPalettes(index).length,
		style: focusStyle(focus),
	});

	paletteText = (index: number) => this.shown[index]?.name ?? '';

	paletteRow = (index: number, focus: number) => {
		const palette = this.shown[index];
		return {
			title: palette?.name ?? '',
			style: focusStyle(focus),
			ribbon: htmlSafe(
				`block-size: ${3 + 4 * focus}px; background: ${bands(palette?.colors ?? [])}`,
			),
		};
	};

	pickShelf = (index: number) => {
		this.shelf = index;
		this.selected = 0;
	};

	pickPalette = (index: number) => (this.selected = index);

	pickView = (index: number) => (this.grid = index === 1);

	pickTile = (index: number) => {
		this.selected = index;
		this.grid = false;
	};

	<template>
		<CanonSplit
			class="palette-collection"
			@halves={{true}}
			@collapsesTo={{240}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1.2}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					{{#if this.grid}}
						<div
							class="pc-grid"
							role="list"
							aria-label={{this.category.label}}
						>
							{{#each
								this.tiles
								as |tile|
							}}
								<div
									role="listitem"
								>
									<button
										type="button"
										class="pc-tile"
										aria-current={{if
											tile.current
											"true"
										}}
										{{on
											"click"
											(fn
												this.pickTile
												tile.index
											)
										}}
									><span
											class="pc-tile-name"
										>{{tile.name}}</span><span
											class="pc-tile-ribbon"
											style={{tile.ribbon}}
										></span></button>
								</div>
							{{/each}}
						</div>
					{{else}}
						<Deck
							@palette={{this.palette}}
							@detail={{this.detail}}
							@emptyTitle={{this.category.label}}
							@format={{this.colourNotation.format}}
						/>
					{{/if}}
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonCanvas
					@height={{wheelHeight}}
					@background="var(--canon-muted)"
				>
					<div
						style={{wheelStyle}}
						class="pc-wheels"
					>
						<span
							class="pc-window"
							aria-hidden="true"
						></span>
						<CanonDetentWheel
							class="pc-shelves"
							@count={{shelves.length}}
							@selected={{this.shelf}}
							@rowHeight={{rowHeight}}
							@onSelect={{this.pickShelf}}
							@text={{this.shelfText}}
							@label="Category"
							as |index focus|
						>
							{{#let
								(this.shelfRow
									index
									focus
								)
								as |row|
							}}
								<span
									class="pc-row"
									style={{row.style}}
								>
									<span
										class="pc-row-title"
									>{{row.title}}</span>
									<span
										class="pc-row-count"
									>{{row.count}}</span>
								</span>
							{{/let}}
						</CanonDetentWheel>
						<CanonDetentWheel
							class="pc-palettes"
							@count={{this.shown.length}}
							@selected={{this.selected}}
							@rowHeight={{rowHeight}}
							@onSelect={{this.pickPalette}}
							@text={{this.paletteText}}
							@label="Palette"
							as |index focus|
						>
							{{#let
								(this.paletteRow
									index
									focus
								)
								as |row|
							}}
								<span
									class="pc-row pc-row--palette"
									style={{row.style}}
								>
									<span
										class="pc-row-title"
									>{{row.title}}</span>
									<span
										class="pc-ribbon"
										style={{row.ribbon}}
									></span>
								</span>
							{{/let}}
						</CanonDetentWheel>
					</div>
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<CanonRow @title="View">
						<CanonSegmented
							class="pc-view"
							@items={{views}}
							@selected={{if
								this.grid
								1
								0
							}}
							@onChange={{this.pickView}}
						/>
					</CanonRow>
					<p
						class="pc-description"
					>{{this.category.label}}:
						{{this.category.description}}</p>
				</CanonRows>
				{{#if this.palette}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text={{this.palette.name}}
						/>
						{{#each
							this.colours
							as |colour|
						}}
							<div
								class="canon-colour-card canon-colour-card--row"
							>
								<div
									class="canon-colour-card-swatch"
									style={{colour.swatch}}
								></div>
								<div
									class="canon-colour-card-info"
								>
									<div
										class="canon-colour-card-name"
									>{{colour.name}}</div>
									<CanonValueLine
										@label={{this.notationLabel}}
										@value={{colour.value}}
									/>
								</div>
							</div>
						{{/each}}
						<LinkTo
							@route="tools.tool"
							@model="palette-genny"
							@query={{hash
								colors=this.coloursQuery
							}}
							class="pc-open"
						>
							<Icon @name="palette" />
							Open Palette Generator
						</LinkTo>
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}

const wheelStyle = htmlSafe(`--pc-row: ${rowHeight}px`);

function focusStyle(focus: number) {
	return htmlSafe(
		`--pc-focus: ${focus}; font-size: ${15 + 5 * focus}px; font-weight: ${400 + Math.round(200 * focus)}`,
	);
}
