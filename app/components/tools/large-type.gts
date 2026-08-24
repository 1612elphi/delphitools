import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import Icon from 'delphitools-v2/components/icon';

const CELL_PAD = 14;

const BOX_PAD = 48;

const MIN_SIZE = 28;
const MAX_SIZE = 360;
const DEFAULT_SIZE = 112;
const SIZE_STEP = 4;

// prevent pixel overflow
const FIT_SLACK = 0.98;

const DEFAULT_ASPECT = 0.6;

// make spaces visible
const SPACE_GLYPH = '␣';

export type CharClass = 'digit' | 'space' | 'letter' | 'special';

export function charClass(ch: string): CharClass {
	if (/\p{N}/u.test(ch)) return 'digit';
	if (/\s/.test(ch)) return 'space';
	if (/\p{L}/u.test(ch)) return 'letter';
	return 'special';
}

const advanceCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null = null;

// cache loaded font widths
export function charAspect(ch: string, cacheable: boolean): number {
	const cached = advanceCache.get(ch);
	if (cached != null) return cached;

	measureCtx ??= document.createElement('canvas').getContext('2d');
	if (!measureCtx) return DEFAULT_ASPECT;

	measureCtx.font = `100px ${getComputedStyle(document.body).fontFamily}`;
	const measured =
		measureCtx.measureText(ch === ' ' ? SPACE_GLYPH : ch).width /
			100 || DEFAULT_ASPECT;
	if (cacheable) advanceCache.set(ch, measured);
	return measured;
}

export function fitFontSize(
	boxWidth: number,
	count: number,
	widest: number,
): number {
	if (boxWidth <= 0 || count === 0) return DEFAULT_SIZE;
	const perCell = (boxWidth - BOX_PAD) / count - CELL_PAD;
	return Math.max(
		MIN_SIZE,
		Math.min(MAX_SIZE, (perCell / widest) * FIT_SLACK),
	);
}

export default class LargeTypeTool extends Component {
	@tracked text = '';

	@tracked auto = true;
	@tracked size = DEFAULT_SIZE;
	@tracked showPositions = true;
	@tracked colours = true;
	@tracked boxWidth = 0;
	@tracked fontsReady = false;

	#display: HTMLElement | null = null;
	#alive = true;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		// remeasure after font load
		void document.fonts?.ready.then(() => {
			if (this.#alive) this.fontsReady = true;
		});
	}

	willDestroy() {
		super.willDestroy();
		this.#alive = false;
	}

	registerDisplay = modifier((element: HTMLElement) => {
		this.#display = element;
		const observer = new ResizeObserver(() => {
			this.boxWidth = element.clientWidth;
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
			if (this.#display === element) this.#display = null;
		};
	});

	// preserve code points
	get chars() {
		return Array.from(this.text);
	}

	get isEmpty() {
		return this.chars.length === 0;
	}

	get count() {
		return this.chars.length;
	}

	get widest() {
		const cacheable = this.fontsReady;
		const chars = this.chars;
		if (chars.length === 0) return DEFAULT_ASPECT;
		return Math.max(
			...chars.map((ch) => charAspect(ch, cacheable)),
		);
	}

	get effectiveSize() {
		return this.auto
			? fitFontSize(this.boxWidth, this.count, this.widest)
			: this.size;
	}

	get sliderValue() {
		return Math.round(this.effectiveSize);
	}

	// numeric style input only
	get glyphStyle() {
		return htmlSafe(`font-size: ${this.effectiveSize}px`);
	}

	get cells() {
		const colours = this.colours;
		return this.chars.map((ch, index) => ({
			index,
			glyph: ch === ' ' ? SPACE_GLYPH : ch,
			position: index + 1,
			shaded: index % 2 === 0,
			colourClass: colours ? `is-${charClass(ch)}` : '',
		}));
	}

	setText = (event: Event) => {
		this.text = (event.target as HTMLInputElement).value;
	};

	useMaximum = () => {
		this.auto = true;
	};

	setSize = (event: Event) => {
		this.auto = false;
		this.size = Number((event.target as HTMLInputElement).value);
	};

	setShowPositions = (event: Event) => {
		this.showPositions = (event.target as HTMLInputElement).checked;
	};

	setColours = (event: Event) => {
		this.colours = (event.target as HTMLInputElement).checked;
	};

	goFullscreen = () => {
		void this.#display?.requestFullscreen().catch(() => undefined);
	};

	<template>
		<div class="dt-lt">
			<div class="dt-lt-controls">
				<div class="dt-lt-entry">
					<input
						type="text"
						class="dt-lt-input"
						aria-label="Text"
						placeholder="Type or paste"
						value={{this.text}}
						{{on "input" this.setText}}
					/>
					<button
						type="button"
						class="dt-lt-fullscreen"
						disabled={{this.isEmpty}}
						{{on "click" this.goFullscreen}}
					>
						<Icon @name="maximize-2" />
						Fullscreen
					</button>
				</div>

				<div class="dt-lt-options">
					<span class="dt-lt-legend">Size</span>
					<button
						type="button"
						class="dt-lt-max
							{{if
								this.auto
								'is-active'
							}}"
						{{on "click" this.useMaximum}}
					>
						Maximum
					</button>
					<input
						type="range"
						class="dt-lt-slider"
						aria-label="Size"
						min={{MIN_SIZE}}
						max={{MAX_SIZE}}
						step={{SIZE_STEP}}
						value={{this.sliderValue}}
						{{on "input" this.setSize}}
					/>
					<label class="dt-lt-toggle">
						<input
							type="checkbox"
							class="dt-lt-switch"
							checked={{this.showPositions}}
							{{on
								"change"
								this.setShowPositions
							}}
						/>
						Positions
					</label>
					<label class="dt-lt-toggle">
						<input
							type="checkbox"
							class="dt-lt-switch"
							checked={{this.colours}}
							{{on
								"change"
								this.setColours
							}}
						/>
						Colours
					</label>
					<span class="dt-lt-count">{{this.count}}
						characters</span>
				</div>
			</div>

			<div class="dt-lt-stage">
				<div
					class="dt-lt-display"
					{{this.registerDisplay}}
				>
					{{#if this.cells}}
						<div class="dt-lt-strip">
							{{#each
								this.cells
								key="index"
								as |cell|
							}}
								<div
									class="dt-lt-cell
										{{if
											cell.shaded
											'is-shaded'
										}}"
								>
									<span
										class="dt-lt-glyph
											{{cell.colourClass}}"
										style={{this.glyphStyle}}
									>{{cell.glyph}}</span>
									{{#if
										this.showPositions
									}}
										<span
											class="dt-lt-pos"
										>{{cell.position}}</span>
									{{/if}}
								</div>
							{{/each}}
						</div>
					{{/if}}
				</div>
			</div>
		</div>
	</template>
}
