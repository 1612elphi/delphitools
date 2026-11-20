import { clamp } from 'delphicanon/lib/number';
import { hexToRgb, rgbToHex } from 'delphitools-v2/lib/colour-maths';
import { imageBudget, readDoc } from 'delphitools-v2/lib/errata/write/ata';
import { FAMILIES } from 'delphitools-v2/lib/errata/write/fonts';
import {
	allParas,
	blockText,
	newId,
	normalise,
	normaliseLink,
	contentsOf,
} from 'delphitools-v2/lib/errata/write/model';
import {
	STYLES,
	resolveChar,
	resolvePara,
} from 'delphitools-v2/lib/errata/write/styles';
import {
	CELL_PAD_X,
	DEFAULT_GUTTER,
	LIST_STEP,
	NUMBER_STYLES,
	fieldDate,
	figureNumbers,
	figureWord,
} from 'delphitools-v2/lib/errata/write/layout';
import { fitSize, sniffImage } from 'delphitools-v2/lib/errata/write/image';
import {
	DEFAULT_BORDER,
	MAX_ROWS,
	freshCell,
	fromGrid,
	gridOf,
	spanOf,
} from 'delphitools-v2/lib/errata/write/table';
import {
	FIELD_CHAR,
	STORY_PARTS,
	type Align,
	type Block,
	type BorderEdge,
	type Borders,
	type CharProps,
	type FamilyId,
	type FieldKind,
	type ImageRef,
	type ListProps,
	type NoteRef,
	type NumberStyle,
	type Paragraph,
	type ParaProps,
	type ResolvedChar,
	type ResolvedPara,
	type Setup,
	type StoryPart,
	type StyleId,
	type Table,
	type TableBorder,
	type TableCell,
	type Toc,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

export class RtfError extends Error {
	override name = 'RtfError';
}

const MAX_TEXT = 32 * 1024 * 1024;
const MAX_RTF_COLS = 64;
const MAX_DEPTH = 256;
// model strips control chars
const TAB = '    ';

const STYLE_NAMES: Record<StyleId, string> = {
	body: 'Normal',
	h1: 'heading 1',
	h2: 'heading 2',
	h3: 'heading 3',
	title: 'Title',
	quote: 'Quote',
	caption: 'Caption',
	note: 'footnote text',
};
const STYLE_IDS = Object.keys(STYLE_NAMES) as StyleId[];

const ALIGN_WORDS: Record<Align, string> = {
	left: 'ql',
	centre: 'qc',
	right: 'qr',
	justify: 'qj',
};
const ALIGN_OF = Object.fromEntries(
	Object.entries(ALIGN_WORDS).map(([a, w]) => [w, a as Align]),
);

const PARA_TWIPS: Record<
	string,
	'indent' | 'firstLine' | 'spaceBefore' | 'spaceAfter'
> = { li: 'indent', fi: 'firstLine', sb: 'spaceBefore', sa: 'spaceAfter' };

const PAGE_TWIPS: Record<string, 'width' | 'height' | keyof Setup['margins']> =
	{
		paperw: 'width',
		paperh: 'height',
		margl: 'left',
		margr: 'right',
		margt: 'top',
		margb: 'bottom',
	};

type Dest =
	| 'text'
	| 'skip'
	| 'fonttbl'
	| 'colortbl'
	| 'stylesheet'
	| 'pn'
	| 'listtable'
	| 'lsover'
	| 'fldinst'
	| 'pict';

const DESTS: Record<string, Dest> = {
	fonttbl: 'fonttbl',
	colortbl: 'colortbl',
	stylesheet: 'stylesheet',
	pn: 'pn',
	listtable: 'listtable',
	listoverridetable: 'lsover',
	fldinst: 'fldinst',
};

const SKIP = new Set([
	'info',
	'object',
	'pntext',
	'listtext',
	'nonshppict',
	'filetbl',
	'revtbl',
	'xe',
	'tc',
	'annotation',
	'nonesttables',
]);

const STORIES: Record<string, StoryPart> = {
	header: 'header',
	headerl: 'header',
	headerr: 'header',
	headerf: 'firstHeader',
	footer: 'footer',
	footerl: 'footer',
	footerr: 'footer',
	footerf: 'firstFooter',
};

const STORY_WORDS: Record<StoryPart, string> = {
	header: 'header',
	footer: 'footer',
	firstHeader: 'headerf',
	firstFooter: 'footerf',
};

const FIELD_OF: Record<string, FieldKind> = {
	PAGE: 'page',
	NUMPAGES: 'pages',
	DATE: 'date',
	TITLE: 'title',
	SECTION: 'section',
	SEQ: 'figure',
};

const FIELD_INST = {
	...Object.fromEntries(Object.entries(FIELD_OF).map(([w, k]) => [k, w])),
	figure: 'SEQ Figure \\* ARABIC',
} as Record<FieldKind, string>;

// word writes label text
const FIGURE_LABEL = /(?:Figure|Abbildung) $/;
const HEX_IN = new Int8Array(128).fill(-1);
for (let i = 0; i < 16; i++) {
	HEX_IN['0123456789abcdef'.charCodeAt(i)] = i;
	HEX_IN['0123456789ABCDEF'.charCodeAt(i)] = i;
}

const NUMBER_OUT: Record<NumberStyle, string> = {
	decimal: 'pgndec',
	roman: 'pgnlcrm',
	ROMAN: 'pgnucrm',
	alpha: 'pgnlcltr',
};

const NUMBER_WORDS: Record<string, NumberStyle> = {
	...Object.fromEntries(NUMBER_STYLES.map((s) => [NUMBER_OUT[s], s])),
	pgnucltr: 'alpha',
};

const SECTION_TWIPS: Record<
	string,
	'width' | 'height' | keyof Setup['margins']
> = {
	pgwsxn: 'width',
	pghsxn: 'height',
	marglsxn: 'left',
	margrsxn: 'right',
	margtsxn: 'top',
	margbsxn: 'bottom',
};

const BORDER_EDGES: Record<string, keyof Borders | 'box'> = {
	box: 'box',
	brdrt: 'top',
	brdrb: 'bottom',
	brdrl: 'left',
	brdrr: 'right',
};

const BOX_SIDES = ['top', 'bottom', 'left', 'right'] as const;

// windows lcids
const GERMAN = new Set([1031, 2055, 3079, 4103, 5127]);

function sectionSetup(base: Setup, sec: SecState): Setup {
	const out: Setup = {
		width: sec.width ?? base.width,
		height: sec.height ?? base.height,
		margins: { ...base.margins, ...sec.margins },
	};
	if (sec.columns && sec.columns > 1) {
		out.columns = sec.columns;
		if (sec.gutter !== undefined) out.gutter = sec.gutter;
	}
	if (sec.titlePage) out.titlePage = true;
	if (sec.valign) out.valign = sec.valign;
	if (sec.numbering && sec.numbering !== 'decimal')
		out.numbering = sec.numbering;
	if (sec.restart) out.restart = sec.pgnstarts ?? 1;
	for (const [part, paras] of Object.entries(sec.stories))
		if (paras.length) out[part as StoryPart] = paras as Paragraph[];
	return out;
}

function buildDoc(
	name: string,
	page: Setup,
	body: Block[],
	secs: SecState[],
	sectionAt: number[],
	hyphenate: true | undefined,
	lang: 'de' | undefined,
) {
	const setup = sectionSetup(page, secs[0]!);
	if (hyphenate !== undefined) setup.hyphenate = hyphenate;
	if (lang) setup.lang = lang;
	const blocks: Block[] = [];
	let n = 0;
	const sections = (upTo: number) => {
		for (; n < sectionAt.length && sectionAt[n]! <= upTo; n++)
			blocks.push({
				kind: 'section',
				id: newId(),
				setup: sectionSetup(page, secs[n + 1]!),
			});
	};
	body.forEach((b, i) => {
		sections(i);
		blocks.push(b);
	});
	sections(Infinity);
	return { version: 1, name, setup, blocks };
}

const SYMBOLS: Record<string, string> = {
	tab: TAB,
	emdash: '\u2014',
	endash: '\u2013',
	emspace: '\u2003',
	enspace: '\u2002',
	qmspace: '\u2005',
	bullet: '\u2022',
	lquote: '\u2018',
	rquote: '\u2019',
	ldblquote: '\u201c',
	rdblquote: '\u201d',
	'~': '\u00a0',
	_: '\u2011',
	'\\': '\\',
	'{': '{',
	'}': '}',
};

const UNDERLINES = new Set(['ul', 'uld', 'uldb', 'ulw', 'ulth', 'uldash']);

const BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);
const CP1252 = new TextDecoder('windows-1252').decode(BYTES);

function codepage(n = 1252): string {
	try {
		const t = new TextDecoder(
			n === 10000 ? 'macintosh' : `windows-${n}`,
		).decode(BYTES);
		return t.length === 256 ? t : CP1252;
	} catch {
		return CP1252;
	}
}

function mapFont(name: string): FamilyId | undefined {
	const n = name.toLowerCase();
	if (/cmu|computer modern/.test(n))
		return /typewriter|mono/.test(n)
			? 'cmu-typewriter'
			: n.includes('sans')
				? 'cmu-sans'
				: 'cmu-serif';
	if (n.includes('oswald')) return 'oswald';
	if (n.includes('jost')) return 'jost';
	if (/courier|consolas|mono/.test(n)) return 'ibm-plex-mono';
	if (/\binter\b|arial|helvetica|calibri|sans/.test(n)) return 'inter';
	if (/times|georgia|serif/.test(n)) return 'source-serif-4';
	return undefined;
}

function mapStyle(name: string): StyleId {
	const n = name.split(',')[0]!.trim().toLowerCase();
	return (
		STYLE_IDS.find((id) => STYLE_NAMES[id].toLowerCase() === n) ??
		'body'
	);
}

interface Char {
	f?: number;
	size: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	script?: 'super' | 'sub';
	colour?: string;
	highlight?: string;
	link?: string;
	field?: FieldKind;
	image?: ImageRef;
	note?: NoteRef;
}

const PLAIN: Char = {
	size: 12,
	bold: false,
	italic: false,
	underline: false,
	strike: false,
};

type ParaState = Omit<ResolvedPara, 'lineSpacing' | 'list'> & {
	style: StyleId;
	sl: number;
	slmult: number;
	level: number;
	kind?: ListProps['kind'];
	ls: number;
	pagebb: boolean;
	edge?: keyof Borders | 'box';
	cbpat: number;
	intbl: boolean;
};

const PARD: ParaState = {
	style: 'body',
	align: 'left',
	spaceBefore: 0,
	spaceAfter: 0,
	indent: 0,
	firstLine: 0,
	sl: 0,
	slmult: 0,
	level: 0,
	ls: 0,
	pagebb: false,
	cbpat: 0,
	intbl: false,
};

interface Group {
	dest: Dest;
	char: Char;
	uc: number;
	/** shared across field groups */
	field?: { inst: string };
	result?: { kind: FieldKind; done: boolean };
	link?: string;
	/** set on opening group */
	story?: Story;
	/** shared with subgroups */
	pict?: Pict;
}

interface Pict {
	png: boolean;
	hex: string[];
	bin?: string;
	/** pic* control words */
	n: Record<string, number>;
}

const PICT_WORDS = new Set([
	'picw',
	'pich',
	'picwgoal',
	'pichgoal',
	'picscalex',
	'picscaley',
]);

type StoryKind = { part: StoryPart } | { part: 'note'; note: NoteRef };

type Story = StoryKind & {
	sec: SecState;
	paras: Block[];
	saved: { runs: RunState[]; para: ParaState; out: Block[] };
};

type RunState = { text: string; char: Char };

interface SecState {
	columns?: number;
	gutter?: number;
	titlePage?: boolean;
	valign?: Setup['valign'];
	numbering?: NumberStyle;
	restart?: number;
	pgnstarts?: number;
	width?: number;
	height?: number;
	margins: Partial<Setup['margins']>;
	stories: Partial<Record<StoryPart, Block[]>>;
}

const SECTD = (): SecState => ({ margins: {}, stories: {} });

// sides tlbrhv
type Side = string;

interface CellDef {
	x: number;
	mgf?: boolean;
	mrg?: boolean;
	vmgf?: boolean;
	vmrg?: boolean;
	shading?: string;
	sides: Side[];
}

interface RowDef {
	left: number;
	header: boolean;
	cells: CellDef[];
	next: Omit<CellDef, 'x'>;
	sides: Side[];
}

const TROWD = (): RowDef => ({
	left: 0,
	header: false,
	cells: [],
	next: { sides: [] },
	sides: [],
});

interface RowState {
	def: RowDef;
	cells: Paragraph[][];
}

const MERGE_WORDS = ['clmgf', 'clmrg', 'clvmgf', 'clvmrg'] as const;
const MERGE_KEYS = {
	clmgf: 'mgf',
	clmrg: 'mrg',
	clvmgf: 'vmgf',
	clvmrg: 'vmrg',
} as const;

const hasText = (paras: Paragraph[]) => paras.some((p) => blockText(p));

/** columns from all edges */
function buildTable(rows: RowState[], edge: BorderEdge | null): Table {
	let left = Infinity;
	for (const r of rows) left = Math.min(left, r.def.left);
	const defsOf = (r: RowState): CellDef[] =>
		r.def.cells.length
			? r.def.cells
			: r.cells.map((_, i) => ({
					x: r.def.left + (i + 1) * 1440,
					sides: [],
				}));
	const bounds = [
		...new Set(rows.flatMap((r) => defsOf(r).map((d) => d.x))),
	]
		.filter((x) => x > left)
		.sort((a, b) => a - b)
		.slice(0, MAX_RTF_COLS);
	let inner = false;
	let outer = false;
	const grid: TableCell[][] = [];
	rows.forEach((row, r) => {
		const g: (TableCell | undefined)[] = [];
		const defs = defsOf(row);
		let x0 = row.def.left;
		let prev: TableCell | undefined;
		if (row.def.sides.some((s) => s === 'h' || s === 'v'))
			inner = true;
		if (row.def.sides.length) outer = true;
		defs.forEach((d, i) => {
			const content = row.cells[i] ?? [];
			const span: number[] = [];
			bounds.forEach((b, j) => {
				if (b > x0 && b <= d.x) span.push(j);
			});
			x0 = Math.max(x0, d.x);
			for (const side of d.sides) {
				outer = true;
				if (
					(side === 'l' && i > 0) ||
					(side === 'r' && i < defs.length - 1) ||
					(side === 't' && r > 0) ||
					(side === 'b' && r < rows.length - 1)
				)
					inner = true;
			}
			const above = span.length
				? grid[r - 1]?.[span[0]!]
				: undefined;
			let owner = d.mrg ? prev : d.vmrg ? above : undefined;
			if (!span.length) owner ??= prev;
			if (owner) {
				if (hasText(content))
					for (const p of content)
						owner.paras.push(p);
			} else {
				owner = {
					paras: content.length
						? content
						: freshCell().paras,
				};
				if (d.shading) owner.shading = d.shading;
			}
			for (const j of span) g[j] = owner;
			prev = owner;
		});
		for (const extra of row.cells.slice(defs.length))
			if (prev && hasText(extra))
				for (const p of extra) prev.paras.push(p);
		grid.push(
			Array.from(
				{ length: bounds.length },
				(_, j) => g[j] ?? freshCell(),
			),
		);
	});
	const border: TableBorder = {
		...DEFAULT_BORDER,
		...edge,
		kind: inner ? 'all' : outer ? 'outer' : 'none',
	};
	const table: Table = {
		kind: 'table',
		id: newId(),
		cols: bounds.map((b, j) =>
			Math.max(1, (b - (j ? bounds[j - 1]! : left)) / 20),
		),
		rows: [],
		border,
	};
	if (rows[0]!.def.header) table.header = true;
	return fromGrid(table, grid);
}

const TOKEN =
	/\\([a-zA-Z]{1,32})(-?\d{1,10})? ?|\\'([0-9a-fA-F]{2})|\\([\s\S])|[^\\{}]+/y;

function diff<T extends object>(abs: T, base: object): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(abs))
		if (
			v !== undefined &&
			v !== (base as Record<string, unknown>)[k]
		)
			out[k] = v;
	return out as Partial<T>;
}

/** Reads untrusted RTF into a sanitised document; throws RtfError when the text is not RTF. */
export function rtfToDoc(text: string, name: string): WriteDoc {
	if (text.length > MAX_TEXT) throw new RtfError('size');
	const src = text.replace(/^[\uFEFF\s]+/, '');
	if (!src.startsWith('{\\rtf')) throw new RtfError('rtf');

	const fonts = new Map<number, FamilyId | undefined>();
	const colours: (string | undefined)[] = [];
	const styles = new Map<number, StyleId>();
	const lists = new Map<number, ListProps['kind'][]>();
	const overrides = new Map<number, number>();
	const setup = {
		width: 612,
		height: 792,
		margins: { top: 72, right: 90, bottom: 72, left: 90 },
	};
	const body: Block[] = [];
	let blocks = body;
	let runs: RunState[] = [];
	const secs: SecState[] = [SECTD()];
	const sectionAt: number[] = [];
	let hyphenate: true | undefined;
	let lang: 'de' | undefined;
	let para: ParaState = { ...PARD };
	let bytes = CP1252;
	let deff = 0;
	let tblNum = 0;
	let tblName = '';
	let rgb: [number, number, number] | null = null;
	let levels: ListProps['kind'][] = [];
	let listId = 0;
	const stack: Group[] = [{ dest: 'text', char: PLAIN, uc: 1 }];
	let top = stack[0]!;
	let overflow = 0;
	let skip = 0;
	let star = false;
	let rowDef = TROWD();
	let rows: RowState[] = [];
	let rowCells: Paragraph[][] = [];
	let cellParas: Paragraph[] = [];
	let edgeOwner: 'para' | 'cell' | 'row' = 'para';
	let tableEdge: BorderEdge | null = null;
	const notes: Record<string, Paragraph[]> = {};
	let toc: Toc | null = null;
	const pictures: Record<string, Uint8Array> = {};
	const admit = imageBudget();

	function endPict(p: Pict) {
		if (top.dest !== 'text') return;
		let bytes: Uint8Array;
		if (p.bin !== undefined)
			bytes = Uint8Array.from(
				p.bin,
				(c) => c.charCodeAt(0) & 0xff,
			);
		else {
			const hex = p.hex.join('');
			bytes = new Uint8Array(hex.length >> 1);
			let len = 0;
			let hi = -1;
			for (let i = 0; i < hex.length; i++) {
				const v = HEX_IN[hex.charCodeAt(i)] ?? -1;
				if (v < 0) continue;
				if (hi < 0) hi = v;
				else {
					bytes[len++] = (hi << 4) | v;
					hi = -1;
				}
			}
			bytes = bytes.subarray(0, len);
		}
		const asset = sniffImage(bytes);
		if (!asset || !admit(bytes.length)) return;
		const { n } = p;
		const natural = fitSize(asset, Infinity, Infinity);
		const w =
			(n.picwgoal ? n.picwgoal / 20 : natural.w) *
			((n.picscalex ?? 100) / 100);
		const h =
			(n.pichgoal ? n.pichgoal / 20 : natural.h) *
			((n.picscaley ?? 100) / 100);
		if (!(w > 0 && h > 0)) return;
		const id = newId();
		pictures[id] = bytes;
		runs.push({
			text: FIELD_CHAR,
			char: {
				...top.char,
				link: undefined,
				field: undefined,
				image: {
					id,
					w: clamp(w, 1, 14400),
					h: clamp(h, 1, 14400),
				},
			},
		});
	}

	function endRow() {
		if (cellParas.length) rowCells.push(cellParas);
		if (rowCells.length && rows.length < MAX_ROWS)
			rows.push({ def: rowDef, cells: rowCells });
		rowCells = [];
		cellParas = [];
	}

	function closeTable() {
		endRow();
		if (rows.length) body.push(buildTable(rows, tableEdge));
		rows = [];
		rowCells = [];
		cellParas = [];
		tableEdge = null;
	}

	function flush() {
		const style = para.style;
		const props: ParaProps = diff(
			{
				align: para.align,
				lineSpacing:
					para.slmult && para.sl > 0
						? para.sl / 240
						: 1,
				spaceBefore: para.spaceBefore,
				spaceAfter: para.spaceAfter,
				indent: para.indent,
				firstLine: para.firstLine,
				keepNext: para.keepNext,
				widow: para.widow,
			},
			STYLES[style].para,
		);
		const kind =
			para.kind ??
			(para.ls
				? (lists.get(overrides.get(para.ls) ?? -1)?.[
						para.level
					] ?? 'bullet')
				: undefined);
		if (kind) props.list = { kind, level: para.level };
		if (para.border) props.border = para.border;
		const shading = para.cbpat ? colours[para.cbpat] : undefined;
		if (shading) props.shading = shading;
		const inCell = para.intbl && blocks === body;
		if (
			!inCell &&
			blocks === body &&
			(rows.length || rowCells.length || cellParas.length)
		)
			closeTable();
		const afterSection = blocks === body && sectionAt.length > 0;
		if (!inCell && para.pagebb && (blocks.length || afterSection))
			blocks.push({ kind: 'break', id: newId() });
		const base = STYLES[style].char;
		const out = runs.map((r) => ({
			text: r.text,
			props: diff<CharProps>(
				{
					font: fonts.get(r.char.f ?? deff),
					size: r.char.size,
					bold: r.char.bold,
					italic: r.char.italic,
					underline: r.char.underline,
					strike: r.char.strike,
					script: r.char.script,
					colour: r.char.colour,
					highlight: r.char.highlight,
					link: r.char.link,
					field: r.char.field,
					image: r.char.image,
					note: r.char.note,
				},
				base,
			),
		}));
		const p = normalise({
			kind: 'para',
			id: newId(),
			style,
			props,
			runs: out.length ? out : [{ text: '', props: {} }],
			dir: 'ltr',
		});
		if (inCell) cellParas.push(p);
		else blocks.push(p);
		runs = [];
	}

	function tableBorderWord(w: string, v: number) {
		const e = tableEdge ?? {
			width: DEFAULT_BORDER.width,
			colour: DEFAULT_BORDER.colour,
		};
		if (w === 'brdrw')
			tableEdge = { ...e, width: clamp(v / 20, 0.25, 12) };
		else if (w === 'brdrcf')
			tableEdge = { ...e, colour: colours[v] ?? e.colour };
		else
			(edgeOwner === 'cell'
				? rowDef.next.sides
				: rowDef.sides
			).pop();
	}

	function commit() {
		if (top.dest === 'fonttbl') fonts.set(tblNum, mapFont(tblName));
		else if (top.dest === 'stylesheet')
			styles.set(tblNum, mapStyle(tblName));
		else colours.push(rgb ? rgbToHex(...rgb) : undefined);
		tblNum = 0;
		tblName = '';
		rgb = null;
	}

	function addText(s: string) {
		if (skip) {
			const n = Math.min(skip, s.length);
			skip -= n;
			s = s.slice(n);
		}
		if (!s) return;
		const result = top.result;
		if (result && top.dest === 'text') {
			// stale result text
			if (result.done) return;
			result.done = true;
			s = FIELD_CHAR;
			top.char = { ...top.char, field: result.kind };
			const last = runs.at(-1);
			if (
				result.kind === 'figure' &&
				last &&
				FIGURE_LABEL.test(last.text)
			)
				last.text = last.text.replace(FIGURE_LABEL, '');
		}
		if (top.dest === 'text') {
			const last = runs.at(-1);
			if (last?.char === top.char) last.text += s;
			else runs.push({ text: s, char: top.char });
		} else if (
			top.dest === 'fonttbl' ||
			top.dest === 'stylesheet' ||
			top.dest === 'colortbl'
		)
			for (const ch of s)
				if (ch === ';') commit();
				else tblName += ch;
		else if (top.dest === 'fldinst' && top.field)
			top.field.inst += s;
		else if (top.dest === 'pict') top.pict?.hex.push(s);
	}

	function openStory(kind: StoryKind) {
		top.story = {
			...kind,
			sec: secs.at(-1)!,
			paras: [],
			saved: { runs, para, out: blocks },
		};
		runs = [];
		para = { ...PARD };
		blocks = top.story.paras;
	}

	function closeStory(story: Story) {
		if (runs.length) flush();
		const paras = story.paras.filter((b) => b.kind === 'para');
		if (story.part === 'note') {
			const first = paras[0];
			// word spaces after numbers
			if (first)
				paras[0] = normalise({
					...first,
					runs: first.runs.map((r, i) =>
						i
							? r
							: {
									...r,
									text: r.text.trimStart(),
								},
					),
				});
			if (paras.length) notes[story.note.id] = paras;
			({ runs, para, out: blocks } = story.saved);
			return;
		}
		// empty story clears inheritance
		if (paras.length === 1 && !blockText(paras[0]))
			delete story.sec.stories[story.part];
		else story.sec.stories[story.part] = paras;
		({ runs, para, out: blocks } = story.saved);
	}

	function borderWord(w: string, v: number) {
		const edge = para.edge;
		if (!edge || !para.border) return;
		const b: Borders = { ...para.border };
		for (const s of edge === 'box' ? BOX_SIDES : [edge]) {
			const cur = b[s];
			if (!cur) continue;
			if (w === 'brdrw')
				b[s] = {
					...cur,
					width: clamp(v / 20, 0.25, 12),
				};
			else if (w === 'brdrcf')
				b[s] = {
					...cur,
					colour: colours[v] ?? cur.colour,
				};
			else delete b[s];
		}
		para.border = Object.keys(b).length ? b : undefined;
	}

	function textWord(w: string, n: number | undefined) {
		const on = n !== 0;
		const v = n ?? 0;
		const set = (p: Partial<Char>) =>
			(top.char = { ...top.char, ...p });
		switch (w) {
			case 'b':
				return set({ bold: on });
			case 'i':
				return set({ italic: on });
			case 'ulnone':
				return set({ underline: false });
			case 'strike':
			case 'striked':
				return set({ strike: on });
			case 'super':
			case 'sub':
				return set({ script: w });
			case 'nosupersub':
				return set({ script: undefined });
			case 'plain':
				top.char = top.link
					? { ...PLAIN, link: top.link }
					: PLAIN;
				return;
			case 'field':
				top.field = { inst: '' };
				return;
			case 'ftnalt':
				if (top.story?.part === 'note')
					top.story.note.kind = 'end';
				return;
			case 'fldrslt': {
				const inst = top.field?.inst ?? '';
				if (/^\s*TOC\b/i.test(inst)) {
					// result text is stale
					top.dest = 'skip';
					if (
						toc ||
						blocks !== body ||
						para.intbl
					)
						return;
					if (runs.length) flush();
					closeTable();
					const hi = /\\o\s+"\d-(\d)"/.exec(
						inst,
					)?.[1];
					toc = {
						kind: 'toc',
						id: newId(),
						levels: clamp(
							Number(hi ?? 3),
							1,
							3,
						),
					};
					body.push(toc);
					return;
				}
				const kind =
					FIELD_OF[
						/^\s*([A-Z]+)\b/i
							.exec(inst)?.[1]
							?.toUpperCase() ?? ''
					];
				if (kind && top.field) {
					top.field = undefined;
					top.result = { kind, done: false };
					return;
				}
				const url = inst.match(
					/^\s*HYPERLINK\s+"([^"]+)"/i,
				)?.[1];
				top.link =
					(url && normaliseLink(url)) ||
					undefined;
				return set({ link: top.link });
			}
			case 'fs':
				if (v > 0) set({ size: v / 2 });
				return;
			case 'f':
				return set({ f: v });
			case 'cf':
				return set({ colour: colours[v] });
			case 'highlight':
			case 'cb':
				return set({
					highlight: v ? colours[v] : undefined,
				});
			case 'par':
			case 'line':
				return flush();
			case 'intbl':
				para.intbl = true;
				return;
			case 'cell':
			case 'nestcell':
				if (blocks !== body) return flush();
				para.intbl = true;
				flush();
				if (w === 'cell') {
					rowCells.push(cellParas);
					cellParas = [];
				}
				return;
			case 'row':
				if (blocks === body) endRow();
				return;
			case 'trowd':
				rowDef = TROWD();
				return;
			case 'trleft':
				rowDef.left = v;
				return;
			case 'trhdr':
				rowDef.header = true;
				return;
			case 'cellx':
				rowDef.cells.push({ ...rowDef.next, x: v });
				rowDef.next = { sides: [] };
				return;
			case 'clcbpat':
				rowDef.next.shading = colours[v];
				return;
			case 'clbrdrt':
			case 'clbrdrb':
			case 'clbrdrl':
			case 'clbrdrr':
				edgeOwner = 'cell';
				rowDef.next.sides.push(w.slice(-1));
				return;
			case 'trbrdrt':
			case 'trbrdrb':
			case 'trbrdrl':
			case 'trbrdrr':
			case 'trbrdrh':
			case 'trbrdrv':
				edgeOwner = 'row';
				rowDef.sides.push(w.slice(-1));
				return;
			case 'sect': {
				if (runs.length) flush();
				if (top.story) return;
				closeTable();
				const prev = secs.at(-1)!;
				secs.push({
					...SECTD(),
					stories: { ...prev.stories },
				});
				sectionAt.push(body.length);
				return;
			}
			case 'sectd': {
				const sec = secs.at(-1)!;
				secs[secs.length - 1] = {
					...SECTD(),
					stories: sec.stories,
				};
				return;
			}
			case 'page':
			case 'column':
				if (runs.length) flush();
				if (blocks === body) closeTable();
				blocks.push({
					kind: w === 'page' ? 'break' : 'column',
					id: newId(),
				});
				return;
			case 'cols':
				secs.at(-1)!.columns = clamp(v, 1, 3);
				return;
			case 'colsx':
				secs.at(-1)!.gutter = v / 20;
				return;
			case 'titlepg':
				secs.at(-1)!.titlePage = on;
				return;
			case 'vertalc':
				secs.at(-1)!.valign = 'centre';
				return;
			case 'vertalb':
				secs.at(-1)!.valign = 'bottom';
				return;
			case 'pgnrestart':
				secs.at(-1)!.restart = 1;
				return;
			case 'pgnstarts':
				secs.at(-1)!.pgnstarts = clamp(v, 1, 9999);
				return;
			case 'hyphauto':
				hyphenate = on || undefined;
				return;
			case 'deflang':
				lang = GERMAN.has(v) ? 'de' : undefined;
				return;
			case 'keepn':
				para.keepNext = true;
				return;
			case 'widctlpar':
			case 'nowidctlpar':
				para.widow = w === 'widctlpar';
				return;
			case 'box':
			case 'brdrt':
			case 'brdrb':
			case 'brdrl':
			case 'brdrr': {
				edgeOwner = 'para';
				const edge = BORDER_EDGES[w]!;
				para.edge = edge;
				const line = { width: 0.5, colour: '#000000' };
				const sides =
					edge === 'box' ? BOX_SIDES : [edge];
				para.border = {
					...para.border,
					...Object.fromEntries(
						sides.map((s) => [s, line]),
					),
				};
				return;
			}
			case 'brdrw':
			case 'brdrcf':
			case 'brdrnone':
			case 'brdrnil':
				return edgeOwner === 'para'
					? borderWord(w, v)
					: tableBorderWord(w, v);
			case 'cbpat':
				para.cbpat = v;
				return;
			case 'pard':
				para = { ...PARD };
				return;
			case 's':
				para.style = styles.get(v) ?? 'body';
				return;
			case 'sl':
				para.sl = v;
				return;
			case 'slmult':
				para.slmult = v;
				return;
			case 'pagebb':
				para.pagebb = on;
				return;
			case 'ilvl':
				para.level = clamp(v, 0, 8);
				return;
			case 'ls':
				para.ls = v;
				return;
			case 'ansicpg':
				bytes = codepage(n);
				return;
			case 'deff':
				deff = v;
				return;
		}
		const page = Object.hasOwn(PAGE_TWIPS, w)
			? PAGE_TWIPS[w]
			: undefined;
		const sxn = Object.hasOwn(SECTION_TWIPS, w)
			? SECTION_TWIPS[w]
			: undefined;
		const sec = secs.at(-1)!;
		if (page === 'width' || page === 'height') setup[page] = v / 20;
		else if (page) setup.margins[page] = v / 20;
		else if (sxn === 'width' || sxn === 'height') sec[sxn] = v / 20;
		else if (sxn) sec.margins[sxn] = v / 20;
		else if (Object.hasOwn(NUMBER_WORDS, w))
			sec.numbering = NUMBER_WORDS[w];
		else if (Object.hasOwn(PARA_TWIPS, w))
			para[PARA_TWIPS[w]!] = v / 20;
		else if (Object.hasOwn(ALIGN_OF, w)) para.align = ALIGN_OF[w]!;
		else if ((MERGE_WORDS as readonly string[]).includes(w))
			rowDef.next[
				MERGE_KEYS[w as (typeof MERGE_WORDS)[number]]
			] = true;
		else if (UNDERLINES.has(w)) set({ underline: on });
	}

	function word(w: string, n: number | undefined) {
		if (skip) {
			skip--;
			return;
		}
		const dest = top.dest;
		if (dest === 'skip') return;
		if (dest === 'pict') {
			// picprop, blipuid
			if (star) {
				star = false;
				top.dest = 'skip';
				return;
			}
			if (w === 'pngblip' || w === 'jpegblip')
				top.pict!.png = true;
			else if (PICT_WORDS.has(w) && n !== undefined)
				top.pict!.n[w] = n;
			// other formats, blipuid
			else if (/blip$|metafile|pict$|bitmap$/.test(w))
				top.pict!.png = false;
			return;
		}
		if (star) {
			star = false;
			// word's picture wrapper
			if (w === 'shppict') return;
			// libreoffice stars footnotes
			if (w !== 'footnote' && !Object.hasOwn(DESTS, w)) {
				top.dest = 'skip';
				return;
			}
		}
		const v = n ?? 0;
		if (w === 'uc') top.uc = clamp(v, 0, 16);
		else if (w === 'u' && n !== undefined) {
			addText(String.fromCharCode(n & 0xffff));
			skip = top.uc;
		} else if (Object.hasOwn(DESTS, w)) {
			if (dest === 'text') top.dest = DESTS[w]!;
		} else if (Object.hasOwn(STORIES, w)) {
			if (dest === 'text' && !top.story)
				openStory({ part: STORIES[w]! });
			else top.dest = 'skip';
		} else if (w === 'footnote') {
			if (
				dest === 'text' &&
				!top.story &&
				blocks === body &&
				!para.intbl
			) {
				const note: NoteRef = {
					id: newId(),
					kind: 'foot',
				};
				runs.push({
					text: FIELD_CHAR,
					char: {
						...top.char,
						script: undefined,
						link: undefined,
						field: undefined,
						image: undefined,
						note,
					},
				});
				openStory({ part: 'note', note });
			} else top.dest = 'skip';
		} else if (w === 'pict') {
			if (dest === 'text') {
				top.dest = 'pict';
				top.pict = { png: false, hex: [], n: {} };
			} else top.dest = 'skip';
		} else if (SKIP.has(w)) top.dest = 'skip';
		else if (Object.hasOwn(SYMBOLS, w)) addText(SYMBOLS[w]!);
		else if (dest === 'fonttbl' && w === 'f') tblNum = v;
		else if (dest === 'stylesheet' && w === 's') tblNum = v;
		else if (dest === 'colortbl') {
			const i = ['red', 'green', 'blue'].indexOf(w);
			if (i >= 0) (rgb ??= [0, 0, 0])[i] = clamp(v, 0, 255);
		} else if (dest === 'listtable') {
			if (w === 'list') levels = [];
			else if (w === 'listlevel') levels.push('number');
			else if (
				(w === 'levelnfc' || w === 'levelnfcn') &&
				levels.length
			)
				levels[levels.length - 1] =
					v === 23 ? 'bullet' : 'number';
			else if (w === 'listid') lists.set(v, levels);
		} else if (dest === 'lsover') {
			if (w === 'listid') listId = v;
			else if (w === 'ls') overrides.set(v, listId);
		} else if (dest === 'pn') {
			if (w === 'pnlvlblt') para.kind = 'bullet';
			else if (w === 'pnlvlbody' || w === 'pnlvlcont')
				para.kind = 'number';
			else if (w === 'pnlvl') {
				para.kind = 'number';
				para.level = clamp(v - 1, 0, 8);
			} else if (w === 'ilvl') para.level = clamp(v, 0, 8);
		} else if (dest === 'text') textWord(w, n);
	}

	function symbol(c: string) {
		if (skip) {
			skip--;
			return;
		}
		if (c === '*') star = true;
		else if (c === '\n' || c === '\r') {
			if (top.dest === 'text') flush();
		} else if (Object.hasOwn(SYMBOLS, c)) addText(SYMBOLS[c]!);
	}

	for (let i = 0; i < src.length;) {
		const c = src[i];
		if (c === '{' || c === '}') {
			i++;
			skip = 0;
			star = false;
			if (c === '{') {
				if (stack.length >= MAX_DEPTH) overflow++;
				else stack.push((top = { ...top }));
			} else if (overflow) overflow--;
			else if (stack.length > 1) {
				const closed = stack.pop()!;
				top = stack.at(-1)!;
				if (closed.story && closed.story !== top.story)
					closeStory(closed.story);
				if (
					closed.pict?.png &&
					closed.pict !== top.pict &&
					closed.dest === 'pict'
				)
					endPict(closed.pict);
			}
			continue;
		}
		TOKEN.lastIndex = i;
		const m = TOKEN.exec(src);
		if (!m) {
			i++;
			continue;
		}
		i = TOKEN.lastIndex;
		const [all, w, num, hex, sym] = m;
		if (w) {
			const n = num === undefined ? undefined : Number(num);
			if (w === 'bin') {
				const len = Math.max(0, n ?? 0);
				if (top.dest === 'pict' && top.pict)
					top.pict.bin = src.slice(i, i + len);
				i += len;
			} else word(w, n);
		} else if (hex) addText(bytes[parseInt(hex, 16)]!);
		else if (sym !== undefined) symbol(sym);
		else
			addText(
				all
					.replace(/[\r\n]/g, '')
					.replace(/\t/g, TAB)
					.replace(
						/[\x80-\xff]/g,
						(c) => bytes[c.charCodeAt(0)]!,
					),
			);
	}
	// truncated: close open stories
	for (let g = stack.length - 1; g > 0; g--) {
		const open = stack[g]!.story;
		if (open && open !== stack[g - 1]!.story) closeStory(open);
	}
	if (runs.length) flush();
	closeTable();
	return readDoc(
		{
			...buildDoc(
				name,
				setup,
				body,
				secs,
				sectionAt,
				hyphenate,
				lang,
			),
			notes,
		},
		pictures,
	);
}

const tw = (pt: number) => Math.round(pt * 20);

const HEX = Array.from({ length: 256 }, (_, i) =>
	i.toString(16).padStart(2, '0'),
);

const esc = (s: string) =>
	s.replace(/[\\{}]/g, '\\$&').replace(/[\u0080-\uffff]/g, (c) => {
		const n = c.charCodeAt(0);
		return `\\u${n > 0x7fff ? n - 0x10000 : n}?`;
	});

const fontClass = (f: FamilyId) =>
	/mono|typewriter/.test(f)
		? 'fmodern'
		: f.includes('serif')
			? 'froman'
			: 'fswiss';

/** One char per byte, so RTF code pages can decode raw high bytes. */
export function byteString(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return s;
}

function indexer<T>(): [Map<T, number>, (v: T) => number] {
	const map = new Map<T, number>();
	return [map, (v) => map.get(v) ?? map.set(v, map.size).size - 1];
}

const SIDE_WORDS: Record<keyof Borders, string> = {
	top: 'brdrt',
	bottom: 'brdrb',
	left: 'brdrl',
	right: 'brdrr',
};

const edges = (b: Borders = {}) =>
	Object.entries(b) as [keyof Borders, BorderEdge][];

/** Writes RTF that Word 2000, TextEdit and LibreOffice read; contents show the page labels given, such as Layout.labels. */
export function docToRtf(doc: WriteDoc, labels?: Map<string, string>): string {
	const [families, family] = indexer<FamilyId>();
	const [colours, colour] = indexer<string>();
	family('source-serif-4');
	const chars = new Map<Paragraph, ResolvedChar[]>();
	for (const b of allParas(doc)) {
		chars.set(
			b,
			b.runs.map((r) => {
				const c = resolveChar(b.style, r.props);
				family(c.font);
				colour(c.colour);
				if (c.highlight) colour(c.highlight);
				return c;
			}),
		);
		const p = resolvePara(b.style, b.props);
		for (const [, e] of edges(p.border)) colour(e.colour);
		if (p.shading) colour(p.shading);
	}
	for (const b of doc.blocks)
		if (b.kind === 'table') {
			colour(b.border.colour);
			for (const row of b.rows)
				for (const c of row)
					if (c.shading) colour(c.shading);
		}
	const { width, height, margins } = doc.setup;
	const out = [
		'{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1',
		`{\\fonttbl${[...families.keys()].map((f, i) => `{\\f${i}\\${fontClass(f)}\\fcharset0 ${esc(FAMILIES[f].label)};}`).join('')}}`,
		`{\\colortbl;${[...colours.keys()]
			.map((c) => {
				const [r, g, b] = hexToRgb(c) ?? [0, 0, 0];
				return `\\red${r}\\green${g}\\blue${b};`;
			})
			.join('')}}`,
		`{\\stylesheet${STYLE_IDS.map((id, i) => `{\\s${i} ${STYLE_NAMES[id]};}`).join('')}}`,
		`\\paperw${tw(width)}\\paperh${tw(height)}\\margl${tw(margins.left)}\\margr${tw(margins.right)}\\margt${tw(margins.top)}\\margb${tw(margins.bottom)}`,
		`\\deflang${doc.setup.lang === 'de' ? 1031 : 1033}${doc.setup.hyphenate ? '\\hyphauto1' : ''}\\fet2\\ftnnar\\aftnnrlc\\aenddoc`,
	];
	const ci = (c: string) => colours.get(c)! + 1;
	const fieldText: Record<FieldKind, string> = {
		page: '1',
		pages: '1',
		section: '1',
		date: fieldDate(doc.created, doc.setup.lang),
		title: doc.name,
		figure: '',
	};
	const figures = figureNumbers(doc);
	const word = figureWord(doc);
	const pict = (image: ImageRef) => {
		const a = doc.images?.[image.id];
		if (!a) return '';
		const rows: string[] = [];
		for (let i = 0; i < a.bytes.length; i += 64)
			rows.push(
				Array.from(
					a.bytes.subarray(i, i + 64),
					(b) => HEX[b],
				).join(''),
			);
		return `{\\pict\\${a.mime === 'image/png' ? 'pngblip' : 'jpegblip'}\\picw${a.width}\\pich${a.height}\\picwgoal${tw(image.w)}\\pichgoal${tw(image.h)}\n${rows.join('\n')}}`;
	};
	const run = (c: ResolvedChar, text: string, figure: () => string) => {
		const fmt = `\\f${families.get(c.font)}\\fs${Math.round(c.size * 2)}${c.bold ? '\\b' : ''}${c.italic ? '\\i' : ''}${c.underline ? '\\ul' : ''}${c.strike ? '\\strike' : ''}${c.script ? `\\${c.script}` : ''}\\cf${ci(c.colour)}${c.highlight ? `\\highlight${ci(c.highlight)}` : ''}`;
		const chars = () => [...text].filter((ch) => ch === FIELD_CHAR);
		if (c.image)
			return chars()
				.map(() => `{${fmt}${pict(c.image!)}}`)
				.join('');
		if (c.note) {
			const paras = doc.notes?.[c.note.id] ?? [];
			const counters: number[] = [];
			const body = paras
				.map((p, i) =>
					paraRtf(
						p,
						counters,
						false,
						i < paras.length - 1
							? '\\par'
							: '',
						i ? '' : '{\\super\\chftn} ',
					),
				)
				.join('\n');
			return `{${fmt}\\super\\chftn}{\\footnote${c.note.kind === 'end' ? '\\ftnalt' : ''}\n${body}}`;
		}
		if (c.field === 'figure')
			return chars()
				.map(
					() =>
						`{${fmt} ${esc(word)} }{\\field{\\*\\fldinst ${FIELD_INST.figure}}{\\fldrslt {${fmt} ${figure()}}}}`,
				)
				.join('');
		if (c.field)
			return chars()
				.map(
					() =>
						`{\\field{\\*\\fldinst ${FIELD_INST[c.field!]}}{\\fldrslt {${fmt} ${esc(fieldText[c.field!])}}}}`,
				)
				.join('');
		const s = `{${fmt} ${esc(text)}}`;
		return c.link
			? `{\\field{\\*\\fldinst HYPERLINK "${esc(c.link)}"}{\\fldrslt ${s}}}`
			: s;
	};
	const paraRtf = (
		b: Paragraph,
		counters: number[],
		intbl = false,
		end = '\\par',
		lead = '',
	) => {
		const p = resolvePara(b.style, b.props);
		let s = '';
		let pn = '';
		const list = p.list;
		if (list) {
			counters.length = list.level + 1;
			const n = (counters[list.level] ?? 0) + 1;
			counters[list.level] = n;
			const bullet = list.kind === 'bullet';
			s = `{\\listtext ${bullet ? '\\u8226?' : `${n}.`}\\tab}`;
			pn = `\\ilvl${list.level}{\\*\\pn${bullet ? '\\pnlvlblt' : '\\pnlvlbody\\pndec'}\\ilvl${list.level}\\pnstart1{${bullet ? '\\pntxtb \\u8226?' : '\\pntxta .'}}}`;
		} else counters.length = 0;
		let box = '';
		for (const [side, e] of edges(p.border))
			box += `\\${SIDE_WORDS[side]}\\brdrs\\brdrw${tw(e.width)}\\brdrcf${ci(e.colour)}`;
		if (p.shading) box += `\\cbpat${ci(p.shading)}`;
		const keep = `${p.keepNext ? '\\keepn' : ''}${p.widow === false ? '\\nowidctlpar' : '\\widctlpar'}`;
		s += `\\pard\\plain${intbl ? '\\intbl' : ''}\\s${STYLE_IDS.indexOf(b.style)}\\${ALIGN_WORDS[p.align]}\\li${tw(p.indent)}\\fi${tw(p.firstLine)}\\sb${tw(p.spaceBefore)}\\sa${tw(p.spaceAfter)}\\sl${Math.round(p.lineSpacing * 240)}\\slmult1${keep}${box}${pn}`;
		s += lead;
		const cs = chars.get(b)!;
		const first = figures.get(b);
		let k = 0;
		// stories show no number
		const figure = () =>
			first === undefined ? '' : String(first + k++);
		b.runs.forEach((r, ri) => {
			if (r.text) s += run(cs[ri]!, r.text, figure);
		});
		return s + end;
	};
	const tableRtf = (t: Table) => {
		const grid = gridOf(t);
		const { kind, width, colour: c } = t.border;
		const bw = `\\brdrs\\brdrw${tw(width)}\\brdrcf${ci(c)}`;
		const m = t.rows.length;
		const n = t.cols.length;
		let x = 0;
		const xs = t.cols.map((w) => tw((x += w)));
		return t.rows
			.map((row, r) => {
				let def = `\\trowd\\trgaph${tw(CELL_PAD_X)}\\trleft0${t.header && r === 0 ? '\\trhdr' : ''}`;
				if (kind !== 'none')
					for (const side of kind === 'all'
						? 'tlbrhv'
						: 'tlbr')
						def += `\\trbrdr${side}${bw}`;
				row.forEach((_, col) => {
					const s = spanOf(t, r, col);
					if (s.r1 > s.r0)
						def +=
							r === s.r0
								? '\\clvmgf'
								: '\\clvmrg';
					if (s.c1 > s.c0)
						def +=
							col === s.c0
								? '\\clmgf'
								: '\\clmrg';
					for (const side of 'tlbr')
						if (
							kind === 'all' ||
							(kind === 'outer' &&
								((side ===
									't' &&
									r ===
										0) ||
									(side ===
										'b' &&
										r ===
											m -
												1) ||
									(side ===
										'l' &&
										col ===
											0) ||
									(side ===
										'r' &&
										col ===
											n -
												1)))
						)
							def += `\\clbrdr${side}${bw}`;
					const shade = grid[r]![col]!.shading;
					if (shade)
						def += `\\clcbpat${ci(shade)}`;
					def += `\\cellx${xs[col]}`;
				});
				const cells = row.map((cell) => {
					if (cell.covered)
						return '\\pard\\plain\\intbl\\cell';
					const counters: number[] = [];
					return cell.paras
						.map((p, i) =>
							paraRtf(
								p,
								counters,
								true,
								i ===
									cell
										.paras
										.length -
										1
									? '\\cell'
									: '\\par',
							),
						)
						.join('\n');
				});
				return `${def}\n${cells.join('\n')}\n\\row`;
			})
			.join('\n');
	};
	const sectionRtf = (setup: Setup, prev?: Setup) => {
		const m = setup.margins;
		let s = `\\sectd\\pgwsxn${tw(setup.width)}\\pghsxn${tw(setup.height)}\\marglsxn${tw(m.left)}\\margrsxn${tw(m.right)}\\margtsxn${tw(m.top)}\\margbsxn${tw(m.bottom)}`;
		const cols = setup.columns ?? 1;
		if (cols > 1)
			s += `\\cols${cols}\\colsx${tw(setup.gutter ?? DEFAULT_GUTTER)}`;
		if (setup.titlePage) s += '\\titlepg';
		if (setup.valign)
			s +=
				setup.valign === 'centre'
					? '\\vertalc'
					: '\\vertalb';
		s += `\\${NUMBER_OUT[setup.numbering ?? 'decimal']}`;
		if (setup.restart !== undefined)
			s += `\\pgnstarts${setup.restart}\\pgnrestart`;
		for (const part of STORY_PARTS) {
			const story = setup[part];
			if (!story?.length) {
				// word inherits it otherwise
				if (prev?.[part]?.length)
					s += `\n{\\${STORY_WORDS[part]} \\pard\\plain\\par}`;
				continue;
			}
			const counters: number[] = [];
			s += `\n{\\${STORY_WORDS[part]} ${story.map((p) => paraRtf(p, counters)).join('\n')}}`;
		}
		return s;
	};
	const right = tw(width - margins.left - margins.right);
	const tocRtf = (t: Toc) => {
		const entries = contentsOf(doc, t).map((e) => {
			const label =
				labels?.get(doc.blocks[e.block]!.id) ?? '';
			return `\\pard\\plain\\s${STYLE_IDS.indexOf('body')}\\li${tw(e.level * LIST_STEP)}\\tqr\\tldot\\tx${right} ${esc(e.text)}\\tab ${esc(label)}\\par`;
		});
		return `{\\field{\\*\\fldinst TOC \\\\o "1-${t.levels}" \\\\h}{\\fldrslt ${entries.join('\n')}}}`;
	};
	out.push(sectionRtf(doc.setup));
	const counters: number[] = [];
	let prev = doc.setup;
	for (const b of doc.blocks) {
		if (b.kind === 'para') out.push(paraRtf(b, counters));
		else if (b.kind === 'table') out.push(tableRtf(b));
		else if (b.kind === 'toc') out.push(tocRtf(b));
		else if (b.kind === 'section') {
			out.push(`\\sect${sectionRtf(b.setup, prev)}`);
			prev = b.setup;
		} else out.push(b.kind === 'column' ? '\\column' : '\\page');
	}
	return out.join('\n') + '\n}';
}
