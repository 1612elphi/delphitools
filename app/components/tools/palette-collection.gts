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
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import {
	COLLECTION_CATEGORIES,
	CURATED_PALETTES,
	getPalettesByCategory,
	type CuratedPalette,
	type PaletteCollectionCategory,
} from 'delphitools-v2/lib/palette-collection';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

type CategoryFilter = PaletteCollectionCategory | 'all';
type CountFilter = number | 'all';

const CATEGORIES = Object.entries(COLLECTION_CATEGORIES) as [
	PaletteCollectionCategory,
	{ label: string; description: string },
][];

export default class PaletteCollectionTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked selectedCategory: CategoryFilter = 'all';
	@tracked selectedCount: CountFilter = 'all';
	@tracked searchQuery = '';

	total = CURATED_PALETTES.length;

	categories = CATEGORIES.map(([key, meta]) => ({
		key,
		label: meta.label,
	}));

	// constant list, compute once
	palettesByCategory = getPalettesByCategory();

	get activeCategory() {
		return this.selectedCategory === 'all'
			? null
			: COLLECTION_CATEGORIES[this.selectedCategory];
	}

	get availableCounts(): number[] {
		return [
			...new Set(CURATED_PALETTES.map((p) => p.colors.length)),
		].sort((a, b) => a - b);
	}

	get hasActiveFilter(): boolean {
		return (
			this.selectedCategory !== 'all' ||
			this.selectedCount !== 'all' ||
			this.searchQuery.trim() !== ''
		);
	}

	get filteredPalettes(): CuratedPalette[] {
		const category = this.selectedCategory;
		const inCategory =
			category === 'all'
				? CURATED_PALETTES
				: this.palettesByCategory[category];

		const inCount =
			this.selectedCount === 'all'
				? inCategory
				: inCategory.filter(
						(p) => p.colors.length === this.selectedCount,
					);

		const query = this.searchQuery.trim().toLowerCase();
		if (!query) return inCount;

		// match displayed notation too
		return inCount.filter(
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

	// untrimmed: whitespace counts
	get countLabel() {
		if (!this.hasActiveFilter) return `${this.total} palettes`;
		const found = this.filteredPalettes.length;
		return `${found} ${found === 1 ? 'result' : 'results'}`;
	}

	get cards() {
		return this.filteredPalettes.map((palette) => ({
			id: palette.id,
			name: palette.name,
			colourCount: palette.colors.length,
			// LinkTo encodes this
			coloursParam: palette.colors.join(','),
			swatches: palette.colors.map((hex, index) => ({
				key: `${palette.id}-${index}`,
				value: this.colourNotation.format(hex),
				// style-concatenation: curated hex trusted
				fillStyle: htmlSafe(`background-color: ${hex}`),
			})),
		}));
	}

	selectCategory = (category: CategoryFilter) => {
		this.selectedCategory = category;
	};

	get countOptions(): { value: string; label: string }[] {
		return this.availableCounts.map((count) => ({
			value: String(count),
			label: `${count} colours`,
		}));
	}

	get countValue(): string {
		return this.selectedCount === 'all'
			? 'all'
			: String(this.selectedCount);
	}

	get countName(): string {
		return this.selectedCount === 'all'
			? 'Any size'
			: `${this.selectedCount} colours`;
	}

	chooseCount = (value: string) => {
		if (value === 'all') {
			this.selectedCount = 'all';
			return;
		}
		const parsed = Number(value);
		this.selectedCount = Number.isInteger(parsed)
			? parsed
			: 'all';
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
				<span class="dt-collection-size">
					<span
						class="dt-collection-label"
					>Colours</span>
					<Select
						@value={{this.countValue}}
						@onValueChange={{this.chooseCount}}
					>
						<SelectTrigger>
							<SelectValue
							>{{this.countName}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem
								@value="all"
							>Any size</SelectItem>
							{{#each
								this.countOptions
								key="value"
								as |option|
							}}
								<SelectItem
									@value={{option.value}}
								>{{option.label}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
				</span>
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
							<p>No palettes found
								matching your
								filters.</p>
						</div>
					{{/if}}
				{{/let}}
			</div>

			<div class="dt-collection-foot">
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
