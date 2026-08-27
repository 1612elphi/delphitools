export interface Ingredient {
	kind: 'ing';
	text: string;
}

export interface Ref {
	kind: 'ref';
	name: string;
	note: string;
}

export interface Op {
	kind: 'op';
	id: string;
	label: string;
	detail: string[];
	discard: string[];
	name: string;
	children: Node[];
}

export type Node = Ingredient | Ref | Op;

export interface Cell {
	kind: 'ing' | 'ref' | 'op' | 'pad';
	row: number;
	rows: number;
	col: number;
	cols: number;
	text: string;
	notes: string[];
	discard: string[];
	tag: string;
	opId: string;
	vertical: boolean;
}

export interface Grid {
	cells: Cell[];
	rows: number;
	cols: number;
}

interface Box {
	node: Node;
	top: number;
	rows: number;
	left: number;
}

const EMPTY = {
	text: '',
	notes: [],
	discard: [],
	tag: '',
	opId: '',
	vertical: false,
};

// leaves are rows in column 0; an operation spans the rows of everything
// feeding it, sits one column right of its deepest input, and stretches
// right to meet its parent. Cells come out in cooking order: inputs, then
// the operation that consumes them.
export function layout(root: Op | null): Grid {
	if (!root) return { cells: [], rows: 0, cols: 0 };
	const boxes = new Map<Node, Box>();
	let row = 0;

	const measure = (node: Node): Box => {
		let box: Box;
		if (node.kind !== 'op' || node.children.length === 0) {
			box = {
				node,
				top: row++,
				rows: 1,
				left: node.kind === 'op' ? 1 : 0,
			};
		} else {
			const kids = node.children.map(measure);
			box = {
				node,
				top: kids[0]!.top,
				rows: kids.reduce((sum, k) => sum + k.rows, 0),
				left: 1 + Math.max(...kids.map((k) => k.left)),
			};
		}
		boxes.set(node, box);
		return box;
	};
	const rootBox = measure(root);
	const cols = rootBox.left + 1;

	const cells: Cell[] = [];
	const place = (node: Node, right: number) => {
		const box = boxes.get(node)!;
		const at = { row: box.top, col: 0, rows: 1, cols: 1 };
		if (node.kind === 'ing') {
			cells.push({
				kind: 'ing',
				...at,
				...EMPTY,
				text: node.text,
			});
			return;
		}
		if (node.kind === 'ref') {
			cells.push({
				kind: 'ref',
				...at,
				...EMPTY,
				text: node.name,
				notes: node.note ? [node.note] : [],
			});
			return;
		}
		for (const child of node.children) place(child, box.left - 1);
		const span = Math.max(1, right - box.left + 1);
		cells.push({
			kind: 'op',
			row: box.top,
			rows: box.rows,
			col: box.left,
			cols: span,
			text: node.label,
			notes: node.detail,
			discard: node.discard,
			tag: node.name,
			opId: node.id,
			vertical:
				span === 1 &&
				box.rows >= 4 &&
				node.label.length > 6,
		});
	};
	place(root, cols - 1);

	const taken: boolean[][] = Array.from({ length: row }, () =>
		new Array<boolean>(cols).fill(false),
	);
	for (const cell of cells)
		for (let r = cell.row; r < cell.row + cell.rows; r++)
			for (let c = cell.col; c < cell.col + cell.cols; c++)
				taken[r]![c] = true;
	for (let r = 0; r < row; r++)
		for (let c = 0; c < cols; c++) {
			if (taken[r]![c]) continue;
			let width = 0;
			while (c + width < cols && !taken[r]![c + width])
				width++;
			cells.push({
				kind: 'pad',
				row: r,
				rows: 1,
				col: c,
				cols: width,
				...EMPTY,
			});
			c += width - 1;
		}

	return { cells, rows: row, cols };
}
