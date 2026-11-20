import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import CanonButton from 'delphicanon/components/canon-button';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { cssColour } from 'delphitools-v2/components/colour-field';
import { IconSvg } from 'delphitools-v2/components/icon';
import type {
	Gradient,
	GradientStop,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	angleToCoords,
	coordsToAngle,
} from 'delphitools-v2/lib/substrata/gradient-geometry';
import { setFill } from 'delphitools-v2/lib/substrata/layer-ops';
import ColourWell from './colour-well';
import NumField from './num-field';

const MAX_STOPS = 6;
const TYPES: Gradient['type'][] = ['linear', 'radial'];
const TYPE_TITLES = ['Linear', 'Radial'];

const RADIAL_COORDS: Gradient['coords'] = {
	x1: 0.5,
	y1: 0.5,
	x2: 0.5,
	y2: 0.5,
	r1: 0,
	r2: 0.5,
};

const stopName = (i: number) => `Stop ${i + 1}`;

function markerStyle(stop: GradientStop) {
	return htmlSafe(
		`left: ${stop.offset * 100}%; background-color: ${cssColour(stop.colour)}`,
	);
}

export interface GradientEditorSignature {
	Args: { layerId: string; grad: Gradient };
}

export default class GradientEditor extends Component<GradientEditorSignature> {
	@tracked selRaw = 0;

	get stops(): GradientStop[] {
		return this.args.grad.stops;
	}

	get selIdx(): number {
		return Math.min(this.selRaw, this.stops.length - 1);
	}

	get selStop(): GradientStop | undefined {
		return this.stops[this.selIdx];
	}

	get stopLabel(): string {
		return `${this.selIdx + 1}/${this.stops.length}`;
	}

	get typeIndex(): number {
		return TYPES.indexOf(this.args.grad.type);
	}

	get isLinear(): boolean {
		return this.args.grad.type === 'linear';
	}

	get offset(): number {
		return Math.round((this.selStop?.offset ?? 0) * 100);
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

	select = (index: number) => {
		this.selRaw = index;
	};

	commitStops = (
		next: GradientStop[],
		track?: GradientStop,
		transient = false,
	) => {
		const sorted = [...next].sort((a, b) => a.offset - b.offset);
		if (track) this.selRaw = Math.max(0, sorted.indexOf(track));
		setFill(
			this.args.layerId,
			{ ...this.args.grad, stops: sorted },
			{ transient },
		);
	};

	patchStop = (patch: Partial<GradientStop>, transient = false) => {
		const next = { ...this.selStop, ...patch } as GradientStop;
		this.commitStops(
			this.stops.map((s, i) =>
				i === this.selIdx ? next : s,
			),
			next,
			transient,
		);
	};

	pickType = (index: number) => {
		const type = TYPES[index];
		if (!type || type === this.args.grad.type) return;
		setFill(this.args.layerId, {
			...this.args.grad,
			type,
			coords:
				type === 'radial'
					? RADIAL_COORDS
					: angleToCoords(0),
		});
	};

	addStop = () => {
		if (this.stops.length >= MAX_STOPS) return;
		const cur = this.selStop!;
		const nb = (this.stops[this.selIdx + 1] ??
			this.stops[this.selIdx - 1])!;
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
		const drop = this.selIdx;
		this.selRaw = Math.max(0, drop - 1);
		setFill(this.args.layerId, {
			...this.args.grad,
			stops: this.stops.filter((_, i) => i !== drop),
		});
	};

	applyColour = (colour: string, transient: boolean) =>
		this.patchStop({ colour }, transient);

	setOffset = (value: number) => this.patchStop({ offset: value / 100 });

	setAngle = (deg: number) =>
		setFill(this.args.layerId, {
			...this.args.grad,
			coords: angleToCoords(deg),
		});

	get atMax() {
		return this.stops.length >= MAX_STOPS;
	}

	get atMin() {
		return this.stops.length <= 2;
	}

	<template>
		<CanonRow @title="Type" @form="stacked" as |titleId|>
			<CanonSegmented
				@items={{TYPE_TITLES}}
				@selected={{this.typeIndex}}
				@onChange={{this.pickType}}
				aria-labelledby={{titleId}}
			/>
		</CanonRow>
		<div class="sub-ip-grad">
			<div class="sub-ip-grad-track">
				<div
					class="sub-ip-grad-fill"
					style={{this.previewStyle}}
					aria-hidden="true"
				></div>
				{{#each this.stops as |s i|}}
					<button
						type="button"
						aria-label={{stopName i}}
						aria-pressed={{if
							(eq i this.selIdx)
							"true"
							"false"
						}}
						class="sub-ip-grad-stop
							{{if
								(eq
									i
									this.selIdx
								)
								'is-selected'
							}}"
						style={{markerStyle s}}
						{{on
							"click"
							(fn this.select i)
						}}
					></button>
				{{/each}}
			</div>
		</div>
		<CanonRow @title="Stop" @form="flush">
			<span class="sub-ip-stops">
				<span
					class="sub-ip-fact"
				>{{this.stopLabel}}</span>
				<CanonButton
					@kind="cell"
					@icon={{component IconSvg name="minus"}}
					@label="Remove stop"
					@disabled={{this.atMin}}
					@onClick={{this.removeStop}}
				/>
				<CanonButton
					@kind="cell"
					@icon={{component IconSvg name="plus"}}
					@label="Add stop"
					@disabled={{this.atMax}}
					@onClick={{this.addStop}}
				/>
			</span>
		</CanonRow>
		<CanonRow @title="Colour" @form="stacked">
			<ColourWell
				@hex={{if
					this.selStop
					this.selStop.colour
					"#888888"
				}}
				@onApply={{this.applyColour}}
				@label="Stop colour"
			/>
		</CanonRow>
		<CanonRow @title="Offset" @form="flush" as |titleId|>
			<NumField
				@value={{this.offset}}
				@onCommit={{this.setOffset}}
				@min={{0}}
				@max={{100}}
				@step={{5}}
				@unit="%"
				@labelledBy={{titleId}}
			/>
		</CanonRow>
		{{#if this.isLinear}}
			<CanonRow @title="Angle" @form="flush" as |titleId|>
				<NumField
					@value={{this.angle}}
					@onCommit={{this.setAngle}}
					@min={{0}}
					@max={{360}}
					@step={{15}}
					@unit="°"
					@labelledBy={{titleId}}
				/>
			</CanonRow>
		{{/if}}
	</template>
}
