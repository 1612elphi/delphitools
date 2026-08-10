import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';

/**
 * The base image is redrawn at full resolution and re-encoded to a data URL on
 * every slider step, so a drag would otherwise queue one full pass per input
 * event.
 */
const RENDER_DEBOUNCE_MS = 120;

const LOAD_FAILED = 'Image could not be read. Try another file?';

export type Position =
	'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'random';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

/**
 * Canvas has no `normal` composite operation. The Next app assigned the raw
 * mode name and relied on the spec's "ignore an unparseable value", which left
 * the default in place; this states the default instead.
 */
const COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
	normal: 'source-over',
	multiply: 'multiply',
	screen: 'screen',
	overlay: 'overlay',
};

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
	{ id: 'normal', label: 'Normal' },
	{ id: 'multiply', label: 'Multiply' },
	{ id: 'screen', label: 'Screen' },
	{ id: 'overlay', label: 'Overlay' },
];

/** The arrows are the Next app's labels; `name` is for screen readers. */
export const POSITIONS: { id: Position; label: string; name: string }[] = [
	{ id: 'tl', label: '↖', name: 'Top left' },
	{ id: 'tc', label: '↑', name: 'Top centre' },
	{ id: 'tr', label: '↗', name: 'Top right' },
	{ id: 'ml', label: '←', name: 'Middle left' },
	{ id: 'mc', label: '•', name: 'Centre' },
	{ id: 'mr', label: '→', name: 'Middle right' },
	{ id: 'bl', label: '↙', name: 'Bottom left' },
	{ id: 'bc', label: '↓', name: 'Bottom centre' },
	{ id: 'br', label: '↘', name: 'Bottom right' },
];

export interface Placement {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PlacementOptions {
	position: Position;
	/** Watermark width as a percentage of the base width. */
	scale: number;
	/** Inset from each edge as a percentage of the base dimension. */
	padding: number;
	/** Fractions in 0–1, used only when position is `random`. */
	random: { x: number; y: number };
}

/**
 * Where the watermark lands on the base image, in base-image pixels. The
 * watermark keeps its own aspect ratio; only its width is driven by `scale`.
 */
export function watermarkPlacement(
	baseWidth: number,
	baseHeight: number,
	markWidth: number,
	markHeight: number,
	options: PlacementOptions,
): Placement {
	const width = (baseWidth * options.scale) / 100;
	const height = (markHeight / markWidth) * width;

	const padX = (baseWidth * options.padding) / 100;
	const padY = (baseHeight * options.padding) / 100;

	if (options.position === 'random') {
		return {
			x:
				padX +
				options.random.x *
					(baseWidth - width - padX * 2),
			y:
				padY +
				options.random.y *
					(baseHeight - height - padY * 2),
			width,
			height,
		};
	}

	const row = options.position[0];
	const col = options.position[1];

	let x = 0;
	if (col === 'l') x = padX;
	else if (col === 'c') x = (baseWidth - width) / 2;
	else if (col === 'r') x = baseWidth - width - padX;

	let y = 0;
	if (row === 't') y = padY;
	else if (row === 'm') y = (baseHeight - height) / 2;
	else if (row === 'b') y = baseHeight - height - padY;

	return { x, y, width, height };
}

function readNumber(event: Event): number {
	return Number((event.target as HTMLInputElement).value);
}

export default class WatermarkerTool extends Component {
	@tracked baseUrl: string | null = null;
	@tracked markUrl: string | null = null;
	@tracked baseFileName = '';
	@tracked baseWidth = 0;
	@tracked baseHeight = 0;
	@tracked markWidth = 0;
	@tracked markHeight = 0;
	@tracked position: Position = 'br';
	@tracked opacity = 50;
	@tracked scale = 20;
	@tracked padding = 5;
	@tracked blendMode: BlendMode = 'normal';
	@tracked resultImage: string | null = null;
	@tracked loadFailed = false;

	#randomX = 0;
	#randomY = 0;
	#baseImage: HTMLImageElement | null = null;
	#markImage: HTMLImageElement | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		if (this.#timer) clearTimeout(this.#timer);
	}

	get bothLoaded() {
		return !!this.baseUrl && !!this.markUrl;
	}

	get isRandom() {
		return this.position === 'random';
	}

	get noResult() {
		return this.resultImage === null;
	}

	get positions() {
		return POSITIONS.map((entry) => ({
			...entry,
			isActive: entry.id === this.position,
		}));
	}

	get blendModes() {
		return BLEND_MODES.map((mode) => ({
			...mode,
			isActive: mode.id === this.blendMode,
		}));
	}

	/**
	 * Decodes into an `Image` up front, so the render pass is synchronous and
	 * a slider drag does not re-decode both files per frame.
	 */
	#load(
		file: File,
		onReady: (image: HTMLImageElement, url: string) => void,
	) {
		this.loadFailed = false;
		const reader = new FileReader();
		reader.onload = () => {
			const url = reader.result as string;
			const image = new Image();
			image.onload = () => {
				if (this.#destroyed) return;
				onReady(image, url);
				this.queueRender();
			};
			// The Next version left a failed decode silent: the drop zone stayed
			// up and no preview ever appeared.
			image.onerror = this.fail;
			image.src = url;
		};
		reader.onerror = this.fail;
		reader.readAsDataURL(file);
	}

	readBase = (file: File) => {
		this.baseFileName = file.name.replace(/\.[^.]+$/, '');
		this.#load(file, (image, url) => {
			this.#baseImage = image;
			this.baseWidth = image.width;
			this.baseHeight = image.height;
			this.baseUrl = url;
			this.resultImage = null;
		});
	};

	readMark = (file: File) => {
		this.#load(file, (image, url) => {
			this.#markImage = image;
			this.markWidth = image.width;
			this.markHeight = image.height;
			this.markUrl = url;
			this.resultImage = null;
		});
	};

	/** A paste fills the empty slot: base first, watermark once that is set. */
	readPasted = (file: File) => {
		if (this.baseUrl) this.readMark(file);
		else this.readBase(file);
	};

	selectBase = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readBase(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	selectMark = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readMark(file);
		input.value = '';
	};

	dropBase = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) this.readBase(file);
	};

	dropMark = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) this.readMark(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	fail = () => {
		if (this.#destroyed) return;
		this.resultImage = null;
		this.loadFailed = true;
	};

	clearBase = () => {
		this.#baseImage = null;
		this.baseUrl = null;
		this.baseWidth = 0;
		this.baseHeight = 0;
		this.resultImage = null;
	};

	clearMark = () => {
		this.#markImage = null;
		this.markUrl = null;
		this.markWidth = 0;
		this.markHeight = 0;
		this.resultImage = null;
	};

	clear = () => {
		this.clearBase();
		this.clearMark();
		this.baseFileName = '';
		this.loadFailed = false;
	};

	setPosition = (position: Position) => {
		this.position = position;
		this.queueRender();
	};

	randomise = () => {
		this.position = 'random';
		this.#randomX = Math.random();
		this.#randomY = Math.random();
		this.queueRender();
	};

	setOpacity = (event: Event) => {
		this.opacity = readNumber(event);
		this.queueRender();
	};

	setScale = (event: Event) => {
		this.scale = readNumber(event);
		this.queueRender();
	};

	setPadding = (event: Event) => {
		this.padding = readNumber(event);
		this.queueRender();
	};

	setBlendMode = (mode: BlendMode) => {
		this.blendMode = mode;
		this.queueRender();
	};

	queueRender = () => {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(this.render, RENDER_DEBOUNCE_MS);
	};

	render = () => {
		const base = this.#baseImage;
		const mark = this.#markImage;
		if (this.#destroyed || !base || !mark) return;

		const canvas = document.createElement('canvas');
		canvas.width = base.width;
		canvas.height = base.height;

		const ctx = canvas.getContext('2d');
		if (!ctx) return this.fail();

		ctx.drawImage(base, 0, 0);

		const placement = watermarkPlacement(
			base.width,
			base.height,
			mark.width,
			mark.height,
			{
				position: this.position,
				scale: this.scale,
				padding: this.padding,
				random: { x: this.#randomX, y: this.#randomY },
			},
		);

		ctx.globalAlpha = this.opacity / 100;
		ctx.globalCompositeOperation = COMPOSITE[this.blendMode];
		ctx.drawImage(
			mark,
			placement.x,
			placement.y,
			placement.width,
			placement.height,
		);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';

		this.resultImage = canvas.toDataURL('image/png');
	};

	download = () => {
		if (!this.resultImage) return;
		const link = document.createElement('a');
		link.download = `${this.baseFileName}-watermarked.png`;
		link.href = this.resultImage;
		link.click();
	};

	<template>
		<div
			class="dt-wm"
			{{filePaste this.readPasted accept="image/*"}}
		>
			<div class="dt-wm-frame">
				<div class="dt-wm-slots">
					<div class="dt-wm-slot">
						<div class="dt-wm-slot-head">
							{{! wording carried over from the Next app }}
							<span>Base Image</span>
						</div>
						{{#if this.baseUrl}}
							<div
								class="dt-wm-thumb"
							>
								<img
									src={{this.baseUrl}}
									alt="Base"
								/>
								<div
									class="dt-wm-thumb-bar"
								>
									<span
										class="dt-wm-thumb-dims"
									>{{this.baseWidth}}
										×
										{{this.baseHeight}}</span>
									<button
										type="button"
										class="dt-wm-thumb-btn"
										aria-label="Remove base image"
										{{on
											"click"
											this.clearBase
										}}
									>
										<Icon
											@name="trash-2"
										/>
									</button>
								</div>
							</div>
						{{else}}
							<label
								class="dt-wm-drop"
								{{on
									"drop"
									this.dropBase
								}}
								{{on
									"dragover"
									this.allowDrop
								}}
							>
								<input
									type="file"
									accept="image/*"
									class="dt-sr-only"
									{{on
										"change"
										this.selectBase
									}}
								/>
								<Icon
									@name="upload"
								/>
								{{! wording carried over from the Next app }}
								<span
									class="dt-wm-drop-title"
								>Drop image here</span>
								{{! wording carried over from the Next app }}
								<span
									class="dt-wm-drop-hint"
								>or click to
									select</span>
							</label>
						{{/if}}
					</div>

					<div class="dt-wm-slot">
						<div class="dt-wm-slot-head">
							{{! wording carried over from the Next app }}
							<span>Watermark (PNG)</span>
						</div>
						{{#if this.markUrl}}
							<div
								class="dt-wm-thumb is-checkered"
							>
								<img
									src={{this.markUrl}}
									alt="Watermark"
								/>
								<div
									class="dt-wm-thumb-bar"
								>
									<span
										class="dt-wm-thumb-dims"
									>{{this.markWidth}}
										×
										{{this.markHeight}}</span>
									<button
										type="button"
										class="dt-wm-thumb-btn"
										aria-label="Remove watermark"
										{{on
											"click"
											this.clearMark
										}}
									>
										<Icon
											@name="trash-2"
										/>
									</button>
								</div>
							</div>
						{{else}}
							<label
								class="dt-wm-drop"
								{{on
									"drop"
									this.dropMark
								}}
								{{on
									"dragover"
									this.allowDrop
								}}
							>
								<input
									type="file"
									accept="image/png"
									class="dt-sr-only"
									{{on
										"change"
										this.selectMark
									}}
								/>
								<Icon
									@name="upload"
								/>
								{{! wording carried over from the Next app }}
								<span
									class="dt-wm-drop-title"
								>Drop watermark
									here</span>
								{{! wording carried over from the Next app }}
								<span
									class="dt-wm-drop-hint"
								>transparent PNG</span>
							</label>
						{{/if}}
					</div>
				</div>

				{{#unless this.bothLoaded}}
					<p class="dt-wm-hint">
						{{! wording carried over from the Next app }}
						Paste an image to load it
						directly.
					</p>
				{{/unless}}

				{{#if this.loadFailed}}
					<p
						class="dt-wm-error"
						role="alert"
					>{{LOAD_FAILED}}</p>
				{{/if}}
			</div>

			{{#if this.bothLoaded}}
				<div class="dt-wm-frame">
					<div class="dt-wm-section">
						{{! wording carried over from the Next app }}
						<span
							class="dt-wm-label"
						>Position</span>
						<div class="dt-wm-place">
							<div
								class="segmented dt-wm-grid"
							>
								{{#each
									this.positions
									key="id"
									as |spot|
								}}
									<button
										type="button"
										class="dt-wm-spot
											{{if
												spot.isActive
												'is-active'
											}}"
										aria-label={{spot.name}}
										title={{spot.name}}
										{{on
											"click"
											(fn
												this.setPosition
												spot.id
											)
										}}
									>{{spot.label}}</button>
								{{/each}}
							</div>
							<button
								type="button"
								class="dt-wm-random
									{{if
										this.isRandom
										'is-active'
									}}"
								{{on
									"click"
									this.randomise
								}}
							>
								<Icon
									@name="shuffle"
								/>
								Random
							</button>
						</div>
					</div>

					<div class="dt-wm-sliders">
						<div class="dt-wm-slider">
							{{! wording carried over from the Next app }}
							<label
								for="dt-wm-opacity"
							>Opacity</label>
							<input
								id="dt-wm-opacity"
								type="range"
								min="5"
								max="100"
								step="5"
								value={{this.opacity}}
								{{on
									"input"
									this.setOpacity
								}}
							/>
							<span
								class="dt-wm-readout"
							>{{this.opacity}}%</span>
						</div>

						<div class="dt-wm-slider">
							{{! wording carried over from the Next app }}
							<label
								for="dt-wm-size"
							>Size</label>
							<input
								id="dt-wm-size"
								type="range"
								min="5"
								max="50"
								step="5"
								value={{this.scale}}
								{{on
									"input"
									this.setScale
								}}
							/>
							<span
								class="dt-wm-readout"
							>{{this.scale}}%</span>
						</div>

						<div class="dt-wm-slider">
							{{! wording carried over from the Next app }}
							<label
								for="dt-wm-padding"
							>Padding</label>
							<input
								id="dt-wm-padding"
								type="range"
								min="0"
								max="20"
								step="1"
								value={{this.padding}}
								{{on
									"input"
									this.setPadding
								}}
							/>
							<span
								class="dt-wm-readout"
							>{{this.padding}}%</span>
						</div>
					</div>

					<div class="dt-wm-section">
						{{! wording carried over from the Next app }}
						<span class="dt-wm-label">Blend
							Mode</span>
						<div
							class="segmented dt-wm-blends"
						>
							{{#each
								this.blendModes
								key="id"
								as |mode|
							}}
								<button
									type="button"
									class="dt-wm-blend
										{{if
											mode.isActive
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setBlendMode
											mode.id
										)
									}}
								>{{mode.label}}</button>
							{{/each}}
						</div>
					</div>

					{{#if this.resultImage}}
						<div class="dt-wm-result">
							<div
								class="dt-wm-slot-head"
							>
								{{! wording carried over from the Next app }}
								<span
								>Preview</span>
							</div>
							<div
								class="dt-wm-canvas"
							>
								<img
									src={{this.resultImage}}
									alt="Result"
								/>
							</div>
							<div
								class="dt-wm-result-foot"
							>
								<span
									class="dt-wm-readout"
								>{{this.baseWidth}}
									×
									{{this.baseHeight}}
									px</span>
							</div>
						</div>
					{{/if}}

					<div class="dt-wm-actions">
						<button
							type="button"
							class="dt-wm-run"
							disabled={{this.noResult}}
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name="download"
							/>
							Download
						</button>
						<button
							type="button"
							class="dt-wm-clear"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>
				</div>
			{{/if}}
		</div>
	</template>
}
