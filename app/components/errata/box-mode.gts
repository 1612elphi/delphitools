import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import { htmlSafe, type SafeString } from '@ember/template';
import type { ComponentLike } from '@glint/template';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSwitch from 'delphicanon/components/canon-switch';
import PaperMenu from 'delphitools-v2/components/errata/paper-menu';
import ToolPanel, {
	AnchorPicker,
	Field,
	InputField,
	PageScope,
	PageScopeState,
	Segmented,
	Slider,
	livePreview,
	readText,
	type SegmentedOption,
} from 'delphitools-v2/components/errata/tool-panel';
import { replaceDocument } from 'delphitools-v2/lib/errata/source';
import {
	addStamped,
	pageNumberObjects,
	STAMP_RED,
	stampObjects,
	watermarkObjects,
} from 'delphitools-v2/lib/errata/stamps';
import {
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import type { Stamped } from 'delphitools-v2/lib/errata/doc-model';
import { dropRedactions, redactIds } from 'delphitools-v2/lib/errata/redact';
import { boxMode, closeMode, onMode } from 'delphitools-v2/lib/errata/ui';
import {
	DEFAULT_IMPOSITION_CONFIG,
	DIRECTION_AWARE_LAYOUTS,
	DUPLEX_AWARE_LAYOUTS,
	GANG_RUN_GRIDS,
	IMPOSITION_LAYOUTS,
	imposePdf,
	type ImpositionConfig,
} from 'delphitools-v2/lib/imposition';
import { findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import type { Anchor } from 'delphitools-v2/lib/pdf-stamp';
import {
	MAX_SIZES,
	compressPdf,
	formatBytes,
} from 'delphitools-v2/lib/pdf-compress';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './box-mode.css';

const CUSTOM = 'Custom';
const STAMPS = ['Approved', 'Draft', 'Final', 'Confidential', 'Void', CUSTOM];

const STAMP_COLOURS = [
	{ value: STAMP_RED, label: 'Red' },
	{ value: '#000000', label: 'Black' },
	{ value: '#0550ae', label: 'Blue' },
	{ value: '#1a7f37', label: 'Green' },
];

const swatch = (style: SafeString): ComponentLike => <template>
	<span class="err-swatch" style={{style}}></span>
</template>;

const COLOUR_LABELS = STAMP_COLOURS.map((c) => c.label);
const COLOUR_ICONS = STAMP_COLOURS.map((c) =>
	swatch(htmlSafe(`background-color: ${c.value}`)),
);

const numbers = (values: number[]): SegmentedOption<number>[] =>
	values.map((v) => ({ value: v, label: String(v) }));

const NUMBER_SIZES = numbers([8, 10, 12]);
const STAMP_SIZES = numbers([18, 24, 36]);

type StampMode = 'page-numbers' | 'watermark' | 'stamp';

const STAMP_HEADS: Record<StampMode, { icon: string; label: string }> = {
	'page-numbers': { icon: 'hash', label: 'Page numbers' },
	watermark: { icon: 'droplet', label: 'Watermark' },
	stamp: { icon: 'stamp', label: 'Stamp' },
};

type Orientation = ImpositionConfig['orientation'];
type Flip = NonNullable<ImpositionConfig['duplexFlip']>;

const FOLD_LAYOUTS = new Set([
	'saddle-stitch',
	'perfect-bind',
	'step-and-repeat',
]);

const ORIENTATIONS: SegmentedOption<Orientation>[] = [
	{ value: 'portrait', label: 'Portrait' },
	{ value: 'landscape', label: 'Landscape' },
];

const FLIPS: SegmentedOption<Flip>[] = [
	{ value: 'long-edge', label: 'Long edge' },
	{ value: 'short-edge', label: 'Short edge' },
];

const DIRECTIONS: SegmentedOption<'ltr' | 'rtl'>[] = [
	{ value: 'ltr', label: 'Left to right' },
	{ value: 'rtl', label: 'Right to left' },
];

const LAYOUT_NAMES = IMPOSITION_LAYOUTS.map((l) => l.name);

const COPIES: SegmentedOption<number>[] = Object.keys(GANG_RUN_GRIDS).map(
	(n) => ({ value: Number(n), label: n }),
);

const CUSTOM_SIZE = -1;

class SizeField extends Component<{
	Args: {
		options: SegmentedOption<number>[];
		value: number;
		min: number;
		max: number;
		onChange: (value: number) => void;
	};
}> {
	@tracked open = false;

	get options(): SegmentedOption<number>[] {
		return [
			...this.args.options,
			{ value: CUSTOM_SIZE, label: CUSTOM },
		];
	}

	get preset() {
		return this.args.options.some(
			(o) => o.value === this.args.value,
		);
	}

	get custom() {
		return this.open || !this.preset;
	}

	get picked() {
		return this.custom ? CUSTOM_SIZE : this.args.value;
	}

	pick = (value: number) => {
		this.open = value === CUSTOM_SIZE;
		if (!this.open) this.args.onChange(value);
	};

	<template>
		<Field @label="Size">
			<Segmented
				@options={{this.options}}
				@value={{this.picked}}
				@onChange={{this.pick}}
				@label="Size"
			/>
			{{#if this.custom}}
				<CanonNumberField
					class="err-size-number"
					@value={{@value}}
					@min={{@min}}
					@max={{@max}}
					@unit="pt"
					@label="Custom size"
					@onChange={{@onChange}}
				/>
			{{/if}}
		</Field>
	</template>
}

interface Signature {
	Args: { open: boolean };
}

export default class StampPanel extends Component<{
	Args: { mode: StampMode; open: boolean };
}> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	pages = new PageScopeState('all');

	@tracked numberFormat = '{n} / {N}';
	@tracked numberAnchor: Anchor = 'bottom-center';
	@tracked numberSize = 10;
	@tracked watermark = 'DRAFT';
	@tracked opacity = 15;
	@tracked angle = -45;
	@tracked stamp = 'Approved';
	@tracked stampText = '';
	@tracked stampBold = false;
	@tracked stampColour = STAMP_RED;
	@tracked stampAnchor: Anchor = 'top-right';
	@tracked stampSize = 24;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get head() {
		return STAMP_HEADS[this.args.mode];
	}

	@cached
	get indices(): number[] | null {
		const doc = this.doc.current;
		return doc
			? this.pages.indices(doc.pages.length, this.pageIndex)
			: null;
	}

	get invalid() {
		return this.indices === null;
	}

	@cached
	get items(): Stamped[] {
		const doc = this.doc.current;
		const indices = this.indices;
		if (!doc || !indices) return [];
		switch (this.args.mode) {
			case 'page-numbers':
				return pageNumberObjects(
					doc,
					indices,
					this.numberFormat,
					this.numberAnchor,
					this.numberSize,
				);
			case 'watermark':
				return watermarkObjects(
					doc,
					indices,
					this.watermark,
					this.opacity / 100,
					this.angle,
				);
			default:
				return stampObjects(
					doc,
					indices,
					this.stamp === CUSTOM
						? this.stampText
						: this.stamp.toUpperCase(),
					this.stampAnchor,
					this.stampSize,
					this.stampColour,
					this.stampBold,
				);
		}
	}

	pick = (key: string, value: unknown) => {
		(this as unknown as Record<string, unknown>)[key] = value;
	};

	get stampIndex() {
		return STAMPS.indexOf(this.stamp);
	}

	get colourIndex() {
		return STAMP_COLOURS.findIndex(
			(c) => c.value === this.stampColour,
		);
	}

	pickStamp = (index: number) => (this.stamp = STAMPS[index]!);
	pickColour = (index: number) =>
		(this.stampColour = STAMP_COLOURS[index]!.value);

	apply = () => {
		addStamped(this.items);
		closeMode();
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode={{@mode}}
			@icon={{this.head.icon}}
			@label={{this.head.label}}
			@onCancel={{closeMode}}
			@onApply={{this.apply}}
			@canApply={{if this.items.length true false}}
			{{livePreview (if @open this.items)}}
		>
			{{#if (eq @mode "page-numbers")}}
				<InputField @label="Format">
					<input
						class="err-mode-input"
						aria-label="Format"
						value={{this.numberFormat}}
						{{on
							"input"
							(readText
								(fn
									this.pick
									"numberFormat"
								)
							)
						}}
					/>
				</InputField>
				<AnchorPicker
					@value={{this.numberAnchor}}
					@onChange={{fn
						this.pick
						"numberAnchor"
					}}
				/>
				<SizeField
					@options={{NUMBER_SIZES}}
					@value={{this.numberSize}}
					@min={{4}}
					@max={{72}}
					@onChange={{fn this.pick "numberSize"}}
				/>

			{{else if (eq @mode "watermark")}}
				<InputField @label="Text">
					<input
						class="err-mode-input"
						aria-label="Text"
						value={{this.watermark}}
						{{on
							"input"
							(readText
								(fn
									this.pick
									"watermark"
								)
							)
						}}
					/>
				</InputField>
				<Slider
					@label="Opacity"
					@value={{this.opacity}}
					@min={{5}}
					@max={{100}}
					@unit="%"
					@onChange={{fn this.pick "opacity"}}
				/>
				<Slider
					@label="Angle"
					@value={{this.angle}}
					@min={{-90}}
					@max={{90}}
					@unit="°"
					@onChange={{fn this.pick "angle"}}
				/>

			{{else}}
				<Field @label="Label">
					<CanonMenuCell
						class="err-menu-cell"
						@items={{STAMPS}}
						@selected={{this.stampIndex}}
						@label="Label"
						@onChange={{this.pickStamp}}
					/>
				</Field>
				{{#if (eq this.stamp CUSTOM)}}
					<Field @label="Text">
						<input
							class="err-mode-input"
							aria-label="Custom label"
							value={{this.stampText}}
							{{on
								"input"
								(readText
									(fn
										this.pick
										"stampText"
									)
								)
							}}
						/>
					</Field>
				{{/if}}
				<AnchorPicker
					@value={{this.stampAnchor}}
					@onChange={{fn this.pick "stampAnchor"}}
				/>
				<Field @label="Colour">
					<CanonSegmented
						class="err-mode-seg err-swatches"
						@items={{COLOUR_LABELS}}
						@icons={{COLOUR_ICONS}}
						@selected={{this.colourIndex}}
						@onChange={{this.pickColour}}
						aria-label="Colour"
					/>
				</Field>
				<SizeField
					@options={{STAMP_SIZES}}
					@value={{this.stampSize}}
					@min={{6}}
					@max={{144}}
					@onChange={{fn this.pick "stampSize"}}
				/>
				<InputField @label="Bold">
					<CanonSwitch
						@on={{this.stampBold}}
						@onChange={{fn
							this.pick
							"stampBold"
						}}
						aria-label="Bold"
					/>
				</InputField>

			{{/if}}
			<PageScope
				@state={{this.pages}}
				@invalid={{this.invalid}}
			/>
		</ToolPanel>
	</template>
}

class ReplacePanel extends Component<Signature> {
	@tracked busy = false;
	@tracked failed = false;
	#run = 0;

	async replace(
		transform: (
			bytes: Uint8Array,
		) => Promise<Uint8Array> | Uint8Array,
	): Promise<boolean> {
		const run = ++this.#run;
		this.busy = true;
		this.failed = false;
		const ok = await replaceDocument(
			transform,
			() => run === this.#run,
		);
		this.busy = false;
		if (run !== this.#run) return false;
		this.failed = !ok;
		return ok;
	}

	discard = () => this.#run++;
}

export class CompressPanel extends ReplacePanel {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	@tracked quality = 65;
	@tracked maxEdge = 0;
	@tracked compressed: {
		source: string | undefined;
		before: number;
		after: number;
	} | null = null;
	#off = onMode('compress', {
		enter: () => {
			this.compressed = null;
			this.failed = false;
		},
		exit: this.discard,
	});

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.#off();
	}

	get result() {
		const c = this.compressed;
		return c && c.source === this.doc.current?.source
			? `${formatBytes(c.before)} → ${formatBytes(c.after)}`
			: null;
	}

	setQuality = (quality: number) => {
		this.quality = quality;
		this.compressed = null;
	};

	setMaxEdge = (maxEdge: number) => {
		this.maxEdge = maxEdge;
		this.compressed = null;
	};

	compress = async (bytes: Uint8Array) => {
		const out = (
			await compressPdf(bytes.slice().buffer, {
				recompressImages: true,
				quality: this.quality,
				maxEdge: this.maxEdge,
			})
		).bytes;
		this.compressed = {
			source: undefined,
			before: bytes.length,
			after: out.length,
		};
		return out;
	};

	apply = async () => {
		if (!(await this.replace(this.compress)))
			this.compressed = null;
		else if (this.compressed)
			this.compressed = {
				...this.compressed,
				source: store.getSnapshot()?.source,
			};
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="compress"
			@icon="archive"
			@label="Compress"
			@onCancel={{closeMode}}
			@cancelLabel={{if this.result "Close"}}
			@onApply={{this.apply}}
			@canApply={{if this.result false true}}
			@busy={{this.busy}}
			@failed={{this.failed}}
		>
			<:status>
				{{#if this.result}}
					<span
						class="err-mode-tag"
						data-compress-result
					>{{this.result}}</span>
				{{/if}}
			</:status>
			<:default>
				<Slider
					@label="Quality"
					@value={{this.quality}}
					@min={{10}}
					@max={{100}}
					@onChange={{this.setQuality}}
				/>
				<Field @label="Images">
					<Segmented
						@options={{MAX_SIZES}}
						@value={{this.maxEdge}}
						@onChange={{this.setMaxEdge}}
					/>
				</Field>

			</:default>
		</ToolPanel>
	</template>
}

export class ImposePanel extends ReplacePanel {
	@tracked layout = DEFAULT_IMPOSITION_CONFIG.layoutId;
	@tracked paper = DEFAULT_IMPOSITION_CONFIG.paperSize.id;
	@tracked orientation = DEFAULT_IMPOSITION_CONFIG.orientation;
	@tracked margin = DEFAULT_IMPOSITION_CONFIG.marginMm;
	@tracked gutter = DEFAULT_IMPOSITION_CONFIG.gutterMm;
	@tracked creep = DEFAULT_IMPOSITION_CONFIG.creepMm;
	@tracked cropMarks = DEFAULT_IMPOSITION_CONFIG.cropMarks;
	@tracked copies = 4;
	@tracked rows = 2;
	@tracked cols = 2;
	@tracked flip: Flip = 'long-edge';
	@tracked direction: 'ltr' | 'rtl' = 'ltr';
	#off = onMode('impose', {
		enter: () => (this.failed = false),
		exit: this.discard,
	});

	willDestroy() {
		super.willDestroy();
		this.#off();
	}

	get duplexAware() {
		return DUPLEX_AWARE_LAYOUTS.has(this.layout);
	}

	pick = (key: string, value: unknown) => {
		(this as unknown as Record<string, unknown>)[key] = value;
	};

	get directionAware() {
		return DIRECTION_AWARE_LAYOUTS.has(this.layout);
	}

	impose = (bytes: Uint8Array) =>
		imposePdf(bytes, {
			...DEFAULT_IMPOSITION_CONFIG,
			layoutId: this.layout,
			paperSize:
				findPaperSize(this.paper) ??
				DEFAULT_IMPOSITION_CONFIG.paperSize,
			orientation: this.orientation,
			marginMm: this.margin,
			gutterMm: this.gutter,
			creepMm: this.creep,
			cropMarks: this.cropMarks,
			nUp: this.copies,
			customGrid: [this.rows, this.cols],
			duplexFlip: this.flip,
			rtl: this.direction === 'rtl',
		});

	apply = async () => {
		if (
			(await this.replace(this.impose)) &&
			boxMode.get() === 'impose'
		)
			closeMode();
	};

	setLayout = (id: string) => {
		this.layout = id;
		if (FOLD_LAYOUTS.has(id)) this.orientation = 'landscape';
	};
	setMargin = (mm: number) => (this.margin = mm);
	setGutter = (mm: number) => (this.gutter = mm);
	setCreep = (mm: number) => (this.creep = mm);
	setCropMarks = (on: boolean) => (this.cropMarks = on);
	setRows = (rows: number) => (this.rows = rows);
	setCols = (cols: number) => (this.cols = cols);

	get layoutIndex() {
		return IMPOSITION_LAYOUTS.findIndex(
			(l) => l.id === this.layout,
		);
	}

	pickLayout = (index: number) =>
		this.setLayout(IMPOSITION_LAYOUTS[index]!.id);

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="impose"
			@icon="book-open"
			@label="Impose"
			@onCancel={{closeMode}}
			@onApply={{this.apply}}
			@busy={{this.busy}}
			@failed={{this.failed}}
		>
			<Field @label="Layout">
				<CanonMenuCell
					class="err-menu-cell"
					@items={{LAYOUT_NAMES}}
					@selected={{this.layoutIndex}}
					@label="Layout"
					@onChange={{this.pickLayout}}
				/>
			</Field>
			<Field @label="Sheet">
				<PaperMenu
					@value={{this.paper}}
					@label="Sheet"
					@onChange={{fn this.pick "paper"}}
				/>
			</Field>
			{{#if (eq this.layout "gang-run")}}
				<Field @label="Copies">
					<Segmented
						@options={{COPIES}}
						@value={{this.copies}}
						@onChange={{fn
							this.pick
							"copies"
						}}
					/>
				</Field>
			{{else if (eq this.layout "custom-nup")}}
				<Field @label="Grid">
					<CanonNumberField
						class="err-grid-number"
						@value={{this.rows}}
						@min={{1}}
						@max={{10}}
						@label="Rows"
						@onChange={{this.setRows}}
					/>
					<span class="err-unit">&times;</span>
					<CanonNumberField
						class="err-grid-number"
						@value={{this.cols}}
						@min={{1}}
						@max={{10}}
						@label="Columns"
						@onChange={{this.setCols}}
					/>
				</Field>
			{{/if}}
			<Field @label="Orientation">
				<Segmented
					@options={{ORIENTATIONS}}
					@value={{this.orientation}}
					@onChange={{fn this.pick "orientation"}}
				/>
			</Field>
			{{#if this.directionAware}}
				<Field @label="Reading">
					<Segmented
						@options={{DIRECTIONS}}
						@value={{this.direction}}
						@onChange={{fn
							this.pick
							"direction"
						}}
					/>
				</Field>
			{{/if}}
			{{#if this.duplexAware}}
				<Field @label="Duplex">
					<Segmented
						@options={{FLIPS}}
						@value={{this.flip}}
						@onChange={{fn
							this.pick
							"flip"
						}}
					/>
				</Field>
			{{/if}}
			<Slider
				@label="Margins"
				@value={{this.margin}}
				@min={{0}}
				@max={{20}}
				@unit="mm"
				@onChange={{this.setMargin}}
			/>
			<Slider
				@label="Gutter"
				@value={{this.gutter}}
				@min={{0}}
				@max={{10}}
				@unit="mm"
				@onChange={{this.setGutter}}
			/>
			{{#if (eq this.layout "saddle-stitch")}}
				<Slider
					@label="Creep"
					@value={{this.creep}}
					@min={{0}}
					@max={{2}}
					@step={{0.1}}
					@unit="mm"
					@onChange={{this.setCreep}}
				/>
			{{/if}}
			<InputField @label="Crop marks">
				<CanonSwitch
					@on={{this.cropMarks}}
					@onChange={{this.setCropMarks}}
					aria-label="Crop marks"
				/>
			</InputField>
		</ToolPanel>
	</template>
}

const burn = (bytes: Uint8Array) => bytes;

export class RedactPanel extends ReplacePanel {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	#kept = new Set<string>();
	#off = onMode('redact', {
		enter: () => {
			this.#kept = redactIds(store.getSnapshot());
			this.failed = false;
		},
		exit: () => {
			this.discard();
			dropRedactions(this.#kept);
		},
	});

	redactHint = 'Drag an area or click a line';

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.#off();
	}

	get marks() {
		return redactIds(this.doc.current).size;
	}

	apply = async () => {
		if ((await this.replace(burn)) && boxMode.get() === 'redact')
			closeMode();
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="redact"
			@icon="eye-off"
			@label="Redact"
			@onCancel={{closeMode}}
			@onApply={{this.apply}}
			@canApply={{if this.marks true false}}
			@busy={{this.busy}}
			@failed={{this.failed}}
		>
			<:status>
				<span
					class="err-mode-tag"
				>{{this.redactHint}}</span>
				<span class="err-mode-tag">{{this.marks}}
					marked</span>
			</:status>
		</ToolPanel>
	</template>
}
