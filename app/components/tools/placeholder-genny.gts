import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadText, downloadUrl } from 'delphitools-v2/lib/download';

export type PlaceholderFormat = 'png' | 'svg';

export interface PlaceholderSpec {
	width: number;
	height: number;
	background: string;
	foreground: string;
	text: string;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_BACKGROUND = '#e2e2e2';
const DEFAULT_FOREGROUND = '#666666';

/** The `max` the Next app put on both number inputs. */
const MAX_DIMENSION = 4096;

const COPIED_MS = 1500;

const PRESETS = [
	{ label: 'HD', width: 1920, height: 1080 },
	{ label: 'Square', width: 1000, height: 1000 },
	{ label: 'Banner', width: 1200, height: 400 },
	{ label: 'Thumb', width: 300, height: 200 },
	{ label: 'Social', width: 1200, height: 630 },
	{ label: 'Avatar', width: 400, height: 400 },
];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColour(value: string): boolean {
	return HEX.test(value.trim());
}

/**
 * The Next app fed the raw field straight to the canvas and into the SVG, so a
 * half-typed hex painted black and an unbalanced quote broke the markup.
 *
 * Shorthand is expanded because `<input type="color">` rejects anything but the
 * six-digit form and silently falls back to black.
 */
export function safeColour(value: string, fallback: string): string {
	const hex = value.trim();
	if (!isHexColour(hex)) return fallback;
	if (hex.length === 7) return hex;
	return `#${hex
		.slice(1)
		.split('')
		.map((c) => c + c)
		.join('')}`;
}

/**
 * The Next app took `parseInt(value) || 800` and left the result unclamped, so
 * typing 99999 asked for a 99999px canvas that most browsers refuse to allocate.
 */
export function parseSize(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, MAX_DIMENSION);
}

/** An eighth of the shorter side, matching the Next app. */
export function placeholderFontSize(width: number, height: number): number {
	return Math.min(width, height) / 8;
}

export function placeholderLabel(
	text: string,
	width: number,
	height: number,
): string {
	return text || `${width} × ${height}`;
}

/** XML text and attribute escaping; the Next app interpolated raw. */
export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export function placeholderSvg(spec: PlaceholderSpec): string {
	const { width, height, background, foreground } = spec;
	const fontSize = placeholderFontSize(width, height);
	const label = escapeXml(placeholderLabel(spec.text, width, height));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect fill="${escapeXml(background)}" width="${width}" height="${height}"/>
  <text fill="${escapeXml(foreground)}" font-family="monospace" font-size="${fontSize}" font-weight="bold" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;
}

/**
 * btoa() throws on any code point above U+00FF, so the Next app's `btoa(svg)`
 * failed outright for custom text with an em dash or a CJK glyph.
 */
export function base64Utf8(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function drawPlaceholder(
	canvas: HTMLCanvasElement,
	spec: PlaceholderSpec,
): void {
	const { width, height } = spec;
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	ctx.fillStyle = spec.background;
	ctx.fillRect(0, 0, width, height);

	ctx.fillStyle = spec.foreground;
	ctx.font = `bold ${placeholderFontSize(width, height)}px monospace`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		placeholderLabel(spec.text, width, height),
		width / 2,
		height / 2,
	);
}

export default class PlaceholderGennyTool extends Component {
	@tracked widthInput = String(DEFAULT_WIDTH);
	@tracked heightInput = String(DEFAULT_HEIGHT);
	@tracked backgroundInput = DEFAULT_BACKGROUND;
	@tracked foregroundInput = DEFAULT_FOREGROUND;
	@tracked text = '';
	@tracked format: PlaceholderFormat = 'png';
	@tracked copied = false;

	#canvas: HTMLCanvasElement | null = null;
	#timers: ReturnType<typeof setTimeout>[] = [];

	willDestroy() {
		super.willDestroy();
		this.#timers.forEach(clearTimeout);
	}

	get presets() {
		return PRESETS;
	}

	get width() {
		return parseSize(this.widthInput, DEFAULT_WIDTH);
	}

	get height() {
		return parseSize(this.heightInput, DEFAULT_HEIGHT);
	}

	get background() {
		return safeColour(this.backgroundInput, DEFAULT_BACKGROUND);
	}

	get foreground() {
		return safeColour(this.foregroundInput, DEFAULT_FOREGROUND);
	}

	get spec(): PlaceholderSpec {
		return {
			width: this.width,
			height: this.height,
			background: this.background,
			foreground: this.foreground,
			text: this.text,
		};
	}

	get placeholderLabel() {
		return placeholderLabel('', this.width, this.height);
	}

	get isPng() {
		return this.format === 'png';
	}

	get formatLabel() {
		return this.format.toUpperCase();
	}

	get baseName() {
		return `placeholder-${this.width}x${this.height}`;
	}

	/** safeColour has already rejected anything that is not a hex literal. */
	get backgroundStyle() {
		return htmlSafe(`background-color: ${this.background}`);
	}

	get foregroundStyle() {
		return htmlSafe(`background-color: ${this.foreground}`);
	}

	/**
	 * Repaints whenever anything the drawing reads changes — the modifier body
	 * consumes the same tracked state, so no dependency list is needed.
	 */
	paint = modifier((element: HTMLCanvasElement) => {
		this.#canvas = element;
		drawPlaceholder(element, this.spec);
		return () => {
			if (this.#canvas === element) this.#canvas = null;
		};
	});

	setWidth = (event: Event) => {
		this.widthInput = (event.target as HTMLInputElement).value;
	};

	setHeight = (event: Event) => {
		this.heightInput = (event.target as HTMLInputElement).value;
	};

	setBackground = (event: Event) => {
		this.backgroundInput = (event.target as HTMLInputElement).value;
	};

	setForeground = (event: Event) => {
		this.foregroundInput = (event.target as HTMLInputElement).value;
	};

	setText = (event: Event) => {
		this.text = (event.target as HTMLInputElement).value;
	};

	setFormat = (format: PlaceholderFormat) => {
		this.format = format;
	};

	applyPreset = (preset: { width: number; height: number }) => {
		this.widthInput = String(preset.width);
		this.heightInput = String(preset.height);
	};

	get svg() {
		return placeholderSvg(this.spec);
	}

	get dataUrl() {
		if (!this.isPng)
			return `data:image/svg+xml;base64,${base64Utf8(this.svg)}`;
		return this.#canvas?.toDataURL('image/png') ?? '';
	}

	download = () => {
		if (this.isPng) {
			const url = this.#canvas?.toDataURL('image/png');
			if (url) downloadUrl(url, `${this.baseName}.png`);
			return;
		}

		downloadText(this.svg, `${this.baseName}.svg`, 'image/svg+xml');
	};

	copyUrl = () => void this.copy();

	async copy() {
		const url = this.dataUrl;
		if (!url) return;
		await navigator.clipboard.writeText(url);
		this.copied = true;
		this.#timers.push(
			setTimeout(() => (this.copied = false), COPIED_MS),
		);
	}

	<template>
		<div class="dt-ph">
			<div class="dt-ph-dims">
				<div class="dt-ph-fields">
					<div class="dt-ph-field">
						<label
							class="dt-ph-label"
							for="dt-ph-width"
						>Width</label>
						<span class="dt-ph-entry">
							<input
								id="dt-ph-width"
								type="number"
								min="1"
								max={{MAX_DIMENSION}}
								value={{this.widthInput}}
								{{on
									"input"
									this.setWidth
								}}
							/>
							<span
								class="dt-ph-unit"
							>px</span>
						</span>
					</div>
					<div class="dt-ph-field">
						<label
							class="dt-ph-label"
							for="dt-ph-height"
						>Height</label>
						<span class="dt-ph-entry">
							<input
								id="dt-ph-height"
								type="number"
								min="1"
								max={{MAX_DIMENSION}}
								value={{this.heightInput}}
								{{on
									"input"
									this.setHeight
								}}
							/>
							<span
								class="dt-ph-unit"
							>px</span>
						</span>
					</div>
				</div>

				<div class="segmented dt-ph-presets">
					{{#each
						this.presets key="label"
						as |preset|
					}}
						<button
							type="button"
							class="dt-ph-preset"
							{{on
								"click"
								(fn
									this.applyPreset
									preset
								)
							}}
						>
							<span
								class="dt-ph-preset-name"
							>{{preset.label}}</span>
							<span
								class="dt-ph-preset-size"
							>{{preset.width}}×{{preset.height}}</span>
						</button>
					{{/each}}
				</div>
			</div>

			<div class="dt-ph-colours">
				<div class="dt-ph-heading">
					<span class="dt-ph-label">Colours</span>
				</div>

				<div class="dt-ph-colour">
					<span
						class="dt-ph-colour-name"
					>Background</span>
					<span class="dt-ph-swatch">
						<span
							style={{this.backgroundStyle}}
							aria-hidden="true"
						></span>
						<input
							type="color"
							aria-label="Background colour"
							value={{this.background}}
							{{on
								"input"
								this.setBackground
							}}
						/>
					</span>
					<input
						type="text"
						class="dt-ph-hex"
						aria-label="Background hex"
						value={{this.backgroundInput}}
						{{on
							"input"
							this.setBackground
						}}
					/>
				</div>

				<div class="dt-ph-colour">
					<span
						class="dt-ph-colour-name"
					>Text</span>
					<span class="dt-ph-swatch">
						<span
							style={{this.foregroundStyle}}
							aria-hidden="true"
						></span>
						<input
							type="color"
							aria-label="Text colour"
							value={{this.foreground}}
							{{on
								"input"
								this.setForeground
							}}
						/>
					</span>
					<input
						type="text"
						class="dt-ph-hex"
						aria-label="Text hex"
						value={{this.foregroundInput}}
						{{on
							"input"
							this.setForeground
						}}
					/>
				</div>
			</div>

			<div class="dt-ph-text">
				{{! wording carried over from the Next app }}
				<label
					class="dt-ph-label"
					for="dt-ph-custom"
				>Custom Text
					<span
						class="dt-ph-optional"
					>(optional)</span></label>
				<input
					id="dt-ph-custom"
					type="text"
					class="dt-ph-custom"
					placeholder={{this.placeholderLabel}}
					value={{this.text}}
					{{on "input" this.setText}}
				/>
			</div>

			<div class="dt-ph-preview">
				<div class="dt-ph-heading">
					<span class="dt-ph-label">Preview</span>
				</div>
				<div class="dt-ph-stage">
					<canvas
						class="dt-ph-canvas"
						{{this.paint}}
					></canvas>
				</div>
			</div>

			<div class="segmented dt-ph-formats">
				<button
					type="button"
					class="dt-ph-format
						{{if this.isPng 'is-active'}}"
					{{on "click" (fn this.setFormat "png")}}
				>PNG</button>
				<button
					type="button"
					class="dt-ph-format
						{{unless
							this.isPng
							'is-active'
						}}"
					{{on "click" (fn this.setFormat "svg")}}
				>SVG</button>
			</div>

			<div class="dt-ph-actions">
				<button
					type="button"
					class="dt-ph-download"
					{{on "click" this.download}}
				>
					<DownloadLabel
						@label="Download {{this.formatLabel}}"
					/>
				</button>
				<button
					type="button"
					class="dt-ph-copy"
					{{on "click" this.copyUrl}}
				>
					<Icon
						@name={{if
							this.copied
							"check"
							"copy"
						}}
					/>
					{{if this.copied "Copied!" "Copy URL"}}
				</button>
			</div>
		</div>
	</template>
}
