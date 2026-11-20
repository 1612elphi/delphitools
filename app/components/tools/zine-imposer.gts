import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
	type CanonPageMenuItem,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTiles from 'delphicanon/components/canon-tiles';
import PaperPopover from 'delphitools-v2/components/tools/paper-sizes/popover';
import { IconSvg } from 'delphitools-v2/components/icon';
import Job from 'delphitools-v2/components/tools/media/job';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { PAPER_SIZES } from 'delphitools-v2/lib/imposition';
import { paperSizeFor } from 'delphitools-v2/lib/paper-sizes';
import {
	ZINE_FOLDS,
	buildFoldLayout,
	getFoldOption,
	type ZineFoldId,
	type ZineFoldLayout,
} from 'delphitools-v2/lib/zine-folds';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	ACCEPT,
	fillOrder,
	loadFiles,
	move,
	placement,
	release,
	resize,
	samples,
	zinePdf,
	type ZineImage,
} from 'delphitools-v2/components/tools/zine-imposer/images';
import Sheet from 'delphitools-v2/components/tools/zine-imposer/sheet';
import './media/media.css';
import './zine-imposer/zine-imposer.css';

const DPIS = [72, 150, 300, 600];
const DPI_LABELS = DPIS.map((dpi) => `${dpi} DPI`);
const FOLD_NAMES = ZINE_FOLDS.map((fold) => fold.name);
const PANELS = getFoldOption('accordion').panelOptions ?? [];
const PANEL_LABELS = PANELS.map(String);
const FALLBACK_PAPER = PAPER_SIZES[0]!;
const DROP_TYPES = ['image/*', 'application/pdf'];
const inc = (n: number) => n + 1;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Folder = <template><IconSvg @name="folder-open" /></template>;
const Book = <template><IconSvg @name="book-open" /></template>;
const Cross = <template><IconSvg @name="x" /></template>;
const Fit = <template><IconSvg @name="minimize" /></template>;
const Fill = <template><IconSvg @name="maximize" /></template>;

const decimal = (value: number, places = 1) =>
	String(Math.round(value * 10 ** places) / 10 ** places);
const millimetres = (width: number, height: number) =>
	`${decimal(width)} × ${decimal(height)} mm`;

interface Result {
	blob: Blob;
	name: string;
	detail: string;
}

const keep = modifier(
	(element: HTMLInputElement, [store]: [(e: HTMLInputElement) => void]) =>
		store(element),
);

export default class ZineImposer extends Component {
	@tracked foldId: ZineFoldId = 'mini-8';
	@tracked panels = 8;
	@tracked doubleSided = false;
	@tracked split = false;
	@tracked paperSizeId = 'a4';
	@tracked bleed = false;
	@tracked dpi = 300;
	@tracked images: (ZineImage | null)[] = Array<null>(8).fill(null);
	@tracked lit?: number;
	@tracked showsBack = false;
	@tracked over = false;
	@tracked busy = false;
	@tracked failed = false;
	@tracked result: Result | null = null;

	#bulk?: HTMLInputElement;
	#one?: HTMLInputElement;
	#picking = 0;
	#queue: Promise<void> = Promise.resolve();
	#seq = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		if (query.get('zineFold') === '1') this.foldId = 'accordion';
		const panels = Number(query.get('zinePanels'));
		if (PANELS.includes(panels)) this.panels = panels;
		if (query.has('zineDouble')) this.doubleSided = true;
		if (query.has('zineSplit')) this.split = true;
		const paper = paperSizeFor(query.get('zinePaper') ?? '');
		if (paper) this.paperSizeId = paper.id;
		this.images = resize([], this.layout.pageCount);
		const lit = Number(query.get('zineLit'));
		const sample = Number(query.get('zineSample'));
		if (sample > 0)
			void samples(
				Math.min(sample, this.layout.pageCount),
			).then((files) => {
				this.add(files, 0);
				if (lit > 0)
					void this.#queue.then(() =>
						this.light(lit - 1),
					);
			});
		else if (lit > 0) this.light(lit - 1);
	}

	willDestroy() {
		super.willDestroy();
		this.#seq++;
		release(this.images);
	}

	@cached
	get layout(): ZineFoldLayout {
		return buildFoldLayout(this.foldId, {
			panels: this.panels,
			doubleSided: this.doubleSided,
			split: this.split,
		});
	}

	get fold() {
		return getFoldOption(this.foldId);
	}

	get foldIndex() {
		return ZINE_FOLDS.findIndex((f) => f.id === this.foldId);
	}

	get panelIndex() {
		return PANELS.indexOf(this.panels);
	}

	get dpiIndex() {
		return DPIS.indexOf(this.dpi);
	}

	get duplex() {
		return this.layout.sides.length > 1;
	}

	get duplexLabel() {
		return this.layout.duplexFlip === 'long-edge'
			? 'long edge'
			: 'short edge';
	}

	get doubleSidedHint() {
		return this.doubleSided
			? `Front + back · print flip on ${this.duplexLabel}`
			: 'Single side · fold-out strip';
	}

	get splitHint() {
		return this.split
			? 'Two copies stacked · cut in half · shorter panels'
			: 'One full-height strip';
	}

	get paper() {
		return paperSizeFor(this.paperSizeId) ?? FALLBACK_PAPER;
	}

	get sheetWidthMm() {
		return Math.max(this.paper.widthMm, this.paper.heightMm);
	}

	get sheetHeightMm() {
		return Math.min(this.paper.widthMm, this.paper.heightMm);
	}

	get cellWidthMm() {
		return this.sheetWidthMm / this.layout.cols;
	}

	get cellHeightMm() {
		return this.sheetHeightMm / this.layout.rows;
	}

	get figure() {
		const px = (mm: number) => Math.round((mm / 25.4) * this.dpi);
		return `${px(this.cellWidthMm)}×${px(this.cellHeightMm)}`;
	}

	get tiles() {
		const { cellWidthMm: w, cellHeightMm: h } = this;
		return [
			{
				label: 'Sheet',
				value: millimetres(
					this.sheetWidthMm,
					this.sheetHeightMm,
				),
			},
			{ label: 'Page', value: millimetres(w, h) },
			{ label: 'Ratio', value: `${decimal(w / h, 3)}:1` },
			{
				label: 'Orientation',
				value: w < h ? 'Portrait' : 'Landscape',
			},
		];
	}

	get filled() {
		return this.images.filter(Boolean).length;
	}

	get count() {
		return `${this.filled}/${this.layout.pageCount} filled`;
	}

	get sideRanges() {
		if (!this.duplex) return '';
		return this.layout.sides
			.map((side) => {
				const pages = side.placements.map(
					(p) => p.page,
				);
				return `${side.side} ${Math.min(...pages)}–${Math.max(...pages)}`;
			})
			.join(', ');
	}

	get legend() {
		if (!this.duplex) return this.fold.name;
		return this.showsBack ? 'Back' : 'Front';
	}

	get pages(): CanonPage[] {
		const cell = {
			width: this.cellWidthMm,
			height: this.cellHeightMm,
		};
		const half = this.layout.pageCount / 2;
		return this.images.map((image, index) => {
			const name = this.duplex
				? index < half
					? 'Front'
					: 'Back'
				: undefined;
			if (!image) return { size: cell, name };
			return {
				size: cell,
				name,
				picture: image.url,
				placement: placement(
					image.element,
					cell,
					image.fitMode === 'fill',
				),
			};
		});
	}

	get litIndex() {
		return this.lit === undefined ? undefined : this.lit - 1;
	}

	get litImage() {
		return this.litIndex === undefined
			? null
			: (this.images[this.litIndex] ?? null);
	}

	get litTitle() {
		return `Page ${this.lit}`;
	}

	get fitText() {
		return this.litImage?.fitMode === 'fill' ? 'Fit' : 'Fill';
	}

	get fitIcon() {
		return this.litImage?.fitMode === 'fill' ? Fit : Fill;
	}

	get fileName() {
		return [
			`zine-${this.foldId}-${this.paper.id}`,
			this.duplex ? '-duplex' : '',
			this.bleed ? '-bleed' : '',
			'.pdf',
		].join('');
	}

	#changed() {
		this.#seq++;
		this.busy = false;
		this.failed = false;
		this.result = null;
	}

	#relayout(change: () => void) {
		change();
		const count = this.layout.pageCount;
		release(this.images.slice(count));
		this.images = resize(this.images, count);
		if (this.lit !== undefined && this.lit > count)
			this.lit = undefined;
		if (!this.duplex) this.showsBack = false;
		this.#changed();
	}

	pickFold = (index: number) => {
		const fold = ZINE_FOLDS[index];
		if (fold && fold.id !== this.foldId)
			this.#relayout(() => (this.foldId = fold.id));
	};

	pickPanels = (index: number) => {
		const panels = PANELS[index];
		if (panels !== undefined && panels !== this.panels)
			this.#relayout(() => (this.panels = panels));
	};

	setDoubleSided = (on: boolean) =>
		this.#relayout(() => (this.doubleSided = on));

	setSplit = (on: boolean) => this.#relayout(() => (this.split = on));

	pickPaper = (id: string) => {
		if (id === this.paperSizeId) return;
		this.paperSizeId = id;
		this.#changed();
	};

	pickDpi = (index: number) => {
		this.dpi = DPIS[index] ?? this.dpi;
	};

	setBleed = (on: boolean) => {
		this.bleed = on;
		this.#changed();
	};

	light = (index: number) => {
		if (index < 0 || index >= this.images.length) return;
		this.lit = index + 1;
		const side = this.layout.sides.findIndex((s) =>
			s.placements.some((p) => p.page === index + 1),
		);
		this.showsBack = side === 1;
	};

	flip = () => {
		if (this.duplex) this.showsBack = !this.showsBack;
	};

	add = (files: File[], start: number, replace = false) => {
		if (!files.length) return;
		this.#queue = this.#queue.then(async () => {
			const room = fillOrder(
				this.images.map((image, i) =>
					replace && i === start
						? false
						: !!image,
				),
				start,
			).length;
			const loaded = await loadFiles(files, room);
			if (this.isDestroying) return release(loaded);
			const next = [...this.images];
			if (replace && loaded.length && start < next.length) {
				release([next[start] ?? null]);
				next[start] = loaded.shift()!;
			}
			const slots = fillOrder(next.map(Boolean), start);
			loaded.forEach((image, i) => {
				const slot = slots[i];
				if (slot === undefined) release([image]);
				else next[slot] = image;
			});
			this.images = next;
			this.#changed();
		});
	};

	paste = (file: File) => this.add([file], this.litIndex ?? 0);

	dropOnStrip = (index: number, files: File[]) => this.add(files, index);

	dropOnPage = (index: number, files: File[]) => {
		this.light(index);
		this.add(files, index, true);
	};

	enter = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		this.over = true;
	};

	leave = (event: DragEvent) => {
		const root = event.currentTarget as Element;
		if (!root.contains(event.relatedTarget as Node | null))
			this.over = false;
	};

	drop = (event: DragEvent) => {
		this.over = false;
		if (event.defaultPrevented) return;
		const files = [...(event.dataTransfer?.files ?? [])];
		if (!files.length) return;
		event.preventDefault();
		this.add(files, 0);
	};

	storeBulk = (input: HTMLInputElement) => (this.#bulk = input);
	storeOne = (input: HTMLInputElement) => (this.#one = input);

	chooseBulk = () => this.#bulk?.click();

	choosePage = (index: number) => {
		this.#picking = index;
		this.#one?.click();
	};

	chooseLit = () => {
		if (this.litIndex !== undefined) this.choosePage(this.litIndex);
	};

	pickedBulk = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		this.add(files, 0);
	};

	pickedOne = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		this.add(files, this.#picking, true);
	};

	#put(index: number, image: ZineImage | null) {
		const next = [...this.images];
		next[index] = image;
		this.images = next;
		this.#changed();
	}

	toggleFit = (index: number) => {
		const image = this.images[index];
		if (!image) return;
		this.#put(index, {
			...image,
			fitMode: image.fitMode === 'fit' ? 'fill' : 'fit',
		});
	};

	toggleLit = () => {
		if (this.litIndex !== undefined) this.toggleFit(this.litIndex);
	};

	remove = (index: number) => {
		release([this.images[index] ?? null]);
		this.#put(index, null);
	};

	removeLit = () => {
		if (this.litIndex !== undefined) this.remove(this.litIndex);
	};

	clear = () => {
		release(this.images);
		this.images = resize([], this.layout.pageCount);
		this.#changed();
	};

	movePage = (from: number, to: number) => {
		this.images = move(this.images, from, to);
		this.light(to);
		this.#changed();
	};

	menu = (index: number): CanonPageMenuItem[] | undefined => {
		if (this.busy) return undefined;
		const image = this.images[index];
		const items: CanonPageMenuItem[] = [
			{
				title: 'Files',
				action: () => this.choosePage(index),
			},
		];
		if (!image) return items;
		items.push(
			{
				title:
					image.fitMode === 'fill'
						? 'Fit'
						: 'Fill',
				action: () => this.toggleFit(index),
			},
			{
				title: 'Remove',
				destructive: true,
				action: () => this.remove(index),
			},
		);
		return items;
	};

	run = () => void this.#run();

	async #run() {
		if (!this.filled || this.busy) return;
		const seq = ++this.#seq;
		this.busy = true;
		this.failed = false;
		this.result = null;
		const name = this.fileName;
		const sides = this.layout.sides.length;
		try {
			const bytes = await zinePdf({
				layout: this.layout,
				images: this.images,
				sheetWidthMm: this.sheetWidthMm,
				sheetHeightMm: this.sheetHeightMm,
				bleed: this.bleed,
			});
			if (seq !== this.#seq) return;
			const blob = new Blob([new Uint8Array(bytes)], {
				type: 'application/pdf',
			});
			this.result = {
				blob,
				name,
				detail: `${formatBytes(blob.size)} · ${sides === 1 ? '1 page' : `${sides} pages`}`,
			};
		} catch (err) {
			console.error('zine pdf generation failed', err);
			if (seq === this.#seq) this.failed = true;
		} finally {
			if (seq === this.#seq) this.busy = false;
		}
	}

	save = () => {
		if (this.result)
			downloadBlob(this.result.blob, this.result.name);
	};

	<template>
		<CanonSplit
			class="zine-imposer"
			{{filePaste this.paste accept=ACCEPT}}
			{{on "dragover" this.enter}}
			{{on "dragleave" this.leave}}
			{{on "drop" this.drop}}
		>
			<:banner>
				<CanonCanvas
					@height={{pageStripHeight}}
					@background="var(--canon-muted)"
				>
					<CanonPageStrip
						class="zi-strip"
						@pages={{this.pages}}
						@selected={{this.litIndex}}
						@reorders={{true}}
						@dropTypes={{DROP_TYPES}}
						@onSelect={{this.light}}
						@onMove={{this.movePage}}
						@onDrop={{this.dropOnStrip}}
						@menu={{this.menu}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Fold Type" />
					<CanonSegmented
						class="zi-folds"
						@items={{FOLD_NAMES}}
						@selected={{this.foldIndex}}
						@onChange={{this.pickFold}}
					/>
					<CanonStatus
						@text={{this.fold.tagline}}
						@tone="muted"
						@row={{true}}
					/>
					{{#if this.fold.configurablePanels}}
						<CanonHeading @text="Panels" />
						<CanonSegmented
							class="zi-panels"
							@items={{PANEL_LABELS}}
							@selected={{this.panelIndex}}
							@onChange={{this.pickPanels}}
						/>
					{{/if}}
					{{#if this.fold.supportsDoubleSided}}
						<CanonRow
							@title="Double-sided"
							@detail={{this.doubleSidedHint}}
							as |titleId|
						>
							<CanonSwitch
								id="zine-double-sided"
								@on={{this.doubleSided}}
								@onChange={{this.setDoubleSided}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.fold.supportsSplit}}
						<CanonRow
							@title="Split in half (two-up)"
							@detail={{this.splitHint}}
							as |titleId|
						>
							<CanonSwitch
								id="zine-split"
								@on={{this.split}}
								@onChange={{this.setSplit}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Pages" />
					<Slot
						class="zi-slot"
						@prompt="Drop images here"
						@icon="image-plus"
						@row={{true}}
						@over={{this.over}}
						@onChoose={{this.chooseBulk}}
					/>
					<CanonRow
						class="zi-count"
						@title={{this.count}}
						@detail={{this.sideRanges}}
						@form="flush"
					>
						<CanonButton
							class="zi-clear"
							@kind="cell"
							@text="Clear"
							@icon={{Trash}}
							@disabled={{if
								this.filled
								false
								true
							}}
							@onClick={{this.clear}}
						/>
					</CanonRow>
					{{#if this.lit}}
						<CanonRow
							class="zi-page"
							@title={{this.litTitle}}
							@detail={{if
								this.litImage
								this.litImage.name
							}}
							@form="flush"
						>
							<CanonButton
								class="zi-page-files"
								@kind="cell"
								@text="Files"
								@icon={{Folder}}
								@onClick={{this.chooseLit}}
							/>
							{{#if this.litImage}}
								<CanonButton
									class="zi-page-fit"
									@kind="cell"
									@text={{this.fitText}}
									@icon={{this.fitIcon}}
									@onClick={{this.toggleLit}}
								/>
								<CanonButton
									class="zi-page-remove"
									@kind="cell"
									@icon={{Cross}}
									@label="Remove"
									@onClick={{this.removeLit}}
								/>
							{{/if}}
						</CanonRow>
					{{/if}}
					{{! template-lint-disable require-input-label }}
					<input
						class="zi-bulk"
						type="file"
						accept={{ACCEPT}}
						multiple
						hidden
						{{keep this.storeBulk}}
						{{on "change" this.pickedBulk}}
					/>
					<input
						class="zi-one"
						type="file"
						accept={{ACCEPT}}
						hidden
						{{keep this.storeOne}}
						{{on "change" this.pickedOne}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Paper" />
					<PaperPopover
						class="zi-paper-menu"
						@value={{this.paper.id}}
						@label="Paper"
						@onPick={{this.pickPaper}}
					/>
					<CanonHeading @text="Reference DPI" />
					<CanonSegmented
						class="zi-dpi"
						@items={{DPI_LABELS}}
						@selected={{this.dpiIndex}}
						@onChange={{this.pickDpi}}
					/>
					<CanonRow
						@title="Add 3mm bleed"
						as |titleId|
					>
						<CanonSwitch
							id="zine-bleed"
							@on={{this.bleed}}
							@onChange={{this.setBleed}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonTiles @items={{this.tiles}} />
				</CanonRows>
				<CanonRows @framed={{true}}>
					<Job
						@title="Export PDF"
						@icon={{Book}}
						@failure="Failed"
						@disabled={{if
							this.filled
							false
							true
						}}
						@busy={{this.busy}}
						@failed={{this.failed}}
						@result={{this.result}}
						@onRun={{this.run}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonCanvas
					class="zi-canvas"
					@fitting={{true}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
				>
					<Sheet
						@layout={{this.layout}}
						@images={{this.images}}
						@width={{this.sheetWidthMm}}
						@height={{this.sheetHeightMm}}
						@lit={{this.lit}}
						@back={{this.showsBack}}
						@legend={{this.legend}}
						@detail={{this.paper.label}}
						@figure={{this.figure}}
						@onFlip={{this.flip}}
						@onDropAt={{this.dropOnPage}}
					/>
				</CanonCanvas>
				<CanonRows class="zi-steps" @framed={{true}}>
					<CanonHeading @text="How to Fold" />
					<div class="zi-key">
						<span class="zi-key-item">
							<svg
								class="zi-key-line"
								aria-hidden="true"
							>
								<line
									class="zi-crease"
									x1="0"
									y1="50%"
									x2="100%"
									y2="50%"
									stroke-dasharray="6 4"
								/>
							</svg>
							Valley fold
						</span>
						<span class="zi-key-item">
							<svg
								class="zi-key-line"
								aria-hidden="true"
							>
								<line
									class="zi-crease"
									x1="0"
									y1="50%"
									x2="100%"
									y2="50%"
									stroke-dasharray="8 3 1.5 3"
								/>
							</svg>
							Mountain fold
						</span>
						{{#if
							this.layout.cutLines.length
						}}
							<span
								class="zi-key-item"
							>
								<svg
									class="zi-key-line"
									aria-hidden="true"
								>
									<line
										class="zi-cut"
										x1="0"
										y1="50%"
										x2="100%"
										y2="50%"
									/>
								</svg>
								Cut
							</span>
						{{/if}}
					</div>
					<ol class="zi-step-list">
						{{#each
							this.layout.instructions
							as |step index|
						}}
							<li class="zi-step">
								<span
									class="zi-step-number"
									aria-hidden="true"
								>{{inc
										index
									}}</span>
								<span
								>{{step}}</span>
							</li>
						{{/each}}
					</ol>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
