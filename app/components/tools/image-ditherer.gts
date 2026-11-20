import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { registerDestructor, isDestroying } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import { IconSvg } from 'delphitools-v2/components/icon';
import DownloadAll from 'delphitools-v2/components/tools/media/download-all';
import Drop from 'delphitools-v2/components/tools/media/drop';
import DropMore from 'delphitools-v2/components/tools/media/drop-more';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import {
	dither,
	DITHER_ALGORITHMS,
	type DitherAlgorithm,
	type DitherOptions,
} from 'delphitools-v2/lib/dither';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import type { NamedBlob } from 'delphitools-v2/lib/zip-files';
import { stem } from 'delphicanon/lib/files';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import type {
	DitherReply,
	DitherRequest,
} from './image-ditherer/dither-worker';
import './image-ditherer/image-ditherer.css';

const ACCEPT = 'image/*';
const MODES = ['Monochrome', 'Colour'];

const whole = (value: number) => String(Math.round(value));
const px = (value: number) => `${Math.round(value)} px`;
const is = (a: unknown, b: unknown) => a === b;

const keepPaste = (event: Event) => event.stopPropagation();

const Eye = <template><IconSvg @name="eye" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

function pixelsOf(bitmap: ImageBitmap): ImageData {
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(bitmap, 0, 0);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

const DEBOUNCE = 120;

const PORTRAITS: Record<DitherAlgorithm, string> = {
	'floyd-steinberg': '/dither/floyd.webp',
	atkinson: '/dither/atkinson.webp',
	jarvis: '/dither/judice.webp',
	stucki: '/dither/stucki.webp',
	burkes: '/dither/david.webp',
	sierra: '/dither/sierra.webp',
	'sierra-lite': '/dither/sierra-2014.webp',
	'bayer-2': '/dither/bayer.webp',
	'bayer-4': '/dither/bayer.webp',
	'bayer-8': '/dither/bayer.webp',
};

const COLOUR_PORTRAITS: Partial<Record<DitherAlgorithm, string>> = {
	'floyd-steinberg': '/dither/floyd-colour.webp',
	burkes: '/dither/david-colour.webp',
};

const tile = modifier(
	(img: HTMLImageElement, [id, colour]: [DitherAlgorithm, boolean]) => {
		const side = 96;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = side;
		const context = canvas.getContext('2d')!;
		const image = new Image();
		image.onload = () => {
			const s = Math.min(image.width, image.height);
			context.drawImage(
				image,
				(image.width - s) / 2,
				(image.height - s) / 2,
				s,
				s,
				0,
				0,
				side,
				side,
			);
			const pixels = context.getImageData(0, 0, side, side);
			dither(pixels.data, side, side, {
				algorithm: id,
				colour,
				levels: 2,
				scale: 1,
			});
			context.putImageData(pixels, 0, 0);
			img.src = canvas.toDataURL();
		};
		image.src = (colour && COLOUR_PORTRAITS[id]) || PORTRAITS[id];
		return () => {
			image.onload = null;
		};
	},
);

function launchFlags() {
	const query = new URLSearchParams(window.location.search);
	const within = (key: string, min: number, max: number) => {
		const value = Math.round(Number(query.get(key)));
		return Math.min(max, Math.max(min, value || min));
	};
	const id = query.get('ditherAlgorithm');
	return {
		sample: query.has('ditherSample'),
		algorithm:
			DITHER_ALGORITHMS.find((a) => a.id === id)?.id ??
			'floyd-steinberg',
		colour: query.get('ditherMode') === 'colour',
		levels: within('ditherLevels', 2, 8),
		scale: within('ditherScale', 1, 16),
	};
}

export default class ImageDitherer extends Component {
	@tracked files: File[] = [];
	@tracked current?: File;
	@tracked bitmap?: ImageBitmap;
	@tracked failed = false;
	@tracked algorithm: DitherAlgorithm;
	@tracked colour: boolean;
	@tracked levels: number;
	@tracked scale: number;
	@tracked progress?: number;

	@tracked busy = false;

	#cancelled = false;
	#worker = new Worker(
		new URL('./image-ditherer/dither-worker.ts', import.meta.url),
		{ type: 'module' },
	);
	#jobs = new Map<number, (data?: Uint8ClampedArray) => void>();
	#next?: {
		canvas: HTMLCanvasElement;
		bitmap: ImageBitmap;
		options: DitherOptions;
	};
	#job = 0;
	#timer = 0;
	#source?: { bitmap: ImageBitmap; pixels: ImageData };

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags();
		this.algorithm = flags.algorithm;
		this.colour = flags.colour;
		this.levels = flags.levels;
		this.scale = flags.scale;
		this.#worker.onmessage = ({
			data: { id, data },
		}: MessageEvent<DitherReply>) => {
			this.#jobs.get(id)?.(data);
			this.#jobs.delete(id);
		};
		this.#worker.onerror = () => {
			for (const fail of this.#jobs.values()) fail();
			this.#jobs.clear();
		};
		registerDestructor(this, () => {
			window.clearTimeout(this.#timer);
			this.#worker.terminate();
			this.bitmap?.close();
		});
		if (flags.sample)
			void drawnSample().then((file) => this.add([file]));
	}

	get options(): DitherOptions {
		const { algorithm, colour, levels, scale } = this;
		return { algorithm, colour, levels, scale };
	}

	get many() {
		return this.files.length > 1;
	}

	get aspect() {
		const { bitmap } = this;
		return bitmap ? Math.max(1, bitmap.width / bitmap.height) : 1.5;
	}

	add = (files: File[]) => {
		this.files = [...this.files, ...files];
		if (!this.current && files[0]) void this.show(files[0]);
	};

	addOne = (file: File) => this.add([file]);

	drop = new Drop(ACCEPT, this.add, true);

	show = async (file: File | undefined) => {
		this.current = file;
		this.failed = false;
		this.bitmap?.close();
		this.bitmap = undefined;
		this.#source = undefined;
		if (!file) return;
		let bitmap: ImageBitmap | undefined;
		try {
			bitmap = await decodeImage(file);
		} catch {
			// shown as Failed
		}
		if (this.current !== file || isDestroying(this)) {
			bitmap?.close();
			return;
		}
		this.bitmap = bitmap;
		this.failed = !bitmap;
	};

	remove = (file: File) => {
		const at = this.files.indexOf(file);
		this.files = this.files.filter((f) => f !== file);
		if (file === this.current)
			void this.show(
				this.files[Math.min(at, this.files.length - 1)],
			);
	};

	clear = () => {
		this.files = [];
		void this.show(undefined);
	};

	pickAlgorithm = (algorithm: DitherAlgorithm) => {
		this.algorithm = algorithm;
	};

	pickMode = (index: number) => {
		this.colour = index === 1;
	};

	pickLevels = (value: number) => {
		this.levels = value;
	};

	pickScale = (value: number) => {
		this.scale = value;
	};

	cancel = () => {
		this.#cancelled = true;
	};

	#dither(
		data: Uint8ClampedArray,
		width: number,
		height: number,
		options: DitherOptions,
	): Promise<ImageData> {
		const id = ++this.#job;
		return new Promise((resolve, reject) => {
			this.#jobs.set(id, (out) =>
				out
					? resolve(
							new ImageData(
								out as Uint8ClampedArray<ArrayBuffer>,
								width,
								height,
							),
						)
					: reject(
							new Error(
								'dither worker failed',
							),
						),
			);
			this.#worker.postMessage(
				{
					id,
					data,
					width,
					height,
					options,
				} satisfies DitherRequest,
				[data.buffer],
			);
		});
	}

	paint = modifier(
		(
			canvas: HTMLCanvasElement,
			[bitmap, options]: [ImageBitmap, DitherOptions],
		) => {
			const fresh = this.#source?.bitmap !== bitmap;
			this.#timer = window.setTimeout(
				() => {
					this.#next = {
						canvas,
						bitmap,
						options,
					};
					void this.#drain();
				},
				fresh ? 0 : DEBOUNCE,
			);
			return () => window.clearTimeout(this.#timer);
		},
	);

	async #drain() {
		if (this.busy) return;
		this.busy = true;
		try {
			for (let next = this.#next; next; next = this.#next) {
				this.#next = undefined;
				const { canvas, bitmap, options } = next;
				if (bitmap !== this.bitmap) continue;
				if (this.#source?.bitmap !== bitmap)
					this.#source = {
						bitmap,
						pixels: pixelsOf(bitmap),
					};
				const { pixels } = this.#source;
				const out = await this.#dither(
					pixels.data.slice(),
					pixels.width,
					pixels.height,
					options,
				);
				if (isDestroying(this)) return;
				if (bitmap !== this.bitmap) continue;
				canvas.width = out.width;
				canvas.height = out.height;
				canvas.getContext('2d')!.putImageData(
					out,
					0,
					0,
				);
			}
		} catch (error) {
			console.error('Failed to dither the preview:', error);
		} finally {
			if (!isDestroying(this)) this.busy = false;
		}
	}

	async #result(
		file: File,
		options: DitherOptions,
	): Promise<NamedBlob | undefined> {
		try {
			const bitmap = await decodeImage(file);
			const pixels = pixelsOf(bitmap);
			bitmap.close();
			const out = await this.#dither(
				pixels.data,
				pixels.width,
				pixels.height,
				options,
			);
			const canvas = document.createElement('canvas');
			canvas.width = out.width;
			canvas.height = out.height;
			canvas.getContext('2d')!.putImageData(out, 0, 0);
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/png'),
			);
			if (blob)
				return {
					name: `${stem(file.name)}.png`,
					blob,
				};
		} catch (error) {
			console.error(`Failed to dither ${file.name}:`, error);
		}
		return undefined;
	}

	results = async (): Promise<NamedBlob[]> => {
		const { files, options } = this;
		const out: NamedBlob[] = [];
		this.#cancelled = false;
		for (const [i, file] of files.entries()) {
			this.progress = i / files.length;
			const result = await this.#result(file, options);
			if (isDestroying(this)) return [];
			if (result) out.push(result);
			if (this.#cancelled) break;
		}
		this.progress = undefined;
		return this.#cancelled ? [] : out;
	};

	save = async () => {
		const result =
			this.current &&
			(await this.#result(this.current, this.options));
		if (result) downloadBlob(result.blob, result.name);
	};

	<template>
		<CanonSplit
			class="image-ditherer"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.addOne accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@background="var(--canon-muted)"
				>
					{{#if this.bitmap}}
						<canvas
							class="dith-picture"
							role="img"
							aria-label="Dithered image"
							{{this.paint
								this.bitmap
								this.options
							}}
						></canvas>
						{{#if this.busy}}
							<CanonLoader
								class="dith-busy"
							/>
						{{/if}}
					{{else if this.failed}}
						<p
							class="dith-failed"
						>Failed</p>
					{{else if this.current}}
						<CanonLoader />
					{{else}}
						<Slot
							@prompt="Drop images here"
							@icon="image"
							@accept={{ACCEPT}}
							@dashed={{true}}
							@fills={{true}}
							@multiple={{true}}
							@over={{this.drop.over}}
							@onFiles={{this.add}}
						/>
					{{/if}}
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.files.length}}
						{{#each this.files as |file|}}
							<CanonRow
								class="dith-source"
								@title={{file.name}}
								@form="flush"
							>
								{{#if
									this.many
								}}
									<CanonButton
										class="dith-show"
										aria-pressed={{if
											(is
												file
												this.current
											)
											"true"
											"false"
										}}
										@kind="segment"
										@icon={{Eye}}
										@label="Preview"
										@selected={{is
											file
											this.current
										}}
										@onClick={{fn
											this.show
											file
										}}
									/>
								{{/if}}
								<CanonButton
									class="dith-remove"
									@kind="cell"
									@icon={{Trash}}
									@label="Remove"
									@onClick={{fn
										this.remove
										file
									}}
								/>
							</CanonRow>
						{{/each}}
						<DropMore
							class="dith-more"
							@onFiles={{this.add}}
						/>
						{{#if this.many}}
							<CanonButton
								class="dith-clear"
								@kind="cell"
								@text="Clear all"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						{{/if}}
					{{else}}
						<CanonDropZone
							class="dith-drop"
							@prompt="Drop images here"
							@accept={{ACCEPT}}
							@multiple={{true}}
							@onFiles={{this.add}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
					<CanonHeading @text="Dither" />
					<div
						class="dith-algorithms"
						role="group"
						aria-label="Algorithm"
					>
						{{#each
							DITHER_ALGORITHMS
							as |a|
						}}
							<button
								type="button"
								class="dith-tile"
								data-algorithm={{a.id}}
								aria-pressed={{if
									(is
										a.id
										this.algorithm
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.pickAlgorithm
										a.id
									)
								}}
							>
								<img
									alt=""
									width="96"
									height="96"
									{{tile
										a.id
										this.colour
									}}
								/>
								<span
								>{{a.label}}</span>
							</button>
						{{/each}}
					</div>
					<CanonSegmented
						class="dith-mode"
						aria-label="Mode"
						@items={{MODES}}
						@selected={{if this.colour 1 0}}
						@onChange={{this.pickMode}}
					/>
					<CanonRow
						class="dith-levels"
						@title="Levels"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.levels}}
							@min={{2}}
							@max={{8}}
							@step={{1}}
							@readout={{whole}}
							@labelledBy={{titleId}}
							@onChange={{this.pickLevels}}
						/>
					</CanonRow>
					<CanonRow
						class="dith-scale"
						@title="Cell size"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.scale}}
							@min={{1}}
							@max={{16}}
							@step={{1}}
							@readout={{px}}
							@labelledBy={{titleId}}
							@onChange={{this.pickScale}}
						/>
					</CanonRow>
					{{#if this.files.length}}
						<CanonButton
							class="dith-download"
							@kind="primary"
							@text={{passAlong
								"Download"
							}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{if
								this.bitmap
								false
								true
							}}
							@onClick={{this.save}}
						/>
						{{#if this.many}}
							<DownloadAll
								class="dith-all"
								@kind="secondary"
								@files={{this.results}}
								@zipName="dithered-images.zip"
								@progress={{this.progress}}
								@onCancel={{this.cancel}}
							/>
						{{/if}}
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
