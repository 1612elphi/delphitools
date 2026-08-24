// client-only fabric import

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

export type FabricFilter = FabricImage['filters'][number];

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
const vec3 = (p: Params, key: string, fallback: Vec3): Vec3 => {
	const rgb = hexToRgb(String(p[key] ?? ''));
	return rgb ? [rgb.r / 255, rgb.g / 255, rgb.b / 255] : fallback;
};

const FACTORIES: Record<
	string,
	(
		p: Params,
		size: { width: number; height: number },
	) => FabricFilter | null
> = {
	// fabric brightness uses /200
	brightness: (p) =>
		new Brightness({ brightness: num(p, 'amount') / 200 }),
	contrast: (p) => new Contrast({ contrast: num(p, 'amount') / 200 }),
	saturation: (p) =>
		new Saturation({ saturation: num(p, 'amount') / 100 }),
	vibrance: (p) => new Vibrance({ vibrance: num(p, 'amount') / 100 }),
	'hue-rotate': (p) =>
		new HueRotation({ rotation: num(p, 'angle') / 180 }),
	exposure: (p) => {
		const gain = Math.pow(2, num(p, 'amount') / 50);
		return gainMatrix(gain, gain, gain);
	},
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
	// fabric blur is relative
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

export const isRenderableFilter = (type: string): boolean => type in FACTORIES;

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
