import {
	comparePos,
	isLowSurrogate,
	orderedSel,
} from 'delphitools-v2/lib/errata/write/model';
import type {
	Layout,
	Line,
	PageBox,
	Pos,
	Selection,
	StoryPart,
} from 'delphitools-v2/lib/errata/write/types';

// selected paragraph end, pt
const NEWLINE_W = 4;

export type Focus = Pick<Selection, 'focus' | 'focusAffinity'>;
type Affinity = Selection['focusAffinity'];

interface Entry {
	page: number;
	line: Line;
}

const cache = new WeakMap<Layout, Entry[]>();

function entries(layout: Layout): Entry[] {
	let es = cache.get(layout);
	if (!es) {
		es = layout.pages.flatMap((p) =>
			p.lines.map((line) => ({ page: p.index, line })),
		);
		cache.set(layout, es);
	}
	return es;
}

function find(es: Entry[], pos: Pos, affinity: Affinity): number {
	let found = 0;
	for (let i = 0; i < es.length; i++) {
		const { line } = es[i]!;
		if (line.block > pos.block) break;
		if (line.block !== pos.block || line.start > pos.offset)
			continue;
		if (
			line.start === pos.offset &&
			affinity === 'up' &&
			es[i - 1]?.line.block === pos.block
		)
			break;
		found = i;
	}
	return found;
}

const isLast = (es: Entry[], i: number) =>
	es[i + 1]?.line.block !== es[i]!.line.block;

function xAt(line: Line, offset: number): number {
	for (const s of line.spans)
		if (offset >= s.start && offset <= s.start + s.text.length)
			return s.xs[offset - s.start]!;
	return line.left;
}

function posAt(es: Entry[], i: number, x: number): Focus {
	const { line } = es[i]!;
	let offset = line.start;
	let dist = Infinity;
	for (const s of line.spans)
		s.xs.forEach((sx, k) => {
			const d = Math.abs(sx - x);
			if (d < dist && !isLowSurrogate(s.text.charCodeAt(k))) {
				dist = d;
				offset = s.start + k;
			}
		});
	const focus = { block: line.block, offset };
	return offset === line.end && !isLast(es, i)
		? { focus, focusAffinity: 'up' }
		: { focus };
}

/** The line and page a caret sits on. */
export function lineAt(
	layout: Layout,
	pos: Pos,
	affinity?: Affinity,
): Entry | undefined {
	const es = entries(layout);
	return es[find(es, pos, affinity)];
}

export function caretRect(
	layout: Layout,
	pos: Pos,
	affinity?: Affinity,
): { page: number; x: number; top: number; height: number } {
	const e = lineAt(layout, pos, affinity);
	if (!e) {
		const c = layout.pages[0]?.content;
		return {
			page: 0,
			x: c?.left ?? 0,
			top: c?.top ?? 0,
			height: 0,
		};
	}
	return {
		page: e.page,
		x: xAt(e.line, pos.offset),
		top: e.line.top,
		height: e.line.height,
	};
}

export function hitTest(
	layout: Layout,
	page: number,
	x: number,
	y: number,
): Focus {
	const es = entries(layout);
	let on = [...es.keys()].filter((i) => es[i]!.page === page);
	const cols = layout.pages[page]?.cols ?? [];
	if (cols.length > 1) {
		// nearest column first
		const dist = (c: { left: number; width: number }) =>
			Math.max(c.left - x, x - c.left - c.width, 0);
		let col = 0;
		cols.forEach((c, i) => {
			if (dist(c) < dist(cols[col]!)) col = i;
		});
		const inCol = on.filter((i) => (es[i]!.line.col ?? 0) === col);
		if (inCol.length) on = inCol;
	}
	if (!on.length)
		return es.length
			? posAt(es, es.length - 1, 1e9)
			: { focus: { block: 0, offset: 0 } };
	let best = on[0]!;
	let dist = Infinity;
	for (const i of on) {
		const { top, height, left, width } = es[i]!.line;
		// float lines share band
		const d =
			Math.max(top - y, y - top - height, 0) * 1e3 +
			Math.max(left - x, x - left - width, 0);
		if (d < dist) {
			dist = d;
			best = i;
		}
	}
	return posAt(es, best, x);
}

export function lineRange(
	layout: Layout,
	pos: Pos,
	affinity?: Affinity,
): { start: Focus; end: Focus } {
	const es = entries(layout);
	const i = find(es, pos, affinity);
	const line = es[i]?.line;
	if (!line) return { start: { focus: pos }, end: { focus: pos } };
	const end = { block: line.block, offset: line.end };
	return {
		start: { focus: { block: line.block, offset: line.start } },
		end: isLast(es, i)
			? { focus: end }
			: { focus: end, focusAffinity: 'up' },
	};
}

/** Index of the caret's line among all lines, and the line count. */
export function lineIndex(
	layout: Layout,
	pos: Pos,
	affinity?: Affinity,
): { index: number; count: number } {
	const es = entries(layout);
	return { index: find(es, pos, affinity), count: es.length };
}

/** The position nearest x on the first (1) or last (-1) line, of one block when given. */
export function edgeFocus(
	layout: Layout,
	dir: 1 | -1,
	x: number,
	block?: number,
): Focus {
	const es = entries(layout);
	const on = [...es.keys()].filter(
		(i) => block === undefined || es[i]!.line.block === block,
	);
	const i = dir > 0 ? on[0] : on.at(-1);
	return i === undefined
		? { focus: { block: block ?? 0, offset: 0 } }
		: posAt(es, i, x);
}

const innerLayouts = new WeakMap<Layout, Map<string, Layout>>();

// memo per layout
function innerLayout(
	layout: Layout,
	key: string,
	lines: (p: PageBox) => Line[],
): Layout {
	let memo = innerLayouts.get(layout);
	if (!memo) innerLayouts.set(layout, (memo = new Map<string, Layout>()));
	let out = memo.get(key);
	if (!out) {
		out = {
			pages: layout.pages.map((p) => ({
				...p,
				lines: lines(p),
			})),
		};
		memo.set(key, out);
	}
	return out;
}

/** The layout with only one table cell's lines, header row repeats left out; Line.block is the paragraph in the cell. */
export function cellLayout(
	layout: Layout,
	block: number,
	row: number,
	col: number,
): Layout {
	return innerLayout(layout, `c|${block}|${row}|${col}`, (p) =>
		p.cells
			.filter(
				(c) =>
					c.block === block &&
					c.row === row &&
					c.col === col &&
					!c.repeat,
			)
			.flatMap((c) => c.lines),
	);
}

/** The layout with only one note's lines; Line.block is the paragraph in the note. */
export function noteLayout(layout: Layout, id: string): Layout {
	return innerLayout(layout, `n|${id}`, (p) =>
		p.notes.filter((l) => l.note === id),
	);
}

/** The layout with only one header or footer's lines, on page when it shows the story, else the first page that does. */
export function storyLayout(
	layout: Layout,
	start: number,
	part: StoryPart,
	page: number,
): Layout {
	const header = part === 'header' || part === 'firstHeader';
	const shows = (p: PageBox) =>
		p.sectionBlock === start &&
		(header ? p.headerPart : p.footerPart) === part;
	const on =
		layout.pages.find((p) => p.index === page && shows(p)) ??
		layout.pages.find(shows);
	return innerLayout(layout, `s|${start}|${part}|${page}`, (p) =>
		p === on ? (header ? p.header : p.footer) : [],
	);
}

export function moveVertical(
	layout: Layout,
	pos: Pos,
	dir: 1 | -1,
	goalX: number,
	affinity?: Affinity,
): Focus {
	const es = entries(layout);
	const j = find(es, pos, affinity) + dir;
	if (j < 0) return posAt(es, 0, -1e9);
	if (j >= es.length) return posAt(es, es.length - 1, 1e9);
	return posAt(es, j, goalX);
}

export function selectionRects(
	layout: Layout,
	from: Pos,
	to: Pos,
): { page: number; x: number; y: number; w: number; h: number }[] {
	const [a, b] = orderedSel({ anchor: from, focus: to });
	const es = entries(layout);
	const rects = [];
	const some = comparePos(a, b) < 0;
	for (let i = 0; i < es.length; i++) {
		const { line, page } = es[i]!;
		if (line.block < a.block || line.block > b.block) continue;
		if (line.kind === 'table' || line.kind === 'toc') {
			if (some)
				rects.push({
					page,
					x: line.left,
					y: line.top,
					w: line.width,
					h: line.height,
				});
			continue;
		}
		const s =
			line.block === a.block
				? Math.max(a.offset, line.start)
				: line.start;
		const e =
			line.block === b.block
				? Math.min(b.offset, line.end)
				: line.end;
		if (s > e) continue;
		const x = xAt(line, s);
		let w = xAt(line, e) - x;
		if (line.block < b.block && isLast(es, i)) w += NEWLINE_W;
		if (w > 0)
			rects.push({ page, x, y: line.top, w, h: line.height });
	}
	return rects;
}

export type Rect = ReturnType<typeof selectionRects>[number];

/** Rects of ranges inside single paragraphs, in one pass; ranges must be in document order. */
export function rangeRects(
	layout: Layout,
	ranges: { block: number; start: number; end: number }[],
): Rect[] {
	const es = entries(layout);
	const rects: Rect[] = [];
	let i = 0;
	for (const r of ranges) {
		while (
			i < es.length &&
			(es[i]!.line.block < r.block ||
				(es[i]!.line.block === r.block &&
					es[i]!.line.end < r.start))
		)
			i++;
		for (let j = i; j < es.length; j++) {
			const { line, page } = es[j]!;
			if (line.block !== r.block || line.start > r.end) break;
			const s = Math.max(r.start, line.start);
			const e = Math.min(r.end, line.end);
			if (s >= e) continue;
			const x = xAt(line, s);
			const w = xAt(line, e) - x;
			if (w > 0)
				rects.push({
					page,
					x,
					y: line.top,
					w,
					h: line.height,
				});
		}
	}
	return rects;
}
