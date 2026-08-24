import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { cssColour } from 'delphitools-v2/components/colour-field';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { and, eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import draggable from 'delphitools-v2/modifiers/draggable';
import Rail from 'delphitools-v2/components/substrata/omnibar/rail';
import { MODULES } from 'delphitools-v2/components/substrata/omnibar/modules';
import {
	PiecesFlyout,
	PrimitivesFlyout,
} from 'delphitools-v2/components/substrata/omnibar/tool-settings';
import {
	getColour,
	subscribeColour,
} from 'delphitools-v2/lib/substrata/colour-store';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	getOmnibarEdge,
	getRailEdge,
	subscribeDock,
	type Edge,
	type RailEdge,
} from 'delphitools-v2/lib/substrata/dock-pref';
import type { DockDrag } from 'delphitools-v2/lib/substrata/drag-dock';
import { fontLabel } from 'delphitools-v2/lib/substrata/fonts';
import { fxDisplayLabel } from 'delphitools-v2/lib/substrata/fx-ops';
import { findLayer } from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getPinned,
	subscribePins,
	togglePin,
	type ModuleId,
} from 'delphitools-v2/lib/substrata/pin-pref';
import {
	getActiveLayerId,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import {
	getActiveSubs,
	getActiveTool,
	setActiveSub,
	subscribeTool,
	type ToolId,
} from 'delphitools-v2/lib/substrata/tool';
import {
	getToolSettings,
	subscribeToolSettings,
	type PieceShape,
	type ToolSettings,
} from 'delphitools-v2/lib/substrata/tool-settings';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

// §8. four units: tools · tool settings (inline) · panels · colour. flush
// full-height buttons, highlight touches bar edges (no padding halo). panel
// triggers toggle on click — no hover-peek; module opens in rail or floats
// where last dragged. dockable by dragging the grip.

interface SubDef {
	id: string;
	label: string;
	key: string;
	/** lucide name */
	icon: string;
}

interface ToolDef {
	id: ToolId;
	// ids = tool.ts activeSubs vocabulary; labels = canonical subtool names
	subs: SubDef[];
}

// photoshop-adjacent keys (V C M L W U B); plain keypress, ignored in inputs
const TOOLS: ToolDef[] = [
	{
		id: 'move',
		subs: [
			{ id: 'move', label: 'Move', key: 'V', icon: 'move' },
			{ id: 'crop', label: 'Crop', key: 'C', icon: 'crop' },
		],
	},
	{
		id: 'select',
		subs: [
			{
				id: 'select',
				label: 'Select',
				key: 'M',
				icon: 'box-select',
			},
			{
				id: 'lasso',
				label: 'Lasso',
				key: 'L',
				icon: 'lasso',
			},
			{ id: 'wand', label: 'Wand', key: 'W', icon: 'wand-2' },
		],
	},
	{
		id: 'adjust',
		// no subtools: planned filters/colour split collapsed once both
		// landed in the one filters[] pipeline
		subs: [
			{
				id: 'adjust',
				label: 'Adjust',
				key: 'A',
				icon: 'sliders-horizontal',
			},
		],
	},
	{
		id: 'text',
		subs: [
			{ id: 'text', label: 'Text', key: 'T', icon: 'type' },
			// bezier/pen cut from v1; PathLayer stays ratified schema
			// (text-on-path, its main consumer, already cut)
		],
	},
	{
		id: 'pieces',
		subs: [
			{
				id: 'primitives',
				label: 'Primitives',
				key: 'U',
				icon: 'square',
			},
			{
				id: 'pieces',
				label: 'Pieces',
				key: 'P',
				icon: 'shapes',
			},
			{
				id: 'brush',
				label: 'Brush',
				key: 'B',
				icon: 'brush',
			},
			{
				id: 'pencil',
				label: 'Pencil',
				key: 'N',
				icon: 'pencil',
			},
		],
	},
];

const PANELS: ModuleId[] = [
	'effects',
	'layers',
	'inspector',
	'looks',
	'arrange',
];

const OMNIBAR_DRAG: DockDrag = { kind: 'omnibar' };

function isSubActive(
	activeTool: ToolId,
	activeSubs: Readonly<Record<ToolId, string>>,
	tool: ToolId,
	sub: string,
): boolean {
	return activeTool === tool && activeSubs[tool] === sub;
}

// shape choice IS subtool selection for these two
function hasFlyout(sub: string): boolean {
	return sub === 'primitives' || sub === 'pieces';
}

function isPinned(pinned: readonly ModuleId[], id: ModuleId): boolean {
	return pinned.includes(id);
}

function moduleTitle(id: ModuleId): string {
	return MODULES[id].title;
}

function moduleIcon(id: ModuleId): string {
	return MODULES[id].icon ?? '';
}

const Tag: TOC<{ Args: { value: string } }> = <template>
	<span class="sub-omni-tag">{{@value}}</span>
</template>;

const PIECE_LABEL: Record<PieceShape, string> = {
	rectangle: 'Rectangle',
	ellipse: 'Ellipse',
	line: 'Line',
	polygon: 'Polygon',
	star: 'Star',
	symbol: 'Symbol', // chip = generic kind; layer names preset
};

// live chips: doc/selection chips track stores, rest read tool-settings
function readoutChips(
	tool: ToolId,
	sub: string,
	layer: Layer | null,
	ts: ToolSettings,
): string[] {
	switch (tool) {
		case 'move':
			return layer
				? [
						`X ${Math.round(layer.transform.x)}`,
						`Y ${Math.round(layer.transform.y)}`,
					]
				: [];
		case 'select': {
			const s = ts.select;
			if (sub === 'lasso')
				return [`Sensitivity ${s.sensitivity}%`];
			if (sub === 'wand') return [`Tolerance ${s.tolerance}`];
			return [
				s.mode === 'touch' ? 'Touch' : 'Cover',
				ts.transformAsGroup ? 'Group' : 'Separate',
			];
		}
		case 'adjust':
			return layer
				? [
						...layer.filters.map((f) =>
							fxDisplayLabel(
								'filters',
								f,
							),
						),
						...layer.effects.map((f) =>
							fxDisplayLabel(
								'effects',
								f,
							),
						),
					]
				: [];
		case 'text':
			return [
				fontLabel(ts.text.fontFamily),
				`${ts.text.fontSize} px`,
			];
		case 'pieces': {
			const p = ts.pieces;
			if (sub === 'brush') return [`${p.brushSize} px`];
			if (sub === 'pencil') return [`${p.pencilSize} px`];
			const extra =
				p.shape === 'polygon'
					? [`${p.sides} sides`]
					: p.shape === 'star'
						? [`${p.starPoints} points`]
						: p.shape === 'rectangle' &&
							  p.cornerRadius > 0
							? [
									`R ${p.cornerRadius}`,
								]
							: [];
			return [PIECE_LABEL[p.shape], ...extra];
		}
	}
}

// wrapper padding spans trigger→bloom gap as hover bridge; idle stays
// click-transparent
const Bloom: TOC<{
	Args: { edge: Edge; cross: 'center' | 'end' };
	Blocks: { default: [] };
}> = <template>
	<div class="sub-omni-bloom is-{{@edge}} is-cross-{{@cross}}">
		<div class="sub-omni-bloom-inner">{{yield}}</div>
	</div>
</template>;

const SubButton: TOC<{
	Args: {
		tool: ToolId;
		sub: SubDef;
		vertical: boolean;
		active: boolean;
	};
}> = <template>
	<button
		type="button"
		class="sub-omni-tool
			{{if @vertical 'is-vertical'}}
			{{if @active 'is-active'}}"
		title={{@sub.label}}
		aria-label={{@sub.label}}
		aria-pressed={{if @active "true" "false"}}
		{{on "click" (fn setActiveSub @tool @sub.id)}}
	>
		<Icon @name={{@sub.icon}} class="sub-omni-tool-glyph" />
		<span class="sub-omni-key">{{@sub.key}}</span>
	</button>
</template>;

const OmnibarGrip: TOC<{ Args: { vertical: boolean } }> = <template>
	<span
		class="sub-omni-grip sub-grip cursor-grab
			{{if @vertical 'is-vertical'}}"
		aria-label="Move toolbar"
		title="Move toolbar"
	>
		<Icon @name="grip-vertical" class="sub-omni-grip-glyph" />
	</span>
</template>;

const PanelButton: TOC<{
	Args: {
		id: ModuleId;
		vertical: boolean;
		pinned: boolean;
	};
}> = <template>
	<div class="sub-omni-trigger">
		<button
			type="button"
			class="sub-omni-panel-btn
				{{if @vertical 'is-vertical'}}
				{{if @pinned 'is-pinned'}}"
			{{! module title = tooltip; raw ids meant nothing (review #6) }}
			aria-label={{moduleTitle @id}}
			title={{moduleTitle @id}}
			{{on "click" (fn togglePin @id)}}
		>
			<Icon
				@name={{moduleIcon @id}}
				class="sub-omni-panel-glyph"
			/>
		</button>
	</div>
</template>;

// own unit; same peek/pin semantics as every panelbutton
class ColourButton extends Component<{ Args: { pinned: boolean } }> {
	colour = new TrackedExternal(subscribeColour, getColour);

	willDestroy() {
		super.willDestroy();
		this.colour.unsubscribe();
	}

	get swatchStyle() {
		return htmlSafe(
			`background-color: ${cssColour(this.colour.current.hex)}; box-shadow: inset 0 0 0 1px rgba(255,255,255,.4)`,
		);
	}

	togglePinned = () => togglePin('colour');

	<template>
		<div class="sub-omni-unit pointer-events-auto border shadow-lg">
			<button
				type="button"
				class="sub-omni-swatch-btn size-12
					{{if @pinned 'is-pinned'}}"
				aria-label={{moduleTitle "colour"}}
				title={{moduleTitle "colour"}}
				{{on "click" this.togglePinned}}
			>
				<span
					class="sub-omni-swatch"
					style={{this.swatchStyle}}
				></span>
			</button>
		</div>
	</template>
}

// live chips capped at two; click pins the tool module; vertical docks icon-only
class ToolSettingsUnit extends Component<{
	Args: { vertical: boolean; pinned: boolean };
}> {
	doc = new TrackedExternal(subscribe, getSnapshot);
	layerId = new TrackedExternal(subscribeSelection, getActiveLayerId);
	toolSettings = new TrackedExternal(
		subscribeToolSettings,
		getToolSettings,
	);
	activeTool = new TrackedExternal(subscribeTool, getActiveTool);
	activeSubs = new TrackedExternal(subscribeTool, getActiveSubs);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.layerId.unsubscribe();
		this.toolSettings.unsubscribe();
		this.activeTool.unsubscribe();
		this.activeSubs.unsubscribe();
	}

	get layer() {
		const doc = this.doc.current;
		const id = this.layerId.current;
		return doc && id ? findLayer(doc.layers, id) : null;
	}

	get sub() {
		return this.activeSubs.current[this.activeTool.current];
	}

	get chips() {
		return readoutChips(
			this.activeTool.current,
			this.sub,
			this.layer,
			this.toolSettings.current,
		).slice(0, 2);
	}

	get subDef(): SubDef | undefined {
		const tool = TOOLS.find(
			(t) => t.id === this.activeTool.current,
		);
		return (
			tool?.subs.find((x) => x.id === this.sub) ??
			tool?.subs[0]
		);
	}

	togglePinned = () => togglePin('tool');

	<template>
		<div class="sub-omni-unit pointer-events-auto border shadow-lg">
			<button
				type="button"
				data-tool-unit="true"
				class="sub-omni-tool-btn
					{{if @vertical 'is-vertical'}}
					{{if @pinned 'is-pinned'}}"
				aria-label={{moduleTitle "tool"}}
				title={{moduleTitle "tool"}}
				{{on "click" this.togglePinned}}
			>
				<span class="sub-omni-tool-icon">
					{{#if this.subDef}}
						<Icon
							@name={{this.subDef.icon}}
							class="sub-omni-tool-glyph"
						/>
					{{/if}}
				</span>
				{{#unless @vertical}}
					<span class="sub-omni-tool-meta">
						<span
							class="sub-omni-tool-name"
						>
							{{#if this.subDef}}
								{{this.subDef.label}}
							{{/if}}
						</span>
						{{#each
							this.chips key="@index"
							as |c|
						}}
							<Tag @value={{c}} />
						{{/each}}
					</span>
				{{/unless}}
			</button>
		</div>
	</template>
}

const Barrow: TOC<{
	Args: {
		edge: Edge;
		vertical: boolean;
		alignEnd: boolean;
		activeTool: ToolId;
		activeSubs: Readonly<Record<ToolId, string>>;
		pinned: readonly ModuleId[];
	};
}> = <template>
	<div
		class="sub-omni-barrow pointer-events-none
			{{if @vertical 'is-vertical'}}
			{{if @alignEnd 'is-align-end' 'is-align-start'}}"
	>
		<div
			class="sub-omni-box pointer-events-auto border shadow-lg
				{{if @vertical 'is-vertical flex-col'}}"
			{{draggable
				id="dock-omnibar"
				data=OMNIBAR_DRAG
				handle=".sub-grip"
			}}
		>
			<OmnibarGrip @vertical={{@vertical}} />
			{{#each TOOLS key="id" as |tool ti|}}
				{{#unless (eq ti 0)}}
					<span
						aria-hidden="true"
						class="sub-omni-sep
							{{if
								@vertical
								'is-vertical'
							}}"
					></span>
				{{/unless}}
				{{#each tool.subs key="id" as |sub|}}
					{{#if (hasFlyout sub.id)}}
						<div class="sub-omni-trigger">
							<SubButton
								@tool={{tool.id}}
								@sub={{sub}}
								@vertical={{@vertical}}
								@active={{isSubActive
									@activeTool
									@activeSubs
									tool.id
									sub.id
								}}
							/>
							<Bloom
								@edge={{@edge}}
								@cross="center"
							>
								{{#if
									(eq
										sub.id
										"primitives"
									)
								}}
									<PrimitivesFlyout
									/>
								{{else}}
									<PiecesFlyout
									/>
								{{/if}}
							</Bloom>
						</div>
					{{else}}
						<SubButton
							@tool={{tool.id}}
							@sub={{sub}}
							@vertical={{@vertical}}
							@active={{isSubActive
								@activeTool
								@activeSubs
								tool.id
								sub.id
							}}
						/>
					{{/if}}
				{{/each}}
			{{/each}}
		</div>

		<ToolSettingsUnit
			@vertical={{@vertical}}
			@pinned={{isPinned @pinned "tool"}}
		/>

		<div
			class="sub-omni-box pointer-events-auto border shadow-lg
				{{if @vertical 'is-vertical flex-col'}}"
		>
			{{#each PANELS key="@identity" as |panel|}}
				<PanelButton
					@id={{panel}}
					@vertical={{@vertical}}
					@pinned={{isPinned @pinned panel}}
				/>
			{{/each}}
		</div>

		<ColourButton @pinned={{isPinned @pinned "colour"}} />
	</div>
</template>;

export default class Omnibar extends Component {
	activeTool = new TrackedExternal(subscribeTool, getActiveTool);
	activeSubs = new TrackedExternal(subscribeTool, getActiveSubs);
	edgeStore = new TrackedExternal(subscribeDock, getOmnibarEdge);
	pinnedStore = new TrackedExternal(subscribePins, getPinned);
	railEdgeStore = new TrackedExternal(subscribeDock, getRailEdge);

	willDestroy() {
		super.willDestroy();
		this.activeTool.unsubscribe();
		this.activeSubs.unsubscribe();
		this.edgeStore.unsubscribe();
		this.pinnedStore.unsubscribe();
		this.railEdgeStore.unsubscribe();
	}

	get edge(): Edge {
		return this.edgeStore.current;
	}

	get railEdge(): RailEdge {
		return this.railEdgeStore.current;
	}

	get vertical() {
		return this.edge === 'left' || this.edge === 'right';
	}

	get railFirst() {
		return this.edge === 'bottom' || this.edge === 'right';
	}

	// "follow" → adjacent in dock; own edge otherwise. if that edge IS the
	// omnibar's, dock adjacent (stacked) not overlapping
	get effRailEdge(): Edge {
		return this.railEdge === 'follow' ? this.edge : this.railEdge;
	}

	get railVertical() {
		return (
			this.effRailEdge === 'left' ||
			this.effRailEdge === 'right'
		);
	}

	get inDock() {
		return this.effRailEdge === this.edge;
	}

	// different-sized units align to the docked edge (bottom/right end,
	// top/left start)
	get alignEnd() {
		return this.vertical
			? this.edge === 'right'
			: this.edge === 'bottom';
	}

	shortcuts = modifier(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const t = e.target as HTMLElement | null;
			if (
				t &&
				(t.isContentEditable ||
					/^(INPUT|TEXTAREA|SELECT)$/.test(
						t.tagName,
					))
			)
				return;
			for (const tool of TOOLS) {
				const sub = tool.subs.find(
					(x) =>
						x.key.toLowerCase() ===
						e.key.toLowerCase(),
				);
				if (sub) {
					e.preventDefault();
					setActiveSub(tool.id, sub.id);
					return;
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	<template>
		<div
			class="sub-omni-dock pointer-events-none absolute z-40 is-{{this.edge}}"
			{{this.shortcuts}}
		>
			{{#if (and this.inDock this.railFirst)}}
				<Rail @vertical={{this.railVertical}} />
			{{/if}}
			<Barrow
				@edge={{this.edge}}
				@vertical={{this.vertical}}
				@alignEnd={{this.alignEnd}}
				@activeTool={{this.activeTool.current}}
				@activeSubs={{this.activeSubs.current}}
				@pinned={{this.pinnedStore.current}}
			/>
			{{#if (and this.inDock (not this.railFirst))}}
				<Rail @vertical={{this.railVertical}} />
			{{/if}}
		</div>
		{{! rail decoupled — own edge }}
		{{#unless this.inDock}}
			<div
				class="sub-omni-rail-dock pointer-events-none absolute z-30 is-{{this.effRailEdge}}"
			>
				<Rail @vertical={{this.railVertical}} />
			</div>
		{{/unless}}
	</template>
}
