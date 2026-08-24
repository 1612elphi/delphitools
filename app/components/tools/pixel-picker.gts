import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import { carryColour } from 'delphitools-v2/lib/colour-query';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { rgbToHex } from 'delphitools-v2/lib/colour-maths';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

const MAX_CANVAS_EDGE = 2000;

const LOUPE_RADIUS = 10;
const LOUPE_PIXEL_SIZE = 8;
const LOUPE_SIZE = (LOUPE_RADIUS * 2 + 1) * LOUPE_PIXEL_SIZE;

interface Swatch {
	id: string;
	hex: string;
	p3: string | null;
}

const newId = () => Math.random().toString(36).substring(2, 9);

function detectP3Support(): boolean {
	if (typeof CSS === 'undefined' || !CSS.supports) return false;
	return CSS.supports('color', 'color(display-p3 1 0 0)');
}

export default class PixelPickerTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked fileName: string | null = null;
	@tracked p3Mode = false;
	@tracked swatches: Swatch[] = [];
	@tracked activeSwatch: number | null = null;
	@tracked hoverPos: { left: number; top: number } | null = null;
	@tracked copied: string | null = null;

	get carried(): string | undefined {
		return this.activeSwatch === null
			? undefined
			: this.swatches[this.activeSwatch]?.hex;
	}

	readonly p3Supported = detectP3Support();
	readonly loupeSize = LOUPE_SIZE;

	#canvas: HTMLCanvasElement | null = null;
	#loupe: HTMLCanvasElement | null = null;
	#image: HTMLImageElement | null = null;
	#p3Canvas: HTMLCanvasElement | null = null;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	registerCanvas = modifier((element: HTMLCanvasElement) => {
		this.#canvas = element;
		this.#paint();
		return () => {
			if (this.#canvas === element) this.#canvas = null;
		};
	});

	registerLoupe = modifier((element: HTMLCanvasElement) => {
		this.#loupe = element;
		return () => {
			if (this.#loupe === element) this.#loupe = null;
		};
	});

	get rows() {
		return this.swatches.map((swatch, index) => ({
			swatch,
			index,
			value: this.colourNotation.format(swatch.hex),
			hexUpper: swatch.hex.toUpperCase(),
			name: getColourName(swatch.hex),
			// rgbToHex guarantees hex literal
			fillStyle: htmlSafe(`background-color: ${swatch.hex}`),
			isActive: this.activeSwatch === index,
		}));
	}

	get active() {
		const index = this.activeSwatch;
		if (index === null) return null;
		const row = this.rows[index];
		if (!row) return null;
		return {
			...row,
			display:
				this.colourNotation.notation === 'hex'
					? row.hexUpper
					: row.value,
			p3: row.swatch.p3,
		};
	}

	get loupeStyle() {
		const pos = this.hoverPos;
		if (!pos) return htmlSafe('');
		return htmlSafe(`left: ${pos.left}px; top: ${pos.top}px`);
	}

	#paint() {
		const canvas = this.#canvas;
		const image = this.#image;
		if (!canvas || !image) return;

		let w = image.naturalWidth;
		let h = image.naturalHeight;
		if (Math.max(w, h) > MAX_CANVAS_EDGE) {
			const scale = MAX_CANVAS_EDGE / Math.max(w, h);
			w = Math.round(w * scale);
			h = Math.round(h * scale);
		}

		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
		if (!ctx) return;
		ctx.drawImage(image, 0, 0, w, h);

		if (!this.p3Supported) return;
		const p3Canvas = document.createElement('canvas');
		p3Canvas.width = w;
		p3Canvas.height = h;
		const p3ctx = p3Canvas.getContext('2d', {
			colorSpace: 'display-p3',
		});
		if (!p3ctx) return;
		p3ctx.drawImage(image, 0, 0, w, h);
		this.#p3Canvas = p3Canvas;
	}

	readFile = (file: File) => {
		if (!file.type.startsWith('image/')) return;

		this.fileName = file.name;
		this.swatches = [];
		this.activeSwatch = null;
		this.hoverPos = null;
		this.#image = null;
		this.#p3Canvas = null;

		// undisplayed; revoke after decode
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			this.#image = image;
			this.#paint();
		};
		image.onerror = () => URL.revokeObjectURL(url);
		image.src = url;
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// allow re-picking same file
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = Array.from(event.dataTransfer?.files ?? []).find(
			(f) => f.type.startsWith('image/'),
		);
		if (file) this.readFile(file);
	};

	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setP3Mode = (event: Event) => {
		this.p3Mode = (event.target as HTMLInputElement).checked;
	};

	#canvasToPixel(event: MouseEvent): { x: number; y: number } | null {
		const canvas = this.#canvas;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const x = Math.floor(
			((event.clientX - rect.left) * canvas.width) /
				rect.width,
		);
		const y = Math.floor(
			((event.clientY - rect.top) * canvas.height) /
				rect.height,
		);
		if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height)
			return null;
		return { x, y };
	}

	#samplePixel(x: number, y: number): Swatch | null {
		const canvas = this.#canvas;
		if (!canvas) return null;

		const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
		if (!ctx) return null;
		const data = ctx.getImageData(x, y, 1, 1).data;
		const hex = rgbToHex(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);

		let p3: string | null = null;
		const p3Canvas = this.#p3Canvas;
		if (this.p3Mode && p3Canvas) {
			const p3ctx = p3Canvas.getContext('2d', {
				colorSpace: 'display-p3',
			});
			if (p3ctx) {
				const p3data = p3ctx.getImageData(
					x,
					y,
					1,
					1,
				).data;
				const r = (p3data[0] ?? 0) / 255;
				const g = (p3data[1] ?? 0) / 255;
				const b = (p3data[2] ?? 0) / 255;
				p3 = `color(display-p3 ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)})`;
			}
		}

		return { id: newId(), hex, p3 };
	}

	#drawLoupe(x: number, y: number) {
		const canvas = this.#canvas;
		const loupe = this.#loupe;
		if (!canvas || !loupe) return;

		const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
		const lctx = loupe.getContext('2d');
		if (!ctx || !lctx) return;

		lctx.imageSmoothingEnabled = false;
		lctx.fillStyle = '#1a1a1a';
		lctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);

		const sx = Math.max(0, x - LOUPE_RADIUS);
		const sy = Math.max(0, y - LOUPE_RADIUS);
		const ex = Math.min(canvas.width, x + LOUPE_RADIUS + 1);
		const ey = Math.min(canvas.height, y + LOUPE_RADIUS + 1);
		const rw = ex - sx;
		const rh = ey - sy;

		if (rw > 0 && rh > 0) {
			const data = ctx.getImageData(sx, sy, rw, rh).data;
			const offX = sx - (x - LOUPE_RADIUS);
			const offY = sy - (y - LOUPE_RADIUS);

			for (let py = 0; py < rh; py++) {
				for (let px = 0; px < rw; px++) {
					const i = (py * rw + px) * 4;
					lctx.fillStyle = `rgb(${data[i] ?? 0}, ${data[i + 1] ?? 0}, ${data[i + 2] ?? 0})`;
					lctx.fillRect(
						(px + offX) * LOUPE_PIXEL_SIZE,
						(py + offY) * LOUPE_PIXEL_SIZE,
						LOUPE_PIXEL_SIZE,
						LOUPE_PIXEL_SIZE,
					);
				}
			}
		}

		const cx = LOUPE_RADIUS * LOUPE_PIXEL_SIZE;
		const cy = LOUPE_RADIUS * LOUPE_PIXEL_SIZE;
		lctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
		lctx.lineWidth = 1.5;
		lctx.strokeRect(cx, cy, LOUPE_PIXEL_SIZE, LOUPE_PIXEL_SIZE);
		lctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
		lctx.lineWidth = 0.5;
		lctx.strokeRect(
			cx - 0.5,
			cy - 0.5,
			LOUPE_PIXEL_SIZE + 1,
			LOUPE_PIXEL_SIZE + 1,
		);
	}

	handleCanvasClick = (event: MouseEvent) => {
		const pos = this.#canvasToPixel(event);
		if (!pos) return;
		const swatch = this.#samplePixel(pos.x, pos.y);
		if (!swatch) return;
		this.swatches = [...this.swatches, swatch];
		this.activeSwatch = this.swatches.length - 1;
	};

	handleCanvasMove = (event: MouseEvent) => {
		const canvas = this.#canvas;
		if (!canvas) return;
		const pos = this.#canvasToPixel(event);
		if (!pos) {
			this.hoverPos = null;
			return;
		}

		const rect = canvas.getBoundingClientRect();
		const cssX = event.clientX - rect.left;
		const cssY = event.clientY - rect.top;
		// right-edge overflow flips loupe
		const flipX = cssX + 20 + LOUPE_SIZE > rect.width;
		this.hoverPos = {
			left: flipX ? cssX - 20 - LOUPE_SIZE : cssX + 20,
			top: Math.max(
				0,
				Math.min(
					rect.height - LOUPE_SIZE,
					cssY - LOUPE_SIZE / 2,
				),
			),
		};
		this.#drawLoupe(pos.x, pos.y);
	};

	handleCanvasLeave = () => {
		this.hoverPos = null;
	};

	copyValue = async (value: string) => {
		await navigator.clipboard.writeText(value);
		this.copied = value;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			1500,
		);
	};

	selectSwatch = (index: number) => {
		this.activeSwatch = index;
	};

	removeSwatch = (index: number) => {
		this.swatches = this.swatches.filter((_, i) => i !== index);
		if (this.activeSwatch === index) {
			this.activeSwatch = null;
		} else if (
			this.activeSwatch !== null &&
			this.activeSwatch > index
		) {
			this.activeSwatch = this.activeSwatch - 1;
		}
	};

	clearSwatches = () => {
		this.swatches = [];
		this.activeSwatch = null;
	};

	clearImage = () => {
		this.fileName = null;
		this.swatches = [];
		this.activeSwatch = null;
		this.hoverPos = null;
		this.#image = null;
		this.#p3Canvas = null;
	};

	<template>
		<div
			{{carryColour this.carried}}
			class="dt-pixel"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-pixel-frame">
				{{#if this.fileName}}
					<div class="dt-pixel-bar">
						<span
							class="dt-pixel-name"
						>{{this.fileName}}</span>
						{{#if this.p3Supported}}
							<label
								class="dt-pixel-p3"
							>
								<span>Display P3</span>
								<input
									type="checkbox"
									class="dt-pixel-p3-input"
									checked={{this.p3Mode}}
									{{on
										"change"
										this.setP3Mode
									}}
								/>
							</label>
						{{/if}}
						<button
							type="button"
							class="dt-pixel-bar-btn"
							aria-label="Remove image"
							{{on
								"click"
								this.clearImage
							}}
						>
							<Icon @name="x" />
						</button>
					</div>

					<div class="dt-pixel-stage">
						<canvas
							class="dt-pixel-canvas"
							{{this.registerCanvas}}
							{{on
								"click"
								this.handleCanvasClick
							}}
							{{on
								"mousemove"
								this.handleCanvasMove
							}}
							{{on
								"mouseleave"
								this.handleCanvasLeave
							}}
						></canvas>
						<span
							class="dt-pixel-loupe
								{{if
									this.hoverPos
									'is-on'
								}}"
							style={{this.loupeStyle}}
							aria-hidden="true"
						>
							<canvas
								width={{this.loupeSize}}
								height={{this.loupeSize}}
								{{this.registerLoupe}}
							></canvas>
						</span>
					</div>

					<div class="dt-pixel-hint">
						<Icon @name="crosshair" />
						<span>Click anywhere on the
							image to sample a colour</span>
					</div>

					{{#if this.active}}
						<div class="dt-pixel-active">
							<span
								class="dt-pixel-active-fill"
								style={{this.active.fillStyle}}
								aria-hidden="true"
							></span>
							<span
								class="dt-pixel-active-info"
							>
								<span
									class="dt-pixel-active-value"
								>{{this.active.display}}</span>
								<span
									class="dt-pixel-active-name"
								>{{this.active.name}}</span>
								{{#if
									this.p3Mode
								}}
									{{#if
										this.active.p3
									}}
										<span
											class="dt-pixel-active-p3"
										>{{this.active.p3}}</span>
									{{/if}}
								{{/if}}
							</span>
							<button
								type="button"
								class="dt-pixel-active-copy"
								aria-label="Copy colour value"
								{{on
									"click"
									(fn
										this.copyValue
										this.active.value
									)
								}}
							>
								<Icon
									@name={{if
										(eq
											this.copied
											this.active.value
										)
										"check"
										"copy"
									}}
								/>
							</button>
						</div>
					{{/if}}

					{{#if this.rows}}
						<div class="dt-pixel-table">
							<div
								class="dt-pixel-table-head"
							>
								<span
									class="dt-pixel-table-title"
								>Sampled colours</span>
								<button
									type="button"
									class="dt-pixel-clear"
									{{on
										"click"
										this.clearSwatches
									}}
								>
									<Icon
										@name="trash-2"
									/>
									Clear
									all
								</button>
							</div>

							{{#each
								this.rows
								key="swatch.id"
								as |row|
							}}
								<div
									class="dt-pixel-row
										{{if
											row.isActive
											'is-active'
										}}"
								>
									<button
										type="button"
										class="dt-pixel-row-select"
										{{on
											"click"
											(fn
												this.selectSwatch
												row.index
											)
										}}
									>
										<span
											class="dt-pixel-row-fill"
											style={{row.fillStyle}}
										></span>
										<span
											class="dt-pixel-row-info"
										>
											<span
												class="dt-pixel-row-hex"
											>{{row.hexUpper}}</span>
											<span
												class="dt-pixel-row-name"
											>{{row.name}}</span>
										</span>
									</button>
									<button
										type="button"
										class="dt-pixel-row-btn"
										aria-label="Copy colour value"
										{{on
											"click"
											(fn
												this.copyValue
												row.value
											)
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													row.value
												)
												"check"
												"copy"
											}}
										/>
									</button>
									<button
										type="button"
										class="dt-pixel-row-btn"
										aria-label="Remove swatch"
										{{on
											"click"
											(fn
												this.removeSwatch
												row.index
											)
										}}
									>
										<Icon
											@name="x"
										/>
									</button>
								</div>
							{{/each}}
						</div>
					{{/if}}

					<p class="dt-pixel-about">
						<span
							class="dt-pixel-about-title"
						>About colour spaces — </span>
						Colours are sampled in sRGB by
						default. Images with wide-gamut
						colour profiles (Display P3,
						Adobe RGB) are converted to
						sRGB, which may shift some
						colours.
						{{#if this.p3Supported}}
							Enable the Display P3
							toggle to sample
							wide-gamut values and
							get color(display-p3 …)
							CSS output.
						{{else}}
							Your browser does not
							support Display P3
							colour sampling.
						{{/if}}
					</p>
				{{else}}
					<label
						class="dt-pixel-drop"
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
						<span
							class="dt-pixel-drop-title"
						>Drop an image here</span>
						<span
							class="dt-pixel-drop-hint"
						>or click to select a file, or
							paste</span>
					</label>
				{{/if}}
			</div>
		</div>
	</template>
}
