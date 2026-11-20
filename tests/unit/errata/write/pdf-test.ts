import { module, test } from 'qunit';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import { exportWritePdf } from 'delphitools-v2/lib/errata/write/pdf';
import { sample } from './fixture';

module('Unit | errata | write | pdf', function () {
	test('one page per page box with text in order', async function (assert) {
		const { doc, layout } = await sample();
		const mupdf = await getMupdf();
		const pdf = mupdf.Document.openDocument(
			await exportWritePdf(doc, layout),
			'application/pdf',
		);
		assert.strictEqual(pdf.countPages(), 2);
		assert.deepEqual(pdf.loadPage(0).getBounds(), [0, 0, 595, 842]);
		assert.deepEqual(pdf.loadPage(1).getBounds(), [0, 0, 300, 400]);
		const text = (i: number) =>
			pdf
				.loadPage(i)
				.toStructuredText('preserve-whitespace')
				.asText()
				.trim()
				.split('\n')
				.filter(Boolean);
		assert.deepEqual(text(0), [
			'Heading',
			// one glyph per pair
			'First line a\ufffdb',
		]);
		assert.deepEqual(text(1), ['Chapter', 'Second page']);
	});

	test('glyphs sit on the baseline at xs', async function (assert) {
		const { doc, layout } = await sample();
		const mupdf = await getMupdf();
		const pdf = mupdf.Document.openDocument(
			await exportWritePdf(doc, layout),
			'application/pdf',
		);
		const json = JSON.parse(
			pdf.loadPage(0).toStructuredText('').asJSON(),
		) as { blocks: { lines: { x: number; y: number }[] }[] };
		const first = json.blocks[0]!.lines[0]!;
		assert.strictEqual(Math.round(first.x), 72);
		assert.strictEqual(Math.round(first.y), 82);
	});

	test('title metadata and nested outline', async function (assert) {
		const { doc, layout } = await sample();
		const mupdf = await getMupdf();
		const pdf = mupdf.Document.openDocument(
			await exportWritePdf(doc, layout),
			'application/pdf',
		);
		assert.strictEqual(pdf.getMetaData('info:Title'), 'Sample');
		const outline = pdf.loadOutline()!;
		assert.deepEqual(
			outline.map((o) => [o.title, o.page]),
			[
				['Heading', 0],
				['Chapter', 1],
			],
		);
		assert.deepEqual(
			outline[1]!.down!.map((o) => [o.title, o.page]),
			[['Second page', 1]],
		);
	});
});
