import { module, test } from 'qunit';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import { exportWritePdf } from 'delphitools-v2/lib/errata/write/pdf';
import { readHybrid } from 'delphitools-v2/lib/errata/write/hybrid';
import { sample } from './fixture';

async function edited(edit: (pdf: import('mupdf').PDFDocument) => void) {
	const { doc, layout } = await sample();
	const mupdf = await getMupdf();
	const pdf = mupdf.Document.openDocument(
		await exportWritePdf(doc, layout),
		'application/pdf',
	).asPDF()!;
	edit(pdf);
	return pdf.saveToBuffer('compress,garbage').asUint8Array().slice();
}

module('Unit | errata | write | hybrid', function () {
	test('round trip returns the document', async function (assert) {
		const { doc, layout } = await sample();
		assert.deepEqual(
			await readHybrid(await exportWritePdf(doc, layout)),
			doc,
		);
	});

	test('resaving without page changes keeps the payload', async function (assert) {
		const { doc } = await sample();
		assert.deepEqual(await readHybrid(await edited(() => {})), doc);
	});

	test('contents as an array checksums the same', async function (assert) {
		const { doc } = await sample();
		const bytes = await edited((pdf) => {
			const page = pdf.loadPage(0).getObject();
			const list = pdf.newArray();
			list.push(page.get('Contents'));
			page.put('Contents', list);
		});
		assert.deepEqual(await readHybrid(bytes), doc);
	});

	test('an added page returns null', async function (assert) {
		const bytes = await edited((pdf) =>
			pdf.insertPage(
				-1,
				pdf.addPage([0, 0, 100, 100], 0, {}, ''),
			),
		);
		assert.strictEqual(await readHybrid(bytes), null);
	});

	test('a changed content stream returns null', async function (assert) {
		const bytes = await edited((pdf) =>
			pdf
				.loadPage(1)
				.getObject()
				.get('Contents')
				.writeStream('0 0 m 10 10 l S'),
		);
		assert.strictEqual(await readHybrid(bytes), null);
	});

	test('a changed mediabox returns null', async function (assert) {
		const bytes = await edited((pdf) =>
			pdf
				.loadPage(0)
				.setPageBox('MediaBox', [0, 0, 500, 500]),
		);
		assert.strictEqual(await readHybrid(bytes), null);
	});

	test('an added annotation returns null', async function (assert) {
		const bytes = await edited((pdf) => {
			const annot = pdf.loadPage(0).createAnnotation('Text');
			annot.setContents('note');
			annot.update();
		});
		assert.strictEqual(await readHybrid(bytes), null);
	});

	test('a changed rotation returns null', async function (assert) {
		const bytes = await edited((pdf) => {
			pdf.loadPage(0).getObject().put('Rotate', 90);
		});
		assert.strictEqual(await readHybrid(bytes), null);
	});

	test('a changed resource returns null', async function (assert) {
		const bytes = await edited((pdf) => {
			const res = pdf
				.loadPage(0)
				.getObject()
				.get('Resources');
			res.put('Extra', pdf.newName('X'));
		});
		assert.strictEqual(await readHybrid(bytes), null);
	});

	test('a pdf without payload or garbage returns null', async function (assert) {
		const mupdf = await getMupdf();
		const plain = new mupdf.PDFDocument();
		plain.insertPage(
			-1,
			plain.addPage([0, 0, 100, 100], 0, {}, ''),
		);
		assert.strictEqual(
			await readHybrid(
				plain.saveToBuffer('').asUint8Array().slice(),
			),
			null,
		);
		assert.strictEqual(
			await readHybrid(new Uint8Array([1, 2, 3])),
			null,
		);
	});
});
