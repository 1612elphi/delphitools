import Component from '@glimmer/component';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSwitch from 'delphicanon/components/canon-switch';
import {
	hexToOklch,
	oklchToHex,
} from 'delphitools-v2/lib/substrata/colour-convert';
import type {
	Gradient,
	ShapeLayer,
	ShapeStroke,
} from 'delphitools-v2/lib/substrata/doc-model';
import { angleToCoords } from 'delphitools-v2/lib/substrata/gradient-geometry';
import {
	setFill,
	setShapeParams,
	setShapeStroke,
} from 'delphitools-v2/lib/substrata/layer-ops';
import ColourWell from './colour-well';
import GradientEditor from './gradient-editor';
import Fresh, { both } from './fresh';
import NumField from './num-field';
import Presets from './presets';

const FILL_TITLES = ['Solid', 'Gradient'];
const SIDE_PRESETS = [3, 4, 5, 6, 8].map((v) => ({
	value: v,
	label: String(v),
}));
const POINT_PRESETS = [4, 5, 6, 8].map((v) => ({
	value: v,
	label: String(v),
}));
const INNER_PRESETS = [30, 50, 70].map((v) => ({
	value: v,
	label: `${v}%`,
}));

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

export default class ShapeSection extends Component<{
	Args: { layer: ShapeLayer };
}> {
	get id() {
		return this.args.layer.id;
	}

	get params() {
		return this.args.layer.params;
	}

	get hasFill() {
		return this.params.shape !== 'line';
	}

	get grad(): Gradient | null {
		const { fill } = this.args.layer;
		return typeof fill === 'string' ? null : fill;
	}

	get solid(): string {
		const { fill } = this.args.layer;
		return typeof fill === 'string' ? fill : '#888888';
	}

	get rect() {
		const p = this.params;
		return p.shape === 'rectangle' ? p : null;
	}

	get polygon() {
		const p = this.params;
		return p.shape === 'polygon' ? p : null;
	}

	get star() {
		const p = this.params;
		return p.shape === 'star' ? p : null;
	}

	get cornerMax(): number {
		const p = this.rect;
		return p ? Math.floor(Math.min(p.width, p.height) / 2) : 0;
	}

	get cornerPresets() {
		const half = this.cornerMax;
		return [
			{ value: 0, label: 'Sharp' },
			{ value: Math.round(half * 0.16), label: 'Subtle' },
			{ value: Math.round(half * 0.5), label: 'Round' },
			{ value: half, label: 'Pill' },
		];
	}

	get innerPercent(): number {
		const p = this.star;
		return p
			? Math.round((p.innerRadius / p.outerRadius) * 100)
			: 0;
	}

	get stroke(): ShapeStroke | null {
		return this.args.layer.stroke;
	}

	get dashed(): boolean {
		return (this.stroke?.dash?.length ?? 0) > 0;
	}

	pickFill = (index: number) => {
		const grad = this.grad;
		if (index === 1 && !grad)
			setFill(this.id, solidToGradient(this.solid));
		else if (index === 0 && grad)
			setFill(this.id, grad.stops[0]?.colour ?? '#888888');
	};

	applySolid = (hex: string, transient: boolean) =>
		setFill(this.id, hex, { transient });

	setCorner = (cornerRadius: number) => {
		const p = this.rect;
		if (p) setShapeParams(this.id, { ...p, cornerRadius });
	};

	setSides = (sides: number) => {
		const p = this.polygon;
		if (p) setShapeParams(this.id, { ...p, sides });
	};

	setPoints = (points: number) => {
		const p = this.star;
		if (p) setShapeParams(this.id, { ...p, points });
	};

	setInner = (percent: number) => {
		const p = this.star;
		if (p)
			setShapeParams(this.id, {
				...p,
				innerRadius: (p.outerRadius * percent) / 100,
			});
	};

	toggleStroke = (on: boolean) =>
		setShapeStroke(
			this.id,
			on ? { colour: '#1d1d1d', width: 2 } : null,
		);

	applyStroke = (colour: string, transient: boolean) => {
		const stroke = this.stroke;
		if (stroke)
			setShapeStroke(
				this.id,
				{ ...stroke, colour },
				{ transient },
			);
	};

	setStrokeWidth = (width: number) => {
		const stroke = this.stroke;
		if (!stroke) return;
		const dash = stroke.dash?.map(
			(d) => (d * width) / stroke.width,
		);
		setShapeStroke(this.id, { ...stroke, width, dash });
	};

	toggleDash = (on: boolean) => {
		const stroke = this.stroke;
		if (stroke)
			setShapeStroke(this.id, {
				...stroke,
				dash: on
					? [stroke.width * 3, stroke.width * 2]
					: undefined,
			});
	};

	<template>
		<CanonHeading @text="Shape" />
		{{#if this.hasFill}}
			<CanonRow @title="Fill" @form="stacked" as |titleId|>
				<CanonSegmented
					@items={{FILL_TITLES}}
					@selected={{if this.grad 1 0}}
					@onChange={{this.pickFill}}
					aria-labelledby={{titleId}}
				/>
			</CanonRow>
			{{#if this.grad}}
				<GradientEditor
					@layerId={{@layer.id}}
					@grad={{this.grad}}
				/>
			{{else}}
				<CanonRow @title="Colour" @form="stacked">
					<ColourWell
						@hex={{this.solid}}
						@onApply={{this.applySolid}}
						@label="Fill colour"
					/>
				</CanonRow>
			{{/if}}
		{{/if}}
		{{#if this.rect}}
			<CanonRow @title="Corner" @form="flush" as |titleId|>
				<NumField
					@value={{this.rect.cornerRadius}}
					@onCommit={{this.setCorner}}
					@min={{0}}
					@max={{this.cornerMax}}
					@unit="px"
					@labelledBy={{titleId}}
				/>
			</CanonRow>
			<Presets
				@options={{this.cornerPresets}}
				@value={{this.rect.cornerRadius}}
				@onPick={{this.setCorner}}
				@eps={{1}}
				aria-label="Corner"
			/>
		{{/if}}
		{{#if this.polygon}}
			<CanonRow @title="Sides" @form="flush" as |titleId|>
				<NumField
					@value={{this.polygon.sides}}
					@onCommit={{this.setSides}}
					@min={{3}}
					@max={{12}}
					@labelledBy={{titleId}}
				/>
			</CanonRow>
			<Presets
				@options={{SIDE_PRESETS}}
				@value={{this.polygon.sides}}
				@onPick={{this.setSides}}
				aria-label="Sides"
			/>
		{{/if}}
		{{#if this.star}}
			<CanonRow @title="Points" @form="flush" as |titleId|>
				<NumField
					@value={{this.star.points}}
					@onCommit={{this.setPoints}}
					@min={{3}}
					@max={{12}}
					@labelledBy={{titleId}}
				/>
			</CanonRow>
			<Presets
				@options={{POINT_PRESETS}}
				@value={{this.star.points}}
				@onPick={{this.setPoints}}
				aria-label="Points"
			/>
			<CanonRow @title="Inner" @form="flush" as |titleId|>
				<NumField
					@value={{this.innerPercent}}
					@onCommit={{this.setInner}}
					@min={{10}}
					@max={{90}}
					@step={{5}}
					@unit="%"
					@labelledBy={{titleId}}
				/>
			</CanonRow>
			<Presets
				@options={{INNER_PRESETS}}
				@value={{this.innerPercent}}
				@onPick={{this.setInner}}
				@eps={{1}}
				aria-label="Inner"
			/>
		{{/if}}
		<CanonRow @title="Stroke" as |titleId|>
			<Fresh @value={{if this.stroke true false}} as |mine|>
				<CanonSwitch
					@on={{if this.stroke true false}}
					@onChange={{both
						mine
						this.toggleStroke
					}}
					aria-labelledby={{titleId}}
				/>
			</Fresh>
		</CanonRow>
		{{#if this.stroke}}
			<CanonRow @title="Colour" @form="stacked">
				<ColourWell
					@hex={{this.stroke.colour}}
					@onApply={{this.applyStroke}}
					@label="Stroke colour"
				/>
			</CanonRow>
			<CanonRow @title="Width" @form="flush" as |titleId|>
				<NumField
					@value={{this.stroke.width}}
					@onCommit={{this.setStrokeWidth}}
					@min={{1}}
					@max={{100}}
					@decimals={{1}}
					@unit="px"
					@labelledBy={{titleId}}
				/>
			</CanonRow>
			<CanonRow @title="Dashed" as |titleId|>
				<Fresh @value={{this.dashed}} as |mine|>
					<CanonSwitch
						@on={{this.dashed}}
						@onChange={{both
							mine
							this.toggleDash
						}}
						aria-labelledby={{titleId}}
					/>
				</Fresh>
			</CanonRow>
		{{/if}}
	</template>
}
