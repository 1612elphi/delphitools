import { clamp } from 'delphicanon/lib/number';
import { MM_TO_POINTS, findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import { STYLES, resolveChar, resolvePara } from './styles';
import type {
	Block,
	CharProps,
	ListProps,
	PageBreak,
	Paragraph,
	ParaProps,
	Pos,
	Run,
	Selection,
	Setup,
	StoryPart,
	StyleId,
	TableCell,
	Toc,
	WriteDoc,
	FieldKind,
	ImageAsset,
	ImageRef,
	NoteRef,
} from './types';
import { FIELD_CHAR, STORY_PARTS } from './types';
import type { PageObject } from 'delphitools-v2/lib/errata/doc-model';

export interface Edit {
	doc: WriteDoc;
	sel: Selection;
}

export function newId(): string {
	return crypto.randomUUID();
}

export function emptyPara(style: StyleId = 'body'): Paragraph {
	return {
		kind: 'para',
		id: newId(),
		style,
		props: {},
		runs: [{ text: '', props: {} }],
		dir: 'ltr',
	};
}

const A4 = findPaperSize('a4')!;

export function newDoc(name: string): WriteDoc {
	return {
		version: 1,
		name,
		created: new Date().toISOString(),
		setup: {
			width: A4.widthMm * MM_TO_POINTS,
			height: A4.heightMm * MM_TO_POINTS,
			margins: { top: 72, right: 72, bottom: 72, left: 72 },
			lang: 'en',
			hyphenate: true,
		},
		blocks: [emptyPara()],
	};
}

/** 0-based section of a block; a section break ends the section before it. */
export function sectionIndex(doc: WriteDoc, block: number): number {
	let n = 0;
	for (let i = 0; i < block && i < doc.blocks.length; i++)
		if (doc.blocks[i]!.kind === 'section') n++;
	return n;
}

/** Index of the section break that starts the block's section, -1 for the document setup. */
export function sectionStart(doc: WriteDoc, block: number): number {
	for (let i = Math.min(block, doc.blocks.length) - 1; i >= 0; i--)
		if (doc.blocks[i]!.kind === 'section') return i;
	return -1;
}

/** Setup of the section starting at start: -1 the document's, a section break its own, else null. */
export function setupAt(doc: WriteDoc, start: number): Setup | null {
	if (start < 0) return doc.setup;
	const b = doc.blocks[start];
	return b?.kind === 'section' ? b.setup : null;
}

/** Setup of the section a block is in. */
export function sectionSetup(doc: WriteDoc, block: number): Setup {
	return setupAt(doc, sectionStart(doc, block))!;
}

/** The doc with the setup of the section starting at start (-1: the document) replaced; unchanged when start starts no section. */
export function withSectionSetup(
	doc: WriteDoc,
	start: number,
	setup: Setup,
): WriteDoc {
	if (start < 0) return { ...doc, setup };
	const b = doc.blocks[start];
	if (b?.kind !== 'section') return doc;
	return splice(doc, start, 1, { ...b, setup });
}

/** Paragraphs of blocks, table cells' in reading order. */
export function* parasOf(blocks: Block[]): Generator<Paragraph> {
	for (const b of blocks)
		if (b.kind === 'para') yield b;
		else if (b.kind === 'table')
			for (const row of b.rows)
				for (const cell of row)
					if (!cell.covered) yield* cell.paras;
}

/** Body, table cell, header, footer and note paragraphs. */
export function* allParas(doc: WriteDoc): Generator<Paragraph> {
	const stories = (setup: Setup) =>
		STORY_PARTS.flatMap((part) => setup[part] ?? []);
	yield* stories(doc.setup);
	for (const b of doc.blocks)
		if (b.kind === 'section') yield* stories(b.setup);
		else yield* parasOf([b]);
	for (const paras of Object.values(doc.notes ?? {})) yield* paras;
}

/** Drops trailing empty pages; undefined when none has marks. */
export function tidyOverlays(
	list: readonly PageObject[][],
): PageObject[][] | undefined {
	let n = list.length;
	while (n && !list[n - 1]!.length) n--;
	return n ? list.slice(0, n) : undefined;
}

/** The overlay with the first pages' marks replaced; later pages keep theirs. */
export function withPageMarks(
	overlays: readonly PageObject[][] | undefined,
	pages: readonly PageObject[][],
): PageObject[][] | undefined {
	const rest = overlays?.slice(pages.length) ?? [];
	return tidyOverlays([...pages, ...rest]);
}

/** The document with one contents at most, note references in body paragraphs only, and a paragraph after a last table, contents or section break. */
export function normaliseDoc(doc: WriteDoc): WriteDoc {
	doc = strayRefsDropped(oneToc(doc));
	const last = doc.blocks.at(-1)?.kind;
	if (last && last !== 'table' && last !== 'section' && last !== 'toc')
		return doc;
	return { ...doc, blocks: doc.blocks.concat(emptyPara()) };
}

// shared for layout cache
const EMPTY_STORY: Paragraph[] = [emptyPara()];

/** Paragraphs of a header or footer slot; an unset slot is one empty paragraph. */
export function storyParas(setup: Setup, part: StoryPart): Paragraph[] {
	const paras = setup[part];
	return paras?.length ? paras : EMPTY_STORY;
}

/** The slot a page shows: the first-page slot on a section's first page when titlePage is set. */
export function storyPart(
	setup: Setup,
	kind: 'header' | 'footer',
	first: boolean,
): StoryPart {
	if (!first || !setup.titlePage) return kind;
	return kind === 'header' ? 'firstHeader' : 'firstFooter';
}

export function paraText(p: Paragraph): string {
	return p.runs.map((r) => r.text).join('');
}

export function paraLength(p: Paragraph): number {
	let n = 0;
	for (const r of p.runs) n += r.text.length;
	return n;
}

export const blockLength = (b?: Block): number =>
	b?.kind === 'para' ? paraLength(b) : 0;

export const blockText = (b?: Block): string =>
	b?.kind === 'para' ? paraText(b) : '';

export const isLowSurrogate = (code: number) =>
	code >= 0xdc00 && code <= 0xdfff;

/** UTF-16 units of the character at i. */
export const charLen = (text: string, i: number) =>
	(text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;

/** Largest margin on a side that keeps a 72 pt content box. */
export function maxMargin(
	size: Pick<Setup, 'width' | 'height'>,
	side: keyof Setup['margins'],
): number {
	return (
		(side === 'top' || side === 'bottom'
			? size.height
			: size.width) /
			2 -
		36
	);
}

/** The setup with every margin within maxMargin. */
export function clampMargins(setup: Setup): Setup {
	const margins = { ...setup.margins };
	for (const side of Object.keys(margins) as (keyof Setup['margins'])[])
		margins[side] = clamp(
			margins[side],
			0,
			Math.max(0, maxMargin(setup, side)),
		);
	return { ...setup, margins };
}

export function comparePos(a: Pos, b: Pos): number {
	return a.block - b.block || a.offset - b.offset;
}

export function orderedSel(sel: Selection): [Pos, Pos] {
	return comparePos(sel.anchor, sel.focus) <= 0
		? [sel.anchor, sel.focus]
		: [sel.focus, sel.anchor];
}

export function isCollapsed(sel: Selection): boolean {
	return comparePos(sel.anchor, sel.focus) === 0;
}

export function caret(pos: Pos): Selection {
	return { anchor: pos, focus: pos };
}

export function clampPos(doc: WriteDoc, pos: Pos): Pos {
	const block = clamp(pos.block, 0, doc.blocks.length - 1);
	const len = blockLength(doc.blocks[block]);
	return { block, offset: clamp(pos.offset, 0, len) };
}

export function docStart(): Pos {
	return { block: 0, offset: 0 };
}

export function docEnd(doc: WriteDoc): Pos {
	const block = doc.blocks.length - 1;
	return { block, offset: blockLength(doc.blocks[block]) };
}

function sameProps(a: CharProps, b: CharProps): boolean {
	const keys = Object.keys(a) as (keyof CharProps)[];
	return (
		keys.length === Object.keys(b).length &&
		keys.every((k) => a[k] === b[k])
	);
}

function mergeProps<T extends object>(base: T, partial: Partial<T>): T {
	const out = { ...base } as Record<string, unknown>;
	for (const [k, v] of Object.entries(partial)) {
		if (v === undefined) delete out[k];
		else out[k] = v;
	}
	return out as T;
}

function sliceRuns(runs: Run[], from: number, to: number): Run[] {
	const out: Run[] = [];
	let pos = 0;
	for (const r of runs) {
		const end = pos + r.text.length;
		const s = Math.max(from, pos);
		const e = Math.min(to, end);
		if (s < e)
			out.push(
				s === pos && e === end
					? r
					: {
							text: r.text.slice(
								s - pos,
								e - pos,
							),
							props: r.props,
						},
			);
		pos = end;
	}
	return out;
}

/** Merges adjacent runs with equal props and drops empty runs, keeping one in an empty paragraph. */
export function normalise(p: Paragraph): Paragraph {
	const runs: Run[] = [];
	for (const r of p.runs) {
		if (!r.text) continue;
		const last = runs.at(-1);
		if (last && sameProps(last.props, r.props))
			runs[runs.length - 1] = {
				text: last.text + r.text,
				props: last.props,
			};
		else runs.push(r);
	}
	if (!runs.length) runs.push(p.runs[0] ?? { text: '', props: {} });
	return { ...p, runs };
}

/** Props of the run the character before offset belongs to. */
export function typingProps(p: Paragraph, offset: number): CharProps {
	let pos = 0;
	for (const r of p.runs) {
		const end = pos + r.text.length;
		if (offset === 0 || (pos < offset && offset <= end))
			return unfielded(r.props);
		pos = end;
	}
	return unfielded(p.runs.at(-1)?.props ?? {});
}

// typing beside an object
function unfielded(props: CharProps): CharProps {
	if (!props.field && !props.image && !props.note) return props;
	const rest = { ...props };
	delete rest.field;
	delete rest.image;
	delete rest.note;
	return rest;
}

/** Inserts one field at the selection, formatted as the text at the caret. */
export function insertField(
	doc: WriteDoc,
	sel: Selection,
	field: FieldKind,
	props?: CharProps,
): Edit {
	const cleared = deleteSel(doc, sel);
	const b = cleared.doc.blocks[cleared.sel.focus.block];
	const base =
		props ??
		(b?.kind === 'para'
			? typingProps(b, cleared.sel.focus.offset)
			: {});
	return insertText(cleared.doc, cleared.sel, FIELD_CHAR, {
		...base,
		field,
	});
}

/** The image character at offset, if any. */
export function imageAt(p: Paragraph, offset: number): ImageRef | undefined {
	let pos = 0;
	for (const r of p.runs) {
		pos += r.text.length;
		if (offset < pos) return r.props.image;
	}
	return undefined;
}

/** Ids of the images paragraphs use. */
export function imageIds(paras: Iterable<Paragraph>): Set<string> {
	const out = new Set<string>();
	for (const p of paras)
		for (const r of p.runs)
			if (r.props.image) out.add(r.props.image.id);
	return out;
}

const holdsImage = (b: Block | undefined): b is Paragraph =>
	b?.kind === 'para' && b.runs.some((r) => r.props.image);

/** Index of the caption of a paragraph holding an image: the next paragraph when it has the Caption style and starts with a figure field; -1 when none. */
export function captionOf(doc: WriteDoc, block: number): number {
	const next = doc.blocks[block + 1];
	return holdsImage(doc.blocks[block]) &&
		next?.kind === 'para' &&
		next.style === 'caption' &&
		next.runs[0]?.props.field === 'figure' &&
		next.runs[0].text.startsWith(FIELD_CHAR)
		? block + 1
		: -1;
}

/** True when the block is the caption of the image paragraph before it. */
export const isCaption = (doc: WriteDoc, block: number) =>
	block > 0 && captionOf(doc, block - 1) === block;

function moved(pos: Pos, from: number, to: number): Pos {
	const b = pos.block;
	if (b === from) return { ...pos, block: to };
	if (to <= b && b < from) return { ...pos, block: b + 1 };
	return pos;
}

/** After an edit that changed a block holding an image: a caption whose image went is deleted, one Enter split from its image moves back under it, and image bytes nothing uses drop. */
export function tidyImages(prev: WriteDoc, next: Edit): Edit {
	if (next.doc.blocks === prev.blocks) return next;
	const kept = new Set(next.doc.blocks);
	if (
		prev.blocks.every(
			(b) => kept.has(b) || !imageIds(parasOf([b])).size,
		)
	)
		return next;
	let { doc, sel } = next;
	for (let i = 0; i < prev.blocks.length; i++) {
		const c = captionOf(prev, i);
		if (c < 0) continue;
		const cap = prev.blocks[c]!;
		const j = doc.blocks.indexOf(cap);
		if (j < 0 || captionOf(doc, j - 1) === j) continue;
		const refs = new Set(
			(prev.blocks[i] as Paragraph).runs.map(
				(r) => r.props.image,
			),
		);
		refs.delete(undefined);
		let a = j - 1;
		while (
			a >= 0 &&
			!(
				doc.blocks[a]!.kind === 'para' &&
				(doc.blocks[a] as Paragraph).runs.some((r) =>
					refs.has(r.props.image),
				)
			)
		)
			a--;
		const blocks = doc.blocks.slice();
		blocks.splice(j, 1);
		doc = { ...doc, blocks };
		if (a >= 0 && captionOf(doc, a) < 0) {
			blocks.splice(a + 1, 0, cap);
			sel = {
				...sel,
				anchor: moved(sel.anchor, j, a + 1),
				focus: moved(sel.focus, j, a + 1),
			};
		} else {
			const drop = (p: Pos) =>
				clampPos(
					doc,
					p.block > j
						? { ...p, block: p.block - 1 }
						: p,
				);
			sel = {
				...sel,
				anchor: drop(sel.anchor),
				focus: drop(sel.focus),
			};
		}
	}
	const used = imageIds(allParas(doc));
	if (Object.keys(doc.images ?? {}).some((id) => !used.has(id)))
		doc = { ...doc, images: pickImages(doc.images, used) };
	return doc === next.doc ? next : { doc, sel };
}

/** The images of a map that ids name. */
export function pickImages(
	images: WriteDoc['images'],
	ids: Set<string>,
): Record<string, ImageAsset> {
	const out: Record<string, ImageAsset> = {};
	for (const id of ids) if (images?.[id]) out[id] = images[id];
	return out;
}

/** The doc with more images; the same doc when it has them all. */
export function withImages(
	doc: WriteDoc,
	images: Record<string, ImageAsset>,
): WriteDoc {
	const add = Object.keys(images).filter((id) => !doc.images?.[id]);
	if (!add.length) return doc;
	return {
		...doc,
		images: { ...doc.images, ...pickImages(images, new Set(add)) },
	};
}

function oneToc(doc: WriteDoc): WriteDoc {
	const first = doc.blocks.findIndex((b) => b.kind === 'toc');
	if (
		first < 0 ||
		!doc.blocks.some((b, i) => i > first && b.kind === 'toc')
	)
		return doc;
	return {
		...doc,
		blocks: doc.blocks.filter(
			(b, i) => i <= first || b.kind !== 'toc',
		),
	};
}

function strayRefsDropped(doc: WriteDoc): WriteDoc {
	const dropped = new Set<string>();
	const unref = (paras: Paragraph[]) => {
		if (!paras.some((p) => noteRefs(p).length)) return paras;
		return paras.map((p) => {
			const refs = noteRefs(p);
			if (!refs.length) return p;
			for (const r of refs) dropped.add(r.ref.id);
			return normalise({
				...p,
				runs: p.runs.filter((r) => !r.props.note),
			});
		});
	};
	const stories = (setup: Setup): Setup => {
		let out = setup;
		for (const part of STORY_PARTS) {
			const paras = setup[part];
			const next = paras && unref(paras);
			if (next !== paras) out = { ...out, [part]: next };
		}
		return out;
	};
	const unrefBlock = (b: Block): Block => {
		if (b.kind === 'section') {
			const setup = stories(b.setup);
			return setup === b.setup ? b : { ...b, setup };
		}
		if (b.kind !== 'table') return b;
		let changed = false;
		const rows = b.rows.map((row) =>
			row.map((cell) => {
				const paras = unref(cell.paras);
				if (paras === cell.paras) return cell;
				changed = true;
				return { ...cell, paras };
			}),
		);
		return changed ? { ...b, rows } : b;
	};
	const setup = stories(doc.setup);
	const blocks = doc.blocks.map(unrefBlock);
	const notes = doc.notes && Object.entries(doc.notes);
	const kept = notes?.map(([id, paras]) => [id, unref(paras)] as const);
	if (!dropped.size) return doc;
	const out: WriteDoc = { ...doc, setup, blocks };
	const used = new Set<string>();
	for (const r of refsOf(blocks)) used.add(r.ref.id);
	const live = kept?.filter(([id]) => !dropped.has(id) || used.has(id));
	if (live?.length) out.notes = Object.fromEntries(live);
	else delete out.notes;
	return out;
}

const isObject = (r: Run) => !!(r.props.image || r.props.note);

/** The paragraph without its image and note characters. */
export function withoutObjects(p: Paragraph): Paragraph {
	if (!p.runs.some(isObject)) return p;
	return normalise({ ...p, runs: p.runs.filter((r) => !isObject(r)) });
}

export interface RefAt {
	offset: number;
	ref: NoteRef;
}

const refsByPara = new WeakMap<Paragraph, RefAt[]>();

/** Note references of a paragraph with their offsets. */
export function noteRefs(p: Paragraph): RefAt[] {
	let out = refsByPara.get(p);
	if (!out) {
		out = [];
		let pos = 0;
		for (const r of p.runs) {
			if (r.props.note && r.text)
				out.push({ offset: pos, ref: r.props.note });
			pos += r.text.length;
		}
		refsByPara.set(p, out);
	}
	return out;
}

/** Note references of the body, in document order. */
export function* refsOf(blocks: Block[]): Generator<RefAt & { block: number }> {
	for (let block = 0; block < blocks.length; block++) {
		const b = blocks[block]!;
		if (b.kind === 'para')
			for (const r of noteRefs(b)) yield { ...r, block };
	}
}

/** Where a note's reference sits, or null. */
export function noteRefPos(doc: WriteDoc, id: string): Pos | null {
	for (const r of refsOf(doc.blocks))
		if (r.ref.id === id)
			return { block: r.block, offset: r.offset };
	return null;
}

/** Inserts a reference to a new, empty note at the selection. */
export function insertNote(
	doc: WriteDoc,
	sel: Selection,
	kind: NoteRef['kind'],
): Edit & { id: string } {
	const id = newId();
	const cleared = deleteSel(doc, sel);
	const b = cleared.doc.blocks[cleared.sel.focus.block];
	const base =
		b?.kind === 'para'
			? unlinked(typingProps(b, cleared.sel.focus.offset))
			: {};
	const next = insertText(cleared.doc, cleared.sel, FIELD_CHAR, {
		...base,
		note: { id, kind },
	});
	return {
		doc: {
			...next.doc,
			notes: { ...next.doc.notes, [id]: [emptyPara('note')] },
		},
		sel: next.sel,
		id,
	};
}

/** The blocks with fresh note ids, and copies of the notes under them. */
export function renewNotes(
	blocks: Block[],
	notes: WriteDoc['notes'],
): { blocks: Block[]; notes: Record<string, Paragraph[]> } {
	const out: Record<string, Paragraph[]> = {};
	const renew = (b: Block): Block => {
		if (b.kind !== 'para' || !noteRefs(b).length) return b;
		const runs = b.runs.map((r) => {
			const old = r.props.note;
			const paras = old && notes?.[old.id];
			if (!old || !paras) return r;
			const id = newId();
			out[id] = paras.map((p) => ({ ...p, id: newId() }));
			return {
				...r,
				props: { ...r.props, note: { ...old, id } },
			};
		});
		return { ...b, runs };
	};
	return { blocks: blocks.map(renew), notes: out };
}

/** After an edit: notes whose reference went drop. */
export function tidyNotes(prev: WriteDoc, next: Edit): Edit {
	const notes = next.doc.notes;
	if (!notes) return next;
	const { blocks } = next.doc;
	if (notes === prev.notes) {
		if (blocks === prev.blocks) return next;
		const kept = new Set(blocks);
		if (
			prev.blocks.every(
				(b) =>
					kept.has(b) ||
					b.kind !== 'para' ||
					!noteRefs(b).length,
			)
		)
			return next;
	}
	const used = new Set<string>();
	for (const r of refsOf(blocks)) used.add(r.ref.id);
	const ids = Object.keys(notes);
	if (ids.length && ids.every((id) => used.has(id))) return next;
	const doc = { ...next.doc };
	const kept = ids.filter((id) => used.has(id));
	if (kept.length)
		doc.notes = Object.fromEntries(
			kept.map((id) => [id, notes[id]!]),
		);
	else delete doc.notes;
	return { ...next, doc };
}

/** Inserts one image character at the selection, formatted as the text at the caret. */
export function insertImage(
	doc: WriteDoc,
	sel: Selection,
	asset: ImageAsset,
	image: ImageRef,
): Edit {
	const cleared = deleteSel(withImages(doc, { [image.id]: asset }), sel);
	const b = cleared.doc.blocks[cleared.sel.focus.block];
	const base =
		b?.kind === 'para'
			? unlinked(typingProps(b, cleared.sel.focus.offset))
			: {};
	return insertText(cleared.doc, cleared.sel, FIELD_CHAR, {
		...base,
		image,
	});
}

/** drops link styling too */
function unlinked(props: CharProps): CharProps {
	if (!props.link) return props;
	const rest = { ...props };
	delete rest.link;
	delete rest.underline;
	delete rest.colour;
	return rest;
}

function linkOfChar(p: Paragraph, i: number): string | undefined {
	if (i < 0) return undefined;
	let pos = 0;
	for (const r of p.runs) {
		pos += r.text.length;
		if (i < pos) return r.props.link;
	}
	return undefined;
}

/** typingProps for a caret; a link ends at its edges. */
export function caretProps(p: Paragraph, offset: number): CharProps {
	const props = typingProps(p, offset);
	const { link } = props;
	return link &&
		linkOfChar(p, offset - 1) === link &&
		linkOfChar(p, offset) === link
		? props
		: unlinked(props);
}

export interface LinkSpan {
	link: string;
	start: number;
	end: number;
}

/** The link around offset, the character after it first; adjacent runs with one link merge. */
export function linkAround(p: Paragraph, offset: number): LinkSpan | undefined {
	const spans: LinkSpan[] = [];
	let pos = 0;
	for (const r of p.runs) {
		const end = pos + r.text.length;
		const { link } = r.props;
		const last = spans.at(-1);
		if (link && r.text) {
			if (last?.link === link && last.end === pos)
				last.end = end;
			else spans.push({ link, start: pos, end });
		}
		pos = end;
	}
	return (
		spans.find((s) => s.start <= offset && offset < s.end) ??
		spans.find((s) => s.start < offset && offset <= s.end)
	);
}

// an empty insert run carries props
function replaceInPara(
	p: Paragraph,
	from: number,
	to: number,
	insert: Run[],
): Paragraph {
	const runs = [
		...sliceRuns(p.runs, 0, from),
		...insert,
		...sliceRuns(p.runs, to, Infinity),
	];
	return normalise({
		...p,
		runs: runs.length
			? runs
			: [{ text: '', props: typingProps(p, from) }],
	});
}

function splice(
	doc: WriteDoc,
	start: number,
	count: number,
	...items: Block[]
): WriteDoc {
	const blocks = doc.blocks.slice();
	blocks.splice(start, count, ...items);
	return { ...doc, blocks };
}

function deleteRange(doc: WriteDoc, from: Pos, to: Pos): Edit {
	const a = doc.blocks[from.block]!;
	const b = doc.blocks[to.block]!;
	const sel = caret(from);
	if (from.block === to.block) {
		if (a.kind !== 'para' || from.offset === to.offset)
			return { doc, sel };
		const p = replaceInPara(a, from.offset, to.offset, []);
		return { doc: splice(doc, from.block, 1, p), sel };
	}
	let merged: Paragraph;
	if (a.kind === 'para')
		merged = replaceInPara(
			a,
			from.offset,
			Infinity,
			b.kind === 'para'
				? sliceRuns(b.runs, to.offset, Infinity)
				: [],
		);
	else if (b.kind === 'para') merged = replaceInPara(b, 0, to.offset, []);
	else merged = emptyPara();
	return {
		doc: splice(doc, from.block, to.block - from.block + 1, merged),
		sel,
	};
}

export function deleteSel(doc: WriteDoc, sel: Selection): Edit {
	if (isCollapsed(sel)) return { doc, sel };
	const [from, to] = orderedSel(sel);
	return deleteRange(doc, from, to);
}

// typing on a break
function ensurePara(doc: WriteDoc, pos: Pos): { doc: WriteDoc; pos: Pos } {
	if (doc.blocks[pos.block]!.kind === 'para') return { doc, pos };
	return {
		doc: splice(doc, pos.block, 0, emptyPara()),
		pos: { block: pos.block, offset: 0 },
	};
}

/** Replaces the selection; '\n' splits paragraphs. */
export function insertText(
	doc: WriteDoc,
	sel: Selection,
	text: string,
	props?: CharProps,
): Edit {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const cleared = deleteSel(doc, sel);
	const { doc: d, pos } = ensurePara(cleared.doc, cleared.sel.focus);
	if (!text) return { doc: d, sel: caret(pos) };
	const p = d.blocks[pos.block] as Paragraph;
	const runProps = props ?? typingProps(p, pos.offset);
	const run = (t: string): Run[] => [{ text: t, props: runProps }];
	const last = lines.at(-1)!;
	if (lines.length === 1)
		return {
			doc: splice(
				d,
				pos.block,
				1,
				replaceInPara(
					p,
					pos.offset,
					pos.offset,
					run(text),
				),
			),
			sel: caret({
				block: pos.block,
				offset: pos.offset + text.length,
			}),
		};
	const paras = [
		replaceInPara(p, pos.offset, Infinity, run(lines[0]!)),
		...lines
			.slice(1, -1)
			.map((t) =>
				normalise({ ...p, id: newId(), runs: run(t) }),
			),
		replaceInPara({ ...p, id: newId() }, 0, pos.offset, run(last)),
	];
	return {
		doc: splice(d, pos.block, 1, ...paras),
		sel: caret({
			block: pos.block + lines.length - 1,
			offset: last.length,
		}),
	};
}

/** Enter. An empty list item leaves the list instead. */
export function splitParagraph(doc: WriteDoc, sel: Selection): Edit {
	// caption enter: body text
	if (isCollapsed(sel) && isCaption(doc, sel.focus.block)) {
		const at = sel.focus.block + 1;
		return {
			doc: splice(doc, at, 0, emptyPara()),
			sel: caret({ block: at, offset: 0 }),
		};
	}
	const cleared = deleteSel(doc, sel);
	const { doc: d, pos } = ensurePara(cleared.doc, cleared.sel.focus);
	// break: one paragraph
	if (d !== cleared.doc)
		return {
			doc: d,
			sel: caret({ block: pos.block + 1, offset: 0 }),
		};
	const p = d.blocks[pos.block] as Paragraph;
	const len = paraLength(p);
	if (len === 0 && p.props.list)
		return {
			doc: splice(d, pos.block, 1, {
				...p,
				props: mergeProps(p.props, { list: undefined }),
			}),
			sel: caret(pos),
		};
	const next = STYLES[p.style].next;
	// start enter keeps style
	const keep = (pos.offset === 0 && len > 0) || next === p.style;
	const base: Paragraph = keep
		? { ...p, id: newId() }
		: {
				...p,
				id: newId(),
				style: next,
				props: p.props.list
					? { list: p.props.list }
					: {},
			};
	const carry = { text: '', props: typingProps(p, pos.offset) };
	return {
		doc: splice(
			d,
			pos.block,
			1,
			replaceInPara(p, pos.offset, Infinity, []),
			replaceInPara(base, 0, pos.offset, [carry]),
		),
		sel: caret({ block: pos.block + 1, offset: 0 }),
	};
}

/** A page break; kind 'column' a column break. */
export function insertPageBreak(
	doc: WriteDoc,
	sel: Selection,
	kind: PageBreak['kind'] = 'break',
): Edit {
	return insertBlock(doc, sel, { kind, id: newId() });
}

/** A section break whose new section copies the caret's section setup. */
export function insertSectionBreak(doc: WriteDoc, sel: Selection): Edit {
	const [from] = orderedSel(sel);
	const setup = { ...sectionSetup(doc, from.block) };
	return insertBlock(doc, sel, { kind: 'section', id: newId(), setup });
}

/** True when the first section is a cover: text centred on the page. */
export const hasCover = (doc: WriteDoc) => doc.setup.valign === 'centre';

/** A cover section before everything: a centred title, no header or footer, then a section break back to the document's setup. The caret lands in the title. */
export function insertCover(doc: WriteDoc): Edit {
	if (hasCover(doc)) return { doc, sel: caret({ block: 0, offset: 0 }) };
	const title: Paragraph = {
		...emptyPara('title'),
		props: { align: 'centre' },
	};
	return {
		doc: {
			...doc,
			setup: {
				...doc.setup,
				valign: 'centre',
				titlePage: true,
			},
			blocks: [
				title,
				{
					kind: 'section',
					id: newId(),
					setup: doc.setup,
				},
				...doc.blocks,
			],
		},
		sel: caret({ block: 0, offset: 0 }),
	};
}

/** Inserts a non-paragraph block at the caret, splitting its paragraph; the caret lands after it. */
export function insertBlock(doc: WriteDoc, sel: Selection, brk: Block): Edit {
	const cleared = deleteSel(doc, sel);
	const pos = cleared.sel.focus;
	if (pos.offset === 0)
		return {
			doc: splice(cleared.doc, pos.block, 0, brk),
			sel: caret({ block: pos.block + 1, offset: 0 }),
		};
	const split = splitParagraph(cleared.doc, cleared.sel);
	return {
		doc: splice(split.doc, pos.block + 1, 0, brk),
		sel: caret({ block: pos.block + 2, offset: 0 }),
	};
}

function deleteBreak(
	doc: WriteDoc,
	sel: Selection,
	index: number,
	dir: 1 | -1,
): Edit {
	// tables delete by selection
	if (doc.blocks[index]?.kind === 'table') return { doc, sel };
	if (doc.blocks.length === 1)
		return {
			doc: splice(doc, 0, 1, emptyPara()),
			sel: caret(docStart()),
		};
	const d = splice(doc, index, 1);
	const pos =
		(dir === 1 && index < d.blocks.length) || index === 0
			? { block: index, offset: 0 }
			: {
					block: index - 1,
					offset: blockLength(
						d.blocks[index - 1],
					),
				};
	return { doc: d, sel: caret(pos) };
}

function prevChar(text: string, offset: number): number {
	return offset - (offset >= 2 ? charLen(text, offset - 2) : 1);
}

function nextChar(text: string, offset: number): number {
	return offset + charLen(text, offset);
}

export const wordSegmenter = new Intl.Segmenter(undefined, {
	granularity: 'word',
});

/** Start of the word before offset (dir -1) or end of the word after it (dir 1). */
export function wordBoundary(
	text: string,
	offset: number,
	dir: 1 | -1,
): number {
	const segs = [...wordSegmenter.segment(text)].filter(
		(s) => s.isWordLike,
	);
	if (dir < 0) {
		for (let i = segs.length - 1; i >= 0; i--)
			if (segs[i]!.index < offset) return segs[i]!.index;
		return 0;
	}
	for (const s of segs) {
		const end = s.index + s.segment.length;
		if (end > offset) return end;
	}
	return text.length;
}

export function deleteBackward(
	doc: WriteDoc,
	sel: Selection,
	unit: 'char' | 'word',
): Edit {
	if (!isCollapsed(sel)) return deleteSel(doc, sel);
	const pos = sel.focus;
	const b = doc.blocks[pos.block]!;
	if (b.kind !== 'para') return deleteBreak(doc, sel, pos.block, -1);
	// caption keeps figure field
	if (isCaption(doc, pos.block) && pos.offset <= 1) return { doc, sel };
	if (pos.offset === 0) {
		const prev = doc.blocks[pos.block - 1];
		if (!prev) return { doc, sel };
		// never merge into caption
		if (isCaption(doc, pos.block - 1) && prev.kind === 'para')
			return {
				doc,
				sel: caret({
					block: pos.block - 1,
					offset: paraLength(prev),
				}),
			};
		if (prev.kind !== 'para')
			return deleteBreak(doc, sel, pos.block - 1, 1);
		return deleteRange(
			doc,
			{ block: pos.block - 1, offset: paraLength(prev) },
			pos,
		);
	}
	const text = paraText(b);
	const offset =
		unit === 'word'
			? wordBoundary(text, pos.offset, -1)
			: prevChar(text, pos.offset);
	return deleteRange(
		doc,
		{
			block: pos.block,
			offset: isCaption(doc, pos.block)
				? Math.max(1, offset)
				: offset,
		},
		pos,
	);
}

export function deleteForward(
	doc: WriteDoc,
	sel: Selection,
	unit: 'char' | 'word',
): Edit {
	if (!isCollapsed(sel)) return deleteSel(doc, sel);
	const pos = sel.focus;
	const b = doc.blocks[pos.block]!;
	if (b.kind !== 'para') return deleteBreak(doc, sel, pos.block, 1);
	const caption = isCaption(doc, pos.block);
	if (caption && pos.offset === 0) return { doc, sel };
	if (pos.offset === paraLength(b)) {
		if (caption || captionOf(doc, pos.block) >= 0)
			return { doc, sel };
		const next = doc.blocks[pos.block + 1];
		if (!next) return { doc, sel };
		if (next.kind !== 'para')
			return deleteBreak(doc, sel, pos.block + 1, -1);
		return deleteRange(doc, pos, {
			block: pos.block + 1,
			offset: 0,
		});
	}
	const text = paraText(b);
	const offset =
		unit === 'word'
			? wordBoundary(text, pos.offset, 1)
			: nextChar(text, pos.offset);
	return deleteRange(doc, pos, { block: pos.block, offset });
}

function selRange(
	b: Paragraph,
	i: number,
	from: Pos,
	to: Pos,
): [number, number] {
	return [
		i === from.block ? from.offset : 0,
		i === to.block ? to.offset : paraLength(b),
	];
}

// fn gets selected range
function mapParas(
	doc: WriteDoc,
	sel: Selection,
	fn: (p: Paragraph, start: number, end: number) => Paragraph,
): WriteDoc {
	const [from, to] = orderedSel(sel);
	let blocks: Block[] | null = null;
	for (let i = from.block; i <= to.block; i++) {
		const b = doc.blocks[i]!;
		if (b.kind !== 'para') continue;
		const next = fn(b, ...selRange(b, i, from, to));
		if (next === b) continue;
		blocks ??= doc.blocks.slice();
		blocks[i] = next;
	}
	return blocks ? { ...doc, blocks } : doc;
}

/** An explicit undefined value clears that override. An empty paragraph takes the props on its run. */
export function applyChar(
	doc: WriteDoc,
	sel: Selection,
	partial: Partial<CharProps>,
): Edit {
	const next = mapParas(doc, sel, (p, s, e) => {
		if (paraLength(p) === 0)
			return {
				...p,
				runs: [
					{
						text: '',
						props: mergeProps(
							p.runs[0]!.props,
							partial,
						),
					},
				],
			};
		if (s === e) return p;
		const runs = sliceRuns(p.runs, s, e).map((r) => ({
			text: r.text,
			props: mergeProps(r.props, partial),
		}));
		return replaceInPara(p, s, e, runs);
	});
	return { doc: next, sel };
}

/** Resolved props shared by the whole selection; for a caret, the props typing would use. */
export function commonChar(doc: WriteDoc, sel: Selection): CharProps {
	const [from, to] = orderedSel(sel);
	const chars: Record<string, unknown>[] = [];
	for (let i = from.block; i <= to.block; i++) {
		const b = doc.blocks[i]!;
		if (b.kind !== 'para') continue;
		const [s, e] = selRange(b, i, from, to);
		for (const r of sliceRuns(b.runs, s, e))
			chars.push(resolveChar(b.style, r.props));
	}
	if (!chars.length) {
		const b = doc.blocks[from.block]!;
		if (b.kind !== 'para') return {};
		chars.push(resolveChar(b.style, typingProps(b, from.offset)));
	}
	const out = { ...chars[0] };
	for (const c of chars.slice(1))
		for (const k of Object.keys(out))
			if (c[k] !== out[k]) delete out[k];
	return out;
}

export function applyPara(
	doc: WriteDoc,
	sel: Selection,
	partial: Partial<ParaProps>,
): Edit {
	const next = mapParas(doc, sel, (p) => ({
		...p,
		props: mergeProps(p.props, partial),
	}));
	return { doc: next, sel };
}

/** Keeps run overrides and paragraph props. */
export function setStyle(doc: WriteDoc, sel: Selection, style: StyleId): Edit {
	const next = mapParas(doc, sel, (p) =>
		p.style === style ? p : { ...p, style },
	);
	return { doc: next, sel };
}

/** A caret clears its whole paragraph. */
export function clearFormatting(doc: WriteDoc, sel: Selection): Edit {
	const collapsed = isCollapsed(sel);
	const next = mapParas(doc, sel, (p, s, e) => {
		const [a, b] = collapsed ? [0, paraLength(p)] : [s, e];
		const runs =
			paraLength(p) === 0
				? [{ text: '', props: {} }]
				: a < b
					? replaceInPara(p, a, b, [
							{
								text: paraText(
									p,
								).slice(a, b),
								props: {},
							},
						]).runs
					: p.runs;
		return { ...p, props: {}, runs };
	});
	return { doc: next, sel };
}

/** Removes the list when every touched paragraph already has this kind. */
export function toggleList(
	doc: WriteDoc,
	sel: Selection,
	kind: ListProps['kind'],
): Edit {
	const [from, to] = orderedSel(sel);
	const off = doc.blocks
		.slice(from.block, to.block + 1)
		.every((b) => b.kind !== 'para' || b.props.list?.kind === kind);
	const next = mapParas(doc, sel, (p) => ({
		...p,
		props: mergeProps(p.props, {
			list: off
				? undefined
				: { kind, level: p.props.list?.level ?? 0 },
		}),
	}));
	return { doc: next, sel };
}

export function indent(doc: WriteDoc, sel: Selection, dir: 1 | -1): Edit {
	const next = mapParas(doc, sel, (p) => {
		const list = p.props.list;
		if (list)
			return {
				...p,
				props: {
					...p.props,
					list: {
						...list,
						level: clamp(
							list.level + dir,
							0,
							5,
						),
					},
				},
			};
		const current = resolvePara(p.style, p.props).indent;
		return {
			...p,
			props: {
				...p.props,
				indent: Math.max(0, current + 18 * dir),
			},
		};
	});
	return { doc: next, sel };
}

/** Copy of the range; the first and last paragraphs are partial. */
export function sliceBlocks(doc: WriteDoc, from: Pos, to: Pos): Block[] {
	const out: Block[] = [];
	for (let i = from.block; i <= to.block; i++) {
		const b = doc.blocks[i]!;
		if (b.kind !== 'para') {
			out.push(b);
			continue;
		}
		const [s, e] = selRange(b, i, from, to);
		out.push(
			replaceInPara(
				{ ...b, runs: sliceRuns(b.runs, s, e) },
				0,
				0,
				[],
			),
		);
	}
	return out;
}

/** Paste. The first block joins the caret paragraph, the last takes its tail. */
export function insertBlocks(
	doc: WriteDoc,
	sel: Selection,
	blocks: Block[],
): Edit {
	const cleared = deleteSel(doc, sel);
	if (!blocks.length) return cleared;
	const { doc: d, pos } = ensurePara(cleared.doc, cleared.sel.focus);
	const p = d.blocks[pos.block] as Paragraph;
	const out: Block[] = [];
	let cur: Paragraph | null = replaceInPara(p, pos.offset, Infinity, []);
	for (const [i, b] of blocks.entries()) {
		if (b.kind !== 'para') {
			if (cur) out.push(cur);
			out.push({ ...b, id: newId() });
			cur = null;
		} else if (i === 0 && cur) {
			cur = normalise({
				...cur,
				runs: [...cur.runs, ...b.runs],
			});
		} else {
			if (cur) out.push(cur);
			cur = { ...b, id: newId() };
		}
	}
	cur ??= {
		...p,
		id: newId(),
		runs: [{ text: '', props: typingProps(p, pos.offset) }],
	};
	const offset = paraLength(cur);
	out.push(
		replaceInPara(
			cur,
			offset,
			offset,
			sliceRuns(p.runs, pos.offset, Infinity),
		),
	);
	return {
		doc: splice(d, pos.block, 1, ...out),
		sel: caret({ block: pos.block + out.length - 1, offset }),
	};
}

/** Paragraphs one per line; a table row per line, its cells tab-separated. */
export function toPlainText(blocks: Block[]): string {
	const cellText = (c: TableCell) => c.paras.map(paraText).join(' ');
	return blocks
		.flatMap((b) =>
			b.kind === 'para'
				? [paraText(b)]
				: b.kind === 'table'
					? b.rows.map((row) =>
							row
								.filter(
									(c) =>
										!c.covered,
								)
								.map(cellText)
								.join('\t'),
						)
					: [],
		)
		.join('\n')
		.replaceAll(FIELD_CHAR, '');
}

const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;

// host:port is no scheme
function hasScheme(s: string): boolean {
	const m = /^([a-z][a-z\d+.-]*):/i.exec(s);
	if (!m) return false;
	const scheme = m[1]!.toLowerCase();
	const rest = s.slice(m[0].length);
	return (
		rest.startsWith('//') ||
		scheme === 'mailto' ||
		(!scheme.includes('.') && !/^\d+(?:[/?#]|$)/.test(rest))
	);
}

/** An http, https or mailto URL; a bare host gets https and a bare address mailto. A mailto keeps only its address and subject. Null for anything else. */
export function normaliseLink(raw: string): string | null {
	let s = raw.trim();
	if (!s) return null;
	if (EMAIL.test(s)) s = `mailto:${s}`;
	else if (!hasScheme(s)) s = `https://${s}`;
	let url: URL;
	try {
		url = new URL(s);
	} catch {
		return null;
	}
	if (url.protocol === 'http:' || url.protocol === 'https:')
		return url.href;
	if (url.protocol !== 'mailto:' || !url.pathname) return null;
	const subject = url.searchParams.get('subject');
	return `mailto:${url.pathname}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}

/** The word around pos, as double-click selects it. */
export function wordAt(doc: WriteDoc, pos: Pos): Selection {
	const { block, offset } = pos;
	const text = blockText(doc.blocks[block]);
	return {
		anchor: { block, offset: wordBoundary(text, offset + 1, -1) },
		focus: { block, offset: wordBoundary(text, offset, 1) },
	};
}

const hasText = (b?: Block) =>
	b?.kind === 'para' && b.runs.some((r) => /\S/.test(r.text));

// 0: no candidate
const headingSizes = new WeakMap<Paragraph, number>();

function headingSize(p: Paragraph): number {
	let size = headingSizes.get(p);
	if (size !== undefined) return size;
	size = 0;
	const text =
		p.style === 'body' && !p.props.list ? paraText(p).trim() : '';
	if (
		text &&
		text.length <= 80 &&
		text.split(/\s+/).length <= 12 &&
		!/[.!?…;,]$/.test(text)
	) {
		let max = 0;
		let bold = true;
		for (const r of p.runs) {
			if (!/\S/.test(r.text)) continue;
			const c = resolveChar(p.style, r.props);
			max = Math.max(max, c.size);
			bold &&= c.bold;
		}
		if (bold || max > STYLES.body.char.size) size = max;
	}
	headingSizes.set(p, size);
	return size;
}

// needs text after
function candidate(doc: WriteDoc, i: number): number {
	const b = doc.blocks[i];
	if (b?.kind !== 'para') return 0;
	const size = headingSize(b);
	return size && hasText(doc.blocks[i + 1]) ? size : 0;
}

const largest = new WeakMap<WriteDoc, number>();

function largestHeading(doc: WriteDoc): number {
	let max = largest.get(doc);
	if (max === undefined) {
		max = 0;
		for (let i = 0; i < doc.blocks.length; i++)
			max = Math.max(max, candidate(doc, i));
		largest.set(doc, max);
	}
	return max;
}

function headingStyle(size: number, max: number): StyleId | null {
	if (!size) return null;
	if (size >= 18 || size === max) return 'h1';
	return size >= 14 ? 'h2' : 'h3';
}

/** The heading style a body paragraph looks like, from its length, punctuation, weight and size. */
export function suggestHeading(
	doc: WriteDoc,
	blockIndex: number,
): StyleId | null {
	const size = candidate(doc, blockIndex);
	return size ? headingStyle(size, largestHeading(doc)) : null;
}

/** Every suggested heading applied; the same doc when there is none. */
export function applySuggestedHeadings(doc: WriteDoc): WriteDoc {
	const max = largestHeading(doc);
	if (!max) return doc;
	return {
		...doc,
		blocks: doc.blocks.map((b, i) => {
			const style = headingStyle(candidate(doc, i), max);
			return style && b.kind === 'para' ? { ...b, style } : b;
		}),
	};
}

const LEVELS: Partial<Record<StyleId, number>> = {
	title: 0,
	h1: 0,
	h2: 1,
	h3: 2,
};

export const isHeading = (style: StyleId) => LEVELS[style] !== undefined;

/** Outline entries a contents block lists: above its level cut, without the title, and after it when it asks. */
export function contentsOf(doc: WriteDoc, toc: Toc): OutlineEntry[] {
	const from = toc.after ? doc.blocks.indexOf(toc) : -1;
	return outlineOf(doc).filter((e) => {
		const b = doc.blocks[e.block];
		return (
			e.block > from &&
			e.level < toc.levels &&
			b?.kind === 'para' &&
			b.style !== 'title'
		);
	});
}

export interface OutlineEntry {
	block: number;
	level: number;
	text: string;
}

const outlineEntries = new WeakMap<Paragraph, OutlineEntry>();
const outlines = new WeakMap<WriteDoc, OutlineEntry[]>();

/** Headings with text, in document order; an unchanged heading keeps its entry. */
export function outlineOf(doc: WriteDoc): OutlineEntry[] {
	let out = outlines.get(doc);
	if (out) return out;
	out = [];
	for (let block = 0; block < doc.blocks.length; block++) {
		const b = doc.blocks[block]!;
		const level = b.kind === 'para' ? LEVELS[b.style] : undefined;
		if (b.kind !== 'para' || level === undefined) continue;
		let e = outlineEntries.get(b);
		if (e?.block !== block) {
			e = {
				block,
				level,
				text: paraText(b)
					.replaceAll(FIELD_CHAR, '')
					.trim(),
			};
			outlineEntries.set(b, e);
		}
		if (e.text) out.push(e);
	}
	outlines.set(doc, out);
	return out;
}
