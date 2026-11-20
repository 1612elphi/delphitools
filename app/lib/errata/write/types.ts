import type { PageObject } from 'delphitools-v2/lib/errata/doc-model';

// lengths in pt

export type FamilyId =
	| 'source-serif-4'
	| 'inter'
	| 'jost'
	| 'oswald'
	| 'ibm-plex-mono'
	| 'cmu-serif'
	| 'cmu-sans'
	| 'cmu-typewriter';

export type StyleId =
	'title' | 'h1' | 'h2' | 'h3' | 'body' | 'quote' | 'caption' | 'note';

export type Align = 'left' | 'centre' | 'right' | 'justify';

export type FieldKind =
	'page' | 'pages' | 'date' | 'title' | 'section' | 'figure';

export type Wrap = 'square' | 'top-bottom' | 'behind' | 'front';

/** Position of a floating image: x from the column's left, y from its anchor paragraph's top. */
export interface ImageFloat {
	wrap: Wrap;
	/** where text flows beside a square float; both takes the wider side */
	side: 'left' | 'right' | 'both';
	/** space kept clear around the float */
	distance: number;
	x: number;
	y: number;
}

/** An image character: display size in pt; a float's text position is only its anchor. */
export interface ImageRef {
	/** key in WriteDoc.images */
	id: string;
	w: number;
	h: number;
	float?: ImageFloat;
}

/** A footnote or endnote reference character; the note is WriteDoc.notes[id]. */
export interface NoteRef {
	id: string;
	kind: 'foot' | 'end';
}

/** Image bytes a document holds; PNG and JPEG only. */
export interface ImageAsset {
	mime: 'image/png' | 'image/jpeg';
	bytes: Uint8Array;
	/** pixels */
	width: number;
	height: number;
}

/** The character a field occupies in run text. */
export const FIELD_CHAR = '￼';
export const SOFT_HYPHEN = '­';

/** Character formatting. On a run these are overrides of the style. */
export interface CharProps {
	font?: FamilyId;
	size?: number;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	script?: 'super' | 'sub';
	/** css hex, #rrggbb */
	colour?: string;
	highlight?: string;
	/** http, https or mailto URL, see normaliseLink */
	link?: string;
	/** on a run of FIELD_CHAR only; each character is one field */
	field?: FieldKind;
	/** on a run of FIELD_CHAR only; each character is one image */
	image?: ImageRef;
	/** on a run of one FIELD_CHAR, in a body paragraph only */
	note?: NoteRef;
}

type CharExtras = 'script' | 'highlight' | 'link' | 'field' | 'image' | 'note';

export type ResolvedChar = Required<Omit<CharProps, CharExtras>> &
	Pick<CharProps, CharExtras>;

export interface ListProps {
	kind: 'bullet' | 'number';
	/** 0-based nesting */
	level: number;
}

export interface BorderEdge {
	width: number;
	colour: string;
}

export interface Borders {
	top?: BorderEdge;
	bottom?: BorderEdge;
	left?: BorderEdge;
	right?: BorderEdge;
}

export interface ParaProps {
	align?: Align;
	/** multiple of the font's line height */
	lineSpacing?: number;
	spaceBefore?: number;
	spaceAfter?: number;
	/** left indent */
	indent?: number;
	/** first-line offset, negative hangs */
	firstLine?: number;
	list?: ListProps;
	border?: Borders;
	shading?: string;
	/** never the last paragraph of a page or column */
	keepNext?: boolean;
	/** widow and orphan control */
	widow?: boolean;
}

type ParaExtras = 'list' | 'border' | 'shading' | 'keepNext' | 'widow';

export type ResolvedPara = Required<Omit<ParaProps, ParaExtras>> &
	Pick<ParaProps, ParaExtras>;

export interface Run {
	text: string;
	props: CharProps;
}

export interface Paragraph {
	kind: 'para';
	id: string;
	style: StyleId;
	props: ParaProps;
	/** never empty: an empty paragraph holds one run with text '' */
	runs: Run[];
	/** stored now so RTL can come later */
	dir: 'ltr';
}

/** A page break, or with kind 'column' a column break. */
export interface PageBreak {
	kind: 'break' | 'column';
	id: string;
}

/** Starts a new section on a new page; blocks up to the next one use its setup. */
export interface SectionBreak {
	kind: 'section';
	id: string;
	setup: Setup;
}

/** One grid position of a table. */
export interface TableCell {
	/** never empty */
	paras: Paragraph[];
	/** on the top-left cell of a merge only */
	colspan?: number;
	rowspan?: number;
	/** inside another cell's merge; never laid out */
	covered?: boolean;
	shading?: string;
}

export interface TableBorder {
	kind: 'all' | 'outer' | 'none';
	width: number;
	colour: string;
}

/** A table; it never holds tables, breaks or sections. */
export interface Table {
	kind: 'table';
	id: string;
	/** column widths in pt, scaled to the text column by layout */
	cols: number[];
	/** every row has cols.length cells */
	rows: TableCell[][];
	/** the first row repeats on each page */
	header?: boolean;
	border: TableBorder;
}

/** A table of contents of the outline; one unit for the caret, like a break. */
export interface Toc {
	kind: 'toc';
	id: string;
	/** outline levels listed: 1 h1, 2 adds h2, 3 adds h3 */
	levels: number;
	/** only headings after the contents */
	after?: boolean;
}

export type Block = Paragraph | PageBreak | SectionBreak | Table | Toc;

export type NumberStyle = 'decimal' | 'roman' | 'ROMAN' | 'alpha';

/** A header or footer slot of a section. */
export type StoryPart = 'header' | 'footer' | 'firstHeader' | 'firstFooter';

export const STORY_PARTS: StoryPart[] = [
	'header',
	'footer',
	'firstHeader',
	'firstFooter',
];

/** Page setup of one section; the document's setup is section 1. */
export interface Setup {
	width: number;
	height: number;
	margins: { top: number; right: number; bottom: number; left: number };
	/** where the text sits when it leaves the page short; absent is top */
	valign?: 'centre' | 'bottom';
	/** 1-3, default 1 */
	columns?: number;
	gutter?: number;
	header?: Paragraph[];
	footer?: Paragraph[];
	/** different first page: firstHeader and firstFooter on page one */
	titlePage?: boolean;
	firstHeader?: Paragraph[];
	firstFooter?: Paragraph[];
	numbering?: NumberStyle;
	/** page number of the section's first page; absent continues */
	restart?: number;
	/** read from the document setup only */
	lang?: 'en' | 'de';
	hyphenate?: boolean;
}

export interface WriteDoc {
	version: 1;
	name: string;
	/** ISO date the date field shows */
	created?: string;
	setup: Setup;
	blocks: Block[];
	/** image bytes by id; never changed in place */
	images?: Record<string, ImageAsset>;
	/** marks drawn over each page, by page index; pages past the end keep theirs */
	overlays?: PageObject[][];
	/** footnote and endnote text by id, never empty; each has one reference */
	notes?: Record<string, Paragraph[]>;
}

export interface Style {
	id: StyleId;
	char: ResolvedChar;
	para: ResolvedPara;
	/** style of the paragraph Enter creates */
	next: StyleId;
}

/** offset counts UTF-16 units in the paragraph's joined run text; 0 on a break */
export interface Pos {
	block: number;
	offset: number;
}

export interface Selection {
	anchor: Pos;
	focus: Pos;
	/** a wrap offset drawn at the end of the earlier line */
	focusAffinity?: 'up';
}

/** A face file chosen for one character. */
export interface GlyphPick {
	/** file name in public/fonts/write */
	file: string;
	/** advance in em */
	advance: number;
}

export interface Metrics {
	/** first face file of the family/weight/style that has the character */
	pick(
		family: FamilyId,
		bold: boolean,
		italic: boolean,
		ch: string,
	): GlyphPick;
}

/** one font file, one set of char props, inside one line */
export interface Span {
	text: string;
	/** paragraph offset of text[0] */
	start: number;
	/** absolute page x of each UTF-16 unit's left edge; length text.length + 1 */
	xs: number[];
	file: string;
	size: number;
	/** baseline shift for super/subscript, positive is up */
	rise: number;
	char: ResolvedChar;
	/** drawn instead of text: a field's value */
	shown?: string;
	/** x of each unit of shown, length shown.length + 1 */
	shownXs?: number[];
	/** an inline image drawn from xs[0] up from the baseline */
	image?: ImageRef;
	/** a float's anchor character: nothing drawn */
	anchor?: true;
}

export interface Line {
	block: number;
	/** paragraph offsets covered, end exclusive */
	start: number;
	end: number;
	/** page coordinates, top-left origin */
	top: number;
	baseline: number;
	height: number;
	/** content box: left edge and width available */
	left: number;
	width: number;
	spans: Span[];
	/** bullet or number drawn before the first line of a list item */
	marker?: Span;
	/** hyphen drawn after the last glyph */
	hyphen?: Span;
	/** space above it a float keeps clear: the paragraph's top is top - skip on its first line */
	skip?: number;
	/** zero-width line of a page, column or section break; a table's or contents' slice on a page */
	kind?: 'break' | 'table' | 'toc';
	/** column index, absent is 0 */
	col?: number;
	/** a footnote or endnote line: block is the paragraph in the note */
	note?: string;
}

/** A paragraph border and shading rectangle. */
export interface ParaBox {
	x: number;
	y: number;
	w: number;
	h: number;
	fill?: string;
	border?: Borders;
}

/** A floating image placed on a page; h includes a caption drawn inside the box. */
export interface FloatBox {
	/** the anchor paragraph and the image character's offset */
	block: number;
	offset: number;
	image: ImageRef;
	x: number;
	y: number;
	w: number;
	/** of the image, without its caption */
	h: number;
	/** of the whole box */
	boxH: number;
	col: number;
}

/** A table cell's slice on a page. */
export interface CellBox {
	/** block index of the table */
	block: number;
	row: number;
	col: number;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Line.block is the paragraph index in the cell */
	lines: Line[];
	/** a header row drawn again on a later page */
	repeat?: boolean;
}

export interface PageBox {
	index: number;
	width: number;
	height: number;
	lines: Line[];
	content: { left: number; top: number; width: number; height: number };
	/** 0-based section ordinal */
	section: number;
	/** block index of the section break that starts the section, -1 for the document setup */
	sectionBlock: number;
	/** column boxes, left to right */
	cols: { left: number; width: number }[];
	/** paragraph decoration, then table shading and rules */
	boxes: ParaBox[];
	cells: CellBox[];
	/** floating images, in anchor order */
	floats: FloatBox[];
	header: Line[];
	footer: Line[];
	/** footnote lines at each column foot, then endnote lines */
	notes: Line[];
	/** contents entries; Line.block is the heading's block */
	toc: Line[];
	headerPart: StoryPart;
	footerPart: StoryPart;
	/** page number text in the section's numbering */
	label: string;
}

export interface Layout {
	pages: PageBox[];
	/** page label of each heading by paragraph id, when the document has contents */
	labels?: Map<string, string>;
}
