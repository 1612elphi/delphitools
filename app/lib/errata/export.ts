import {
	BlendMode,
	LineCapStyle,
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNumber,
	PDFRef,
	PDFStream,
	StandardFonts,
	clip,
	concatTransformationMatrix,
	degrees,
	endPath,
	popGraphicsState,
	pushGraphicsState,
	rectangle,
	rgb,
	type PDFFont,
	type PDFObject,
	type PDFOperator,
	type PDFPage,
} from 'pdf-lib';
import {
	ITEXT,
	contentBox,
	contentPlacement,
	displayedToUser,
	flipMatrix,
	totalRotation,
	unrotatedSize,
	type ErrataDoc,
	type ErrataPage,
	type PageObject,
} from './doc-model';
import { applyEditsToDoc } from './content';
import { writeComments } from './comments';
import { redactPdf } from './redact';
import { addFormFields, carryAcroForm } from './fields';
import { hexToRgb } from '../colour-maths';

function colour(hex: string) {
	const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
	return rgb(r / 255, g / 255, b / 255);
}

// winansi only, else '?'
export function encodable(font: PDFFont, text: string): string {
	let out = '';
	for (const ch of text) {
		try {
			font.encodeText(ch);
			out += ch;
		} catch {
			out += ch === '\n' ? '\n' : '?';
		}
	}
	return out;
}

type Embedded = Awaited<ReturnType<PDFDocument['embedPng']>>;

interface Faces {
	font: PDFFont;
	bold?: PDFFont;
	images: Map<string, Embedded>;
}

async function drawObjects(
	out: PDFDocument,
	pdfPage: PDFPage,
	page: ErrataPage,
	faces: Faces,
): Promise<void> {
	for (const object of page.objects) {
		const face =
			object.kind === 'text' && object.bold
				? (faces.bold ??= await out.embedFont(
						StandardFonts.HelveticaBold,
					))
				: faces.font;
		await drawObject(pdfPage, page, object, face, faces.images);
	}
	writeComments(pdfPage, page);
}

function isolateContent(pdfPage: PDFPage, ...ops: PDFOperator[]): void {
	const ctx = pdfPage.doc.context;
	pdfPage.node.normalize();
	pdfPage.node.wrapContentStreams(
		ctx.register(ctx.contentStream([pushGraphicsState(), ...ops])),
		ctx.register(ctx.contentStream([popGraphicsState()])),
	);
}

/** Draws each page's objects over the same page of a PDF; pages line up by index. */
export async function flattenObjects(
	bytes: Uint8Array,
	pages: readonly ErrataPage[],
): Promise<Uint8Array> {
	const out = await PDFDocument.load(bytes);
	const faces: Faces = {
		font: await out.embedFont(StandardFonts.Helvetica),
		images: new Map(),
	};
	for (const [i, page] of pages.entries()) {
		if (!page.objects.length) continue;
		const pdfPage = out.getPage(i);
		// content may leave transforms
		isolateContent(pdfPage);
		await drawObjects(out, pdfPage, page, faces);
	}
	return out.save();
}

async function drawObject(
	pdfPage: PDFPage,
	page: ErrataPage,
	object: PageObject,
	font: PDFFont,
	images: Map<string, Embedded>,
): Promise<void> {
	if (
		object.kind === 'comment' ||
		object.kind === 'redact' ||
		object.kind === 'field'
	)
		return;
	const rotation = totalRotation(page);
	const box = pdfPage.getCropBox();
	const u = unrotatedSize(page);
	const centre = displayedToUser(
		object.cx,
		object.cy,
		rotation,
		u.width,
		u.height,
	);
	const theta = ((rotation - object.angle) * Math.PI) / 180;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const { w, h, scaleX, scaleY } = object;

	pdfPage.pushOperators(
		pushGraphicsState(),
		concatTransformationMatrix(
			cos,
			sin,
			-sin,
			cos,
			box.x + centre.x,
			box.y + centre.y,
		),
		concatTransformationMatrix(scaleX, 0, 0, scaleY, 0, 0),
	);

	switch (object.kind) {
		case 'text': {
			const size = object.fontSize;
			pdfPage.drawText(encodable(font, object.text), {
				x: -w / 2,
				y: h / 2 - size * ITEXT.mult * ITEXT.baseline,
				size,
				font,
				color: colour(object.colour),
				opacity: object.opacity,
				lineHeight:
					size * ITEXT.lineHeight * ITEXT.mult,
			});
			break;
		}
		case 'ink':
			pdfPage.drawSvgPath(object.d, {
				x: -w / 2,
				y: h / 2,
				borderColor: colour(object.colour),
				borderWidth: object.strokeWidth,
				borderLineCap: LineCapStyle.Round,
			});
			break;
		case 'shape': {
			const stroke = colour(object.colour);
			if (object.shape === 'highlight') {
				pdfPage.drawRectangle({
					x: -w / 2,
					y: -h / 2,
					width: w,
					height: h,
					color: stroke,
					blendMode: BlendMode.Multiply,
				});
			} else if (object.shape === 'rect') {
				pdfPage.drawRectangle({
					x: -w / 2,
					y: -h / 2,
					width: w,
					height: h,
					borderColor: stroke,
					borderWidth: object.strokeWidth,
				});
			} else if (object.shape === 'ellipse') {
				pdfPage.drawEllipse({
					x: 0,
					y: 0,
					xScale: w / 2,
					yScale: h / 2,
					borderColor: stroke,
					borderWidth: object.strokeWidth,
				});
			} else {
				pdfPage.drawLine({
					start: { x: -w / 2, y: 0 },
					end: { x: w / 2, y: 0 },
					color: stroke,
					thickness: object.strokeWidth,
					lineCap: LineCapStyle.Round,
				});
			}
			break;
		}
		case 'image': {
			let embedded = images.get(object.dataUrl);
			if (!embedded) {
				embedded = object.dataUrl.startsWith(
					'data:image/jpeg',
				)
					? await pdfPage.doc.embedJpg(
							object.dataUrl,
						)
					: await pdfPage.doc.embedPng(
							object.dataUrl,
						);
				images.set(object.dataUrl, embedded);
			}
			pdfPage.drawImage(embedded, {
				x: -w / 2,
				y: -h / 2,
				width: w,
				height: h,
			});
			break;
		}
		default:
			object satisfies never;
	}

	pdfPage.pushOperators(popGraphicsState());
}

const ANNOTS = PDFName.of('Annots');
const CONTENTS = PDFName.of('Contents');

function numbers(array: PDFArray): number[] {
	return array
		.asArray()
		.map((n) => (n instanceof PDFNumber ? n.asNumber() : 0));
}

// duplicates share copied arrays
function ownArrays(pdfPage: PDFPage, cloneAnnots: boolean): void {
	const node = pdfPage.node;
	const ctx = pdfPage.doc.context;
	const contents = node.lookup(CONTENTS);
	if (contents instanceof PDFArray)
		node.set(CONTENTS, ctx.obj(contents.asArray()));
	const annots = node.Annots();
	if (!annots) return;
	const refs = annots.asArray();
	const fresh = new Map<PDFObject, PDFRef>();
	if (cloneAnnots)
		for (const ref of refs) {
			const dict = ctx.lookup(ref);
			if (dict instanceof PDFDict)
				fresh.set(ref, ctx.register(dict.clone(ctx)));
		}
	const own = refs.map((r) => fresh.get(r) ?? r);
	for (const ref of own) {
		const dict = ctx.lookup(ref);
		if (!(dict instanceof PDFDict)) continue;
		// copier leaves stale /P
		if (dict.has(PDFName.of('P')))
			dict.set(PDFName.of('P'), pdfPage.ref);
		if (!cloneAnnots) continue;
		for (const key of ['Popup', 'IRT', 'Parent']) {
			const v = dict.get(PDFName.of(key));
			const to = v && fresh.get(v);
			if (to) dict.set(PDFName.of(key), to);
		}
		// same field, second widget
		dict.lookupMaybe(PDFName.of('Parent'), PDFDict)
			?.lookupMaybe(PDFName.of('Kids'), PDFArray)
			?.push(ref);
	}
	node.set(ANNOTS, ctx.obj(own));
}

// widget appearances stay unmirrored
function mirror(pdfPage: PDFPage, page: ErrataPage): void {
	const box = pdfPage.getCropBox();
	const [a, , , d, e, f] = flipMatrix(page, box.width, box.height);
	const tx = e + box.x - a * box.x;
	const ty = f + box.y - d * box.y;
	const ctx = pdfPage.doc.context;
	isolateContent(pdfPage, concatTransformationMatrix(a, 0, 0, d, tx, ty));
	const x = (v: number) => a * v + tx;
	const y = (v: number) => d * v + ty;
	const annots = pdfPage.node.Annots();
	for (let i = 0; i < (annots?.size() ?? 0); i++) {
		const annot = annots!.lookupMaybe(i, PDFDict);
		if (!annot) continue;
		const rect = annot.lookupMaybe(PDFName.of('Rect'), PDFArray);
		if (rect) {
			const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = numbers(rect);
			annot.set(
				PDFName.of('Rect'),
				ctx.obj([
					Math.min(x(x1), x(x2)),
					Math.min(y(y1), y(y2)),
					Math.max(x(x1), x(x2)),
					Math.max(y(y1), y(y2)),
				]),
			);
		}
		const quads = annot.lookupMaybe(
			PDFName.of('QuadPoints'),
			PDFArray,
		);
		if (quads)
			annot.set(
				PDFName.of('QuadPoints'),
				ctx.obj(
					numbers(quads).map((v, j) =>
						j % 2 ? y(v) : x(v),
					),
				),
			);
	}
}

// copyPages copies linked pages
function dropStalePages(out: PDFDocument): void {
	const ctx = out.context;
	const live = new Set(out.getPages().map((p) => p.ref));
	for (const [ref, obj] of ctx.enumerateIndirectObjects())
		if (
			obj instanceof PDFDict &&
			obj.get(PDFName.Type) === PDFName.of('Page') &&
			!live.has(ref)
		)
			for (const key of [
				'Contents',
				'Resources',
				'Annots',
				'Thumb',
				'Parent',
			])
				obj.delete(PDFName.of(key));
	// save writes unreachable objects
	const reached = new Set<PDFRef>();
	const stack: PDFObject[] = Object.values(ctx.trailerInfo).filter(
		(v): v is PDFObject => !!v,
	);
	while (stack.length) {
		const o = stack.pop()!;
		if (o instanceof PDFRef) {
			if (reached.has(o)) continue;
			reached.add(o);
			const target = ctx.lookup(o);
			if (target) stack.push(target);
		} else if (o instanceof PDFDict) stack.push(...o.values());
		else if (o instanceof PDFArray) stack.push(...o.asArray());
		else if (o instanceof PDFStream) stack.push(o.dict);
	}
	for (const [ref] of ctx.enumerateIndirectObjects())
		if (!reached.has(ref)) ctx.delete(ref);
}

export async function exportPdf(
	doc: ErrataDoc,
	sourceBytes: Uint8Array | null,
): Promise<Uint8Array> {
	const out = await PDFDocument.create();
	const source = sourceBytes ? await PDFDocument.load(sourceBytes) : null;
	if (source) applyEditsToDoc(source, doc.pages);
	const font = await out.embedFont(StandardFonts.Helvetica);
	const faces: Faces = { font, images: new Map() };

	const flipped = (p: ErrataPage) => p.flipX || p.flipY;
	const copyable = (p: ErrataPage) => p.sourceIndex !== null && !p.resize;
	const copyIndices = doc.pages
		.filter(copyable)
		.map((p) => p.sourceIndex!);
	const copied = source ? await out.copyPages(source, copyIndices) : [];
	const kept: PDFPage[] = [];
	const seen = new Set<number>();
	let copiedAt = 0;

	for (const page of doc.pages) {
		const u = unrotatedSize(page);
		const c = contentBox(page);
		const p = contentPlacement(page);
		let pdfPage: PDFPage;
		if (copyable(page)) {
			pdfPage = out.addPage(copied[copiedAt++]);
			kept.push(pdfPage);
			ownArrays(pdfPage, seen.has(page.sourceIndex!));
			seen.add(page.sourceIndex!);
			if (page.crop) {
				const box = pdfPage.getCropBox();
				pdfPage.setCropBox(
					box.x + c.x,
					box.y +
						(page.baseHeight -
							c.y -
							c.height),
					c.width,
					c.height,
				);
			}
			if (flipped(page)) mirror(pdfPage, page);
		} else {
			pdfPage = out.addPage([u.width, u.height]);
			if (flipped(page))
				pdfPage.pushOperators(
					pushGraphicsState(),
					concatTransformationMatrix(
						...flipMatrix(
							page,
							u.width,
							u.height,
						),
					),
				);
			// pdf-lib needs content stream
			if (
				page.sourceIndex !== null &&
				source &&
				source.getPage(page.sourceIndex).node.Contents()
			) {
				const srcPage = source.getPage(
					page.sourceIndex,
				);
				const box = srcPage.getCropBox();
				const left = box.x + c.x;
				const bottom =
					box.y +
					(page.baseHeight - c.y - c.height);
				const embedded = await out.embedPage(
					srcPage,
					{
						left,
						bottom,
						right: left + c.width,
						top: bottom + c.height,
					},
					[1, 0, 0, 1, -left, -bottom],
				);
				pdfPage.drawPage(embedded, {
					x: p.x,
					y: u.height - p.y - c.height * p.scale,
					xScale: p.scale,
					yScale: p.scale,
				});
			} else if (page.image) {
				const isJpeg =
					page.image.dataUrl.startsWith(
						'data:image/jpeg',
					);
				const embedded = isJpeg
					? await out.embedJpg(page.image.dataUrl)
					: await out.embedPng(
							await asPng(
								page.image
									.dataUrl,
							),
						);
				// clip to content box
				pdfPage.pushOperators(
					pushGraphicsState(),
					rectangle(
						p.x,
						u.height -
							p.y -
							c.height * p.scale,
						c.width * p.scale,
						c.height * p.scale,
					),
					clip(),
					endPath(),
				);
				pdfPage.drawImage(embedded, {
					x: p.x - c.x * p.scale,
					y:
						u.height -
						p.y +
						c.y * p.scale -
						page.baseHeight * p.scale,
					width: page.baseWidth * p.scale,
					height: page.baseHeight * p.scale,
				});
				pdfPage.pushOperators(popGraphicsState());
			}
			if (flipped(page))
				pdfPage.pushOperators(popGraphicsState());
		}
		pdfPage.setRotation(degrees(totalRotation(page)));
		await drawObjects(out, pdfPage, page, faces);
	}
	if (source) carryAcroForm(source, out, kept);
	addFormFields(out, doc, font);
	await out.flush();
	dropStalePages(out);
	return redactPdf(await out.save(), doc.pages);
}

async function asPng(dataUrl: string): Promise<string> {
	if (dataUrl.startsWith('data:image/png')) return dataUrl;
	const img = new Image();
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('image decode failed'));
		img.src = dataUrl;
	});
	const canvas = document.createElement('canvas');
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	canvas.getContext('2d')!.drawImage(img, 0, 0);
	return canvas.toDataURL('image/png');
}
