import { clamp } from 'delphicanon/lib/number';
import {
	emptyPara,
	insertBlock,
	newId,
	paraLength,
	type Edit,
} from 'delphitools-v2/lib/errata/write/model';
import type {
	Paragraph,
	Selection,
	Table,
	TableBorder,
	TableCell,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

export const MAX_COLS = 64;
export const MAX_ROWS = 4096;
/** Narrowest column a drag leaves, in pt. */
export const MIN_COL = 18;

export const DEFAULT_BORDER: TableBorder = {
	kind: 'all',
	width: 0.5,
	colour: '#000000',
};

/** A row and column of the grid. */
export interface CellAt {
	row: number;
	col: number;
}

/** Inclusive grid rectangle. */
export interface CellRect {
	r0: number;
	c0: number;
	r1: number;
	c1: number;
}

export const freshCell = (): TableCell => ({ paras: [emptyPara()] });

export function newTable(rows: number, cols: number, width: number): Table {
	return {
		kind: 'table',
		id: newId(),
		cols: Array.from({ length: cols }, () => width / cols),
		rows: Array.from({ length: rows }, () =>
			Array.from({ length: cols }, freshCell),
		),
		border: { ...DEFAULT_BORDER },
	};
}

/** Each grid position as the cell that covers it. */
export type Grid = TableCell[][];

const grids = new WeakMap<Table, Grid>();

/** Spans claim free positions in reading order, clipped at the grid edge; a cell on a claimed position drops. */
export function gridOf(t: Table): Grid {
	let grid = grids.get(t);
	if (grid) return grid;
	const n = t.cols.length;
	const own: (TableCell | undefined)[][] = t.rows.map(() => []);
	const free = (r: number, c: number, cs: number) => {
		for (let j = 0; j < cs; j++) if (own[r]![c + j]) return false;
		return true;
	};
	t.rows.forEach((row, r) =>
		row.forEach((cell, c) => {
			if (cell.covered || own[r]![c]) return;
			let cs = 1;
			while (
				cs < (cell.colspan ?? 1) &&
				c + cs < n &&
				!own[r]![c + cs]
			)
				cs++;
			let rs = 1;
			while (
				rs < (cell.rowspan ?? 1) &&
				r + rs < t.rows.length &&
				free(r + rs, c, cs)
			)
				rs++;
			for (let i = 0; i < rs; i++)
				for (let j = 0; j < cs; j++)
					own[r + i]![c + j] = cell;
		}),
	);
	grid = t.rows.map((row, r) => row.map((cell, c) => own[r]![c] ?? cell));
	grids.set(t, grid);
	return grid;
}

function spanned(cell: TableCell, cs: number, rs: number): TableCell {
	if (
		(cell.colspan ?? 1) === cs &&
		(cell.rowspan ?? 1) === rs &&
		!cell.covered
	)
		return cell;
	const out = { ...cell };
	delete out.colspan;
	delete out.rowspan;
	delete out.covered;
	if (cs > 1) out.colspan = cs;
	if (rs > 1) out.rowspan = rs;
	return out;
}

/** The table rebuilt from a grid; a cell owning a non-rectangular area keeps its first rectangle. */
export function fromGrid(t: Table, grid: Grid, cols = t.cols): Table {
	const seen = new Set<TableCell>();
	const done = grid.map((row) => row.map(() => false));
	const rows = grid.map((row, r) =>
		row.map((o, c): TableCell => {
			if (done[r]![c])
				return { paras: [emptyPara()], covered: true };
			let cs = 1;
			while (row[c + cs] === o && !done[r]![c + cs]) cs++;
			let rs = 1;
			const free = (rr: number) =>
				grid[rr]
					?.slice(c, c + cs)
					.every(
						(x, j) =>
							x === o &&
							!done[rr]![c + j],
					);
			while (free(r + rs)) rs++;
			for (let i = 0; i < rs; i++)
				for (let j = 0; j < cs; j++)
					done[r + i]![c + j] = true;
			const own = seen.has(o) ? freshCell() : o;
			seen.add(o);
			return spanned(own, cs, rs);
		}),
	);
	return { ...t, cols, rows };
}

/** The merge rectangle of the cell covering row, col. */
export function spanOf(t: Table, row: number, col: number): CellRect {
	const grid = gridOf(t);
	const o = grid[row]?.[col];
	let r0 = row;
	let c0 = col;
	while (r0 > 0 && grid[r0 - 1]![col] === o) r0--;
	while (c0 > 0 && grid[r0]![c0 - 1] === o) c0--;
	let r1 = r0;
	let c1 = c0;
	while (grid[r1 + 1]?.[c0] === o) r1++;
	while (grid[r0]![c1 + 1] === o) c1++;
	return { r0, c0, r1, c1 };
}

/** The top-left position of the cell covering row, col, clamped into the grid. */
export function originOf(t: Table, row: number, col: number): CellAt {
	const r = clamp(row, 0, t.rows.length - 1);
	const c = clamp(col, 0, t.cols.length - 1);
	const { r0, c0 } = spanOf(t, r, c);
	return { row: r0, col: c0 };
}

export function withCell(
	t: Table,
	row: number,
	col: number,
	paras: Paragraph[],
): Table {
	const rows = t.rows.slice();
	const cells = rows[row]!.slice();
	cells[col] = {
		...cells[col]!,
		paras: paras.length ? paras : [emptyPara()],
	};
	rows[row] = cells;
	return { ...t, rows };
}

/** The next (1) or previous (-1) cell in reading order, or null past the end. */
export function stepCell(t: Table, at: CellAt, dir: 1 | -1): CellAt | null {
	const n = t.cols.length;
	for (
		let i = at.row * n + at.col + dir;
		i >= 0 && i < t.rows.length * n;
		i += dir
	) {
		const row = Math.floor(i / n);
		const col = i % n;
		if (!t.rows[row]![col]!.covered) return { row, col };
	}
	return null;
}

/** A row inserted before row at; a merge across the gap grows. The table itself at MAX_ROWS. */
export function insertRow(t: Table, at: number): Table {
	if (t.rows.length >= MAX_ROWS) return t;
	const grid = gridOf(t);
	const row = t.cols.map((_, c) => {
		const up = grid[at - 1]?.[c];
		return up && up === grid[at]?.[c] ? up : freshCell();
	});
	const g = grid.slice();
	g.splice(at, 0, row);
	return fromGrid(t, g);
}

/** A column inserted before column at; it takes half of its neighbour's width. The table itself at MAX_COLS. */
export function insertCol(t: Table, at: number): Table {
	if (t.cols.length >= MAX_COLS) return t;
	const ref = Math.min(at, t.cols.length - 1);
	const cols = t.cols.slice();
	const w = cols[ref]! / 2;
	cols[ref] = w;
	cols.splice(at, 0, w);
	const g = gridOf(t).map((row) => {
		const left = row[at - 1];
		const out = row.slice();
		out.splice(
			at,
			0,
			left && left === row[at] ? left : freshCell(),
		);
		return out;
	});
	return fromGrid(t, g, cols);
}

/** Null when it was the last row. */
export function deleteRow(t: Table, row: number): Table | null {
	if (t.rows.length <= 1) return null;
	const g = gridOf(t).slice();
	g.splice(row, 1);
	return fromGrid(t, g);
}

/** Null when it was the last column; its width goes to a neighbour. */
export function deleteCol(t: Table, col: number): Table | null {
	if (t.cols.length <= 1) return null;
	const cols = t.cols.slice();
	const [w] = cols.splice(col, 1);
	cols[Math.max(0, col - 1)]! += w!;
	const g = gridOf(t).map((row) => row.filter((_, c) => c !== col));
	return fromGrid(t, g, cols);
}

/** The rectangle of two cells grown until no merge crosses its edge. */
export function cellRect(t: Table, a: CellAt, b: CellAt): CellRect {
	const r = {
		r0: Math.min(a.row, b.row),
		c0: Math.min(a.col, b.col),
		r1: Math.max(a.row, b.row),
		c1: Math.max(a.col, b.col),
	};
	for (let grown = true; grown;) {
		grown = false;
		for (let i = r.r0; i <= r.r1; i++)
			for (let j = r.c0; j <= r.c1; j++) {
				const s = spanOf(t, i, j);
				if (
					s.r0 < r.r0 ||
					s.c0 < r.c0 ||
					s.r1 > r.r1 ||
					s.c1 > r.c1
				) {
					r.r0 = Math.min(r.r0, s.r0);
					r.c0 = Math.min(r.c0, s.c0);
					r.r1 = Math.max(r.r1, s.r1);
					r.c1 = Math.max(r.c1, s.c1);
					grown = true;
				}
			}
	}
	return r;
}

/** Top-left positions of the cells inside a rectangle, in reading order. */
export function cellsIn(t: Table, r: CellRect): CellAt[] {
	const out: CellAt[] = [];
	for (let row = r.r0; row <= r.r1; row++)
		for (let col = r.c0; col <= r.c1; col++)
			if (!t.rows[row]![col]!.covered) out.push({ row, col });
	return out;
}

const hasText = (c: TableCell) =>
	c.paras.length > 1 || paraLength(c.paras[0]!) > 0;

/** One cell over the rectangle; the text of every cell that has some, in reading order. */
export function mergeCells(t: Table, r: CellRect): Table {
	const cells = cellsIn(t, r).map(({ row, col }) => t.rows[row]![col]!);
	const paras = cells.filter(hasText).flatMap((c) => c.paras);
	const merged = {
		...cells[0]!,
		paras: paras.length ? paras : cells[0]!.paras,
	};
	const g = gridOf(t).map((row, i) =>
		i < r.r0 || i > r.r1
			? row
			: row.map((c, j) =>
					j < r.c0 || j > r.c1 ? c : merged,
				),
	);
	return fromGrid(t, g);
}

/** The merge at row, col back into single cells; the text stays in the first. */
export function splitCell(t: Table, row: number, col: number): Table {
	const s = spanOf(t, row, col);
	const o = gridOf(t)[s.r0]![s.c0]!;
	const g = gridOf(t).map((cells, i) =>
		i < s.r0 || i > s.r1
			? cells
			: cells.map((c, j) =>
					j < s.c0 || j > s.c1
						? c
						: i === s.r0 && j === s.c0
							? o
							: freshCell(),
				),
	);
	return fromGrid(t, g);
}

/** Column widths after dragging the border left of column i to offset x from the table's left edge, in stored pt. */
export function resizeCols(
	cols: number[],
	i: number,
	x: number,
	min: number,
): number[] {
	let left = 0;
	for (let k = 0; k < i - 1; k++) left += cols[k]!;
	const right = left + cols[i - 1]! + cols[i]!;
	if (right - left < 2 * min) return cols;
	const at = clamp(x, left + min, right - min);
	const out = cols.slice();
	out[i - 1] = at - left;
	out[i] = right - at;
	return out;
}

export function tableIndex(doc: WriteDoc, id: string): number {
	return doc.blocks.findIndex((b) => b.kind === 'table' && b.id === id);
}

/** Inserts a table of empty cells at the selection; sel lands on the paragraph after it. */
export function insertTable(
	doc: WriteDoc,
	sel: Selection,
	rows: number,
	cols: number,
	width: number,
): Edit & { table: Table } {
	const table = newTable(
		clamp(rows, 1, MAX_ROWS),
		clamp(cols, 1, MAX_COLS),
		width,
	);
	return { ...insertBlock(doc, sel, table), table };
}
