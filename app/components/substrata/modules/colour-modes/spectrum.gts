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

/**
 * Spectrum mode (spectral EQ) — a "graphic EQ for light": the user sculpts a
 * spectral power distribution as N intensity bands across 380–700 nm and the
 * engine integrates it into the colour it emits. Because it mixes the whole
 * spectrum (not one wavelength) it reaches colours no monochromatic light can —
 * magenta, pink, white, pastels.
 *
 * The EQ is ONE pointer surface: x → band index, (1 - y) → intensity, so a drag
 * sweeps across to paint several bars in a stroke and a click sets one bar. Each
 * bar is tinted by its own band-centre wavelength.
 *
 * All SPD→sRGB maths lives in lib/substrata/colour-spectrum; this file is pure
 * UI + pointer handling. Local `bands` is the source of truth and is pushed into
 * the shared colour-store on interaction only (never on mount, matching prism).
 */

/** Number of sculptable bands (even spacing across [SPECTRUM_LO, SPECTRUM_HI]). */
const N = 16;

/** Per-bar fill tint = the sRGB of that band's centre wavelength. Constant (N is
 *  fixed), so computed once at module load. */
const BAND_TINTS = Array.from({ length: N }, (_, i) =>
	rgbToHex(wavelengthToRgb(bandCentre(i, N))),
);

/** Initial SPD — a soft Gaussian bump (floor 0.1 … peak 0.9, centred on band 6
 *  ≈ 510 nm) that resolves to a pleasant mint. Shown until the first
 *  interaction; NOT pushed on mount. */
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
	// `colour` is part of the shared mode contract but SPECTRUM is a pure
	// generator: it writes the sculpted colour and never reads the incoming one
	// (the footer supplies the swatch/hex/name readout).
	@tracked bands: number[] = INITIAL_BANDS;

	get bars() {
		return this.bands.map((v, i) => ({
			i,
			style: barStyle(v, BAND_TINTS[i] as string),
		}));
	}

	// Sweep-paint the EQ: x picks the band, (1 - y) sets its intensity. The
	// === guard skips no-op repaints of the same value.
	paint = (x: number, y: number) => {
		const i = Math.min(N - 1, Math.floor(x * N));
		const v = clamp01(1 - y);
		if (this.bands[i] === v) return;
		this.bands = this.bands.map((b, j) => (j === i ? v : b));
		setRgb(spectrumToRgb(this.bands));
	};

	<template>
		{{! the EQ — one pointer surface of N tinted bars; the 1px gaps over the
			border colour draw the hairline gridlines between bars }}
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
