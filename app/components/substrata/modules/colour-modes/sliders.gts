import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import { Knob } from 'delphitools-v2/components/substrata/modules/colour-picker-kit';
import pointerArea, { clamp01 } from 'delphitools-v2/modifiers/pointer-area';
import { rgbToHex } from 'delphitools-v2/lib/substrata/colour-convert';
import { hslToRgb, rgbToHsl } from 'delphitools-v2/lib/substrata/colour-hsv';
import {
	setRgb,
	type ColourSnapshot,
} from 'delphitools-v2/lib/substrata/colour-store';

/**
 * Colour mode 3 — SLIDERS with manual input. Per-channel gradient track + a
 * numeric field, switchable between an RGB set (R/G/B 0–255) and an HSL set
 * (H 0–360, S/L 0–100) via the segmented toggle. Ported from
 * sketches/pickers.html §"3 · RGB SLIDERS".
 *
 * All maths lives in colour-convert / colour-hsv; this file is pure UI + pointer
 * handling. Reads come from the `colour` arg; writes go through setRgb — RGB
 * channels write directly, HSL channels read via rgbToHsl(colour.rgb) and write
 * via setRgb(hslToRgb(...)). Channel letters (R/G/B, H/S/L) and the RGB/HSL
 * segment labels are functional glyphs, not copy.
 */

type SetId = 'rgb' | 'hsl';

const SETS: SetId[] = ['rgb', 'hsl'];

const HUE_SPECTRUM =
	'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';

interface Row {
	/** Channel glyph — standard letter, not copy. */
	label: string;
	/** Committed display value (integer, in display units). */
	value: number;
	min: number;
	max: number;
	/** Handle position, 0–1. */
	pos: number;
	/** CSS background reflecting the channel. */
	track: string;
	/** Commit a typed display-unit value to the store. */
	onCommit: (n: number) => void;
}

function rgbRows(colour: ColourSnapshot): Row[] {
	const { r, g, b } = colour.rgb;
	return [
		{
			label: 'R',
			value: r,
			min: 0,
			max: 255,
			pos: r / 255,
			track: 'linear-gradient(to right,#000,#f00)',
			onCommit: (n) => setRgb({ ...colour.rgb, r: n }),
		},
		{
			label: 'G',
			value: g,
			min: 0,
			max: 255,
			pos: g / 255,
			track: 'linear-gradient(to right,#000,#0f0)',
			onCommit: (n) => setRgb({ ...colour.rgb, g: n }),
		},
		{
			label: 'B',
			value: b,
			min: 0,
			max: 255,
			pos: b / 255,
			track: 'linear-gradient(to right,#000,#00f)',
			onCommit: (n) => setRgb({ ...colour.rgb, b: n }),
		},
	];
}

function hslRows(colour: ColourSnapshot): Row[] {
	const hsl = rgbToHsl(colour.rgb);
	const sTrack = `linear-gradient(to right,${rgbToHex(
		hslToRgb({ ...hsl, s: 0 }),
	)},${rgbToHex(hslToRgb({ ...hsl, s: 1 }))})`;
	const lTrack = `linear-gradient(to right,#000,${rgbToHex(
		hslToRgb({ ...hsl, l: 0.5 }),
	)},#fff)`;
	return [
		{
			label: 'H',
			value: Math.round(hsl.h),
			min: 0,
			max: 360,
			pos: hsl.h / 360,
			track: HUE_SPECTRUM,
			onCommit: (n) => setRgb(hslToRgb({ ...hsl, h: n })),
		},
		{
			label: 'S',
			value: Math.round(hsl.s * 100),
			min: 0,
			max: 100,
			pos: hsl.s,
			track: sTrack,
			onCommit: (n) =>
				setRgb(hslToRgb({ ...hsl, s: n / 100 })),
		},
		{
			label: 'L',
			value: Math.round(hsl.l * 100),
			min: 0,
			max: 100,
			pos: hsl.l,
			track: lTrack,
			onCommit: (n) =>
				setRgb(hslToRgb({ ...hsl, l: n / 100 })),
		},
	];
}

function trackStyle(background: string) {
	return htmlSafe(`background: ${background}`);
}

function upper(s: string) {
	return s.toUpperCase();
}

interface ChannelInputSignature {
	Element: HTMLInputElement;
	Args: {
		value: number;
		min: number;
		max: number;
		onCommit: (n: number) => void;
		label: string;
	};
}

/** Editable numeric field: commits on blur/Enter (clamped + rounded to range),
 *  reverts on invalid input or Escape. */
class ChannelInput extends Component<ChannelInputSignature> {
	@tracked draft: string | null = null;

	get shown() {
		return this.draft ?? String(this.args.value);
	}

	edit = (event: Event) => {
		this.draft = (event.target as HTMLInputElement).value;
	};

	select = (event: Event) => {
		(event.target as HTMLInputElement).select();
	};

	commit = () => {
		if (this.draft === null) return;
		const n = Number(this.draft.trim());
		if (this.draft.trim() !== '' && Number.isFinite(n))
			this.args.onCommit(
				Math.max(
					this.args.min,
					Math.min(this.args.max, Math.round(n)),
				),
			);
		this.draft = null; // invalid → snap back to the live value
	};

	onKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter') {
			this.commit();
			(event.target as HTMLInputElement).blur();
		} else if (event.key === 'Escape') {
			this.draft = null;
			(event.target as HTMLInputElement).blur();
		}
	};

	<template>
		<input
			class="sub-cp-chan-input"
			value={{this.shown}}
			inputmode="numeric"
			spellcheck="false"
			aria-label={{@label}}
			{{on "input" this.edit}}
			{{on "focus" this.select}}
			{{on "blur" this.commit}}
			{{on "keydown" this.onKeydown}}
			...attributes
		/>
	</template>
}

interface ChannelRowSignature {
	Args: {
		row: Row;
		onDrag: (x: number, y: number) => void;
	};
}

const ChannelRow: TOC<ChannelRowSignature> = <template>
	<div class="sub-cp-chan">
		<span class="sub-cp-chan-label">{{@row.label}}</span>
		<div
			class="sub-cp-chan-track"
			style={{trackStyle @row.track}}
			{{pointerArea @onDrag}}
		>
			<Knob @x={{@row.pos}} @y={{0.5}} />
		</div>
		<ChannelInput
			@value={{@row.value}}
			@min={{@row.min}}
			@max={{@row.max}}
			@onCommit={{@row.onCommit}}
			@label={{@row.label}}
		/>
	</div>
</template>;

export interface SlidersModeSignature {
	Args: { colour: ColourSnapshot };
}

export default class SlidersMode extends Component<SlidersModeSignature> {
	@tracked channelSet: SetId = 'rgb';

	sets = SETS;

	pickSet = (next: SetId) => {
		this.channelSet = next;
	};

	get rows(): Row[] {
		return this.channelSet === 'rgb'
			? rgbRows(this.args.colour)
			: hslRows(this.args.colour);
	}

	// A track drag emits a normalised x (0–1); write it to channel `row` of the
	// active set.
	#writeTrack(row: number, x: number) {
		const n = clamp01(x);
		const colour = this.args.colour;
		if (this.channelSet === 'rgb') {
			const key = (['r', 'g', 'b'] as const)[row];
			if (key)
				setRgb({
					...colour.rgb,
					[key]: Math.round(n * 255),
				});
		} else {
			const cur = rgbToHsl(colour.rgb);
			if (row === 0) setRgb(hslToRgb({ ...cur, h: n * 360 }));
			else if (row === 1) setRgb(hslToRgb({ ...cur, s: n }));
			else setRgb(hslToRgb({ ...cur, l: n }));
		}
	}

	drag0 = (x: number) => this.#writeTrack(0, x);
	drag1 = (x: number) => this.#writeTrack(1, x);
	drag2 = (x: number) => this.#writeTrack(2, x);

	get rowBindings() {
		const drags = [this.drag0, this.drag1, this.drag2];
		return this.rows.map((row, i) => ({
			row,
			onDrag: drags[i] as (x: number, y: number) => void,
		}));
	}

	<template>
		<div class="sub-cp-sliders">
			{{! RGB | HSL set toggle }}
			<div class="sub-cp-settop">
				<div class="segmented sub-cp-setseg">
					{{#each this.sets key="." as |s|}}
						<button
							type="button"
							class="sub-cp-setbtn
								{{if
									(eq
										this.channelSet
										s
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.pickSet
									s
								)
							}}
						>{{upper s}}</button>
					{{/each}}
				</div>
			</div>

			{{! channel rows — fill the panel evenly (the footer swatch shows
				the preview) }}
			{{#each this.rowBindings key="row.label" as |binding|}}
				<ChannelRow
					@row={{binding.row}}
					@onDrag={{binding.onDrag}}
				/>
			{{/each}}
		</div>
	</template>
}
