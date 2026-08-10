/**
 * Filter factories (M3-4 Tier-0 + Tier-1): doc `Filter` instances → Fabric
 * filter objects, with ALL param→value scaling centralised here so the
 * registry's slider ranges (filters.ts) map to render values in one place.
 * Tier 0 = Fabric built-ins (verified against the installed 7.4.0 source:
 *   Brightness/Contrast/Saturation/Vibrance −1..1 · HueRotation rotation −1..1
 *   (×π rad) · Blur 0..1 relative (visual extent ≈ blur × 0.12 × min side) ·
 *   Noise ~0..255 (shader divides by 255) · Gamma [r,g,b] · Pixelate px).
 * Tier 1 = the custom shaders in filter-shaders.ts, which take PRE-NORMALISED
 * props (0–1 ranges, [r,g,b] 0–1 vec3s) — the scaling all happens here.
 *
 * Every registry type now renders; an unknown type returns null and simply
 * moves no pixels. Adding a renderer stays additive — one entry in FACTORIES.
 *
 * ⚠️ Imports Fabric — client-only, keep behind the ssr:false dynamic boundary.
 */

import { filters as fabricFilters } from 'fabric';
import type { FabricImage } from 'fabric';
import type { Filter } from './doc-model';
import { defaultParams } from './param-spec';
import { getFilterDef, FILM_SIM_GRADES } from './filters';
import { hexToRgb } from './colour-convert';
import {
	ColourNoise,
	SubstrataColourBalance,
	SubstrataDuotone,
	SubstrataFilmSim,
	SubstrataLevels,
	SubstrataLut,
	SubstrataPosterise,
	SubstrataThreshold,
	SubstrataVignette,
	type Vec3,
} from './filter-shaders';
import { ensureLut, getLoadedLut, isLutLook } from './lut-data';

// Filter classes live under fabric's `filters` namespace (only the backends
// are flat exports).
const {
	Blur,
	Brightness,
	ColorMatrix,
	Contrast,
	Convolute,
	Gamma,
	Grayscale,
	HueRotation,
	Invert,
	Noise,
	Pixelate,
	Saturation,
	Sepia,
	Vibrance,
} = fabricFilters;

/** Instance type of any Fabric filter, derived from where it's consumed. */
export type FabricFilter = FabricImage['filters'][number];

/** Diagonal-gain ColorMatrix (identity except per-channel RGB multipliers). */
function gainMatrix(r: number, g: number, b: number): FabricFilter {
	// prettier-ignore
	return new ColorMatrix({ matrix: [
    r, 0, 0, 0, 0,
    0, g, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ] });
}

const kernel = (matrix: number[]) => () => new Convolute({ matrix });

type Params = Record<string, number | string>;
const num = (p: Params, key: string): number => Number(p[key]) || 0;
/** "#rrggbb" → [r,g,b] 0–1 (what the custom shaders take as vec3 uniforms). */
const vec3 = (p: Params, key: string, fallback: Vec3): Vec3 => {
	const rgb = hexToRgb(String(p[key] ?? ''));
	return rgb ? [rgb.r / 255, rgb.g / 255, rgb.b / 255] : fallback;
};

/**
 * One factory per renderable type. `size` is the source raster's pixel size —
 * needed only where a px-labelled slider meets a relative Fabric value (blur).
 */
const FACTORIES: Record<
	string,
	(
		p: Params,
		size: { width: number; height: number },
	) => FabricFilter | null
> = {
	// /200 not /100: Fabric adds brightness×255 and its contrast curve goes
	// vertical near ±1, so a full slider maps to ±0.5 — anything hotter blows
	// mid-grey to white by half-throw. QA-taste knob.
	brightness: (p) =>
		new Brightness({ brightness: num(p, 'amount') / 200 }),
	contrast: (p) => new Contrast({ contrast: num(p, 'amount') / 200 }),
	saturation: (p) =>
		new Saturation({ saturation: num(p, 'amount') / 100 }),
	vibrance: (p) => new Vibrance({ vibrance: num(p, 'amount') / 100 }),
	'hue-rotate': (p) =>
		new HueRotation({ rotation: num(p, 'angle') / 180 }),
	// Linear gain, ±2 stops across the slider (amount 50 = one stop) — SPEC §9
	// says gain, not a tone curve. QA-taste knob: the /50 stop scale.
	exposure: (p) => {
		const gain = Math.pow(2, num(p, 'amount') / 50);
		return gainMatrix(gain, gain, gain);
	},
	// Warm/cool linear R/B gain, NOT Kelvin (SPEC §9). ±0.25 channel swing at
	// full slider — QA-taste knob.
	temperature: (p) => {
		const t = num(p, 'amount') / 100;
		return gainMatrix(1 + 0.25 * t, 1, 1 - 0.25 * t);
	},
	grayscale: () => new Grayscale(),
	sepia: () => new Sepia(),
	invert: () => new Invert(),
	gamma: (p) =>
		new Gamma({
			gamma: [
				num(p, 'red') || 1,
				num(p, 'green') || 1,
				num(p, 'blue') || 1,
			],
		}),
	// Fabric Blur is relative to image size; its visual extent ≈ blur × 0.12 ×
	// min(w,h) px (Blur.getBlurValue × sample spread), so this keeps the slider's
	// px label honest per-image.
	'gaussian-blur': (p, size) =>
		new Blur({
			blur: Math.min(
				1,
				num(p, 'radius') /
					(0.12 *
						Math.min(
							size.width,
							size.height,
						)),
			),
		}),
	// Amount lerps the kernel identity→classic (t=1 is the textbook kernel).
	sharpen: (p) => {
		const t = num(p, 'amount') / 100;
		return new Convolute({
			matrix: [0, -t, 0, -t, 1 + 4 * t, -t, 0, -t, 0],
		});
	},
	emboss: (p) => {
		const t = num(p, 'amount') / 100;
		return new Convolute({
			matrix: [t, t, t, t, 1 - 0.3 * t, -t, -t, -t, -t],
		});
	},
	'edge-detect': kernel([-1, -1, -1, -1, 8, -1, -1, -1, -1]),
	noise: (p) => {
		const noise = (num(p, 'amount') / 100) * 255;
		return p.mode === 'colour'
			? new ColourNoise({ noise })
			: new Noise({ noise });
	},
	pixelate: (p) =>
		new Pixelate({
			blocksize: Math.max(2, Math.round(num(p, 'blockSize'))),
		}),

	// ── Tier-1 customs (filter-shaders.ts; props pre-normalised here) ──────────
	levels: (p) =>
		new SubstrataLevels({
			inBlack: num(p, 'inBlack') / 255,
			inWhite: num(p, 'inWhite') / 255,
			gamma: Number(p.gamma) || 1,
			outBlack: num(p, 'outBlack') / 255,
			outWhite: num(p, 'outWhite') / 255,
		}),
	threshold: (p) =>
		new SubstrataThreshold({ level: num(p, 'level') / 255 }),
	posterize: (p) =>
		new SubstrataPosterise({
			levels: Math.min(
				32,
				Math.max(2, Math.round(num(p, 'levels'))),
			),
		}),
	vignette: (p) =>
		new SubstrataVignette({
			amount: num(p, 'amount') / 100,
			midpoint: num(p, 'midpoint') / 100,
			roundness: num(p, 'roundness') / 100,
			feather: num(p, 'feather') / 100,
			colour: vec3(p, 'colour', [0, 0, 0]),
		}),
	duotone: (p) =>
		new SubstrataDuotone({
			shadow: vec3(p, 'shadowColour', [0, 0, 0]),
			highlight: vec3(p, 'highlightColour', [1, 1, 1]),
			midpoint: num(p, 'midpoint') / 100,
		}),
	'colour-balance': (p) =>
		new SubstrataColourBalance({
			cyanRed: num(p, 'cyanRed') / 100,
			magentaGreen: num(p, 'magentaGreen') / 100,
			yellowBlue: num(p, 'yellowBlue') / 100,
		}),
	// The look table lives beside the preset shelf (filters.ts) so each look is
	// tuned in one place; an unknown preset id renders nothing rather than lying.
	// LUT looks (lut-data.ts) load async: an unloaded strip kicks its fetch and
	// renders nothing — the load bumps lutEpoch, filter-sync's signature flips,
	// and the look pops in.
	'film-sim': (p) => {
		const preset = String(p.preset);
		const intensity = num(p, 'intensity') / 100;
		const grade = FILM_SIM_GRADES[preset];
		if (grade) return new SubstrataFilmSim({ ...grade, intensity });
		if (isLutLook(preset)) {
			const lut = getLoadedLut(preset);
			if (!lut) {
				ensureLut(preset);
				return null;
			}
			return new SubstrataLut({
				lut,
				lutKey: `substrata_${preset}`,
				intensity,
			});
		}
		return null;
	},
};

/** True when a registry type has a Tier-0 renderer (UI can flag pending ones). */
export const isRenderableFilter = (type: string): boolean => type in FACTORIES;

/**
 * Build the Fabric filter chain for a layer's doc stack, in stack order,
 * skipping disabled and not-yet-renderable entries. Missing params fall back to
 * the registry defaults, so the factory never guesses its own.
 */
export function buildFabricFilters(
	stack: readonly Filter[],
	size: { width: number; height: number },
): FabricFilter[] {
	const out: FabricFilter[] = [];
	for (const f of stack) {
		if (!f.enabled) continue;
		const make = FACTORIES[f.type];
		if (!make) continue;
		const def = getFilterDef(f.type);
		const built = make(
			def
				? { ...defaultParams(def.params), ...f.params }
				: f.params,
			size,
		);
		if (built) out.push(built);
	}
	return out;
}
