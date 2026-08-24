// preview: img, not canvas
// export path only runs on download
//
// libjxl, not substrata worker
// magic bytes prove jxl format
//
// usage: npm start, then node scripts/verify/stitch.mjs

import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const IMAGE = join(
	dirname(fileURLToPath(import.meta.url)),
	'../..',
	'public/delphi.png',
);

const { browser, page } = await launch();
const downloads = mkdtempSync(join(tmpdir(), 'dt-stitch-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

// .crdownload first; await named file
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

// shared input: files via chooser
async function pickVia(selector, ...files) {
	const [chooser] = await Promise.all([
		page.waitForFileChooser(),
		page.click(selector),
	]);
	await chooser.accept(files);
	await sleep(1500);
}

await visit(page, '/tools/image-stitcher');
await pickVia('.dt-stitch-drop', IMAGE, IMAGE, IMAGE);

const mosaic = await page.evaluate(() => ({
	tiles: document.querySelectorAll('.dt-stitch-tile').length,
	formats: [...document.querySelectorAll('.dt-stitch-format')].map((b) =>
		b.textContent.trim(),
	),
	modes: [...document.querySelectorAll('.dt-stitch-mode')].map((b) =>
		b.textContent.trim(),
	),
}));
check('three images become three tiles', mosaic.tiles === 3, `${mosaic.tiles}`);
check(
	'the export offers every format',
	mosaic.formats.join(' ') === 'PNG JPEG WebP JXL',
	mosaic.formats.join(' '),
);
check(
	'both modes are present',
	mosaic.modes.length === 2,
	mosaic.modes.join(' '),
);

await page.click('.dt-stitch-download');
const png = await waitForDownload(/\.png$/);
check(
	'the sheet exports as a PNG',
	!!png && png.bytes.subarray(1, 4).toString() === 'PNG',
	png ? `${png.name}, ${png.bytes.length} bytes` : 'no file appeared',
);

await page.evaluate(() =>
	[...document.querySelectorAll('.dt-stitch-format')]
		.find((b) => /jxl/i.test(b.textContent))
		.click(),
);
await sleep(400);
await page.click('.dt-stitch-download');
const jxl = await waitForDownload(/\.jxl$/);
// ff 0a or ISOBMFF
const signature = jxl
	? [...jxl.bytes.subarray(0, 4)]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join(' ')
	: '';
check(
	'and as a real JXL stream',
	!!jxl &&
		((jxl.bytes[0] === 0xff && jxl.bytes[1] === 0x0a) ||
			signature.startsWith('00 00 00')),
	jxl
		? `${jxl.name}, ${jxl.bytes.length} bytes, ${signature}`
		: 'no file appeared',
);

await visit(page, '/tools/image-stitcher');
await pickVia('.dt-stitch-drop', IMAGE);
await pickVia('.dt-stitch-side.is-right', IMAGE);
const grown = await page.evaluate(() => ({
	tiles: document.querySelectorAll('.dt-stitch-tile').length,
	seams: document.querySelectorAll('.dt-stitch-seam').length,
}));
check(
	'a side button grows the mosaic and adds a seam',
	grown.tiles === 2 && grown.seams === 1,
	`${grown.tiles} tiles, ${grown.seams} seams`,
);

await visit(page, '/tools/image-stitcher');
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-stitch-mode')]
		.find((b) => /batch/i.test(b.textContent))
		.click(),
);
await sleep(400);
await pickVia(
	'.dt-stitch-pool-add, .dt-stitch-drop',
	IMAGE,
	IMAGE,
	IMAGE,
	IMAGE,
);

const batch = await page.evaluate(() => ({
	thumbs: document.querySelectorAll('.dt-stitch-thumb').length,
	cells: document.querySelectorAll('.dt-stitch-preview-cell').length,
	ready: !document.querySelector('.dt-stitch-download')?.disabled,
}));
check(
	'the batch pool takes its own images',
	batch.thumbs === 4,
	`${batch.thumbs} thumbs`,
);
check(
	'and lays every one of them out',
	batch.cells === 4,
	`${batch.cells} preview cells`,
);
check(
	'and the export enables',
	batch.ready,
	batch.ready ? 'enabled' : 'disabled',
);

await finish(browser);
