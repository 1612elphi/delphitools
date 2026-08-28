import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { BLEND_OPTIONS } from 'delphitools-v2/components/substrata/blend-options';
import { ShapeFillRows } from 'delphitools-v2/components/substrata/gradient-row';
import {
	PresetRow,
	Stepper,
	type PresetOption,
} from 'delphitools-v2/components/substrata/preset-row';
import {
	FontSelect,
	TextAlignRow,
	TextStyleRow,
} from 'delphitools-v2/components/substrata/text-style-row';
import { TransientColourCell } from 'delphitools-v2/components/substrata/transient-colour';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import Switch from 'delphitools-v2/components/ui/switch';
import type {
	BlendMode,
	Layer,
	ShapeLayer,
	ShapeParams,
	SubstrataDoc,
	TextAlign,
	TextLayer,
	Transform,
} from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	setBlendMode,
	setFill,
	setOpacity,
	setShapeParams,
	setShapeStroke,
	setTextProps,
	setTransform,
} from 'delphitools-v2/lib/substrata/layer-ops';
import {
	findLayer,
	isGroup,
	leafLayers,
} from 'delphitools-v2/lib/substrata/layer-tree';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import {
	getPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import {
	getActiveLayerId,
	getSelectedLayerIds,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { layerDims } from 'delphitools-v2/lib/substrata/shape-geometry';
import {
	deriveTextStyle,
	styleFields,
	textAccent,
	DEFAULT_TEXT_PROPS,
	type TextStylePreset,
} from 'delphitools-v2/lib/substrata/text-style';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

// body-only; module box supplies the header
// transform.x/y is object centre, scene coords (§ sync convention)
// w/h are natural dims; scale % ties both axes
// writes one-way through layer-ops; field commit = one undo step

function applyOp(a: number, op: string, b: number): number {
	switch (op) {
		case '+':
			return a + b;
		case '-':
			return a - b;
		case '*':
			return a * b;
		case '/':
			return b === 0 ? a : a / b;
		default:
			return b;
	}
}

// field grammar: "+100" "-50" "*1.5" "/2" relative; "100+50" expression
// null on unparseable → edit discarded
function evalField(raw: string, current: number): number | null {
	const s = raw.trim().replace(/\s+/g, '');
	if (s === '') return null;

	let m = s.match(/^([+\-*/])(-?\d*\.?\d+)$/);
	if (m) {
		const n = parseFloat(m[2] as string);
		return Number.isFinite(n)
			? applyOp(current, m[1] as string, n)
			: null;
	}

	m = s.match(/^(-?\d*\.?\d+)([+\-*/])(-?\d*\.?\d+)$/);
	if (m) {
		const a = parseFloat(m[1] as string);
		const b = parseFloat(m[3] as string);
		return Number.isFinite(a) && Number.isFinite(b)
			? applyOp(a, m[2] as string, b)
			: null;
	}

	const n = parseFloat(s);
	return Number.isFinite(n) ? n : null;
}

const KIND_ICON: Record<Layer['kind'], string> = {
	raster: 'image',
	text: 'type',
	shape: 'square',
	freehand: 'brush',
	group: 'folder',
};

const DIRECTIONS = ['ltr', 'rtl'] as const;

const SIDE_PRESETS: PresetOption[] = [3, 4, 5, 6, 8].map((v) => ({
	value: v,
	label: String(v),
}));

const POINT_PRESETS: PresetOption[] = [4, 5, 6, 8].map((v) => ({
	value: v,
	label: String(v),
}));

const INNER_PRESETS: PresetOption[] = [30, 50, 70].map((v) => ({
	value: v,
	label: `${v}%`,
}));

const TEXT_SIZE_PRESETS: PresetOption[] = [16, 24, 48, 96].map((v) => ({
	value: v,
	label: String(v),
}));

interface TransformCell {
	key: string;
	label?: string;
	/** kebab-case lucide name */
	icon?: string;
	unit?: string;
	/** tooltip + aria for icon-only cells (X/Y/W/H self-label) */
	title?: string;
	value: number;
	onCommit: (n: number) => void;
}

export interface SectionTitleSignature {
	Element: HTMLDivElement;
	Args: { text: string };
}

const SectionTitle: TOC<SectionTitleSignature> = <template>
	<div class="sub-insp-section-title" ...attributes>{{@text}}</div>
</template>;

export interface ShapeRowSignature {
	Element: HTMLDivElement;
	Args: { label: string };
	Blocks: { default: [] };
}

const ShapeRow: TOC<ShapeRowSignature> = <template>
	<div class="sub-insp-row" ...attributes>
		<span class="sub-insp-row-label">{{@label}}</span>
		{{yield}}
	</div>
</template>;

export interface InfoRowSignature {
	Element: HTMLDivElement;
	Args: { label: string; value: string };
}

const InfoRow: TOC<InfoRowSignature> = <template>
	<div class="sub-insp-info-row" ...attributes>
		<span class="sub-insp-info-label">{{@label}}</span>
		<span class="sub-insp-info-value">{{@value}}</span>
	</div>
</template>;

export interface FillRowSignature {
	Args: { layerId: string; fill: string };
}

// freehand only; string fill. shapes use shapefillrows (gradient-row.gts)
class FillRow extends Component<FillRowSignature> {
	apply = (value: string, transient: boolean) => {
		setFill(
			this.args.layerId,
			value,
			transient ? { transient } : undefined,
		);
	};

	<template>
		<ShapeRow @label="Fill">
			<TransientColourCell
				@value={{@fill}}
				@onApply={{this.apply}}
				@swatchAria="Fill colour"
				@hexAria="Fill hex"
			/>
		</ShapeRow>
	</template>
}

export interface StrokeRowsSignature {
	Args: { layer: ShapeLayer };
}

class StrokeRows extends Component<StrokeRowsSignature> {
	get stroke() {
		return this.args.layer.stroke;
	}

	get enabled(): boolean {
		return this.stroke !== null;
	}

	toggle = (on: boolean) => {
		setShapeStroke(
			this.args.layer.id,
			on ? { colour: '#1d1d1d', width: 2 } : null,
		);
	};

	applyColour = (value: string, transient: boolean) => {
		const stroke = this.stroke;
		if (!stroke) return;
		setShapeStroke(
			this.args.layer.id,
			{ ...stroke, colour: value },
			transient ? { transient } : undefined,
		);
	};

	setWidth = (width: number) => {
		const stroke = this.stroke;
		if (!stroke) return;
		setShapeStroke(this.args.layer.id, { ...stroke, width });
	};

	<template>
		<ShapeRow @label="Stroke">
			<Switch
				@checked={{this.enabled}}
				@onChange={{this.toggle}}
				@label="Stroke"
			/>
		</ShapeRow>
		{{#if this.stroke}}
			<ShapeRow @label="Colour">
				<TransientColourCell
					@value={{this.stroke.colour}}
					@onApply={{this.applyColour}}
					@swatchAria="Stroke colour"
					@hexAria="Stroke hex"
				/>
			</ShapeRow>
			<ShapeRow @label="Width">
				<Stepper
					@value={{this.stroke.width}}
					@onChange={{this.setWidth}}
					@min={{1}}
					@max={{100}}
					@unit="px"
				/>
			</ShapeRow>
		{{/if}}
	</template>
}

export interface ShapeSectionSignature {
	Args: { layer: ShapeLayer };
}

// corner presets size-aware (fractions of min side → pill always a pill)
// custom corner caps at half min side (beyond = a lie)
// same preset-row language as the pieces bloom
class ShapeSection extends Component<ShapeSectionSignature> {
	get params(): ShapeParams {
		return this.args.layer.params;
	}

	// line is stroke-only → no fill row
	get hasFill(): boolean {
		return this.params.shape !== 'line';
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

	get minSide(): number {
		const p = this.rect;
		return p ? Math.min(p.width, p.height) : 0;
	}

	// corner arias: sharpest→roundest, british spelling
	get cornerPresets(): PresetOption[] {
		const m = this.minSide;
		return [
			{ value: 0, cornerR: 0, aria: 'Sharp' },
			{
				value: Math.round(m * 0.08),
				cornerR: 2,
				aria: 'Subtle',
			},
			{
				value: Math.round(m * 0.25),
				cornerR: 4.5,
				aria: 'Round',
			},
			{
				value: Math.round(m * 0.5),
				cornerR: 7,
				aria: 'Pill',
			},
		];
	}

	get cornerMax(): number {
		return Math.floor(this.minSide / 2);
	}

	get innerPercent(): number {
		const p = this.star;
		return p
			? Math.round((p.innerRadius / p.outerRadius) * 100)
			: 0;
	}

	setCorner = (cornerRadius: number) => {
		const p = this.rect;
		if (p)
			setShapeParams(this.args.layer.id, {
				...p,
				cornerRadius,
			});
	};

	setSides = (sides: number) => {
		const p = this.polygon;
		if (p) setShapeParams(this.args.layer.id, { ...p, sides });
	};

	setPoints = (points: number) => {
		const p = this.star;
		if (p) setShapeParams(this.args.layer.id, { ...p, points });
	};

	setInner = (value: number) => {
		const p = this.star;
		if (p)
			setShapeParams(this.args.layer.id, {
				...p,
				innerRadius: (p.outerRadius * value) / 100,
			});
	};

	<template>
		<SectionTitle @text="Shape" />
		<div class="sub-insp-section">
			{{#if this.hasFill}}
				<ShapeFillRows
					@layerId={{@layer.id}}
					@fill={{@layer.fill}}
				/>
			{{/if}}
			{{#if this.rect}}
				<ShapeRow @label="Corner">
					<PresetRow
						@options={{this.cornerPresets}}
						@value={{this.rect.cornerRadius}}
						@onChange={{this.setCorner}}
						@eps={{1}}
						@min={{0}}
						@max={{this.cornerMax}}
						@unit="px"
					/>
				</ShapeRow>
			{{/if}}
			{{#if this.polygon}}
				<ShapeRow @label="Sides">
					<PresetRow
						@options={{SIDE_PRESETS}}
						@value={{this.polygon.sides}}
						@onChange={{this.setSides}}
						@min={{3}}
						@max={{12}}
					/>
				</ShapeRow>
			{{/if}}
			{{#if this.star}}
				<ShapeRow @label="Points">
					<PresetRow
						@options={{POINT_PRESETS}}
						@value={{this.star.points}}
						@onChange={{this.setPoints}}
						@min={{3}}
						@max={{12}}
					/>
				</ShapeRow>
				<ShapeRow @label="Inner">
					<PresetRow
						@options={{INNER_PRESETS}}
						@value={{this.innerPercent}}
						@onChange={{this.setInner}}
						@eps={{1}}
						@min={{10}}
						@max={{90}}
						@step={{5}}
						@unit="%"
					/>
				</ShapeRow>
			{{/if}}
			<StrokeRows @layer={{@layer}} />
		</div>
	</template>
}

export interface TextSectionSignature {
	Args: { layer: TextLayer };
}

// shape-section pattern; active style derived (text-style.ts)
class TextSection extends Component<TextSectionSignature> {
	get accent(): string {
		return textAccent(this.args.layer);
	}

	get align(): TextAlign {
		return this.args.layer.align ?? DEFAULT_TEXT_PROPS.align;
	}

	get lineHeight(): number {
		return (
			this.args.layer.lineHeight ??
			DEFAULT_TEXT_PROPS.lineHeight
		);
	}

	get charSpacing(): number {
		return (
			this.args.layer.charSpacing ??
			DEFAULT_TEXT_PROPS.charSpacing
		);
	}

	get direction(): string {
		return (
			this.args.layer.direction ??
			DEFAULT_TEXT_PROPS.direction
		);
	}

	get style(): TextStylePreset {
		return deriveTextStyle(this.args.layer);
	}

	setFontFamily = (fontFamily: string) => {
		setTextProps(this.args.layer.id, { fontFamily });
	};

	setFontSize = (fontSize: number) => {
		setTextProps(this.args.layer.id, { fontSize });
	};

	setAlign = (align: TextAlign) => {
		setTextProps(this.args.layer.id, { align });
	};

	setLineHeight = (value: number) => {
		setTextProps(this.args.layer.id, {
			lineHeight: Math.round(value * 100) / 100,
		});
	};

	setCharSpacing = (charSpacing: number) => {
		setTextProps(this.args.layer.id, { charSpacing });
	};

	setDirection = (direction: string) => {
		setTextProps(this.args.layer.id, {
			direction: direction as TextLayer['direction'],
		});
	};

	pickStyle = (preset: TextStylePreset) => {
		setTextProps(
			this.args.layer.id,
			styleFields(
				preset,
				this.accent,
				this.args.layer.fontSize,
			),
		);
	};

	applyColour = (hex: string, transient: boolean) => {
		setTextProps(
			this.args.layer.id,
			styleFields(
				deriveTextStyle(this.args.layer),
				hex,
				this.args.layer.fontSize,
			),
			transient ? { transient } : undefined,
		);
	};

	<template>
		<SectionTitle @text="Text" />
		<div class="sub-insp-section">
			<ShapeRow @label="Font">
				<FontSelect
					@value={{@layer.fontFamily}}
					@onChange={{this.setFontFamily}}
					class="sub-insp-font"
				/>
			</ShapeRow>
			<ShapeRow @label="Size">
				<PresetRow
					@options={{TEXT_SIZE_PRESETS}}
					@value={{@layer.fontSize}}
					@onChange={{this.setFontSize}}
					@min={{6}}
					@max={{400}}
					@unit="px"
				/>
			</ShapeRow>
			<ShapeRow @label="Align">
				<TextAlignRow
					@value={{this.align}}
					@onPick={{this.setAlign}}
				/>
			</ShapeRow>
			<ShapeRow @label="Line height">
				<Stepper
					@value={{this.lineHeight}}
					@onChange={{this.setLineHeight}}
					@min={{0.5}}
					@max={{3}}
					@step={{0.1}}
				/>
			</ShapeRow>
			<ShapeRow @label="Spacing">
				<Stepper
					@value={{this.charSpacing}}
					@onChange={{this.setCharSpacing}}
					@min={{-200}}
					@max={{800}}
					@step={{10}}
				/>
			</ShapeRow>
			<ShapeRow @label="Direction">
				<span class="segmented sub-insp-seg-2">
					{{#each DIRECTIONS as |d|}}
						<button
							type="button"
							class="sub-seg-cell sub-insp-dir-cell
								{{if
									(eq
										this.direction
										d
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setDirection
									d
								)
							}}
						>{{d}}</button>
					{{/each}}
				</span>
			</ShapeRow>
			<ShapeRow @label="Style">
				<TextStyleRow
					@value={{this.style}}
					@onPick={{this.pickStyle}}
				/>
			</ShapeRow>
			<ShapeRow @label="Colour">
				<TransientColourCell
					@value={{this.accent}}
					@onApply={{this.applyColour}}
					@swatchAria="Text colour"
					@hexAria="Text hex"
				/>
			</ShapeRow>
		</div>
	</template>
}

export interface NumFieldSignature {
	Args: {
		label?: string;
		/** kebab-case lucide name */
		icon?: string;
		unit?: string;
		title?: string;
		value: number;
		onCommit: (n: number) => void;
	};
}

// local draft; commit on blur/enter, revert on escape; subclasses supply
// liveValue + commitValue
abstract class DeferredNumberInput<S> extends Component<S> {
	@tracked draft: string | null = null;

	abstract get liveValue(): number;
	abstract commitValue(n: number): void;

	get display(): string {
		return this.draft ?? String(Math.round(this.liveValue));
	}

	commit = () => {
		if (this.draft === null) return;
		const n = evalField(this.draft, this.liveValue);
		if (n !== null) this.commitValue(n);
		this.draft = null;
	};

	onInput = (event: Event) => {
		this.draft = (event.target as HTMLInputElement).value;
	};

	onFocus = (event: Event) => {
		(event.target as HTMLInputElement).select();
	};

	onKeydown = (event: KeyboardEvent) => {
		const input = event.target as HTMLInputElement;
		if (event.key === 'Enter') {
			this.commit();
			input.blur();
		} else if (event.key === 'Escape') {
			this.draft = null;
			input.blur();
		}
	};
}

// wrapped in <label> so the glyph is the accessible name
class NumField extends DeferredNumberInput<NumFieldSignature> {
	get liveValue(): number {
		return this.args.value;
	}

	commitValue(n: number): void {
		this.args.onCommit(n);
	}

	get hasGlyph(): boolean {
		return Boolean(this.args.icon ?? this.args.label);
	}

	<template>
		<label title={{@title}} class="sub-insp-num">
			{{#if this.hasGlyph}}
				<span class="sub-insp-num-glyph">
					{{#if @icon}}
						<Icon @name={{@icon}} />
					{{else}}
						{{@label}}
					{{/if}}
				</span>
			{{/if}}
			<input
				class="sub-insp-num-input"
				inputmode="decimal"
				value={{this.display}}
				{{on "input" this.onInput}}
				{{on "focus" this.onFocus}}
				{{on "blur" this.commit}}
				{{on "keydown" this.onKeydown}}
			/>
			{{#if @unit}}
				<span class="sub-insp-num-unit">{{@unit}}</span>
			{{/if}}
		</label>
	</template>
}

export interface OpacityFieldSignature {
	Args: { layerId: string; opacity: number };
}

class OpacityField extends DeferredNumberInput<OpacityFieldSignature> {
	get liveValue(): number {
		return this.args.opacity * 100;
	}

	commitValue(n: number): void {
		setOpacity(
			this.args.layerId,
			Math.max(0, Math.min(100, n)) / 100,
		);
	}

	<template>
		<label class="sub-insp-opacity">
			<input
				class="sub-insp-opacity-input"
				inputmode="decimal"
				value={{this.display}}
				{{on "input" this.onInput}}
				{{on "focus" this.onFocus}}
				{{on "blur" this.commit}}
				{{on "keydown" this.onKeydown}}
			/>
			<span class="sub-insp-opacity-unit">%</span>
		</label>
	</template>
}

export interface GroupInfoSignature {
	Args: { layer: Layer; count: number };
}

class GroupInfo extends Component<GroupInfoSignature> {
	get members(): string {
		return String(leafLayers(this.args.layer).length);
	}

	get multi(): boolean {
		return this.args.count > 1;
	}

	<template>
		<div class="sub-insp">
			<div class="sub-insp-head">
				<span class="sub-insp-badge"><Icon
						@name="folder"
					/></span>
				<span
					class="sub-insp-name"
					title={{if @layer.name @layer.name}}
				>{{#if @layer.name}}{{@layer.name}}{{else}}<span
							class="sub-insp-name-placeholder"
						>Group</span>{{/if}}</span>
				{{#if this.multi}}
					<span
						aria-label="Layers selected"
						class="sub-insp-count sub-insp-count-end"
					>×{{@count}}</span>
				{{/if}}
			</div>
			<div class="sub-insp-info">
				<InfoRow
					@label="Layers"
					@value={{this.members}}
				/>
			</div>
		</div>
	</template>
}

export interface CanvasInfoSignature {
	Args: { doc: SubstrataDoc | null };
}

// mirrors the scene menu's readout so the inspector always shows something
class CanvasInfo extends Component<CanvasInfoSignature> {
	persist = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);

	willDestroy() {
		super.willDestroy();
		this.persist.unsubscribe();
	}

	get artboard() {
		return this.args.doc?.artboard ?? null;
	}

	get name(): string {
		return this.args.doc?.name ?? '';
	}

	get named(): boolean {
		return this.name.trim() !== '';
	}

	get nameTitle(): string | undefined {
		return this.name || undefined;
	}

	get artboardDims(): string {
		const ab = this.artboard;
		return ab ? `${ab.width}×${ab.height}` : '';
	}

	get dimensions(): string {
		const ab = this.artboard;
		return ab ? `${ab.width} × ${ab.height} px` : '—';
	}

	get resolution(): string {
		const ab = this.artboard;
		return ab ? `${ab.resolution} ppi` : '—';
	}

	get layerCount(): string {
		return String(this.args.doc?.layers.length ?? 0);
	}

	get stored(): string {
		return this.persist.current ? 'Local' : 'Off';
	}

	// same modal as scene ▸ canvas size…
	openCanvasSize = () => openModal('canvas-size');

	<template>
		<div class="sub-insp">
			{{! mirrors the layer seltype header }}
			<div class="sub-insp-head">
				<span class="sub-insp-badge"><Icon
						@name="frame"
					/></span>
				<span
					class="sub-insp-name"
					title={{this.nameTitle}}
				>{{#if this.named}}{{this.name}}{{else}}<span
							class="sub-insp-name-dim"
						>Untitled scene</span>{{/if}}</span>
				{{#if this.artboard}}
					<span
						class="sub-insp-dims"
					>{{this.artboardDims}}</span>
				{{/if}}
			</div>
			<div class="sub-insp-info">
				<InfoRow
					@label="Dimensions"
					@value={{this.dimensions}}
				/>
				<InfoRow
					@label="Resolution"
					@value={{this.resolution}}
				/>
				<InfoRow
					@label="Bit depth"
					@value="8-bit / ch"
				/>
				<InfoRow @label="Colour" @value="sRGB" />
				<InfoRow
					@label="Layers"
					@value={{this.layerCount}}
				/>
				<InfoRow
					@label="Stored"
					@value={{this.stored}}
				/>
			</div>
			<button
				type="button"
				class="sub-insp-canvas-size"
				{{on "click" this.openCanvasSize}}
			>
				<Icon @name="scaling" />
				Canvas size…
			</button>
		</div>
	</template>
}

export class InspectorBody extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);
	activeId = new TrackedExternal(subscribeSelection, getActiveLayerId);
	selectedIds = new TrackedExternal(
		subscribeSelection,
		getSelectedLayerIds,
	);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.activeId.unsubscribe();
		this.selectedIds.unsubscribe();
	}

	// findLayer is a tree dfs; cached against many template fans
	@cached
	get layer(): Layer | null {
		const doc = this.doc.current;
		const activeId = this.activeId.current;
		return doc && activeId ? findLayer(doc.layers, activeId) : null;
	}

	// groups: own transform stays identity + blend/opacity not applied in v1
	// (layer-tree.ts); fields would write dead values a future renderer reads
	get groupLayer(): Layer | null {
		const layer = this.layer;
		return layer && isGroup(layer) ? layer : null;
	}

	get leaf(): Layer | null {
		const layer = this.layer;
		return layer && !isGroup(layer) ? layer : null;
	}

	get shapeLayer(): ShapeLayer | null {
		const layer = this.leaf;
		return layer && layer.kind === 'shape' ? layer : null;
	}

	get textLayer(): TextLayer | null {
		const layer = this.leaf;
		return layer && layer.kind === 'text' ? layer : null;
	}

	get freehandLayer() {
		const layer = this.leaf;
		return layer && layer.kind === 'freehand' ? layer : null;
	}

	get kindIcon(): string {
		const layer = this.leaf;
		return layer ? KIND_ICON[layer.kind] : '';
	}

	get selectedCount(): number {
		return this.selectedIds.current.length;
	}

	// fields below edit the primary layer only
	get multiSelected(): boolean {
		return this.selectedCount > 1;
	}

	get nat(): { w: number; h: number } | null {
		const layer = this.leaf;
		if (!layer) return null;
		const d = layerDims(layer);
		return d ? { w: d.width, h: d.height } : null;
	}

	// shape dims fractional (polygon/star bboxes) → rounded
	get dimsLabel(): string {
		const nat = this.nat;
		return nat ? `${Math.round(nat.w)}×${Math.round(nat.h)}` : '';
	}

	get blendLabel(): string {
		const layer = this.leaf;
		if (!layer) return '';
		return (
			BLEND_OPTIONS.find((o) => o.value === layer.blendMode)
				?.label ?? layer.blendMode
		);
	}

	pickBlend = (value: string) => {
		const layer = this.leaf;
		if (layer) setBlendMode(layer.id, value as BlendMode);
	};

	get cells(): TransformCell[] {
		const layer = this.leaf;
		if (!layer) return [];
		const nat = this.nat;
		const t: Transform = layer.transform;
		const id = layer.id;

		const cells: TransformCell[] = [
			{
				key: 'x',
				label: 'X',
				value: t.x,
				onCommit: (n) =>
					setTransform(id, { ...t, x: n }),
			},
			{
				key: 'y',
				label: 'Y',
				value: t.y,
				onCommit: (n) =>
					setTransform(id, { ...t, y: n }),
			},
		];
		// zero-extent axis (line height) → no field; divide-by-zero. length
		// edits via w
		if (nat && nat.w > 0) {
			cells.push({
				key: 'w',
				label: 'W',
				value: nat.w * t.scaleX,
				onCommit: (n) =>
					setTransform(id, {
						...t,
						scaleX: Math.max(1, n) / nat.w,
					}),
			});
		}
		if (nat && nat.h > 0) {
			cells.push({
				key: 'h',
				label: 'H',
				value: nat.h * t.scaleY,
				onCommit: (n) =>
					setTransform(id, {
						...t,
						scaleY: Math.max(1, n) / nat.h,
					}),
			});
		}
		cells.push(
			{
				key: 'angle',
				icon: 'rotate-cw',
				unit: '°',
				title: 'Rotation',
				value: t.angle,
				onCommit: (n) =>
					setTransform(id, { ...t, angle: n }),
			},
			{
				key: 'scale',
				icon: 'scaling',
				unit: '%',
				title: 'Scale',
				value: t.scaleX * 100,
				onCommit: (n) => {
					const s = Math.max(1, n) / 100;
					setTransform(id, {
						...t,
						scaleX: s,
						scaleY: s,
					});
				},
			},
		);
		return cells;
	}

	<template>
		{{#if this.leaf}}
			<div class="sub-insp">
				{{! text breathes (DESIGN.md §1) }}
				<div class="sub-insp-head">
					<span class="sub-insp-badge"><Icon
							@name={{this.kindIcon}}
						/></span>
					<span
						class="sub-insp-name"
						title={{this.leaf.name}}
					>{{this.leaf.name}}</span>
					{{#if this.multiSelected}}
						<span
							aria-label="Layers selected"
							class="sub-insp-count"
						>×{{this.selectedCount}}</span>
					{{/if}}
					{{#if this.nat}}
						<span
							class="sub-insp-dims"
						>{{this.dimsLabel}}</span>
					{{/if}}
				</div>

				{{! middle scrolls → shape section never pushes the appearance
					bar past the rail box's uniform height (DESIGN.md §5/§6/§7) }}
				<div class="sub-insp-scroll">
					<SectionTitle @text="Transform" />
					<div class="segmented sub-insp-grid">
						{{#each
							this.cells key="key"
							as |c|
						}}
							<NumField
								@label={{c.label}}
								@icon={{c.icon}}
								@unit={{c.unit}}
								@title={{c.title}}
								@value={{c.value}}
								@onCommit={{c.onCommit}}
							/>
						{{/each}}
					</div>

					{{#if this.shapeLayer}}
						<ShapeSection
							@layer={{this.shapeLayer}}
						/>
					{{/if}}
					{{#if this.freehandLayer}}
						<SectionTitle @text="Shape" />
						<div class="sub-insp-section">
							<FillRow
								@layerId={{this.freehandLayer.id}}
								@fill={{this.freehandLayer.fill}}
							/>
						</div>
					{{/if}}
					{{#if this.textLayer}}
						<TextSection
							@layer={{this.textLayer}}
						/>
					{{/if}}
				</div>

				{{! labels dropped so "colour dodge" fits; % self-labels
					(DESIGN.md §5/§9/§11) }}
				<div class="sub-insp-appearance">
					<Select
						@value={{this.leaf.blendMode}}
						@onValueChange={{this.pickBlend}}
					>
						<SelectTrigger
							class="sub-insp-blend-trigger"
							aria-label="Blend mode"
							title="Blend mode"
						>
							<SelectValue
							>{{this.blendLabel}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{{#each
								BLEND_OPTIONS
								key="value"
								as |o|
							}}
								<SelectItem
									@value={{o.value}}
									class="sub-insp-blend-item"
								>{{o.label}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
					<OpacityField
						@layerId={{this.leaf.id}}
						@opacity={{this.leaf.opacity}}
					/>
				</div>
			</div>
		{{else if this.groupLayer}}
			<GroupInfo
				@layer={{this.groupLayer}}
				@count={{this.selectedCount}}
			/>
		{{else}}
			{{! no selection → scene readout (mirrors scene menu) }}
			<CanvasInfo @doc={{this.doc.current}} />
		{{/if}}
	</template>
}
