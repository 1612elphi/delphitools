// pdf-page-numberer: load a PDF, stamp page numbers + optional text, download,
// and check the result is a valid PDF with its pages intact and grown by the
// added text. The placement/format maths is covered by the unit tests
// (lib/pdf-stamp); this proves the end-to-end wiring.
//
// Usage: npm start, then node scripts/verify/pdf-page-numberer.mjs

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const A4 = [595.28, 841.89];

async function makePdf(pages) {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let n = 1; n <= pages; n++) {
		const page = doc.addPage(A4);
		page.drawText(`Body ${n}`, { x: 72, y: A4[1] - 72, font });
	}
	const path = join(mkdtempSync(join(tmpdir(), 'dt-ppn-')), 'src.pdf');
	writeFileSync(path, await doc.save());
	return path;
}

const src = await makePdf(3);
const srcSize = statSync(src).size;
const downloads = mkdtempSync(join(tmpdir(), 'dt-ppn-dl-'));

async function waitForDownload(match, timeout = 30000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name) {
			const path = join(downloads, name);
			if (statSync(path).size > 0)
				return { name, bytes: readFileSync(path) };
		}
		await sleep(250);
	}
	return null;
}

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

await visit(page, '/tools/pdf-page-numberer');
await (await page.$('.dt-ppn-drop input[type="file"]')).uploadFile(src);
await page.waitForFunction(
	() => document.querySelector('.dt-ppn-count') !== null,
	{ timeout: 30000 },
);
check('PDF loads and reports its pages', true);

await page.click('.dt-ppn-apply');
const out = await waitForDownload(/numbered\.pdf$/);
check('stamped PDF downloads', !!out, out?.name ?? 'no download');

if (out) {
	const doc = await PDFDocument.load(out.bytes);
	check('output keeps all 3 pages', doc.getPageCount() === 3, `${doc.getPageCount()} pages`);
	check(
		'output grew (numbers + embedded font added)',
		out.bytes.length > srcSize,
		`${srcSize} -> ${out.bytes.length}`,
	);
}

await finish(browser);
