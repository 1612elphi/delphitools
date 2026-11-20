import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourCard from 'delphicanon/components/canon-colour-card';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import press from 'delphicanon/modifiers/canon-press';
import {
	contrastFigure,
	contrastRatio,
	hex,
	parseHex,
	type Rgb,
} from 'delphicanon/lib/colour';
import { solidSpaces, type SolidPoint } from 'delphicanon/lib/colour-space';
import { springEasing } from 'delphicanon/lib/motion';
import { IconSvg } from 'delphitools-v2/components/icon';
import { colourFromQuery } from 'delphitools-v2/lib/colour-query';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import {
	kitFormat,
	readColour,
} from 'delphitools-v2/components/tools/colour-atlas/atlas';
import {
	pair,
	suggest,
	swatch,
	targets,
	type Target,
} from 'delphitools-v2/components/tools/contrast-checker/contrast';
import Specimen, {
	specimenHeight,
} from 'delphitools-v2/components/tools/contrast-checker/specimen';
import {
	Network,
	type Pair,
} from 'delphitools-v2/components/tools/contrast-checker/network';
import {
	Lamps,
	Scale,
} from 'delphitools-v2/components/tools/contrast-checker/verdict';
import './contrast-checker/contrast-checker.css';

const Flip = <template><IconSvg @name="arrow-left-right" /></template>;
const Wand = <template><IconSvg @name="wand-sparkles" /></template>;
const Plus = <template><IconSvg @name="plus" /></template>;
const Cross = <template><IconSvg @name="x" /></template>;

const modes = ['Pair', 'Network'];
const maxColours = 10;

const followMs = 120;

const sidebarWidth = 400;

const collapsedBand = 104;

const wellsStyle = htmlSafe(`--contrast-well-spring: ${springEasing(0.8)}`);

const closestName = (colour: Rgb) => getColourName(hex(colour));

function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const typed = (key: string) => {
		const text = query.get(key);
		return text ? readColour(text) : undefined;
	};
	const carried = colourFromQuery(search);
	return {
		foreground:
			typed('contrastFg') ??
			(carried ? readColour(carried) : undefined) ??
			parseHex('EAEAEA')!,
		background: typed('contrastBg') ?? parseHex('1A1A2E')!,
		onBackground: query.get('contrastWell') === '1',
		space:
			solidSpaces[Number(query.get('contrastSpace')) || 0] ??
			'rgb',
		later: query.has('contrastLater'),
	};
}

interface Suggestion {
	target: Target;
	candidate?: Rgb;
	foreground: Rgb;
	background: Rgb;
	title: string;
	detail: string;
	ratio: string;
}

export default class ContrastChecker extends Component {
	@service declare colourNotation: ColourNotationService;

	state: CanonColourSolidState;
	@tracked editsBackground: boolean;
	@tracked fixed: Rgb;
	@tracked flips = 0;
	#lastPick = 0;
	@tracked network = false;
	@tracked list: Rgb[] = [];
	@tracked picked = 0;
	@tracked focus: Pair = { text: 0, ground: 1 };
	#pairEdited?: Rgb;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.editsBackground = flags.onBackground;
		this.fixed = flags.onBackground
			? flags.foreground
			: flags.background;
		this.state = new CanonColourSolidState({
			space: flags.space,
			colour: flags.onBackground
				? flags.background
				: flags.foreground,
			activeRow: 2,
		});
		if (!flags.later) return;
		const timers = [
			window.setTimeout(() => this.edit(true), 2000),
			window.setTimeout(() => this.flip(), 3500),
			window.setTimeout(() => {
				const first = this.suggestions.find(
					(row) => row.candidate,
				);
				if (first) this.apply(first);
			}, 5000),
		];
		registerDestructor(this, () =>
			timers.forEach((timer) => window.clearTimeout(timer)),
		);
	}

	get edited(): Rgb {
		return this.state.colour;
	}

	@cached
	get colours(): Rgb[] {
		return this.list.map((colour, index) =>
			index === this.picked ? this.edited : colour,
		);
	}

	get foreground(): Rgb {
		if (this.network) return this.colours[this.focus.text]!;
		return this.editsBackground ? this.fixed : this.edited;
	}

	get background(): Rgb {
		if (this.network) return this.colours[this.focus.ground]!;
		return this.editsBackground ? this.edited : this.fixed;
	}

	get modeIndex() {
		return this.network ? 1 : 0;
	}

	get pickedText() {
		return this.colourNotation.format(hex(this.edited));
	}

	get rows() {
		return this.colours.map((colour, index) => ({
			index,
			hex: hex(colour),
			swatch: swatch(colour),
			selected: index === this.picked,
		}));
	}

	get canAdd() {
		return this.list.length < maxColours;
	}

	get canRemove() {
		return this.list.length > 2;
	}

	setMode = (index: number) => {
		const network = index === 1;
		if (network === this.network) return;
		if (network) {
			this.#pairEdited = this.edited;
			if (this.list.length === 0)
				this.list = [this.foreground, this.background];
			this.network = true;
			this.state.use(this.list[this.picked]!);
		} else {
			this.list = this.colours;
			this.network = false;
			this.state.use(this.#pairEdited!);
		}
	};

	pickColour = (index: number) => {
		if (index === this.picked) return;
		this.list = this.colours;
		this.picked = index;
		this.state.use(this.list[index]!);
	};

	addColour = () => {
		this.list = [...this.colours, this.edited];
		this.pickColour(this.list.length - 1);
	};

	removeColour = (index: number) => {
		const list = this.colours.filter((_, i) => i !== index);
		const picked = Math.min(
			index < this.picked ? this.picked - 1 : this.picked,
			list.length - 1,
		);
		this.list = list;
		this.picked = picked;
		this.state.use(list[picked]!);
		const fit = (i: number) =>
			i === index ? -1 : i > index ? i - 1 : i;
		const text = fit(this.focus.text);
		const ground = fit(this.focus.ground);
		this.focus =
			text >= 0 && ground >= 0
				? { text, ground }
				: { text: 0, ground: 1 };
	};

	focusPair = (text: number, ground: number) => {
		this.focus = { text, ground };
	};

	parsePicked = (text: string) => this.#read(text, this.state.use);

	typePicked = (event: Event) =>
		this.#read(
			(event.target as HTMLInputElement).value,
			this.state.use,
		);

	get ratio() {
		return contrastRatio(this.foreground, this.background);
	}

	get animated() {
		return this.state.animated;
	}

	get marks() {
		return this.network
			? this.list.filter((_, i) => i !== this.picked)
			: [this.fixed];
	}

	get format() {
		return kitFormat(this.colourNotation.notation);
	}

	get foregroundText() {
		return this.colourNotation.format(hex(this.foreground));
	}

	get backgroundText() {
		return this.colourNotation.format(hex(this.background));
	}

	get wells() {
		return [
			{
				title: 'Foreground',
				colour: this.foreground,
				background: false,
			},
			{
				title: 'Background',
				colour: this.background,
				background: true,
			},
		].map((well) => ({
			...well,
			hex: hex(well.colour),
			swatch: swatch(well.colour),
			selected: well.background === this.editsBackground,
		}));
	}

	get suggestions(): Suggestion[] {
		const { foreground, background } = this;
		return targets.map((target) => {
			const candidate = suggest(
				target,
				foreground,
				background,
			);
			const [moving, fixed] = target.background
				? [background, foreground]
				: [foreground, background];
			const shown = candidate ?? moving;
			const met =
				contrastRatio(foreground, background) >=
				target.ratio;
			return {
				target,
				candidate,
				foreground: target.background
					? foreground
					: shown,
				background: target.background
					? shown
					: background,
				title: target.background
					? 'Background'
					: 'Foreground',
				detail: `${target.level} · ${hex(shown)}`,
				ratio: candidate
					? `${contrastFigure(contrastRatio(candidate, fixed))}:1`
					: met
						? '✓'
						: '—',
			};
		});
	}

	pick = (point: SolidPoint) => {
		const now = performance.now();
		const eases = now - this.#lastPick > followMs;
		this.#lastPick = now;
		this.state.setPoint(point, eases);
	};

	#trade() {
		const other = this.fixed;
		this.fixed = this.edited;
		this.state.use(other);
	}

	edit = (background: boolean) => {
		if (background === this.editsBackground) return;
		this.editsBackground = background;
		this.#trade();
	};

	get flipTurn() {
		return htmlSafe(`--contrast-flips: ${this.flips}`);
	}

	flip = () => {
		this.flips += 1;
		this.#trade();
	};

	put(background: boolean, colour: Rgb) {
		if (background === this.editsBackground) this.state.use(colour);
		else this.fixed = colour;
	}

	apply = (row: Suggestion) => {
		if (!row.candidate) return;
		if (row.target.background === this.editsBackground) {
			this.state.use(row.candidate);
		} else {
			this.fixed = row.candidate;
			this.state.animated = true;
		}
	};

	useForeground = (colour: Rgb) => this.put(false, colour);

	useBackground = (colour: Rgb) => this.put(true, colour);

	#read(text: string, use: (colour: Rgb) => void) {
		const colour = readColour(text);
		if (colour) use(colour);
		return colour !== undefined;
	}

	parseForeground = (text: string) =>
		this.#read(text, this.useForeground);

	parseBackground = (text: string) =>
		this.#read(text, this.useBackground);

	typeLive = (background: boolean, event: Event) =>
		this.#read(
			(event.target as HTMLInputElement).value,
			background ? this.useBackground : this.useForeground,
		);

	focusField = (background: boolean, event: FocusEvent) => {
		this.edit(background);
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	<template>
		<CanonSplit
			class="contrast-checker
				{{unless
					this.animated
					'contrast-checker--follows'
				}}"
			@sidebarWidth={{sidebarWidth}}
			@collapsesTo={{collapsedBand}}
		>
			<:banner>
				<CanonCanvas @height={{specimenHeight}}>
					<Specimen
						@foreground={{this.foreground}}
						@background={{this.background}}
						@ratio={{this.ratio}}
						@animated={{this.animated}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonSegmented
						aria-label="Mode"
						@items={{modes}}
						@columns={{2}}
						@selected={{this.modeIndex}}
						@onChange={{this.setMode}}
					/>
				</CanonRows>
				{{#if this.network}}
					<CanonRows @framed={{true}}>
						<CanonRow
							class="contrast-field"
							@title="Colour"
							@form="stacked"
							as |titleId|
						>
							<CanonColourNotationInput
								class="contrast-input"
								@colour={{this.edited}}
								@text={{this.pickedText}}
								@onColour={{this.state.use}}
								@parse={{this.parsePicked}}
								@labelledBy={{titleId}}
								{{on
									"input"
									this.typePicked
								}}
							/>
						</CanonRow>
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonRow
							class="contrast-field"
							@title="Foreground"
							@form="stacked"
							as |titleId|
						>
							<CanonColourNotationInput
								class="contrast-input"
								@colour={{this.foreground}}
								@text={{this.foregroundText}}
								@onColour={{this.useForeground}}
								@parse={{this.parseForeground}}
								@labelledBy={{titleId}}
								{{on
									"input"
									(fn
										this.typeLive
										false
									)
								}}
								{{on
									"focusin"
									(fn
										this.focusField
										false
									)
								}}
							/>
						</CanonRow>
						<CanonRow
							class="contrast-field"
							@title="Background"
							@form="stacked"
							as |titleId|
						>
							<CanonColourNotationInput
								class="contrast-input"
								@colour={{this.background}}
								@text={{this.backgroundText}}
								@onColour={{this.useBackground}}
								@parse={{this.parseBackground}}
								@labelledBy={{titleId}}
								{{on
									"input"
									(fn
										this.typeLive
										true
									)
								}}
								{{on
									"focusin"
									(fn
										this.focusField
										true
									)
								}}
							/>
						</CanonRow>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					{{#if this.network}}
						<div class="contrast-list">
							{{#each
								this.rows
								key="@index"
								as |row|
							}}
								<div
									class="contrast-list-row"
								>
									<button
										type="button"
										class="contrast-well
											{{if
												row.selected
												'contrast-well--on'
											}}"
										aria-pressed={{if
											row.selected
											"true"
											"false"
										}}
										aria-label={{row.hex}}
										{{press}}
										{{on
											"click"
											(fn
												this.pickColour
												row.index
											)
										}}
									>
										<span
											class="contrast-well-swatch"
											style={{row.swatch}}
										></span>
										<span
											class="contrast-well-hex"
										>{{row.hex}}</span>
									</button>
									<CanonButton
										@kind="cell"
										@icon={{Cross}}
										@label="Remove"
										@disabled={{unless
											this.canRemove
											true
										}}
										@onClick={{fn
											this.removeColour
											row.index
										}}
									/>
								</div>
							{{/each}}
							<CanonButton
								@text="Add"
								@icon={{Plus}}
								@disabled={{unless
									this.canAdd
									true
								}}
								@onClick={{this.addColour}}
							/>
						</div>
					{{else}}
						<div
							class="contrast-wells"
							style={{wellsStyle}}
						>
							{{#each
								this.wells
								as |well|
							}}
								<button
									type="button"
									class="contrast-well
										{{if
											well.selected
											'contrast-well--on'
										}}"
									aria-pressed={{if
										well.selected
										"true"
										"false"
									}}
									aria-label="{{well.title}} {{well.hex}}"
									{{press}}
									{{on
										"click"
										(fn
											this.edit
											well.background
										)
									}}
								>
									<span
										class="contrast-well-swatch"
										style={{well.swatch}}
									></span>
									<span
										class="contrast-well-text"
									>
										<span
											class="contrast-well-title"
										>{{well.title}}</span>
										<span
											class="contrast-well-hex"
										>{{well.hex}}</span>
									</span>
								</button>
							{{/each}}
							<CanonButton
								class="contrast-flip"
								style={{this.flipTurn}}
								@kind="cell"
								@icon={{Flip}}
								@label="Flip"
								@onClick={{this.flip}}
							/>
							<span
								class="contrast-wells-indicator
									{{if
										this.editsBackground
										'contrast-wells-indicator--end'
									}}"
							></span>
						</div>
					{{/if}}
					<div class="contrast-solid">
						<CanonColourSolid
							class="contrast-solid-picture"
							@space={{this.state.space}}
							@point={{this.state.point}}
							@animated={{this.state.animated}}
							@sliceAxis={{this.state.sliceAxis}}
							@isOrtho={{this.state.isOrtho}}
							@showsWhole={{this.state.showsWhole}}
							@marks={{this.marks}}
							@onChange={{this.pick}}
							@closestName={{closestName}}
						/>
						<CanonColourStrip
							@colour={{this.edited}}
							@nameOf={{getColourName}}
							@format={{this.format}}
						/>
					</div>
					<CanonColourControls
						@state={{this.state}}
						@hidesNotation={{true}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				{{#if this.network}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Network" />
						<Network
							@colours={{this.colours}}
							@focus={{this.focus}}
							@onFocus={{this.focusPair}}
						/>
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Contrast ratio"
						/>
						<Scale @ratio={{this.ratio}} />
						<Lamps @ratio={{this.ratio}} />
					</CanonRows>
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Suggestions"
						/>
						{{#each
							this.suggestions
							as |row|
						}}
							<button
								type="button"
								class="contrast-suggestion"
								disabled={{unless
									row.candidate
									true
								}}
								aria-label="{{row.title}} {{row.target.level}}, {{row.detail}}, {{row.ratio}}"
								{{press}}
								{{on
									"click"
									(fn
										this.apply
										row
									)
								}}
							>
								<span
									class="contrast-suggestion-preview"
									style={{pair
										row.foreground
										row.background
									}}
									aria-hidden="true"
								>Aa</span>
								<span
									class="contrast-suggestion-cell"
								>
									<span
										class="contrast-suggestion-text"
									>
										<span
											class="contrast-suggestion-title"
										>{{row.title}}</span>
										<span
											class="contrast-suggestion-detail"
										>{{row.detail}}</span>
									</span>
									<span
										class="contrast-suggestion-ratio"
									>{{row.ratio}}</span>
									{{#if
										row.candidate
									}}
										<span
											class="contrast-suggestion-glyph"
											aria-hidden="true"
										><Wand
											/></span>
									{{/if}}
								</span>
							</button>
						{{/each}}
					</CanonRows>
					<div class="contrast-cards">
						<CanonColourCard
							@colour={{this.foreground}}
							@name="Foreground"
							@primaryFormat={{this.format}}
						/>
						<CanonColourCard
							@colour={{this.background}}
							@name="Background"
							@primaryFormat={{this.format}}
						/>
					</div>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
