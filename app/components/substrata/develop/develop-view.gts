import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	LOOK_TYPE,
	adjustment,
	getLook,
	removeFilter,
	setAdjustment,
	setLook,
	setLookIntensity,
} from 'delphitools-v2/lib/substrata/develop-ops';
import type {
	RasterLayer,
	SubstrataDoc,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	beginTransient,
	commitTransient,
	getSnapshot,
	isGestureActive,
	rollbackTransient,
	subscribe,
	updateTransient,
} from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { findLayer } from 'delphitools-v2/lib/substrata/layer-tree';
import {
	ensureAllLuts,
	lutEpoch,
	subscribeLuts,
} from 'delphitools-v2/lib/substrata/lut-data';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import AdjustRow, { SIZING, listen } from './adjust-row';
import DevelopHistogram from './histogram';
import LookStrip from './look-strip';
import DevelopPicture from './picture';
import type { Histogram } from './render';
import './develop.css';

const GROUPS = [
	{
		title: 'Light',
		types: ['exposure', 'contrast', 'highlights', 'shadows'],
	},
	{ title: 'Colour', types: ['temperature', 'tint', 'saturation'] },
	{ title: 'Detail', types: ['sharpen', 'vignette'] },
];

const Revert = <template><IconSvg @name="undo-2" /></template>;

const percent = (v: number) => `${Math.round(v)}%`;

interface DevelopViewSignature {
	Args: { layerId: string };
}

export default class DevelopView extends Component<DevelopViewSignature> {
	@tracked histogram: Histogram | null = null;

	doc = new TrackedExternal(subscribe, getSnapshot);
	luts = new TrackedExternal(subscribeLuts, lutEpoch);
	start: string;

	constructor(
		...args: ConstructorParameters<
			typeof Component<DevelopViewSignature>
		>
	) {
		super(...args);
		ensureAllLuts();
		this.start = this.snapshot(this.layer);
		if (!isGestureActive()) beginTransient();
	}

	get layer(): RasterLayer | null {
		const doc = this.doc.current;
		const layer = doc && findLayer(doc.layers, this.args.layerId);
		return layer?.kind === 'raster' ? layer : null;
	}

	snapshot = (layer: RasterLayer | null) => JSON.stringify(layer);

	get unchanged() {
		return this.snapshot(this.layer) === this.start;
	}

	get aspect() {
		const layer = this.layer;
		if (!layer) return 1;
		const w = layer.crop?.w ?? layer.naturalWidth;
		const h = layer.crop?.h ?? layer.naturalHeight;
		return w / Math.max(h, 1);
	}

	get look() {
		return this.layer ? getLook(this.layer) : null;
	}

	get activeLook(): string | null {
		const preset = this.look?.params['preset'];
		return typeof preset === 'string' ? preset : null;
	}

	get intensity() {
		const value = this.look?.params['intensity'];
		return typeof value === 'number' ? value : 100;
	}

	get noLook() {
		return this.look === null;
	}

	valueOf = (type: string): number | null => {
		const layer = this.layer;
		return layer?.filters.some((f) => f.type === type)
			? adjustment(layer, type)
			: null;
	};

	edit(mutate: (doc: SubstrataDoc, id: string) => SubstrataDoc) {
		if (!isGestureActive()) beginTransient();
		updateTransient((doc) => mutate(doc, this.args.layerId));
	}

	set = (type: string, value: number) =>
		this.edit((doc, id) => setAdjustment(doc, id, type, value));

	reset = (type: string) =>
		this.edit((doc, id) => removeFilter(doc, id, type));

	pick = (preset: string | null) =>
		this.edit((doc, id) =>
			preset
				? setLook(doc, id, preset)
				: removeFilter(doc, id, LOOK_TYPE),
		);

	setIntensity = (value: number) => {
		if (!this.noLook)
			this.edit((doc, id) =>
				setLookIntensity(doc, id, value),
			);
	};

	resetIntensity = () => this.setIntensity(100);

	count = (histogram: Histogram) => (this.histogram = histogram);

	revert = () => {
		rollbackTransient();
		beginTransient();
	};

	done = () => {
		if (isGestureActive()) commitTransient();
		editorUi.developOpen = false;
	};

	keys = modifier((root: HTMLElement) => {
		root.focus();
		const down = (event: KeyboardEvent) => {
			event.stopPropagation();
			if (
				event.key === 'Escape' ||
				(event.key === 'Enter' &&
					(event.metaKey || event.ctrlKey))
			) {
				event.preventDefault();
				this.done();
			}
		};
		root.addEventListener('keydown', down);
		return () => root.removeEventListener('keydown', down);
	});

	willDestroy() {
		super.willDestroy();
		if (isGestureActive()) commitTransient();
		this.doc.unsubscribe();
		this.luts.unsubscribe();
	}

	<template>
		<div
			class="sub-develop"
			role="dialog"
			aria-modal="true"
			aria-label="Develop"
			tabindex="-1"
			{{this.keys}}
		>
			{{#if this.layer}}
				<CanonSplit
					@halves={{true}}
					@collapsesTo={{200}}
				>
					<:sidebar>
						<CanonCanvas
							@aspect={{this.aspect}}
							@background="var(--canon-muted)"
						>
							<DevelopPicture
								@layer={{this.layer}}
								@lutEpoch={{this.luts.current}}
								@onCount={{this.count}}
							/>
						</CanonCanvas>
					</:sidebar>
					<:main>
						<CanonRows @framed={{true}}>
							<DevelopHistogram
								@histogram={{this.histogram}}
							/>
						</CanonRows>
						{{#each GROUPS as |group|}}
							<CanonRows
								@framed={{true}}
							>
								<CanonHeading
									@text={{group.title}}
								/>
								{{#each
									group.types
									as |type|
								}}
									<AdjustRow
										@type={{type}}
										@value={{this.valueOf
											type
										}}
										@onSet={{this.set}}
										@onReset={{this.reset}}
									/>
								{{/each}}
							</CanonRows>
						{{/each}}
						<CanonRows @framed={{true}}>
							<CanonHeading
								@text="Looks"
							/>
							<LookStrip
								@blobHash={{this.layer.blobHash}}
								@active={{this.activeLook}}
								@lutEpoch={{this.luts.current}}
								@onPick={{this.pick}}
							/>
							<CanonRow
								class="sub-dev-row"
								@title="Intensity"
								@form="flush"
								@sizingTitle={{SIZING}}
								{{listen
									"dblclick"
									this.resetIntensity
								}}
								as |titleId|
							>
								<div
									class="sub-dev-control"
								>
									<CanonSlider
										class="sub-dev-intensity
											{{if
												this.noLook
												'is-off'
											}}"
										@value={{this.intensity}}
										@min={{0}}
										@max={{100}}
										@step={{1}}
										@readout={{percent}}
										@labelledBy={{titleId}}
										@onChange={{this.setIntensity}}
										aria-disabled={{if
											this.noLook
											"true"
										}}
										tabindex={{if
											this.noLook
											"-1"
											"0"
										}}
									/>
								</div>
							</CanonRow>
						</CanonRows>
					</:main>
					<:footer>
						<div class="sub-dev-actions">
							<CanonButton
								@text="Revert"
								@icon={{Revert}}
								@disabled={{this.unchanged}}
								@onClick={{this.revert}}
							/>
							<CanonButton
								@text="Done"
								@kind="primary"
								@onClick={{this.done}}
							/>
						</div>
					</:footer>
				</CanonSplit>
			{{/if}}
		</div>
	</template>
}
