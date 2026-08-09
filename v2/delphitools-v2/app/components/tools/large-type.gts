import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import Icon from 'delphitools-v2/components/icon';

/** px-1.5 per cell side in the Next app, plus a rounding safety margin. */
const CELL_PAD = 14;

/** The display container's p-6. */
const BOX_PAD = 48;

const MIN_SIZE = 28;
const MAX_SIZE = 360;
const DEFAULT_SIZE = 112;
const SIZE_STEP = 4;

/** Leaves a sliver of slack so the fitted row never overflows by a pixel. */
const FIT_SLACK = 0.98;

/** The fallback advance width when nothing can be measured. */
const DEFAULT_ASPECT = 0.6;

/** Space is drawn as an open box, so it has a visible cell. */
const SPACE_GLYPH = '␣';

export type CharClass = 'digit' | 'space' | 'letter' | 'special';

/**
 * Character classes get distinct colours so an O/0 or l/1 cannot be misread
 * while transcribing. Unicode-aware: umlauts are letters, not specials.
 */
export function charClass(ch: string): CharClass {
	if (/\p{N}/u.test(ch)) return 'digit';
	if (/\s/.test(ch)) return 'space';
	if (/\p{L}/u.test(ch)) return 'letter';
	return 'special';
}

const advanceCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Per-glyph advance width as a fraction of the font size. The app font
 * (iA Writer Quattro) is only quasi-monospaced — m/W/Q run wide — so auto-fit
 * sizes against the widest glyph actually present, measured for real.
 *
 * A measure taken before the webfont loads sees the fallback font's advance,
 * so `cacheable` is false until document.fonts settles.
 */
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

/** The largest size at which `count` cells of `widest` advance still fit. */
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

	/** True while the size tracks the display width; dragging the slider ends it. */
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
		// Re-measures once the webfont lands, so the fit maths stops using the
		// fallback font's advance widths.
		void document.fonts?.ready.then(() => {
			if (this.#alive) this.fontsReady = true;
		});
	}

	willDestroy() {
		super.willDestroy();
		this.#alive = false;
	}

	// The display is both the measured box and the fullscreen target, so the
	// element itself is state the handlers need.
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

	/** Code points, not UTF-16 halves. */
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

	/** effectiveSize is derived from two numbers, so no input reaches the style. */
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
		// Rejects when the gesture is not trusted or the browser forbids it;
		// there is no fallback to run in that case.
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
					{{! wording carried over from the Next app }}
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
