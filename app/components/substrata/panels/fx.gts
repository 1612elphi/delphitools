import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonRows from 'delphicanon/components/canon-rows';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	Cell,
	RailPanel,
} from 'delphitools-v2/components/substrata/editor/cells';
import FxPicker from 'delphitools-v2/components/substrata/panels/fx/fx-picker';
import FxZone from 'delphitools-v2/components/substrata/panels/fx/fx-zone';
import { ActiveLayer } from 'delphitools-v2/lib/substrata/active-layer';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import {
	editorUi,
	type TrayStop,
} from 'delphitools-v2/lib/substrata/editor-ui';
import {
	addFx,
	type FxItem,
	type FxStack,
} from 'delphitools-v2/lib/substrata/fx-ops';
import { isGroup } from 'delphitools-v2/lib/substrata/layer-tree';
import './fx/fx.css';

const PlusIcon = <template><IconSvg @name="plus" /></template>;

export default class FxPanel extends Component<{
	Args: { phone?: boolean };
}> {
	#active = new ActiveLayer();
	@tracked open: { layerId: string; id: string } | null = null;
	@tracked anchor: HTMLElement | null = null;

	get layer() {
		return this.#active.layer;
	}

	get raster(): RasterLayer | null {
		const layer = this.layer;
		return layer?.kind === 'raster' ? layer : null;
	}

	get group() {
		const layer = this.layer;
		return layer !== null && isGroup(layer);
	}

	get filters(): FxItem[] {
		return (this.raster?.filters ?? []).filter(
			(fx) => fx.type !== 'film-sim',
		);
	}

	get effects(): FxItem[] {
		return this.raster?.effects ?? [];
	}

	get empty() {
		return this.filters.length === 0 && this.effects.length === 0;
	}

	get divided() {
		return this.filters.length > 0 && this.effects.length > 0;
	}

	get openId(): string | null {
		const open = this.open;
		if (!open || open.layerId !== this.raster?.id) return null;
		return [...this.filters, ...this.effects].some(
			(fx) => fx.id === open.id,
		)
			? open.id
			: null;
	}

	get alone(): { stack: FxStack; items: FxItem[] } | null {
		const id = this.openId;
		if (!this.args.phone || !id) return null;
		const filter = this.filters.find((fx) => fx.id === id);
		if (filter) return { stack: 'filters', items: [filter] };
		const effect = this.effects.find((fx) => fx.id === id);
		return effect ? { stack: 'effects', items: [effect] } : null;
	}

	raiseTray = modifier((_el: HTMLElement, [alone]: [boolean]) => {
		if (!alone) return;
		let before: TrayStop = 'short';
		queueMicrotask(() => {
			before = editorUi.trayStop;
			editorUi.trayStop = 'full';
		});
		return () =>
			queueMicrotask(() => {
				editorUi.trayStop = before;
			});
	});

	toggle = (id: string) => {
		const layerId = this.raster?.id;
		if (!layerId) return;
		this.open = this.openId === id ? null : { layerId, id };
	};

	showPicker = (event: Event) => {
		this.anchor = event.currentTarget as HTMLElement;
	};

	closePicker = () => {
		this.anchor = null;
	};

	pick = (stack: FxStack, type: string) => {
		const layer = this.raster;
		this.anchor = null;
		if (!layer) return;
		const id = addFx(layer.id, stack, type);
		if (id) this.open = { layerId: layer.id, id };
	};

	close = () => editorUi.close('fx');

	keep = (event: KeyboardEvent) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (/^(Arrow|Backspace$|Delete$)/.test(event.key))
			event.stopPropagation();
	};

	willDestroy() {
		super.willDestroy();
		this.#active.teardown();
	}

	<template>
		<RailPanel
			class="sub-fxp-panel"
			@id="fx"
			@title="FX"
			@onClose={{this.close}}
			{{this.raiseTray (if this.alone true false)}}
			{{on "keydown" this.keep}}
		>
			<:header>
				<Cell
					@label="Add Effect"
					@icon="plus"
					@disabled={{if this.raster false true}}
					aria-haspopup="dialog"
					{{on "click" this.showPicker}}
				/>
			</:header>
			<:default>
				{{#if this.raster}}
					{{#if this.alone}}
						<FxZone
							@layer={{this.raster}}
							@stack={{this.alone.stack}}
							@items={{this.alone.items}}
							@openId={{this.openId}}
							@onToggle={{this.toggle}}
						/>
					{{else if this.empty}}
						<CanonRows>
							<CanonEmptyRow
								@text="No effects yet"
							/>
							<CanonButton
								class="sub-fxp-add-one"
								@kind="cell"
								@text="Add one?"
								@icon={{PlusIcon}}
								aria-haspopup="dialog"
								{{on
									"click"
									this.showPicker
								}}
							/>
						</CanonRows>
					{{else}}
						<FxZone
							@layer={{this.raster}}
							@stack="filters"
							@items={{this.filters}}
							@openId={{this.openId}}
							@onToggle={{this.toggle}}
						/>
						{{#if this.divided}}
							<div
								class="sub-fxp-rule"
								aria-hidden="true"
							></div>
						{{/if}}
						<FxZone
							@layer={{this.raster}}
							@stack="effects"
							@items={{this.effects}}
							@openId={{this.openId}}
							@onToggle={{this.toggle}}
						/>
					{{/if}}
					{{#if this.anchor}}
						<FxPicker
							@anchor={{this.anchor}}
							@layer={{this.raster}}
							@onPick={{this.pick}}
							@onClose={{this.closePicker}}
						/>
					{{/if}}
				{{else if this.group}}
					<CanonEmptyRow
						@text="Select a layer inside this group..."
					/>
				{{else if this.layer}}
					<CanonEmptyRow
						@text="Effects apply to image layers for now."
					/>
				{{else}}
					<CanonEmptyRow
						@text="Select a layer first..."
					/>
				{{/if}}
			</:default>
		</RailPanel>
	</template>
}
