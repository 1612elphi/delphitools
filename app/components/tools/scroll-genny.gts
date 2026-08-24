import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadIcon } from 'delphitools-v2/lib/flow-hooks';
import { downloadUrl } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';

// color input form: #rrggbb
const HEX = /^#[0-9a-f]{6}$/i;

// stagger multiple file downloads
const DOWNLOAD_GAP_MS = 300;

// blur radius, canvas px
const FILL_BLUR_PX = 30;

// keeps blurred edges off-tile
const FILL_OVERSCAN = 1.2;

// exact-fit tolerance
const FIT_TOLERANCE = 0.01;

const LOAD_FAILED = 'Image could not be read. Try another file?';

const PRESET_COLOURS = ['#ffffff', '#000000', '#f5f5f5', '#1a1a1a'];

export type FillMode = 'colour' | 'blur';

export interface AspectRatio {
	name: string;
	label: string;
	value: number;
}

export const ASPECT_RATIOS: AspectRatio[] = [
	{ name: 'portrait', label: '4:5 Portrait', value: 4 / 5 },
	{ name: 'square', label: '1:1 Square', value: 1 },
];

export interface ScrollGeometry {
	tileWidth: number;
	tileHeight: number;
	slideCount: number;
	needsFill: boolean;
	exactFit: number;
}

// tiles span full source height
export function tileGeometry(
	imageWidth: number,
	imageHeight: number,
	ratio: number,
): ScrollGeometry {
	if (!imageWidth || !imageHeight) {
		return {
			tileWidth: 0,
			tileHeight: 0,
			slideCount: 0,
			needsFill: false,
			exactFit: 0,
		};
	}

	const tileHeight = imageHeight;
	const tileWidth = Math.round(tileHeight * ratio);
	const exactFit = imageWidth / tileWidth;
	const slideCount = Math.round(exactFit);

	return {
		tileWidth,
		tileHeight,
		slideCount: Math.max(1, slideCount),
		needsFill: Math.abs(exactFit - slideCount) > FIT_TOLERANCE,
		exactFit,
	};
}

export interface SliceRect {
	index: number;
	// source x, native px
	sourceX: number;
	// native px, 0 when all-fill
	sourceWidth: number;
	// tile x
	drawX: number;
	// outer tiles when strip uneven
	isFillEdge: boolean;
}

// layout: image centred in tile strip
export function sliceRects(
	geometry: ScrollGeometry,
	imageWidth: number,
): SliceRect[] {
	const { tileWidth, slideCount, needsFill } = geometry;
	if (!tileWidth || !slideCount) return [];

	const fillPerSide = needsFill
		? (tileWidth * slideCount - imageWidth) / 2
		: 0;
	const imageStart = fillPerSide;
	const imageEnd = fillPerSide + imageWidth;

	const rects: SliceRect[] = [];

	for (let index = 0; index < slideCount; index++) {
		const tileStart = index * tileWidth;
		const tileEnd = tileStart + tileWidth;
		const overlapStart = Math.max(tileStart, imageStart);
		const overlapEnd = Math.min(tileEnd, imageEnd);
		const hasContent = overlapEnd > overlapStart;

		rects.push({
			index,
			sourceX: hasContent ? overlapStart - imageStart : 0,
			sourceWidth: hasContent ? overlapEnd - overlapStart : 0,
			drawX: hasContent ? overlapStart - tileStart : 0,
			isFillEdge:
				needsFill &&
				(index === 0 || index === slideCount - 1),
		});
	}

	return rects;
}

interface Tile {
	index: number;
	number: number;
	dataUrl: string;
}

function swatchStyle(colour: string) {
	return htmlSafe(HEX.test(colour) ? `background-color: ${colour}` : '');
}

export default class ScrollGeneratorTool extends Component {
	@tracked sourceImage: string | null = null;
	@tracked fileName = '';
	@tracked imageWidth = 0;
	@tracked imageHeight = 0;
	@tracked selectedRatio = 0;
	@tracked fillMode: FillMode = 'blur';
	@tracked fillColour = '#000000';
	@tracked tiles: Tile[] = [];
	@tracked loadFailed = false;

	#timers: ReturnType<typeof setTimeout>[] = [];
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		this.#timers.forEach(clearTimeout);
	}

	get currentRatio(): AspectRatio {
		return ASPECT_RATIOS[this.selectedRatio] ?? ASPECT_RATIOS[0]!;
	}

	get geometry(): ScrollGeometry {
		return tileGeometry(
			this.imageWidth,
			this.imageHeight,
			this.currentRatio.value,
		);
	}

	get ratios() {
		return ASPECT_RATIOS.map((ratio, index) => ({
			ratio,
			index,
			isActive: index === this.selectedRatio,
		}));
	}

	// dashed-preview slide markers
	get slideMarkers() {
		return Array.from(
			{ length: this.geometry.slideCount },
			(_, i) => i + 1,
		);
	}

	get overlayStyle() {
		// count is user-input free
		return htmlSafe(
			`grid-template-columns: repeat(${this.geometry.slideCount}, 1fr)`,
		);
	}

	get swatches() {
		return PRESET_COLOURS.map((colour) => ({
			colour,
			style: swatchStyle(colour),
			isActive: colour === this.fillColour,
		}));
	}

	get isCustomColour() {
		return !PRESET_COLOURS.includes(this.fillColour);
	}

	get customSwatchStyle() {
		return swatchStyle(this.isCustomColour ? this.fillColour : '');
	}

	// picker resets on invalid hex
	get pickerValue() {
		return HEX.test(this.fillColour) ? this.fillColour : '#000000';
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
				this.imageWidth = image.width;
				this.imageHeight = image.height;
				this.sourceImage = dataUrl;
				this.tiles = [];
			};
			// decode errors must surface
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
		// rearm for same-file change
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) this.readFile(file);
	};

	// else browser navigates to file
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	fail = () => {
		if (this.#destroyed) return;
		this.sourceImage = null;
		this.fileName = '';
		this.imageWidth = 0;
		this.imageHeight = 0;
		this.tiles = [];
		this.loadFailed = true;
	};

	clear = () => {
		this.sourceImage = null;
		this.fileName = '';
		this.imageWidth = 0;
		this.imageHeight = 0;
		this.tiles = [];
		this.loadFailed = false;
	};

	selectRatio = (index: number) => {
		this.selectedRatio = index;
		this.tiles = [];
	};

	setFillMode = (mode: FillMode) => {
		this.fillMode = mode;
		this.tiles = [];
	};

	setFillColour = (colour: string) => {
		this.fillColour = colour;
		this.tiles = [];
	};

	pickFillColour = (event: Event) => {
		this.setFillColour((event.target as HTMLInputElement).value);
	};

	generate = () => {
		const source = this.sourceImage;
		if (!source) return;

		const image = new Image();
		image.onload = () => {
			if (this.#destroyed) return;

			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return this.fail();

			const geometry = this.geometry;
			const { tileWidth, tileHeight } = geometry;
			const rects = sliceRects(geometry, this.imageWidth);

			this.tiles = rects.map((rect) => {
				canvas.width = tileWidth;
				canvas.height = tileHeight;
				ctx.clearRect(0, 0, tileWidth, tileHeight);

				if (rect.isFillEdge)
					this.#drawFill(
						ctx,
						image,
						rect,
						geometry,
					);

				if (rect.sourceWidth > 0) {
					ctx.drawImage(
						image,
						rect.sourceX,
						0,
						rect.sourceWidth,
						image.height,
						rect.drawX,
						0,
						rect.sourceWidth,
						tileHeight,
					);
				}

				return {
					index: rect.index,
					number: rect.index + 1,
					dataUrl: canvas.toDataURL('image/png'),
				};
			});
		};
		image.onerror = this.fail;
		image.src = source;
	};

	#drawFill(
		ctx: CanvasRenderingContext2D,
		image: HTMLImageElement,
		rect: SliceRect,
		geometry: ScrollGeometry,
	) {
		const { tileWidth, tileHeight } = geometry;

		if (this.fillMode === 'colour') {
			ctx.fillStyle = this.pickerValue;
			ctx.fillRect(0, 0, tileWidth, tileHeight);
			return;
		}

		if (rect.sourceWidth <= 0) return;

		ctx.filter = `blur(${FILL_BLUR_PX}px)`;
		const scale =
			Math.max(
				tileWidth / rect.sourceWidth,
				tileHeight / image.height,
			) * FILL_OVERSCAN;
		const blurWidth = rect.sourceWidth * scale;
		const blurHeight = image.height * scale;
		ctx.drawImage(
			image,
			rect.sourceX,
			0,
			rect.sourceWidth,
			image.height,
			(tileWidth - blurWidth) / 2,
			(tileHeight - blurHeight) / 2,
			blurWidth,
			blurHeight,
		);
		ctx.filter = 'none';
	}

	download = (tile: Tile) => {
		downloadUrl(
			tile.dataUrl,
			`${this.fileName}-scroll-${tile.number}.png`,
		);
	};

	downloadAll = () => {
		this.tiles.forEach((tile, i) => {
			this.#timers.push(
				setTimeout(
					() => this.download(tile),
					i * DOWNLOAD_GAP_MS,
				),
			);
		});
	};

	<template>
		<div
			class="dt-scroll"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-scroll-frame">
				{{#if this.sourceImage}}
					<div class="dt-scroll-bar">
						<span class="dt-scroll-source">
							<Icon @name="image" />
							<span
								class="dt-scroll-name"
							>{{this.fileName}}</span>
							<span
								class="dt-scroll-dims"
							>{{this.imageWidth}}
								×
								{{this.imageHeight}}</span>
						</span>
						<button
							type="button"
							class="dt-scroll-bar-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>

					<div class="dt-scroll-section">
						{{! wording from next app }}
						<span
							class="dt-scroll-label"
						>Slice Preview</span>
						<div class="dt-scroll-preview">
							<img
								src={{this.sourceImage}}
								alt="Source"
							/>
							{{#if
								this.geometry.slideCount
							}}
								<div
									class="dt-scroll-overlay"
									style={{this.overlayStyle}}
								>
									{{#each
										this.slideMarkers
										as |marker|
									}}
										<span
											class="dt-scroll-marker"
										><span
												class="dt-scroll-chip"
											>{{marker}}</span></span>
									{{/each}}
								</div>
							{{/if}}
						</div>
					</div>

					<div
						class="dt-scroll-section is-padded"
					>
						{{! wording from next app }}
						<span
							class="dt-scroll-label"
						>Tile Shape</span>
						<div
							class="segmented dt-scroll-choices"
						>
							{{#each
								this.ratios
								key="ratio.name"
								as |option|
							}}
								<button
									type="button"
									class="dt-scroll-choice
										{{if
											option.isActive
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.selectRatio
											option.index
										)
									}}
								>{{option.ratio.label}}</button>
							{{/each}}
						</div>
					</div>

					<div
						class="dt-scroll-section is-padded
							{{unless
								this.geometry.needsFill
								'is-inert'
							}}"
					>
						<span class="dt-scroll-label">
							{{! wording from next app }}
							Edge Fill
							{{#unless
								this.geometry.needsFill
							}}
								{{! wording from next app }}
								<span
									class="dt-scroll-note"
								>(not needed)</span>
							{{/unless}}
						</span>
						<div
							class="segmented dt-scroll-choices"
						>
							<button
								type="button"
								class="dt-scroll-choice
									{{if
										(eq
											this.fillMode
											'blur'
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setFillMode
										"blur"
									)
								}}
							>Blurred</button>
							<button
								type="button"
								class="dt-scroll-choice
									{{if
										(eq
											this.fillMode
											'colour'
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setFillMode
										"colour"
									)
								}}
							>{{! wording from next app }}Solid
								Colour</button>
						</div>

						{{#if
							(eq
								this.fillMode
								"colour"
							)
						}}
							<div
								class="dt-scroll-swatches"
							>
								{{#each
									this.swatches
									key="colour"
									as |swatch|
								}}
									<button
										type="button"
										class="dt-scroll-swatch
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
												this.setFillColour
												swatch.colour
											)
										}}
									></button>
								{{/each}}
								<span
									class="dt-scroll-custom"
									style={{this.customSwatchStyle}}
								>
									{{#unless
										this.isCustomColour
									}}
										+
									{{/unless}}
									<input
										type="color"
										value={{this.pickerValue}}
										aria-label="Custom colour"
										{{on
											"input"
											this.pickFillColour
										}}
									/>
								</span>
							</div>
						{{/if}}
					</div>

					<div class="dt-scroll-stats">
						<span
							class="dt-scroll-count"
						>{{this.geometry.slideCount}}</span>
						{{! wording from next app }}
						<span
							class="dt-scroll-stat"
						>slides at
							{{this.geometry.tileWidth}}
							×
							{{this.geometry.tileHeight}}</span>
						{{#if this.geometry.needsFill}}
							{{! wording from next app }}
							<span
								class="dt-scroll-flag is-fill"
							>+ edge fill</span>
						{{else}}
							{{! wording from next app }}
							<span
								class="dt-scroll-flag is-fit"
							>perfect fit</span>
						{{/if}}
					</div>

					<button
						type="button"
						class="dt-scroll-run"
						{{on "click" this.generate}}
					>
						<Icon @name="layout-grid" />
						{{! wording from next app }}
						Generate Slides
					</button>
				{{else}}
					<label
						class="dt-scroll-drop"
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
						{{! wording from next app }}
						<span
							class="dt-scroll-drop-title"
						>Drop panoramic image here</span>
						{{! wording from next app }}
						<span
							class="dt-scroll-drop-hint"
						>or click to select, or paste</span>
					</label>
				{{/if}}

				{{#if this.loadFailed}}
					<p
						class="dt-scroll-error"
						role="alert"
					>{{LOAD_FAILED}}</p>
				{{/if}}
			</div>

			{{#if this.tiles.length}}
				<div class="dt-scroll-frame is-results">
					<div class="dt-scroll-bar">
						{{! wording from next app }}
						<span
							class="dt-scroll-ready"
						>{{this.tiles.length}}
							slides ready</span>
						<button
							type="button"
							class="dt-scroll-bar-btn"
							{{on
								"click"
								this.downloadAll
							}}
						>
							<DownloadLabel
								@label="Download All"
							/>
						</button>
					</div>

					<div class="dt-scroll-strip">
						{{#each
							this.tiles key="index"
							as |tile|
						}}
							<button
								type="button"
								class="dt-scroll-tile"
								{{on
									"click"
									(fn
										this.download
										tile
									)
								}}
							>
								<img
									src={{tile.dataUrl}}
									alt="Slide
										{{tile.number}}"
								/>
								<span
									class="dt-scroll-tile-hint"
								>
									{{! wording from next app }}
									<span
									>Slide
										{{tile.number}}</span>
									<Icon
										@name={{(downloadIcon
										)}}
									/>
								</span>
							</button>
						{{/each}}
					</div>

					<div class="dt-scroll-footer">
						{{! wording from next app }}
						<p>Post these slides in order to
							create a seamless
							scrolling carousel</p>
					</div>
				</div>
			{{/if}}
		</div>
	</template>
}
