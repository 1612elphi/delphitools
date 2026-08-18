import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { guidFor } from '@ember/object/internals';
import { htmlSafe } from '@ember/template';
import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';

import type { TOC } from '@ember/component/template-only';
import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import Icon from 'delphitools-v2/components/icon';
import PaperSizeCombobox from 'delphitools-v2/components/ui/paper-size-combobox';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from 'delphitools-v2/components/ui/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import {
	DUPLEX_AWARE_LAYOUTS,
	IMPOSITION_LAYOUTS,
	MM_TO_POINTS,
	PAPER_SIZES,
	getLayoutById,
	getOuterEdges,
	type ImpositionConfig,
	type ImpositionResult,
	type PagePlacement,
	type PaperSize,
} from 'delphitools-v2/lib/imposition';
import { findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import { loadPdfDocument } from 'delphitools-v2/lib/pdfjs';
import filePaste from 'delphitools-v2/modifiers/file-paste';

type EmbeddedPage = Awaited<ReturnType<PDFDocument['embedPages']>>[number];
type PdfPage = ReturnType<PDFDocument['addPage']>;
type Degrees = typeof import('pdf-lib').degrees;

const GANG_RUN_OPTIONS = [2, 4, 6, 8, 9];

const SCALING_OPTIONS = [
	{ value: 'fit', label: 'Fit (no crop)' },
	{ value: 'fill', label: 'Fill (may crop)' },
	{ value: 'actual', label: 'Actual size' },
];

const LAYOUT_ICONS: Record<string, string> = {
	'saddle-stitch': 'book-open',
	'perfect-bind': 'library',
	'step-and-repeat': 'copy',
	'four-up-booklet': 'book-marked',
	'gang-run': 'layout-grid',
	'custom-nup': 'grid-3x3',
};

const LAYOUT_OPTIONS = IMPOSITION_LAYOUTS.map((layout) => ({
	id: layout.id,
	name: layout.name,
	description: layout.description,
	useCase: layout.useCase,
	icon: LAYOUT_ICONS[layout.id] ?? 'layers',
}));

/** Layouts whose sheet is folded down the centre rather than cut apart. */
const FOLD_LAYOUTS = new Set([
	'saddle-stitch',
	'perfect-bind',
	'step-and-repeat',
]);

const FALLBACK_PAPER = PAPER_SIZES[0]!;

/** Preview canvas width in pixels; the height follows the sheet's aspect. */
const PREVIEW_WIDTH = 480;

function clampGrid(raw: string): number {
	return Math.max(1, Math.min(10, parseInt(raw, 10) || 1));
}

function effectiveSheetW(
	paperSize: PaperSize,
	orientation: 'portrait' | 'landscape',
): number {
	return orientation === 'landscape'
		? Math.max(paperSize.widthMm, paperSize.heightMm)
		: Math.min(paperSize.widthMm, paperSize.heightMm);
}

function effectiveSheetH(
	paperSize: PaperSize,
	orientation: 'portrait' | 'landscape',
): number {
	return orientation === 'landscape'
		? Math.min(paperSize.widthMm, paperSize.heightMm)
		: Math.max(paperSize.widthMm, paperSize.heightMm);
}

/**
 * Crop mark arms at one corner. Each arm is toggled separately so only the arms
 * pointing at the sheet edge are drawn, never the ones pointing into a gutter.
 */
function drawCropMarkArms(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	len: number,
	drawHorizontal: boolean,
	drawVertical: boolean,
) {
	if (!drawHorizontal && !drawVertical) return;
	ctx.beginPath();
	if (drawHorizontal) {
		ctx.moveTo(x - len, y);
		ctx.lineTo(x, y);
		ctx.moveTo(x + len, y);
		ctx.lineTo(x, y);
	}
	if (drawVertical) {
		ctx.moveTo(x, y - len);
		ctx.lineTo(x, y);
		ctx.moveTo(x, y + len);
		ctx.lineTo(x, y);
	}
	ctx.stroke();
}

function drawPlacementsOnPage(
	page: PdfPage,
	placements: PagePlacement[],
	embeddedPages: EmbeddedPage[],
	sheetHPt: number,
	degrees: Degrees,
) {
	for (const p of placements) {
		if (p.pageNumber === 0) continue;
		const embedded = embeddedPages[p.pageNumber - 1];
		if (!embedded) continue;

		const xPt = p.x * MM_TO_POINTS;
		const wPt = p.width * MM_TO_POINTS;
		const hPt = p.height * MM_TO_POINTS;
		const yPt = sheetHPt - (p.y * MM_TO_POINTS + hPt);

		if (p.rotation === 0) {
			page.drawPage(embedded, {
				x: xPt,
				y: yPt,
				width: wPt,
				height: hPt,
			});
		} else if (p.rotation === 180) {
			page.drawPage(embedded, {
				x: xPt + wPt,
				y: yPt + hPt,
				width: wPt,
				height: hPt,
				rotate: degrees(180),
			});
		} else if (p.rotation === 90) {
			page.drawPage(embedded, {
				x: xPt + wPt,
				y: yPt,
				width: hPt,
				height: wPt,
				rotate: degrees(90),
			});
		} else if (p.rotation === 270) {
			page.drawPage(embedded, {
				x: xPt,
				y: yPt + hPt,
				width: hPt,
				height: wPt,
				rotate: degrees(270),
			});
		}
	}
}

function drawPdfMarkH(
	page: PdfPage,
	x: number,
	y: number,
	dir: number,
	offset: number,
	len: number,
) {
	page.drawLine({
		start: { x: x + dir * offset, y },
		end: { x: x + dir * (offset + len), y },
		thickness: 0.25,
	});
}

function drawPdfMarkV(
	page: PdfPage,
	x: number,
	y: number,
	dir: number,
	offset: number,
	len: number,
) {
	page.drawLine({
		start: { x, y: y + dir * offset },
		end: { x, y: y + dir * (offset + len) },
		thickness: 0.25,
	});
}

function drawCropMarksOnPdfPage(
	page: PdfPage,
	placements: PagePlacement[],
	sheetHPt: number,
) {
	// 18pt is a quarter inch, the trim-mark length every prepress house expects.
	const markLen = 18;
	const offset = 3;

	const edges = getOuterEdges(placements);

	placements.forEach((p, i) => {
		const e = edges[i];
		if (!e) return;

		const x1 = p.x * MM_TO_POINTS;
		const x2 = (p.x + p.width) * MM_TO_POINTS;
		const y1Pdf = sheetHPt - p.y * MM_TO_POINTS;
		const y2Pdf = sheetHPt - (p.y + p.height) * MM_TO_POINTS;

		if (e.left) drawPdfMarkH(page, x1, y1Pdf, -1, offset, markLen);
		if (e.top) drawPdfMarkV(page, x1, y1Pdf, 1, offset, markLen);
		if (e.right) drawPdfMarkH(page, x2, y1Pdf, 1, offset, markLen);
		if (e.top) drawPdfMarkV(page, x2, y1Pdf, 1, offset, markLen);
		if (e.left) drawPdfMarkH(page, x1, y2Pdf, -1, offset, markLen);
		if (e.bottom)
			drawPdfMarkV(page, x1, y2Pdf, -1, offset, markLen);
		if (e.right) drawPdfMarkH(page, x2, y2Pdf, 1, offset, markLen);
		if (e.bottom)
			drawPdfMarkV(page, x2, y2Pdf, -1, offset, markLen);
	});
}

interface MarkLine {
	x1: string;
	y1: string;
	x2: string;
	y2: string;
}

/** The same outer-edge crop marks as the canvas path, in percentage SVG units. */
function cropMarkLines(
	placements: PagePlacement[],
	sheetW: number,
	sheetH: number,
): MarkLine[] {
	const edges = getOuterEdges(placements);
	const ml = 2.5;
	const lines: MarkLine[] = [];
	const push = (x1: number, y1: number, x2: number, y2: number) =>
		lines.push({
			x1: `${x1}%`,
			y1: `${y1}%`,
			x2: `${x2}%`,
			y2: `${y2}%`,
		});

	placements.forEach((p, i) => {
		const e = edges[i];
		if (!e) return;
		const x1 = (p.x / sheetW) * 100;
		const y1 = (p.y / sheetH) * 100;
		const x2 = ((p.x + p.width) / sheetW) * 100;
		const y2 = ((p.y + p.height) / sheetH) * 100;

		if (e.left) push(x1 - ml, y1, x1, y1);
		if (e.top) push(x1, y1 - ml, x1, y1);
		if (e.right) push(x2 + ml, y1, x2, y1);
		if (e.top) push(x2, y1 - ml, x2, y1);
		if (e.left) push(x1 - ml, y2, x1, y2);
		if (e.bottom) push(x1, y2 + ml, x1, y2);
		if (e.right) push(x2 + ml, y2, x2, y2);
		if (e.bottom) push(x2, y2 + ml, x2, y2);
	});

	return lines;
}

interface BlankCell {
	style: ReturnType<typeof htmlSafe>;
	isBlank: boolean;
	pageNumber: number;
	rotationLabel: string;
	dims: string;
}

function blankCells(
	placements: PagePlacement[],
	sheetW: number,
	sheetH: number,
	background: string,
): BlankCell[] {
	return placements.map((p) => ({
		style: htmlSafe(
			`left:${(p.x / sheetW) * 100}%;` +
				`top:${(p.y / sheetH) * 100}%;` +
				`width:${(p.width / sheetW) * 100}%;` +
				`height:${(p.height / sheetH) * 100}%;` +
				`background-color:${p.pageNumber === 0 ? '#f0f0f0' : background};`,
		),
		isBlank: p.pageNumber === 0,
		pageNumber: p.pageNumber,
		rotationLabel: p.rotation === 0 ? '' : `${p.rotation}°`,
		dims: `${p.width.toFixed(1)} × ${p.height.toFixed(1)} mm`,
	}));
}

/**
 * Repaints the canvas whenever the tracked state the paint function reads
 * changes — a function modifier re-runs on any tracked value consumed in its
 * body, which is what the React version spent a useEffect dependency list on.
 */
const paintFace = modifier(
	(
		canvas: HTMLCanvasElement,
		[paint]: [(canvas: HTMLCanvasElement) => void],
	) => {
		paint(canvas);
	},
);

interface BlankSheetFaceSignature {
	Args: {
		cells: BlankCell[];
		marks: MarkLine[];
		showFoldV: boolean;
		showFoldH: boolean;
	};
}

/** The DOM template preview, used instead of the canvas when no PDF is loaded. */
const BlankSheetFace: TOC<BlankSheetFaceSignature> = <template>
	<div class="dt-imp-sheet">
		<svg class="dt-imp-marks">
			{{#each @marks key="@index" as |mark|}}
				<line
					x1={{mark.x1}}
					y1={{mark.y1}}
					x2={{mark.x2}}
					y2={{mark.y2}}
				/>
			{{/each}}
		</svg>

		{{#if @showFoldV}}
			<div class="dt-imp-fold is-v"></div>
		{{/if}}
		{{#if @showFoldH}}
			<div class="dt-imp-fold is-h"></div>
		{{/if}}

		{{#each @cells key="@index" as |cell|}}
			<div class="dt-imp-cell" style={{cell.style}}>
				{{#if cell.isBlank}}
					{{! wording carried over from the Next app }}
					<span
						class="dt-imp-cell-blank"
					>blank</span>
				{{else}}
					<span
						class="dt-imp-cell-number"
					>{{cell.pageNumber}}</span>
					{{#if cell.rotationLabel}}
						<span
							class="dt-imp-cell-meta"
						>{{cell.rotationLabel}}</span>
					{{/if}}
					<span
						class="dt-imp-cell-dims"
					>{{cell.dims}}</span>
				{{/if}}
			</div>
		{{/each}}
	</div>
</template>;

interface LabelWithInfoSignature {
	Args: { label: string; info: string };
}

const LabelWithInfo: TOC<LabelWithInfoSignature> = <template>
	<span class="dt-imp-labelinfo">
		<span class="dt-imp-label">{{@label}}</span>
		<Popover>
			<PopoverTrigger
				class="dt-imp-info"
				aria-label="Explain"
			>
				<Icon @name="info" />
			</PopoverTrigger>
			<PopoverContent @side="top" class="dt-imp-infopanel">
				{{@info}}
			</PopoverContent>
		</Popover>
	</span>
</template>;

interface SliderWithInfoSignature {
	Args: {
		label: string;
		info: string;
		value: number;
		onChange: (value: number) => void;
		min: number;
		max: number;
		step: number;
		unit: string;
		decimals?: number;
	};
}

class SliderWithInfo extends Component<SliderWithInfoSignature> {
	get readout(): string {
		const { value, unit, decimals } = this.args;
		return `${value.toFixed(decimals ?? 0)}${unit}`;
	}

	handleInput = (event: Event) => {
		this.args.onChange(
			Number((event.target as HTMLInputElement).value),
		);
	};

	<template>
		<div class="dt-imp-slider">
			<div class="dt-imp-slider-head">
				<LabelWithInfo
					@label={{@label}}
					@info={{@info}}
				/>
				<span
					class="dt-imp-slider-value"
				>{{this.readout}}</span>
			</div>
			<input
				type="range"
				class="dt-imp-range"
				aria-label={{@label}}
				min={{@min}}
				max={{@max}}
				step={{@step}}
				value={{@value}}
				{{on "input" this.handleInput}}
			/>
		</div>
	</template>
}

export default class ImposerTool extends Component {
	@tracked pdfBytes: Uint8Array | null = null;
	@tracked pdfFileName = '';
	@tracked pdfPageCount = 0;
	@tracked pdfDoc: PDFDocumentProxy | null = null;

	@tracked layoutId = 'saddle-stitch';
	@tracked paperSizeId = 'a4';
	@tracked orientation: 'portrait' | 'landscape' = 'landscape';
	@tracked marginMm = 5;
	@tracked gutterMm = 2;
	@tracked creepMm = 0;
	@tracked scaling: 'fit' | 'fill' | 'actual' = 'fit';
	@tracked blankHandling: 'auto' | 'leave-empty' = 'auto';
	@tracked cropMarks = true;
	@tracked nUp = 4;
	@tracked customRows = 2;
	@tracked customCols = 2;
	@tracked duplexFlip: 'long-edge' | 'short-edge' = 'long-edge';
	@tracked customPaperW = 320;
	@tracked customPaperH = 450;
	@tracked inferredPaper: {
		widthMm: number;
		heightMm: number;
		label: string;
	} | null = null;

	@tracked isGenerating = false;
	@tracked generateProgress = '';
	@tracked printGuideOpen = false;
	@tracked layoutOpen = false;

	@tracked activeSheet = 0;
	@tracked isFlipped = false;
	@tracked blankMode = true;
	@tracked blankPageCount = 12;

	layoutListId = `${guidFor(this)}-layouts`;

	#thumbnails = new Map<number, HTMLCanvasElement>();

	willDestroy() {
		super.willDestroy();
		void this.pdfDoc?.destroy();
	}

	get paperSize(): PaperSize {
		const inferred = this.inferredPaper;
		if (this.paperSizeId === 'infer' && inferred) {
			return {
				id: 'infer',
				label: inferred.label,
				widthMm: inferred.widthMm,
				heightMm: inferred.heightMm,
			};
		}
		if (this.paperSizeId === 'custom') {
			return {
				id: 'custom',
				label: 'Custom',
				widthMm: this.customPaperW,
				heightMm: this.customPaperH,
			};
		}
		return findPaperSize(this.paperSizeId) ?? FALLBACK_PAPER;
	}

	get layout() {
		return getLayoutById(this.layoutId);
	}

	get layoutOption() {
		return LAYOUT_OPTIONS.find((l) => l.id === this.layoutId);
	}

	get showDuplexSelector() {
		return DUPLEX_AWARE_LAYOUTS.has(this.layoutId);
	}

	get scalingLabel() {
		return (
			SCALING_OPTIONS.find((o) => o.value === this.scaling)
				?.label ?? this.scaling
		);
	}

	get config(): ImpositionConfig {
		return {
			layoutId: this.layoutId,
			paperSize: this.paperSize,
			orientation: this.orientation,
			marginMm: this.marginMm,
			gutterMm: this.gutterMm,
			creepMm: this.creepMm,
			scaling: this.scaling,
			blankHandling: this.blankHandling,
			cropMarks: this.cropMarks,
			nUp:
				this.layoutId === 'gang-run'
					? this.nUp
					: undefined,
			customGrid:
				this.layoutId === 'custom-nup'
					? [this.customRows, this.customCols]
					: undefined,
			duplexFlip: this.showDuplexSelector
				? this.duplexFlip
				: undefined,
		};
	}

	get sourcePages() {
		return this.pdfPageCount || this.blankPageCount;
	}

	@cached
	get result(): ImpositionResult | null {
		const layout = this.layout;
		return layout
			? layout.calculate(this.sourcePages, this.config)
			: null;
	}

	get sheetW() {
		return effectiveSheetW(this.paperSize, this.orientation);
	}

	get sheetH() {
		return effectiveSheetH(this.paperSize, this.orientation);
	}

	get totalSheets() {
		return this.result?.totalSheets ?? 0;
	}

	/**
	 * Clamped rather than reset: changing the grid or the blank page count can
	 * shrink the stack under the current index, which left the React version
	 * showing nothing until the next layout change.
	 */
	get sheetIndex() {
		return this.totalSheets === 0
			? 0
			: Math.min(this.activeSheet, this.totalSheets - 1);
	}

	get activeSheetData() {
		return this.result?.sheets[this.sheetIndex];
	}

	get isFirstSheet() {
		return this.sheetIndex === 0;
	}

	get isLastSheet() {
		return this.sheetIndex >= this.totalSheets - 1;
	}

	get useDots() {
		return this.totalSheets <= 10;
	}

	get dots() {
		return Array.from({ length: this.totalSheets }, (_, i) => ({
			index: i,
			label: `Sheet ${i + 1}`,
			isActive: i === this.sheetIndex,
		}));
	}

	/** Drives both the stack's first shadow layer and the sheet navigation. */
	get hasMultipleSheets() {
		return this.totalSheets > 1;
	}

	get showNearShadow() {
		return this.totalSheets > 2;
	}

	get hasInferred() {
		return this.inferredPaper !== null;
	}

	get showBlankStepper() {
		return this.blankMode && !this.pdfBytes;
	}

	get fewerBlankPagesDisabled() {
		return this.blankPageCount <= 4;
	}

	get showPrintGuide() {
		return this.printGuideOpen && this.result !== null;
	}

	get stackStyle() {
		return htmlSafe(
			`max-width:${PREVIEW_WIDTH}px;aspect-ratio:${this.sheetW / this.sheetH};`,
		);
	}

	get showFoldV() {
		return (
			FOLD_LAYOUTS.has(this.layoutId) ||
			this.layoutId === 'four-up-booklet'
		);
	}

	get showFoldH() {
		return this.layoutId === 'four-up-booklet';
	}

	get frontCells() {
		return blankCells(
			this.activeSheetData?.front ?? [],
			this.sheetW,
			this.sheetH,
			'#e8edf3',
		);
	}

	get backCells() {
		return blankCells(
			this.activeSheetData?.back ?? [],
			this.sheetW,
			this.sheetH,
			'#f0eee8',
		);
	}

	get frontMarks() {
		if (!this.cropMarks) return [];
		return cropMarkLines(
			this.activeSheetData?.front ?? [],
			this.sheetW,
			this.sheetH,
		);
	}

	get backMarks() {
		if (!this.cropMarks) return [];
		return cropMarkLines(
			this.activeSheetData?.back ?? [],
			this.sheetW,
			this.sheetH,
		);
	}

	// wording carried over from the Next app
	get pageCountLabel() {
		const pages = this.pdfPageCount;
		return `${pages} page${pages === 1 ? '' : 's'}`;
	}

	// wording carried over from the Next app
	get summary() {
		const total = this.totalSheets;
		const pages = this.sourcePages;
		return (
			`${pages} page${pages === 1 ? '' : 's'} → ` +
			`${total} sheet${total === 1 ? '' : 's'} (duplex)`
		);
	}

	// wording carried over from the Next app
	get blanksNote() {
		const blanks = this.result?.blanksAdded ?? 0;
		if (blanks === 0) return '';
		return ` — ${blanks} blank${blanks === 1 ? '' : 's'} added`;
	}

	// wording carried over from the Next app
	get sideLabel() {
		return `Sheet ${this.sheetIndex + 1} — ${this.isFlipped ? 'Back' : 'Front'}`;
	}

	get counterLabel() {
		return `Sheet ${this.sheetIndex + 1} / ${this.totalSheets}`;
	}

	get flipEdgeLabel() {
		return this.duplexFlip === 'short-edge'
			? 'short edge'
			: 'long edge';
	}

	get showNestingNote() {
		return (
			this.layoutId === 'saddle-stitch' ||
			this.layoutId === 'four-up-booklet'
		);
	}

	// wording carried over from the Next app
	get printSteps() {
		const edge = this.flipEdgeLabel;
		return (this.result?.sheets ?? []).map((sheet) => {
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

	// ---------------------------------------------------------------- loading

	async #loadPdf(file: File) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		this.pdfBytes = bytes;
		this.pdfFileName = file.name;
		this.blankMode = false;
		this.activeSheet = 0;
		this.isFlipped = false;
		this.#thumbnails.clear();

		try {
			const doc = await loadPdfDocument(bytes.slice());
			void this.pdfDoc?.destroy();
			this.pdfDoc = doc;
			this.pdfPageCount = doc.numPages;

			const page = await doc.getPage(1);
			const viewport = page.getViewport({ scale: 1 });
			const wMm = (viewport.width / 72) * 25.4;
			const hMm = (viewport.height / 72) * 25.4;
			const match = PAPER_SIZES.find(
				(s) =>
					(Math.abs(s.widthMm - wMm) < 2 &&
						Math.abs(s.heightMm - hMm) <
							2) ||
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
		} catch (err) {
			console.error('imposer: failed to load PDF', err);
			this.pdfPageCount = 0;
		}
	}

	readFile = (file: File) => {
		if (file.type === 'application/pdf') void this.#loadPdf(file);
	};

	selectFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// Cleared so the same file can be picked again.
		input.value = '';
		if (file) this.readFile(file);
	};

	dropFile = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	clearPdf = (event: Event) => {
		event.preventDefault();
		this.pdfBytes = null;
		this.pdfFileName = '';
		this.pdfPageCount = 0;
		void this.pdfDoc?.destroy();
		this.pdfDoc = null;
		this.inferredPaper = null;
		this.blankMode = true;
		this.#thumbnails.clear();
	};

	// ------------------------------------------------------------- config

	setLayout = (id: string) => {
		this.layoutId = id;
		this.layoutOpen = false;
		this.activeSheet = 0;
		this.isFlipped = false;
		if (FOLD_LAYOUTS.has(id)) this.orientation = 'landscape';
	};

	setLayoutOpen = (open: boolean) => {
		this.layoutOpen = open;
	};

	setPaperSize = (id: string) => {
		this.paperSizeId = id;
	};

	setOrientation = (orientation: 'portrait' | 'landscape') => {
		this.orientation = orientation;
	};

	setScaling = (value: string) => {
		this.scaling = value as 'fit' | 'fill' | 'actual';
	};

	setDuplexFlip = (flip: 'long-edge' | 'short-edge') => {
		this.duplexFlip = flip;
	};

	setNUp = (n: number) => {
		this.nUp = n;
	};

	setMargin = (value: number) => {
		this.marginMm = value;
	};

	setGutter = (value: number) => {
		this.gutterMm = value;
	};

	setCreep = (value: number) => {
		this.creepMm = value;
	};

	setCustomPaperW = (event: Event) => {
		this.customPaperW = Math.max(
			50,
			parseFloat((event.target as HTMLInputElement).value) ||
				50,
		);
	};

	setCustomPaperH = (event: Event) => {
		this.customPaperH = Math.max(
			50,
			parseFloat((event.target as HTMLInputElement).value) ||
				50,
		);
	};

	setCustomRows = (event: Event) => {
		this.customRows = clampGrid(
			(event.target as HTMLInputElement).value,
		);
	};

	setCustomCols = (event: Event) => {
		this.customCols = clampGrid(
			(event.target as HTMLInputElement).value,
		);
	};

	setCropMarks = (event: Event) => {
		this.cropMarks = (event.target as HTMLInputElement).checked;
	};

	setBlankHandling = (event: Event) => {
		this.blankHandling = (event.target as HTMLInputElement).checked
			? 'leave-empty'
			: 'auto';
	};

	setBlankMode = (event: Event) => {
		this.blankMode = (event.target as HTMLInputElement).checked;
	};

	fewerBlankPages = () => {
		this.blankPageCount = Math.max(4, this.blankPageCount - 4);
	};

	moreBlankPages = () => {
		this.blankPageCount += 4;
	};

	togglePrintGuide = () => {
		this.printGuideOpen = !this.printGuideOpen;
	};

	// --------------------------------------------------------- navigation

	goToSheet = (index: number) => {
		this.activeSheet = index;
		this.isFlipped = false;
	};

	prevSheet = () => {
		if (this.sheetIndex > 0) this.goToSheet(this.sheetIndex - 1);
	};

	nextSheet = () => {
		if (this.sheetIndex < this.totalSheets - 1)
			this.goToSheet(this.sheetIndex + 1);
	};

	flipCard = () => {
		this.isFlipped = !this.isFlipped;
	};

	// Bound on the wrapper's document rather than window so it only fires while
	// the tool is on screen. Buttons are excluded because Space activates them.
	shortcuts = modifier((element: HTMLElement) => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLButtonElement
			) {
				return;
			}
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				this.prevSheet();
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				this.nextSheet();
			} else if (event.key === ' ') {
				event.preventDefault();
				this.flipCard();
			}
		};

		element.ownerDocument.addEventListener('keydown', onKeyDown);
		return () =>
			element.ownerDocument.removeEventListener(
				'keydown',
				onKeyDown,
			);
	});

	// ------------------------------------------------------------ preview

	async #renderPage(
		pdfDoc: PDFDocumentProxy,
		pageNum: number,
		width: number,
		height: number,
	): Promise<HTMLCanvasElement | null> {
		if (pageNum < 1 || pageNum > pdfDoc.numPages) return null;

		const cached = this.#thumbnails.get(pageNum);
		if (cached) return cached;

		try {
			const page = await pdfDoc.getPage(pageNum);
			const viewport = page.getViewport({ scale: 1 });
			const scale = Math.min(
				width / viewport.width,
				height / viewport.height,
			);
			const scaledViewport = page.getViewport({ scale });

			const canvas = document.createElement('canvas');
			canvas.width = scaledViewport.width;
			canvas.height = scaledViewport.height;
			await page.render({ canvas, viewport: scaledViewport })
				.promise;
			this.#thumbnails.set(pageNum, canvas);
			return canvas;
		} catch (err) {
			console.error(
				`imposer: failed to render page ${pageNum}`,
				err,
			);
			return null;
		}
	}

	/**
	 * Every tracked value is read before the first await, so the modifier that
	 * calls this consumes them all and repaints when any of them changes.
	 */
	async #drawSheetSide(
		canvas: HTMLCanvasElement,
		placements: PagePlacement[],
	) {
		const sw = this.sheetW;
		const sh = this.sheetH;
		const showMarks = this.cropMarks;
		const layoutId = this.layoutId;
		const pdfDoc = this.pdfDoc;

		const scale = PREVIEW_WIDTH / sw;
		const w = Math.round(sw * scale);
		const h = Math.round(sh * scale);

		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, w, h);

		for (const p of placements) {
			const px = p.x * scale;
			const py = p.y * scale;
			const pw = p.width * scale;
			const ph = p.height * scale;

			if (p.pageNumber === 0) {
				ctx.fillStyle = '#f0f0f0';
				ctx.fillRect(px, py, pw, ph);
				ctx.strokeStyle = '#d0d0d0';
				ctx.lineWidth = 1;
				ctx.strokeRect(px, py, pw, ph);
				continue;
			}

			const cx = px + pw / 2;
			const cy = py + ph / 2;
			const thumb =
				pdfDoc && p.pageNumber <= pdfDoc.numPages
					? await this.#renderPage(
							pdfDoc,
							p.pageNumber,
							pw * 2,
							ph * 2,
						)
					: null;

			if (thumb) {
				ctx.save();
				ctx.translate(cx, cy);
				ctx.rotate((p.rotation * Math.PI) / 180);
				const tScale = Math.min(
					pw / thumb.width,
					ph / thumb.height,
				);
				const tw = thumb.width * tScale;
				const th = thumb.height * tScale;
				ctx.drawImage(thumb, -tw / 2, -th / 2, tw, th);
				ctx.restore();
			} else {
				ctx.fillStyle = '#e8edf3';
				ctx.fillRect(px, py, pw, ph);
			}

			ctx.strokeStyle = '#b0b8c4';
			ctx.lineWidth = 1;
			ctx.strokeRect(px, py, pw, ph);

			ctx.save();
			ctx.translate(cx, cy);
			const badgeR = Math.min(pw, ph) * 0.18;
			ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
			ctx.beginPath();
			ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.font = `bold ${Math.max(10, badgeR * 0.9)}px system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(p.pageNumber), 0, 0);
			ctx.restore();

			if (p.rotation !== 0) {
				ctx.save();
				ctx.translate(cx, cy);
				ctx.fillStyle = 'rgba(0,0,0,0.4)';
				ctx.font = `${Math.max(8, badgeR * 0.5)}px system-ui`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(`${p.rotation}°`, 0, badgeR + 10);
				ctx.restore();
			}
		}

		if (showMarks) {
			ctx.strokeStyle = '#333333';
			ctx.lineWidth = 0.5;
			const markLen = 10;
			const edges = getOuterEdges(placements);
			placements.forEach((p, i) => {
				const e = edges[i];
				if (!e) return;
				const px = p.x * scale;
				const py = p.y * scale;
				const pw = p.width * scale;
				const ph = p.height * scale;
				drawCropMarkArms(
					ctx,
					px,
					py,
					markLen,
					e.left,
					e.top,
				);
				drawCropMarkArms(
					ctx,
					px + pw,
					py,
					markLen,
					e.right,
					e.top,
				);
				drawCropMarkArms(
					ctx,
					px,
					py + ph,
					markLen,
					e.left,
					e.bottom,
				);
				drawCropMarkArms(
					ctx,
					px + pw,
					py + ph,
					markLen,
					e.right,
					e.bottom,
				);
			});
		}

		const foldV =
			FOLD_LAYOUTS.has(layoutId) ||
			layoutId === 'four-up-booklet';
		if (foldV) {
			ctx.save();
			ctx.strokeStyle = '#6688bb';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 3]);
			ctx.beginPath();
			ctx.moveTo(w / 2, 0);
			ctx.lineTo(w / 2, h);
			ctx.stroke();
			if (layoutId === 'four-up-booklet') {
				ctx.beginPath();
				ctx.moveTo(0, h / 2);
				ctx.lineTo(w, h / 2);
				ctx.stroke();
			}
			ctx.setLineDash([]);
			ctx.restore();
		}
	}

	paintFront = (canvas: HTMLCanvasElement) => {
		void this.#drawSheetSide(
			canvas,
			this.activeSheetData?.front ?? [],
		);
	};

	paintBack = (canvas: HTMLCanvasElement) => {
		void this.#drawSheetSide(
			canvas,
			this.activeSheetData?.back ?? [],
		);
	};

	// ------------------------------------------------------------- export

	get generateDisabled() {
		return !this.pdfBytes || this.isGenerating;
	}

	generateImposedPdf = async () => {
		const bytes = this.pdfBytes;
		const result = this.result;
		if (!bytes || !result) return;

		this.isGenerating = true;
		// wording carried over from the Next app
		this.generateProgress = 'Loading source PDF...';

		try {
			const { PDFDocument, degrees } =
				await import('pdf-lib');
			const srcDoc = await PDFDocument.load(bytes);
			const outputDoc = await PDFDocument.create();

			const paperSize = this.paperSize;
			const sheetWPt =
				effectiveSheetW(paperSize, this.orientation) *
				MM_TO_POINTS;
			const sheetHPt =
				effectiveSheetH(paperSize, this.orientation) *
				MM_TO_POINTS;

			// wording carried over from the Next app
			this.generateProgress = 'Embedding source pages...';
			const embeddedPages = await outputDoc.embedPages(
				srcDoc.getPages(),
			);

			const withMarks = this.cropMarks;

			result.sheets.forEach((sheet, si) => {
				// wording carried over from the Next app
				this.generateProgress = `Generating sheet ${si + 1} of ${result.sheets.length}...`;

				for (const side of [sheet.front, sheet.back]) {
					const page = outputDoc.addPage([
						sheetWPt,
						sheetHPt,
					]);
					drawPlacementsOnPage(
						page,
						side,
						embeddedPages,
						sheetHPt,
						degrees,
					);
					if (withMarks)
						drawCropMarksOnPdfPage(
							page,
							side,
							sheetHPt,
						);
				}
			});

			// wording carried over from the Next app
			this.generateProgress = 'Saving PDF...';

			// Copied into a fresh buffer: pdf-lib types its output over
			// ArrayBufferLike, which BlobPart does not accept.
			const blob = new Blob(
				[new Uint8Array(await outputDoc.save())],
				{ type: 'application/pdf' },
			);
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `imposed-${this.layoutId}-${this.paperSizeId}.pdf`;
			link.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error(
				'imposer: failed to generate imposed PDF',
				err,
			);
		} finally {
			this.isGenerating = false;
			this.generateProgress = '';
		}
	};

	<template>
		<div
			class="dt-imp"
			{{filePaste this.readFile accept="application/pdf"}}
			{{this.shortcuts}}
		>
			<div class="dt-imp-frame">
				<div class="dt-imp-upload">
					<label
						class="dt-imp-drop"
						{{on "drop" this.dropFile}}
						{{on "dragover" this.allowDrop}}
					>
						<input
							type="file"
							accept="application/pdf"
							class="dt-sr-only"
							{{on
								"change"
								this.selectFile
							}}
						/>
						{{#if this.pdfFileName}}
							<div
								class="dt-imp-file"
							>
								<Icon
									@name="file-text"
									class="dt-imp-file-icon"
								/>
								<div
									class="dt-imp-file-text"
								>
									<p
										class="dt-imp-file-name"
									>{{this.pdfFileName}}</p>
									<p
										class="dt-imp-file-meta"
									>{{this.pageCountLabel}}</p>
								</div>
							</div>
						{{else}}
							<Icon
								@name="upload"
								class="dt-imp-drop-icon"
							/>
							{{! wording carried over from the Next app }}
							<p
								class="dt-imp-drop-title"
							>Drop a PDF here, or
								click to browse</p>
							{{! wording carried over from the Next app }}
							<p
								class="dt-imp-drop-hint"
							>or paste from clipboard</p>
						{{/if}}
					</label>

					{{#if this.pdfFileName}}
						<button
							type="button"
							class="dt-imp-remove"
							{{on
								"click"
								this.clearPdf
							}}
						>remove</button>
					{{/if}}
				</div>

				<div class="dt-imp-section">
					{{! wording carried over from the Next app }}
					<span
						class="dt-imp-heading"
					>Layout</span>
					<Popover
						@open={{this.layoutOpen}}
						@onOpenChange={{this.setLayoutOpen}}
					>
						<PopoverTrigger
							class="dt-imp-layout-trigger"
							role="combobox"
							aria-expanded={{if
								this.layoutOpen
								"true"
								"false"
							}}
							aria-controls={{this.layoutListId}}
							aria-haspopup="dialog"
						>
							{{#if
								this.layoutOption
							}}
								<Icon
									@name={{this.layoutOption.icon}}
									class="dt-imp-layout-icon"
								/>
								<span
									class="dt-imp-layout-text"
								>
									<span
										class="dt-imp-layout-name"
									>{{this.layoutOption.name}}</span>
									<span
										class="dt-imp-layout-use"
									>
										&mdash;
										{{this.layoutOption.useCase}}</span>
								</span>
							{{/if}}
							<Icon
								@name={{if
									this.layoutOpen
									"chevron-up"
									"chevron-down"
								}}
								class="dt-imp-layout-caret"
							/>
						</PopoverTrigger>
						<PopoverContent
							id={{this.layoutListId}}
							@align="start"
							class="dt-imp-layout-panel"
						>
							<div>
								{{#each
									LAYOUT_OPTIONS
									key="id"
									as |option|
								}}
									<button
										type="button"
										aria-pressed={{if
											(eq
												option.id
												this.layoutId
											)
											"true"
											"false"
										}}
										class="dt-imp-layout-option
											{{if
												(eq
													option.id
													this.layoutId
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setLayout
												option.id
											)
										}}
									>
										<Icon
											@name={{option.icon}}
											class="dt-imp-option-icon"
										/>
										<span
											class="dt-imp-option-text"
										>
											<span
												class="dt-imp-option-name"
											>{{option.name}}</span>
											<span
												class="dt-imp-option-desc"
											>{{option.description}}</span>
										</span>
										{{#if
											(eq
												option.id
												this.layoutId
											)
										}}
											<Icon
												@name="check"
												class="dt-imp-option-check"
											/>
										{{/if}}
									</button>
								{{/each}}
							</div>
						</PopoverContent>
					</Popover>
				</div>

				<div class="dt-imp-cards">
					<div class="dt-imp-card">
						{{! wording carried over from the Next app }}
						<span
							class="dt-imp-heading"
						>Sheet Setup</span>

						<div class="dt-imp-field">
							{{! wording carried over from the Next app }}
							<LabelWithInfo
								@label="Paper"
								@info="The physical sheet your printer will use. SRA sizes include extra bleed area for trimming."
							/>
							<PaperSizeCombobox
								@value={{this.paperSizeId}}
								@onValueChange={{this.setPaperSize}}
								@showInfer={{true}}
								@showCustom={{true}}
								@hasInferred={{this.hasInferred}}
								@inferredLabel={{this.inferredPaper.label}}
								@triggerClass="dt-imp-combo"
							/>
						</div>

						{{#if
							(eq
								this.paperSizeId
								"custom"
							)
						}}
							<div
								class="dt-imp-dims"
							>
								<input
									type="number"
									class="dt-imp-number"
									aria-label="Width"
									min="50"
									max="1000"
									value={{this.customPaperW}}
									{{on
										"change"
										this.setCustomPaperW
									}}
								/>
								<span
									class="dt-imp-dims-sep"
								>&times;</span>
								<input
									type="number"
									class="dt-imp-number"
									aria-label="Height"
									min="50"
									max="1000"
									value={{this.customPaperH}}
									{{on
										"change"
										this.setCustomPaperH
									}}
								/>
								<span
									class="dt-imp-dims-unit"
								>mm</span>
							</div>
						{{/if}}

						<div class="dt-imp-field">
							{{! wording carried over from the Next app }}
							<LabelWithInfo
								@label="Orientation"
								@info="How the sheet feeds through the printer. Landscape is usually needed for side-by-side layouts like saddle stitch."
							/>
							<div
								class="segmented dt-imp-segments"
								role="radiogroup"
								aria-label="Orientation"
							>
								<button
									type="button"
									role="radio"
									aria-checked={{if
										(eq
											this.orientation
											"portrait"
										)
										"true"
										"false"
									}}
									class="dt-imp-segment
										{{if
											(eq
												this.orientation
												'portrait'
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setOrientation
											"portrait"
										)
									}}
								>Portrait</button>
								<button
									type="button"
									role="radio"
									aria-checked={{if
										(eq
											this.orientation
											"landscape"
										)
										"true"
										"false"
									}}
									class="dt-imp-segment
										{{if
											(eq
												this.orientation
												'landscape'
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setOrientation
											"landscape"
										)
									}}
								>Landscape</button>
							</div>
						</div>

						<div class="dt-imp-field">
							{{! wording carried over from the Next app }}
							<LabelWithInfo
								@label="Scaling"
								@info="How your pages are sized to fit each cell. 'Fit' shows the whole page with possible white space. 'Fill' crops to fill the cell. 'Actual' uses the original page dimensions."
							/>
							<Select
								@value={{this.scaling}}
								@onValueChange={{this.setScaling}}
							>
								<SelectTrigger>
									<SelectValue
									>{{this.scalingLabel}}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{{#each
										SCALING_OPTIONS
										key="value"
										as |option|
									}}
										<SelectItem
											@value={{option.value}}
										>{{option.label}}</SelectItem>
									{{/each}}
								</SelectContent>
							</Select>
						</div>

						{{#if this.showDuplexSelector}}
							<div
								class="dt-imp-field"
							>
								{{! wording carried over from the Next app }}
								<LabelWithInfo
									@label="Duplex flip"
									@info="How your printer flips the paper for double-sided printing. Long edge is standard for most booklets. Short edge (tumble) flips top-to-bottom."
								/>
								<div
									class="segmented dt-imp-segments"
									role="radiogroup"
									aria-label="Duplex flip"
								>
									<button
										type="button"
										role="radio"
										aria-checked={{if
											(eq
												this.duplexFlip
												"long-edge"
											)
											"true"
											"false"
										}}
										class="dt-imp-segment
											{{if
												(eq
													this.duplexFlip
													'long-edge'
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setDuplexFlip
												"long-edge"
											)
										}}
									>Long
										edge</button>
									<button
										type="button"
										role="radio"
										aria-checked={{if
											(eq
												this.duplexFlip
												"short-edge"
											)
											"true"
											"false"
										}}
										class="dt-imp-segment
											{{if
												(eq
													this.duplexFlip
													'short-edge'
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setDuplexFlip
												"short-edge"
											)
										}}
									>Short
										edge</button>
								</div>
							</div>
						{{/if}}

						{{#if
							(eq
								this.layoutId
								"gang-run"
							)
						}}
							<div
								class="dt-imp-field"
							>
								{{! wording carried over from the Next app }}
								<LabelWithInfo
									@label="Copies / sheet"
									@info="How many identical copies of your page to fit on each sheet."
								/>
								<div
									class="segmented dt-imp-segments"
									role="radiogroup"
									aria-label="Copies per sheet"
								>
									{{#each
										GANG_RUN_OPTIONS
										key="@index"
										as |count|
									}}
										<button
											type="button"
											role="radio"
											aria-checked={{if
												(eq
													count
													this.nUp
												)
												"true"
												"false"
											}}
											class="dt-imp-segment
												{{if
													(eq
														count
														this.nUp
													)
													'is-active'
												}}"
											{{on
												"click"
												(fn
													this.setNUp
													count
												)
											}}
										>{{count}}</button>
									{{/each}}
								</div>
							</div>
						{{/if}}

						{{#if
							(eq
								this.layoutId
								"custom-nup"
							)
						}}
							<div
								class="dt-imp-field"
							>
								{{! wording carried over from the Next app }}
								<LabelWithInfo
									@label="Grid"
									@info="Number of rows and columns for your custom page grid."
								/>
								<div
									class="dt-imp-dims"
								>
									<input
										type="number"
										class="dt-imp-number is-narrow"
										aria-label="Rows"
										min="1"
										max="10"
										value={{this.customRows}}
										{{on
											"change"
											this.setCustomRows
										}}
									/>
									<span
										class="dt-imp-dims-sep"
									>&times;</span>
									<input
										type="number"
										class="dt-imp-number is-narrow"
										aria-label="Columns"
										min="1"
										max="10"
										value={{this.customCols}}
										{{on
											"change"
											this.setCustomCols
										}}
									/>
								</div>
							</div>
						{{/if}}
					</div>

					<div class="dt-imp-card">
						{{! wording carried over from the Next app }}
						<span
							class="dt-imp-heading"
						>Spacing &amp; Finishing</span>

						{{! wording carried over from the Next app }}
						<SliderWithInfo
							@label="Margins"
							@value={{this.marginMm}}
							@onChange={{this.setMargin}}
							@min={{0}}
							@max={{20}}
							@step={{1}}
							@unit="mm"
							@info="Distance from the sheet edge to the nearest page cell. Keeps content away from the unprintable area and gives the guillotine room to trim."
						/>
						{{! wording carried over from the Next app }}
						<SliderWithInfo
							@label="Gutter"
							@value={{this.gutterMm}}
							@onChange={{this.setGutter}}
							@min={{0}}
							@max={{10}}
							@step={{1}}
							@unit="mm"
							@info="Gap between adjacent page cells on the same side of the sheet. On fold-based layouts this is the spine area; on cut layouts it's the cutting channel."
						/>
						{{#if
							(eq
								this.layoutId
								"saddle-stitch"
							)
						}}
							{{! wording carried over from the Next app }}
							<SliderWithInfo
								@label="Creep"
								@value={{this.creepMm}}
								@onChange={{this.setCreep}}
								@min={{0}}
								@max={{2}}
								@step={{0.1}}
								@unit="mm"
								@decimals={{1}}
								@info="Compensates for paper thickness in saddle-stitched booklets. Inner sheets push outward when nested, so their content shifts toward the spine. This nudges inner pages outward to keep trim consistent."
							/>
						{{/if}}

						<hr class="dt-imp-rule" />

						<div class="dt-imp-toggle">
							{{! wording carried over from the Next app }}
							<LabelWithInfo
								@label="Crop marks"
								@info="Small lines printed at page corners to guide the guillotine when trimming. Essential for professional print finishing."
							/>
							<input
								type="checkbox"
								class="dt-imp-switch"
								aria-label="Crop marks"
								checked={{this.cropMarks}}
								{{on
									"change"
									this.setCropMarks
								}}
							/>
						</div>

						<div class="dt-imp-toggle">
							{{! wording carried over from the Next app }}
							<LabelWithInfo
								@label="Leave blanks empty"
								@info="When a signature needs padding, this controls whether blank pages are added automatically or left as empty space on the sheet."
							/>
							<input
								type="checkbox"
								class="dt-imp-switch"
								aria-label="Leave blanks empty"
								checked={{eq
									this.blankHandling
									"leave-empty"
								}}
								{{on
									"change"
									this.setBlankHandling
								}}
							/>
						</div>

						<div class="dt-imp-toggle">
							{{! wording carried over from the Next app }}
							<LabelWithInfo
								@label="Blank mode"
								@info="Preview the imposition layout without uploading a PDF. Useful for planning your print setup."
							/>
							<div
								class="dt-imp-toggle-controls"
							>
								{{#if
									this.showBlankStepper
								}}
									<div
										class="dt-imp-stepper"
									>
										<button
											type="button"
											class="dt-imp-step"
											aria-label="Fewer pages"
											disabled={{this.fewerBlankPagesDisabled}}
											{{on
												"click"
												this.fewerBlankPages
											}}
										>
											<Icon
												@name="chevron-down"
											/>
										</button>
										<span
											class="dt-imp-step-value"
										>{{this.blankPageCount}}</span>
										<Popover
										>
											<PopoverTrigger
												class="dt-imp-info"
												aria-label="Explain"
											>
												<Icon
													@name="info"
												/>
											</PopoverTrigger>
											<PopoverContent
												@side="top"
												class="dt-imp-infopanel"
											>
												{{! wording carried over from the Next app }}
												Page
												count
												must
												be
												divisible
												by
												4
												—
												each
												physical
												sheet
												has
												a
												front
												and
												back,
												and
												each
												side
												holds
												two
												pages
												when
												folded.
											</PopoverContent>
										</Popover>
										<button
											type="button"
											class="dt-imp-step"
											aria-label="More pages"
											{{on
												"click"
												this.moreBlankPages
											}}
										>
											<Icon
												@name="chevron-up"
											/>
										</button>
									</div>
								{{/if}}
								<input
									type="checkbox"
									class="dt-imp-switch"
									aria-label="Blank mode"
									checked={{this.blankMode}}
									{{on
										"change"
										this.setBlankMode
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="dt-imp-frame">
				{{#if this.result}}
					<div class="dt-imp-summary">
						<p>{{this.summary}}<span
								class="dt-imp-summary-blanks"
							>{{this.blanksNote}}</span></p>
					</div>

					{{#if this.activeSheetData}}
						<div class="dt-imp-preview">
							<p
								class="dt-imp-side-label"
							>{{this.sideLabel}}</p>

							<div
								class="dt-imp-stack"
								style={{this.stackStyle}}
							>
								{{#if
									this.hasMultipleSheets
								}}
									<div
										class="dt-imp-shadow is-far"
									></div>
								{{/if}}
								{{#if
									this.showNearShadow
								}}
									<div
										class="dt-imp-shadow is-near"
									></div>
								{{/if}}

								<div
									class="dt-imp-flip"
								>
									<div
										class="dt-imp-faces
											{{if
												this.isFlipped
												'is-flipped'
											}}"
									>
										<div
											class="dt-imp-face"
										>
											{{#if
												this.blankMode
											}}
												<BlankSheetFace
													@cells={{this.frontCells}}
													@marks={{this.frontMarks}}
													@showFoldV={{this.showFoldV}}
													@showFoldH={{this.showFoldH}}
												/>
											{{else}}
												<canvas
													class="dt-imp-canvas"
													{{paintFace
														this.paintFront
													}}
												></canvas>
											{{/if}}
										</div>

										<div
											class="dt-imp-face is-back"
										>
											{{#if
												this.blankMode
											}}
												<BlankSheetFace
													@cells={{this.backCells}}
													@marks={{this.backMarks}}
													@showFoldV={{this.showFoldV}}
													@showFoldH={{this.showFoldH}}
												/>
											{{else}}
												<canvas
													class="dt-imp-canvas"
													{{paintFace
														this.paintBack
													}}
												></canvas>
											{{/if}}
										</div>
									</div>
								</div>
							</div>

							<div class="dt-imp-nav">
								<button
									type="button"
									class="dt-imp-navbtn"
									disabled={{this.isFirstSheet}}
									{{on
										"click"
										this.prevSheet
									}}
								>
									<Icon
										@name="chevron-left"
									/>
									Prev
								</button>
								<button
									type="button"
									class="dt-imp-navbtn"
									{{on
										"click"
										this.flipCard
									}}
								>Flip</button>
								<button
									type="button"
									class="dt-imp-navbtn"
									disabled={{this.isLastSheet}}
									{{on
										"click"
										this.nextSheet
									}}
								>
									Next
									<Icon
										@name="chevron-right"
									/>
								</button>
							</div>

							{{#if
								this.hasMultipleSheets
							}}
								{{#if
									this.useDots
								}}
									<div
										class="dt-imp-dots"
									>
										{{#each
											this.dots
											key="index"
											as |dot|
										}}
											<button
												type="button"
												class="dt-imp-dot
													{{if
														dot.isActive
														'is-active'
													}}"
												aria-label={{dot.label}}
												{{on
													"click"
													(fn
														this.goToSheet
														dot.index
													)
												}}
											></button>
										{{/each}}
									</div>
								{{else}}
									<div
										class="dt-imp-dots"
									>
										<span
											class="dt-imp-counter"
										>{{this.counterLabel}}</span>
									</div>
								{{/if}}
							{{/if}}
						</div>
					{{/if}}
				{{else}}
					<div class="dt-imp-empty">
						{{! wording carried over from the Next app }}
						<p>Select a layout to see the
							sheet preview</p>
					</div>
				{{/if}}
			</div>

			<div class="dt-imp-actions">
				<button
					type="button"
					class="dt-imp-generate"
					disabled={{this.generateDisabled}}
					{{on "click" this.generateImposedPdf}}
				>
					{{#if this.isGenerating}}
						<Icon
							@name="loader-circle"
							class="dt-imp-spinner"
						/>
						{{#if this.generateProgress}}
							{{this.generateProgress}}
						{{else}}
							{{! wording carried over from the Next app }}
							Generating...
						{{/if}}
					{{else}}
						<Icon @name="download" />
						{{! wording carried over from the Next app }}
						Download Imposed PDF
					{{/if}}
				</button>

				<button
					type="button"
					class="dt-imp-guidebtn"
					aria-expanded={{if
						this.printGuideOpen
						"true"
						"false"
					}}
					{{on "click" this.togglePrintGuide}}
				>
					<Icon @name="printer" />
					{{! wording carried over from the Next app }}
					Print Guide
					<Icon
						@name={{if
							this.printGuideOpen
							"chevron-up"
							"chevron-down"
						}}
					/>
				</button>
			</div>

			{{#if this.showPrintGuide}}
				<div class="dt-imp-frame dt-imp-guide">
					<div class="dt-imp-guide-head">
						<Icon
							@name="scissors-line-dashed"
						/>
						{{! wording carried over from the Next app }}
						<h3>Manual Duplex Printing Guide</h3>
					</div>
					{{! wording carried over from the Next app }}
					<p class="dt-imp-guide-intro">If your
						printer does not support
						automatic duplex, follow these
						steps. The imposed PDF
						alternates front and back pages
						(page 1 = Sheet 1 front, page 2
						= Sheet 1 back, etc.).</p>
					<ol class="dt-imp-guide-steps">
						{{#each
							this.printSteps
							key="number"
							as |step|
						}}
							<li>
								<span
									class="dt-imp-step-front"
								>{{step.front}}</span>{{step.frontNote}}
								<span
									class="dt-imp-step-back"
								>{{step.backBefore}}<strong
									>{{step.edge}}</strong>{{step.backAfter}}</span>
							</li>
						{{/each}}
					</ol>
					{{#if this.showNestingNote}}
						{{! wording carried over from the Next app }}
						<p
							class="dt-imp-guide-note"
						>After printing all sheets, nest
							them together (Sheet 1
							outermost) and staple
							along the spine fold.</p>
					{{/if}}
				</div>
			{{/if}}
		</div>
	</template>
}
