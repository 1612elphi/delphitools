import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { TrackedArray } from 'tracked-built-ins';
import { fn, hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { LinkTo } from '@ember/routing';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { parseHex, takesBlackInk } from 'delphicanon/lib/colour';
import type { CanonMenuItem } from 'delphicanon/components/canon-menu';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadUrl } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	COLOUR_NOTATIONS,
	formatColour,
	type ColourNotation,
} from 'delphitools-v2/lib/colour-notation';
import {
	generatePalette,
	STRATEGY_INFO,
	type PaletteStrategy,
} from 'delphitools-v2/lib/palette-strategies';
import {
	COLLECTION_CATEGORIES,
	type PaletteCollectionCategory,
} from 'delphitools-v2/lib/palette-collection';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import { contrastRows } from 'delphitools-v2/components/tools/colour-atlas/atlas';
import {
	CATEGORIES,
	cssBlock,
	hexesFromLines,
	launchFlags,
	MAX_COLOURS,
	MIN_COLOURS,
	slug,
	strategiesIn,
} from 'delphitools-v2/components/tools/palette-genny/palette';
import Reels, {
	type ReelColumn,
} from 'delphitools-v2/components/tools/palette-genny/reels';
import 'delphicanon/components/canon-colour-card.css';
import './palette-genny/palette-genny.css';

interface PaletteColour {
	id: string;
	hex: string;
	locked: boolean;
}

interface Spin {
	token: number;
	panels: string[];
	delay: number;
	duration: number;
}

const newId = () => Math.random().toString(36).substring(2, 9);
const swatch = (hex: string): PaletteColour => ({
	id: newId(),
	hex,
	locked: false,
});

const categoryTitles = CATEGORIES.map((c) => c.title);
const infoFormats: ColourNotation[] = ['hex', 'rgb', 'hsl', 'oklch', 'lab'];

const timing = { spin: 500, extra: 80, stagger: 60 };
const passes = { first: 3, extra: 1 };

const Refresh = <template><IconSvg @name="refresh-cw" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Braces = <template><IconSvg @name="braces" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Lock = <template><IconSvg @name="lock" /></template>;
const Unlock = <template><IconSvg @name="lock-open" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Pipette = <template><IconSvg @name="pipette" /></template>;

export default class PaletteGenny extends Component {
	@service declare colourNotation: ColourNotationService;
	@service('canon-toast') declare toast: CanonToastService;

	colours: TrackedArray<PaletteColour>;
	@tracked strategy: PaletteStrategy = 'random-cohesive';
	@tracked widened?: number;
	@tracked closing?: number;
	#closingTimer?: number;
	spins = new TrackedArray<Spin | undefined>();
	#token = 0;

	@tracked exportMode = false;
	@tracked exportName = '';
	@tracked exportCategory: PaletteCollectionCategory = 'classic';
	@tracked importText = '';

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		if (flags.strategy) this.strategy = flags.strategy;
		this.colours = new TrackedArray(
			(
				flags.colours ??
				generatePalette(5, this.strategy)
			).map(swatch),
		);
		for (const index of flags.locked)
			if (this.colours[index])
				this.colours[index].locked = true;
		if (flags.focus !== undefined && this.colours[flags.focus])
			this.widened = flags.focus;
	}

	get category() {
		return STRATEGY_INFO[this.strategy].category;
	}

	get categoryIndex() {
		return CATEGORIES.findIndex((c) => c.key === this.category);
	}

	get strategies() {
		return strategiesIn(this.category);
	}

	get strategyTitles() {
		return this.strategies.map((key) => STRATEGY_INFO[key].name);
	}

	get strategyIndex() {
		return this.strategies.indexOf(this.strategy);
	}

	get description() {
		return STRATEGY_INFO[this.strategy].description;
	}

	get isWidened() {
		return this.widened !== undefined;
	}

	get atMin() {
		return this.colours.length <= MIN_COLOURS;
	}

	get notationLabel() {
		const { notation } = this.colourNotation;
		return (
			COLOUR_NOTATIONS.find((n) => n.id === notation)
				?.label ?? ''
		);
	}

	format = (hex: string) => this.colourNotation.format(hex);

	@cached
	get columns(): ReelColumn[] {
		const count = this.colours.length;
		return this.colours.map((colour, index) => {
			const ink = takesBlackInk(parseHex(colour.hex)!)
				? 'black'
				: 'white';
			const spin = this.spins[index];
			const wide = this.widened === index;
			return {
				key: `${index}:${spin?.token ?? 0}`,
				index,
				number: String(index + 1).padStart(2, '0'),
				hex: colour.hex,
				value: this.format(colour.hex),
				name: getColourName(colour.hex),
				locked: colour.locked,
				wide,
				style: htmlSafe(
					`background-color: ${colour.hex}; color: ${ink}; --pg-colour: ${colour.hex}` +
						(spin?.panels.length
							? `; --pg-panels: ${spin.panels.length}; --pg-delay: ${spin.delay}ms; --pg-spin: ${spin.duration}ms`
							: ''),
				),
				reel: spin?.panels.length
					? {
							panels: spin.panels.map(
								(hex) =>
									htmlSafe(
										`background: ${hex}`,
									),
							),
						}
					: undefined,
				info:
					wide || this.closing === index
						? {
								lines: infoFormats.map(
									(
										id,
									) => ({
										label:
											COLOUR_NOTATIONS.find(
												(
													n,
												) =>
													n.id ===
													id,
											)
												?.label ??
											id,
										value: formatColour(
											colour.hex,
											id,
										),
									}),
								),
								contrasts: contrastRows(
									parseHex(
										colour.hex,
									)!,
								),
							}
						: undefined,
				menu: [
					{ title: 'Copy', icon: Copy },
					{ title: 'Edit colour', icon: Pipette },
					colour.locked
						? {
								title: 'Unlock',
								icon: Unlock,
							}
						: { title: 'Lock', icon: Lock },
					{
						title: 'Remove',
						icon: Trash,
						destructive: true,
						disabled: count <= MIN_COLOURS,
					},
				],
			};
		});
	}

	get rows() {
		return this.colours.map((colour, index) => ({
			colour,
			index,
			value: this.format(colour.hex),
			name: getColourName(colour.hex),
			fill: htmlSafe(`background-color: ${colour.hex}`),
		}));
	}

	get values() {
		return this.colours.map((c) => this.format(c.hex));
	}

	get css() {
		return cssBlock(this.values);
	}

	shortcuts = modifier((element: HTMLElement) => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				([
					'INPUT',
					'TEXTAREA',
					'SELECT',
					'BUTTON',
					'A',
				].includes(target.tagName) ||
					target.isContentEditable ||
					target.closest('[role="menu"]'))
			)
				return;
			if (event.code === 'Space') {
				event.preventDefault();
				this.regenerate();
			}
			if (event.code === 'KeyP') {
				event.preventDefault();
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
		const lockedHexes = this.colours
			.filter((colour) => colour.locked)
			.map((colour) => colour.hex);
		const fresh = generatePalette(
			this.colours.length,
			this.strategy,
			lockedHexes,
		);
		let order = 0;
		this.colours.forEach((colour, i) => {
			if (colour.locked) return;
			const next = fresh[i]!;
			const fillers = generatePalette(
				passes.first + order * passes.extra,
				this.strategy,
			);
			this.spins[i] = {
				token: ++this.#token,
				panels: [
					next,
					...fillers.reverse(),
					colour.hex,
				],
				delay: order * timing.stagger,
				duration: timing.spin + order * timing.extra,
			};
			this.colours[i] = { ...swatch(next) };
			order += 1;
		});
	};

	landed = (index: number) => {
		const spin = this.spins[index];
		if (spin) this.spins[index] = { ...spin, panels: [] };
	};

	pickCategory = (index: number) => {
		this.pickStrategy(0, CATEGORIES[index]!.key);
	};

	pickStrategy = (index: number, category = this.category) => {
		this.strategy = strategiesIn(category)[index]!;
		this.regenerate();
	};

	addColour = () => {
		if (this.colours.length >= MAX_COLOURS) return;
		const seeds = this.colours.map((colour) => colour.hex);
		this.colours.push(
			swatch(generatePalette(1, this.strategy, seeds)[0]!),
		);
	};

	removeAt = (index: number) => {
		if (this.atMin) return;
		this.colours.splice(index, 1);
		this.spins.splice(index, 1);
		if (this.widened === index) this.widened = undefined;
		else if (this.widened !== undefined && this.widened > index)
			this.widened -= 1;
	};

	setCount = (count: number) => {
		while (
			this.colours.length < count &&
			this.colours.length < MAX_COLOURS
		)
			this.addColour();
		while (this.colours.length > count && !this.atMin)
			this.removeAt(this.colours.length - 1);
	};

	toggleLock = (index: number) => {
		const colour = this.colours[index];
		if (colour)
			this.colours[index] = {
				...colour,
				locked: !colour.locked,
			};
	};

	edit = (index: number, event: Event) => {
		const hex = (event.target as HTMLInputElement).value;
		const colour = this.colours[index];
		if (!colour || !parseHex(hex)) return;
		this.colours[index] = { ...colour, hex, locked: true };
	};

	widen = (index: number) => {
		window.clearTimeout(this.#closingTimer);
		if (this.widened === index) {
			this.widened = undefined;
			this.closing = index;
			this.#closingTimer = window.setTimeout(
				() => (this.closing = undefined),
				500,
			);
		} else {
			this.widened = index;
			this.closing = undefined;
		}
	};

	willDestroy() {
		super.willDestroy();
		window.clearTimeout(this.#closingTimer);
	}

	menu = (index: number, item: CanonMenuItem) => {
		const colour = this.colours[index];
		if (!colour) return;
		if (item.title === 'Copy') this.copy(this.format(colour.hex));
		else if (item.title === 'Remove') this.removeAt(index);
		else if (item.title === 'Edit colour')
			document.querySelectorAll<HTMLInputElement>(
				'.palette-genny .pg-col-picker',
			)[index]?.showPicker();
		else this.toggleLock(index);
	};

	copy = (value: string) => void this.toast.copy(value);

	copyAll = () => this.copy(this.values.join(', '));

	copyJson = () => this.copy(JSON.stringify(this.values, null, 2));

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

		downloadUrl(canvas.toDataURL('image/png'), 'palette.png');
	};

	get collectionCategories() {
		return Object.entries(COLLECTION_CATEGORIES).map(
			([key, meta]) => ({
				key,
				label: meta.label,
			}),
		);
	}

	get exportId() {
		return slug(this.exportName);
	}

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

	closeExport = () => (this.exportMode = false);

	setExportName = (event: Event) =>
		(this.exportName = (event.target as HTMLInputElement).value);

	setExportCategory = (event: Event) =>
		(this.exportCategory = (event.target as HTMLSelectElement)
			.value as PaletteCollectionCategory);

	setImportText = (event: Event) =>
		(this.importText = (event.target as HTMLTextAreaElement).value);

	copyExportJson = () => {
		if (this.exportJson) this.copy(this.exportJson);
	};

	loadFromText = () => {
		const parsed = hexesFromLines(this.importText);
		if (!parsed) return;
		this.colours.splice(
			0,
			this.colours.length,
			...parsed.map(swatch),
		);
		this.spins.splice(0, this.spins.length);
		this.widened = undefined;
		this.importText = '';
	};

	<template>
		<CanonSplit
			class="palette-genny"
			@halves={{true}}
			@collapsesTo={{240}}
			{{this.shortcuts}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<Reels
						@columns={{this.columns}}
						@widened={{this.isWidened}}
						@onWiden={{this.widen}}
						@onLock={{this.toggleLock}}
						@onEdit={{this.edit}}
						@onLanded={{this.landed}}
						@onMenu={{this.menu}}
						@onCopy={{this.copy}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonRow
						@title="Category"
						@form="stacked"
					>
						<CanonSegmented
							class="pg-categories"
							@items={{categoryTitles}}
							@selected={{this.categoryIndex}}
							@columns={{3}}
							@onChange={{this.pickCategory}}
						/>
					</CanonRow>
					<CanonRow
						@title="Strategy"
						@form="stacked"
					>
						<CanonSegmented
							class="pg-strategies"
							@items={{this.strategyTitles}}
							@selected={{this.strategyIndex}}
							@columns={{2}}
							@onChange={{this.pickStrategy}}
						/>
					</CanonRow>
					<p
						class="pg-description"
					>{{this.description}}</p>
					<CanonRow
						@title="Colours"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							class="pg-count"
							@value={{this.colours.length}}
							@min={{MIN_COLOURS}}
							@max={{MAX_COLOURS}}
							@labelledBy={{titleId}}
							@onChange={{this.setCount}}
						/>
					</CanonRow>
				</CanonRows>
				{{#if this.exportMode}}
					<CanonRows
						class="pg-dev"
						@framed={{true}}
					>
						<CanonHeading
							@text="Export to Collection (Dev Mode)"
						/>
						<button
							type="button"
							class="pg-dev-close"
							{{on
								"click"
								this.closeExport
							}}
						>Press P to close</button>
						<label class="pg-dev-field">
							<span>Palette Name</span>
							<input
								id="pg-dev-name"
								type="text"
								value={{this.exportName}}
								placeholder="e.g. Ocean Sunset"
								{{on
									"input"
									this.setExportName
								}}
							/>
						</label>
						{{#if this.exportId}}
							<p
								class="pg-dev-note"
							>ID:
								<code
								>{{this.exportId}}</code></p>
						{{/if}}
						<label class="pg-dev-field">
							<span>Category</span>
							<select
								id="pg-dev-category"
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
						</label>
						<label class="pg-dev-field">
							<span>Import Colours
								(one per line,
								no #)</span>
							<textarea
								id="pg-dev-import"
								rows="4"
								value={{this.importText}}
								{{on
									"input"
									this.setImportText
								}}
							></textarea>
						</label>
						<CanonButton
							class="pg-dev-load"
							@kind="cell"
							@text="Load"
							@disabled={{if
								this.importText
								false
								true
							}}
							@onClick={{this.loadFromText}}
						/>
						{{#if this.exportJson}}
							<CanonCodeBlock
								class="pg-dev-json"
								@code={{this.exportJson}}
								@language="JSON Output"
							/>
							<CanonButton
								class="pg-dev-copy"
								@kind="cell"
								@text="Copy"
								@icon={{Copy}}
								@onClick={{this.copyExportJson}}
							/>
						{{/if}}
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Colours" />
					{{#each
						this.rows key="colour.id"
						as |row|
					}}
						<div
							class="pg-row canon-colour-card canon-colour-card--row"
						>
							<span
								class="pg-row-swatch canon-colour-card-swatch"
								style={{row.fill}}
							>
								<input
									type="color"
									value={{row.colour.hex}}
									aria-label="Edit colour {{row.value}}"
									{{on
										"input"
										(fn
											this.edit
											row.index
										)
									}}
								/>
							</span>
							<div
								class="canon-colour-card-info"
							>
								<div
									class="canon-colour-card-name"
								>{{row.name}}</div>
								<CanonValueLine
									class="pg-row-value"
									@label={{this.notationLabel}}
									@value={{row.value}}
								/>
							</div>
							<div
								class="pg-row-actions"
							>
								<CanonButton
									class="pg-row-lock"
									@kind="cell"
									@icon={{if
										row.colour.locked
										Lock
										Unlock
									}}
									@selected={{row.colour.locked}}
									@label={{if
										row.colour.locked
										"Unlock colour"
										"Lock colour"
									}}
									aria-pressed={{if
										row.colour.locked
										"true"
										"false"
									}}
									@onClick={{fn
										this.toggleLock
										row.index
									}}
								/>
								<LinkTo
									class="pg-row-shades"
									@route="tools.tool"
									@model="tailwind-shades"
									@query={{hash
										color=row.colour.hex
									}}
									title="Generate Tailwind shades"
									aria-label="Generate Tailwind shades"
								><IconSvg
										@name="wind"
									/></LinkTo>
								<CanonButton
									class="pg-row-remove"
									@kind="cell"
									@icon={{Trash}}
									@label="Remove colour"
									@disabled={{this.atMin}}
									@onClick={{fn
										this.removeAt
										row.index
									}}
								/>
							</div>
						</div>
					{{/each}}
					<CanonGrid @columns={{3}}>
						<CanonButton
							class="pg-copy-all"
							@kind="cell"
							@text="Copy Colours"
							@icon={{Copy}}
							@onClick={{this.copyAll}}
						/>
						<CanonButton
							class="pg-json"
							@kind="cell"
							@text="JSON"
							@icon={{Braces}}
							@onClick={{this.copyJson}}
						/>
						<CanonButton
							class="pg-image"
							@kind="cell"
							@text={{passAlong
								"Download Image"
							}}
							@icon={{Save}}
							@onClick={{this.downloadImage}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonCodeBlock
					class="pg-css"
					@code={{this.css}}
					@language="CSS Variables"
				/>
			</:main>
			<:footer>
				<CanonButton
					class="pg-regenerate"
					@kind="primary"
					@text="Regenerate"
					@icon={{Refresh}}
					@iconStyle="oversized"
					@onClick={{this.regenerate}}
					title="Space"
					aria-keyshortcuts="Space"
				/>
			</:footer>
		</CanonSplit>
	</template>
}
