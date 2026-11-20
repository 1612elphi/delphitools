import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	contrastFigure,
	contrastRatio,
	hex,
	parseHex,
	type Rgb,
} from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import Icon, { IconSvg } from 'delphitools-v2/components/icon';
import {
	BARCODE_TYPES,
	TYPE_LIST,
	filterContent,
	friendlyBwipError,
	isContentCompatible,
	type BarcodeType,
} from 'delphitools-v2/components/tools/code-genny/barcode';
import {
	bwipOptions,
	canvasOf,
	defaultPadding,
	fullNumber,
	pngOf,
	sheetOf,
	svgOf,
	type BarcodeSheet,
	type Raw,
} from 'delphitools-v2/components/tools/code-genny/sheet';
import CodeSheetPicture from 'delphitools-v2/components/tools/qr-genny/picture';
import { pixelSize } from 'delphitools-v2/components/tools/qr-genny/code-sheet';
import { downloadBlob } from 'delphitools-v2/lib/download';
import './code-genny/code-genny.css';

interface Bwip {
	raw(options: object): Raw[];
}

const TYPE_TITLES = TYPE_LIST.map(([, info]) => info.name);
const MODES = ['Single', 'Batch Mode'];
const FORMATS = ['PNG', 'SVG'];
const BATCH_GENERATE = 'Generate & Download ZIP';

const Copy = <template><IconSvg @name="copy" /></template>;
const Download = <template><IconSvg @name="download" /></template>;
const Plus = <template><IconSvg @name="plus" /></template>;
const Upload = <template><IconSvg @name="upload" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;

const rgbOf = (colour: string): Rgb => parseHex(colour) ?? [0, 0, 0];
const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

class BatchItem {
	id = crypto.randomUUID();
	@tracked content: string;
	@tracked status: 'pending' | 'generating' | 'done' | 'error' =
		'pending';
	@tracked dataUrl: string | null = null;

	constructor(content: string) {
		this.content = content;
	}

	get isDone() {
		return this.status === 'done';
	}

	get isGenerating() {
		return this.status === 'generating';
	}

	get isError() {
		return this.status === 'error';
	}
}

export default class CodeGenny extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked bwip?: Bwip;
	@tracked codeType: BarcodeType = 'datamatrix';
	@tracked content = '';
	@tracked foreground = '#000000';
	@tracked background = '#ffffff';
	@tracked transparent = false;
	@tracked padding = defaultPadding.datamatrix;
	@tracked module = 6;
	@tracked numbers = true;
	@tracked isSvg = false;
	@tracked batch = false;
	@tracked batchItems: BatchItem[] = [];
	@tracked batchGenerating = false;

	#destroyed = false;
	#focus = false;
	#batchInput?: HTMLInputElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const kind = TYPE_LIST[Number(query.get('codeKind'))];
		if (query.has('codeKind') && kind) {
			this.codeType = kind[0];
			this.padding = defaultPadding[kind[0]];
		}
		const text = query.get('codeText');
		if (text !== null)
			this.content = filterContent(text, this.codeType);
		this.transparent = query.has('codeTransparent');
		const padding = Number(query.get('codePadding'));
		if (query.has('codePadding') && padding >= 0)
			this.padding = Math.min(40, padding);
		this.isSvg = query.get('codeFormat') === '1';
		this.#focus = query.has('codeFocus');
		void import('bwip-js/browser').then((bwip) => {
			if (!this.#destroyed)
				this.bwip = (
					bwip as unknown as { default: Bwip }
				).default;
		});
	}

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
	}

	focusOnLaunch = modifier((field: HTMLElement) => {
		if (!this.#focus) return;
		this.#focus = false;
		requestAnimationFrame(() => field.focus());
	});

	get info() {
		return BARCODE_TYPES[this.codeType];
	}

	get is1D() {
		return this.info.category === '1d';
	}

	get typeTitles() {
		return TYPE_TITLES;
	}

	get typeIndex() {
		return TYPE_LIST.findIndex(([id]) => id === this.codeType);
	}

	get modes() {
		return MODES;
	}

	get formats() {
		return FORMATS;
	}

	get batchGenerate() {
		return BATCH_GENERATE;
	}

	get safeForeground() {
		return parseHex(this.foreground) ? this.foreground : '#000000';
	}

	get safeBackground() {
		return parseHex(this.background) ? this.background : '#ffffff';
	}

	get foregroundRgb() {
		return rgbOf(this.safeForeground);
	}

	get backgroundRgb() {
		return rgbOf(this.safeBackground);
	}

	get look() {
		return {
			padding: this.padding,
			ink: this.safeForeground,
			paper: this.transparent
				? undefined
				: this.safeBackground,
			numbers: this.numbers,
		};
	}

	#make(content: string): { sheet?: BarcodeSheet; error?: string } {
		const { bwip, codeType } = this;
		if (!bwip || !content.trim()) return {};
		const invalid = BARCODE_TYPES[codeType].validate?.(content);
		if (invalid) return { error: invalid };
		try {
			const [raw] = bwip.raw(bwipOptions(codeType, content));
			return raw
				? { sheet: sheetOf(codeType, raw, this.look) }
				: {};
		} catch (error) {
			return { error: friendlyBwipError(error) };
		}
	}

	@cached
	get made() {
		return this.#make(this.content);
	}

	get sheet() {
		return this.made.sheet;
	}

	get error() {
		return this.made.error;
	}

	get noCode() {
		return !this.sheet;
	}

	get pixels() {
		return this.sheet && pixelSize(this.sheet, this.module);
	}

	get emptyText() {
		return `Enter content to generate ${this.info.name}`;
	}

	get batchHint() {
		return `${this.info.charHint}. Upload a text file with one item per line.`;
	}

	get tiles() {
		const { sheet } = this;
		const columns = sheet?.modules[0]?.length ?? 0;
		const rows = sheet?.modules.length ?? 0;
		const contrast = contrastRatio(
			this.foregroundRgb,
			this.transparent ? [255, 255, 255] : this.backgroundRgb,
		);
		const items = [
			{
				label: 'Modules',
				value: sheet
					? rows === 1
						? String(columns)
						: `${columns} × ${rows}`
					: '—',
			},
			{
				label: 'Characters',
				value: String(this.content.length),
			},
			{
				label: 'Contrast',
				value: `${contrastFigure(contrast)}:1`,
			},
		];
		if (this.codeType === 'ean13' || this.codeType === 'upca')
			items.push({
				label: 'Check digit',
				value: sheet
					? fullNumber(
							this.codeType,
							this.content,
						).slice(-1)
					: '—',
			});
		return items;
	}

	get batchRows() {
		return this.batchItems.map((item, index) => ({
			item,
			number: index + 1,
		}));
	}

	get batchBusy() {
		return this.batchItems.length === 0 || this.batchGenerating;
	}

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	typeContent = (event: Event) => {
		const input = event.target as HTMLInputElement;
		input.value = filterContent(input.value, this.codeType);
		this.content = input.value;
	};

	setType = (index: number) => {
		const entry = TYPE_LIST[index];
		if (!entry) return;
		const [type] = entry;
		if (!isContentCompatible(this.content, type)) this.content = '';
		this.codeType = type;
		this.padding = defaultPadding[type];
	};

	setMode = (index: number) => {
		this.batch = index === 1;
	};

	setForeground = (colour: Rgb) => {
		this.foreground = hex(colour).toLowerCase();
	};

	setBackground = (colour: Rgb) => {
		this.background = hex(colour).toLowerCase();
	};

	setTransparent = (on: boolean) => {
		this.transparent = on;
	};

	setPadding = (value: number) => {
		this.padding = value;
	};

	setModule = (value: number) => {
		this.module = value;
	};

	setNumbers = (on: boolean) => {
		this.numbers = on;
	};

	setFormat = (index: number) => {
		this.isSvg = index === 1;
	};

	get fileStem() {
		return `${slug(this.info.name)}-${Date.now()}`;
	}

	export = () => void this.#export();

	async #export() {
		const { sheet } = this;
		if (!sheet) return;
		if (this.isSvg) {
			downloadBlob(
				new Blob([svgOf(sheet, this.module)], {
					type: 'image/svg+xml',
				}),
				`${this.fileStem}.svg`,
			);
			return;
		}
		const png = await pngOf(sheet, this.module);
		if (png) downloadBlob(png, `${this.fileStem}.png`);
	}

	copy = () => void this.#copy();

	async #copy() {
		const { sheet } = this;
		if (!sheet) return;
		if (this.isSvg) {
			await this.toast.copy(svgOf(sheet, this.module));
			return;
		}
		try {
			const blob = await pngOf(sheet, this.module);
			if (!blob) return;
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
			if (!this.#destroyed) this.toast.show();
		} catch {
			// a denied clipboard leaves no toast
		}
	}

	addBatchItem = () => {
		this.batchItems = [...this.batchItems, new BatchItem('')];
	};

	removeBatchItem = (item: BatchItem) => {
		this.batchItems = this.batchItems.filter(
			(each) => each !== item,
		);
	};

	typeBatchItem = (item: BatchItem, event: Event) => {
		const input = event.target as HTMLInputElement;
		input.value = filterContent(input.value, this.codeType);
		item.content = input.value;
	};

	keepBatchInput = modifier((input: HTMLInputElement) => {
		this.#batchInput = input;
	});

	chooseBatchList = () => this.#batchInput?.click();

	uploadBatchList = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (this.#destroyed) return;
			const lines = (reader.result as string)
				.split(/\r?\n/)
				.map((line) =>
					filterContent(
						line.trim(),
						this.codeType,
					),
				)
				.filter((line) => line.length > 0);
			this.batchItems = [
				...this.batchItems,
				...lines.map((line) => new BatchItem(line)),
			];
		};
		reader.readAsText(file);
	};

	generateBatch = () => void this.#generateBatch();

	async #generateBatch() {
		if (this.batchItems.length === 0) return;
		this.batchGenerating = true;
		const { default: JSZip } = await import('jszip');
		if (this.#destroyed) return;
		const zip = new JSZip();
		const stem = slug(this.info.name);
		for (const item of this.batchItems) {
			if (this.#destroyed) return;
			if (!item.content.trim()) continue;
			item.status = 'generating';
			const { sheet } = this.#make(item.content);
			const blob = sheet
				? await pngOf(sheet, this.module)
				: null;
			if (this.#destroyed) return;
			if (!sheet || !blob) {
				item.status = 'error';
				continue;
			}
			const safeName = item.content
				.slice(0, 30)
				.replace(/[^a-zA-Z0-9]/g, '_');
			zip.file(`${stem}-${safeName}.png`, blob);
			item.dataUrl = canvasOf(sheet, 2).toDataURL(
				'image/png',
			);
			item.status = 'done';
		}
		const archive = await zip.generateAsync({ type: 'blob' });
		if (this.#destroyed) return;
		downloadBlob(archive, `${stem}-batch-${Date.now()}.zip`);
		this.batchGenerating = false;
	}

	<template>
		<CanonSplit
			class="code-genny"
			@halves={{true}}
			@collapsesTo={{240}}
		>
			<:sidebar>
				<CanonCanvas @aspect={{1}} @maxHeight={{520}}>
					<CodeSheetPicture
						@sheet={{this.sheet}}
						@caption={{this.info.name}}
						@pixels={{this.pixels}}
						@label={{this.content}}
						@emptyIcon="barcode"
						@emptyText={{this.emptyText}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Content" />
					{{#if this.batch}}
						{{#each
							this.batchRows
							key="item.id"
							as |row|
						}}
							<div
								class="cg-batch-row"
							>
								<span
									class="cg-batch-index"
								>{{row.number}}</span>
								<CanonTextCell
									@value={{row.item.content}}
									@placeholder={{this.info.placeholder}}
									aria-label="Batch item {{row.number}}"
									{{on
										"input"
										(fn
											this.typeBatchItem
											row.item
										)
									}}
								/>
								<span
									class="cg-batch-state"
								>
									{{#if
										row.item.isDone
									}}
										<img
											class="cg-batch-thumb"
											src={{row.item.dataUrl}}
											alt=""
										/>
									{{else if
										row.item.isGenerating
									}}
										<CanonLoader
											@cell={{4}}
											@gap={{1}}
										/>
									{{else if
										row.item.isError
									}}
										<Icon
											class="cg-batch-error"
											@name="circle-alert"
										/>
									{{/if}}
								</span>
								<CanonButton
									@kind="cell"
									@icon={{Trash}}
									@label="Remove item"
									@onClick={{fn
										this.removeBatchItem
										row.item
									}}
								/>
							</div>
						{{/each}}
						<CanonGrid @columns={{2}}>
							<CanonButton
								@kind="cell"
								@text="Add Item"
								@icon={{Plus}}
								@onClick={{this.addBatchItem}}
							/>
							<CanonButton
								@kind="cell"
								@text="Upload List"
								@icon={{Upload}}
								@onClick={{this.chooseBatchList}}
							/>
						</CanonGrid>
						<input
							type="file"
							class="cg-hidden-input"
							accept=".txt,text/plain"
							aria-label="Upload List"
							tabindex="-1"
							{{this.keepBatchInput}}
							{{on
								"change"
								this.uploadBatchList
							}}
						/>
						<CanonStatus
							@text={{this.batchHint}}
							@tone="muted"
							@row={{true}}
						/>
						<CanonButton
							class="cg-batch-run"
							@kind="primary"
							@text={{this.batchGenerate}}
							@icon={{Download}}
							@disabled={{this.batchBusy}}
							@onClick={{this.generateBatch}}
						/>
					{{else}}
						<CanonTextCell
							class="cg-content"
							@value={{this.content}}
							@placeholder={{this.info.placeholder}}
							aria-label="Content"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							{{on
								"input"
								this.typeContent
							}}
							{{on
								"focusin"
								this.selectAll
							}}
							{{this.focusOnLaunch}}
						/>
						<CanonStatus
							@text={{this.info.charHint}}
							@tone="muted"
							@row={{true}}
						/>
						{{#if this.error}}
							<CanonStatus
								class="cg-error"
								@text={{this.error}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					{{/if}}
					<CanonHeading @text="Code Type" />
					<CanonSegmented
						class="cg-types"
						@items={{this.typeTitles}}
						@selected={{this.typeIndex}}
						@columns={{4}}
						@onChange={{this.setType}}
						aria-label="Code Type"
					/>
					<CanonSegmented
						@items={{this.modes}}
						@selected={{if this.batch 1 0}}
						@onChange={{this.setMode}}
						aria-label="Mode"
					/>
				</CanonRows>

				<CanonRows @framed={{true}}>
					<CanonHeading @text="Colours" />
					<CanonColourWell
						@label="Foreground"
						@colour={{this.foregroundRgb}}
						@onChange={{this.setForeground}}
					/>
					<div
						class="cg-background
							{{if
								this.transparent
								'cg-background--off'
							}}"
						inert={{this.transparent}}
					>
						<CanonColourWell
							@label="Background"
							@colour={{this.backgroundRgb}}
							@onChange={{this.setBackground}}
						/>
					</div>
					<CanonRow
						@title="Transparent"
						as |titleId|
					>
						<CanonSwitch
							@on={{this.transparent}}
							@onChange={{this.setTransparent}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="Padding"
						@detail="Modules"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.padding}}
							@min={{0}}
							@max={{40}}
							@labelledBy={{titleId}}
							@onChange={{this.setPadding}}
						/>
					</CanonRow>
					<CanonRow
						@title="Module"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.module}}
							@min={{1}}
							@max={{20}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setModule}}
						/>
					</CanonRow>
					{{#if this.is1D}}
						<CanonRow
							@title="Show numbers"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.numbers}}
								@onChange={{this.setNumbers}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					{{/if}}
					{{#unless this.batch}}
						<CanonHeading @text="Code" />
						<CanonTiles
							@items={{this.tiles}}
						/>
						<CanonHeading @text="Format" />
						<CanonSegmented
							@items={{this.formats}}
							@selected={{if
								this.isSvg
								1
								0
							}}
							@onChange={{this.setFormat}}
							aria-label="Format"
						/>
						<CanonGrid @columns={{2}}>
							<CanonButton
								class="cg-copy"
								@kind="secondary"
								@text="Copy"
								@icon={{Copy}}
								@disabled={{this.noCode}}
								@onClick={{this.copy}}
							/>
							<CanonButton
								class="cg-export"
								@kind="primary"
								@text="Export"
								@icon={{Download}}
								@iconStyle="oversized"
								@disabled={{this.noCode}}
								@onClick={{this.export}}
							/>
						</CanonGrid>
					{{/unless}}
				</CanonRows>

				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="About {{this.info.name}}"
					/>
					<CanonValueLine
						@label="Invented by"
						@value={{this.info.inventor}}
						@labelWidth={{96}}
					/>
					<CanonValueLine
						@label="Year"
						@value={{this.info.year}}
						@labelWidth={{96}}
					/>
					<p
						class="cg-about-note"
					>{{this.info.description}}</p>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
