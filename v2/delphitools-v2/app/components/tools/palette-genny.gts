import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { TrackedArray } from 'tracked-built-ins';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { fn, hash } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import { service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from 'delphitools-v2/components/ui/popover';
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
} from 'delphitools-v2/components/ui/command';
import {
	generatePalette,
	getStrategiesByCategory,
	STRATEGY_CATEGORIES,
	STRATEGY_INFO,
	type PaletteStrategy,
} from 'delphitools-v2/lib/palette-strategies';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	COLLECTION_CATEGORIES,
	type PaletteCollectionCategory,
} from 'delphitools-v2/lib/palette-collection';
import type BreakpointService from 'delphitools-v2/services/breakpoint';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

const MIN_COLOURS = 2;
const MAX_COLOURS = 11;
const GRID_THRESHOLD_MOBILE = 4;
const GRID_THRESHOLD_TABLET = 5;

interface PaletteColour {
	id: string;
	hex: string;
	locked: boolean;
}

const newId = () => Math.random().toString(36).substring(2, 9);
const swatch = (hex: string): PaletteColour => ({
	id: newId(),
	hex,
	locked: false,
});

function hexToRgb(hex: string): [number, number, number] | null {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return null;
	return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

const srgbToLinear = (c: number) => {
	c /= 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
	const lr = srgbToLinear(r),
		lg = srgbToLinear(g),
		lb = srgbToLinear(b);
	const l = Math.cbrt(
		0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
	);
	const m = Math.cbrt(
		0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
	);
	const s = Math.cbrt(
		0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
	);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bv = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	let h = (Math.atan2(bv, a) * 180) / Math.PI;
	if (h < 0) h += 360;
	return [L, Math.sqrt(a * a + bv * bv), h];
}

/** Black or white, whichever reads on the swatch. */
function contrastText(hex: string): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return '#000000';
	const [lr, lg, lb] = rgb.map((c) => {
		c /= 255;
		return c <= 0.03928
			? c / 12.92
			: Math.pow((c + 0.055) / 1.055, 2.4);
	}) as [number, number, number];
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb > 0.4
		? '#000000'
		: '#ffffff';
}

/** `?colors=aabbcc,ddeeff` — the share link the Next app accepts. */
function coloursFromUrl(): string[] | null {
	if (typeof window === 'undefined') return null;
	const param = new URLSearchParams(window.location.search).get('colors');
	if (!param) return null;
	const hexes = param
		.split(',')
		.map((c) =>
			c.trim().startsWith('#') ? c.trim() : `#${c.trim()}`,
		)
		.filter((c) => /^#[a-f\d]{6}$/i.test(c));
	return hexes.length >= MIN_COLOURS ? hexes : null;
}

export default class PaletteGennyTool extends Component {
	@service declare breakpoint: BreakpointService;
	@service declare colourNotation: ColourNotationService;

	colours: TrackedArray<PaletteColour> = new TrackedArray(
		(coloursFromUrl() ?? generatePalette(5, 'random-cohesive')).map(
			swatch,
		),
	);

	@tracked strategy: PaletteStrategy = 'random-cohesive';
	@tracked strategyOpen = false;
	@tracked copied: string | null = null;

	// Hidden panel for adding the current palette to lib/palette-collection.ts.
	// Press P, as in the Next app; not linked from anywhere.
	@tracked exportMode = false;
	@tracked exportName = '';
	@tracked exportCategory: PaletteCollectionCategory = 'classic';
	@tracked importText = '';

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get strategyInfo() {
		return STRATEGY_INFO[this.strategy];
	}

	get groupedStrategies() {
		return getStrategiesByCategory();
	}

	get categories() {
		return Object.entries(STRATEGY_CATEGORIES).map(
			([key, label]) => ({
				key,
				label,
				strategies:
					this.groupedStrategies[
						key as keyof typeof STRATEGY_CATEGORIES
					] ?? [],
			}),
		);
	}

	/** Below the wide layout's minimum, columns stop fitting and it becomes a grid. */
	get isGrid() {
		const b = this.breakpoint.current;
		return (
			(b === 'mobile' &&
				this.colours.length > GRID_THRESHOLD_MOBILE) ||
			(b === 'tablet' &&
				this.colours.length > GRID_THRESHOLD_TABLET)
		);
	}

	get gridColumns() {
		return this.breakpoint.current === 'mobile' ? 2 : 3;
	}

	get atMin() {
		return this.colours.length <= MIN_COLOURS;
	}

	get atMax() {
		return this.colours.length >= MAX_COLOURS;
	}

	get rows() {
		return this.colours.map((colour, index) => ({
			colour,
			index,
			number: String(index + 1).padStart(2, '0'),
			value: this.colourNotation.format(colour.hex),
			name: getColourName(colour.hex),
			// style-concatenation wants one trusted value rather than an
			// interpolated attribute; both inputs are hex from the colour picker.
			fillStyle: htmlSafe(`background-color: ${colour.hex}`),
			contrastStyle: htmlSafe(
				`color: ${contrastText(colour.hex)}`,
			),
			rgbLabel: (() => {
				const rgb = hexToRgb(colour.hex);
				return rgb ? `RGB ${rgb.join(' ')}` : null;
			})(),
			oklchLabel: (() => {
				const rgb = hexToRgb(colour.hex);
				if (!rgb) return null;
				const [L, c, h] = rgbToOklch(...rgb);
				return `L${(L * 100).toFixed(0)} C${c.toFixed(2)} H${h.toFixed(0)}`;
			})(),
			copyKey: `list-${colour.id}`,
		}));
	}

	// Space regenerates, matching the Next app. Bound on the wrapper element
	// rather than window so it only fires while the tool is on screen.
	shortcuts = modifier((element: HTMLElement) => {
		const onKeyDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag))
				return;
			if (e.code === 'Space') {
				e.preventDefault();
				this.regenerate();
			}
			if (e.code === 'KeyP') {
				e.preventDefault();
				this.exportMode = !this.exportMode;
			}
		};
		element.ownerDocument.addEventListener('keydown', onKeyDown);
		return () =>
			element.ownerDocument.removeEventListener(
				'keydown',
				onKeyDown,
			);
	});

	regenerate = () => {
		const fresh = generatePalette(
			this.colours.length,
			this.strategy,
		);
		this.colours.forEach((colour, i) => {
			if (colour.locked) return;
			this.colours[i] = swatch(fresh[i]!);
		});
	};

	setStrategyOpen = (open: boolean) => {
		this.strategyOpen = open;
	};

	chooseStrategy = (strategy: PaletteStrategy) => {
		this.strategy = strategy;
		this.strategyOpen = false;
	};

	addColour = () => {
		if (this.atMax) return;
		this.colours.push(
			swatch(generatePalette(1, this.strategy)[0]!),
		);
	};

	removeColour = (id: string) => {
		if (this.atMin) return;
		const i = this.colours.findIndex((c) => c.id === id);
		if (i !== -1) this.colours.splice(i, 1);
	};

	removeLast = () => {
		if (!this.atMin) this.colours.pop();
	};

	toggleLock = (id: string) => {
		const i = this.colours.findIndex((c) => c.id === id);
		if (i === -1) return;
		this.colours[i] = {
			...this.colours[i]!,
			locked: !this.colours[i]!.locked,
		};
	};

	updateColour = (id: string, event: Event) => {
		const hex = (event.target as HTMLInputElement).value;
		const i = this.colours.findIndex((c) => c.id === id);
		if (i !== -1) this.colours[i] = { ...this.colours[i]!, hex };
	};

	get collectionCategories() {
		return Object.entries(COLLECTION_CATEGORIES).map(
			([key, meta]) => ({
				key,
				label: meta.label,
			}),
		);
	}

	/** Slug the name the same way the collection file does. */
	get exportId() {
		return this.exportName
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	}

	/** Trailing comma so it pastes straight into the collection array. */
	get exportJson() {
		if (!this.exportName.trim()) return '';
		return (
			JSON.stringify(
				{
					id: this.exportId,
					name: this.exportName.trim(),
					colors: this.colours.map((c) => c.hex),
					category: this.exportCategory,
				},
				null,
				2,
			) + ','
		);
	}

	closeExport = () => {
		this.exportMode = false;
	};

	setExportName = (e: Event) => {
		this.exportName = (e.target as HTMLInputElement).value;
	};

	setExportCategory = (e: Event) => {
		this.exportCategory = (e.target as HTMLSelectElement)
			.value as PaletteCollectionCategory;
	};

	setImportText = (e: Event) => {
		this.importText = (e.target as HTMLTextAreaElement).value;
	};

	copyExportJson = () => {
		if (this.exportJson)
			void this.copy(this.exportJson, 'export-json');
	};

	/** One hex per line, with or without the leading #. */
	loadFromText = () => {
		const parsed = this.importText
			.trim()
			.split('\n')
			.map((line) => line.trim().replace(/^#/, ''))
			.filter((hex) => /^[a-f\d]{6}$/i.test(hex))
			.map((hex) => `#${hex}`);
		if (parsed.length < MIN_COLOURS) return;
		this.colours.splice(
			0,
			this.colours.length,
			...parsed.map(swatch),
		);
		this.importText = '';
	};

	copy = async (value: string, label: string) => {
		await navigator.clipboard.writeText(value);
		this.copied = label;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			1500,
		);
	};

	copySwatch = (colour: PaletteColour, key: string) =>
		this.copy(this.colourNotation.format(colour.hex), key);

	copyAll = () =>
		this.copy(
			this.colours
				.map((c) => this.colourNotation.format(c.hex))
				.join(', '),
			'all',
		);

	copyCss = () =>
		this.copy(
			`:root {\n${this.colours
				.map(
					(c, i) =>
						`  --palette-${i + 1}: ${this.colourNotation.format(c.hex)};`,
				)
				.join('\n')}\n}`,
			'css',
		);

	copyJson = () =>
		this.copy(
			JSON.stringify(
				this.colours.map((c) =>
					this.colourNotation.format(c.hex),
				),
				null,
				2,
			),
			'json',
		);

	/** 1200x630 sheet of swatches, drawn fresh each time rather than kept around. */
	downloadImage = () => {
		const width = 1200,
			height = 630,
			pad = 40,
			gap = 12;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const swatchH = height - pad * 2 - 80;
		const swatchW =
			(width - pad * 2 - (this.colours.length - 1) * gap) /
			this.colours.length;

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);

		this.colours.forEach((colour, i) => {
			const x = pad + i * (swatchW + gap);
			ctx.fillStyle = colour.hex;
			ctx.beginPath();
			ctx.roundRect(x, pad, swatchW, swatchH, 16);
			ctx.fill();

			ctx.fillStyle = '#1a1a1a';
			ctx.font = 'bold 20px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText(
				colour.hex.toUpperCase(),
				x + swatchW / 2,
				height - pad - 20,
			);
		});

		ctx.fillStyle = '#999999';
		ctx.font = '16px system-ui, sans-serif';
		ctx.textAlign = 'right';
		ctx.fillText('delphi.tools', width - pad, height - pad + 5);

		const link = document.createElement('a');
		link.download = 'palette.png';
		link.href = canvas.toDataURL('image/png');
		link.click();
	};

	<template>
		<div class="dt-palette" {{this.shortcuts}}>
			<div class="dt-palette-frame">
				<div
					class="dt-palette-swatches
						{{if
							this.isGrid
							'is-grid'
							'is-row'
						}}
						cols-{{this.gridColumns}}"
				>
					{{#each
						this.rows key="colour.id"
						as |row|
					}}
						<div class="dt-swatch">
							<span
								class="dt-swatch-fill"
								title="Click to edit colour"
							>
								<span
									class="dt-swatch-colour"
									style={{row.fillStyle}}
									aria-hidden="true"
								></span>
								<input
									type="color"
									value={{row.colour.hex}}
									aria-label="Edit colour {{row.value}}"
									{{on
										"input"
										(fn
											this.updateColour
											row.colour.id
										)
									}}
								/>
								<span
									class="dt-swatch-index"
									style={{row.contrastStyle}}
								>{{row.number}}</span>
								{{#if
									row.colour.locked
								}}
									<Icon
										@name="lock"
										class="dt-swatch-lock"
										style={{row.contrastStyle}}
									/>
								{{/if}}
							</span>

							<div
								class="dt-swatch-caption"
							>
								<div
									class="dt-swatch-value"
								>{{row.value}}</div>
								<div
									class="dt-swatch-name"
								>{{row.name}}</div>
							</div>

							<div
								class="dt-swatch-bar"
							>
								<button
									type="button"
									class="dt-swatch-btn
										{{if
											row.colour.locked
											'is-locked'
										}}"
									aria-label={{if
										row.colour.locked
										"Unlock colour"
										"Lock colour"
									}}
									{{on
										"click"
										(fn
											this.toggleLock
											row.colour.id
										)
									}}
								>
									<Icon
										@name={{if
											row.colour.locked
											"lock"
											"unlock"
										}}
									/>
								</button>
								<button
									type="button"
									class="dt-swatch-btn"
									aria-label="Copy colour"
									{{on
										"click"
										(fn
											this.copySwatch
											row.colour
											row.colour.id
										)
									}}
								>
									<Icon
										@name={{if
											(eq
												this.copied
												row.colour.id
											)
											"check"
											"copy"
										}}
									/>
								</button>
								<button
									type="button"
									class="dt-swatch-btn is-danger"
									aria-label="Remove colour"
									disabled={{this.atMin}}
									{{on
										"click"
										(fn
											this.removeColour
											row.colour.id
										)
									}}
								>
									<Icon
										@name="trash-2"
									/>
								</button>
							</div>
						</div>
					{{/each}}
				</div>

				{{#if this.exportMode}}
					<div class="dt-export-panel">
						<div class="dt-export-head">
							<h3>Export to Collection
								(Dev Mode)</h3>
							<button
								type="button"
								{{on
									"click"
									this.closeExport
								}}
							>
								Press P to close
							</button>
						</div>

						<div class="dt-export-fields">
							<div>
								<label
									for="dt-export-name"
								>Palette Name</label>
								<input
									id="dt-export-name"
									type="text"
									value={{this.exportName}}
									placeholder="e.g. Ocean Sunset"
									{{on
										"input"
										this.setExportName
									}}
								/>
								{{#if
									this.exportId
								}}
									<p
										class="dt-export-note"
									>ID:
										<code
										>{{this.exportId}}</code></p>
								{{/if}}
							</div>

							<div>
								<label
									for="dt-export-cat"
								>Category</label>
								{{! native select: a dev-only panel does not warrant a primitive }}
								<select
									id="dt-export-cat"
									{{on
										"change"
										this.setExportCategory
									}}
								>
									{{#each
										this.collectionCategories
										as |cat|
									}}
										<option
											value={{cat.key}}
											selected={{eq
												cat.key
												this.exportCategory
											}}
										>{{cat.label}}</option>
									{{/each}}
								</select>
							</div>
						</div>

						<div class="dt-export-import">
							<label
								for="dt-export-import"
							>Import Colors (one per
								line, no #)</label>
							<div
								class="dt-export-import-row"
							>
								<textarea
									id="dt-export-import"
									rows="4"
									value={{this.importText}}
									{{on
										"input"
										this.setImportText
									}}
								></textarea>
								<button
									type="button"
									disabled={{unless
										this.importText
										true
										false
									}}
									{{on
										"click"
										this.loadFromText
									}}
								>Load</button>
							</div>
						</div>

						{{#if this.exportJson}}
							<div
								class="dt-export-json"
							>
								<div
									class="dt-export-json-head"
								>
									<span
									>JSON
										Output</span>
									<button
										type="button"
										{{on
											"click"
											this.copyExportJson
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													"export-json"
												)
												"check"
												"copy"
											}}
										/>
										{{if
											(eq
												this.copied
												"export-json"
											)
											"Copied!"
											"Copy"
										}}
									</button>
								</div>
								<pre
								>{{this.exportJson}}</pre>
							</div>
						{{/if}}
					</div>
				{{/if}}

				<div class="dt-palette-controls">
					<Popover
						@open={{this.strategyOpen}}
						@onOpenChange={{this.setStrategyOpen}}
					>
						<PopoverTrigger
							@asChild={{true}}
							as |trigger|
						>
							<button
								type="button"
								class="dt-strategy"
								aria-label="Choose palette strategy"
								{{trigger.modifiers}}
							>
								<span
									class="dt-strategy-text"
								>
									<span
										class="dt-strategy-name"
									>{{this.strategyInfo.name}}</span>
									<span
										class="dt-strategy-desc"
									>{{this.strategyInfo.description}}</span>
								</span>
								<Icon
									@name="chevrons-up-down"
									class="dt-strategy-chevron"
								/>
							</button>
						</PopoverTrigger>
						<PopoverContent
							@align="start"
							class="dt-strategy-popover"
						>
							<Command>
								<CommandInput
									@placeholder="Search strategies…"
								/>
								<CommandList>
									<CommandEmpty
									>No
										strategy
										found.</CommandEmpty>
									{{#each
										this.categories
										as |category|
									}}
										<CommandGroup
											@heading={{category.label}}
										>
											{{#each
												category.strategies
												as |entry|
											}}
												<CommandItem
													@value="{{entry.info.name}} {{entry.info.description}}"
													@onSelect={{fn
														this.chooseStrategy
														entry.key
													}}
												>
													<Icon
														@name="check"
														class="dt-strategy-check
															{{if
																(eq
																	this.strategy
																	entry.key
																)
																'is-on'
															}}"
													/>
													<span
														class="dt-strategy-text"
													>
														<span
															class="dt-strategy-name"
														>{{entry.info.name}}</span>
														<span
															class="dt-strategy-desc"
														>{{entry.info.description}}</span>
													</span>
												</CommandItem>
											{{/each}}
										</CommandGroup>
									{{/each}}
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>

					<button
						type="button"
						class="dt-generate"
						{{on "click" this.regenerate}}
					>
						<Icon @name="shuffle" />
						Generate
					</button>

					<div class="dt-count">
						<button
							type="button"
							aria-label="Remove colour"
							disabled={{this.atMin}}
							{{on
								"click"
								this.removeLast
							}}
						>
							<Icon @name="minus" />
						</button>
						<span
						>{{this.colours.length}}</span>
						<button
							type="button"
							aria-label="Add colour"
							disabled={{this.atMax}}
							{{on
								"click"
								this.addColour
							}}
						>
							<Icon @name="plus" />
						</button>
					</div>
				</div>

				<div class="dt-palette-export">
					<span
						class="dt-palette-label"
					>Export</span>
					<div class="segmented dt-export-grid">
						<button
							type="button"
							{{on
								"click"
								this.copyAll
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"all"
									)
									"check"
									"copy"
								}}
							/>
							Copy Colours
						</button>
						<button
							type="button"
							{{on
								"click"
								this.copyCss
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"css"
									)
									"check"
									"copy"
								}}
							/>
							CSS Variables
						</button>
						<button
							type="button"
							{{on
								"click"
								this.copyJson
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"json"
									)
									"check"
									"copy"
								}}
							/>
							JSON
						</button>
						<button
							type="button"
							{{on
								"click"
								this.downloadImage
							}}
						>
							<Icon
								@name="download"
							/>
							Download Image
						</button>
					</div>
				</div>

				<div class="dt-palette-list">
					<span
						class="dt-palette-label"
					>Colours</span>
					<div class="dt-colour-rows">
						{{#each
							this.rows
							key="colour.id"
							as |row|
						}}
							<div
								class="dt-colour-row"
							>
								<span
									class="dt-colour-row-swatch"
								>
									<input
										type="color"
										value={{row.colour.hex}}
										aria-label="Edit colour {{row.value}}"
										{{on
											"input"
											(fn
												this.updateColour
												row.colour.id
											)
										}}
									/>
									<span
										style={{row.fillStyle}}
										aria-hidden="true"
									></span>
								</span>

								<div
									class="dt-colour-row-info"
								>
									<div
										class="dt-colour-row-head"
									>
										<span
											class="dt-colour-row-value"
										>{{row.value}}</span>
										<span
											class="dt-colour-row-name"
										>{{row.name}}</span>
									</div>
									<div
										class="dt-colour-row-meta"
									>
										{{row.rgbLabel}}
										{{#if
											row.oklchLabel
										}}
											<span
												class="dt-sep"
											>|</span>
											{{row.oklchLabel}}
										{{/if}}
									</div>
								</div>

								<div
									class="dt-colour-row-actions"
								>
									<button
										type="button"
										class="dt-icon-btn
											{{if
												row.colour.locked
												'is-locked'
											}}"
										aria-label={{if
											row.colour.locked
											"Unlock colour"
											"Lock colour"
										}}
										{{on
											"click"
											(fn
												this.toggleLock
												row.colour.id
											)
										}}
									>
										<Icon
											@name={{if
												row.colour.locked
												"lock"
												"unlock"
											}}
										/>
									</button>
									<button
										type="button"
										class="dt-icon-btn"
										aria-label="Copy colour"
										{{on
											"click"
											(fn
												this.copySwatch
												row.colour
												row.copyKey
											)
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													row.copyKey
												)
												"check"
												"copy"
											}}
										/>
									</button>
									<LinkTo
										@route="tools.tool"
										@model="tailwind-shades"
										@query={{hash
											color=row.colour.hex
										}}
										class="dt-icon-btn"
										title="Generate Tailwind shades"
									>
										<Icon
											@name="wind"
										/>
									</LinkTo>
									{{#unless
										this.atMin
									}}
										<button
											type="button"
											class="dt-icon-btn is-danger"
											aria-label="Remove colour"
											{{on
												"click"
												(fn
													this.removeColour
													row.colour.id
												)
											}}
										>
											<Icon
												@name="trash-2"
											/>
										</button>
									{{/unless}}
								</div>
							</div>
						{{/each}}
					</div>
				</div>
			</div>

			<p class="dt-palette-hint">
				Press
				<kbd>Space</kbd>
				to generate a new palette
			</p>
		</div>
	</template>
}
