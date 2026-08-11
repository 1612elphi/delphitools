import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { Knob } from 'delphitools-v2/components/substrata/modules/colour-picker-kit';
import pointerArea, { clamp01 } from 'delphitools-v2/modifiers/pointer-area';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	setRgb,
	type ColourSnapshot,
} from 'delphitools-v2/lib/substrata/colour-store';
import {
	band,
	PRISM_HI,
	PRISM_LO,
	prismColour,
	type SpectralBand,
} from 'delphitools-v2/lib/substrata/colour-prism';

/**
 * Prism mode (spectroscope) — a draggable spectrum bar tunes a wavelength in
 * [PRISM_LO, PRISM_HI]; a needle marks it. Two knobs (WATTS light intensity,
 * NTU haze) shape the result. All wavelength→sRGB maths lives in
 * lib/substrata/colour-prism; this file is pure UI + pointer handling.
 *
 * Local state (wavelength / watts / ntu) is the source of truth here and is
 * pushed into the shared colour-store on every change via setRgb(prismColour…).
 * Ported from sketches/pickers-fun.html (the PRISM IIFE).
 */

// band() returns a semantic key; these are the family words shown in the
// readout — one word each, standard colour-family names.
const BAND_LABELS: Record<SpectralBand, string> = {
	violet: 'Violet',
	blue: 'Blue',
	cyan: 'Cyan',
	green: 'Green',
	yellow: 'Yellow',
	orange: 'Orange',
	red: 'Red',
};

function needleStyle(x: number) {
	return htmlSafe(`left: ${x * 100}%`);
}

function fillStyle(pct: number) {
	return htmlSafe(`width: ${pct}%`);
}

interface ParamRowSignature {
	Args: {
		/** Instrument-panel glyph (WATTS / NTU), not copy. */
		label: string;
		ariaLabel: string;
		value: number;
		onDrag: (x: number, y: number) => void;
	};
}

const ParamRow: TOC<ParamRowSignature> = <template>
	<div class="sub-cp-param">
		<span class="sub-cp-param-label">{{@label}}</span>
		<div
			class="sub-cp-param-track"
			aria-label={{@ariaLabel}}
			{{pointerArea @onDrag}}
		>
			<span
				aria-hidden="true"
				class="sub-cp-param-fill"
				style={{fillStyle @value}}
			></span>
			<Knob @x={{divide100 @value}} @y={{0.5}} />
		</div>
		<span class="sub-cp-param-value">{{@value}}</span>
	</div>
</template>;

function divide100(v: number): number {
	return v / 100;
}

export interface PrismModeSignature {
	Args: { colour: ColourSnapshot };
}

export default class PrismMode extends Component<PrismModeSignature> {
	// Spectroscope params — local UI state, not shared document truth.
	@tracked wl = 532; // wavelength, nm (sketch default)
	@tracked watts = 100; // light intensity, 0–100 (sketch default)
	@tracked ntu = 6; // haze / turbidity, 0–100 (sketch default)

	// Push the shaped wavelength colour into the shared store — ONLY on user
	// interaction, never on mount (opening the Prism tab must not overwrite the
	// current colour). Prism is a generator: it writes, it does not read.
	#push() {
		setRgb(
			prismColour(this.wl, {
				watts: this.watts / 100,
				ntu: this.ntu / 100,
			}),
		);
	}

	dragSpectrum = (x: number) => {
		this.wl = PRISM_LO + x * (PRISM_HI - PRISM_LO);
		this.#push();
	};

	dragWatts = (x: number) => {
		this.watts = Math.round(clamp01(x) * 100);
		this.#push();
	};

	dragNtu = (x: number) => {
		this.ntu = Math.round(clamp01(x) * 100);
		this.#push();
	};

	get needleX() {
		return clamp01((this.wl - PRISM_LO) / (PRISM_HI - PRISM_LO));
	}

	get nm() {
		return Math.round(this.wl);
	}

	get bandLabel() {
		return BAND_LABELS[band(this.wl)];
	}

	get colourName() {
		return getColourName(this.args.colour.hex);
	}

	<template>
		<div class="sub-cp-prism">
			{{! spectrum bar — drag to tune the wavelength }}
			<div
				class="sub-cp-spectrum"
				aria-label="Wavelength"
				{{pointerArea this.dragSpectrum}}
			>
				<span
					aria-hidden="true"
					class="sub-cp-ticks"
				></span>
				<span
					aria-hidden="true"
					class="sub-cp-needle"
					style={{needleStyle this.needleX}}
				><span class="sub-cp-needle-tip"></span></span>
			</div>

			{{! readout — wavelength (data) + nearest colour name (data) + band }}
			<div class="sub-cp-readout">
				<span class="sub-cp-nm">{{this.nm}}</span>
				{{! "nm" is the SI unit symbol of the value above (data, not copy) }}
				<span class="sub-cp-unit">nm</span>
				<span
					class="sub-cp-name"
				>{{this.colourName}}</span>
				<span
					class="sub-cp-band"
				>{{this.bandLabel}}</span>
			</div>

			<ParamRow
				@label="WATTS"
				@ariaLabel="Light intensity"
				@value={{this.watts}}
				@onDrag={{this.dragWatts}}
			/>
			<ParamRow
				@label="NTU"
				@ariaLabel="Haze"
				@value={{this.ntu}}
				@onDrag={{this.dragNtu}}
			/>
		</div>
	</template>
}
