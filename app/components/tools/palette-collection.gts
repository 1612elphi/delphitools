import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn, hash } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import Icon from 'delphitools-v2/components/icon';
import {
	COLLECTION_CATEGORIES,
	CURATED_PALETTES,
	getPalettesByCategory,
	type CuratedPalette,
	type PaletteCollectionCategory,
} from 'delphitools-v2/lib/palette-collection';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

type CategoryFilter = PaletteCollectionCategory | 'all';

const CATEGORIES = Object.entries(COLLECTION_CATEGORIES) as [
	PaletteCollectionCategory,
	{ label: string; description: string },
][];

export default class PaletteCollectionTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked selectedCategory: CategoryFilter = 'all';
	@tracked searchQuery = '';

	total = CURATED_PALETTES.length;

	categories = CATEGORIES.map(([key, meta]) => ({
		key,
		label: meta.label,
	}));

	// Bucketed once, as the Next app's useMemo(…, []) did; the list is a module
	// constant and never changes.
	palettesByCategory = getPalettesByCategory();

	get activeCategory() {
		return this.selectedCategory === 'all'
			? null
			: COLLECTION_CATEGORIES[this.selectedCategory];
	}

	get filteredPalettes(): CuratedPalette[] {
		const category = this.selectedCategory;
		const inCategory =
			category === 'all'
				? CURATED_PALETTES
				: this.palettesByCategory[category];

		const query = this.searchQuery.trim().toLowerCase();
		if (!query) return inCategory;

		// The Next app matched the raw hex. The header notation also drives what
		// the swatch titles read, so a query typed in that notation matches too.
		return inCategory.filter(
			(p) =>
				p.name.toLowerCase().includes(query) ||
				p.colors.some(
					(c) =>
						c
							.toLowerCase()
							.includes(query) ||
						this.colourNotation
							.format(c)
							.toLowerCase()
							.includes(query),
				),
		);
	}

	/** Untrimmed, matching the Next app: a whitespace query counts as a search. */
	get countLabel() {
		if (!this.searchQuery) return `${this.total} palettes`;
		const found = this.filteredPalettes.length;
		return `${found} ${found === 1 ? 'result' : 'results'}`;
	}

	get cards() {
		return this.filteredPalettes.map((palette) => ({
			id: palette.id,
			name: palette.name,
			colourCount: palette.colors.length,
			// Raw, not encoded: LinkTo escapes the value when it builds the URL,
			// and palette-genny's coloursFromQuery decodes it back.
			coloursParam: palette.colors.join(','),
			swatches: palette.colors.map((hex, index) => ({
				key: `${palette.id}-${index}`,
				value: this.colourNotation.format(hex),
				// style-concatenation wants one trusted value rather than an
				// interpolated attribute; every hex here is from the
				// curated list.
				fillStyle: htmlSafe(`background-color: ${hex}`),
			})),
		}));
	}

	selectCategory = (category: CategoryFilter) => {
		this.selectedCategory = category;
	};

	setSearch = (event: Event) => {
		this.searchQuery = (event.target as HTMLInputElement).value;
	};

	<template>
		<div class="dt-collection">
			<div class="dt-collection-search">
				<div class="dt-collection-field">
					<Icon @name="search" />
					<input
						type="text"
						aria-label="Search palettes"
						placeholder="Search palettes…"
						value={{this.searchQuery}}
						{{on "input" this.setSearch}}
					/>
				</div>
				<div
					class="dt-collection-count"
				>{{this.countLabel}}</div>
			</div>

			<div class="dt-collection-filter">
				<div class="segmented dt-collection-cats">
					<button
						type="button"
						class="dt-collection-cat is-all
							{{if
								(eq
									this.selectedCategory
									'all'
								)
								'is-on'
							}}"
						{{on
							"click"
							(fn
								this.selectCategory
								"all"
							)
						}}
					>All</button>
					{{#each
						this.categories key="key"
						as |cat|
					}}
						<button
							type="button"
							class="dt-collection-cat
								{{if
									(eq
										this.selectedCategory
										cat.key
									)
									'is-on'
								}}"
							{{on
								"click"
								(fn
									this.selectCategory
									cat.key
								)
							}}
						>{{cat.label}}</button>
					{{/each}}
				</div>
			</div>

			{{#if this.activeCategory}}
				<div class="dt-collection-desc">
					<span
						class="dt-collection-desc-label"
					>{{this.activeCategory.label}}:</span>
					{{this.activeCategory.description}}
				</div>
			{{/if}}

			{{! one pass over the getter rather than one per block }}
			<div class="dt-collection-body">
				{{#let this.cards as |cards|}}
					{{#if cards}}
						<div class="dt-collection-grid">
							{{#each
								cards key="id"
								as |card|
							}}
								<div
									class="dt-collection-cell"
								>
									<LinkTo
										@route="tools.tool"
										@model="palette-genny"
										@query={{hash
											colors=card.coloursParam
										}}
										class="dt-collection-card"
									>
										<span
											class="dt-collection-strip"
										>
											{{#each
												card.swatches
												key="key"
												as |swatch|
											}}
												<span
													class="dt-collection-swatch"
													style={{swatch.fillStyle}}
													title={{swatch.value}}
												></span>
											{{/each}}
										</span>

										<span
											class="dt-collection-info"
										>
											<span
												class="dt-collection-meta"
											>
												<span
													class="dt-collection-name"
												>{{card.name}}</span>
												<span
													class="dt-collection-tally"
												>{{card.colourCount}}
													colours</span>
											</span>
											<span
												class="dt-collection-go"
											>
												<Icon
													@name="arrow-right"
												/>
											</span>
										</span>
									</LinkTo>
								</div>
							{{/each}}
						</div>
					{{else}}
						<div
							class="dt-collection-empty"
						>
							<Icon
								@name="palette"
								class="dt-collection-empty-icon"
							/>
							{{! wording carried over from the Next app }}
							<p>No palettes found
								matching your
								search.</p>
						</div>
					{{/if}}
				{{/let}}
			</div>

			<div class="dt-collection-foot">
				{{! wording carried over from the Next app }}
				<div class="dt-collection-foot-text">Want to
					create your own palette?</div>
				<LinkTo
					@route="tools.tool"
					@model="palette-genny"
					class="dt-collection-foot-link"
				>
					<Icon @name="palette" />
					Open Palette Generator
				</LinkTo>
			</div>
		</div>
	</template>
}
