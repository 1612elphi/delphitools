import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import press from 'delphicanon/modifiers/canon-press';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { clamp, formatDecimal, parseDecimal } from 'delphicanon/lib/number';
import type ThemeService from 'delphitools-v2/services/theme';
import { IconSvg } from 'delphitools-v2/components/icon';
import Display from 'delphitools-v2/components/tools/large-type/display';
import {
	charClass,
	fit,
	marqueeSize,
	padding,
	sizes,
	spaceGlyph,
	wordCap,
	type Size,
} from 'delphitools-v2/components/tools/large-type/layout';
import {
	resolveColour,
	themeStyle,
	themes,
} from 'delphitools-v2/components/tools/large-type/themes';
import './large-type/large-type.css';

const FullScreenIcon = <template><IconSvg @name="maximize-2" /></template>;

const speedRange = { min: 0.25, max: 4, step: 0.25 };
const defaultAdvance = 0.6;

const legend = [
	{ glyph: 'A', kind: 'letter', name: 'Letters' },
	{ glyph: '1', kind: 'digit', name: 'Digits' },
	{ glyph: '#', kind: 'special', name: 'Symbols' },
	{ glyph: spaceGlyph, kind: 'space', name: 'Spaces' },
];

let context: CanvasRenderingContext2D | null | undefined;
let family: string | undefined;
const advances = new Map<string, number>();

function advanceOf(ch: string, cacheable: boolean): number {
	const known = advances.get(ch);
	if (known !== undefined) return known;
	context ??= document.createElement('canvas').getContext('2d');
	if (!context) return defaultAdvance;
	family ??=
		getComputedStyle(document.documentElement)
			.getPropertyValue('--canon-mono-font')
			.trim() || 'monospace';
	context.font = `100px ${family}`;
	const measured =
		context.measureText(charClass(ch) === 'space' ? spaceGlyph : ch)
			.width / 100 || defaultAdvance;
	if (cacheable) advances.set(ch, measured);
	return measured;
}

const sizeText = (value: number) => `${Math.round(value)} px`;
const speedText = (value: number) => `${formatDecimal(value, 2)}×`;

export default class LargeTypeTool extends Component {
	@tracked text = '';
	@tracked maximum = true;
	@tracked manualSize: number = sizes.start;
	@tracked positions = true;
	@tracked colours = true;
	@tracked themeIndex = 0;
	@tracked marquee = false;
	@tracked speed = 1;
	@tracked box: Size = { width: 0, height: 0 };
	@tracked fontsReady = false;
	@tracked customText?: Rgb;
	@tracked customBackground?: Rgb;
	@service('theme') declare mode: ThemeService;
	#alive = true;
	#display?: HTMLElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.text = query.get('ltText') ?? '';
		const size = parseDecimal(query.get('ltSize') ?? '');
		if (size !== undefined) {
			this.maximum = false;
			this.manualSize = clamp(size, sizes.min, sizes.max);
		}
		this.positions = query.get('ltPositions') !== 'no';
		this.colours = query.get('ltColours') !== 'no';
		const theme = parseDecimal(query.get('ltTheme') ?? '');
		if (theme !== undefined)
			this.themeIndex = clamp(
				Math.round(theme),
				0,
				themes.length - 1,
			);
		this.customText = parseHex(query.get('ltFore') ?? '');
		this.customBackground = parseHex(query.get('ltBack') ?? '');
		this.marquee = query.get('ltMarquee') === 'yes';
		const speed = parseDecimal(query.get('ltSpeed') ?? '');
		if (speed !== undefined)
			this.speed = clamp(
				speed,
				speedRange.min,
				speedRange.max,
			);
		void document.fonts?.ready.then(() => {
			if (this.#alive) this.fontsReady = true;
		});
	}

	willDestroy() {
		super.willDestroy();
		this.#alive = false;
	}

	get glyphs() {
		return Array.from(this.text);
	}

	get countText() {
		return `${this.glyphs.length} characters`;
	}

	get widest() {
		const cacheable = this.fontsReady;
		return Math.max(
			defaultAdvance,
			...[...new Set(this.glyphs)].map((ch) =>
				advanceOf(ch, cacheable),
			),
		);
	}

	get advance() {
		return advanceOf('M', this.fontsReady);
	}

	get size() {
		const manual = this.maximum ? undefined : this.manualSize;
		const { width, height } = this.box;
		if (this.marquee)
			return marqueeSize(
				{ width, height: height - padding * 2 },
				this.advance,
				manual,
			);
		if (manual !== undefined)
			return Math.min(
				manual,
				wordCap(
					this.glyphs,
					this.widest,
					width - padding * 2,
				),
			);
		return fit(
			this.glyphs,
			this.widest,
			width - padding * 2,
			height - padding * 2,
			this.positions,
		);
	}

	get theme() {
		return themes[this.themeIndex]!;
	}

	get themeStyle() {
		const { customText, customBackground } = this;
		return themeStyle({
			...this.theme,
			...(customText && { text: hex(customText) }),
			...(customBackground && {
				background: hex(customBackground),
			}),
		});
	}

	get textRgb(): Rgb {
		void this.mode.dark;
		return this.customText ?? resolveColour(this.theme.text);
	}

	get backgroundRgb(): Rgb {
		void this.mode.dark;
		return (
			this.customBackground ??
			resolveColour(this.theme.background)
		);
	}

	get swatches() {
		return themes.map((theme, index) => ({
			index,
			name: theme.name,
			chosen: index === this.themeIndex,
			style: htmlSafe(themeStyle(theme)),
		}));
	}

	get legendStyle() {
		return htmlSafe(this.themeStyle);
	}

	get isEmpty() {
		return this.text === '';
	}

	setText = (text: string) => (this.text = text);

	setBox = (box: Size) => (this.box = box);

	pickTheme = (index: number) => {
		this.themeIndex = index;
		this.customText = undefined;
		this.customBackground = undefined;
	};

	setTextColour = (colour: Rgb) => (this.customText = colour);

	setBackgroundColour = (colour: Rgb) => (this.customBackground = colour);

	setMarquee = (on: boolean) => (this.marquee = on);

	setSpeed = (value: number) => (this.speed = value);

	setPositions = (on: boolean) => (this.positions = on);

	setColours = (on: boolean) => (this.colours = on);

	setMaximum = (on: boolean) => {
		if (!on) this.manualSize = Math.round(this.size);
		this.maximum = on;
	};

	setSize = (value: number) => {
		this.manualSize = value;
		this.maximum = false;
	};

	registerDisplay = (element: HTMLElement) => (this.#display = element);

	goFullscreen = () => {
		void this.#display?.requestFullscreen().catch(() => undefined);
	};

	<template>
		<CanonSplit
			class="large-type"
			@halves={{true}}
			@collapsesTo={{200}}
		>
			<:sidebar>
				<CanonCanvas @aspect={{1}}>
					<Display
						@text={{this.text}}
						@glyphs={{this.glyphs}}
						@size={{this.size}}
						@widest={{this.widest}}
						@advance={{this.advance}}
						@positions={{this.positions}}
						@colours={{this.colours}}
						@themeStyle={{this.themeStyle}}
						@marquee={{this.marquee}}
						@speed={{this.speed}}
						@onInput={{this.setText}}
						@onBox={{this.setBox}}
						{{register
							this.registerDisplay
						}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonStatus
						@text={{this.countText}}
						@tone="muted"
						@row={{true}}
						aria-live="polite"
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Theme" />
					<CanonGrid
						class="lt-themes"
						role="radiogroup"
						aria-label="Theme"
					>
						{{#each
							this.swatches
							key="index"
							as |swatch|
						}}
							<button
								type="button"
								role="radio"
								class="lt-swatch"
								aria-checked={{if
									swatch.chosen
									"true"
									"false"
								}}
								aria-label={{swatch.name}}
								style={{swatch.style}}
								{{press}}
								{{on
									"click"
									(fn
										this.pickTheme
										swatch.index
									)
								}}
							>
								<span
									class="lt-swatch-sample"
								>Aa<span
										class="lt-swatch-digit"
									>1</span></span>
								<span
									class="lt-swatch-name"
								>{{swatch.name}}</span>
							</button>
						{{/each}}
					</CanonGrid>
					<CanonGrid @columns={{2}}>
						<CanonColourWell
							@label="Text"
							@colour={{this.textRgb}}
							@onChange={{this.setTextColour}}
						/>
						<CanonColourWell
							@label="Background"
							@colour={{this.backgroundRgb}}
							@onChange={{this.setBackgroundColour}}
						/>
					</CanonGrid>
					<CanonHeading @text="Display" />
					<CanonRow @title="Marquee" as |titleId|>
						<CanonSwitch
							@on={{this.marquee}}
							@onChange={{this.setMarquee}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					{{#if this.marquee}}
						<CanonRow
							@title="Speed"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.speed}}
								@min={{speedRange.min}}
								@max={{speedRange.max}}
								@step={{speedRange.step}}
								@readout={{speedText}}
								@labelledBy={{titleId}}
								@onChange={{this.setSpeed}}
							/>
						</CanonRow>
					{{/if}}
					<CanonGrid @columns={{2}}>
						<CanonRow
							@title="Positions"
							@sizingTitle="Positions"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.positions}}
								@onChange={{this.setPositions}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Colours"
							@sizingTitle="Positions"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.colours}}
								@onChange={{this.setColours}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					</CanonGrid>
					{{#if this.colours}}
						<CanonGrid
							class="lt-legend"
							style={{this.legendStyle}}
						>
							{{#each
								legend
								as |item|
							}}
								<div
									class="lt-legend-cell"
								>
									<span
										class="lt-legend-sample lt-glyph--{{item.kind}}"
										aria-hidden="true"
									>{{item.glyph}}</span>
									<span
										class="lt-legend-name"
									>{{item.name}}</span>
								</div>
							{{/each}}
						</CanonGrid>
					{{/if}}
					<CanonHeading @text="Size" />
					<CanonRow @title="Maximum" as |titleId|>
						<CanonSwitch
							@on={{this.maximum}}
							@onChange={{this.setMaximum}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonSlider
						@value={{this.size}}
						@min={{sizes.min}}
						@max={{sizes.max}}
						@step={{sizes.step}}
						@readout={{sizeText}}
						@label="Size"
						@onChange={{this.setSize}}
					/>
					<CanonButton
						@kind="primary"
						@text="Full Screen"
						@icon={{FullScreenIcon}}
						@disabled={{this.isEmpty}}
						@onClick={{this.goFullscreen}}
					/>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}

const register = modifier(
	(
		element: HTMLElement,
		[callback]: [(element: HTMLElement) => void],
	) => {
		callback(element);
	},
);
