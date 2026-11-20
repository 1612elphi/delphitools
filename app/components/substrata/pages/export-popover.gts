import Component from '@glimmer/component';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	creditLines,
	creditSources,
} from 'delphitools-v2/lib/substrata/assets';
import type { AssetSource } from 'delphitools-v2/lib/substrata/doc-model';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import {
	EXPORT_FORMATS,
	formatMeta,
	resolveExportDims,
	type ExportScope,
} from 'delphitools-v2/lib/substrata/export-core';
import { jxlAvailable } from 'delphitools-v2/lib/substrata/export-encode';
import { runExport } from 'delphitools-v2/lib/substrata/export-run';
import {
	closeModal,
	getOpenModal,
	subscribeModal,
} from 'delphitools-v2/lib/substrata/modal';
import {
	getActiveLayerId,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import FormPopover from './form-popover';
import {
	CUSTOM_SCALE,
	EXPORT_PRESET_SCALES,
	byteFigure,
	scaleLabel,
} from './figures';
import { anchorFor } from './page-state';

const ESTIMATE_MS = 300;

const creditDetail = (s: AssetSource) => `${s.creator}, ${s.licence}`;

const CREDITS_NOTE =
	'This image uses licensed assets. Please publish the credits listed below along with it.';

class ExportForm extends Component<{ Args: { onDone: () => void } }> {
	doc = new TrackedExternal(subscribe, getSnapshot);
	activeLayer = new TrackedExternal(subscribeSelection, getActiveLayerId);

	@tracked format = 0;
	@tracked quality = 0.9;
	@tracked scaleIndex = 1;
	@tracked custom: number = CUSTOM_SCALE.start;
	@tracked wantLayer = false;
	@tracked bytes: [string, string] | null = null;
	@tracked busy = false;
	@tracked failed = false;

	jxlOk = jxlAvailable();
	formatLabels = EXPORT_FORMATS.map((f) => f.label);
	scaleLabels = [
		...EXPORT_PRESET_SCALES.map((s) => scaleLabel(s)),
		'Custom',
	];
	#timer?: number;
	#seq = 0;

	constructor(owner: Owner, args: { onDone: () => void }) {
		super(owner, args);
		this.estimate();
	}

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.activeLayer.unsubscribe();
		window.clearTimeout(this.#timer);
		this.#seq += 1;
	}

	creditsNote = CREDITS_NOTE;

	get sources() {
		const doc = this.doc.current;
		return doc ? creditSources(doc) : [];
	}

	copyCredits = async () => {
		const doc = this.doc.current;
		if (!doc) return;
		try {
			await navigator.clipboard.writeText(
				creditLines(doc).join('\n'),
			);
			toast('copied');
		} catch {
			// clipboard refused
		}
	};

	get meta() {
		return EXPORT_FORMATS[this.format]!;
	}

	get scope(): ExportScope {
		return this.wantLayer && this.activeLayer.current !== null
			? 'layer'
			: 'artboard';
	}

	get isCustom() {
		return this.scaleIndex >= EXPORT_PRESET_SCALES.length;
	}

	get scale(): number {
		return EXPORT_PRESET_SCALES[this.scaleIndex] ?? this.custom;
	}

	get dims() {
		const ab = this.doc.current?.artboard;
		return ab
			? resolveExportDims(ab.width, ab.height, this.scale)
			: null;
	}

	get pixels() {
		const d = this.dims;
		return d ? `${d.outW} × ${d.outH}` : '—';
	}

	get bytesUnit() {
		return this.bytes?.[1] ?? '';
	}

	get bytesText() {
		return this.bytes ? `≈${this.bytes[0]}` : '—';
	}

	get disabledFormats() {
		return EXPORT_FORMATS.flatMap((f, i) =>
			(f.id === 'jxl' && !this.jxlOk) ||
			(!f.alpha && this.scope === 'layer')
				? [i]
				: [],
		);
	}

	get scopeIndex() {
		return this.scope === 'layer' ? 1 : 0;
	}

	get noLayer() {
		return this.activeLayer.current === null ? [1] : [];
	}

	options() {
		return {
			format: this.meta.id,
			scale: this.scale,
			quality: Math.round(this.quality * 100),
			scope: this.scope,
		};
	}

	estimate() {
		window.clearTimeout(this.#timer);
		const seq = ++this.#seq;
		this.#timer = window.setTimeout(() => {
			void runExport(this.options(), {
				download: false,
			}).then((outcome) => {
				if (seq !== this.#seq) return;
				this.bytes = outcome.ok
					? byteFigure(outcome.blob.size)
					: null;
			});
		}, ESTIMATE_MS);
	}

	setFormat = (index: number) => {
		this.format = index;
		this.estimate();
	};

	setQuality = (value: number) => {
		this.quality = value;
		this.estimate();
	};

	setScale = (index: number) => {
		this.scaleIndex = index;
		this.estimate();
	};

	setCustom = (value: number) => {
		this.custom = value;
		this.estimate();
	};

	setScope = (index: number) => {
		this.wantLayer = index === 1;
		if (this.wantLayer && !this.meta.alpha)
			this.format = EXPORT_FORMATS.findIndex(
				(f) => f.id === 'png',
			);
		this.estimate();
	};

	run = async () => {
		this.busy = true;
		this.failed = false;
		const outcome = await runExport(this.options());
		if (this.isDestroyed) return;
		this.busy = false;
		if (outcome.ok) this.args.onDone();
		else this.failed = true;
	};

	percent = (value: number) => `${Math.round(value * 100)}%`;

	get lossy() {
		return formatMeta(this.meta.id).lossy;
	}

	<template>
		<CanonHeading @text="Format" />
		<CanonSegmented
			@items={{this.formatLabels}}
			@selected={{this.format}}
			@disabledIndices={{this.disabledFormats}}
			@onChange={{this.setFormat}}
		/>
		<CanonRow
			@title="Quality"
			@form="flush"
			class={{unless this.lossy "sub-pg-dim"}}
			as |id|
		>
			<CanonSlider
				@value={{this.quality}}
				@min={{0.1}}
				@max={{1}}
				@step={{0.01}}
				@readout={{this.percent}}
				@labelledBy={{id}}
				@onChange={{this.setQuality}}
			/>
		</CanonRow>
		<CanonHeading @text="Scale" />
		<CanonSegmented
			@items={{this.scaleLabels}}
			@selected={{this.scaleIndex}}
			@onChange={{this.setScale}}
		/>
		{{#if this.isCustom}}
			<CanonRow @title="Custom" @form="flush" as |id|>
				<CanonDecimalField
					@value={{this.custom}}
					@min={{CUSTOM_SCALE.min}}
					@max={{CUSTOM_SCALE.max}}
					@step={{0.25}}
					@decimals={{2}}
					@unit="×"
					@labelledBy={{id}}
					@onChange={{this.setCustom}}
				/>
			</CanonRow>
		{{/if}}
		<CanonHeading @text="Scope" />
		<CanonSegmented
			@items={{SCOPES}}
			@selected={{this.scopeIndex}}
			@disabledIndices={{this.noLayer}}
			@onChange={{this.setScope}}
		/>
		<CanonRow @title="Pixels">
			<CanonFigure
				class="sub-pg-figure"
				@text={{this.pixels}}
				@unit="px"
				@size={{22}}
			/>
		</CanonRow>
		<CanonRow @title="File size">
			<CanonFigure
				class="sub-pg-figure"
				@text={{this.bytesText}}
				@unit={{this.bytesUnit}}
				@size={{22}}
			/>
		</CanonRow>
		{{#if this.dims.downscaled}}
			<CanonStatus
				@text="Downscaled"
				@tone="warn"
				@row={{true}}
			/>
		{{/if}}
		{{#if this.failed}}
			<CanonStatus
				@text="Export failed"
				@tone="warn"
				@row={{true}}
			/>
		{{/if}}
		{{#if this.sources.length}}
			<CanonHeading @text="Credits" />
			<CanonStatus
				@text={{this.creditsNote}}
				@tone="muted"
				@row={{true}}
			/>
			{{#each this.sources as |s|}}
				<CanonRow
					class="sub-pg-credit"
					@title={{s.title}}
					@detail={{creditDetail s}}
				/>
			{{/each}}
		{{/if}}
		{{#if this.busy}}
			<CanonRow @title="Exporting…">
				<CanonLoader @cell={{5}} @gap={{1}} />
			</CanonRow>
		{{/if}}
		{{#if this.sources.length}}
			<CanonGrid>
				<CanonButton
					@text="Copy credits"
					@icon={{component IconSvg name="copy"}}
					@onClick={{this.copyCredits}}
				/>
				<CanonButton
					@kind="primary"
					@text="Export"
					@icon={{component IconSvg name="share"}}
					@iconStyle="oversized"
					@disabled={{this.busy}}
					@onClick={{this.run}}
				/>
			</CanonGrid>
		{{else}}
			<CanonButton
				class="sub-pg-primary"
				@kind="primary"
				@text="Export"
				@icon={{component IconSvg name="share"}}
				@iconStyle="oversized"
				@disabled={{this.busy}}
				@onClick={{this.run}}
			/>
		{{/if}}
	</template>
}

const SCOPES = ['Artboard', 'Layer'];

interface Signature {
	Args: { phone: boolean };
}

export default class ExportPopover extends Component<Signature> {
	#stop: () => void;

	constructor(owner: Owner, args: Signature['Args']) {
		super(owner, args);
		const take = () => {
			if (getOpenModal() !== 'export') return;
			closeModal();
			editorUi.exportOpen = true;
		};
		this.#stop = subscribeModal(take);
	}

	willDestroy() {
		super.willDestroy();
		this.#stop();
	}

	anchor = () => anchorFor('Share');

	close = () => {
		editorUi.exportOpen = false;
	};

	<template>
		<FormPopover
			@open={{editorUi.exportOpen}}
			@phone={{@phone}}
			@label="Export"
			@anchor={{this.anchor}}
			@onClose={{this.close}}
		>
			<ExportForm @onDone={{this.close}} />
		</FormPopover>
	</template>
}
