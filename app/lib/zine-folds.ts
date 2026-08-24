export type ZineFoldId = 'mini-8' | 'accordion';

export interface ZinePlacement {
	page: number;
	col: number;
	row: number;
	rotation: number;
}

export interface FoldLine {
	axis: 'v' | 'h';
	pos: number;
	kind: 'mountain' | 'valley';
}

export interface CutLine {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface ZineSide {
	side: 'front' | 'back';
	placements: ZinePlacement[];
}

export interface ZineFoldLayout {
	foldId: ZineFoldId;
	cols: number;
	rows: number;
	pageCount: number;
	sides: ZineSide[];
	foldLines: FoldLine[];
	cutLines: CutLine[];
	duplexFlip?: 'short-edge' | 'long-edge';
	instructions: string[];
}

export interface ZineFoldOption {
	id: ZineFoldId;
	name: string;
	tagline: string;
	description: string;
	configurablePanels: boolean;
	panelOptions?: number[];
	supportsDoubleSided: boolean;
	supportsSplit: boolean;
}

const MINI_8_OPTION: ZineFoldOption = {
	id: 'mini-8',
	name: '8-page mini-zine',
	tagline: 'Classic slit & fold',
	description:
		'The classic single-sheet zine. Three folds plus one central cut turn one ' +
		'sheet into an 8-page booklet. Printed single-sided.',
	configurablePanels: false,
	supportsDoubleSided: false,
	supportsSplit: false,
};

export const ZINE_FOLDS: ZineFoldOption[] = [
	MINI_8_OPTION,
	{
		id: 'accordion',
		name: 'Accordion / concertina',
		tagline: 'Zig-zag fold-out',
		description:
			'A zig-zag concertina fold — no cutting. Single-sided makes a fold-out ' +
			'panorama strip; double-sided makes a continuous booklet you read front ' +
			'then back.',
		configurablePanels: true,
		panelOptions: [4, 6, 8],
		supportsDoubleSided: true,
		supportsSplit: true,
	},
];

export function getFoldOption(id: ZineFoldId): ZineFoldOption {
	return ZINE_FOLDS.find((f) => f.id === id) ?? MINI_8_OPTION;
}

function buildMini8(): ZineFoldLayout {
	const placements: ZinePlacement[] = [
		// top row rotates
		{ page: 5, col: 0, row: 0, rotation: 180 },
		{ page: 4, col: 1, row: 0, rotation: 180 },
		{ page: 3, col: 2, row: 0, rotation: 180 },
		{ page: 2, col: 3, row: 0, rotation: 180 },
		// bottom row upright
		{ page: 6, col: 0, row: 1, rotation: 0 },
		{ page: 7, col: 1, row: 1, rotation: 0 },
		{ page: 8, col: 2, row: 1, rotation: 0 },
		{ page: 1, col: 3, row: 1, rotation: 0 },
	];

	return {
		foldId: 'mini-8',
		cols: 4,
		rows: 2,
		pageCount: 8,
		sides: [{ side: 'front', placements }],
		foldLines: [
			{ axis: 'v', pos: 0.25, kind: 'valley' },
			{ axis: 'v', pos: 0.5, kind: 'mountain' },
			{ axis: 'v', pos: 0.75, kind: 'valley' },
			{ axis: 'h', pos: 0.5, kind: 'mountain' },
		],
		cutLines: [{ x1: 0.25, y1: 0.5, x2: 0.75, y2: 0.5 }],
		instructions: [
			'Print the single page (single-sided, landscape).',
			'Fold in half lengthwise (top edge to bottom edge).',
			'Unfold, then fold in half widthwise (right edge to left).',
			'Fold in half widthwise again.',
			"Unfold completely — you'll see 8 panels.",
			'Cut along the red line (centre horizontal, middle two columns only).',
			'Fold lengthwise again, push ends together to form the booklet.',
		],
	};
}

// short-edge duplex page order
function buildAccordion(
	panels: number,
	doubleSided: boolean,
	split: boolean,
): ZineFoldLayout {
	const n = Math.max(2, Math.round(panels));
	const rows = split ? 2 : 1;

	const buildSide = (side: 'front' | 'back'): ZineSide => {
		const placements: ZinePlacement[] = [];
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < n; c++) {
				const page =
					side === 'front' ? c + 1 : n + 1 + c;
				placements.push({
					page,
					col: c,
					row: r,
					rotation: 0,
				});
			}
		}
		return { side, placements };
	};

	const sides: ZineSide[] = [buildSide('front')];
	if (doubleSided) sides.push(buildSide('back'));

	const foldLines: FoldLine[] = [];
	for (let i = 1; i < n; i++) {
		foldLines.push({
			axis: 'v',
			pos: i / n,
			kind: i % 2 === 1 ? 'valley' : 'mountain',
		});
	}

	const cutLines: CutLine[] = split
		? [{ x1: 0, y1: 0.5, x2: 1, y2: 0.5 }]
		: [];

	const foldStep =
		`Fold ${split ? 'each strip' : 'the sheet'} into ${n} equal vertical panels ` +
		'with an alternating zig-zag (concertina) fold — first crease toward you, ' +
		'next away, and so on.';
	const cutStep =
		'Cut the sheet in half along the horizontal red line — two identical strips.';

	const instructions = doubleSided
		? [
				'Print both pages double-sided. In the print dialog choose Two-Sided and ' +
					'“Flip on short edge” so the back lines up correctly.',
				...(split ? [cutStep] : []),
				foldStep,
				'Crease each fold firmly.',
				`Read the front panels left to right (pages 1–${n}), then flip the strip ` +
					`over its right edge and continue on the back (pages ${n + 1}–${n * 2}).` +
					(split
						? ' You now have two identical copies.'
						: ''),
			]
		: [
				'Print the single page (single-sided, landscape).',
				...(split ? [cutStep] : []),
				foldStep,
				'Crease each fold firmly.',
				'The panels read left to right (page 1 is the leftmost panel). Unfold ' +
					(split
						? 'to view as a fold-out — you now have two identical copies.'
						: 'completely to view it as a fold-out panorama.'),
			];

	return {
		foldId: 'accordion',
		cols: n,
		rows,
		// split lanes duplicate pages
		pageCount: doubleSided ? n * 2 : n,
		sides,
		foldLines,
		cutLines,
		duplexFlip: doubleSided ? 'short-edge' : undefined,
		instructions,
	};
}

export interface FoldParams {
	panels?: number;
	doubleSided?: boolean;
	split?: boolean;
}

export function buildFoldLayout(
	id: ZineFoldId,
	params: FoldParams = {},
): ZineFoldLayout {
	switch (id) {
		case 'accordion':
			return buildAccordion(
				params.panels ?? 8,
				params.doubleSided ?? false,
				params.split ?? false,
			);
		case 'mini-8':
		default:
			return buildMini8();
	}
}
