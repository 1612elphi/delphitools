import { cached } from '@glimmer/tracking';
import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { eq, not } from 'ember-truth-helpers';
import onClickOutside from 'ember-click-outside/modifiers/on-click-outside';
import { computePosition, flip, shift, offset } from '@floating-ui/dom';
import type { VirtualElement } from '@floating-ui/dom';
import Icon from 'delphitools-v2/components/icon';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	canRasterize,
	rasterizeLayer,
} from 'delphitools-v2/lib/substrata/rasterize-ops';
import {
	closeLayerMenu,
	getLayerMenu,
	subscribeLayerMenu,
} from 'delphitools-v2/lib/substrata/context-menu';
import type { MenuState } from 'delphitools-v2/lib/substrata/context-menu';
import {
	findLayer,
	isGroup,
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
} from 'delphitools-v2/lib/substrata/layer-ops';
import type { ReorderDirection } from 'delphitools-v2/lib/substrata/layer-ops';
import {
	importClipboardImage,
	importImageFile,
} from 'delphitools-v2/lib/substrata/import-raster';
import { setSelection } from 'delphitools-v2/lib/substrata/selection';
import {
	getGuides,
	subscribeGuides,
	toggleGuide,
} from 'delphitools-v2/lib/substrata/guides-pref';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import type {
	Layer,
	SubstrataDoc,
} from 'delphitools-v2/lib/substrata/doc-model';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * The one context menu (right-click; Ruby 2026-07-03), mounted by the shell
 * and opened by any surface via the context-menu store. Two bodies: LAYER
 * (canvas hit / panel row — acts on the target ids) and CANVAS (blank space —
 * paste/place at the scene point, view + guides + canvas actions). Item labels
 * are standard editor vocabulary = functional chrome (BLEND_OPTIONS precedent).
 *
 * PORT NOTE: the source anchors the vendored Popover to a zero-size "virtual
 * point" span at the click coordinates (PopoverAnchor asChild), relying on
 * Radix's anchor-overrides-trigger positioning. The Ember Popover port
 * (components/ui/popover.gts) never wires PopoverAnchor into the
 * floating-ui trigger element at all — only PopoverTrigger does — so a
 * coordinate-anchored menu never resolves through it (positionContent bails
 * out on a null triggerElement). This is a plain `position: fixed` div
 * instead, driven directly by the context-menu store and positioned with the
 * same floating-ui middleware (offset/flip/shift) against a virtual
 * reference element, with `ember-click-outside` + an Escape listener for
 * dismissal — the same behaviour, without depending on the primitive's
 * trigger-anchored assumption.
 */
export class LayerContextMenu extends Component {
	menu = new TrackedExternal(subscribeLayerMenu, getLayerMenu);
	doc = new TrackedExternal(subscribe, getSnapshot);
	guides = new TrackedExternal(subscribeGuides, getGuides);

	willDestroy() {
		super.willDestroy();
		this.menu.unsubscribe();
		this.doc.unsubscribe();
		this.guides.unsubscribe();
	}

	get menuState(): MenuState | null {
		return this.menu.current;
	}

	get docSnapshot(): SubstrataDoc | null {
		return this.doc.current;
	}

	get isOpen(): boolean {
		return this.menuState !== null && this.docSnapshot !== null;
	}

	get menuKind(): string {
		return this.menuState?.kind ?? 'canvas';
	}

	handleOutsideClick = () => closeLayerMenu();

	handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') closeLayerMenu();
	};

	preventContextMenu = (event: Event) => event.preventDefault();

	// Portal-free virtual-point anchor: a zero-size floating-ui reference at
	// the click coordinates, flip/shift-collided against the viewport like the
	// source's PopoverContent. Re-runs whenever the menu store hands it a new
	// state object (open, or repositioned by a second right-click).
	position = modifier(
		(element: HTMLElement, [menu]: [MenuState | null]) => {
			if (!menu) return;
			const reference: VirtualElement = {
				getBoundingClientRect: () => ({
					x: menu.x,
					y: menu.y,
					width: 0,
					height: 0,
					top: menu.y,
					left: menu.x,
					right: menu.x,
					bottom: menu.y,
				}),
			};
			void computePosition(reference, element, {
				placement: 'right-start',
				strategy: 'fixed',
				middleware: [
					offset(2),
					flip(),
					shift({ padding: 8 }),
				],
			}).then(({ x, y }) => {
				element.style.left = `${x}px`;
				element.style.top = `${y}px`;
			});
			document.addEventListener(
				'keydown',
				this.handleKeydown,
			);
			return () =>
				document.removeEventListener(
					'keydown',
					this.handleKeydown,
				);
		},
	);

	<template>
		{{#if this.isOpen}}
			<div
				class="sub-ctx"
				{{this.position this.menuState}}
				{{onClickOutside this.handleOutsideClick}}
				{{on "contextmenu" this.preventContextMenu}}
			>
				{{#if (eq this.menuKind "layer")}}
					<LayerMenuBody
						@menu={{this.menuState}}
						@doc={{this.docSnapshot}}
					/>
				{{else}}
					<CanvasMenuBody
						@menu={{this.menuState}}
						@doc={{this.docSnapshot}}
						@grid={{this.guides.current.grid}}
						@snap={{this.guides.current.snap}}
					/>
				{{/if}}
			</div>
		{{/if}}
	</template>
}

interface LayerMenuData {
	ids: string[];
	primary: Layer;
	sameSiblings: boolean;
	canGroup: boolean;
	canUngroup: boolean;
	rasterizableIds: string[];
}

interface LayerMenuBodySignature {
	Args: { menu: MenuState | null; doc: SubstrataDoc | null };
}

class LayerMenuBody extends Component<LayerMenuBodySignature> {
	// Group when the selection shares ONE sibling list (the panel-footer rule);
	// ordering shares the same constraint.
	// several findLayer walks per call, ~11 template read-sites
	@cached
	get data(): LayerMenuData | null {
		const { menu, doc } = this.args;
		if (!menu || menu.kind !== 'layer' || !doc) return null;
		const ids = menu.ids.filter((id) => findLayer(doc.layers, id));
		if (ids.length === 0) return null;
		const primaryId = ids[ids.length - 1];
		const firstId = ids[0];
		if (primaryId === undefined || firstId === undefined)
			return null;
		const primary = findLayer(doc.layers, primaryId);
		if (!primary) return null;
		const list = siblingListOf(doc.layers, firstId);
		const sameSiblings =
			!!list &&
			ids.every((id) => list.some((l) => l.id === id));
		const canGroup = ids.length >= 2 && sameSiblings;
		const canUngroup = ids.length === 1 && isGroup(primary);
		// Rasterize (M3-15): bake vector/text content so the raster pipelines
		// (filters/effects, SELECT cut) apply. Standard vocabulary chrome.
		const rasterizableIds = ids.filter((id) => {
			const l = findLayer(doc.layers, id);
			return l !== null && canRasterize(l);
		});
		return {
			ids,
			primary,
			sameSiblings,
			canGroup,
			canUngroup,
			rasterizableIds,
		};
	}

	onDuplicate = () => {
		const d = this.data;
		if (!d) return;
		duplicateLayers(d.ids);
		closeLayerMenu();
	};

	onRasterize = () => {
		const d = this.data;
		if (!d) return;
		d.rasterizableIds.forEach((id) => void rasterizeLayer(id));
		closeLayerMenu();
	};

	onGroup = () => {
		const d = this.data;
		if (!d || !d.canGroup) return;
		groupLayers(d.ids);
		closeLayerMenu();
	};

	onUngroup = () => {
		const d = this.data;
		if (!d) return;
		ungroupLayer(d.primary.id);
		closeLayerMenu();
	};

	restack(dir: ReorderDirection) {
		const d = this.data;
		if (!d) return;
		reorderLayers(d.ids, dir);
		closeLayerMenu();
	}

	onBringToFront = () => this.restack('front');
	onBringForward = () => this.restack('forward');
	onSendBackward = () => this.restack('backward');
	onSendToBack = () => this.restack('back');

	onToggleVisibility = () => {
		const d = this.data;
		if (!d) return;
		d.ids.forEach((id) => toggleVisibility(id));
		closeLayerMenu();
	};

	onToggleLock = () => {
		const d = this.data;
		if (!d) return;
		d.ids.forEach((id) => toggleLock(id));
		closeLayerMenu();
	};

	onDelete = () => {
		const d = this.data;
		if (!d) return;
		deleteLayers(d.ids);
		closeLayerMenu();
	};

	<template>
		{{#if this.data}}
			<Item
				@icon="copy"
				@label="Duplicate"
				@hint="⌘D"
				@onClick={{this.onDuplicate}}
			/>
			<Item
				@icon="grid-2x2"
				@label="Rasterize"
				@disabled={{eq
					this.data.rasterizableIds.length
					0
				}}
				@onClick={{this.onRasterize}}
			/>
			{{#if this.data.canUngroup}}
				<Item
					@icon="ungroup"
					@label="Ungroup"
					@hint="⇧⌘G"
					@onClick={{this.onUngroup}}
				/>
			{{else}}
				<Item
					@icon="group"
					@label="Group"
					@hint="⌘G"
					@disabled={{not this.data.canGroup}}
					@onClick={{this.onGroup}}
				/>
			{{/if}}
			<Rule />
			<Item
				@icon="arrow-up-to-line"
				@label="Bring to Front"
				@hint="⇧⌘]"
				@disabled={{not this.data.sameSiblings}}
				@onClick={{this.onBringToFront}}
			/>
			<Item
				@icon="arrow-up"
				@label="Bring Forward"
				@hint="⌘]"
				@disabled={{not this.data.sameSiblings}}
				@onClick={{this.onBringForward}}
			/>
			<Item
				@icon="arrow-down"
				@label="Send Backward"
				@hint="⌘["
				@disabled={{not this.data.sameSiblings}}
				@onClick={{this.onSendBackward}}
			/>
			<Item
				@icon="arrow-down-to-line"
				@label="Send to Back"
				@hint="⇧⌘["
				@disabled={{not this.data.sameSiblings}}
				@onClick={{this.onSendToBack}}
			/>
			<Rule />
			<Item
				@icon={{if
					this.data.primary.visible
					"eye-off"
					"eye"
				}}
				@label={{if
					this.data.primary.visible
					"Hide"
					"Show"
				}}
				@onClick={{this.onToggleVisibility}}
			/>
			<Item
				@icon={{if
					this.data.primary.locked
					"lock-open"
					"lock"
				}}
				@label={{if
					this.data.primary.locked
					"Unlock"
					"Lock"
				}}
				@onClick={{this.onToggleLock}}
			/>
			<Rule />
			<Item
				@icon="trash-2"
				@label="Delete"
				@hint="⌫"
				@destructive={{true}}
				@onClick={{this.onDelete}}
			/>
		{{/if}}
	</template>
}

interface CanvasMenuData {
	at: { x: number; y: number };
	selectable: string[];
}

interface CanvasMenuBodySignature {
	Args: {
		menu: MenuState | null;
		doc: SubstrataDoc | null;
		grid: boolean;
		snap: boolean;
	};
}

class CanvasMenuBody extends Component<CanvasMenuBodySignature> {
	get data(): CanvasMenuData | null {
		const { menu, doc } = this.args;
		if (!menu || menu.kind !== 'canvas' || !doc) return null;
		return {
			at: menu.scene,
			selectable: selectableLeafIds(doc.layers),
		};
	}

	onPaste = () => {
		const d = this.data;
		if (!d) return;
		void importClipboardImage({ at: d.at });
		closeLayerMenu();
	};

	onPlaceImage = () => {
		const d = this.data;
		if (!d) return;
		const at = d.at;
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) void importImageFile(file, { at });
		};
		input.click();
		closeLayerMenu();
	};

	onSelectAll = () => {
		const d = this.data;
		if (!d) return;
		setSelection(d.selectable);
		closeLayerMenu();
	};

	onZoomFit = () => {
		viewport.fit();
		closeLayerMenu();
	};

	onZoom100 = () => {
		viewport.setZoom(1);
		closeLayerMenu();
	};

	// toggles stay open — the checkmark is the feedback
	onToggleGrid = () => toggleGuide('grid');
	onToggleSnap = () => toggleGuide('snap');

	onCanvasSize = () => {
		openModal('canvas-size');
		closeLayerMenu();
	};

	<template>
		{{#if this.data}}
			<Item
				@icon="clipboard"
				@label="Paste"
				@hint="⌘V"
				@onClick={{this.onPaste}}
			/>
			<Item
				@icon="image-plus"
				@label="Place Image…"
				@onClick={{this.onPlaceImage}}
			/>
			<Rule />
			<Item
				@icon="square-dashed"
				@label="Select All"
				@hint="⌘A"
				@disabled={{eq this.data.selectable.length 0}}
				@onClick={{this.onSelectAll}}
			/>
			<Rule />
			<Item
				@icon="maximize-2"
				@label="Zoom to Fit"
				@hint="⌘0"
				@onClick={{this.onZoomFit}}
			/>
			<Item
				@icon="search"
				@label="Zoom to 100%"
				@hint="⌘1"
				@onClick={{this.onZoom100}}
			/>
			<Rule />
			<Item
				@icon="grid-3x3"
				@label="Grid"
				@isToggle={{true}}
				@checked={{@grid}}
				@onClick={{this.onToggleGrid}}
			/>
			<Item
				@icon="magnet"
				@label="Snap"
				@isToggle={{true}}
				@checked={{@snap}}
				@onClick={{this.onToggleSnap}}
			/>
			<Rule />
			<Item
				@icon="frame"
				@label="Canvas Size…"
				@onClick={{this.onCanvasSize}}
			/>
		{{/if}}
	</template>
}

const Rule: TOC<{ Element: HTMLDivElement }> = <template>
	<div aria-hidden="true" class="sub-ctx-rule"></div>
</template>;

interface ItemSignature {
	Element: HTMLButtonElement;
	Args: {
		icon: string;
		label: string;
		/** keyboard combo, shown right-aligned — only for combos the keymap delivers */
		hint?: string;
		onClick: () => void;
		disabled?: boolean;
		destructive?: boolean;
		/** menu-toggle rows (Grid/Snap): renders role=menuitemcheckbox + the check glyph */
		isToggle?: boolean;
		checked?: boolean;
	};
}

const Item: TOC<ItemSignature> = <template>
	<button
		type="button"
		disabled={{@disabled}}
		role={{if @isToggle "menuitemcheckbox"}}
		aria-checked={{if @isToggle @checked}}
		class="sub-ctx-item {{if @destructive 'is-destructive'}}"
		{{on "click" @onClick}}
	>
		<Icon @name={{@icon}} />
		<span class="sub-ctx-item-label">{{@label}}</span>
		{{#if @hint}}
			<span class="sub-ctx-item-hint">{{@hint}}</span>
		{{/if}}
		{{#if @checked}}
			<Icon @name="check" class="sub-ctx-item-check" />
		{{/if}}
	</button>
</template>;
