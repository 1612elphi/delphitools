import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { eq, not } from 'ember-truth-helpers';
import type { DragDropManager } from '@dnd-kit/dom';
import { createDndManager } from 'delphitools-v2/lib/dnd';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/dom';
import sortable from 'delphitools-v2/modifiers/sortable';
import Icon from 'delphitools-v2/components/icon';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import { BLEND_OPTIONS } from 'delphitools-v2/components/substrata/blend-options';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	getActiveLayerId,
	getSelectedLayerIds,
	getSelectionAnchor,
	setActiveLayer,
	setSelection,
	subscribeSelection,
	toggleInSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { openLayerMenu } from 'delphitools-v2/lib/substrata/context-menu';
import {
	deleteLayers,
	duplicateLayers,
	groupLayers,
	moveLayer,
	setBlendMode,
	setOpacity,
	toggleLock,
	toggleVisibility,
	ungroupLayer,
} from 'delphitools-v2/lib/substrata/layer-ops';
import {
	findLayer,
	flattenForPanel,
	isGroup,
	leafRenderList,
	siblingListOf,
} from 'delphitools-v2/lib/substrata/layer-tree';
import type { PanelRow } from 'delphitools-v2/lib/substrata/layer-tree';
import { getRaster } from 'delphitools-v2/lib/substrata/raster-cache';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import {
	polygonPoints,
	shapeDims,
	starPoints,
} from 'delphitools-v2/lib/substrata/shape-geometry';
import {
	presetShape,
	SYMBOL_GRID,
} from 'delphitools-v2/lib/substrata/preset-shapes';
import {
	freehandDims,
	outlineToPathD,
	strokeOutline,
} from 'delphitools-v2/lib/substrata/freehand';
import { resolveFontCss } from 'delphitools-v2/lib/substrata/fonts';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import type {
	BlendMode,
	Layer,
	ShapeParams,
} from 'delphitools-v2/lib/substrata/doc-model';

/**
 * Layers module — the BODY only; the module box supplies the header. Reads the
 * doc + selection stores; edits go through layer-ops (one-way, undoable). Top
 * layer first at every level. Sketch fidelity (modals.html): candy-stripe
 * hidden rows, a selected-arrow marker on the primary, hover-reveal eye, lock
 * toggle, drag-reorder, group rows with a folder thumb + collapse chevron +
 * tree-elbow gutters, and a footer with blend/opacity + Upload / group /
 * duplicate / toss.
 *
 * MULTI-SELECT (M2): plain click = single select · ⌘/Ctrl-click toggles ·
 * shift-click ranges from the anchor over the VISIBLE rows. All selected rows
 * highlight; the primary (last-selected) carries the arrow and drives the
 * footer's blend/opacity. Group = the selection when it shares one sibling
 * list; a single selected group offers Ungroup. Toss deletes the whole
 * selection as one undo step. Drag-reorder works ACROSS parents (into/out of
 * groups; see handleDragEnd's resolution rule); while dragging a group row its
 * children don't visually follow — the drop result is correct.
 *
 * PORT NOTE: the source drives dnd-kit/core's DndContext + useSortable, which
 * hands the row list to a single onDragEnd. This port uses @dnd-kit/dom's
 * Sortable modifier per row on an isolated DragDropManager (mirrors the
 * source's nested DndContext) and commits the reorder from one manager-level
 * `dragend` listener — same resolution rule, different plumbing.
 */

// Collapsed-group ids — tiny module-level store so the state survives the
// module box remounting between bloom/rail/dock (mirrors the source's
// useSyncExternalStore shape via TrackedExternal below).
let collapsedGroups: ReadonlySet<string> = new Set();
const collapseListeners = new Set<() => void>();
const getCollapsed = () => collapsedGroups;
const subscribeCollapsed = (l: () => void) => {
	collapseListeners.add(l);
	return () => {
		collapseListeners.delete(l);
	};
};
function toggleCollapsed(id: string): void {
	const next = new Set(collapsedGroups);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	collapsedGroups = next;
	for (const l of collapseListeners) l();
}

// The candy-stripe for hidden rows — theme-aware via color-mix on --foreground.
const HIDDEN_STRIPE =
	'repeating-linear-gradient(-45deg, color-mix(in oklch, var(--foreground) 9%, transparent) 0 4px, transparent 4px 9px)';

/** dnd-kit/sortable's arrayMove, ported so the cross-parent drop projection
 *  below matches the source exactly without pulling in @dnd-kit/sortable. */
function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
	const next = array.slice();
	const [moved] = next.splice(from, 1);
	if (moved !== undefined)
		next.splice(to < 0 ? next.length + to : to, 0, moved);
	return next;
}

/** A pointerdown handler that only stops propagation — the row's own
 *  sortable drag-sensor listens on pointerdown, so the group/lock/eye
 *  buttons stop it here before it can start a drag from a click on them
 *  (mirrors the source's `onPointerDown={stop}`). A plain custom modifier
 *  rather than `{{on "pointerdown"}}`, which lint forbids. */
const stopPointerDown = modifier((element: HTMLElement) => {
	const handler = (event: PointerEvent) => event.stopPropagation();
	element.addEventListener('pointerdown', handler);
	return () => element.removeEventListener('pointerdown', handler);
});

/** Draw a shape layer's geometry into a thumb context, centred on the origin.
 *  Path-based shapes (symbols) return a Path2D the caller fills/strokes
 *  instead of the ctx's current path. */
function traceShape(
	ctx: CanvasRenderingContext2D,
	params: ShapeParams,
): Path2D | null {
	if (params.shape === 'symbol') {
		const preset = presetShape(params.symbolId);
		const path = new Path2D();
		const m = new DOMMatrix()
			.translate(-params.width / 2, -params.height / 2)
			.scale(
				params.width / SYMBOL_GRID,
				params.height / SYMBOL_GRID,
			);
		path.addPath(new Path2D(preset?.d ?? ''), m);
		return path;
	}
	ctx.beginPath();
	switch (params.shape) {
		case 'rectangle':
			ctx.roundRect(
				-params.width / 2,
				-params.height / 2,
				params.width,
				params.height,
				params.cornerRadius,
			);
			break;
		case 'ellipse':
			ctx.ellipse(
				0,
				0,
				params.rx,
				params.ry,
				0,
				0,
				2 * Math.PI,
			);
			break;
		case 'line':
			ctx.moveTo(-params.length / 2, 0);
			ctx.lineTo(params.length / 2, 0);
			break;
		case 'polygon':
		case 'star': {
			const pts =
				params.shape === 'polygon'
					? polygonPoints(
							params.sides,
							params.radius,
						)
					: starPoints(
							params.points,
							params.outerRadius,
							params.innerRadius,
						);
			pts.forEach((p, i) =>
				i === 0
					? ctx.moveTo(p.x, p.y)
					: ctx.lineTo(p.x, p.y),
			);
			ctx.closePath();
			break;
		}
	}
	return null;
}

/** Small live thumbnail — the cached raster, or a shape's geometry mini-render. */
interface LayerThumbSignature {
	Element: HTMLCanvasElement;
	Args: { layer: Layer; inset: boolean };
}

class LayerThumb extends Component<LayerThumbSignature> {
	get hash(): string | null {
		const layer = this.args.layer;
		return layer.kind === 'raster' ? layer.blobHash : null;
	}

	// Shape/freehand thumbs redraw on any content change (cheap vector draw);
	// the sig keeps redraws to content changes, not every doc emit. Freehand
	// points are immutable post-commit, so length + styling is identity enough.
	get shapeSig(): string | null {
		const layer = this.args.layer;
		if (layer.kind === 'shape')
			return JSON.stringify([
				layer.params,
				layer.fill,
				layer.stroke,
			]);
		if (layer.kind === 'freehand')
			return `${layer.rawPoints.length}|${layer.fill}|${layer.strokeOptions.size}`;
		if (layer.kind === 'text')
			return `${layer.text}|${layer.fill}|${layer.plate?.colour}|${layer.stroke?.colour}|${layer.fontFamily}`;
		return null;
	}

	paint = (element: HTMLCanvasElement) => {
		const ctx = element.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, element.width, element.height);
		const layer = this.args.layer;
		if (layer.kind === 'text') {
			// Specimen thumb: the layer's OWN first characters (data, not copy),
			// plate colour as the backdrop when the style has one.
			if (layer.plate) {
				ctx.fillStyle = layer.plate.colour;
				ctx.beginPath();
				ctx.roundRect(
					1,
					5,
					element.width - 2,
					element.height - 10,
					layer.plate.shape === 'pill' ? 7 : 2,
				);
				ctx.fill();
			}
			const ink =
				layer.fill !== 'transparent'
					? layer.fill
					: (layer.stroke?.colour ?? '#888888');
			ctx.fillStyle = ink;
			ctx.font = `bold 11px ${resolveFontCss(layer.fontFamily)}`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(
				layer.text.slice(0, 2),
				element.width / 2,
				element.height / 2 + 1,
			);
			return;
		}
		if (layer.kind === 'freehand') {
			const dims = freehandDims(
				layer.rawPoints,
				layer.strokeOptions,
			);
			const s =
				(element.width - 6) /
				Math.max(dims.width, dims.height, 1);
			const d = outlineToPathD(
				strokeOutline(
					layer.rawPoints,
					layer.strokeOptions,
				),
			);
			if (!d) return;
			ctx.save();
			ctx.translate(element.width / 2, element.height / 2);
			ctx.scale(s, s);
			ctx.fillStyle = layer.fill;
			ctx.fill(new Path2D(d));
			ctx.restore();
			return;
		}
		if (layer.kind === 'shape') {
			const dims = shapeDims(layer.params);
			const s =
				(element.width - 8) /
				Math.max(dims.width, dims.height, 1);
			ctx.save();
			ctx.translate(element.width / 2, element.height / 2);
			ctx.scale(s, s);
			const symbolPath = traceShape(ctx, layer.params);
			if (layer.params.shape !== 'line') {
				// A gradient previews as its first stop — a real ramp at 22px reads as noise.
				ctx.fillStyle =
					typeof layer.fill === 'string'
						? layer.fill
						: (layer.fill.stops[0]
								?.colour ??
							'#888888');
				if (symbolPath) ctx.fill(symbolPath);
				else ctx.fill();
			}
			if (layer.stroke) {
				ctx.strokeStyle = layer.stroke.colour;
				ctx.lineWidth = Math.max(
					layer.stroke.width,
					1.5 / s,
				); // hairlines stay visible at thumb scale
				if (symbolPath) ctx.stroke(symbolPath);
				else ctx.stroke();
			}
			ctx.restore();
			return;
		}
		const hash = this.hash;
		if (!hash) return;
		const src = getRaster(hash);
		if (!src) return;
		const s = Math.min(
			element.width / src.width,
			element.height / src.height,
		);
		const w = src.width * s;
		const h = src.height * s;
		ctx.drawImage(
			src,
			(element.width - w) / 2,
			(element.height - h) / 2,
			w,
			h,
		);
	};

	// `hash`/`shapeSig` are passed purely as re-run triggers — the source's
	// useEffect dependency array; `paint` reads `this.args.layer` directly.
	draw = modifier(
		(
			element: HTMLCanvasElement,
			deps: [string | null, string | null],
		) => {
			void deps; // re-run trigger only — paint reads `this.args.layer` directly
			this.paint(element);
		},
	);

	<template>
		<canvas
			width="24"
			height="24"
			aria-hidden="true"
			class="sub-layers-thumb {{if @inset 'is-root'}}"
			{{this.draw this.hash this.shapeSig}}
		></canvas>
	</template>
}

interface LayerRowSignature {
	Element: HTMLDivElement;
	Args: {
		row: PanelRow;
		selected: boolean;
		primary: boolean;
		collapsed: boolean;
		dragging: boolean;
		index: number;
		manager: DragDropManager;
		onClick: (event: MouseEvent) => void;
		onContextMenu: (event: MouseEvent) => void;
	};
}

class LayerRow extends Component<LayerRowSignature> {
	get layer(): Layer {
		return this.args.row.layer;
	}

	get isGroupLayer(): boolean {
		return isGroup(this.layer);
	}

	get rowStyle() {
		const parts = [`opacity: ${this.args.dragging ? 0.6 : 1}`];
		if (!this.layer.visible)
			parts.push(`background-image: ${HIDDEN_STRIPE}`);
		return htmlSafe(`${parts.join('; ')};`);
	}

	get nameTitle() {
		return this.layer.name || undefined;
	}

	toggleCollapse = (event: MouseEvent) => {
		event.stopPropagation();
		toggleCollapsed(this.layer.id);
	};

	toggleLockLayer = (event: MouseEvent) => {
		event.stopPropagation();
		toggleLock(this.layer.id);
	};

	toggleVisibilityLayer = (event: MouseEvent) => {
		event.stopPropagation();
		toggleVisibility(this.layer.id);
	};

	<template>
		<div
			class="sub-layers-row {{if @selected 'is-selected'}}"
			style={{this.rowStyle}}
			tabindex="0"
			{{sortable
				id=@row.layer.id
				index=@index
				group="layers"
				manager=@manager
			}}
			{{on "click" @onClick}}
			{{on "contextmenu" @onContextMenu}}
			...attributes
		>
			{{#if @primary}}
				<span
					aria-hidden="true"
					class="sub-layers-row-marker"
				></span>
			{{/if}}

			{{#if @row.depth}}
				<span
					aria-hidden="true"
					class="sub-layers-row-indent"
				>
					{{#each @row.trail as |ancestorLast i|}}
						{{#unless (eq i 0)}}
							<span
								class="sub-layers-row-indent-cell
									{{unless
										ancestorLast
										'has-line'
									}}"
							></span>
						{{/unless}}
					{{/each}}
					<span
						class="sub-layers-row-elbow
							{{if
								@row.lastChild
								'is-last'
							}}"
					>
						<span
							class="sub-layers-row-elbow-vert"
						></span>
						<span
							class="sub-layers-row-elbow-horiz"
						></span>
					</span>
				</span>
			{{/if}}

			{{#if this.isGroupLayer}}
				<span
					class="sub-layers-row-group-icon
						{{if
							(eq @row.depth 0)
							'is-root'
						}}"
				>
					<Icon @name="folder" />
				</span>
			{{else}}
				<LayerThumb
					@layer={{this.layer}}
					@inset={{eq @row.depth 0}}
				/>
			{{/if}}

			<span
				class="sub-layers-row-name
					{{if this.isGroupLayer 'is-group'}}"
				title={{this.nameTitle}}
			>
				{{#if this.layer.name}}
					{{this.layer.name}}
				{{else}}
					<span
						class="sub-layers-row-name-placeholder"
					>Group</span>
				{{/if}}
			</span>

			{{#if this.isGroupLayer}}
				<button
					type="button"
					class="sub-layers-row-collapse"
					aria-label="Collapse group"
					title="Collapse group"
					{{stopPointerDown}}
					{{on "click" this.toggleCollapse}}
				>
					<Icon
						@name="chevron-down"
						class="sub-layers-row-collapse-icon
							{{if
								@collapsed
								'is-collapsed'
							}}"
					/>
				</button>
			{{else}}
				<button
					type="button"
					class="sub-layers-row-lock
						{{if
							this.layer.locked
							'is-locked'
						}}"
					aria-label="Lock layer"
					title="Lock layer"
					{{stopPointerDown}}
					{{on "click" this.toggleLockLayer}}
				>
					<Icon @name="lock" />
				</button>
			{{/if}}

			<button
				type="button"
				class="sub-layers-row-eye
					{{if
						this.layer.visible
						'is-visible'
						'is-hidden'
					}}"
				aria-label="Toggle vis"
				title="Toggle vis"
				{{stopPointerDown}}
				{{on "click" this.toggleVisibilityLayer}}
			>
				<Icon
					@name={{if
						this.layer.visible
						"eye"
						"eye-off"
					}}
				/>
			</button>
		</div>
	</template>
}

/** Opacity field (0–100%) for the primary layer; commits on blur/Enter. */
interface OpacityFieldSignature {
	Args: { layerId: string | null; opacity: number };
}

class OpacityField extends Component<OpacityFieldSignature> {
	@tracked draft: string | null = null;

	get shown(): string {
		return (
			this.draft ??
			String(Math.round(this.args.opacity * 100))
		);
	}

	commit = () => {
		const { draft } = this;
		const { layerId } = this.args;
		if (draft !== null && layerId) {
			const n = parseFloat(draft);
			if (Number.isFinite(n))
				setOpacity(
					layerId,
					Math.max(0, Math.min(100, n)) / 100,
				);
		}
		this.draft = null;
	};

	onInput = (event: Event) => {
		this.draft = (event.target as HTMLInputElement).value;
	};

	onFocus = (event: Event) => {
		(event.target as HTMLInputElement).select();
	};

	onKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter') {
			this.commit();
			(event.target as HTMLInputElement).blur();
		} else if (event.key === 'Escape') {
			this.draft = null;
			(event.target as HTMLInputElement).blur();
		}
	};

	// A plain span, not <label>: the input already names itself via
	// aria-label below — a wrapping <label> would give it a second,
	// conflicting accessible name from the "%" text.
	<template>
		<span class="sub-layers-opacity">
			<input
				class="sub-layers-opacity-input"
				value={{this.shown}}
				disabled={{not @layerId}}
				inputmode="numeric"
				aria-label="Opacity"
				title="Opacity"
				{{on "input" this.onInput}}
				{{on "focus" this.onFocus}}
				{{on "blur" this.commit}}
				{{on "keydown" this.onKeydown}}
			/>
			<span class="sub-layers-opacity-suffix">%</span>
		</span>
	</template>
}

interface ActionBtnSignature {
	Element: HTMLButtonElement;
	Args: {
		icon: string;
		aria: string;
		onClick: () => void;
		disabled?: boolean;
	};
}

const ActionBtn: TOC<ActionBtnSignature> = <template>
	<button
		type="button"
		disabled={{@disabled}}
		aria-label={{@aria}}
		title={{@aria}}
		class="sub-layers-action"
		{{on "click" @onClick}}
	>
		<Icon @name={{@icon}} />
	</button>
</template>;

interface FooterSignature {
	Args: {
		doc: boolean;
		selectedIds: readonly string[];
		activeLayer: Layer | null;
	};
}

class Footer extends Component<FooterSignature> {
	fileInput: HTMLInputElement | null = null;

	registerFileInput = modifier((element: HTMLInputElement) => {
		this.fileInput = element;
		return () => {
			this.fileInput = null;
		};
	});

	pickFile = () => this.fileInput?.click();

	onPick = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void importImageFile(file);
		input.value = ''; // allow re-picking the same file
	};

	onBlendChange = (value: string) => {
		const layer = this.args.activeLayer;
		if (layer) setBlendMode(layer.id, value as BlendMode);
	};

	get blendValue(): BlendMode {
		return this.args.activeLayer?.blendMode ?? 'source-over';
	}

	// the vendored SelectValue's fallback shows the raw value and goes stale
	// when @value changes externally — supply the label, as the inspector does
	get blendLabel(): string {
		return (
			BLEND_OPTIONS.find((o) => o.value === this.blendValue)
				?.label ?? this.blendValue
		);
	}

	get primaryIsGroup(): boolean {
		return (
			!!this.args.activeLayer &&
			isGroup(this.args.activeLayer)
		);
	}

	get blendDisabled(): boolean {
		return !this.args.activeLayer || this.primaryIsGroup;
	}

	get layerId(): string | null {
		return this.args.activeLayer?.id ?? null;
	}

	get opacity(): number {
		return this.args.activeLayer?.opacity ?? 1;
	}

	// Group when the multi-selection shares ONE sibling list; a single selected
	// group flips the button to Ungroup. Group OPACITY is live (composes
	// multiplicatively down the tree via leafRenderList, like visibility).
	// ponytail: group BLEND + FX stay deferred — they need isolated group
	// compositing (a real render target), not a per-leaf flag; the select
	// disables for group primaries until that lands.
	get canGroup(): boolean {
		const { doc, selectedIds } = this.args;
		if (!doc || selectedIds.length < 2) return false;
		const snapshot = getSnapshot();
		const first = selectedIds[0];
		if (!snapshot || first === undefined) return false;
		const list = siblingListOf(snapshot.layers, first);
		return (
			!!list &&
			selectedIds.every((id) => list.some((l) => l.id === id))
		);
	}

	get soleGroup(): Layer | null {
		const layer = this.args.activeLayer;
		return layer &&
			this.args.selectedIds.length === 1 &&
			isGroup(layer)
			? layer
			: null;
	}

	get hasSelection(): boolean {
		return this.args.selectedIds.length > 0;
	}

	onGroup = () => {
		if (this.canGroup) groupLayers(this.args.selectedIds);
	};

	onUngroup = () => {
		const group = this.soleGroup;
		if (group) ungroupLayer(group.id);
	};

	onDuplicate = () => duplicateLayers(this.args.selectedIds);

	onDelete = () => deleteLayers(this.args.selectedIds);

	<template>
		<div class="sub-layers-footer">
			{{! blend + opacity for the primary layer (labels dropped so long mode names fit) }}
			<div class="sub-layers-footer-row">
				<Select
					@value={{this.blendValue}}
					@onValueChange={{this.onBlendChange}}
					@disabled={{this.blendDisabled}}
				>
					<SelectTrigger
						class="sub-layers-blend-trigger"
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
								class="sub-layers-blend-item"
							>{{o.label}}</SelectItem>
						{{/each}}
					</SelectContent>
				</Select>
				<OpacityField
					@layerId={{this.layerId}}
					@opacity={{this.opacity}}
				/>
			</div>

			{{! action bar: big Upload primary + group/ungroup · duplicate · toss }}
			<div class="sub-layers-actions">
				<button
					type="button"
					class="sub-layers-upload"
					{{on "click" this.pickFile}}
				>
					<Icon @name="upload" />
					{{! "Upload" is a standard functional action label (mockup word). }}
					Upload
				</button>
				<input
					type="file"
					accept="image/*"
					class="sub-layers-upload-input"
					aria-label="Upload"
					{{this.registerFileInput}}
					{{on "change" this.onPick}}
				/>
				{{#if this.soleGroup}}
					<ActionBtn
						@icon="folder-minus"
						@aria="Ungroup"
						@onClick={{this.onUngroup}}
					/>
				{{else}}
					<ActionBtn
						@icon="folder-plus"
						@aria="Group layers"
						@disabled={{not this.canGroup}}
						@onClick={{this.onGroup}}
					/>
				{{/if}}
				<ActionBtn
					@icon="copy"
					@aria="Dupe layers"
					@disabled={{not this.hasSelection}}
					@onClick={{this.onDuplicate}}
				/>
				<ActionBtn
					@icon="trash-2"
					@aria="Delete layers"
					@disabled={{not this.hasSelection}}
					@onClick={{this.onDelete}}
				/>
			</div>
		</div>
	</template>
}

interface DisplayRow {
	/** the layer id, flat — the {{#each}} key, so a recompute patches rows in
	 *  place instead of tearing every LayerRow (and its Sortable) down */
	key: string;
	row: PanelRow;
	index: number;
	selected: boolean;
	primary: boolean;
	collapsed: boolean;
	dragging: boolean;
}

export class LayersBody extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);
	selectedIds = new TrackedExternal(
		subscribeSelection,
		getSelectedLayerIds,
	);
	activeId = new TrackedExternal(subscribeSelection, getActiveLayerId);
	collapsed = new TrackedExternal(subscribeCollapsed, getCollapsed);

	// isolated, but with the app's shared 4px sensor tuning — the Next
	// layers panel configures the same activationConstraint on its own
	// nested DndContext
	dndManager = createDndManager();

	@tracked draggingId: string | null = null;

	handleDragStart = (event: DragStartEvent) => {
		this.draggingId = event.operation.source
			? String(event.operation.source.id)
			: null;
	};

	handleDragEnd = (event: DragEndEvent) => {
		this.draggingId = null;
		const { source, target } = event.operation;
		if (!source || !target || source.id === target.id) return;
		const rows = this.rows;
		const activeIndex = rows.findIndex(
			(r) => r.layer.id === String(source.id),
		);
		const overIndex = rows.findIndex(
			(r) => r.layer.id === String(target.id),
		);
		if (activeIndex === -1 || overIndex === -1) return;
		const from = rows[activeIndex];
		const overRow = rows[overIndex];
		if (!from || !overRow) return;
		const overLayer = overRow.layer;

		// Dropping ON a collapsed group appends INTO it (folder-drop; its child
		// rows aren't visible, so "between them" can't be expressed). Doc-order
		// append ⇒ the group's topmost child.
		if (
			isGroup(overLayer) &&
			this.collapsed.current.has(overLayer.id)
		) {
			moveLayer(
				from.layer.id,
				overLayer.id,
				overLayer.children.length,
			);
			return;
		}

		// CROSS-PARENT DROP RESOLUTION: project the flattened display list after
		// the move (exactly what the sortable shift previewed), then adopt the
		// parent of the row now BELOW the dragged row (else the row above, else
		// root). In a flattened tree that neighbour is always a valid anchor: the
		// row below any position is a first child, a sibling, or an ancestor's
		// sibling — so its parent is a legal parent at this spot. Same-parent
		// reorders fall out of the same rule. moveLayer guards the cycle case
		// (dropping a group over its own descendant rows no-ops).
		// ponytail: no horizontal-drag depth choice (Notion-style) — the
		// neighbour's parent wins, so "very last child of a group" at the group's
		// bottom boundary isn't expressible; drop between its children or onto it
		// collapsed instead.
		const projected = arrayMove(rows, activeIndex, overIndex);
		const parentId =
			projected[overIndex + 1]?.parentId ??
			projected[overIndex - 1]?.parentId ??
			null;
		// display position among the target's child rows → doc index (display is
		// top-first, doc bottom-first, so the doc index counts from the end)
		const isSibling = (r: PanelRow) =>
			r.parentId === parentId && r.layer.id !== from.layer.id;
		const siblingCount = projected.filter(isSibling).length;
		const before = projected
			.slice(0, overIndex)
			.filter(isSibling).length;
		moveLayer(from.layer.id, parentId, siblingCount - before);
	};

	#offDragStart = this.dndManager.monitor.addEventListener(
		'dragstart',
		this.handleDragStart,
	);
	#offDragEnd = this.dndManager.monitor.addEventListener(
		'dragend',
		this.handleDragEnd,
	);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selectedIds.unsubscribe();
		this.activeId.unsubscribe();
		this.collapsed.unsubscribe();
		this.#offDragStart();
		this.#offDragEnd();
		this.dndManager.destroy();
	}

	get layers(): Layer[] {
		return this.doc.current?.layers ?? [];
	}

	// a recursive flatten read by hasRows AND displayRows each render
	@cached
	get rows(): PanelRow[] {
		return flattenForPanel(this.layers, this.collapsed.current);
	}

	get rowIds(): string[] {
		return this.rows.map((r) => r.layer.id);
	}

	get activeLayer(): Layer | null {
		const doc = this.doc.current;
		const activeId = this.activeId.current;
		return doc && activeId ? findLayer(doc.layers, activeId) : null;
	}

	get hasDoc(): boolean {
		return this.doc.current !== null;
	}

	get hasRows(): boolean {
		return this.rows.length > 0;
	}

	get displayRows(): DisplayRow[] {
		const selectedIds = this.selectedIds.current;
		const activeId = this.activeId.current;
		const collapsed = this.collapsed.current;
		const draggingId = this.draggingId;
		return this.rows.map((row, index) => ({
			key: row.layer.id,
			row,
			index,
			selected: selectedIds.includes(row.layer.id),
			primary: row.layer.id === activeId,
			collapsed: collapsed.has(row.layer.id),
			dragging: row.layer.id === draggingId,
		}));
	}

	onRowClick = (id: string, event: MouseEvent) => {
		if (event.shiftKey) {
			const anchor = getSelectionAnchor();
			const rowIds = this.rowIds;
			const ai = anchor ? rowIds.indexOf(anchor) : -1;
			const ci = rowIds.indexOf(id);
			if (ai !== -1 && ci !== -1) {
				const [lo, hi] = ai < ci ? [ai, ci] : [ci, ai];
				// keep the anchor; the clicked end becomes primary (range reads that way)
				const range = rowIds.slice(lo, hi + 1);
				setSelection(
					ci < ai ? [...range].reverse() : range,
					{ anchor },
				);
				return;
			}
		}
		if (event.metaKey || event.ctrlKey) {
			toggleInSelection(id);
			return;
		}
		setActiveLayer(id);
	};

	// Right-click → the shared layer context menu; a row inside the selection
	// keeps it (menu acts on all), any other row becomes the selection.
	onRowContextMenu = (id: string, event: MouseEvent) => {
		event.preventDefault();
		const selectedIds = this.selectedIds.current;
		if (selectedIds.includes(id)) {
			openLayerMenu(
				event.clientX,
				event.clientY,
				selectedIds,
			);
		} else {
			setActiveLayer(id);
			openLayerMenu(event.clientX, event.clientY, [id]);
		}
	};

	<template>
		<div class="sub-layers">
			<div class="sub-layers-scroll">
				{{#if this.hasRows}}
					{{#each
						this.displayRows key="key"
						as |entry|
					}}
						<LayerRow
							@row={{entry.row}}
							@selected={{entry.selected}}
							@primary={{entry.primary}}
							@collapsed={{entry.collapsed}}
							@dragging={{entry.dragging}}
							@index={{entry.index}}
							@manager={{this.dndManager}}
							@onClick={{fn
								this.onRowClick
								entry.row.layer.id
							}}
							@onContextMenu={{fn
								this.onRowContextMenu
								entry.row.layer.id
							}}
						/>
					{{/each}}
				{{else}}
					<div class="sub-layers-empty">Drop,
						paste, or upload an image to
						begin</div>
				{{/if}}
			</div>
			<Footer
				@doc={{this.hasDoc}}
				@selectedIds={{this.selectedIds.current}}
				@activeLayer={{this.activeLayer}}
			/>
		</div>
	</template>
}

/** Leaf-layer count for the module box header (groups don't count themselves). */
export class LayersCount extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
	}

	get count(): number {
		const doc = this.doc.current;
		return doc ? leafRenderList(doc.layers).length : 0;
	}

	<template>{{this.count}}</template>
}
