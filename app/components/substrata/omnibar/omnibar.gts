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

/**
 * Omnibar (§8) — floating tool + panel cockpit, dockable to any edge (drag the
 * grip). UX pass (Ruby, 2026-07-08): FOUR separated units with space between —
 * [tools] [tool settings, inline + always visible] [panels/more] [colour].
 * Every subtool is a flat, FLUSH full-height button (a selected tool's
 * highlight touches the bar edges — no padding halo); no hover fans. Panel
 * triggers TOGGLE their module on click (round 3 — hover-peek is gone; a
 * module opens in the rail, or floats where it was last dragged); the
 * colour unit is one big full-height swatch.
 */

interface SubDef {
	id: string;
	label: string;
	key: string;
	/** kebab-case lucide name */
	icon: string;
}

interface ToolDef {
	id: ToolId;
	/** the tool's subtools, all rendered flat, each with its OWN shortcut key
	 *  (badged on the button). Ids are internal (tool.ts activeSubs
	 *  vocabulary); labels are Ruby's canonical subtool names (authored
	 *  chrome, not a copy gap). */
	subs: SubDef[];
}

// Every subtool has a direct key (Ruby, 2026-07-08) — Photoshop-adjacent
// letters where they exist (V move · C crop · M marquee · L lasso · W wand ·
// U shapes · B brush). Plain keypresses, ignored while typing.
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
		// No subtools (Ruby, 2026-07-03): the planned FILTERS/COLOUR split
		// collapsed once both families landed in the ONE filters[] pipeline —
		// a single ADJUST button fronts the whole FX mode.
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
			// Bezier/pen CUT from v1 (Ruby 2026-07-07) — PathLayer stays
			// ratified schema for later; text-on-path (its main consumer)
			// was already cut.
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

// Trigger order; each button's glyph comes from MODULES[id].icon. `arrange`
// was the overflow bar's only occupant — pulled in (Ruby).
const PANELS: ModuleId[] = [
	'effects',
	'layers',
	'inspector',
	'looks',
	'arrange',
];

const OMNIBAR_DRAG: DockDrag = { kind: 'omnibar' };

/* ── template helpers ────────────────────────────────────────────────────── */

function isSubActive(
	activeTool: ToolId,
	activeSubs: Readonly<Record<ToolId, string>>,
	tool: ToolId,
	sub: string,
): boolean {
	return activeTool === tool && activeSubs[tool] === sub;
}

// pieces/primitives carry a floating shape menu — the shape choice IS subtool
// selection (Ruby)
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

/* ── building blocks ─────────────────────────────────────────────────────── */

const Tag: TOC<{ Args: { value: string } }> = <template>
	<span class="sub-omni-tag">{{@value}}</span>
</template>;

const PIECE_LABEL: Record<PieceShape, string> = {
	rectangle: 'Rectangle',
	ellipse: 'Ellipse',
	line: 'Line',
	polygon: 'Polygon',
	star: 'Star',
	symbol: 'Symbol', // chip shows the generic kind; the layer names the preset
};

/**
 * Live read-out chips per tool (Ruby's spec): MOVE = the selection's X/Y ·
 * SELECT = the active subtool's mode settings (marquee touch/cover +
 * group/separate, lasso sensitivity, wand tolerance) · ADJUST = the layer's
 * stack labels · TEXT = font + size · PIECES = the chosen shape. All live —
 * doc/selection chips track the stores; the rest read tool-settings, so they
 * update the moment the M2 tools start writing it.
 */
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

/** Hover-peek bloom that rises toward the canvas from the docked edge. The
 *  wrapper's padding spans the trigger→bloom gap and becomes a hover bridge
 *  while the trigger group is hovered (the classic hover-gap problem); idle,
 *  it stays click-transparent. */
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

/** Omnibar drag grip (dnd-kit) — drag the whole bar onto an edge drop zone. */
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
			{{! module title doubles as the hover tooltip (raw ids told a
				mouse user nothing — clarity review #6) }}
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

/** The colour trigger — its own UNIT: one big full-height live swatch.
 *  Same peek/pin semantics as every PanelButton, just louder. */
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

/**
 * The tool-settings UNIT — the contextual trigger: the active subtool's icon,
 * name, and up to two live chips summarising its settings at a glance. Click
 * pins the TOOL module (the full settings body). Uniform bar height; vertical
 * docks show the icon only.
 */
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

/** The four omnibar units: tools · tool settings · panels · colour. */
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
		{{! 1 · tools — flat, flush: a selected tool fills the bar's full
			cross section (no padding halo) }}
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

		{{! 2 · tool settings — the contextual trigger (Ruby's keeper shape):
			active subtool's icon + name + a couple of live setting chips at a
			glance; pins the TOOL module like every panel trigger }}
		<ToolSettingsUnit
			@vertical={{@vertical}}
			@pinned={{isPinned @pinned "tool"}}
		/>

		{{! 3 · panels ("more") — flush triggers }}
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

		{{! 4 · colour — one big full-height swatch, its own unit }}
		<ColourButton @pinned={{isPinned @pinned "colour"}} />
	</div>
</template>;

/* ── the omnibar ─────────────────────────────────────────────────────────── */

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

	// Rail position: "follow" → adjacent to the omnibar (in the dock); otherwise
	// its own edge, independent. If that edge IS the omnibar's edge, dock it
	// adjacent too (stacked) rather than as a separate container that would
	// overlap.
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

	// units of different sizes align to the DOCKED edge (settings grows away
	// from it) — bottom/right docks align end, top/left align start
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
		{{! rail decoupled from the omnibar — its own edge }}
		{{#unless this.inDock}}
			<div
				class="sub-omni-rail-dock pointer-events-none absolute z-30 is-{{this.effRailEdge}}"
			>
				<Rail @vertical={{this.railVertical}} />
			</div>
		{{/unless}}
	</template>
}
