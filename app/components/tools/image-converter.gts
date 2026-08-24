import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { LinkTo } from '@ember/routing';
import { eq } from 'ember-truth-helpers';
import DownloadLabel from 'delphitools-v2/components/download-label';
import Icon from 'delphitools-v2/components/icon';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { downloadBlob, downloadUrl } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import { encodeJxl } from 'delphitools-v2/lib/jxl';
import { encodeGif, type GifQuantisation } from 'delphitools-v2/lib/gif';
import { encodeTiff } from 'delphitools-v2/lib/tiff';

type ImageFormat =
	| 'png'
	| 'jpeg'
	| 'webp'
	| 'jxl'
	| 'gif'
	| 'bmp'
	| 'tiff'
	| 'ico'
	| 'icns';

type ResizeMode = 'original' | 'custom' | 'percentage';

const FORMATS: ImageFormat[] = [
	'png',
	'jpeg',
	'webp',
	'jxl',
	'gif',
	'bmp',
	'tiff',
	'ico',
	'icns',
];

const UNPREVIEWABLE: ImageFormat[] = ['ico', 'icns', 'bmp', 'tiff', 'jxl'];

const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];
const ICO_SIZE_LIST = ICO_SIZES.join(', ');
const ICNS_SIZE_LIST = ICNS_SIZES.join(', ');
const SCALE_PRESETS = [25, 50, 75, 150, 200];

const ICNS_TYPES: Record<number, string> = {
	16: 'icp4',
	32: 'icp5',
	64: 'icp6',
	128: 'ic07',
	256: 'ic08',
	512: 'ic09',
	1024: 'ic10',
};

const QUANTISATIONS: { value: GifQuantisation; label: string }[] = [
	{ value: 'rgb565', label: 'RGB565 (best quality)' },
	{ value: 'rgb444', label: 'RGB444 (smaller)' },
	{ value: 'rgba4444', label: 'RGBA4444 (with transparency)' },
];

const RESIZE_MODES: { value: ResizeMode; label: string }[] = [
	{ value: 'original', label: 'Original' },
	{ value: 'custom', label: 'Dimensions' },
	{ value: 'percentage', label: 'Scale' },
];

interface SourceImage {
	file: File;
	url: string;
	size: string;
}

interface ConvertedImage {
	name: string;
	blob: Blob;
	size: string;
	url: string;
	previewable: boolean;
}

interface Dimensions {
	width: number;
	height: number;
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	mimeType: string,
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(
							new Error(
								'Canvas toBlob failed',
							),
						),
			mimeType,
			quality === undefined ? undefined : quality / 100,
		);
	});
}

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const url = URL.createObjectURL(file);
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error(`Failed to load image: ${file.name}`));
		};
		image.src = url;
	});
}

function prepareCanvas(
	image: HTMLImageElement,
	{ width, height }: Dimensions,
	background: string | null,
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	if (background) {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, width, height);
	}
	ctx.drawImage(image, 0, 0, width, height);
	return canvas;
}

function imageData(canvas: HTMLCanvasElement): ImageData {
	return canvas
		.getContext('2d')!
		.getImageData(0, 0, canvas.width, canvas.height);
}

async function resizedPngs(
	canvas: HTMLCanvasElement,
	sizes: number[],
): Promise<ArrayBuffer[]> {
	const square = document.createElement('canvas');
	const ctx = square.getContext('2d')!;
	const buffers: ArrayBuffer[] = [];
	for (const size of sizes) {
		square.width = size;
		square.height = size;
		ctx.clearRect(0, 0, size, size);
		ctx.drawImage(canvas, 0, 0, size, size);
		buffers.push(
			await (
				await canvasToBlob(square, 'image/png')
			).arrayBuffer(),
		);
	}
	return buffers;
}

function encodeBmp(data: ImageData, bitDepth: 24 | 32): Blob {
	const { width, height } = data;
	const pixels = data.data;
	const bytesPerPixel = bitDepth / 8;
	const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4;
	const pixelDataSize = rowSize * height;
	const headerSize = 14 + 40;
	const fileSize = headerSize + pixelDataSize;

	const buffer = new ArrayBuffer(fileSize);
	const view = new DataView(buffer);

	view.setUint8(0, 0x42);
	view.setUint8(1, 0x4d);
	view.setUint32(2, fileSize, true);
	view.setUint32(10, headerSize, true);

	view.setUint32(14, 40, true);
	view.setInt32(18, width, true);
	// top-down bmp rows
	view.setInt32(22, -height, true);
	view.setUint16(26, 1, true);
	view.setUint16(28, bitDepth, true);
	view.setUint32(30, 0, true);
	view.setUint32(34, pixelDataSize, true);
	// 72 dpi
	view.setUint32(38, 2835, true);
	view.setUint32(42, 2835, true);

	for (let y = 0; y < height; y++) {
		let offset = headerSize + y * rowSize;
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			view.setUint8(offset++, pixels[i + 2]!);
			view.setUint8(offset++, pixels[i + 1]!);
			view.setUint8(offset++, pixels[i]!);
			if (bitDepth === 32) {
				view.setUint8(offset++, pixels[i + 3]!);
			}
		}
	}

	return new Blob([buffer], { type: 'image/bmp' });
}

// ico header with pngs
function buildIco(sizes: number[], pngs: ArrayBuffer[]): Blob {
	const headerSize = 6 + sizes.length * 16;
	const buffer = new ArrayBuffer(
		headerSize + pngs.reduce((sum, png) => sum + png.byteLength, 0),
	);
	const view = new DataView(buffer);

	view.setUint16(0, 0, true);
	view.setUint16(2, 1, true);
	view.setUint16(4, sizes.length, true);

	let dataOffset = headerSize;
	sizes.forEach((size, i) => {
		const entry = 6 + i * 16;
		const png = pngs[i]!;
		// zero encodes 256 pixels
		view.setUint8(entry, size >= 256 ? 0 : size);
		view.setUint8(entry + 1, size >= 256 ? 0 : size);
		view.setUint8(entry + 2, 0);
		view.setUint8(entry + 3, 0);
		view.setUint16(entry + 4, 1, true);
		view.setUint16(entry + 6, 32, true);
		view.setUint32(entry + 8, png.byteLength, true);
		view.setUint32(entry + 12, dataOffset, true);
		new Uint8Array(buffer, dataOffset, png.byteLength).set(
			new Uint8Array(png),
		);
		dataOffset += png.byteLength;
	});

	return new Blob([buffer], { type: 'image/x-icon' });
}

// icns big-endian png blocks
function buildIcns(types: string[], pngs: ArrayBuffer[]): Blob {
	const fileSize =
		8 + pngs.reduce((sum, png) => sum + 8 + png.byteLength, 0);
	const buffer = new ArrayBuffer(fileSize);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	bytes.set([0x69, 0x63, 0x6e, 0x73]);
	view.setUint32(4, fileSize, false);

	let offset = 8;
	types.forEach((type, i) => {
		const png = pngs[i]!;
		for (let c = 0; c < 4; c++) {
			bytes[offset + c] = type.charCodeAt(c);
		}
		view.setUint32(offset + 4, 8 + png.byteLength, false);
		new Uint8Array(buffer, offset + 8, png.byteLength).set(
			new Uint8Array(png),
		);
		offset += 8 + png.byteLength;
	});

	return new Blob([buffer], { type: 'image/x-icns' });
}

export default class ImageConverterTool extends Component {
	@tracked sources: SourceImage[] = [];
	@tracked targetFormat: ImageFormat = 'webp';
	@tracked converted: ConvertedImage[] = [];
	@tracked converting = false;

	@tracked resizeMode: ResizeMode = 'original';
	@tracked resizeWidth = 0;
	@tracked resizeHeight = 0;
	@tracked percentage = 100;
	@tracked lockAspect = true;

	@tracked pngTransparency = true;
	@tracked pngBackground = '#ffffff';
	@tracked jpegQuality = 90;
	@tracked jpegBackground = '#ffffff';
	@tracked webpLossless = false;
	@tracked webpQuality = 90;
	@tracked jxlLossless = false;
	@tracked jxlQuality = 90;
	@tracked gifMaxColours = 256;
	@tracked gifQuantisation: GifQuantisation = 'rgb565';
	@tracked bmpBitDepth: 24 | 32 = 32;
	@tracked icoMultiSize = false;
	@tracked icoSize = 32;
	@tracked icnsMultiSize = false;
	@tracked icnsSize = 128;

	willDestroy() {
		super.willDestroy();
		this.sources.forEach((source) =>
			URL.revokeObjectURL(source.url),
		);
		this.#revokeConverted();
	}

	get formatName() {
		return this.targetFormat.toUpperCase();
	}

	get countLabel() {
		const count = this.sources.length;
		return `${count} image${count === 1 ? '' : 's'} selected`;
	}

	get quantisationLabel() {
		return QUANTISATIONS.find(
			(option) => option.value === this.gifQuantisation,
		)!.label;
	}

	get widthValue() {
		return this.resizeWidth || '';
	}

	get heightValue() {
		return this.resizeHeight || '';
	}

	get canZip() {
		return this.converted.length >= 2;
	}

	#revokeConverted() {
		this.converted.forEach((image) =>
			URL.revokeObjectURL(image.url),
		);
	}

	#addFiles(files: File[]) {
		const images = files.filter((file) =>
			file.type.startsWith('image/'),
		);
		if (images.length === 0) return;
		this.#revokeConverted();
		this.converted = [];
		this.sources = [
			...this.sources,
			...images.map((file) => ({
				file,
				url: URL.createObjectURL(file),
				size: formatBytes(file.size),
			})),
		];
	}

	readFile = (file: File) => this.#addFiles([file]);

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		this.#addFiles([...(input.files ?? [])]);
		// allows same file selection
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		this.#addFiles([...(event.dataTransfer?.files ?? [])]);
	};

	// prevent dropped-file navigation
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	removeImage = (source: SourceImage) => {
		URL.revokeObjectURL(source.url);
		this.sources = this.sources.filter((entry) => entry !== source);
		this.#revokeConverted();
		this.converted = [];
	};

	clearAll = () => {
		this.sources.forEach((source) =>
			URL.revokeObjectURL(source.url),
		);
		this.#revokeConverted();
		this.sources = [];
		this.converted = [];
	};

	setFormat = (format: ImageFormat) => (this.targetFormat = format);
	setResizeMode = (mode: ResizeMode) => (this.resizeMode = mode);
	setPercentage = (value: number) => (this.percentage = value);
	setBmpBitDepth = (depth: 24 | 32) => (this.bmpBitDepth = depth);
	setIcoSize = (size: number) => (this.icoSize = size);
	setIcnsSize = (size: number) => (this.icnsSize = size);
	setQuantisation = (value: string) =>
		(this.gifQuantisation = value as GifQuantisation);

	toggleLockAspect = () => (this.lockAspect = !this.lockAspect);
	togglePngTransparency = () =>
		(this.pngTransparency = !this.pngTransparency);
	toggleWebpLossless = () => (this.webpLossless = !this.webpLossless);
	toggleJxlLossless = () => (this.jxlLossless = !this.jxlLossless);
	toggleIcoMultiSize = () => (this.icoMultiSize = !this.icoMultiSize);
	toggleIcnsMultiSize = () => (this.icnsMultiSize = !this.icnsMultiSize);

	setWidth = (event: Event) => (this.resizeWidth = numberFrom(event));
	setHeight = (event: Event) => (this.resizeHeight = numberFrom(event));
	setCustomPercentage = (event: Event) =>
		(this.percentage = numberFrom(event));
	setJpegQuality = (event: Event) =>
		(this.jpegQuality = numberFrom(event));
	setWebpQuality = (event: Event) =>
		(this.webpQuality = numberFrom(event));
	setJxlQuality = (event: Event) => (this.jxlQuality = numberFrom(event));
	setGifMaxColours = (event: Event) =>
		(this.gifMaxColours = numberFrom(event));
	setPngBackground = (event: Event) =>
		(this.pngBackground = valueFrom(event));
	setJpegBackground = (event: Event) =>
		(this.jpegBackground = valueFrom(event));

	#targetDimensions(image: HTMLImageElement): Dimensions {
		const natural = {
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
		if (this.resizeMode === 'percentage') {
			const scale = this.percentage / 100;
			return {
				width: Math.round(natural.width * scale),
				height: Math.round(natural.height * scale),
			};
		}
		if (this.resizeMode !== 'custom') return natural;

		const width = this.resizeWidth || natural.width;
		const height = this.resizeHeight || natural.height;
		if (!this.lockAspect) return { width, height };

		// width overrides locked height
		const aspect = natural.width / natural.height;
		if (this.resizeHeight && !this.resizeWidth) {
			return { width: Math.round(height * aspect), height };
		}
		return { width, height: Math.round(width / aspect) };
	}

	get backgroundFill(): string | null {
		if (this.targetFormat === 'jpeg') return this.jpegBackground;
		if (this.targetFormat === 'png' && !this.pngTransparency) {
			return this.pngBackground;
		}
		if (this.targetFormat === 'bmp' && this.bmpBitDepth === 24) {
			return '#ffffff';
		}
		return null;
	}

	async #encode(canvas: HTMLCanvasElement): Promise<Blob> {
		switch (this.targetFormat) {
			case 'png':
				return canvasToBlob(canvas, 'image/png');
			case 'jpeg':
				return canvasToBlob(
					canvas,
					'image/jpeg',
					this.jpegQuality,
				);
			case 'webp':
				return canvasToBlob(
					canvas,
					'image/webp',
					this.webpLossless
						? 100
						: this.webpQuality,
				);
			case 'jxl':
				return encodeJxl(canvas, {
					quality: this.jxlQuality,
					lossless: this.jxlLossless,
				});
			case 'gif': {
				const data = imageData(canvas);
				return new Blob(
					[
						encodeGif(
							data.data,
							data.width,
							data.height,
							this.gifMaxColours,
							this.gifQuantisation,
						),
					],
					{ type: 'image/gif' },
				);
			}
			case 'bmp':
				return encodeBmp(
					imageData(canvas),
					this.bmpBitDepth,
				);
			case 'tiff': {
				const data = imageData(canvas);
				return new Blob(
					[
						encodeTiff(
							data.data,
							data.width,
							data.height,
						),
					],
					{ type: 'image/tiff' },
				);
			}
			case 'ico': {
				const sizes = this.icoMultiSize
					? ICO_SIZES
					: [this.icoSize];
				return buildIco(
					sizes,
					await resizedPngs(canvas, sizes),
				);
			}
			case 'icns': {
				const sizes = (
					this.icnsMultiSize
						? ICNS_SIZES
						: [this.icnsSize]
				).filter((size) => ICNS_TYPES[size]);
				return buildIcns(
					sizes.map((size) => ICNS_TYPES[size]!),
					await resizedPngs(canvas, sizes),
				);
			}
		}
	}

	convert = async () => {
		this.converting = true;
		this.#revokeConverted();
		const extension =
			this.targetFormat === 'jpeg'
				? 'jpg'
				: this.targetFormat;
		const previewable = !UNPREVIEWABLE.includes(this.targetFormat);
		const results: ConvertedImage[] = [];

		for (const source of this.sources) {
			try {
				const image = await loadImage(source.file);
				const canvas = prepareCanvas(
					image,
					this.#targetDimensions(image),
					this.backgroundFill,
				);
				const blob = await this.#encode(canvas);
				results.push({
					name: source.file.name.replace(
						/\.[^.]+$/,
						`.${extension}`,
					),
					blob,
					size: formatBytes(blob.size),
					url: URL.createObjectURL(blob),
					previewable,
				});
			} catch (error) {
				console.error(
					`Failed to convert ${source.file.name}:`,
					error,
				);
			}
		}

		this.converted = results;
		this.converting = false;
	};

	download = (image: ConvertedImage) => {
		downloadUrl(image.url, image.name);
	};

	downloadZip = async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		for (const image of this.converted) {
			zip.file(image.name, image.blob);
		}
		const blob = await zip.generateAsync({ type: 'blob' });
		downloadBlob(blob, 'converted-images.zip');
	};

	<template>
		<div
			class="dt-conv"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-conv-frame">
				<label
					class="dt-conv-drop"
					{{on "drop" this.handleDrop}}
					{{on "dragover" this.allowDrop}}
				>
					<input
						type="file"
						accept="image/*"
						multiple
						class="dt-sr-only"
						{{on
							"change"
							this.handleFileSelect
						}}
					/>
					<Icon @name="upload" />
					<span class="dt-conv-drop-title">Drop
						images here</span>
					<span class="dt-conv-drop-hint">or click
						to select files, or paste</span>
				</label>

				<div class="dt-conv-section">
					<span class="dt-conv-label">Convert to</span>
					<div class="segmented dt-conv-formats">
						{{#each
							FORMATS key="@index"
							as |format|
						}}
							<button
								type="button"
								class="dt-conv-format
									{{if
										(eq
											this.targetFormat
											format
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setFormat
										format
									)
								}}
							>{{format}}</button>
						{{/each}}
						<LinkTo
							class="dt-conv-format"
							@route="tools.tool"
							@model="image-tracer"
						>
							<Icon @name="link" />
							SVG
						</LinkTo>
					</div>
				</div>

				<div class="dt-conv-panels">
					<div class="dt-conv-panel">
						<span
							class="dt-conv-label"
						>{{this.formatName}}
							Options</span>

						{{#if
							(eq
								this.targetFormat
								"png"
							)
						}}
							<label
								class="dt-conv-row"
							>
								<span>Preserve
									transparency</span>
								<input
									type="checkbox"
									class="dt-conv-switch"
									checked={{this.pngTransparency}}
									{{on
										"change"
										this.togglePngTransparency
									}}
								/>
							</label>
							{{#unless
								this.pngTransparency
							}}
								<label
									class="dt-conv-row"
								>
									<span
									>Background
										colour</span>
									<span
										class="dt-conv-swatch"
									>
										<input
											type="color"
											value={{this.pngBackground}}
											{{on
												"input"
												this.setPngBackground
											}}
										/>
										<code
										>{{this.pngBackground}}</code>
									</span>
								</label>
							{{/unless}}
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"jpeg"
							)
						}}
							<div
								class="dt-conv-slider"
							>
								<label
									for="dt-conv-jpeg-quality"
								>Quality</label>
								<input
									id="dt-conv-jpeg-quality"
									type="range"
									min="1"
									max="100"
									step="1"
									value={{this.jpegQuality}}
									{{on
										"input"
										this.setJpegQuality
									}}
								/>
								<span
									class="dt-conv-readout"
								>{{this.jpegQuality}}%</span>
							</div>
							<label
								class="dt-conv-row"
							>
								<span>Background
									colour</span>
								<span
									class="dt-conv-swatch"
								>
									<input
										type="color"
										value={{this.jpegBackground}}
										{{on
											"input"
											this.setJpegBackground
										}}
									/>
									<code
									>{{this.jpegBackground}}</code>
								</span>
							</label>
							<p
								class="dt-conv-note"
							>Used when input has
								transparency</p>
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"webp"
							)
						}}
							<label
								class="dt-conv-row"
							>
								<span
								>Lossless</span>
								<input
									type="checkbox"
									class="dt-conv-switch"
									checked={{this.webpLossless}}
									{{on
										"change"
										this.toggleWebpLossless
									}}
								/>
							</label>
							{{#unless
								this.webpLossless
							}}
								<div
									class="dt-conv-slider"
								>
									<label
										for="dt-conv-webp-quality"
									>Quality</label>
									<input
										id="dt-conv-webp-quality"
										type="range"
										min="1"
										max="100"
										step="1"
										value={{this.webpQuality}}
										{{on
											"input"
											this.setWebpQuality
										}}
									/>
									<span
										class="dt-conv-readout"
									>{{this.webpQuality}}%</span>
								</div>
							{{/unless}}
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"jxl"
							)
						}}
							<label
								class="dt-conv-row"
							>
								<span
								>Lossless</span>
								<input
									type="checkbox"
									class="dt-conv-switch"
									checked={{this.jxlLossless}}
									{{on
										"change"
										this.toggleJxlLossless
									}}
								/>
							</label>
							{{#unless
								this.jxlLossless
							}}
								<div
									class="dt-conv-slider"
								>
									<label
										for="dt-conv-jxl-quality"
									>Quality</label>
									<input
										id="dt-conv-jxl-quality"
										type="range"
										min="1"
										max="100"
										step="1"
										value={{this.jxlQuality}}
										{{on
											"input"
											this.setJxlQuality
										}}
									/>
									<span
										class="dt-conv-readout"
									>{{this.jxlQuality}}%</span>
								</div>
							{{/unless}}
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"gif"
							)
						}}
							<div
								class="dt-conv-slider"
							>
								<label
									for="dt-conv-gif-colours"
								>Max colours</label>
								<input
									id="dt-conv-gif-colours"
									type="range"
									min="2"
									max="256"
									step="1"
									value={{this.gifMaxColours}}
									{{on
										"input"
										this.setGifMaxColours
									}}
								/>
								<span
									class="dt-conv-readout"
								>{{this.gifMaxColours}}</span>
							</div>
							<div
								class="dt-conv-field"
							>
								<span
									class="dt-conv-sublabel"
								>Quantisation</span>
								<Select
									@value={{this.gifQuantisation}}
									@onValueChange={{this.setQuantisation}}
								>
									<SelectTrigger
									>
										<SelectValue
										>{{this.quantisationLabel}}</SelectValue>
									</SelectTrigger>
									<SelectContent
									>
										{{#each
											QUANTISATIONS
											key="value"
											as |option|
										}}
											<SelectItem
												@value={{option.value}}
											>{{option.label}}</SelectItem>
										{{/each}}
									</SelectContent>
								</Select>
							</div>
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"bmp"
							)
						}}
							<div
								class="dt-conv-field"
							>
								<span
									class="dt-conv-sublabel"
								>Bit depth</span>
								<div
									class="segmented dt-conv-depths"
								>
									<button
										type="button"
										class="dt-conv-depth
											{{if
												(eq
													this.bmpBitDepth
													24
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setBmpBitDepth
												24
											)
										}}
									>
										24-bit
										<span
										>No
											transparency</span>
									</button>
									<button
										type="button"
										class="dt-conv-depth
											{{if
												(eq
													this.bmpBitDepth
													32
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setBmpBitDepth
												32
											)
										}}
									>
										32-bit
										<span
										>With
											alpha</span>
									</button>
								</div>
							</div>
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"tiff"
							)
						}}
							<p
								class="dt-conv-note"
							>TIFF output is
								uncompressed.
								Output files
								will be large.</p>
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"ico"
							)
						}}
							<label
								class="dt-conv-row"
							>
								<span
								>Multi-size</span>
								<input
									type="checkbox"
									class="dt-conv-switch"
									checked={{this.icoMultiSize}}
									{{on
										"change"
										this.toggleIcoMultiSize
									}}
								/>
							</label>
							{{#if
								this.icoMultiSize
							}}
								<p
									class="dt-conv-note"
								>Embeds all
									sizes:
									{{ICO_SIZE_LIST}}px</p>
							{{else}}
								<div
									class="dt-conv-field"
								>
									<span
										class="dt-conv-sublabel"
									>Icon
										size</span>
									<div
										class="segmented dt-conv-sizes"
									>
										{{#each
											ICO_SIZES
											key="@index"
											as |size|
										}}
											<button
												type="button"
												class="dt-conv-size
													{{if
														(eq
															this.icoSize
															size
														)
														'is-active'
													}}"
												{{on
													"click"
													(fn
														this.setIcoSize
														size
													)
												}}
											>{{size}}px</button>
										{{/each}}
									</div>
								</div>
							{{/if}}
						{{/if}}

						{{#if
							(eq
								this.targetFormat
								"icns"
							)
						}}
							<label
								class="dt-conv-row"
							>
								<span
								>Multi-size</span>
								<input
									type="checkbox"
									class="dt-conv-switch"
									checked={{this.icnsMultiSize}}
									{{on
										"change"
										this.toggleIcnsMultiSize
									}}
								/>
							</label>
							{{#if
								this.icnsMultiSize
							}}
								<p
									class="dt-conv-note"
								>Embeds all
									sizes:
									{{ICNS_SIZE_LIST}}px</p>
							{{else}}
								<div
									class="dt-conv-field"
								>
									<span
										class="dt-conv-sublabel"
									>Icon
										size</span>
									<div
										class="segmented dt-conv-sizes is-icns"
									>
										{{#each
											ICNS_SIZES
											key="@index"
											as |size|
										}}
											<button
												type="button"
												class="dt-conv-size
													{{if
														(eq
															this.icnsSize
															size
														)
														'is-active'
													}}"
												{{on
													"click"
													(fn
														this.setIcnsSize
														size
													)
												}}
											>{{size}}px</button>
										{{/each}}
									</div>
								</div>
							{{/if}}
						{{/if}}
					</div>

					<div class="dt-conv-panel">
						<span
							class="dt-conv-label"
						>Resize</span>

						<div
							class="segmented dt-conv-modes"
						>
							{{#each
								RESIZE_MODES
								key="value"
								as |mode|
							}}
								<button
									type="button"
									class="dt-conv-mode
										{{if
											(eq
												this.resizeMode
												mode.value
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setResizeMode
											mode.value
										)
									}}
								>{{mode.label}}</button>
							{{/each}}
						</div>

						{{#if
							(eq
								this.resizeMode
								"original"
							)
						}}
							<p class="dt-conv-note">
								<Icon
									@name="scaling"
								/>
								<span>Images
									will
									keep
									their
									original
									dimensions</span>
							</p>
						{{/if}}

						{{#if
							(eq
								this.resizeMode
								"custom"
							)
						}}
							<div
								class="dt-conv-dims"
							>
								<span
									class="dt-conv-dim"
								>
									<label
										for="dt-conv-width"
									>Width</label>
									<input
										id="dt-conv-width"
										type="number"
										placeholder="Auto"
										value={{this.widthValue}}
										{{on
											"input"
											this.setWidth
										}}
									/>
								</span>
								<button
									type="button"
									class="dt-conv-lock
										{{if
											this.lockAspect
											'is-active'
										}}"
									title={{if
										this.lockAspect
										"Unlock aspect ratio"
										"Lock aspect ratio"
									}}
									{{on
										"click"
										this.toggleLockAspect
									}}
								>
									<Icon
										@name={{if
											this.lockAspect
											"lock"
											"unlock"
										}}
									/>
								</button>
								<span
									class="dt-conv-dim"
								>
									<label
										for="dt-conv-height"
									>Height</label>
									<input
										id="dt-conv-height"
										type="number"
										placeholder="Auto"
										value={{this.heightValue}}
										{{on
											"input"
											this.setHeight
										}}
									/>
								</span>
							</div>
							{{#if this.lockAspect}}
								<p
									class="dt-conv-note"
								>Aspect ratio
									locked —
									leave
									one
									field
									empty to
								auto-calculate</p>
							{{else}}
								<p
									class="dt-conv-note"
								>Aspect ratio
									unlocked
									— both
									dimensions
									are
									independent</p>
							{{/if}}
						{{/if}}

						{{#if
							(eq
								this.resizeMode
								"percentage"
							)
						}}
							<div
								class="segmented dt-conv-scales"
							>
								{{#each
									SCALE_PRESETS
									key="@index"
									as |preset|
								}}
									<button
										type="button"
										class="dt-conv-scale
											{{if
												(eq
													this.percentage
													preset
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setPercentage
												preset
											)
										}}
									>{{preset}}%</button>
								{{/each}}
							</div>
							<div
								class="dt-conv-custom"
							>
								<label
									for="dt-conv-percentage"
								>Custom:</label>
								<input
									id="dt-conv-percentage"
									type="number"
									min="1"
									max="1000"
									value={{this.percentage}}
									{{on
										"input"
										this.setCustomPercentage
									}}
								/>
								<span>%</span>
							</div>
						{{/if}}
					</div>
				</div>
			</div>

			{{#if this.sources.length}}
				<div class="dt-conv-frame">
					<div class="dt-conv-bar">
						<span
							class="dt-conv-bar-title"
						>{{this.countLabel}}</span>
						<button
							type="button"
							class="dt-conv-bar-btn"
							{{on
								"click"
								this.clearAll
							}}
						>Clear all</button>
					</div>

					{{#each
						this.sources key="url"
						as |source|
					}}
						<div class="dt-conv-item">
							<span
								class="dt-conv-thumb"
							>
								<img
									src={{source.url}}
									alt={{source.file.name}}
								/>
							</span>
							<span
								class="dt-conv-item-meta"
							>
								<span
									class="dt-conv-item-name"
								>{{source.file.name}}</span>
								<span
									class="dt-conv-item-size"
								>{{source.size}}</span>
							</span>
							<button
								type="button"
								class="dt-conv-remove"
								title="Remove"
								{{on
									"click"
									(fn
										this.removeImage
										source
									)
								}}
							>
								<Icon
									@name="x"
								/>
							</button>
						</div>
					{{/each}}

					<button
						type="button"
						class="dt-conv-run"
						disabled={{this.converting}}
						{{on "click" this.convert}}
					>
						{{#if this.converting}}
							Converting…
						{{else}}
							<Icon @name="image" />
							Convert to
							{{this.formatName}}
						{{/if}}
					</button>
				</div>
			{{/if}}

			{{#if this.converted.length}}
				<div class="dt-conv-frame">
					<div class="dt-conv-bar">
						<span
							class="dt-conv-bar-title"
						>Converted</span>
						{{#if this.canZip}}
							<button
								type="button"
								class="dt-conv-bar-btn"
								{{on
									"click"
									this.downloadZip
								}}
							>
								<DownloadLabel
									@label="Download All as ZIP"
								/>
							</button>
						{{/if}}
					</div>

					{{#each
						this.converted key="url"
						as |image|
					}}
						<div class="dt-conv-item">
							<span
								class="dt-conv-thumb"
							>
								{{#if
									image.previewable
								}}
									<img
										src={{image.url}}
										alt={{image.name}}
									/>
								{{else}}
									<Icon
										@name="image"
									/>
								{{/if}}
							</span>
							<span
								class="dt-conv-item-meta"
							>
								<span
									class="dt-conv-item-name"
								>{{image.name}}</span>
								<span
									class="dt-conv-item-size"
								>{{image.size}}</span>
							</span>
							<button
								type="button"
								class="dt-conv-download"
								{{on
									"click"
									(fn
										this.download
										image
									)
								}}
							>
								<DownloadLabel
								/>
							</button>
						</div>
					{{/each}}
				</div>
			{{/if}}
		</div>
	</template>
}

function valueFrom(event: Event): string {
	return (event.target as HTMLInputElement).value;
}

function numberFrom(event: Event): number {
	return Number(valueFrom(event)) || 0;
}
