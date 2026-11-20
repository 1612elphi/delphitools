import { module, test } from 'qunit';
import { strToU8, zipSync } from 'fflate';
import {
	ATA_MIME,
	AtaError,
	openAta,
	readDoc,
	saveAta,
} from 'delphitools-v2/lib/errata/write/ata';
import {
	clickAt,
	currentLayout,
	dragTo,
	editLayout,
	editState,
	ensureDocFonts,
	enterCell,
	inner,
	keydown,
	type CellEdit,
	remove,
	tableAction,
	typeText,
} from 'delphitools-v2/lib/errata/write/editor';
import { findAll, replaceRanges } from 'delphitools-v2/lib/errata/write/find';
import {
	browserMetrics,
	ensureFonts,
	filesForFamilies,
} from 'delphitools-v2/lib/errata/write/fonts';
import {
	caretRect,
	cellLayout,
	hitTest,
	moveVertical,
	rangeRects,
	selectionRects,
} from 'delphitools-v2/lib/errata/write/geometry';
import {
	CELL_PAD_X,
	CELL_PAD_Y,
	layoutDoc,
	type Resolver,
} from 'delphitools-v2/lib/errata/write/layout';
import {
	caret,
	deleteBackward,
	docStart,
	deleteSel,
	newDoc,
	paraText,
} from 'delphitools-v2/lib/errata/write/model';
import { docToRtf, rtfToDoc } from 'delphitools-v2/lib/errata/write/rtf';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import {
	MAX_COLS,
	MAX_ROWS,
	cellRect,
	deleteCol,
	deleteRow,
	insertCol,
	insertRow,
	insertTable,
	mergeCells,
	newTable,
	splitCell,
	withCell,
} from 'delphitools-v2/lib/errata/write/table';
import type {
	Block,
	Metrics,
	Paragraph,
	ResolvedChar,
	ResolvedPara,
	Table,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

// 5 pt glyphs
const fake: Metrics = { pick: () => ({ file: 'f', advance: 0.5 }) };

const resolver: Resolver = {
	char: (_p, run): ResolvedChar => ({
		font: 'inter',
		size: 10,
		bold: false,
		italic: false,
		underline: false,
		strike: false,
		colour: '#000000',
		...run.props,
	}),
	para: (p): ResolvedPara => ({
		align: 'left',
		lineSpacing: 1,
		spaceBefore: 0,
		spaceAfter: 0,
		indent: 0,
		firstLine: 0,
		...p.props,
	}),
};

let ids = 0;
const para = (text: string): Paragraph => ({
	kind: 'para',
	id: `p${ids++}`,
	style: 'body',
	props: {},
	runs: [{ text, props: {} }],
	dir: 'ltr',
});

// box 10..190 both ways
const docOf = (blocks: Block[]): WriteDoc => ({
	version: 1,
	name: 't',
	setup: {
		width: 200,
		height: 200,
		margins: { top: 10, right: 10, bottom: 10, left: 10 },
	},
	blocks,
});

function tableOf(texts: string[][], cols?: number[]): Table {
	const t = newTable(texts.length, texts[0]!.length, 180);
	let out = cols ? { ...t, cols } : t;
	texts.forEach((row, r) =>
		row.forEach((s, c) => {
			out = withCell(out, r, c, [para(s)]);
		}),
	);
	return out;
}

const cellText = (t: Table, r: number, c: number) =>
	t.rows[r]![c]!.paras.map(paraText).join('|');

const lay = (doc: WriteDoc) => layoutDoc(doc, fake, resolver);

const tab = (shiftKey = false) =>
	keydown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey }), {
		pages: [],
	});

const bodyTable = () => writeStore.get()!.doc.blocks[1] as Table;

const cellNow = () => inner.get() as CellEdit;

module('Unit | errata | write | table model', function () {
	test('insertTable splits the caret paragraph and sizes the columns', function (assert) {
		const doc = { ...newDoc('t'), blocks: [para('abcd')] };
		const r = insertTable(
			doc,
			caret({ block: 0, offset: 2 }),
			3,
			4,
			400,
		);
		const [a, t, b] = r.doc.blocks;
		assert.strictEqual(paraText(a as Paragraph), 'ab');
		assert.strictEqual(paraText(b as Paragraph), 'cd');
		assert.strictEqual(t!.kind, 'table');
		assert.strictEqual((t as Table).rows.length, 3);
		assert.deepEqual((t as Table).cols, [100, 100, 100, 100]);
		assert.deepEqual(r.sel.focus, { block: 2, offset: 0 });
		const end = insertTable(
			doc,
			caret({ block: 0, offset: 0 }),
			1,
			1,
			10,
		);
		assert.strictEqual(
			end.doc.blocks.at(-1)!.kind,
			'para',
			'a paragraph follows',
		);
	});

	test('rows and columns insert and delete, widths keep their sum', function (assert) {
		const t = tableOf([
			['a', 'b'],
			['c', 'd'],
		]);
		const rows = insertRow(t, 1);
		assert.deepEqual(
			rows.rows.map((r) =>
				r.map((c) => paraText(c.paras[0]!)),
			),
			[
				['a', 'b'],
				['', ''],
				['c', 'd'],
			],
		);
		const cols = insertCol(t, 1);
		assert.deepEqual(cols.cols, [90, 45, 45]);
		assert.strictEqual(cellText(cols, 0, 2), 'b');
		assert.deepEqual(deleteCol(cols, 0)!.cols, [135, 45]);
		assert.strictEqual(cellText(deleteRow(t, 0)!, 0, 1), 'd');
		assert.strictEqual(
			deleteRow(deleteRow(t, 0)!, 0),
			null,
			'last row deletes the table',
		);
		assert.strictEqual(deleteCol(deleteCol(t, 0)!, 0), null);
	});

	test('merge, split, and edits around merges', function (assert) {
		const t = tableOf([
			['a', 'b', 'c'],
			['d', '', 'f'],
		]);
		const m = mergeCells(
			t,
			cellRect(t, { row: 0, col: 0 }, { row: 1, col: 1 }),
		);
		const o = m.rows[0]![0]!;
		assert.strictEqual(o.colspan, 2);
		assert.strictEqual(o.rowspan, 2);
		assert.deepEqual(
			o.paras.map(paraText),
			['a', 'b', 'd'],
			'text of cells with text',
		);
		assert.deepEqual(
			m.rows.flat().map((c) => !!c.covered),
			[false, true, false, true, true, false],
		);
		const grown = cellRect(
			m,
			{ row: 1, col: 1 },
			{ row: 1, col: 2 },
		);
		assert.deepEqual(
			grown,
			{ r0: 0, c0: 0, r1: 1, c1: 2 },
			'a range grows over merges',
		);
		const tall = insertRow(m, 1);
		assert.strictEqual(
			tall.rows[0]![0]!.rowspan,
			3,
			'a row inside a merge grows it',
		);
		const short = deleteRow(m, 0)!;
		assert.strictEqual(
			cellText(short, 0, 0),
			'a|b|d',
			'the merge moves down with its text',
		);
		assert.strictEqual(short.rows[0]![0]!.colspan, 2);
		assert.strictEqual(short.rows[0]![0]!.rowspan, undefined);
		const wide = insertCol(m, 1);
		assert.strictEqual(wide.rows[0]![0]!.colspan, 3);
		const split = splitCell(m, 1, 1);
		assert.false(
			split.rows
				.flat()
				.some(
					(c) =>
						c.covered ||
						c.colspan ||
						c.rowspan,
				),
		);
		assert.strictEqual(cellText(split, 0, 0), 'a|b|d');
		assert.strictEqual(cellText(split, 1, 1), '');
	});

	test('a selected table deletes whole; backspace after a table does nothing', function (assert) {
		const doc = docOf([para('ab'), tableOf([['x']]), para('cd')]);
		const r = deleteSel(doc, {
			anchor: { block: 0, offset: 1 },
			focus: { block: 2, offset: 1 },
		});
		assert.deepEqual(
			r.doc.blocks.map((b) =>
				b.kind === 'para' ? paraText(b) : b.kind,
			),
			['ad'],
		);
		const whole = deleteSel(doc, {
			anchor: { block: 1, offset: 0 },
			focus: { block: 2, offset: 0 },
		});
		assert.deepEqual(
			whole.doc.blocks.map((b) => b.kind),
			['para', 'para'],
		);
		const back = deleteBackward(
			doc,
			caret({ block: 2, offset: 0 }),
			'char',
		);
		assert.strictEqual(back.doc, doc);
	});
});

module('Unit | errata | write | table editing', function (hooks) {
	hooks.afterEach(() => {
		inner.set(null);
		writeStore.close();
	});

	test('a cell edits as a story; Tab moves on and adds a row at the end', function (assert) {
		writeStore.open(
			docOf([
				para('x'),
				tableOf([
					['', ''],
					['', ''],
				]),
				para('y'),
			]),
		);
		enterCell(
			1,
			{ row: 0, col: 0 },
			caret({ block: 0, offset: 0 }),
		);
		typeText('A1');
		assert.true(tab());
		typeText('B1');
		tab();
		typeText('A2');
		tab();
		typeText('B2');
		assert.strictEqual(cellText(bodyTable(), 0, 0), 'A1');
		assert.strictEqual(cellText(bodyTable(), 0, 1), 'B1');
		assert.strictEqual(cellText(bodyTable(), 1, 1), 'B2');
		assert.strictEqual(
			paraText(writeStore.get()!.doc.blocks[0] as Paragraph),
			'x',
			'body untouched',
		);
		tab();
		assert.strictEqual(
			bodyTable().rows.length,
			3,
			'tab in the last cell adds a row',
		);
		assert.deepEqual([cellNow().row, cellNow().col], [2, 0]);
		tab(true);
		assert.deepEqual([cellNow().row, cellNow().col], [1, 1]);
		assert.deepEqual(
			editState()!.sel,
			{
				anchor: { block: 0, offset: 0 },
				focus: { block: 0, offset: 2 },
			},
			'tab selects the cell text',
		);
		writeStore.undo();
		writeStore.undo();
		assert.strictEqual(
			bodyTable().rows.length,
			2,
			'undo takes the row back',
		);
	});

	test('Enter makes a paragraph in the cell, Backspace at its start does nothing', function (assert) {
		writeStore.open(
			docOf([para('x'), tableOf([['ab']]), para('y')]),
		);
		enterCell(
			1,
			{ row: 0, col: 0 },
			caret({ block: 0, offset: 1 }),
		);
		keydown(new KeyboardEvent('keydown', { key: 'Enter' }), {
			pages: [],
		});
		assert.strictEqual(cellText(bodyTable(), 0, 0), 'a|b');
		enterCell(
			1,
			{ row: 0, col: 0 },
			caret({ block: 0, offset: 0 }),
		);
		remove(-1, 'char');
		assert.strictEqual(cellText(bodyTable(), 0, 0), 'a|b');
		assert.strictEqual(writeStore.get()!.doc.blocks.length, 3);
	});

	test('a cell range formats, clears and merges its cells', function (assert) {
		writeStore.open(
			docOf([
				para('x'),
				tableOf([['a', 'b', 'c']]),
				para('y'),
			]),
		);
		enterCell(
			1,
			{ row: 0, col: 0 },
			caret({ block: 0, offset: 0 }),
		);
		inner.set({
			...cellNow(),
			col: 1,
			from: { row: 0, col: 0 },
		});
		assert.deepEqual(
			editState()!.doc.blocks.map((b) =>
				paraText(b as Paragraph),
			),
			['a', 'b'],
		);
		tableAction('merge');
		assert.strictEqual(bodyTable().rows[0]![0]!.colspan, 2);
		assert.strictEqual(cellText(bodyTable(), 0, 0), 'a|b');
		inner.set({
			...cellNow(),
			col: 2,
			from: { row: 0, col: 0 },
		});
		remove(-1, 'char');
		assert.strictEqual(cellText(bodyTable(), 0, 0), '');
		assert.strictEqual(cellText(bodyTable(), 0, 2), '');
		assert.false(!!cellNow().from, 'clearing leaves the range');
	});
});

module('Unit | errata | write | table layout', function () {
	test('column widths scale to the text column; a row is its tallest cell', function (assert) {
		// 10 characters a line
		const t = tableOf([['aaaa bbbb cccc', 'x']], [1, 2]);
		const page = lay(docOf([para('top'), t, para('end')]))
			.pages[0]!;
		const [a, b] = page.cells;
		assert.strictEqual(a!.x, 10);
		assert.strictEqual(a!.w, 60);
		assert.strictEqual(b!.x, 70);
		assert.strictEqual(b!.w, 120);
		assert.strictEqual(a!.y, 22);
		assert.strictEqual(a!.h, 24 + 2 * CELL_PAD_Y, 'two lines');
		assert.strictEqual(b!.h, a!.h);
		assert.strictEqual(a!.lines[0]!.left, 10 + CELL_PAD_X);
		assert.strictEqual(a!.lines[0]!.top, 22 + CELL_PAD_Y);
		const slice = page.lines.find((l) => l.kind === 'table')!;
		assert.deepEqual(
			[slice.top, slice.height, slice.left, slice.width],
			[22, 28, 10, 180],
		);
		const end = page.lines.find((l) => l.block === 2)!;
		assert.strictEqual(end.top, 50, 'text continues below');
		assert.ok(page.boxes.length >= 4, 'rules drawn');
	});

	test('rows move to the next page, a tall row splits, the header row repeats', function (assert) {
		const rows = Array.from({ length: 14 }, (_, i) => [`r${i}`]);
		const t = { ...tableOf(rows), header: true };
		const pages = lay(docOf([t, para('')])).pages;
		// eleven 16 pt rows
		assert.deepEqual(
			pages[0]!.cells.map((c) => c.row),
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
		);
		assert.strictEqual(pages[1]!.cells[0]!.row, 0);
		assert.true(pages[1]!.cells[0]!.repeat, 'header row repeats');
		assert.deepEqual(
			pages[1]!.cells.slice(1).map((c) => c.row),
			[11, 12, 13],
		);
		assert.strictEqual(pages[1]!.cells[1]!.y, 26);
		const tall = tableOf([
			['x'],
			[
				Array.from({ length: 20 }, () =>
					'w'.repeat(30),
				).join(' '),
			],
		]);
		const split = lay(docOf([tall, para('')])).pages;
		const parts = split.map((p) =>
			p.cells.filter((c) => c.row === 1),
		);
		assert.strictEqual(
			parts[0]![0]!.lines.length,
			13,
			'lines that fit',
		);
		assert.strictEqual(parts[1]![0]!.lines.length, 7, 'the rest');
		assert.strictEqual(parts[1]![0]!.y, 10);
		assert.strictEqual(
			parts[1]![0]!.lines[0]!.start,
			parts[0]![0]!.lines.at(-1)!.end,
		);
	});

	test('merged cells span columns and rows', function (assert) {
		const t = tableOf([
			['a', 'b'],
			['c', 'd'],
			['e', 'f'],
		]);
		const m = mergeCells(
			t,
			cellRect(t, { row: 0, col: 0 }, { row: 1, col: 0 }),
		);
		const wide = mergeCells(
			m,
			cellRect(m, { row: 2, col: 0 }, { row: 2, col: 1 }),
		);
		const cells = lay(docOf([wide, para('')])).pages[0]!.cells;
		assert.deepEqual(
			cells.map((c) => [c.row, c.col]),
			[
				[0, 0],
				[0, 1],
				[1, 1],
				[2, 0],
			],
		);
		assert.strictEqual(cells[0]!.h, 32, 'two rows tall');
		assert.strictEqual(cells[3]!.w, 180, 'two columns wide');
	});

	test('geometry works inside a cell', function (assert) {
		const t = tableOf([['ab', 'cdefghijklmnop qr']], [1, 1]);
		const layout = lay(docOf([para('x'), t, para('y')]));
		const cl = cellLayout(layout, 1, 0, 1);
		const left = 100 + CELL_PAD_X;
		assert.deepEqual(caretRect(cl, { block: 0, offset: 0 }), {
			page: 0,
			x: left,
			top: 22 + CELL_PAD_Y,
			height: 12,
		});
		assert.deepEqual(hitTest(cl, 0, left + 11, 26).focus, {
			block: 0,
			offset: 2,
		});
		assert.deepEqual(
			moveVertical(cl, { block: 0, offset: 1 }, 1, left + 5)
				.focus,
			{ block: 0, offset: 16 },
		);
		const rects = selectionRects(
			cl,
			{ block: 0, offset: 0 },
			{ block: 0, offset: 2 },
		);
		assert.deepEqual(rects, [
			{ page: 0, x: left, y: 24, w: 10, h: 12 },
		]);
		assert.deepEqual(
			rangeRects(cl, [{ block: 0, start: 1, end: 2 }]),
			[{ page: 0, x: left + 5, y: 24, w: 5, h: 12 }],
		);
		const body = selectionRects(
			layout,
			{ block: 0, offset: 0 },
			{ block: 2, offset: 0 },
		);
		assert.ok(
			body.some((r) => r.w === 180 && r.h === 28),
			'a body selection covers the table whole',
		);
	});
});

module('Unit | errata | write | table find and files', function () {
	test('find and replace reach cell text', function (assert) {
		const doc = docOf([
			para('cat'),
			tableOf([
				['a cat', 'b'],
				['', 'cat cat'],
			]),
			para(''),
		]);
		const ms = findAll(doc, 'cat', false);
		assert.deepEqual(ms, [
			{ block: 0, start: 0, end: 3 },
			{
				block: 1,
				start: 2,
				end: 5,
				cell: { row: 0, col: 0, para: 0 },
			},
			{
				block: 1,
				start: 0,
				end: 3,
				cell: { row: 1, col: 1, para: 0 },
			},
			{
				block: 1,
				start: 4,
				end: 7,
				cell: { row: 1, col: 1, para: 0 },
			},
		]);
		const r = replaceRanges(doc, ms, 'dog');
		const t = r.blocks[1] as Table;
		assert.strictEqual(cellText(t, 0, 0), 'a dog');
		assert.strictEqual(cellText(t, 1, 1), 'dog dog');
		assert.strictEqual(paraText(r.blocks[0] as Paragraph), 'dog');
	});

	test('.ata keeps tables and sanitises them', function (assert) {
		const t = {
			...tableOf([
				['a', 'b'],
				['c', 'd'],
			]),
			header: true,
		};
		const merged = mergeCells(
			t,
			cellRect(t, { row: 0, col: 0 }, { row: 0, col: 1 }),
		);
		const doc = docOf([merged]);
		const back = openAta(saveAta(doc));
		assert.strictEqual(
			back.blocks.at(-1)!.kind,
			'para',
			'a paragraph follows a last table',
		);
		// covered cells hold nothing
		const shape = (x: Table) => ({
			...x,
			rows: x.rows.map((r) =>
				r.map((c) => (c.covered ? 'covered' : c)),
			),
		});
		assert.deepEqual(shape(back.blocks[0] as Table), shape(merged));
		const raw = (table: object) =>
			zipSync({
				mimetype: strToU8(ATA_MIME),
				'document.json': strToU8(
					JSON.stringify({
						...docOf([]),
						blocks: [table],
					}),
				),
			});
		const cell = (extra = {}) => ({ paras: [para('z')], ...extra });
		const big = openAta(
			raw({
				kind: 'table',
				id: 't',
				cols: Array.from({ length: 70 }, () => 10),
				rows: [
					[
						cell({
							colspan: 99,
							rowspan: 99,
						}),
						cell({ colspan: 2 }),
					],
					[cell({ paras: [] })],
				],
				border: {
					kind: 'all',
					width: 0.5,
					colour: '#000000',
				},
			}),
		).blocks[0] as Table;
		assert.strictEqual(big.cols.length, 64);
		assert.strictEqual(
			big.rows[0]![0]!.colspan,
			64,
			'span clamped to the grid',
		);
		assert.strictEqual(big.rows[0]![0]!.rowspan, 2);
		assert.true(big.rows[1]![0]!.covered);
		assert.true(big.rows.every((r) => r.length === 64));
		const bad = (table: object) => {
			try {
				openAta(
					raw({
						kind: 'table',
						id: 't',
						border: {
							kind: 'all',
							width: 1,
							colour: '#000000',
						},
						...table,
					}),
				);
				return false;
			} catch (e) {
				return e instanceof AtaError;
			}
		};
		assert.true(
			bad({ cols: [Infinity], rows: [[cell()]] }),
			'widths finite',
		);
		assert.true(
			bad({ cols: [], rows: [[cell()]] }),
			'columns needed',
		);
		assert.true(
			bad({
				cols: [10],
				rows: [
					[
						{
							paras: [
								{
									kind: 'table',
									id: 'n',
									cols: [
										1,
									],
									rows: [],
								},
							],
						},
					],
				],
			}),
			'no nested tables',
		);
		const tall = openAta(
			raw({
				kind: 'table',
				id: 't',
				cols: [-5],
				rows: Array.from({ length: 4100 }, () => [
					cell(),
				]),
				border: {
					kind: 'none',
					width: 1,
					colour: '#000000',
				},
			}),
		).blocks[0] as Table;
		assert.strictEqual(tall.rows.length, 4096);
		assert.strictEqual(tall.cols[0], 1, 'widths positive');
	});

	test('RTF round trip keeps cells, merges, header, borders and shading', function (assert) {
		const t = tableOf(
			[
				['a', 'b', 'c'],
				['d', 'e', 'f'],
				['g', 'h', 'i'],
			],
			[100, 200, 100],
		);
		const m = mergeCells(
			t,
			cellRect(t, { row: 0, col: 1 }, { row: 1, col: 1 }),
		);
		const wide = mergeCells(
			m,
			cellRect(m, { row: 2, col: 1 }, { row: 2, col: 2 }),
		);
		const shaded = {
			...wide,
			header: true,
			border: {
				kind: 'outer' as const,
				width: 1,
				colour: '#ff0000',
			},
		};
		shaded.rows = shaded.rows.map((row, r) =>
			row.map((c, k) =>
				r === 0 && k === 0
					? { ...c, shading: '#00ff00' }
					: c,
			),
		);
		const doc = docOf([para('before'), shaded, para('after')]);
		const back = rtfToDoc(docToRtf(doc), 't');
		const bt = back.blocks[1] as Table;
		assert.deepEqual(
			back.blocks.map((b) => b.kind),
			['para', 'table', 'para'],
		);
		assert.deepEqual(bt.cols, [100, 200, 100]);
		assert.strictEqual(bt.rows[0]![1]!.rowspan, 2);
		assert.true(bt.rows[1]![1]!.covered);
		assert.strictEqual(cellText(bt, 0, 1), 'b|e');
		assert.strictEqual(cellText(bt, 1, 2), 'f');
		assert.strictEqual(bt.rows[2]![1]!.colspan, 2);
		assert.strictEqual(cellText(bt, 2, 1), 'h|i');
		assert.true(bt.header);
		assert.deepEqual(bt.border, {
			kind: 'outer',
			width: 1,
			colour: '#ff0000',
		});
		assert.strictEqual(bt.rows[0]![0]!.shading, '#00ff00');
		assert.strictEqual(
			paraText(back.blocks[2] as Paragraph),
			'after',
		);
	});

	test('a Word 2000 RTF table reads', function (assert) {
		const def = String.raw`\trowd \trgaph108\trleft-108\trhdr\trbrdrt\brdrs\brdrw10 \trbrdrl\brdrs\brdrw10 \trbrdrb\brdrs\brdrw10 \trbrdrr\brdrs\brdrw10 \trbrdrh\brdrs\brdrw10 \trbrdrv\brdrs\brdrw10
\clvertalt\clbrdrt\brdrs\brdrw10 \clbrdrl\brdrs\brdrw10 \clbrdrb\brdrs\brdrw10 \clbrdrr\brdrs\brdrw10 \clcbpat2\cltxlrtb\clftsWidth3\clwWidth2840 \cellx2732\clvertalt\clbrdrt\brdrs\brdrw10 \clbrdrl\brdrs\brdrw10 \clbrdrb\brdrs\brdrw10 \clbrdrr\brdrs\brdrw10 \cltxlrtb \cellx5572`;
		const WORD = String.raw`{\rtf1\ansi\ansicpg1252\uc1\deff0{\fonttbl{\f0\froman\fcharset0 Times New Roman;}}{\colortbl;\red0\green0\blue0;\red255\green255\blue0;}
\paperw11906\paperh16838\margl1800\margr1800
\pard\plain \ql \fs24 {Intro\par }
${def}\pard\plain \ql \widctlpar\intbl\aspalpha\fs24 {\b Name\cell }{Value\cell }\pard\plain \widctlpar\intbl {${def}\row }
\trowd \trgaph108\trleft-108\clbrdrt\brdrs\brdrw10 \clbrdrl\brdrs\brdrw10 \clbrdrb\brdrs\brdrw10 \clbrdrr\brdrs\brdrw10 \cellx2732\clbrdrt\brdrs\brdrw10 \clbrdrl\brdrs\brdrw10 \clbrdrb\brdrs\brdrw10 \clbrdrr\brdrs\brdrw10 \cellx5572\pard\plain \ql \widctlpar\intbl {Speed\par in km/h\cell }{120\cell }\pard\plain \widctlpar\intbl {\row }
\pard\plain \ql \fs24 {After\par }}`;
		const doc = rtfToDoc(WORD, 'w');
		assert.deepEqual(
			doc.blocks.map((b) => b.kind),
			['para', 'table', 'para'],
		);
		const t = doc.blocks[1] as Table;
		assert.deepEqual(t.cols, [142, 142]);
		assert.strictEqual(cellText(t, 0, 0), 'Name');
		assert.strictEqual(cellText(t, 1, 0), 'Speed|in km/h');
		assert.strictEqual(cellText(t, 1, 1), '120');
		assert.true(t.header);
		assert.strictEqual(t.border.kind, 'all');
		assert.strictEqual(t.border.width, 0.5);
		assert.strictEqual(t.rows[0]![0]!.shading, '#ffff00');
		assert.true(t.rows[0]![0]!.paras[0]!.runs[0]!.props.bold);
		assert.strictEqual(
			paraText(doc.blocks[2] as Paragraph),
			'After',
		);
	});
});

module('Unit | errata | write | table limits and edges', function (hooks) {
	hooks.afterEach(() => {
		inner.set(null);
		writeStore.close();
	});

	test('after undoing a table delete the caret is in a cell, not on the table', function (assert) {
		writeStore.open(
			docOf([para('x'), tableOf([['ab', 'cd']]), para('y')]),
		);
		enterCell(1, { row: 0, col: 1 }, caret(docStart()));
		tableAction('deleteTable');
		writeStore.undo();
		assert.strictEqual(inner.get(), null);
		remove(-1, 'char');
		assert.strictEqual(
			bodyTable().kind,
			'table',
			'backspace keeps it',
		);
		typeText('Z');
		assert.strictEqual(writeStore.get()!.doc.blocks.length, 3);
		assert.strictEqual(cellText(bodyTable(), 0, 0), 'Zab');
		inner.set(null);
		const s = writeStore.get()!;
		writeStore.commit(
			{
				doc: s.doc,
				sel: {
					anchor: { block: 1, offset: 0 },
					focus: { block: 2, offset: 0 },
				},
			},
			'other',
		);
		remove(-1, 'char');
		assert.deepEqual(
			writeStore.get()!.doc.blocks.map((b) => b.kind),
			['para', 'para'],
			'a selected table deletes',
		);
	});

	test('rows and columns stop at MAX_ROWS and MAX_COLS', function (assert) {
		writeStore.open(
			docOf([
				para('x'),
				newTable(MAX_ROWS, 1, 100),
				para('y'),
			]),
		);
		enterCell(1, { row: MAX_ROWS - 1, col: 0 }, caret(docStart()));
		tab();
		tableAction('rowBelow');
		tableAction('rowAbove');
		assert.strictEqual(bodyTable().rows.length, MAX_ROWS);
		assert.false(writeStore.canUndo(), 'no undo step');
		writeStore.open(
			docOf([
				para('x'),
				newTable(1, MAX_COLS, 100),
				para('y'),
			]),
		);
		enterCell(1, { row: 0, col: 0 }, caret(docStart()));
		tableAction('colRight');
		tableAction('colLeft');
		assert.strictEqual(bodyTable().cols.length, MAX_COLS);
		assert.false(writeStore.canUndo());
	});

	test('a 4096-row merge lays out within its pages', function (assert) {
		const rows = Array.from({ length: MAX_ROWS }, (_, r) =>
			r ? [] : [{ paras: [], rowspan: MAX_ROWS }],
		);
		const doc = readDoc({
			...docOf([]),
			blocks: [
				{
					kind: 'table',
					id: 'big',
					cols: Array.from(
						{ length: MAX_COLS },
						() => 10,
					),
					rows,
					border: {
						kind: 'all',
						width: 0.5,
						colour: '#000000',
					},
				},
			],
		});
		const { pages } = lay(doc);
		assert.ok(pages.length > 1, `${pages.length} pages`);
		const over = pages.filter((p) =>
			p.cells.some(
				(c) =>
					c.y + c.h >
					p.content.top + p.content.height + 1e-6,
			),
		);
		assert.deepEqual(over, [], 'nothing past a page bottom');
	});

	test('RTF tables stop at MAX_ROWS', function (assert) {
		const rtf = `{\\rtf1 ${'\\trowd\\cellx1000\\intbl a\\cell\\row '.repeat(200000)}}`;
		const big = rtfToDoc(rtf, 'x').blocks.find(
			(b) => b.kind === 'table',
		) as Table;
		assert.strictEqual(big.rows.length, MAX_ROWS);
	});

	test('RTF cells without a row end make a last row', function (assert) {
		const open = rtfToDoc(
			'{\\rtf1 \\trowd\\cellx1000\\cellx2000\\intbl a\\cell\\intbl b\\cell\\row\\intbl c\\cell\\intbl d}',
			'x',
		).blocks.find((b) => b.kind === 'table') as Table;
		assert.strictEqual(open.rows.length, 2);
		assert.deepEqual(
			[cellText(open, 1, 0), cellText(open, 1, 1)],
			['c', 'd'],
		);
	});

	test('paragraph shading inside a cell is drawn in the cell', function (assert) {
		const shaded = { ...para('s'), props: { shading: '#ff0000' } };
		const t = withCell(tableOf([['a', 'b']]), 0, 1, [shaded]);
		const page = lay(docOf([t, para('')])).pages[0]!;
		const cell = page.cells.find((c) => c.col === 1)!;
		const box = page.boxes.find((b) => b.fill === '#ff0000');
		const inside =
			!!box &&
			box.x >= cell.x &&
			box.x + box.w <= cell.x + cell.w + 1e-6 &&
			box.y >= cell.y - 1e-6;
		assert.true(inside, JSON.stringify([box, cell.x, cell.w]));
	});

	test('a drag from a cell past the table extends in the cell; a range stays', function (assert) {
		writeStore.open(
			docOf([
				para('x'),
				tableOf([
					['abc', 'def'],
					['g', 'h'],
				]),
				para('y'),
			]),
		);
		const full = lay(writeStore.get()!.doc);
		const cells = full.pages[0]!.cells;
		const a = cells.find((c) => c.row === 0 && c.col === 0)!;
		const b = cells.find((c) => c.row === 0 && c.col === 1)!;
		clickAt(full, 0, a.x + 1, a.y + a.h / 2, {
			extend: false,
			detail: 1,
		});
		dragTo(full, 0, a.x + a.w - 1, 195);
		assert.deepEqual(editState()!.sel.focus, {
			block: 0,
			offset: 3,
		});
		dragTo(full, 0, b.x + 2, b.y + 2);
		dragTo(full, 0, 100, 195);
		assert.deepEqual(
			[cellNow().from, cellNow().col],
			[{ row: 0, col: 0 }, 1],
		);
	});

	test('Arrow down in a second text column keeps the column under the caret', async function (assert) {
		const doc: WriteDoc = {
			...docOf([
				para('x'),
				tableOf(
					Array.from({ length: 40 }, (_, i) => [
						`a${i}`,
						`b${i}`,
					]),
				),
				para('y'),
			]),
			setup: {
				width: 400,
				height: 300,
				margins: {
					top: 20,
					right: 20,
					bottom: 20,
					left: 20,
				},
				columns: 2,
				gutter: 20,
			},
		};
		await ensureDocFonts(doc);
		writeStore.open(doc);
		const full = currentLayout(writeStore.get()!.doc)!;
		const box = full.pages[0]!.cells.find(
			(c) => c.col === 0 && c.lines[0]?.col === 1,
		)!;
		enterCell(1, { row: box.row, col: 0 }, caret(docStart()));
		keydown(
			new KeyboardEvent('keydown', { key: 'ArrowDown' }),
			editLayout(full),
		);
		assert.deepEqual(
			[cellNow().row, cellNow().col],
			[box.row + 1, 0],
		);
	});
});

module('Unit | errata | write | table timing', function () {
	test('50 pages of tables lay out cold under 200 ms, an in-cell edit under 5 ms', async function (assert) {
		await ensureFonts(filesForFamilies(['source-serif-4']));
		const r: Resolver = {
			char: (p, run) => ({
				...resolver.char(p, run),
				font: 'source-serif-4',
				size: 11,
			}),
			para: (p) => resolver.para(p),
		};
		const text = 'Kingsley Read merged entries';
		const tables = Array.from({ length: 50 }, (_, k) =>
			tableOf(
				Array.from({ length: 20 }, (_, i) =>
					Array.from(
						{ length: 4 },
						(_, c) =>
							`${k}.${i}.${c} ${text}`,
					),
				),
			),
		);
		const doc: WriteDoc = {
			...docOf([]),
			setup: {
				width: 595,
				height: 842,
				margins: {
					top: 72,
					right: 72,
					bottom: 72,
					left: 72,
				},
			},
			blocks: tables.flatMap((t) => [t, para('')]),
		};
		layoutDoc(doc, browserMetrics, r);
		// fresh paragraphs skip cache
		const fresh = {
			...doc,
			blocks: doc.blocks.map((b) =>
				b.kind === 'table'
					? {
							...b,
							rows: b.rows.map(
								(row) =>
									row.map(
										(
											c,
										) => ({
											...c,
											paras: c.paras.map(
												(
													p,
												) => ({
													...p,
												}),
											),
										}),
									),
							),
						}
					: { ...b },
			),
		};
		const t0 = performance.now();
		const { pages } = layoutDoc(fresh, browserMetrics, r);
		const cold = performance.now() - t0;
		assert.ok(pages.length >= 50, `${pages.length} pages`);
		assert.ok(cold < 200, `${cold.toFixed(1)} ms`);
		const blocks = fresh.blocks.slice();
		blocks[50] = withCell(blocks[50] as Table, 10, 2, [
			para(`${text} edited`),
		]);
		const t1 = performance.now();
		layoutDoc({ ...fresh, blocks }, browserMetrics, r);
		const edit = performance.now() - t1;
		assert.ok(edit < 5, `edit ${edit.toFixed(2)} ms`);
	});
});
