import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type { DragDropManager } from '@dnd-kit/dom';
import sortable from 'delphitools-v2/modifiers/sortable';
import { IconSvg } from 'delphitools-v2/components/icon';
import { BLEND_OPTIONS } from 'delphitools-v2/components/substrata/blend-options';
import LayerThumb from 'delphitools-v2/components/substrata/panels/layers/thumb';
import {
	renameLayer,
	toggleLock,
	toggleVisibility,
} from 'delphitools-v2/lib/substrata/layer-ops';
import type { PanelRow } from 'delphitools-v2/lib/substrata/layer-tree';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import { layersState } from 'delphitools-v2/components/substrata/panels/layers/state';

const KIND_TITLES: Record<Layer['kind'], string> = {
	raster: 'Image',
	text: 'Text',
	shape: 'Shape',
	freehand: 'Drawing',
	group: 'Group',
};

const selectAll = modifier((input: HTMLInputElement) => {
	input.focus();
	input.select();
});

interface Signature {
	Args: {
		row: PanelRow;
		index: number;
		selected: boolean;
		active: boolean;
		collapsed: boolean;
		folded: boolean;
		current: boolean;
		dragging: boolean;
		manager: DragDropManager;
		onPress: (id: string, event: MouseEvent) => void;
		onMenu: (id: string, el: HTMLElement, at?: MouseEvent) => void;
		onKey: (id: string, event: KeyboardEvent) => void;
	};
}

export default class LayerRow extends Component<Signature> {
	get layer() {
		return this.args.row.layer;
	}

	get isGroup() {
		return this.layer.kind === 'group';
	}

	get title() {
		return this.layer.name || (this.isGroup ? 'Group' : '');
	}

	get kind() {
		const kind = KIND_TITLES[this.layer.kind];
		if (this.isGroup) return kind;
		const blend =
			BLEND_OPTIONS.find(
				(o) => o.value === this.layer.blendMode,
			)?.label ?? this.layer.blendMode;
		return `${kind} · ${blend}`;
	}

	get renaming() {
		return layersState.renaming === this.layer.id;
	}

	get style() {
		return htmlSafe(`--sub-layer-depth: ${this.args.row.depth}`);
	}

	get toggleLabel() {
		if (this.isGroup)
			return this.args.collapsed ? 'Expand' : 'Collapse';
		return this.layer.locked ? 'Unlock' : 'Lock';
	}

	get toggleIcon() {
		if (this.isGroup)
			return this.args.collapsed
				? 'chevron-right'
				: 'chevron-down';
		return this.layer.locked ? 'lock' : 'lock-open';
	}

	press = (event: MouseEvent) => this.args.onPress(this.layer.id, event);

	key = (event: KeyboardEvent) => this.args.onKey(this.layer.id, event);

	menu = (event: MouseEvent) => {
		event.preventDefault();
		this.args.onMenu(
			this.layer.id,
			event.currentTarget as HTMLElement,
			event,
		);
	};

	rename = () => {
		layersState.renaming = this.layer.id;
	};

	toggle = () => {
		if (this.isGroup) layersState.toggleCollapsed(this.layer.id);
		else toggleLock(this.layer.id);
	};

	flipVisible = () => toggleVisibility(this.layer.id);

	endRename = (input: HTMLInputElement, keep: boolean) => {
		if (layersState.renaming !== this.layer.id) return;
		layersState.renaming = null;
		if (keep) renameLayer(this.layer.id, input.value);
		requestAnimationFrame(() =>
			document
				.querySelector<HTMLElement>(
					`.sub-layer-main[data-layer-id="${this.layer.id}"]`,
				)
				?.focus(),
		);
	};

	renameKey = (event: KeyboardEvent) => {
		event.stopPropagation();
		const input = event.target as HTMLInputElement;
		if (event.key === 'Enter') this.endRename(input, true);
		else if (event.key === 'Escape') this.endRename(input, false);
	};

	renameBlur = (event: FocusEvent) =>
		this.endRename(event.target as HTMLInputElement, true);

	<template>
		<div
			class="sub-layer-row
				{{if @selected 'is-selected'}}
				{{if @active 'is-active'}}
				{{if @dragging 'is-dragging'}}
				{{unless this.layer.visible 'is-hidden'}}"
			role="listitem"
			style={{this.style}}
			data-layer-row={{this.layer.id}}
			{{sortable
				id=this.layer.id
				index=@index
				group="layers"
				manager=@manager
			}}
		>
			<span class="sub-layer-bar" aria-hidden="true"></span>
			{{#if this.renaming}}
				<span class="sub-layer-main is-renaming">
					<LayerThumb @layer={{this.layer}} />
					<input
						class="sub-layer-rename"
						type="text"
						value={{this.layer.name}}
						aria-label="Rename"
						{{selectAll}}
						{{on "keydown" this.renameKey}}
						{{on "blur" this.renameBlur}}
					/>
				</span>
			{{else}}
				<button
					type="button"
					class="sub-layer-main"
					data-layer-id={{this.layer.id}}
					tabindex={{if @current "0" "-1"}}
					aria-pressed={{if
						@selected
						"true"
						"false"
					}}
					aria-expanded={{if
						@folded
						"true"
						"false"
					}}
					{{on "click" this.press}}
					{{on "dblclick" this.rename}}
					{{on "contextmenu" this.menu}}
					{{on "keydown" this.key}}
				>
					<LayerThumb @layer={{this.layer}} />
					<span class="sub-layer-text">
						<span
							class="sub-layer-name"
						>{{this.title}}</span>
						<span
							class="sub-layer-kind"
						>{{#if
								this.layer.stratum
							}}<IconSvg
									@name="pin"
								/>{{/if}}{{this.kind}}</span>
					</span>
				</button>
			{{/if}}
			<button
				type="button"
				class="sub-layer-toggle
					{{if this.layer.locked 'is-on'}}"
				tabindex={{if @current "0" "-1"}}
				aria-label={{this.toggleLabel}}
				title={{this.toggleLabel}}
				{{on "click" this.toggle}}
			><IconSvg @name={{this.toggleIcon}} /></button>
			<button
				type="button"
				class="sub-layer-lamp
					{{if this.layer.visible 'is-lit'}}"
				tabindex={{if @current "0" "-1"}}
				aria-label={{if
					this.layer.visible
					"Hide"
					"Show"
				}}
				title={{if this.layer.visible "Hide" "Show"}}
				{{on "click" this.flipVisible}}
			><span class="sub-layer-lamp-dot"></span></button>
		</div>
	</template>
}
