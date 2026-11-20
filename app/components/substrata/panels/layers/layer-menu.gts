import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import { not } from 'ember-truth-helpers';
import FloatingCard, {
	MenuCard,
} from 'delphitools-v2/components/substrata/editor/floating-card';
import LayerControls from 'delphitools-v2/components/substrata/panels/layers/layer-controls';
import MenuRow from 'delphitools-v2/components/substrata/panels/layers/menu-row';
import { layersState } from 'delphitools-v2/components/substrata/panels/layers/state';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	closeLayerMenu,
	getLayerMenu,
	subscribeLayerMenu,
	type MenuState,
} from 'delphitools-v2/lib/substrata/context-menu';
import {
	findLayer,
	isGroup,
	leafLayers,
	selectableLeafIds,
	siblingListOf,
} from 'delphitools-v2/lib/substrata/layer-tree';
import {
	deleteLayers,
	duplicateLayers,
	groupLayers,
	reorderLayers,
	toggleLock,
	toggleVisibility,
	ungroupLayer,
	type ReorderDirection,
} from 'delphitools-v2/lib/substrata/layer-ops';
import {
	canRasterize,
	rasterizeLayer,
} from 'delphitools-v2/lib/substrata/rasterize-ops';
import {
	importClipboardImage,
	importImageFile,
} from 'delphitools-v2/lib/substrata/import-raster';
import { setSelection } from 'delphitools-v2/lib/substrata/selection';
import {
	isFrame,
	pickFrameImage,
	setStratum,
} from 'delphitools-v2/lib/substrata/strata';
import {
	getGuides,
	subscribeGuides,
	toggleGuide,
} from 'delphitools-v2/lib/substrata/guides-pref';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './layers.css';

interface LayerData {
	ids: string[];
	layers: Layer[];
	primary: Layer;
	sameSiblings: boolean;
	canGroup: boolean;
	canUngroup: boolean;
	rasterIds: string[];
}

const focusFirst = modifier((el: HTMLElement) => {
	el.querySelector<HTMLElement>('button:enabled')?.focus();
});

export default class LayerMenu extends Component {
	menu = new TrackedExternal(subscribeLayerMenu, getLayerMenu);
	doc = new TrackedExternal(subscribe, getSnapshot);
	guides = new TrackedExternal(subscribeGuides, getGuides);
	@tracked moreFor: MenuState | null = null;

	willDestroy() {
		super.willDestroy();
		this.menu.unsubscribe();
		this.doc.unsubscribe();
		this.guides.unsubscribe();
	}

	get state(): MenuState | null {
		return this.menu.current;
	}

	get more() {
		return this.moreFor !== null && this.moreFor === this.state;
	}

	get anchor(): HTMLElement | null {
		const row = layersState.menuRow;
		if (row?.isConnected && this.state?.kind === 'layer')
			return row;
		return document.querySelector<HTMLElement>(
			'.sub-shell-canvas-area',
		);
	}

	get at() {
		const row = layersState.menuRow;
		if (row?.isConnected && this.state?.kind === 'layer')
			return undefined;
		const s = this.state;
		return s ? { x: s.x, y: s.y } : undefined;
	}

	@cached
	get layer(): LayerData | null {
		const s = this.state;
		const doc = this.doc.current;
		if (s?.kind !== 'layer' || !doc) return null;
		const layers = s.ids
			.map((id) => findLayer(doc.layers, id))
			.filter((l): l is Layer => l !== null);
		const primary = layers[layers.length - 1];
		const first = layers[0];
		if (!primary || !first) return null;
		const ids = layers.map((l) => l.id);
		const list = siblingListOf(doc.layers, first.id);
		const sameSiblings =
			!!list &&
			ids.every((id) => list.some((l) => l.id === id));
		return {
			ids,
			layers,
			primary,
			sameSiblings,
			canGroup: ids.length >= 2 && sameSiblings,
			canUngroup: ids.length === 1 && isGroup(primary),
			rasterIds: layers.filter(canRasterize).map((l) => l.id),
		};
	}

	get canvas() {
		const s = this.state;
		const doc = this.doc.current;
		if (s?.kind !== 'canvas' || !doc) return null;
		return {
			at: s.scene,
			selectable: selectableLeafIds(doc.layers),
		};
	}

	get single() {
		return this.layer?.ids.length === 1;
	}

	get frame() {
		return this.single && isFrame(this.layer?.primary ?? null);
	}

	close = () => {
		const row = layersState.menuRow;
		layersState.menuRow = null;
		closeLayerMenu();
		if (row?.isConnected) row.focus();
	};

	act = (body: (d: LayerData) => void) => () => {
		const d = this.layer;
		if (d) body(d);
		this.close();
	};

	showMore = () => {
		this.moreFor = this.state;
	};

	flipVisible = () => {
		const d = this.layer;
		if (!d) return;
		const was = d.primary.visible;
		for (const l of d.layers)
			if (l.visible === was) toggleVisibility(l.id);
	};

	flipLock = () => {
		const d = this.layer;
		if (!d) return;
		const was = d.primary.locked;
		for (const l of d.layers)
			if (l.locked === was) toggleLock(l.id);
	};

	rename = () => {
		const d = this.layer;
		layersState.menuRow = null;
		closeLayerMenu();
		if (d) layersState.rename(d.primary.id);
	};

	duplicate = this.act((d) => duplicateLayers(d.ids));
	group = this.act((d) => {
		if (d.canGroup) groupLayers(d.ids);
	});
	ungroup = this.act((d) => ungroupLayer(d.primary.id));
	rasterize = this.act((d) => {
		for (const id of d.rasterIds) void rasterizeLayer(id);
	});
	get pinned() {
		const p = this.layer?.primary;
		return !!p && leafLayers(p).every((l) => l.stratum);
	}

	flipStratum = this.act((d) => setStratum(d.ids, !this.pinned));
	replaceImage = this.act((d) => pickFrameImage(d.primary.id));
	remove = this.act((d) => deleteLayers(d.ids));
	restack = (dir: ReorderDirection) =>
		this.act((d) => reorderLayers(d.ids, dir))();

	paste = () => {
		const c = this.canvas;
		if (c) void importClipboardImage({ at: c.at });
		this.close();
	};

	placeImage = () => {
		const c = this.canvas;
		this.close();
		if (!c) return;
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) void importImageFile(file, { at: c.at });
		};
		input.click();
	};

	selectAll = () => {
		const c = this.canvas;
		if (c) setSelection(c.selectable);
		this.close();
	};

	zoomFit = () => {
		viewport.fit();
		this.close();
	};

	zoom100 = () => {
		viewport.setZoom(1);
		this.close();
	};

	toggleGrid = () => toggleGuide('grid');
	toggleSnap = () => toggleGuide('snap');

	canvasSize = () => {
		this.close();
		openModal('canvas-size');
	};

	<template>
		{{#if this.layer}}
			{{#if this.anchor}}
				<FloatingCard
					@anchor={{this.anchor}}
					@at={{this.at}}
					@width={{320}}
					@label="Layer"
					@onClose={{this.close}}
				>
					<div class="sub-lm" data-layer-menu>
						<div
							class="sub-lm-box sub-lm-lamps"
						>
							<MenuCard
								class="sub-lm-lamp
									{{if
										this.layer.primary.visible
										'is-lit'
									}}"
								aria-pressed={{if
									this.layer.primary.visible
									"true"
									"false"
								}}
								@title="Visible"
								@icon={{if
									this.layer.primary.visible
									"eye"
									"eye-off"
								}}
								@onClick={{this.flipVisible}}
							/>
							<MenuCard
								class="sub-lm-lamp
									{{if
										this.layer.primary.locked
										'is-lit'
									}}"
								aria-pressed={{if
									this.layer.primary.locked
									"true"
									"false"
								}}
								@title="Lock"
								@icon={{if
									this.layer.primary.locked
									"lock"
									"lock-open"
								}}
								@onClick={{this.flipLock}}
							/>
						</div>
						<LayerControls
							class="sub-lm-box"
							@layers={{this.layer.layers}}
						/>
						{{#if this.more}}
							<div
								class="sub-lm-box"
								{{focusFirst}}
							>
								<MenuRow
									@title="Rename"
									@icon="pencil"
									@disabled={{not
										this.single
									}}
									@onClick={{this.rename}}
								/>
								<MenuRow
									@title="Duplicate"
									@icon="copy"
									@hint="⌘D"
									@onClick={{this.duplicate}}
								/>
								{{#if
									this.layer.canUngroup
								}}
									<MenuRow
										@title="Ungroup"
										@icon="ungroup"
										@hint="⇧⌘G"
										@onClick={{this.ungroup}}
									/>
								{{else}}
									<MenuRow
										@title="Group"
										@icon="group"
										@hint="⌘G"
										@disabled={{not
											this.layer.canGroup
										}}
										@onClick={{this.group}}
									/>
								{{/if}}
							</div>
							<div class="sub-lm-box">
								<MenuRow
									@title="Bring to Front"
									@icon="arrow-up-to-line"
									@hint="⇧⌘]"
									@disabled={{not
										this.layer.sameSiblings
									}}
									@onClick={{fn
										this.restack
										"front"
									}}
								/>
								<MenuRow
									@title="Bring Forward"
									@icon="arrow-up"
									@hint="⌘]"
									@disabled={{not
										this.layer.sameSiblings
									}}
									@onClick={{fn
										this.restack
										"forward"
									}}
								/>
								<MenuRow
									@title="Send Backward"
									@icon="arrow-down"
									@hint="⌘["
									@disabled={{not
										this.layer.sameSiblings
									}}
									@onClick={{fn
										this.restack
										"backward"
									}}
								/>
								<MenuRow
									@title="Send to Back"
									@icon="arrow-down-to-line"
									@hint="⇧⌘["
									@disabled={{not
										this.layer.sameSiblings
									}}
									@onClick={{fn
										this.restack
										"back"
									}}
								/>
							</div>
							<div class="sub-lm-box">
								{{#if
									this.frame
								}}
									<MenuRow
										@title="Replace Image…"
										@icon="image-plus"
										@onClick={{this.replaceImage}}
									/>
								{{/if}}
								<MenuRow
									@title={{if
										this.pinned
										"Unlock Stratum"
										"Make Stratum"
									}}
									@icon={{if
										this.pinned
										"pin-off"
										"pin"
									}}
									@onClick={{this.flipStratum}}
								/>
							</div>
							<div class="sub-lm-box">
								<MenuRow
									@title="Rasterise"
									@icon="grid-2x2"
									@disabled={{not
										this.layer.rasterIds.length
									}}
									@onClick={{this.rasterize}}
								/>
							</div>
							<div class="sub-lm-box">
								<MenuRow
									@title="Delete"
									@icon="trash-2"
									@hint="⌫"
									@destructive={{true}}
									@onClick={{this.remove}}
								/>
							</div>
						{{else}}
							<div class="sub-lm-box">
								<MenuRow
									@title="More Options"
									@icon="ellipsis"
									aria-expanded="false"
									@onClick={{this.showMore}}
								/>
							</div>
						{{/if}}
					</div>
				</FloatingCard>
			{{/if}}
		{{else if this.canvas}}
			{{#if this.anchor}}
				<FloatingCard
					@anchor={{this.anchor}}
					@at={{this.at}}
					@width={{260}}
					@label="Canvas"
					@onClose={{this.close}}
				>
					<div class="sub-lm" data-canvas-menu>
						<div class="sub-lm-box">
							<MenuRow
								@title="Paste"
								@icon="clipboard"
								@hint="⌘V"
								@onClick={{this.paste}}
							/>
							<MenuRow
								@title="Place Image…"
								@icon="image-plus"
								@onClick={{this.placeImage}}
							/>
							<MenuRow
								@title="Select All"
								@icon="square-dashed"
								@hint="⌘A"
								@disabled={{not
									this.canvas.selectable.length
								}}
								@onClick={{this.selectAll}}
							/>
						</div>
						<div class="sub-lm-box">
							<MenuRow
								@title="Zoom to Fit"
								@icon="maximize-2"
								@hint="⌘0"
								@onClick={{this.zoomFit}}
							/>
							<MenuRow
								@title="Zoom to 100%"
								@icon="search"
								@hint="⌘1"
								@onClick={{this.zoom100}}
							/>
						</div>
						<div
							class="sub-lm-box sub-lm-lamps"
						>
							<MenuCard
								class="sub-lm-lamp
									{{if
										this.guides.current.grid
										'is-lit'
									}}"
								aria-pressed={{if
									this.guides.current.grid
									"true"
									"false"
								}}
								@title="Grid"
								@icon="grid-3x3"
								@onClick={{this.toggleGrid}}
							/>
							<MenuCard
								class="sub-lm-lamp
									{{if
										this.guides.current.snap
										'is-lit'
									}}"
								aria-pressed={{if
									this.guides.current.snap
									"true"
									"false"
								}}
								@title="Snap"
								@icon="magnet"
								@onClick={{this.toggleSnap}}
							/>
						</div>
						<div class="sub-lm-box">
							<MenuRow
								@title="Canvas Size…"
								@icon="frame"
								@onClick={{this.canvasSize}}
							/>
						</div>
					</div>
				</FloatingCard>
			{{/if}}
		{{/if}}
	</template>
}
