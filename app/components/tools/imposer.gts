import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { registerDestructor } from '@ember/destroyable';
import { modifier } from 'ember-modifier';
import type Owner from '@ember/owner';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	DEFAULT_IMPOSITION_CONFIG,
	DEFAULT_SIGNATURE_PAGES,
	DIRECTION_AWARE_LAYOUTS,
	DUPLEX_AWARE_LAYOUTS,
	IMPOSITION_LAYOUTS,
	MM_TO_POINTS,
	PAPER_SIZES,
	effectiveSheetH,
	effectiveSheetW,
	getLayoutById,
	imposePdf,
	turnsTopOverBottom,
	type ImpositionConfig,
	type ImpositionResult,
	type PaperSize,
} from 'delphitools-v2/lib/imposition';
import { paperSizeFor } from 'delphitools-v2/lib/paper-sizes';
import { formatBytes } from 'delphitools-v2/lib/pdf-compress';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Pager from 'delphitools-v2/components/tools/media/pager';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { open, sizes, thumbEdge } from 'delphitools-v2/lib/pdfjs';
import PaperPopover from 'delphitools-v2/components/tools/paper-sizes/popover';
import SheetPicture from 'delphitools-v2/components/tools/imposer/picture';
import SignatureBlock, {
	blockHeight,
} from 'delphitools-v2/components/tools/imposer/signatures';
import {
	render,
	samplePdf,
	sharpEdge,
} from 'delphitools-v2/components/tools/imposer/pages';
import {
	millimetres,
	printSheet,
	sideImage,
	signatures,
	type Fit,
	type Picture,
	type PrintSheet,
} from 'delphitools-v2/components/tools/imposer/sheet';
import './media/media.css';
import './imposer/imposer.css';

const ACCEPT = '.pdf,application/pdf';
const COPIES = [2, 4, 6, 8, 9];
const SCALINGS: Fit[] = ['fit', 'fill', 'actual'];
const SCALING_LABELS = ['Fit', 'Fill', 'Actual size'];
const FLIPS = ['long-edge', 'short-edge'] as const;
const FLIP_LABELS = ['Long edge', 'Short edge'];
const DIRECTION_LABELS = ['Left to right', 'Right to left'];
const ORIENTATIONS = ['portrait', 'landscape'] as const;
const ORIENTATION_LABELS = ['Portrait', 'Landscape'];
const NAMES: Record<string, string> = {
	'saddle-stitch': '2-up Saddle Stitch',
	'perfect-bind': '2-up Perfect Bind',
	'step-and-repeat': '2-up Step & Repeat',
	'four-up-booklet': '4-up Booklet',
	'gang-run': 'N-up Gang Run',
	'custom-nup': 'Custom N-up',
};
const LAYOUT_IDS = IMPOSITION_LAYOUTS.map((layout) => layout.id);
const LAYOUT_LABELS = LAYOUT_IDS.map((id) => NAMES[id] ?? id);
const FOLDED = new Set(['saddle-stitch', 'perfect-bind', 'step-and-repeat']);
const FALLBACK_PAPER = PAPER_SIZES[0]!;
const MIN_PAPER_MM = 50;
const MAX_PAPER_MM = 1000;
const STRIP_HEIGHT = 140;
const SHARP_LIMIT = 32;

const mm = (value: number) => `${Math.round(value)} mm`;
const tenths = (value: number) => `${value.toFixed(1)} mm`;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Printer = <template><IconSvg @name="printer" /></template>;
const Guide = <template><IconSvg @name="scissors-line-dashed" /></template>;

interface Output {
	blob: Blob;
	name: string;
	detail: string;
}

function typing(target: EventTarget | null) {
	return (
		target instanceof Element &&
		!!target.closest(
			'input, textarea, select, button, [contenteditable], [role="slider"], [role="spinbutton"], [role="radio"]',
		)
	);
}

export default class Imposer extends Component {
	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked file: File | null = null;
	@tracked pdfPageCount = 0;
	@tracked inferredPaper: {
		widthMm: number;
		heightMm: number;
		label: string;
	} | null = null;

	@tracked layoutId = DEFAULT_IMPOSITION_CONFIG.layoutId;
	@tracked paperSizeId = DEFAULT_IMPOSITION_CONFIG.paperSize.id;
	@tracked orientation = DEFAULT_IMPOSITION_CONFIG.orientation;
	@tracked marginMm = DEFAULT_IMPOSITION_CONFIG.marginMm;
	@tracked gutterMm = DEFAULT_IMPOSITION_CONFIG.gutterMm;
	@tracked creepMm = DEFAULT_IMPOSITION_CONFIG.creepMm;
	@tracked scaling: Fit = DEFAULT_IMPOSITION_CONFIG.scaling;
	@tracked cropMarks = DEFAULT_IMPOSITION_CONFIG.cropMarks;
	@tracked nUp = 4;
	@tracked customRows = 2;
	@tracked customCols = 2;
	@tracked signaturePages = DEFAULT_SIGNATURE_PAGES;
	@tracked duplexFlip: 'long-edge' | 'short-edge' = 'long-edge';
	@tracked rtl = false;
	@tracked blankPageCount = 12;

	@tracked activeSheet = 0;
	@tracked isFlipped = false;
	@tracked guideOpen = false;

	@tracked busy = false;
	@tracked failed = false;
	@tracked output: Output | null = null;

	@tracked stripPages: CanonPage[] = [];
	@tracked version = 0;
	@tracked stripVersion = 0;

	#bytes: Uint8Array | null = null;
	#pdf: PDFDocumentProxy | null = null;
	#thumbs = new Map<number, Picture>();
	#sharp = new Map<number, Picture>();
	#sharpening = new Set<number>();
	#pageSizes = new Map<number, { width: number; height: number }>();
	#token = 0;
	#job = 0;
	#stripTimer?: number;
	#stripDrawn = false;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const number = (name: string) =>
			query.has(name) ? Number(query.get(name)) : undefined;
		const layout = number('impLayout');
		if (layout !== undefined)
			this.setLayout(
				Math.min(
					5,
					Math.max(0, Math.trunc(layout) || 0),
				),
			);
		const duplex = number('impDuplex');
		if (duplex !== undefined)
			this.duplexFlip =
				duplex === 1 ? 'short-edge' : 'long-edge';
		this.rtl = number('impRtl') === 1;
		const orientation = number('impOrientation');
		if (orientation !== undefined)
			this.orientation =
				orientation === 0 ? 'portrait' : 'landscape';
		const pages = number('impPages');
		if (pages) this.blankPageCount = Math.max(1, Math.trunc(pages));
		const copies = number('impCopies');
		if (copies && COPIES.includes(copies)) this.nUp = copies;
		const creep = number('impCreep');
		if (creep !== undefined)
			this.creepMm = Math.min(2, Math.max(0, creep));
		const pagesPerSignature = number('impSignature');
		if (pagesPerSignature)
			this.signaturePages = Math.min(
				128,
				Math.max(4, Math.trunc(pagesPerSignature)),
			);
		const paper = query.get('impPaper')?.toLowerCase();
		const paperId =
			paper === 'infer'
				? paper
				: paper &&
					paperSizeFor(
						paper,
						MIN_PAPER_MM,
						MAX_PAPER_MM,
					)?.id;
		if (paperId) this.paperSizeId = paperId;
		const sheet = number('impSheet');
		if (sheet !== undefined) this.activeSheet = Math.max(0, sheet);
		this.isFlipped = query.has('impBack');
		if (query.has('impSample'))
			void samplePdf(this.blankPageCount).then((file) => {
				if (!this.file) this.#open(file, false);
			});
		const keys = (event: KeyboardEvent) => this.#key(event);
		document.addEventListener('keydown', keys);
		registerDestructor(this, () => {
			document.removeEventListener('keydown', keys);
			window.clearTimeout(this.#stripTimer);
			this.#close();
		});
	}

	get paperSize(): PaperSize {
		const inferred = this.inferredPaper;
		if (this.paperSizeId === 'infer' && inferred)
			return { id: 'infer', ...inferred };
		return (
			paperSizeFor(
				this.paperSizeId,
				MIN_PAPER_MM,
				MAX_PAPER_MM,
			) ?? FALLBACK_PAPER
		);
	}

	get duplexAware() {
		return DUPLEX_AWARE_LAYOUTS.has(this.layoutId);
	}

	get directionAware() {
		return DIRECTION_AWARE_LAYOUTS.has(this.layoutId);
	}

	get config(): ImpositionConfig {
		return {
			...DEFAULT_IMPOSITION_CONFIG,
			layoutId: this.layoutId,
			paperSize: this.paperSize,
			orientation: this.orientation,
			marginMm: this.marginMm,
			gutterMm: this.gutterMm,
			creepMm: this.creepMm,
			scaling: this.scaling,
			cropMarks: this.cropMarks,
			nUp:
				this.layoutId === 'gang-run'
					? this.nUp
					: undefined,
			customGrid:
				this.layoutId === 'custom-nup'
					? [this.customRows, this.customCols]
					: undefined,
			duplexFlip: this.duplexAware
				? this.duplexFlip
				: undefined,
			signaturePages:
				this.layoutId === 'perfect-bind'
					? this.signaturePages
					: undefined,
			rtl: this.rtl,
		};
	}

	get sourcePages() {
		return this.pdfPageCount || this.blankPageCount;
	}

	@cached
	get result(): ImpositionResult {
		const layout = getLayoutById(this.layoutId)!;
		return layout.calculate(this.sourcePages, this.config);
	}

	get sheetW() {
		return effectiveSheetW(this.paperSize, this.orientation);
	}

	get sheetH() {
		return effectiveSheetH(this.paperSize, this.orientation);
	}

	get layoutIndex() {
		return LAYOUT_IDS.indexOf(this.layoutId);
	}

	get useCase() {
		return getLayoutById(this.layoutId)?.useCase ?? '';
	}

	get isGangRun() {
		return this.layoutId === 'gang-run';
	}

	get isCustomGrid() {
		return this.layoutId === 'custom-nup';
	}

	get isPerfectBind() {
		return this.layoutId === 'perfect-bind';
	}

	get hasCreep() {
		return (
			this.layoutId === 'saddle-stitch' ||
			this.layoutId === 'perfect-bind'
		);
	}

	get inferTitle() {
		const inferred = this.inferredPaper?.label;
		return inferred ? `Infer (${inferred})` : 'Infer from PDF';
	}

	get orientationIndex() {
		return ORIENTATIONS.indexOf(this.orientation);
	}

	get scalingIndex() {
		return SCALINGS.indexOf(this.scaling);
	}

	get directionIndex() {
		return this.rtl ? 1 : 0;
	}

	get flipIndex() {
		return FLIPS.indexOf(this.duplexFlip);
	}

	get copiesIndex() {
		return COPIES.indexOf(this.nUp);
	}

	get copiesLabels() {
		return COPIES.map(String);
	}

	get loaded() {
		return this.file !== null;
	}

	get sourceName() {
		return this.file?.name ?? '';
	}

	get fileDetail() {
		return this.file ? formatBytes(this.file.size) : '';
	}

	load = (file: File) => {
		if (
			file.type !== 'application/pdf' &&
			!/\.pdf$/i.test(file.name)
		)
			return;
		this.#open(file, true);
	};

	#open(file: File, reset: boolean) {
		const kept = [this.activeSheet, this.isFlipped] as const;
		this.clear();
		const token = this.#token;
		this.file = file;
		if (!reset) [this.activeSheet, this.isFlipped] = kept;
		void this.#read(file, token);
	}

	async #read(file: File, token: number) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (token !== this.#token) return;
		this.#bytes = bytes;
		let pdf: PDFDocumentProxy;
		try {
			pdf = await open(bytes);
		} catch (error) {
			console.error('imposer: failed to load PDF', error);
			return;
		}
		if (token !== this.#token) return void pdf.destroy();
		this.#pdf = pdf;
		const points = await sizes(pdf);
		if (token !== this.#token) return;
		points.forEach((size, i) =>
			this.#pageSizes.set(i + 1, {
				width: size.width / MM_TO_POINTS,
				height: size.height / MM_TO_POINTS,
			}),
		);
		this.#infer(points[0]);
		this.pdfPageCount = pdf.numPages;
		for (let i = 0; i < pdf.numPages; i++) {
			const picture = await render(pdf, i, thumbEdge);
			if (token !== this.#token) return;
			if (picture) this.#thumbs.set(i + 1, picture);
			if (this.activePages.includes(i + 1)) this.version++;
			if ((i + 1) % 32 === 0 || i === pdf.numPages - 1)
				this.stripVersion++;
		}
	}

	#infer(size?: { width: number; height: number }) {
		if (!size) return;
		const wMm = size.width / MM_TO_POINTS;
		const hMm = size.height / MM_TO_POINTS;
		const match = PAPER_SIZES.find(
			(s) =>
				(Math.abs(s.widthMm - wMm) < 2 &&
					Math.abs(s.heightMm - hMm) < 2) ||
				(Math.abs(s.widthMm - hMm) < 2 &&
					Math.abs(s.heightMm - wMm) < 2),
		);
		this.inferredPaper = {
			widthMm: Math.round(wMm * 10) / 10,
			heightMm: Math.round(hMm * 10) / 10,
			label: match
				? match.label
				: `${Math.round(wMm)} × ${Math.round(hMm)} mm`,
		};
	}

	clear = () => {
		this.#token++;
		this.#close();
		this.#invalidate();
		this.file = null;
		this.pdfPageCount = 0;
		this.inferredPaper = null;
		this.version++;
		this.stripVersion++;
		this.#resetNavigation();
	};

	#close() {
		void this.#pdf?.destroy();
		this.#pdf = null;
		this.#bytes = null;
		this.#thumbs.clear();
		this.#sharp.clear();
		this.#sharpening.clear();
		this.#pageSizes.clear();
	}

	#invalidate() {
		this.#job++;
		this.busy = false;
		this.failed = false;
		this.output = null;
	}

	#resetNavigation() {
		this.activeSheet = 0;
		this.isFlipped = false;
	}

	setLayout = (index: number) => {
		const id = LAYOUT_IDS[index];
		if (!id) return;
		this.layoutId = id;
		if (FOLDED.has(id)) this.orientation = 'landscape';
		this.#resetNavigation();
		this.#invalidate();
	};

	setBlankPages = (value: number) => {
		this.blankPageCount = value;
		this.#resetNavigation();
	};

	setPaper = (id: string) => {
		this.paperSizeId = id;
		this.#invalidate();
	};

	setOrientation = (index: number) => {
		this.orientation = ORIENTATIONS[index] ?? 'landscape';
		this.#invalidate();
	};

	setScaling = (index: number) => {
		this.scaling = SCALINGS[index] ?? 'fit';
		this.#invalidate();
	};

	setDirection = (index: number) => {
		this.rtl = index === 1;
		this.#invalidate();
	};

	setFlip = (index: number) => {
		this.duplexFlip = FLIPS[index] ?? 'long-edge';
		this.#invalidate();
	};

	setCopies = (index: number) => {
		this.nUp = COPIES[index] ?? 4;
		this.#invalidate();
	};

	setSignaturePages = (value: number) => {
		this.signaturePages = value;
		this.#invalidate();
	};

	setRows = (value: number) => {
		this.customRows = value;
		this.#invalidate();
	};

	setColumns = (value: number) => {
		this.customCols = value;
		this.#invalidate();
	};

	setMargin = (value: number) => {
		this.marginMm = value;
		this.#invalidate();
	};

	setGutter = (value: number) => {
		this.gutterMm = value;
		this.#invalidate();
	};

	setCreep = (value: number) => {
		this.creepMm = Math.round(value * 10) / 10;
		this.#invalidate();
	};

	setCropMarks = (on: boolean) => {
		this.cropMarks = on;
		this.#invalidate();
	};

	get totalSheets() {
		return this.result.totalSheets;
	}

	get sheetIndex() {
		return Math.min(
			this.activeSheet,
			Math.max(0, this.totalSheets - 1),
		);
	}

	get activeSheetData() {
		return this.result.sheets[this.sheetIndex];
	}

	#side(
		back: boolean,
		sheet = this.activeSheetData,
	): PrintSheet | undefined {
		if (!sheet) return undefined;
		return printSheet(back ? sheet.back : sheet.front, {
			layoutId: this.layoutId,
			width: this.sheetW,
			height: this.sheetH,
			cropMarks: this.cropMarks,
			back,
		});
	}

	get front() {
		return this.#side(false);
	}

	get back() {
		return this.#side(true);
	}

	get activePages() {
		const sheet = this.activeSheetData;
		if (!sheet) return [];
		return [
			...new Set(
				[...sheet.front, ...sheet.back]
					.map((p) => p.pageNumber)
					.filter((n) => n > 0),
			),
		];
	}

	get paintOptions() {
		void this.version;
		const pictures = new Map<number, Picture>();
		for (const page of this.activePages) {
			const picture =
				this.#sharp.get(page) ?? this.#thumbs.get(page);
			if (picture) pictures.set(page, picture);
		}
		return {
			pictures,
			fit: this.scaling,
			pageSizes: this.#pageSizes,
		};
	}

	get axis(): 'x' | 'y' {
		return this.duplexAware && turnsTopOverBottom(this.config)
			? 'x'
			: 'y';
	}

	get legend() {
		const side = this.isFlipped ? 'Back' : 'Front';
		return `Sheet ${this.sheetIndex + 1} — ${side}`;
	}

	get detail() {
		const blanks = this.result.blanksAdded;
		let detail = `${this.sourcePages} pages`;
		if (blanks > 0)
			detail += ` · ${blanks} blank${blanks === 1 ? '' : 's'} added`;
		return detail;
	}

	get total() {
		return String(this.totalSheets);
	}

	get totalUnit() {
		return this.totalSheets === 1 ? 'Sheet' : 'Sheets';
	}

	get stripSelected() {
		return this.sheetIndex * 2 + (this.isFlipped ? 1 : 0);
	}

	get showsBlock() {
		return this.hasCreep;
	}

	get signatures() {
		return signatures(this.result.sheets);
	}

	get tiles() {
		const cell = this.result.sheets[0]?.front[0];
		return [
			{
				label: 'Sheet',
				value: millimetres(this.sheetW, this.sheetH),
			},
			{
				label: 'Cell',
				value: cell
					? millimetres(cell.width, cell.height)
					: '—',
			},
		];
	}

	show(sheet: number, back: boolean) {
		if (sheet < 0 || sheet >= this.totalSheets) return;
		this.activeSheet = sheet;
		this.isFlipped = back;
	}

	pickSignature = (sheet: number) => this.show(sheet, false);

	pickSide = (index: number) =>
		this.show(Math.floor(index / 2), index % 2 === 1);

	flip = () => {
		this.isFlipped = !this.isFlipped;
	};

	step = (delta: number) => this.show(this.sheetIndex + delta, false);

	#key(event: KeyboardEvent) {
		if (typing(event.target) || event.metaKey || event.ctrlKey)
			return;
		if (event.key === 'ArrowLeft') this.step(-1);
		else if (event.key === 'ArrowRight') this.step(1);
		else if (event.key === ' ') this.flip();
		else return;
		event.preventDefault();
	}

	sharpen = modifier((_element: Element, [pages]: [number[]]) => {
		const pdf = this.#pdf;
		if (!pdf) return;
		const missing = pages.filter(
			(page) =>
				!this.#sharp.has(page) &&
				!this.#sharpening.has(page),
		);
		if (!missing.length) return;
		// ponytail: keeps one sheet's worth; a recency cache if paging back and forth re-renders too often
		if (this.#sharp.size > SHARP_LIMIT)
			for (const page of [...this.#sharp.keys()])
				if (!pages.includes(page))
					this.#sharp.delete(page);
		const token = this.#token;
		for (const page of missing) this.#sharpening.add(page);
		void (async () => {
			for (const page of missing) {
				const picture = await render(
					pdf,
					page - 1,
					sharpEdge,
				);
				if (token !== this.#token) return;
				this.#sharpening.delete(page);
				if (picture) this.#sharp.set(page, picture);
			}
			this.version++;
		})();
	});

	strip = modifier(
		(
			_element: Element,
			[result, , version]: [
				ImpositionResult,
				ImpositionConfig,
				number,
			],
		) => {
			void version;
			window.clearTimeout(this.#stripTimer);
			const delay = this.#stripDrawn ? 120 : 0;
			this.#stripDrawn = true;
			const sides = result.sheets.flatMap((sheet) =>
				[false, true].map((back) => ({
					sheet: this.#side(back, sheet)!,
					name: `Sheet ${sheet.sheetNumber} — ${back ? 'Back' : 'Front'}`,
				})),
			);
			const options = {
				pictures: new Map(this.#thumbs),
				fit: this.scaling,
				pageSizes: this.#pageSizes,
			};
			const size = {
				width: this.sheetW,
				height: this.sheetH,
			};
			this.#stripTimer = window.setTimeout(() => {
				const density = Math.min(
					window.devicePixelRatio || 1,
					sides.length > 100 ? 1 : 2,
				);
				this.stripPages = sides.map(
					({ sheet, name }) => ({
						size,
						name,
						picture: sideImage(
							sheet,
							STRIP_HEIGHT,
							density,
							options,
						),
					}),
				);
			}, delay);
		},
	);

	get exportDisabled() {
		return !this.loaded || this.pdfPageCount === 0;
	}

	get fileName() {
		return `imposed-${this.layoutId}-${this.paperSizeId}.pdf`;
	}

	run = () => void this.#export();

	async #export() {
		const bytes = this.#bytes;
		if (!bytes || this.busy) return;
		const job = ++this.#job;
		this.busy = true;
		this.failed = false;
		this.output = null;
		try {
			const out = await imposePdf(bytes, this.config);
			if (job !== this.#job) return;
			const blob = new Blob([new Uint8Array(out)], {
				type: 'application/pdf',
			});
			const pages = this.totalSheets * 2;
			this.output = {
				blob,
				name: this.fileName,
				detail: `${pages} pages · ${formatBytes(blob.size)}`,
			};
		} catch (error) {
			if (job !== this.#job) return;
			console.error(
				'imposer: failed to generate imposed PDF',
				error,
			);
			this.failed = true;
		} finally {
			if (job === this.#job) this.busy = false;
		}
	}

	save = () => {
		if (this.output)
			downloadBlob(this.output.blob, this.output.name);
	};

	toggleGuide = () => {
		this.guideOpen = !this.guideOpen;
	};

	get flipEdge() {
		return this.duplexFlip === 'short-edge'
			? 'short edge'
			: 'long edge';
	}

	get showsNesting() {
		return (
			this.layoutId === 'saddle-stitch' ||
			this.layoutId === 'four-up-booklet'
		);
	}

	get printSteps() {
		const edge = this.flipEdge;
		return this.result.sheets.map((sheet) => {
			const pdfPage = (sheet.sheetNumber - 1) * 2 + 1;
			return {
				number: sheet.sheetNumber,
				front: `Print PDF page ${pdfPage}`,
				frontNote: ` (Sheet ${sheet.sheetNumber} front).`,
				backBefore: 'Flip the paper along the ',
				edge,
				backAfter: `, then print PDF page ${pdfPage + 1} (Sheet ${sheet.sheetNumber} back).`,
			};
		});
	}

	<template>
		<CanonSplit
			class="imposer"
			@mainLeadsStacked={{true}}
			{{filePaste this.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					class="imp-strip"
					@height={{pageStripHeight}}
					@background="var(--canon-muted)"
					{{this.strip
						this.result
						this.config
						this.stripVersion
					}}
				>
					<CanonPageStrip
						@pages={{this.stripPages}}
						@selected={{this.stripSelected}}
						@onSelect={{this.pickSide}}
						@empty="Sheets"
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="imp-source"
							@title={{this.sourceName}}
							@detail={{this.fileDetail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<Slot
							class="imp-slot"
							@prompt="Drop PDF here"
							@icon="layers"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.load}}
						/>
					{{/if}}
					<CanonRow
						class="imp-pages"
						@title="Pages"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.sourcePages}}
							@min={{if
								this.loaded
								1
								4
							}}
							@max={{if
								this.loaded
								100000
								1000
							}}
							@step={{4}}
							@labelledBy={{titleId}}
							@disabled={{this.loaded}}
							@onChange={{this.setBlankPages}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Layout" />
					<CanonSegmented
						class="imp-layouts"
						@items={{LAYOUT_LABELS}}
						@columns={{2}}
						@selected={{this.layoutIndex}}
						@onChange={{this.setLayout}}
					/>
					<CanonStatus
						class="imp-use"
						@text={{this.useCase}}
						@tone="muted"
						@row={{true}}
					/>
					{{#if this.isPerfectBind}}
						<CanonRow
							class="imp-signature-pages"
							@title="Pages per signature"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.signaturePages}}
								@min={{4}}
								@max={{128}}
								@step={{4}}
								@labelledBy={{titleId}}
								@onChange={{this.setSignaturePages}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.directionAware}}
						<CanonHeading
							@text="Reading direction"
						/>
						<CanonSegmented
							class="imp-direction"
							@items={{DIRECTION_LABELS}}
							@selected={{this.directionIndex}}
							@onChange={{this.setDirection}}
						/>
					{{/if}}
					{{#if this.duplexAware}}
						<CanonHeading
							@text="Duplex flip"
						/>
						<CanonSegmented
							class="imp-duplex"
							@items={{FLIP_LABELS}}
							@selected={{this.flipIndex}}
							@onChange={{this.setFlip}}
						/>
					{{/if}}
					{{#if this.isGangRun}}
						<CanonHeading
							@text="Copies per sheet"
						/>
						<CanonSegmented
							class="imp-copies"
							@items={{this.copiesLabels}}
							@selected={{this.copiesIndex}}
							@onChange={{this.setCopies}}
						/>
					{{/if}}
					{{#if this.isCustomGrid}}
						<CanonRow
							class="imp-rows"
							@title="Rows"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.customRows}}
								@min={{1}}
								@max={{10}}
								@labelledBy={{titleId}}
								@onChange={{this.setRows}}
							/>
						</CanonRow>
						<CanonRow
							class="imp-columns"
							@title="Columns"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.customCols}}
								@min={{1}}
								@max={{10}}
								@labelledBy={{titleId}}
								@onChange={{this.setColumns}}
							/>
						</CanonRow>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Paper" />
					<PaperPopover
						class="imp-paper-menu"
						@value={{this.paperSizeId}}
						@extra={{this.inferTitle}}
						@extraId="infer"
						@min={{MIN_PAPER_MM}}
						@max={{MAX_PAPER_MM}}
						@label="Paper"
						@onPick={{this.setPaper}}
					/>
					<CanonHeading @text="Orientation" />
					<CanonSegmented
						class="imp-orientation"
						@items={{ORIENTATION_LABELS}}
						@selected={{this.orientationIndex}}
						@onChange={{this.setOrientation}}
					/>
					<CanonHeading @text="Scaling" />
					<CanonSegmented
						class="imp-scaling"
						@items={{SCALING_LABELS}}
						@selected={{this.scalingIndex}}
						@onChange={{this.setScaling}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Spacing" />
					<CanonRow
						class="imp-margin"
						@title="Margin"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.marginMm}}
							@min={{0}}
							@max={{20}}
							@step={{1}}
							@readout={{mm}}
							@labelledBy={{titleId}}
							@onChange={{this.setMargin}}
						/>
					</CanonRow>
					<CanonRow
						class="imp-gutter"
						@title="Gutter"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.gutterMm}}
							@min={{0}}
							@max={{10}}
							@step={{1}}
							@readout={{mm}}
							@labelledBy={{titleId}}
							@onChange={{this.setGutter}}
						/>
					</CanonRow>
					{{#if this.hasCreep}}
						<CanonRow
							class="imp-creep"
							@title="Creep"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.creepMm}}
								@min={{0}}
								@max={{2}}
								@step={{0.1}}
								@readout={{tenths}}
								@labelledBy={{titleId}}
								@onChange={{this.setCreep}}
							/>
						</CanonRow>
					{{/if}}
					<CanonRow
						class="imp-marks"
						@title="Crop marks"
						as |titleId|
					>
						<CanonSwitch
							@on={{this.cropMarks}}
							@onChange={{this.setCropMarks}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<Job
						@title="Export PDF"
						@icon={{Printer}}
						@failure="Failed"
						@disabled={{this.exportDisabled}}
						@busy={{this.busy}}
						@failed={{this.failed}}
						@result={{this.output}}
						@onRun={{this.run}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonCanvas
					class="imp-sheet"
					@fitting={{true}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
					{{this.sharpen this.activePages}}
				>
					<SheetPicture
						@front={{this.front}}
						@back={{this.back}}
						@options={{this.paintOptions}}
						@version={{this.version}}
						@legend={{this.legend}}
						@detail={{this.detail}}
						@total={{this.total}}
						@unit={{this.totalUnit}}
						@showsBack={{this.isFlipped}}
						@axis={{this.axis}}
						@onFlip={{this.flip}}
					/>
				</CanonCanvas>
				{{#if this.showsBlock}}
					<CanonCanvas
						class="imp-signatures"
						@height={{blockHeight}}
						@boxing="unlessWide"
						@background="var(--canon-muted)"
					>
						<SignatureBlock
							@signatures={{this.signatures}}
							@lit={{this.sheetIndex}}
							@glued={{this.isPerfectBind}}
							@onSelect={{this.pickSignature}}
						/>
					</CanonCanvas>
				{{/if}}
				<Pager
					@page={{this.sheetIndex}}
					@count={{this.totalSheets}}
					@previous="Previous sheet"
					@next="Next sheet"
					@onStep={{this.step}}
				/>
				<CanonRows @framed={{true}}>
					<CanonTiles
						class="imp-tiles"
						@items={{this.tiles}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonButton
						class="imp-guide-toggle"
						@text="Print Guide"
						@icon={{Guide}}
						@onClick={{this.toggleGuide}}
						aria-expanded={{if
							this.guideOpen
							"true"
							"false"
						}}
					/>
					{{#if this.guideOpen}}
						<CanonHeading
							@text="Manual Duplex Printing Guide"
						/>
						<p class="imp-guide-intro">If
							your printer does not
							support automatic
							duplex, follow these
							steps. The imposed PDF
							alternates front and
							back pages (page 1 =
							Sheet 1 front, page 2 =
							Sheet 1 back, etc.).</p>
						<ol class="imp-guide-steps">
							{{#each
								this.printSteps
								key="number"
								as |step|
							}}
								<li>
									<span
										class="imp-guide-front"
									>{{step.front}}</span>{{step.frontNote}}
									<span
										class="imp-guide-back"
									>{{step.backBefore}}<strong
										>{{step.edge}}</strong>{{step.backAfter}}</span>
								</li>
							{{/each}}
						</ol>
						{{#if this.showsNesting}}
							<p
								class="imp-guide-note"
							>After printing all
								sheets, nest
								them together
								(Sheet 1
								outermost) and
								staple along the
								spine fold.</p>
						{{/if}}
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
