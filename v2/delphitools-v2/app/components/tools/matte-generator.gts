import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';

/** Six digits behind a #, the only form `<input type="color">` accepts. */
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The matte is redrawn at output resolution — up to 8192px wide — and
 * re-encoded to a data URL on every change, so a slider drag would otherwise
 * queue one full pass per input event.
 */
const RENDER_DEBOUNCE_MS = 120;

/** Longest edge of the live DOM preview, in CSS pixels. */
const MAX_PREVIEW = 280;

/** Radius of the blurred backdrop on the output canvas. */
const BACKDROP_BLUR_PX = 50;

/** Oversampling of the blurred backdrop, so its own edges stay off-canvas. */
const BACKDROP_OVERSCAN = 1.2;

/** How much darker the gradient's second stop is than its first. */
const GRADIENT_FALLOFF = -30;

const MIN_RATIO = 1;
const MAX_RATIO = 32;
const MIN_SIZE = 100;
const MAX_SIZE = 8192;

const LOAD_FAILED = 'Image could not be read. Try another file?';

export type MatteType = 'blur' | 'colour' | 'gradient';

export const RATIO_PRESETS = [
	{ label: '1:1', w: 1, h: 1, description: 'Square' },
	{ label: '4:5', w: 4, h: 5, description: 'Portrait' },
	{ label: '3:4', w: 3, h: 4, description: 'Photo' },
	{ label: '9:16', w: 9, h: 16, description: 'Stories' },
];

export const SIZE_PRESETS = [1080, 1200, 1440, 2048];

export const STYLE_OPTIONS: {
	type: MatteType;
	label: string;
	icon: string;
}[] = [
	{ type: 'blur', label: 'Blurred', icon: 'layers' },
	{ type: 'colour', label: 'Solid', icon: 'square' },
	{ type: 'gradient', label: 'Gradient', icon: 'blend' },
];

const PRESET_COLOURS = [
	'#ffffff',
	'#000000',
	'#f5f5f5',
	'#1a1a1a',
	'#fafafa',
	'#0a0a0a',
];

/** The presets that need dark text on the `+` cell. */
const LIGHT_COLOURS = ['#ffffff', '#f5f5f5', '#fafafa'];

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Size {
	x: number;
	y: number;
}

/** Canvas size for one output width at one aspect ratio. */
export function outputDimensions(
	outputSize: number,
	ratioW: number,
	ratioH: number,
): Size {
	return {
		width: outputSize,
		height: Math.round((outputSize * ratioH) / ratioW),
	};
}

/** The same shape, scaled so its longer edge is `max` CSS pixels. */
export function previewSize(max: number, ratioW: number, ratioH: number): Size {
	const longer = Math.max(ratioW, ratioH);
	return {
		width: Math.round((max * ratioW) / longer),
		height: Math.round((max * ratioH) / longer),
	};
}

/** The source image scaled to fit inside the matte, centred, inset by `padding`. */
export function fitInside(
	imageWidth: number,
	imageHeight: number,
	box: Size,
	padding: number,
): Rect {
	const scale = Math.min(
		(box.width - padding * 2) / imageWidth,
		(box.height - padding * 2) / imageHeight,
	);
	const width = imageWidth * scale;
	const height = imageHeight * scale;
	return {
		x: (box.width - width) / 2,
		y: (box.height - height) / 2,
		width,
		height,
	};
}

/** The source image scaled to cover the matte with overscan, centred. */
export function coverRect(
	imageWidth: number,
	imageHeight: number,
	box: Size,
	overscan: number,
): Rect {
	const scale =
		Math.max(box.width / imageWidth, box.height / imageHeight) *
		overscan;
	const width = imageWidth * scale;
	const height = imageHeight * scale;
	return {
		x: (box.width - width) / 2,
		y: (box.height - height) / 2,
		width,
		height,
	};
}

export function adjustBrightness(colour: Rgb, amount: number): Rgb {
	const clamp = (value: number) =>
		Math.max(0, Math.min(255, value + amount));
	return {
		r: clamp(colour.r),
		g: clamp(colour.g),
		b: clamp(colour.b),
	};
}

export function rgbCss(colour: Rgb): string {
	return `rgb(${colour.r}, ${colour.g}, ${colour.b})`;
}

/**
 * Whole-image average, taken by letting the canvas downscale to a single
 * pixel. Null when the 2d context is unavailable.
 */
function averageColour(image: HTMLImageElement): Rgb | null {
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.drawImage(image, 0, 0, 1, 1);
	const data = ctx.getImageData(0, 0, 1, 1).data;
	// A 1×1 buffer always has its four bytes.
	return { r: data[0]!, g: data[1]!, b: data[2]! };
}

function clampInt(value: string, min: number, max: number): number {
	return Math.max(min, Math.min(max, parseInt(value, 10) || min));
}

export default class MatteGeneratorTool extends Component {
	@tracked sourceImage: string | null = null;
	@tracked fileName = '';
	@tracked imageWidth = 0;
	@tracked imageHeight = 0;
	@tracked matteType: MatteType = 'blur';
	@tracked matteColour = '#ffffff';
	@tracked outputSize = 1080;
	@tracked customSize = '';
	@tracked ratioW = 1;
	@tracked ratioH = 1;
	@tracked customRatio = false;
	@tracked padding = 40;
	@tracked resultImage: string | null = null;
	@tracked loadFailed = false;
	@tracked dominant: Rgb = { r: 136, g: 136, b: 136 };

	#image: HTMLImageElement | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		if (this.#timer) clearTimeout(this.#timer);
	}

	get output(): Size {
		return outputDimensions(
			this.outputSize,
			this.ratioW,
			this.ratioH,
		);
	}

	get preview(): Size {
		return previewSize(MAX_PREVIEW, this.ratioW, this.ratioH);
	}

	get isSquare() {
		return this.ratioW === this.ratioH;
	}

	get swapTitle() {
		// wording carried over from the Next app
		return this.isSquare
			? 'Square — nothing to rotate'
			: `Rotate to ${this.ratioH}:${this.ratioW}`;
	}

	get styles() {
		return STYLE_OPTIONS.map((option) => ({
			...option,
			isActive: option.type === this.matteType,
		}));
	}

	get ratios() {
		return RATIO_PRESETS.map((preset) => ({
			...preset,
			isActive:
				!this.customRatio &&
				this.ratioW === preset.w &&
				this.ratioH === preset.h,
		}));
	}

	get sizes() {
		return SIZE_PRESETS.map((size) => ({
			size,
			isActive: this.outputSize === size && !this.customSize,
		}));
	}

	/** `<input type="color">` resets itself on a value it cannot parse. */
	get pickerValue() {
		return HEX.test(this.matteColour)
			? this.matteColour
			: '#ffffff';
	}

	get swatches() {
		return PRESET_COLOURS.map((colour) => ({
			colour,
			// Every entry is a literal from PRESET_COLOURS.
			style: htmlSafe(`background-color: ${colour}`),
			isActive: colour === this.matteColour,
		}));
	}

	get customSwatchStyle() {
		const ink = LIGHT_COLOURS.includes(this.pickerValue)
			? '#000000'
			: '#ffffff';
		return htmlSafe(
			`background-color: ${this.pickerValue}; color: ${ink}`,
		);
	}

	/** Background of the live preview box: solid, gradient, or the blurred image. */
	get previewStyle() {
		const { width, height } = this.preview;
		let background = '';

		if (this.matteType === 'colour') {
			background = `background: ${this.pickerValue};`;
		} else if (this.matteType === 'gradient') {
			const from = rgbCss(this.dominant);
			const to = rgbCss(
				adjustBrightness(
					this.dominant,
					GRADIENT_FALLOFF,
				),
			);
			background = `background: linear-gradient(135deg, ${from}, ${to});`;
		}

		// Both dimensions are arithmetic on the ratio inputs, which are clamped
		// integers, and the colours are a validated hex or numeric rgb().
		return htmlSafe(
			`width: ${width}px; height: ${height}px; ${background}`,
		);
	}

	get previewInsetStyle() {
		const inset =
			(this.padding / this.outputSize) * this.preview.width;
		return htmlSafe(`padding: ${inset}px`);
	}

	readFile = (file: File) => {
		this.fileName = file.name.replace(/\.[^.]+$/, '');
		this.loadFailed = false;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const image = new Image();
			image.onload = () => {
				if (this.#destroyed) return;
				this.#image = image;
				this.imageWidth = image.width;
				this.imageHeight = image.height;
				this.sourceImage = dataUrl;
				this.resultImage = null;
				this.dominant =
					averageColour(image) ?? this.dominant;
				this.queueRender();
			};
			// The Next version dropped a failed decode on the floor: the drop
			// zone stayed up with no file name and no reason given.
			image.onerror = this.fail;
			image.src = dataUrl;
		};
		reader.onerror = this.fail;
		reader.readAsDataURL(file);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) this.readFile(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	fail = () => {
		if (this.#destroyed) return;
		this.#image = null;
		this.sourceImage = null;
		this.fileName = '';
		this.imageWidth = 0;
		this.imageHeight = 0;
		this.resultImage = null;
		this.loadFailed = true;
	};

	clear = () => {
		this.#image = null;
		this.sourceImage = null;
		this.fileName = '';
		this.imageWidth = 0;
		this.imageHeight = 0;
		this.resultImage = null;
		this.loadFailed = false;
	};

	setMatteType = (type: MatteType) => {
		this.matteType = type;
		this.queueRender();
	};

	setMatteColour = (colour: string) => {
		this.matteColour = colour;
		this.queueRender();
	};

	pickMatteColour = (event: Event) => {
		this.setMatteColour((event.target as HTMLInputElement).value);
	};

	selectRatio = (w: number, h: number) => {
		this.ratioW = w;
		this.ratioH = h;
		this.customRatio = false;
		this.queueRender();
	};

	enableCustomRatio = () => {
		this.customRatio = true;
		this.queueRender();
	};

	swapRatio = () => {
		const w = this.ratioW;
		this.ratioW = this.ratioH;
		this.ratioH = w;
		this.queueRender();
	};

	setRatioW = (event: Event) => {
		this.ratioW = clampInt(
			(event.target as HTMLInputElement).value,
			MIN_RATIO,
			MAX_RATIO,
		);
		this.queueRender();
	};

	setRatioH = (event: Event) => {
		this.ratioH = clampInt(
			(event.target as HTMLInputElement).value,
			MIN_RATIO,
			MAX_RATIO,
		);
		this.queueRender();
	};

	selectSize = (size: number) => {
		this.outputSize = size;
		this.customSize = '';
		this.queueRender();
	};

	setCustomSize = (event: Event) => {
		const raw = (event.target as HTMLInputElement).value;
		this.customSize = raw;
		const value = parseInt(raw, 10);
		if (value >= MIN_SIZE && value <= MAX_SIZE) {
			this.outputSize = value;
			this.queueRender();
		}
	};

	setPadding = (event: Event) => {
		this.padding = Number((event.target as HTMLInputElement).value);
		this.queueRender();
	};

	queueRender = () => {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(this.render, RENDER_DEBOUNCE_MS);
	};

	render = () => {
		const image = this.#image;
		if (this.#destroyed || !image) return;

		const box = this.output;
		const canvas = document.createElement('canvas');
		canvas.width = box.width;
		canvas.height = box.height;

		const ctx = canvas.getContext('2d');
		if (!ctx) return this.fail();

		this.#drawMatte(ctx, image, box);

		const fit = fitInside(
			image.width,
			image.height,
			box,
			this.padding,
		);
		ctx.drawImage(image, fit.x, fit.y, fit.width, fit.height);

		this.resultImage = canvas.toDataURL('image/png');
	};

	#drawMatte(
		ctx: CanvasRenderingContext2D,
		image: HTMLImageElement,
		box: Size,
	) {
		if (this.matteType === 'colour') {
			ctx.fillStyle = this.pickerValue;
			ctx.fillRect(0, 0, box.width, box.height);
			return;
		}

		if (this.matteType === 'gradient') {
			const gradient = ctx.createLinearGradient(
				0,
				0,
				box.width,
				box.height,
			);
			gradient.addColorStop(0, rgbCss(this.dominant));
			gradient.addColorStop(
				1,
				rgbCss(
					adjustBrightness(
						this.dominant,
						GRADIENT_FALLOFF,
					),
				),
			);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, box.width, box.height);
			return;
		}

		ctx.filter = `blur(${BACKDROP_BLUR_PX}px)`;
		const cover = coverRect(
			image.width,
			image.height,
			box,
			BACKDROP_OVERSCAN,
		);
		ctx.drawImage(
			image,
			cover.x,
			cover.y,
			cover.width,
			cover.height,
		);
		ctx.filter = 'none';
	}

	download = () => {
		if (!this.resultImage) return;
		const { width, height } = this.output;
		const link = document.createElement('a');
		link.download = `${this.fileName}-matte-${width}x${height}.png`;
		link.href = this.resultImage;
		link.click();
	};

	<template>
		<div
			class="dt-matte"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-matte-frame">
				{{#if this.sourceImage}}
					<div class="dt-matte-bar">
						<span class="dt-matte-source">
							<Icon @name="image" />
							<span
								class="dt-matte-name"
							>{{this.fileName}}</span>
							<span
								class="dt-matte-dims"
							>{{this.imageWidth}}
								×
								{{this.imageHeight}}</span>
						</span>
						<button
							type="button"
							class="dt-matte-bar-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>

					<div class="dt-matte-columns">
						<div class="dt-matte-controls">
							<div
								class="dt-matte-section"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-matte-label"
								>Style</span>
								<div
									class="segmented dt-matte-styles"
								>
									{{#each
										this.styles
										key="type"
										as |option|
									}}
										<button
											type="button"
											class="dt-matte-choice
												{{if
													option.isActive
													'is-active'
												}}"
											{{on
												"click"
												(fn
													this.setMatteType
													option.type
												)
											}}
										>
											<Icon
												@name={{option.icon}}
											/>
											{{option.label}}
										</button>
									{{/each}}
								</div>
							</div>

							{{#if
								(eq
									this.matteType
									"colour"
								)
							}}
								<div
									class="dt-matte-section"
								>
									{{! wording carried over from the Next app }}
									<span
										class="dt-matte-label"
									>Matte
										Colour</span>
									<div
										class="dt-matte-swatches"
									>
										{{#each
											this.swatches
											key="colour"
											as |swatch|
										}}
											<button
												type="button"
												class="dt-matte-swatch
													{{if
														swatch.isActive
														'is-active'
													}}"
												style={{swatch.style}}
												title={{swatch.colour}}
												aria-label={{swatch.colour}}
												{{on
													"click"
													(fn
														this.setMatteColour
														swatch.colour
													)
												}}
											></button>
										{{/each}}
										<span
											class="dt-matte-custom"
											style={{this.customSwatchStyle}}
										>
											+
											<input
												type="color"
												value={{this.pickerValue}}
												aria-label="Custom colour"
												{{on
													"input"
													this.pickMatteColour
												}}
											/>
										</span>
									</div>
									{{! wording carried over from the Next app }}
									<p
										class="dt-matte-hint"
									>Click
										the
										coloured
										cells
										to
										select,
										or
										the
										last
										cell
										to
										pick
										a
										custom
										colour.</p>
								</div>
							{{/if}}

							<div
								class="dt-matte-section"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-matte-label"
								>Aspect Ratio</span>
								<div
									class="segmented dt-matte-ratios"
								>
									{{#each
										this.ratios
										key="label"
										as |preset|
									}}
										<button
											type="button"
											class="dt-matte-choice
												{{if
													preset.isActive
													'is-active'
												}}"
											title={{preset.description}}
											{{on
												"click"
												(fn
													this.selectRatio
													preset.w
													preset.h
												)
											}}
										>{{preset.label}}</button>
									{{/each}}
									<button
										type="button"
										class="dt-matte-choice
											{{if
												this.customRatio
												'is-active'
											}}"
										{{on
											"click"
											this.enableCustomRatio
										}}
									>Custom</button>
								</div>
								<div
									class="dt-matte-row"
								>
									<button
										type="button"
										class="dt-matte-swap"
										disabled={{this.isSquare}}
										title={{this.swapTitle}}
										aria-label="Rotate matte orientation"
										{{on
											"click"
											this.swapRatio
										}}
									>
										<Icon
											@name="refresh-cw"
										/>
										Swap
									</button>
									{{#if
										this.customRatio
									}}
										<span
											class="dt-matte-pair"
										>
											<input
												type="number"
												class="dt-matte-number"
												min="1"
												max="32"
												aria-label="Ratio width"
												value={{this.ratioW}}
												{{on
													"input"
													this.setRatioW
												}}
											/>
											<span
												class="dt-matte-colon"
											>:</span>
											<input
												type="number"
												class="dt-matte-number"
												min="1"
												max="32"
												aria-label="Ratio height"
												value={{this.ratioH}}
												{{on
													"input"
													this.setRatioH
												}}
											/>
										</span>
									{{/if}}
								</div>
							</div>

							<div
								class="dt-matte-section"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-matte-label"
								>Output Width</span>
								<div
									class="segmented dt-matte-sizes"
								>
									{{#each
										this.sizes
										key="size"
										as |entry|
									}}
										<button
											type="button"
											class="dt-matte-choice
												{{if
													entry.isActive
													'is-active'
												}}"
											{{on
												"click"
												(fn
													this.selectSize
													entry.size
												)
											}}
										>{{entry.size}}px</button>
									{{/each}}
								</div>
								<div
									class="dt-matte-row"
								>
									{{! wording carried over from the Next app }}
									<input
										type="number"
										class="dt-matte-number is-wide"
										min="100"
										max="8192"
										placeholder="Custom px…"
										aria-label="Custom output width"
										value={{this.customSize}}
										{{on
											"input"
											this.setCustomSize
										}}
									/>
								</div>
							</div>

							<div
								class="dt-matte-section is-last"
							>
								<div
									class="dt-matte-head"
								>
									{{! wording carried over from the Next app }}
									<label
										for="dt-matte-padding"
									>Padding</label>
									<span
										class="dt-matte-readout"
									>{{this.padding}}px</span>
								</div>
								<input
									id="dt-matte-padding"
									type="range"
									class="dt-matte-slider"
									min="0"
									max="200"
									step="10"
									value={{this.padding}}
									{{on
										"input"
										this.setPadding
									}}
								/>
							</div>
						</div>

						<div class="dt-matte-side">
							{{! wording carried over from the Next app }}
							<span
								class="dt-matte-label"
							>Preview</span>
							<div
								class="dt-matte-stage"
							>
								<div
									class="dt-matte-box"
									style={{this.previewStyle}}
								>
									{{#if
										(eq
											this.matteType
											"blur"
										)
									}}
										<img
											class="dt-matte-backdrop"
											src={{this.sourceImage}}
											alt=""
										/>
									{{/if}}
									<div
										class="dt-matte-inset"
										style={{this.previewInsetStyle}}
									>
										<img
											src={{this.sourceImage}}
											alt="Preview"
										/>
									</div>
								</div>
							</div>
							<p
								class="dt-matte-readout is-centred"
							>{{this.output.width}}
								×
								{{this.output.height}}
								px</p>
						</div>
					</div>

					{{#if this.resultImage}}
						<button
							type="button"
							class="dt-matte-run"
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name="download"
							/>
							{{! wording carried over from the Next app }}
							Download
							{{this.output.width}}
							×
							{{this.output.height}}
						</button>
					{{/if}}
				{{else}}
					<label
						class="dt-matte-drop"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
					>
						<input
							type="file"
							accept="image/*"
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						{{! wording carried over from the Next app }}
						<span
							class="dt-matte-drop-title"
						>Drop image here</span>
						{{! wording carried over from the Next app }}
						<span
							class="dt-matte-drop-hint"
						>or click to select, or paste</span>
					</label>
				{{/if}}

				{{#if this.loadFailed}}
					<p
						class="dt-matte-error"
						role="alert"
					>{{LOAD_FAILED}}</p>
				{{/if}}
			</div>
		</div>
	</template>
}
