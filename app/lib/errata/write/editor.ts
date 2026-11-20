import { channel } from 'delphitools-v2/lib/channel';
import { browserMetrics, ensureFonts, filesForFamilies } from './fonts';
import {
	caretRect,
	cellLayout,
	edgeFocus,
	hitTest,
	lineAt,
	lineIndex,
	lineRange,
	moveVertical,
	noteLayout,
	selectionRects,
	storyLayout,
	type Focus,
} from './geometry';
import { ensureHyphenator, hyphenatorFor, type Hyphenator } from './hyphenate';
import {
	LIST_STEP,
	columnsOf,
	edgesOf,
	layoutDoc,
	type Resolver,
} from './layout';
import {
	MIN_COL,
	cellRect,
	cellsIn,
	deleteCol,
	deleteRow,
	insertCol,
	insertRow,
	insertTable,
	mergeCells,
	originOf,
	resizeCols,
	spanOf,
	splitCell,
	stepCell,
	tableIndex,
	withCell,
	type CellAt,
	type CellRect,
} from './table';
import {
	applyChar,
	blockLength,
	blockText,
	caret,
	isLowSurrogate,
	commonChar,
	deleteBackward,
	deleteForward,
	deleteSel,
	docEnd,
	docStart,
	insertBlocks,
	insertPageBreak,
	insertText,
	isCollapsed,
	orderedSel,
	sliceBlocks,
	splitParagraph,
	toPlainText,
	wordBoundary,
	indent,
	clampPos,
	normaliseLink,
	typingProps,
	caretProps,
	linkAround,
	wordAt,
	comparePos,
	insertField as insertFieldAt,
	insertCover,
	insertSectionBreak,
	allParas,
	parasOf,
	clampMargins,
	sectionSetup,
	sectionStart,
	setupAt,
	storyParas,
	withSectionSetup,
	imageIds,
	pickImages,
	withImages,
	withoutObjects,
	insertBlock,
	insertNote as insertNoteAt,
	newId,
	noteRefPos,
	noteRefs,
	renewNotes,
} from './model';
import { step } from './find';
import { closePanel, writePanel } from './view';
import { writeStore, type WriteState, type CommitKind } from './store';
import { resolveChar, resolvePara } from './styles';
import type {
	Block,
	CellBox,
	CharProps,
	FamilyId,
	FloatBox,
	ImageAsset,
	Layout,
	Line,
	PageBox,
	ParaBox,
	Paragraph,
	Pos,
	Selection,
	Setup,
	StoryPart,
	Table,
	TableBorder,
	WriteDoc,
	FieldKind,
	NoteRef,
	Toc,
} from './types';
import { FIELD_CHAR } from './types';

export const resolver: Resolver = {
	char: (p, run) => resolveChar(p.style, run.props),
	para: (p) => resolvePara(p.style, p.props),
};

const paraFamilies = new WeakMap<Paragraph, FamilyId[]>();

function familiesIn(p: Paragraph): FamilyId[] {
	let out = paraFamilies.get(p);
	if (!out) {
		out = [
			...new Set(
				p.runs.map((run) => resolver.char(p, run).font),
			),
		];
		paraFamilies.set(p, out);
	}
	return out;
}

/** Families a document uses, for font loading. */
export function familiesOf(doc: WriteDoc): FamilyId[] {
	const out = new Set<FamilyId>();
	for (const p of allParas(doc))
		for (const f of familiesIn(p)) out.add(f);
	return [...out];
}

const loadedFamilies = new Set<FamilyId>();

/** bumps when fonts or patterns load */
export const fontsLoaded = channel(0);

const bump = () => fontsLoaded.set(fontsLoaded.get() + 1);

export async function ensureFamilies(families: FamilyId[]): Promise<void> {
	const missing = families.filter((f) => !loadedFamilies.has(f));
	if (missing.length === 0) return;
	await ensureFonts(filesForFamilies(missing));
	for (const f of missing) loadedFamilies.add(f);
	bump();
}

const docLang = (doc: WriteDoc) => doc.setup.lang ?? 'en';

/** Fonts, and hyphenation patterns when the document hyphenates. */
export const ensureDocFonts = (doc: WriteDoc) =>
	Promise.all([
		ensureFamilies(familiesOf(doc)),
		doc.setup.hyphenate
			? ensureHyphenator(docLang(doc)).then(bump)
			: null,
	]).then(() => undefined);

const hyphenation = (doc: WriteDoc) =>
	doc.setup.hyphenate ? hyphenatorFor(docLang(doc)) : null;

export const fontsReady = (doc: WriteDoc) =>
	familiesOf(doc).every((f) => loadedFamilies.has(f));

/** Fonts and hyphenation patterns loaded; layout runs unhyphenated before. */
export const docReady = (doc: WriteDoc) =>
	fontsReady(doc) && (!doc.setup.hyphenate || hyphenation(doc) !== null);

let cachedDoc: WriteDoc | null = null;
let cachedHyph: Hyphenator | null = null;
let cachedLayout: Layout | null = null;

const sameLine = (a: Line, b: Line) =>
	a.block === b.block &&
	a.start === b.start &&
	a.end === b.end &&
	a.top === b.top &&
	a.kind === b.kind &&
	a.note === b.note &&
	a.spans === b.spans &&
	a.marker === b.marker &&
	a.hyphen === b.hyphen;

const sameLines = (a: Line[], b: Line[]) =>
	a.length === b.length && a.every((l, i) => sameLine(l, b[i]!));

const sameBoxes = (a: ParaBox[], b: ParaBox[]) =>
	a.length === b.length &&
	a.every((x, i) => {
		const y = b[i]!;
		return (
			x.x === y.x &&
			x.y === y.y &&
			x.w === y.w &&
			x.h === y.h &&
			x.fill === y.fill &&
			x.border === y.border
		);
	});

const sameCells = (a: CellBox[], b: CellBox[]) =>
	a.length === b.length &&
	a.every((x, i) => {
		const y = b[i]!;
		return (
			x.block === y.block &&
			x.row === y.row &&
			x.col === y.col &&
			x.x === y.x &&
			x.y === y.y &&
			x.w === y.w &&
			x.h === y.h &&
			x.repeat === y.repeat &&
			sameLines(x.lines, y.lines)
		);
	});

const sameFloats = (a: FloatBox[], b: FloatBox[]) =>
	a.length === b.length &&
	a.every((x, i) => {
		const y = b[i]!;
		return (
			x.image === y.image &&
			x.x === y.x &&
			x.y === y.y &&
			x.w === y.w &&
			x.boxH === y.boxH
		);
	});

const samePage = (a: PageBox, b: PageBox) =>
	a.width === b.width &&
	a.height === b.height &&
	a.content.top === b.content.top &&
	a.content.height === b.content.height &&
	a.content.left === b.content.left &&
	a.content.width === b.content.width &&
	a.section === b.section &&
	a.sectionBlock === b.sectionBlock &&
	a.headerPart === b.headerPart &&
	a.footerPart === b.footerPart &&
	a.label === b.label &&
	a.cols === b.cols &&
	sameLines(a.lines, b.lines) &&
	sameLines(a.header, b.header) &&
	sameLines(a.footer, b.footer) &&
	sameLines(a.notes, b.notes) &&
	sameLines(a.toc, b.toc) &&
	sameBoxes(a.boxes, b.boxes) &&
	sameCells(a.cells, b.cells) &&
	sameFloats(a.floats, b.floats);

/** Layout of the store's document; null until its fonts load. */
export function currentLayout(doc: WriteDoc): Layout | null {
	const hyph = hyphenation(doc);
	if (doc === cachedDoc && hyph === cachedHyph) return cachedLayout;
	if (!fontsReady(doc)) return null;
	const next = layoutDoc(
		doc,
		browserMetrics,
		resolver,
		hyph,
		cachedLayout ?? undefined,
	);
	const prev = cachedLayout?.pages;
	// paint skips reused pages
	if (prev)
		next.pages = next.pages.map((p, i) =>
			prev[i] && samePage(prev[i], p) ? prev[i] : p,
		);
	cachedDoc = doc;
	cachedHyph = hyph;
	cachedLayout = next;
	return next;
}

/** props the next typed text takes, until the caret moves */
export const pending = channel<CharProps | null>(null);
export const invisibles = channel(false);
export const rulers = channel(false);
export const typewriter = channel(false);
export const focusMode = channel(false);
export type MarginGuide = 'off' | 'border' | 'corners';
export const marginGuide = channel<MarginGuide>('corners');
let goalX: number | null = null;
let clip: {
	text: string;
	blocks: Block[];
	images: Record<string, ImageAsset>;
	notes: Record<string, Paragraph[]>;
	token: string;
} | null = null;

// marks own copies
const CLIP_TYPE = 'application/x-errata-clip';

/** A header or footer being edited. */
export interface StoryEdit {
	kind: 'story';
	/** id of the section break that starts the section, null for the document setup */
	section: string | null;
	part: StoryPart;
	/** page it was entered on */
	page: number;
	sel: Selection;
}

/** Block index of the story's section start, -1 for the document setup; undefined once its section break is gone. */
function storyStart(doc: WriteDoc, st: StoryEdit): number | undefined {
	if (st.section === null) return -1;
	const i = doc.blocks.findIndex(
		(b) => b.kind === 'section' && b.id === st.section,
	);
	return i < 0 ? undefined : i;
}

const sectionId = (doc: WriteDoc, start: number) => {
	const b = doc.blocks[start];
	return b?.kind === 'section' ? b.id : null;
};

/** A table cell being edited. */
export interface CellEdit {
	kind: 'cell';
	/** id of the table block */
	table: string;
	row: number;
	col: number;
	sel: Selection;
	/** anchor of a cell range running to row, col */
	from?: CellAt;
}

/** A footnote or endnote being edited. */
export interface NoteEdit {
	kind: 'note';
	id: string;
	sel: Selection;
}

export type InnerEdit = StoryEdit | CellEdit | NoteEdit;

/** The header, footer, table cell or note the editor edits instead of the body. */
export const inner = channel<InnerEdit | null>(null);

writePanel.subscribe(() => {
	if (writePanel.get() === 'find' && inner.get()?.kind === 'story')
		inner.set(null);
});

const innerLives = (doc: WriteDoc, e: InnerEdit) =>
	e.kind === 'story'
		? storyStart(doc, e) !== undefined
		: e.kind === 'cell'
			? tableIndex(doc, e.table) >= 0
			: !!doc.notes?.[e.id];

// edited parts may vanish
writeStore.subscribe(() => {
	const e = inner.get();
	const s = writeStore.get();
	if (e && !(s && innerLives(s.doc, e))) inner.set(null);
});

let innerMemo: {
	doc: WriteDoc;
	edit: object;
	key: string;
	state: WriteState;
} | null = null;

// inner story as document
function innerState(
	doc: WriteDoc,
	edit: { sel: Selection },
	key: string,
	blocks: () => Block[],
	whole = false,
): WriteState {
	if (innerMemo?.doc === doc && innerMemo.edit === edit)
		return innerMemo.state;
	const prev =
		innerMemo?.doc === doc && innerMemo.key === key
			? innerMemo.state.doc
			: null;
	const sdoc = prev ?? { ...doc, blocks: blocks() };
	const { anchor, focus } = edit.sel;
	const sel = whole
		? { anchor: docStart(), focus: docEnd(sdoc) }
		: comparePos(clampPos(sdoc, anchor), anchor) ||
			  comparePos(clampPos(sdoc, focus), focus)
			? {
					anchor: clampPos(sdoc, anchor),
					focus: clampPos(sdoc, focus),
				}
			: edit.sel;
	innerMemo = { doc, edit, key, state: { doc: sdoc, sel } };
	return innerMemo.state;
}

const withBlock = (doc: WriteDoc, bi: number, b: Block): WriteDoc => {
	const blocks = doc.blocks.slice();
	blocks[bi] = b;
	return { ...doc, blocks };
};

const isPara = (b: Block): b is Paragraph => b.kind === 'para';

/** Commits to the body store. */
export function commit({ doc, sel }: WriteState, kind: CommitKind) {
	if (kind !== 'type') pending.set(null);
	const { anchor, focus } = sel;
	writeStore.commit({ doc, sel: { anchor, focus } }, kind);
}

interface InCell {
	bi: number;
	table: Table;
	/** the focus cell */
	at: CellAt;
	/** cells in reading order */
	range: CellAt[] | null;
	/** range or focus merge */
	rect: CellRect;
}

interface Target {
	state: WriteState;
	/** paragraphs-only story or cell */
	inner: boolean;
	story: StoryEdit | null;
	cell: InCell | null;
	note: NoteEdit | null;
	commit(next: WriteState, kind: CommitKind): void;
	select(sel: Selection): void;
}

function innerTarget(
	state: WriteState,
	parts: Pick<Target, 'story' | 'cell' | 'note'>,
	move: (sel: Selection, committing: boolean) => void,
	put: (paras: Paragraph[], kind: CommitKind, sel: Selection) => void,
): Target {
	return {
		state,
		inner: true,
		...parts,
		commit(next, kind) {
			if (kind !== 'type') pending.set(null);
			const { anchor, focus } = next.sel;
			const sel = { anchor, focus };
			const paras = next.doc.blocks.filter(isPara);
			// paragraphs only inside
			if (paras.length < next.doc.blocks.length) return;
			move(sel, true);
			if (next.doc !== state.doc) put(paras, kind, sel);
		},
		select(sel) {
			// caret moves end typing
			writeStore.breakMerge();
			move(sel, false);
		},
	};
}

function cellTarget(s: WriteState, ce: CellEdit, bi: number): Target {
	const table = s.doc.blocks[bi] as Table;
	const at = originOf(table, ce.row, ce.col);
	const from = ce.from && originOf(table, ce.from.row, ce.from.col);
	const many = from && (from.row !== at.row || from.col !== at.col);
	const rect = many
		? cellRect(table, from, at)
		: spanOf(table, at.row, at.col);
	const range = many ? cellsIn(table, rect) : null;
	const cells = range ?? [at];
	const cellOf = (c: CellAt) => table.rows[c.row]![c.col]!;
	const state = innerState(
		s.doc,
		ce,
		`c|${ce.table}|${cells.map((c) => `${c.row},${c.col}`).join(' ')}`,
		() => cells.flatMap((c) => cellOf(c).paras),
		!!range,
	);
	const put = (t: Table, kind: CommitKind) =>
		writeStore.commit(
			{ doc: withBlock(s.doc, bi, t), sel: s.sel },
			kind,
		);
	const edit = (c: CellAt, sel: Selection) =>
		inner.set({ kind: 'cell', table: ce.table, ...c, sel });
	return innerTarget(
		state,
		{
			story: null,
			cell: { bi, table, at, range, rect },
			note: null,
		},
		(sel, committing) => {
			if (!range) edit(at, sel);
			else if (!committing) edit(at, caret(docStart()));
		},
		(paras, kind, sel) => {
			if (!range)
				return put(
					withCell(table, at.row, at.col, paras),
					kind,
				);
			let t = table;
			if (
				kind === 'format' &&
				paras.length === state.doc.blocks.length
			) {
				let k = 0;
				for (const c of range) {
					const n = cellOf(c).paras.length;
					t = withCell(
						t,
						c.row,
						c.col,
						paras.slice(k, (k += n)),
					);
				}
			} else {
				range.forEach((c, i) => {
					t = withCell(
						t,
						c.row,
						c.col,
						i ? [] : paras,
					);
				});
				edit(range[0]!, sel);
			}
			put(t, kind);
		},
	);
}

// last body caret block
let bodyBlock = 0;
let parked: { s: WriteState; ce: CellEdit } | null = null;

// collapsed caret on table
function parkedCell(s: WriteState): CellEdit | null {
	const { focus } = s.sel;
	const t = s.doc.blocks[focus.block];
	if (t?.kind !== 'table' || !isCollapsed(s.sel)) return null;
	if (parked?.s !== s) {
		const at: CellAt =
			bodyBlock > focus.block
				? originOf(
						t,
						t.rows.length - 1,
						t.cols.length - 1,
					)
				: { row: 0, col: 0 };
		parked = {
			s,
			ce: {
				kind: 'cell',
				table: t.id,
				...at,
				sel: caret(
					bodyBlock > focus.block
						? cellEnd(t, at)
						: docStart(),
				),
			},
		};
	}
	return parked.ce;
}

function target(): Target | null {
	const s = writeStore.get();
	if (!s) return null;
	const e = inner.get();
	switch (e?.kind) {
		case 'cell': {
			const bi = tableIndex(s.doc, e.table);
			if (bi >= 0) return cellTarget(s, e, bi);
			break;
		}
		case 'note': {
			const paras = s.doc.notes?.[e.id];
			if (paras) return noteTarget(s, e, paras);
			break;
		}
		case 'story': {
			const start = storyStart(s.doc, e);
			if (start !== undefined)
				return storyTarget(s, e, start);
			break;
		}
	}
	const pc = parkedCell(s);
	if (pc) return cellTarget(s, pc, s.sel.focus.block);
	bodyBlock = s.sel.focus.block;
	return {
		state: s,
		inner: false,
		story: null,
		cell: null,
		note: null,
		commit,
		select: (sel) =>
			writeStore.commit({ doc: s.doc, sel }, 'other'),
	};
}

function noteTarget(s: WriteState, ne: NoteEdit, paras: Paragraph[]): Target {
	return innerTarget(
		innerState(s.doc, ne, `n|${ne.id}`, () => paras),
		{ story: null, cell: null, note: ne },
		(sel) => inner.set({ ...ne, sel }),
		(next, kind) =>
			writeStore.commit(
				{
					doc: {
						...s.doc,
						notes: {
							...s.doc.notes,
							[ne.id]: next,
						},
					},
					sel: s.sel,
				},
				kind,
			),
	);
}

function storyTarget(s: WriteState, st: StoryEdit, start: number): Target {
	const state = innerState(s.doc, st, `s|${st.section}|${st.part}`, () =>
		storyParas(setupAt(s.doc, start)!, st.part),
	);
	return innerTarget(
		state,
		{ story: st, cell: null, note: null },
		(sel) => inner.set({ ...st, sel }),
		(paras, kind) =>
			writeStore.commit(
				{
					doc: withSectionSetup(s.doc, start, {
						...setupAt(s.doc, start)!,
						[st.part]: paras,
					}),
					sel: s.sel,
				},
				kind,
			),
	);
}

/** The state the editor works on: the edited header or footer, else the body. */
export function editState(): WriteState | null {
	return target()?.state ?? null;
}

/** A TrackedExternal source for editState. */
export const editStore = {
	get: editState,
	subscribe: (fn: () => void) => {
		const a = writeStore.subscribe(fn);
		const b = inner.subscribe(fn);
		return () => {
			a();
			b();
		};
	},
};

/** The layout geometry runs on: only the edited story's or cell's lines while one is edited. */
export function editLayout(layout: Layout): Layout {
	const t = target();
	if (t?.note) return noteLayout(layout, t.note.id);
	if (t?.cell)
		return cellLayout(
			layout,
			t.cell.bi,
			t.cell.at.row,
			t.cell.at.col,
		);
	const st = t?.story;
	if (!st) return layout;
	const start = storyStart(writeStore.get()!.doc, st)!;
	return storyLayout(layout, start, st.part, st.page);
}

function apply(next: WriteState, kind: CommitKind) {
	target()?.commit(next, kind);
}

function select(sel: Selection, keepGoal = false) {
	if (!keepGoal) goalX = null;
	pending.set(null);
	const t = target();
	if (t?.inner) t.select(sel);
	else bodySelect(sel, keepGoal);
}

// ends cell editing
function bodySelect(sel: Selection, keepGoal = false) {
	const s = writeStore.get();
	if (!s) return;
	// carets skip tables
	if (s.doc.blocks[sel.focus.block]?.kind === 'table' && isCollapsed(sel))
		return enterTable(
			sel.focus.block,
			s.sel.focus.block <= sel.focus.block ? 1 : -1,
			keepGoal ? goalX : null,
		);
	writeStore.commit({ doc: s.doc, sel }, 'other');
}

function cellEnd(t: Table, c: CellAt): Pos {
	const paras = t.rows[c.row]![c.col]!.paras;
	return { block: paras.length - 1, offset: blockLength(paras.at(-1)) };
}

/** Edits a table cell; the body caret moves onto the table. */
export function enterCell(bi: number, at: CellAt, sel: Selection) {
	const s = writeStore.get();
	const t = s?.doc.blocks[bi];
	if (!s || t?.kind !== 'table') return;
	pending.set(null);
	writeStore.breakMerge();
	const on = { block: bi, offset: 0 };
	if (comparePos(s.sel.anchor, on) || comparePos(s.sel.focus, on))
		writeStore.commit({ doc: s.doc, sel: caret(on) }, 'other');
	inner.set({
		kind: 'cell',
		table: t.id,
		...originOf(t, at.row, at.col),
		sel,
	});
}

function colAt(
	layout: Layout,
	t: Table,
	bi: number,
	x: number,
	page: number,
	col: number,
): number {
	const of = (l: Line) => l.kind === 'table' && l.block === bi;
	let line = layout.pages[page]?.lines.find(
		(l) => of(l) && (l.col ?? 0) === col,
	);
	for (let i = 0; !line && i < layout.pages.length; i++)
		line = layout.pages[i]!.lines.find(of);
	if (!line) return 0;
	const xs = edgesOf(t, line.left, line.width);
	return Math.max(
		0,
		xs.findLastIndex((e, i) => e <= x && i < t.cols.length),
	);
}

function tabCell(c: InCell, dir: 1 | -1) {
	let next = stepCell(c.table, c.at, dir);
	if (!next && dir > 0) {
		const t = insertRow(c.table, c.table.rows.length);
		if (t === c.table) return;
		const s = writeStore.get()!;
		commit({ doc: withBlock(s.doc, c.bi, t), sel: s.sel }, 'other');
		next = { row: c.table.rows.length, col: 0 };
	}
	const t = writeStore.get()!.doc.blocks[c.bi] as Table;
	if (next)
		enterCell(c.bi, next, {
			anchor: docStart(),
			focus: cellEnd(t, originOf(t, next.row, next.col)),
		});
}

// cell edge arrows, tab
function cellKey(
	e: KeyboardEvent,
	t: Target,
	c: InCell,
	layout: Layout,
): boolean {
	const { sel, doc } = t.state;
	if (e.key === 'Tab') {
		tabCell(c, e.shiftKey ? -1 : 1);
		return true;
	}
	if (c.range) {
		if (!/^(Arrow|Home|End|Escape)/.test(e.key)) return false;
		t.select(caret(docStart()));
		return true;
	}
	if (e.shiftKey || e.altKey || MOD(e) || !isCollapsed(sel)) return false;
	const s = writeStore.get()!;
	const { focus } = sel;
	if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
		const dir = e.key === 'ArrowLeft' ? -1 : 1;
		const edge = dir < 0 ? docStart() : docEnd(doc);
		if (comparePos(focus, edge)) return false;
		const next = stepCell(c.table, c.at, dir);
		if (next)
			enterCell(
				c.bi,
				next,
				caret(
					dir < 0
						? cellEnd(c.table, next)
						: docStart(),
				),
			);
		else if (c.bi + dir >= 0)
			bodySelect(
				caret(
					dir < 0
						? clampPos(s.doc, {
								block: c.bi - 1,
								offset: 1e9,
							})
						: {
								block: c.bi + 1,
								offset: 0,
							},
				),
			);
		return true;
	}
	if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
	const full = currentLayout(s.doc);
	const dir = e.key === 'ArrowUp' ? -1 : 1;
	const { index, count } = lineIndex(layout, focus, sel.focusAffinity);
	if (dir < 0 ? index > 0 : index < count - 1) return false;
	if (!full) return true;
	goalX ??= caretRect(layout, focus, sel.focusAffinity).x;
	const span = spanOf(c.table, c.at.row, c.at.col);
	const row = dir < 0 ? span.r0 - 1 : span.r1 + 1;
	if (row < 0 || row >= c.table.rows.length) {
		const block = c.bi + dir;
		if (block < 0) return true;
		const f = edgeFocus(full, dir, goalX, block);
		bodySelect({ anchor: f.focus, ...f }, true);
		return true;
	}
	const here = lineAt(layout, focus, sel.focusAffinity);
	const to = originOf(
		c.table,
		row,
		colAt(
			full,
			c.table,
			c.bi,
			goalX,
			here?.page ?? 0,
			here?.line.col ?? 0,
		),
	);
	enterCell(c.bi, to, caret(docStart()));
	const f = edgeFocus(cellLayout(full, c.bi, to.row, to.col), dir, goalX);
	select({ anchor: f.focus, ...f }, true);
	return true;
}

// dir 1 from above
function enterTable(bi: number, dir: 1 | -1, x: number | null) {
	const s = writeStore.get()!;
	const t = s.doc.blocks[bi] as Table;
	const layout = currentLayout(s.doc);
	const edge = dir > 0 ? 0 : t.rows.length - 1;
	let at: CellAt =
		dir > 0
			? { row: 0, col: 0 }
			: { row: edge, col: t.cols.length - 1 };
	if (x !== null && layout) {
		const here = lineAt(layout, s.sel.focus, s.sel.focusAffinity);
		at = {
			row: edge,
			col: colAt(
				layout,
				t,
				bi,
				x,
				here?.page ?? 0,
				here?.line.col ?? 0,
			),
		};
	}
	at = originOf(t, at.row, at.col);
	enterCell(bi, at, caret(dir > 0 ? docStart() : cellEnd(t, at)));
	if (x === null || !layout) return;
	const f = edgeFocus(cellLayout(layout, bi, at.row, at.col), dir, x);
	select({ anchor: f.focus, ...f }, true);
}

/** Leaves header, footer, cell or note editing. */
export const leaveInner = () => inner.set(null);

/** Double-click on a header or footer area edits it, on the body leaves; true when used. */
export function storyDoubleClick(
	layout: Layout,
	page: number,
	x: number,
	y: number,
): boolean {
	const p = layout.pages[page];
	const s = writeStore.get();
	if (!p || !s) return false;
	const { top, height } = p.content;
	const kind = y < top ? 'header' : y > top + height ? 'footer' : null;
	const st = target()?.story;
	if (!kind) {
		if (!st) return false;
		leaveInner();
		return true;
	}
	const part = kind === 'header' ? p.headerPart : p.footerPart;
	const section = sectionId(s.doc, p.sectionBlock);
	if (st?.part === part && st.section === section && st.page === page)
		return false;
	writePanel.set(null);
	pending.set(null);
	goalX = null;
	writeStore.breakMerge();
	const st0: StoryEdit = {
		kind: 'story',
		section,
		part,
		page,
		sel: caret(docStart()),
	};
	inner.set(st0);
	const hit = hitTest(editLayout(layout), page, x, y);
	inner.set({ ...st0, sel: { anchor: hit.focus, ...hit } });
	return true;
}

/** Moves the selection without an undo step. */
export function selectRange(sel: Selection) {
	leaveInner();
	goalX = null;
	pending.set(null);
	bodySelect(sel);
}

function caretPara({ doc, sel }: WriteState): Paragraph | null {
	const b = doc.blocks[sel.focus.block];
	return isCollapsed(sel) && b?.kind === 'para' ? b : null;
}

const heldProps = (s: WriteState, p: Paragraph) =>
	pending.get() ?? caretProps(p, s.sel.focus.offset);

/** caret props for the bar: pending overrides the text's own */
export function barChar(state: WriteState): CharProps {
	const p = caretPara(state);
	const own = p
		? resolveChar(p.style, caretProps(p, state.sel.focus.offset))
		: commonChar(state.doc, state.sel);
	return { ...own, ...pending.get() };
}

export function typeText(text: string) {
	const s = editState();
	if (!s || !text) return;
	const p = caretPara(s);
	const held = p ? pending.get() : null;
	const props = p ? heldProps(s, p) : undefined;
	const next = insertText(s.doc, s.sel, text, props);
	goalX = null;
	apply(next, 'type');
	if (held) pending.set(held);
}

/** bold/italic and friends: on a caret they become pending */
export function formatChar(props: Partial<CharProps>) {
	const s = editState();
	if (!s) return;
	const p = caretPara(s);
	if (p && blockLength(p) > 0) {
		pending.set({ ...heldProps(s, p), ...props });
		return;
	}
	apply(applyChar(s.doc, s.sel, props), 'format');
}

export function run(op: (doc: WriteDoc, sel: Selection) => WriteState) {
	const s = editState();
	if (s) apply(op(s.doc, s.sel), 'format');
}

function stepBlock(doc: WriteDoc, pos: Pos, dir: 1 | -1): Pos {
	if (dir < 0)
		return pos.block > 0
			? clampPos(doc, { block: pos.block - 1, offset: 1e9 })
			: pos;
	return pos.block < doc.blocks.length - 1
		? { block: pos.block + 1, offset: 0 }
		: pos;
}

function wordMove(doc: WriteDoc, pos: Pos, dir: 1 | -1): Pos {
	const text = blockText(doc.blocks[pos.block]);
	if (dir < 0 ? pos.offset === 0 : pos.offset >= text.length)
		return stepBlock(doc, pos, dir);
	return {
		block: pos.block,
		offset: wordBoundary(text, pos.offset, dir),
	};
}

function charMove(doc: WriteDoc, pos: Pos, dir: 1 | -1): Pos {
	const text = blockText(doc.blocks[pos.block]);
	let offset = pos.offset + dir;
	if (offset < 0 || offset > text.length) return stepBlock(doc, pos, dir);
	// keep surrogate pairs whole
	if (isLowSurrogate(text.charCodeAt(offset))) offset += dir;
	return { block: pos.block, offset };
}

/** Backspace (-1) or Delete (1); a selection goes whole. */
export function remove(dir: 1 | -1, unit: 'char' | 'word') {
	const s = editState();
	if (!s) return;
	const { doc, sel } = s;
	const op = !isCollapsed(sel)
		? deleteSel(doc, sel)
		: dir < 0
			? deleteBackward(doc, sel, unit)
			: deleteForward(doc, sel, unit);
	apply(op, 'delete');
}

/** The edited part and the selection in it. */
export interface CaretAt {
	edit: InnerEdit | null;
	/** stable part id */
	key: string;
	sel: Selection;
}

const editKey = (e: InnerEdit | null) =>
	!e
		? ''
		: e.kind === 'cell'
			? `c|${e.table}|${e.row}|${e.col}`
			: e.kind === 'note'
				? `n|${e.id}`
				: `s|${e.section}|${e.part}|${e.page}`;

export function caretAt(): CaretAt | null {
	const s = writeStore.get();
	const t = target();
	if (!s || !t) return null;
	const edit = t.inner ? (inner.get() ?? parkedCell(s)) : null;
	return { edit, key: editKey(edit), sel: t.state.sel };
}

/** Whether the part and selection are still at's. */
export function caretIn(at: CaretAt): boolean {
	const now = caretAt();
	return (
		now?.key === at.key &&
		!comparePos(now.sel.anchor, at.sel.anchor) &&
		!comparePos(now.sel.focus, at.sel.focus)
	);
}

/** Moves the selection inside the caret's paragraph, as a keyboard's own caret control does. */
export function selectAround(anchor: number, focus: number) {
	const block = target()?.state.sel.focus.block;
	if (block === undefined) return;
	select({
		anchor: { block, offset: anchor },
		focus: { block, offset: focus },
	});
}

/** Replaces offsets from..to of the paragraph at (the caret's by default) with text, as an IME commit over text around the caret does. */
export function replaceAround(
	from: number,
	to: number,
	text: string,
	at = caretAt(),
) {
	if (!at) return;
	if (caretAt()?.key !== at.key) inner.set(at.edit);
	const { block } = at.sel.focus;
	const held = pending.get();
	select({
		anchor: { block, offset: from },
		focus: { block, offset: to },
	});
	pending.set(held);
	if (text) typeText(text);
	else if (from < to) remove(-1, 'char');
	pending.set(held);
}

export function enter() {
	const s = editState();
	if (s) apply(splitParagraph(s.doc, s.sel), 'other');
}

export const MOD = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

/** Handles one keydown; true when the editor used it. */
export function keydown(e: KeyboardEvent, layout: Layout): boolean {
	const t = target();
	if (!t) return false;
	if (t.cell && cellKey(e, t, t.cell, layout)) return true;
	const s = t.state;
	const { doc, sel } = s;
	const mod = MOD(e);
	const [from, to] = orderedSel(sel);
	const collapsed = isCollapsed(sel);
	const extend = (to: Focus | Pos, keepGoal = false) => {
		const f = 'focus' in to ? to : { focus: to };
		select(
			{ anchor: e.shiftKey ? sel.anchor : f.focus, ...f },
			keepGoal,
		);
	};
	const line = () => lineRange(layout, sel.focus, sel.focusAffinity);
	switch (e.key) {
		case 'ArrowLeft':
		case 'ArrowRight': {
			const dir = e.key === 'ArrowLeft' ? -1 : 1;
			if (!e.shiftKey && !collapsed && !e.altKey && !mod) {
				select(caret(dir < 0 ? from : to));
				return true;
			}
			if (e.metaKey)
				extend(dir < 0 ? line().start : line().end);
			else if (e.altKey || e.ctrlKey)
				extend(wordMove(doc, sel.focus, dir));
			else extend(charMove(doc, sel.focus, dir));
			return true;
		}
		case 'ArrowUp':
		case 'ArrowDown': {
			const dir = e.key === 'ArrowUp' ? -1 : 1;
			if (e.metaKey) {
				extend(dir < 0 ? docStart() : docEnd(doc));
				return true;
			}
			goalX ??= caretRect(
				layout,
				sel.focus,
				sel.focusAffinity,
			).x;
			extend(
				moveVertical(
					layout,
					sel.focus,
					dir,
					goalX,
					sel.focusAffinity,
				),
				true,
			);
			return true;
		}
		case 'Home':
		case 'End': {
			if (mod)
				extend(
					e.key === 'Home'
						? docStart()
						: docEnd(doc),
				);
			else
				extend(
					e.key === 'Home'
						? line().start
						: line().end,
				);
			return true;
		}
		case 'Backspace':
		case 'Delete':
			remove(
				e.key === 'Backspace' ? -1 : 1,
				e.altKey || (e.ctrlKey && !e.metaKey)
					? 'word'
					: 'char',
			);
			return true;
		case 'Enter': {
			if (!mod) enter();
			else if (!t.inner)
				apply(
					insertPageBreak(
						doc,
						sel,
						e.shiftKey ? 'column' : 'break',
					),
					'other',
				);
			return true;
		}
		case 'Escape':
			if (writePanel.get()) closePanel();
			else if (t.story) leaveInner();
			else if (t.note) leaveNote();
			else return false;
			return true;
		case 'Tab': {
			apply(indent(doc, sel, e.shiftKey ? -1 : 1), 'format');
			return true;
		}
	}
	if (!mod) return false;
	// alt changes e.key
	if (e.altKey && (e.code === 'KeyF' || e.code === 'KeyE')) {
		insertNote(e.code === 'KeyF' ? 'foot' : 'end');
		return true;
	}
	switch (e.key.toLowerCase()) {
		case 'a':
			select({ anchor: docStart(), focus: docEnd(doc) });
			return true;
		case 'b':
			formatChar({ bold: !barChar(s).bold });
			return true;
		case 'i':
			formatChar({ italic: !barChar(s).italic });
			return true;
		case 'u':
			formatChar({ underline: !barChar(s).underline });
			return true;
		case 'z':
			if (e.shiftKey) writeStore.redo();
			else writeStore.undo();
			pending.set(null);
			return true;
		case 'y':
			writeStore.redo();
			return true;
		case 'f':
			writePanel.set('find');
			return true;
		case 'k':
			writePanel.set('link');
			return true;
		case 'g':
			step(e.shiftKey ? -1 : 1);
			return true;
		case 'p':
			if (!e.shiftKey) return false;
			insertField('page');
			return true;
	}
	return false;
}

export function copy(data: DataTransfer, cut: boolean) {
	const s = editState();
	if (!s || isCollapsed(s.sel)) return;
	const [from, to] = orderedSel(s.sel);
	const blocks = sliceBlocks(s.doc, from, to);
	const text = toPlainText(blocks);
	const token = crypto.randomUUID();
	const notes: Record<string, Paragraph[]> = {};
	for (const b of blocks)
		if (b.kind === 'para')
			for (const { ref } of noteRefs(b)) {
				const paras = s.doc.notes?.[ref.id];
				if (paras) notes[ref.id] = paras;
			}
	clip = {
		text,
		blocks,
		images: pickImages(
			s.doc.images,
			imageIds([
				...parasOf(blocks),
				...Object.values(notes).flat(),
			]),
		),
		notes,
		token,
	};
	data.setData('text/plain', text);
	data.setData(CLIP_TYPE, token);
	if (cut) apply(deleteSel(s.doc, s.sel), 'delete');
}

/** true when text was pasted */
export function paste(data: DataTransfer): boolean {
	const t = target();
	if (!t) return false;
	const s = t.state;
	const text = data
		.getData('text/plain')
		.replace(/\r\n?/g, '\n')
		.replaceAll(FIELD_CHAR, '');
	const own =
		clip &&
		(data.getData(CLIP_TYPE) === clip.token ||
			(text && clip.text === text));
	if (!own && !text) return false;
	// own copies keep formatting
	if (clip && own) {
		// objects: body only
		if (t.inner)
			apply(
				insertBlocks(
					s.doc,
					s.sel,
					[...parasOf(clip.blocks)].map(
						withoutObjects,
					),
				),
				'other',
			);
		else {
			const { blocks, notes } = renewNotes(
				clip.blocks,
				clip.notes,
			);
			const next = insertBlocks(
				withImages(s.doc, clip.images),
				s.sel,
				blocks,
			);
			if (Object.keys(notes).length)
				next.doc = {
					...next.doc,
					notes: { ...next.doc.notes, ...notes },
				};
			apply(next, 'other');
		}
	} else apply(insertText(s.doc, s.sel, text), 'other');
	return true;
}

interface CellHit {
	box: CellBox;
	page: number;
	x: number;
	y: number;
}

/** The table cell under a page point; a repeated header row maps to its first drawing. */
export function cellHit(
	layout: Layout,
	page: number,
	x: number,
	y: number,
): CellHit | null {
	const box = layout.pages[page]?.cells.find(
		(c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h,
	);
	if (!box?.repeat) return box ? { box, page, x, y } : null;
	for (const p of layout.pages) {
		const o = p.cells.find(
			(c) =>
				!c.repeat &&
				c.block === box.block &&
				c.row === box.row &&
				c.col === box.col,
		);
		if (o) return { box: o, page: p.index, x, y: y - box.y + o.y };
	}
	return null;
}

// cell drag text anchor
let dragAnchor: Pos | null = null;

/** A click on the full layout; it enters, leaves or extends over table cells. */
export function clickAt(
	full: Layout,
	page: number,
	x: number,
	y: number,
	opts: { extend: boolean; detail: number },
) {
	const t = target();
	if (!t) return;
	const cell = cellHit(full, page, x, y);
	const c = t.cell;
	const hitNote = t.note && noteAt(full, page, x, y);
	if (cell) {
		const at = originOf(
			c?.bi === cell.box.block
				? c.table
				: (t.state.doc.blocks[cell.box.block] as Table),
			cell.box.row,
			cell.box.col,
		);
		const same = c?.bi === cell.box.block;
		const moved =
			!same || c.at.row !== at.row || c.at.col !== at.col;
		if (opts.extend && same && moved) {
			const e = inner.get();
			inner.set({
				kind: 'cell',
				table: c.table.id,
				...at,
				from:
					(e?.kind === 'cell'
						? e.from
						: undefined) ?? c.at,
				sel: caret(docStart()),
			});
			return;
		}
		if (moved || c?.range)
			enterCell(cell.box.block, at, caret(docStart()));
		({ page, x, y } = cell);
	} else if (c || (t.note && !hitNote)) {
		const b = writeStore.get()!;
		writeStore.commit(
			{
				doc: b.doc,
				sel: caret(hitTest(full, page, x, y).focus),
			},
			'other',
		);
		leaveInner();
	} else if (hitNote && hitNote !== t.note?.id)
		enterNote(hitNote, caret(docStart()));
	const s = editState();
	if (!s) return;
	const layout = editLayout(full);
	const hit = hitTest(layout, page, x, y);
	const pos = hit.focus;
	if (opts.detail === 2) {
		select(wordAt(s.doc, pos));
		return;
	}
	if (opts.detail >= 3) {
		select({
			anchor: { block: pos.block, offset: 0 },
			focus: {
				block: pos.block,
				offset: blockLength(s.doc.blocks[pos.block]),
			},
		});
		return;
	}
	select({ anchor: opts.extend ? s.sel.anchor : pos, ...hit });
	dragAnchor = cell ? (editState()?.sel.anchor ?? null) : null;
}

/** A drag on the full layout; across cells of one table it selects a cell range. */
export function dragTo(full: Layout, page: number, x: number, y: number) {
	const t = target();
	const e = inner.get();
	const ce = e?.kind === 'cell' ? e : null;
	const hit = t?.cell && ce ? cellHit(full, page, x, y) : null;
	if (t?.cell && ce && hit?.box.block === t.cell.bi) {
		const from = ce.from ?? t.cell.at;
		const at = originOf(t.cell.table, hit.box.row, hit.box.col);
		if (at.row !== from.row || at.col !== from.col) {
			if (!ce.from || ce.row !== at.row || ce.col !== at.col)
				inner.set({
					kind: 'cell',
					table: ce.table,
					...at,
					from,
					sel: caret(docStart()),
				});
			return;
		}
		if (ce.from)
			inner.set({
				kind: 'cell',
				table: ce.table,
				...from,
				sel: caret(dragAnchor ?? docStart()),
			});
		({ page, x, y } = hit);
	} else if (ce?.from) return;
	const s = editState();
	if (!s) return;
	select({
		anchor: s.sel.anchor,
		...hitTest(editLayout(full), page, x, y),
	});
}

/** Page rects of the selected cell range, empty without one. */
export function cellRangeRects(layout: Layout) {
	const c = target()?.cell;
	if (!c?.range) return [];
	const on = new Set(c.range.map((r) => `${r.row},${r.col}`));
	return layout.pages.flatMap((p) =>
		p.cells
			.filter(
				(b) =>
					b.block === c.bi &&
					on.has(`${b.row},${b.col}`),
			)
			.map((b) => ({
				page: p.index,
				x: b.x,
				y: b.y,
				w: b.w,
				h: b.h,
			})),
	);
}

export { caretRect, selectionRects };

/** The link at a paragraph offset, the character after it first. */
export function linkAt(doc: WriteDoc, pos: Pos): string | undefined {
	const b = doc.blocks[pos.block];
	return b?.kind === 'para' ? linkAround(b, pos.offset)?.link : undefined;
}

function linkExtent(doc: WriteDoc, sel: Selection): Selection {
	const b = doc.blocks[sel.focus.block];
	if (!isCollapsed(sel) || b?.kind !== 'para') return sel;
	const span = linkAround(b, sel.focus.offset);
	if (!span) return sel;
	const { block } = sel.focus;
	return {
		anchor: { block, offset: span.start },
		focus: { block, offset: span.end },
	};
}

const LINK_COLOUR = '#0563c1';

/** Links the selection, or the link at the caret; a bare caret inserts the URL. Null removes. False for a rejected URL. */
export function setLink(raw: string | null): boolean {
	const s = editState();
	if (!s) return false;
	const sel = linkExtent(s.doc, s.sel);
	if (raw === null) {
		apply(
			applyChar(s.doc, sel, {
				link: undefined,
				underline: undefined,
				colour: undefined,
			}),
			'format',
		);
		return true;
	}
	const link = normaliseLink(raw);
	if (!link) return false;
	const props = { link, underline: true, colour: LINK_COLOUR };
	const b = s.doc.blocks[sel.focus.block];
	if (isCollapsed(sel) && b?.kind === 'para')
		apply(
			insertText(s.doc, sel, link, {
				...typingProps(b, sel.focus.offset),
				...props,
			}),
			'other',
		);
	else apply(applyChar(s.doc, sel, props), 'format');
	return true;
}

/** Inserts a field at the caret, in the formatting typing would use. */
export function insertField(kind: FieldKind) {
	const s = editState();
	if (!s) return;
	const p = caretPara(s);
	const props = p ? heldProps(s, p) : undefined;
	apply(insertFieldAt(s.doc, s.sel, kind, props), 'other');
}

/** Inserts a footnote or endnote reference at the body caret and edits the new note. */
export function insertNote(kind: NoteRef['kind']) {
	const t = target();
	if (!t || t.inner) return;
	const next = insertNoteAt(t.state.doc, t.state.sel, kind);
	commit(next, 'other');
	enterNote(next.id, caret(docStart()));
}

/** Edits a note's text. */
export function enterNote(id: string, sel: Selection) {
	pending.set(null);
	goalX = null;
	writeStore.breakMerge();
	inner.set({ kind: 'note', id, sel });
}

/** Leaves note editing; the body caret lands after the note's reference. */
export function leaveNote() {
	const e = inner.get();
	leaveInner();
	const s = writeStore.get();
	const at = e?.kind === 'note' && s && noteRefPos(s.doc, e.id);
	if (at) bodySelect(caret({ block: at.block, offset: at.offset + 1 }));
}

function noteAt(layout: Layout, page: number, x: number, y: number) {
	const p = layout.pages[page];
	return p?.notes.find((l) => {
		const c = p.cols.length > 1 && p.cols[l.col ?? 0];
		return (
			y >= l.top &&
			y <= l.top + l.height &&
			(!c ||
				(x >= c.left - LIST_STEP &&
					x <= c.left + c.width))
		);
	})?.note;
}

/** Double-click on note text or a reference edits the note, elsewhere in the body leaves it; true when used. */
export function noteDoubleClick(
	layout: Layout,
	page: number,
	x: number,
	y: number,
): boolean {
	const s = writeStore.get();
	const p = layout.pages[page];
	if (!s || !p) return false;
	const t = target();
	const line = p.notes.find(
		(l) =>
			y >= l.top &&
			y <= l.top + l.height &&
			x >= l.left - LIST_STEP &&
			x <= l.left + l.width,
	);
	if (line?.note) {
		if (t?.note?.id === line.note) return false;
		enterNote(line.note, caret(docStart()));
		const hit = hitTest(editLayout(layout), page, x, y);
		select({ anchor: hit.focus, ...hit });
		return true;
	}
	if (t?.inner && !t.note) return false;
	const { focus } = hitTest(layout, page, x, y);
	const b = s.doc.blocks[focus.block];
	const ref =
		b?.kind === 'para'
			? noteRefs(b).find(
					(r) =>
						r.offset === focus.offset ||
						r.offset === focus.offset - 1,
				)
			: undefined;
	if (ref) {
		const paras = s.doc.notes?.[ref.ref.id];
		if (!paras) return false;
		enterNote(
			ref.ref.id,
			caret({
				block: paras.length - 1,
				offset: blockLength(paras.at(-1)),
			}),
		);
		return true;
	}
	if (!t?.note) return false;
	leaveNote();
	return true;
}

/** Inserts contents at the body caret; one per document. */
export function insertToc(levels = 3) {
	const t = target();
	if (!t || t.inner || t.state.doc.blocks.some((b) => b.kind === 'toc'))
		return;
	commit(
		insertBlock(t.state.doc, t.state.sel, {
			kind: 'toc',
			id: newId(),
			levels,
		}),
		'other',
	);
}

/** Changes the contents block: its levels, or only listing headings after it. */
export function setToc(next: Partial<Pick<Toc, 'levels' | 'after'>>) {
	const s = writeStore.get();
	const bi = s?.doc.blocks.findIndex((b) => b.kind === 'toc') ?? -1;
	const b = s?.doc.blocks[bi];
	if (!s || b?.kind !== 'toc') return;
	commit(
		{ doc: withBlock(s.doc, bi, { ...b, ...next }), sel: s.sel },
		'other',
	);
}

/** Deletes the contents block; the caret lands where it was. */
export function removeToc() {
	const s = writeStore.get();
	const bi = s?.doc.blocks.findIndex((b) => b.kind === 'toc') ?? -1;
	if (!s || bi < 0) return;
	const blocks = s.doc.blocks.filter((_, i) => i !== bi);
	const block = Math.min(bi, blocks.length - 1);
	commit(
		{
			doc: { ...s.doc, blocks },
			sel: caret({ block, offset: 0 }),
		},
		'other',
	);
}

/** The heading block of the contents entry under a page point, or null. */
export function tocAt(
	layout: Layout,
	page: number,
	x: number,
	y: number,
): number | null {
	const line = layout.pages[page]?.toc.find(
		(l) =>
			y >= l.top &&
			y <= l.top + l.height &&
			x >= l.left &&
			x <= l.left + l.width,
	);
	return line ? line.block : null;
}

/** Changes the setup of the caret's section, margins kept on the page. */
export function setSection(next: Partial<Setup>) {
	const s = writeStore.get();
	if (!s) return;
	const block = s.sel.focus.block;
	writeStore.commit(
		{
			doc: withSectionSetup(
				s.doc,
				sectionStart(s.doc, block),
				clampMargins({
					...sectionSetup(s.doc, block),
					...next,
				}),
			),
			sel: s.sel,
		},
		'other',
	);
}

/** Adds a cover page before the document and puts the caret in its title. */
export function coverPage() {
	const t = target();
	if (!t || t.inner) return;
	commit(insertCover(t.state.doc), 'other');
}

export function sectionBreak() {
	const t = target();
	if (!t || t.inner) return;
	commit(insertSectionBreak(t.state.doc, t.state.sel), 'other');
}

/** Inserts an empty table at the body caret and edits its first cell. */
export function insertTableAt(rows: number, cols: number) {
	const t = target();
	if (!t || t.inner) return;
	const { doc, sel } = t.state;
	const next = insertTable(
		doc,
		sel,
		rows,
		cols,
		columnsOf(sectionSetup(doc, orderedSel(sel)[0].block)).colW,
	);
	commit(next, 'other');
	enterCell(
		tableIndex(next.doc, next.table.id),
		{ row: 0, col: 0 },
		caret(docStart()),
	);
}

/** The edited table cell, for the table menu. */
export function tableState() {
	const c = target()?.cell;
	if (!c) return null;
	const { r0, c0, r1, c1 } = c.rect;
	return {
		table: c.table,
		merged: !c.range && (r1 > r0 || c1 > c0),
		range: !!c.range,
	};
}

export type TableAction =
	| 'rowAbove'
	| 'rowBelow'
	| 'colLeft'
	| 'colRight'
	| 'deleteRow'
	| 'deleteCol'
	| 'deleteTable'
	| 'merge'
	| 'split'
	| 'header';

/** Changes the edited cell's table; the caret stays in its cell. */
export function tableAction(action: TableAction) {
	const c = target()?.cell;
	if (!c) return;
	const { r0, c0, r1, c1 } = c.rect;
	let at = c.at;
	let t: Table | null = c.table;
	const before = t;
	switch (action) {
		case 'rowAbove':
			t = insertRow(t, r0);
			at = { ...at, row: at.row + 1 };
			break;
		case 'rowBelow':
			t = insertRow(t, r1 + 1);
			break;
		case 'colLeft':
			t = insertCol(t, c0);
			at = { ...at, col: at.col + 1 };
			break;
		case 'colRight':
			t = insertCol(t, c1 + 1);
			break;
		case 'deleteRow':
			for (let r = r1; t && r >= r0; r--) t = deleteRow(t, r);
			at = { ...at, row: r0 };
			break;
		case 'deleteCol':
			for (let k = c1; t && k >= c0; k--) t = deleteCol(t, k);
			at = { ...at, col: c0 };
			break;
		case 'deleteTable':
			t = null;
			break;
		case 'merge':
			if (!c.range) return;
			t = mergeCells(t, c.rect);
			at = { row: r0, col: c0 };
			break;
		case 'split':
			t = splitCell(t, at.row, at.col);
			break;
		case 'header':
			t = { ...t, header: !t.header };
			if (!t.header) delete t.header;
	}
	// refused at a limit
	if (t === before) return;
	const s = writeStore.get()!;
	if (!t) {
		commit(
			{
				doc: {
					...s.doc,
					blocks: s.doc.blocks.filter(
						(_, i) => i !== c.bi,
					),
				},
				sel: caret({ block: c.bi, offset: 0 }),
			},
			'other',
		);
		return;
	}
	commit({ doc: withBlock(s.doc, c.bi, t), sel: s.sel }, 'other');
	enterCell(c.bi, at, caret(docStart()));
}

export function setTableBorder(kind: TableBorder['kind']) {
	const c = target()?.cell;
	if (!c) return;
	const s = writeStore.get()!;
	commit(
		{
			doc: withBlock(s.doc, c.bi, {
				...c.table,
				border: { ...c.table.border, kind },
			}),
			sel: s.sel,
		},
		'other',
	);
}

/** A column border being dragged. */
export interface ColumnDrag {
	bi: number;
	/** the border left of column i */
	i: number;
	left: number;
	/** page pt per stored pt */
	scale: number;
	moved: boolean;
}

/** The inner column border of a table within tol of a page point. */
export function columnBorderAt(
	layout: Layout,
	page: number,
	x: number,
	y: number,
	tol: number,
): ColumnDrag | null {
	const s = writeStore.get();
	for (const line of layout.pages[page]?.lines ?? []) {
		if (
			line.kind !== 'table' ||
			y < line.top ||
			y > line.top + line.height
		)
			continue;
		const t = s?.doc.blocks[line.block];
		if (t?.kind !== 'table') continue;
		const xs = edgesOf(t, line.left, line.width);
		for (let i = 1; i < xs.length - 1; i++)
			if (Math.abs(xs[i]! - x) <= tol)
				return {
					bi: line.block,
					i,
					left: line.left,
					scale:
						line.width /
						t.cols.reduce(
							(a, b) => a + b,
							0,
						),
					moved: false,
				};
	}
	return null;
}

/** Moves a dragged column border to page x, snapped to 1 pt; one undo step per drag. */
export function dragColumn(d: ColumnDrag, x: number) {
	const s = writeStore.get();
	const t = s?.doc.blocks[d.bi];
	if (!s || t?.kind !== 'table') return;
	const cols = resizeCols(
		t.cols,
		d.i,
		Math.round(x - d.left) / d.scale,
		MIN_COL / d.scale,
	);
	if (cols.every((w, i) => w === t.cols[i])) return;
	const next = {
		doc: withBlock(s.doc, d.bi, { ...t, cols }),
		sel: s.sel,
	};
	if (d.moved) writeStore.amend(next);
	else writeStore.commit(next, 'other');
	d.moved = true;
}
