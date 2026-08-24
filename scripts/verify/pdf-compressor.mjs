// excluded from all.mjs: ~10mb wasm fetch
// npm run verify:pdf-compressor

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import * as mupdf from 'mupdf';
import { launch, visit, check, finish, sleep } from './harness.mjs';

// fixture: image-heavy, compressible
async function makeImagePdf() {
	const [w, h] = [1600, 1200];
	const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
	const px = pix.getPixels();
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 3;
			px[i] = ((x * 255) / w) ^ (y & 63);
			px[i + 1] = ((y * 255) / h) & 255;
			px[i + 2] = ((x + y) * 7) & 255;
		}
	const jpeg = pix.asJPEG(92, false);
	const doc = await PDFDocument.create();
	const img = await doc.embedJpg(jpeg);
	for (let p = 0; p < 3; p++) {
		const page = doc.addPage([612, 792]);
		page.drawImage(img, { x: 20, y: 20, width: 572, height: 752 });
	}
	const bytes = await doc.save();
	const path = join(mkdtempSync(join(tmpdir(), 'dt-pcmp-')), 'src.pdf');
	writeFileSync(path, bytes);
	return { path, size: bytes.length };
}

const src = await makeImagePdf();
const downloads = mkdtempSync(join(tmpdir(), 'dt-pcmp-dl-'));

async function waitForDownload(match, timeout = 90000) {
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

const clickText = (label) =>
	page.$$eval(
		'.dt-pcmp-btn',
		(btns, text) =>
			btns.find((b) => b.textContent.includes(text))?.click(),
		label,
	);

await visit(page, '/tools/pdf-compressor');
await (await page.$('.dt-pcmp-drop input[type="file"]')).uploadFile(src.path);
await page.waitForFunction(
	() => document.querySelector('.dt-pcmp-name') !== null,
	{ timeout: 30000 },
);
check('image PDF loads', true, `${src.size} bytes in`);

await sleep(500);
const autoStarted = await page.evaluate(
	() =>
		document.querySelector('.dt-pcmp-substat') !== null ||
		document.querySelector('.dt-pcmp-status') !== null,
);
check('does not auto-compress on load', !autoStarted);

// first compress fetches wasm
await clickText('Compress');
await page.waitForFunction(
	() => document.querySelector('.dt-pcmp-substat') !== null,
	{ timeout: 90000 },
);
const images = await page.$eval('.dt-pcmp-substat', (el) => el.textContent.trim());
check('images were recompressed', /image/.test(images), images);

await clickText('Download');
const out = await waitForDownload(/-small\.pdf$/);
check('compressed PDF downloads', !!out, out?.name ?? 'no download');

if (out) {
	check(
		'output is smaller than the input',
		out.bytes.length < src.size,
		`${src.size} -> ${out.bytes.length}`,
	);
	const doc = new mupdf.PDFDocument(new Uint8Array(out.bytes));
	check('output keeps all 3 pages', doc.countPages() === 3, `${doc.countPages()} pages`);
}

await finish(browser);
