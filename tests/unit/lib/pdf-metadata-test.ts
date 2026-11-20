import { module, test } from 'qunit';
import { PDFDocument, PDFName } from 'pdf-lib';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import {
	formatPdfDate,
	parsePdfMetadata,
	stripPdfMetadata,
} from 'delphitools-v2/lib/pdf-metadata';

const XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" pdf:Producer="XMP Producer &amp; Co">
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">XMP Title</rdf:li></rdf:Alt></dc:title>
<dc:creator><rdf:Seq><rdf:li>XMP Author</rdf:li></rdf:Seq></dc:creator>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;

async function gtiPdf(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([200, 200]).drawText('GTI', { x: 20, y: 100 });
	doc.setTitle('GTI Handbuch');
	doc.setAuthor('Company GmbH');
	doc.setSubject('GTI Dokumentation');
	doc.setKeywords(['gti', 'handbuch']);
	doc.setCreator('LaTeX with hyperref');
	doc.setProducer('pdfTeX-1.40.26');
	doc.setLanguage('en-US');
	doc.setCreationDate(new Date(Date.UTC(2026, 1, 20, 14, 5)));
	doc.setModificationDate(new Date(Date.UTC(2026, 1, 20, 14, 5)));
	doc.catalog.set(
		PDFName.of('Metadata'),
		doc.context.register(
			doc.context.stream(XMP, {
				Type: 'Metadata',
				Subtype: 'XML',
			}),
		),
	);
	return doc.save();
}

async function barePdf(): Promise<Uint8Array> {
	const doc = await PDFDocument.create({ updateMetadata: false });
	doc.addPage([200, 200]);
	return doc.save();
}

async function xmpOnlyPdf(): Promise<Uint8Array> {
	const doc = await PDFDocument.create({ updateMetadata: false });
	doc.addPage([200, 200]);
	doc.catalog.set(
		PDFName.of('Metadata'),
		doc.context.register(
			doc.context.stream(XMP, {
				Type: 'Metadata',
				Subtype: 'XML',
			}),
		),
	);
	return doc.save();
}

async function encrypted(data: Uint8Array): Promise<Uint8Array> {
	const mupdf = await getMupdf();
	const doc = mupdf.Document.openDocument(
		data,
		'application/pdf',
	).asPDF()!;
	const buffer = doc.saveToBuffer(
		'encrypt=aes-256,user-password=secret,owner-password=secret',
	);
	const out = buffer.asUint8Array().slice();
	buffer.destroy();
	doc.destroy();
	return out;
}

function details(report: { entries: { label: string; detail: string }[] }) {
	return Object.fromEntries(
		report.entries.map((e) => [e.label, e.detail]),
	);
}

module('Unit | lib | pdf-metadata', function () {
	test('reads the info dictionary, language, version and dates', async function (assert) {
		const report = await parsePdfMetadata(await gtiPdf());
		assert.true(report.readable);
		assert.true(report.xmp);
		assert.deepEqual(details(report), {
			Title: 'GTI Handbuch',
			Author: 'Company GmbH',
			Subject: 'GTI Dokumentation',
			Keywords: 'gti handbuch',
			Creator: 'LaTeX with hyperref',
			Producer: 'pdfTeX-1.40.26',
			Language: 'en-US',
			'PDF version': '1.7',
			Created: '20.02.2026 14:05',
			Modified: '20.02.2026 14:05',
		});
	});

	test('falls back to xmp for fields the info dictionary lacks', async function (assert) {
		const report = await parsePdfMetadata(await xmpOnlyPdf());
		const found = details(report);
		assert.strictEqual(found['Title'], 'XMP Title');
		assert.strictEqual(found['Author'], 'XMP Author');
		assert.strictEqual(found['Producer'], 'XMP Producer & Co');
	});

	test('omits missing fields', async function (assert) {
		const report = await parsePdfMetadata(await barePdf());
		assert.true(report.readable);
		assert.false(report.xmp);
		assert.deepEqual(
			report.entries.map((e) => e.label),
			['PDF version'],
		);
	});

	test('corrupt and encrypted input is unreadable, not a throw', async function (assert) {
		const junk = new Uint8Array(64).map((_, i) => (i * 37) & 0xff);
		assert.deepEqual(await parsePdfMetadata(junk), {
			readable: false,
			entries: [],
			xmp: false,
		});
		const locked = await encrypted(await gtiPdf());
		assert.false((await parsePdfMetadata(locked)).readable);
		assert.strictEqual(await stripPdfMetadata(junk), null);
	});

	test('strip round-trips to no document metadata', async function (assert) {
		const original = await gtiPdf();
		const result = await stripPdfMetadata(original);
		assert.ok(result);
		assert.deepEqual(result!.removed, [
			'Title',
			'Author',
			'Subject',
			'Keywords',
			'Creator',
			'Producer',
			'Created',
			'Modified',
			'XMP packet',
		]);
		const reparsed = await parsePdfMetadata(result!.data);
		assert.false(reparsed.xmp);
		const after = details(reparsed);
		assert.deepEqual(after, {
			Language: 'en-US',
			'PDF version': '1.7',
		});

		const mupdf = await getMupdf();
		const text = (bytes: Uint8Array) => {
			const doc = mupdf.Document.openDocument(
				bytes,
				'application/pdf',
			);
			const page = doc.loadPage(0);
			const out = page.toStructuredText('').asText();
			page.destroy();
			doc.destroy();
			return out;
		};
		assert.strictEqual(text(result!.data), text(original));
	});

	test('strip drops xmp-only metadata', async function (assert) {
		const result = await stripPdfMetadata(await xmpOnlyPdf());
		assert.deepEqual(result!.removed, [
			'Title',
			'Author',
			'Producer',
			'XMP packet',
		]);
		assert.deepEqual(
			details(await parsePdfMetadata(result!.data)),
			{ 'PDF version': '1.7' },
		);
	});

	test('formats pdf and xmp dates', function (assert) {
		assert.strictEqual(
			formatPdfDate("D:20260220140500+01'00'"),
			'20.02.2026 14:05',
		);
		assert.strictEqual(
			formatPdfDate('2026-02-20T14:05:00+01:00'),
			'20.02.2026 14:05',
		);
		assert.strictEqual(formatPdfDate('D:2026'), '01.01.2026');
	});
});
