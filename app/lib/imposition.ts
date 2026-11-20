import {
	PDFDocument,
	clip,
	degrees,
	endPath,
	popGraphicsState,
	pushGraphicsState,
	rectangle,
	type PDFEmbeddedPage,
	type PDFPage,
} from 'pdf-lib';

export const MM_TO_POINTS = 72 / 25.4;
// 3mm uk/eu; us 1/8in
export const BLEED_MM = 3;

export interface PaperSize {
	id: string;
	label: string;
	widthMm: number;
	heightMm: number;
}

export interface PagePlacement {
	/** zero is blank. */
	pageNumber: number;
	/** millimetres. */
	x: number;
	/** millimetres. */
	y: number;
	/** millimetres. */
	width: number;
	/** millimetres. */
	height: number;
	/** degrees. */
	rotation: number;
	side: 'front' | 'back';
}

export interface SheetDefinition {
	sheetNumber: number;
	front: PagePlacement[];
	back: PagePlacement[];
	/** 0-based; folded layouts. */
	signature?: number;
}

export interface ImpositionConfig {
	layoutId: string;
	paperSize: PaperSize;
	orientation: 'portrait' | 'landscape';
	/** millimetres. */
	marginMm: number;
	/** millimetres. */
	gutterMm: number;
	/** saddle-stitch compensation. */
	creepMm: number;
	scaling: 'fit' | 'fill' | 'actual';
	blankHandling: 'auto' | 'leave-empty';
	cropMarks: boolean;
	nUp?: number;
	customGrid?: [number, number];
	/** top-over-bottom flips half-turn the backs. */
	duplexFlip?: 'long-edge' | 'short-edge';
	/** perfect bind; a multiple of 4. */
	signaturePages?: number;
	/** right-to-left reading; the spine is on the right. */
	rtl?: boolean;
}

export interface ImpositionResult {
	sheets: SheetDefinition[];
	totalSheets: number;
	totalPages: number;
	pagesUsed: number;
	blanksAdded: number;
}

export interface ImpositionLayout {
	id: string;
	name: string;
	description: string;
	useCase: string;
	/** front and back. */
	pagesPerSheet: number;
	calculate: (
		totalSourcePages: number,
		config: ImpositionConfig,
	) => ImpositionResult;
}

export const PAPER_SIZES: PaperSize[] = [
	{ id: 'a4', label: 'A4 (210 × 297 mm)', widthMm: 210, heightMm: 297 },
	{ id: 'a3', label: 'A3 (297 × 420 mm)', widthMm: 297, heightMm: 420 },
	{
		id: 'sra4',
		label: 'SRA4 (225 × 320 mm)',
		widthMm: 225,
		heightMm: 320,
	},
	{
		id: 'sra3',
		label: 'SRA3 (320 × 450 mm)',
		widthMm: 320,
		heightMm: 450,
	},
	{
		id: 'letter',
		label: 'Letter (8.5 × 11")',
		widthMm: 215.9,
		heightMm: 279.4,
	},
	{
		id: 'legal',
		label: 'Legal (8.5 × 14")',
		widthMm: 215.9,
		heightMm: 355.6,
	},
	{
		id: 'tabloid',
		label: 'Tabloid (11 × 17")',
		widthMm: 279.4,
		heightMm: 431.8,
	},
	{
		id: '12x18',
		label: '12 × 18" (305 × 457 mm)',
		widthMm: 304.8,
		heightMm: 457.2,
	},
];

export const DEFAULT_IMPOSITION_CONFIG: ImpositionConfig = {
	layoutId: 'saddle-stitch',
	paperSize: PAPER_SIZES[0]!,
	orientation: 'landscape',
	marginMm: 5,
	gutterMm: 2,
	creepMm: 0,
	scaling: 'fit',
	blankHandling: 'auto',
	cropMarks: true,
};

function sheetDimensions(
	paperSize: PaperSize,
	orientation: 'portrait' | 'landscape',
): { sheetW: number; sheetH: number } {
	const { widthMm, heightMm } = paperSize;
	if (orientation === 'landscape') {
		return {
			sheetW: Math.max(widthMm, heightMm),
			sheetH: Math.min(widthMm, heightMm),
		};
	}
	return {
		sheetW: Math.min(widthMm, heightMm),
		sheetH: Math.max(widthMm, heightMm),
	};
}

function padToMultiple(n: number, multiple: number): number {
	const rem = n % multiple;
	return rem === 0 ? n : n + (multiple - rem);
}

function buildGrid(
	pageNumbers: number[],
	rows: number,
	cols: number,
	sheetW: number,
	sheetH: number,
	marginMm: number,
	gutterMm: number,
	side: 'front' | 'back',
	rotations?: number[],
): PagePlacement[] {
	const usableW = sheetW - marginMm * 2 - gutterMm * (cols - 1);
	const usableH = sheetH - marginMm * 2 - gutterMm * (rows - 1);
	const cellW = usableW / cols;
	const cellH = usableH / rows;

	const placements: PagePlacement[] = [];
	for (let i = 0; i < pageNumbers.length; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = marginMm + col * (cellW + gutterMm);
		const y = marginMm + row * (cellH + gutterMm);
		placements.push({
			pageNumber: pageNumbers[i] ?? 0,
			x,
			y,
			width: cellW,
			height: cellH,
			rotation: rotations ? (rotations[i] ?? 0) : 0,
			side,
		});
	}
	return placements;
}

function makeResult(
	sheets: SheetDefinition[],
	totalSourcePages: number,
	totalPaddedPages: number,
): ImpositionResult {
	const blanksAdded = totalPaddedPages - totalSourcePages;
	return {
		sheets,
		totalSheets: sheets.length,
		totalPages: totalPaddedPages,
		pagesUsed: totalSourcePages,
		blanksAdded: Math.max(0, blanksAdded),
	};
}

function calculateSaddleStitch(
	totalSourcePages: number,
	config: ImpositionConfig,
): ImpositionResult {
	const totalPages = padToMultiple(Math.max(totalSourcePages, 4), 4);
	const sheets = nestedSheets(
		totalPages,
		0,
		1,
		0,
		totalSourcePages,
		config,
	);
	return makeResult(sheets, totalSourcePages, totalPages);
}

function nestedSheets(
	totalPages: number,
	base: number,
	firstSheet: number,
	signature: number,
	totalSourcePages: number,
	config: ImpositionConfig,
): SheetDefinition[] {
	const numSheets = totalPages / 4;

	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);
	const { marginMm, gutterMm, creepMm } = config;

	const sheets: SheetDefinition[] = [];

	for (let s = 0; s < numSheets; s++) {
		// outer sheets creep more
		const rawCreep = (numSheets - 1 - s) * creepMm;
		const creepOffset = Math.min(rawCreep, marginMm);

		const frontLeft = base + totalPages - 2 * s;
		const frontRight = base + 2 * s + 1;
		const backLeft = base + 2 * s + 2;
		const backRight = base + totalPages - 2 * s - 1;

		const pageOrBlank = (p: number) =>
			p <= totalSourcePages ? p : 0;

		const usableW = sheetW - marginMm * 2;
		const usableH = sheetH - marginMm * 2;
		const halfW = (usableW - gutterMm) / 2;

		const frontPlacements: PagePlacement[] = [
			{
				pageNumber: pageOrBlank(frontLeft),
				x: marginMm - creepOffset,
				y: marginMm,
				width: halfW,
				height: usableH,
				rotation: 0,
				side: 'front',
			},
			{
				pageNumber: pageOrBlank(frontRight),
				x: marginMm + halfW + gutterMm + creepOffset,
				y: marginMm,
				width: halfW,
				height: usableH,
				rotation: 0,
				side: 'front',
			},
		];

		const backPlacements: PagePlacement[] = [
			{
				pageNumber: pageOrBlank(backLeft),
				x: marginMm - creepOffset,
				y: marginMm,
				width: halfW,
				height: usableH,
				rotation: 0,
				side: 'back',
			},
			{
				pageNumber: pageOrBlank(backRight),
				x: marginMm + halfW + gutterMm + creepOffset,
				y: marginMm,
				width: halfW,
				height: usableH,
				rotation: 0,
				side: 'back',
			},
		];

		sheets.push({
			sheetNumber: firstSheet + s,
			front: frontPlacements,
			back: backPlacements,
			signature,
		});
	}

	return sheets;
}

/** ios ImpositionConfig.signaturePages */
export const DEFAULT_SIGNATURE_PAGES = 16;

function calculatePerfectBind(
	totalSourcePages: number,
	config: ImpositionConfig,
): ImpositionResult {
	const size = padToMultiple(
		Math.max(4, config.signaturePages ?? DEFAULT_SIGNATURE_PAGES),
		4,
	);
	const totalPages = padToMultiple(Math.max(totalSourcePages, 1), size);
	const sheets: SheetDefinition[] = [];
	for (let base = 0; base < totalPages; base += size)
		sheets.push(
			...nestedSheets(
				size,
				base,
				sheets.length + 1,
				base / size,
				totalSourcePages,
				config,
			),
		);
	return makeResult(sheets, totalSourcePages, totalPages);
}

function calculateStepAndRepeat(
	totalSourcePages: number,
	config: ImpositionConfig,
): ImpositionResult {
	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);

	const sourcePage = totalSourcePages >= 1 ? 1 : 0;
	const backPage = totalSourcePages >= 2 ? 2 : sourcePage;

	const sheet: SheetDefinition = {
		sheetNumber: 1,
		front: buildGrid(
			[sourcePage, sourcePage],
			1,
			2,
			sheetW,
			sheetH,
			config.marginMm,
			config.gutterMm,
			'front',
		),
		back: buildGrid(
			[backPage, backPage],
			1,
			2,
			sheetW,
			sheetH,
			config.marginMm,
			config.gutterMm,
			'back',
		),
	};

	return {
		sheets: [sheet],
		totalSheets: 1,
		totalPages: 2,
		pagesUsed: Math.min(totalSourcePages, 2),
		blanksAdded: 0,
	};
}

function calculateFourUpBooklet(
	totalSourcePages: number,
	config: ImpositionConfig,
): ImpositionResult {
	const totalPages = padToMultiple(Math.max(totalSourcePages, 8), 8);
	const numSheets = totalPages / 8;

	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);
	const pageOrBlank = (p: number) => (p <= totalSourcePages ? p : 0);

	const sheets: SheetDefinition[] = [];

	for (let s = 0; s < numSheets; s++) {
		const N = totalPages;
		const base = s * 4;

		// right-angle fold, head-to-head
		const frontPages = [
			pageOrBlank(N - base - 3),
			pageOrBlank(base + 4),
			pageOrBlank(N - base),
			pageOrBlank(base + 1),
		];
		const backPages = [
			pageOrBlank(base + 3),
			pageOrBlank(N - base - 2),
			pageOrBlank(base + 2),
			pageOrBlank(N - base - 1),
		];
		const rotations = [180, 180, 0, 0];

		sheets.push({
			sheetNumber: s + 1,
			front: buildGrid(
				frontPages,
				2,
				2,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'front',
				rotations,
			),
			back: buildGrid(
				backPages,
				2,
				2,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'back',
				rotations,
			),
		});
	}

	return makeResult(sheets, totalSourcePages, totalPages);
}

export const GANG_RUN_GRIDS: Record<number, [number, number]> = {
	2: [1, 2],
	4: [2, 2],
	6: [2, 3],
	8: [2, 4],
	9: [3, 3],
};

function calculateGangRun(
	totalSourcePages: number,
	config: ImpositionConfig,
): ImpositionResult {
	const nUp = config.nUp && GANG_RUN_GRIDS[config.nUp] ? config.nUp : 2;
	const [rows, cols] = GANG_RUN_GRIDS[nUp]!;

	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);

	const numSourcePages = Math.max(totalSourcePages, 1);
	const sheets: SheetDefinition[] = [];

	for (let s = 0; s < numSourcePages; s++) {
		const srcPage = s + 1;
		const frontPages = Array(nUp).fill(srcPage) as number[];
		const backSrcPage = s + 1 <= totalSourcePages ? srcPage : 0;
		const backPages = Array(nUp).fill(backSrcPage) as number[];

		sheets.push({
			sheetNumber: s + 1,
			front: buildGrid(
				frontPages,
				rows,
				cols,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'front',
			),
			back: buildGrid(
				backPages,
				rows,
				cols,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'back',
			),
		});
	}

	return {
		sheets,
		totalSheets: sheets.length,
		totalPages: numSourcePages,
		pagesUsed: numSourcePages,
		blanksAdded: 0,
	};
}

function calculateCustomNUp(
	totalSourcePages: number,
	config: ImpositionConfig,
): ImpositionResult {
	const [rows, cols] = config.customGrid ?? [2, 2];
	const cellsPerSide = rows * cols;
	const cellsPerSheet = cellsPerSide * 2;

	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);

	const totalPadded = padToMultiple(
		Math.max(totalSourcePages, cellsPerSheet),
		cellsPerSheet,
	);
	const numSheets = totalPadded / cellsPerSheet;
	const pageOrBlank = (p: number) => (p <= totalSourcePages ? p : 0);

	const sheets: SheetDefinition[] = [];

	for (let s = 0; s < numSheets; s++) {
		const frontStart = s * cellsPerSheet + 1;
		const backStart = frontStart + cellsPerSide;

		const frontPages: number[] = [];
		for (let i = 0; i < cellsPerSide; i++) {
			frontPages.push(pageOrBlank(frontStart + i));
		}

		const backPages: number[] = [];
		for (let i = 0; i < cellsPerSide; i++) {
			backPages.push(pageOrBlank(backStart + i));
		}

		sheets.push({
			sheetNumber: s + 1,
			front: buildGrid(
				frontPages,
				rows,
				cols,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'front',
			),
			back: buildGrid(
				backPages,
				rows,
				cols,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'back',
			),
		});
	}

	return makeResult(sheets, totalSourcePages, totalPadded);
}

export const DUPLEX_AWARE_LAYOUTS = new Set([
	'saddle-stitch',
	'perfect-bind',
	'four-up-booklet',
]);

/** Long edge on a landscape sheet, or short edge on a portrait one. */
export function turnsTopOverBottom(
	config: Pick<
		ImpositionConfig,
		'paperSize' | 'orientation' | 'duplexFlip'
	>,
): boolean {
	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);
	return config.duplexFlip === 'short-edge'
		? sheetW <= sheetH
		: sheetW > sheetH;
}

// registers back behind front
function turnBacks(
	result: ImpositionResult,
	config: ImpositionConfig,
): ImpositionResult {
	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);
	return {
		...result,
		sheets: result.sheets.map((sheet) => ({
			...sheet,
			back: sheet.back.map((p) => ({
				...p,
				x: sheetW - p.x - p.width,
				y: sheetH - p.y - p.height,
				rotation: (p.rotation + 180) % 360,
			})),
		})),
	};
}

export const DIRECTION_AWARE_LAYOUTS = new Set([
	...DUPLEX_AWARE_LAYOUTS,
	'custom-nup',
]);

// layouts assume left-to-right
function mirrored(
	calculateFn: ImpositionLayout['calculate'],
): ImpositionLayout['calculate'] {
	return (totalSourcePages, config) => {
		const result = calculateFn(totalSourcePages, config);
		if (!config.rtl) return result;
		const { sheetW } = sheetDimensions(
			config.paperSize,
			config.orientation,
		);
		const flip = (p: PagePlacement) => ({
			...p,
			x: sheetW - p.x - p.width,
		});
		return {
			...result,
			sheets: result.sheets.map((sheet) => ({
				...sheet,
				front: sheet.front.map(flip),
				back: sheet.back.map(flip),
			})),
		};
	};
}

// layouts assume book turn
function withDuplexPostProcess(
	calculateFn: (
		totalSourcePages: number,
		config: ImpositionConfig,
	) => ImpositionResult,
): (totalSourcePages: number, config: ImpositionConfig) => ImpositionResult {
	return (totalSourcePages, config) => {
		const result = calculateFn(totalSourcePages, config);
		return turnsTopOverBottom(config)
			? turnBacks(result, config)
			: result;
	};
}

export const IMPOSITION_LAYOUTS: ImpositionLayout[] = [
	{
		id: 'saddle-stitch',
		name: '2-up Saddle Stitch',
		description:
			'Pages reordered so the sheet can be folded in half and stapled at the spine. ' +
			'The outermost sheet carries the cover (page 1) and back cover (page N).',
		useCase: 'Booklets, magazines, zines, programmes',
		pagesPerSheet: 4,
		calculate: withDuplexPostProcess(
			mirrored(calculateSaddleStitch),
		),
	},
	{
		id: 'perfect-bind',
		name: '2-up Perfect Bind',
		description:
			'Pages folded into signatures of config.signaturePages, each nested like a ' +
			'saddle stitch. Signatures are stacked, trimmed, and glued at the spine.',
		useCase: 'Paperback books, catalogues, perfect-bound booklets',
		pagesPerSheet: 4,
		calculate: withDuplexPostProcess(
			mirrored(calculatePerfectBind),
		),
	},
	{
		id: 'step-and-repeat',
		name: '2-up Step & Repeat',
		description:
			'The same page (or pair of pages for duplex) is duplicated side by side on ' +
			'every sheet. Cut to yield two identical copies per sheet.',
		useCase: 'Flyers, postcards, invitations, business cards',
		pagesPerSheet: 2,
		calculate: calculateStepAndRepeat,
	},
	{
		id: 'four-up-booklet',
		name: '4-up Booklet (Quarter Fold)',
		description:
			'Four quarter-size pages per side arranged for a double fold. The sheet is ' +
			'folded long-edge then short-edge to produce a small booklet.',
		useCase: 'Pocket booklets, pamphlets, menus',
		pagesPerSheet: 8,
		calculate: withDuplexPostProcess(
			mirrored(calculateFourUpBooklet),
		),
	},
	{
		id: 'gang-run',
		name: 'N-up Gang Run',
		description:
			'Multiple identical copies of a single page nested on one sheet. ' +
			'Supports 2, 4, 6, 8, and 9 copies per sheet. Set config.nUp accordingly.',
		useCase: 'Stickers, business cards, labels, short-run items',
		pagesPerSheet: 2,
		calculate: calculateGangRun,
	},
	{
		id: 'custom-nup',
		name: 'Custom N-up',
		description:
			'Pages flow sequentially through a user-defined rows × columns grid. ' +
			'Set config.customGrid = [rows, cols] to control the layout.',
		useCase: 'Thumbnails, proof sheets, custom print layouts',
		pagesPerSheet: 4,
		calculate: mirrored(calculateCustomNUp),
	},
];

export function getLayoutById(id: string): ImpositionLayout | undefined {
	return IMPOSITION_LAYOUTS.find((l) => l.id === id);
}

/** crop-mark outer edges. */
export function getOuterEdges(placements: PagePlacement[]): {
	left: boolean;
	right: boolean;
	top: boolean;
	bottom: boolean;
}[] {
	if (placements.length === 0) return [];
	const eps = 0.5;
	const minX = Math.min(...placements.map((p) => p.x));
	const maxX = Math.max(...placements.map((p) => p.x + p.width));
	const minY = Math.min(...placements.map((p) => p.y));
	const maxY = Math.max(...placements.map((p) => p.y + p.height));

	return placements.map((p) => ({
		left: Math.abs(p.x - minX) < eps,
		right: Math.abs(p.x + p.width - maxX) < eps,
		top: Math.abs(p.y - minY) < eps,
		bottom: Math.abs(p.y + p.height - maxY) < eps,
	}));
}

export function normaliseRotation(degrees: number): number {
	return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

export function effectiveSheetW(
	paperSize: PaperSize,
	orientation: 'portrait' | 'landscape',
): number {
	return orientation === 'landscape'
		? Math.max(paperSize.widthMm, paperSize.heightMm)
		: Math.min(paperSize.widthMm, paperSize.heightMm);
}

export function effectiveSheetH(
	paperSize: PaperSize,
	orientation: 'portrait' | 'landscape',
): number {
	return orientation === 'landscape'
		? Math.min(paperSize.widthMm, paperSize.heightMm)
		: Math.max(paperSize.widthMm, paperSize.heightMm);
}

/** pdf-lib draw box centring `size` in `cell` (points, y up). */
export function placeInCell(
	cell: { x: number; y: number; width: number; height: number },
	size: { width: number; height: number },
	rotation: number,
	scaling: ImpositionConfig['scaling'],
) {
	const sideways = rotation === 90 || rotation === 270;
	const [frameW, frameH] = sideways
		? [cell.height, cell.width]
		: [cell.width, cell.height];
	const ratio =
		scaling === 'actual'
			? 1
			: (scaling === 'fill' ? Math.max : Math.min)(
					frameW / size.width,
					frameH / size.height,
				);
	const [w, h] = [size.width * ratio, size.height * ratio];
	// pdf-lib ccw about (x,y)
	const turn = (rotation * Math.PI) / 180;
	const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
	return {
		x: cell.x + cell.width / 2 - ((w / 2) * cos - (h / 2) * sin),
		y: cell.y + cell.height / 2 - ((w / 2) * sin + (h / 2) * cos),
		width: w,
		height: h,
	};
}

export function drawPlacementsOnPage(
	page: PDFPage,
	placements: PagePlacement[],
	embeddedPages: PDFEmbeddedPage[],
	sheetHPt: number,
	scaling: ImpositionConfig['scaling'],
) {
	for (const p of placements) {
		if (p.pageNumber === 0) continue;
		const embedded = embeddedPages[p.pageNumber - 1];
		if (!embedded) continue;

		const xPt = p.x * MM_TO_POINTS;
		const wPt = p.width * MM_TO_POINTS;
		const hPt = p.height * MM_TO_POINTS;
		const yPt = sheetHPt - (p.y * MM_TO_POINTS + hPt);
		const cell = { x: xPt, y: yPt, width: wPt, height: hPt };
		page.pushOperators(
			pushGraphicsState(),
			rectangle(xPt, yPt, wPt, hPt),
			clip(),
			endPath(),
		);
		page.drawPage(embedded, {
			...placeInCell(cell, embedded, p.rotation, scaling),
			rotate: degrees(p.rotation),
		});
		page.pushOperators(popGraphicsState());
	}
}

/** Millimetres, top-left origin. */
export interface MarkLine {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** Corner marks on the outer edges, 10 pt long from the trim corner, as iOS; the preview and the PDF both draw these. */
export function cropMarks(placements: PagePlacement[]): MarkLine[] {
	const length = 10 / MM_TO_POINTS;
	const edges = getOuterEdges(placements);
	return placements.flatMap((p, i) => {
		const e = edges[i]!;
		const [left, top] = [p.x, p.y];
		const [right, bottom] = [p.x + p.width, p.y + p.height];
		const lines: MarkLine[] = [];
		const line = (x1: number, y1: number, x2: number, y2: number) =>
			lines.push({ x1, y1, x2, y2 });
		if (e.left) {
			line(left - length, top, left, top);
			line(left - length, bottom, left, bottom);
		}
		if (e.right) {
			line(right, top, right + length, top);
			line(right, bottom, right + length, bottom);
		}
		if (e.top) {
			line(left, top - length, left, top);
			line(right, top - length, right, top);
		}
		if (e.bottom) {
			line(left, bottom, left, bottom + length);
			line(right, bottom, right, bottom + length);
		}
		return lines;
	});
}

export function drawCropMarksOnPdfPage(
	page: PDFPage,
	placements: PagePlacement[],
	sheetHPt: number,
) {
	for (const line of cropMarks(placements))
		page.drawLine({
			start: {
				x: line.x1 * MM_TO_POINTS,
				y: sheetHPt - line.y1 * MM_TO_POINTS,
			},
			end: {
				x: line.x2 * MM_TO_POINTS,
				y: sheetHPt - line.y2 * MM_TO_POINTS,
			},
			thickness: 0.25,
		});
}

// embedpage ignores rotate, cropbox
async function upright(
	src: PDFDocument,
	out: PDFDocument,
): Promise<PDFEmbeddedPage[]> {
	const pages = src.getPages();
	const fast: number[] = [];
	const slow: number[] = [];
	pages.forEach((page, i) => {
		const box = page.getCropBox();
		const media = page.getMediaBox();
		const plain =
			!!page.node.Contents() &&
			normaliseRotation(page.getRotation().angle) === 0 &&
			media.x === 0 &&
			media.y === 0 &&
			box.x === 0 &&
			box.y === 0 &&
			box.width === media.width &&
			box.height === media.height;
		(plain ? fast : slow).push(i);
	});
	// batched: resources copied once
	const embedded: PDFEmbeddedPage[] = [];
	const fastForms = await out.embedPages(fast.map((i) => pages[i]!));
	fast.forEach((i, k) => (embedded[i] = fastForms[k]!));
	if (!slow.length) return embedded;

	const flat = await PDFDocument.create();
	const withContent = slow.filter((i) => !!pages[i]!.node.Contents());
	const forms = await flat.embedPages(
		withContent.map((i) => pages[i]!),
		withContent.map((i) => {
			const b = pages[i]!.getCropBox();
			return {
				left: b.x,
				bottom: b.y,
				right: b.x + b.width,
				top: b.y + b.height,
			};
		}),
	);
	for (const i of slow) {
		const page = pages[i]!;
		const { width: w, height: h } = page.getCropBox();
		const r = normaliseRotation(page.getRotation().angle) as
			0 | 90 | 180 | 270;
		const flatPage = flat.addPage(r % 180 ? [h, w] : [w, h]);
		// pdf-lib needs content stream
		flatPage.pushOperators();
		const k = withContent.indexOf(i);
		if (k < 0) continue;
		flatPage.drawPage(
			forms[k]!,
			{
				0: {},
				90: { x: 0, y: w, rotate: degrees(-90) },
				180: { x: w, y: h, rotate: degrees(180) },
				270: { x: h, y: 0, rotate: degrees(90) },
			}[r],
		);
	}
	// embeds are lazy
	await flat.flush();
	const slowForms = await out.embedPages(flat.getPages());
	slow.forEach((i, k) => (embedded[i] = slowForms[k]!));
	return embedded;
}

export async function imposePdf(
	bytes: Uint8Array,
	config: ImpositionConfig,
): Promise<Uint8Array> {
	const src = await PDFDocument.load(bytes);
	const out = await PDFDocument.create();
	const pages = await upright(src, out);
	const result = getLayoutById(config.layoutId)!.calculate(
		pages.length,
		config,
	);
	const sheetW =
		effectiveSheetW(config.paperSize, config.orientation) *
		MM_TO_POINTS;
	const sheetH =
		effectiveSheetH(config.paperSize, config.orientation) *
		MM_TO_POINTS;
	for (const sheet of result.sheets) {
		for (const side of [sheet.front, sheet.back]) {
			const page = out.addPage([sheetW, sheetH]);
			drawPlacementsOnPage(
				page,
				side,
				pages,
				sheetH,
				config.scaling,
			);
			if (config.cropMarks)
				drawCropMarksOnPdfPage(page, side, sheetH);
		}
	}
	return out.save();
}
