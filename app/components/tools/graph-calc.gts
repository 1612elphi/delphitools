import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn, get } from '@ember/helper';
import { on } from '@ember/modifier';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import { CanonMathFieldHandle } from 'delphicanon/components/canon-math-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStepper from 'delphicanon/components/canon-stepper';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';
import GraphFunctionRow, {
	type GraphCurve,
} from 'delphitools-v2/components/tools/graph-calc/function-row';
import GraphPlot, {
	type PlotCurve,
} from 'delphitools-v2/components/tools/graph-calc/plot';
import GraphTable, {
	type Slide,
} from 'delphitools-v2/components/tools/graph-calc/table';
import { GraphView } from 'delphitools-v2/components/tools/graph-calc/view';
import {
	createEvaluator,
	curveName,
	decimal,
	examples,
	format,
	loadMathjs,
	nextColour,
	number,
	plotted,
	rangeText,
	spans,
	standard,
	stepStep,
	stepTrace,
	steps,
	trig,
	typed,
	type Plane,
	type Relation,
} from 'delphitools-v2/components/tools/graph-calc/graph';
import './graph-calc/graph-calc.css';

const typingDelay = 400;
const rangeDelay = 600;

const presets: {
	title: string;
	plane: (view: GraphView) => Plane | undefined;
}[] = [
	{ title: 'Standard', plane: () => standard },
	{ title: 'Trig', plane: () => trig },
	{ title: 'Decimal', plane: () => decimal },
	{ title: 'Square', plane: (view) => view.squaredPlane },
];

const toggles = ['Grid', 'Axes', 'Numbers'] as const;
type Toggle = (typeof toggles)[number];

type RangeField = 'xMin' | 'xMax' | 'yMin' | 'yMax';
const rangeLabels: Record<RangeField, string> = {
	xMin: 'X minimum',
	xMax: 'X maximum',
	yMin: 'Y minimum',
	yMax: 'Y maximum',
};

export default class GraphCalcTool extends Component {
	@tracked curves: GraphCurve[] = [
		{ id: 1, text: 'x^2', relation: '=', colour: 0, visible: true },
	];
	@tracked step = 1;
	@tracked slide: Slide = { id: 0, by: 0 };
	@tracked mathReady = false;
	@tracked shows: Record<Toggle, boolean> = {
		Grid: true,
		Axes: true,
		Numbers: true,
	};
	@tracked traceDraft?: string;
	@tracked stepDraft?: string;
	@tracked rangeDrafts: Partial<Record<RangeField, string>> = {};

	view = new GraphView();
	#handles = new Map<number, CanonMathFieldHandle>();
	#pending = new Map<number, string>();
	#nextId = 2;
	#typing?: number;
	#numberTyping?: number;
	#rangeTyping?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		void loadMathjs().then(() => {
			if (!this.isDestroying) this.mathReady = true;
		});
		registerDestructor(this, () => {
			window.clearTimeout(this.#typing);
			window.clearTimeout(this.#numberTyping);
			window.clearTimeout(this.#rangeTyping);
			this.view.destroy();
		});
	}

	handle(id: number) {
		let handle = this.#handles.get(id);
		if (!handle) {
			handle = new CanonMathFieldHandle();
			this.#handles.set(id, handle);
		}
		return handle;
	}

	@cached
	get rows() {
		const ready = this.mathReady;
		return this.curves.map((curve, index) => {
			const source = plotted(curve.text);
			const evaluate =
				ready && source
					? createEvaluator(source)
					: null;
			const empty = !curve.text.trim();
			return {
				curve,
				name: curveName(index),
				handle: this.handle(curve.id),
				evaluate,
				invalid: ready && !empty && !evaluate,
			};
		});
	}

	get plotCurves(): PlotCurve[] {
		return this.rows.flatMap(({ curve, name, evaluate }) =>
			curve.visible && evaluate
				? [
						{
							name,
							colour: curve.colour,
							relation: curve.relation,
							evaluate,
						},
					]
				: [],
		);
	}

	get removable() {
		return this.curves.length > 1;
	}

	#update(id: number, changes: Partial<GraphCurve>) {
		this.curves = this.curves.map((curve) =>
			curve.id === id ? { ...curve, ...changes } : curve,
		);
	}

	#commitText = () => {
		window.clearTimeout(this.#typing);
		if (this.#pending.size === 0) return;
		const pending = new Map(this.#pending);
		this.#pending.clear();
		this.curves = this.curves.map((curve) =>
			pending.has(curve.id)
				? { ...curve, text: pending.get(curve.id)! }
				: curve,
		);
	};

	typed = (id: number, text: string) => {
		this.#pending.set(id, text);
		window.clearTimeout(this.#typing);
		this.#typing = window.setTimeout(this.#commitText, typingDelay);
	};

	done = () => this.#commitText();

	colour = (id: number, colour: number) => this.#update(id, { colour });

	relation = (id: number, relation: Relation) =>
		this.#update(id, { relation });

	visibility = (id: number) => {
		const curve = this.curves.find((c) => c.id === id);
		if (curve) this.#update(id, { visible: !curve.visible });
	};

	remove = (id: number) => {
		if (this.curves.length < 2) return;
		this.#pending.delete(id);
		this.#handles.delete(id);
		this.curves = this.curves.filter((curve) => curve.id !== id);
	};

	add = (text = '') => {
		const id = this.#nextId++;
		this.curves = [
			...this.curves,
			{
				id,
				text,
				relation: '=',
				colour: nextColour(
					this.curves.map((c) => c.colour),
				),
				visible: true,
			},
		];
		if (!text)
			requestAnimationFrame(() =>
				this.#handles.get(id)?.edit(),
			);
	};

	addEmpty = () => this.add();

	use = (example: string) => {
		this.#commitText();
		const text = typed(example);
		const empty = this.curves.findLast(
			(curve) => !curve.text.trim(),
		);
		if (empty) this.#update(empty.id, { text });
		else this.add(text);
	};

	get traceText() {
		return this.traceDraft ?? format(this.view.trace);
	}

	get stepText() {
		return this.stepDraft ?? format(this.step);
	}

	stepTrace = (direction: -1 | 1) => {
		const { x, onGrid } = stepTrace(
			this.view.trace,
			this.step,
			direction,
		);
		this.traceDraft = undefined;
		this.view.setTrace(x, true);
		this.slide = {
			id: this.slide.id + 1,
			by: onGrid ? direction : 0,
		};
	};

	stepStep = (direction: -1 | 1) => {
		this.stepDraft = undefined;
		this.step = stepStep(this.step, direction);
	};

	typeTrace = (event: Event) => {
		this.traceDraft = (event.target as HTMLInputElement).value;
		window.clearTimeout(this.#numberTyping);
		this.#numberTyping = window.setTimeout(
			() => this.#commitTrace(false),
			typingDelay,
		);
	};

	typeStep = (event: Event) => {
		this.stepDraft = (event.target as HTMLInputElement).value;
		window.clearTimeout(this.#numberTyping);
		this.#numberTyping = window.setTimeout(
			() => this.#commitStep(false),
			typingDelay,
		);
	};

	#commitTrace(ends: boolean) {
		window.clearTimeout(this.#numberTyping);
		const x = number(this.traceDraft ?? '');
		if (x !== undefined && x !== this.view.trace) {
			this.view.setTrace(x, true);
			this.slide = { id: this.slide.id + 1, by: 0 };
		}
		if (ends) this.traceDraft = undefined;
	}

	#commitStep(ends: boolean) {
		window.clearTimeout(this.#numberTyping);
		const value = number(this.stepDraft ?? '');
		if (value !== undefined && value > 0)
			this.step = Math.min(
				Math.max(value, steps.min),
				steps.max,
			);
		if (ends) this.stepDraft = undefined;
	}

	endTrace = () => this.#commitTrace(true);
	endStep = () => this.#commitStep(true);

	blurOnEnter = (event: KeyboardEvent) => {
		if (event.key === 'Enter')
			(event.target as HTMLInputElement).blur();
	};

	get ranges(): Record<RangeField, string> {
		const p = this.view.plane;
		const [xMin, xMax] = p ? rangeText(p.xMin, p.xMax) : ['', ''];
		const [yMin, yMax] = p ? rangeText(p.yMin, p.yMax) : ['', ''];
		const d = this.rangeDrafts;
		return {
			xMin: d.xMin ?? xMin,
			xMax: d.xMax ?? xMax,
			yMin: d.yMin ?? yMin,
			yMax: d.yMax ?? yMax,
		};
	}

	typeRange = (field: RangeField, event: Event) => {
		this.rangeDrafts = {
			...this.rangeDrafts,
			[field]: (event.target as HTMLInputElement).value,
		};
		window.clearTimeout(this.#rangeTyping);
		this.#rangeTyping = window.setTimeout(
			() =>
				this.#commitRange(
					field.startsWith('x') ? 'x' : 'y',
					false,
				),
			rangeDelay,
		);
	};

	endRange = (field: RangeField) =>
		this.#commitRange(field.startsWith('x') ? 'x' : 'y', true);

	#commitRange(axis: 'x' | 'y', ends: boolean) {
		window.clearTimeout(this.#rangeTyping);
		const plane = this.view.plane;
		if (!plane) return;
		const shown = this.ranges;
		const a = number(axis === 'x' ? shown.xMin : shown.yMin);
		const b = number(axis === 'x' ? shown.xMax : shown.yMax);
		const ok =
			a !== undefined &&
			b !== undefined &&
			a !== b &&
			Math.abs(b - a) >= spans.min &&
			Math.abs(b - a) <= spans.max;
		if (ok) {
			const [low, high] = [Math.min(a, b), Math.max(a, b)];
			this.view.setWindow(
				axis === 'x'
					? { ...plane, xMin: low, xMax: high }
					: { ...plane, yMin: low, yMax: high },
				true,
			);
		}
		if (ends) {
			const rest = { ...this.rangeDrafts };
			delete rest[`${axis}Min`];
			delete rest[`${axis}Max`];
			this.rangeDrafts = rest;
		}
	}

	preset = (index: number) => {
		this.rangeDrafts = {};
		const plane = presets[index]!.plane(this.view);
		if (plane) this.view.setWindow(plane, true);
	};

	toggle = (name: Toggle, on: boolean) => {
		this.shows = { ...this.shows, [name]: on };
	};

	<template>
		<CanonSplit
			class="graph-calc"
			@halves={{true}}
			@collapsesTo={{240}}
		>
			<:sidebar>
				<CanonCanvas @aspect={{1}} @maxHeight={{640}}>
					<GraphPlot
						@view={{this.view}}
						@curves={{this.plotCurves}}
						@grid={{this.shows.Grid}}
						@axes={{this.shows.Axes}}
						@numbers={{this.shows.Numbers}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Functions" />
					{{#each
						this.rows key="curve.id"
						as |row|
					}}
						<GraphFunctionRow
							@curve={{row.curve}}
							@name={{row.name}}
							@removable={{this.removable}}
							@invalid={{row.invalid}}
							@handle={{row.handle}}
							@onText={{fn
								this.typed
								row.curve.id
							}}
							@onDone={{this.done}}
							@onColour={{fn
								this.colour
								row.curve.id
							}}
							@onRelation={{fn
								this.relation
								row.curve.id
							}}
							@onVisibility={{fn
								this.visibility
								row.curve.id
							}}
							@onRemove={{fn
								this.remove
								row.curve.id
							}}
						/>
					{{/each}}
					<CanonGrid>
						<CanonButton
							@kind="cell"
							@text="Add function"
							@icon={{component
								IconSvg
								name="plus"
							}}
							@onClick={{this.addEmpty}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Trace" />
					<CanonStepper
						class="graph-trace-stepper"
						@onStep={{this.stepTrace}}
					>
						<span
							class="graph-trace-name"
						>x</span>
						<input
							class="canon-stepper-field graph-number"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							spellcheck="false"
							enterkeyhint="done"
							aria-label="Trace"
							value={{this.traceText}}
							{{on
								"input"
								this.typeTrace
							}}
							{{on
								"blur"
								this.endTrace
							}}
							{{on
								"keydown"
								this.blurOnEnter
							}}
						/>
					</CanonStepper>
					<CanonRow @title="Step" @form="flush">
						<CanonStepper
							@onStep={{this.stepStep}}
						>
							<input
								class="canon-stepper-field graph-number"
								type="text"
								inputmode="decimal"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="done"
								aria-label="Step"
								value={{this.stepText}}
								{{on
									"input"
									this.typeStep
								}}
								{{on
									"blur"
									this.endStep
								}}
								{{on
									"keydown"
									this.blurOnEnter
								}}
							/>
						</CanonStepper>
					</CanonRow>
					<GraphTable
						@x={{this.view.trace}}
						@step={{this.step}}
						@curves={{this.plotCurves}}
						@slide={{this.slide}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="View" />
					<CanonRow @title="x" @form="flush">
						<div class="graph-range">
							<input
								class="graph-range-field"
								type="text"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="done"
								aria-label={{rangeLabels.xMin}}
								value={{this.ranges.xMin}}
								{{on
									"input"
									(fn
										this.typeRange
										"xMin"
									)
								}}
								{{on
									"blur"
									(fn
										this.endRange
										"xMin"
									)
								}}
								{{on
									"keydown"
									this.blurOnEnter
								}}
							/>
							<span
								class="graph-range-to"
							>to</span>
							<input
								class="graph-range-field"
								type="text"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="done"
								aria-label={{rangeLabels.xMax}}
								value={{this.ranges.xMax}}
								{{on
									"input"
									(fn
										this.typeRange
										"xMax"
									)
								}}
								{{on
									"blur"
									(fn
										this.endRange
										"xMax"
									)
								}}
								{{on
									"keydown"
									this.blurOnEnter
								}}
							/>
						</div>
					</CanonRow>
					<CanonRow @title="y" @form="flush">
						<div class="graph-range">
							<input
								class="graph-range-field"
								type="text"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="done"
								aria-label={{rangeLabels.yMin}}
								value={{this.ranges.yMin}}
								{{on
									"input"
									(fn
										this.typeRange
										"yMin"
									)
								}}
								{{on
									"blur"
									(fn
										this.endRange
										"yMin"
									)
								}}
								{{on
									"keydown"
									this.blurOnEnter
								}}
							/>
							<span
								class="graph-range-to"
							>to</span>
							<input
								class="graph-range-field"
								type="text"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="done"
								aria-label={{rangeLabels.yMax}}
								value={{this.ranges.yMax}}
								{{on
									"input"
									(fn
										this.typeRange
										"yMax"
									)
								}}
								{{on
									"blur"
									(fn
										this.endRange
										"yMax"
									)
								}}
								{{on
									"keydown"
									this.blurOnEnter
								}}
							/>
						</div>
					</CanonRow>
					<CanonGrid @columns={{4}}>
						{{#each
							presets
							as |preset index|
						}}
							<CanonButton
								@kind="segment"
								@text={{preset.title}}
								@onClick={{fn
									this.preset
									index
								}}
							/>
						{{/each}}
					</CanonGrid>
					<CanonGrid @columns={{3}}>
						{{#each toggles as |name|}}
							<CanonRow
								@title={{name}}
								@sizingTitle="Numbers"
								as |titleId|
							>
								<CanonSwitch
									@on={{get
										this.shows
										name
									}}
									@onChange={{fn
										this.toggle
										name
									}}
									aria-labelledby={{titleId}}
								/>
							</CanonRow>
						{{/each}}
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Examples" />
					<CanonGrid @columns={{4}}>
						{{#each examples as |example|}}
							<CanonButton
								@kind="cell"
								@text={{example}}
								@onClick={{fn
									this.use
									example
								}}
							/>
						{{/each}}
					</CanonGrid>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
