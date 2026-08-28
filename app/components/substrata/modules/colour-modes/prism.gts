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
	@tracked wl = 532;
	@tracked watts = 100;
	@tracked ntu = 6;

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

			<div class="sub-cp-readout">
				<span class="sub-cp-nm">{{this.nm}}</span>
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
