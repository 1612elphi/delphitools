import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { eq } from 'ember-truth-helpers';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import { RailPanel } from 'delphitools-v2/components/substrata/editor/cells';
import type {
	FreehandLayer,
	Layer,
	RasterLayer,
	ShapeLayer,
	TextLayer,
} from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { setFill } from 'delphitools-v2/lib/substrata/layer-ops';
import {
	findLayer,
	isGroup,
	leafLayers,
} from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getActiveLayerId,
	getSelectedLayerIds,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { layerDims } from 'delphitools-v2/lib/substrata/shape-geometry';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import { BlendRow, NameRow, OpacityRow } from './inspector/appearance';
import ArrangeSection from './inspector/arrange-section';
import ArtboardSection from './inspector/artboard-section';
import ColourWell from './inspector/colour-well';
import MaskSection from './inspector/mask-section';
import RasterSection from './inspector/raster-section';
import ShapeSection from './inspector/shape-section';
import TextSection from './inspector/text-section';
import TransformSection from './inspector/transform-section';
import { inspectorSection } from './inspector/logic';
import './inspector/inspector.css';

const close = () => editorUi.close('inspector');

export default class InspectorPanel extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);
	selected = new TrackedExternal(subscribeSelection, getSelectedLayerIds);
	activeId = new TrackedExternal(subscribeSelection, getActiveLayerId);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selected.unsubscribe();
		this.activeId.unsubscribe();
	}

	get section() {
		return inspectorSection(
			this.doc.current,
			this.selected.current,
		);
	}

	@cached
	get layer(): Layer | null {
		const doc = this.doc.current;
		if (!doc) return null;
		const ids = this.selected.current;
		const active = this.activeId.current;
		const id = active && ids.includes(active) ? active : ids.at(-1);
		return id ? findLayer(doc.layers, id) : null;
	}

	get keyed(): Layer[] {
		return this.layer ? [this.layer] : [];
	}

	get ids(): readonly string[] {
		return this.section === 'shared'
			? this.selected.current
			: this.layer
				? [this.layer.id]
				: [];
	}

	get count(): string {
		return String(this.selected.current.length);
	}

	get members(): string {
		return this.layer ? String(leafLayers(this.layer).length) : '0';
	}

	get leaf(): Exclude<Layer, { kind: 'group' }> | null {
		const layer = this.layer;
		return layer && !isGroup(layer) ? layer : null;
	}

	get raster(): RasterLayer | null {
		const l = this.leaf;
		return l?.kind === 'raster' ? l : null;
	}

	get text(): TextLayer | null {
		const l = this.leaf;
		return l?.kind === 'text' ? l : null;
	}

	get shape(): ShapeLayer | null {
		const l = this.leaf;
		return l?.kind === 'shape' ? l : null;
	}

	get freehand(): FreehandLayer | null {
		const l = this.leaf;
		return l?.kind === 'freehand' ? l : null;
	}

	get maskable(): boolean {
		return this.leaf ? layerDims(this.leaf) !== null : false;
	}

	applyFreehand = (hex: string, transient: boolean) => {
		const l = this.freehand;
		if (l) setFill(l.id, hex, { transient });
	};

	<template>
		<RailPanel
			@id="inspector"
			@title="Inspector"
			@onClose={{close}}
		>
			{{#if this.doc.current}}
				<CanonRows class="sub-ip">
					{{#if (eq this.section "artboard")}}
						<ArtboardSection
							@doc={{this.doc.current}}
						/>
					{{else if (eq this.section "shared")}}
						<CanonHeading
							@text="Selection"
						/>
						<CanonRow @title="Layers">
							<span
								class="sub-ip-fact"
							>{{this.count}}</span>
						</CanonRow>
						{{#if this.layer}}
							<OpacityRow
								@ids={{this.ids}}
								@value={{this.layer.opacity}}
							/>
							<BlendRow
								@ids={{this.ids}}
								@layer={{this.layer}}
							/>
						{{/if}}
					{{else}}
						{{#each
							this.keyed key="id"
							as |layer|
						}}
							<NameRow
								@layer={{layer}}
								@placeholder={{if
									(eq
										this.section
										"group"
									)
									"Group"
								}}
							/>
							<OpacityRow
								@ids={{this.ids}}
								@value={{layer.opacity}}
							/>
							{{#if
								(eq
									this.section
									"group"
								)
							}}
								<CanonRow
									@title="Layers"
								>
									<span
										class="sub-ip-fact"
									>{{this.members}}</span>
								</CanonRow>
							{{else if this.leaf}}
								<BlendRow
									@ids={{this.ids}}
									@layer={{layer}}
								/>
								{{#unless
									this.leaf.stratum
								}}
									<TransformSection
										@layer={{this.leaf}}
									/>
								{{/unless}}
								{{#if
									this.raster
								}}
									<RasterSection
										@layer={{this.raster}}
									/>
								{{else if
									this.text
								}}
									<TextSection
										@layer={{this.text}}
									/>
								{{else if
									this.shape
								}}
									<ShapeSection
										@layer={{this.shape}}
									/>
								{{else if
									this.freehand
								}}
									<CanonHeading
										@text="Drawing"
									/>
									<CanonRow
										@title="Colour"
										@form="stacked"
									>
										<ColourWell
											@hex={{this.freehand.fill}}
											@onApply={{this.applyFreehand}}
											@label="Fill colour"
										/>
									</CanonRow>
								{{/if}}
								{{#if
									this.maskable
								}}
									<MaskSection
										@layer={{this.leaf}}
									/>
								{{/if}}
							{{/if}}
						{{/each}}
					{{/if}}
					{{#unless (eq this.section "artboard")}}
						<ArrangeSection
							@doc={{this.doc.current}}
							@selected={{this.selected.current}}
							@active={{this.layer}}
						/>
					{{/unless}}
				</CanonRows>
			{{/if}}
		</RailPanel>
	</template>
}
