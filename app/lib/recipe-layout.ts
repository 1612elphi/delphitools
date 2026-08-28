import type { Input, Recipe, Step } from './recipe-parse';
import {
	addQuantities,
	convertProse,
	scaleIngredient,
	type Display,
} from './recipe-scale';

export interface Cell {
	kind: 'ing' | 'ref' | 'step' | 'pad' | 'banner';
	row: number;
	rows: number;
	col: number;
	cols: number;
	text: string;
	detail: string[];
	discard: string[];
	name: string;
	marks: number[];
	vertical: boolean;
}

export interface Grid {
	cells: Cell[];
	rows: number;
	cols: number;
}

export interface View {
	factor: number;
	display: Display;
}

export interface Listed {
	name: string;
	amount: string;
}

export interface Rendered {
	title: string;
	banners: string[];
	notes: string[];
	ingredients: Listed[];
	grid: Grid;
}

interface Box {
	top: number;
	rows: number;
	left: number;
}

const EMPTY = {
	text: '',
	detail: [],
	discard: [],
	name: '',
	marks: [],
	vertical: false,
};

// leaves left, steps rightward
export function layout(
	root: Step | null,
	view: View,
	banners: string[] = [],
): Grid {
	if (!root) return { cells: [], rows: 0, cols: 0 };

	const prose = (text: string) => convertProse(text, view.display);
	const amount = (text: string) =>
		scaleIngredient(text, view.factor, view.display);

	const boxes = new Map<Input | Step, Box>();
	let row = 0;

	const measure = (node: Input | Step): Box => {
		const step = kindOf(node);
		let box: Box;
		if (!step || step.inputs.length === 0) {
			box = { top: row++, rows: 1, left: step ? 1 : 0 };
		} else {
			const kids = step.inputs.map(measure);
			box = {
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
	const place = (node: Input | Step, right: number) => {
		const box = boxes.get(node)!;
		const at = { row: box.top, col: 0, rows: 1, cols: 1 };
		const step = kindOf(node);

		if (!step) {
			const input = node as Input;
			if (input.kind === 'ing')
				cells.push({
					kind: 'ing',
					...at,
					...EMPTY,
					text: [
						amount(input.quantity),
						input.name,
					]
						.filter(Boolean)
						.join(' '),
					detail: input.detail.map(prose),
				});
			else if (input.kind === 'ref')
				cells.push({
					kind: 'ref',
					...at,
					...EMPTY,
					text: input.name,
					detail: input.detail.map(amount),
				});
			return;
		}

		for (const child of step.inputs) place(child, box.left - 1);
		const span = Math.max(1, right - box.left + 1);
		const text = prose(step.label);
		cells.push({
			kind: 'step',
			row: box.top,
			rows: box.rows,
			col: box.left,
			cols: span,
			text,
			detail: step.detail.map(prose),
			discard: step.discard.map(prose),
			name: step.name,
			marks: step.marks,
			vertical:
				span === 1 && box.rows >= 4 && text.length > 6,
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

	if (!banners.length) return { cells, rows: row, cols };
	// banners shift rows down
	for (const cell of cells) cell.row += banners.length;
	const top = banners.map((text, i) => ({
		kind: 'banner' as const,
		...EMPTY,
		row: i,
		rows: 1,
		col: 0,
		cols,
		text: prose(text),
	}));
	return { cells: [...top, ...cells], rows: row + banners.length, cols };
}

function kindOf(node: Input | Step): Step | null {
	if (!('kind' in node)) return node;
	return node.kind === 'step' ? node.step : null;
}

// dedup, table traversal order
export function ingredients(root: Step | null, view: View): Listed[] {
	const order: string[] = [];
	const found = new Map<string, string[]>();
	const walk = (node: Input | Step) => {
		const step = kindOf(node);
		if (step) {
			for (const child of step.inputs) walk(child);
			return;
		}
		const input = node as Input;
		if (input.kind !== 'ing' || !input.name) return;
		const seen = found.get(input.name);
		if (seen) seen.push(input.quantity);
		else {
			order.push(input.name);
			found.set(input.name, [input.quantity]);
		}
	};
	if (root) walk(root);
	return order.map((name) => ({
		name,
		amount: addQuantities(
			found.get(name)!,
			view.factor,
			view.display,
		),
	}));
}

export function render(recipe: Recipe, view: View): Rendered {
	return {
		title: recipe.title,
		banners: recipe.banners.map((note) =>
			convertProse(note, view.display),
		),
		notes: recipe.notes.map((note) =>
			convertProse(note, view.display),
		),
		ingredients: ingredients(recipe.root, view),
		grid: layout(recipe.root, view, recipe.banners),
	};
}
