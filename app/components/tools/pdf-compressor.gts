import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	compressPdf,
	formatBytes,
	savingsPercent,
} from 'delphitools-v2/lib/pdf-compress';

const ACCEPT = '.pdf,application/pdf';

interface SizeOption {
	value: number;
	label: string;
}

/** Longest-edge caps for image downscaling; 0 keeps full resolution. */
const MAX_SIZES: SizeOption[] = [
	{ value: 0, label: 'Full' },
	{ value: 2400, label: '2400' },
	{ value: 1600, label: '1600' },
	{ value: 1000, label: '1000' },
];

interface Source {
	file: File;
	size: number;
}

interface Compressed {
	blob: Blob;
	size: number;
	pageCount: number;
	imagesTouched: number;
}

export default class PdfCompressorTool extends Component {
	@tracked source: Source | null = null;
	@tracked recompressImages = true;
	@tracked quality = 65;
	@tracked maxEdge = 0;
	@tracked compressed: Compressed | null = null;
	@tracked compressing = false;
	@tracked failed = false;

	#bytes: ArrayBuffer | null = null;
	#seq = 0;

	get sizes() {
		return MAX_SIZES;
	}

	get beforeSize(): string {
		return this.source ? formatBytes(this.source.size) : '';
	}

	get afterSize(): string {
		return this.compressed ? formatBytes(this.compressed.size) : '';
	}

	get imagesLabel(): string {
		const n = this.compressed?.imagesTouched ?? 0;
		return n > 0 ? `${n} image${n === 1 ? '' : 's'}` : '';
	}

	get savings(): number | null {
		if (!this.source || !this.compressed) return null;
		return savingsPercent(this.source.size, this.compressed.size);
	}

	/** True when the output grew — nothing was left to squeeze out. */
	get isLarger(): boolean {
		return (this.savings ?? 0) > 0;
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
		return (
			this.source.file.name.replace(/\.pdf$/i, '') +
			'-small.pdf'
		);
	}

	readFile = (file: File) => {
		if (
			file.type !== 'application/pdf' &&
			!/\.pdf$/i.test(file.name)
		)
			return;
		void this.#setSource(file);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void this.#setSource(file);
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = [...(event.dataTransfer?.files ?? [])].find(
			(f) =>
				f.type === 'application/pdf' ||
				/\.pdf$/i.test(f.name),
		);
		if (file) void this.#setSource(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	async #setSource(file: File) {
		this.#seq++; // any in-flight compress lands nowhere
		this.compressed = null;
		this.failed = false;
		this.source = { file, size: file.size };
		this.#bytes = await file.arrayBuffer();
	}

	/** A setting changed: the shown result is now stale, so drop it. */
	#invalidate() {
		this.compressed = null;
		this.failed = false;
	}

	setImages = (recompress: boolean) => {
		if (recompress === this.recompressImages) return;
		this.recompressImages = recompress;
		this.#invalidate();
	};

	setQuality = (event: Event) => {
		this.quality = Number((event.target as HTMLInputElement).value);
		this.#invalidate();
	};

	setMaxEdge = (value: number) => {
		if (value === this.maxEdge) return;
		this.maxEdge = value;
		this.#invalidate();
	};

	clear = () => {
		this.#seq++;
		this.source = null;
		this.compressed = null;
		this.failed = false;
		this.#bytes = null;
	};

	download = () => {
		if (this.compressed)
			downloadBlob(this.compressed.blob, this.downloadName);
	};

	compress = () => {
		void this.#compress();
	};

	async #compress() {
		const bytes = this.#bytes;
		if (!bytes || this.compressing) return;
		const seq = ++this.#seq;
		this.compressing = true;
		this.failed = false;
		try {
			// A copy: the worker transfers (detaches) the buffer it is handed.
			const result = await compressPdf(bytes.slice(0), {
				recompressImages: this.recompressImages,
				quality: this.quality,
				maxEdge: this.maxEdge,
			});
			if (seq !== this.#seq) return; // a newer file or setting won the race
			this.compressed = {
				blob: new Blob([result.bytes], {
					type: 'application/pdf',
				}),
				size: result.bytes.byteLength,
				pageCount: result.pageCount,
				imagesTouched: result.imagesTouched,
			};
		} catch {
			if (seq === this.#seq) this.failed = true;
		} finally {
			if (seq === this.#seq) this.compressing = false;
		}
	}

	<template>
		<div class="dt-pcmp" {{filePaste this.readFile accept=ACCEPT}}>
			<div
				class="dt-pcmp-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				{{#unless this.source}}
					<label class="dt-pcmp-drop">
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="shrink" />
						<span
							class="dt-pcmp-drop-title"
						>Drop PDF here</span>
						<span
							class="dt-pcmp-drop-hint"
						>click or paste</span>
					</label>
				{{/unless}}

				{{#if this.source}}
					<div class="dt-pcmp-bar">
						<div class="dt-pcmp-info">
							<p
								class="dt-pcmp-name"
							>{{this.source.file.name}}</p>
							<p
								class="dt-pcmp-meta"
							>{{this.beforeSize}}</p>
						</div>
						<button
							type="button"
							class="dt-pcmp-btn"
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
							class="dt-pcmp-btn is-primary"
							disabled={{this.compressing}}
							{{on
								"click"
								this.compress
							}}
						>
							{{#if this.compressing}}
								<NdsLoader />
							{{else}}
								<Icon
									@name="shrink"
								/>
							{{/if}}
							{{if
								this.compressing
								"Compressing…"
								"Compress"
							}}
						</button>
						<button
							type="button"
							class="dt-pcmp-btn"
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

					<div class="dt-pcmp-fields">
						<div class="dt-pcmp-field">
							<span>Images</span>
							<div
								class="segmented dt-pcmp-images"
							>
								<button
									type="button"
									class="dt-pcmp-opt
										{{if
											this.recompressImages
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setImages
											true
										)
									}}
								>Recompress</button>
								<button
									type="button"
									class="dt-pcmp-opt
										{{unless
											this.recompressImages
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setImages
											false
										)
									}}
								>Keep</button>
							</div>
						</div>

						{{#if this.recompressImages}}
							<label
								class="dt-pcmp-field"
							>
								<span
								>Quality</span>
								<span
									class="dt-pcmp-slider"
								>
									<input
										type="range"
										min="30"
										max="90"
										step="1"
										value={{this.quality}}
										{{on
											"input"
											this.setQuality
										}}
									/>
									<span
										class="dt-pcmp-readout"
									>{{this.quality}}</span>
								</span>
							</label>

							<div
								class="dt-pcmp-field"
							>
								<span>Max size</span>
								<div
									class="segmented dt-pcmp-sizes"
								>
									{{#each
										this.sizes
										key="value"
										as |s|
									}}
										<button
											type="button"
											class="dt-pcmp-opt
												{{if
													(eq
														this.maxEdge
														s.value
													)
													'is-active'
												}}"
											{{on
												"click"
												(fn
													this.setMaxEdge
													s.value
												)
											}}
										>{{s.label}}</button>
									{{/each}}
								</div>
							</div>
						{{/if}}
					</div>

					<div class="dt-pcmp-result">
						<div class="dt-pcmp-stat">
							<span
								class="dt-pcmp-stat-label"
							>Before</span>
							<span
								class="dt-pcmp-stat-value"
							>{{this.beforeSize}}</span>
						</div>
						<Icon @name="arrow-right" />
						<div class="dt-pcmp-stat">
							<span
								class="dt-pcmp-stat-label"
							>After</span>
							{{#if this.compressed}}
								<span
									class="dt-pcmp-stat-value"
								>
									{{this.afterSize}}
									<span
										class="dt-pcmp-savings
											{{if
												this.isLarger
												'is-larger'
											}}"
									>{{this.savingsLabel}}</span>
								</span>
								{{#if
									this.imagesLabel
								}}
									<span
										class="dt-pcmp-substat"
									>{{this.imagesLabel}}</span>
								{{/if}}
							{{else if
								this.compressing
							}}
								<span
									class="dt-pcmp-status"
								>
									<NdsLoader
									/>
									Compressing…
								</span>
							{{else if this.failed}}
								<span
									class="dt-pcmp-status"
								>Failed</span>
							{{else}}
								<span
									class="dt-pcmp-stat-value dt-pcmp-idle"
								>—</span>
							{{/if}}
						</div>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
