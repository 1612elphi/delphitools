import { clamp } from 'delphicanon/lib/number';
import { formatNumeral, type NumeralStyle } from 'delphitools-v2/lib/pdf-stamp';
import type { Hyphenator } from 'delphitools-v2/lib/errata/write/hyphenate';
import {
	FIELD_CHAR,
	SOFT_HYPHEN,
	type CellBox,
	type FieldKind,
	type FloatBox,
	type ImageFloat,
	type ImageRef,
	type Wrap,
	type Layout,
	type Line,
	type Metrics,
	type PageBreak,
	type NumberStyle,
	type PageBox,
	type Paragraph,
	type ParaBox,
	type ResolvedChar,
	type ResolvedPara,
	type Run,
	type Setup,
	type Span,
	type Table,
	type TableCell,
	type Toc,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';
import { fit } from 'delphitools-v2/lib/errata/write/image';
import {
	captionOf,
	charLen,
	emptyPara,
	isHeading,
	noteRefs,
	contentsOf,
	parasOf,
	storyParas,
	storyPart,
	type OutlineEntry,
	type RefAt,
} from 'delphitools-v2/lib/errata/write/model';

/** Font line height and ascent in em of the font size. */
export const LINE_HEIGHT = 1.2;
export const ASCENT = 0.9;
/** List indent per level and first-line hang, in pt. */
export const LIST_STEP = 18;
/** Space between a paragraph border and its text. */
export const BORDER_PAD = 2;
export const DEFAULT_GUTTER = 36;
/** Largest distance of a header or footer from the page edge. */
export const STORY_GAP = 36;
/** Space between a table cell's edge and its text. */
export const CELL_PAD_X = 4;
export const CELL_PAD_Y = 2;
const SCRIPT_SCALE = 0.65;
const RISE = { super: 0.35, sub: -0.15 };
const BULLETS = ['•', '–', '·'];
const BREAK_AFTER = ' -–—';
const EPSILON = 1e-6;
const CACHE_KEYS = 256;
// keep-with-next chain
const KEEP_DEPTH = 3;
const BALANCE_STEPS = 12;
// passes for NUMPAGES, contents
const MAX_PASSES = 4;
// story to body gap
const STORY_SPACE = 6;
/** Narrowest text beside a square float; narrower moves below it. */
export const MIN_WRAP = 36;
/** Space between a floating image and its caption. */
export const CAPTION_GAP = 4;
const FIGURE: Record<string, string> = { en: 'Figure', de: 'Abbildung' };
/** Band above notes holding the separator rule. */
export const NOTE_RULE = 9;
const RULE_W = 0.5;
// space before the endnotes
const ENDNOTE_SPACE = 12;
// leader and number room
const TOC_NUM = 36;
const TOC_GAP = 2;
const LETTER = /\p{L}/u;

const NUMERALS: Record<NumberStyle, NumeralStyle> = {
	decimal: 'arabic',
	roman: 'roman-lower',
	ROMAN: 'roman-upper',
	alpha: 'alpha-lower',
};

/** Page numbering styles, in menu order. */
export const NUMBER_STYLES = Object.keys(NUMERALS) as NumberStyle[];

/** A page number written in a numbering style. */
export const numberLabel = (n: number, style: NumberStyle = 'decimal') =>
	formatNumeral(n, NUMERALS[style]);

export interface Resolver {
	char(p: Paragraph, run: Run): ResolvedChar;
	para(p: Paragraph): ResolvedPara;
}

/** Field values on one page. */
export type FieldValues = Record<FieldKind, string>;

interface Glyphs {
	text: string;
	// low surrogate width 0
	w: number[];
	file: string[];
	run: number[];
	chars: ResolvedChar[];
	/** field value by offset */
	shown: ({ text: string; ws: number[] } | undefined)[];
	/** inline image, by offset */
	img: (ImageRef | undefined)[];
	/** float anchor, by offset */
	anchor: (true | undefined)[];
}

const scaled = (c: ResolvedChar) => (c.script ? c.size * SCRIPT_SCALE : c.size);

function measure(
	p: Paragraph,
	metrics: Metrics,
	resolve: Resolver,
	fields: FieldValues | undefined,
	figures: string[] | undefined,
	notes: string[] | undefined,
	floats: boolean,
	fitW: number,
	fitH: number,
): Glyphs {
	const g: Glyphs = {
		text: '',
		w: [],
		file: [],
		run: [],
		chars: [],
		shown: [],
		img: [],
		anchor: [],
	};
	let figure = 0;
	let note = 0;
	p.runs.forEach((run, ri) => {
		const own = resolve.char(p, run);
		// references are superscript
		const c: ResolvedChar = run.props.note
			? { ...own, script: 'super' }
			: own;
		const size = scaled(c);
		g.chars.push(c);
		for (const ch of run.text) {
			const pick = metrics.pick(c.font, c.bold, c.italic, ch);
			const kind =
				ch === FIELD_CHAR ? run.props.field : undefined;
			const field =
				ch === FIELD_CHAR && run.props.note
					? (notes?.[note++] ?? '')
					: kind === 'figure'
						? (figures?.[figure++] ?? '')
						: kind &&
							(fields?.[kind] ?? '');
			let file = pick.file;
			const image =
				ch === FIELD_CHAR ? run.props.image : undefined;
			if (image && floats && image.float) {
				g.anchor[g.w.length] = true;
				g.w.push(0);
			} else if (image) {
				const descent = c.size * (LINE_HEIGHT - ASCENT);
				const { w, h } = fit(
					image.w,
					image.h,
					fitW,
					Math.max(1, fitH - descent),
				);
				g.img[g.w.length] =
					w === image.w
						? image
						: { ...image, w, h };
				g.w.push(w);
			} else if (field !== undefined) {
				const ws: number[] = [];
				let first: string | undefined;
				for (const f of field) {
					const fp = metrics.pick(
						c.font,
						c.bold,
						c.italic,
						f,
					);
					first ??= fp.file;
					ws.push(fp.advance * size);
					if (f.length > 1) ws.push(0);
				}
				// drawn as the value
				file = first ?? file;
				g.shown[g.w.length] = { text: field, ws };
				g.w.push(ws.reduce((a, b) => a + b, 0));
			} else
				for (let u = 0; u < ch.length; u++)
					g.w.push(
						u || ch === SOFT_HYPHEN
							? 0
							: pick.advance * size,
					);
			for (let u = 0; u < ch.length; u++) {
				g.file.push(file);
				g.run.push(ri);
			}
		}
		g.text += run.text;
	});
	return g;
}

const isWordChar = (c: string | undefined) =>
	c !== undefined && (c === SOFT_HYPHEN || LETTER.test(c));

interface Break {
	end: number;
	hyphen: boolean;
}

// hyphen point before i
function hyphenBreak(
	g: Glyphs,
	s: number,
	i: number,
	xAtI: number,
	width: number,
	hyph: Hyphenator | null,
	hyphenW: (at: number) => number,
): number {
	let ws = i;
	while (ws > s && isWordChar(g.text[ws - 1])) ws--;
	let we = i;
	while (we < g.text.length && isWordChar(g.text[we])) we++;
	const word = g.text.slice(ws, we);
	let points: number[];
	if (word.includes(SOFT_HYPHEN)) {
		points = [];
		for (let k = 0; k < word.length; k++)
			if (word[k] === SOFT_HYPHEN) points.push(k + 1);
	} else points = hyph ? hyph(word) : [];
	let x = xAtI;
	let at = i;
	for (let k = points.length - 1; k >= 0; k--) {
		const p = ws + points[k]!;
		if (p > i || p <= s) continue;
		while (at > p) x -= g.w[--at]!;
		if (x + hyphenW(p - 1) <= width + EPSILON) return p;
	}
	return -1;
}

function breakLine(
	g: Glyphs,
	s: number,
	width: number,
	hyph: Hyphenator | null,
	hyphenW: (at: number) => number,
): Break {
	let x = 0;
	let brk = -1;
	for (let i = s; i < g.text.length;) {
		const c = g.text[i]!;
		// images break like words
		if (g.img[i] && i > s) brk = i;
		if (c !== ' ' && i > s && x + g.w[i]! > width + EPSILON) {
			const h = hyphenBreak(
				g,
				Math.max(s, brk),
				i,
				x,
				width,
				hyph,
				hyphenW,
			);
			if (h > 0) return { end: h, hyphen: true };
			return { end: brk > s ? brk : i, hyphen: false };
		}
		x += g.w[i]!;
		const image = g.img[i];
		i += charLen(g.text, i);
		if (image || BREAK_AFTER.includes(c)) brk = i;
	}
	return { end: g.text.length, hyphen: false };
}

function span(
	text: string,
	start: number,
	file: string,
	char: ResolvedChar,
): Span {
	return {
		text,
		start,
		xs: [],
		file,
		size: scaled(char),
		rise: char.script ? RISE[char.script] * char.size : 0,
		char,
	};
}

function markerSpan(
	text: string,
	x: number,
	char: ResolvedChar,
	metrics: Metrics,
): Span {
	const c = { ...char, script: undefined };
	const picks = [...text].map((ch) =>
		metrics.pick(c.font, c.bold, c.italic, ch),
	);
	const s = span(text, 0, picks[0]!.file, c);
	for (const pick of picks) {
		s.xs.push(x);
		x += pick.advance * c.size;
	}
	s.xs.push(x);
	return s;
}

function lineSpans(
	g: Glyphs,
	s: number,
	end: number,
	x: number,
	extra: number,
	visEnd: number,
): Span[] {
	const spans: Span[] = [];
	let cur: Span | undefined;
	for (let i = s; i < end; i++) {
		const field = g.shown[i];
		const own = field ?? g.img[i] ?? g.anchor[i];
		if (
			!cur ||
			own ||
			g.shown[i - 1] ||
			g.img[i - 1] ||
			g.anchor[i - 1] ||
			g.file[i] !== cur.file ||
			g.run[i] !== g.run[i - 1]
		) {
			cur?.xs.push(x);
			cur = span('', i, g.file[i]!, g.chars[g.run[i]!]!);
			const image = g.img[i];
			if (image) cur.image = image;
			if (g.anchor[i]) cur.anchor = true;
			spans.push(cur);
		}
		if (field) {
			cur.shown = field.text;
			cur.shownXs = [x];
			let fx = x;
			for (const w of field.ws) cur.shownXs.push((fx += w));
		}
		cur.text += g.text[i];
		cur.xs.push(x);
		x += g.w[i]!;
		if (extra && i < visEnd && g.text[i] === ' ') x += extra;
	}
	cur?.xs.push(x);
	return spans;
}

// relative to paragraph top
interface ParaLine {
	start: number;
	end: number;
	height: number;
	ascent: number;
	// line spacing centring
	pad: number;
	left: number;
	width: number;
	spans: Span[];
	marker?: Span;
	hyphen?: Span;
	/** float clearance above */
	skip?: number;
}

interface Measured {
	metrics: Metrics;
	resolve: Resolver;
	hyph: Hyphenator | null;
	lines: Map<string, ParaLine[]>;
	// last measure, by fields
	glyphs?: { key: string; g: Glyphs };
}

const measured = new WeakMap<Paragraph, Measured>();

const BODY = emptyPara();
// shared for page equality
const NO_SPANS: Span[] = [];

const kindsByPara = new WeakMap<Paragraph, FieldKind[]>();

function fieldKinds(p: Paragraph): FieldKind[] {
	let kinds = kindsByPara.get(p);
	if (!kinds) {
		kinds = [
			...new Set(p.runs.flatMap((r) => r.props.field ?? [])),
		];
		kindsByPara.set(p, kinds);
	}
	return kinds;
}

const paraIndent = (para: ResolvedPara) =>
	para.list ? (para.list.level + 1) * LIST_STEP : para.indent;

/** y relative to paragraph */
interface Wrapper {
	/** cache key of floats */
	key: string;
	slot(
		y: number,
		h: number,
		left: number,
		right: number,
	): { y: number; left: number; right: number };
}

interface LineOpts {
	/** offset when resumed */
	from?: number;
	wrap?: Wrapper;
	/** body only; else inline */
	floats?: boolean;
	/** inline image height cap */
	maxH?: number;
}

function paraLines(
	block: Paragraph,
	para: ResolvedPara,
	marker: string | undefined,
	boxW: number,
	marginLeft: number,
	pass: Pass,
	fields: FieldValues,
	opts: LineOpts = {},
): ParaLine[] {
	const { metrics, resolve } = pass;
	const { from = 0, wrap, floats = false, maxH = Infinity } = opts;
	const hyph =
		para.align === 'left' || para.align === 'justify'
			? pass.hyph
			: null;
	const kinds = fieldKinds(block);
	if (kinds.includes('pages')) pass.usesTotal = true;
	const figures = kinds.includes('figure')
		? pass.figures.get(block)
		: undefined;
	const notes = noteRefs(block).length
		? pass.noteLabels.get(block)
		: undefined;
	const indent = paraIndent(para);
	const firstLine = para.list ? 0 : para.firstLine;
	const fitW = boxW - indent - Math.max(0, firstLine);
	let fkey = floats ? 'f' : '';
	if (block.runs.some((r) => r.props.image)) fkey += `|${fitW}|${maxH}`;
	for (const k of kinds)
		fkey += `|${k === 'figure' ? figures?.join() : fields[k]}`;
	// ponytail: renumbering misses later caches
	if (notes) fkey += `|n${notes.join()}`;
	let key = `${from}|${boxW}|${marginLeft}|${marker ?? ''}|${fkey}`;
	if (wrap) key += `|${wrap.key}`;
	let hit = measured.get(block);
	if (
		hit?.metrics !== metrics ||
		hit.resolve !== resolve ||
		hit.hyph !== hyph
	) {
		hit = { metrics, resolve, hyph, lines: new Map() };
		measured.set(block, hit);
	}
	const cached = hit.lines.get(key);
	if (cached) return cached;
	if (hit.glyphs?.key !== fkey)
		hit.glyphs = {
			key: fkey,
			g: measure(
				block,
				metrics,
				resolve,
				kinds.length ? fields : undefined,
				figures,
				notes,
				floats,
				fitW,
				maxH,
			),
		};
	const g = hit.glyphs.g;
	const hyphenW = (at: number) => {
		const c = g.chars[g.run[at]!]!;
		return (
			metrics.pick(c.font, c.bold, c.italic, '-').advance *
			scaled(c)
		);
	};
	const n = g.text.length;

	const build = (s: number, left: number, width: number): ParaLine => {
		const { end, hyphen } = breakLine(g, s, width, hyph, hyphenW);
		let size = s === end ? g.chars[0]!.size : 0;
		let imgH = 0;
		for (let i = s; i < end; i++) {
			size = Math.max(size, g.chars[g.run[i]!]!.size);
			const image = g.img[i];
			if (image) imgH = Math.max(imgH, image.h);
		}
		// images on baseline
		const ascent = Math.max(size * ASCENT, imgH);
		const natural = ascent + size * (LINE_HEIGHT - ASCENT);
		const textH = size * LINE_HEIGHT * para.lineSpacing;
		const height = imgH ? Math.max(textH, natural) : textH;

		let visEnd = end;
		while (visEnd > s && g.text[visEnd - 1] === ' ') visEnd--;
		let natW = hyphen ? hyphenW(end - 1) : 0;
		let spaces = 0;
		for (let i = s; i < visEnd; i++) {
			natW += g.w[i]!;
			if (g.text[i] === ' ') spaces++;
		}
		const free = Math.max(0, width - natW);
		let x = left;
		let extra = 0;
		if (para.align === 'centre') x += free / 2;
		else if (para.align === 'right') x += free;
		else if (para.align === 'justify' && end < n && spaces)
			extra = free / spaces;

		const spans = lineSpans(g, s, end, x, extra, visEnd);
		// aligned caret on empty
		if (!n) {
			const c = g.chars[0]!;
			const file = metrics.pick(
				c.font,
				c.bold,
				c.italic,
				' ',
			).file;
			spans.push({ ...span('', 0, file, c), xs: [x] });
		}
		const line: ParaLine = {
			start: s,
			end,
			height,
			ascent,
			pad: (height - natural) / 2,
			left,
			width,
			spans,
		};
		if (marker && !s)
			line.marker = markerSpan(
				marker,
				left - LIST_STEP,
				g.chars[0]!,
				metrics,
			);
		if (hyphen) {
			const c = g.chars[g.run[end - 1]!]!;
			const hx = spans.at(-1)?.xs.at(-1) ?? x;
			line.hyphen = {
				...span('-', end, g.file[end - 1]!, c),
				file: metrics.pick(
					c.font,
					c.bold,
					c.italic,
					'-',
				).file,
				xs: [hx, hx + hyphenW(end - 1)],
			};
		}
		return line;
	};

	const lines: ParaLine[] = [];
	let s = from;
	let y = 0;
	do {
		const lead = indent + (s ? 0 : firstLine);
		const left = marginLeft + lead;
		const right = marginLeft + boxW;
		let line = build(s, left, right - left);
		if (wrap) {
			let h = line.height;
			for (let tries = 0; tries < 3; tries++) {
				const r = wrap.slot(y, h, left, right);
				line = build(s, r.left, r.right - r.left);
				if (r.y > y) line.skip = r.y - y;
				if (line.height <= h + EPSILON) break;
				h = line.height;
			}
		}
		y += (line.skip ?? 0) + line.height;
		lines.push(line);
		s = line.end;
	} while (s < n);
	// oldest key first
	if (hit.lines.size >= CACHE_KEYS)
		hit.lines.delete(hit.lines.keys().next().value!);
	hit.lines.set(key, lines);
	return lines;
}

interface Env {
	metrics: Metrics;
	resolve: Resolver;
	hyph: Hyphenator | null;
}

interface ParaItem {
	kind: 'para';
	bi: number;
	block: Paragraph;
	para: ResolvedPara;
	marker?: string;
	before: number;
	after: number;
	// group end padding
	padTop: number;
	padBottom: number;
	keepNext: boolean;
	widow: boolean;
	/** float caption in box */
	boxed?: boolean;
	/** endnote: bi note-relative */
	note?: string;
	/** endnote separator above */
	rule?: boolean;
}

type BreakItem =
	| { kind: PageBreak['kind']; bi: number }
	| { kind: 'section'; bi: number; setup: Setup };

interface TableItem {
	kind: 'table';
	bi: number;
	table: Table;
}

interface TocItem {
	kind: 'toc';
	bi: number;
	toc: Toc;
}

type Item = ParaItem | BreakItem | TableItem | TocItem;

/** footnote split remainder */
interface NoteCarry {
	id: string;
	from: number;
	fields: FieldValues;
}

interface Cursor {
	item: number;
	/** table row, toc entry */
	row: number;
	/** footnotes for next column */
	carry?: NoteCarry[];
	/** placed lines per cell */
	part?: number[];
	/** paragraph resume offset */
	at?: number;
}

interface Section {
	setup: Setup;
	cols: PageBox['cols'];
	colW: number;
	ordinal: number;
	start: number;
}

interface Pass extends Env {
	doc: WriteDoc;
	pages: PageBox[];
	fields: WeakMap<PageBox, FieldValues>;
	date: string;
	usesTotal: boolean;
	bodySize: number;
	breakH: number;
	counts: number[];
	kinds: string[];
	number: number;
	decor: Map<number, { key: string; para: ResolvedPara }>;
	figures: Map<Paragraph, string[]>;
	/** note number by id */
	noteLabel: Map<string, string>;
	noteLabels: Map<Paragraph, string[]>;
	endnotes: string[];
	toc: boolean;
	/** last pass's values */
	feed: Feedback;
	/** labels by paragraph id */
	labels: Map<string, string>;
}

/** values from previous pass */
interface Feedback {
	total: string;
	labels: Map<string, string>;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** The created date in the document language. */
export function fieldDate(iso: string | undefined, lang = 'en'): string {
	const t = iso ? Date.parse(iso) : NaN;
	if (!Number.isFinite(t)) return '';
	const locale = lang === 'de' ? 'de-DE' : 'en-GB';
	let f = dateFormats.get(locale);
	if (!f) {
		f = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });
		dateFormats.set(locale, f);
	}
	return f.format(t);
}

function markerFor(
	{ counts, kinds }: { counts: number[]; kinds: string[] },
	para: ResolvedPara,
): string | undefined {
	const list = para.list;
	if (!list) {
		counts.length = kinds.length = 0;
		return undefined;
	}
	const l = list.level;
	if (kinds[l] !== list.kind) counts[l] = 0;
	counts[l] = (counts[l] ?? 0) + 1;
	kinds[l] = list.kind;
	counts.length = kinds.length = l + 1;
	return list.kind === 'bullet'
		? BULLETS[l % BULLETS.length]
		: `${counts[l]}.`;
}

function decorKey(para: ResolvedPara): string | undefined {
	if (!para.border && !para.shading) return undefined;
	return JSON.stringify([para.border, para.shading, paraIndent(para)]);
}

function toLine(bi: number, pl: ParaLine, y: number): Line {
	const line: Line = {
		block: bi,
		start: pl.start,
		end: pl.end,
		top: y,
		baseline: y + pl.ascent + pl.pad,
		height: pl.height,
		left: pl.left,
		width: pl.width,
		spans: pl.spans,
	};
	if (pl.marker) line.marker = pl.marker;
	if (pl.hyphen) line.hyphen = pl.hyphen;
	if (pl.skip) line.skip = pl.skip;
	return line;
}

function linesFor(
	pass: Pass,
	sec: Section,
	it: ParaItem,
	left: number,
	page: PageBox,
	from?: number,
	wrap?: Wrapper,
): ParaLine[] {
	return paraLines(
		it.block,
		it.para,
		it.marker,
		sec.colW,
		left,
		pass,
		pass.fields.get(page)!,
		{ from, wrap, floats: !it.note, maxH: page.content.height },
	);
}

const floatsByPara = new WeakMap<
	Paragraph,
	{ offset: number; image: ImageRef }[]
>();

function floatsIn(p: Paragraph): { offset: number; image: ImageRef }[] {
	let out = floatsByPara.get(p);
	if (!out) {
		out = [];
		let pos = 0;
		for (const r of p.runs) {
			const image = r.props.image;
			if (image?.float)
				for (let i = 0; i < r.text.length; i++)
					if (r.text[i] === FIELD_CHAR)
						out.push({
							offset: pos + i,
							image,
						});
			pos += r.text.length;
		}
		floatsByPara.set(p, out);
	}
	return out;
}

const wraps = (f: FloatBox) =>
	f.image.float!.wrap === 'square' ||
	f.image.float!.wrap === 'top-bottom';

// null pushes text below
function pickSide(
	beside: [number, number][],
	wrap: Wrap,
	side: ImageFloat['side'],
): [number, number] | null {
	const [a, b] = beside as [[number, number], [number, number]];
	if (wrap === 'top-bottom') return null;
	if (side === 'left') return a;
	if (side === 'right') return b;
	return a[1] - a[0] >= b[1] - b[0] ? a : b;
}

// keyed relative to y0
function wrapper(fs: FloatBox[], y0: number): Wrapper {
	return {
		key: fs
			.map((f) => {
				const { wrap, side, distance } = f.image.float!;
				return `${f.x},${f.y - y0},${f.w},${f.boxH},${wrap},${side},${distance}`;
			})
			.join(';'),
		slot(y, h, left, right) {
			let top = y0 + y;
			for (let guard = 0; guard <= fs.length; guard++) {
				let l = left;
				let r = right;
				let below = Infinity;
				for (const f of fs) {
					const {
						wrap,
						side,
						distance: d,
					} = f.image.float!;
					const fb = f.y + f.boxH + d;
					if (
						top + h <= f.y - d + EPSILON ||
						top >= fb - EPSILON
					)
						continue;
					const pick = pickSide(
						[
							[
								l,
								Math.min(
									r,
									f.x - d,
								),
							],
							[
								Math.max(
									l,
									f.x +
										f.w +
										d,
								),
								r,
							],
						],
						wrap,
						side,
					);
					if (
						pick &&
						pick[1] - pick[0] >= MIN_WRAP
					)
						[l, r] = pick;
					else below = Math.min(below, fb);
				}
				if (below === Infinity)
					return {
						y: top - y0,
						left: l,
						right: r,
					};
				top = below;
			}
			return { y: top - y0, left, right };
		},
	};
}

// floats meeting y0..y1
const overlapping = (floats: FloatBox[], y0: number, y1: number) =>
	floats.filter((f) => {
		const d = f.image.float!.distance;
		return wraps(f) && f.y + f.boxH + d > y0 && f.y - d < y1;
	});

const extent = (lines: ParaLine[]) =>
	lines.reduce((h, l) => h + (l.skip ?? 0) + l.height, 0);

interface FloatPlaced {
	box: FloatBox;
	caption?: Line[];
}

// in column, below y0
function placeFloat(
	pass: Pass,
	sec: Section,
	it: ParaItem,
	f: { offset: number; image: ImageRef },
	cap: Paragraph | null,
	c: number,
	y0: number,
	top: number,
	bottom: number,
	page: PageBox,
	force: boolean,
): FloatPlaced | null {
	const col = sec.cols[c]!;
	const fl = f.image.float!;
	const room = Math.max(1, bottom - top);
	let w = Math.min(f.image.w, sec.colW);
	let h = (f.image.h * w) / f.image.w;
	const capLines = (width: number, x: number) =>
		cap
			? paraLines(
					cap,
					pass.resolve.para(cap),
					undefined,
					width,
					x,
					pass,
					pass.fields.get(page)!,
				)
			: [];
	const heightOf = (ls: ParaLine[]) =>
		ls.reduce((a, l) => a + l.height, ls.length ? CAPTION_GAP : 0);
	const xAt = (width: number) =>
		col.left + clamp(fl.x, 0, Math.max(0, sec.colW - width));
	let x = xAt(w);
	let lines = capLines(w, x);
	let capH = heightOf(lines);
	if (h + capH > room) {
		const k = Math.max(1, room - capH) / h;
		w *= k;
		h *= k;
		x = xAt(w);
		lines = capLines(w, x);
		capH = heightOf(lines);
	}
	const boxH = h + capH;
	let y = Math.min(y0 + fl.y, bottom - boxH);
	if (y < y0 - EPSILON) {
		if (!force) return null;
		y = Math.max(top, y);
	}
	const box: FloatBox = {
		block: it.bi,
		offset: f.offset,
		image: f.image,
		x,
		y,
		w,
		h,
		boxH,
		col: c,
	};
	if (!cap) return { box };
	let ly = y + h + CAPTION_GAP;
	return {
		box,
		caption: lines.map((pl) => {
			const line = toLine(it.bi + 1, pl, ly);
			line.col = c;
			ly += pl.height;
			return line;
		}),
	};
}

// space next paragraph needs
function keepNeed(
	items: Item[],
	i: number,
	linesOf: (it: ParaItem) => ParaLine[],
	footH: (p: Paragraph, end: number) => number,
	rule: number,
): number {
	let h = 0;
	let notes = 0;
	for (let depth = 0; ; depth++) {
		const it = items[i + depth];
		const nx = items[i + depth + 1];
		if (it?.kind !== 'para' || nx?.kind !== 'para') break;
		h += it.after + it.padBottom + nx.before + nx.padTop;
		if (nx.boxed) break;
		const lines = linesOf(nx);
		const chain = nx.keepNext && depth < KEEP_DEPTH;
		const m = chain ? lines.length : nx.widow ? 2 : 1;
		const counted = lines.slice(0, m);
		for (const l of counted) h += l.height;
		notes += footH(nx.block, counted.at(-1)!.end);
		if (!chain) break;
	}
	return notes ? h + notes + rule : h;
}

const footsByPara = new WeakMap<Paragraph, RefAt[]>();

// footnote references only
function footRefs(p: Paragraph): RefAt[] {
	const all = noteRefs(p);
	if (!all.length) return all;
	let out = footsByPara.get(p);
	if (!out) {
		out = all.filter((r) => r.ref.kind === 'foot');
		footsByPara.set(p, out);
	}
	return out;
}

const NO_REFS: RefAt[] = [];

// consumes refs before end
function refWalk(refs: RefAt[], from: number): (end: number) => RefAt[] {
	let i = 0;
	while (i < refs.length && refs[i]!.offset < from) i++;
	return (end) => {
		const a = i;
		while (i < refs.length && refs[i]!.offset < end) i++;
		return a === i ? NO_REFS : refs.slice(a, i);
	};
}

// separator band at y
function noteRule(page: PageBox, x: number, y: number, colW: number) {
	page.boxes.push({
		x,
		y: y + (NOTE_RULE - RULE_W) / 2,
		w: colW / 3,
		h: RULE_W,
		fill: '#000000',
	});
}

interface Filled {
	lines: Line[];
	next: Cursor;
	brk: BreakItem | null;
}

function fill(
	pass: Pass,
	sec: Section,
	items: Item[],
	cur: Cursor,
	c: number,
	bottom: number,
	page: PageBox,
): Filled {
	const col = sec.cols[c]!;
	const top = page.content.top;
	const linesOf = (it: ParaItem) =>
		linesFor(pass, sec, it, col.left, page);
	const out: Line[] = [];
	// this column's floats
	const active: FloatBox[] = [];
	// this column's footnotes
	const slices: { id: string; st: Stacked; from: number; to: number }[] =
		[];
	let notesH = 0;
	let carry: NoteCarry[] | undefined;
	const pageFields = pass.fields.get(page)!;
	const stackOf = (id: string, fields = pageFields) =>
		noteStack(pass, id, col.left, sec.colW, fields);
	const footH = (p: Paragraph, end: number) => {
		let h = 0;
		for (const r of footRefs(p)) {
			if (r.offset >= end) break;
			h += stackOf(r.ref.id).h;
		}
		return h;
	};
	// rest carries over
	const place = (
		id: string,
		from: number,
		fields: FieldValues,
		y: number,
	) => {
		if (carry) {
			carry.push({ id, from, fields });
			return;
		}
		const st = stackOf(id, fields);
		const room = bottom - notesH - y;
		const sep = notesH ? 0 : NOTE_RULE;
		const base = st.lines[from]?.y ?? 0;
		let n = 0;
		for (; from + n < st.lines.length; n++) {
			const l = st.lines[from + n]!;
			if (
				sep + l.y - base + l.pl.height >
					room + EPSILON &&
				(n || slices.length || out.length)
			)
				break;
		}
		if (n) {
			const last = st.lines[from + n - 1]!;
			notesH += sep + last.y + last.pl.height - base;
			slices.push({ id, st, from, to: from + n });
		}
		if (from + n < st.lines.length)
			carry = [{ id, from: from + n, fields }];
	};
	const done = (r: Filled): Filled => {
		if (carry) r.next.carry = carry;
		else delete r.next.carry;
		let ny = bottom - notesH;
		if (slices.length) {
			noteRule(page, col.left, ny, sec.colW);
			ny += NOTE_RULE;
		}
		for (const { id, st, from, to } of slices) {
			const base = st.lines[from]!.y;
			for (let j = from; j < to; j++) {
				const l = st.lines[j]!;
				const line = toLine(
					l.bi,
					l.pl,
					ny + l.y - base,
				);
				line.col = c;
				line.note = id;
				r.lines.push(line);
			}
			const last = st.lines[to - 1]!;
			ny += last.y + last.pl.height - base;
		}
		return r;
	};
	for (const k of cur.carry ?? []) place(k.id, k.from, k.fields, top);
	// notes fill the column
	if (carry) return done({ lines: out, next: { ...cur }, brk: null });
	let y = top;
	let i = cur.item;
	let row = cur.row;
	let part = cur.part;
	let at = cur.at;
	while (i < items.length) {
		const it = items[i]!;
		const limit = bottom - notesH;
		if (it.kind === 'table' || it.kind === 'toc') {
			const r =
				it.kind === 'table'
					? fillTable(
							pass,
							sec,
							it,
							row,
							part,
							c,
							y,
							limit,
							page,
							!out.length,
						)
					: fillToc(
							pass,
							sec,
							it,
							row,
							c,
							y,
							limit,
							page,
							!out.length,
						);
			if (r.line) out.push(r.line);
			y = r.y;
			if (r.next)
				return done({
					lines: out,
					next: { item: i, ...r.next },
					brk: null,
				});
			i++;
			row = 0;
			part = undefined;
			at = undefined;
			continue;
		}
		if (it.kind !== 'para') {
			if (out.length && y + pass.breakH > limit + EPSILON)
				break;
			out.push({
				kind: 'break',
				block: it.bi,
				start: 0,
				end: 0,
				top: y,
				baseline:
					y +
					pass.bodySize * ASCENT +
					(pass.breakH -
						pass.bodySize * LINE_HEIGHT) /
						2,
				height: pass.breakH,
				left: col.left,
				width: col.width,
				spans: NO_SPANS,
				col: c,
			});
			return done({
				lines: out,
				next: { item: i + 1, row: 0 },
				brk: it,
			});
		}
		// drawn with its float
		if (it.boxed) {
			i++;
			at = undefined;
			continue;
		}
		const first = at === undefined;
		const before = first
			? (out.length ? it.before : 0) + it.padTop
			: 0;
		const y0 = y + before;
		const placed: FloatPlaced[] = [];
		let moved = false;
		if (first && !it.note) {
			const next = items[i + 1];
			let cap =
				next?.kind === 'para' && next.boxed
					? next.block
					: null;
			for (const f of floatsIn(it.block)) {
				const p = placeFloat(
					pass,
					sec,
					it,
					f,
					cap,
					c,
					y0,
					top,
					limit,
					page,
					!out.length,
				);
				if (!p) {
					moved = true;
					break;
				}
				placed.push(p);
				// first float owns it
				cap = null;
			}
		}
		// float moves column
		if (moved) break;
		const floats = placed.length
			? active.concat(placed.map((p) => p.box))
			: active;
		// unwrapped first keeps cache
		let lines = linesFor(pass, sec, it, col.left, page, at);
		let near = overlapping(floats, y0, y0 + extent(lines));
		for (let tries = 0; near.length && tries < 3; tries++) {
			lines = linesFor(
				pass,
				sec,
				it,
				col.left,
				page,
				at,
				wrapper(near, y0),
			);
			const more = overlapping(
				floats,
				y0,
				y0 + extent(lines),
			);
			if (more.length === near.length) break;
			near = more;
		}
		const refs = footRefs(it.block);
		const fitRefs = refWalk(refs, lines[0]!.start);
		// notes keep below floats
		const low = floats.reduce(
			(m, f) => (wraps(f) ? Math.max(m, f.y + f.boxH) : m),
			0,
		);
		const total = lines.length;
		let fit = 0;
		let end = y0;
		// fitted lines' notes
		let extra = 0;
		let split = false;
		let held = false;
		while (fit < total) {
			const l = lines[fit]!;
			const h = (l.skip ?? 0) + l.height;
			let need = 0;
			for (const r of fitRefs(l.end))
				need += stackOf(r.ref.id).h;
			if (need && !notesH && !extra) need += NOTE_RULE;
			if (
				Math.max(end + h, need ? low : 0) +
					extra +
					need <=
				limit + EPSILON
			) {
				end += h;
				extra += need;
				fit++;
				continue;
			}
			if (need && end + h + extra <= limit + EPSILON) {
				// a long note splits
				split =
					need > (bottom - top) / 2 ||
					(!out.length && !fit && !notesH);
				held = !split;
				if (split) {
					end += h;
					fit++;
				}
			}
			break;
		}
		let take = fit;
		if (split) {
			// the split line stays
		} else if (take < total) {
			if (it.widow) {
				if (total - take === 1 && take >= 2) take--;
				if (first && take === 1 && out.length) take = 0;
			}
		} else if (first && it.keepNext && out.length) {
			const need = keepNeed(
				items,
				i,
				linesOf,
				footH,
				notesH || extra ? 0 : NOTE_RULE,
			);
			const chain = it.padTop + end - y - before + need;
			// overlong chains break anyway
			if (
				end + need > limit - extra + EPSILON &&
				chain <= bottom - top + EPSILON
			)
				take = 0;
		}
		// float fills the column
		const full = !take && !out.length && !!lines[0]?.skip;
		if (!take && !out.length && !full && !held) take = 1;
		if (!take && !full) break;
		for (const p of placed) {
			page.floats.push(p.box);
			active.push(p.box);
		}
		y += before;
		if (it.rule) noteRule(page, col.left, y - NOTE_RULE, sec.colW);
		if (first && take && pass.toc && isHeading(it.block.style))
			pass.labels.set(it.block.id, page.label);
		for (let j = 0; j < take; j++) {
			const pl = lines[j]!;
			y += pl.skip ?? 0;
			const line = toLine(it.bi, pl, y);
			line.col = c;
			if (it.note) line.note = it.note;
			out.push(line);
			y += pl.height;
		}
		if (take)
			for (const r of refWalk(
				refs,
				lines[0]!.start,
			)(lines[take - 1]!.end))
				place(
					r.ref.id,
					0,
					pageFields,
					Math.max(y, low),
				);
		for (const p of placed) if (p.caption) out.push(...p.caption);
		if (take < total || carry)
			return done({
				lines: out,
				next:
					take < total
						? {
								item: i,
								row: 0,
								at: lines[take]!
									.start,
							}
						: { item: i + 1, row: 0 },
				brk: null,
			});
		y += it.after + it.padBottom;
		i++;
		at = undefined;
	}
	const next: Cursor = { item: i, row };
	if (at !== undefined) next.at = at;
	return done({ lines: out, next, brk: null });
}

interface NoteMemo extends Stacked {
	env: Env;
	x: number;
	w: number;
	label: string | undefined;
	kinds: FieldKind[];
	values: string[];
	total: boolean;
}

const noteMemos = new WeakMap<Paragraph[], NoteMemo>();
const NO_NOTE: Stacked = { lines: [], h: 0 };

// footnote text, number hanging
function noteStack(
	pass: Pass,
	id: string,
	left: number,
	width: number,
	fields: FieldValues,
): Stacked {
	const paras = pass.doc.notes?.[id];
	if (!paras) return NO_NOTE;
	const label = pass.noteLabel.get(id);
	const hit = noteMemos.get(paras);
	if (
		hit &&
		hit.x === left &&
		hit.w === width &&
		hit.label === label &&
		sameEnv(hit.env, pass) &&
		hit.kinds.every((k, i) => fields[k] === hit.values[i])
	) {
		if (hit.total) pass.usesTotal = true;
		return hit;
	}
	const kinds = [...new Set(paras.flatMap(fieldKinds))];
	const memo: NoteMemo = {
		lines: [],
		h: 0,
		env: {
			metrics: pass.metrics,
			resolve: pass.resolve,
			hyph: pass.hyph,
		},
		x: left,
		w: width,
		label,
		kinds,
		values: kinds.map((k) => fields[k]),
		total: kinds.includes('pages'),
	};
	let y = 0;
	paras.forEach((p, bi) => {
		const para = notePara(pass, p, bi);
		if (bi) y += para.spaceBefore;
		for (const pl of paraLines(
			p,
			para,
			bi ? undefined : label,
			width,
			left,
			pass,
			fields,
		)) {
			memo.lines.push({ bi, pl, y });
			y += pl.height;
		}
		if (bi < paras.length - 1) y += para.spaceAfter;
	});
	memo.h = y;
	noteMemos.set(paras, memo);
	return memo;
}

// number hangs first line
function notePara(pass: Pass, p: Paragraph, bi: number): ResolvedPara {
	const para = pass.resolve.para(p);
	return bi ? para : { ...para, list: undefined, firstLine: LIST_STEP };
}

const tocParas = new WeakMap<Paragraph, { level: number; p: Paragraph }>();

function tocPara(heading: Paragraph, e: OutlineEntry): Paragraph {
	let hit = tocParas.get(heading);
	if (hit?.level !== e.level) {
		hit = {
			level: e.level,
			p: {
				kind: 'para',
				id: heading.id,
				style: 'body',
				props: { indent: e.level * LIST_STEP },
				runs: [{ text: e.text, props: {} }],
				dir: 'ltr',
			},
		};
		tocParas.set(heading, hit);
	}
	return hit.p;
}

const tocLineMemo = new WeakMap<
	Paragraph,
	{ key: string; env: Env; lines: ParaLine[] }
>();

// lines, leader, page number
function tocLines(
	pass: Pass,
	e: OutlineEntry,
	left: number,
	width: number,
	page: PageBox,
): ParaLine[] {
	const heading = pass.doc.blocks[e.block] as Paragraph;
	const p = tocPara(heading, e);
	const label = pass.feed.labels.get(heading.id) ?? '';
	const key = `${left}|${width}|${label}`;
	const hit = tocLineMemo.get(p);
	if (hit?.key === key && sameEnv(hit.env, pass)) return hit.lines;
	const { metrics } = pass;
	const pls = paraLines(
		p,
		pass.resolve.para(p),
		undefined,
		Math.max(1, width - TOC_NUM),
		left,
		pass,
		pass.fields.get(page)!,
	);
	const char = pass.resolve.char(p, p.runs[0]!);
	const advance = (s: string) =>
		[...s].reduce(
			(w, ch) =>
				w +
				metrics.pick(
					char.font,
					char.bold,
					char.italic,
					ch,
				).advance *
					char.size,
			0,
		);
	const last = pls.at(-1)!;
	const spans = last.spans.slice();
	const numX = left + width - advance(label);
	const dot = advance('.');
	const x0 = (spans.at(-1)?.xs.at(-1) ?? last.left) + dot;
	const n = Math.floor((numX - dot - x0) / dot);
	if (n > 0)
		spans.push(
			markerSpan(
				'.'.repeat(n),
				numX - dot - n * dot,
				char,
				metrics,
			),
		);
	if (label) spans.push(markerSpan(label, numX, char, metrics));
	const lines = [...pls.slice(0, -1), { ...last, spans }];
	tocLineMemo.set(p, {
		key,
		env: { metrics, resolve: pass.resolve, hyph: pass.hyph },
		lines,
	});
	return lines;
}

function fillToc(
	pass: Pass,
	sec: Section,
	it: TocItem,
	start: number,
	c: number,
	y0: number,
	bottom: number,
	page: PageBox,
	fresh: boolean,
): { line?: Line; y: number; next?: Pick<Cursor, 'row'> } {
	const col = sec.cols[c]!;
	const entries = contentsOf(pass.doc, it.toc);
	let y = y0;
	let row = start;
	if (!entries.length) {
		if (!fresh && y + pass.breakH > bottom + EPSILON)
			return { y, next: { row } };
		y += pass.breakH;
	}
	for (; row < entries.length; row++) {
		const e = entries[row]!;
		const pls = tocLines(pass, e, col.left, sec.colW, page);
		const h = extent(pls) + TOC_GAP;
		if (y + h > bottom + EPSILON && (!fresh || row > start)) break;
		for (const pl of pls) {
			const line = toLine(e.block, pl, y);
			line.col = c;
			page.toc.push(line);
			y += pl.height;
		}
		y += TOC_GAP;
	}
	const next = row < entries.length ? { row } : undefined;
	if (y === y0) return { y, next };
	return {
		line: {
			kind: 'toc',
			block: it.bi,
			start: 0,
			end: 0,
			top: y0,
			baseline: y0,
			height: y - y0,
			left: col.left,
			width: sec.colW,
			spans: NO_SPANS,
			col: c,
		},
		y,
		next,
	};
}

interface Flowed {
	cur: Cursor;
	// break ending the page
	brk: BreakItem | null;
	columnBreak: boolean;
}

function flowPage(
	pass: Pass,
	sec: Section,
	items: Item[],
	start: Cursor,
	page: PageBox,
	bottom: number,
): Flowed {
	page.lines = [];
	page.boxes = [];
	page.cells = [];
	page.floats = [];
	page.notes = [];
	page.toc = [];
	let cur = start;
	let columnBreak = false;
	for (let c = 0; c < sec.cols.length; c++) {
		const r = fill(pass, sec, items, cur, c, bottom, page);
		for (const l of r.lines)
			(l.note === undefined ? page.lines : page.notes).push(
				l,
			);
		cur = r.next;
		if (r.brk?.kind === 'column') columnBreak = true;
		else if (r.brk) return { cur, brk: r.brk, columnBreak };
		if (cur.item >= items.length && !cur.carry) break;
	}
	return { cur, brk: null, columnBreak };
}

const sectionEnds = (r: Flowed, items: Item[]) =>
	r.brk?.kind === 'section' || (!r.brk && r.cur.item >= items.length);

// shortest columns holding rest
function balance(
	pass: Pass,
	sec: Section,
	items: Item[],
	start: Cursor,
	page: PageBox,
) {
	const { top, height } = page.content;
	// page holds full flow
	const bottoms = sec.cols.map(() => top);
	let tallest = 0;
	for (const l of page.lines) {
		const c = l.col ?? 0;
		bottoms[c] = Math.max(bottoms[c]!, l.top + l.height);
		tallest = Math.max(tallest, l.height);
	}
	// shorter shrinks a float
	let lo = 0;
	for (const f of page.floats) {
		bottoms[f.col] = Math.max(bottoms[f.col]!, f.y + f.boxH);
		lo = Math.max(lo, f.boxH);
	}
	const sum = bottoms.reduce((a, b) => a + b - top, 0);
	const fits = (h: number) =>
		sectionEnds(
			flowPage(pass, sec, items, start, page, top + h),
			items,
		);
	let hi = Math.min(
		height,
		Math.max(lo, sum / sec.cols.length + tallest),
	);
	if (!fits(hi)) {
		lo = hi;
		hi = height;
	}
	for (let step = 0; step < BALANCE_STEPS && hi - lo >= 0.5; step++) {
		const mid = (lo + hi) / 2;
		if (fits(mid)) hi = mid;
		else lo = mid;
	}
	flowPage(pass, sec, items, start, page, top + hi);
}

interface Placed {
	bi: number;
	pl: ParaLine;
	y: number;
}

interface Decor {
	key: string;
	para: ResolvedPara;
}

interface Stacked {
	lines: Placed[];
	h: number;
	// by paragraph
	decor?: (Decor | undefined)[];
}

// stacked like a story
function stack(
	pass: Pass,
	paras: Paragraph[],
	width: number,
	left: number,
	fields: FieldValues,
): Stacked {
	const counts: number[] = [];
	const kinds: string[] = [];
	const out: Stacked = { lines: [], h: 0 };
	let y = 0;
	paras.forEach((p, bi) => {
		const para = pass.resolve.para(p);
		const marker = markerFor({ counts, kinds }, para);
		const key = decorKey(para);
		if (key) (out.decor ??= [])[bi] = { key, para };
		const pls = paraLines(
			p,
			para,
			marker,
			width,
			left,
			pass,
			fields,
		);
		if (out.lines.length) y += para.spaceBefore;
		for (const pl of pls) {
			out.lines.push({ bi, pl, y });
			y += pl.height;
		}
		if (bi < paras.length - 1) y += para.spaceAfter;
	});
	out.h = y;
	return out;
}

interface CellMemo extends Stacked {
	env: Env;
	x: number;
	w: number;
	kinds: FieldKind[];
	// laid-out kind values
	values: string[];
	total: boolean;
}

const cellMemos = new WeakMap<TableCell, CellMemo>();

const sameEnv = (a: Env, b: Env) =>
	a.metrics === b.metrics && a.resolve === b.resolve && a.hyph === b.hyph;

function cellStack(
	pass: Pass,
	cell: TableCell,
	x: number,
	w: number,
	fields: FieldValues,
): CellMemo {
	const hit = cellMemos.get(cell);
	if (
		hit &&
		hit.x === x &&
		hit.w === w &&
		sameEnv(hit.env, pass) &&
		hit.kinds.every((k, i) => fields[k] === hit.values[i])
	) {
		if (hit.total) pass.usesTotal = true;
		return hit;
	}
	const kinds = [...new Set(cell.paras.flatMap(fieldKinds))];
	const memo: CellMemo = {
		...stack(
			pass,
			cell.paras,
			Math.max(1, w - 2 * CELL_PAD_X),
			x + CELL_PAD_X,
			fields,
		),
		env: {
			metrics: pass.metrics,
			resolve: pass.resolve,
			hyph: pass.hyph,
		},
		x,
		w,
		kinds,
		values: kinds.map((k) => fields[k]),
		total: kinds.includes('pages'),
	};
	cellMemos.set(cell, memo);
	return memo;
}

interface CellPlan {
	row: number;
	col: number;
	x: number;
	w: number;
	rs: number;
	memo: CellMemo;
	lines: Placed[];
	/** text height, without padding */
	h: number;
}

// reused while unmoved
interface RowPlaced {
	bi: number;
	c: number;
	y: number;
	h: number;
	boxes: CellBox[];
	decor: ParaBox[];
}

interface RowPlan {
	row: number;
	plans: CellPlan[];
	placed?: RowPlaced;
}

// keyed by row cells
const rowPlans = new WeakMap<TableCell[], RowPlan>();

function rowPlan(
	pass: Pass,
	t: Table,
	row: number,
	xs: number[],
	fields: FieldValues,
): RowPlan {
	const cells = t.rows[row]!;
	const memoAt = (col: number) => {
		const cell = cells[col]!;
		const x = xs[col]!;
		const end = Math.min(col + (cell.colspan ?? 1), xs.length - 1);
		return cellStack(pass, cell, x, xs[end]! - x, fields);
	};
	const hit = rowPlans.get(cells);
	if (
		hit?.row === row &&
		hit.plans.every((p) => memoAt(p.col) === p.memo)
	)
		return hit;
	const plans: CellPlan[] = [];
	cells.forEach((cell, col) => {
		if (cell.covered) return;
		const memo = memoAt(col);
		plans.push({
			row,
			col,
			x: memo.x,
			w: memo.w,
			rs: cell.rowspan ?? 1,
			memo,
			lines: memo.lines,
			h: memo.h,
		});
	});
	const out = { row, plans };
	rowPlans.set(cells, out);
	return out;
}

/** Column edges of a table scaled into a box. */
export function edgesOf(t: Table, left: number, width: number): number[] {
	const total = t.cols.reduce((a, b) => a + b, 0) || 1;
	const xs = [left];
	let acc = 0;
	for (const w of t.cols) xs.push(left + ((acc += w) * width) / total);
	return xs;
}

// last row merges reach
function bandEnd(t: Table, r: number): number {
	let end = r;
	for (let i = r; i <= end && i < t.rows.length; i++)
		for (const c of t.rows[i]!)
			if (!c.covered)
				end = Math.max(end, i + (c.rowspan ?? 1) - 1);
	return Math.min(end, t.rows.length - 1);
}

interface Band {
	plans: CellPlan[];
	rowH: number[];
	h: number;
}

function planBand(
	pass: Pass,
	t: Table,
	r0: number,
	r1: number,
	xs: number[],
	fields: FieldValues,
): Band {
	const plans: CellPlan[] = [];
	for (let row = r0; row <= r1; row++)
		for (const p of rowPlan(pass, t, row, xs, fields).plans)
			plans.push(p);
	const rowH = Array.from({ length: r1 - r0 + 1 }, () => 0);
	for (const p of plans)
		if (p.rs === 1)
			rowH[p.row - r0] = Math.max(
				rowH[p.row - r0]!,
				p.h + 2 * CELL_PAD_Y,
			);
	for (const p of plans) {
		if (p.rs === 1) continue;
		const last = Math.min(p.row + p.rs, r1 + 1) - 1 - r0;
		let sum = 0;
		for (let i = p.row - r0; i <= last; i++) sum += rowH[i]!;
		rowH[last]! += Math.max(0, p.h + 2 * CELL_PAD_Y - sum);
	}
	let h = 0;
	for (const x of rowH) h += x;
	return { plans, rowH, h };
}

// lines fitting room
function fitting(p: CellPlan, from: number, room: number): number {
	const base = p.lines[from]?.y ?? 0;
	let n = 0;
	for (let i = from; i < p.lines.length; i++) {
		const l = p.lines[i]!;
		if (l.y - base + l.pl.height > room + EPSILON) break;
		n++;
	}
	return n;
}

function cellBox(
	bi: number,
	c: number,
	p: CellPlan,
	top: number,
	h: number,
	from: number,
	take: number,
	decor: ParaBox[],
): CellBox {
	const dy = p.lines[from]?.y ?? 0;
	const lines: Line[] = [];
	for (let i = from; i < from + take; i++) {
		const l = p.lines[i]!;
		const line = toLine(l.bi, l.pl, top + CELL_PAD_Y + l.y - dy);
		line.col = c;
		lines.push(line);
	}
	const box = {
		block: bi,
		row: p.row,
		col: p.col,
		x: p.x,
		y: top,
		w: p.w,
		h,
		lines,
	};
	const d = p.memo.decor;
	if (d)
		decorateLines(
			lines,
			(l) => d[l.block],
			() => ({
				left: p.x + CELL_PAD_X,
				width: p.w - 2 * CELL_PAD_X,
			}),
			decor,
		);
	return box;
}

// shading, decoration, then rules
function tableBoxes(
	t: Table,
	frag: CellBox[],
	decor: ParaBox[],
	page: PageBox,
) {
	let left = Infinity;
	let right = -Infinity;
	let top = Infinity;
	let bottom = -Infinity;
	for (const b of frag) {
		const fill = t.rows[b.row]![b.col]!.shading;
		if (fill)
			page.boxes.push({
				x: b.x,
				y: b.y,
				w: b.w,
				h: b.h,
				fill,
			});
		left = Math.min(left, b.x);
		right = Math.max(right, b.x + b.w);
		top = Math.min(top, b.y);
		bottom = Math.max(bottom, b.y + b.h);
	}
	for (const d of decor) page.boxes.push(d);
	const { kind, width: bw, colour } = t.border;
	if (kind === 'none') return;
	const h = (x: number, y: number, w: number): ParaBox => ({
		x: x - bw / 2,
		y: y - bw / 2,
		w: w + bw,
		h: bw,
		fill: colour,
	});
	const v = (x: number, y: number, len: number): ParaBox => ({
		x: x - bw / 2,
		y: y - bw / 2,
		w: bw,
		h: len + bw,
		fill: colour,
	});
	if (kind === 'outer') {
		page.boxes.push(
			h(left, top, right - left),
			h(left, bottom, right - left),
			v(left, top, bottom - top),
			v(right, top, bottom - top),
		);
		return;
	}
	for (const b of frag) {
		page.boxes.push(h(b.x, b.y, b.w), v(b.x, b.y, b.h));
		if (b.x + b.w >= right - EPSILON)
			page.boxes.push(v(b.x + b.w, b.y, b.h));
		if (b.y + b.h >= bottom - EPSILON)
			page.boxes.push(h(b.x, b.y + b.h, b.w));
	}
}

function fillTable(
	pass: Pass,
	sec: Section,
	it: TableItem,
	start: number,
	startPart: number[] | undefined,
	c: number,
	y0: number,
	bottom: number,
	page: PageBox,
	fresh: boolean,
): { line?: Line; y: number; next?: Pick<Cursor, 'row' | 'part'> } {
	const t = it.table;
	const col = sec.cols[c]!;
	const xs = edgesOf(t, col.left, sec.colW);
	const fields = pass.fields.get(page)!;
	const frag: CellBox[] = [];
	const decor: ParaBox[] = [];
	let y = y0;
	const emit = (
		p: CellPlan,
		top: number,
		h: number,
		from: number,
		take: number,
	) => {
		const box = cellBox(it.bi, c, p, top, h, from, take, decor);
		frag.push(box);
		return box;
	};
	const band = (b: Band, r0: number, n: number, repeat: boolean) => {
		const tops = [y];
		for (let i = 0; i < n; i++) tops.push(tops[i]! + b.rowH[i]!);
		for (const p of b.plans) {
			const i = p.row - r0;
			if (i >= n) continue;
			const top = tops[i]!;
			const h = Math.min(
				tops[Math.min(i + p.rs, n)]! - top,
				bottom - top,
			);
			const box = emit(
				p,
				top,
				h,
				0,
				fitting(p, 0, h - 2 * CELL_PAD_Y),
			);
			if (repeat) box.repeat = true;
		}
		y = Math.min(tops[n]!, bottom);
	};
	const done = (next?: Pick<Cursor, 'row' | 'part'>) => {
		if (!frag.length) return { y, next };
		for (const b of frag) page.cells.push(b);
		tableBoxes(t, frag, decor, page);
		const line: Line = {
			kind: 'table',
			block: it.bi,
			start: 0,
			end: 0,
			top: y0,
			baseline: y0,
			height: y - y0,
			left: col.left,
			width: sec.colW,
			spans: NO_SPANS,
			col: c,
		};
		return { line, y, next };
	};
	let row = start;
	let part = startPart;
	if (fresh && t.header && (row > 0 || part)) {
		const e = bandEnd(t, 0);
		if (e < row) {
			const b = planBand(pass, t, 0, e, xs, fields);
			if (b.h <= (bottom - y) / 2) band(b, 0, e + 1, true);
		}
	}
	while (row < t.rows.length) {
		const e = bandEnd(t, row);
		if (e > row) {
			const b = planBand(pass, t, row, e, xs, fields);
			let n = e - row + 1;
			if (y + b.h > bottom + EPSILON) {
				if (!fresh) return done({ row });
				// ponytail: tall merges clip
				let top = y + b.rowH[0]!;
				n = 1;
				while (
					n < b.rowH.length &&
					top + b.rowH[n]! <= bottom + EPSILON
				)
					top += b.rowH[n++]!;
			}
			band(b, row, n, false);
			row += n;
			fresh = false;
			continue;
		}
		const rp = rowPlan(pass, t, row, xs, fields);
		const { plans } = rp;
		const from = plans.map((p) => part?.[p.col] ?? 0);
		let rowH = 0;
		plans.forEach((p, i) => {
			if (from[i]! < p.lines.length)
				rowH = Math.max(
					rowH,
					p.h - p.lines[from[i]!]!.y,
				);
		});
		rowH += 2 * CELL_PAD_Y;
		if (y + rowH <= bottom + EPSILON) {
			if (part)
				plans.forEach((p, i) =>
					emit(
						p,
						y,
						rowH,
						from[i]!,
						p.lines.length - from[i]!,
					),
				);
			else placeRow(rp, it.bi, c, y, rowH, frag, decor);
			y += rowH;
			row++;
			part = undefined;
			fresh = false;
			continue;
		}
		if (!fresh && rowH <= bottom - page.content.top + EPSILON)
			return done({ row, part });
		const avail = bottom - y - 2 * CELL_PAD_Y;
		let takes = plans.map((p, i) => fitting(p, from[i]!, avail));
		if (takes.every((n) => n === 0)) {
			if (!fresh) return done({ row, part });
			takes = plans.map((p, i) =>
				from[i]! < p.lines.length ? 1 : 0,
			);
		}
		let h = 0;
		plans.forEach((p, i) => {
			const l = p.lines[from[i]! + takes[i]! - 1];
			if (takes[i])
				h = Math.max(
					h,
					l!.y +
						l!.pl.height -
						p.lines[from[i]!]!.y,
				);
		});
		h += 2 * CELL_PAD_Y;
		plans.forEach((p, i) => emit(p, y, h, from[i]!, takes[i]!));
		y += h;
		const next = t.cols.map(() => 0);
		plans.forEach((p, i) => (next[p.col] = from[i]! + takes[i]!));
		if (plans.every((p) => next[p.col]! >= p.lines.length)) {
			row++;
			part = undefined;
			fresh = false;
			continue;
		}
		return done({ row, part: next });
	}
	return done();
}

// unmoved rows reuse boxes
function placeRow(
	rp: RowPlan,
	bi: number,
	c: number,
	y: number,
	h: number,
	frag: CellBox[],
	decor: ParaBox[],
) {
	let k = rp.placed;
	if (!(k?.bi === bi && k.c === c && k.y === y && k.h === h)) {
		k = { bi, c, y, h, boxes: [], decor: [] };
		for (const p of rp.plans)
			k.boxes.push(
				cellBox(
					bi,
					c,
					p,
					y,
					h,
					0,
					p.lines.length,
					k.decor,
				),
			);
		rp.placed = k;
	}
	for (const b of k.boxes) frag.push(b);
	for (const d of k.decor) decor.push(d);
}

// runs of one decoration
function decorateLines(
	lines: Line[],
	decorOf: (line: Line) => Decor | undefined,
	colOf: (line: Line) => { left: number; width: number },
	out: ParaBox[],
) {
	let box: ParaBox | null = null;
	let key: string | undefined;
	let prev: Line | null = null;
	for (const line of lines) {
		const d = decorOf(line);
		const same =
			d &&
			box &&
			prev &&
			d.key === key &&
			(prev.col ?? 0) === (line.col ?? 0) &&
			line.block - prev.block <= 1;
		if (d && !same) {
			const col = colOf(line);
			const indent = paraIndent(d.para);
			box = {
				x: col.left + indent - BORDER_PAD,
				y:
					line.top -
					BORDER_PAD -
					(d.para.border?.top?.width ?? 0),
				w: col.width - indent + 2 * BORDER_PAD,
				h: 0,
			};
			if (d.para.shading) box.fill = d.para.shading;
			if (d.para.border) box.border = d.para.border;
			out.push(box);
			key = d.key;
		}
		if (d)
			box!.h =
				line.top +
				line.height +
				BORDER_PAD +
				(d.para.border?.bottom?.width ?? 0) -
				box!.y;
		else box = null;
		prev = line;
	}
}

/** valign above any notes */
function alignPage(page: PageBox, valign: 'centre' | 'bottom') {
	const { top, height } = page.content;
	const foot = Math.min(top + height, ...page.notes.map((l) => l.top));
	let used = top;
	for (const l of [...page.lines, ...page.toc])
		if (l.kind !== 'break') used = Math.max(used, l.top + l.height);
	for (const b of [...page.boxes, ...page.cells])
		used = Math.max(used, b.y + b.h);
	for (const f of page.floats) used = Math.max(used, f.y + f.boxH);
	const slack = foot - used;
	if (slack <= 0) return;
	const dy = valign === 'centre' ? slack / 2 : slack;
	const move = (l: Line) => {
		l.top += dy;
		l.baseline += dy;
	};
	page.lines.forEach(move);
	page.toc.forEach(move);
	for (const b of [...page.boxes, ...page.cells, ...page.floats])
		b.y += dy;
	for (const c of page.cells) c.lines.forEach(move);
}

function decorate(pass: Pass, page: PageBox) {
	decorateLines(
		page.lines,
		(l) => (l.kind ? undefined : pass.decor.get(l.block)),
		(l) => page.cols[l.col ?? 0]!,
		page.boxes,
	);
}

function layoutStory(
	pass: Pass,
	paras: Paragraph[],
	page: PageBox,
	edge: 'top' | 'bottom',
	gap: number,
): Line[] {
	const { left, width } = page.content;
	const { lines, h } = stack(
		pass,
		paras,
		width,
		left,
		pass.fields.get(page)!,
	);
	const top = edge === 'top' ? gap : page.height - gap - h;
	return lines.map(({ bi, pl, y }) => toLine(bi, pl, top + y));
}

// stories, then body box
function placeStories(pass: Pass, sec: Section, page: PageBox) {
	const { setup } = sec;
	const m = setup.margins;
	page.header = layoutStory(
		pass,
		storyParas(setup, page.headerPart),
		page,
		'top',
		Math.min(STORY_GAP, m.top / 2),
	);
	page.footer = layoutStory(
		pass,
		storyParas(setup, page.footerPart),
		page,
		'bottom',
		Math.min(STORY_GAP, m.bottom / 2),
	);
	// unset slots take nothing
	const h = setup[page.headerPart]?.length && page.header.at(-1);
	const f = setup[page.footerPart]?.length && page.footer[0];
	const top = Math.max(m.top, h ? h.top + h.height + STORY_SPACE : 0);
	const bottom = Math.min(
		page.height - m.bottom,
		f ? f.top - STORY_SPACE : Infinity,
	);
	page.content.top = top;
	page.content.height = Math.max(0, bottom - top);
}

const columnsBySetup = new WeakMap<Setup, Pick<Section, 'cols' | 'colW'>>();

/** Column boxes and width of a setup; the same setup keeps its object. */
export function columnsOf(setup: Setup): Pick<Section, 'cols' | 'colW'> {
	let hit = columnsBySetup.get(setup);
	if (hit) return hit;
	const { width: pageW, margins: m } = setup;
	const boxW = pageW - m.left - m.right;
	const n = clamp(Math.round(setup.columns ?? 1), 1, 3);
	const gutter =
		n > 1
			? clamp(
					setup.gutter ?? DEFAULT_GUTTER,
					0,
					Math.max(0, (boxW - 18 * n) / (n - 1)),
				)
			: 0;
	const colW = (boxW - gutter * (n - 1)) / n;
	hit = {
		cols: Array.from({ length: n }, (_, i) => ({
			left: m.left + i * (colW + gutter),
			width: colW,
		})),
		colW,
	};
	columnsBySetup.set(setup, hit);
	return hit;
}

function newPage(pass: Pass, sec: Section, first: boolean): PageBox {
	const { setup } = sec;
	const m = setup.margins;
	pass.number =
		first && setup.restart !== undefined
			? setup.restart
			: pass.number + 1;
	const page: PageBox = {
		index: pass.pages.length,
		width: setup.width,
		height: setup.height,
		lines: [],
		content: {
			left: m.left,
			top: m.top,
			width: setup.width - m.left - m.right,
			height: setup.height - m.top - m.bottom,
		},
		section: sec.ordinal,
		sectionBlock: sec.start,
		cols: sec.cols,
		boxes: [],
		cells: [],
		floats: [],
		header: [],
		footer: [],
		notes: [],
		toc: [],
		headerPart: storyPart(setup, 'header', first),
		footerPart: storyPart(setup, 'footer', first),
		label: numberLabel(pass.number, setup.numbering),
	};
	pass.fields.set(page, {
		page: page.label,
		pages: pass.feed.total,
		section: String(sec.ordinal + 1),
		date: pass.date,
		title: pass.doc.name,
		figure: '',
	});
	placeStories(pass, sec, page);
	pass.pages.push(page);
	return page;
}

// returns next section start
function layoutSection(
	pass: Pass,
	sec: Section,
	items: Item[],
	start: Cursor,
): { cur: Cursor; setup: Setup; bi: number } | null {
	let cur = start;
	for (let first = true; ; first = false) {
		const page = newPage(pass, sec, first);
		const from = cur;
		const r = flowPage(
			pass,
			sec,
			items,
			from,
			page,
			page.content.top + page.content.height,
		);
		cur = r.cur;
		const ends = sectionEnds(r, items) && !cur.carry;
		if (
			ends &&
			sec.cols.length > 1 &&
			!r.columnBreak &&
			!page.notes.length
		)
			balance(pass, sec, items, from, page);
		if (sec.setup.valign) alignPage(page, sec.setup.valign);
		decorate(pass, page);
		if (r.brk?.kind === 'section')
			return { cur, setup: r.brk.setup, bi: r.brk.bi };
		// trailing break opens page
		if (ends) return null;
	}
}

function itemsOf(pass: Pass, doc: WriteDoc): Item[] {
	const items: Item[] = doc.blocks.map((block, bi): Item => {
		if (block.kind === 'section')
			return { kind: 'section', bi, setup: block.setup };
		if (block.kind === 'table')
			return { kind: 'table', bi, table: block };
		if (block.kind === 'toc') {
			pass.toc = true;
			return { kind: 'toc', bi, toc: block };
		}
		if (block.kind !== 'para') return { kind: block.kind, bi };
		const para = pass.resolve.para(block);
		const key = decorKey(para);
		if (key) pass.decor.set(bi, { key, para });
		return {
			kind: 'para',
			bi,
			block,
			para,
			marker: markerFor(pass, para),
			before: para.spaceBefore,
			after: para.spaceAfter,
			padTop: 0,
			padBottom: 0,
			keepNext: !!para.keepNext,
			widow: para.widow !== false,
		};
	});
	items.forEach((it) => {
		if (it.kind !== 'para') return;
		const next = items[it.bi + 1];
		if (
			next?.kind === 'para' &&
			floatsIn(it.block).length &&
			captionOf(doc, it.bi) === it.bi + 1
		)
			next.boxed = true;
	});
	const keyOf = (it: Item | undefined) =>
		it?.kind === 'para' ? pass.decor.get(it.bi)?.key : undefined;
	items.forEach((it, i) => {
		const d = it.kind === 'para' && pass.decor.get(it.bi);
		if (!d || it.kind !== 'para') return;
		const b = d.para.border;
		// borders take space
		if (keyOf(items[i - 1]) !== d.key)
			it.padTop = BORDER_PAD + (b?.top?.width ?? 0);
		if (keyOf(items[i + 1]) !== d.key)
			it.padBottom = BORDER_PAD + (b?.bottom?.width ?? 0);
	});
	pass.endnotes.forEach((id, k) =>
		pass.doc.notes![id]!.forEach((block, bi) => {
			const para = notePara(pass, block, bi);
			const lead = !k && !bi;
			items.push({
				kind: 'para',
				bi,
				block,
				para,
				marker: bi ? undefined : pass.noteLabel.get(id),
				before: lead ? ENDNOTE_SPACE : para.spaceBefore,
				after: para.spaceAfter,
				padTop: lead ? NOTE_RULE : 0,
				padBottom: 0,
				keepNext: false,
				widow: para.widow !== false,
				note: id,
				rule: lead,
			});
		}),
	);
	return items;
}

function layoutPass(env: Env, doc: WriteDoc, feed: Feedback): Pass {
	const bodySize = env.resolve.char(BODY, BODY.runs[0]!).size;
	const pass: Pass = {
		...notesOf(doc),
		toc: false,
		feed,
		labels: new Map(),
		...env,
		doc,
		pages: [],
		fields: new WeakMap(),
		date: fieldDate(doc.created, doc.setup.lang),
		usesTotal: false,
		bodySize,
		breakH:
			bodySize *
			LINE_HEIGHT *
			env.resolve.para(BODY).lineSpacing,
		counts: [],
		kinds: [],
		number: 0,
		decor: new Map(),
		figures: figuresOf(doc),
	};
	const items = itemsOf(pass, doc);
	let next = layoutSection(pass, sectionOf(doc.setup, 0, -1), items, {
		item: 0,
		row: 0,
	});
	for (let ordinal = 1; next; ordinal++)
		next = layoutSection(
			pass,
			sectionOf(next.setup, ordinal, next.bi),
			items,
			next.cur,
		);
	return pass;
}

// numbers in reference order
function notesOf(
	doc: WriteDoc,
): Pick<Pass, 'noteLabel' | 'noteLabels' | 'endnotes'> {
	const noteLabel = new Map<string, string>();
	const noteLabels = new Map<Paragraph, string[]>();
	const endnotes: string[] = [];
	const n = { foot: 0, end: 0 };
	if (doc.notes)
		for (const b of doc.blocks) {
			if (b.kind !== 'para' || !noteRefs(b).length) continue;
			const labels = noteRefs(b).map(({ ref }) => {
				let label = noteLabel.get(ref.id);
				if (label === undefined && doc.notes![ref.id]) {
					label = numberLabel(
						++n[ref.kind],
						ref.kind === 'foot'
							? 'decimal'
							: 'roman',
					);
					noteLabel.set(ref.id, label);
					if (ref.kind === 'end')
						endnotes.push(ref.id);
				}
				return label ?? '';
			});
			noteLabels.set(b, labels);
		}
	return { noteLabel, noteLabels, endnotes };
}

const figureCount = (p: Paragraph) =>
	fieldKinds(p).includes('figure')
		? p.runs.reduce(
				(n, r) =>
					r.props.field === 'figure'
						? n + r.text.length
						: n,
				0,
			)
		: 0;

/** Number of the first figure field of each paragraph holding one; the fields count up in document order. */
export function figureNumbers(doc: WriteDoc): Map<Paragraph, number> {
	const out = new Map<Paragraph, number>();
	let n = 1;
	for (const p of parasOf(doc.blocks)) {
		const count = figureCount(p);
		if (!count) continue;
		out.set(p, n);
		n += count;
	}
	return out;
}

/** The word a figure field shows before its number. */
export const figureWord = (doc: WriteDoc) =>
	FIGURE[doc.setup.lang ?? 'en'] ?? 'Figure';

function figuresOf(doc: WriteDoc): Map<Paragraph, string[]> {
	const word = figureWord(doc);
	const out = new Map<Paragraph, string[]>();
	for (const [p, n] of figureNumbers(doc))
		out.set(
			p,
			Array.from(
				{ length: figureCount(p) },
				(_, k) => `${word} ${n + k}`,
			),
		);
	return out;
}

const sectionOf = (setup: Setup, ordinal: number, start: number): Section => ({
	setup,
	...columnsOf(setup),
	ordinal,
	start,
});

// feedback settled
function sameFeedback(pass: Pass, next: Feedback): boolean {
	const { feed } = pass;
	if (pass.usesTotal && next.total !== feed.total) return false;
	return (
		!pass.toc ||
		[...next.labels].every(([id, l]) => feed.labels.get(id) === l)
	);
}

/** Lays out the whole document into pages of positioned lines, with headers, footers, notes, contents and resolved fields. NUMPAGES and the contents start from `prev`, such as the layout before an edit. */
export function layoutDoc(
	doc: WriteDoc,
	metrics: Metrics,
	resolve: Resolver,
	hyph: Hyphenator | null = null,
	prev?: Layout,
): Layout {
	const env: Env = { metrics, resolve, hyph };
	let pass = layoutPass(env, doc, {
		total: String(prev?.pages.length ?? 1),
		labels: prev?.labels ?? new Map<string, string>(),
	});
	for (let n = 1; n < MAX_PASSES; n++) {
		const next = {
			total: String(pass.pages.length),
			labels: pass.labels,
		};
		if (sameFeedback(pass, next)) break;
		pass = layoutPass(env, doc, next);
	}
	const out: Layout = { pages: pass.pages };
	if (pass.toc) out.labels = pass.labels;
	return out;
}
