import type {
	PageObject,
	TextObject,
} from 'delphitools-v2/lib/errata/doc-model';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { clamp } from 'delphicanon/lib/number';
import { FAMILIES } from 'delphitools-v2/lib/errata/write/fonts';
import {
	allParas,
	emptyPara,
	imageIds,
	maxMargin,
	normaliseDoc,
	normaliseLink,
	tidyOverlays,
} from 'delphitools-v2/lib/errata/write/model';
import {
	IMAGE_ID,
	MAX_IMAGE_BYTES,
	MAX_IMAGES_BYTES,
	fit,
	sniffImage,
} from 'delphitools-v2/lib/errata/write/image';
import { STYLES } from 'delphitools-v2/lib/errata/write/styles';
import { NUMBER_STYLES } from 'delphitools-v2/lib/errata/write/layout';
import {
	MAX_COLS,
	MAX_ROWS,
	fromGrid,
	gridOf,
} from 'delphitools-v2/lib/errata/write/table';
import {
	FIELD_CHAR,
	STORY_PARTS,
	type Block,
	type BorderEdge,
	type Borders,
	type CharProps,
	type FamilyId,
	type FieldKind,
	type ImageAsset,
	type ImageFloat,
	type ImageRef,
	type Paragraph,
	type ParaProps,
	type Run,
	type Setup,
	type StyleId,
	type Table,
	type TableCell,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

export const ATA_MIME = 'application/x-errata-document';

const MAX_JSON = 64 * 1024 * 1024;
const FAMILY_IDS = Object.keys(FAMILIES) as FamilyId[];
const STYLE_IDS = Object.keys(STYLES) as StyleId[];
const ALIGNS = ['left', 'centre', 'right', 'justify'] as const;
const HEX = /^#[0-9a-f]{6}$/i;
const FIELDS: FieldKind[] = [
	'page',
	'pages',
	'date',
	'title',
	'section',
	'figure',
];
const WRAPS = ['square', 'top-bottom', 'behind', 'front'] as const;
const MAX_NOTES = 4096;
const MAX_NOTE_PARAS = 1000;
const NOTE_ID = /^[\w-]{1,64}$/;
const IMAGE_ENTRY = new RegExp(
	`^images/(${IMAGE_ID.source.slice(1, -1)})\\.(png|jpg)$`,
);
const MARK_ENTRY = /^marks\/(\d{1,6}\.(?:png|jpg))$/;
const DATA_URL = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/;
const EXT: Record<ImageAsset['mime'], string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
};

/** Caps on the images of an untrusted file. */
export interface ImageLimits {
	each: number;
	total: number;
}

const LIMITS: ImageLimits = { each: MAX_IMAGE_BYTES, total: MAX_IMAGES_BYTES };

/** Admits byte sizes while each and the running total stay within limits. */
export function imageBudget(limits = LIMITS): (size: number) => boolean {
	let total = 0;
	return (size) => {
		if (size > limits.each || total + size > limits.total)
			return false;
		total += size;
		return true;
	};
}
const SIDES = ['top', 'bottom', 'left', 'right'] as const;
const NOT_FIELD = /[^\uFFFC]/g;
// untrusted run text
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

export class AtaError extends Error {
	override name = 'AtaError';
}

type Files = Parameters<typeof zipSync>[0];

function packOverlays(
	overlays: readonly PageObject[][],
	files: Files,
): unknown[][] {
	const names = new Map<string, string>();
	return overlays.map((page) =>
		page.flatMap((o): unknown[] => {
			if (o.kind !== 'image') return [o];
			const { dataUrl, ...mark } = o;
			let name = names.get(dataUrl);
			if (!name) {
				const m = DATA_URL.exec(dataUrl);
				if (!m) return [];
				name = `${names.size}.${m[1] === 'image/png' ? 'png' : 'jpg'}`;
				names.set(dataUrl, name);
				files[`marks/${name}`] = [
					Uint8Array.from(atob(m[2]!), (c) =>
						c.charCodeAt(0),
					),
					{ level: 0 },
				];
			}
			return [{ ...mark, src: name }];
		}),
	);
}

/** The zip: mimetype, document.json without image bytes, the images the document uses as images/<id>.png|jpg, and mark images as marks/<n>.png|jpg. */
export function saveAta(doc: WriteDoc): Uint8Array {
	const { images, overlays, ...rest } = doc;
	const files: Files = { mimetype: [strToU8(ATA_MIME), { level: 0 }] };
	const json = overlays
		? { ...rest, overlays: packOverlays(overlays, files) }
		: rest;
	files['document.json'] = strToU8(JSON.stringify(json));
	for (const id of imageIds(allParas(doc))) {
		const asset = images?.[id];
		// already compressed
		if (asset)
			files[`images/${id}.${EXT[asset.mime]}`] = [
				asset.bytes,
				{ level: 0 },
			];
	}
	return zipSync(files);
}

/** Parses and sanitises an untrusted .ata file; throws AtaError. Images over the limits, or not PNG or JPEG by their bytes, drop with the characters that show them. */
export function openAta(bytes: Uint8Array, limits = LIMITS): WriteDoc {
	let files;
	const admit = imageBudget(limits);
	try {
		files = unzipSync(bytes, {
			filter: (f) => {
				if (
					f.name === 'mimetype' ||
					f.name === 'document.json'
				)
					return f.originalSize <= MAX_JSON;
				return (
					(IMAGE_ENTRY.test(f.name) ||
						MARK_ENTRY.test(f.name)) &&
					admit(f.originalSize)
				);
			},
		});
	} catch {
		throw new AtaError('zip');
	}
	const images: Record<string, Uint8Array> = {};
	const marks: Record<string, Uint8Array> = {};
	for (const [name, data] of Object.entries(files)) {
		const id = IMAGE_ENTRY.exec(name)?.[1];
		if (id) images[id] = data;
		const mark = MARK_ENTRY.exec(name)?.[1];
		if (mark) marks[mark] = data;
	}
	if (!files.mimetype || strFromU8(files.mimetype) !== ATA_MIME)
		throw new AtaError('mimetype');
	if (!files['document.json']) throw new AtaError('document');
	let raw: unknown;
	try {
		raw = JSON.parse(strFromU8(files['document.json']));
	} catch {
		throw new AtaError('json');
	}
	return readDoc(raw, images, marks);
}

// mime from bytes
function readImages(
	raw: Record<string, Uint8Array>,
): Record<string, ImageAsset> {
	const out: Record<string, ImageAsset> = {};
	for (const [id, bytes] of Object.entries(raw)) {
		const asset = IMAGE_ID.test(id) ? sniffImage(bytes) : null;
		if (asset) out[id] = asset;
	}
	return out;
}

interface Ctx {
	ids: Set<string>;
	images: Record<string, ImageAsset>;
	box: { w: number; h: number };
	notes: Map<string, Paragraph[]>;
	used: Set<string>;
	refs: boolean;
}

const contentBox = (setup: Setup) => ({
	w: setup.width - setup.margins.left - setup.margins.right,
	h: setup.height - setup.margins.top - setup.margins.bottom,
});

type Obj = Record<string, unknown>;

function obj(v: unknown, at: string): Obj {
	if (typeof v !== 'object' || v === null || Array.isArray(v))
		throw new AtaError(at);
	return v as Obj;
}

function str(v: unknown, at: string): string {
	if (typeof v !== 'string') throw new AtaError(at);
	return v;
}

function num(v: unknown, min: number, max: number, at: string): number {
	if (typeof v !== 'number' || !Number.isFinite(v))
		throw new AtaError(at);
	return clamp(v, min, max);
}

function oneOf<T extends string>(
	v: unknown,
	list: readonly T[],
	at: string,
): T {
	if (!list.includes(v as T)) throw new AtaError(at);
	return v as T;
}

function bool(v: unknown, at: string): boolean {
	if (typeof v !== 'boolean') throw new AtaError(at);
	return v;
}

function hex(v: unknown, at: string): string {
	if (typeof v !== 'string' || !HEX.test(v)) throw new AtaError(at);
	return v;
}

/** Sanitises an untrusted document object, its image bytes by id and its mark image bytes by entry name, already within the size limits; throws AtaError. */
export function readDoc(
	v: unknown,
	rawImages: Record<string, Uint8Array> = {},
	rawMarks: Record<string, Uint8Array> = {},
): WriteDoc {
	const o = obj(v, 'doc');
	if (o.version !== 1) throw new AtaError('version');
	const blocks = o.blocks;
	if (!Array.isArray(blocks)) throw new AtaError('blocks');
	const images = readImages(rawImages);
	const ctx: Ctx = {
		ids: new Set(),
		images,
		box: { w: Infinity, h: Infinity },
		notes: new Map(),
		used: new Set(),
		refs: false,
	};
	const setup = readSetup(o.setup, 'setup', ctx);
	ctx.box = contentBox(setup);
	if (o.notes !== undefined)
		for (const [id, paras] of Object.entries(obj(o.notes, 'notes')))
			if (NOTE_ID.test(id) && ctx.notes.size < MAX_NOTES) {
				const at = `notes.${id}`;
				if (!Array.isArray(paras))
					throw new AtaError(at);
				const read = readStory(
					paras.slice(0, MAX_NOTE_PARAS),
					at,
					ctx,
				);
				ctx.notes.set(
					id,
					read.length
						? read
						: [emptyPara('note')],
				);
			}
	ctx.refs = true;
	const doc = normaliseDoc({
		version: 1,
		name: str(o.name, 'name'),
		setup,
		blocks: blocks.map((b, i) => readBlock(b, `blocks.${i}`, ctx)),
	});
	if (ctx.used.size)
		doc.notes = Object.fromEntries(
			[...ctx.used].map((id) => [id, ctx.notes.get(id)!]),
		);
	if (Object.keys(images).length) doc.images = images;
	if (o.overlays !== undefined) {
		const overlays = readOverlays(o.overlays, 'overlays', rawMarks);
		if (overlays) doc.overlays = overlays;
	}
	if (
		typeof o.created === 'string' &&
		Number.isFinite(Date.parse(o.created))
	)
		doc.created = o.created;
	return doc;
}

function readStory(v: unknown, at: string, ctx: Ctx): Paragraph[] {
	if (!Array.isArray(v)) throw new AtaError(at);
	const refs = ctx.refs;
	ctx.refs = false;
	const paras = v.map((b, i) => {
		if (obj(b, `${at}.${i}`).kind !== 'para')
			throw new AtaError(`${at}.${i}.kind`);
		return readBlock(b, `${at}.${i}`, ctx) as Paragraph;
	});
	ctx.refs = refs;
	return paras;
}

function readCell(v: unknown, at: string, ctx: Ctx): TableCell {
	const o = obj(v, at);
	const paras = readStory(o.paras, `${at}.paras`, ctx);
	const cell: TableCell = { paras: paras.length ? paras : [emptyPara()] };
	for (const k of ['colspan', 'rowspan'] as const) {
		const n =
			o[k] === undefined
				? 1
				: Math.round(
						num(
							o[k],
							1,
							MAX_ROWS,
							`${at}.${k}`,
						),
					);
		if (n > 1) cell[k] = n;
	}
	if (o.shading !== undefined)
		cell.shading = hex(o.shading, `${at}.shading`);
	return cell;
}

function readTable(o: Obj, at: string, id: string, ctx: Ctx): Table {
	if (!Array.isArray(o.cols) || !o.cols.length)
		throw new AtaError(`${at}.cols`);
	if (!Array.isArray(o.rows) || !o.rows.length)
		throw new AtaError(`${at}.rows`);
	const cols = o.cols
		.slice(0, MAX_COLS)
		.map((w, i) => num(w, 1, 14400, `${at}.cols.${i}`));
	const n = cols.length;
	const rows = o.rows.slice(0, MAX_ROWS).map((row, r) => {
		if (!Array.isArray(row)) throw new AtaError(`${at}.rows.${r}`);
		return Array.from({ length: n }, (_, c) =>
			row[c] === undefined
				? { paras: [emptyPara()] }
				: readCell(row[c], `${at}.rows.${r}.${c}`, ctx),
		);
	});
	const b = obj(o.border, `${at}.border`);
	const table: Table = {
		kind: 'table',
		id,
		cols,
		rows,
		border: {
			kind: oneOf(
				b.kind,
				['all', 'outer', 'none'] as const,
				`${at}.border.kind`,
			),
			width: num(b.width, 0.25, 12, `${at}.border.width`),
			colour: hex(b.colour, `${at}.border.colour`),
		},
	};
	if (o.header !== undefined && bool(o.header, `${at}.header`))
		table.header = true;
	return fromGrid(table, gridOf(table));
}

function readSetup(v: unknown, at: string, ctx: Ctx): Setup {
	const o = obj(v, at);
	const m = obj(o.margins, `${at}.margins`);
	const width = num(o.width, 72, 14400, `${at}.width`);
	const height = num(o.height, 72, 14400, `${at}.height`);
	const side = (key: keyof Setup['margins']) =>
		num(
			m[key],
			0,
			maxMargin({ width, height }, key),
			`${at}.margins.${key}`,
		);
	const setup: Setup = {
		width,
		height,
		margins: {
			top: side('top'),
			right: side('right'),
			bottom: side('bottom'),
			left: side('left'),
		},
	};
	if (o.columns !== undefined)
		setup.columns = Math.round(
			num(o.columns, 1, 3, `${at}.columns`),
		);
	if (o.gutter !== undefined)
		setup.gutter = num(o.gutter, 0, width / 2, `${at}.gutter`);
	for (const part of STORY_PARTS)
		if (o[part] !== undefined)
			setup[part] = readStory(o[part], `${at}.${part}`, ctx);
	if (o.titlePage !== undefined)
		setup.titlePage = bool(o.titlePage, `${at}.titlePage`);
	if (o.valign !== undefined)
		setup.valign = oneOf(
			o.valign,
			['centre', 'bottom'] as const,
			`${at}.valign`,
		);
	if (o.numbering !== undefined)
		setup.numbering = oneOf(
			o.numbering,
			NUMBER_STYLES,
			`${at}.numbering`,
		);
	if (o.restart !== undefined)
		setup.restart = Math.round(
			num(o.restart, 1, 9999, `${at}.restart`),
		);
	if (o.lang !== undefined)
		setup.lang = oneOf(o.lang, ['en', 'de'] as const, `${at}.lang`);
	if (o.hyphenate !== undefined)
		setup.hyphenate = bool(o.hyphenate, `${at}.hyphenate`);
	return setup;
}

function uniqueId(v: unknown, ids: Set<string>): string {
	const id =
		typeof v === 'string' && v !== '' && !ids.has(v)
			? v
			: crypto.randomUUID();
	ids.add(id);
	return id;
}

function readBlock(v: unknown, at: string, ctx: Ctx): Block {
	const o = obj(v, at);
	const kind = oneOf(
		o.kind,
		['para', 'break', 'column', 'section', 'table', 'toc'] as const,
		`${at}.kind`,
	);
	const id = uniqueId(o.id, ctx.ids);
	if (kind === 'break' || kind === 'column') return { kind, id };
	if (kind === 'toc')
		return {
			kind,
			id,
			levels: Math.round(num(o.levels, 1, 3, `${at}.levels`)),
			...(o.after === true && { after: true }),
		};
	if (kind === 'table') return readTable(o, at, id, ctx);
	if (kind === 'section') {
		const setup = readSetup(o.setup, `${at}.setup`, ctx);
		ctx.box = contentBox(setup);
		return { kind, id, setup };
	}
	if (!Array.isArray(o.runs)) throw new AtaError(`${at}.runs`);
	const runs = o.runs
		.map((r, i) => readRun(r, `${at}.runs.${i}`, ctx))
		.filter(
			(r): r is Run =>
				!!r &&
				(!!r.text ||
					!(
						r.props.field ||
						r.props.image ||
						r.props.note
					)),
		);
	if (!runs.length) runs.push({ text: '', props: {} });
	return {
		kind,
		id,
		style: oneOf(o.style, STYLE_IDS, `${at}.style`),
		props: readPara(o.props, `${at}.props`),
		runs,
		dir: 'ltr',
	};
}

// null: its image dropped
function readRun(v: unknown, at: string, ctx: Ctx): Run | null {
	const o = obj(v, at);
	const props = readChar(o.props, `${at}.props`);
	const raw = obj(o.props, at).image;
	if (raw !== undefined) {
		const image = readImage(raw, `${at}.props.image`, ctx);
		if (!image) return null;
		props.image = image;
		delete props.field;
		delete props.note;
	}
	const text = str(o.text, `${at}.text`).replace(CONTROL, '');
	const note = props.note;
	if (note) {
		// one body reference each
		if (
			!ctx.refs ||
			!ctx.notes.has(note.id) ||
			ctx.used.has(note.id)
		)
			return null;
		const ref = text.replace(NOT_FIELD, '').slice(0, 1);
		if (!ref) return null;
		ctx.used.add(note.id);
		delete props.field;
		return { text: ref, props };
	}
	// objects hold FIELD_CHAR
	return {
		text:
			props.field || props.image
				? text.replace(NOT_FIELD, '')
				: text.replaceAll(FIELD_CHAR, ''),
		props,
	};
}

function readFloat(v: unknown, at: string): ImageFloat {
	const o = obj(v, at);
	return {
		wrap: oneOf(o.wrap, WRAPS, `${at}.wrap`),
		side: oneOf(
			o.side,
			['left', 'right', 'both'] as const,
			`${at}.side`,
		),
		distance: num(o.distance, 0, 144, `${at}.distance`),
		x: num(o.x, 0, 14400, `${at}.x`),
		y: num(o.y, 0, 14400, `${at}.y`),
	};
}

function readImage(v: unknown, at: string, ctx: Ctx): ImageRef | undefined {
	const o = obj(v, at);
	const id = str(o.id, `${at}.id`);
	if (!Object.hasOwn(ctx.images, id)) return undefined;
	const { w, h } = fit(
		num(o.w, 1, 14400, `${at}.w`),
		num(o.h, 1, 14400, `${at}.h`),
		ctx.box.w,
		ctx.box.h,
	);
	const image: ImageRef = { id, w: Math.max(1, w), h: Math.max(1, h) };
	if (o.float !== undefined)
		image.float = readFloat(o.float, `${at}.float`);
	return image;
}

function readChar(v: unknown, at: string): CharProps {
	const o = obj(v, at);
	const p: CharProps = {};
	if (o.font !== undefined)
		p.font = oneOf(o.font, FAMILY_IDS, `${at}.font`);
	if (o.size !== undefined) p.size = num(o.size, 1, 1000, `${at}.size`);
	if (o.bold !== undefined) p.bold = bool(o.bold, `${at}.bold`);
	if (o.italic !== undefined) p.italic = bool(o.italic, `${at}.italic`);
	if (o.underline !== undefined)
		p.underline = bool(o.underline, `${at}.underline`);
	if (o.strike !== undefined) p.strike = bool(o.strike, `${at}.strike`);
	if (o.script !== undefined)
		p.script = oneOf(
			o.script,
			['super', 'sub'] as const,
			`${at}.script`,
		);
	if (o.colour !== undefined) p.colour = hex(o.colour, `${at}.colour`);
	if (o.highlight !== undefined)
		p.highlight = hex(o.highlight, `${at}.highlight`);
	const link = typeof o.link === 'string' ? normaliseLink(o.link) : null;
	if (link) p.link = link;
	if (o.field !== undefined)
		p.field = oneOf(o.field, FIELDS, `${at}.field`);
	if (o.note !== undefined) {
		const n = obj(o.note, `${at}.note`);
		p.note = {
			id: str(n.id, `${at}.note.id`),
			kind: oneOf(
				n.kind,
				['foot', 'end'] as const,
				`${at}.note.kind`,
			),
		};
	}
	return p;
}

function readEdge(v: unknown, at: string): BorderEdge {
	const o = obj(v, at);
	return {
		width: num(o.width, 0.25, 12, `${at}.width`),
		colour: hex(o.colour, `${at}.colour`),
	};
}

function readPara(v: unknown, at: string): ParaProps {
	const o = obj(v, at);
	const p: ParaProps = {};
	if (o.align !== undefined)
		p.align = oneOf(o.align, ALIGNS, `${at}.align`);
	if (o.lineSpacing !== undefined)
		p.lineSpacing = num(o.lineSpacing, 0.5, 5, `${at}.lineSpacing`);
	if (o.spaceBefore !== undefined)
		p.spaceBefore = num(
			o.spaceBefore,
			0,
			1000,
			`${at}.spaceBefore`,
		);
	if (o.spaceAfter !== undefined)
		p.spaceAfter = num(o.spaceAfter, 0, 1000, `${at}.spaceAfter`);
	if (o.indent !== undefined)
		p.indent = num(o.indent, 0, 1000, `${at}.indent`);
	if (o.firstLine !== undefined)
		p.firstLine = num(o.firstLine, -1000, 1000, `${at}.firstLine`);
	if (o.list !== undefined) {
		const l = obj(o.list, `${at}.list`);
		p.list = {
			kind: oneOf(
				l.kind,
				['bullet', 'number'] as const,
				`${at}.list.kind`,
			),
			level: Math.round(
				num(l.level, 0, 8, `${at}.list.level`),
			),
		};
	}
	if (o.border !== undefined) {
		const b = obj(o.border, `${at}.border`);
		const border: Borders = {};
		for (const side of SIDES)
			if (b[side] !== undefined)
				border[side] = readEdge(
					b[side],
					`${at}.border.${side}`,
				);
		if (Object.keys(border).length) p.border = border;
	}
	if (o.shading !== undefined)
		p.shading = hex(o.shading, `${at}.shading`);
	if (o.keepNext !== undefined)
		p.keepNext = bool(o.keepNext, `${at}.keepNext`);
	if (o.widow !== undefined) p.widow = bool(o.widow, `${at}.widow`);
	return p;
}

const MAX_MARK_PAGES = 10000;
const MAX_MARKS = 10000;
const MAX_MARK_TEXT = 10000;
const MAX_PATH = 1024 * 1024;
const MARK_KINDS = ['text', 'ink', 'shape', 'image', 'comment'] as const;
const SHAPES = ['rect', 'ellipse', 'line', 'highlight'] as const;
const PATH = /^[MLHVCSQTAZmlhvcsqtaz0-9.,+\-\s]*$/;
// longest path numeral
const MAX_NUMERAL = 12;
// untrusted mark text
// eslint-disable-next-line no-control-regex
const MARK_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Page marks of an untrusted file, with mark image bytes by entry name: unknown kinds throw, images missing or not PNG or JPEG by their bytes drop. */
export function readOverlays(
	v: unknown,
	at: string,
	rawMarks: Record<string, Uint8Array> = {},
): PageObject[][] | undefined {
	if (!Array.isArray(v)) throw new AtaError(at);
	const ids = new Set<string>();
	const urls = new Map<string, string | null>();
	const urlOf = (name: string) => {
		if (!urls.has(name)) {
			const bytes = Object.hasOwn(rawMarks, name)
				? rawMarks[name]!
				: null;
			const asset = bytes && sniffImage(bytes);
			urls.set(name, asset && dataUrlOf(asset));
		}
		return urls.get(name)!;
	};
	let left = MAX_MARKS;
	const pages = v.slice(0, MAX_MARK_PAGES).map((p, i) => {
		if (!Array.isArray(p)) throw new AtaError(`${at}.${i}`);
		const marks = p.slice(0, left).flatMap((m, j) => {
			const mark = readMark(m, `${at}.${i}.${j}`, ids, urlOf);
			return mark ? [mark] : [];
		});
		left -= Math.min(p.length, left);
		return marks;
	});
	return tidyOverlays(pages);
}

function markText(v: unknown, at: string, max = MAX_MARK_TEXT): string {
	return str(v, at).slice(0, max).replace(MARK_CONTROL, '');
}

function dataUrlOf(asset: ImageAsset): string {
	let bin = '';
	// spread argument limit
	for (let i = 0; i < asset.bytes.length; i += 0x8000)
		bin += String.fromCharCode(
			...asset.bytes.subarray(i, i + 0x8000),
		);
	return `data:${asset.mime};base64,${btoa(bin)}`;
}

function pathData(v: unknown, at: string): string {
	const d = str(v, at);
	if (
		d.length > MAX_PATH ||
		!PATH.test(d) ||
		d.split(/[^0-9.]+/).some((n) => n.length > MAX_NUMERAL)
	)
		throw new AtaError(at);
	return d;
}

function readMark(
	v: unknown,
	at: string,
	ids: Set<string>,
	urlOf: (name: string) => string | null,
): PageObject | null {
	const o = obj(v, at);
	const kind = oneOf(o.kind, MARK_KINDS, `${at}.kind`);
	const base = {
		id: uniqueId(o.id, ids),
		cx: num(o.cx, -28800, 28800, `${at}.cx`),
		cy: num(o.cy, -28800, 28800, `${at}.cy`),
		w: num(o.w, 0, 14400, `${at}.w`),
		h: num(o.h, 0, 14400, `${at}.h`),
		scaleX: num(o.scaleX, 0.01, 100, `${at}.scaleX`),
		scaleY: num(o.scaleY, 0.01, 100, `${at}.scaleY`),
		angle: num(o.angle, -3600, 3600, `${at}.angle`),
	};
	const colour = () => hex(o.colour, `${at}.colour`);
	const stroke = () => num(o.strokeWidth, 0.1, 200, `${at}.strokeWidth`);
	switch (kind) {
		case 'text': {
			const t: TextObject = {
				...base,
				kind,
				text: markText(o.text, `${at}.text`),
				fontSize: num(
					o.fontSize,
					1,
					1000,
					`${at}.fontSize`,
				),
				colour: colour(),
			};
			if (o.opacity !== undefined)
				t.opacity = num(
					o.opacity,
					0,
					1,
					`${at}.opacity`,
				);
			if (o.bold !== undefined)
				t.bold = bool(o.bold, `${at}.bold`);
			return t;
		}
		case 'ink': {
			return {
				...base,
				kind,
				d: pathData(o.d, `${at}.d`),
				colour: colour(),
				strokeWidth: stroke(),
			};
		}
		case 'shape':
			return {
				...base,
				kind,
				shape: oneOf(o.shape, SHAPES, `${at}.shape`),
				colour: colour(),
				strokeWidth: stroke(),
			};
		case 'image': {
			const url = urlOf(str(o.src, `${at}.src`));
			return url ? { ...base, kind, dataUrl: url } : null;
		}
		case 'comment':
			return {
				...base,
				kind,
				text: markText(o.text, `${at}.text`),
				author: markText(o.author, `${at}.author`, 200),
				date:
					typeof o.date === 'string' &&
					Number.isFinite(Date.parse(o.date))
						? o.date
						: '',
			};
	}
}
