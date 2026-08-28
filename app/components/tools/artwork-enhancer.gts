import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadUrl } from 'delphitools-v2/lib/download';

const MIN_OPACITY = 1;
const MAX_OPACITY = 20;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

const RENDER_DEBOUNCE_MS = 120;

export function fillNoise(
	data: Uint8ClampedArray,
	random: () => number = Math.random,
): void {
	for (let i = 0; i < data.length; i += 4) {
		data[i] = Math.floor(random() * 256);
		data[i + 1] = Math.floor(random() * 256);
		data[i + 2] = Math.floor(random() * 256);
		data[i + 3] = 255;
	}
}

export function noiseDimensions(
	width: number,
	height: number,
	scale: number,
): { width: number; height: number } {
	return {
		width: Math.ceil(width / scale),
		height: Math.ceil(height / scale),
	};
}

function noiseCanvas(
	width: number,
	height: number,
	scale: number,
): HTMLCanvasElement | null {
	const size = noiseDimensions(width, height, scale);
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;

	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	const buffer = ctx.createImageData(size.width, size.height);
	fillNoise(buffer.data);
	ctx.putImageData(buffer, 0, 0);
	return canvas;
}

function clamp(value: string, min: number, max: number): number {
	return Math.max(min, Math.min(max, parseInt(value, 10) || min));
}

export default class ArtworkEnhancerTool extends Component {
	@tracked hasImage = false;
	@tracked fileName = '';
	@tracked imageWidth = 0;
	@tracked imageHeight = 0;
	@tracked opacity = 2;
	@tracked noiseScale = 1;
	@tracked resultImage: string | null = null;

	#image: HTMLImageElement | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;

	willDestroy() {
		super.willDestroy();
		if (this.#timer) clearTimeout(this.#timer);
	}

	readFile = (file: File) => {
		this.fileName = file.name.replace(/\.[^.]+$/, '');
		const reader = new FileReader();
		reader.onload = () => {
			const image = new Image();
			image.onload = () => {
				this.#image = image;
				this.imageWidth = image.width;
				this.imageHeight = image.height;
				this.hasImage = true;
				this.render();
			};
			image.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// allow same-file selection.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) this.readFile(file);
	};

	// prevent drop navigation.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setOpacity = (event: Event) => {
		this.opacity = clamp(
			(event.target as HTMLInputElement).value,
			MIN_OPACITY,
			MAX_OPACITY,
		);
		this.queueRender();
	};

	setNoiseScale = (event: Event) => {
		this.noiseScale = clamp(
			(event.target as HTMLInputElement).value,
			MIN_SCALE,
			MAX_SCALE,
		);
		this.queueRender();
	};

	clear = () => {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#image = null;
		this.hasImage = false;
		this.resultImage = null;
		this.fileName = '';
	};

	queueRender = () => {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(this.render, RENDER_DEBOUNCE_MS);
	};

	render = () => {
		this.#timer = null;
		const image = this.#image;
		if (!image) return;

		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.drawImage(image, 0, 0);

		const noise = noiseCanvas(
			image.width,
			image.height,
			this.noiseScale,
		);
		if (!noise) return;

		ctx.imageSmoothingEnabled = false;
		ctx.globalCompositeOperation = 'overlay';
		ctx.globalAlpha = this.opacity / 100;
		ctx.drawImage(noise, 0, 0, image.width, image.height);
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;

		this.resultImage = canvas.toDataURL('image/png');
	};

	download = () => {
		if (!this.resultImage) return;
		downloadUrl(
			this.resultImage,
			`${this.fileName || 'artwork'}-enhanced.png`,
		);
	};

	<template>
		<div
			class="dt-art"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-art-frame">
				{{#if this.hasImage}}
					<div class="dt-art-controls">
						<div class="dt-art-control">
							<div
								class="dt-art-control-head"
							>
								<label
									for="dt-art-opacity"
								>Noise Opacity</label>
								<span
									class="dt-art-readout"
								>{{this.opacity}}%</span>
							</div>
							<input
								id="dt-art-opacity"
								type="range"
								class="dt-art-slider"
								min="1"
								max="20"
								step="1"
								value={{this.opacity}}
								{{on
									"input"
									this.setOpacity
								}}
							/>
							<p
								class="dt-art-hint"
							>Classic trick uses 2%
								opacity</p>
						</div>

						<div class="dt-art-control">
							<div
								class="dt-art-control-head"
							>
								<label
									for="dt-art-scale"
								>Noise Scale</label>
								<span
									class="dt-art-readout"
								>{{this.noiseScale}}x</span>
							</div>
							<input
								id="dt-art-scale"
								type="range"
								class="dt-art-slider"
								min="1"
								max="4"
								step="1"
								value={{this.noiseScale}}
								{{on
									"input"
									this.setNoiseScale
								}}
							/>
							<p
								class="dt-art-hint"
							>Higher = blockier noise</p>
						</div>
					</div>

					<div class="dt-art-preview">
						<div
							class="dt-art-preview-head"
						>
							<span
								class="dt-art-preview-title"
							>Preview</span>
							<span
								class="dt-art-readout"
							>{{this.imageWidth}}
								×
								{{this.imageHeight}}px</span>
						</div>
						<div class="dt-art-canvas">
							{{#if this.resultImage}}
								<img
									src={{this.resultImage}}
									alt="Enhanced artwork"
								/>
							{{/if}}
						</div>
					</div>

					<div class="dt-art-actions">
						<button
							type="button"
							class="dt-art-btn"
							{{on
								"click"
								this.render
							}}
						>
							<Icon
								@name="refresh-cw"
							/>
							Regenerate
						</button>
						<button
							type="button"
							class="dt-art-btn is-divided"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-art-btn is-primary"
							disabled={{not
								this.resultImage
							}}
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel
								@label="Download PNG"
							/>
						</button>
					</div>
				{{else}}
					<label
						class="dt-art-drop"
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
							class="dt-art-drop-title"
						>Drop your artwork here</span>
						<span
							class="dt-art-drop-hint"
						>or click to browse, or paste</span>
					</label>
				{{/if}}
			</div>

			<div class="dt-art-note">
				<p class="dt-art-note-title">About this
					technique</p>
				<p>Adding colour noise at low opacity with
					overlay blend mode is a classic digital
					art trick. It adds subtle texture and
					colour variation that makes artwork feel
					more organic and cohesive, similar to
					the natural grain in traditional media.</p>
			</div>
		</div>
	</template>
}
