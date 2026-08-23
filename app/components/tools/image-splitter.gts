import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import DownloadLabel from 'delphitools-v2/components/download-label';
import Icon from 'delphitools-v2/components/icon';
import { downloadUrl } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';

const MIN_TILES = 1;
const MAX_TILES = 20;

/** Staggered so the browser does not drop all but the first download. */
const DOWNLOAD_GAP_MS = 100;

export interface TileRect {
	row: number;
	col: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Tile extends TileRect {
	key: string;
	label: string;
	dataUrl: string;
}

/**
 * Size of one tile. Floored, so a source that does not divide evenly loses up
 * to `cols - 1` columns and `rows - 1` rows off the right and bottom edges.
 */
export function tileSize(
	imageWidth: number,
	imageHeight: number,
	rows: number,
	cols: number,
): { width: number; height: number } {
	return {
		width: Math.floor(imageWidth / cols),
		height: Math.floor(imageHeight / rows),
	};
}

/** Source rectangles for every tile, in row-major order. */
export function splitGeometry(
	imageWidth: number,
	imageHeight: number,
	rows: number,
	cols: number,
): TileRect[] {
	const { width, height } = tileSize(imageWidth, imageHeight, rows, cols);
	const rects: TileRect[] = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			rects.push({
				row,
				col,
				x: col * width,
				y: row * height,
				width,
				height,
			});
		}
	}

	return rects;
}

function clampCount(value: string): number {
	return Math.max(
		MIN_TILES,
		Math.min(MAX_TILES, parseInt(value, 10) || MIN_TILES),
	);
}

export default class ImageSplitterTool extends Component {
	@tracked sourceImage: string | null = null;
	@tracked fileName = '';
	@tracked rows = 3;
	@tracked cols = 3;
	@tracked tiles: Tile[] = [];
	@tracked imageWidth = 0;
	@tracked imageHeight = 0;

	#image: HTMLImageElement | null = null;
	#timers: ReturnType<typeof setTimeout>[] = [];

	willDestroy() {
		super.willDestroy();
		this.#timers.forEach(clearTimeout);
	}

	get total() {
		return this.rows * this.cols;
	}

	get tile() {
		return tileSize(
			this.imageWidth,
			this.imageHeight,
			this.rows,
			this.cols,
		);
	}

	/** One cell per tile, drawn over the preview as a dashed grid. */
	get overlayCells() {
		return Array.from({ length: this.total }, (_, i) => i);
	}

	get overlayStyle() {
		// Both counts are clamped integers, so nothing user-supplied reaches
		// the style string.
		return htmlSafe(
			`grid-template-columns: repeat(${this.cols}, 1fr); grid-template-rows: repeat(${this.rows}, 1fr)`,
		);
	}

	get tileGridStyle() {
		return htmlSafe(
			`grid-template-columns: repeat(${this.cols}, 1fr)`,
		);
	}

	readFile = (file: File) => {
		this.fileName = file.name.replace(/\.[^.]+$/, '');
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const image = new Image();
			image.onload = () => {
				this.#image = image;
				this.imageWidth = image.width;
				this.imageHeight = image.height;
				this.sourceImage = dataUrl;
				this.tiles = [];
			};
			image.src = dataUrl;
		};
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

	setCols = (event: Event) => {
		this.cols = clampCount(
			(event.target as HTMLInputElement).value,
		);
		this.tiles = [];
	};

	setRows = (event: Event) => {
		this.rows = clampCount(
			(event.target as HTMLInputElement).value,
		);
		this.tiles = [];
	};

	clear = () => {
		this.#image = null;
		this.sourceImage = null;
		this.fileName = '';
		this.tiles = [];
		this.imageWidth = 0;
		this.imageHeight = 0;
	};

	splitImage = () => {
		const image = this.#image;
		if (!image) return;

		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		this.tiles = splitGeometry(
			image.width,
			image.height,
			this.rows,
			this.cols,
		).map((rect) => {
			canvas.width = rect.width;
			canvas.height = rect.height;
			ctx.clearRect(0, 0, rect.width, rect.height);
			ctx.drawImage(
				image,
				rect.x,
				rect.y,
				rect.width,
				rect.height,
				0,
				0,
				rect.width,
				rect.height,
			);
			return {
				...rect,
				key: `${rect.row}-${rect.col}`,
				label: `${rect.row + 1}-${rect.col + 1}`,
				dataUrl: canvas.toDataURL('image/png'),
			};
		});
	};

	downloadTile = (tile: Tile) => {
		downloadUrl(tile.dataUrl, `${this.fileName}-${tile.label}.png`);
	};

	downloadAll = () => {
		this.tiles.forEach((tile, i) => {
			this.#timers.push(
				setTimeout(
					() => this.downloadTile(tile),
					i * DOWNLOAD_GAP_MS,
				),
			);
		});
	};

	<template>
		<div
			class="dt-split"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-split-frame">
				{{#if this.sourceImage}}
					<div class="dt-split-bar">
						{{! wording carried over from the Next app }}
						<span
							class="dt-split-bar-title"
						>Source Image</span>
						<button
							type="button"
							class="dt-split-bar-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>

					<div class="dt-split-preview">
						<span class="dt-split-stage">
							<img
								src={{this.sourceImage}}
								alt="Source"
							/>
							<span
								class="dt-split-overlay"
								style={{this.overlayStyle}}
							>
								{{#each
									this.overlayCells
									key="@index"
									as |cell|
								}}
									<span
										data-cell={{cell}}
									></span>
								{{/each}}
							</span>
						</span>
					</div>

					<div class="dt-split-settings">
						<div class="dt-split-field">
							<label
								for="dt-split-cols"
							>Columns</label>
							<input
								id="dt-split-cols"
								type="number"
								min="1"
								max="20"
								value={{this.cols}}
								{{on
									"input"
									this.setCols
								}}
							/>
						</div>
						<div class="dt-split-field">
							<label
								for="dt-split-rows"
							>Rows</label>
							<input
								id="dt-split-rows"
								type="number"
								min="1"
								max="20"
								value={{this.rows}}
								{{on
									"input"
									this.setRows
								}}
							/>
						</div>
						<div class="dt-split-field">
							{{! wording carried over from the Next app }}
							<span
								class="dt-split-field-label"
							>Tile Size</span>
							<span
								class="dt-split-readout"
							>{{this.tile.width}}
								×
								{{this.tile.height}}
								px</span>
						</div>
						<div class="dt-split-field">
							<span
								class="dt-split-field-label"
							>Total</span>
							<span
								class="dt-split-readout"
							>{{this.total}}
								tiles</span>
						</div>
					</div>

					<button
						type="button"
						class="dt-split-run"
						{{on "click" this.splitImage}}
					>
						<Icon @name="layout-grid" />
						{{! wording carried over from the Next app }}
						Split Image into
						{{this.total}}
						Tiles
					</button>
				{{else}}
					<label
						class="dt-split-drop"
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
							class="dt-split-drop-title"
						>Drop image here</span>
						<span
							class="dt-split-drop-hint"
						>PNG, JPG, or any image format,
							or paste</span>
					</label>
				{{/if}}
			</div>

			{{#if this.tiles.length}}
				<div class="dt-split-frame">
					<div class="dt-split-bar">
						{{! wording carried over from the Next app }}
						<span
							class="dt-split-bar-title"
						>Generated Tiles</span>
						<button
							type="button"
							class="dt-split-bar-btn is-primary"
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

					<div
						class="dt-split-tiles"
						style={{this.tileGridStyle}}
					>
						{{#each
							this.tiles key="key"
							as |tile|
						}}
							<button
								type="button"
								class="dt-split-tile"
								{{on
									"click"
									(fn
										this.downloadTile
										tile
									)
								}}
							>
								<img
									src={{tile.dataUrl}}
									alt={{tile.label}}
								/>
								<span
									class="dt-split-tile-badge"
								>{{tile.label}}</span>
							</button>
						{{/each}}
					</div>
				</div>
			{{/if}}
		</div>
	</template>
}
