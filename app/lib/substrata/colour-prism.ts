// wavelength range, nm
export const PRISM_LO = 380;
export const PRISM_HI = 700;

export type SpectralBand =
	'violet' | 'blue' | 'cyan' | 'green' | 'yellow' | 'orange' | 'red';

export function band(wl: number): SpectralBand {
	return wl < 450
		? 'violet'
		: wl < 485
			? 'blue'
			: wl < 500
				? 'cyan'
				: wl < 565
					? 'green'
					: wl < 590
						? 'yellow'
						: wl < 625
							? 'orange'
							: 'red';
}

export interface RGB {
	r: number;
	g: number;
	b: number;
}

export interface PrismKnobs {
	// 0-1 intensity
	watts: number;
	// 0-1 haze
	ntu: number;
}

export function wavelengthToRgb(wl: number): RGB {
	let r = 0;
	let g = 0;
	let b = 0;

	if (wl < 440) {
		r = -(wl - 440) / 60;
		b = 1;
	} else if (wl < 490) {
		g = (wl - 440) / 50;
		b = 1;
	} else if (wl < 510) {
		g = 1;
		b = -(wl - 510) / 20;
	} else if (wl < 580) {
		r = (wl - 510) / 70;
		g = 1;
	} else if (wl < 645) {
		r = 1;
		g = -(wl - 645) / 65;
	} else {
		r = 1;
	}

	// spectral edge rolloff
	let f = 1;
	if (wl < 420) f = 0.3 + (0.7 * (wl - 380)) / 40;
	else if (wl > 700) f = 0.3 + (0.7 * (780 - wl)) / 80;

	const ch = (c: number): number =>
		Math.round(
			255 * Math.pow(Math.max(0, Math.min(1, c)) * f, 0.8),
		);

	return { r: ch(r), g: ch(g), b: ch(b) };
}

export function prismColour(wl: number, { watts, ntu }: PrismKnobs): RGB {
	const base = wavelengthToRgb(wl);
	const shape = (v: number): number => {
		let c = v * watts;
		c = c + (255 - c) * ntu;
		return Math.round(Math.max(0, Math.min(255, c)));
	};
	return { r: shape(base.r), g: shape(base.g), b: shape(base.b) };
}

export function prismHex(wl: number, knobs: PrismKnobs): string {
	const { r, g, b } = prismColour(wl, knobs);
	return (
		'#' +
		[r, g, b]
			.map((c) => c.toString(16).padStart(2, '0'))
			.join('')
			.toUpperCase()
	);
}
