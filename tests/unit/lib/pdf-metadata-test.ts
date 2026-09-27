import { module, test } from 'qunit';
import { PDFDocument } from 'pdf-lib';
import {
	formatPdfDate,
	parsePdfMetadata,
	stripPdfMetadata,
} from 'delphitools-v2/lib/pdf-metadata';

function entry(
	report: { entries: { label: string; detail: string }[] },
	label: string,
) {
	return report.entries.find((e) => e.label === label);
}

async function buildGtiLike(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.setTitle('GTI Handbuch');
	doc.setAuthor('Company GmbH');
	doc.setSubject('GTI Dokumentation');
	doc.setKeywords(['GTI', 'Handbuch']);
	doc.setCreator('LaTeX with hyperref');
	doc.setProducer('pdfTeX-1.40.26');
	doc.setLanguage('en-US');
	doc.setCreationDate(new Date(Date.UTC(2026, 1, 20, 14, 5, 0)));
	doc.setModificationDate(new Date(Date.UTC(2026, 1, 20, 14, 5, 0)));
	doc.addPage([595, 842]);
	const bytes = await doc.save();
	return new Uint8Array(bytes);
}

async function buildBare(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([300, 300]);
	const bytes = await doc.save();
	return new Uint8Array(bytes);
}

module('Unit | Lib | pdf-metadata', function () {
	test('formats PDF and XMP dates as DD.MM.YYYY HH:mm', function (assert) {
		assert.strictEqual(
			formatPdfDate("D:20260220140500+01'00'"),
			'20.02.2026 14:05',
			'GTI sample wall-clock preserved',
		);
		assert.strictEqual(
			formatPdfDate('D:20260220130500Z'),
			'20.02.2026 13:05',
			'UTC marker preserved',
		);
		assert.strictEqual(
			formatPdfDate('D:20260220'),
			'20.02.2026',
			'date-only PDF value',
		);
		assert.strictEqual(
			formatPdfDate('2026-02-20T14:05:00+01:00'),
			'20.02.2026 14:05',
			'XMP/ISO wall-clock preserved',
		);
		assert.strictEqual(formatPdfDate(''), null, 'empty omitted');
		assert.strictEqual(
			formatPdfDate(null),
			null,
			'non-string omitted',
		);
		assert.strictEqual(
			formatPdfDate('not a date'),
			null,
			'unparseable omitted',
		);
	});

	test('reads a GTI-like document-info dict', async function (assert) {
		const report = await parsePdfMetadata(await buildGtiLike());
		assert.false(report.unreadable, 'readable');
		assert.strictEqual(
			entry(report, 'Title')?.detail,
			'GTI Handbuch',
		);
		assert.strictEqual(
			entry(report, 'Author')?.detail,
			'Company GmbH',
		);
		assert.strictEqual(
			entry(report, 'Subject')?.detail,
			'GTI Dokumentation',
		);
		assert.ok(
			entry(report, 'Keywords')?.detail.includes('GTI'),
			'keywords present',
		);
		assert.strictEqual(
			entry(report, 'Creator')?.detail,
			'LaTeX with hyperref',
		);
		assert.strictEqual(
			entry(report, 'Producer')?.detail,
			'pdfTeX-1.40.26',
		);
		assert.strictEqual(entry(report, 'Language')?.detail, 'en-US');
		assert.ok(
			entry(report, 'PDF Version')?.detail,
			'version surfaced',
		);
		assert.ok(
			entry(report, 'Creation Date')?.detail.startsWith(
				'20.02.2026',
			),
			`creation formatted: ${entry(report, 'Creation Date')?.detail}`,
		);
		assert.ok(
			entry(report, 'Modification Date')?.detail.startsWith(
				'20.02.2026',
			),
			`modification formatted: ${entry(report, 'Modification Date')?.detail}`,
		);
	});

	test('omits missing fields instead of blank rows', async function (assert) {
		const report = await parsePdfMetadata(await buildBare());
		assert.false(report.unreadable, 'readable');
		assert.strictEqual(
			entry(report, 'Title'),
			undefined,
			'no title row',
		);
		assert.strictEqual(
			entry(report, 'Author'),
			undefined,
			'no author row',
		);
		assert.strictEqual(
			entry(report, 'Subject'),
			undefined,
			'no subject row',
		);
		assert.strictEqual(
			entry(report, 'Keywords'),
			undefined,
			'no keywords row',
		);
		assert.strictEqual(
			entry(report, 'Language'),
			undefined,
			'no language row',
		);
		assert.ok(
			report.entries.every((e) => e.detail.trim().length > 0),
			'no blank details',
		);
	});

	test('corrupt input resolves unreadable without throwing', async function (assert) {
		const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const notPdf = new TextEncoder().encode('hello, not a pdf');
		const truncated = new TextEncoder().encode('%PDF-1.7 broken');

		for (const bytes of [garbage, notPdf, truncated]) {
			let report: Awaited<
				ReturnType<typeof parsePdfMetadata>
			> | null = null;
			try {
				report = await parsePdfMetadata(bytes);
			} catch (error) {
				assert.ok(false, `threw: ${String(error)}`);
				continue;
			}
			assert.true(report?.unreadable, 'unreadable flag');
			assert.deepEqual(report?.entries, [], 'no entries');
		}
	});

	test('stripped GTI-like bytes re-parse with no document metadata', async function (assert) {
		const stripped = await stripPdfMetadata(await buildGtiLike());
		assert.ok(stripped, 'strip returns bytes');
		const report = await parsePdfMetadata(stripped!.data);
		assert.false(report.unreadable, 'cleaned file still readable');
		for (const label of [
			'Title',
			'Author',
			'Subject',
			'Keywords',
			'Creator',
			'Producer',
		]) {
			assert.strictEqual(
				entry(report, label),
				undefined,
				`${label} removed`,
			);
		}
	});

	test('stripped file keeps the page count', async function (assert) {
		const original = await buildGtiLike();
		const stripped = await stripPdfMetadata(original);
		assert.ok(stripped, 'strip returns bytes');
		const reloaded = await PDFDocument.load(stripped!.data.slice(), {
			updateMetadata: false,
		});
		assert.strictEqual(
			reloaded.getPageCount(),
			1,
			'single page preserved',
		);
	});

	test('stripped result names what was removed', async function (assert) {
		const stripped = await stripPdfMetadata(await buildGtiLike());
		assert.ok(stripped, 'strip returns bytes');
		for (const label of [
			'Title',
			'Author',
			'Subject',
			'Keywords',
			'Creator',
			'Producer',
			'Language',
		]) {
			assert.true(
				stripped!.removed.includes(label),
				`removed names ${label}`,
			);
		}
	});

	test('corrupt input returns null without throwing', async function (assert) {
		const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const notPdf = new TextEncoder().encode('hello, not a pdf');
		const truncated = new TextEncoder().encode('%PDF-1.7 broken');

		for (const bytes of [garbage, notPdf, truncated]) {
			let result: Awaited<
				ReturnType<typeof stripPdfMetadata>
			> | null = null;
			try {
				result = await stripPdfMetadata(bytes);
			} catch (error) {
				assert.ok(false, `threw: ${String(error)}`);
				continue;
			}
			assert.strictEqual(result, null, 'null for corrupt input');
		}
	});
});
