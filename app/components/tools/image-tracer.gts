import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import type RouterService from '@ember/routing/router-service';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTiles from 'delphicanon/components/canon-tiles';
import type { Rgb } from 'delphicanon/lib/colour';
import { stem } from 'delphicanon/lib/files';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	createTracerWorker,
	displaySize,
	drawTrace,
	grounded,
	type TraceReply,
} from 'delphitools-v2/components/tools/image-tracer/engine';
import Picture from 'delphitools-v2/components/tools/image-tracer/picture';
import {
	SliderRow,
	Tip,
	TitleRow,
	type SliderSpec,
} from 'delphitools-v2/components/tools/image-tracer/rows';
import {
	DEFAULT_OPTIONS,
	LAYERING,
	PRESETS,
	SAMPLING,
	SCALES,
	STROKES,
	fromPreset,
	hundredths,
	number,
	outline,
	palette,
	parseTrace,
	smoothing,
	totals,
	traceOptions,
	whole,
	type NumericOption,
	type TraceVectors,
	type TracerOptions,
} from 'delphitools-v2/components/tools/image-tracer/trace';
import './image-tracer/image-tracer.css';

const HANDOFF_KEY = 'svg-optimiser-input';
const TRACE_FAILED = 'This image could not be traced';
const DASH = '—';

const presetNames = PRESETS.map((preset) => preset.name);
const strokeNames = STROKES.map((width) =>
	width === 0 ? 'None' : number(width),
);
const scaleNames = SCALES.map((scale) => `${number(scale)}×`);

const TIPS = {
	colours: 'Number of colours used to quantise the image before tracing. Fewer colours = simpler, bolder result.',
	stroke: 'Width of the outline drawn around each traced shape. 0 means no stroke.',
	scale: 'Multiplier for the output SVG size relative to the source image.',
	sampling: 'How initial colours are sampled. Generated uses k-means, Random picks randomly, Deterministic uses a fixed grid.',
	layering: 'Sequential stacks colour layers back-to-front. Parallel creates independent layers per colour.',
};

const slider = (
	key: NumericOption,
	title: string,
	tip: string,
	min: number,
	max: number,
	step: number,
	readout: (value: number) => string,
): SliderSpec => ({ key, title, tip, min, max, step, readout });

const TRACE_SLIDERS = [
	slider(
		'colorquantcycles',
		'Quantise',
		'Number of k-means iterations for colour clustering. More cycles = more accurate colours, slower trace.',
		1,
		20,
		1,
		whole,
	),
	slider(
		'ltres',
		'Line smoothing',
		'Controls how aggressively straight lines replace curves. Higher = smoother with fewer curves.',
		0,
		10,
		0.1,
		smoothing,
	),
	slider(
		'qtres',
		'Curve smoothing',
		'Controls quadratic spline fitting. Higher = smoother curves with less detail.',
		0,
		10,
		0.1,
		smoothing,
	),
	slider(
		'pathomit',
		'Min path size',
		'Paths with fewer than this many nodes are removed. Raise to filter out noise and small artefacts.',
		0,
		200,
		1,
		whole,
	),
];

const BLUR_SLIDERS = [
	slider(
		'blurradius',
		'Blur radius',
		'Gaussian blur pre-processing. Smooths the image before tracing to reduce noise.',
		0,
		20,
		1,
		whole,
	),
	slider(
		'blurdelta',
		'Blur delta',
		'Threshold for the blur difference. Only relevant when blur radius > 0.',
		0,
		256,
		1,
		whole,
	),
];

const RATIO_SLIDERS = [
	slider(
		'mincolorratio',
		'Min colour ratio',
		'Minimum proportion a colour must occupy to be kept. Raise to eliminate rare colours.',
		0,
		1,
		0.01,
		hundredths,
	),
	slider(
		'roundcoords',
		'Coordinate rounding',
		'Decimal places for SVG path coordinates. Lower = smaller file, less precise.',
		0,
		5,
		1,
		whole,
	),
];

const POINT_SLIDERS = [
	slider(
		'lcpr',
		'Line control point ratio',
		'Adjusts control points on straight line segments. 0 = default placement.',
		0,
		1,
		0.01,
		hundredths,
	),
	slider(
		'qcpr',
		'Quad control point ratio',
		'Adjusts control points on quadratic curves. 0 = default placement.',
		0,
		1,
		0.01,
		hundredths,
	),
];

const optionValue = (options: TracerOptions, key: string) =>
	options[key as NumericOption];

const keepPaste = (event: Event) => event.stopPropagation();

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Wand = <template><IconSvg @name="wand-sparkles" /></template>;
const Refresh = <template><IconSvg @name="refresh-cw" /></template>;

interface Source {
	name: string;
	stem: string;
	bytes: number;
	width: number;
	height: number;
	shown: { width: number; height: number };
	pixels: ImageData;
	url?: string;
}

interface Trace {
	svg: string;
	vectors: TraceVectors;
	filled: string;
	outlined: string;
	palette: Rgb[];
}

function pixelsOf(bitmap: ImageBitmap) {
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(bitmap, 0, 0);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

export default class ImageTracer extends Component {
	@service declare router: RouterService;
	@service('canon-toast') declare toast: CanonToastService;
	@tracked source?: Source;
	@tracked trace?: Trace;
	@tracked options: TracerOptions = { ...DEFAULT_OPTIONS };
	@tracked preset?: number = 0;
	@tracked dirty = false;
	@tracked tracing = false;
	@tracked failure = '';
	@tracked outlines = false;

	drop = new Drop('image/*', (file) => void this.load(file));
	#extras: Record<string, unknown> = {};
	#run = 0;
	#worker?: Promise<Worker | null>;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.outlines = query.has('traceOutlines');
		const preset = Number(query.get('tracePreset') ?? NaN);
		void (async () => {
			if (PRESETS[preset]) await this.pickPreset(preset);
			if (query.has('traceSample'))
				await this.load(await drawnSample());
		})();
		registerDestructor(this, () => {
			this.#run++;
			this.#release(this.source, this.trace);
			void this.#worker?.then((worker) =>
				worker?.terminate(),
			);
		});
	}

	get pictureAspect() {
		const shown = this.source?.shown;
		return shown ? shown.width / shown.height : 4 / 3;
	}

	get aspect() {
		return Math.min(Math.max(this.pictureAspect, 0.8), 1.6);
	}

	get sourceText() {
		const { source } = this;
		return source
			? `${source.width} × ${source.height} · ${formatBytes(source.bytes)}`
			: '';
	}

	get after() {
		const { trace } = this;
		if (!trace) return undefined;
		return this.outlines ? trace.outlined : trace.filled;
	}

	get code() {
		return this.trace ? outline(this.trace.svg) : '';
	}

	get tiles() {
		const { trace } = this;
		if (!trace)
			return [
				'Colours',
				'Paths',
				'Lines',
				'Curves',
				'Size',
				'File Size',
			].map((label) => ({ label, value: DASH }));
		const sum = totals(trace.vectors);
		const segments = Math.max(sum.lines + sum.curves, 1);
		const count = (value: number) => value.toLocaleString();
		return [
			{
				label: 'Colours',
				value: count(trace.palette.length),
			},
			{ label: 'Paths', value: count(sum.paths) },
			{ label: 'Lines', value: count(sum.lines) },
			{
				label: 'Curves',
				value: count(sum.curves),
				level: sum.curves / segments,
			},
			{
				label: 'Size',
				value: `${number(trace.vectors.width)} × ${number(trace.vectors.height)}`,
			},
			{
				label: 'File Size',
				value: formatBytes(new Blob([trace.svg]).size),
			},
		];
	}

	get strokeIndex() {
		return STROKES.indexOf(this.options.strokewidth);
	}

	get scaleIndex() {
		return SCALES.indexOf(this.options.scale);
	}

	get retraceShown() {
		return !!this.source && this.dirty && !this.tracing;
	}

	get actionsDisabled() {
		return !this.trace || this.tracing;
	}

	get downloadText() {
		return passAlong('Download');
	}

	dropped = (event: DragEvent) => {
		if (event.defaultPrevented) this.drop.over = false;
		else this.drop.drop(event);
	};

	loadFiles = (files: File[]) => {
		if (files[0]) void this.load(files[0]);
	};

	load = async (file: File) => {
		const run = ++this.#run;
		this.tracing = true;
		this.failure = '';
		let bitmap: ImageBitmap;
		try {
			bitmap = await decodeImage(file);
		} catch {
			if (run !== this.#run) return;
			this.tracing = false;
			this.failure = TRACE_FAILED;
			return;
		}
		if (run !== this.#run || isDestroying(this)) {
			bitmap.close();
			return;
		}
		const shown = displaySize(bitmap.width, bitmap.height);
		const named = !!file.name && file.name !== 'pasted';
		const source: Source = {
			name: named ? file.name : 'Image',
			stem: (named && stem(file.name)) || 'image',
			bytes: file.size,
			width: bitmap.width,
			height: bitmap.height,
			shown,
			pixels: pixelsOf(bitmap),
		};
		source.url = await grounded(bitmap, shown.width, shown.height);
		bitmap.close();
		if (run !== this.#run || isDestroying(this)) {
			this.#release(source);
			return;
		}
		this.#release(this.source, this.trace);
		this.source = source;
		this.trace = undefined;
		this.dirty = false;
		void this.#trace();
	};

	clear = () => {
		this.#run++;
		this.#release(this.source, this.trace);
		this.source = undefined;
		this.trace = undefined;
		this.tracing = false;
		this.failure = '';
		this.dirty = false;
	};

	#release(source?: Source, trace?: Trace) {
		if (source?.url) URL.revokeObjectURL(source.url);
		if (trace) {
			URL.revokeObjectURL(trace.filled);
			URL.revokeObjectURL(trace.outlined);
		}
	}

	#tracer() {
		this.#worker ??= createTracerWorker(
			(reply) => void this.#receive(reply),
		).then((worker) => {
			if (worker)
				worker.onerror = () =>
					void this.#receive({
						id: this.#run,
						error: 'worker failed',
					});
			return worker;
		});
		return this.#worker;
	}

	async #trace() {
		const { source } = this;
		if (!source) return;
		const id = ++this.#run;
		this.tracing = true;
		this.failure = '';
		const opts = traceOptions(this.options, this.#extras);
		const worker = await this.#tracer();
		if (id !== this.#run) return;
		if (worker) {
			const buffer = new Uint8ClampedArray(source.pixels.data)
				.buffer;
			worker.postMessage(
				{
					id,
					buffer,
					width: source.pixels.width,
					height: source.pixels.height,
					opts,
				},
				[buffer],
			);
			return;
		}
		let reply: TraceReply;
		try {
			const { default: tracer } =
				await import('imagetracerjs');
			reply = {
				id,
				svg: tracer.imagedataToSVG(source.pixels, opts),
			};
		} catch (error) {
			reply = { id, error: String(error) };
		}
		await this.#receive(reply);
	}

	async #receive({ id, svg, error }: TraceReply) {
		if (id !== this.#run || isDestroying(this)) return;
		const vectors = svg ? parseTrace(svg) : undefined;
		const shown = this.source?.shown;
		const drawn =
			svg && vectors && shown
				? await drawTrace(
						svg,
						vectors,
						shown.width,
						shown.height,
					)
				: undefined;
		if (id !== this.#run || isDestroying(this)) {
			if (drawn) {
				URL.revokeObjectURL(drawn.filled);
				URL.revokeObjectURL(drawn.outlined);
			}
			return;
		}
		this.tracing = false;
		if (!svg || !vectors || !drawn) {
			if (error)
				console.error('Image tracing failed:', error);
			this.failure = TRACE_FAILED;
			return;
		}
		this.#release(undefined, this.trace);
		this.trace = {
			svg,
			vectors,
			...drawn,
			palette: palette(vectors),
		};
	}

	setOption = (key: string, value: number) => {
		if (optionValue(this.options, key) === value) return;
		this.options = { ...this.options, [key]: value };
		this.dirty = true;
		this.preset = undefined;
	};

	pickStroke = (index: number) =>
		this.setOption('strokewidth', STROKES[index] ?? 1);

	pickScale = (index: number) => {
		const scale = SCALES[index] ?? 1;
		if (scale === this.options.scale) return;
		this.options = { ...this.options, scale };
		this.dirty = true;
	};

	pickPreset = async (index: number) => {
		const entry = PRESETS[index];
		if (!entry) return;
		let preset: Record<string, unknown> | undefined;
		try {
			const { default: tracer } =
				await import('imagetracerjs');
			preset = tracer.optionpresets[entry.id];
		} catch (error) {
			console.error('Preset lookup failed:', error);
		}
		if (!preset || isDestroying(this)) return;
		const { options, extras } = fromPreset(
			preset,
			this.options.scale,
		);
		this.options = options;
		this.#extras = extras;
		this.preset = index;
		this.dirty = true;
	};

	pickOutlines = (on: boolean) => (this.outlines = on);

	retrace = () => {
		this.dirty = false;
		void this.#trace();
	};

	copy = () => {
		if (this.trace) void this.toast.copy(this.trace.svg);
	};

	download = () => {
		if (!this.trace || !this.source) return;
		downloadText(
			this.trace.svg,
			`${this.source.stem}-traced.svg`,
			'image/svg+xml',
		);
	};

	optimise = () => {
		if (!this.trace) return;
		sessionStorage.setItem(HANDOFF_KEY, this.trace.svg);
		void this.router.transitionTo('tools.tool', 'svg-optimiser');
	};

	<template>
		<CanonSplit
			class="image-tracer"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.dropped}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<Picture
						@before={{this.source.url}}
						@aspect={{this.pictureAspect}}
						@after={{this.after}}
						@palette={{this.trace.palette}}
						@tracing={{this.tracing}}
						@over={{this.drop.over}}
						@onFile={{this.load}}
					>
						{{#if this.retraceShown}}
							<CanonButton
								class="trace-retrace"
								@kind="primary"
								@text="Retrace"
								@icon={{Refresh}}
								@onClick={{this.retrace}}
							/>
						{{/if}}
					</Picture>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.source}}
						<CanonRow
							class="trace-source"
							@title={{this.source.name}}
							@detail={{this.sourceText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<CanonDropZone
							class="trace-drop"
							@prompt="Drop an image"
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Trace" />
					<CanonRow
						class="trace-preset"
						@title="Preset"
						@form="flush"
						as |titleId|
					>
						<CanonMenuCell
							@items={{presetNames}}
							@selected={{this.preset}}
							@placeholder="Custom"
							@labelledBy={{titleId}}
							@onChange={{this.pickPreset}}
						/>
					</CanonRow>
					<CanonRow
						class="trace-row trace-colours"
						@title="Colours"
						@form="flush"
						as |titleId|
					>
						<Tip
							@label="Colours"
							@text={{TIPS.colours}}
						/>
						<CanonNumberField
							@value={{this.options.numberofcolors}}
							@min={{2}}
							@max={{64}}
							@labelledBy={{titleId}}
							@onChange={{fn
								this.setOption
								"numberofcolors"
							}}
						/>
					</CanonRow>
					{{#each TRACE_SLIDERS as |spec|}}
						<SliderRow
							@spec={{spec}}
							@value={{optionValue
								this.options
								spec.key
							}}
							@onChange={{this.setOption}}
						/>
					{{/each}}
					<TitleRow
						@title="Stroke Width"
						@tip={{TIPS.stroke}}
					/>
					<CanonSegmented
						class="trace-strokes"
						@items={{strokeNames}}
						@columns={{6}}
						@selected={{this.strokeIndex}}
						@onChange={{this.pickStroke}}
						aria-label="Stroke Width"
					/>
					<TitleRow
						@title="Scale"
						@tip={{TIPS.scale}}
					/>
					<CanonSegmented
						class="trace-scales"
						@items={{scaleNames}}
						@columns={{5}}
						@selected={{this.scaleIndex}}
						@onChange={{this.pickScale}}
						aria-label="Scale"
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Advanced" />
					{{#each BLUR_SLIDERS as |spec|}}
						<SliderRow
							@spec={{spec}}
							@value={{optionValue
								this.options
								spec.key
							}}
							@onChange={{this.setOption}}
						/>
					{{/each}}
					<TitleRow
						@title="Colour sampling"
						@tip={{TIPS.sampling}}
					/>
					<CanonSegmented
						class="trace-sampling"
						@items={{SAMPLING}}
						@selected={{this.options.colorsampling}}
						@onChange={{fn
							this.setOption
							"colorsampling"
						}}
						aria-label="Colour sampling"
					/>
					{{#each RATIO_SLIDERS as |spec|}}
						<SliderRow
							@spec={{spec}}
							@value={{optionValue
								this.options
								spec.key
							}}
							@onChange={{this.setOption}}
						/>
					{{/each}}
					<TitleRow
						@title="Layering mode"
						@tip={{TIPS.layering}}
					/>
					<CanonSegmented
						class="trace-layering"
						@items={{LAYERING}}
						@selected={{this.options.layering}}
						@onChange={{fn
							this.setOption
							"layering"
						}}
						aria-label="Layering mode"
					/>
					{{#each POINT_SLIDERS as |spec|}}
						<SliderRow
							@spec={{spec}}
							@value={{optionValue
								this.options
								spec.key
							}}
							@onChange={{this.setOption}}
						/>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Traced SVG" />
					{{#if this.tracing}}
						<CanonRow
							class="trace-busy-row"
							@title="Tracing…"
						>
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.failure}}
						<CanonStatus
							class="trace-failure"
							@text={{this.failure}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonRow
						class="trace-outlines"
						@title="Outlines"
						as |titleId|
					>
						<CanonSwitch
							@on={{this.outlines}}
							@onChange={{this.pickOutlines}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonTiles @items={{this.tiles}} />
					<CanonCodeBlock
						class="trace-code"
						@code={{this.code}}
						@maxHeight={{240}}
					/>
					<CanonGrid>
						<CanonButton
							class="trace-copy"
							@text="Copy"
							@icon={{Copy}}
							@disabled={{this.actionsDisabled}}
							@onClick={{this.copy}}
						/>
						<CanonButton
							class="trace-optimise"
							@text="Optimise"
							@icon={{Wand}}
							@disabled={{this.actionsDisabled}}
							@onClick={{this.optimise}}
						/>
						<CanonButton
							class="trace-download"
							@kind="primary"
							@text={{this.downloadText}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{this.actionsDisabled}}
							@onClick={{this.download}}
						/>
					</CanonGrid>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
