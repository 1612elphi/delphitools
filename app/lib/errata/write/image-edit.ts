import {
	commit,
	currentLayout,
	editState,
	leaveInner,
} from 'delphitools-v2/lib/errata/write/editor';
import {
	decodeImageFile,
	fit,
	fitSize,
} from 'delphitools-v2/lib/errata/write/image';
import { columnsOf } from 'delphitools-v2/lib/errata/write/layout';
import {
	applyChar,
	captionOf,
	caret,
	deleteSel,
	imageAt,
	insertImage,
	insertText,
	newId,
	orderedSel,
	sectionSetup,
} from 'delphitools-v2/lib/errata/write/model';
import {
	writeStore,
	type WriteState,
} from 'delphitools-v2/lib/errata/write/store';
import { focusEditor } from 'delphitools-v2/lib/errata/write/view';
import {
	FIELD_CHAR,
	type ImageAsset,
	type ImageFloat,
	type ImageRef,
	type Layout,
	type Line,
	type Paragraph,
	type Selection,
	type Wrap,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

/** An image character the body selection covers exactly. */
export interface ImageSel {
	block: number;
	offset: number;
	image: ImageRef;
}

export const DEFAULT_DISTANCE = 9;
export const MIN_IMAGE = 8;

const rangeOf = (block: number, offset: number): Selection => ({
	anchor: { block, offset },
	focus: { block, offset: offset + 1 },
});

/** The image the body selection covers; null while a header, footer or cell is edited. */
export function selectedImage(
	s: WriteState | null = editState(),
): ImageSel | null {
	if (!s || s !== writeStore.get()) return null;
	const [from, to] = orderedSel(s.sel);
	if (from.block !== to.block || to.offset - from.offset !== 1)
		return null;
	const b = s.doc.blocks[from.block];
	const image = b?.kind === 'para' ? imageAt(b, from.offset) : undefined;
	return image ? { block: from.block, offset: from.offset, image } : null;
}

// section column box
function box(doc: WriteDoc, block: number) {
	const setup = sectionSetup(doc, block);
	const m = setup.margins;
	return {
		colW: columnsOf(setup).colW,
		colH: setup.height - m.top - m.bottom,
	};
}

/** The size an asset gets on insert and on Reset size: its 96 dpi size, fit to the column. */
export function naturalSize(doc: WriteDoc, block: number, asset: ImageAsset) {
	const { colW, colH } = box(doc, block);
	return fitSize(asset, colW, colH * 0.8);
}

/** Inserts an asset at the body caret and selects it. */
export function insertAsset(asset: ImageAsset) {
	const s = writeStore.get();
	if (!s) return;
	leaveInner();
	const [from] = orderedSel(s.sel);
	const image: ImageRef = {
		id: newId(),
		...naturalSize(s.doc, from.block, asset),
	};
	const next = insertImage(s.doc, s.sel, asset, image);
	const { block, offset } = next.sel.focus;
	commit({ doc: next.doc, sel: rangeOf(block, offset - 1) }, 'other');
	focusEditor();
}

/** Decodes an image file and inserts it; throws when the browser cannot decode it. */
export async function insertImageFile(file: Blob): Promise<void> {
	insertAsset(await decodeImageFile(file));
}

// selected image body edit
function update(
	fn: (image: ImageRef, sel: ImageSel) => ImageRef,
	amend = false,
) {
	const s = writeStore.get();
	const sel = selectedImage(s);
	if (!s || !sel) return;
	const image = fn(sel.image, sel);
	if (image === sel.image) return;
	const range = rangeOf(sel.block, sel.offset);
	const next = applyChar(s.doc, range, { image });
	if (amend) writeStore.amend({ doc: next.doc, sel: range });
	else commit({ doc: next.doc, sel: range }, 'format');
}

const unfloated = (image: ImageRef): ImageRef => {
	const out = { ...image };
	delete out.float;
	return out;
};

// x column, y paragraph
function shownAt(layout: Layout | null, sel: ImageSel) {
	const r = layout && imageRect(layout, sel);
	if (!layout || !r) return { x: 0, y: 0 };
	const page = layout.pages[r.page]!;
	const first = page.lines.find(
		(l) => l.block === sel.block && l.start === 0 && !l.kind,
	);
	const col = page.cols[r.col] ?? page.cols[0]!;
	return {
		x: Math.max(0, r.x - col.left),
		y: first ? Math.max(0, r.y - paraTop(first)) : 0,
	};
}

const paraTop = (first: Line) => first.top - (first.skip ?? 0);

/** Inline, or floating with this wrap; a new float stays where the image shows. */
export function setWrap(wrap: Wrap | 'inline') {
	const s = writeStore.get();
	update((image, sel) => {
		if (wrap === 'inline')
			return image.float ? unfloated(image) : image;
		if (image.float?.wrap === wrap) return image;
		const float: ImageFloat = image.float
			? { ...image.float, wrap }
			: {
					wrap,
					side: 'both',
					distance: DEFAULT_DISTANCE,
					...shownAt(
						s && currentLayout(s.doc),
						sel,
					),
				};
		return { ...image, float };
	});
	focusEditor();
}

export function setFloat(
	props: Partial<Pick<ImageFloat, 'side' | 'distance'>>,
) {
	update((image) =>
		image.float
			? { ...image, float: { ...image.float, ...props } }
			: image,
	);
	focusEditor();
}

export function resetSize() {
	const s = writeStore.get();
	update((image, sel) => {
		const asset = s?.doc.images?.[image.id];
		return asset
			? { ...image, ...naturalSize(s.doc, sel.block, asset) }
			: image;
	});
	focusEditor();
}

// float offsets stay positive
const withFloatAt = (image: ImageRef, x: number, y: number): ImageRef =>
	image.float
		? {
				...image,
				float: {
					...image.float,
					x: Math.max(0, x),
					y: Math.max(0, y),
				},
			}
		: image;

/** Resizes the selected image within its column; a float also takes x and y, which a top or left handle moves. amend joins a drag into one undo step. */
export function resizeImage(
	w: number,
	h: number,
	at: { x: number; y: number } | null,
	amend: boolean,
) {
	const s = writeStore.get();
	update((image, sel) => {
		const { colW, colH } = box(s!.doc, sel.block);
		const sized = {
			...image,
			...fit(
				Math.max(MIN_IMAGE, w),
				Math.max(MIN_IMAGE, h),
				colW,
				colH,
			),
		};
		return at ? withFloatAt(sized, at.x, at.y) : sized;
	}, amend);
}

/** Moves the selected float to x, y from its anchor; amend joins a drag into one undo step. */
export function moveFloat(x: number, y: number, amend: boolean) {
	update((image) => withFloatAt(image, x, y), amend);
}

// owner of the caption
const firstFloat = (p: Paragraph) => {
	let pos = 0;
	for (const r of p.runs) {
		if (r.props.image?.float) return pos;
		pos += r.text.length;
	}
	return -1;
};

/** After a move: anchors the selected float to the paragraph under its top on its page, keeping where it shows; its caption moves along. A paragraph with a caption of its own refuses it. One undo step with the drag. */
export function reanchor() {
	const s = writeStore.get();
	const sel = selectedImage(s);
	const layout = s && currentLayout(s.doc);
	if (!s || !sel || !layout || !sel.image.float) return;
	const r = imageRect(layout, sel);
	if (!r) return;
	const page = layout.pages[r.page]!;
	const starts = page.lines.filter(
		(l) =>
			!l.kind &&
			l.start === 0 &&
			(l.col ?? 0) === r.col &&
			s.doc.blocks[l.block]?.kind === 'para' &&
			captionOf(s.doc, l.block - 1) !== l.block,
	);
	const target =
		starts.findLast((l) => paraTop(l) <= r.y + 1e-6) ?? starts[0];
	if (
		!target ||
		target.block === sel.block ||
		captionOf(s.doc, target.block) >= 0
	)
		return;
	const y = Math.max(0, r.y - paraTop(target));
	const image = { ...sel.image, float: { ...sel.image.float, y } };
	const old = s.doc.blocks[sel.block] as Paragraph;
	const props = {
		...old.runs.find((x) => x.props.image === sel.image)!.props,
		image,
	};
	const capAt =
		firstFloat(old) === sel.offset
			? captionOf(s.doc, sel.block)
			: -1;
	let doc = deleteSel(s.doc, rangeOf(sel.block, sel.offset)).doc;
	let to = target.block;
	const cap = capAt >= 0 ? doc.blocks[capAt]! : null;
	if (cap) {
		doc = {
			...doc,
			blocks: doc.blocks.filter((_, i) => i !== capAt),
		};
		if (to > capAt) to--;
	}
	doc = insertText(
		doc,
		caret({ block: to, offset: 0 }),
		FIELD_CHAR,
		props,
	).doc;
	if (cap) {
		const blocks = doc.blocks.slice();
		blocks.splice(to + 1, 0, cap);
		doc = { ...doc, blocks };
	}
	writeStore.amend({ doc, sel: rangeOf(to, 0) });
}

/** Adds a caption paragraph after the image's paragraph, caret in it, or removes it. */
export function toggleCaption() {
	const s = writeStore.get();
	const sel = selectedImage(s);
	if (!s || !sel) return;
	const at = captionOf(s.doc, sel.block);
	const blocks = s.doc.blocks.slice();
	if (at >= 0) {
		blocks.splice(at, 1);
		commit(
			{
				doc: { ...s.doc, blocks },
				sel: rangeOf(sel.block, sel.offset),
			},
			'other',
		);
	} else {
		blocks.splice(sel.block + 1, 0, {
			kind: 'para',
			id: newId(),
			style: 'caption',
			props: {},
			runs: [
				{
					text: FIELD_CHAR,
					props: { field: 'figure' },
				},
				{ text: ' ', props: {} },
			],
			dir: 'ltr',
		});
		commit(
			{
				doc: { ...s.doc, blocks },
				sel: caret({ block: sel.block + 1, offset: 2 }),
			},
			'other',
		);
	}
	focusEditor();
}

/** Where an image shows: a float's box without its caption, or an inline image on its line. */
export interface ImageRect {
	page: number;
	col: number;
	x: number;
	y: number;
	w: number;
	h: number;
	float: boolean;
}

/** The page rect of an image character. */
export function imageRect(
	layout: Layout,
	at: { block: number; offset: number },
): ImageRect | null {
	for (const page of layout.pages) {
		const f = page.floats.find(
			(f) => f.block === at.block && f.offset === at.offset,
		);
		if (f)
			return {
				page: page.index,
				col: f.col,
				x: f.x,
				y: f.y,
				w: f.w,
				h: f.h,
				float: true,
			};
		for (const line of page.lines) {
			if (line.block !== at.block || line.kind) continue;
			const sp = line.spans.find(
				(x) => x.image && x.start === at.offset,
			);
			if (sp)
				return {
					page: page.index,
					col: line.col ?? 0,
					x: sp.xs[0]!,
					y: line.baseline - sp.image!.h,
					w: sp.image!.w,
					h: sp.image!.h,
					float: false,
				};
		}
	}
	return null;
}

const inside = (
	x: number,
	y: number,
	r: { x: number; y: number; w: number; h: number },
) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// within line glyphs
const onText = (lines: Line[], x: number, y: number) =>
	lines.some(
		(l) =>
			!l.kind &&
			y >= l.top &&
			y <= l.top + l.height &&
			l.spans.length > 0 &&
			x >= l.spans[0]!.xs[0]! &&
			x <= l.spans.at(-1)!.xs.at(-1)!,
	);

/** The image character under a page point: floats over text first, then inline images, then floats behind text where no text is. */
export function imageHit(
	layout: Layout,
	page: number,
	x: number,
	y: number,
): { block: number; offset: number } | null {
	const p = layout.pages[page];
	if (!p) return null;
	const floats = [...p.floats].reverse();
	const hit = (f: (typeof floats)[number]) => inside(x, y, f);
	const over = floats.find(
		(f) => f.image.float!.wrap !== 'behind' && hit(f),
	);
	if (over) return over;
	for (const line of p.lines)
		for (const sp of line.spans)
			if (
				sp.image &&
				inside(x, y, {
					x: sp.xs[0]!,
					y: line.baseline - sp.image.h,
					w: sp.image.w,
					h: sp.image.h,
				})
			)
				return { block: line.block, offset: sp.start };
	if (onText(p.lines, x, y)) return null;
	return floats.find(hit) ?? null;
}

/** Selects the image character at a body position. */
export function selectImage(at: { block: number; offset: number }) {
	const s = writeStore.get();
	if (!s) return;
	leaveInner();
	writeStore.breakMerge();
	commit({ doc: s.doc, sel: rangeOf(at.block, at.offset) }, 'other');
}
