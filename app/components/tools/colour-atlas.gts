import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn, hash } from '@ember/helper';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { LinkTo } from '@ember/routing';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import {
	hexToRgb,
	rgbToHex,
	rgbToHsl,
	hslToRgb,
	rgbToOklch,
	lchToLab,
	oklabToRgb,
	maxOklchChroma,
	luminance,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';
import {
	COLOUR_NOTATIONS,
	formatColour,
} from 'delphitools-v2/lib/colour-notation';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { detectColour } from 'delphitools-v2/lib/colour-parse';
import {
	colourFromQuery,
	colourToQuery,
} from 'delphitools-v2/lib/colour-query';
import {
	simulateHex,
	type SimulationType,
} from 'delphitools-v2/lib/colour-vision';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

const DEFAULT_COLOUR = '#3b82f6';
const COPIED_MS = 1500;

/** Chroma at the plane's right edge. sRGB peaks at 0.313 (pure blue). */
const CHROMA_RANGE = 0.35;

const HARMONIES: [label: string, offsets: number[]][] = [
	['Complement', [0, 180]],
	['Triad', [0, 120, 240]],
	['Analogous', [-30, 0, 30]],
	['Split', [0, 150, 210]],
];

const VISION_TYPES: [label: string, type: SimulationType][] = [
	['Protanopia', 'protanopia'],
	['Deuteranopia', 'deuteranopia'],
	['Tritanopia', 'tritanopia'],
	['Achromatopsia', 'achromatopsia'],
];

const OPEN_IN: { id: string; name: string; icon: string }[] = [
	{ id: 'contrast-checker', name: 'Contrast Checker', icon: 'contrast' },
	{ id: 'harmony-genny', name: 'Harmony Generator', icon: 'rainbow' },
	{ id: 'tailwind-shades', name: 'Tailwind Shades', icon: 'wind' },
	{ id: 'palette-genny', name: 'Palette Generator', icon: 'palette' },
	{ id: 'gradient-genny', name: 'Gradient Generator', icon: 'blend' },
	{ id: 'colorblind-sim', name: 'Blindness Simulator', icon: 'eye' },
];

const SCALE_STEPS = 8;

function contrastRatio(l1: number, l2: number): number {
	const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
	return (hi + 0.05) / (lo + 0.05);
}

function mixHex(rgb: Triple, to: number, t: number): string {
	return rgbToHex(...(rgb.map((v) => v + (to - v) * t) as Triple));
}

function rotateHue(hsl: Triple, offset: number): string {
	return rgbToHex(
		...hslToRgb(
			(((hsl[0] + offset) % 360) + 360) % 360,
			hsl[1],
			hsl[2],
		),
	);
}

function colourFromUrl(): string | null {
	if (typeof window === 'undefined') return null;
	return colourFromQuery(window.location.search);
}

export default class ColourAtlasTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked inputValue = colourFromUrl() ?? DEFAULT_COLOUR;
	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get rgb(): Triple | null {
		return detectColour(this.inputValue);
	}

	get hex(): string | null {
		const rgb = this.rgb;
		return rgb ? rgbToHex(...rgb) : null;
	}

	/** White while the input is unparseable, matching colour-converter. */
	get swatchHex() {
		return this.hex ?? '#ffffff';
	}

	get swatchStyle() {
		return htmlSafe(`background-color: ${this.swatchHex}`);
	}

	get nearestName() {
		const hex = this.hex;
		return hex ? getColourName(hex) : '';
	}

	get notationRows() {
		const rgb = this.rgb;
		const hex = this.hex;
		if (!rgb || !hex) return [];
		const rows: { id: string; label: string; value: string }[] =
			COLOUR_NOTATIONS.map((n) => ({
				id: n.id,
				label: n.label,
				value: formatColour(hex, n.id),
			}));
		rows.push({
			id: 'luminance',
			label: 'Luminance',
			value: luminance(...rgb).toFixed(3),
		});
		return rows.map((row) => ({
			...row,
			isCopied: this.copied === row.value,
		}));
	}

	// ── Gamut ───────────────────────────────────────────────────────────

	get oklch(): Triple | null {
		const rgb = this.rgb;
		return rgb ? rgbToOklch(...rgb) : null;
	}

	get gamutCaption() {
		const oklch = this.oklch;
		if (!oklch) return '';
		const [l, c, h] = oklch;
		const cmax = maxOklchChroma(l, h);
		const pct = cmax > 0 ? Math.round((c / cmax) * 100) : 0;
		return `chroma ${c.toFixed(3)} of ${cmax.toFixed(3)} at this hue (${pct}%)`;
	}

	get hueMarkerStyle() {
		const oklch = this.oklch;
		if (!oklch) return htmlSafe('');
		return htmlSafe(
			`left: ${((oklch[2] / 360) * 100).toFixed(1)}%`,
		);
	}

	get planeMarkerStyle() {
		const oklch = this.oklch;
		if (!oklch) return htmlSafe('');
		const x = Math.min(100, (oklch[1] / CHROMA_RANGE) * 100);
		const y = (1 - oklch[0]) * 100;
		return htmlSafe(
			`left: ${x.toFixed(1)}%; top: ${y.toFixed(1)}%`,
		);
	}

	/**
	 * The OKLCH lightness–chroma slice at this colour's hue, transparent
	 * outside the sRGB gamut. One bisection per row keeps the repaint cheap.
	 */
	drawPlane = modifier(
		(canvas: HTMLCanvasElement, [hex]: [string | null]) => {
			const rgb = hex ? hexToRgb(hex) : null;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			if (!rgb) return;

			const [, , h] = rgbToOklch(...rgb);
			const { width, height } = canvas;
			const image = ctx.createImageData(width, height);
			for (let y = 0; y < height; y++) {
				const l = 1 - y / height;
				const cmax = maxOklchChroma(l, h);
				for (let x = 0; x < width; x++) {
					const c = (x / width) * CHROMA_RANGE;
					if (c > cmax) break;
					const [r, g, b] = oklabToRgb(
						...lchToLab(l, c, h),
					);
					const i = (y * width + x) * 4;
					image.data[i] = r;
					image.data[i + 1] = g;
					image.data[i + 2] = b;
					image.data[i + 3] = 255;
				}
			}
			ctx.putImageData(image, 0, 0);
		},
	);

	// ── Contrast ────────────────────────────────────────────────────────

	get contrastRows() {
		const rgb = this.rgb;
		if (!rgb) return [];
		const l = luminance(...rgb);
		return [
			{
				label: 'on white',
				chip: '#ffffff',
				ratio: contrastRatio(l, 1),
			},
			{
				label: 'on black',
				chip: '#000000',
				ratio: contrastRatio(l, 0),
			},
		].map(({ label, chip, ratio }) => ({
			label,
			chipStyle: htmlSafe(
				`background-color: ${chip}; color: ${this.hex}`,
			),
			ratio: `${ratio.toFixed(2)}:1`,
			aa: ratio >= 4.5,
			aaa: ratio >= 7,
			large: ratio >= 3,
		}));
	}

	// ── Derived swatch rows ─────────────────────────────────────────────

	get harmonyRows() {
		const rgb = this.rgb;
		if (!rgb) return [];
		const hsl = rgbToHsl(...rgb);
		return HARMONIES.map(([label, offsets]) => {
			const hexes = offsets.map((o) => rotateHue(hsl, o));
			return {
				label,
				swatches: hexes.map((hex) => ({
					hex,
					style: htmlSafe(
						`background-color: ${hex}`,
					),
				})),
				caption: hexes
					.slice(1)
					.map((hex) =>
						this.colourNotation.format(hex),
					)
					.join(' · '),
			};
		});
	}

	get tints() {
		return this.scale(255);
	}

	get shades() {
		return this.scale(0);
	}

	scale(to: number) {
		const rgb = this.rgb;
		if (!rgb) return [];
		return [
			this.hex!,
			...Array.from({ length: SCALE_STEPS }, (_, i) =>
				mixHex(rgb, to, (i + 1) / (SCALE_STEPS + 1)),
			),
		].map((hex) => ({
			hex,
			style: htmlSafe(`background-color: ${hex}`),
		}));
	}

	get visionRows() {
		const hex = this.hex;
		if (!hex) return [];
		return VISION_TYPES.map(([label, type]) => {
			const sim = simulateHex(hex, type)!;
			return {
				label,
				style: htmlSafe(`background-color: ${sim}`),
				value: this.colourNotation.format(sim),
			};
		});
	}

	// ── Open in ─────────────────────────────────────────────────────────

	get openIn() {
		return OPEN_IN;
	}

	get queryColour() {
		const hex = this.hex;
		return hex ? colourToQuery(hex) : '';
	}

	// ── Actions ─────────────────────────────────────────────────────────

	#syncUrl() {
		const hex = this.hex;
		if (!hex || typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('color', colourToQuery(hex));
		window.history.replaceState(null, '', url);
	}

	setValue = (event: Event) => {
		this.inputValue = (event.target as HTMLInputElement).value;
		this.#syncUrl();
	};

	pickColour = (event: Event) => {
		this.inputValue = (event.target as HTMLInputElement).value;
		this.#syncUrl();
	};

	copyRow = (value: string) => {
		void navigator.clipboard.writeText(value);
		this.copied = value;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	<template>
		<div class="dt-atlas">
			<div class="dt-atlas-input">
				<span class="dt-atlas-swatch">
					<span
						style={{this.swatchStyle}}
						aria-hidden="true"
					></span>
					<input
						type="color"
						value={{this.swatchHex}}
						aria-label="Pick colour"
						{{on "input" this.pickColour}}
					/>
				</span>
				<input
					type="text"
					class="dt-atlas-field"
					value={{this.inputValue}}
					placeholder={{DEFAULT_COLOUR}}
					aria-label="Colour value"
					{{on "input" this.setValue}}
				/>
				{{#if this.nearestName}}
					<span class="dt-atlas-name">nearest:
						{{this.nearestName}}</span>
				{{/if}}
			</div>

			{{#if this.hex}}
				<div class="dt-atlas-cols">
					<div class="dt-atlas-col">
						<span
							class="dt-atlas-title"
						>Notations</span>
						<div class="dt-atlas-table">
							{{#each
								this.notationRows
								key="id"
								as |row|
							}}
								<div
									class="dt-atlas-notation"
								>
									<span
										class="dt-atlas-notation-label"
									>{{row.label}}</span>
									<code
									>{{row.value}}</code>
									<button
										type="button"
										class="dt-atlas-copy"
										aria-label="Copy
											{{row.label}}"
										{{on
											"click"
											(fn
												this.copyRow
												row.value
											)
										}}
									>
										<Icon
											@name={{if
												row.isCopied
												"check"
												"copy"
											}}
										/>
									</button>
								</div>
							{{/each}}
						</div>
					</div>
					<div class="dt-atlas-col">
						<span
							class="dt-atlas-title"
						>Gamut</span>
						<div class="dt-atlas-hue">
							<span
								class="dt-atlas-marker"
								style={{this.hueMarkerStyle}}
							></span>
						</div>
						<div class="dt-atlas-plane">
							<canvas
								width="340"
								height="170"
								{{this.drawPlane
									this.hex
								}}
							></canvas>
							<span
								class="dt-atlas-marker"
								style={{this.planeMarkerStyle}}
							></span>
						</div>
						<span
							class="dt-atlas-caption"
						>{{this.gamutCaption}}</span>

						<span
							class="dt-atlas-title"
						>Contrast</span>
						{{#each
							this.contrastRows
							key="label"
							as |row|
						}}
							<div
								class="dt-atlas-contrast"
							>
								<span
									class="dt-atlas-chip"
									style={{row.chipStyle}}
								>Aa</span>
								<code
								>{{row.ratio}}
									{{row.label}}</code>
								<span
									class="dt-atlas-verdict"
								>AA
									{{if
										row.aa
										"✓"
										"✗"
									}}
									· AAA
									{{if
										row.aaa
										"✓"
										"✗"
									}}
									· large
									{{if
										row.large
										"✓"
										"✗"
									}}</span>
							</div>
						{{/each}}
					</div>
				</div>

				<div class="dt-atlas-section">
					<span
						class="dt-atlas-title"
					>Harmonies</span>
					{{#each
						this.harmonyRows key="label"
						as |row|
					}}
						<div class="dt-atlas-row">
							<span
								class="dt-atlas-row-label"
							>{{row.label}}</span>
							<span
								class="dt-atlas-swatches"
							>
								{{#each
									row.swatches
									key="hex"
									as |swatch|
								}}
									<i
										style={{swatch.style}}
										title={{swatch.hex}}
									></i>
								{{/each}}
							</span>
							<code
								class="dt-atlas-row-caption"
							>{{row.caption}}</code>
						</div>
					{{/each}}
				</div>

				<div class="dt-atlas-section is-flush">
					<span
						class="dt-atlas-title"
					>Tints</span>
					<div class="dt-atlas-strip">
						{{#each
							this.tints key="hex"
							as |cell|
						}}
							<i
								style={{cell.style}}
								title={{cell.hex}}
							></i>
						{{/each}}
					</div>
					<span
						class="dt-atlas-title"
					>Shades</span>
					<div class="dt-atlas-strip">
						{{#each
							this.shades key="hex"
							as |cell|
						}}
							<i
								style={{cell.style}}
								title={{cell.hex}}
							></i>
						{{/each}}
					</div>
				</div>

				<div class="dt-atlas-section">
					<span class="dt-atlas-title">Colour
						blindness</span>
					{{#each
						this.visionRows key="label"
						as |row|
					}}
						<div class="dt-atlas-row">
							<span
								class="dt-atlas-row-label"
							>{{row.label}}</span>
							<span
								class="dt-atlas-swatches"
							>
								<i
									style={{row.style}}
								></i>
							</span>
							<code
								class="dt-atlas-row-caption"
							>{{row.value}}</code>
						</div>
					{{/each}}
				</div>

				<div class="dt-atlas-open">
					{{#each this.openIn key="id" as |tool|}}
						<LinkTo
							@route="tools.tool"
							@model={{tool.id}}
							@query={{hash
								color=this.queryColour
							}}
						>
							<Icon
								@name={{tool.icon}}
							/>
							<span
							>{{tool.name}}</span>
						</LinkTo>
					{{/each}}
				</div>
			{{else}}
				{{! wording carried over from colour-converter }}
				<p class="dt-atlas-empty">Enter a valid colour
					value to see conversions</p>
			{{/if}}
		</div>
	</template>
}
