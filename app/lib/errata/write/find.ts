import { channel } from 'delphitools-v2/lib/channel';
import { commit, enterCell, enterNote, inner, selectRange } from './editor';
import {
	caret,
	clampPos,
	insertText,
	orderedSel,
	paraText,
	refsOf,
	typingProps,
} from './model';
import { writeStore } from './store';
import { tableIndex, withCell } from './table';
import type { Paragraph, Selection, Table, WriteDoc } from './types';

export interface Match {
	/** the paragraph, or the table; a note's ordinal after the body */
	block: number;
	start: number;
	end: number;
	/** in a table: the cell and its paragraph */
	cell?: { row: number; col: number; para: number };
	/** in a note: its id and paragraph */
	note?: { id: string; para: number };
}

/** The match's selection; for a cell or note match, inside it. */
export const matchSel = (m: Match): Selection => {
	const block = m.cell?.para ?? m.note?.para ?? m.block;
	return {
		anchor: { block, offset: m.start },
		focus: { block, offset: m.end },
	};
};

// document order
type Key = [number, number, number, number, number];

const keyOf = (m: Match, at: number): Key =>
	m.cell
		? [m.block, m.cell.row, m.cell.col, m.cell.para, at]
		: [m.block, -1, -1, m.note?.para ?? 0, at];

const noteOrder = (doc: WriteDoc) =>
	[...refsOf(doc.blocks)]
		.map((r) => r.ref.id)
		.filter((id) => doc.notes?.[id]);

function cmp(a: Key, b: Key): number {
	for (let i = 0; i < a.length; i++)
		if (a[i] !== b[i]) return a[i]! - b[i]!;
	return 0;
}

// selection ends, cells too
function here(): [Key, Key] | null {
	const s = writeStore.get();
	if (!s) return null;
	const e = inner.get();
	const ce = e?.kind === 'cell' ? e : null;
	const bi = ce ? tableIndex(s.doc, ce.table) : -1;
	const ne = e?.kind === 'note' ? e : null;
	const k = ne ? noteOrder(s.doc).indexOf(ne.id) : -1;
	if (ne && k >= 0) {
		const [a, b] = orderedSel(ne.sel);
		const n = s.doc.blocks.length + k;
		return [
			[n, -1, -1, a.block, a.offset],
			[n, -1, -1, b.block, b.offset],
		];
	}
	if (ce && bi >= 0) {
		const [a, b] = orderedSel(ce.sel);
		return [
			[bi, ce.row, ce.col, a.block, a.offset],
			[bi, ce.row, ce.col, b.block, b.offset],
		];
	}
	const [a, b] = orderedSel(s.sel);
	return [
		[a.block, -1, -1, 0, a.offset],
		[b.block, -1, -1, 0, b.offset],
	];
}

function selectMatch(m: Match) {
	if (m.cell) enterCell(m.block, m.cell, matchSel(m));
	else if (m.note) enterNote(m.note.id, matchSel(m));
	else selectRange(matchSel(m));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// only edited paragraphs rescan
const paraHits = new WeakMap<Paragraph, { key: string; hits: number[] }>();

/** Non-overlapping matches of query inside each paragraph, in document order. Fields match as U+FFFC, not their shown values. */
export function findAll(
	doc: WriteDoc,
	query: string,
	matchCase: boolean,
): Match[] {
	if (!query) return [];
	const key = `${matchCase ? 1 : 0}${query}`;
	let re: RegExp | null = null;
	const out: Match[] = [];
	const scan = (
		p: Paragraph,
		block: number,
		cell?: Match['cell'],
		note?: Match['note'],
	) => {
		let cached = paraHits.get(p);
		if (cached?.key !== key) {
			re ??= new RegExp(
				escape(query),
				matchCase ? 'gu' : 'giu',
			);
			const hits: number[] = [];
			for (const m of paraText(p).matchAll(re))
				hits.push(m.index, m.index + m[0].length);
			cached = { key, hits };
			paraHits.set(p, cached);
		}
		const { hits } = cached;
		for (let i = 0; i < hits.length; i += 2) {
			const m: Match = {
				block,
				start: hits[i]!,
				end: hits[i + 1]!,
			};
			if (cell) m.cell = cell;
			if (note) m.note = note;
			out.push(m);
		}
	};
	doc.blocks.forEach((b, block) => {
		if (b.kind === 'para') scan(b, block);
		else if (b.kind === 'table')
			b.rows.forEach((cells, row) =>
				cells.forEach((c, col) => {
					if (!c.covered)
						c.paras.forEach((p, para) =>
							scan(p, block, {
								row,
								col,
								para,
							}),
						);
				}),
			);
	});
	noteOrder(doc).forEach((id, k) =>
		doc.notes![id]!.forEach((p, para) =>
			scan(p, doc.blocks.length + k, undefined, { id, para }),
		),
	);
	return out;
}

/** Replaces each range with text, which takes the props of the range's first character. */
export function replaceRanges(
	doc: WriteDoc,
	ranges: Match[],
	text: string,
): WriteDoc {
	const last = [...ranges].sort((a, b) =>
		cmp(keyOf(b, b.start), keyOf(a, a.start)),
	);
	for (const r of last) {
		if (r.note) {
			const paras = doc.notes![r.note.id]!;
			const p = paras[r.note.para]!;
			const next = insertText(
				{ ...doc, blocks: paras },
				matchSel(r),
				text,
				typingProps(p, r.start + 1),
			).doc.blocks as Paragraph[];
			doc = {
				...doc,
				notes: { ...doc.notes, [r.note.id]: next },
			};
			continue;
		}
		const t = r.cell && (doc.blocks[r.block] as Table);
		const cell = r.cell && t?.rows[r.cell.row]![r.cell.col];
		const blocks = cell ? cell.paras : doc.blocks;
		const p = blocks[r.cell?.para ?? r.block] as Paragraph;
		const next = insertText(
			{ ...doc, blocks },
			matchSel(r),
			text,
			typingProps(p, r.start + 1),
		).doc.blocks;
		if (!t || !r.cell) {
			doc = { ...doc, blocks: next };
			continue;
		}
		const out = doc.blocks.slice();
		out[r.block] = withCell(
			t,
			r.cell.row,
			r.cell.col,
			next as Paragraph[],
		);
		doc = { ...doc, blocks: out };
	}
	return doc;
}

export interface FindQuery {
	query: string;
	replace: string;
	matchCase: boolean;
}

export const findQuery = channel<FindQuery>(
	{ query: '', replace: '', matchCase: false },
	(a, b) =>
		a.query === b.query &&
		a.replace === b.replace &&
		a.matchCase === b.matchCase,
);

let memo: { doc: WriteDoc; q: FindQuery; matches: Match[] } | null = null;

/** Matches of the find query in doc, memoised. */
export function matchesIn(doc: WriteDoc): Match[] {
	const q = findQuery.get();
	if (
		memo?.doc !== doc ||
		memo.q.query !== q.query ||
		memo.q.matchCase !== q.matchCase
	)
		memo = { doc, q, matches: findAll(doc, q.query, q.matchCase) };
	return memo.matches;
}

/** Index of the match the selection, in the body or a cell, covers exactly, or -1. */
export function currentMatch(matches: Match[]): number {
	const at = here();
	if (!at) return -1;
	return matches.findIndex(
		(m) =>
			cmp(keyOf(m, m.start), at[0]) === 0 &&
			cmp(keyOf(m, m.end), at[1]) === 0,
	);
}

/** Selects the next (1) or previous (-1) match, wrapping; 0 also takes a match at the selection start. */
export function step(dir: 1 | -1 | 0) {
	const s = writeStore.get();
	const at = here();
	if (!s || !at) return;
	const matches = matchesIn(s.doc);
	const [from, to] = at;
	const m =
		dir < 0
			? (matches.findLast(
					(m) => cmp(keyOf(m, m.start), from) < 0,
				) ?? matches.at(-1))
			: (matches.find(
					(m) =>
						cmp(
							keyOf(m, m.start),
							dir ? to : from,
						) >= 0,
				) ?? matches[0]);
	if (m) selectMatch(m);
}

export function replaceOne() {
	const s = writeStore.get();
	if (!s) return;
	const matches = matchesIn(s.doc);
	const m = matches[currentMatch(matches)];
	if (m) {
		const { replace } = findQuery.get();
		const doc = replaceRanges(s.doc, [m], replace);
		const offset = m.start + replace.length;
		if (m.note) {
			commit({ doc, sel: s.sel }, 'other');
			enterNote(
				m.note.id,
				caret({ block: m.note.para, offset }),
			);
		} else if (m.cell) {
			commit({ doc, sel: s.sel }, 'other');
			enterCell(
				m.block,
				m.cell,
				caret({ block: m.cell.para, offset }),
			);
		} else
			commit(
				{ doc, sel: caret({ block: m.block, offset }) },
				'other',
			);
	}
	step(1);
}

export function replaceAll() {
	const s = writeStore.get();
	if (!s) return;
	const matches = matchesIn(s.doc);
	if (!matches.length) return;
	const doc = replaceRanges(s.doc, matches, findQuery.get().replace);
	commit({ doc, sel: caret(clampPos(doc, s.sel.focus)) }, 'other');
}
