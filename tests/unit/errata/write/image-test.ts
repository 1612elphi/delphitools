import { module, test } from 'qunit';
import { strToU8, zipSync } from 'fflate';
import * as mupdf from 'mupdf';
import {
	ATA_MIME,
	openAta,
	saveAta,
} from 'delphitools-v2/lib/errata/write/ata';
import {
	browserMetrics,
	ensureFonts,
	filesForFamilies,
} from 'delphitools-v2/lib/errata/write/fonts';
import {
	bitmapFor,
	decodeImageFile,
	sniffImage,
} from 'delphitools-v2/lib/errata/write/image';
import {
	moveFloat,
	reanchor,
	resizeImage,
} from 'delphitools-v2/lib/errata/write/image-edit';
import {
	copy,
	ensureDocFonts,
	enter,
	paste,
	remove,
	selectRange,
	typeText,
} from 'delphitools-v2/lib/errata/write/editor';
import { newDoc } from 'delphitools-v2/lib/errata/write/model';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import {
	layoutDoc,
	type Resolver,
} from 'delphitools-v2/lib/errata/write/layout';
import { exportWritePdf } from 'delphitools-v2/lib/errata/write/pdf';
import { docToRtf, rtfToDoc } from 'delphitools-v2/lib/errata/write/rtf';
import {
	FIELD_CHAR,
	type Block,
	type ImageFloat,
	type ImageRef,
	type Metrics,
	type Paragraph,
	type ResolvedChar,
	type ResolvedPara,
	type Run,
	type Selection,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

// 0.5 em per character
const fake: Metrics = { pick: () => ({ file: 'f', advance: 0.5 }) };

const resolver: Resolver = {
	char: (_p, run): ResolvedChar => ({
		font: 'inter',
		size: 10,
		bold: false,
		italic: false,
		underline: false,
		strike: false,
		colour: '#000000',
		...run.props,
	}),
	para: (p): ResolvedPara => ({
		align: 'left',
		lineSpacing: 1,
		spaceBefore: 0,
		spaceAfter: 0,
		indent: 0,
		firstLine: 0,
		widow: false,
		...p.props,
	}),
};

/** header only, invalid pixels */
function pngHeader(w: number, h: number): Uint8Array {
	const b = new Uint8Array(33);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
	b.set(strToU8('IHDR'), 12);
	new DataView(b.buffer).setUint32(16, w);
	new DataView(b.buffer).setUint32(20, h);
	return b;
}

async function realPng(w: number, h: number): Promise<Uint8Array> {
	const c = new OffscreenCanvas(w, h);
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#c00';
	ctx.fillRect(0, 0, w, h);
	const blob = await c.convertToBlob({ type: 'image/png' });
	return new Uint8Array(await blob.arrayBuffer());
}

async function realJpeg(w: number, h: number): Promise<Uint8Array> {
	const c = new OffscreenCanvas(w, h);
	c.getContext('2d')!.fillRect(0, 0, w, h);
	const blob = await c.convertToBlob({ type: 'image/jpeg' });
	return new Uint8Array(await blob.arrayBuffer());
}

const asset = (bytes: Uint8Array) => sniffImage(bytes)!;

let ids = 0;
const run = (text: string): Run => ({ text, props: {} });
const imgRun = (image: ImageRef): Run => ({
	text: FIELD_CHAR,
	props: { image },
});
const paraOf = (
	runs: Run[],
	style: Paragraph['style'] = 'body',
): Paragraph => ({
	kind: 'para',
	id: `p${ids++}`,
	style,
	props: {},
	runs,
	dir: 'ltr',
});
const float = (f: Partial<ImageFloat>): ImageFloat => ({
	wrap: 'square',
	side: 'both',
	distance: 0,
	x: 0,
	y: 0,
	...f,
});

const WORDS = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll ';

// box x 10..290
function docOf(
	blocks: Block[],
	height = 400,
	images?: WriteDoc['images'],
): WriteDoc {
	const doc: WriteDoc = {
		version: 1,
		name: 't',
		setup: {
			width: 300,
			height,
			margins: { top: 10, right: 10, bottom: 10, left: 10 },
		},
		blocks,
	};
	if (images) doc.images = images;
	return doc;
}

const lay = (doc: WriteDoc) => layoutDoc(doc, fake, resolver);

module('Unit | errata | write | images', function () {
	test('an inline image is a glyph of its width and raises its line', function (assert) {
		const p = paraOf([
			run('aa '),
			imgRun({ id: 'i', w: 30, h: 40 }),
			run(' bb'),
		]);
		const [line] = lay(docOf([p])).pages[0]!.lines;
		const span = line!.spans.find((s) => s.image)!;
		assert.deepEqual(
			[span.start, span.xs[0], span.xs[1]],
			[3, 25, 55],
		);
		// ascent 40, descent 3
		assert.strictEqual(line!.height, 43);
		assert.strictEqual(line!.baseline, 10 + 40);
		const after = line!.spans.at(-1)!;
		assert.strictEqual(
			after.xs[0],
			55,
			'text after the image starts at its right',
		);
		const plain = lay(docOf([paraOf([run('aa bb')])])).pages[0]!
			.lines[0]!;
		assert.strictEqual(plain.height, 12, 'no image, text height');
	});

	test('an inline image wider than the rest of the line breaks before it', function (assert) {
		const p = paraOf([
			run('aaaa '),
			imgRun({ id: 'i', w: 270, h: 10 }),
		]);
		const lines = lay(docOf([p])).pages[0]!.lines;
		assert.deepEqual(
			lines.map((l) => [l.start, l.end]),
			[
				[0, 5],
				[5, 6],
			],
		);
	});

	test('square wrap shortens lines beside the float on each side', function (assert) {
		const wrapLines = (f: ImageFloat) => {
			const p = paraOf([
				imgRun({ id: 'i', w: 100, h: 50, float: f }),
				run(WORDS.repeat(4)),
			]);
			return lay(docOf([p])).pages[0]!.lines;
		};
		// text right of float
		let lines = wrapLines(float({ x: 0, side: 'both' }));
		const beside = lines.filter((l) => l.top < 60);
		assert.ok(beside.length >= 3, `${beside.length} lines beside`);
		assert.ok(
			beside.every((l) => l.left === 110 && l.width === 180),
			JSON.stringify(beside.map((l) => [l.left, l.width])),
		);
		const below = lines.filter((l) => l.top >= 60);
		assert.ok(below.length > 0);
		assert.ok(below.every((l) => l.left === 10 && l.width === 280));
		// text left of float
		lines = wrapLines(float({ x: 180, side: 'both' }));
		assert.ok(
			lines
				.filter((l) => l.top < 60)
				.every((l) => l.left === 10 && l.width === 180),
			'left side',
		);
		// centred float: right only
		lines = wrapLines(float({ x: 90, side: 'right', distance: 5 }));
		assert.ok(
			lines
				.filter((l) => l.top < 65)
				.every((l) => l.left === 205 && l.width === 85),
			JSON.stringify(
				lines.slice(0, 3).map((l) => [l.left, l.width]),
			),
		);
		// too narrow: below float
		lines = wrapLines(float({ x: 0, side: 'left' }));
		assert.strictEqual(lines[0]!.top, 60, 'pushed below');
		assert.strictEqual(lines[0]!.skip, 50);
	});

	test('top and bottom wrap pushes lines below; behind and in front take no space', function (assert) {
		const first = (f: ImageFloat) =>
			lay(
				docOf([
					paraOf([run('lead')]),
					paraOf([
						imgRun({
							id: 'i',
							w: 100,
							h: 50,
							float: f,
						}),
						run(WORDS),
					]),
				]),
			).pages[0]!;
		const tb = first(
			float({ wrap: 'top-bottom', y: 0, distance: 4 }),
		);
		const line = tb.lines.find((l) => l.block === 1)!;
		assert.strictEqual(
			line.top,
			22 + 50 + 4,
			'below the float and its distance',
		);
		assert.deepEqual([tb.floats[0]!.x, tb.floats[0]!.y], [10, 22]);
		for (const wrap of ['behind', 'front'] as const) {
			const p = first(float({ wrap }));
			const l = p.lines.find((x) => x.block === 1)!;
			assert.deepEqual(
				[l.top, l.left, l.width],
				[22, 10, 280],
				wrap,
			);
			assert.strictEqual(p.floats.length, 1);
		}
	});

	test('a float taller than the rest of the column moves to the next page with its anchor', function (assert) {
		const filler = Array.from({ length: 20 }, () =>
			paraOf([run('x')]),
		);
		const anchor = paraOf([
			imgRun({ id: 'i', w: 100, h: 150, float: float({}) }),
			run('anchor'),
		]);
		const { pages } = lay(docOf([...filler, anchor], 300));
		assert.strictEqual(pages.length, 2);
		assert.strictEqual(pages[0]!.floats.length, 0);
		assert.strictEqual(
			pages[1]!.floats[0]!.y,
			10,
			'top of page two',
		);
		assert.strictEqual(
			pages[1]!.lines[0]!.block,
			20,
			'anchor moved too',
		);
		// tall float shrinks
		const tall = paraOf([
			imgRun({ id: 'i', w: 100, h: 900, float: float({}) }),
			run('a'),
		]);
		const f = lay(docOf([tall], 300)).pages[0]!.floats[0]!;
		assert.deepEqual(
			[f.y, f.h, Math.round(f.w * 100) / 100],
			[10, 280, 31.11],
		);
	});

	test('figure fields number captions in document order; a float carries its caption', function (assert) {
		const cap = () =>
			paraOf(
				[
					{
						text: FIELD_CHAR,
						props: { field: 'figure' },
					},
					run(' Text'),
				],
				'caption',
			);
		const c1 = cap();
		const c2 = cap();
		const doc = docOf([
			paraOf([imgRun({ id: 'i', w: 50, h: 20 })]),
			c1,
			paraOf([
				imgRun({
					id: 'j',
					w: 120,
					h: 30,
					float: float({ x: 20, y: 5 }),
				}),
				run(WORDS),
			]),
			c2,
		]);
		const page = lay(doc).pages[0]!;
		const shown = (bi: number) =>
			page.lines
				.find((l) => l.block === bi)!
				.spans.find((s) => s.shown)?.shown;
		assert.deepEqual(
			[shown(1), shown(3)],
			['Figure 1', 'Figure 2'],
		);
		const f = page.floats[0]!;
		const capLine = page.lines.find((l) => l.block === 3)!;
		assert.strictEqual(
			capLine.top,
			f.y + f.h + 4,
			'caption under the image in its box',
		);
		assert.deepEqual([capLine.left, capLine.width], [f.x, f.w]);
		assert.strictEqual(f.boxH, f.h + 4 + capLine.height);
		const de = lay({ ...doc, setup: { ...doc.setup, lang: 'de' } })
			.pages[0]!;
		assert.strictEqual(
			de.lines
				.find((l) => l.block === 1)!
				.spans.find((s) => s.shown)?.shown,
			'Abbildung 1',
		);
	});

	test('.ata keeps image bytes and validates untrusted images', async function (assert) {
		const png = await realPng(8, 4);
		const jpg = await realJpeg(6, 6);
		const doc = docOf(
			[
				paraOf([
					imgRun({ id: 'a', w: 40, h: 20 }),
					imgRun({
						id: 'b-2',
						w: 30,
						h: 30,
						float: float({ x: 5 }),
					}),
				]),
			],
			400,
			{
				a: asset(png),
				'b-2': asset(jpg),
				unused: asset(png),
			},
		);
		const zip = saveAta(doc);
		const back = openAta(zip);
		assert.deepEqual(
			Object.keys(back.images!).sort(),
			['a', 'b-2'],
			'unused image not saved',
		);
		assert.deepEqual([...back.images!.a!.bytes], [...png]);
		assert.strictEqual(back.images!['b-2']!.mime, 'image/jpeg');
		assert.deepEqual(back.images!.a!.width, 8);
		const runs = (back.blocks[0] as Paragraph).runs;
		assert.deepEqual(runs[1]!.props.image!.float, float({ x: 5 }));

		const json = (d: unknown) => strToU8(JSON.stringify(d));
		const raw = {
			version: 1,
			name: 'x',
			setup: doc.setup,
			blocks: [
				{
					kind: 'para',
					id: 'p',
					style: 'body',
					props: {},
					runs: [
						{ text: 'ok', props: {} },
						{
							text: FIELD_CHAR,
							props: {
								image: {
									id: 'bad',
									w: 10,
									h: 10,
								},
							},
						},
						{
							text: FIELD_CHAR,
							props: {
								image: {
									id: 'good',
									w: 10,
									h: 10,
								},
							},
						},
						{
							text: FIELD_CHAR,
							props: {
								image: {
									id: 'big',
									w: 10,
									h: 10,
								},
							},
						},
						{
							text: FIELD_CHAR,
							props: {
								image: {
									id: 'zero',
									w: 10,
									h: 10,
								},
							},
						},
					],
				},
			],
		};
		const big = new Uint8Array(2000);
		big.set(pngHeader(4, 4));
		const evil = zipSync({
			mimetype: [strToU8(ATA_MIME), { level: 0 }],
			'document.json': json(raw),
			// gif bytes named png
			'images/bad.png': strToU8('GIF89a........'),
			'images/good.jpg': png,
			'images/big.png': big,
			'images/zero.png': pngHeader(0, 5),
			'images/../x.png': png,
			'other/file.bin': png,
		});
		const opened = openAta(evil, { each: 1000, total: 1500 });
		assert.deepEqual(
			Object.keys(opened.images ?? {}),
			['good'],
			'magic, size and dimension checks',
		);
		assert.strictEqual(
			opened.images!.good!.mime,
			'image/png',
			'mime from the bytes',
		);
		const kept = (opened.blocks[0] as Paragraph).runs;
		assert.deepEqual(
			kept.map((r) => [r.text, r.props.image?.id]),
			[
				['ok', undefined],
				[FIELD_CHAR, 'good'],
			],
			'characters of dropped images go',
		);
		const capped = openAta(evil, { each: 1000, total: 10 });
		assert.notOk(capped.images, 'total cap');
	});

	test('RTF pict round trip, shppict read, nonshppict skipped', async function (assert) {
		const png = await realPng(10, 5);
		const jpg = await realJpeg(4, 8);
		const doc = docOf(
			[
				paraOf([
					run('A'),
					imgRun({ id: 'a', w: 75, h: 37.5 }),
					run('B'),
					imgRun({
						id: 'b',
						w: 20,
						h: 40,
						float: float({}),
					}),
				]),
			],
			400,
			{ a: asset(png), b: asset(jpg) },
		);
		const rtf = docToRtf(doc);
		assert.ok(
			/\\pict\\pngblip\\picw10\\pich5\\picwgoal1500\\pichgoal750/.test(
				rtf,
			),
			'png pict',
		);
		assert.ok(
			/\\pict\\jpegblip\\picw4\\pich8/.test(rtf),
			'jpeg pict',
		);
		const back = rtfToDoc(rtf, 'r');
		const p = back.blocks[0] as Paragraph;
		const images = p.runs
			.filter((r) => r.props.image)
			.map((r) => r.props.image!);
		assert.strictEqual(images.length, 2);
		assert.deepEqual([images[0]!.w, images[0]!.h], [75, 37.5]);
		assert.notOk(images[1]!.float, 'floats come back inline');
		assert.deepEqual(
			[...back.images![images[0]!.id]!.bytes],
			[...png],
		);
		assert.deepEqual(
			[...back.images![images[1]!.id]!.bytes],
			[...jpg],
		);
		assert.strictEqual(
			p.runs.map((r) => r.text).join(''),
			`A${FIELD_CHAR}B${FIELD_CHAR}`,
		);

		const hex = [...png]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		const word = `{\\rtf1\\ansi{\\*\\shppict{\\pict{\\*\\picprop}\\pngblip\\picw10\\pich5 ${hex}}}{\\nonshppict{\\pict\\wmetafile8\\picw10\\pich5 0100}}x\\par}`;
		const w = rtfToDoc(word, 'w');
		const wp = w.blocks[0] as Paragraph;
		const shown = wp.runs.filter((r) => r.props.image);
		assert.strictEqual(shown.length, 1, 'one image');
		assert.deepEqual(
			[shown[0]!.props.image!.w, shown[0]!.props.image!.h],
			[7.5, 3.75],
			'pixel size at 96 dpi',
		);
		assert.strictEqual(
			wp.runs.map((r) => r.text).join(''),
			`${FIELD_CHAR}x`,
		);
		const bad = rtfToDoc(
			'{\\rtf1{\\pict\\pngblip 00112233}x\\par}',
			'b',
		);
		assert.notOk(bad.images, 'not a png');
	});

	test('pdf export draws images behind, inline and in front', async function (assert) {
		const png = await realPng(4, 4);
		const doc: WriteDoc = {
			...docOf(
				[
					paraOf([
						run('A'),
						imgRun({
							id: 'a',
							w: 30,
							h: 30,
						}),
						imgRun({
							id: 'a',
							w: 40,
							h: 20,
							float: float({
								x: 100,
								y: 30,
							}),
						}),
					]),
				],
				400,
				{ a: asset(png) },
			),
		};
		await ensureFonts(filesForFamilies(['source-serif-4']));
		const r: Resolver = {
			...resolver,
			char: (p, x) => ({
				...resolver.char(p, x),
				font: 'source-serif-4',
			}),
		};
		const layout = layoutDoc(doc, browserMetrics, r);
		const bytes = await exportWritePdf(doc, layout);
		const pdf = mupdf.Document.openDocument(
			bytes,
			'application/pdf',
		);
		const blocks = (
			JSON.parse(
				pdf
					.loadPage(0)
					.toStructuredText('preserve-images')
					.asJSON(),
			) as {
				blocks: {
					type: string;
					bbox: {
						x: number;
						y: number;
						w: number;
						h: number;
					};
				}[];
			}
		).blocks.filter((b) => b.type === 'image');
		assert.strictEqual(blocks.length, 2);
		const f = layout.pages[0]!.floats[0]!;
		assert.ok(
			blocks.some(
				(b) =>
					Math.abs(b.bbox.x - f.x) < 0.5 &&
					Math.abs(b.bbox.y - f.y) < 0.5 &&
					Math.abs(b.bbox.w - 40) < 0.5,
			),
			JSON.stringify(blocks),
		);
	});
});

module('Unit | errata | write | image timing', function () {
	test('30 pages with 30 square-wrapped images: cold under 100 ms, an edit under 5 ms', async function (assert) {
		await ensureFonts(filesForFamilies(['source-serif-4']));
		const words =
			'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
		const make = (i: number): Block =>
			paraOf(
				i % 8 === 0
					? [
							imgRun({
								id: 'a',
								w: 150,
								h: 100,
								float: float({
									x:
										i %
										16
											? 0
											: 300,
									distance: 9,
								}),
							}),
							run(words.repeat(4)),
						]
					: [run(words.repeat(4))],
			);
		const blocks = Array.from({ length: 240 }, (_, i) => make(i));
		const doc: WriteDoc = {
			version: 1,
			name: 't',
			setup: {
				width: 595,
				height: 842,
				margins: {
					top: 72,
					right: 72,
					bottom: 72,
					left: 72,
				},
			},
			blocks,
		};
		const r: Resolver = {
			char: (p, x) => ({
				...resolver.char(p, x),
				font: 'source-serif-4',
				size: 11,
			}),
			para: (p) => ({ ...resolver.para(p), spaceAfter: 6 }),
		};
		layoutDoc(doc, browserMetrics, r);
		const fresh = { ...doc, blocks: blocks.map((b) => ({ ...b })) };
		const t = performance.now();
		const { pages } = layoutDoc(fresh, browserMetrics, r);
		const ms = performance.now() - t;
		const floats = pages.reduce((n, p) => n + p.floats.length, 0);
		assert.ok(pages.length >= 30, `${pages.length} pages`);
		assert.strictEqual(floats, 30);
		assert.ok(
			pages.some((p) => p.lines.some((l) => l.width < 400)),
			'lines beside floats are shorter',
		);
		assert.ok(ms < 100, `${ms.toFixed(1)} ms`);
		const edited = fresh.blocks.slice();
		edited[121] = paraOf([run(words.repeat(4) + 'x')]);
		const t1 = performance.now();
		layoutDoc({ ...fresh, blocks: edited }, browserMetrics, r);
		const edit = performance.now() - t1;
		assert.ok(edit < 5, `edit ${edit.toFixed(2)} ms`);
	});
});

const captionsLinked = (doc: WriteDoc) =>
	doc.blocks.every(
		(b, i) =>
			b.kind !== 'para' ||
			b.style !== 'caption' ||
			b.runs[0]?.props.field !== 'figure' ||
			(doc.blocks[i - 1]?.kind === 'para' &&
				(doc.blocks[i - 1] as Paragraph).runs.some(
					(r) => r.props.image,
				)),
	);

const captionPara = () =>
	paraOf(
		[{ text: FIELD_CHAR, props: { field: 'figure' } }, run(' Cap')],
		'caption',
	);

const until = async (fn: () => unknown) => {
	for (let i = 0; i < 200 && !fn(); i++)
		await new Promise((r) => setTimeout(r, 10));
};

const range = (block: number, from: number, to: number): Selection => ({
	anchor: { block, offset: from },
	focus: { block, offset: to },
});

const stored = () => writeStore.get()!.doc;

const round = (n: number) => Math.round(n * 100) / 100;

module('Unit | errata | write | image fixes', function (hooks) {
	hooks.afterEach(() => writeStore.close());

	test('sniffImage refuses more than 40 megapixels', function (assert) {
		assert.notOk(sniffImage(pngHeader(20000, 20000)), 'bomb');
		assert.notOk(sniffImage(pngHeader(8001, 5000)));
		assert.ok(sniffImage(pngHeader(8000, 5000)), '40 MP');
	});

	test('bitmaps decode at the displayed size and again when it grows', async function (assert) {
		const a = asset(await realPng(400, 200));
		bitmapFor(a, 50);
		await until(() => bitmapFor(a, 50));
		const small = bitmapFor(a, 50)!;
		assert.ok(small.width >= 50, `${small.width}`);
		assert.ok(small.width < 400, `${small.width}`);
		assert.strictEqual(
			bitmapFor(a, 300),
			small,
			'the small one until the large one decodes',
		);
		await until(() => bitmapFor(a, 300)!.width >= 300);
		assert.ok(bitmapFor(a, 300)!.width >= 300);
		assert.strictEqual(bitmapFor(a, 1000)!.width, 400, 'at most');
	});

	test('a top-bottom float as tall as the column ends it; text goes on', function (assert) {
		const p = paraOf([
			imgRun({
				id: 'i',
				w: 100,
				h: 380,
				float: float({ wrap: 'top-bottom' }),
			}),
			run(WORDS),
		]);
		const { pages } = lay(docOf([p]));
		assert.strictEqual(pages[0]!.floats.length, 1);
		assert.ok(
			pages[0]!.lines.every((l) => l.top + l.height <= 390),
			JSON.stringify(pages[0]!.lines.map((l) => l.top)),
		);
		assert.ok(pages[1]?.lines.some((l) => l.block === 0));
	});

	test('inline images fit the line width and the column height', function (assert) {
		const wide = lay(
			docOf([paraOf([imgRun({ id: 'i', w: 1000, h: 100 })])]),
		).pages[0]!.lines[0]!.spans.find((s) => s.image)!;
		assert.deepEqual(
			[wide.xs[1]! - wide.xs[0]!, round(wide.image!.h)],
			[280, 28],
		);
		const tall = lay(
			docOf([paraOf([imgRun({ id: 'i', w: 50, h: 1000 })])]),
		).pages[0]!.lines[0]!;
		assert.ok(
			tall.top + tall.height <= 390 + 1e-6,
			`${tall.height}`,
		);
	});

	test('import and resize clamp images to the column', async function (assert) {
		const png = await realPng(8, 4);
		const doc = docOf(
			[paraOf([imgRun({ id: 'a', w: 10000, h: 100 })])],
			400,
			{ a: asset(png) },
		);
		const back = openAta(saveAta(doc));
		const image = (back.blocks[0] as Paragraph).runs[0]!.props
			.image!;
		assert.deepEqual([image.w, round(image.h)], [280, 2.8], '.ata');
		const hex = [...png]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		const rtf = rtfToDoc(
			`{\\rtf1\\paperw6000\\paperh8000\\margl200\\margr200\\margt200\\margb200{\\pict\\pngblip\\picw8\\pich4\\picwgoal200000\\pichgoal100000 ${hex}}\\par}`,
			'r',
		);
		const ri = (rtf.blocks[0] as Paragraph).runs[0]!.props.image!;
		assert.ok(ri.w <= 280, `rtf ${ri.w}`);
		assert.ok(ri.h <= 380, `rtf ${ri.h}`);

		writeStore.open(doc);
		selectRange(range(0, 0, 1));
		resizeImage(5000, 5000, null, false);
		const r = (stored().blocks[0] as Paragraph).runs[0]!.props
			.image!;
		assert.ok(r.w <= 280, `resize ${r.w}`);
		assert.ok(r.h <= 380, `resize ${r.h}`);
	});

	test('re-anchoring onto a captioned paragraph keeps captions with their images', async function (assert) {
		const png = await realPng(4, 4);
		const doc: WriteDoc = {
			...newDoc('t'),
			images: { a: asset(png) },
			blocks: [
				paraOf([
					imgRun({
						id: 'a',
						w: 60,
						h: 40,
						float: float({}),
					}),
					run('one'),
				]),
				captionPara(),
				paraOf([
					run('two '),
					imgRun({ id: 'a', w: 40, h: 200 }),
				]),
				captionPara(),
				paraOf([run('three')]),
			],
		};
		await ensureDocFonts(doc);
		writeStore.open(doc);
		selectRange(range(0, 0, 1));
		moveFloat(0, 120, false);
		reanchor();
		assert.ok(captionsLinked(stored()), 'no stranded caption');
		assert.strictEqual(
			stored().blocks.filter(
				(b) =>
					b.kind === 'para' &&
					b.style === 'caption',
			).length,
			2,
		);
	});

	test('deleting an image deletes its caption', function (assert) {
		const blocks = () => [
			paraOf([imgRun({ id: 'i', w: 20, h: 20 }), run(' x')]),
			captionPara(),
			paraOf([run('after')]),
		];
		const captions = () =>
			stored().blocks.filter(
				(b) =>
					b.kind === 'para' &&
					b.style === 'caption',
			).length;
		writeStore.open(docOf(blocks()));
		selectRange(range(0, 0, 1));
		remove(-1, 'char');
		assert.strictEqual(captions(), 0, 'selected and deleted');
		writeStore.undo();
		assert.strictEqual(captions(), 1, 'undo restores it');
		writeStore.open(docOf(blocks()));
		selectRange(range(0, 1, 1));
		remove(-1, 'char');
		assert.strictEqual(captions(), 0, 'backspace');
		writeStore.open(docOf(blocks()));
		selectRange(range(0, 0, 1));
		typeText('z');
		assert.strictEqual(captions(), 0, 'typed over');
		assert.strictEqual(stored().blocks.length, 2);
	});

	test('a pasted captioned float keeps its caption', function (assert) {
		const cap = captionPara();
		writeStore.open(
			docOf([
				paraOf([
					imgRun({
						id: 'i',
						w: 40,
						h: 20,
						float: float({}),
					}),
				]),
				cap,
				paraOf([run('')]),
			]),
		);
		selectRange({
			anchor: { block: 0, offset: 0 },
			focus: { block: 1, offset: 5 },
		});
		const data = new DataTransfer();
		copy(data, false);
		selectRange(range(2, 0, 0));
		paste(data);
		const floats = lay(stored()).pages[0]!.floats;
		assert.strictEqual(floats.length, 2);
		assert.ok(
			floats.every((f) => f.boxH > f.h),
			'both captions boxed',
		);
	});

	test('Enter after a captioned image keeps the caption next to it', function (assert) {
		writeStore.open(
			docOf([
				paraOf([
					imgRun({
						id: 'i',
						w: 40,
						h: 20,
						float: float({}),
					}),
					run(' text'),
				]),
				captionPara(),
			]),
		);
		selectRange(range(0, 1, 1));
		enter();
		assert.ok(captionsLinked(stored()));
		const f = lay(stored()).pages[0]!.floats[0]!;
		assert.ok(f.boxH > f.h, 'caption boxed');
	});

	test('each figure field has its own number, in layout and RTF', function (assert) {
		const fig = {
			text: FIELD_CHAR,
			props: { field: 'figure' as const },
		};
		const doc = docOf([
			paraOf([fig, run(' and '), fig]),
			paraOf([fig]),
		]);
		const shown = lay(doc)
			.pages[0]!.lines.flatMap((l) => l.spans)
			.flatMap((s) => s.shown ?? []);
		assert.deepEqual(shown, ['Figure 1', 'Figure 2', 'Figure 3']);
		const nums = [
			...docToRtf(doc).matchAll(/fldrslt \{[^}]* (\d+)\}/g),
		].map((m) => m[1]);
		assert.deepEqual(nums, ['1', '2', '3']);
	});

	test('balanced columns keep a square float at its size', function (assert) {
		const pageOf = (n: number) => {
			const doc = docOf([
				paraOf([
					imgRun({
						id: 'i',
						w: 60,
						h: 100,
						float: float({ x: 0 }),
					}),
					run(WORDS.repeat(n)),
				]),
			]);
			doc.setup = { ...doc.setup, columns: 2, gutter: 10 };
			return lay(doc).pages[0]!;
		};
		assert.strictEqual(pageOf(3).floats[0]!.h, 100, 'not shrunk');
		const page = pageOf(8);
		const f = page.floats[0]!;
		assert.strictEqual(f.h, 100, 'not shrunk');
		const bottom = (c: number) =>
			Math.max(
				...page.lines
					.filter((l) => (l.col ?? 0) === c)
					.map((l) => l.top + l.height),
				...page.floats
					.filter((x) => x.col === c)
					.map((x) => x.y + x.boxH),
			);
		assert.ok(
			Math.abs(bottom(0) - bottom(1)) <= 12,
			`${bottom(0)} ${bottom(1)}`,
		);
	});

	test('pdf export skips an image mupdf cannot read', async function (assert) {
		const bad = { ...asset(pngHeader(4, 4)) };
		const doc = docOf(
			[paraOf([run('A'), imgRun({ id: 'a', w: 20, h: 20 })])],
			400,
			{ a: bad },
		);
		await ensureFonts(filesForFamilies(['source-serif-4']));
		const r: Resolver = {
			...resolver,
			char: (p, x) => ({
				...resolver.char(p, x),
				font: 'source-serif-4',
			}),
		};
		const bytes = await exportWritePdf(
			doc,
			layoutDoc(doc, browserMetrics, r),
		);
		assert.ok(bytes.length > 0);
	});

	test('an edit removing the last use of an image drops its bytes; undo restores them', async function (assert) {
		const png = asset(await realPng(4, 4));
		writeStore.open(
			docOf(
				[
					paraOf([
						imgRun({
							id: 'a',
							w: 20,
							h: 20,
						}),
						imgRun({
							id: 'b',
							w: 20,
							h: 20,
						}),
					]),
				],
				400,
				{ a: png, b: png },
			),
		);
		selectRange(range(0, 0, 1));
		remove(-1, 'char');
		assert.deepEqual(Object.keys(stored().images ?? {}), ['b']);
		writeStore.undo();
		assert.deepEqual(Object.keys(stored().images ?? {}), [
			'a',
			'b',
		]);
	});

	test('inserted files: svg decodes, exif orientation applies to kept jpeg bytes', async function (assert) {
		const svg = new Blob(
			[
				'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>',
			],
			{ type: 'image/svg+xml' },
		);
		const s = await decodeImageFile(svg);
		assert.deepEqual(
			[s.mime, s.width, s.height],
			['image/png', 40, 20],
		);
		const jpg = await realJpeg(8, 4);
		const exif = [
			0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d,
			0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0,
			0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
		];
		const rotated = new Uint8Array(jpg.length + exif.length);
		rotated.set(jpg.subarray(0, 2));
		rotated.set(exif, 2);
		rotated.set(jpg.subarray(2), 2 + exif.length);
		const j = await decodeImageFile(
			new Blob([rotated], { type: 'image/jpeg' }),
		);
		assert.deepEqual(
			[j.mime, j.width, j.height],
			['image/jpeg', 4, 8],
		);
		const plain = await decodeImageFile(
			new Blob([jpg as BlobPart], { type: 'image/jpeg' }),
		);
		assert.deepEqual([...plain.bytes], [...jpg], 'upright kept');
	});
});
