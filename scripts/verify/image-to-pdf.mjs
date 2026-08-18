// image-to-pdf: images in, a PDF out; a PDF in, PNGs out.
//
// The images are synthesised in-page on a canvas (red 200×100, blue 100×200)
// and dropped as Files, so the rig needs no checked-in fixture; the PDF side
// reuses a node-written pdf-lib fixture. Downloads are unpacked in node:
// page sizes prove orientation and match-image sizing, PNG headers prove the
// render scale.
//
// Usage: npm start, then node scripts/verify/image-to-pdf.mjs

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const A4 = [595.28, 841.89];
const MM_TO_PT = 72 / 25.4;

const fixture = join(mkdtempSync(join(tmpdir(), 'dt-i2p-')), 'three.pdf');
{
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (const n of [1, 2, 3]) {
		const page = doc.addPage(A4);
		page.drawText(`PAGE ${n}`, { x: 72, y: A4[1] - 72, font });
	}
	writeFileSync(fixture, await doc.save());
}

const downloads = mkdtempSync(join(tmpdir(), 'dt-i2p-dl-'));

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

/** Empty the dir between steps so a wait cannot match the previous file. */
function clearDownloads() {
	for (const name of readdirSync(downloads)) {
		rmSync(join(downloads, name));
	}
}

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

await visit(page, '/tools/image-to-pdf');

// Two canvases → two Files → one drop on the queue wrapper.
await page.evaluate(async () => {
	const make = (width, height, colour, name) =>
		new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = colour;
			ctx.fillRect(0, 0, width, height);
			canvas.toBlob(
				(blob) =>
					resolve(new File([blob], name, { type: 'image/png' })),
				'image/png',
			);
		});
	const files = await Promise.all([
		make(200, 100, '#c0392b', 'red-wide.png'),
		make(100, 200, '#2b5fc0', 'blue-tall.png'),
	]);
	const dataTransfer = new DataTransfer();
	for (const file of files) dataTransfer.items.add(file);
	const target = document.querySelector('.dt-i2p-drop');
	target.dispatchEvent(
		new DragEvent('drop', {
			bubbles: true,
			cancelable: true,
			dataTransfer,
		}),
	);
});

const queued = await page
	.waitForFunction(
		() => document.querySelectorAll('.dt-i2p-cell').length === 2,
		{ timeout: 15000 },
	)
	.then(() => true)
	.catch(() => false);
check('two dropped images queue up', queued);

// Drag red-wide past blue-tall, so the tall portrait page comes first.
await page.evaluate(() => {
	const cells = [...document.querySelectorAll('.dt-i2p-cell')];
	const dataTransfer = new DataTransfer();
	const init = { bubbles: true, cancelable: true, dataTransfer };
	cells[0].dispatchEvent(new DragEvent('dragstart', init));
	cells[1].dispatchEvent(new DragEvent('dragover', init));
	cells[1].dispatchEvent(new DragEvent('drop', init));
	cells[0].dispatchEvent(new DragEvent('dragend', init));
});
await sleep(300);

const order = await page.$$eval('.dt-i2p-badge', (els) =>
	els.map((el) => el.textContent),
);
check(
	'drag reorders the queue',
	order.join('|') === 'blue-tall.png|red-wide.png',
	order.join('|'),
);

// Default settings: A4, auto orientation, fit, no margin.
await page.click('.dt-i2p-btn.is-primary');
const built = await waitForDownload(/^images\.pdf$/);
check('Build PDF downloads', !!built, built?.name ?? 'nothing landed');

if (built) {
	const doc = await PDFDocument.load(built.bytes);
	check('one page per image', doc.getPageCount() === 2);
	const [first, second] = doc.getPages().map((p) => p.getSize());
	check(
		'auto orientation: tall image portrait, wide image landscape',
		Math.round(first.height) === Math.round(A4[1]) &&
			Math.round(first.width) === Math.round(A4[0]) &&
			Math.round(second.width) === Math.round(A4[1]),
		`${Math.round(first.width)}×${Math.round(first.height)}, ${Math.round(second.width)}×${Math.round(second.height)}`,
	);
}

// Match-image sizing with a 10 mm margin: page = px × 0.75 + margin each side.
clearDownloads();
await page.select('.dt-i2p-field select', 'match');
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-i2p-margin .dt-i2p-opt')]
		.find((b) => b.textContent.trim() === '10 mm')
		.click();
});
await sleep(200);
await page.click('.dt-i2p-btn.is-primary');
const matchFile = await waitForDownload(/^images\.pdf$/);
check(
	'match-image build downloads',
	!!matchFile,
	matchFile?.name ?? 'nothing landed',
);
if (matchFile) {
	const doc = await PDFDocument.load(matchFile.bytes);
	const margin = 10 * MM_TO_PT;
	const first = doc.getPage(0).getSize();
	const expected = {
		width: 100 * 0.75 + margin * 2,
		height: 200 * 0.75 + margin * 2,
	};
	check(
		'match sizes the page to the image plus margin',
		Math.abs(first.width - expected.width) < 1 &&
			Math.abs(first.height - expected.height) < 1,
		`${first.width.toFixed(1)}×${first.height.toFixed(1)} vs ${expected.width.toFixed(1)}×${expected.height.toFixed(1)}`,
	);
}

// ── PDF → PNG ────────────────────────────────────────────────────────────
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-i2p-tab')]
		.find((b) => b.textContent.includes('PDF to Image'))
		.click();
});
await (await page.$('.dt-i2p-drop input[type="file"]')).uploadFile(fixture);

const rendered = await page
	.waitForFunction(
		() => document.querySelectorAll('.dt-i2p-cell').length === 3,
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
check('the PDF renders one cell per page', rendered);

// Per-page download: PNG signature + IHDR width at the default ×2 scale.
await page.click('.dt-i2p-cell .dt-i2p-tool[title="Download"]');
const png = await waitForDownload(/-page-1\.png$/);
check('a single page downloads as PNG', !!png, png?.name ?? 'nothing');
if (png) {
	const isPng = png.bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const width = png.bytes.readUInt32BE(16);
	check(
		'the PNG is rendered at 2× (72 → 144 DPI)',
		isPng && Math.abs(width - A4[0] * 2) < 3,
		`width ${width}`,
	);
}

await page.click('.dt-i2p-btn.is-primary');
const zip = await waitForDownload(/-pages\.zip$/);
check('Download zip lands', !!zip, zip?.name ?? 'nothing');
if (zip) {
	const archive = await JSZip.loadAsync(zip.bytes);
	const names = Object.keys(archive.files).sort();
	check(
		'the zip holds one PNG per page',
		names.length === 3 && names.every((n) => /-page-\d+\.png$/.test(n)),
		names.join(', '),
	);
}

await finish(browser);
