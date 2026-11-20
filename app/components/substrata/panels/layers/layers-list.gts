import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import {
	DragDropManager,
	PointerActivationConstraints,
	PointerSensor,
} from '@dnd-kit/dom';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/dom';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import LayerRow from 'delphitools-v2/components/substrata/panels/layers/layer-row';
import LayerControls from 'delphitools-v2/components/substrata/panels/layers/layer-controls';
import { layersState } from 'delphitools-v2/components/substrata/panels/layers/state';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	getSelectedLayerIds,
	getSelectionAnchor,
	setActiveLayer,
	setSelection,
	subscribeSelection,
	toggleInSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { openLayerMenu } from 'delphitools-v2/lib/substrata/context-menu';
import {
	moveLayer,
	reorderLayers,
} from 'delphitools-v2/lib/substrata/layer-ops';
import {
	flattenForPanel,
	isGroup,
	type PanelRow,
} from 'delphitools-v2/lib/substrata/layer-tree';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

function dropTarget(
	rows: readonly PanelRow[],
	from: number,
	to: number,
	collapsed: ReadonlySet<string>,
): { id: string; parent: string | null; index: number } | null {
	const moving = rows[from]?.layer;
	const over = rows[to]?.layer;
	if (from === to || !moving || !over) return null;
	if (isGroup(over) && collapsed.has(over.id))
		return {
			id: moving.id,
			parent: over.id,
			index: over.children.length,
		};
	const projected = rows.slice();
	const [moved] = projected.splice(from, 1);
	if (moved) projected.splice(to, 0, moved);
	const parent =
		projected[to + 1]?.parentId ??
		projected[to - 1]?.parentId ??
		null;
	const sibling = (r: PanelRow) =>
		r.parentId === parent && r.layer.id !== moving.id;
	const count = projected.filter(sibling).length;
	const above = projected.slice(0, to).filter(sibling).length;
	return { id: moving.id, parent, index: count - above };
}

function rowManager(): DragDropManager {
	return new DragDropManager({
		sensors: [
			PointerSensor.configure({
				preventActivation: (event) =>
					!(
						event.target instanceof
							Element &&
						event.target.closest(
							'button.sub-layer-main',
						)
					),
				activationConstraints: [
					new PointerActivationConstraints.Distance(
						{
							value: 4,
						},
					),
				],
			}),
		],
	});
}

const focusRow = (id: string) =>
	requestAnimationFrame(() =>
		document
			.querySelector<HTMLElement>(
				`.sub-layer-main[data-layer-id="${id}"]`,
			)
			?.focus(),
	);

interface Entry {
	key: string;
	row: PanelRow;
	index: number;
	selected: boolean;
	active: boolean;
	collapsed: boolean;
	folded: boolean;
	current: boolean;
	dragging: boolean;
}

export default class LayersList extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);
	selection = new TrackedExternal(
		subscribeSelection,
		getSelectedLayerIds,
	);
	manager = rowManager();
	@tracked draggingId: string | null = null;
	@tracked focusId: string | null = null;

	#offStart = this.manager.monitor.addEventListener(
		'dragstart',
		(event: DragStartEvent) => {
			this.draggingId = event.operation.source
				? String(event.operation.source.id)
				: null;
			layersState.folded = null;
		},
	);

	#offEnd = this.manager.monitor.addEventListener(
		'dragend',
		(event: DragEndEvent) => {
			this.draggingId = null;
			const { source, target } = event.operation;
			if (event.canceled || !source || !target) return;
			const ids = this.rows.map((r) => r.layer.id);
			const move = dropTarget(
				this.rows,
				ids.indexOf(String(source.id)),
				ids.indexOf(String(target.id)),
				layersState.collapsed,
			);
			if (move) moveLayer(move.id, move.parent, move.index);
		},
	);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selection.unsubscribe();
		this.#offStart();
		this.#offEnd();
		this.manager.destroy();
	}

	@cached
	get rows(): PanelRow[] {
		return flattenForPanel(
			this.doc.current?.layers ?? [],
			layersState.collapsed,
		);
	}

	get selected() {
		return this.selection.current;
	}

	get activeId() {
		return this.selected[this.selected.length - 1] ?? null;
	}

	get foldedId() {
		const id = layersState.folded;
		return id &&
			!layersState.picking &&
			this.selected.length === 1 &&
			this.selected[0] === id
			? id
			: null;
	}

	get currentId() {
		const ids = this.rows.map((r) => r.layer.id);
		for (const id of [this.focusId, this.activeId])
			if (id && ids.includes(id)) return id;
		return ids[0] ?? null;
	}

	get entries(): Entry[] {
		const selected = this.selected;
		return this.rows.map((row, index) => ({
			key: row.layer.id,
			row,
			index,
			selected: selected.includes(row.layer.id),
			active: row.layer.id === this.activeId,
			collapsed: layersState.collapsed.has(row.layer.id),
			folded: row.layer.id === this.foldedId,
			current: row.layer.id === this.currentId,
			dragging: row.layer.id === this.draggingId,
		}));
	}

	press = (id: string, event: MouseEvent) => {
		this.focusId = id;
		const ids = this.rows.map((r) => r.layer.id);
		if (event.shiftKey) {
			const anchor = getSelectionAnchor();
			const a = anchor ? ids.indexOf(anchor) : -1;
			const c = ids.indexOf(id);
			if (a !== -1 && c !== -1) {
				const range = ids.slice(
					Math.min(a, c),
					Math.max(a, c) + 1,
				);
				setSelection(c < a ? range.reverse() : range, {
					anchor,
				});
				return;
			}
		}
		if (layersState.picking || event.metaKey || event.ctrlKey) {
			const before = this.selected.length;
			toggleInSelection(id);
			const after = getSelectedLayerIds().length;
			if (after < before && after <= 1)
				layersState.picking = false;
			return;
		}
		const opens = this.foldedId !== id;
		setActiveLayer(id);
		layersState.folded = opens ? id : null;
	};

	menu = (id: string, el: HTMLElement, at?: MouseEvent) => {
		if (!this.selected.includes(id)) setActiveLayer(id);
		layersState.menuRow = el;
		const box = el.getBoundingClientRect();
		openLayerMenu(
			at?.clientX ?? box.right,
			at?.clientY ?? box.top,
			[...getSelectedLayerIds()],
		);
	};

	key = (id: string, event: KeyboardEvent) => {
		const ids = this.rows.map((r) => r.layer.id);
		const i = ids.indexOf(id);
		const row = this.rows[i];
		const go = (to: number) => {
			const next =
				ids[Math.max(0, Math.min(ids.length - 1, to))];
			if (!next) return;
			this.focusId = next;
			if (event.shiftKey) {
				const anchor = getSelectionAnchor() ?? id;
				const a = ids.indexOf(anchor);
				const c = ids.indexOf(next);
				const range = ids.slice(
					Math.min(a, c),
					Math.max(a, c) + 1,
				);
				setSelection(c < a ? range.reverse() : range, {
					anchor,
				});
			} else setActiveLayer(next);
			focusRow(next);
		};
		const k = event.key;
		let done = true;
		if ((k === 'ArrowUp' || k === 'ArrowDown') && event.altKey) {
			if (!this.selected.includes(id)) setActiveLayer(id);
			reorderLayers(
				getSelectedLayerIds(),
				k === 'ArrowUp' ? 'forward' : 'backward',
			);
			focusRow(id);
		} else if (k === 'ArrowUp') go(i - 1);
		else if (k === 'ArrowDown') go(i + 1);
		else if (k === 'Home') go(0);
		else if (k === 'End') go(ids.length - 1);
		else if (
			(k === 'ArrowLeft' || k === 'ArrowRight') &&
			row &&
			isGroup(row.layer)
		)
			layersState.setCollapsed(id, k === 'ArrowLeft');
		else if (k === 'ArrowLeft' && row?.parentId)
			go(ids.indexOf(row.parentId));
		else if (k === 'Enter' || k === 'F2') layersState.renaming = id;
		else if (k === 'ContextMenu' || (k === 'F10' && event.shiftKey))
			this.menu(id, event.currentTarget as HTMLElement);
		else done = false;
		if (!done) return;
		event.preventDefault();
		event.stopPropagation();
	};

	<template>
		{{#if this.rows.length}}
			<div class="sub-layers" role="list" aria-label="Layers">
				{{#each this.entries key="key" as |e|}}
					<LayerRow
						@row={{e.row}}
						@index={{e.index}}
						@selected={{e.selected}}
						@active={{e.active}}
						@collapsed={{e.collapsed}}
						@folded={{e.folded}}
						@current={{e.current}}
						@dragging={{e.dragging}}
						@manager={{this.manager}}
						@onPress={{this.press}}
						@onMenu={{this.menu}}
						@onKey={{this.key}}
					/>
					{{#if e.folded}}
						<LayerControls
							class="sub-layer-fold"
							role="listitem"
							@layers={{this.foldLayers
								e.row
							}}
						/>
					{{/if}}
				{{/each}}
			</div>
		{{else}}
			<CanonEmptyRow
				class="sub-layers-empty"
				@text="Add an image to begin, or paste"
			/>
		{{/if}}
	</template>

	foldLayers = (row: PanelRow) => [row.layer];
}
