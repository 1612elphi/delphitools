import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import type Owner from '@ember/owner';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
	type CanonPageMenuItem,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { passAlong } from 'delphitools-v2/lib/flow-hooks';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { paperSizeFor } from 'delphitools-v2/lib/paper-sizes';
import {
	MATCH_IMAGE_SIZE,
	type FitMode,
	type PageOrientation,
} from 'delphitools-v2/lib/pdf-pages';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import DownloadAll from 'delphitools-v2/components/tools/media/download-all';
import Slot from 'delphitools-v2/components/tools/media/slot';
import PaperPopover from 'delphitools-v2/components/tools/paper-sizes/popover';
import {
	open,
	sizes,
	thumbnails,
	type PageSize,
} from 'delphitools-v2/lib/pdfjs';
import {
	blankPage,
	layout,
	sortedByName,
	type Options,
} from 'delphitools-v2/components/tools/image-to-pdf/layout';
import {
	buildPdf,
	extensionOf,
	pageImage,
	type PageFormat,
} from 'delphitools-v2/components/tools/image-to-pdf/export';
import './media/media.css';
import './image-to-pdf/image-to-pdf.css';

const IMAGE_ACCEPT = 'image/*';
const PDF_ACCEPT = '.pdf,application/pdf';
const ACCEPT = `${IMAGE_ACCEPT},${PDF_ACCEPT}`;

const directions = ['Image to PDF', 'PDF to Image'];
const ORIENTATIONS: PageOrientation[] = ['auto', 'portrait', 'landscape'];
const orientationLabels = ['Auto', 'Portrait', 'Landscape'];
const FITS: FitMode[] = ['contain', 'cover', 'stretch'];
const fitLabels = ['Fit', 'Fill', 'Stretch'];
const MAX_MARGIN_MM = 30;
const mmText = (mm: number) => `${mm} mm`;
const MIN_DPI = 72;
const MAX_DPI = 300;
const DPI_STEP = 6;
const dpiText = (dpi: number) => `${dpi} DPI`;
const FORMATS: PageFormat[] = ['png', 'jpeg', 'webp'];
const formatLabels = ['PNG', 'JPEG', 'WebP'];
const DEFAULT_DPI = 150;
const DEFAULT_FORMAT: PageFormat = 'jpeg';
const DEFAULT_QUALITY = 0.85;
const TO_PDF_ID = 'image-to-pdf';
const TO_IMAGES_ID = 'pdf-to-images';
const A4: PageSize = { width: 595.28, height: 841.89 };

const Trash = <template><IconSvg @name="trash-2" /></template>;
const SortUp = <template><IconSvg @name="arrow-down" /></template>;
const SortDown = <template><IconSvg @name="arrow-up" /></template>;
const ExportIcon = <template><IconSvg @name="file-text" /></template>;

interface Item {
	id: number;
	file: File;
	name: string;
	url: string;
	width: number;
	height: number;
}

interface Built {
	blob: Blob;
	pages: number;
}

let nextId = 1;

function loadItem(file: File): Promise<Item> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const url = URL.createObjectURL(file);
		const fail = () => {
			URL.revokeObjectURL(url);
			reject(new Error(`Could not read ${file.name}`));
		};
		image.onload = () => {
			const { naturalWidth: width, naturalHeight: height } =
				image;
			if (!width || !height) return fail();
			resolve({
				id: nextId++,
				file,
				name: file.name,
				url,
				width,
				height,
			});
		};
		image.onerror = fail;
		image.src = url;
	});
}

const isPdf = (file: File) => matchesAccept(file, PDF_ACCEPT);
const isImage = (file: File) => matchesAccept(file, IMAGE_ACCEPT);
const pages = (n: number) => (n === 1 ? '1 page' : `${n} pages`);

function drawnSamples(): Promise<File[]> {
	const specs: [string, number, number, string][] = [
		['page10.png', 1200, 800, '#c0392b'],
		['cover.png', 800, 1100, '#2b5fc0'],
		['page2.png', 900, 900, '#2b9c5f'],
	];
	return Promise.all(
		specs.map(
			([name, width, height, colour]) =>
				new Promise<File>((resolve) => {
					const canvas =
						document.createElement(
							'canvas',
						);
					canvas.width = width;
					canvas.height = height;
					const ctx = canvas.getContext('2d')!;
					ctx.fillStyle = colour;
					ctx.fillRect(0, 0, width, height);
					ctx.fillStyle = '#fff';
					ctx.fillRect(
						width * 0.1,
						height * 0.1,
						width * 0.3,
						height * 0.3,
					);
					canvas.toBlob((blob) =>
						resolve(
							new File(
								[blob!],
								name,
								{
									type: 'image/png',
								},
							),
						),
					);
				}),
		),
	);
}

function index(query: URLSearchParams, key: string, count: number) {
	const value = Number(query.get(key));
	return query.has(key) &&
		Number.isInteger(value) &&
		value >= 0 &&
		value < count
		? value
		: undefined;
}

function ranged(query: URLSearchParams, key: string, min: number, max: number) {
	const value = Number(query.get(key));
	return query.has(key) && value >= min && value <= max
		? value
		: undefined;
}

export default class ImageToPdf extends Component {
	@service declare router: RouterService;

	drop = new Drop(ACCEPT, (files) => this.take(files), true);

	@tracked items: Item[] = [];
	@tracked sizeId = 'a4';
	@tracked orientation: PageOrientation = 'auto';
	@tracked fit: FitMode = 'contain';
	@tracked marginMm = 0;
	@tracked bleed = false;
	@tracked building = false;
	@tracked progress = 0;
	@tracked buildFailed = false;
	@tracked built: Built | null = null;
	@tracked readError = '';

	@tracked pdfFile: File | null = null;
	@tracked pdfPages: CanonPage[] = [];
	@tracked loading = false;
	@tracked dpi = DEFAULT_DPI;
	@tracked format: PageFormat = DEFAULT_FORMAT;
	@tracked quality = DEFAULT_QUALITY;
	@tracked rendering = false;
	@tracked renderProgress = 0;
	@tracked renderFailed = false;

	#pdf?: PDFDocumentProxy;
	#token = 0;
	#run = 0;
	#build = 0;
	#adding: Promise<void> = Promise.resolve();

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const size = query.get('i2pSize');
		const paper =
			size === MATCH_IMAGE_SIZE
				? size
				: paperSizeFor(size ?? '')?.id;
		if (paper) this.sizeId = paper;
		this.orientation =
			ORIENTATIONS[index(query, 'i2pOrientation', 3) ?? 0]!;
		this.fit = FITS[index(query, 'i2pFit', 3) ?? 0]!;
		this.marginMm =
			ranged(query, 'i2pMargin', 0, MAX_MARGIN_MM) ?? 0;
		this.bleed = query.get('i2pBleed') === '1';
		this.dpi =
			ranged(query, 'i2pResolution', MIN_DPI, MAX_DPI) ??
			DEFAULT_DPI;
		this.format = FORMATS[index(query, 'i2pFormat', 3) ?? 1]!;
		this.quality =
			(ranged(query, 'i2pQuality', 10, 100) ??
				DEFAULT_QUALITY * 100) / 100;
		if (query.has('i2pSample'))
			void drawnSamples().then(async (files) => {
				await this.add(files, 0);
				const sort = index(query, 'i2pSort', 2);
				if (sort !== undefined) this.sort(sort === 0);
				if (query.has('i2pRun')) this.export();
			});
	}

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#build++;
		this.#run++;
		for (const item of this.items) URL.revokeObjectURL(item.url);
		this.#closePdf();
	}

	get options(): Options {
		return {
			sizeId: this.sizeId,
			orientation: this.orientation,
			fit: this.fit,
			marginMm: this.marginMm,
			bleed: this.bleed,
		};
	}

	get toPdf() {
		return (
			this.router.currentRoute?.params?.['tool_id'] !==
			TO_IMAGES_ID
		);
	}

	get lossy() {
		return this.format !== 'png';
	}

	get formatIndex() {
		return FORMATS.indexOf(this.format);
	}

	get directionIndex() {
		return this.toPdf ? 0 : 1;
	}

	get orientationIndex() {
		return ORIENTATIONS.indexOf(this.orientation);
	}

	get fitIndex() {
		return FITS.indexOf(this.fit);
	}

	get matches() {
		return this.sizeId === MATCH_IMAGE_SIZE;
	}

	get blank() {
		return this.toPdf ? !this.items.length : !this.pdfFile;
	}

	get blankPages(): CanonPage[] {
		const size = this.toPdf ? blankPage(this.options).size : A4;
		return [{ size }];
	}

	get stripPages(): CanonPage[] {
		if (!this.toPdf) return this.pdfPages;
		const { options } = this;
		return this.items.map((item) => {
			const { page, area, placement } = layout(
				item.width,
				item.height,
				options,
			);
			return {
				size: page,
				area,
				placement,
				picture: item.url,
				name: item.name,
			};
		});
	}

	get reorders() {
		return this.toPdf && !this.building && this.items.length > 0;
	}

	get resultRow() {
		const { built } = this;
		if (!built) return null;
		return {
			name: 'images.pdf',
			detail: `${formatBytes(built.blob.size)} · ${pages(built.pages)}`,
		};
	}

	get pdfDetail() {
		const { pdfFile } = this;
		if (!pdfFile) return '';
		const parts = [formatBytes(pdfFile.size)];
		if (this.pdfPages.length)
			parts.push(pages(this.pdfPages.length));
		return parts.join(' · ');
	}

	get canZip() {
		return (
			!this.rendering &&
			this.pdfPages.length > 0 &&
			!!this.#pdf
		);
	}

	take = (files: File[]) => {
		const pdf = files.find(isPdf);
		const images = files.filter(isImage);
		if (images.length) {
			this.pickDirection(0);
			void this.add(images, Infinity);
		} else if (pdf) {
			this.pickDirection(1);
			void this.loadPdf(pdf);
		}
	};

	paste = (file: File) => this.take([file]);

	pickDirection = (index: number) => {
		if (index === this.directionIndex) return;
		void this.router.transitionTo(
			'tools.tool',
			index === 0 ? TO_PDF_ID : TO_IMAGES_ID,
		);
	};

	chooseImages = (files: File[]) =>
		void this.add(files.filter(isImage), Infinity);

	dropInStrip = (at: number, files: File[]) => void this.add(files, at);

	add(files: File[], at: number) {
		this.#adding = this.#adding.then(async () => {
			const results = await Promise.allSettled(
				files.map(loadItem),
			);
			if (this.isDestroyed) {
				for (const r of results)
					if (r.status === 'fulfilled')
						URL.revokeObjectURL(
							r.value.url,
						);
				return;
			}
			const loaded = results.flatMap((r) =>
				r.status === 'fulfilled' ? [r.value] : [],
			);
			const failed = results.find(
				(r): r is PromiseRejectedResult =>
					r.status === 'rejected',
			);
			this.readError = failed
				? (failed.reason as Error).message
				: '';
			if (!loaded.length) return;
			const next = [...this.items];
			next.splice(Math.min(at, next.length), 0, ...loaded);
			this.#setItems(next);
		});
		return this.#adding;
	}

	#setItems(next: Item[]) {
		const kept = new Set(next.map((item) => item.id));
		for (const item of this.items)
			if (!kept.has(item.id)) URL.revokeObjectURL(item.url);
		this.items = next;
		this.#changed();
	}

	move = (from: number, to: number) => {
		const next = [...this.items];
		const [item] = next.splice(from, 1);
		if (!item) return;
		next.splice(to, 0, item);
		this.#setItems(next);
	};

	#moveTo(id: number, start: boolean) {
		const from = this.items.findIndex((item) => item.id === id);
		if (from >= 0)
			this.move(from, start ? 0 : this.items.length - 1);
	}

	sort = (ascending: boolean) =>
		this.#setItems(sortedByName(this.items, ascending));
	sortUp = () => this.sort(true);
	sortDown = () => this.sort(false);

	clearImages = () => {
		this.readError = '';
		this.#setItems([]);
	};

	menu = (at: number): CanonPageMenuItem[] | undefined => {
		if (this.building) return undefined;
		if (!this.toPdf)
			return this.pdfFile
				? [
						{
							title: passAlong(
								'Download',
							),
							action: () =>
								void this.savePage(
									at,
								),
						},
					]
				: undefined;
		const item = this.items[at];
		if (!item) return undefined;
		return [
			{
				title: 'Move to start',
				action: () => this.#moveTo(item.id, true),
			},
			{
				title: 'Move to end',
				action: () => this.#moveTo(item.id, false),
			},
			{
				title: 'Remove',
				destructive: true,
				action: () =>
					this.#setItems(
						this.items.filter(
							(entry) =>
								entry.id !==
								item.id,
						),
					),
			},
		];
	};

	pickSize = (id: string) => {
		if (id === this.sizeId) return;
		this.sizeId = id;
		this.#changed();
	};

	pickOrientation = (at: number) => {
		this.orientation = ORIENTATIONS[at] ?? this.orientation;
		this.#changed();
	};

	pickFit = (at: number) => {
		this.fit = FITS[at] ?? this.fit;
		this.#changed();
	};

	setMargin = (mm: number) => {
		this.marginMm = mm;
		this.#changed();
	};

	setBleed = (on: boolean) => {
		this.bleed = on;
		this.#changed();
	};

	#changed() {
		this.#build++;
		this.building = false;
		this.buildFailed = false;
		this.built = null;
	}

	export = () => void this.#export();

	async #export() {
		if (this.building || !this.items.length) return;
		const build = ++this.#build;
		const items = this.items;
		this.building = true;
		this.progress = 0;
		this.buildFailed = false;
		try {
			const bytes = await buildPdf(
				items,
				this.options,
				(share) => {
					if (build === this.#build)
						this.progress = share;
				},
			);
			if (build !== this.#build) return;
			this.built = {
				blob: new Blob([new Uint8Array(bytes)], {
					type: 'application/pdf',
				}),
				pages: items.length,
			};
		} catch {
			if (build === this.#build) this.buildFailed = true;
		} finally {
			if (build === this.#build) this.building = false;
		}
	}

	save = () => {
		if (this.built) downloadBlob(this.built.blob, 'images.pdf');
	};

	loadPdfFile = (file: File) => {
		if (isPdf(file)) void this.loadPdf(file);
	};

	async loadPdf(file: File) {
		this.clearPdf();
		const token = this.#token;
		this.pdfFile = file;
		this.loading = true;
		try {
			let pdf: PDFDocumentProxy;
			try {
				pdf = await open(await file.arrayBuffer());
			} catch {
				if (token === this.#token)
					this.renderFailed = true;
				return;
			}
			if (token !== this.#token) return void pdf.destroy();
			this.#pdf = pdf;
			this.pdfPages = (await sizes(pdf)).map((size) => ({
				size,
			}));
			if (token !== this.#token) return;
			await thumbnails(
				pdf,
				() => token === this.#token,
				(at, picture) => {
					const next = [...this.pdfPages];
					next[at] = { ...next[at]!, picture };
					this.pdfPages = next;
				},
			);
		} finally {
			if (token === this.#token) this.loading = false;
		}
	}

	clearPdf = () => {
		this.#token++;
		this.#run++;
		this.#closePdf();
		this.pdfFile = null;
		this.pdfPages = [];
		this.loading = false;
		this.rendering = false;
		this.renderFailed = false;
	};

	#closePdf() {
		for (const page of this.pdfPages)
			if (page.picture) URL.revokeObjectURL(page.picture);
		void this.#pdf?.destroy();
		this.#pdf = undefined;
	}

	setDpi = (dpi: number) => {
		this.dpi = dpi;
	};

	pickFormat = (at: number) => {
		this.format = FORMATS[at] ?? this.format;
	};

	setQuality = (quality: number) => {
		this.quality = quality;
	};

	get stem() {
		return (this.pdfFile?.name ?? 'pages').replace(/\.pdf$/i, '');
	}

	async #render<T>(
		work: (
			pdf: PDFDocumentProxy,
			live: () => boolean,
		) => Promise<T>,
	) {
		const pdf = this.#pdf;
		if (!pdf || this.rendering) return undefined;
		const run = ++this.#run;
		const live = () => run === this.#run;
		this.rendering = true;
		this.renderProgress = 0;
		this.renderFailed = false;
		try {
			const result = await work(pdf, live);
			return live() ? result : undefined;
		} catch {
			if (live()) this.renderFailed = true;
			return undefined;
		} finally {
			if (live()) this.rendering = false;
		}
	}

	get zipProgress() {
		return this.rendering ? this.renderProgress : undefined;
	}

	cancelRender = () => {
		this.#run++;
		this.rendering = false;
	};

	#drawer() {
		const { dpi, format, quality, stem } = this;
		return async (pdf: PDFDocumentProxy, at: number) => {
			const blob = await pageImage(
				pdf,
				at,
				dpi,
				format,
				quality,
			);
			const name = `${stem}-page-${at + 1}.${extensionOf(blob)}`;
			return { name, blob };
		};
	}

	async savePage(at: number) {
		const draw = this.#drawer();
		const page = await this.#render((pdf) => draw(pdf, at));
		if (page) downloadBlob(page.blob, page.name);
	}

	get zipName() {
		return `${this.stem}-pages.zip`;
	}

	pageFiles = async () => {
		const draw = this.#drawer();
		const files = await this.#render(async (pdf, live) => {
			const pages = [];
			for (let at = 0; at < pdf.numPages && live(); at++) {
				pages.push(await draw(pdf, at));
				if (live())
					this.renderProgress =
						(at + 1) / pdf.numPages;
			}
			return pages;
		});
		return files ?? [];
	};

	<template>
		<CanonSplit
			class="image-to-pdf"
			@mainLeadsStacked={{true}}
			{{filePaste this.paste accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@height={{pageStripHeight}}
					@background="var(--canon-muted)"
				>
					{{#if this.loading}}
						<CanonLoader
							class="i2p-loader"
						/>
					{{else if this.blank}}
						<CanonPageStrip
							class="i2p-strip i2p-strip--blank"
							@pages={{this.blankPages}}
							@blank={{true}}
						/>
					{{else}}
						<CanonPageStrip
							class="i2p-strip"
							@pages={{this.stripPages}}
							@reorders={{this.reorders}}
							@onMove={{this.move}}
							@onDrop={{this.dropInStrip}}
							@menu={{this.menu}}
						/>
					{{/if}}
				</CanonCanvas>
			</:banner>
			<:sidebar>
				{{#if this.toPdf}}
					<CanonRows
						class="i2p-paper"
						@framed={{true}}
					>
						<CanonHeading
							@text="Page size"
						/>
						<PaperPopover
							class="i2p-size"
							@value={{this.sizeId}}
							@extra="Match image"
							@extraId={{MATCH_IMAGE_SIZE}}
							@label="Page size"
							@disabled={{this.building}}
							@onPick={{this.pickSize}}
						/>
						<CanonHeading
							@text="Orientation"
						/>
						<CanonSegmented
							class="i2p-orientation"
							@items={{orientationLabels}}
							@selected={{this.orientationIndex}}
							@disabled={{if
								this.matches
								true
								this.building
							}}
							@onChange={{this.pickOrientation}}
						/>
						<CanonHeading @text="Fit" />
						<CanonSegmented
							class="i2p-fit"
							@items={{fitLabels}}
							@selected={{this.fitIndex}}
							@disabled={{if
								this.matches
								true
								this.building
							}}
							@onChange={{this.pickFit}}
						/>
						<CanonHeading @text="Margin" />
						<CanonSlider
							class="i2p-margin"
							@value={{this.marginMm}}
							@max={{MAX_MARGIN_MM}}
							@step={{1}}
							@readout={{mmText}}
							@label="Margin"
							@onChange={{this.setMargin}}
						/>
						<CanonRow
							class="i2p-bleed"
							@title="Add 3mm bleed"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.bleed}}
								@onChange={{this.setBleed}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					</CanonRows>
					<CanonRows @framed={{true}}>
						<Job
							@title="Export PDF"
							@icon={{ExportIcon}}
							@failure="Build failed"
							@disabled={{if
								this.items.length
								false
								true
							}}
							@busy={{this.building}}
							@progress={{this.progress}}
							@failed={{this.buildFailed}}
							@result={{this.resultRow}}
							@onRun={{this.export}}
							@onSave={{this.save}}
						/>
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Resolution"
						/>
						<CanonSlider
							class="i2p-dpi"
							@value={{this.dpi}}
							@min={{MIN_DPI}}
							@max={{MAX_DPI}}
							@step={{DPI_STEP}}
							@readout={{dpiText}}
							@label="Resolution"
							@onChange={{this.setDpi}}
						/>
						<CanonHeading @text="Format" />
						<CanonSegmented
							class="i2p-format"
							@items={{formatLabels}}
							@selected={{this.formatIndex}}
							@disabled={{this.rendering}}
							@onChange={{this.pickFormat}}
						/>
						{{#if this.lossy}}
							<CanonHeading
								@text="Quality"
							/>
							<CanonSlider
								class="i2p-quality"
								@value={{this.quality}}
								@min={{0.1}}
								@max={{1}}
								@step={{0.05}}
								@label="Quality"
								@onChange={{this.setQuality}}
							/>
						{{/if}}
					</CanonRows>
					<CanonRows @framed={{true}}>
						<DownloadAll
							class="i2p-zip"
							@files={{this.pageFiles}}
							@zipName={{this.zipName}}
							@disabled={{if
								this.canZip
								false
								true
							}}
							@progress={{this.zipProgress}}
							@onCancel={{this.cancelRender}}
						/>
						{{#if this.renderFailed}}
							<CanonStatus
								class="i2p-render-failed"
								@text="Render failed"
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					</CanonRows>
				{{/if}}
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Direction" />
					<CanonSegmented
						class="i2p-direction"
						@items={{directions}}
						@selected={{this.directionIndex}}
						@disabled={{this.building}}
						@onChange={{this.pickDirection}}
					/>
				</CanonRows>
				{{#if this.toPdf}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Images" />
						<Slot
							class="i2p-images"
							@prompt="Drop images here"
							@icon="image-plus"
							@row={{true}}
							@multiple={{true}}
							@accept={{IMAGE_ACCEPT}}
							@over={{this.drop.over}}
							@onFiles={{this.chooseImages}}
						/>
						{{#if this.readError}}
							<CanonStatus
								class="i2p-read-error"
								@text={{this.readError}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
						<CanonGrid class="i2p-order">
							<CanonButton
								class="i2p-sort-up"
								@kind="cell"
								@text="A–Z"
								@icon={{SortUp}}
								@disabled={{if
									this.reorders
									false
									true
								}}
								@onClick={{this.sortUp}}
							/>
							<CanonButton
								class="i2p-sort-down"
								@kind="cell"
								@text="Z–A"
								@icon={{SortDown}}
								@disabled={{if
									this.reorders
									false
									true
								}}
								@onClick={{this.sortDown}}
							/>
							<CanonButton
								class="i2p-clear"
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{if
									this.reorders
									false
									true
								}}
								@onClick={{this.clearImages}}
							/>
						</CanonGrid>
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						{{#if this.pdfFile}}
							<CanonRow
								class="i2p-source"
								@title={{this.pdfFile.name}}
								@detail={{this.pdfDetail}}
								@form="flush"
							>
								<CanonButton
									@kind="cell"
									@text="Clear"
									@icon={{Trash}}
									@onClick={{this.clearPdf}}
								/>
							</CanonRow>
						{{else}}
							<Slot
								class="i2p-pdf"
								@prompt="Drop PDF here"
								@icon="file"
								@row={{true}}
								@accept={{PDF_ACCEPT}}
								@over={{this.drop.over}}
								@onFile={{this.loadPdfFile}}
							/>
						{{/if}}
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
