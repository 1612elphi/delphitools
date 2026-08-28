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

// body-only; module box supplies the header. writes one-way via layer-ops
// top layer first at every level
// multi-select: plain click single · ⌘/ctrl toggle · shift range from anchor
// primary = last-selected, drives the footer blend/opacity
// group = selection sharing one sibling list; sole group offers ungroup
// drag-reorder crosses parents; group children don't follow mid-drag
// port: @dnd-kit/dom sortable per row on isolated manager, one `dragend` commit

// module-level store → survives module box remounting (bloom/rail/dock)
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

// theme-aware via color-mix on --foreground
const HIDDEN_STRIPE =
	'repeating-linear-gradient(-45deg, color-mix(in oklch, var(--foreground) 9%, transparent) 0 4px, transparent 4px 9px)';

// @dnd-kit/sortable's arrayMove inline → cross-parent projection matches source
function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
	const next = array.slice();
	const [moved] = next.splice(from, 1);
	if (moved !== undefined)
		next.splice(to < 0 ? next.length + to : to, 0, moved);
	return next;
}

// stop sortable's pointerdown drag-sensor firing from a button click
// custom modifier: lint forbids {{on "pointerdown"}}
const stopPointerDown = modifier((element: HTMLElement) => {
	const handler = (event: PointerEvent) => event.stopPropagation();
	element.addEventListener('pointerdown', handler);
	return () => element.removeEventListener('pointerdown', handler);
});

// symbols return a Path2D; caller fills/strokes it, not the ctx path
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

interface LayerThumbSignature {
	Element: HTMLCanvasElement;
	Args: { layer: Layer; inset: boolean };
}

class LayerThumb extends Component<LayerThumbSignature> {
	get hash(): string | null {
		const layer = this.args.layer;
		return layer.kind === 'raster' ? layer.blobHash : null;
	}

	// sig limits redraws to content changes, not every doc emit; freehand
	// points immutable post-commit → length is identity
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
			// specimen = layer's own chars; plate colour as backdrop
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
				// ramp at 22px reads as noise
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
				); // hairlines at thumb scale
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

	// hash/shapeSig args = re-run triggers only; paint reads args.layer
	draw = modifier(
		(
			element: HTMLCanvasElement,
			deps: [string | null, string | null],
		) => {
			void deps; // re-run trigger only
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

	// span not <label>: aria-label already names it; wrapping label would
	// double via the "%" text
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
		input.value = ''; // allow re-picking same file
	};

	onBlendChange = (value: string) => {
		const layer = this.args.activeLayer;
		if (layer) setBlendMode(layer.id, value as BlendMode);
	};

	get blendValue(): BlendMode {
		return this.args.activeLayer?.blendMode ?? 'source-over';
	}

	// vendored selectvalue fallback goes stale on external @value → supply label
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

	// group when selection shares one sibling list; sole group → ungroup.
	// group opacity composes multiplicatively via leafRenderList
	// ponytail: group blend/fx deferred — need isolated group compositing
	// (render target), not a per-leaf flag
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
			{{! labels dropped so "colour dodge" fits }}
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

			<div class="sub-layers-actions">
				<button
					type="button"
					class="sub-layers-upload"
					{{on "click" this.pickFile}}
				>
					<Icon @name="upload" />
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
	// flat id as {{#each}} key → recompute patches in place, no sortable teardown
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

	// shared 4px sensor tuning (same activationConstraint as source's
	// nested dndcontext)
	dndManager = createDndManager();

	@tracked draggingId: string | null = null;

	handleDragStart = (event: DragStartEvent) => {
		this.draggingId = event.operation.source
			? String(event.operation.source.id)
			: null;
	};

	handleDragEnd = (event: DragEndEvent) => {
		this.draggingId = null;
		if (event.canceled) return;
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

		// drop ON collapsed group → append INTO it; children hidden, "between"
		// can't be expressed. doc-order append = topmost child
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

		// cross-parent drop: project flattened list after move (= sortable shift
		// preview), adopt parent of the row below (else row above, else root).
		// that neighbour is always a valid anchor; moveLayer no-ops cycles.
		// ponytail: no depth choice by horizontal drag — neighbour's parent wins;
		// "last child at group bottom" inexpressible, drop between children instead
		const projected = arrayMove(rows, activeIndex, overIndex);
		const parentId =
			projected[overIndex + 1]?.parentId ??
			projected[overIndex - 1]?.parentId ??
			null;
		// display is top-first, doc bottom-first → doc index counts from end
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

	// recursive flatten read twice per render → cached
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
				// keep anchor; clicked end = primary
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

	// row inside selection keeps it (menu acts on all); else becomes selection
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

// leaves only; groups don't count themselves
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
