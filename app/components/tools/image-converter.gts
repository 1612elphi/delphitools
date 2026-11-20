import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { IconSvg } from 'delphitools-v2/components/icon';
import { clipboardImages } from 'delphitools-v2/lib/clipboard-images';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import DownloadAll from 'delphitools-v2/components/tools/media/download-all';
import Drop from 'delphitools-v2/components/tools/media/drop';
import DropMore from 'delphitools-v2/components/tools/media/drop-more';
import type { NamedBlob } from 'delphitools-v2/lib/zip-files';
import Picture from 'delphitools-v2/components/tools/image-converter/picture';
import {
	BIT_DEPTHS,
	DEFAULTS,
	FORMATS,
	ICNS_SIZES,
	ICO_SIZES,
	QUANTISATIONS,
	RESIZE_MODES,
	SCALE_PRESETS,
	convert,
	hasAlpha,
	isLossy,
	keepsAlpha,
	outputName,
	outputSize,
	targetSize,
	type Settings,
	type Size,
} from 'delphitools-v2/components/tools/image-converter/encode';
import './image-converter/image-converter.css';

const ACCEPT = 'image/*,.jxl';
const FAILED = 'Conversion failed for this format.';

const formatLabels = FORMATS.map((f) => f.label);
const resizeLabels = RESIZE_MODES.map((m) => m.label);
const presetLabels = SCALE_PRESETS.map((p) => `${p}%`);
const depthLabels = BIT_DEPTHS.map((d) => `${d}-bit`);
const icoLabels = ICO_SIZES.map((s) => `${s}px`);
const icnsLabels = ICNS_SIZES.map((s) => `${s}px`);
const quantisationLabels = QUANTISATIONS.map((q) => q.label);
const icoSizeList = ICO_SIZES.join(', ');
const icnsSizeList = ICNS_SIZES.join(', ');

const whole = (value: number) => String(Math.round(value));
const colourOf = (text: string): Rgb => parseHex(text) ?? [1, 1, 1];
const is = (a: unknown, b: unknown) => a === b;

const keepPaste = (event: Event) => event.stopPropagation();

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Eye = <template><IconSvg @name="eye" /></template>;
const Folder = <template><IconSvg @name="folder-open" /></template>;
const Paste = <template><IconSvg @name="clipboard-paste" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

type FlagKey =
	| 'pngTransparency'
	| 'webpLossless'
	| 'jxlLossless'
	| 'icoMultiSize'
	| 'icnsMultiSize';
type NumberKey =
	| 'percentage'
	| 'jpegQuality'
	| 'webpQuality'
	| 'jxlQuality'
	| 'gifMaxColours';

interface Source {
	file: File;
	url: string;
	name: string;
	natural: Size;
	alpha: boolean;
}

async function readSource(file: File): Promise<Source | string> {
	const name = file.name || 'image';
	try {
		const image = await decodeImage(file);
		const natural = {
			width: image.width,
			height: image.height,
		};
		const alpha = hasAlpha(image, natural);
		image.close();
		return {
			file,
			url: URL.createObjectURL(file),
			name,
			natural,
			alpha,
		};
	} catch {
		return `Failed to load image: ${name}`;
	}
}

function divisor(a: number, b: number): number {
	return b ? divisor(b, a % b) : a;
}

function launchFlags() {
	const query = new URLSearchParams(window.location.search);
	const settings = { ...DEFAULTS };
	const label = query.get('convFormat')?.toLowerCase();
	const format = FORMATS.find(
		(f) => f.label.toLowerCase() === label || f.id === label,
	);
	if (format) settings.format = format.id;
	const number = (key: string, min: number, max: number) => {
		const value = Number(query.get(key));
		return query.has(key) && Number.isFinite(value)
			? Math.min(max, Math.max(min, Math.round(value)))
			: undefined;
	};
	const quality = number('convQuality', 1, 100);
	if (quality !== undefined)
		settings.jpegQuality =
			settings.webpQuality =
			settings.jxlQuality =
				quality;
	const resize = number('convResize', 0, 2);
	if (resize !== undefined) settings.resize = RESIZE_MODES[resize]!.id;
	settings.percentage = number('convPercent', 1, 1000) ?? 100;
	const flatten = parseHex(query.get('convFlatten') ?? '');
	if (flatten) {
		settings.jpegBackground = settings.pngBackground = hex(flatten);
		settings.pngTransparency = false;
	}
	return { settings, sample: query.has('convSample') };
}

export default class ImageConverter extends Component {
	@tracked sources: Source[] = [];
	@tracked current?: Source;
	@tracked settings: Settings;
	@tracked result?: { blob: Blob; url: string };
	@tracked failed = false;
	@tracked busy = false;
	@tracked loadError = '';
	@tracked arrivals = 0;
	drop = new Drop(ACCEPT, (files) => void this.add(files), true);

	#queued = false;
	#bitmap?: { source: Source; image: ImageBitmap };
	#input?: HTMLInputElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags();
		this.settings = flags.settings;
		registerDestructor(this, () => {
			this.sources.forEach((s) => URL.revokeObjectURL(s.url));
			if (this.result) URL.revokeObjectURL(this.result.url);
			this.#bitmap?.image.close();
		});
		if (flags.sample)
			void drawnSample().then((file) => this.add([file]));
	}

	get many() {
		return this.sources.length > 1;
	}

	get formatIndex() {
		return FORMATS.findIndex((f) => f.id === this.settings.format);
	}

	get resizeIndex() {
		return RESIZE_MODES.findIndex(
			(m) => m.id === this.settings.resize,
		);
	}

	get presetIndex() {
		return SCALE_PRESETS.indexOf(this.settings.percentage);
	}

	get depthIndex() {
		return BIT_DEPTHS.indexOf(this.settings.bmpBitDepth);
	}

	get icoIndex() {
		return ICO_SIZES.indexOf(this.settings.icoSize);
	}

	get icnsIndex() {
		return ICNS_SIZES.indexOf(this.settings.icnsSize);
	}

	get quantisationIndex() {
		return QUANTISATIONS.findIndex(
			(q) => q.value === this.settings.gifQuantisation,
		);
	}

	get depthDetail() {
		return this.settings.bmpBitDepth === 24
			? 'No transparency'
			: 'With alpha';
	}

	get target() {
		const { current } = this;
		return current
			? targetSize(current.natural, this.settings)
			: undefined;
	}

	get output() {
		const { current } = this;
		return current
			? outputSize(current.natural, this.settings)
			: undefined;
	}

	get fieldWidth() {
		return this.target?.width ?? Math.max(1, this.settings.width);
	}

	get fieldHeight() {
		return this.target?.height ?? Math.max(1, this.settings.height);
	}

	get aspectDetail() {
		const natural = this.current?.natural;
		if (!natural) return undefined;
		const d = divisor(natural.width, natural.height);
		return `${natural.width / d}:${natural.height / d}`;
	}

	get lamps() {
		const { settings } = this;
		return [
			keepsAlpha(settings) && (this.current?.alpha ?? false),
			isLossy(settings),
			settings.format === 'gif',
		];
	}

	get aspect() {
		const output = this.output;
		if (!output) return 1.5;
		const shape = Math.min(
			1.5,
			Math.max(0.8, output.width / output.height),
		);
		// ponytail: a fixed share for the film strip's row, not its measured 56 px
		return this.many ? shape * 0.85 : shape;
	}

	get resultName() {
		const { current } = this;
		return current
			? outputName(current.name, this.settings.format)
			: '—';
	}

	get resultDetail() {
		const { result, output } = this;
		if (!result || !output || this.busy) return '—';
		return `${output.width} × ${output.height} · ${formatBytes(result.blob.size)}`;
	}

	get downloadDisabled() {
		return !this.result || this.busy || this.failed;
	}

	get thumbs() {
		return this.many
			? this.sources.map((source) => ({
					url: source.url,
					name: source.name,
					current: source === this.current,
				}))
			: [];
	}

	showAt = (index: number) => {
		const source = this.sources[index];
		if (source) this.show(source);
	};

	sourceDetail = (source: Source) =>
		`${source.natural.width} × ${source.natural.height} · ${formatBytes(source.file.size)}`;

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		void this.add(files);
	};

	pasted = (file: File) => void this.add([file]);

	pasteImages = async () => this.add(await clipboardImages());

	add = async (files: File[]) => {
		const images = files.filter((f) => matchesAccept(f, ACCEPT));
		if (!images.length) return;
		const loaded: (Source | string)[] = [];
		for (const file of images) loaded.push(await readSource(file));
		if (isDestroying(this)) {
			loaded.forEach(
				(s) =>
					typeof s !== 'string' &&
					URL.revokeObjectURL(s.url),
			);
			return;
		}
		const added = loaded.filter(
			(s): s is Source => typeof s !== 'string',
		);
		this.loadError =
			loaded.find(
				(s): s is string => typeof s === 'string',
			) ?? '';
		if (!added.length) return;
		this.sources = [...this.sources, ...added];
		if (!this.settings.width) {
			const { width, height } = added[0]!.natural;
			this.settings = { ...this.settings, width, height };
		}
		if (this.current) this.arrivals++;
		this.show(added[0]!);
	};

	show = (source: Source) => {
		if (source === this.current) return;
		this.current = source;
		this.#setResult(undefined);
		this.#convert();
	};

	remove = (source: Source) => {
		const at = this.sources.indexOf(source);
		URL.revokeObjectURL(source.url);
		this.sources = this.sources.filter((s) => s !== source);
		if (source !== this.current) return;
		const next =
			this.sources[Math.min(at, this.sources.length - 1)];
		if (next) {
			this.show(next);
			return;
		}
		this.current = undefined;
		this.#setResult(undefined);
		this.failed = false;
	};

	clearAll = () => {
		this.sources.forEach((s) => URL.revokeObjectURL(s.url));
		this.sources = [];
		this.current = undefined;
		this.#setResult(undefined);
		this.failed = false;
		this.loadError = '';
	};

	change = (patch: Partial<Settings>) => {
		const keys = Object.keys(patch) as (keyof Settings)[];
		if (keys.every((key) => this.settings[key] === patch[key]))
			return;
		this.settings = { ...this.settings, ...patch };
		this.#convert();
	};

	setFlag = (key: FlagKey, on: boolean) => this.change({ [key]: on });

	setNumber = (key: NumberKey, value: number) =>
		this.change({ [key]: value });

	setColour = (key: 'pngBackground' | 'jpegBackground', colour: Rgb) =>
		this.change({ [key]: hex(colour) });

	pickFormat = (index: number) =>
		this.change({ format: FORMATS[index]!.id });

	pickResize = (index: number) =>
		this.change({ resize: RESIZE_MODES[index]!.id });

	pickPreset = (index: number) =>
		this.change({ percentage: SCALE_PRESETS[index]! });

	pickDepth = (index: number) =>
		this.change({ bmpBitDepth: BIT_DEPTHS[index]! });

	pickIco = (index: number) =>
		this.change({ icoSize: ICO_SIZES[index]! });

	pickIcns = (index: number) =>
		this.change({ icnsSize: ICNS_SIZES[index]! });

	pickQuantisation = (index: number) =>
		this.change({ gifQuantisation: QUANTISATIONS[index]!.value });

	setWidth = (width: number) => {
		this.settings = {
			...this.settings,
			width,
			drives: 'width',
		};
		this.#convert();
	};

	setHeight = (height: number) => {
		this.settings = {
			...this.settings,
			height,
			drives: 'height',
		};
		this.#convert();
	};

	setLock = (lock: boolean) => {
		const { target } = this;
		this.settings = lock
			? { ...this.settings, lock, drives: 'width' }
			: {
					...this.settings,
					lock,
					...(target ?? {}),
				};
		this.#convert();
	};

	download = () => {
		const { result, current } = this;
		if (result && current)
			downloadBlob(
				result.blob,
				outputName(current.name, this.settings.format),
			);
	};

	convertedFiles = async () => {
		const settings = this.settings;
		const files: NamedBlob[] = [];
		for (const source of this.sources) {
			try {
				const image = await decodeImage(source.file);
				try {
					files.push({
						name: outputName(
							source.name,
							settings.format,
						),
						blob: await convert(
							image,
							source.natural,
							settings,
						),
					});
				} finally {
					image.close();
				}
			} catch (error) {
				console.error(
					`Failed to convert ${source.name}:`,
					error,
				);
			}
		}
		return files;
	};

	#setResult(next?: { blob: Blob; url: string }) {
		if (this.result) URL.revokeObjectURL(this.result.url);
		this.result = next;
	}

	async #bitmapOf(source: Source) {
		if (this.#bitmap?.source === source) return this.#bitmap.image;
		this.#bitmap?.image.close();
		this.#bitmap = undefined;
		const image = await decodeImage(source.file);
		this.#bitmap = { source, image };
		return image;
	}

	#convert() {
		if (!this.current) return;
		if (this.busy) {
			this.#queued = true;
			return;
		}
		void this.#drain();
	}

	async #drain() {
		this.busy = true;
		for (;;) {
			this.#queued = false;
			const { current: source, settings } = this;
			if (!source) break;
			let blob: Blob | undefined;
			try {
				blob = await convert(
					await this.#bitmapOf(source),
					source.natural,
					settings,
				);
			} catch (error) {
				console.error(
					`Failed to convert ${source.name}:`,
					error,
				);
			}
			if (isDestroying(this)) return;
			if (this.#queued) continue;
			if (source !== this.current) break;
			this.#setResult(
				blob
					? {
							blob,
							url: URL.createObjectURL(
								blob,
							),
						}
					: undefined,
			);
			this.failed = !blob;
			break;
		}
		this.busy = false;
	}

	<template>
		<CanonSplit
			class="image-converter"
			@halves={{true}}
			@collapsesTo={{200}}
			{{filePaste this.pasted accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@source={{this.current.url}}
						@result={{this.result.url}}
						@sourceSize={{this.current.natural}}
						@outputSize={{this.output}}
						@bytes={{this.result.blob.size}}
						@working={{this.busy}}
						@failed={{this.failed}}
						@lamps={{this.lamps}}
						@over={{this.drop.over}}
						@thumbs={{this.thumbs}}
						@arrival={{this.arrivals}}
						@onChoose={{this.choose}}
						@onPick={{this.showAt}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows class="conv-source" @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.sources.length}}
						{{#each
							this.sources
							as |source|
						}}
							<CanonRow
								class="conv-file"
								@title={{source.name}}
								@detail={{this.sourceDetail
									source
								}}
								@form="flush"
							>
								{{#if
									this.many
								}}
									<CanonButton
										class="conv-show"
										aria-pressed={{if
											(is
												source
												this.current
											)
											"true"
											"false"
										}}
										@kind="segment"
										@icon={{Eye}}
										@label="Preview"
										@selected={{is
											source
											this.current
										}}
										@onClick={{fn
											this.show
											source
										}}
									/>
									<CanonButton
										class="conv-remove"
										@kind="cell"
										@icon={{Trash}}
										@label="Remove"
										@onClick={{fn
											this.remove
											source
										}}
									/>
								{{else}}
									<CanonButton
										class="conv-clear"
										@kind="cell"
										@text="Clear"
										@icon={{Trash}}
										@onClick={{fn
											this.remove
											source
										}}
									/>
								{{/if}}
							</CanonRow>
						{{/each}}
						<DropMore
							class="conv-more"
							@accept={{ACCEPT}}
							@onFiles={{this.add}}
						/>
						<CanonGrid class="conv-add">
							<CanonButton
								class="conv-files"
								@kind="cell"
								@text="Files"
								@icon={{Folder}}
								@onClick={{this.choose}}
							/>
							<CanonButton
								class="conv-paste"
								@kind="cell"
								@text="Paste"
								@icon={{Paste}}
								@onClick={{this.pasteImages}}
							/>
							{{#if this.many}}
								<CanonButton
									class="conv-clear-all"
									@kind="cell"
									@text="Clear all"
									@icon={{Trash}}
									@onClick={{this.clearAll}}
								/>
							{{/if}}
						</CanonGrid>
					{{else}}
						<CanonDropZone
							class="conv-drop"
							@prompt="Drop images here"
							@accept={{ACCEPT}}
							@multiple={{true}}
							@onFiles={{this.add}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
					{{#if this.loadError}}
						<CanonStatus
							class="conv-load-error"
							@text={{this.loadError}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows class="conv-output" @framed={{true}}>
					<CanonHeading @text="Output Format" />
					<CanonSegmented
						class="conv-formats"
						@items={{formatLabels}}
						@columns={{3}}
						@selected={{this.formatIndex}}
						@onChange={{this.pickFormat}}
					/>
					{{#if (is this.settings.format "png")}}
						<CanonRow
							class="conv-png-alpha"
							@title="Preserve Transparency"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.settings.pngTransparency}}
								@onChange={{fn
									this.setFlag
									"pngTransparency"
								}}
							/>
						</CanonRow>
						{{#unless
							this.settings.pngTransparency
						}}
							<CanonColourWell
								class="conv-png-background"
								@label="Background Colour"
								@colour={{colourOf
									this.settings.pngBackground
								}}
								@onChange={{fn
									this.setColour
									"pngBackground"
								}}
							/>
						{{/unless}}
					{{else if
						(is this.settings.format "jpeg")
					}}
						<CanonRow
							class="conv-quality"
							@title="Quality"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.settings.jpegQuality}}
								@min={{1}}
								@max={{100}}
								@step={{1}}
								@readout={{whole}}
								@labelledBy={{titleId}}
								@onChange={{fn
									this.setNumber
									"jpegQuality"
								}}
							/>
						</CanonRow>
						<CanonColourWell
							class="conv-jpeg-background"
							@label="Background Colour"
							@colour={{colourOf
								this.settings.jpegBackground
							}}
							@onChange={{fn
								this.setColour
								"jpegBackground"
							}}
						/>
						<CanonStatus
							@text="Used when input has transparency"
							@tone="muted"
							@row={{true}}
						/>
					{{else if
						(is this.settings.format "webp")
					}}
						<CanonRow
							class="conv-lossless"
							@title="Lossless"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.settings.webpLossless}}
								@onChange={{fn
									this.setFlag
									"webpLossless"
								}}
							/>
						</CanonRow>
						{{#unless
							this.settings.webpLossless
						}}
							<CanonRow
								class="conv-quality"
								@title="Quality"
								@form="flush"
								as |titleId|
							>
								<CanonSlider
									@value={{this.settings.webpQuality}}
									@min={{1}}
									@max={{100}}
									@step={{1}}
									@readout={{whole}}
									@labelledBy={{titleId}}
									@onChange={{fn
										this.setNumber
										"webpQuality"
									}}
								/>
							</CanonRow>
						{{/unless}}
					{{else if
						(is this.settings.format "jxl")
					}}
						<CanonRow
							class="conv-lossless"
							@title="Lossless"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.settings.jxlLossless}}
								@onChange={{fn
									this.setFlag
									"jxlLossless"
								}}
							/>
						</CanonRow>
						{{#unless
							this.settings.jxlLossless
						}}
							<CanonRow
								class="conv-quality"
								@title="Quality"
								@form="flush"
								as |titleId|
							>
								<CanonSlider
									@value={{this.settings.jxlQuality}}
									@min={{1}}
									@max={{100}}
									@step={{1}}
									@readout={{whole}}
									@labelledBy={{titleId}}
									@onChange={{fn
										this.setNumber
										"jxlQuality"
									}}
								/>
							</CanonRow>
						{{/unless}}
					{{else if
						(is this.settings.format "gif")
					}}
						<CanonRow
							class="conv-colours"
							@title="Max Colours"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.settings.gifMaxColours}}
								@min={{2}}
								@max={{256}}
								@step={{1}}
								@readout={{whole}}
								@labelledBy={{titleId}}
								@onChange={{fn
									this.setNumber
									"gifMaxColours"
								}}
							/>
						</CanonRow>
						<CanonRow
							class="conv-quantisation"
							@title="Quantisation"
							@form="flush"
							as |titleId|
						>
							<CanonMenuCell
								@items={{quantisationLabels}}
								@selected={{this.quantisationIndex}}
								@labelledBy={{titleId}}
								@onChange={{this.pickQuantisation}}
							/>
						</CanonRow>
					{{else if
						(is this.settings.format "bmp")
					}}
						<CanonRow
							class="conv-depth"
							@title="Bit Depth"
							@detail={{this.depthDetail}}
							@form="flush"
						>
							<CanonSegmented
								@items={{depthLabels}}
								@selected={{this.depthIndex}}
								@onChange={{this.pickDepth}}
							/>
						</CanonRow>
					{{else if
						(is this.settings.format "tiff")
					}}
						<CanonStatus
							class="conv-tiff-note"
							@text="TIFF output is uncompressed. Output files will be large."
							@tone="muted"
							@row={{true}}
						/>
					{{else if
						(is this.settings.format "ico")
					}}
						<CanonRow
							class="conv-multi"
							@title="Multi-size"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.settings.icoMultiSize}}
								@onChange={{fn
									this.setFlag
									"icoMultiSize"
								}}
							/>
						</CanonRow>
						{{#if
							this.settings.icoMultiSize
						}}
							<CanonStatus
								class="conv-sizes-note"
								@text="Embeds all sizes: {{icoSizeList}}px"
								@tone="muted"
								@row={{true}}
							/>
						{{else}}
							<CanonHeading
								@text="Icon Size"
							/>
							<CanonSegmented
								class="conv-icon-sizes"
								@items={{icoLabels}}
								@columns={{6}}
								@selected={{this.icoIndex}}
								@onChange={{this.pickIco}}
							/>
						{{/if}}
					{{else}}
						<CanonRow
							class="conv-multi"
							@title="Multi-size"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.settings.icnsMultiSize}}
								@onChange={{fn
									this.setFlag
									"icnsMultiSize"
								}}
							/>
						</CanonRow>
						{{#if
							this.settings.icnsMultiSize
						}}
							<CanonStatus
								class="conv-sizes-note"
								@text="Embeds all sizes: {{icnsSizeList}}px"
								@tone="muted"
								@row={{true}}
							/>
						{{else}}
							<CanonHeading
								@text="Icon Size"
							/>
							<CanonSegmented
								class="conv-icon-sizes"
								@items={{icnsLabels}}
								@columns={{4}}
								@selected={{this.icnsIndex}}
								@onChange={{this.pickIcns}}
							/>
						{{/if}}
					{{/if}}
				</CanonRows>
				<CanonRows class="conv-sizing" @framed={{true}}>
					<CanonHeading @text="Resize" />
					<CanonSegmented
						class="conv-resize"
						@items={{resizeLabels}}
						@selected={{this.resizeIndex}}
						@onChange={{this.pickResize}}
					/>
					{{#if
						(is
							this.settings.resize
							"percentage"
						)
					}}
						<CanonSegmented
							class="conv-presets"
							@items={{presetLabels}}
							@selected={{this.presetIndex}}
							@onChange={{this.pickPreset}}
						/>
						<CanonRow
							class="conv-percent"
							@title="Scale"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.settings.percentage}}
								@min={{1}}
								@max={{1000}}
								@unit="%"
								@labelledBy={{titleId}}
								@onChange={{fn
									this.setNumber
									"percentage"
								}}
							/>
						</CanonRow>
					{{else if
						(is
							this.settings.resize
							"custom"
						)
					}}
						<CanonRow
							class="conv-width"
							@title="Width"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.fieldWidth}}
								@min={{1}}
								@unit="px"
								@labelledBy={{titleId}}
								@disabled={{if
									this.current
									false
									true
								}}
								@onChange={{this.setWidth}}
							/>
						</CanonRow>
						<CanonRow
							class="conv-height"
							@title="Height"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.fieldHeight}}
								@min={{1}}
								@unit="px"
								@labelledBy={{titleId}}
								@disabled={{if
									this.current
									false
									true
								}}
								@onChange={{this.setHeight}}
							/>
						</CanonRow>
						<CanonRow
							class="conv-lock"
							@title="Aspect Ratio"
							@detail={{this.aspectDetail}}
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.settings.lock}}
								@onChange={{this.setLock}}
							/>
						</CanonRow>
					{{/if}}
				</CanonRows>
				<CanonRows class="conv-result" @framed={{true}}>
					<CanonHeading @text="Result" />
					<CanonRow
						class="conv-result-file"
						@title={{this.resultName}}
						@detail={{this.resultDetail}}
					/>
					{{#if this.failed}}
						<CanonStatus
							class="conv-failure"
							@text={{FAILED}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonGrid>
						<CanonButton
							class="conv-download"
							@kind="primary"
							@text={{passAlong
								"Download"
							}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{this.downloadDisabled}}
							@onClick={{this.download}}
						/>
					</CanonGrid>
					{{#if this.many}}
						<DownloadAll
							class="conv-all"
							@kind="secondary"
							@files={{this.convertedFiles}}
							@zipName="converted-images.zip"
						/>
					{{/if}}
				</CanonRows>
				{{! template-lint-disable require-input-label }}
				<input
					type="file"
					accept={{ACCEPT}}
					multiple
					hidden
					{{this.keepInput}}
					{{on "change" this.picked}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
