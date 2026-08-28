import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import pointerArea, { clamp01 } from 'delphitools-v2/modifiers/pointer-area';
import { rgbToHex } from 'delphitools-v2/lib/substrata/colour-convert';
import {
	setRgb,
	type ColourSnapshot,
} from 'delphitools-v2/lib/substrata/colour-store';
import {
	bandCentre,
	spectrumToRgb,
} from 'delphitools-v2/lib/substrata/colour-spectrum';
import { wavelengthToRgb } from 'delphitools-v2/lib/substrata/colour-prism';

const N = 16;

const BAND_TINTS = Array.from({ length: N }, (_, i) =>
	rgbToHex(wavelengthToRgb(bandCentre(i, N))),
);

const INITIAL_BANDS = Array.from({ length: N }, (_, i) => {
	const t = (i - 6) / 3;
	return 0.1 + 0.8 * Math.exp(-0.5 * t * t);
});

function barStyle(v: number, tint: string) {
	return htmlSafe(`height: ${v * 100}%; background-color: ${tint}`);
}

export interface SpectrumModeSignature {
	Args: { colour: ColourSnapshot };
}

export default class SpectrumMode extends Component<SpectrumModeSignature> {
	@tracked bands: number[] = INITIAL_BANDS;

	get bars() {
		return this.bands.map((v, i) => ({
			i,
			style: barStyle(v, BAND_TINTS[i] as string),
		}));
	}

	paint = (x: number, y: number) => {
		const i = Math.min(N - 1, Math.floor(x * N));
		const v = clamp01(1 - y);
		if (this.bands[i] === v) return;
		this.bands = this.bands.map((b, j) => (j === i ? v : b));
		setRgb(spectrumToRgb(this.bands));
	};

	<template>
			<div
			class="sub-cp-eq"
			aria-label="Spectral power distribution"
			{{pointerArea this.paint}}
		>
			{{#each this.bars key="i" as |bar|}}
				<div class="sub-cp-eq-slot">
					<span
						aria-hidden="true"
						class="sub-cp-eq-bar"
						style={{bar.style}}
					></span>
				</div>
			{{/each}}
		</div>
	</template>
}
