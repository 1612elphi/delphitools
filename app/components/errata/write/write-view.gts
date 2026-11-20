import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonLoader from 'delphicanon/components/canon-loader';
import {
	barChar,
	caretRect,
	cellRangeRects,
	clickAt,
	columnBorderAt,
	dragColumn,
	type ColumnDrag,
	copy,
	currentLayout,
	dragTo,
	editLayout,
	editState,
	docReady,
	ensureDocFonts,
	fontsLoaded,
	fontsReady,
	enter,
	inner,
	invisibles,
	keydown,
	focusMode,
	marginGuide,
	rulers,
	typewriter,
	linkAt,
	noteDoubleClick,
	caretAt,
	caretIn,
	type CaretAt,
	paste,
	remove,
	replaceAround,
	selectAround,
	selectRange,
	selectionRects,
	storyDoubleClick,
	tocAt,
	typeText,
} from 'delphitools-v2/lib/errata/write/editor';
import { findQuery, matchesIn } from 'delphitools-v2/lib/errata/write/find';
import { cssFamily, FAMILIES } from 'delphitools-v2/lib/errata/write/fonts';
import {
	hitTest,
	noteLayout,
	rangeRects,
	type Rect,
} from 'delphitools-v2/lib/errata/write/geometry';
import type { Match } from 'delphitools-v2/lib/errata/write/find';
import {
	bitmapsReady,
	readySince,
} from 'delphitools-v2/lib/errata/write/image';
import {
	imageHit,
	imageRect,
	moveFloat,
	reanchor,
	resizeImage,
	selectImage,
	selectedImage,
} from 'delphitools-v2/lib/errata/write/image-edit';
import {
	blockLength,
	blockText,
	caret,
	isCollapsed,
} from 'delphitools-v2/lib/errata/write/model';
import { paintPage } from 'delphitools-v2/lib/errata/write/paint';
import {
	writeStore,
	type WriteState,
} from 'delphitools-v2/lib/errata/write/store';
import {
	marksReady,
	markup,
	paintMarks,
	stopMarkup,
} from 'delphitools-v2/lib/errata/write/markup';
import { hostFrame } from 'delphitools-v2/lib/errata/ui';
import type { PageObject } from 'delphitools-v2/lib/errata/doc-model';
import { resolveChar } from 'delphitools-v2/lib/errata/write/styles';
import {
	isPanel,
	registerFocus,
	fitPage,
	registerShownPage,
	zoomBy,
	writePanel,
	writeView,
} from 'delphitools-v2/lib/errata/write/view';
import {
	FIELD_CHAR,
	type CellBox,
	type Layout,
	type Line,
	type PageBox,
	type Span,
	type StyleId,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import Ruler from './rulers';
import TocCard from './toc-card';
import SelectionBar from './selection-bar';
import { InsertFlag, PageTabs, ParaDrawer, isolate } from './page-controls';
import './write.css';

const GAP = 24;
const GRAB = 4;
const INK = '#2f7a3a';

const EDITS: Partial<Record<string, () => void>> = {
	deleteContentBackward: () => remove(-1, 'char'),
	deleteContentForward: () => remove(1, 'char'),
	deleteWordBackward: () => remove(-1, 'word'),
	deleteWordForward: () => remove(1, 'word'),
	insertParagraph: enter,
	insertLineBreak: enter,
};

const MAX_PIXELS = 16e6;

const spread = (t: TouchList) =>
	Math.hypot(
		t[0]!.clientX - t[1]!.clientX,
		t[0]!.clientY - t[1]!.clientY,
	);

function pageUnder(root: ParentNode, y: number): HTMLElement | undefined {
	const pages = [
		...root.querySelectorAll<HTMLElement>('.err-write-page'),
	];
	return (
		pages.find((p) => y < p.getBoundingClientRect().bottom) ??
		pages.at(-1)
	);
}

const clamp = (lo: number, hi: number, n: number) =>
	Math.min(hi, Math.max(lo, n));

const STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

let measurer: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, font: string): number | null {
	measurer ??= document.createElement('canvas').getContext('2d');
	if (!measurer) return null;
	measurer.font = font;
	return measurer.measureText(text).width;
}

interface Before {
	value: string;
	start: number;
	end: number;
	at: CaretAt | null;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

const rectStyle = (r: Rect, z: number) =>
	htmlSafe(
		`left:${px(r.x * z)};top:${px(r.y * z)};width:${px(r.w * z)};height:${px(r.h * z)}`,
	);

function veilsOf(page: PageBox, block: number, z: number) {
	let top = Infinity;
	let bottom = -Infinity;
	for (const l of page.lines)
		if (l.block === block && !l.kind) {
			top = Math.min(top, l.top);
			bottom = Math.max(bottom, l.top + l.height);
		}
	const band = (y0: number, y1: number) =>
		htmlSafe(
			`top:${px(y0 * z)};height:${px(Math.max(0, y1 - y0) * z)}`,
		);
	if (top > bottom) return [band(0, page.height)];
	return [band(0, top - 2), band(bottom + 2, page.height)];
}

let found: { layout: Layout; matches: unknown; rects: Rect[] } | null = null;

function matchRects(layout: Layout, matches: Match[]): Rect[] {
	const rects = rangeRects(
		layout,
		matches.filter((m) => !m.cell && !m.note),
	);
	const notes = new Map<string, Match[]>();
	for (const m of matches)
		if (m.note)
			notes.set(m.note.id, [
				...(notes.get(m.note.id) ?? []),
				{ ...m, block: m.note.para },
			]);
	for (const [id, ranges] of notes)
		for (const r of rangeRects(noteLayout(layout, id), ranges))
			rects.push(r);
	const cells = new Map<string, { ranges: Match[]; pages: PageBox[] }>();
	for (const m of matches) {
		if (!m.cell) continue;
		const key = `${m.block}|${m.cell.row}|${m.cell.col}`;
		let c = cells.get(key);
		if (!c) cells.set(key, (c = { ranges: [], pages: [] }));
		c.ranges.push({ ...m, block: m.cell.para });
	}
	if (!cells.size) return rects;
	for (const p of layout.pages)
		for (const box of p.cells) {
			const c =
				!box.repeat &&
				cells.get(`${box.block}|${box.row}|${box.col}`);
			if (!c) continue;
			const last = c.pages.at(-1);
			if (last?.index === p.index)
				for (const l of box.lines) last.lines.push(l);
			else c.pages.push({ ...p, lines: box.lines.slice() });
		}
	for (const { ranges, pages } of cells.values())
		for (const r of rangeRects({ pages }, ranges)) rects.push(r);
	return rects;
}

function findRects(layout: Layout, doc: WriteDoc): Rect[] {
	const matches = matchesIn(doc);
	if (found?.layout !== layout || found.matches !== matches)
		found = { layout, matches, rects: matchRects(layout, matches) };
	return found.rects;
}

function shownPageOf(scroller: HTMLElement): number {
	const r = scroller.getBoundingClientRect();
	const mid = r.top + r.height / 2;
	let best = 0;
	let gap = Infinity;
	for (const el of scroller.querySelectorAll<HTMLElement>(
		'[data-page]',
	)) {
		const p = el.getBoundingClientRect();
		const d = Math.max(p.top - mid, mid - p.bottom, 0);
		if (d < gap) {
			gap = d;
			best = Number(el.dataset['page']);
		}
	}
	return best;
}

const painted = new WeakMap<
	HTMLCanvasElement,
	{
		page: PageBox;
		zoom: number;
		shown: boolean;
		ready: number;
		marks: readonly PageObject[] | undefined;
		marked: number;
	}
>();

const HANDLES = ['nw', 'ne', 'sw', 'se'];
const HOLD = 450;
const TRACKING = 1200;

const COARSE = matchMedia('(pointer: coarse)').matches;

function paraShape(layout: Layout, block: number, page: number, z: number) {
	const own = (p: PageBox | undefined) =>
		p?.lines.filter((l) => l.block === block) ?? [];
	const lines = own(layout.pages[page]);
	const first = lines[0];
	const span = first?.spans[0];
	if (!first || !span) return null;
	let before = 0;
	for (
		let i = page - 1, n;
		i >= 0 && (n = own(layout.pages[i]).length);
		i--
	)
		before += n;
	return {
		left: first.left,
		top: first.top - before * first.height,
		css: inputCss(
			first,
			span,
			before + lines.length,
			z,
			'pre-wrap',
		),
	};
}

function inputCss(
	line: Line,
	span: Span,
	rows: number,
	z: number,
	wrap: string,
	height = line.height,
) {
	const u = 16 / span.size;
	return [
		`width:${px(line.width * u)}`,
		`height:${px(rows * height * u)}`,
		`line-height:${px(height * u)}`,
		`font-family:"${cssFamily(span.file)}"`,
		`transform:scale(${(span.size * z) / 16})`,
		'transform-origin:0 0',
		`white-space:${wrap}`,
	].join(';');
}

function placeLeft(el: HTMLElement, at: { page: number; x: number }) {
	const page = el.parentElement?.querySelector<HTMLElement>(
		`[data-page="${at.page}"]`,
	);
	el.style.left = px((page?.offsetLeft ?? 0) + at.x);
}

function pageTop(layout: Layout, page: number, z: number) {
	let top = 0;
	for (const p of layout.pages.slice(0, page)) top += p.height * z + GAP;
	return top;
}

interface Row {
	block: number;
	start: number;
	end: number;
	at: number;
}

function pageShape(
	layout: Layout,
	doc: WriteDoc,
	page: number,
	z: number,
	focus: { block: number; offset: number },
) {
	const p = layout.pages[page];
	const all =
		p?.lines.filter(
			(l) => !l.kind && doc.blocks[l.block]?.kind === 'para',
		) ?? [];
	const own = all.findLast(
		(l) => l.block === focus.block && l.start <= focus.offset,
	);
	if (!own) return null;
	const lines = all.filter((l) => l.col === own.col);
	const first = lines[0]!;
	const count = new Map<number, number>();
	for (const l of lines)
		count.set(l.height, (count.get(l.height) ?? 0) + 1);
	const base = lines
		.filter((l) => l.spans[0])
		.reduce<Line | null>(
			(a, b) =>
				a &&
				count.get(a.height)! >= count.get(b.height)!
					? a
					: b,
			null,
		);
	const span = base?.spans[0];
	if (!base || !span) return null;
	const rows: Row[] = [];
	let value = '';
	let n = 0;
	for (const l of lines) {
		for (; (n + 0.5) * base.height < l.top - first.top; n++)
			value += '\n';
		rows.push({
			block: l.block,
			start: l.start,
			end: l.end,
			at: value.length,
		});
		const text = blockText(doc.blocks[l.block]).slice(
			l.start,
			l.end,
		);
		value += `${text.replaceAll('\n', ' ')}\n`;
		n++;
	}
	return {
		rows,
		value,
		left: first.left,
		top: first.top,
		css: inputCss(first, span, n + 1, z, 'pre', base.height),
	};
}

interface Track {
	rows: Row[];
	at?: { page: number; x: number; style: ReturnType<typeof htmlSafe> };
}

let mirrored: [number, number] = [0, 0];

function mirrorInput(el: HTMLTextAreaElement, { doc, sel }: WriteState) {
	const { anchor, focus } = sel;
	const text = blockText(doc.blocks[focus.block]);
	const [start, end, dir]: [number, number, 'forward' | 'backward'] =
		anchor.block < focus.block
			? [0, focus.offset, 'forward']
			: anchor.block > focus.block
				? [focus.offset, text.length, 'backward']
				: anchor.offset <= focus.offset
					? [
							anchor.offset,
							focus.offset,
							'forward',
						]
					: [
							focus.offset,
							anchor.offset,
							'backward',
						];
	if (el.value !== text) el.value = text;
	if (
		el.selectionStart !== start ||
		el.selectionEnd !== end ||
		(start !== end && el.selectionDirection !== dir)
	)
		el.setSelectionRange(start, end, dir);
	mirrored = [start, end];
}

interface MirrorItem {
	key: string;
	kind: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'table';
	text: string;
	items: string[];
	rows: string[][];
}

const HEADINGS: Partial<Record<StyleId, MirrorItem['kind']>> = {
	title: 'h1',
	h1: 'h1',
	h2: 'h2',
	h3: 'h3',
};

const spanText = (s: Span) =>
	s.image || s.anchor ? ' Image ' : (s.shown ?? s.text);

function linesText(lines: Line[]): string {
	let out = '';
	let end = -1;
	for (const l of lines) {
		if (end >= 0 && l.start > end && !/\s$/.test(out)) out += ' ';
		for (const s of l.spans) {
			out += spanText(s);
			end = s.start + s.text.length;
		}
	}
	return out.replaceAll(FIELD_CHAR, '').replace(/ {2,}/g, ' ').trim();
}

function groups(lines: Line[], key: (l: Line) => string): Line[][] {
	const out: Line[][] = [];
	let last: string | null = null;
	for (const l of lines) {
		const k = key(l);
		if (k === last) out.at(-1)!.push(l);
		else out.push([l]);
		last = k;
	}
	return out;
}

const item = (
	key: string,
	kind: MirrorItem['kind'],
	text = '',
): MirrorItem => ({ key, kind, text, items: [], rows: [] });

function tableRows(page: PageBox, block: number): string[][] {
	const rows = new Map<number, CellBox[]>();
	for (const c of page.cells)
		if (c.block === block)
			rows.set(c.row, [...(rows.get(c.row) ?? []), c]);
	return [...rows.values()].map((r) =>
		r
			.sort((a, b) => a.col - b.col)
			.map((c) =>
				groups(c.lines, (l) => `${l.block}`)
					.map(linesText)
					.join(' '),
			),
	);
}

function mirrorOf(doc: WriteDoc, page: PageBox): MirrorItem[] {
	const out: MirrorItem[] = [];
	for (const g of groups(page.header, (l) => `${l.block}`))
		out.push(item(`h${g[0]!.block}`, 'p', linesText(g)));
	const body = page.lines.filter((l) => l.kind !== 'break');
	for (const g of groups(body, (l) => `${l.kind}|${l.block}`)) {
		const { block, kind } = g[0]!;
		const b = doc.blocks[block];
		if (kind === 'table') {
			out.push({
				...item(`t${block}`, 'table'),
				rows: tableRows(page, block),
			});
			continue;
		}
		if (kind === 'toc') {
			out.push({
				...item(`c${block}`, 'ul'),
				items: groups(
					page.toc,
					(l) => `${l.block}`,
				).map(linesText),
			});
			continue;
		}
		if (b?.kind !== 'para') continue;
		const text = linesText(g);
		const list = b.props.list;
		if (!list) {
			out.push(
				item(
					`b${block}`,
					HEADINGS[b.style] ?? 'p',
					text,
				),
			);
			continue;
		}
		const kindOf = list.kind === 'number' ? 'ol' : 'ul';
		const last = out.at(-1);
		if (last?.kind === kindOf && last.key.startsWith('l'))
			last.items.push(text);
		else out.push({ ...item(`l${block}`, kindOf), items: [text] });
	}
	for (const g of groups(page.notes, (l) => `${l.note}|${l.block}`))
		out.push(
			item(
				`n${g[0]!.note}|${g[0]!.block}`,
				'p',
				linesText(g),
			),
		);
	for (const g of groups(page.footer, (l) => `${l.block}`))
		out.push(item(`f${g[0]!.block}`, 'p', linesText(g)));
	return out;
}

interface ImageDrag {
	handle: string | null;
	px: number;
	py: number;
	w: number;
	h: number;
	x: number;
	y: number;
	moved: boolean;
}

const pageImages = new WeakMap<PageBox, string[]>();

function imagesOf(page: PageBox): string[] {
	let ids = pageImages.get(page);
	if (!ids) {
		const out = new Set(page.floats.map((f) => f.image.id));
		for (const l of page.lines)
			for (const s of l.spans)
				if (s.image) out.add(s.image.id);
		ids = [...out];
		pageImages.set(page, ids);
	}
	return ids;
}

const CHROME = '.err-write-bar, .err-write-rail, .sub-ed-omni, .err-edge';

const FLAG = 24;
const EDGE_ROOM = 160;
const TYPING_REST = 5000;

const FLAG_LABELS: Record<StyleId, string> = {
	title: 'Title',
	h1: 'H1',
	h2: 'H2',
	h3: 'H3',
	body: 'Body',
	quote: 'Quote',
	caption: 'Caption',
	note: 'Note',
};

const HEAD_TONE = new Set<StyleId>(['title', 'h1', 'h2', 'h3']);

function flagsOf(
	page: PageBox,
	doc: WriteDoc,
	current: number,
	picked: { block: number; offset: number } | null,
	info: string,
	z: number,
) {
	const found: {
		kind: 'para' | 'toc' | 'image';
		block: number;
		offset: number;
		top: number;
		here: boolean;
		label: string;
		tone: string;
	}[] = [];
	const add = (f: (typeof found)[number], col?: number) => {
		if (!col || f.here) found.push(f);
	};
	const image = (
		block: number,
		offset: number,
		top: number,
		col?: number,
	) =>
		add(
			{
				kind: 'image',
				block,
				offset,
				top,
				here:
					picked?.block === block &&
					picked.offset === offset,
				label: 'Image',
				tone: 'object',
			},
			col,
		);
	let toc = -1;
	for (const l of page.lines) {
		const b = doc.blocks[l.block];
		if (l.kind === 'toc' && l.block !== toc) {
			toc = l.block;
			add(
				{
					kind: 'toc',
					block: l.block,
					offset: 0,
					top: l.top,
					here: l.block === current,
					label: 'Contents',
					tone: 'object',
				},
				l.col,
			);
		}
		if (l.kind || b?.kind !== 'para') continue;
		const here = l.block === current && !picked;
		const alone =
			blockLength(b) === 1 &&
			b.runs.some((r) => r.props.image);
		if (l.start === 0 && (here || !alone))
			add(
				{
					kind: 'para',
					block: l.block,
					offset: 0,
					top: l.top,
					here,
					label: FLAG_LABELS[b.style],
					tone: HEAD_TONE.has(b.style)
						? 'head'
						: b.style === 'body'
							? 'body'
							: 'aside',
				},
				l.col,
			);
		for (const sp of l.spans)
			if (sp.image) image(l.block, sp.start, l.top, l.col);
	}
	for (const f of page.floats) image(f.block, f.offset, f.y, f.col);
	const rank = (f: (typeof found)[number]) =>
		f.top - (f.here ? FLAG / z : 0);
	found.sort((a, b) => rank(a) - rank(b));
	const out = [];
	let last = -Infinity;
	for (const f of found) {
		let top = f.top * z;
		if (top < last + FLAG - 2) {
			const twin =
				f.kind === 'para' &&
				out.at(-1)?.label === f.label;
			const far = last > top && !out.at(-1)?.current;
			if ((twin || far) && !f.here) continue;
			if (twin) out.pop();
			else top = last + FLAG;
		}
		last = top;
		out.push({
			key: `${f.kind}${f.block}:${f.offset}`,
			kind: f.kind,
			block: f.block,
			offset: f.offset,
			current: f.here,
			label: f.label,
			info: f.here && f.kind === 'para' ? info : '',
			tone: f.tone,
			style: htmlSafe(`top:${px(top)}`),
			drawer:
				f.here &&
				f.kind !== 'toc' &&
				drawerAt(page, top, z),
		});
	}
	return out;
}
const drawerAt = (page: PageBox, top: number, z: number) =>
	htmlSafe(
		`top:${px(top + FLAG + 4)};--err-drawer-in:${px(clamp(0, 82, page.content.left * z - 8))}`,
	);

function innerFlag(
	page: PageBox,
	lines: PageBox,
	s: WriteState,
	fallback: number,
	info: string,
	z: number,
): ReturnType<typeof flagsOf> {
	const block = s.sel.focus.block;
	const b = s.doc.blocks[block];
	if (b?.kind !== 'para') return [];
	const top =
		(lines.lines.find((l) => l.block === block)?.top ?? fallback) *
		z;
	return [
		{
			key: 'inner',
			kind: 'para',
			block,
			offset: 0,
			current: true,
			label: FLAG_LABELS[b.style],
			info,
			tone: 'aside',
			style: htmlSafe(`top:${px(top)}`),
			drawer: drawerAt(page, top, z),
		},
	];
}

const drawerOf = (flags: ReturnType<typeof flagsOf>) =>
	flags.find((f) => f.current)?.drawer;

const FIELD = 'input, textarea, select, [contenteditable]';

export default class WriteView extends Component<{
	Args: { phone?: boolean; onImage?: () => void };
	Blocks: { title: [] };
}> {
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);
	shown = new TrackedExternal(invisibles.subscribe, invisibles.get);
	ruled = new TrackedExternal(rulers.subscribe, rulers.get);
	guide = new TrackedExternal(marginGuide.subscribe, marginGuide.get);
	typed = new TrackedExternal(typewriter.subscribe, typewriter.get);
	focused = new TrackedExternal(focusMode.subscribe, focusMode.get);
	zoom = new TrackedExternal(
		writeView.subscribe,
		() => writeView.get().zoom,
	);
	finding = new TrackedExternal(writePanel.subscribe, isPanel('find'));
	query = new TrackedExternal(findQuery.subscribe, findQuery.get);
	editing = new TrackedExternal(inner.subscribe, inner.get);
	ready = new TrackedExternal(bitmapsReady.subscribe, bitmapsReady.get);
	marked = new TrackedExternal(marksReady.subscribe, marksReady.get);
	marking = new TrackedExternal(markup.subscribe, markup.get);
	handles = HANDLES;
	fonts = new TrackedExternal(fontsLoaded.subscribe, fontsLoaded.get);
	@tracked fontsFailed = false;
	@tracked composing = false;
	@tracked preedit = '';
	@tracked shownPage = 0;
	#before: Before | null = null;
	@tracked near: ReadonlySet<number> = new Set();
	#near: IntersectionObserver | null = null;
	#seen: IntersectionObserver | null = null;
	#visible = new Map<number, number>();
	#input: HTMLTextAreaElement | null = null;
	@tracked tracking = false;
	#track: Track | null = null;
	#family = '';
	@tracked dragging = false;
	#column: ColumnDrag | null = null;
	#image: ImageDrag | null = null;
	#clicks = { time: 0, x: 0, y: 0, count: 0 };
	@tracked openBlock: number | null = null;
	@tracked insertOpen = false;
	@tracked room = Infinity;
	@tracked typing = false;
	#typed = 0;

	get drawerOpen() {
		const s = this.edit?.s;
		return (
			!!s &&
			(this.openBlock === s.sel.focus.block ||
				!!selectedImage(s))
		);
	}

	pickFlag = (f: { kind: string; block: number; offset: number }) => {
		const s = this.edit?.s;
		if (!s || this.#woke) return;
		const { block } = f;
		if (f.kind !== 'para') {
			if (f.kind === 'image') selectImage(f);
			else selectRange(caret({ block, offset: 0 }));
			this.insertOpen = false;
			this.focusInput();
			return;
		}
		if (s.sel.focus.block !== block) {
			selectRange(caret({ block, offset: 0 }));
			this.openBlock = block;
		} else this.openBlock = this.drawerOpen ? null : block;
		this.insertOpen = false;
		this.focusInput();
		if (this.args.phone)
			requestAnimationFrame(() =>
				document
					.querySelector('.err-write-caret')
					?.scrollIntoView({ block: 'nearest' }),
			);
	};

	keyed() {
		if (!this.args.phone) return;
		if (!this.typing) this.typing = true;
		clearTimeout(this.#typed);
		this.#typed = window.setTimeout(this.rest, TYPING_REST);
	}

	#woke = false;
	wake = () => {
		this.#woke = this.typing;
		this.rest();
	};

	rest = () => {
		clearTimeout(this.#typed);
		if (this.typing) this.typing = false;
	};

	toggleInsert = () => {
		if (this.#woke) return;
		this.insertOpen = !this.insertOpen;
	};

	pickImage = () => this.args.onImage?.();

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
		this.shown.unsubscribe();
		this.ruled.unsubscribe();
		this.guide.unsubscribe();
		this.typed.unsubscribe();
		this.focused.unsubscribe();
		this.zoom.unsubscribe();
		this.finding.unsubscribe();
		this.query.unsubscribe();
		this.editing.unsubscribe();
		this.fonts.unsubscribe();
		this.ready.unsubscribe();
		this.marking.unsubscribe();
		clearTimeout(this.#typed);
		this.#dropTap();
		this.marked.unsubscribe();
		this.#near?.disconnect();
		this.#seen?.disconnect();
	}

	get layout(): Layout | null {
		const s = this.state.current;
		void this.fonts.current;
		if (!s) return null;
		return currentLayout(s.doc);
	}

	loadFonts = modifier(
		(_el: HTMLElement, [doc]: [WriteDoc | undefined]) => {
			if (!doc || docReady(doc)) return;
			ensureDocFonts(doc).catch(() => {
				if (!fontsReady(doc)) this.fontsFailed = true;
			});
		},
	);

	pointer = modifier((el: HTMLElement) => {
		el.addEventListener('pointerdown', this.down);
		el.addEventListener('pointermove', this.move);
		el.addEventListener('pointerup', this.up);
		el.addEventListener('pointercancel', this.cancel);
		el.addEventListener('touchend', this.lift);
		return () => {
			el.removeEventListener('pointerdown', this.down);
			el.removeEventListener('pointermove', this.move);
			el.removeEventListener('pointerup', this.up);
			el.removeEventListener('pointercancel', this.cancel);
			el.removeEventListener('touchend', this.lift);
		};
	});

	get edit() {
		const full = this.layout;
		void this.editing.current;
		void this.state.current;
		const s = editState();
		return full && s ? { layout: editLayout(full), s } : null;
	}

	get storyKind() {
		const st = this.editing.current;
		if (st?.kind !== 'story') return null;
		return st.part === 'header' || st.part === 'firstHeader'
			? 'header'
			: 'footer';
	}

	storyMarks(page: PageBox, z: number) {
		const kind = this.storyKind;
		if (!kind) return null;
		const { top, height } = page.content;
		const edge = kind === 'header' ? top : top + height;
		return {
			dim: htmlSafe(
				`top:${px(top * z)};height:${px(height * z)}`,
			),
			edge: htmlSafe(`top:${px(edge * z)}`),
		};
	}

	get tight() {
		const pages = this.layout?.pages;
		if (!pages?.length) return false;
		if (this.args.phone) return true;
		const width = Math.max(...pages.map((p) => p.width));
		return this.room - width * this.zoom.current < 2 * EDGE_ROOM;
	}

	get titleStyle() {
		const width = this.layout?.pages[0]?.width ?? 0;
		return htmlSafe(`inline-size:${width * this.zoom.current}px`);
	}

	get pages() {
		const full = this.layout;
		const edit = this.edit;
		if (!full || !edit) return [];
		const { layout, s } = edit;
		const z = this.zoom.current;
		const focus = caretRect(
			layout,
			s.sel.focus,
			s.sel.focusAffinity,
		);
		const range = cellRangeRects(full);
		const picked = selectedImage(s);
		const frame = picked && imageRect(full, picked);
		const rects = picked
			? []
			: range.length
				? range
				: selectionRects(
						layout,
						s.sel.anchor,
						s.sel.focus,
					);
		void this.query.current;
		const outer = this.state.current;
		const body = outer?.doc;
		const edges = !this.editing.current ? outer : null;
		const flagged = this.editing.current?.kind !== 'cell';
		const char = flagged ? barChar(s) : {};
		const flagInfo = [
			char.font && FAMILIES[char.font].label,
			char.size,
		]
			.filter(Boolean)
			.join(' ');
		const hits =
			this.finding.current && body
				? findRects(full, body)
				: [];
		const veiled = this.focused.current && !this.editing.current;
		return full.pages.map((page) => ({
			page,
			veils: veiled
				? veilsOf(page, s.sel.focus.block, z)
				: [],
			pinned:
				focus.page === page.index ||
				frame?.page === page.index,
			overlay: this.marking.current
				? undefined
				: body?.overlays?.[page.index],
			flags: edges
				? flagsOf(
						page,
						edges.doc,
						edges.sel.focus.block,
						picked,
						flagInfo,
						z,
					)
				: flagged && focus.page === page.index
					? innerFlag(
							page,
							layout.pages[
								page.index
							]!,
							s,
							focus.top,
							flagInfo,
							z,
						)
					: [],
			edge:
				flagged && focus.page === page.index
					? htmlSafe(`top:${px(focus.top * z)}`)
					: null,
			story: this.storyMarks(page, z),
			frame: htmlSafe(
				`width:${px(page.width * z)};height:${px(page.height * z)}`,
			),
			content: htmlSafe(
				`left:${px(page.content.left * z)};top:${px(page.content.top * z)};width:${px(page.content.width * z)};height:${px(page.content.height * z)};--err-guide-mark:${px(14 * z)}`,
			),
			marks: rects
				.filter((r) => r.page === page.index)
				.map((r) => rectStyle(r, z)),
			hits: hits
				.filter((r) => r.page === page.index)
				.map((r) => rectStyle(r, z)),
			image:
				frame?.page === page.index
					? rectStyle(frame, z)
					: null,
			caret:
				focus.page === page.index &&
				rects.length === 0 &&
				!picked
					? htmlSafe(
							`left:${px(focus.x * z)};top:${px(focus.top * z)};height:${px(focus.height * z)}`,
						)
					: null,
		}));
	}

	get selectionBar() {
		const full = this.layout;
		const edit = this.edit;
		if (!full || !edit || this.dragging) return null;
		const { layout, s } = edit;
		if (
			isCollapsed(s.sel) ||
			selectedImage(s) ||
			cellRangeRects(full).length
		)
			return null;
		const r = selectionRects(layout, s.sel.anchor, s.sel.focus)[0];
		if (!r) return null;
		const z = this.zoom.current;
		return {
			page: r.page,
			style: htmlSafe(
				`left:${px(r.x * z)};top:${px(r.y * z)}`,
			),
		};
	}

	get tocCard() {
		const full = this.layout;
		const s = this.state.current;
		if (!full || !s || this.editing.current) return null;
		const { anchor, focus } = s.sel;
		const bi = focus.block;
		if (anchor.block !== bi || s.doc.blocks[bi]?.kind !== 'toc')
			return null;
		const z = this.zoom.current;
		for (const page of full.pages) {
			const line = page.lines.find(
				(l) => l.kind === 'toc' && l.block === bi,
			);
			if (line)
				return {
					page: page.index,
					style: htmlSafe(
						`top:${px(line.top * z)};--toc-left:${px(page.content.left * z)}`,
					),
				};
		}
		return null;
	}

	get ruler() {
		const full = this.layout;
		if (!this.ruled.current || !full) return null;
		const page =
			full.pages[
				Math.min(this.shownPage, full.pages.length - 1)
			]!;
		return page;
	}

	get mirror() {
		const full = this.layout;
		const s = this.state.current;
		const page =
			full?.pages[
				Math.min(this.shownPage, full.pages.length - 1)
			];
		if (!page || !s) return null;
		return {
			label: `Page ${page.index + 1}`,
			items: mirrorOf(s.doc, page),
		};
	}

	syncInput = modifier(
		(
			el: HTMLTextAreaElement,
			[s, composing]: [WriteState | undefined, boolean],
		) => {
			if (s && !composing && !this.tracking)
				mirrorInput(el, s);
		},
	);

	@cached
	get inputAt() {
		const edit = this.edit;
		if (!edit) return null;
		const { layout, s } = edit;
		const c = caretRect(layout, s.sel.focus, s.sel.focusAffinity);
		const z = this.zoom.current;
		const above = pageTop(layout, c.page, z);
		const at = { page: c.page, x: c.x * z };
		const top = (y: number) =>
			`top:calc(var(--err-write-pad-top) + ${px(above + y * z)})`;
		const place = top(c.top);
		if (this.tracking && this.#track?.at) return this.#track.at;
		if (!this.composing) {
			const shape = COARSE
				? paraShape(
						layout,
						s.sel.focus.block,
						c.page,
						z,
					)
				: null;
			if (!shape) return { ...at, style: htmlSafe(place) };
			return {
				page: c.page,
				x: shape.left * z,
				style: htmlSafe(
					`${top(shape.top)};${shape.css}`,
				),
			};
		}
		const b = s.doc.blocks[s.sel.focus.block];
		const font =
			resolveChar(
				b?.kind === 'para' ? b.style : 'body',
				barChar(s),
			).size * z;
		const w =
			(textWidth(this.preedit, `${font}px ${this.#family}`) ??
				font) + 2;
		return {
			...at,
			style: htmlSafe(
				`${place};font-size:${px(font)};width:${px(w)}`,
			),
		};
	}

	placeInput = modifier(
		(
			el: HTMLTextAreaElement,
			[at]: [{ page: number; x: number } | null],
		) => {
			if (at) placeLeft(el, at);
		},
	);

	paint = modifier(
		(
			canvas: HTMLCanvasElement,
			[page, zoom, shown, ready, marked, marks]: [
				PageBox,
				number,
				boolean,
				number,
				number,
				readonly PageObject[] | undefined,
			],
		) => {
			const s = writeStore.get();
			if (!s) return;
			const last = painted.get(canvas);
			if (
				last?.page === page &&
				last.zoom === zoom &&
				last.shown === shown &&
				last.marks === marks &&
				last.marked === marked &&
				!imagesOf(page).some((id) => {
					const asset = s.doc.images?.[id];
					return (
						asset &&
						readySince(asset, last.ready)
					);
				})
			)
				return;
			const dpr = Math.min(
				window.devicePixelRatio || 1,
				Math.sqrt(
					MAX_PIXELS / (page.width * page.height),
				) / zoom,
			);
			canvas.width = Math.round(page.width * zoom * dpr);
			canvas.height = Math.round(page.height * zoom * dpr);
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			painted.set(canvas, {
				page,
				zoom,
				shown,
				ready,
				marks,
				marked,
			});
			const blocks = s.doc.blocks;
			const k = zoom * dpr;
			ctx.setTransform(k, 0, 0, k, 0, 0);
			paintPage(ctx, page, {
				scale: k,
				invisibles: shown,
				ink: INK,
				paraEnd: (i) => blockLength(blocks[i]),
				images: s.doc.images,
			});
			if (!marks) return;
			ctx.setTransform(k, 0, 0, k, 0, 0);
			paintMarks(ctx, marks);
		},
	);

	watch = modifier((el: HTMLElement) => {
		const root = el.closest('.err-write');
		this.#near ??= new IntersectionObserver(this.onNear, {
			root,
			rootMargin: '100% 0px',
		});
		this.#seen ??= new IntersectionObserver(this.onSeen, {
			root,
			threshold: STEPS,
		});
		this.#near.observe(el);
		this.#seen.observe(el);
		return () => {
			this.#near?.unobserve(el);
			this.#seen?.unobserve(el);
			this.#visible.delete(Number(el.dataset['page']));
		};
	});

	onSeen = (entries: IntersectionObserverEntry[]) => {
		for (const e of entries) {
			const i = Number(
				(e.target as HTMLElement).dataset['page'],
			);
			const h = e.isIntersecting
				? e.intersectionRect.height
				: 0;
			if (h > 0) this.#visible.set(i, h);
			else this.#visible.delete(i);
		}
		let best = -1;
		let most = 0;
		for (const [i, h] of this.#visible)
			if (h > most || (h === most && i < best)) {
				best = i;
				most = h;
			}
		if (best >= 0 && best !== this.shownPage) this.shownPage = best;
	};

	mounted = (p: { page: PageBox; pinned: boolean }) =>
		p.pinned || this.near.has(p.page.index);

	onNear = (entries: IntersectionObserverEntry[]) => {
		const next = new Set(this.near);
		for (const e of entries) {
			const i = Number(
				(e.target as HTMLElement).dataset['page'],
			);
			if (e.isIntersecting) next.add(i);
			else next.delete(i);
		}
		this.near = next;
	};

	release = modifier((canvas: HTMLCanvasElement) => () => {
		canvas.width = 0;
		canvas.height = 0;
	});

	registerInput = modifier((el: HTMLTextAreaElement) => {
		this.#input = el;
		this.#family = getComputedStyle(el).fontFamily;
		const refocus = () => el.focus({ preventScroll: true });
		refocus();
		registerFocus(refocus);
		const keep = (event: MouseEvent) => {
			const t = event.target as Element;
			if (t.closest(FIELD) || !t.closest('button')) return;
			if (t.closest(CHROME)) event.preventDefault();
		};
		const opened = new WeakSet<EventTarget>();
		const before = (event: Event) => {
			const e = event as ToggleEvent;
			if (e.newState !== 'open') return;
			const panel = e.target as Element;
			if (
				panel.closest(CHROME) &&
				document.activeElement === el
			)
				opened.add(panel);
		};
		const closed = (event: Event) => {
			const e = event as ToggleEvent;
			if (
				e.newState !== 'closed' ||
				!opened.delete(e.target!)
			)
				return;
			const a = document.activeElement;
			if (!a || a === document.body || a.closest(CHROME))
				refocus();
		};
		let idle = 0;
		const untrack = () => {
			clearTimeout(idle);
			if (!this.tracking) return;
			this.tracking = false;
			this.#track = null;
			delete el.dataset['tracking'];
			this.resync();
		};
		const touched = (e: Event) => {
			if (e.target !== el) untrack();
		};
		const typed = (e: Event) => {
			const { inputType } = e as InputEvent;
			if (
				this.tracking &&
				inputType !== 'insertText' &&
				!EDITS[inputType]
			)
				e.preventDefault();
			untrack();
		};
		const toInput = (
			t: Track,
			pos: { block: number; offset: number },
		) => {
			const r = t.rows.findLast(
				(x) =>
					x.block === pos.block &&
					x.start <= pos.offset,
			);
			return r
				? r.at + Math.min(pos.offset, r.end) - r.start
				: 0;
		};
		const toDoc = (t: Track, at: number) => {
			const r =
				t.rows.findLast((x) => x.at <= at) ??
				t.rows[0]!;
			return {
				block: r.block,
				offset: Math.min(r.start + at - r.at, r.end),
			};
		};
		const missed = () => {
			const n = getSelection()?.anchorNode;
			const host =
				n instanceof Element ? n : n?.parentElement;
			return (
				!!host &&
				host !== el &&
				host !== el.parentElement
			);
		};
		const track = (st: WriteState) => {
			const edit = this.edit;
			const { focus } = st.sel;
			const z = this.zoom.current;
			const c =
				edit &&
				caretRect(
					edit.layout,
					focus,
					st.sel.focusAffinity,
				);
			const shape =
				edit && c && st === writeStore.get()
					? pageShape(
							edit.layout,
							st.doc,
							c.page,
							z,
							focus,
						)
					: null;
			this.#track = {
				rows: [
					{
						block: focus.block,
						start: 0,
						end: el.value.length,
						at: 0,
					},
				],
			};
			if (edit && c && shape) {
				const top =
					pageTop(edit.layout, c.page, z) +
					shape.top * z;
				const css = `top:calc(var(--err-write-pad-top) + ${px(top)});${shape.css}`;
				const at = {
					page: c.page,
					x: shape.left * z,
					style: htmlSafe(css),
				};
				this.#track = { rows: shape.rows, at };
				el.style.cssText = css;
				placeLeft(el, at);
				el.value = shape.value;
			}
			this.tracking = true;
			el.dataset['tracking'] = '';
		};
		const moved = () => {
			const st = editState();
			if (
				!st ||
				document.activeElement !== el ||
				this.composing ||
				this.#before
			)
				return;
			const { anchor, focus } = st.sel;
			const t = this.#track;
			if (this.tracking && t) {
				clearTimeout(idle);
				idle = window.setTimeout(untrack, TRACKING);
				const at = toInput(t, focus);
				if (missed())
					return el.setSelectionRange(
						at,
						at,
						'forward',
					);
				const { selectionStart: a, selectionEnd: b } =
					el;
				if (a === at && b === at) return;
				const back =
					el.selectionDirection === 'backward';
				const from = toDoc(t, back ? b : a);
				const to = toDoc(t, back ? a : b);
				if (
					from.block === focus.block &&
					to.block === focus.block
				)
					selectAround(from.offset, to.offset);
				else selectRange({ anchor: from, focus: to });
				return;
			}
			const text = blockText(st.doc.blocks[focus.block]);
			if (anchor.block !== focus.block || el.value !== text)
				return;
			if (
				Math.min(anchor.offset, focus.offset) !==
					mirrored[0] ||
				Math.max(anchor.offset, focus.offset) !==
					mirrored[1]
			)
				return;
			if (COARSE && missed()) {
				track(st);
				const at = toInput(this.#track!, focus);
				el.setSelectionRange(at, at, 'forward');
				idle = window.setTimeout(untrack, TRACKING);
				return;
			}
			const { selectionStart: a, selectionEnd: b } = el;
			if (a === mirrored[0] && b === mirrored[1]) return;
			if (el.selectionDirection === 'backward')
				selectAround(b, a);
			else selectAround(a, b);
		};
		document.addEventListener('selectionchange', moved);
		document.addEventListener('touchstart', touched, true);
		el.addEventListener('beforeinput', typed);
		el.addEventListener('compositionstart', untrack);
		el.addEventListener('blur', untrack);
		document.addEventListener('mousedown', keep, true);
		document.addEventListener('beforetoggle', before, true);
		document.addEventListener('toggle', closed, true);
		return () => {
			this.#input = null;
			registerFocus(null);
			document.removeEventListener('selectionchange', moved);
			document.removeEventListener(
				'touchstart',
				touched,
				true,
			);
			el.removeEventListener('beforeinput', typed);
			el.removeEventListener('compositionstart', untrack);
			el.removeEventListener('blur', untrack);
			untrack();
			document.removeEventListener('mousedown', keep, true);
			document.removeEventListener(
				'beforetoggle',
				before,
				true,
			);
			document.removeEventListener('toggle', closed, true);
		};
	});

	host = modifier((content: HTMLElement) => {
		hostFrame.set({
			scroller: content.parentElement!,
			content,
			pages: () => [
				...content.querySelectorAll<HTMLElement>(
					'.err-write-page',
				),
			],
			zoom: zoomBy,
			fit: fitPage,
			edit: (x, y) => {
				const full = this.layout;
				const el = pageUnder(content, y);
				if (!full || !el) return;
				stopMarkup();
				const p = this.pagePoint(el, {
					clientX: x,
					clientY: y,
				});
				clickAt(full, p.page, p.x, p.y, {
					extend: false,
					detail: 1,
				});
				this.focusInput();
			},
		});
		return () => hostFrame.set(null);
	});

	registerScroller = modifier((el: HTMLElement) => {
		const fit = () => {
			this.room = el.clientWidth;
			el.style.setProperty(
				'--err-write-w',
				px(el.clientWidth),
			);
			const s = writeStore.get();
			if (!s) return;
			const wide =
				(el.clientWidth - 2 * GAP) / s.doc.setup.width;
			const z = Math.min(1.25, wide);
			const v = writeView.get();
			const pageZoom = clamp(
				z / 2,
				4,
				Math.min(
					wide,
					(el.clientHeight - 2 * GAP) /
						s.doc.setup.height,
				),
			);
			writeView.set({
				...v,
				zoom: v.paged
					? pageZoom
					: v.zoomed
						? v.zoom
						: z,
				fitZoom: z,
				pageZoom,
			});
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		registerShownPage(() => shownPageOf(el));
		const pages = () =>
			el.querySelector<HTMLElement>('.err-write-pages');
		let pinch: {
			d: number;
			z: number;
			k: number;
			mx: number;
			my: number;
			page: number;
			x: number;
			y: number;
		} | null = null;
		const start = (e: TouchEvent) => {
			const box = pages();
			if (e.touches.length !== 2 || !box) return;
			const [a, b] = [e.touches[0]!, e.touches[1]!];
			const mx = (a.clientX + b.clientX) / 2;
			const my = (a.clientY + b.clientY) / 2;
			const at =
				document
					.elementFromPoint(mx, my)
					?.closest<HTMLElement>('[data-page]') ??
				el.querySelector<HTMLElement>(
					`[data-page="${this.shownPage}"]`,
				);
			if (!at) return;
			const z = writeView.get().zoom;
			const r = at.getBoundingClientRect();
			const o = box.getBoundingClientRect();
			pinch = {
				d: spread(e.touches),
				z,
				k: 1,
				mx,
				my,
				page: Number(at.dataset['page']),
				x: (mx - r.left) / z,
				y: (my - r.top) / z,
			};
			box.style.transformOrigin = `${px(mx - o.left)} ${px(my - o.top)}`;
			el.classList.add('is-pinching');
			this.dragging = false;
		};
		const pinchMove = (e: TouchEvent) => {
			if (this.#held && e.cancelable) e.preventDefault();
			if (!pinch || e.touches.length !== 2) return;
			e.preventDefault();
			const zoom = clamp(
				writeView.get().fitZoom / 2,
				4,
				(pinch.z * spread(e.touches)) / pinch.d,
			);
			pinch.k = zoom / pinch.z;
			const box = pages();
			if (box) box.style.transform = `scale(${pinch.k})`;
		};
		const end = (e: TouchEvent) => {
			if (!pinch || e.touches.length >= 2) return;
			const p = pinch;
			pinch = null;
			el.classList.remove('is-pinching');
			const box = pages();
			box?.style.removeProperty('transform');
			box?.style.removeProperty('transform-origin');
			if (p.k === 1) return;
			const zoom = p.z * p.k;
			writeView.set({
				...writeView.get(),
				zoom,
				zoomed: true,
				paged: false,
			});
			requestAnimationFrame(() => {
				const r = el
					.querySelector(
						`[data-page="${p.page}"]`,
					)
					?.getBoundingClientRect();
				if (!r) return;
				el.scrollLeft += r.left + p.x * zoom - p.mx;
				el.scrollTop += r.top + p.y * zoom - p.my;
			});
		};
		const wheel = (e: WheelEvent) => {
			if (!(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			const at = pageUnder(el, e.clientY);
			if (!at) return;
			const r = at.getBoundingClientRect();
			const fx = (e.clientX - r.left) / r.width;
			const fy = (e.clientY - r.top) / r.height;
			zoomBy(Math.pow(0.999, e.deltaY));
			requestAnimationFrame(() => {
				const n = at.getBoundingClientRect();
				el.scrollLeft +=
					n.left + fx * n.width - e.clientX;
				el.scrollTop +=
					n.top + fy * n.height - e.clientY;
			});
		};
		el.addEventListener('wheel', wheel, { passive: false });
		el.addEventListener('touchmove', this.rest, { passive: true });
		el.addEventListener('pointerdown', this.wake, true);
		const noZoom = (e: Event) => e.preventDefault();
		const safari = 'GestureEvent' in window;
		if (safari) {
			el.addEventListener('gesturestart', noZoom);
			el.addEventListener('gesturechange', noZoom);
		}
		el.addEventListener('touchstart', start, { passive: true });
		el.addEventListener('touchmove', pinchMove, { passive: false });
		el.addEventListener('touchend', end);
		el.addEventListener('touchcancel', end);
		return () => {
			if (safari) {
				el.removeEventListener('gesturestart', noZoom);
				el.removeEventListener('gesturechange', noZoom);
			}
			el.removeEventListener('wheel', wheel);
			el.removeEventListener('touchmove', this.rest);
			el.removeEventListener('pointerdown', this.wake, true);
			el.removeEventListener('touchstart', start);
			el.removeEventListener('touchmove', pinchMove);
			el.removeEventListener('touchend', end);
			el.removeEventListener('touchcancel', end);
			ro.disconnect();
			registerShownPage(null);
		};
	});

	#caretStyle = '';
	follow = modifier(
		(el: HTMLElement, [style, page]: [unknown, number]) => {
			const now = `${page}:${String(style)}`;
			const moved = now !== this.#caretStyle;
			this.#caretStyle = now;
			if (!moved || markup.get()) return;
			if (this.tracking) return;
			el.scrollIntoView({
				block: this.typed.current
					? 'center'
					: 'nearest',
				inline: 'nearest',
			});
			for (const a of el.getAnimations()) a.currentTime = 0;
		},
	);

	focusInput = () => this.#input?.focus({ preventScroll: true });

	pagePoint(
		el: HTMLElement,
		event: { clientX: number; clientY: number },
	) {
		const r = el.getBoundingClientRect();
		const z = this.zoom.current;
		return {
			page: Number(el.dataset['page']),
			x: (event.clientX - r.left) / z,
			y: (event.clientY - r.top) / z,
		};
	}

	pageAt(event: PointerEvent): HTMLElement {
		const origin = event.currentTarget as HTMLElement;
		return (
			pageUnder(
				origin.parentElement ?? origin,
				event.clientY,
			) ?? origin
		);
	}

	clickCount(event: PointerEvent): number {
		const c = this.#clicks;
		const again =
			event.timeStamp - c.time < 500 &&
			Math.abs(event.clientX - c.x) < 5 &&
			Math.abs(event.clientY - c.y) < 5;
		this.#clicks = {
			time: event.timeStamp,
			x: event.clientX,
			y: event.clientY,
			count: again ? c.count + 1 : 1,
		};
		return this.#clicks.count;
	}

	borderAt(el: HTMLElement, event: PointerEvent) {
		const full = this.layout;
		if (!full) return null;
		const p = this.pagePoint(el, event);
		return columnBorderAt(
			full,
			p.page,
			p.x,
			p.y,
			GRAB / this.zoom.current,
		);
	}

	#tap: { el: HTMLElement; event: PointerEvent; hold: number } | null =
		null;
	#held = false;
	#paged = false;

	#lifted = false;
	capture(el: HTMLElement, event: PointerEvent) {
		if (!this.#lifted) el.setPointerCapture(event.pointerId);
	}

	#dropTap() {
		clearTimeout(this.#tap?.hold);
		this.#tap = null;
	}

	down = (event: PointerEvent) => {
		const el = event.currentTarget as HTMLElement;
		const touch = event.pointerType === 'touch';
		if (touch && !event.isPrimary) return this.#dropTap();
		this.#paged = touch;
		const handle = (event.target as Element).closest(
			'[data-handle]',
		);
		if (!touch || handle) return this.press(el, event, 0);
		event.preventDefault();
		this.#dropTap();
		this.#tap = {
			el,
			event,
			hold: window.setTimeout(() => {
				this.#tap = null;
				this.#held = true;
				this.press(el, event, 2);
			}, HOLD),
		};
	};

	lift = (event: TouchEvent) => {
		if (this.#paged && event.cancelable) event.preventDefault();
		this.#paged = false;
	};

	cancel = () => {
		this.#dropTap();
		this.#paged = false;
		this.up();
	};

	press(el: HTMLElement, event: PointerEvent, held: number) {
		const full = this.layout;
		const layout = this.edit?.layout;
		if (!full || !layout || event.button !== 0) return;
		event.preventDefault();
		this.insertOpen = false;
		if (this.composing) {
			this.#input?.blur();
			this.focusInput();
		}
		const capture = () => this.capture(el, event);
		const p = this.pagePoint(el, event);
		if (this.imageDown(el, event, p)) return;
		this.#column = this.borderAt(el, event);
		if (this.#column) {
			capture();
			this.focusInput();
			return;
		}
		if (event.metaKey || event.ctrlKey) {
			const s = editState();
			const at = hitTest(layout, p.page, p.x, p.y).focus;
			const url = s && linkAt(s.doc, at);
			if (url) {
				window.open(
					url,
					'_blank',
					'noopener,noreferrer',
				);
				return;
			}
		}
		const detail = held || this.clickCount(event);
		const entry =
			(event.metaKey || event.ctrlKey) &&
			tocAt(full, p.page, p.x, p.y);
		if (detail === 1 && entry !== null && entry !== false) {
			selectRange(caret({ block: entry, offset: 0 }));
			this.focusInput();
			return;
		}
		if (
			detail === 2 &&
			(noteDoubleClick(full, p.page, p.x, p.y) ||
				storyDoubleClick(full, p.page, p.x, p.y))
		) {
			this.dragging = false;
			this.focusInput();
			return;
		}
		clickAt(full, p.page, p.x, p.y, {
			extend: event.shiftKey,
			detail,
		});
		this.dragging = detail === 1 || held > 0;
		capture();
		this.focusInput();
	}

	imageDown(
		el: HTMLElement,
		event: PointerEvent,
		p: { page: number; x: number; y: number },
	): boolean {
		const full = this.layout;
		const handle =
			(event.target as HTMLElement).closest<HTMLElement>(
				'[data-handle]',
			)?.dataset['handle'] ?? null;
		let sel = selectedImage(writeStore.get());
		if (!handle || !sel) {
			const hit = full && imageHit(full, p.page, p.x, p.y);
			if (!hit) return false;
			selectImage(hit);
			sel = selectedImage(writeStore.get());
			if (!sel) return false;
		}
		const { image } = sel;
		if (handle || image.float)
			this.#image = {
				handle,
				px: event.clientX,
				py: event.clientY,
				w: image.w,
				h: image.h,
				x: image.float?.x ?? 0,
				y: image.float?.y ?? 0,
				moved: false,
			};
		this.dragging = false;
		this.capture(el, event);
		this.focusInput();
		return true;
	}

	dragImage(d: ImageDrag, event: PointerEvent) {
		const z = this.zoom.current;
		const dx = (event.clientX - d.px) / z;
		const dy = (event.clientY - d.py) / z;
		const amend = d.moved;
		d.moved = true;
		if (!d.handle) {
			moveFloat(d.x + dx, d.y + dy, amend);
			return;
		}
		const sx = d.handle.includes('e') ? 1 : -1;
		const sy = d.handle.includes('s') ? 1 : -1;
		let w = d.w + dx * sx;
		let h = d.h + dy * sy;
		if (!event.shiftKey) {
			const k =
				Math.abs(w / d.w - 1) >= Math.abs(h / d.h - 1)
					? w / d.w
					: h / d.h;
			w = d.w * k;
			h = d.h * k;
		}
		resizeImage(
			w,
			h,
			{
				x: d.x + (sx < 0 ? d.w - w : 0),
				y: d.y + (sy < 0 ? d.h - h : 0),
			},
			amend,
		);
	}

	move = (event: PointerEvent) => {
		const full = this.layout;
		const el = event.currentTarget as HTMLElement;
		if (this.#image) {
			if (event.buttons & 1)
				this.dragImage(this.#image, event);
			return;
		}
		if (this.#column) {
			dragColumn(this.#column, this.pagePoint(el, event).x);
			return;
		}
		if (!this.dragging) {
			el.style.cursor =
				event.buttons === 0 && this.borderAt(el, event)
					? 'col-resize'
					: '';
			return;
		}
		if (!full || !(event.buttons & 1)) return;
		const p = this.pagePoint(this.pageAt(event), event);
		dragTo(full, p.page, p.x, p.y);
	};

	up = () => {
		const tap = this.#tap;
		this.#dropTap();
		this.#held = false;
		if (tap) {
			this.#lifted = true;
			this.press(tap.el, tap.event, 0);
			this.#lifted = false;
		}
		const image = this.#image;
		this.#image = null;
		if (image?.moved && !image.handle) reanchor();
		this.dragging = false;
		this.#column = null;
	};

	onKey = (event: KeyboardEvent) => {
		if (event.key.length === 1 && !event.metaKey && !event.ctrlKey)
			this.keyed();
		const layout = this.edit?.layout;
		const ime = event.isComposing || event.keyCode === 229;
		if (!layout || this.composing || ime) return;
		if (!keydown(event, layout)) return;
		event.preventDefault();
		event.stopPropagation();
	};

	onBeforeInput = (event: InputEvent) => {
		this.keyed();
		if (event.defaultPrevented) return;
		if (this.composing || event.isComposing) return;
		const edit = EDITS[event.inputType];
		if (edit) {
			event.preventDefault();
			edit();
		} else if (event.inputType === 'insertText') {
			event.preventDefault();
			typeText(event.data ?? '');
		} else if (event.inputType.startsWith('history')) {
			event.preventDefault();
		} else {
			this.#before = this.#snapshot();
		}
	};

	#snapshot(): Before | null {
		const el = this.#input;
		return (
			el && {
				value: el.value,
				start: el.selectionStart,
				end: el.selectionEnd,
				at: caretAt(),
			}
		);
	}

	#applyDiff(b: Before, now: string) {
		let p = 0;
		while (p < b.start && now[p] === b.value[p]) p++;
		let q = 0;
		while (
			q < b.value.length - b.end &&
			q < now.length - p &&
			now[now.length - 1 - q] ===
				b.value[b.value.length - 1 - q]
		)
			q++;
		const to = b.value.length - q;
		const text = now.slice(p, now.length - q);
		if (p === b.start && to === b.end && b.at && caretIn(b.at))
			typeText(text);
		else if (p < to || text) replaceAround(p, to, text, b.at);
	}

	onCompositionStart = () => {
		this.#before = this.#snapshot();
		this.preedit = '';
		this.composing = true;
	};

	onCompositionUpdate = (event: CompositionEvent) => {
		this.preedit = event.data;
	};

	onCompositionEnd = (event: CompositionEvent) => {
		this.keyed();
		this.composing = false;
		const b = this.#before;
		const now = this.#input?.value;
		this.#before = null;
		if (!b || now === undefined) typeText(event.data);
		else this.#applyDiff(b, now);
		this.resync();
	};

	resync() {
		const s = editState();
		if (this.#input && s) mirrorInput(this.#input, s);
	}

	onInput = () => {
		if (this.composing) return;
		const b = this.#before;
		this.#before = null;
		if (b && this.#input) this.#applyDiff(b, this.#input.value);
		this.resync();
	};

	onCopy = (event: ClipboardEvent) => {
		if (!event.clipboardData) return;
		event.preventDefault();
		copy(event.clipboardData, false);
	};

	onCut = (event: ClipboardEvent) => {
		if (!event.clipboardData) return;
		event.preventDefault();
		copy(event.clipboardData, true);
	};

	onPaste = (event: ClipboardEvent) => {
		if (!event.clipboardData) return;
		event.preventDefault();
		if (paste(event.clipboardData)) event.stopPropagation();
	};

	<template>
		<div
			class="err-write
				{{if this.typed.current 'is-typewriter'}}
				{{if this.ruled.current 'is-ruled'}}
				{{if this.tight 'is-tight'}}
				{{if this.marking.current 'is-marking'}}
				{{if this.typing 'is-typing'}}"
			{{this.registerScroller}}
			{{this.loadFonts this.state.current.doc}}
		>
			{{#if this.layout}}
				<div class="err-write-pages" {{this.host}}>
					{{#unless @phone}}
						<div
							class="err-title-slot"
							style={{this.titleStyle}}
						>
							{{#unless
								this.editing.current
							}}
								<PageTabs />
							{{/unless}}
							{{yield to="title"}}
						</div>
					{{/unless}}
					<textarea
						class="err-write-input
							{{if
								this.composing
								'is-composing'
							}}"
						style={{this.inputAt.style}}
						rows="1"
						aria-label="Document"
						aria-multiline="true"
						autocomplete="off"
						autocapitalize="sentences"
						spellcheck="false"
						{{this.registerInput}}
						{{this.placeInput this.inputAt}}
						{{this.syncInput
							this.edit.s
							this.composing
						}}
						{{on "keydown" this.onKey}}
						{{on
							"beforeinput"
							this.onBeforeInput
						}}
						{{on "input" this.onInput}}
						{{on
							"compositionstart"
							this.onCompositionStart
						}}
						{{on
							"compositionupdate"
							this.onCompositionUpdate
						}}
						{{on
							"compositionend"
							this.onCompositionEnd
						}}
						{{on "copy" this.onCopy}}
						{{on "cut" this.onCut}}
						{{on "paste" this.onPaste}}
						{{on "blur" this.rest}}
					></textarea>
					{{#if this.ruler}}
						<Ruler
							@axis="x"
							@page={{this.ruler}}
							@zoom={{this.zoom.current}}
						/>
					{{/if}}
					<div class="err-write-stack">
						{{#each
							this.pages
							key="page.index"
							as |p|
						}}
							<div
								class="err-write-page"
								style={{p.frame}}
								data-page={{p.page.index}}
								{{this.pointer}}
								{{this.watch}}
							>
								{{#if
									(this.mounted
										p
									)
								}}
									<canvas
										class="err-write-canvas"
										{{this.paint
											p.page
											this.zoom.current
											this.shown.current
											this.ready.current
											this.marked.current
											p.overlay
										}}
										{{this.release}}
									></canvas>
									{{#unless
										(eq
											this.guide.current
											"off"
										)
									}}
										<span
											class="err-write-guide"
											data-guide={{this.guide.current}}
											style={{p.content}}
										>
											{{#if
												(eq
													this.guide.current
													"corners"
												)
											}}
												<i
												></i><i
												></i><i
												></i><i
												></i>
											{{/if}}
										</span>
									{{/unless}}
									{{#if
										(eq
											this.ruler.index
											p.page.index
										)
									}}
										<Ruler
											@axis="y"
											@page={{this.ruler}}
											@zoom={{this.zoom.current}}
										/>
									{{/if}}
									{{#if
										p.story
									}}
										<span
											class="err-write-dim"
											style={{p.story.dim}}
										></span>
										<span
											class="err-write-story"
											style={{p.story.edge}}
											data-story={{this.storyKind}}
										></span>
									{{/if}}
									{{#each
										p.veils
										as |v|
									}}
										<span
											class="err-write-veil"
											style={{v}}
										></span>
									{{/each}}
									{{#each
										p.hits
										as |h|
									}}
										<span
											class="err-write-hit"
											style={{h}}
										></span>
									{{/each}}
									{{#each
										p.marks
										as |m|
									}}
										<span
											class="err-write-sel"
											style={{m}}
										></span>
									{{/each}}
									{{#if
										p.image
									}}
										<span
											class="err-write-image"
											style={{p.image}}
											data-image-frame
										>
											{{#each
												this.handles
												as |h|
											}}
												<span
													class="err-write-handle"
													data-handle={{h}}
												></span>
											{{/each}}
										</span>
									{{/if}}
									{{#if
										(eq
											this.selectionBar.page
											p.page.index
										)
									}}
										<SelectionBar
											@style={{this.selectionBar.style}}
										/>
									{{/if}}
									{{#if
										(eq
											this.tocCard.page
											p.page.index
										)
									}}
										<TocCard
											@style={{this.tocCard.style}}
										/>
									{{/if}}
									{{#each
										p.flags
										key="key"
										as |f|
									}}
										<button
											type="button"
											class="err-edge err-flag
												{{if
													f.current
													'is-current'
												}}
												{{if
													f.current
													(if
														this.drawerOpen
														'is-open'
													)
												}}"
											style={{f.style}}
											data-tone={{f.tone}}
											data-flag={{f.block}}
											data-flag-kind={{f.kind}}
											data-flag-current={{f.current}}
											{{on
												"click"
												(fn
													this.pickFlag
													f
												)
											}}
											{{isolate}}
										>{{f.label}}{{#if
												f.info
											}}<span
													class="err-flag-info"
												>{{f.info}}</span>{{/if}}</button>
									{{/each}}
									{{#let
										(drawerOf
											p.flags
										)
										as |style|
									}}
										{{#if
											style
										}}
											<ParaDrawer
												@style={{style}}
												@open={{this.drawerOpen}}
											/>
										{{/if}}
									{{/let}}
									{{#if
										p.edge
									}}
										<InsertFlag
											@style={{p.edge}}
											@open={{this.insertOpen}}
											@onToggle={{this.toggleInsert}}
											@onImage={{this.pickImage}}
										/>
									{{/if}}
									{{#if
										p.caret
									}}
										<span
											class="err-write-caret"
											style={{p.caret}}
											{{this.follow
												p.caret
												p.page.index
											}}
										></span>
									{{/if}}
								{{/if}}
							</div>
						{{/each}}
					</div>
				</div>
				{{#if this.mirror}}
					<div
						class="dt-sr-only"
						role="document"
						aria-label={{this.mirror.label}}
						aria-hidden="false"
						data-write-mirror
					>
						{{#each
							this.mirror.items
							key="key"
							as |m|
						}}
							{{#if (eq m.kind "h1")}}
								<h1
								>{{m.text}}</h1>
							{{else if
								(eq m.kind "h2")
							}}
								<h2
								>{{m.text}}</h2>
							{{else if
								(eq m.kind "h3")
							}}
								<h3
								>{{m.text}}</h3>
							{{else if
								(eq m.kind "ul")
							}}
								<ul>
									{{#each
										m.items
										as |t|
									}}
										<li
										>{{t}}</li>
									{{/each}}
								</ul>
							{{else if
								(eq m.kind "ol")
							}}
								<ol>
									{{#each
										m.items
										as |t|
									}}
										<li
										>{{t}}</li>
									{{/each}}
								</ol>
							{{else if
								(eq
									m.kind
									"table"
								)
							}}
								<table>
									<tbody>
										{{#each
											m.rows
											as |r|
										}}
											<tr
											>
												{{#each
													r
													as |c|
												}}
													<td
													>{{c}}</td>
												{{/each}}
											</tr>
										{{/each}}
									</tbody>
								</table>
							{{else}}
								<p
								>{{m.text}}</p>
							{{/if}}
						{{/each}}
					</div>
				{{/if}}
			{{else if this.fontsFailed}}
				<div class="sub-ed-note-slot">
					<span
						class="sub-ed-note err-open-failed"
						role="status"
					>Open failed</span>
				</div>
			{{else}}
				<div class="err-opening"><CanonLoader /></div>
			{{/if}}
		</div>
	</template>
}
