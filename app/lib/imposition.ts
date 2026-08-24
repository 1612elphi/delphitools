export const MM_TO_POINTS = 72 / 25.4;

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
	/** short-edge adds 180 degrees. */
	duplexFlip?: 'long-edge' | 'short-edge';
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
		// clamp at margin
		const creepOffset = Math.min(rawCreep, marginMm);

		const frontLeft = totalPages - 2 * s;
		const frontRight = 2 * s + 1;
		const backLeft = 2 * s + 2;
		const backRight = totalPages - 2 * s - 1;

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
			sheetNumber: s + 1,
			front: frontPlacements,
			back: backPlacements,
		});
	}

	return makeResult(sheets, totalSourcePages, totalPages);
}

function calculatePerfectBind(
	totalSourcePages: number,
	config: ImpositionConfig,
): ImpositionResult {
	const totalPages = padToMultiple(Math.max(totalSourcePages, 4), 4);
	const numSheets = totalPages / 4;

	const { sheetW, sheetH } = sheetDimensions(
		config.paperSize,
		config.orientation,
	);

	const sheets: SheetDefinition[] = [];
	const pageOrBlank = (p: number) => (p <= totalSourcePages ? p : 0);

	for (let s = 0; s < numSheets; s++) {
		const base = s * 4;
		// odd front pages
		const frontPages = [
			pageOrBlank(base + 1),
			pageOrBlank(base + 3),
		];
		// even back pages
		const backPages = [
			pageOrBlank(base + 2),
			pageOrBlank(base + 4),
		];

		sheets.push({
			sheetNumber: s + 1,
			front: buildGrid(
				frontPages,
				1,
				2,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'front',
			),
			back: buildGrid(
				backPages,
				1,
				2,
				sheetW,
				sheetH,
				config.marginMm,
				config.gutterMm,
				'back',
			),
		});
	}

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

		const frontPages = [
			pageOrBlank(N - base),
			pageOrBlank(N - base - 1),
			pageOrBlank(base + 1),
			pageOrBlank(base + 2),
		];
		const frontRotations = [180, 180, 0, 0];

		const backPages = [
			pageOrBlank(base + 3),
			pageOrBlank(base + 4),
			pageOrBlank(N - base - 2),
			pageOrBlank(N - base - 3),
		];
		const backRotations = [0, 0, 180, 180];

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
				frontRotations,
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
				backRotations,
			),
		});
	}

	return makeResult(sheets, totalSourcePages, totalPages);
}

const GANG_RUN_GRIDS: Record<number, [number, number]> = {
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

function applyTumbleRotation(result: ImpositionResult): ImpositionResult {
	for (const sheet of result.sheets) {
		for (const p of sheet.back) {
			p.rotation = (p.rotation + 180) % 360;
		}
	}
	return result;
}

export const DUPLEX_AWARE_LAYOUTS = new Set([
	'saddle-stitch',
	'perfect-bind',
	'four-up-booklet',
]);

function withDuplexPostProcess(
	calculateFn: (
		totalSourcePages: number,
		config: ImpositionConfig,
	) => ImpositionResult,
	layoutId: string,
): (totalSourcePages: number, config: ImpositionConfig) => ImpositionResult {
	return (totalSourcePages, config) => {
		const result = calculateFn(totalSourcePages, config);
		if (
			config.duplexFlip === 'short-edge' &&
			DUPLEX_AWARE_LAYOUTS.has(layoutId)
		) {
			return applyTumbleRotation(result);
		}
		return result;
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
			calculateSaddleStitch,
			'saddle-stitch',
		),
	},
	{
		id: 'perfect-bind',
		name: '2-up Perfect Bind',
		description:
			'Pages in sequential pairs, front then back. Sheets are stacked, trimmed, ' +
			'and glued at the spine. No page reordering is required.',
		useCase: 'Paperback books, catalogues, perfect-bound booklets',
		pagesPerSheet: 4,
		calculate: withDuplexPostProcess(
			calculatePerfectBind,
			'perfect-bind',
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
			calculateFourUpBooklet,
			'four-up-booklet',
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
		calculate: calculateCustomNUp,
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
