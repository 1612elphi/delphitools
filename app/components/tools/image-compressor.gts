import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { registerDestructor, isDestroying } from '@ember/destroyable';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCompressionScale from 'delphicanon/components/canon-compression-scale';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonImageCompare from 'delphicanon/components/canon-image-compare';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import { IconSvg } from 'delphitools-v2/components/icon';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	compressImageData,
	stopCompression,
	formatBytes,
	COMPRESS_EXTENSIONS,
	QUALITY_FORMATS,
	type CompressFormat,
} from 'delphitools-v2/lib/image-compress';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import './image-compressor/image-compressor.css';

const FORMATS: { id: CompressFormat; label: string }[] = [
	{ id: 'mozjpeg', label: 'JPEG' },
	{ id: 'webp', label: 'WebP' },
	{ id: 'oxipng', label: 'PNG' },
	{ id: 'avif', label: 'AVIF' },
	{ id: 'jxl', label: 'JXL' },
];

const whole = (value: number) => String(Math.round(value));

const keepPaste = (event: Event) => event.stopPropagation();

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface Source {
	file: File;
	url: string;
	bitmap?: ImageBitmap;
}

function launchFlags() {
	const query = new URLSearchParams(window.location.search);
	const label = query.get('compressFormat')?.toLowerCase();
	const format = FORMATS.find((f) => f.label.toLowerCase() === label)?.id;
	const clamp = (
		key: string,
		min: number,
		max: number,
		fallback: number,
	) => {
		const value = Number(query.get(key) ?? fallback);
		return Number.isFinite(value)
			? Math.min(max, Math.max(min, Math.round(value)))
			: fallback;
	};
	return {
		sample: query.has('compressSample'),
		format: format ?? 'webp',
		quality: clamp('compressQuality', 1, 100, 75),
		effort: clamp('compressEffort', 1, 6, 2),
	};
}

function pixelsOf(bitmap: ImageBitmap, background: string | null) {
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	if (background) {
		context.fillStyle = background;
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(bitmap, 0, 0);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

const STALE_MS = 300;

export default class ImageCompressor extends Component {
	@tracked source?: Source;
	@tracked format: CompressFormat;
	@tracked quality: number;
	@tracked effort: number;
	@tracked result?: { blob: Blob; url: string };
	@tracked failed = false;
	@tracked decoding = false;
	@tracked busy = false;

	#queued = false;
	#started = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags();
		this.format = flags.format;
		this.quality = flags.quality;
		this.effort = flags.effort;
		registerDestructor(this, () => this.#release());
		if (flags.sample)
			void drawnSample().then((file) => this.load(file));
	}

	get formatLabels() {
		return FORMATS.map((f) => f.label);
	}

	get formatIndex() {
		return FORMATS.findIndex((f) => f.id === this.format);
	}

	get formatLabel() {
		return FORMATS.find((f) => f.id === this.format)!.label;
	}

	get working() {
		return this.decoding || (this.busy && !!this.source?.bitmap);
	}

	get hasQuality() {
		return QUALITY_FORMATS.includes(this.format);
	}

	get meta() {
		const { source } = this;
		if (!source) return '';
		const size = formatBytes(source.file.size);
		return source.bitmap
			? `${source.bitmap.width} × ${source.bitmap.height} · ${size}`
			: size;
	}

	get aspect() {
		const bitmap = this.source?.bitmap;
		return bitmap ? Math.max(1, bitmap.width / bitmap.height) : 1.5;
	}

	get downloadName() {
		if (!this.source) return '';
		return this.source.file.name.replace(
			/(\.[^.]+)?$/,
			`.${COMPRESS_EXTENSIONS[this.format]}`,
		);
	}

	loadFiles = (files: File[]) => {
		if (files[0]) void this.load(files[0]);
	};

	allowDrop = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	dropAnywhere = (event: DragEvent) => {
		if (event.defaultPrevented) return;
		const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
			matchesAccept(f, 'image/*'),
		);
		if (!file) return;
		event.preventDefault();
		void this.load(file);
	};

	load = async (file: File) => {
		this.clear();
		const source: Source = { file, url: URL.createObjectURL(file) };
		this.source = source;
		this.decoding = true;
		let bitmap: ImageBitmap;
		try {
			bitmap = await decodeImage(file);
		} catch {
			if (this.source !== source) return;
			this.decoding = false;
			this.failed = true;
			return;
		}
		if (this.source !== source || isDestroying(this)) {
			bitmap.close();
			return;
		}
		this.decoding = false;
		this.source = { ...source, bitmap };
		this.#compress();
	};

	clear = () => {
		this.#release();
		this.source = undefined;
		this.result = undefined;
		this.failed = false;
		this.decoding = false;
	};

	pickFormat = (index: number) => {
		const format = FORMATS[index]?.id;
		if (!format || format === this.format) return;
		this.format = format;
		this.#compress();
	};

	pickQuality = (value: number) => {
		if (value === this.quality) return;
		this.quality = value;
		this.#compress();
	};

	pickEffort = (value: number) => {
		if (value === this.effort) return;
		this.effort = value;
		this.#compress();
	};

	save = () => {
		if (this.result)
			downloadBlob(this.result.blob, this.downloadName);
	};

	#compress() {
		if (!this.source?.bitmap) return;
		this.failed = false;
		if (this.busy) {
			this.#queued = true;
			// ponytail: fixed 300 ms; a short encode finishes sooner than a new worker starts
			if (performance.now() - this.#started > STALE_MS)
				stopCompression(new Error('superseded'));
			return;
		}
		void this.#drain();
	}

	async #drain() {
		this.busy = true;
		for (;;) {
			this.#queued = false;
			const { source, format } = this;
			if (!source?.bitmap) break;
			let blob: Blob | undefined;
			this.#started = performance.now();
			try {
				blob = await compressImageData(
					pixelsOf(
						source.bitmap,
						format === 'mozjpeg'
							? '#ffffff'
							: null,
					),
					format,
					{
						quality: this.quality,
						level: this.effort,
					},
				);
			} catch (error) {
				if (this.#queued) continue;
				console.error(
					`Failed to compress ${source.file.name}:`,
					error,
				);
			}
			if (isDestroying(this)) return;
			if (this.#queued) continue;
			if (source !== this.source) break;
			if (this.result) URL.revokeObjectURL(this.result.url);
			this.result = blob
				? { blob, url: URL.createObjectURL(blob) }
				: undefined;
			this.failed = !blob;
			break;
		}
		this.busy = false;
	}

	#release() {
		if (this.source) {
			URL.revokeObjectURL(this.source.url);
			this.source.bitmap?.close();
		}
		if (this.result) URL.revokeObjectURL(this.result.url);
	}

	<template>
		<CanonSplit
			class="image-compressor"
			@mainLeadsStacked={{true}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
		>
			<:banner>
				<CanonCanvas @height={{176}}>
					<CanonCompressionScale
						@before={{if
							this.source
							this.source.file.size
							0
						}}
						@after={{if
							this.result
							this.result.blob.size
							0
						}}
						@format={{if
							this.source
							this.formatLabel
							"Compressed"
						}}
						@working={{this.working}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					{{#if this.source}}
						<CanonHeading @text="Source" />
						<CanonRow
							class="ic-source"
							@title={{this.source.file.name}}
							@detail={{this.meta}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{/if}}
					<CanonHeading @text="Format" />
					<CanonSegmented
						class="ic-formats"
						@items={{this.formatLabels}}
						@selected={{this.formatIndex}}
						@onChange={{this.pickFormat}}
					/>
					{{#if this.hasQuality}}
						<CanonRow
							class="ic-quality"
							@title="Quality"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.quality}}
								@min={{1}}
								@max={{100}}
								@step={{1}}
								@readout={{whole}}
								@labelledBy={{titleId}}
								@onChange={{this.pickQuality}}
							/>
						</CanonRow>
					{{else}}
						<CanonRow
							class="ic-effort"
							@title="Effort"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.effort}}
								@min={{1}}
								@max={{6}}
								@step={{1}}
								@readout={{whole}}
								@labelledBy={{titleId}}
								@onChange={{this.pickEffort}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.source}}
						<CanonButton
							class="ic-download"
							@kind="primary"
							@text={{passAlong
								"Download"
							}}
							@icon={{Save}}
							@disabled={{if
								this.result
								false
								true
							}}
							@onClick={{this.save}}
						/>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonCanvas
						@aspect={{this.aspect}}
						@boxing="unlessWide"
						@background="var(--canon-muted)"
					>
						<CanonImageCompare
							@before={{if
								this.source.bitmap
								this.source.url
							}}
							@after={{this.result.url}}
							@failed={{this.failed}}
							@failure="Failed"
						/>
						{{#if this.working}}
							<CanonLoader
								class="ic-encoding"
							/>
						{{/if}}
					</CanonCanvas>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonDropZone
							class="ic-drop"
							@prompt="Drop an image"
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
