import { cached } from '@glimmer/tracking';
import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { and, eq, or } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	ColourSwatchCell,
	DeferredHexInput,
} from 'delphitools-v2/components/colour-field';
import {
	PresetRow,
	StepBtn,
	Stepper,
	type PresetOption,
} from 'delphitools-v2/components/substrata/preset-row';
import {
	FontSelect,
	TextAlignRow,
	TextStyleRow,
} from 'delphitools-v2/components/substrata/text-style-row';
import Switch from 'delphitools-v2/components/ui/switch';
import type { TextAlign } from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { uploadLocalFont } from 'delphitools-v2/lib/substrata/fonts';
import { addFx, setFxParams } from 'delphitools-v2/lib/substrata/fx-ops';
import {
	getGuides,
	subscribeGuides,
	toggleGuide,
} from 'delphitools-v2/lib/substrata/guides-pref';
import { setTextProps } from 'delphitools-v2/lib/substrata/layer-ops';
import { findLayer } from 'delphitools-v2/lib/substrata/layer-tree';
import { PRESET_SHAPES } from 'delphitools-v2/lib/substrata/preset-shapes';
import {
	getActiveLayerId,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import {
	styleFields,
	textAccent,
	type TextStylePreset,
} from 'delphitools-v2/lib/substrata/text-style';
import {
	getActiveSubs,
	getActiveTool,
	setActiveSub,
	subscribeTool,
	type ToolId,
} from 'delphitools-v2/lib/substrata/tool';
import {
	getToolSettings,
	setTransformAsGroup,
	subscribeToolSettings,
	updateToolSettings,
	type PieceShape,
} from 'delphitools-v2/lib/substrata/tool-settings';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * Per-tool settings blooms for the omnibar's contextual zone (Ruby's rule: a
 * built tool ships its settings). MOVE is real — snap/grid (guides-pref, the
 * same switches as Workspace ▸ Guides) + the arrow-key nudge step
 * (tool-settings). PIECES·Primitives is real — shape / fill / stroke / shape
 * params (M2-7); the Pieces head (preset gallery to come) and Brush/Pencil
 * (freehand, next chunk) keep the copy-gap placeholder, as do the other stub
 * tools. The Bloom supplies the box chrome; bodies render header + rows.
 */

export interface ToolSettingsBodySignature {
	Args: {
		tool: ToolId;
		sub?: string;
	};
}

// The dispatch below only reaches these with a concrete subtool id, but Glint
// cannot narrow `@sub` through the `{{#if}}` guards, so the arg stays optional.
interface SubSignature {
	Args: { sub?: string };
}

/* ── shared rows ─────────────────────────────────────────────────────────── */

const Row: TOC<{
	Element: HTMLDivElement;
	Args: { label: string };
	Blocks: { default: [] };
}> = <template>
	<div class="sub-tool-row" ...attributes>
		<span class="sub-tool-row-label">{{@label}}</span>
		{{yield}}
	</div>
</template>;

/** Swatch + hex pair used by the Fill and Stroke rows. */
const ColourCell: TOC<{
	Args: {
		colour: string;
		onChange: (hex: string) => void;
		aria: string;
	};
}> = <template>
	<span class="sub-tool-colour">
		<ColourSwatchCell
			class="sub-tool-colour-swatch"
			@colour={{@colour}}
			@onChange={{@onChange}}
			@label={{@aria}}
		/>
		<DeferredHexInput
			class="sub-tool-colour-hex"
			@value={{@colour}}
			@onChange={{@onChange}}
			@label={{@aria}}
		/>
	</span>
</template>;

/* ── ADJUST ──────────────────────────────────────────────────────────────── */

/** ADJUST quick presets (Ruby 2026-07-12; titles + icons Claude-picked per
 *  her grant): one-tap versions of the FX everybody reaches for. Each adds
 *  its effect/filter to the ACTIVE raster layer (registry defaults, tuned
 *  params where the default is wrong for a scrim) — or retargets the
 *  existing block's params if the type is already on the stack (one undo
 *  step either way; fine-tuning lives in the FX panel). */
const ADJUST_PRESETS: {
	title: string;
	/** kebab-case lucide name */
	icon: string;
	stack: 'effects' | 'filters';
	type: string;
	params?: Record<string, number | string>;
}[] = [
	{
		title: 'Drop shadow',
		icon: 'copy',
		stack: 'effects',
		type: 'drop-shadow',
	},
	{
		title: 'Black overlay',
		icon: 'moon',
		stack: 'effects',
		type: 'colour-overlay',
		params: { colour: '#000000', opacity: 40 },
	},
	{
		title: 'White overlay',
		icon: 'sun',
		stack: 'effects',
		type: 'colour-overlay',
		params: { colour: '#ffffff', opacity: 40 },
	},
	{ title: 'Outline', icon: 'square', stack: 'effects', type: 'stroke' },
	{
		title: 'Glow',
		icon: 'sparkle',
		stack: 'effects',
		type: 'outer-glow',
	},
	{
		title: 'Greyscale',
		icon: 'contrast',
		stack: 'filters',
		type: 'grayscale',
	},
];

class AdjustSettings extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);
	layerId = new TrackedExternal(subscribeSelection, getActiveLayerId);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.layerId.unsubscribe();
	}

	// findLayer is a tree DFS, re-read per preset cell without the cache
	@cached
	get layer() {
		const doc = this.doc.current;
		const id = this.layerId.current;
		return doc && id ? findLayer(doc.layers, id) : null;
	}

	get ok() {
		return this.layer?.kind === 'raster';
	}

	get notOk() {
		return !this.ok;
	}

	apply = (preset: (typeof ADJUST_PRESETS)[number]) => {
		const layer = this.layer;
		const layerId = this.layerId.current;
		if (!this.ok || !layerId || !layer) return;
		const stack =
			preset.stack === 'effects'
				? layer.effects
				: layer.filters;
		const existing = stack.find((fx) => fx.type === preset.type);
		if (existing && preset.params)
			setFxParams(
				layerId,
				preset.stack,
				existing.id,
				preset.params,
			);
		else if (!existing)
			addFx(
				layerId,
				preset.stack,
				preset.type,
				preset.params,
			);
	};

	<template>
		<div class="sub-tool-pane is-w224">
			{{! Ruby's intro line, verbatim — the inline sparkle mirrors the
				omnibar's FX-panel trigger icon }}
			<div class="sub-tool-note is-lead">Quickly add an
				adjustment. Fine-adjust in the
				<Icon
					@name="sparkles"
					class="sub-tool-inline-icon"
				/>
				FX panel.</div>
			{{#unless this.ok}}
				{{! the FX panel's shipped gate line, reused }}
				<div class="sub-tool-note">Effects apply to
					image layers for now.</div>
			{{/unless}}
			<div class="segmented sub-tool-adjust-grid">
				{{#each ADJUST_PRESETS key="title" as |p|}}
					<button
						type="button"
						class="sub-tool-adjust-cell
							{{if
								this.notOk
								'is-disabled'
							}}"
						disabled={{this.notOk}}
						{{on "click" (fn this.apply p)}}
					>
						<Icon
							@name={{p.icon}}
							class="sub-tool-adjust-icon"
						/>
						{{p.title}}
					</button>
				{{/each}}
			</div>
		</div>
	</template>
}

/* ── MOVE ────────────────────────────────────────────────────────────────── */

class MoveSettings extends Component {
	guides = new TrackedExternal(subscribeGuides, getGuides);
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.guides.unsubscribe();
		this.ts.unsubscribe();
	}

	get asGroup() {
		return this.ts.current.transformAsGroup;
	}

	get nudge() {
		return this.ts.current.move.nudge;
	}

	setNudge = (n: number) =>
		updateToolSettings('move', {
			nudge: Math.min(100, Math.max(1, n)),
		});

	nudgeUp = () => this.setNudge(this.nudge + 1);
	nudgeDown = () => this.setNudge(this.nudge - 1);

	get atMax() {
		return this.nudge >= 100;
	}

	get atMin() {
		return this.nudge <= 1;
	}

	setAsGroup = (asGroup: boolean) => setTransformAsGroup(asGroup);
	toggleSnap = () => toggleGuide('snap');
	toggleGrid = () => toggleGuide('grid');

	<template>
		<div class="sub-tool-pane is-w200">
			{{! Group/Separate: how a multi-selection rotates/scales — shared
				with SELECT (one flag, Ruby's words as the cell labels). }}
			<Row @label="Transform">
				<span class="segmented sub-seg-2">
					<button
						type="button"
						class="sub-seg-cell
							{{if
								this.asGroup
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setAsGroup
								true
							)
						}}
					>Group</button>
					<button
						type="button"
						class="sub-seg-cell
							{{unless
								this.asGroup
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setAsGroup
								false
							)
						}}
					>Separate</button>
				</span>
			</Row>
			{{! Snap/Grid mirror Workspace ▸ Guides (same store, same words) }}
			<Row @label="Snap">
				<Switch
					@checked={{this.guides.current.snap}}
					@onChange={{this.toggleSnap}}
					@label="Snap to guidelines"
				/>
			</Row>
			<Row @label="Grid">
				<Switch
					@checked={{this.guides.current.grid}}
					@onChange={{this.toggleGrid}}
					@label="Show grid"
				/>
			</Row>
			<Row @label="Nudge">
				<span class="sub-stepper">
					<span
						class="sub-stepper-value"
					>{{this.nudge}}
						px</span>
					<StepBtn
						@icon="chevron-up"
						@aria="Increase"
						@onClick={{this.nudgeUp}}
						@disabled={{this.atMax}}
					/>
					<StepBtn
						@icon="chevron-down"
						@aria="Decrease"
						@onClick={{this.nudgeDown}}
						@disabled={{this.atMin}}
					/>
				</span>
			</Row>
		</div>
	</template>
}

/* ── SELECT ──────────────────────────────────────────────────────────────── */

/** SELECT subtool settings (M2-10): lasso = magnetic switch + edge
 *  sensitivity; wand = contiguous/global mode + tolerance. Mode words are
 *  standard graphics vocabulary = functional chrome. */
class SelectToolSettings extends Component<SubSignature> {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
	}

	get s() {
		return this.ts.current.select;
	}

	setMagnetic = (magnetic: boolean) =>
		updateToolSettings('select', { magnetic });

	sensitivityUp = () =>
		updateToolSettings('select', {
			sensitivity: Math.min(100, this.s.sensitivity + 10),
		});

	sensitivityDown = () =>
		updateToolSettings('select', {
			sensitivity: Math.max(0, this.s.sensitivity - 10),
		});

	get sensitivityMaxed() {
		return !this.s.magnetic || this.s.sensitivity >= 100;
	}

	get sensitivityMinned() {
		return !this.s.magnetic || this.s.sensitivity <= 0;
	}

	setWandMode = (wandMode: 'flood' | 'global') =>
		updateToolSettings('select', { wandMode });

	toleranceUp = () =>
		updateToolSettings('select', {
			tolerance: Math.min(255, this.s.tolerance + 8),
		});

	toleranceDown = () =>
		updateToolSettings('select', {
			tolerance: Math.max(0, this.s.tolerance - 8),
		});

	get toleranceMaxed() {
		return this.s.tolerance >= 255;
	}

	get toleranceMinned() {
		return this.s.tolerance <= 0;
	}

	<template>
		<div class="sub-tool-pane is-w200">
			{{#if (eq @sub "lasso")}}
				<Row @label="Magnetic">
					<Switch
						@checked={{this.s.magnetic}}
						@onChange={{this.setMagnetic}}
						@label="Snap to edges"
					/>
				</Row>
				<Row @label="Sensitivity">
					<span class="sub-stepper">
						<span
							class="sub-stepper-value"
						>{{this.s.sensitivity}}</span>
						<StepBtn
							@icon="chevron-up"
							@aria="Increase"
							@onClick={{this.sensitivityUp}}
							@disabled={{this.sensitivityMaxed}}
						/>
						<StepBtn
							@icon="chevron-down"
							@aria="Decrease"
							@onClick={{this.sensitivityDown}}
							@disabled={{this.sensitivityMinned}}
						/>
					</span>
				</Row>
			{{else}}
				<Row @label="Mode">
					<span class="segmented sub-seg-2">
						<button
							type="button"
							class="sub-seg-cell
								{{if
									(eq
										this.s.wandMode
										'flood'
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setWandMode
									"flood"
								)
							}}
						>Contiguous</button>
						<button
							type="button"
							class="sub-seg-cell
								{{if
									(eq
										this.s.wandMode
										'global'
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setWandMode
									"global"
								)
							}}
						>Global</button>
					</span>
				</Row>
				<Row @label="Tolerance">
					<span class="sub-stepper">
						<span
							class="sub-stepper-value"
						>{{this.s.tolerance}}</span>
						<StepBtn
							@icon="chevron-up"
							@aria="Increase"
							@onClick={{this.toleranceUp}}
							@disabled={{this.toleranceMaxed}}
						/>
						<StepBtn
							@icon="chevron-down"
							@aria="Decrease"
							@onClick={{this.toleranceDown}}
							@disabled={{this.toleranceMinned}}
						/>
					</span>
				</Row>
			{{/if}}
		</div>
	</template>
}

/* ── PIECES ──────────────────────────────────────────────────────────────── */

/** Preset menus (Ruby, 2026-07-06: presets + a custom (…) escape hatch —
 *  "a simple editor for simple people"). Values are data; the corner glyphs
 *  are visual.
 *  Corner-preset arias: one or two words each, name the roundedness level,
 *  sharpest → roundest; British spelling. */
const CORNER_PX_PRESETS: PresetOption[] = [
	{ value: 0, cornerR: 0, aria: 'Sharp' },
	{ value: 16, cornerR: 2, aria: 'Subtle' },
	{ value: 48, cornerR: 4.5, aria: 'Round' },
	{ value: 120, cornerR: 7, aria: 'Pill' },
];
const SIDES_PRESETS: PresetOption[] = [3, 4, 5, 6, 8].map((v) => ({
	value: v,
	label: String(v),
}));
const POINTS_PRESETS: PresetOption[] = [4, 5, 6, 8].map((v) => ({
	value: v,
	label: String(v),
}));
const INNER_PRESETS: PresetOption[] = [30, 50, 70].map((v) => ({
	value: v,
	label: `${v}%`,
}));

/** The five primitives — icon cells; labels are the standard shape vocabulary
 *  (functional chrome, the PIECE_LABEL/SHAPE_NAMES words). */
const SHAPE_CELLS: Array<{
	shape: PieceShape;
	label: string;
	/** kebab-case lucide name */
	icon: string;
}> = [
	{ shape: 'rectangle', label: 'Rectangle', icon: 'square' },
	{ shape: 'ellipse', label: 'Ellipse', icon: 'circle' },
	{ shape: 'line', label: 'Line', icon: 'slash' },
	{ shape: 'polygon', label: 'Polygon', icon: 'pentagon' },
	{ shape: 'star', label: 'Star', icon: 'star' },
];

/** The Pieces HEAD sub = the preset-shapes gallery (ratified 2026-07-07):
 *  a grid of vendored Phosphor-fill symbols; picking one arms drag-to-draw
 *  with that symbol. Fill mirrors the primitives bloom's next-shape fill.
 *  Symbol names = standard vocabulary chrome (SHAPE_NAMES precedent). */
class PiecesGalleryGrid extends Component<{ Args: { bordered?: boolean } }> {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
	}

	get symbolId() {
		return this.ts.current.pieces.symbolId;
	}

	pick = (id: string) => {
		updateToolSettings('pieces', { shape: 'symbol', symbolId: id });
		// picking a piece arms the tool
		setActiveSub('pieces', 'pieces');
	};

	<template>
		<div class="sub-tool-gallery {{if @bordered 'is-bordered'}}">
			{{#each PRESET_SHAPES key="id" as |shape|}}
				<button
					type="button"
					title={{shape.name}}
					aria-label={{shape.name}}
					aria-pressed={{if
						(eq this.symbolId shape.id)
						"true"
						"false"
					}}
					class="sub-tool-gallery-cell
						{{if
							(eq
								this.symbolId
								shape.id
							)
							'is-active'
						}}"
					{{on "click" (fn this.pick shape.id)}}
				>
					<svg
						viewBox="0 0 256 256"
						class="sub-tool-gallery-glyph"
						aria-hidden="true"
					>
						<path
							d={{shape.d}}
							fill="currentColor"
						/>
					</svg>
				</button>
			{{/each}}
		</div>
	</template>
}

class PiecesGallerySettings extends Component {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
	}

	get fill() {
		return this.ts.current.pieces.fill;
	}

	setFill = (fill: string) => updateToolSettings('pieces', { fill });

	<template>
		<div class="sub-tool-pane is-w224">
			<PiecesGalleryGrid @bordered={{true}} />
			<Row @label="Fill">
				<ColourCell
					@colour={{this.fill}}
					@onChange={{this.setFill}}
					@aria="Fill colour"
				/>
			</Row>
		</div>
	</template>
}

/** Floating shape menu on the PIECES tool button — the piece selector IS
 *  subtool selection (Ruby), so it hangs off the tool itself. */
export const PiecesFlyout: TOC<{ Args: object }> = <template>
	<div class="sub-tool-pane is-w224">
		<PiecesGalleryGrid />
	</div>
</template>;

/** Floating shape menu on the PRIMITIVES tool button — pick a shape, the
 *  subtool arms itself. Full params stay in the tool-settings module. */
export class PrimitivesFlyout extends Component {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
	}

	get shape() {
		return this.ts.current.pieces.shape;
	}

	pick = (shape: PieceShape) => {
		updateToolSettings('pieces', { shape });
		setActiveSub('pieces', 'primitives');
	};

	<template>
		<div class="sub-tool-flyout">
			{{#each SHAPE_CELLS key="shape" as |cell|}}
				<button
					type="button"
					title={{cell.label}}
					aria-label={{cell.label}}
					aria-pressed={{if
						(eq this.shape cell.shape)
						"true"
						"false"
					}}
					class="sub-tool-flyout-cell
						{{if
							(eq
								this.shape
								cell.shape
							)
							'is-active'
						}}"
					{{on "click" (fn this.pick cell.shape)}}
				>
					<Icon @name={{cell.icon}} />
				</button>
			{{/each}}
		</div>
	</template>
}

/** PIECES ▸ Primitives (M2-7): what the next drag draws. Writes tool-settings;
 *  the drag-to-draw gesture (fabric-canvas) reads it at draw time. */
class PiecesSettings extends Component {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
	}

	get p() {
		return this.ts.current.pieces;
	}

	setShape = (shape: PieceShape) =>
		updateToolSettings('pieces', { shape });
	setFill = (fill: string) => updateToolSettings('pieces', { fill });

	toggleStroke = (on_: boolean) =>
		updateToolSettings('pieces', {
			stroke: on_ ? { colour: '#1d1d1d', width: 2 } : null,
		});

	setStrokeColour = (colour: string) => {
		const stroke = this.p.stroke;
		if (stroke)
			updateToolSettings('pieces', {
				stroke: { ...stroke, colour },
			});
	};

	setStrokeWidth = (width: number) => {
		const stroke = this.p.stroke;
		if (stroke)
			updateToolSettings('pieces', {
				stroke: { ...stroke, width },
			});
	};

	setCornerRadius = (cornerRadius: number) =>
		updateToolSettings('pieces', { cornerRadius });

	setSides = (sides: number) => updateToolSettings('pieces', { sides });

	setStarPoints = (starPoints: number) =>
		updateToolSettings('pieces', { starPoints });

	setInnerRatio = (v: number) =>
		updateToolSettings('pieces', { starInnerRatio: v / 100 });

	get innerPercent() {
		return Math.round(this.p.starInnerRatio * 100);
	}

	<template>
		<div class="sub-tool-pane is-w200">
			<div class="segmented sub-tool-shapes">
				{{#each SHAPE_CELLS key="shape" as |cell|}}
					<button
						type="button"
						title={{cell.label}}
						aria-label={{cell.label}}
						class="sub-seg-cell sub-tool-shape-cell
							{{if
								(eq
									this.p.shape
									cell.shape
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setShape
								cell.shape
							)
						}}
					>
						<Icon @name={{cell.icon}} />
					</button>
				{{/each}}
			</div>
			<Row @label="Fill">
				<ColourCell
					@colour={{this.p.fill}}
					@onChange={{this.setFill}}
					@aria="Fill colour"
				/>
			</Row>
			<Row @label="Stroke">
				<Switch
					@checked={{if this.p.stroke true false}}
					@onChange={{this.toggleStroke}}
					@label="Stroke"
				/>
			</Row>
			{{#if this.p.stroke}}
				<Row @label="Colour">
					<ColourCell
						@colour={{this.p.stroke.colour}}
						@onChange={{this.setStrokeColour}}
						@aria="Stroke colour"
					/>
				</Row>
				<Row @label="Width">
					<Stepper
						@value={{this.p.stroke.width}}
						@onChange={{this.setStrokeWidth}}
						@min={{1}}
						@max={{100}}
						@unit="px"
					/>
				</Row>
			{{/if}}
			{{#if (eq this.p.shape "rectangle")}}
				<Row @label="Corner">
					<PresetRow
						@options={{CORNER_PX_PRESETS}}
						@value={{this.p.cornerRadius}}
						@onChange={{this.setCornerRadius}}
						@min={{0}}
						@max={{250}}
						@unit="px"
					/>
				</Row>
			{{/if}}
			{{#if (eq this.p.shape "polygon")}}
				<Row @label="Sides">
					<PresetRow
						@options={{SIDES_PRESETS}}
						@value={{this.p.sides}}
						@onChange={{this.setSides}}
						@min={{3}}
						@max={{12}}
					/>
				</Row>
			{{/if}}
			{{#if (eq this.p.shape "star")}}
				<Row @label="Points">
					<PresetRow
						@options={{POINTS_PRESETS}}
						@value={{this.p.starPoints}}
						@onChange={{this.setStarPoints}}
						@min={{3}}
						@max={{12}}
					/>
				</Row>
				<Row @label="Inner">
					<PresetRow
						@options={{INNER_PRESETS}}
						@value={{this.innerPercent}}
						@onChange={{this.setInnerRatio}}
						@min={{10}}
						@max={{90}}
						@step={{5}}
						@unit="%"
					/>
				</Row>
			{{/if}}
		</div>
	</template>
}

/** Brush/Pencil size menus — a fat and a fine register (data, not copy). */
const BRUSH_SIZES: PresetOption[] = [8, 16, 24, 48].map((v) => ({
	value: v,
	label: String(v),
}));
const PENCIL_SIZES: PresetOption[] = [2, 4, 6, 12].map((v) => ({
	value: v,
	label: String(v),
}));

/** PIECES ▸ Brush/Pencil (M2-2): the next stroke's colour + size. The stroke
 *  body is a filled outline, so it shares the pieces `fill` setting. */
class FreehandSettings extends Component<SubSignature> {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
	}

	get p() {
		return this.ts.current.pieces;
	}

	get isBrush() {
		return this.args.sub === 'brush';
	}

	get sizes() {
		return this.isBrush ? BRUSH_SIZES : PENCIL_SIZES;
	}

	get size() {
		return this.isBrush ? this.p.brushSize : this.p.pencilSize;
	}

	setFill = (fill: string) => updateToolSettings('pieces', { fill });

	setSize = (v: number) =>
		updateToolSettings(
			'pieces',
			this.isBrush ? { brushSize: v } : { pencilSize: v },
		);

	<template>
		<div class="sub-tool-pane is-w200">
			<Row @label="Colour">
				<ColourCell
					@colour={{this.p.fill}}
					@onChange={{this.setFill}}
					@aria="Stroke colour"
				/>
			</Row>
			<Row @label="Size">
				<PresetRow
					@options={{this.sizes}}
					@value={{this.size}}
					@onChange={{this.setSize}}
					@min={{1}}
					@max={{200}}
					@unit="px"
				/>
			</Row>
		</div>
	</template>
}

/* ── TEXT ────────────────────────────────────────────────────────────────── */

const TEXT_SIZES: PresetOption[] = [16, 24, 48, 96].map((v) => ({
	value: v,
	label: String(v),
}));

/** TEXT (M2): font choice (system stacks + session uploads — Ruby's call, no
 *  bundled files; dropdown per her 2026-07-06 ask), size presets, style
 *  presets. Colour rides the shared current-colour sink. Settings describe
 *  the NEXT text AND live-apply to the active text layer — a font click must
 *  restyle the text you're editing (Ruby, same day). */
class TextToolSettings extends Component {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	#fileInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
	}

	get t() {
		return this.ts.current.text;
	}

	registerInput = modifier((element: HTMLInputElement) => {
		this.#fileInput = element;
		return () => {
			this.#fileInput = null;
		};
	});

	openPicker = () => this.#fileInput?.click();

	/** the selected text layer, when the live patch has somewhere to land */
	#activeText() {
		const id = getActiveLayerId();
		const doc = getSnapshot();
		const layer = doc && id ? findLayer(doc.layers, id) : null;
		if (!id || !layer || layer.kind !== 'text') return null;
		return { id, layer };
	}

	/** patch the selected text layer too, so the bloom edits what you see */
	applyLive = (patch: {
		fontFamily?: string;
		fontSize?: number;
		align?: TextAlign;
	}) => {
		const target = this.#activeText();
		if (target) setTextProps(target.id, patch);
	};

	applyLiveStyle = (style: TextStylePreset) => {
		const target = this.#activeText();
		if (!target) return;
		setTextProps(
			target.id,
			styleFields(
				style,
				textAccent(target.layer),
				target.layer.fontSize,
			),
		);
	};

	setFont = (fontFamily: string) => {
		updateToolSettings('text', { fontFamily });
		this.applyLive({ fontFamily });
	};

	setSize = (fontSize: number) => {
		updateToolSettings('text', { fontSize });
		this.applyLive({ fontSize });
	};

	setAlign = (align: TextAlign) => {
		updateToolSettings('text', { align });
		this.applyLive({ align });
	};

	setStyle = (style: TextStylePreset) => {
		updateToolSettings('text', { style });
		this.applyLiveStyle(style);
	};

	onFile = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		void uploadLocalFont(file).then(this.setFont);
	};

	<template>
		<div class="sub-tool-pane is-w200">
			<Row @label="Font">
				<span class="sub-tool-font">
					<FontSelect
						class="sub-tool-font-select"
						@value={{this.t.fontFamily}}
						@onChange={{this.setFont}}
					/>
					<button
						type="button"
						class="sub-tool-font-upload"
						aria-label="Upload font"
						title="Upload font"
						{{on "click" this.openPicker}}
					>
						<Icon @name="upload" />
					</button>
					<input
						type="file"
						accept=".woff2,.woff,.ttf,.otf"
						class="sub-tool-font-input"
						aria-label="Upload a custom font file"
						{{this.registerInput}}
						{{on "change" this.onFile}}
					/>
				</span>
			</Row>
			<Row @label="Size">
				<PresetRow
					@options={{TEXT_SIZES}}
					@value={{this.t.fontSize}}
					@onChange={{this.setSize}}
					@min={{6}}
					@max={{400}}
					@unit="px"
				/>
			</Row>
			<Row @label="Align">
				<TextAlignRow
					@value={{this.t.align}}
					@onPick={{this.setAlign}}
				/>
			</Row>
			<Row @label="Style">
				<TextStyleRow
					@value={{this.t.style}}
					@onPick={{this.setStyle}}
				/>
			</Row>
		</div>
	</template>
}

/* ── dispatch ────────────────────────────────────────────────────────────── */

/** Stub tools until their settings exist (M2 SELECT). */
const PlaceholderSettings: TOC<{ Args: object }> = <template>
	<div class="sub-tool-pane is-w200">
		<div class="sub-tool-placeholder">Settings arrive with this tool</div>
	</div>
</template>;

export const ToolSettingsBody: TOC<ToolSettingsBodySignature> = <template>
	{{#if (eq @tool "move")}}
		<MoveSettings />
	{{else if (and (eq @tool "pieces") (eq @sub "primitives"))}}
		<PiecesSettings />
	{{else if
		(and
			(eq @tool "pieces")
			(or (eq @sub "brush") (eq @sub "pencil"))
		)
	}}
		<FreehandSettings @sub={{@sub}} />
	{{else if (and (eq @tool "text") (eq @sub "text"))}}
		<TextToolSettings />
	{{else if
		(and
			(eq @tool "select")
			(or (eq @sub "lasso") (eq @sub "wand"))
		)
	}}
		<SelectToolSettings @sub={{@sub}} />
	{{else if (and (eq @tool "pieces") (eq @sub "pieces"))}}
		<PiecesGallerySettings />
	{{else if (eq @tool "adjust")}}
		<AdjustSettings />
	{{else}}
		{{! marquee has no real settings yet (feather/boolean combine are
			post-v1) — it keeps the placeholder like other settings-less
			modes }}
		<PlaceholderSettings />
	{{/if}}
</template>;

/** The active subtool's display label (module `sub` slot). Ids are globally
 *  unique across tools; labels are Ruby's canonical subtool names. */
const SUB_LABELS: Record<string, string> = {
	move: 'Move',
	crop: 'Crop',
	select: 'Select',
	lasso: 'Lasso',
	wand: 'Wand',
	adjust: 'Adjust',
	text: 'Text',
	pieces: 'Pieces',
	primitives: 'Primitives',
	brush: 'Brush',
	pencil: 'Pencil',
};

/** TOOL module body — the active tool's settings as a regular module (bloom /
 *  pin / rail / dock / drag-to-dock), replacing the omnibar's ContextZone. */
export class ToolModuleBody extends Component {
	activeTool = new TrackedExternal(subscribeTool, getActiveTool);
	activeSubs = new TrackedExternal(subscribeTool, getActiveSubs);

	willDestroy() {
		super.willDestroy();
		this.activeTool.unsubscribe();
		this.activeSubs.unsubscribe();
	}

	get sub() {
		return this.activeSubs.current[this.activeTool.current];
	}

	<template>
		<ToolSettingsBody
			@tool={{this.activeTool.current}}
			@sub={{this.sub}}
		/>
	</template>
}

/** Module-header sub slot: names the subtool the body is configuring. */
export class ToolModuleSub extends Component {
	activeTool = new TrackedExternal(subscribeTool, getActiveTool);
	activeSubs = new TrackedExternal(subscribeTool, getActiveSubs);

	willDestroy() {
		super.willDestroy();
		this.activeTool.unsubscribe();
		this.activeSubs.unsubscribe();
	}

	get label() {
		return SUB_LABELS[
			this.activeSubs.current[this.activeTool.current]
		];
	}

	<template>{{this.label}}</template>
}
