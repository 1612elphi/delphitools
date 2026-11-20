import { htmlSafe } from '@ember/template';
import {
	contrastLevels,
	hex,
	contrastRatio,
	fromHsl,
	hsl,
	luminance,
	type Rgb,
} from 'delphicanon/lib/colour';

const { aaLarge, aa, aaa } = contrastLevels;

export const swatch = (colour: Rgb) => htmlSafe(`background: ${hex(colour)}`);
export const pair = (foreground: Rgb, background: Rgb) =>
	htmlSafe(`color: ${hex(foreground)}; background: ${hex(background)}`);

/** The thresholds marked on the scale. */
export const notches = [aaLarge, aa, aaa];

// wcag 1.4.3, 1.4.6, 1.4.11
export const rules: { name: string; aa: number; aaa?: number }[] = [
	{ name: 'Normal', aa, aaa },
	{ name: 'Large', aa: aaLarge, aaa: aa },
	{ name: 'Controls', aa: aaLarge },
];

export interface Target {
	background: boolean;
	ratio: number;
	level: string;
}

export const targets: Target[] = [
	{ background: false, ratio: aa, level: 'AA' },
	{ background: false, ratio: aaa, level: 'AAA' },
	{ background: true, ratio: aa, level: 'AA' },
	{ background: true, ratio: aaa, level: 'AAA' },
];

/** Where a ratio sits on a log scale from 1 to 21, 0 to 1. */
export function share(ratio: number): number {
	return Math.log(Math.max(ratio, 1)) / Math.log(21);
}

/**
 * The lightness of `moving`'s hue and saturation nearest to its own that
 * reaches `target` against `fixed`, searched darker first on a light
 * `fixed`; `moving` itself when none does (ContrastCheckerViewModel).
 */
export function adjust(moving: Rgb, fixed: Rgb, target: number): Rgb {
	const [h, s, l] = hsl(moving);
	const directions = luminance(fixed) > 0.5 ? [-1, 1] : [1, -1];
	for (const direction of directions) {
		for (let step = 0; step <= 100; step++) {
			const candidate = fromHsl(
				h,
				s,
				Math.min(
					Math.max(l + direction * step, 0),
					100,
				),
			);
			if (contrastRatio(candidate, fixed) >= target)
				return candidate;
		}
	}
	return moving;
}

/** The colour a suggestion moves to, undefined when the level passes already or no lightness reaches it. */
export function suggest(
	target: Target,
	foreground: Rgb,
	background: Rgb,
): Rgb | undefined {
	const [moving, fixed] = target.background
		? [background, foreground]
		: [foreground, background];
	if (contrastRatio(foreground, background) >= target.ratio)
		return undefined;
	const candidate = adjust(moving, fixed, target.ratio);
	return contrastRatio(candidate, fixed) >= target.ratio
		? candidate
		: undefined;
}

/** The best WCAG level a ratio reaches for normal text, then large text. */
export function grade(ratio: number): string {
	if (ratio >= aaa) return 'AAA';
	if (ratio >= aa) return 'AA';
	return ratio >= aaLarge ? 'AA Large' : 'Fail';
}
