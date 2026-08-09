import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from 'delphitools-v2/components/ui/popover';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from 'delphitools-v2/components/ui/tooltip';
import type { TOC } from '@ember/component/template-only';
import type RouterService from '@ember/routing/router-service';

export interface TracerOptions {
	numberofcolors: number;
	colorquantcycles: number;
	ltres: number;
	qtres: number;
	pathomit: number;
	strokewidth: number;
	scale: number;
	blurradius: number;
	blurdelta: number;
	colorsampling: number;
	mincolorratio: number;
	roundcoords: number;
	lcpr: number;
	qcpr: number;
	layering: number;
	rightangleenhance: boolean;
	linefilter: boolean;
}

export const DEFAULT_OPTIONS: TracerOptions = {
	numberofcolors: 16,
	colorquantcycles: 3,
	ltres: 1,
	qtres: 1,
	pathomit: 8,
	strokewidth: 1,
	scale: 1,
	blurradius: 0,
	blurdelta: 20,
	colorsampling: 2,
	mincolorratio: 0,
	roundcoords: 1,
	lcpr: 0,
	qcpr: 0,
	layering: 0,
	rightangleenhance: true,
	linefilter: false,
};

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

const COPIED_MS = 1500;

/** The svg-optimiser tool reads this key on construction. */
const HANDOFF_KEY = 'svg-optimiser-input';

// The icons name lucide entries that app/lib/tools.ts already references, so
// scripts/gen-icons.mjs keeps them whatever this file does — it cannot see a
// name reached through a binding. That rules out a few of the Next app's
// choices (Spline, Grid3X3, Shuffle), which are approximated here.
const PRESETS: { id: string; label: string; icon: string }[] = [
	{ id: 'default', label: 'Default', icon: 'scale' },
	{ id: 'posterized1', label: 'Monoposto', icon: 'layers' },
	{ id: 'posterized2', label: "Saul's World", icon: 'layers' },
	{ id: 'posterized3', label: 'Powders', icon: 'layers' },
	{ id: 'curvy', label: 'Bouba', icon: 'wind' },
	{ id: 'sharp', label: 'Kiki', icon: 'crop' },
	{ id: 'detailed', label: 'Intricate', icon: 'scan-line' },
	{ id: 'smoothed', label: 'Papered', icon: 'blend' },
	{ id: 'grayscale', label: 'Mono', icon: 'contrast' },
	{ id: 'fixedpalette', label: 'Genlock', icon: 'layout-grid' },
	{ id: 'randomsampling1', label: 'Logan', icon: 'pipette' },
	{ id: 'randomsampling2', label: 'Clockwise', icon: 'pipette' },
	{ id: 'artistic1', label: 'Theories', icon: 'brush' },
	{ id: 'artistic2', label: 'Dustbowl', icon: 'pen-line' },
	{ id: 'artistic3', label: 'Warrrant', icon: 'palette' },
	{ id: 'artistic4', label: 'Sparkle', icon: 'sparkles' },
];

const STROKE_OPTIONS = [0, 0.5, 1, 2, 3, 5].map((width) => ({
	width,
	label: width === 0 ? 'None' : String(width),
	bar: htmlSafe(
		`width: ${Math.min(width * 6, 24)}px; height: ${Math.max(width, 1)}px`,
	),
}));

const SCALE_OPTIONS = [0.5, 1, 2, 3, 5];

const MIN_COLOURS = 2;
const MAX_COLOURS = 64;

const COLOUR_SAMPLING = [
	{ value: '0', label: 'Generated' },
	{ value: '1', label: 'Random' },
	{ value: '2', label: 'Deterministic' },
];

const LAYERING = [
	{ value: '0', label: 'Sequential' },
	{ value: '1', label: 'Parallel' },
];

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * imagetracerjs writes fixed width/height and no viewBox, so the preview would
 * overflow at scale > 1. Adds the viewBox those two attributes imply, then
 * relaxes them.
 */
export function makeResponsive(svg: string): string {
	const width = /<svg[^>]*\swidth="([^"]+)"/.exec(svg)?.[1];
	const height = /<svg[^>]*\sheight="([^"]+)"/.exec(svg)?.[1];
	const result =
		/<svg[^>]*\sviewBox="/.test(svg) || !width || !height
			? svg
			: svg.replace(
					'<svg',
					`<svg viewBox="0 0 ${width} ${height}"`,
				);
	return result
		.replace(/(<svg[^>]*)\swidth="[^"]*"/, '$1 width="100%"')
		.replace(/(<svg[^>]*)\sheight="[^"]*"/, '$1 height="auto"');
}

function extractImageData(file: File): Promise<ImageData> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const url = URL.createObjectURL(file);

		image.onload = () => {
			URL.revokeObjectURL(url);
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(
					new Error(
						'Canvas 2D context unavailable',
					),
				);
				return;
			}
			ctx.drawImage(image, 0, 0);
			resolve(
				ctx.getImageData(
					0,
					0,
					image.width,
					image.height,
				),
			);
		};

		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Image failed to decode'));
		};

		image.src = url;
	});
}

/**
 * The library is fetched as text and wrapped in a Blob worker rather than
 * imported, because tracing a large image runs for seconds and would otherwise
 * hold the main thread. `public/lib/` carries the same 1.2.6 build as the npm
 * package, which stays for the presets and the no-worker path.
 */
async function createTracerWorker(): Promise<Worker | null> {
	try {
		const response = await fetch('/lib/imagetracer_v1.2.6.js');
		if (!response.ok) return null;
		const source = await response.text();
		const blob = new Blob(
			[
				source,
				`self.onmessage = function (e) {
					var imgd = new ImageData(
						new Uint8ClampedArray(e.data.buffer),
						e.data.width,
						e.data.height
					);
					self.postMessage(self.ImageTracer.imagedataToSVG(imgd, e.data.opts));
				};`,
			],
			{ type: 'application/javascript' },
		);
		const url = URL.createObjectURL(blob);
		const worker = new Worker(url);
		URL.revokeObjectURL(url);
		return worker;
	} catch {
		return null;
	}
}

const InfoTip: TOC<{ Args: { text: string } }> = <template>
	<Tooltip>
		<TooltipTrigger>
			<button
				type="button"
				class="dt-trace-info"
				aria-label={{@text}}
			><Icon @name="info" /></button>
		</TooltipTrigger>
		<TooltipContent
			@side="top"
			class="dt-trace-tip"
		>{{@text}}</TooltipContent>
	</Tooltip>
</template>;

const SectionHeader: TOC<{ Args: { label: string } }> = <template>
	<div class="dt-trace-section">
		<span class="dt-trace-section-label">{{@label}}</span>
		<span class="dt-trace-rule"></span>
	</div>
</template>;

interface SliderArgs {
	id: string;
	label: string;
	tip: string;
	display: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onInput: (event: Event) => void;
}

const OptionSlider: TOC<{ Args: SliderArgs }> = <template>
	<div class="dt-trace-field">
		<div class="dt-trace-field-head">
			<span class="dt-trace-field-label">
				<label for={{@id}}>{{@label}}</label>
				<InfoTip @text={{@tip}} />
			</span>
			<span class="dt-trace-readout">{{@display}}</span>
		</div>
		<input
			id={{@id}}
			type="range"
			class="dt-trace-slider"
			min={{@min}}
			max={{@max}}
			step={{@step}}
			value={{@value}}
			{{on "input" @onInput}}
		/>
	</div>
</template>;

interface StepperArgs {
	label: string;
	tip: string;
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}

class Stepper extends Component<{ Args: StepperArgs }> {
	get atMin() {
		return this.args.value <= this.args.min;
	}

	get atMax() {
		return this.args.value >= this.args.max;
	}

	decrement = () => this.args.onChange(this.args.value - 1);
	increment = () => this.args.onChange(this.args.value + 1);

	<template>
		<div class="dt-trace-stepper">
			<span class="dt-trace-field-label">
				<span>{{@label}}</span>
				<InfoTip @text={{@tip}} />
			</span>
			<div class="dt-trace-stepper-box">
				<button
					type="button"
					class="dt-trace-step"
					aria-label="Decrease"
					disabled={{this.atMin}}
					{{on "click" this.decrement}}
				><Icon @name="minus" /></button>
				<span
					class="dt-trace-step-value"
				>{{@value}}</span>
				<button
					type="button"
					class="dt-trace-step"
					aria-label="Increase"
					disabled={{this.atMax}}
					{{on "click" this.increment}}
				><Icon @name="plus" /></button>
			</div>
		</div>
	</template>
}

export default class ImageTracerTool extends Component {
	@service declare router: RouterService;

	@tracked imageSrc: string | null = null;
	@tracked previewUrl: string | null = null;
	@tracked fileName = '';
	@tracked fileSize = 0;
	@tracked svgSize = 0;
	@tracked tracing = false;
	@tracked copied = false;
	@tracked dirty = false;
	@tracked presetsOpen = false;
	@tracked preset = 'default';
	@tracked options: TracerOptions = { ...DEFAULT_OPTIONS };

	#imageData: ImageData | null = null;
	#rawSvg: string | null = null;
	#worker: Worker | null = null;
	#workerInit: Promise<Worker | null> | null = null;
	#copiedTimer?: ReturnType<typeof setTimeout>;
	/** Preset keys with no control of their own — `pal` on Powders, mainly. */
	#extras: Record<string, unknown> = {};

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
		this.#worker?.terminate();
		this.#setSource(null);
		this.#setPreview(null);
	}

	get hasResult() {
		return this.previewUrl !== null;
	}

	get actionsDisabled() {
		return !this.hasResult || this.tracing;
	}

	/** A retrace leaves the previous result in place, so its size is stale. */
	get showSvgSize() {
		return this.hasResult && !this.tracing;
	}

	get retraceDisabled() {
		return !this.dirty || this.tracing;
	}

	get fileSizeLabel() {
		return formatSize(this.fileSize);
	}

	get svgSizeLabel() {
		return formatSize(this.svgSize);
	}

	get activePreset() {
		return PRESETS.find((entry) => entry.id === this.preset);
	}

	get presetLabel() {
		return this.activePreset?.label ?? 'Custom';
	}

	get colourSampling() {
		return String(this.options.colorsampling);
	}

	get colourSamplingLabel() {
		return (
			COLOUR_SAMPLING.find(
				(entry) => entry.value === this.colourSampling,
			)?.label ?? ''
		);
	}

	get layering() {
		return String(this.options.layering);
	}

	get layeringLabel() {
		return (
			LAYERING.find((entry) => entry.value === this.layering)
				?.label ?? ''
		);
	}

	get ltresLabel() {
		return this.options.ltres.toFixed(1);
	}

	get qtresLabel() {
		return this.options.qtres.toFixed(1);
	}

	get mincolorratioLabel() {
		return this.options.mincolorratio.toFixed(2);
	}

	get lcprLabel() {
		return this.options.lcpr.toFixed(2);
	}

	get qcprLabel() {
		return this.options.qcpr.toFixed(2);
	}

	get pathomitLabel() {
		return String(this.options.pathomit);
	}

	get blurdeltaLabel() {
		return String(this.options.blurdelta);
	}

	get scaleLabel() {
		return `${this.options.scale}x`;
	}

	get atMinColours() {
		return this.options.numberofcolors <= MIN_COLOURS;
	}

	get atMaxColours() {
		return this.options.numberofcolors >= MAX_COLOURS;
	}

	#setPreview(svg: string | null) {
		if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
		this.previewUrl =
			svg === null
				? null
				: URL.createObjectURL(
						new Blob([svg], {
							type: 'image/svg+xml',
						}),
					);
	}

	#setSource(url: string | null) {
		if (this.imageSrc) URL.revokeObjectURL(this.imageSrc);
		this.imageSrc = url;
	}

	async #getWorker(): Promise<Worker | null> {
		this.#workerInit ??= createTracerWorker();
		const worker = await this.#workerInit;
		if (worker && !this.#worker) {
			worker.onmessage = (event: MessageEvent<string>) =>
				this.#applyResult(event.data);
			worker.onerror = () => {
				console.error('Image tracing worker failed');
				this.tracing = false;
			};
			this.#worker = worker;
		}
		return worker;
	}

	#applyResult(rawSvg: string) {
		this.#rawSvg = rawSvg;
		this.svgSize = new Blob([rawSvg]).size;
		this.#setPreview(makeResponsive(rawSvg));
		this.tracing = false;
	}

	async #trace() {
		const imgd = this.#imageData;
		if (!imgd) return;

		this.tracing = true;
		const opts = { ...this.#extras, ...this.options };

		const worker = await this.#getWorker();
		if (worker) {
			// A copy, because the transfer detaches the buffer and a retrace
			// reuses the same ImageData.
			const buffer = new Uint8ClampedArray(imgd.data).buffer;
			worker.postMessage(
				{
					buffer,
					width: imgd.width,
					height: imgd.height,
					opts,
				},
				[buffer],
			);
			return;
		}

		try {
			const { default: tracer } =
				await import('imagetracerjs');
			this.#applyResult(tracer.imagedataToSVG(imgd, opts));
		} catch (error) {
			console.error('Image tracing failed:', error);
			this.tracing = false;
		}
	}

	readFile = (file: File) => {
		if (!file.type.startsWith('image/')) return;

		this.fileName = file.name;
		this.fileSize = file.size;
		this.svgSize = 0;
		this.#rawSvg = null;
		this.#imageData = null;
		this.#setPreview(null);
		this.#setSource(URL.createObjectURL(file));

		void this.#load(file);
	};

	async #load(file: File) {
		try {
			this.#imageData = await extractImageData(file);
		} catch (error) {
			console.error('Image decoding failed:', error);
			return;
		}
		await this.#trace();
	}

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
		if (file) this.readFile(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setOption = (key: keyof TracerOptions, value: number | boolean) => {
		this.preset = 'custom';
		this.dirty = true;
		this.options = Object.assign({}, this.options, {
			[key]: value,
		});
	};

	stepColours = (delta: number) => {
		this.setOption(
			'numberofcolors',
			this.options.numberofcolors + delta,
		);
	};

	setFromRange = (key: keyof TracerOptions, event: Event) => {
		this.setOption(
			key,
			Number((event.target as HTMLInputElement).value),
		);
	};

	setColourSampling = (value: string) => {
		this.setOption('colorsampling', Number(value));
	};

	setLayering = (value: string) => {
		this.setOption('layering', Number(value));
	};

	setPresetsOpen = (open: boolean) => {
		this.presetsOpen = open;
	};

	choosePreset = (id: string) => {
		this.presetsOpen = false;
		void this.applyPreset(id);
	};

	applyPreset = async (id: string) => {
		this.preset = id;
		this.dirty = true;

		let presetOptions: Record<string, unknown> | undefined;
		try {
			const { default: tracer } =
				await import('imagetracerjs');
			presetOptions = tracer.optionpresets[id];
		} catch (error) {
			console.error('Preset lookup failed:', error);
		}
		if (!presetOptions) return;

		// Only 'default' carries a scale, so the rest keep whatever is set.
		const next = { ...DEFAULT_OPTIONS, scale: this.options.scale };
		const extras: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(presetOptions)) {
			if (key in next) Object.assign(next, { [key]: value });
			else extras[key] = value;
		}
		this.options = next;
		this.#extras = extras;
	};

	retrace = () => {
		this.dirty = false;
		void this.#trace();
	};

	clear = () => {
		this.#imageData = null;
		this.#rawSvg = null;
		this.#extras = {};
		this.#setPreview(null);
		this.#setSource(null);
		this.fileName = '';
		this.fileSize = 0;
		this.svgSize = 0;
		this.tracing = false;
		this.dirty = false;
		this.copied = false;
		this.preset = 'default';
		this.options = { ...DEFAULT_OPTIONS };
	};

	download = () => {
		if (!this.#rawSvg) return;
		const blob = new Blob([this.#rawSvg], {
			type: 'image/svg+xml',
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.download = `${this.fileName.replace(/\.[^.]+$/, '')}-traced.svg`;
		link.href = url;
		link.click();
		URL.revokeObjectURL(url);
	};

	copy = () => {
		if (!this.#rawSvg) return;
		void navigator.clipboard.writeText(this.#rawSvg).then(
			() => {
				this.copied = true;
				clearTimeout(this.#copiedTimer);
				this.#copiedTimer = setTimeout(
					() => (this.copied = false),
					COPIED_MS,
				);
			},
			(error: unknown) =>
				console.error('Copy failed:', error),
		);
	};

	sendToOptimiser = () => {
		if (!this.#rawSvg) return;
		sessionStorage.setItem(HANDOFF_KEY, this.#rawSvg);
		void this.router.transitionTo('tools.tool', 'svg-optimiser');
	};

	<template>
		<div class="dt-trace" {{filePaste this.readFile accept=ACCEPT}}>
			{{#if this.imageSrc}}
				<div class="dt-trace-frame">
					<div class="dt-trace-bar">
						<div class="dt-trace-source">
							<span
								class="dt-trace-thumb"
							><img
									src={{this.imageSrc}}
									alt=""
								/></span>
							<span
								class="dt-trace-name"
							>{{this.fileName}}</span>
							<span
								class="dt-trace-meta"
							>{{this.fileSizeLabel}}</span>
							{{#if this.showSvgSize}}
								<span
									class="dt-trace-meta"
								>· SVG
									{{this.svgSizeLabel}}</span>
							{{/if}}
						</div>
						<button
							type="button"
							class="dt-trace-bar-btn"
							aria-label="Clear"
							{{on
								"click"
								this.clear
							}}
						><Icon @name="x" /></button>
					</div>

					<div class="dt-trace-stage">
						{{#if this.tracing}}
							<div
								class="dt-trace-busy"
							>
								<Icon
									class="dt-trace-spinner"
									@name="loader-circle"
								/>
								{{! wording carried over from the Next app }}
								<span>Tracing
									image…</span>
							</div>
						{{else if this.previewUrl}}
							<img
								src={{this.previewUrl}}
								alt="Traced SVG preview"
							/>
						{{else}}
							<img
								src={{this.imageSrc}}
								alt="Source"
							/>
						{{/if}}
					</div>

					<div class="dt-trace-actions">
						<button
							type="button"
							class="dt-trace-action is-primary"
							disabled={{this.actionsDisabled}}
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name="download"
							/>
							Download
						</button>
						<button
							type="button"
							class="dt-trace-action"
							disabled={{this.actionsDisabled}}
							{{on "click" this.copy}}
						>
							<Icon
								@name={{if
									this.copied
									"check"
									"copy"
								}}
							/>
							{{if
								this.copied
								"Copied"
								"Copy"
							}}
						</button>
						<button
							type="button"
							class="dt-trace-action"
							disabled={{this.actionsDisabled}}
							{{on
								"click"
								this.sendToOptimiser
							}}
						>
							<Icon
								@name="arrow-right"
							/>
							Optimise
						</button>
					</div>
				</div>

				<div class="dt-trace-presetbar">
					<Popover
						@open={{this.presetsOpen}}
						@onOpenChange={{this.setPresetsOpen}}
					>
						<PopoverTrigger
							class="dt-trace-presetbtn"
						>
							<span
								class="dt-trace-meta"
							>Preset</span>
							{{#if
								this.activePreset
							}}
								<Icon
									class="dt-trace-preseticon"
									@name={{this.activePreset.icon}}
								/>
							{{/if}}
							<span
								class="dt-trace-presetname"
							>{{this.presetLabel}}</span>
							<Icon
								@name="chevrons-up-down"
							/>
						</PopoverTrigger>
						<PopoverContent
							@align="start"
							class="dt-trace-presetpanel"
						>
							<div
								class="segmented dt-trace-presets"
							>
								{{#each
									PRESETS
									key="id"
									as |entry|
								}}
									<button
										type="button"
										class="dt-trace-preset
											{{if
												(eq
													this.preset
													entry.id
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.choosePreset
												entry.id
											)
										}}
									>
										<Icon
											@name={{entry.icon}}
										/>
										<span
										>{{entry.label}}</span>
									</button>
								{{/each}}
							</div>
						</PopoverContent>
					</Popover>

					<button
						type="button"
						class="dt-trace-retrace"
						disabled={{this.retraceDisabled}}
						{{on "click" this.retrace}}
					>
						{{#if this.tracing}}
							<Icon
								class="dt-trace-spinner"
								@name="loader-circle"
							/>
							Tracing…
						{{else}}
							<Icon
								@name="refresh-cw"
							/>
							Retrace
						{{/if}}
					</button>
				</div>

				<div class="segmented dt-trace-grid">
					<div class="dt-trace-panel">
						<SectionHeader
							@label="Colours"
						/>

						<div class="dt-trace-card">
							<span
								class="dt-trace-field-label"
							>
								<label
									for="dt-trace-colours"
								>Colours</label>
								{{! wording carried over from the Next app }}
								<InfoTip
									@text="Number of colours used to quantise the image before tracing. Fewer colours = simpler, bolder result."
								/>
							</span>
							<div
								class="dt-trace-card-row"
							>
								<button
									type="button"
									class="dt-trace-round"
									aria-label="Decrease"
									disabled={{this.atMinColours}}
									{{on
										"click"
										(fn
											this.stepColours
											-1
										)
									}}
								><Icon
										@name="minus"
									/></button>
								<span
									class="dt-trace-count"
								>{{this.options.numberofcolors}}</span>
								<button
									type="button"
									class="dt-trace-round"
									aria-label="Increase"
									disabled={{this.atMaxColours}}
									{{on
										"click"
										(fn
											this.stepColours
											1
										)
									}}
								><Icon
										@name="plus"
									/></button>
							</div>
							<input
								id="dt-trace-colours"
								type="range"
								class="dt-trace-slider"
								min="2"
								max="64"
								step="1"
								value={{this.options.numberofcolors}}
								{{on
									"input"
									(fn
										this.setFromRange
										"numberofcolors"
									)
								}}
							/>
						</div>

						{{! wording carried over from the Next app }}
						<Stepper
							@label="Quantise"
							@tip="Number of k-means iterations for colour clustering. More cycles = more accurate colours, slower trace."
							@value={{this.options.colorquantcycles}}
							@min={{1}}
							@max={{20}}
							@onChange={{fn
								this.setOption
								"colorquantcycles"
							}}
						/>
					</div>

					<div class="dt-trace-panel">
						<SectionHeader
							@label="Smoothing"
						/>
						{{! wording carried over from the Next app }}
						<OptionSlider
							@id="dt-trace-ltres"
							@label="Paths"
							@tip="Controls how aggressively straight lines replace curves. Higher = smoother with fewer curves."
							@display={{this.ltresLabel}}
							@value={{this.options.ltres}}
							@min={{0.1}}
							@max={{10}}
							@step={{0.1}}
							@onInput={{fn
								this.setFromRange
								"ltres"
							}}
						/>
						{{! wording carried over from the Next app }}
						<OptionSlider
							@id="dt-trace-qtres"
							@label="Curves"
							@tip="Controls quadratic spline fitting. Higher = smoother curves with less detail."
							@display={{this.qtresLabel}}
							@value={{this.options.qtres}}
							@min={{0.1}}
							@max={{10}}
							@step={{0.1}}
							@onInput={{fn
								this.setFromRange
								"qtres"
							}}
						/>
						{{! wording carried over from the Next app }}
						<OptionSlider
							@id="dt-trace-pathomit"
							@label="Threshold"
							@tip="Paths with fewer than this many nodes are removed. Raise to filter out noise and small artifacts."
							@display={{this.pathomitLabel}}
							@value={{this.options.pathomit}}
							@min={{0}}
							@max={{200}}
							@step={{1}}
							@onInput={{fn
								this.setFromRange
								"pathomit"
							}}
						/>
					</div>

					<div class="dt-trace-panel">
						<SectionHeader
							@label="Output"
						/>

						<div class="dt-trace-field">
							<div
								class="dt-trace-field-head"
							>
								<span
									class="dt-trace-field-label"
								>
									<span
									>Stroke
										width</span>
									{{! wording carried over from the Next app }}
									<InfoTip
										@text="Width of the outline drawn around each traced shape. 0 means no stroke."
									/>
								</span>
								<span
									class="dt-trace-readout"
								>{{this.options.strokewidth}}</span>
							</div>
							<div
								class="segmented dt-trace-strokes"
							>
								{{#each
									STROKE_OPTIONS
									key="width"
									as |option|
								}}
									<button
										type="button"
										class="dt-trace-choice
											{{if
												(eq
													this.options.strokewidth
													option.width
												)
												'is-active'
											}}"
										aria-label={{option.label}}
										{{on
											"click"
											(fn
												this.setOption
												"strokewidth"
												option.width
											)
										}}
									>
										{{#if
											(eq
												option.width
												0
											)
										}}
											<span
												class="dt-trace-choice-none"
											>None</span>
										{{else}}
											<span
												class="dt-trace-swatch"
												style={{option.bar}}
											></span>
										{{/if}}
									</button>
								{{/each}}
							</div>
						</div>

						<div class="dt-trace-field">
							<div
								class="dt-trace-field-head"
							>
								<span
									class="dt-trace-field-label"
								>
									<span
									>Scale</span>
									{{! wording carried over from the Next app }}
									<InfoTip
										@text="Multiplier for the output SVG size relative to the source image."
									/>
								</span>
								<span
									class="dt-trace-readout"
								>{{this.scaleLabel}}</span>
							</div>
							<div
								class="segmented dt-trace-scales"
							>
								{{#each
									SCALE_OPTIONS
									as |option|
								}}
									<button
										type="button"
										class="dt-trace-choice
											{{if
												(eq
													this.options.scale
													option
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setOption
												"scale"
												option
											)
										}}
									>{{option}}x</button>
								{{/each}}
							</div>
						</div>
					</div>
				</div>

				<details class="dt-trace-advanced">
					<summary class="dt-trace-summary">
						<span>Advanced</span>
						<Icon @name="chevron-down" />
					</summary>
					<div class="segmented dt-trace-grid">
						<div class="dt-trace-panel">
							{{! wording carried over from the Next app }}
							<Stepper
								@label="Blur radius"
								@tip="Gaussian blur pre-processing. Smooths the image before tracing to reduce noise."
								@value={{this.options.blurradius}}
								@min={{0}}
								@max={{20}}
								@onChange={{fn
									this.setOption
									"blurradius"
								}}
							/>
							{{! wording carried over from the Next app }}
							<OptionSlider
								@id="dt-trace-blurdelta"
								@label="Blur delta"
								@tip="Threshold for the blur difference. Only relevant when blur radius > 0."
								@display={{this.blurdeltaLabel}}
								@value={{this.options.blurdelta}}
								@min={{0}}
								@max={{256}}
								@step={{1}}
								@onInput={{fn
									this.setFromRange
									"blurdelta"
								}}
							/>
							<div
								class="dt-trace-field"
							>
								<span
									class="dt-trace-field-label"
								>
									<span
									>Colour
										sampling</span>
									{{! wording carried over from the Next app }}
									<InfoTip
										@text="How initial colours are sampled. Generated uses k-means, Random picks randomly, Deterministic uses a fixed grid."
									/>
								</span>
								<Select
									@value={{this.colourSampling}}
									@onValueChange={{this.setColourSampling}}
								>
									<SelectTrigger
									>
										<SelectValue
										>{{this.colourSamplingLabel}}</SelectValue>
									</SelectTrigger>
									<SelectContent
									>
										{{#each
											COLOUR_SAMPLING
											key="value"
											as |entry|
										}}
											<SelectItem
												@value={{entry.value}}
											>{{entry.label}}</SelectItem>
										{{/each}}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div class="dt-trace-panel">
							{{! wording carried over from the Next app }}
							<OptionSlider
								@id="dt-trace-mincolorratio"
								@label="Min colour ratio"
								@tip="Minimum proportion a colour must occupy to be kept. Raise to eliminate rare colours."
								@display={{this.mincolorratioLabel}}
								@value={{this.options.mincolorratio}}
								@min={{0}}
								@max={{1}}
								@step={{0.01}}
								@onInput={{fn
									this.setFromRange
									"mincolorratio"
								}}
							/>
							{{! wording carried over from the Next app }}
							<Stepper
								@label="Coordinate rounding"
								@tip="Decimal places for SVG path coordinates. Lower = smaller file, less precise."
								@value={{this.options.roundcoords}}
								@min={{0}}
								@max={{5}}
								@onChange={{fn
									this.setOption
									"roundcoords"
								}}
							/>
							<div
								class="dt-trace-field"
							>
								<span
									class="dt-trace-field-label"
								>
									<span
									>Layering
										mode</span>
									{{! wording carried over from the Next app }}
									<InfoTip
										@text="Sequential stacks colour layers back-to-front. Parallel creates independent layers per colour."
									/>
								</span>
								<Select
									@value={{this.layering}}
									@onValueChange={{this.setLayering}}
								>
									<SelectTrigger
									>
										<SelectValue
										>{{this.layeringLabel}}</SelectValue>
									</SelectTrigger>
									<SelectContent
									>
										{{#each
											LAYERING
											key="value"
											as |entry|
										}}
											<SelectItem
												@value={{entry.value}}
											>{{entry.label}}</SelectItem>
										{{/each}}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div class="dt-trace-panel">
							{{! wording carried over from the Next app }}
							<OptionSlider
								@id="dt-trace-lcpr"
								@label="Line control point ratio"
								@tip="Adjusts control points on straight line segments. 0 = default placement."
								@display={{this.lcprLabel}}
								@value={{this.options.lcpr}}
								@min={{0}}
								@max={{1}}
								@step={{0.01}}
								@onInput={{fn
									this.setFromRange
									"lcpr"
								}}
							/>
							{{! wording carried over from the Next app }}
							<OptionSlider
								@id="dt-trace-qcpr"
								@label="Quad control point ratio"
								@tip="Adjusts control points on quadratic curves. 0 = default placement."
								@display={{this.qcprLabel}}
								@value={{this.options.qcpr}}
								@min={{0}}
								@max={{1}}
								@step={{0.01}}
								@onInput={{fn
									this.setFromRange
									"qcpr"
								}}
							/>
						</div>
					</div>
				</details>
			{{else}}
				<div class="dt-trace-frame">
					<label
						class="dt-trace-drop"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
					>
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						{{! wording carried over from the Next app }}
						<span
							class="dt-trace-drop-title"
						>Drop an image here</span>
						{{! wording carried over from the Next app }}
						<span
							class="dt-trace-drop-hint"
						>or click to select, or paste —
							PNG, JPG, WebP, GIF</span>
					</label>
				</div>
			{{/if}}
		</div>
	</template>
}
