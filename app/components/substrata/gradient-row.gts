import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import { cssColour } from 'delphitools-v2/components/colour-field';
import {
	StepBtn,
	Stepper,
} from 'delphitools-v2/components/substrata/preset-row';
import { TransientColourCell } from 'delphitools-v2/components/substrata/transient-colour';
import {
	hexToOklch,
	oklchToHex,
} from 'delphitools-v2/lib/substrata/colour-convert';
import type {
	Gradient,
	GradientStop,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	angleToCoords,
	coordsToAngle,
} from 'delphitools-v2/lib/substrata/gradient-geometry';
import { setFill } from 'delphitools-v2/lib/substrata/layer-ops';

/**
 * Inspector fill rows for SHAPE layers — the gradient authoring pass
 * (2026-07-07). The Fill row grows a Solid/Gradient mode pair (standard
 * vocabulary chrome, the LTR/RTL precedent); gradient mode opens a compact
 * editor: Linear/Radial pair, a preview strip with CLICKABLE stop markers
 * (v1 — no marker dragging, see ponytail note), the selected stop's
 * colour + offset, add/remove stop, and an angle stepper for linear.
 *
 * Every discrete edit is ONE setFill() → one undo step; the stop swatch rides
 * the shared transient-colour mechanism so OS-picker drags coalesce to one
 * step. Freehand fills stay solid-only (string-typed; the Inspector keeps its
 * plain FillRow for those). The colour SINK's ratified v1 call is unchanged:
 * a flat pick REPLACES a gradient fill (colour-sink.ts).
 */

const MAX_STOPS = 6;

const FILL_MODES = ['solid', 'gradient'] as const;
const GRADIENT_TYPES = ['linear', 'radial'] as const;

/** Centred radial default — inner point at the middle, outer radius to the
 *  edge midpoints. Focal/centre editing is deferred (v1). */
const RADIAL_COORDS: Gradient['coords'] = {
	x1: 0.5,
	y1: 0.5,
	x2: 0.5,
	y2: 0.5,
	r1: 0,
	r2: 0.5,
};

/**
 * Solid → 2-stop linear (angle 0). The far stop is the SAME colour nudged
 * ±0.18 OKLCH lightness away from the nearer bound, so the ramp is always
 * visible whatever the base — chosen over "→ transparent" because the fill
 * pipeline and the hex-only colour cells speak #rrggbb.
 */
function solidToGradient(hex: string): Gradient {
	const lch = hexToOklch(hex) ?? { L: 0.5, C: 0, h: 0 };
	const far = oklchToHex({
		...lch,
		L: lch.L >= 0.5 ? lch.L - 0.18 : lch.L + 0.18,
	});
	return {
		type: 'linear',
		stops: [
			{ offset: 0, colour: hex },
			{ offset: 1, colour: far },
		],
		coords: angleToCoords(0),
	};
}

function markerStyle(stop: GradientStop) {
	return htmlSafe(
		`left: ${stop.offset * 100}%; background-color: ${cssColour(stop.colour)}`,
	);
}

export interface RowSignature {
	Element: HTMLDivElement;
	Args: { label: string };
	Blocks: { default: [] };
}

/** Local mirror of the Inspector's private ShapeRow (5 lines beat an import
 *  cycle — inspector-panel imports this file). */
const Row: TOC<RowSignature> = <template>
	<div class="sub-grad-row" ...attributes>
		<span class="sub-grad-row-label">{{@label}}</span>
		{{yield}}
	</div>
</template>;

export interface ModePairSignature {
	Element: HTMLSpanElement;
	Args: {
		options: readonly string[];
		value: string;
		onPick: (value: string) => void;
	};
}

/** Segmented two-option pair (the Inspector's LTR/RTL language). */
const ModePair: TOC<ModePairSignature> = <template>
	<span class="segmented sub-grad-mode" ...attributes>
		{{#each @options as |o|}}
			<button
				type="button"
				class="sub-seg-cell sub-grad-mode-cell
					{{if (eq @value o) 'is-active'}}"
				{{on "click" (fn @onPick o)}}
			>{{o}}</button>
		{{/each}}
	</span>
</template>;

export interface ShapeFillRowsSignature {
	Args: {
		layerId: string;
		fill: string | Gradient;
	};
}

/** The shape Fill row(s): mode pair + solid swatch or the gradient editor.
 *  Selection resets per layer, as the React key by layer id did. */
export class ShapeFillRows extends Component<ShapeFillRowsSignature> {
	@tracked selRaw = 0;
	@tracked selLayer: string | null = null;

	get grad(): Gradient | null {
		const fill = this.args.fill;
		return typeof fill === 'string' ? null : fill;
	}

	get solidFill(): string {
		const fill = this.args.fill;
		return typeof fill === 'string' ? fill : '';
	}

	get mode(): string {
		return this.grad ? 'gradient' : 'solid';
	}

	get selIdx(): number {
		const grad = this.grad;
		if (!grad) return 0;
		const sel =
			this.selLayer === this.args.layerId ? this.selRaw : 0;
		return Math.min(sel, grad.stops.length - 1);
	}

	setSel = (index: number) => {
		this.selRaw = index;
		this.selLayer = this.args.layerId;
	};

	pickMode = (mode: string) => {
		const grad = this.grad;
		if (mode === 'gradient' && !grad)
			setFill(
				this.args.layerId,
				solidToGradient(this.solidFill),
			);
		// switching back adopts stop[0]'s colour as the solid
		else if (mode === 'solid' && grad)
			setFill(
				this.args.layerId,
				grad.stops[0]?.colour ?? '#888888',
			);
	};

	applySolid = (value: string, transient: boolean) => {
		setFill(
			this.args.layerId,
			value,
			transient ? { transient } : undefined,
		);
	};

	<template>
		<Row @label="Fill">
			<div class="sub-grad-fill">
				<ModePair
					@options={{FILL_MODES}}
					@value={{this.mode}}
					@onPick={{this.pickMode}}
				/>
				{{#unless this.grad}}
					<TransientColourCell
						@value={{this.solidFill}}
						@onApply={{this.applySolid}}
						@swatchAria="Fill colour"
						@hexAria="Fill hex"
					/>
				{{/unless}}
			</div>
		</Row>
		{{#if this.grad}}
			<GradientEditor
				@layerId={{@layerId}}
				@grad={{this.grad}}
				@selIdx={{this.selIdx}}
				@setSel={{this.setSel}}
			/>
		{{/if}}
	</template>
}

export interface GradientEditorSignature {
	Args: {
		layerId: string;
		grad: Gradient;
		selIdx: number;
		setSel: (index: number) => void;
	};
}

class GradientEditor extends Component<GradientEditorSignature> {
	get stops(): GradientStop[] {
		return this.args.grad.stops;
	}

	get stopLabel(): string {
		return `${this.args.selIdx + 1}/${this.stops.length}`;
	}

	get atMaxStops(): boolean {
		return this.stops.length >= MAX_STOPS;
	}

	get atMinStops(): boolean {
		return this.stops.length <= 2;
	}

	get isLinear(): boolean {
		return this.args.grad.type === 'linear';
	}

	get selColour(): string {
		return this.stops[this.args.selIdx]?.colour ?? '#888888';
	}

	get selOffset(): number {
		return Math.round(
			(this.stops[this.args.selIdx]?.offset ?? 0) * 100,
		);
	}

	get angle(): number {
		return coordsToAngle(this.args.grad.coords);
	}

	get previewStyle() {
		const css = this.stops
			.map((s) => `${cssColour(s.colour)} ${s.offset * 100}%`)
			.join(', ');
		return htmlSafe(
			`background-image: linear-gradient(90deg, ${css})`,
		);
	}

	/** Commit new stops (kept offset-sorted so the CSS preview and undo diffs
	 *  stay sane); selection follows `track` through the re-sort. */
	commitStops = (
		next: GradientStop[],
		track?: GradientStop,
		transient?: boolean,
	) => {
		const sorted = [...next].sort((a, b) => a.offset - b.offset);
		if (track) this.args.setSel(Math.max(0, sorted.indexOf(track)));
		setFill(
			this.args.layerId,
			{ ...this.args.grad, stops: sorted },
			transient ? { transient } : undefined,
		);
	};

	patchStop = (patch: Partial<GradientStop>, transient?: boolean) => {
		const next = {
			...this.stops[this.args.selIdx],
			...patch,
		} as GradientStop;
		this.commitStops(
			this.stops.map((s, i) =>
				i === this.args.selIdx ? next : s,
			),
			next,
			transient,
		);
	};

	pickType = (type: string) => {
		if (type === this.args.grad.type) return;
		// type switch keeps the stops, resets coords to that type's default
		setFill(this.args.layerId, {
			...this.args.grad,
			type: type as Gradient['type'],
			coords:
				type === 'radial'
					? RADIAL_COORDS
					: angleToCoords(0),
		});
	};

	addStop = () => {
		if (this.stops.length >= MAX_STOPS) return;
		const cur = this.stops[this.args.selIdx] as GradientStop;
		// min 2 stops ⇒ a neighbour exists
		const nb = (this.stops[this.args.selIdx + 1] ??
			this.stops[this.args.selIdx - 1]) as GradientStop;
		const stop: GradientStop = {
			offset:
				Math.round(
					((cur.offset + nb.offset) / 2) * 100,
				) / 100,
			colour: cur.colour,
		};
		this.commitStops([...this.stops, stop], stop);
	};

	removeStop = () => {
		if (this.stops.length <= 2) return;
		this.args.setSel(Math.max(0, this.args.selIdx - 1));
		setFill(this.args.layerId, {
			...this.args.grad,
			stops: this.stops.filter(
				(_, i) => i !== this.args.selIdx,
			),
		});
	};

	applyStopColour = (hex: string, transient: boolean) => {
		this.patchStop({ colour: hex }, transient);
	};

	setOffset = (value: number) => {
		this.patchStop({ offset: value / 100 });
	};

	setAngle = (deg: number) => {
		setFill(this.args.layerId, {
			...this.args.grad,
			coords: angleToCoords(deg),
		});
	};

	<template>
		<Row @label="Type">
			<ModePair
				@options={{GRADIENT_TYPES}}
				@value={{@grad.type}}
				@onPick={{this.pickType}}
			/>
		</Row>
		{{! preview strip — stop order/colour along a flat 0→100% ramp (radial
			geometry previews on the canvas itself); markers select a stop.
			ponytail: markers are click-to-select only; drag-to-move via the
			Offset stepper — add pointer drag if it ever feels missing. }}
		<div class="sub-grad-preview-wrap">
			<div class="sub-grad-preview">
				<div
					class="sub-grad-preview-fill"
					style={{this.previewStyle}}
					aria-hidden="true"
				></div>
				{{#each this.stops as |s i|}}
					<button
						type="button"
						aria-label="Stop"
						class="sub-grad-stop
							{{if
								(eq i @selIdx)
								'is-selected'
							}}"
						style={{markerStyle s}}
						{{on "click" (fn @setSel i)}}
					></button>
				{{/each}}
			</div>
		</div>
		<Row @label="Stop">
			<span class="sub-grad-stopcount">
				<span
					class="sub-grad-stopcount-value"
				>{{this.stopLabel}}</span>
				<StepBtn
					@icon="plus"
					@onClick={{this.addStop}}
					@disabled={{this.atMaxStops}}
					@aria="Add stop"
				/>
				<StepBtn
					@icon="minus"
					@onClick={{this.removeStop}}
					@disabled={{this.atMinStops}}
					@aria="Remove stop"
				/>
			</span>
		</Row>
		<Row @label="Colour">
			<TransientColourCell
				@value={{this.selColour}}
				@onApply={{this.applyStopColour}}
				@swatchAria="Stop colour"
				@hexAria="Stop hex"
			/>
		</Row>
		<Row @label="Offset">
			<Stepper
				@value={{this.selOffset}}
				@onChange={{this.setOffset}}
				@min={{0}}
				@max={{100}}
				@step={{5}}
				@unit="%"
			/>
		</Row>
		{{#if this.isLinear}}
			<Row @label="Angle">
				<Stepper
					@value={{this.angle}}
					@onChange={{this.setAngle}}
					@min={{0}}
					@max={{360}}
					@step={{15}}
					@unit="°"
				/>
			</Row>
		{{/if}}
	</template>
}
