import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import type { DragEndEvent } from '@dnd-kit/dom';
import Icon from 'delphitools-v2/components/icon';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from 'delphitools-v2/components/ui/popover';
import Switch from 'delphitools-v2/components/ui/switch';
import { TransientColourCell } from 'delphitools-v2/components/substrata/transient-colour';
import sortable from 'delphitools-v2/modifiers/sortable';
import { modifier } from 'ember-modifier';
import { createDndManager } from 'delphitools-v2/lib/dnd';
import type { DragDropManager } from '@dnd-kit/dom';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import {
	beginTransient,
	commitTransient,
	getSnapshot,
	subscribe,
} from 'delphitools-v2/lib/substrata/doc-store';
import { findLayer, isGroup } from 'delphitools-v2/lib/substrata/layer-tree';
import {
	ensureMatte,
	getMatteStatus,
	matteEpoch,
	retryMatte,
	subscribeMattes,
	type MatteStatus,
} from 'delphitools-v2/lib/substrata/bg-removal';
import { EFFECT_REGISTRY } from 'delphitools-v2/lib/substrata/effects';
import { FILTER_REGISTRY } from 'delphitools-v2/lib/substrata/filters';
import {
	addFx,
	fxDisplayLabel,
	getFxDef,
	removeFx,
	resetFx,
	setFxOrder,
	setFxParam,
	setFxParams,
	toggleFx,
	type FxItem,
	type FxStack,
} from 'delphitools-v2/lib/substrata/fx-ops';
import type {
	ColourParam,
	PairsParam,
	ParamSpec,
	PresetsParam,
	SelectParam,
	SliderParam,
	StepperParam,
} from 'delphitools-v2/lib/substrata/param-spec';
import {
	FX_ICONS,
	FX_ICON_FALLBACK,
} from 'delphitools-v2/lib/substrata/fx-icons';
import { ActiveLayer } from 'delphitools-v2/lib/substrata/active-layer';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * FX module — the BODY only; the module box supplies the "FX" header. One
 * pipeline over BOTH of the selected layer's stacks (Ruby's call): the
 * filters[] chain (colour changes + spatial filters) as the top zone, the
 * effects[] stack as the bottom zone, split by a heavy divider — matching the
 * real composite order (outer fx → content + filters → inner fx) as closely as
 * one list can. Drag-reorder is constrained to each zone (the two doc arrays
 * cannot interleave); a single Add picker groups both categories and greys out
 * types already on the layer (one-per-type).
 *
 * Sketch fidelity (modals.html Effects card): flush blocks with a muted title
 * bar, 2px dividers between blocks / 1px inside, single-open accordion with the
 * grid-rows collapse animation, grip · chevron · name · reset · toss · switch.
 * Params render generically from the registries' ParamSpecs; continuous
 * gestures (slider / swatch drag) coalesce into ONE undo step via the transient
 * path. Both stacks render live — raster layers only, hence the gates below.
 */

interface PickerCard {
	type: string;
	label: string;
	icon: string;
	/** last cell spans the row remainder — no empty grid cells */
	span: number;
}

interface PickerGroup {
	key: string;
	/** section word, functional chrome */
	heading: string;
	stack: FxStack;
	cards: PickerCard[];
}

function buildGroup(
	key: string,
	heading: string,
	stack: FxStack,
	types: string[],
): PickerGroup {
	const rem = types.length % 3;
	return {
		key,
		heading,
		stack,
		cards: types.map((type, i) => ({
			type,
			label: getFxDef(stack, type)?.label ?? type,
			icon: FX_ICONS[type] ?? FX_ICON_FALLBACK,
			span: i === types.length - 1 && rem !== 0 ? 4 - rem : 1,
		})),
	};
}

/** Typed-card picker groups: filters (zone 1) · effects (zone 2). The
 *  colour/film-sim family is NOT here — looks are picked in the LOOKS module. */
const PICKER_GROUPS: PickerGroup[] = [
	buildGroup(
		'filter',
		'Filters',
		'filters',
		Object.values(FILTER_REGISTRY)
			.filter((d) => d.category === 'filter')
			.map((d) => d.type),
	),
	buildGroup(
		'effect',
		'Effects',
		'effects',
		Object.keys(EFFECT_REGISTRY),
	),
];

function spanStyle(span: number) {
	return span === 1 ? undefined : htmlSafe(`grid-column: span ${span}`);
}

function presetGradient(swatch: string[]) {
	return htmlSafe(
		`background: linear-gradient(135deg, ${swatch[0]}, ${swatch[1]} 55%, ${swatch[2]})`,
	);
}

/** Pair chips read light→dark like the sim swatches: highlight leads. */
function pairGradient(colours: [string, string]) {
	return htmlSafe(
		`background: linear-gradient(135deg, ${colours[1]}, ${colours[0]})`,
	);
}

function widthStyle(pct: number) {
	return htmlSafe(`width: ${pct}%`);
}

function columnsStyle(n: number) {
	return htmlSafe(`grid-template-columns: repeat(${n}, 1fr)`);
}

// ── param value readers ─────────────────────────────────────────────────────

function numValue(fx: FxItem, spec: SliderParam | StepperParam): number {
	const v = fx.params[spec.key];
	return typeof v === 'number' ? v : spec.default;
}

function strValue(
	fx: FxItem,
	spec: ColourParam | SelectParam | PresetsParam,
): string {
	const v = fx.params[spec.key];
	return typeof v === 'string' ? v : spec.default;
}

/** "100%" · "10.0 px" · "0°" — decimals follow the step; px gets a space. */
function fmtValue(v: number, spec: SliderParam | StepperParam): string {
	const decimals = spec.step < 0.1 ? 2 : spec.step < 1 ? 1 : 0;
	const s = v.toFixed(decimals);
	if (!spec.unit) return s;
	return spec.unit === 'px' ? `${s} px` : `${s}${spec.unit}`;
}

// ── param rows ──────────────────────────────────────────────────────────────

interface RowArgs {
	fx: FxItem;
	layerId: string;
	stack: FxStack;
}

interface SliderRowSignature {
	Args: RowArgs & { spec: SliderParam };
}

/**
 * Slider drags coalesce into ONE undo step. A native range input fires `input`
 * per move and `change` at the gesture boundary — the first `input` opens the
 * transient, `change` settles it. A keyboard step fires both in turn, so it
 * commits as one plain undo step per press (stepper-like).
 */
class SliderRow extends Component<SliderRowSignature> {
	#dragging = false;

	get value() {
		return numValue(this.args.fx, this.args.spec);
	}

	get shown() {
		return fmtValue(this.value, this.args.spec);
	}

	write = (event: Event) => {
		if (!this.#dragging) {
			this.#dragging = true;
			beginTransient();
		}
		const { layerId, stack, fx, spec } = this.args;
		setFxParam(
			layerId,
			stack,
			fx.id,
			spec.key,
			Number((event.target as HTMLInputElement).value),
			{ transient: true },
		);
	};

	settle = () => {
		if (!this.#dragging) return;
		commitTransient();
		this.#dragging = false;
	};

	// A row destroyed mid-drag (block removed, panel closed) never sees
	// `change`, so the transient would stay open and doc-store's undo/redo
	// would early-return on isGestureActive() for the rest of the session.
	willDestroy() {
		super.willDestroy();
		this.settle();
	}

	<template>
		<span class="sub-fx-plabel">{{@spec.label}}</span>
		<input
			type="range"
			class="sub-slider"
			min={{@spec.min}}
			max={{@spec.max}}
			step={{@spec.step}}
			value={{this.value}}
			aria-label={{@spec.label}}
			{{on "input" this.write}}
			{{on "change" this.settle}}
		/>
		<span class="sub-fx-pvalue">{{this.shown}}</span>
	</template>
}

interface StepperRowSignature {
	Args: RowArgs & { spec: StepperParam };
}

/** ±step clicks; each click is one undo step (matches the sketch's stepper). */
class StepperRow extends Component<StepperRowSignature> {
	get value() {
		return numValue(this.args.fx, this.args.spec);
	}

	get shown() {
		return fmtValue(this.value, this.args.spec);
	}

	get atMax() {
		return this.value >= this.args.spec.max;
	}

	get atMin() {
		return this.value <= this.args.spec.min;
	}

	#nudge(dir: 1 | -1) {
		const { spec, layerId, stack, fx } = this.args;
		const next = Math.min(
			spec.max,
			Math.max(spec.min, this.value + dir * spec.step),
		);
		if (next !== this.value)
			setFxParam(layerId, stack, fx.id, spec.key, next);
	}

	up = () => this.#nudge(1);
	down = () => this.#nudge(-1);

	<template>
		<span class="sub-fx-plabel">{{@spec.label}}</span>
		<div class="sub-fx-stepper">
			<span class="sub-fx-stepper-value">{{this.shown}}</span>
			<button
				type="button"
				class="sub-fx-stepbtn"
				disabled={{this.atMax}}
				aria-label="Increase"
				{{on "click" this.up}}
			><Icon @name="chevron-up" /></button>
			<button
				type="button"
				class="sub-fx-stepbtn"
				disabled={{this.atMin}}
				aria-label="Decrease"
				{{on "click" this.down}}
			><Icon @name="chevron-down" /></button>
		</div>
	</template>
}

interface ColourRowSignature {
	Args: RowArgs & { spec: ColourParam };
}

/** Colour param — the shared transient swatch+hex cell (transient-colour owns
 *  the OS-picker gesture-settling mechanism). */
class ColourRow extends Component<ColourRowSignature> {
	get value() {
		return strValue(this.args.fx, this.args.spec);
	}

	apply = (hex: string, transient: boolean) => {
		const { layerId, stack, fx, spec } = this.args;
		setFxParam(
			layerId,
			stack,
			fx.id,
			spec.key,
			hex,
			transient ? { transient } : undefined,
		);
	};

	<template>
		<span class="sub-fx-plabel">{{@spec.label}}</span>
		<TransientColourCell
			class="sub-fx-colour"
			@value={{this.value}}
			@onApply={{this.apply}}
			@swatchAria="Pick colour"
			@hexAria="Hex value"
		/>
	</template>
}

interface SelectRowSignature {
	Args: RowArgs & { spec: SelectParam };
}

/** One-of-N as a flush segmented group (e.g. stroke position). */
class SelectRow extends Component<SelectRowSignature> {
	get value() {
		return strValue(this.args.fx, this.args.spec);
	}

	get columns() {
		return columnsStyle(this.args.spec.options.length);
	}

	isActive = (value: string) => value === this.value;

	// guard: re-clicking the active segment must not burn a history step
	pick = (value: string) => {
		if (value === this.value) return;
		const { layerId, stack, fx, spec } = this.args;
		setFxParam(layerId, stack, fx.id, spec.key, value);
	};

	<template>
		<span class="sub-fx-plabel">{{@spec.label}}</span>
		<div class="segmented sub-fx-seg" style={{this.columns}}>
			{{#each @spec.options key="value" as |o|}}
				<button
					type="button"
					class="sub-fx-segcell
						{{if
							(this.isActive o.value)
							'is-active'
						}}"
					{{on "click" (fn this.pick o.value)}}
				>{{o.label}}</button>
			{{/each}}
		</div>
	</template>
}

interface PresetsGridSignature {
	Args: RowArgs & { spec: PresetsParam; bordered: boolean };
}

/** The sketch's flush preset-swatch grid: 4-up, hairline-gapped, edge-to-edge;
 *  the chosen look wears an inset primary ring. */
class PresetsGrid extends Component<PresetsGridSignature> {
	get value() {
		return strValue(this.args.fx, this.args.spec);
	}

	isActive = (value: string) => value === this.value;

	pick = (value: string) => {
		if (value === this.value) return;
		const { layerId, stack, fx, spec } = this.args;
		setFxParam(layerId, stack, fx.id, spec.key, value);
	};

	<template>
		<div class="sub-fx-presets {{if @bordered 'is-bordered'}}">
			{{#each @spec.options key="value" as |o|}}
				<button
					type="button"
					class="sub-fx-chip
						{{if
							(this.isActive o.value)
							'is-active'
						}}"
					aria-label={{o.label}}
					title={{o.label}}
					style={{presetGradient o.swatch}}
					{{on "click" (fn this.pick o.value)}}
				></button>
			{{/each}}
		</div>
	</template>
}

interface PairsGridSignature {
	Args: RowArgs & { spec: PairsParam; bordered: boolean };
}

/**
 * Duotone's preset pairs: same flush grid as PresetsGrid, but a pair is a
 * QUICK-SET — clicking writes its `writes` patch (both colours, one undo step
 * via setFxParams) instead of storing a preset id. Active = the pair whose
 * writes all match the current params, so hand-picked colours light no pair up.
 */
class PairsGrid extends Component<PairsGridSignature> {
	isActive = (option: PairsParam['options'][number]) =>
		Object.entries(option.writes).every(
			([key, v]) =>
				String(
					this.args.fx.params[key] ?? '',
				).toLowerCase() === v.toLowerCase(),
		);

	pick = (option: PairsParam['options'][number]) => {
		if (this.isActive(option)) return;
		const { layerId, stack, fx } = this.args;
		setFxParams(layerId, stack, fx.id, option.writes);
	};

	<template>
		<div class="sub-fx-presets {{if @bordered 'is-bordered'}}">
			{{#each @spec.options key="value" as |o|}}
				<button
					type="button"
					class="sub-fx-chip
						{{if
							(this.isActive o)
							'is-active'
						}}"
					aria-label={{o.label}}
					title={{o.label}}
					style={{pairGradient o.colours}}
					{{on "click" (fn this.pick o)}}
				></button>
			{{/each}}
		</div>
	</template>
}

// ── Remove Background status body ───────────────────────────────────────────

interface MatteBodySignature {
	Args: { layerId: string };
}

/** The async-bake body: kicks the bake (idempotent — the canvas composite kicks
 *  too) and surfaces the model lifecycle: download %, inference, device (with a
 *  slower-notice when the WASM fallback ran), sticky errors with retry. The
 *  block-header switch owns on/off; a finished matte is cached, so toggling is
 *  instant. */
class MatteBody extends Component<MatteBodySignature> {
	#doc = new TrackedExternal(subscribe, getSnapshot);
	// The epoch IS the "something moved" signal for this store; reading the
	// status here instead would go stale whenever the hash changes without a
	// matte notification.
	#mattes = new TrackedExternal(subscribeMattes, matteEpoch);

	@cached
	get hash(): string | null {
		const doc = this.#doc.current;
		const layer = doc
			? findLayer(doc.layers, this.args.layerId)
			: null;
		return layer?.kind === 'raster' ? layer.blobHash : null;
	}

	@cached
	get status(): MatteStatus | null {
		// read through the matte store so each lifecycle tick re-renders
		void this.#mattes.current;
		const hash = this.hash;
		return hash ? (getMatteStatus(hash) ?? null) : null;
	}

	/** Kick the bake from a modifier, never from `status`: ensureMatte notifies
	 *  the matte store synchronously for an unbaked hash, and doing that inside
	 *  a getter dirties a tag already consumed in the same render — which Ember
	 *  asserts on in development. React ran the same kick in an effect. */
	kick = modifier((_element: HTMLElement, [hash]: [string | null]) => {
		if (hash) ensureMatte(hash);
	});

	get state() {
		return this.status?.state ?? 'queued';
	}

	get progress() {
		return this.status?.progress ?? 0;
	}

	get progressStyle() {
		return widthStyle(this.progress);
	}

	get slowDevice() {
		return this.state === 'done' && this.status?.device === 'wasm';
	}

	get detail() {
		return this.status?.detail;
	}

	retry = () => {
		const hash = this.hash;
		if (hash) retryMatte(hash);
	};

	willDestroy() {
		super.willDestroy();
		this.#doc.unsubscribe();
		this.#mattes.unsubscribe();
	}

	// Wording carried over from the Next app.
	<template>
		{{#if this.hash}}
			<div class="sub-fx-matte" {{this.kick this.hash}}>
				{{#if (eq this.state "queued")}}
					<div>Preparing…</div>
				{{else if (eq this.state "downloading")}}
					<div class="sub-fx-matte-line">
						<span>Downloading model...</span>
						<span
							class="sub-fx-matte-pct"
						>{{this.progress}}%</span>
					</div>
					<div class="sub-fx-matte-bar">
						<div
							class="sub-fx-matte-fill"
							style={{this.progressStyle}}
						></div>
					</div>
				{{else if (eq this.state "processing")}}
					<div>Removing background...</div>
					<div class="sub-fx-matte-pulse"></div>
				{{else if (eq this.state "done")}}
					<div>Cutout ready</div>
					{{#if this.slowDevice}}
						<div>No graphics chip available,
							bear with me</div>
					{{/if}}
				{{else if (eq this.state "error")}}
					{{! the raw Error.message stays off-screen — hover the label
						to see it }}
					<div
						class="sub-fx-matte-error"
						title={{this.detail}}
					>Couldn't process</div>
					<button
						type="button"
						class="sub-fx-matte-retry"
						{{on "click" this.retry}}
					>Retry</button>
				{{/if}}
			</div>
		{{/if}}
	</template>
}

// ── one effect/filter block ─────────────────────────────────────────────────

interface FxBlockSignature {
	Args: {
		layerId: string;
		stack: FxStack;
		fx: FxItem;
		index: number;
		open: boolean;
		onToggle: () => void;
		manager: DragDropManager;
	};
}

interface RenderedParam {
	spec: ParamSpec;
	bordered: boolean;
}

class FxBlock extends Component<FxBlockSignature> {
	get def() {
		return getFxDef(this.args.stack, this.args.fx.type);
	}

	/** Remove Background is paramless but NOT bodiless — its body is the async
	 *  bake status (download %, device, error/retry), not registry params. */
	get matteBlock() {
		return (
			this.args.stack === 'effects' &&
			this.args.fx.type === 'remove-background'
		);
	}

	/** Paramless blocks (invert, greyscale, sepia, edge-detect…) have nothing to
	 *  open: no chevron, no toggle, no body, no reset. */
	get expandable() {
		return this.matteBlock || (this.def?.params.length ?? 0) > 0;
	}

	get isOpen() {
		return this.expandable && this.args.open;
	}

	get showReset() {
		return (
			this.args.fx.enabled &&
			this.expandable &&
			!this.matteBlock
		);
	}

	get label() {
		return fxDisplayLabel(this.args.stack, this.args.fx);
	}

	get params(): RenderedParam[] {
		return (this.def?.params ?? []).map((spec, i) => ({
			spec,
			bordered: i > 0,
		}));
	}

	reset = () =>
		resetFx(this.args.layerId, this.args.stack, this.args.fx.id);

	remove = () =>
		removeFx(this.args.layerId, this.args.stack, this.args.fx.id);

	toggleEnabled = () =>
		toggleFx(this.args.layerId, this.args.stack, this.args.fx.id);

	<template>
		<div
			class="sub-fx-block {{unless @fx.enabled 'is-off'}}"
			{{sortable
				id=@fx.id
				index=@index
				group=@stack
				handle=".sub-fx-grip"
				manager=@manager
			}}
		>
			{{! title bar — grip · toggle button (chevron + name) · controls.
				The toggle is a real button (keyboard path + aria-expanded); the
				controls and switch sit OUTSIDE it, so they can never toggle the
				accordion. }}
			<div class="sub-fx-bar {{if this.isOpen 'is-open'}}">
				<span
					class="sub-fx-grip"
					aria-label="Reorder"
					title="Reorder"
				><Icon @name="grip-vertical" /></span>
				{{#if this.expandable}}
					<button
						type="button"
						class="sub-fx-title"
						aria-expanded={{if
							this.isOpen
							"true"
							"false"
						}}
						{{on "click" @onToggle}}
					>
						<Icon
							class="sub-fx-chevron
								{{unless
									this.isOpen
									'is-closed'
								}}"
							@name="chevron-down"
						/>
						<span
							class="sub-fx-name"
						>{{this.label}}</span>
					</button>
				{{else}}
					{{! the indent matches chevron + gap, so titles align down
						the stack }}
					<span class="sub-fx-title is-static">
						<span
							class="sub-fx-name"
						>{{this.label}}</span>
					</span>
				{{/if}}
				{{#if this.showReset}}
					<button
						type="button"
						class="sub-fx-ctl"
						aria-label="Reset"
						title="Reset"
						{{on "click" this.reset}}
					><Icon @name="rotate-ccw" /></button>
				{{/if}}
				<button
					type="button"
					class="sub-fx-ctl"
					aria-label="Remove"
					title="Remove"
					{{on "click" this.remove}}
				><Icon @name="trash-2" /></button>
				<div class="sub-fx-switch">
					<Switch
						@checked={{@fx.enabled}}
						@onChange={{this.toggleEnabled}}
						@label="Enabled"
					/>
				</div>
			</div>

			{{! collapsible body — grid-rows 1fr↔0fr (the sketch's animation).
				`inert` when collapsed: the clip is visual-only, so without it
				the hidden sliders/fields would stay in the tab order and take
				invisible edits. }}
			{{#if this.expandable}}
				<div
					class="sub-fx-body
						{{if this.isOpen 'is-open'}}"
					inert={{unless this.isOpen true}}
				>
					<div class="sub-fx-body-clip">
						{{#if this.matteBlock}}
							<MatteBody
								@layerId={{@layerId}}
							/>
						{{else}}
							{{#each
								this.params
								key="spec.key"
								as |p|
							}}
								{{#if
									(eq
										p.spec.kind
										"presets"
									)
								}}
									{{! presets bleed edge-to-edge }}
									<PresetsGrid
										@spec={{p.spec}}
										@fx={{@fx}}
										@layerId={{@layerId}}
										@stack={{@stack}}
										@bordered={{p.bordered}}
									/>
								{{else if
									(eq
										p.spec.kind
										"pairs"
									)
								}}
									<PairsGrid
										@spec={{p.spec}}
										@fx={{@fx}}
										@layerId={{@layerId}}
										@stack={{@stack}}
										@bordered={{p.bordered}}
									/>
								{{else}}
									<div
										class="sub-fx-prow
											{{if
												p.bordered
												'is-bordered'
											}}"
									>
										{{#if
											(eq
												p.spec.kind
												"slider"
											)
										}}
											<SliderRow
												@spec={{p.spec}}
												@fx={{@fx}}
												@layerId={{@layerId}}
												@stack={{@stack}}
											/>
										{{else if
											(eq
												p.spec.kind
												"stepper"
											)
										}}
											<StepperRow
												@spec={{p.spec}}
												@fx={{@fx}}
												@layerId={{@layerId}}
												@stack={{@stack}}
											/>
										{{else if
											(eq
												p.spec.kind
												"colour"
											)
										}}
											<ColourRow
												@spec={{p.spec}}
												@fx={{@fx}}
												@layerId={{@layerId}}
												@stack={{@stack}}
											/>
										{{else}}
											<SelectRow
												@spec={{p.spec}}
												@fx={{@fx}}
												@layerId={{@layerId}}
												@stack={{@stack}}
											/>
										{{/if}}
									</div>
								{{/if}}
							{{/each}}
						{{/if}}
					</div>
				</div>
			{{/if}}
		</div>
	</template>
}

// ── pipeline zones ──────────────────────────────────────────────────────────

interface FxZoneSignature {
	Args: {
		layer: RasterLayer;
		stack: FxStack;
		openId: string | null;
		onToggleOpen: (id: string) => void;
	};
}

class FxZone extends Component<FxZoneSignature> {
	// Isolated manager per zone: the two doc arrays cannot interleave, so a
	// drag never crosses the divider.
	manager = createDndManager();

	constructor(
		...args: ConstructorParameters<
			typeof Component<FxZoneSignature>
		>
	) {
		super(...args);
		this.manager.monitor.addEventListener(
			'dragend',
			this.onDragEnd,
		);
	}

	willDestroy() {
		super.willDestroy();
		// Each manager installs document-level pointer listeners; the panel
		// opens and closes freely, so an undestroyed one keeps handling every
		// pointerdown for the rest of the session (layers-panel precedent).
		this.manager.destroy();
	}

	/** The filters zone hides the looks-module-owned film-sim; setFxOrder
	 *  handles the subset (unlisted entries sink to the end — where the sim is
	 *  pinned anyway). */
	get list(): FxItem[] {
		const stack =
			this.args.stack === 'effects'
				? this.args.layer.effects
				: this.args.layer.filters;
		return stack.filter((fx) => fx.type !== 'film-sim');
	}

	get rows() {
		return this.list.map((fx, index) => ({ fx, index }));
	}

	isOpen = (id: string) => id === this.args.openId;

	onDragEnd = (event: DragEndEvent) => {
		// Escape mid-drag, and manager.destroy() during one, both dispatch
		// dragend with canceled set — neither should write the order
		// (substrata-shell applies the same guard to its dock drops).
		if (event.canceled) return;
		const { source, target } = event.operation;
		if (!source || !target || source.id === target.id) return;
		const ids = this.list.map((fx) => fx.id);
		const from = ids.indexOf(String(source.id));
		const to = ids.indexOf(String(target.id));
		if (from === -1 || to === -1) return;
		const next = [...ids];
		const [moved] = next.splice(from, 1);
		if (moved === undefined) return;
		next.splice(to, 0, moved);
		setFxOrder(this.args.layer.id, this.args.stack, next);
	};

	<template>
		{{#if this.rows}}
			{{! groups one stack's blocks — the last-child divider rule
				and the per-zone sortable both need the wrapper }}
			<div>
				{{#each this.rows key="fx.id" as |row|}}
					<FxBlock
						@layerId={{@layer.id}}
						@stack={{@stack}}
						@fx={{row.fx}}
						@index={{row.index}}
						@open={{this.isOpen row.fx.id}}
						@onToggle={{fn
							@onToggleOpen
							row.fx.id
						}}
						@manager={{this.manager}}
					/>
				{{/each}}
			</div>
		{{/if}}
	</template>
}

// ── Add picker ──────────────────────────────────────────────────────────────

interface AddFxSignature {
	Args: {
		layer: RasterLayer;
		onAdded: (id: string) => void;
	};
}

class AddFxButton extends Component<AddFxSignature> {
	@tracked open = false;

	groups = PICKER_GROUPS;

	setOpen = (open: boolean) => {
		this.open = open;
	};

	has = (stack: FxStack, type: string) =>
		(stack === 'effects'
			? this.args.layer.effects
			: this.args.layer.filters
		).some((fx) => fx.type === type);

	pick = (stack: FxStack, type: string) => {
		const id = addFx(this.args.layer.id, stack, type);
		if (id) this.args.onAdded(id);
		this.open = false;
	};

	<template>
		<Popover @open={{this.open}} @onOpenChange={{this.setOpen}}>
			<PopoverTrigger @asChild={{true}} as |trigger|>
				<button
					type="button"
					class="sub-fx-add"
					{{trigger.modifiers}}
				>
					<Icon @name="plus" />
					{{! the mockup's word (functional chrome) }}
					Add Effect
				</button>
			</PopoverTrigger>
			<PopoverContent
				@align="start"
				@sideOffset={{0}}
				class="sub-fx-picker"
			>
				{{! film sims / LUTs live in the LOOKS module now — the picker
					holds only the two type groups }}
				{{#each this.groups key="key" as |group|}}
					<div>
						<div class="sub-fx-pickhead">
							<span
								class="sub-fx-pickhead-word"
							>{{group.heading}}</span>
							<span
								class="sub-fx-pickhead-count"
							>{{group.cards.length}}</span>
							<span
								class="sub-fx-pickhead-rule"
							></span>
						</div>
						<div
							class="segmented sub-fx-pickgrid"
						>
							{{#each
								group.cards
								key="type"
								as |card|
							}}
								<button
									type="button"
									class="sub-fx-pickcard"
									style={{spanStyle
										card.span
									}}
									disabled={{this.has
										group.stack
										card.type
									}}
									{{on
										"click"
										(fn
											this.pick
											group.stack
											card.type
										)
									}}
								>
									<span
										aria-hidden="true"
										class="sub-fx-pickicon"
									><Icon
											@name={{card.icon}}
										/></span>
									<span
										class="sub-fx-picklabel"
									>{{card.label}}</span>
								</button>
							{{/each}}
						</div>
					</div>
				{{/each}}
			</PopoverContent>
		</Popover>
	</template>
}

// ── the module body ─────────────────────────────────────────────────────────

/** Active layer's name for the module box header (sub slot, per the sketch). */
export class FxSub extends Component {
	#active = new ActiveLayer();

	get name() {
		return this.#active.layer?.name ?? null;
	}

	willDestroy() {
		super.willDestroy();
		this.#active.teardown();
	}

	<template>{{this.name}}</template>
}

export class FxBody extends Component {
	#active = new ActiveLayer();

	@tracked openId: string | null = null;

	get layer() {
		return this.#active.layer;
	}

	/** Group fx are v1-deferred (no group render target); offering the stacks
	 *  here would write dead data a future group renderer would suddenly start
	 *  reading (the Inspector gates the same way). */
	get isGroupLayer() {
		const layer = this.layer;
		return layer !== null && isGroup(layer);
	}

	/** Filters + effects move pixels through the raster pipeline only — on a
	 *  shape/text layer they would be dead data rendering nothing. The
	 *  rasterize-for-effects affordance replaces this hint once non-raster
	 *  kinds can bake. */
	get raster(): RasterLayer | null {
		const layer = this.layer;
		return layer !== null && layer.kind === 'raster' ? layer : null;
	}

	/** The film-sim look lives in the LOOKS module — the FX pipeline never
	 *  shows it (it stays pinned at the stack's end regardless). */
	get showDivider() {
		const layer = this.raster;
		if (!layer) return false;
		return (
			layer.filters.some((f) => f.type !== 'film-sim') &&
			layer.effects.length > 0
		);
	}

	toggleOpen = (id: string) => {
		this.openId = this.openId === id ? null : id;
	};

	// Single-open accordion across BOTH zones (ids are unique across stacks).
	setOpen = (id: string) => {
		this.openId = id;
	};

	willDestroy() {
		super.willDestroy();
		this.#active.teardown();
	}

	// Wording carried over from the Next app.
	<template>
		{{#if this.raster}}
			<div class="sub-fx">
				<AddFxButton
					@layer={{this.raster}}
					@onAdded={{this.setOpen}}
				/>
				<div class="sub-fx-pipeline">
					<FxZone
						@layer={{this.raster}}
						@stack="filters"
						@openId={{this.openId}}
						@onToggleOpen={{this.toggleOpen}}
					/>
					{{#if this.showDivider}}
						{{! the heavy pipeline divider between the filter chain
							and the effects }}
						<div
							aria-hidden="true"
							class="sub-fx-divider"
						></div>
					{{/if}}
					<FxZone
						@layer={{this.raster}}
						@stack="effects"
						@openId={{this.openId}}
						@onToggleOpen={{this.toggleOpen}}
					/>
				</div>
			</div>
		{{else if this.isGroupLayer}}
			<div class="sub-fx-empty">Select a layer inside the
				group to add effects...</div>
		{{else if this.layer}}
			<div class="sub-fx-empty">Effects apply to image layers
				for now.</div>
		{{else}}
			<div class="sub-fx-empty">Select a layer to add
				effects...</div>
		{{/if}}
	</template>
}
