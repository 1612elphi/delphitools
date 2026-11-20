import { channel } from 'delphitools-v2/lib/channel';
import {
	ITEXT,
	NOTE_PATH,
	blankPage,
	type ErrataDoc,
	type PageObject,
} from 'delphitools-v2/lib/errata/doc-model';
import { setPageIndex, store } from 'delphitools-v2/lib/errata/store';
import { activeTool } from 'delphitools-v2/lib/errata/tool';
import { openNote, setMode } from 'delphitools-v2/lib/errata/ui';
import { FONT } from 'delphitools-v2/lib/errata/field-visual';
import { currentLayout } from './editor';
import { withPageMarks } from './model';
import { writeStore } from './store';
import type { Layout, PageBox, WriteDoc } from './types';
import { visiblePage } from './view';

/** true while clicks on a written page go to its overlay */
export const markup = channel(false);

const pageIds = new WeakMap<PageBox, string>();
let serial = 0;
// our own commit
let committing = false;

const same = (
	a: readonly PageObject[][] | undefined,
	b: readonly PageObject[][] | undefined,
) =>
	(a?.length ?? 0) === (b?.length ?? 0) &&
	(a ?? []).every((o, i) => o === b![i]);

/** One blank page per written page, its marks as objects. */
export function mirrorOf(doc: WriteDoc, layout: Layout): ErrataDoc {
	return {
		name: doc.name,
		pages: layout.pages.map((box, i) => {
			let id = pageIds.get(box);
			if (!id) pageIds.set(box, (id = `wp:${++serial}`));
			return {
				...blankPage(box.width, box.height),
				id,
				objects: doc.overlays?.[i] ?? [],
			};
		}),
	};
}

const images = new Map<string, HTMLImageElement>();
/** bumps when a mark image loads */
export const marksReady = channel(0);

const NOTE = new Path2D(NOTE_PATH);

function markImage(url: string): HTMLImageElement | null {
	let img = images.get(url);
	if (!img) {
		img = new Image();
		img.onload = () => marksReady.set(marksReady.get() + 1);
		img.src = url;
		images.set(url, img);
	}
	return img.complete && img.naturalWidth ? img : null;
}

/** Draws page marks in pt over the current transform, as the markup canvas shows them. */
export function paintMarks(
	ctx: CanvasRenderingContext2D,
	marks: readonly PageObject[],
): void {
	for (const o of marks) {
		ctx.save();
		ctx.translate(o.cx, o.cy);
		ctx.rotate((o.angle * Math.PI) / 180);
		ctx.scale(o.scaleX, o.scaleY);
		const { w, h } = o;
		ctx.lineCap = ctx.lineJoin = 'round';
		if (o.kind === 'ink') {
			ctx.translate(-w / 2, -h / 2);
			ctx.strokeStyle = o.colour;
			ctx.lineWidth = o.strokeWidth;
			ctx.stroke(new Path2D(o.d));
		} else if (o.kind === 'shape' && o.shape === 'highlight') {
			ctx.globalAlpha = 0.4;
			ctx.globalCompositeOperation = 'multiply';
			ctx.fillStyle = o.colour;
			ctx.fillRect(-w / 2, -h / 2, w, h);
		} else if (o.kind === 'shape') {
			ctx.strokeStyle = o.colour;
			ctx.lineWidth = o.strokeWidth;
			ctx.lineJoin = 'miter';
			ctx.beginPath();
			if (o.shape === 'rect') ctx.rect(-w / 2, -h / 2, w, h);
			else if (o.shape === 'ellipse')
				ctx.ellipse(
					0,
					0,
					w / 2,
					h / 2,
					0,
					0,
					Math.PI * 2,
				);
			else {
				ctx.moveTo(-w / 2, 0);
				ctx.lineTo(w / 2, 0);
			}
			ctx.stroke();
		} else if (o.kind === 'text') {
			const size = o.fontSize;
			ctx.globalAlpha = o.opacity ?? 1;
			ctx.fillStyle = o.colour;
			ctx.font = `${o.bold ? 'bold ' : ''}${size}px ${FONT}`;
			o.text
				.split('\n')
				.forEach((line, i) =>
					ctx.fillText(
						line,
						-w / 2,
						-h / 2 +
							size *
								ITEXT.mult *
								(ITEXT.baseline +
									i *
										ITEXT.lineHeight),
					),
				);
		} else if (o.kind === 'image') {
			const img = markImage(o.dataUrl);
			if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
		} else if (o.kind === 'comment') {
			ctx.translate(-10, -10);
			ctx.fillStyle = '#ffd100';
			ctx.strokeStyle = '#1a1a1a';
			ctx.lineWidth = 1;
			ctx.fill(NOTE);
			ctx.stroke(NOTE);
		}
		ctx.restore();
	}
}

export function startMarkup(): void {
	const s = writeStore.get();
	const layout = s && currentLayout(s.doc);
	if (markup.get() || !s || !layout) return;
	const page = visiblePage();
	markup.set(true);
	store.record(false);
	store.setDoc(mirrorOf(s.doc, layout));
	setPageIndex(page);
}

export function stopMarkup(): void {
	if (!markup.get()) return;
	setMode(null);
	openNote.set(null);
	activeTool.set('select');
	markup.set(false);
	store.setDoc(null);
	store.record(true);
}

store.subscribe(() => {
	const mirror = store.getSnapshot();
	const s = writeStore.get();
	if (!markup.get() || !mirror || !s || store.isGestureActive()) return;
	const overlays = withPageMarks(
		s.doc.overlays,
		mirror.pages.map((p) => p.objects),
	);
	if (same(overlays, s.doc.overlays)) return;
	const doc = { ...s.doc, overlays };
	if (!overlays) delete doc.overlays;
	committing = true;
	try {
		writeStore.commit({ ...s, doc }, 'other');
	} finally {
		committing = false;
	}
});

writeStore.subscribe(() => {
	if (committing || !markup.get()) return;
	const s = writeStore.get();
	const layout = s && currentLayout(s.doc);
	if (layout) store.setDoc(mirrorOf(s.doc, layout));
	else stopMarkup();
});
