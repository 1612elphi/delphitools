// pdf-organiser: merge, rotate, delete, drag-reorder and split, checked
// against the PDFs it writes.
//
// Fixtures are written by node with the same pdf-lib the app uses — alpha.pdf
// (3 A4 pages) and beta.pdf (2 Letter pages), so page sizes in the merged
// output prove the order the pages travelled in.
//
// Usage: npm start, then node scripts/verify/pdf-organiser.mjs

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const A4 = [595.28, 841.89];
const LETTER = [612, 792];

async function makePdf(name, label, size, pages) {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let n = 1; n <= pages; n++) {
		const page = doc.addPage(size);
		page.drawText(`${label} ${n}`, { x: 72, y: size[1] - 72, font });
	}
	const path = join(
		mkdtempSync(join(tmpdir(), 'dt-porg-')),
		name,
	);
	writeFileSync(path, await doc.save());
	return path;
}

const alpha = await makePdf('alpha.pdf', 'ALPHA', A4, 3);
const beta = await makePdf('beta.pdf', 'BETA', LETTER, 2);

const downloads = mkdtempSync(join(tmpdir(), 'dt-porg-dl-'));

/** Chrome writes a .crdownload first, so wait for a settled, named file. */
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

await visit(page, '/tools/pdf-organiser');
// One file at a time: the grid follows load order, and the checks below
// need to know which file leads.
await (await page.$('.dt-porg-drop input[type="file"]')).uploadFile(alpha);
await page.waitForFunction(
	() => document.querySelectorAll('.dt-porg-cell').length === 3,
	{ timeout: 30000 },
);
await (await page.$('.dt-porg-bar input[type="file"]')).uploadFile(beta);

const loaded = await page
	.waitForFunction(
		() => document.querySelectorAll('.dt-porg-cell').length === 5,
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
check('two uploaded PDFs render a 5-page grid', loaded);

const count = await page.$eval('.dt-porg-count', (el) => el.textContent);
check(
	'the bar counts files and pages',
	/2 files · 5 pages/.test(count),
	count.trim(),
);

// Rotate alpha p.1 (+90°).
await page.click('.dt-porg-cell .dt-porg-tool[title="Rotate"]');
const rotated = await page.$eval(
	'.dt-porg-cell .dt-porg-thumb',
	(el) => el.className,
);
check(
	'rotate marks the thumbnail',
	/is-rot-90/.test(rotated),
	rotated.trim().replace(/\s+/g, ' '),
);

// Delete beta p.2 (the last cell) — 4 pages remain.
await page.click('.dt-porg-cell:last-child .dt-porg-tool[title="Delete"]');
await page.waitForFunction(
	() => document.querySelectorAll('.dt-porg-cell').length === 4,
	{ timeout: 5000 },
);
check('delete drops a page from the grid', true);

const badgeOrder = () =>
	page.$$eval('.dt-porg-badge', (els) => els.map((el) => el.textContent));
const before = await badgeOrder();

// Drag the first cell (alpha p.1) onto the third (alpha p.3): a move, not a
// swap. Synthetic DragEvents carry a real DataTransfer, which is all the
// handlers read.
await page.evaluate(() => {
	const cells = [...document.querySelectorAll('.dt-porg-cell')];
	const dataTransfer = new DataTransfer();
	const init = { bubbles: true, cancelable: true, dataTransfer };
	cells[0].dispatchEvent(new DragEvent('dragstart', init));
	cells[2].dispatchEvent(new DragEvent('dragover', init));
	cells[2].dispatchEvent(new DragEvent('drop', init));
	cells[0].dispatchEvent(new DragEvent('dragend', init));
});
await sleep(300);

const after = await badgeOrder();
check(
	'drag reorders the grid',
	after.join('|') === 'p. 2|p. 3|p. 1|p. 1',
	`${before.join('|')} → ${after.join('|')}`,
);

// ── merge ────────────────────────────────────────────────────────────────
await page.click('.dt-porg-btn.is-primary');
const merged = await waitForDownload(/-merged\.pdf$/);
check('merged PDF downloads', !!merged, merged?.name ?? 'nothing landed');

if (merged) {
	const doc = await PDFDocument.load(merged.bytes);
	check('merged PDF has 4 pages', doc.getPageCount() === 4);
	const sizes = doc.getPages().map((p) => {
		const { width } = p.getSize();
		return Math.round(width);
	});
	// alpha ×3 (A4, 595pt) in the dragged order, then beta p.1 (Letter).
	check(
		'merged order follows the grid',
		sizes.join(',') === '595,595,595,612',
		sizes.join(','),
	);
	check(
		'the rotated page kept its 90°',
		doc.getPage(2).getRotation().angle === 90,
		`page 3 rotation ${doc.getPage(2).getRotation().angle}`,
	);
}

// ── split: one range ─────────────────────────────────────────────────────
await page.type('.dt-porg-field input[type="text"]', '1-2');
await sleep(300);
await page.click('.dt-porg-splitgo');
const part = await waitForDownload(/-part-1\.pdf$/);
check('a single range downloads one PDF', !!part, part?.name ?? 'nothing');
if (part) {
	const doc = await PDFDocument.load(part.bytes);
	check('the range part has 2 pages', doc.getPageCount() === 2);
}

// ── split: every page ────────────────────────────────────────────────────
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-porg-opt')]
		.find((b) => b.textContent.trim() === 'Every page')
		.click();
});
await sleep(300);
await page.click('.dt-porg-splitgo');
const zip = await waitForDownload(/-split\.zip$/);
check('every-page split downloads a zip', !!zip, zip?.name ?? 'nothing');
if (zip) {
	const archive = await JSZip.loadAsync(zip.bytes);
	const names = Object.keys(archive.files).sort();
	check(
		'the zip holds one PDF per page',
		names.length === 4 &&
			names.every((n) => /-page-\d+\.pdf$/.test(n)),
		names.join(', '),
	);
}

// ── a bad range reports and disables ─────────────────────────────────────
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-porg-opt')]
		.find((b) => b.textContent.trim() === 'By ranges')
		.click();
});
await page.waitForSelector('.dt-porg-field input[type="text"]', {
	timeout: 5000,
});
// value= alone does not fire input; typing the replacement does.
await page.evaluate(() => {
	document.querySelector('.dt-porg-field input[type="text"]').value = '';
});
const ranges = await page.$('.dt-porg-field input[type="text"]');
await ranges.type('8-9');
await sleep(300);
const rangeState = await page.evaluate(() => ({
	error: document.querySelector('.dt-porg-error')?.textContent ?? '',
	disabled: document.querySelector('.dt-porg-splitgo')?.disabled,
}));
check(
	'an out-of-document range reports and disables',
	/out of range/.test(rangeState.error) && rangeState.disabled,
	rangeState.error.trim(),
);

await finish(browser);
