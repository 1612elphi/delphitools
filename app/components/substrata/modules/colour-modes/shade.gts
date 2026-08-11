import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { rgbToHex } from 'delphitools-v2/lib/substrata/colour-convert';
import { hslToRgb, wrapHue } from 'delphitools-v2/lib/substrata/colour-hsv';
import {
	setRgb,
	type ColourSnapshot,
} from 'delphitools-v2/lib/substrata/colour-store';

/**
 * Mode: shade (fun modes). A horizontally snap-scrolling reel of 24 hue cells
 * under a fixed centre window picks the hue family; a column of five tonal
 * shades for that hue sits below. Scrolling the reel to a new hue, or clicking a
 * shade, commits the current colour (its HSL → RGB via hslToRgb → setRgb). The
 * shown names come from the colour-names DB (data, not copy).
 *
 * Ported from sketches/pickers-fun.html (the SHADE IIFE). The sketch's infinite
 * wrap is a bounded 0–23 reel: leading/trailing half-cell spacers let the first
 * and last hue reach the centre window, and the drag/scroll feel is kept (native
 * snap for wheel/touch, manual grab-drag with snap suspended).
 */

const HUE_COUNT = 24;
const CELL_W = 34; // px per reel cell (sketch .hcell)

// The 24 evenly spaced hues (0,15,…,345°) shown in the reel.
const HUES = Array.from({ length: HUE_COUNT }, (_, i) => i * 15);

// Five tonal steps per hue (the sketch's TONES): saturation/lightness in
// percent; `w` is a nominal tone weight kept only as a stable list key.
const TONES: { w: number; s: number; l: number }[] = [
	{ w: 10, s: 30, l: 90 },
	{ w: 30, s: 40, l: 72 },
	{ w: 60, s: 46, l: 46 },
	{ w: 80, s: 44, l: 30 },
	{ w: 95, s: 38, l: 18 },
];

const DEFAULT_TONE = 2; // the mid shade starts selected (as in the sketch)

const clampIndex = (i: number): number =>
	Math.max(0, Math.min(HUE_COUNT - 1, i));

/** Nearest reel hue index for an HSV hue (0–360). */
const nearestHue = (h: number): number =>
	Math.round(wrapHue(h) / 15) % HUE_COUNT;

/** Hex for a hue index + tone (pure). */
const shadeHex = (hueIdx: number, tone: (typeof TONES)[number]): string =>
	rgbToHex(
		hslToRgb({
			h: HUES[hueIdx] as number,
			s: tone.s / 100,
			l: tone.l / 100,
		}),
	);

function hueCellStyle(h: number) {
	return htmlSafe(`background-color: hsl(${h}, 58%, 52%)`);
}

function swatchStyle(hex: string) {
	return htmlSafe(`background-color: ${hex}`);
}

function upper(hex: string) {
	return hex.toUpperCase();
}

export interface ShadeModeSignature {
	Args: { colour: ColourSnapshot };
}

export default class ShadeMode extends Component<ShadeModeSignature> {
	@tracked hueIdx = nearestHue(this.args.colour.hsv.h);
	@tracked toneIdx = DEFAULT_TONE;

	hues = HUES;

	/** Captured once: a modifier body that READ the live hue would re-run on
	 *  every colour emit and yank scrollLeft back mid-drag. */
	#openingHue = this.args.colour.hsv.h;

	#reel: HTMLElement | null = null;
	#drag = { down: false, sx: 0, sl: 0 };
	/** last-committed hue index — dedups the scroll handler */
	#lastIdx = nearestHue(this.args.colour.hsv.h);

	get shades() {
		return TONES.map((tone, k) => {
			const hex = shadeHex(this.hueIdx, tone);
			return { w: tone.w, k, hex, name: getColourName(hex) };
		});
	}

	#commit(h: number, t: number) {
		const tone = TONES[t];
		if (!tone) return;
		setRgb(
			hslToRgb({
				h: HUES[h] as number,
				s: tone.s / 100,
				l: tone.l / 100,
			}),
		);
	}

	pickTone = (k: number) => {
		this.toneIdx = k;
		this.#commit(this.hueIdx, k);
	};

	// Reel scroll → recompute the centred hue; commit its selected tone on change.
	onScroll = () => {
		const el = this.#reel;
		if (!el) return;
		const idx = clampIndex(Math.round(el.scrollLeft / CELL_W));
		if (idx === this.#lastIdx) return;
		this.#lastIdx = idx;
		this.hueIdx = idx;
		this.#commit(idx, this.toneIdx);
	};

	// Grab-drag: suspend CSS snap while dragging, restore + snap on release.
	onPointerDown = (event: PointerEvent) => {
		const el = this.#reel;
		if (!el) return;
		this.#drag = {
			down: true,
			sx: event.clientX,
			sl: el.scrollLeft,
		};
		el.style.scrollSnapType = 'none';
		el.setPointerCapture(event.pointerId);
	};

	onPointerMove = (event: PointerEvent) => {
		const el = this.#reel;
		if (!this.#drag.down || !el) return;
		el.scrollLeft = this.#drag.sl - (event.clientX - this.#drag.sx);
	};

	onPointerUp = (event: PointerEvent) => {
		const el = this.#reel;
		this.#drag.down = false;
		if (!el) return;
		el.releasePointerCapture?.(event.pointerId);
		el.style.scrollSnapType = '';
		el.scrollTo({
			left:
				clampIndex(Math.round(el.scrollLeft / CELL_W)) *
				CELL_W,
			behavior: 'smooth',
		});
	};

	// Centre the reel over the colour the panel opened on, once on insert.
	reel = modifier((element: HTMLElement) => {
		this.#reel = element;
		element.scrollLeft = nearestHue(this.#openingHue) * CELL_W;

		element.addEventListener('scroll', this.onScroll);
		element.addEventListener('pointerdown', this.onPointerDown);
		element.addEventListener('pointermove', this.onPointerMove);
		element.addEventListener('pointerup', this.onPointerUp);
		// Without this a cancelled gesture leaves `down` set and later moves
		// keep scroll-dragging with no button held.
		element.addEventListener('pointercancel', this.onPointerUp);
		return () => {
			this.#reel = null;
			element.removeEventListener('scroll', this.onScroll);
			element.removeEventListener(
				'pointerdown',
				this.onPointerDown,
			);
			element.removeEventListener(
				'pointermove',
				this.onPointerMove,
			);
			element.removeEventListener(
				'pointerup',
				this.onPointerUp,
			);
			element.removeEventListener(
				'pointercancel',
				this.onPointerUp,
			);
		};
	});

	<template>
		<div class="sub-cp-shade">
			{{! hue reel }}
			<div class="sub-cp-reelwrap">
				<div
					class="sub-cp-reel"
					role="group"
					aria-label="Hue reel"
					{{this.reel}}
				>
					<div
						class="sub-cp-reel-pad"
						aria-hidden="true"
					></div>
					{{#each this.hues key="." as |h|}}
						<div
							class="sub-cp-hcell"
							style={{hueCellStyle h}}
							aria-hidden="true"
						></div>
					{{/each}}
					<div
						class="sub-cp-reel-pad"
						aria-hidden="true"
					></div>
				</div>
				<div
					class="sub-cp-reel-window"
					aria-hidden="true"
				></div>
			</div>

			{{! tonal shades for the centred hue }}
			<div class="sub-cp-shades">
				{{#each this.shades key="w" as |shade|}}
					<button
						type="button"
						class="sub-cp-shade-row
							{{if
								(eq
									shade.k
									this.toneIdx
								)
								'is-selected'
							}}"
						{{on
							"click"
							(fn
								this.pickTone
								shade.k
							)
						}}
					>
						<span
							class="sub-cp-shade-swatch"
							style={{swatchStyle
								shade.hex
							}}
							aria-hidden="true"
						></span>
						<span
							class="sub-cp-shade-name"
						>{{shade.name}}</span>
						<span
							class="sub-cp-shade-hex"
						>{{upper shade.hex}}</span>
					</button>
				{{/each}}
			</div>
		</div>
	</template>
}
