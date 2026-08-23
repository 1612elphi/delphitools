import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import DownloadLabel from 'delphitools-v2/components/download-label';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import { downloadUrl } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	compressImageData,
	formatBytes,
	savingsPercent,
	QUALITY_FORMATS,
	COMPRESS_EXTENSIONS,
	type CompressFormat,
} from 'delphitools-v2/lib/image-compress';

interface CompressOption {
	id: CompressFormat;
	label: string;
}

const FORMATS: CompressOption[] = [
	{ id: 'mozjpeg', label: 'JPEG' },
	{ id: 'webp', label: 'WebP' },
	{ id: 'oxipng', label: 'PNG' },
	{ id: 'avif', label: 'AVIF' },
];

const DROP_HINT = 'or click to select an image, or paste';

interface SourceImage {
	file: File;
	url: string;
	width: number;
	height: number;
}

interface CompressedImage {
	blob: Blob;
	url: string;
}

async function decodeToCanvas(
	file: File,
	background: string | null,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
	let bitmap: ImageBitmap;
	try {
		// Honours EXIF orientation so a rotated phone photo re-encodes upright.
		bitmap = await createImageBitmap(file, {
			imageOrientation: 'from-image',
		});
	} catch {
		bitmap = await createImageBitmap(file);
	}
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	if (background) {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return { canvas, width: canvas.width, height: canvas.height };
}

export default class ImageCompressorTool extends Component {
	@tracked source: SourceImage | null = null;
	@tracked format: CompressFormat = 'webp';
	@tracked quality = 75;
	@tracked effort = 2;
	@tracked avifEnabled = false;
	@tracked compressed: CompressedImage | null = null;
	@tracked compressing = false;
	@tracked failed = false;

	#encodeSeq = 0;

	get hasQuality(): boolean {
		return QUALITY_FORMATS.includes(this.format);
	}

	/** AVIF stays out of the segmented row until explicitly enabled. */
	get visibleFormats(): CompressOption[] {
		return FORMATS.filter(
			(option) => option.id !== 'avif' || this.avifEnabled,
		);
	}

	get meta(): string {
		if (!this.source) return '';
		return `${this.source.width} × ${this.source.height} · ${formatBytes(this.source.file.size)}`;
	}

	get afterSize(): string {
		return this.compressed
			? formatBytes(this.compressed.blob.size)
			: '';
	}

	get savings(): number | null {
		if (!this.source || !this.compressed) return null;
		return savingsPercent(
			this.source.file.size,
			this.compressed.blob.size,
		);
	}

	get isSmaller(): boolean {
		return (this.savings ?? 0) < 0;
	}

	/** Signed badge: −45% saves, +12% grows, ±0% breaks even. */
	get savingsLabel(): string {
		const savings = this.savings;
		if (savings === null) return '';
		if (savings === 0) return '±0%';
		return `${savings < 0 ? '−' : '+'}${Math.abs(savings)}%`;
	}

	get downloadName(): string {
		if (!this.source) return '';
		return this.source.file.name.replace(
			/\.[^.]+$/,
			`.${COMPRESS_EXTENSIONS[this.format]}`,
		);
	}

	readFile = (file: File) => {
		if (!file.type.startsWith('image/')) return;
		this.#setSource(file);
	};

	handleFileSelect = (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) this.#setSource(file);
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files?.[0];
		if (file?.type.startsWith('image/')) this.#setSource(file);
	};

	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	#setSource(file: File) {
		this.#revokeSource();
		this.source = {
			file,
			url: URL.createObjectURL(file),
			width: 0,
			height: 0,
		};
		void this.#compress();
	}

	setFormat = (format: CompressFormat) => {
		this.format = format;
		void this.#compress();
	};

	setQuality = (event: Event) => {
		this.quality = Number((event.target as HTMLInputElement).value);
		void this.#compress();
	};

	setEffort = (event: Event) => {
		this.effort = Number((event.target as HTMLInputElement).value);
		void this.#compress();
	};

	toggleAvif = () => {
		this.avifEnabled = !this.avifEnabled;
		if (!this.avifEnabled && this.format === 'avif') {
			this.format = 'webp';
			void this.#compress();
		}
	};

	clear = () => {
		this.#encodeSeq++; // in-flight encodes land nowhere
		this.#revokeSource();
		this.#revokeCompressed();
		this.source = null;
		this.failed = false;
	};

	download = () => {
		if (!this.compressed) return;
		downloadUrl(this.compressed.url, this.downloadName);
	};

	async #compress() {
		const source = this.source;
		if (!source) return;
		const seq = ++this.#encodeSeq;
		this.compressing = true;
		this.failed = false;
		try {
			const { canvas, width, height } = await decodeToCanvas(
				source.file,
				// MozJPEG drops alpha; flatten onto white rather than black.
				this.format === 'mozjpeg' ? '#ffffff' : null,
			);
			const imageData = canvas
				.getContext('2d', { willReadFrequently: true })!
				.getImageData(0, 0, width, height);
			const blob = await compressImageData(
				imageData,
				this.format,
				{
					quality: this.quality,
					level: this.effort,
				},
			);
			if (seq !== this.#encodeSeq) return; // a newer setting won the race
			source.width = width;
			source.height = height;
			this.#revokeCompressed();
			this.compressed = {
				blob,
				url: URL.createObjectURL(blob),
			};
		} catch (error) {
			if (seq !== this.#encodeSeq) return;
			console.error(
				`Failed to compress ${source.file.name}:`,
				error,
			);
			this.failed = true;
		} finally {
			if (seq === this.#encodeSeq) this.compressing = false;
		}
	}

	#revokeSource() {
		if (this.source) URL.revokeObjectURL(this.source.url);
	}

	#revokeCompressed() {
		if (this.compressed) URL.revokeObjectURL(this.compressed.url);
		this.compressed = null;
	}

	<template>
		<div class="dt-ic" {{filePaste this.readFile accept="image/*"}}>
			<div class="dt-ic-frame">
				{{#unless this.source}}
					<label
						class="dt-ic-drop"
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
							class="dt-ic-drop-title"
						>Drop image here</span>
						<span
							class="dt-ic-drop-hint"
						>{{DROP_HINT}}</span>
					</label>
				{{/unless}}

				{{#if this.source}}
					<div class="dt-ic-bar">
						<div class="dt-ic-info">
							<p
								class="dt-ic-name"
							>{{this.source.file.name}}</p>
							<p
								class="dt-ic-meta"
							>{{this.meta}}</p>
						</div>
						<button
							type="button"
							class="dt-ic-btn"
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
							class="dt-ic-btn is-primary dt-ic-download"
							disabled={{not
								this.compressed
							}}
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel />
						</button>
					</div>

					<div class="dt-ic-fields">
						<div class="dt-ic-field">
							<span>Format</span>
							<div
								class="segmented dt-ic-formats
									{{if
										this.avifEnabled
										'is-avif'
									}}"
							>
								{{#each
									this.visibleFormats
									key="id"
									as |fmt|
								}}
									<button
										type="button"
										class="dt-ic-format
											{{if
												(eq
													this.format
													fmt.id
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setFormat
												fmt.id
											)
										}}
									>{{fmt.label}}</button>
								{{/each}}
							</div>
						</div>

						{{#if this.hasQuality}}
							<label
								class="dt-ic-field"
							>
								<span
								>Quality</span>
								<span
									class="dt-ic-slider"
								>
									<input
										type="range"
										min="1"
										max="100"
										step="1"
										value={{this.quality}}
										class="dt-ic-quality"
										{{on
											"input"
											this.setQuality
										}}
									/>
									<span
										class="dt-ic-readout"
									>{{this.quality}}%</span>
								</span>
							</label>
						{{else}}
							<label
								class="dt-ic-field"
							>
								<span
								>Effort</span>
								<span
									class="dt-ic-slider"
								>
									<input
										type="range"
										min="1"
										max="6"
										step="1"
										value={{this.effort}}
										class="dt-ic-effort"
										{{on
											"input"
											this.setEffort
										}}
									/>
									<span
										class="dt-ic-readout"
									>{{this.effort}}</span>
								</span>
							</label>
						{{/if}}

						<label class="dt-ic-field">
							<span>AVIF</span>
							<span
								class="dt-ic-avif"
							>
								<input
									type="checkbox"
									class="dt-ic-switch"
									checked={{this.avifEnabled}}
									{{on
										"change"
										this.toggleAvif
									}}
								/>
								<span
									class="dt-ic-note"
								>AVIF is slow</span>
							</span>
						</label>
					</div>

					<div class="dt-ic-compare">
						<figure class="dt-ic-pane">
							<img
								src={{this.source.url}}
								alt="Original"
							/>
							<figcaption
								class="dt-ic-pane-meta"
							>
								<span
								>Before</span>
								<span
								>{{formatBytes
										this.source.file.size
									}}</span>
							</figcaption>
						</figure>
						<figure class="dt-ic-pane">
							{{#if this.compressed}}
								<img
									src={{this.compressed.url}}
									alt="Compressed"
									class="dt-ic-after-img"
								/>
							{{else}}
								<p
									class="dt-ic-status"
								>
									<NdsLoader
									/>
									{{if
										this.failed
										"Failed"
										"Compressing…"
									}}
								</p>
							{{/if}}
							<figcaption
								class="dt-ic-pane-meta"
							>
								<span
								>After</span>
								{{#if
									this.compressed
								}}
									<span
										class="dt-ic-after-size"
									>
										{{this.afterSize}}
										<span
											class="dt-ic-savings
												{{unless
													this.isSmaller
													'is-larger'
												}}"
										>{{this.savingsLabel}}</span>
									</span>
								{{/if}}
							</figcaption>
						</figure>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
