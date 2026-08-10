import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type Owner from '@ember/owner';
import Icon from 'delphitools-v2/components/icon';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from 'delphitools-v2/components/ui/tooltip';

const ZTRIG_HINT = '-2π to 2π, -4 to 4';

/** Narrowest and widest window a wheel zoom will settle on, in graph units. */
const MIN_RANGE = 1;
const MAX_RANGE = 10000;

const GRAPH_HEIGHT = 400;

/** Used until the ResizeObserver reports the real width. */
const DEFAULT_WIDTH = 800;

const MIN_PIXELS_PER_LINE = 30;

/** One sample per device pixel column, up to here; a pan redraws every frame. */
const MAX_SAMPLES = 2000;

/**
 * How far past the viewport a sample may sit before its pixel row is clamped.
 * Samples are one pixel column apart, so a clamped neighbour moves the visible
 * edge crossing by well under a pixel.
 */
const OVERDRAW = 4;

const MAX_TRACE_ROWS = 10;

type Operator = '=' | '<' | '>' | '≤' | '≥';

const OPERATORS: Operator[] = ['=', '<', '>', '≤', '≥'];

const COLOURS = [
	'#3b82f6',
	'#ef4444',
	'#22c55e',
	'#f59e0b',
	'#8b5cf6',
	'#ec4899',
	'#06b6d4',
	'#f97316',
];

const SYNTAX_EXAMPLES = [
	'x^2',
	'sin(x)',
	'sqrt(x)',
	'log(x)',
	'abs(x)',
	'2*x + 1',
	'exp(x)',
	'tan(x)',
];

// mathjs reads log as the natural log; every calculator and textbook reads it
// as base 10.
const MATH_SCOPE = { log: Math.log10, ln: Math.log };

interface FunctionEntry {
	id: string;
	expression: string;
	colour: string;
	visible: boolean;
	operator: Operator;
}

interface Bounds {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

type Evaluator = (x: number) => number;

// mathjs is ~700 KB and nothing on first paint needs it, so the plot surface
// renders empty until the import lands.
let compileExpression: typeof import('mathjs').compile | null = null;
let mathjsLoad: Promise<void> | null = null;

function loadMathjs(): Promise<void> {
	mathjsLoad ??= import('mathjs').then((mathjs) => {
		compileExpression = mathjs.compile;
	});
	return mathjsLoad;
}

function createEvaluator(expression: string): Evaluator | null {
	if (!compileExpression || !expression.trim()) return null;

	try {
		const compiled = compileExpression(expression);
		// mathjs also returns complex numbers, units and matrices, none of
		// which can be plotted.
		if (
			typeof compiled.evaluate({ x: 1, ...MATH_SCOPE }) !==
			'number'
		) {
			return null;
		}
		return (x: number) => {
			try {
				const result: unknown = compiled.evaluate({
					x,
					...MATH_SCOPE,
				});
				return typeof result === 'number'
					? result
					: NaN;
			} catch {
				return NaN;
			}
		};
	} catch {
		return null;
	}
}

/** Rounds a range down to a tick interval of 1, 2 or 5 times a power of ten. */
function niceStep(range: number): number {
	const roughStep = range / 10;
	const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
	const residual = roughStep / magnitude;

	if (residual < 1.5) return magnitude;
	if (residual < 3) return 2 * magnitude;
	if (residual < 7) return 5 * magnitude;
	return 10 * magnitude;
}

/** The tick interval, widened until the lines are at least 30px apart. */
function adaptiveStep(range: number, pixels: number): number {
	// A reversed or empty range makes niceStep return 0, and the widening loop
	// below would then never terminate.
	if (!(range > 0) || !(pixels > 0)) return 1;
	const minStep = (range / pixels) * MIN_PIXELS_PER_LINE;
	let step = niceStep(range);
	while (step < minStep) step *= 2;
	return step;
}

function ticksIn(min: number, max: number, step: number): number[] {
	if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max)) {
		return [];
	}
	const first = Math.ceil(min / step) * step;
	const out: number[] = [];
	for (let i = 0; first + i * step <= max; i++)
		out.push(first + i * step);
	return out;
}

function formatTickLabel(value: number, step: number): string {
	const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
	const text = (Math.round(value / step) * step).toFixed(decimals);
	if (decimals > 0) return text.replace(/\.?0+$/, '') || '0';
	return text;
}

function formatNumber(n: number): string {
	if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(3);
	return n.toFixed(4).replace(/\.?0+$/, '');
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

interface CurvePaths {
	line: string;
	region: string;
}

/**
 * Samples the function across the visible x range and returns the curve as SVG
 * path data, plus the region between it and `fillEdge` when one is given.
 * A run ends wherever the function is undefined or crosses an asymptote, so
 * neither the curve nor the shading spans the break.
 */
function plotPaths(
	evaluate: Evaluator,
	bounds: Bounds,
	width: number,
	height: number,
	fillEdge: number | null,
): CurvePaths {
	const spanX = bounds.xMax - bounds.xMin;
	const spanY = bounds.yMax - bounds.yMin;
	if (!(width > 0) || !(spanX > 0) || !(spanY > 0)) {
		return { line: '', region: '' };
	}

	const samples = Math.max(
		2,
		Math.min(
			MAX_SAMPLES,
			Math.round(width * (window.devicePixelRatio || 1)),
		),
	);
	const minPy = -OVERDRAW * height;
	const maxPy = (1 + OVERDRAW) * height;

	const lines: string[] = [];
	const regions: string[] = [];
	let run: string[] = [];
	let runStart = 0;
	let runEnd = 0;
	let previous = NaN;

	const flush = () => {
		if (run.length > 1) {
			const points = run.join('L');
			lines.push(`M${points}`);
			if (fillEdge !== null) {
				regions.push(
					`M${runStart.toFixed(2)},${fillEdge}L${points}L${runEnd.toFixed(2)},${fillEdge}Z`,
				);
			}
		}
		run = [];
	};

	for (let i = 0; i <= samples; i++) {
		const fraction = i / samples;
		const y = evaluate(bounds.xMin + fraction * spanX);

		if (!Number.isFinite(y)) {
			flush();
			previous = NaN;
			continue;
		}
		// Opposite signs across one pixel column, several viewport heights
		// apart: a vertical asymptote rather than a steep slope.
		if (previous * y < 0 && Math.abs(y - previous) > spanY) flush();

		const px = fraction * width;
		const py = clamp(
			((bounds.yMax - y) / spanY) * height,
			minPy,
			maxPy,
		);
		if (run.length === 0) runStart = px;
		runEnd = px;
		run.push(`${px.toFixed(2)},${py.toFixed(2)}`);
		previous = y;
	}
	flush();

	return { line: lines.join(''), region: regions.join('') };
}

function swatchStyle(colour: string) {
	return htmlSafe(`background-color: ${colour}`);
}

export default class GraphCalcTool extends Component {
	@tracked functions: FunctionEntry[] = [
		{
			id: 'f1',
			expression: 'x^2',
			colour: COLOURS[0]!,
			visible: true,
			operator: '=',
		},
	];

	@tracked xMin = -10;
	@tracked xMax = 10;
	@tracked yMin = -10;
	@tracked yMax = 10;

	@tracked showGrid = true;
	@tracked showAxes = true;
	@tracked showNumbers = true;

	@tracked traceInput = '';
	@tracked traceResults: {
		key: number;
		xLabel: string;
		results: {
			id: string;
			expression: string;
			y: string;
			colour: string;
			dotStyle: ReturnType<typeof htmlSafe>;
		}[];
	}[] = [];

	@tracked plotWidth = DEFAULT_WIDTH;
	@tracked isPanning = false;
	@tracked mathReady = false;

	#nextId = 2;
	#nextTraceKey = 0;
	#alive = true;
	#pan: (Bounds & { px: number; py: number }) | null = null;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		void loadMathjs().then(() => {
			if (this.#alive) this.mathReady = true;
		});
	}

	willDestroy() {
		super.willDestroy();
		this.#alive = false;
	}

	get bounds(): Bounds {
		return {
			xMin: this.xMin,
			xMax: this.xMax,
			yMin: this.yMin,
			yMax: this.yMax,
		};
	}

	get graphHeight() {
		return GRAPH_HEIGHT;
	}

	get viewBox() {
		return `0 0 ${this.plotWidth} ${GRAPH_HEIGHT}`;
	}

	get rangeReadout() {
		return `X: ${(this.xMax - this.xMin).toFixed(3)} | Y: ${(this.yMax - this.yMin).toFixed(3)}`;
	}

	get xMinValue() {
		return Math.round(this.xMin * 10) / 10;
	}

	get xMaxValue() {
		return Math.round(this.xMax * 10) / 10;
	}

	get yMinValue() {
		return Math.round(this.yMin * 10) / 10;
	}

	get yMaxValue() {
		return Math.round(this.yMax * 10) / 10;
	}

	get canRemove() {
		return this.functions.length > 1;
	}

	/**
	 * Compilation happens here and nowhere else: this reads no bound, so a pan
	 * or a zoom reuses the evaluators rather than recompiling every expression.
	 */
	@cached
	get rows() {
		return this.functions.map((entry, index) => {
			const evaluator = createEvaluator(entry.expression);
			return {
				id: entry.id,
				entry,
				number: index + 1,
				evaluator,
				swatch: swatchStyle(entry.colour),
				error:
					this.mathReady &&
					entry.expression.trim() !== '' &&
					evaluator === null,
			};
		});
	}

	get xStep() {
		return adaptiveStep(this.xMax - this.xMin, this.plotWidth);
	}

	get yStep() {
		return adaptiveStep(this.yMax - this.yMin, GRAPH_HEIGHT);
	}

	get showXLabels() {
		return (
			this.plotWidth /
				((this.xMax - this.xMin) / this.xStep) >
			50
		);
	}

	get showYLabels() {
		return (
			GRAPH_HEIGHT / ((this.yMax - this.yMin) / this.yStep) >
			30
		);
	}

	#toPx(x: number) {
		return (
			((x - this.xMin) / (this.xMax - this.xMin)) *
			this.plotWidth
		);
	}

	#toPy(y: number) {
		return (
			((this.yMax - y) / (this.yMax - this.yMin)) *
			GRAPH_HEIGHT
		);
	}

	@cached
	get xTicks() {
		const step = this.xStep;
		const labelled = this.showXLabels;
		// Sits just under the x axis, or against the viewport edge once the
		// axis has been panned out of sight.
		const labelY = clamp(this.#toPy(0) + 16, 14, GRAPH_HEIGHT - 4);
		return ticksIn(this.xMin, this.xMax, step).map((value) => ({
			key: value,
			px: this.#toPx(value),
			labelY,
			label:
				labelled && Math.abs(value) > step / 2
					? formatTickLabel(value, step)
					: '',
		}));
	}

	@cached
	get yTicks() {
		const step = this.yStep;
		const labelled = this.showYLabels;
		const labelX = clamp(this.#toPx(0) - 8, 24, this.plotWidth - 4);
		return ticksIn(this.yMin, this.yMax, step).map((value) => ({
			key: value,
			py: this.#toPy(value),
			labelX,
			label:
				labelled && Math.abs(value) > step / 2
					? formatTickLabel(value, step)
					: '',
		}));
	}

	/** The grid toggle hides the labels with it, as the Next app's does. */
	get showTicks() {
		return this.showGrid && this.showNumbers;
	}

	get axisX() {
		return this.#toPy(0);
	}

	get axisY() {
		return this.#toPx(0);
	}

	@cached
	get curves() {
		const bounds = this.bounds;
		const width = this.plotWidth;

		return this.rows.flatMap((row) => {
			const { entry, evaluator } = row;
			if (!evaluator || !entry.visible) return [];

			const operator = entry.operator;
			const strict = operator === '<' || operator === '>';
			// The shaded half-plane closes against the bottom of the
			// viewport for the two "less than" forms and the top for the
			// two "greater than" forms.
			const fillEdge =
				operator === '='
					? null
					: operator === '<' || operator === '≤'
						? GRAPH_HEIGHT
						: 0;

			const paths = plotPaths(
				evaluator,
				bounds,
				width,
				GRAPH_HEIGHT,
				fillEdge,
			);

			return [
				{
					id: entry.id,
					colour: entry.colour,
					line: paths.line,
					region: paths.region,
					dash: strict ? '4 2' : undefined,
					strokeOpacity: strict ? '0.5' : '1',
				},
			];
		});
	}

	// The ResizeObserver keeps the viewBox at one user unit per CSS pixel, so
	// stroke widths and labels stay the size the stylesheet asks for. The wheel
	// listener is native because {{on}} attaches passive listeners, and a
	// passive listener cannot preventDefault the page scroll.
	registerSurface = modifier((element: SVGSVGElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width ?? 0;
			if (width > 0) this.plotWidth = width;
		});
		observer.observe(element);
		element.addEventListener('wheel', this.handleWheel, {
			passive: false,
		});
		element.addEventListener('pointerdown', this.handlePointerDown);
		element.addEventListener('pointermove', this.handlePointerMove);
		element.addEventListener('pointerup', this.handlePointerUp);
		element.addEventListener('pointercancel', this.handlePointerUp);

		return () => {
			observer.disconnect();
			element.removeEventListener('wheel', this.handleWheel);
			element.removeEventListener(
				'pointerdown',
				this.handlePointerDown,
			);
			element.removeEventListener(
				'pointermove',
				this.handlePointerMove,
			);
			element.removeEventListener(
				'pointerup',
				this.handlePointerUp,
			);
			element.removeEventListener(
				'pointercancel',
				this.handlePointerUp,
			);
		};
	});

	handlePointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		this.#pan = {
			px: event.clientX,
			py: event.clientY,
			...this.bounds,
		};
		this.isPanning = true;
		(event.currentTarget as Element).setPointerCapture(
			event.pointerId,
		);
	};

	handlePointerMove = (event: PointerEvent) => {
		const start = this.#pan;
		if (!start) return;

		const dx =
			((event.clientX - start.px) / this.plotWidth) *
			(start.xMax - start.xMin);
		const dy =
			((event.clientY - start.py) / GRAPH_HEIGHT) *
			(start.yMax - start.yMin);

		this.xMin = start.xMin - dx;
		this.xMax = start.xMax - dx;
		this.yMin = start.yMin + dy;
		this.yMax = start.yMax + dy;
	};

	handlePointerUp = (event: PointerEvent) => {
		this.#pan = null;
		this.isPanning = false;
		const surface = event.currentTarget as Element;
		if (surface.hasPointerCapture(event.pointerId)) {
			surface.releasePointerCapture(event.pointerId);
		}
	};

	handleWheel = (event: WheelEvent) => {
		event.preventDefault();

		const rect = (
			event.currentTarget as Element
		).getBoundingClientRect();
		const { xMin, xMax, yMin, yMax } = this.bounds;
		const relativeX = clamp(
			(event.clientX - rect.left) / rect.width,
			0,
			1,
		);
		const relativeY = clamp(
			(event.clientY - rect.top) / rect.height,
			0,
			1,
		);

		const cursorX = xMin + relativeX * (xMax - xMin);
		const cursorY = yMax - relativeY * (yMax - yMin);
		const factor = event.deltaY > 0 ? 1.1 : 0.9;

		const newXMin = cursorX - (cursorX - xMin) * factor;
		const newXMax = cursorX + (xMax - cursorX) * factor;
		const newYMin = cursorY - (cursorY - yMin) * factor;
		const newYMax = cursorY + (yMax - cursorY) * factor;

		const xRange = newXMax - newXMin;
		const yRange = newYMax - newYMin;
		if (xRange < MIN_RANGE || yRange < MIN_RANGE) return;
		if (xRange > MAX_RANGE || yRange > MAX_RANGE) return;

		this.xMin = newXMin;
		this.xMax = newXMax;
		this.yMin = newYMin;
		this.yMax = newYMax;
	};

	#update(id: string, changes: Partial<FunctionEntry>) {
		this.functions = this.functions.map((entry) =>
			entry.id === id ? { ...entry, ...changes } : entry,
		);
	}

	addFunction = () => {
		this.functions = [
			...this.functions,
			{
				id: `f${this.#nextId++}`,
				expression: '',
				colour: COLOURS[
					this.functions.length % COLOURS.length
				]!,
				visible: true,
				operator: '=',
			},
		];
	};

	removeFunction = (id: string) => {
		this.functions = this.functions.filter(
			(entry) => entry.id !== id,
		);
	};

	setExpression = (id: string, event: Event) => {
		this.#update(id, {
			expression: (event.target as HTMLInputElement).value,
		});
	};

	toggleVisibility = (id: string, visible: boolean) => {
		this.#update(id, { visible: !visible });
	};

	cycleColour = (id: string, colour: string) => {
		const next = (COLOURS.indexOf(colour) + 1) % COLOURS.length;
		this.#update(id, { colour: COLOURS[next]! });
	};

	cycleOperator = (id: string, operator: Operator) => {
		const next =
			(OPERATORS.indexOf(operator) + 1) % OPERATORS.length;
		this.#update(id, { operator: OPERATORS[next]! });
	};

	toggleGrid = () => (this.showGrid = !this.showGrid);
	toggleAxes = () => (this.showAxes = !this.showAxes);
	toggleNumbers = () => (this.showNumbers = !this.showNumbers);

	setXMin = (event: Event) => (this.xMin = numberFrom(event, -10));
	setXMax = (event: Event) => (this.xMax = numberFrom(event, 10));
	setYMin = (event: Event) => (this.yMin = numberFrom(event, -10));
	setYMax = (event: Event) => (this.yMax = numberFrom(event, 10));

	setView = (xMin: number, xMax: number, yMin: number, yMax: number) => {
		this.xMin = xMin;
		this.xMax = xMax;
		this.yMin = yMin;
		this.yMax = yMax;
	};

	zoomStandard = () => this.setView(-10, 10, -10, 10);
	zoomTrig = () => this.setView(-2 * Math.PI, 2 * Math.PI, -4, 4);
	zoomDecimal = () => this.setView(-1, 1, -1, 1);
	resetView = () => this.setView(-10, 10, -10, 10);

	/** Matches the y range to the x range at the plot's own aspect ratio. */
	zoomSquare = () => {
		const yRange =
			((this.xMax - this.xMin) / this.plotWidth) *
			GRAPH_HEIGHT;
		const centre = (this.yMax + this.yMin) / 2;
		this.yMin = centre - yRange / 2;
		this.yMax = centre + yRange / 2;
	};

	setTraceInput = (event: Event) => {
		this.traceInput = (event.target as HTMLInputElement).value;
	};

	traceOnEnter = (event: KeyboardEvent) => {
		if (event.key === 'Enter') this.trace();
	};

	trace = () => {
		const x = parseFloat(this.traceInput);
		if (!Number.isFinite(x)) return;

		const results = this.rows.flatMap((row) => {
			const { entry, evaluator } = row;
			if (!evaluator || !entry.visible) return [];
			const y = evaluator(x);
			if (!Number.isFinite(y)) return [];
			return [
				{
					id: entry.id,
					expression: entry.expression,
					y: formatNumber(y),
					colour: entry.colour,
					dotStyle: swatchStyle(entry.colour),
				},
			];
		});

		if (results.length === 0) return;
		this.traceResults = [
			{
				key: this.#nextTraceKey++,
				xLabel: formatNumber(x),
				results,
			},
			...this.traceResults,
		].slice(0, MAX_TRACE_ROWS);
	};

	clearTrace = () => (this.traceResults = []);

	<template>
		<div class="dt-graph">
			<div class="dt-graph-section">
				<span class="dt-graph-label">Functions</span>

				<div class="dt-graph-rows">
					{{#each this.rows key="id" as |row|}}
						<div class="dt-graph-row">
							<span
								class="dt-graph-name"
							>y<sub
								>{{row.number}}</sub></span>

							<button
								type="button"
								class="dt-graph-swatch"
								title="Change colour"
								{{on
									"click"
									(fn
										this.cycleColour
										row.entry.id
										row.entry.colour
									)
								}}
							>
								<span
									class="dt-graph-swatch-fill"
									style={{row.swatch}}
								></span>
								<Icon
									@name="palette"
								/>
							</button>

							<button
								type="button"
								class="dt-graph-op"
								title="Change operator"
								{{on
									"click"
									(fn
										this.cycleOperator
										row.entry.id
										row.entry.operator
									)
								}}
							>{{row.entry.operator}}</button>

							<span
								class="dt-graph-expr"
							>
								<input
									class="dt-graph-input
										{{if
											row.error
											'is-error'
										}}"
									type="text"
									spellcheck="false"
									autocomplete="off"
									placeholder="x^2, sin(x), etc."
									value={{row.entry.expression}}
									aria-label="Expression"
									{{on
										"input"
										(fn
											this.setExpression
											row.entry.id
										)
									}}
								/>
								{{#if
									row.error
								}}
									<span
										class="dt-graph-error"
									>Invalid
										expression</span>
								{{/if}}
							</span>

							<button
								type="button"
								class="dt-graph-eye"
								title={{if
									row.entry.visible
									"Hide"
									"Show"
								}}
								{{on
									"click"
									(fn
										this.toggleVisibility
										row.entry.id
										row.entry.visible
									)
								}}
							><Icon
									@name={{if
										row.entry.visible
										"eye"
										"eye-off"
									}}
								/></button>

							{{#if this.canRemove}}
								<button
									type="button"
									class="dt-graph-remove"
									title="Remove"
									{{on
										"click"
										(fn
											this.removeFunction
											row.entry.id
										)
									}}
								><Icon
										@name="trash-2"
									/></button>
							{{/if}}
						</div>
					{{/each}}
				</div>

				<div class="dt-graph-toolbar">
					<button
						type="button"
						class="dt-graph-add"
						{{on "click" this.addFunction}}
					>
						<Icon @name="plus" />
						Add function
					</button>

					<Tooltip>
						<TooltipTrigger>
							<button
								type="button"
								class="dt-graph-toggle
									{{if
										this.showGrid
										'is-active'
									}}"
								aria-pressed={{if
									this.showGrid
									"true"
									"false"
								}}
								{{on
									"click"
									this.toggleGrid
								}}
							><Icon
									@name="grid-3x3"
								/></button>
						</TooltipTrigger>
						<TooltipContent
							@side="top"
						>Toggle grid</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger>
							<button
								type="button"
								class="dt-graph-toggle
									{{if
										this.showAxes
										'is-active'
									}}"
								aria-pressed={{if
									this.showAxes
									"true"
									"false"
								}}
								{{on
									"click"
									this.toggleAxes
								}}
							><Icon
									@name="axis-3d"
								/></button>
						</TooltipTrigger>
						<TooltipContent
							@side="top"
						>Toggle axes</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger>
							<button
								type="button"
								class="dt-graph-toggle
									{{if
										this.showNumbers
										'is-active'
									}}"
								aria-pressed={{if
									this.showNumbers
									"true"
									"false"
								}}
								{{on
									"click"
									this.toggleNumbers
								}}
							><Icon
									@name="hash"
								/></button>
						</TooltipTrigger>
						<TooltipContent
							@side="top"
						>Toggle numbers</TooltipContent>
					</Tooltip>
				</div>
			</div>

			<div
				class="dt-graph-surface
					{{if this.isPanning 'is-panning'}}"
			>
				<svg
					class="dt-graph-plot"
					height={{this.graphHeight}}
					viewBox={{this.viewBox}}
					preserveAspectRatio="none"
					{{this.registerSurface}}
				>
					{{#if this.showGrid}}
						<g class="dt-graph-grid">
							{{#each
								this.xTicks
								key="key"
								as |tick|
							}}
								<line
									x1={{tick.px}}
									y1="0"
									x2={{tick.px}}
									y2={{this.graphHeight}}
								/>
							{{/each}}
							{{#each
								this.yTicks
								key="key"
								as |tick|
							}}
								<line
									x1="0"
									y1={{tick.py}}
									x2={{this.plotWidth}}
									y2={{tick.py}}
								/>
							{{/each}}
						</g>
					{{/if}}

					{{#if this.showAxes}}
						<g class="dt-graph-axes">
							<line
								x1="0"
								y1={{this.axisX}}
								x2={{this.plotWidth}}
								y2={{this.axisX}}
							/>
							<line
								x1={{this.axisY}}
								y1="0"
								x2={{this.axisY}}
								y2={{this.graphHeight}}
							/>
						</g>
					{{/if}}

					{{#each
						this.curves key="id"
						as |curve|
					}}
						{{#if curve.region}}
							<path
								class="dt-graph-region"
								d={{curve.region}}
								fill={{curve.colour}}
							/>
						{{/if}}
						<path
							class="dt-graph-curve"
							d={{curve.line}}
							stroke={{curve.colour}}
							stroke-dasharray={{curve.dash}}
							stroke-opacity={{curve.strokeOpacity}}
						/>
					{{/each}}

					{{#if this.showTicks}}
						<g class="dt-graph-ticks">
							{{#each
								this.xTicks
								key="key"
								as |tick|
							}}
								{{#if
									tick.label
								}}
									<text
										x={{tick.px}}
										y={{tick.labelY}}
										text-anchor="middle"
									>{{tick.label}}</text>
								{{/if}}
							{{/each}}
							{{#each
								this.yTicks
								key="key"
								as |tick|
							}}
								{{#if
									tick.label
								}}
									<text
										x={{tick.labelX}}
										y={{tick.py}}
										text-anchor="end"
										dominant-baseline="middle"
									>{{tick.label}}</text>
								{{/if}}
							{{/each}}
						</g>
					{{/if}}
				</svg>

				<span
					class="dt-graph-readout"
				>{{this.rangeReadout}}</span>
			</div>

			<div class="dt-graph-section">
				<span class="dt-graph-label">View</span>

				<div class="dt-graph-rows">
					<div class="dt-graph-range">
						<span
							class="dt-graph-range-name"
						>X Range</span>
						<input
							class="dt-graph-number"
							type="number"
							step="0.1"
							aria-label="X minimum"
							value={{this.xMinValue}}
							{{on
								"input"
								this.setXMin
							}}
						/>
						<span
							class="dt-graph-to"
						>to</span>
						<input
							class="dt-graph-number"
							type="number"
							step="0.1"
							aria-label="X maximum"
							value={{this.xMaxValue}}
							{{on
								"input"
								this.setXMax
							}}
						/>
					</div>
					<div class="dt-graph-range">
						<span
							class="dt-graph-range-name"
						>Y Range</span>
						<input
							class="dt-graph-number"
							type="number"
							step="0.1"
							aria-label="Y minimum"
							value={{this.yMinValue}}
							{{on
								"input"
								this.setYMin
							}}
						/>
						<span
							class="dt-graph-to"
						>to</span>
						<input
							class="dt-graph-number"
							type="number"
							step="0.1"
							aria-label="Y maximum"
							value={{this.yMaxValue}}
							{{on
								"input"
								this.setYMax
							}}
						/>
					</div>
				</div>

				<span class="dt-graph-sublabel">Zoom</span>
				<div class="segmented dt-graph-zooms">
					<Tooltip>
						<TooltipTrigger>
							<button
								type="button"
								class="dt-graph-zoom"
								{{on
									"click"
									this.zoomStandard
								}}
							>ZStandard</button>
						</TooltipTrigger>
						<TooltipContent @side="top">-10
							to 10</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger>
							<button
								type="button"
								class="dt-graph-zoom"
								{{on
									"click"
									this.zoomTrig
								}}
							>ZTrig</button>
						</TooltipTrigger>
						<TooltipContent
							@side="top"
						>{{ZTRIG_HINT}}</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger>
							<button
								type="button"
								class="dt-graph-zoom"
								{{on
									"click"
									this.zoomDecimal
								}}
							>ZDecimal</button>
						</TooltipTrigger>
						<TooltipContent @side="top">-1
							to 1</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger>
							<button
								type="button"
								class="dt-graph-zoom"
								{{on
									"click"
									this.zoomSquare
								}}
							>ZSquare</button>
						</TooltipTrigger>
						<TooltipContent @side="top">1:1
							aspect ratio</TooltipContent>
					</Tooltip>
					<button
						type="button"
						class="dt-graph-zoom"
						{{on "click" this.resetView}}
					>
						<Icon @name="rotate-ccw" />
						Reset
					</button>
				</div>
			</div>

			<div class="dt-graph-section">
				<span class="dt-graph-label">Trace</span>
				<div class="dt-graph-trace">
					<span class="dt-graph-trace-name">x =</span>
					<input
						class="dt-graph-trace-input"
						type="number"
						placeholder="0"
						aria-label="Trace x"
						value={{this.traceInput}}
						{{on
							"input"
							this.setTraceInput
						}}
						{{on
							"keydown"
							this.traceOnEnter
						}}
					/>
					<button
						type="button"
						class="dt-graph-trace-go"
						{{on "click" this.trace}}
					>
						<Icon @name="crosshair" />
						Trace
					</button>
				</div>
			</div>

			{{#if this.traceResults.length}}
				<div class="dt-graph-section">
					<div class="dt-graph-results-head">
						<span
							class="dt-graph-label"
						>Trace Results</span>
						<button
							type="button"
							class="dt-graph-clear"
							{{on
								"click"
								this.clearTrace
							}}
						>
							<Icon @name="x" />
							Clear
						</button>
					</div>
					<div class="dt-graph-results">
						{{#each
							this.traceResults
							key="key"
							as |trace|
						}}
							<div
								class="dt-graph-result"
							>
								<span
									class="dt-graph-result-x"
								>x =
									{{trace.xLabel}}</span>
								{{#each
									trace.results
									key="id"
									as |result|
								}}
									<span
										class="dt-graph-result-row"
									>
										<span
											class="dt-graph-dot"
											style={{result.dotStyle}}
										></span>
										<span
											class="dt-graph-result-expr"
										>{{result.expression}}</span>
										<span
										>=</span>
										<span
										>{{result.y}}</span>
									</span>
								{{/each}}
							</div>
						{{/each}}
					</div>
				</div>
			{{/if}}

			<div class="dt-graph-section">
				<span class="dt-graph-label">Syntax examples</span>
				<div class="segmented dt-graph-syntax">
					{{#each
						SYNTAX_EXAMPLES key="@index"
						as |example|
					}}
						<code>{{example}}</code>
					{{/each}}
				</div>
			</div>
		</div>
	</template>
}

function numberFrom(event: Event, fallback: number): number {
	return parseFloat((event.target as HTMLInputElement).value) || fallback;
}
