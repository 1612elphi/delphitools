import type * as Mupdf from 'mupdf';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import { hexToRgb } from 'delphitools-v2/lib/colour-maths';
import { blankPage } from 'delphitools-v2/lib/errata/doc-model';
import { flattenObjects } from 'delphitools-v2/lib/errata/export';
import { ensureFonts, mupdfFont } from 'delphitools-v2/lib/errata/write/fonts';
import { attachHybrid } from 'delphitools-v2/lib/errata/write/hybrid';
import { outlineOf } from 'delphitools-v2/lib/errata/write/model';
import {
	DECO,
	STRIKE,
	UNDER,
	behind,
	borderRects,
} from 'delphitools-v2/lib/errata/write/paint';
import { SOFT_HYPHEN } from 'delphitools-v2/lib/errata/write/types';
import type {
	ImageRef,
	Layout,
	Line,
	PageBox,
	ParaBox,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

/** box in pt */
type DrawImage = (
	image: ImageRef,
	x: number,
	y: number,
	w: number,
	h: number,
) => void;

interface Mark {
	title: string;
	uri: string;
	level: number;
	down: Mark[];
}

function rgb(hex: string): [number, number, number] {
	const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
	return [r / 255, g / 255, b / 255];
}

function spansOf(line: Line) {
	const spans = [
		...(line.marker ? [line.marker] : []),
		...line.spans,
		...(line.hyphen ? [line.hyphen] : []),
	];
	return spans.filter(
		(s) => !s.image && !s.anchor && (s.shown ?? s.text),
	);
}

/** Renders the layout to a hybrid PDF that carries the .ata document. */
export async function exportWritePdf(
	doc: WriteDoc,
	layout: Layout,
): Promise<Uint8Array> {
	const mupdf = await getMupdf();
	const lines = layout.pages.flatMap(pageLines);
	await ensureFonts([
		...new Set(lines.flatMap((l) => spansOf(l).map((s) => s.file))),
	]);
	const buffer = new mupdf.Buffer();
	// smask recompression breaks checksum
	const writer = new mupdf.DocumentWriter(
		buffer,
		'pdf',
		'compress-images',
	);
	// per asset; null unreadable
	const made = new Map<string, Mupdf.Image | null>();
	let warned = false;
	let device: Mupdf.Device;
	const draw: DrawImage = ({ id }, x, y, w, h) => {
		if (!made.has(id)) {
			const asset = doc.images?.[id];
			let image: Mupdf.Image | null = null;
			try {
				if (asset) image = new mupdf.Image(asset.bytes);
			} catch (e) {
				if (!warned)
					console.warn(
						'errata: image skipped',
						e,
					);
				warned = true;
			}
			made.set(id, image);
		}
		const image = made.get(id);
		if (!image) return;
		try {
			device.fillImage(image, [w, 0, 0, h, x, y], 1);
		} catch (e) {
			if (!warned) console.warn('errata: image skipped', e);
			warned = true;
			image.destroy();
			made.set(id, null);
		}
	};
	try {
		for (const page of layout.pages) {
			device = writer.beginPage([
				0,
				0,
				page.width,
				page.height,
			]);
			const float = (f: PageBox['floats'][number]) =>
				draw(f.image, f.x, f.y, f.w, f.h);
			for (const box of page.boxes)
				drawBox(mupdf, device, box);
			for (const f of page.floats) if (behind(f)) float(f);
			for (const line of pageLines(page))
				drawLine(mupdf, device, line, draw);
			for (const f of page.floats) if (!behind(f)) float(f);
			writer.endPage();
		}
		writer.close();
	} finally {
		for (const image of made.values()) image?.destroy();
	}
	const marked = layout.pages.map((p, i) => ({
		...blankPage(p.width, p.height),
		objects: doc.overlays?.[i] ?? [],
	}));
	const pdf = mupdf.Document.openDocument(
		marked.some((p) => p.objects.length)
			? await flattenObjects(
					buffer.asUint8Array().slice(),
					marked,
				)
			: buffer,
		'application/pdf',
	).asPDF()!;
	pdf.subsetFonts();
	pdf.setMetaData(mupdf.Document.META_INFO_TITLE, doc.name);
	const heads = headingsOf(layout);
	writeOutline(pdf, doc, heads);
	writeLinks(pdf, layout, heads);
	await attachHybrid(pdf, doc);
	return pdf.saveToBuffer('compress,garbage').asUint8Array().slice();
}

const pageLines = (page: PageBox) => [
	...page.lines,
	...page.header,
	...page.footer,
	...page.notes,
	...page.toc,
	...page.cells.flatMap((c) => c.lines),
];

function fillRect(
	mupdf: typeof Mupdf,
	device: Mupdf.Device,
	[x0, y0, x1, y1]: [number, number, number, number],
	c: string,
) {
	const path = new mupdf.Path();
	path.rect(x0, y0, x1, y1);
	device.fillPath(
		path,
		false,
		mupdf.Matrix.identity,
		mupdf.ColorSpace.DeviceRGB,
		rgb(c),
		1,
	);
}

function drawBox(mupdf: typeof Mupdf, device: Mupdf.Device, box: ParaBox) {
	if (box.fill)
		fillRect(
			mupdf,
			device,
			[box.x, box.y, box.x + box.w, box.y + box.h],
			box.fill,
		);
	for (const [x, y, w, h, c] of borderRects(box))
		fillRect(mupdf, device, [x, y, x + w, y + h], c);
}

function drawLine(
	mupdf: typeof Mupdf,
	device: Mupdf.Device,
	line: Line,
	draw: DrawImage,
) {
	for (const s of line.spans)
		if (s.image)
			draw(
				s.image,
				s.xs[0]!,
				line.baseline - s.image.h,
				s.image.w,
				s.image.h,
			);
	const spans = spansOf(line);
	for (const s of spans)
		if (s.char.highlight)
			fillRect(
				mupdf,
				device,
				[
					s.xs[0]!,
					line.top,
					s.xs[s.text.length]!,
					line.top + line.height,
				],
				s.char.highlight,
			);
	for (const s of spans) {
		const font = mupdfFont(s.file);
		const y = line.baseline - s.rise;
		const text = new mupdf.Text();
		const shown = s.shown ?? s.text;
		const xs = s.shownXs ?? s.xs;
		for (let i = 0; i < shown.length; i++) {
			const code = shown.codePointAt(i)!;
			if (code !== SOFT_HYPHEN.charCodeAt(0))
				text.showGlyph(
					font,
					[s.size, 0, 0, -s.size, xs[i]!, y],
					font.encodeCharacter(code),
					code,
				);
			if (code > 0xffff) i++;
		}
		device.fillText(
			text,
			mupdf.Matrix.identity,
			mupdf.ColorSpace.DeviceRGB,
			rgb(s.char.colour),
			1,
		);
		const half = (s.size * DECO) / 2;
		const x0 = s.xs[0]!;
		const x1 = s.xs[s.text.length]!;
		for (const [on, at] of [
			[s.char.underline, y + s.size * UNDER],
			[s.char.strike, y - s.size * STRIKE],
		] as const)
			if (on)
				fillRect(
					mupdf,
					device,
					[x0, at - half, x1, at + half],
					s.char.colour,
				);
	}
}

// each block's first line
type Heads = Map<number, { page: number; top: number }>;

function headingsOf(layout: Layout): Heads {
	const out: Heads = new Map();
	for (const page of layout.pages)
		for (const line of page.lines)
			if (
				!line.kind &&
				line.start === 0 &&
				!out.has(line.block)
			)
				out.set(line.block, {
					page: page.index,
					top: line.top,
				});
	return out;
}

const destination = (
	pdf: Mupdf.PDFDocument,
	{ page, top }: { page: number; top: number },
) =>
	pdf.formatLinkURI({
		type: 'FitH',
		chapter: 0,
		page,
		x: 0,
		y: top,
		width: 0,
		height: 0,
		zoom: 0,
	});

function writeLinks(pdf: Mupdf.PDFDocument, layout: Layout, heads: Heads) {
	layout.pages.forEach((page, index) => {
		const links = pageLines(page).flatMap((line) =>
			line.spans
				.filter((s) => s.char.link && s.text)
				.map((s) => ({ line, s })),
		);
		const entries = page.toc.filter((l) => heads.has(l.block));
		if (!links.length && !entries.length) return;
		const p = pdf.loadPage(index);
		for (const { line, s } of links)
			p.createLink(
				[
					s.xs[0]!,
					line.top,
					s.xs[s.text.length]!,
					line.top + line.height,
				],
				s.char.link!,
			);
		for (const l of entries)
			p.createLink(
				[
					l.left,
					l.top,
					l.left + l.width,
					l.top + l.height,
				],
				destination(pdf, heads.get(l.block)!),
			);
	});
}

function writeOutline(pdf: Mupdf.PDFDocument, doc: WriteDoc, heads: Heads) {
	const root: Mark[] = [];
	const stack: Mark[] = [];
	for (const e of outlineOf(doc)) {
		const at = heads.get(e.block);
		if (!at) continue;
		const { level } = e;
		const mark: Mark = {
			title: e.text,
			uri: destination(pdf, at),
			level,
			down: [],
		};
		while (stack.length && stack.at(-1)!.level >= level)
			stack.pop();
		(stack.at(-1)?.down ?? root).push(mark);
		stack.push(mark);
	}
	insertMarks(pdf.outlineIterator(), root);
}

// insert advances the iterator
function insertMarks(it: Mupdf.OutlineIterator, marks: Mark[]) {
	for (const m of marks) {
		it.insert({ title: m.title, uri: m.uri, open: true });
		if (!m.down.length) continue;
		it.prev();
		it.down();
		insertMarks(it, m.down);
		it.up();
		it.next();
	}
}
