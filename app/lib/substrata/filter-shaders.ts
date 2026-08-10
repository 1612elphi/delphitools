/**
 * Custom filters (M3 Tier-1 + ratified Threshold/Posterise): the Fabric
 * BaseFilter subclasses behind every registry type that isn't a Fabric
 * built-in. Each carries a GLSL fragment shader AND an applyTo2d fallback
 * (SPEC §9 — the chain must survive the Canvas2D backend after context loss).
 *
 * Contract notes (verified vs installed fabric 7.4.0 source):
 *   - static `type` MUST be unique per class — the WebGL program cache is
 *     keyed by it; a duplicate silently reuses another class's shader.
 *   - static `uniformLocations` lists custom uniforms; uStepW/uStepH are
 *     resolved + sent by BaseFilter itself (1/width, 1/height).
 *   - constructor Object.assigns static `defaults` then options — instance
 *     fields must be `declare`d (a real class field would clobber them).
 *   - Props arrive PRE-NORMALISED (0–1 ranges, [r,g,b] 0–1 vec3s): all
 *     registry-unit scaling stays centralised in filter-factory.ts.
 *
 * ⚠️ Imports Fabric — client-only, keep behind the ssr:false dynamic boundary.
 */

import { filters as fabricFilters } from 'fabric';
import type {
	T2DPipelineState,
	TWebGLPipelineState,
	TWebGLUniformLocationMap,
} from 'fabric';
import { applyGradeToImageData } from './filters';
import { applyLutToImageData, type LoadedLut } from './lut-data';

const { BaseFilter, Noise } = fabricFilters;

export type Vec3 = [number, number, number];

/** Rec. 709 luma, the same weights the built-in Grayscale's luminosity mode uses. */
const LUMA: Vec3 = [0.2126, 0.7152, 0.0722];
const lumaOf = (r: number, g: number, b: number): number =>
	r * LUMA[0] + g * LUMA[1] + b * LUMA[2];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = clamp01((x - e0) / (e1 - e0));
	return t * t * (3 - 2 * t);
};

// ── Colour noise (per-channel grain; the mono built-in shares one rand) ───────

const colourNoiseFragment = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uStepH;
  uniform float uNoise;
  uniform float uSeed;
  varying vec2 vTexCoord;
  float rand(vec2 co, float seed, float vScale) {
    return fract(sin(dot(co.xy * vScale ,vec2(12.9898 , 78.233))) * 43758.5453 * (seed + 0.01) / 2.0);
  }
  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    color.rgb += vec3(
      0.5 - rand(vTexCoord, uSeed, 0.1 / uStepH),
      0.5 - rand(vTexCoord, uSeed + 0.71, 0.1 / uStepH),
      0.5 - rand(vTexCoord, uSeed + 1.32, 0.1 / uStepH)
    ) * uNoise;
    gl_FragColor = color;
  }
`;

export class ColourNoise extends Noise {
	static type = 'SubstrataColourNoise';
	// public, matching Noise's own declaration (BaseFilter's is protected)
	getFragmentSource(): string {
		return colourNoiseFragment;
	}
	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		const noise = this.noise;
		for (let i = 0; i < data.length; i += 4) {
			data[i]! += (0.5 - Math.random()) * noise;
			data[i + 1]! += (0.5 - Math.random()) * noise;
			data[i + 2]! += (0.5 - Math.random()) * noise;
		}
	}
}

// ── Levels ────────────────────────────────────────────────────────────────────

type LevelsProps = {
	inBlack: number;
	inWhite: number;
	gamma: number;
	outBlack: number;
	outWhite: number;
};

export class SubstrataLevels extends BaseFilter<
	'SubstrataLevels',
	LevelsProps
> {
	declare inBlack: number;
	declare inWhite: number;
	declare gamma: number;
	declare outBlack: number;
	declare outWhite: number;
	static type = 'SubstrataLevels';
	static defaults: LevelsProps = {
		inBlack: 0,
		inWhite: 1,
		gamma: 1,
		outBlack: 0,
		outWhite: 1,
	};
	static uniformLocations = [
		'uInBlack',
		'uInWhite',
		'uGamma',
		'uOutBlack',
		'uOutWhite',
	];

	protected getFragmentSource(): string {
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform float uInBlack;
      uniform float uInWhite;
      uniform float uGamma;
      uniform float uOutBlack;
      uniform float uOutWhite;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        vec3 c = clamp((color.rgb - vec3(uInBlack)) / max(uInWhite - uInBlack, 0.001), 0.0, 1.0);
        c = pow(c, vec3(1.0 / uGamma));
        color.rgb = vec3(uOutBlack) + c * (uOutWhite - uOutBlack);
        gl_FragColor = color;
      }
    `;
	}

	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		const range = Math.max(this.inWhite - this.inBlack, 0.001);
		const lut = new Uint8ClampedArray(256);
		for (let i = 0; i < 256; i++) {
			const c = Math.pow(
				clamp01((i / 255 - this.inBlack) / range),
				1 / this.gamma,
			);
			lut[i] =
				255 *
				(this.outBlack +
					c * (this.outWhite - this.outBlack));
		}
		for (let i = 0; i < data.length; i += 4) {
			data[i] = lut[data[i]!]!;
			data[i + 1] = lut[data[i + 1]!]!;
			data[i + 2] = lut[data[i + 2]!]!;
		}
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform1f(u.uInBlack!, this.inBlack);
		gl.uniform1f(u.uInWhite!, this.inWhite);
		gl.uniform1f(u.uGamma!, this.gamma);
		gl.uniform1f(u.uOutBlack!, this.outBlack);
		gl.uniform1f(u.uOutWhite!, this.outWhite);
	}

	isNeutralState(): boolean {
		return (
			this.inBlack === 0 &&
			this.inWhite === 1 &&
			this.gamma === 1 &&
			this.outBlack === 0 &&
			this.outWhite === 1
		);
	}
}

// ── Threshold ─────────────────────────────────────────────────────────────────

type ThresholdProps = { level: number };

export class SubstrataThreshold extends BaseFilter<
	'SubstrataThreshold',
	ThresholdProps
> {
	declare level: number;
	static type = 'SubstrataThreshold';
	static defaults: ThresholdProps = { level: 0.5 };
	static uniformLocations = ['uLevel'];

	protected getFragmentSource(): string {
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform float uLevel;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        color.rgb = vec3(step(uLevel, lum));
        gl_FragColor = color;
      }
    `;
	}

	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		const cut = this.level * 255;
		for (let i = 0; i < data.length; i += 4) {
			const v =
				lumaOf(data[i]!, data[i + 1]!, data[i + 2]!) >=
				cut
					? 255
					: 0;
			data[i] = data[i + 1] = data[i + 2] = v;
		}
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform1f(u.uLevel!, this.level);
	}
}

// ── Posterise ─────────────────────────────────────────────────────────────────

type PosteriseProps = { levels: number };

export class SubstrataPosterise extends BaseFilter<
	'SubstrataPosterise',
	PosteriseProps
> {
	declare levels: number;
	static type = 'SubstrataPosterise';
	static defaults: PosteriseProps = { levels: 6 };
	static uniformLocations = ['uSteps'];

	protected getFragmentSource(): string {
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform float uSteps;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        color.rgb = floor(color.rgb * uSteps + 0.5) / uSteps;
        gl_FragColor = color;
      }
    `;
	}

	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		const n = Math.max(1, this.levels - 1);
		const lut = new Uint8ClampedArray(256);
		for (let i = 0; i < 256; i++)
			lut[i] = (Math.round((i / 255) * n) / n) * 255;
		for (let i = 0; i < data.length; i += 4) {
			data[i] = lut[data[i]!]!;
			data[i + 1] = lut[data[i + 1]!]!;
			data[i + 2] = lut[data[i + 2]!]!;
		}
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform1f(u.uSteps!, Math.max(1, this.levels - 1));
	}
}

// ── Vignette ──────────────────────────────────────────────────────────────────

type VignetteProps = {
	amount: number;
	midpoint: number;
	roundness: number;
	feather: number;
	colour: Vec3;
};

export class SubstrataVignette extends BaseFilter<
	'SubstrataVignette',
	VignetteProps
> {
	declare amount: number;
	declare midpoint: number;
	declare roundness: number;
	declare feather: number;
	declare colour: Vec3;
	static type = 'SubstrataVignette';
	static defaults: VignetteProps = {
		amount: 0.5,
		midpoint: 0.5,
		roundness: 0,
		feather: 0.5,
		colour: [0, 0, 0],
	};
	static uniformLocations = [
		'uAmount',
		'uMidpoint',
		'uRoundness',
		'uFeather',
		'uColour',
	];

	protected getFragmentSource(): string {
		// roundness 0 = frame-fitting ellipse, 1 = pixel-true circle (aspect via
		// the auto-sent uStep uniforms: uStepH/uStepW = width/height)
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform float uStepW;
      uniform float uStepH;
      uniform float uAmount;
      uniform float uMidpoint;
      uniform float uRoundness;
      uniform float uFeather;
      uniform vec3 uColour;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        float aspect = uStepH / uStepW;
        vec2 p = vTexCoord - 0.5;
        p.x *= mix(1.0, aspect, uRoundness);
        float d = length(p) * 2.0;
        float edge = uMidpoint * 1.42 - uFeather * 0.5;
        float mask = smoothstep(edge, edge + max(uFeather, 0.001), d);
        color.rgb = mix(color.rgb, uColour, mask * uAmount);
        gl_FragColor = color;
      }
    `;
	}

	applyTo2d({
		imageData: { data, width, height },
	}: T2DPipelineState): void {
		const aspect = width / height;
		const xScale = 1 + (aspect - 1) * this.roundness;
		const edge = this.midpoint * 1.42 - this.feather * 0.5;
		const feather = Math.max(this.feather, 0.001);
		const [cr, cg, cb] = this.colour.map((c) => c * 255) as Vec3;
		for (let y = 0; y < height; y++) {
			const py = y / height - 0.5;
			for (let x = 0; x < width; x++) {
				const px = (x / width - 0.5) * xScale;
				const mix =
					smoothstep(
						edge,
						edge + feather,
						Math.sqrt(px * px + py * py) *
							2,
					) * this.amount;
				if (mix === 0) continue;
				const i = (y * width + x) * 4;
				data[i]! += (cr - data[i]!) * mix;
				data[i + 1]! += (cg - data[i + 1]!) * mix;
				data[i + 2]! += (cb - data[i + 2]!) * mix;
			}
		}
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform1f(u.uAmount!, this.amount);
		gl.uniform1f(u.uMidpoint!, this.midpoint);
		gl.uniform1f(u.uRoundness!, this.roundness);
		gl.uniform1f(u.uFeather!, this.feather);
		gl.uniform3fv(u.uColour!, this.colour);
	}

	isNeutralState(): boolean {
		return this.amount === 0;
	}
}

// ── Duotone ───────────────────────────────────────────────────────────────────

type DuotoneProps = { shadow: Vec3; highlight: Vec3; midpoint: number };

export class SubstrataDuotone extends BaseFilter<
	'SubstrataDuotone',
	DuotoneProps
> {
	declare shadow: Vec3;
	declare highlight: Vec3;
	declare midpoint: number;
	static type = 'SubstrataDuotone';
	static defaults: DuotoneProps = {
		shadow: [0, 0, 0],
		highlight: [1, 1, 1],
		midpoint: 0.5,
	};
	static uniformLocations = ['uShadow', 'uHighlight', 'uGammaMap'];

	/** Midpoint as a gamma remap: the luma that lands exactly halfway between
	 *  the two colours. pow(mid, g) = 0.5 → g = ln 0.5 / ln mid. */
	private gammaMap(): number {
		return (
			Math.log(0.5) /
			Math.log(Math.min(0.99, Math.max(0.01, this.midpoint)))
		);
	}

	protected getFragmentSource(): string {
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform vec3 uShadow;
      uniform vec3 uHighlight;
      uniform float uGammaMap;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        color.rgb = mix(uShadow, uHighlight, pow(lum, uGammaMap));
        gl_FragColor = color;
      }
    `;
	}

	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		const g = this.gammaMap();
		const [sr, sg, sb] = this.shadow;
		const [hr, hg, hb] = this.highlight;
		for (let i = 0; i < data.length; i += 4) {
			const t = Math.pow(
				lumaOf(data[i]!, data[i + 1]!, data[i + 2]!) /
					255,
				g,
			);
			data[i] = (sr + (hr - sr) * t) * 255;
			data[i + 1] = (sg + (hg - sg) * t) * 255;
			data[i + 2] = (sb + (hb - sb) * t) * 255;
		}
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform3fv(u.uShadow!, this.shadow);
		gl.uniform3fv(u.uHighlight!, this.highlight);
		gl.uniform1f(u.uGammaMap!, this.gammaMap());
	}
}

// ── Colour balance (ratified M3-7: three sliders, midtone-weighted) ───────────

type ColourBalanceProps = {
	cyanRed: number;
	magentaGreen: number;
	yellowBlue: number;
};

export class SubstrataColourBalance extends BaseFilter<
	'SubstrataColourBalance',
	ColourBalanceProps
> {
	declare cyanRed: number;
	declare magentaGreen: number;
	declare yellowBlue: number;
	static type = 'SubstrataColourBalance';
	static defaults: ColourBalanceProps = {
		cyanRed: 0,
		magentaGreen: 0,
		yellowBlue: 0,
	};
	static uniformLocations = ['uShift'];

	/** Full slider = ±0.3 channel shift at pure midtone — QA-taste knob. */
	private static readonly STRENGTH = 0.3;

	protected getFragmentSource(): string {
		// 4·l·(1−l): a parabola peaking at mid-grey, zero at black/white — shifts
		// fade out of shadows/highlights instead of clipping them.
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform vec3 uShift;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        color.rgb = clamp(color.rgb + uShift * (4.0 * lum * (1.0 - lum)), 0.0, 1.0);
        gl_FragColor = color;
      }
    `;
	}

	private shift(): Vec3 {
		const k = SubstrataColourBalance.STRENGTH;
		return [
			this.cyanRed * k,
			this.magentaGreen * k,
			this.yellowBlue * k,
		];
	}

	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		const [dr, dg, db] = this.shift().map((v) => v * 255) as Vec3;
		for (let i = 0; i < data.length; i += 4) {
			const l =
				lumaOf(data[i]!, data[i + 1]!, data[i + 2]!) /
				255;
			const w = 4 * l * (1 - l);
			data[i]! += dr * w;
			data[i + 1]! += dg * w;
			data[i + 2]! += db * w;
		}
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform3fv(u.uShift!, this.shift());
	}

	isNeutralState(): boolean {
		return (
			this.cyanRed === 0 &&
			this.magentaGreen === 0 &&
			this.yellowBlue === 0
		);
	}
}

// ── Film sim (the LUT family's engine: a lift/gamma/gain + saturation grade) ──

type FilmSimProps = {
	lift: Vec3;
	gain: Vec3;
	gamma: Vec3;
	sat: number;
	intensity: number;
};

export class SubstrataFilmSim extends BaseFilter<
	'SubstrataFilmSim',
	FilmSimProps
> {
	declare lift: Vec3;
	declare gain: Vec3;
	declare gamma: Vec3;
	declare sat: number;
	declare intensity: number;
	static type = 'SubstrataFilmSim';
	static defaults: FilmSimProps = {
		lift: [0, 0, 0],
		gain: [1, 1, 1],
		gamma: [1, 1, 1],
		sat: 1,
		intensity: 1,
	};
	static uniformLocations = [
		'uLift',
		'uGain',
		'uGamma',
		'uSat',
		'uIntensity',
	];

	protected getFragmentSource(): string {
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform vec3 uLift;
      uniform vec3 uGain;
      uniform vec3 uGamma;
      uniform float uSat;
      uniform float uIntensity;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        vec3 c = color.rgb * uGain + uLift * (1.0 - color.rgb);
        c = pow(clamp(c, 0.0, 1.0), uGamma);
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(lum), c, uSat);
        color.rgb = mix(color.rgb, clamp(c, 0.0, 1.0), uIntensity);
        gl_FragColor = color;
      }
    `;
	}

	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		const { lift, gain, gamma, sat, intensity } = this;
		applyGradeToImageData(
			data,
			{ lift, gain, gamma, sat },
			intensity,
		);
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform3fv(u.uLift!, this.lift);
		gl.uniform3fv(u.uGain!, this.gain);
		gl.uniform3fv(u.uGamma!, this.gamma);
		gl.uniform1f(u.uSat!, this.sat);
		gl.uniform1f(u.uIntensity!, this.intensity);
	}

	isNeutralState(): boolean {
		return this.intensity === 0;
	}
}

// ── 3D LUT (the film-emulation looks: 33³ table packed as a 2D strip) ─────────

type LutProps = { lut: LoadedLut; lutKey: string; intensity: number };

/**
 * Samples a packed-strip LUT (S slices of S×S, blue picks the slice): hardware
 * bilinear inside a slice + a manual mix across the two neighbouring slices =
 * full trilinear. The strip uploads once per LUT via the backend texture cache
 * (keyed by `lutKey`, LINEAR filtering) and binds as TEXTURE1 — the same
 * second-texture pattern Fabric's own BlendImage uses.
 */
export class SubstrataLut extends BaseFilter<'SubstrataLut', LutProps> {
	declare lut: LoadedLut;
	declare lutKey: string;
	declare intensity: number;
	static type = 'SubstrataLut';
	static defaults = { intensity: 1 };
	static uniformLocations = ['uLut', 'uSize', 'uIntensity'];

	protected getFragmentSource(): string {
		return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform sampler2D uLut;
      uniform float uSize;
      uniform float uIntensity;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        vec3 c = clamp(color.rgb, 0.0, 1.0);
        float maxIdx = uSize - 1.0;
        float slice = c.b * maxIdx;
        float s0 = floor(slice);
        float s1 = min(s0 + 1.0, maxIdx);
        float f = slice - s0;
        float u = (c.r * maxIdx + 0.5) / uSize;
        float v = (c.g * maxIdx + 0.5) / uSize;
        vec3 graded = mix(
          texture2D(uLut, vec2((s0 + u) / uSize, v)).rgb,
          texture2D(uLut, vec2((s1 + u) / uSize, v)).rgb,
          f
        );
        color.rgb = mix(color.rgb, graded, uIntensity);
        gl_FragColor = color;
      }
    `;
	}

	applyToWebGL(options: TWebGLPipelineState): void {
		const gl = options.context;
		const texture = options.filterBackend.getCachedTexture(
			this.lutKey,
			this.lut.strip,
			gl.LINEAR,
		);
		this.bindAdditionalTexture(gl, texture!, gl.TEXTURE1);
		super.applyToWebGL(options);
		this.unbindAdditionalTexture(gl, gl.TEXTURE1);
	}

	applyTo2d({ imageData: { data } }: T2DPipelineState): void {
		applyLutToImageData(data, this.lut, this.intensity);
	}

	sendUniformData(
		gl: WebGLRenderingContext,
		u: TWebGLUniformLocationMap,
	): void {
		gl.uniform1i(u.uLut!, 1); // TEXTURE1
		gl.uniform1f(u.uSize!, this.lut.size);
		gl.uniform1f(u.uIntensity!, this.intensity);
	}

	isNeutralState(): boolean {
		return this.intensity === 0;
	}
}
