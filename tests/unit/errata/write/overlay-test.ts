import { module, test } from 'qunit';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { PageObject } from 'delphitools-v2/lib/errata/doc-model';
import { embeddableImage } from 'delphitools-v2/lib/errata/page-ops';
import { createHistoryStore } from 'delphitools-v2/lib/history-store';
import {
	ATA_MIME,
	AtaError,
	openAta,
	readOverlays,
	saveAta,
} from 'delphitools-v2/lib/errata/write/ata';
import {
	newDoc,
	tidyOverlays,
	withPageMarks,
} from 'delphitools-v2/lib/errata/write/model';

const base = {
	cx: 100,
	cy: 120,
	w: 40,
	h: 20,
	scaleX: 1,
	scaleY: 1,
	angle: 0,
};

const ink: PageObject = {
	...base,
	id: 'i',
	kind: 'ink',
	d: 'M 0 0 Q 10 10 20 5 L 40 20',
	colour: '#d1242f',
	strokeWidth: 3,
};

const shape: PageObject = {
	...base,
	id: 's',
	kind: 'shape',
	shape: 'rect',
	colour: '#d1242f',
	strokeWidth: 2,
};

const note: PageObject = {
	...base,
	id: 'c',
	kind: 'comment',
	text: 'Look',
	author: 'Ruby',
	date: '2026-11-06T10:00:00.000Z',
};

function pngBytes(w: number, h: number, size = 33): Uint8Array<ArrayBuffer> {
	const b = new Uint8Array(size);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
	b.set([0x49, 0x48, 0x44, 0x52], 12);
	new DataView(b.buffer).setUint32(16, w);
	new DataView(b.buffer).setUint32(20, h);
	return b;
}

const urlOf = (b: Uint8Array, mime = 'image/png') =>
	`data:${mime};base64,${btoa(String.fromCharCode(...b))}`;

const pngUrl = (w: number, h: number) => urlOf(pngBytes(w, h));

const imageMark = (dataUrl: string): PageObject => ({
	...base,
	id: crypto.randomUUID(),
	kind: 'image',
	dataUrl,
});

const GIF = Uint8Array.from(
	atob('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='),
	(c) => c.charCodeAt(0),
);

const read = (v: unknown) => readOverlays(v, 'overlays');

module('Unit | errata | write | overlay', function () {
	test('.ata round trip keeps the marks by page', function (assert) {
		const doc = {
			...newDoc('Marked'),
			overlays: [[ink], [shape, note]],
		};
		const back = openAta(saveAta(doc));
		assert.deepEqual(back.overlays, doc.overlays);
	});

	test('a document without marks has no overlays', function (assert) {
		assert.strictEqual(
			openAta(saveAta(newDoc('x'))).overlays,
			undefined,
		);
		assert.strictEqual(read([[], []]), undefined);
	});

	test('clamps numbers, strips control characters, blanks bad dates', function (assert) {
		const [a, b] = read([
			[
				{ ...ink, cx: 1e9, scaleX: -4, angle: 99999 },
				{
					...note,
					text: 'a\u0000b\nc',
					author: 'x'.repeat(500),
					date: 'soon',
				},
			],
		])![0]!;
		assert.deepEqual(
			[a!.cx, a!.scaleX, a!.angle],
			[28800, 0.01, 3600],
		);
		assert.strictEqual((b as typeof note).text, 'ab\nc');
		assert.strictEqual((b as typeof note).author.length, 200);
		assert.strictEqual((b as typeof note).date, '');
	});

	test('duplicate ids are replaced', function (assert) {
		const [[a], [b]] = read([[ink], [{ ...shape, id: 'i' }]])! as [
			PageObject[],
			PageObject[],
		];
		assert.strictEqual(a!.id, 'i');
		assert.notStrictEqual(b!.id, 'i');
	});

	test('malformed marks throw AtaError', function (assert) {
		const bad: unknown[] = [
			{},
			[{}],
			[[{ ...ink, kind: 'redact' }]],
			[[{ ...ink, kind: 'field' }]],
			[[{ ...ink, d: 'M 0 0 <script>' }]],
			[[{ ...ink, d: 'M'.repeat(1024 * 1024 + 1) }]],
			[[{ ...ink, d: 'M1e999 0' }]],
			[[{ ...ink, d: 'M1E5 0' }]],
			[[{ ...ink, d: `M${'9'.repeat(13)} 0` }]],
			[[{ ...ink, colour: 'red' }]],
			[[{ ...shape, shape: 'star' }]],
			[[{ ...ink, cx: 'x' }]],
			[[{ ...ink, cx: Infinity }]],
			[[{ ...note, text: 4 }]],
		];
		for (const v of bad)
			assert.throws(
				() => read(v),
				AtaError,
				JSON.stringify(v).slice(0, 40),
			);
	});

	test('mark images are zip entries, one per image', function (assert) {
		const url = pngUrl(4, 2);
		const doc = {
			...newDoc('Marked'),
			overlays: [[imageMark(url)], [imageMark(url), ink]],
		};
		const zip = unzipSync(saveAta(doc));
		assert.deepEqual(
			Object.keys(zip).filter((n) => n.startsWith('marks/')),
			['marks/0.png'],
		);
		assert.notOk(
			strFromU8(zip['document.json']!).includes('base64'),
			'no image bytes in document.json',
		);
		assert.deepEqual(openAta(saveAta(doc)).overlays, doc.overlays);
	});

	test('mark images: png or jpeg by bytes, within the shared budget', function (assert) {
		const mark = (src: unknown) => ({
			...base,
			id: crypto.randomUUID(),
			kind: 'image',
			src,
		});
		const zip = (entries: Record<string, Uint8Array>) =>
			zipSync({
				mimetype: [strToU8(ATA_MIME), { level: 0 }],
				'document.json': strToU8(
					JSON.stringify({
						...newDoc('x'),
						overlays: [
							[
								mark('0.png'),
								mark('1.png'),
								mark('2.png'),
								mark(
									'../x.png',
								),
								mark(
									'missing.png',
								),
							],
						],
					}),
				),
				...entries,
			});
		const kept = (o: PageObject[][] | undefined) =>
			(o?.[0] ?? []).map((m) =>
				m.kind === 'image' ? m.dataUrl : m.kind,
			);
		const big = pngBytes(4, 4, 1000);
		const opened = openAta(
			zip({
				'marks/0.png': pngBytes(4, 2),
				'marks/1.png': GIF,
				'marks/2.png': big,
			}),
		);
		assert.deepEqual(kept(opened.overlays), [
			pngUrl(4, 2),
			urlOf(big),
		]);
		const capped = openAta(
			zipSync({
				'images/a.png': big,
				...unzipSync(
					zip({
						'marks/0.png': big,
						'marks/2.png': big,
					}),
				),
			}),
			{ each: 1000, total: 2000 },
		);
		assert.strictEqual(
			kept(capped.overlays).length,
			1,
			'document images count against the total',
		);
		assert.throws(
			() => readOverlays([[mark(4)]], 'overlays'),
			AtaError,
		);
	});

	test('a dropped gif becomes a png', async function (assert) {
		const out = await embeddableImage(
			new File([GIF], 'dot.gif', { type: 'image/gif' }),
		);
		const head = new Uint8Array(
			await out.slice(0, 4).arrayBuffer(),
		);
		assert.strictEqual(out.type, 'image/png');
		assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47]);
		const png = new File([pngBytes(4, 2)], 'x.webp', {
			type: 'image/webp',
		});
		assert.strictEqual(
			(await embeddableImage(png)).type,
			'image/png',
		);
	});

	test('history store off the record keeps no undo states', function (assert) {
		const h = createHistoryStore<{ n: number }>();
		h.setDoc({ n: 0 });
		h.record(false);
		h.update(() => ({ n: 1 }));
		assert.false(h.canUndo());
		h.record(true);
		h.update(() => ({ n: 2 }));
		assert.true(h.canUndo());
	});

	test('mark count is capped', function (assert) {
		const many = Array.from({ length: 6000 }, () => ink);
		const pages = read([many, many])!;
		assert.deepEqual(
			pages.map((p) => p.length),
			[6000, 4000],
		);
	});

	test('withPageMarks keeps marks of pages past the end', function (assert) {
		assert.deepEqual(withPageMarks([[ink], [], [shape]], [[]]), [
			[],
			[],
			[shape],
		]);
		assert.deepEqual(withPageMarks(undefined, [[], [note]]), [
			[],
			[note],
		]);
		assert.strictEqual(withPageMarks([[ink]], [[]]), undefined);
		assert.strictEqual(tidyOverlays([[], []]), undefined);
	});
});
