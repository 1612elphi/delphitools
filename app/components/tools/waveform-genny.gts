import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import { downloadBlob, downloadText } from 'delphitools-v2/lib/download';
import {
	AudioIntake,
	channelsOf,
	drawWaveform,
	extractPeaks,
} from 'delphitools-v2/lib/audio';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';

/** Kept in step with the registry entry, which routes dropped files. */
const ACCEPT = acceptAttr(AUDIO_ACCEPT);

const DROP_TITLE = 'Drop an audio file here or click to upload';

interface SizePreset {
	id: string;
	label: string;
	width: number;
	height: number;
}

const PRESETS: SizePreset[] = [
	{ id: 'soundcloud', label: 'SoundCloud', width: 1500, height: 500 },
	{ id: 'og', label: 'Open Graph', width: 1200, height: 630 },
	{ id: 'hd', label: 'Full HD', width: 1920, height: 1080 },
	{ id: 'square', label: 'Square', width: 1200, height: 1200 },
];

// Bar width in output pixels: 1 is per-pixel detail, 8 is chunky bars.
const DETAIL_STEPS = [1, 2, 4, 8];
const CUSTOM_MIN = 100;
const CUSTOM_MAX = 4000;

export default class WaveformGennyTool extends Component {
	@tracked presetId = 'soundcloud';
	@tracked waveColour = '#2e7d32';
	@tracked backgroundColour = '#faf5e6';
	@tracked detailPx = 2;
	@tracked customWidth = 1500;
	@tracked customHeight = 500;

	intake = new AudioIntake();

	get preset(): SizePreset {
		if (this.presetId === 'custom')
			return {
				id: 'custom',
				label: 'Custom',
				width: this.customWidth,
				height: this.customHeight,
			};
		return (
			PRESETS.find((p) => p.id === this.presetId) ??
			PRESETS[0]!
		);
	}

	get presets() {
		return [
			...PRESETS,
			{ id: 'custom', label: 'Custom', width: 0, height: 0 },
		];
	}

	get detailSteps() {
		return DETAIL_STEPS;
	}

	get isCustom() {
		return this.presetId === 'custom';
	}

	get meta() {
		const buffer = this.intake.buffer;
		if (!buffer) return '';
		return `${buffer.duration.toFixed(2)} s · ${this.preset.width} × ${this.preset.height}`;
	}

	@cached
	get peaks() {
		const buffer = this.intake.buffer;
		if (!buffer) return null;
		return extractPeaks(
			channelsOf(buffer),
			Math.max(
				10,
				Math.round(this.preset.width / this.detailPx),
			),
		);
	}

	setPreset = (id: string) => {
		this.presetId = id;
	};

	setWaveColour = (event: Event) => {
		this.waveColour = (event.target as HTMLInputElement).value;
	};

	setBackgroundColour = (event: Event) => {
		this.backgroundColour = (
			event.target as HTMLInputElement
		).value;
	};

	setDetail = (event: Event) => {
		const value = parseInt(
			(event.target as HTMLSelectElement).value,
			10,
		);
		if (DETAIL_STEPS.includes(value)) this.detailPx = value;
	};

	#dimension = (event: Event) => {
		const value = parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (!Number.isFinite(value)) return null;
		return Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, value));
	};

	setCustomWidth = (event: Event) => {
		const value = this.#dimension(event);
		if (value !== null) this.customWidth = value;
	};

	setCustomHeight = (event: Event) => {
		const value = this.#dimension(event);
		if (value !== null) this.customHeight = value;
	};

	#paint(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
		const peaks = this.peaks;
		const ctx = canvas.getContext(
			'2d',
		) as CanvasRenderingContext2D | null;
		if (!ctx || !peaks) return false;
		ctx.fillStyle = this.backgroundColour;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = this.waveColour;
		drawWaveform(ctx, peaks, canvas.width, canvas.height);
		return true;
	}

	drawPreview = modifier((canvas: HTMLCanvasElement) => {
		canvas.width = this.preset.width;
		canvas.height = this.preset.height;
		this.#paint(canvas);
	});

	exportPng = () => {
		const canvas = document.createElement('canvas');
		canvas.width = this.preset.width;
		canvas.height = this.preset.height;
		if (!this.#paint(canvas)) return;
		canvas.toBlob((blob) => {
			if (blob)
				downloadBlob(
					blob,
					`${this.intake.baseName || 'waveform'}.png`,
				);
		}, 'image/png');
	};

	exportSvg = () => {
		const peaks = this.peaks;
		if (!peaks) return;
		const { width, height } = this.preset;
		const mid = height / 2;
		const columns = peaks.min.length;
		const w = width / columns;

		const bars: string[] = [];
		for (let x = 0; x < columns; x++) {
			const top = mid - peaks.max[x]! * mid;
			const bottom = mid - peaks.min[x]! * mid;
			bars.push(
				`<rect x="${(x * w).toFixed(2)}" y="${top.toFixed(2)}" width="${w.toFixed(2)}" height="${Math.max(1, bottom - top).toFixed(2)}"/>`,
			);
		}

		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
			`<rect width="${width}" height="${height}" fill="${this.backgroundColour}"/>` +
			`<g fill="${this.waveColour}">${bars.join('')}</g>` +
			`</svg>`;
		downloadText(
			svg,
			`${this.intake.baseName || 'waveform'}.svg`,
			'image/svg+xml',
		);
	};

	<template>
		<div class="dt-wg">
			<div
				class="dt-wg-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				{{#unless this.intake.fileName}}
					<label class="dt-wg-drop">
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.intake.chooseFile
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-wg-drop-title"
						>{{DROP_TITLE}}</span>
					</label>
				{{/unless}}

				{{#if this.intake.busy}}
					<p class="dt-wg-status">
						<Icon @name="loader" />
						Decoding…
					</p>
				{{/if}}

				{{#if this.intake.buffer}}
					<div class="dt-wg-bar">
						<div class="dt-wg-info">
							<p
								class="dt-wg-name"
							>{{this.intake.fileName}}</p>
							<p
								class="dt-wg-meta"
							>{{this.meta}}</p>
						</div>
						<button
							type="button"
							class="dt-wg-btn"
							{{on
								"click"
								this.intake.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-wg-btn"
							{{on
								"click"
								this.exportSvg
							}}
						>
							<Icon
								@name="download"
							/>
							SVG
						</button>
						<button
							type="button"
							class="dt-wg-btn is-primary"
							{{on
								"click"
								this.exportPng
							}}
						>
							<Icon
								@name="download"
							/>
							PNG
						</button>
					</div>

					<div class="dt-wg-settings">
						<div
							class="dt-wg-field is-size"
						>
							<span>Size</span>
							<div
								class="segmented dt-wg-presets"
							>
								{{#each
									this.presets
									key="id"
									as |preset|
								}}
									<button
										type="button"
										class="dt-wg-preset
											{{if
												(eq
													this.presetId
													preset.id
												)
												'is-active'
											}}"
										aria-pressed={{if
											(eq
												this.presetId
												preset.id
											)
											"true"
											"false"
										}}
										{{on
											"click"
											(fn
												this.setPreset
												preset.id
											)
										}}
									>
										{{preset.label}}
									</button>
								{{/each}}
							</div>
						</div>
						{{#if this.isCustom}}
							<label
								class="dt-wg-field"
							>
								<span
								>Width</span>
								<input
									type="number"
									min="100"
									max="4000"
									step="10"
									value={{this.customWidth}}
									{{on
										"input"
										this.setCustomWidth
									}}
								/>
							</label>
							<label
								class="dt-wg-field"
							>
								<span
								>Height</span>
								<input
									type="number"
									min="100"
									max="4000"
									step="10"
									value={{this.customHeight}}
									{{on
										"input"
										this.setCustomHeight
									}}
								/>
							</label>
						{{/if}}
						<label class="dt-wg-field">
							<span>Wave</span>
							<input
								type="color"
								value={{this.waveColour}}
								{{on
									"input"
									this.setWaveColour
								}}
							/>
						</label>
						<label class="dt-wg-field">
							<span>Background</span>
							<input
								type="color"
								value={{this.backgroundColour}}
								{{on
									"input"
									this.setBackgroundColour
								}}
							/>
						</label>
						<label class="dt-wg-field">
							<span>Detail</span>
							<select
								{{on
									"change"
									this.setDetail
								}}
							>
								{{#each
									this.detailSteps
									key="@index"
									as |step|
								}}
									<option
										value={{step}}
										selected={{eq
											this.detailPx
											step
										}}
									>{{step}}
										px</option>
								{{/each}}
							</select>
						</label>
					</div>

					<div class="dt-wg-stage">
						<canvas
							class="dt-wg-preview"
							{{this.drawPreview}}
						></canvas>
					</div>
				{{/if}}
			</div>

			{{#if this.intake.error}}
				<p
					class="dt-wg-error"
					role="alert"
				>{{this.intake.error}}</p>
			{{/if}}
		</div>
	</template>
}
