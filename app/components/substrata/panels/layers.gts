import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import {
	RailPanel,
	Cell,
} from 'delphitools-v2/components/substrata/editor/cells';
import FloatingCard, {
	MenuCard,
} from 'delphitools-v2/components/substrata/editor/floating-card';
import {
	chooseTool,
	type EditorTool,
} from 'delphitools-v2/components/substrata/editor/tools';
import LayersList from 'delphitools-v2/components/substrata/panels/layers/layers-list';
import { layersState } from 'delphitools-v2/components/substrata/panels/layers/state';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import {
	getActiveLayerId,
	setActiveLayer,
} from 'delphitools-v2/lib/substrata/selection';
import './layers/layers.css';

const ADD_TOOLS: { id: EditorTool; title: string; icon: string }[] = [
	{ id: 'image', title: 'Image', icon: 'image' },
	{ id: 'text', title: 'Text', icon: 'type' },
	{ id: 'shape', title: 'Shape', icon: 'shapes' },
];

const KEEPS_OPEN = '.sub-card-layer, [title="Layers"]';

export default class LayersPanel extends Component {
	@tracked addCell: HTMLElement | null = null;

	close = () => editorUi.close('layers');

	togglePicking = () => {
		layersState.picking = !layersState.picking;
		if (!layersState.picking) setActiveLayer(getActiveLayerId());
	};

	openAdd = (el: HTMLElement) => {
		this.addCell = el;
	};

	closeAdd = () => {
		const cell = this.addCell;
		this.addCell = null;
		cell?.focus();
	};

	openAssets = () => {
		const phone = !!this.addCell?.closest('.is-tray');
		this.addCell = null;
		if (!editorUi.assetsOpen) editorUi.toggleAssets(phone);
	};

	add = (id: EditorTool) => {
		this.addCell = null;
		chooseTool(id);
	};

	addRef = modifier((el: HTMLElement) => {
		const open = () => this.openAdd(el);
		el.addEventListener('click', open);
		return () => el.removeEventListener('click', open);
	});

	unpinned = modifier((panel: HTMLElement) => {
		let outside = false;
		const down = (e: PointerEvent) => {
			const t = e.target as Element | null;
			outside =
				!editorUi.layersPinned &&
				!!t &&
				!panel.contains(t) &&
				!t.closest(KEEPS_OPEN);
		};
		const up = () => {
			if (outside && !editorUi.layersPinned) this.close();
			outside = false;
		};
		window.addEventListener('pointerdown', down, true);
		window.addEventListener('pointerup', up, true);
		return () => {
			window.removeEventListener('pointerdown', down, true);
			window.removeEventListener('pointerup', up, true);
		};
	});

	<template>
		<RailPanel
			@id="layers"
			@title="Layers"
			@onClose={{this.close}}
			{{this.unpinned}}
		>
			<:header>
				<Cell
					@label="Add Layer"
					@icon="plus"
					@selected={{if this.addCell true false}}
					aria-haspopup="dialog"
					{{this.addRef}}
				/>
				<Cell
					@label="Select"
					@icon="circle-check"
					@selected={{layersState.picking}}
					aria-pressed={{if
						layersState.picking
						"true"
						"false"
					}}
					@onClick={{this.togglePicking}}
				/>
				<Cell
					@label="Pin"
					@icon="pin"
					@selected={{editorUi.layersPinned}}
					aria-pressed={{if
						editorUi.layersPinned
						"true"
						"false"
					}}
					@onClick={{editorUi.toggleLayersPin}}
				/>
			</:header>
			<:default><LayersList /></:default>
		</RailPanel>
		{{#if this.addCell}}
			<FloatingCard
				@anchor={{this.addCell}}
				@width={{240}}
				@label="Add Layer"
				@onClose={{this.closeAdd}}
			>
				<div class="sub-lm-box sub-lm-add">
					{{#each ADD_TOOLS as |t|}}
						<MenuCard
							@title={{t.title}}
							@icon={{t.icon}}
							@onClick={{fn
								this.add
								t.id
							}}
						/>
					{{/each}}
					<MenuCard
						@title="Assets"
						@icon="images"
						@onClick={{this.openAssets}}
					/>
				</div>
			</FloatingCard>
		{{/if}}
	</template>
}
