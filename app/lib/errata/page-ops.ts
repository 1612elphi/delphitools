import {
	blankPage,
	boxAt,
	flipPage,
	insertSize,
	newId,
	pageSize,
	rotatePage,
	withCrop,
	withResize,
	type ContentEdit,
	type ErrataPage,
	type FlipAxis,
	type PageCrop,
	type PageResize,
} from './doc-model';
import {
	addObject,
	currentPage,
	getPageIndex,
	setPageIndex,
	store,
	updatePage,
} from './store';
import { imagePage } from './source';
import { decodeImageFile, headerOf } from './write/image';
import { textObject } from './stamps';
import { activeTool } from './tool';
import { selectObject } from './ui';

type Ids = ReadonlySet<string>;

/** the pages in `ids`, in document order, moved to insertion index `to` of the unmoved list */
export function movePages(
	pages: readonly ErrataPage[],
	ids: Ids,
	to: number,
): ErrataPage[] {
	const at = pages.slice(0, to).filter((p) => !ids.has(p.id)).length;
	const rest = pages.filter((p) => !ids.has(p.id));
	rest.splice(at, 0, ...pages.filter((p) => ids.has(p.id)));
	return rest;
}

export function rotatePages(
	pages: readonly ErrataPage[],
	ids: Ids,
	turns: 1 | -1,
): ErrataPage[] {
	return pages.map((p) => (ids.has(p.id) ? rotatePage(p, turns) : p));
}

export function flipPages(
	pages: readonly ErrataPage[],
	ids: Ids,
	axis: FlipAxis,
): ErrataPage[] {
	return pages.map((p) => (ids.has(p.id) ? flipPage(p, axis) : p));
}

/** never removes the last page */
export function deletePages(
	pages: readonly ErrataPage[],
	ids: Ids,
): ErrataPage[] {
	const rest = pages.filter((p) => !ids.has(p.id));
	return rest.length > 0 ? rest : pages.slice();
}

/** each page followed by its copy; content edits are shared, objects get new ids */
export function duplicatePages(
	pages: readonly ErrataPage[],
	ids: Ids,
): ErrataPage[] {
	return pages.flatMap((p) =>
		ids.has(p.id)
			? [
					p,
					{
						...p,
						id: newId(),
						objects: p.objects.map((o) => ({
							...o,
							id: newId(),
						})),
					},
				]
			: [p],
	);
}

/** a blank page the size of the last selected page, after it; at the end without a selection */
export function insertBlank(
	pages: readonly ErrataPage[],
	ids: Ids,
): ErrataPage[] {
	let at = pages.length;
	for (let i = pages.length - 1; i >= 0; i--)
		if (ids.has(pages[i]!.id)) {
			at = i + 1;
			break;
		}
	const { width, height } = insertSize(pages, at);
	const next = pages.slice();
	next.splice(at, 0, blankPage(width, height));
	return next;
}

/** one undo step; an unchanged order is no step */
export function updatePages(
	op: (pages: readonly ErrataPage[]) => ErrataPage[],
): void {
	store.update((doc) => {
		const pages = op(doc.pages);
		const same =
			pages.length === doc.pages.length &&
			pages.every((p, i) => p === doc.pages[i]);
		return same ? doc : { ...doc, pages };
	});
}

export function rotateCurrent(pageId: string, turns: 1 | -1): void {
	updatePages((pages) => rotatePages(pages, new Set([pageId]), turns));
}

export function deletePage(pageId: string): void {
	updatePages((pages) => deletePages(pages, new Set([pageId])));
	setPageIndex(getPageIndex());
}

export function insertPageAt(index: number, page: ErrataPage): void {
	updatePages((pages) => {
		const next = pages.slice();
		next.splice(Math.max(0, Math.min(index, next.length)), 0, page);
		return next;
	});
	const doc = store.getSnapshot();
	if (doc) setPageIndex(doc.pages.findIndex((p) => p.id === page.id));
}

export function insertPageAfter(pageId: string | null, page: ErrataPage): void {
	const doc = store.getSnapshot();
	const at = pageId
		? (doc?.pages.findIndex((p) => p.id === pageId) ?? -1)
		: -1;
	insertPageAt(at + 1, page);
}

function sizeOf(pageId: string): { width: number; height: number } {
	const pages = store.getSnapshot()?.pages ?? [];
	return insertSize(pages, pages.findIndex((p) => p.id === pageId) + 1);
}

export function insertBlankAfter(pageId: string): void {
	const { width, height } = sizeOf(pageId);
	insertPageAfter(pageId, blankPage(width, height));
}

export function duplicateAfter(pageId: string): void {
	updatePages((pages) => duplicatePages(pages, new Set([pageId])));
	const doc = store.getSnapshot();
	if (doc) setPageIndex(doc.pages.findIndex((p) => p.id === pageId) + 1);
}

/** one black pixel image */
export function insertBlackAfter(pageId: string): void {
	const { width, height } = sizeOf(pageId);
	const pixel = document.createElement('canvas');
	pixel.width = pixel.height = 1;
	pixel.getContext('2d')!.fillRect(0, 0, 1, 1);
	insertPageAfter(pageId, {
		...blankPage(width, height),
		image: {
			dataUrl: pixel.toDataURL('image/png'),
			naturalWidth: 1,
			naturalHeight: 1,
		},
	});
}

const TEXT_PAGE_SIZE = 48;

/** centred, selected text */
export function insertTextPageAfter(pageId: string, text: string): void {
	const { width, height } = sizeOf(pageId);
	const object = textObject(
		text,
		TEXT_PAGE_SIZE,
		'#000000',
		width / 2,
		height / 2,
	);
	insertPageAfter(pageId, {
		...blankPage(width, height),
		objects: [object],
	});
	activeTool.set('select');
	selectObject(object.id);
}

/** one undo step */
export function resizePages(
	ids: Ids,
	resize: (page: ErrataPage) => PageResize | null,
): void {
	updatePages((pages) =>
		pages.map((p) =>
			ids.has(p.id) ? withResize(p, resize(p)) : p,
		),
	);
}

export function resizePage(pageId: string, resize: PageResize | null): void {
	resizePages(new Set([pageId]), () => resize);
}

export function cropPage(pageId: string, crop: PageCrop | null): void {
	updatePage(pageId, (page) => withCrop(page, crop));
}

/** takes toId's slot */
export function movePage(fromId: string, toId: string): void {
	updatePages((pages) => {
		const from = pages.findIndex((p) => p.id === fromId);
		const to = pages.findIndex((p) => p.id === toId);
		if (from === -1 || to === -1) return pages.slice();
		return movePages(
			pages,
			new Set([fromId]),
			from < to ? to + 1 : to,
		);
	});
	const doc = store.getSnapshot();
	if (doc) setPageIndex(doc.pages.findIndex((p) => p.id === fromId));
}

export function addContentEdits(pageId: string, edits: ContentEdit[]): void {
	if (edits.length === 0) return;
	store.update((doc) => {
		const source = doc.pages.find(
			(p) => p.id === pageId,
		)?.sourceIndex;
		// copies share source stream
		return {
			...doc,
			pages: doc.pages.map((p) =>
				p.id === pageId ||
				(source != null && p.sourceIndex === source)
					? {
							...p,
							edits: [
								...p.edits,
								...edits,
							],
						}
					: p,
			),
		};
	});
}

/** The file typed by its bytes when PNG or JPEG, else the image as PNG, or JPEG when large; throws when the browser cannot decode it. */
export async function embeddableImage(file: File): Promise<File> {
	const head = await file.slice(0, 32).arrayBuffer();
	const known = headerOf(new Uint8Array(head));
	if (known) return new File([file], file.name, { type: known.mime });
	const asset = await decodeImageFile(file);
	return new File([asset.bytes as BlobPart], file.name, {
		type: asset.mime,
	});
}

/** an image file becomes an object at the centre of the current page, at most half the page each way */
export async function placeImage(file: File): Promise<void> {
	const page = currentPage();
	if (!page) return;
	const { image } = await imagePage(await embeddableImage(file));
	if (!image) return;
	const size = pageSize(page);
	const scale = Math.min(
		1,
		size.width / 2 / image.naturalWidth,
		size.height / 2 / image.naturalHeight,
	);
	const w = image.naturalWidth * scale;
	const h = image.naturalHeight * scale;
	const box = boxAt({
		x: (size.width - w) / 2,
		y: (size.height - h) / 2,
		width: w,
		height: h,
	});
	addObject(page.id, { ...box, kind: 'image', dataUrl: image.dataUrl });
	activeTool.set('select');
	selectObject(box.id);
}
