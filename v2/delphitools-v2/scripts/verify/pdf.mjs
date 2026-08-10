// The two pdf tools open a real PDF and produce one.
//
// Both shipped broken once and neither the build nor the five lint gates
// noticed, because both failures happen only at runtime:
//
//   pdf-lib   @pdf-lib/standard-fonts imports pako 1.0.11, which is CommonJS.
//             pdf-lib is excluded from Vite's dep optimizer (the optimizer
//             cannot parse standard-fonts' .json font payloads), and excluding
//             a package leaves its dependencies unconverted, so importing
//             pdf-lib threw "does not provide an export named 'default'" the
//             first time any tool reached for it.
//   pdf.js    the worker was a file copied into public/, pinned to a version
//             the installed pdfjs-dist moved past. pdf.js then threw "The API
//             version X does not match the Worker version Y" on the first PDF
//             opened, and pdf-preflight reported that as a malformed file.
//
// The fixture is written by node with the same pdf-lib the app uses, so the
// rig needs no binary checked in.
//
// Usage: npm start, then node scripts/verify/pdf.mjs

import {
	mkdtempSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const n of [1, 2, 3, 4]) {
	const page = doc.addPage([595, 842]);
	page.drawText(`delphitools ${n}`, {
		x: 40,
		y: 760,
		size: 36,
		font,
		color: rgb(0, 0, 0),
	});
}
const fixture = join(mkdtempSync(join(tmpdir(), 'dt-pdf-')), 'four-pages.pdf');
writeFileSync(fixture, await doc.save());

const IMAGE = join(
	dirname(fileURLToPath(import.meta.url)),
	'../..',
	'public/delphi.png',
);

/** Chrome writes a .crdownload first, so wait for a settled, named file. */
async function waitForDownload(dir, timeout) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(dir).find(
			(n) => n.endsWith('.pdf') && !n.endsWith('.crdownload'),
		);
		if (name) {
			const bytes = statSync(join(dir, name)).size;
			if (bytes > 0) return { ok: true, name, bytes };
		}
		await sleep(250);
	}
	return { ok: false };
}

const { browser, page } = await launch();

// ── pdf-preflight reads it ──────────────────────────────────────────────

await visit(page, '/tools/pdf-preflight');
await (await page.$('input[type="file"]')).uploadFile(fixture);

// Analysis is pdf-lib then pdf.js, both dynamically imported on first use.
const analysed = await page
	.waitForFunction(
		() =>
			!!document.querySelector(
				'.dt-preflight-badges, .dt-preflight-group',
			) || !!document.querySelector('.dt-preflight-error'),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);

const preflight = await page.evaluate(() => ({
	error: document
		.querySelector('.dt-preflight-error')
		?.textContent?.trim()
		?.slice(0, 80),
	body: document.body.textContent ?? '',
}));

check(
	'pdf-preflight analyses a PDF rather than rejecting it',
	analysed && !preflight.error,
	preflight.error ?? 'no error shown',
);
// Four pages is the fixture; a worker mismatch never gets this far.
check(
	'and reads the page count out of it',
	/\b4\b/.test(preflight.body),
	'4 pages',
);

// ── imposer parses one and writes one ───────────────────────────────────

const downloads = mkdtempSync(join(tmpdir(), 'dt-imposer-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

await visit(page, '/tools/imposer');
await (await page.$('.dt-imp-drop input[type="file"]')).uploadFile(fixture);

const loaded = await page
	.waitForFunction(() => !!document.querySelector('.dt-imp-file-name'), {
		timeout: 30000,
	})
	.then(() => true)
	.catch(() => false);

check(
	'imposer parses the PDF it was given',
	loaded,
	loaded ? 'file accepted' : 'never left the drop zone',
);

if (loaded) {
	// pdf.js renders the page thumbnails; pdf-lib writes the sheet.
	await sleep(1500);
	const shape = await page.evaluate(() => ({
		canvases: document.querySelectorAll('canvas').length,
		name: document
			.querySelector('.dt-imp-file-name')
			?.textContent?.trim(),
	}));
	check(
		'and renders a preview of it',
		shape.canvases > 0,
		`${shape.canvases} canvases, ${shape.name}`,
	);
}

// ── zine-imposer writes a PDF ───────────────────────────────────────────
//
// This is the path that failed in the wild: pdf-lib imported, images embedded,
// doc.save() into a Blob and a download. The error surfaced as "zine pdf
// generation failed" with a pako SyntaxError behind it.

await visit(page, '/tools/zine-imposer');
await (
	await page.$('.dt-zine-bulk input[type="file"]')
).uploadFile(IMAGE, IMAGE, IMAGE, IMAGE);
await sleep(1200);

const generate = await page.$('.dt-zine-generate');
const ready = await page.evaluate((el) => el && !el.disabled, generate);
check(
	'zine-imposer accepts images',
	!!ready,
	ready ? 'generate enabled' : 'still disabled',
);

if (ready) {
	await generate.click();
	const wrote = await waitForDownload(downloads, 30000);
	check(
		'and writes a PDF',
		wrote.ok && wrote.bytes > 1000,
		wrote.ok
			? `${wrote.name}, ${wrote.bytes} bytes`
			: 'no file appeared',
	);
	if (wrote.ok) {
		check(
			'that starts with a PDF header',
			readFileSync(join(downloads, wrote.name))
				.subarray(0, 5)
				.toString() === '%PDF-',
			'%PDF-',
		);
	}
}

await finish(browser);
