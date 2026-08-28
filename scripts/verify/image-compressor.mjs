// real codecs, real worker
// no network fetch
// avif slow even 192px
// only check proving gated format
// compressible unlike noise
// uploadfile needs disk path
// usage: npm start, then node scripts/verify/image-compressor.mjs

import { writeFileSync, statSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, visit, check, finish } from './harness.mjs';

const SOURCE = join(mkdtempSync(join(tmpdir(), 'ic-')), 'source.png');

const { browser, page } = await launch();

await visit(page, '/tools/image-compressor');

check('the drop zone renders', await page.$('.dt-ic-drop'));

const pngBase64 = await page.evaluate(() => {
	const canvas = document.createElement('canvas');
	canvas.width = 192;
	canvas.height = 192;
	const ctx = canvas.getContext('2d');
	const gradient = ctx.createLinearGradient(0, 0, 192, 192);
	gradient.addColorStop(0, '#e2503f');
	gradient.addColorStop(0.5, '#3f7fe2');
	gradient.addColorStop(1, '#46c46a');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 192, 192);
	ctx.fillStyle = '#f2e8d5';
	ctx.fillRect(24, 24, 64, 64);
	ctx.fillStyle = '#1c1c28';
	ctx.fillRect(96, 104, 72, 48);
	return canvas.toDataURL('image/png').split(',')[1];
});
writeFileSync(SOURCE, Buffer.from(pngBase64, 'base64'));
const sourceSize = statSync(SOURCE).size;

const input = await page.$('.dt-ic-drop input[type="file"]');
await input.uploadFile(SOURCE);

await page.waitForSelector('.dt-ic-after-img', { timeout: 30000 });
check('an upload shows the action bar', await page.$('.dt-ic-bar'));
check('and the before/after surface', await page.$('.dt-ic-compare'));

async function readResult() {
	return page.evaluate(async () => {
		const img = document.querySelector('.dt-ic-after-img');
		if (!img) return null;
		const buf = new Uint8Array(
			await (await fetch(img.src)).arrayBuffer(),
		);
		return {
			src: img.src,
			size: buf.length,
			magic: Array.from(buf.slice(0, 12)),
		};
	});
}

async function waitForNewResult(previousSrc, timeoutMs = 30000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const result = await readResult();
		if (result && result.src !== previousSrc) return result;
		if (Date.now() > deadline) return null;
		await new Promise((r) => setTimeout(r, 250));
	}
}

const isMagic = (result, offsets) =>
	offsets.every(([at, byte]) => result.magic[at] === byte);
const ascii = (result, from, to) =>
	String.fromCharCode(...result.magic.slice(from, to));

const webp = await readResult();
check('the default encode is WebP', webp && ascii(webp, 0, 4) === 'RIFF' && ascii(webp, 8, 12) === 'WEBP');
check(
	'and it is smaller than the PNG source',
	webp && webp.size < sourceSize,
	webp ? `${webp.size} vs ${sourceSize}` : 'no result',
);
const savings = await page.$eval(
	'.dt-ic-savings',
	(el) => el.textContent,
);
check('the savings badge reads negative', /^−\d+%$/.test(savings), savings);

let lastSrc = webp?.src ?? '';

await page.$$eval('.dt-ic-format', (buttons) =>
	buttons.find((b) => b.textContent.trim() === 'JPEG').click(),
);
let result = await waitForNewResult(lastSrc);
check('switching to JPEG re-encodes', result && isMagic(result, [[0, 0xff], [1, 0xd8]]));
lastSrc = result?.src ?? lastSrc;

await page.$eval('.dt-ic-quality', (el) => {
	el.value = '92';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
const q92 = await waitForNewResult(lastSrc);
check('quality 92 lands', !!q92, q92 ? `${q92.size} B` : 'timed out');
lastSrc = q92?.src ?? lastSrc;

await page.$eval('.dt-ic-quality', (el) => {
	el.value = '15';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
const q15 = await waitForNewResult(lastSrc);
check(
	'quality 15 beats quality 92 on size',
	q15 && q92 && q15.size < q92.size,
	q15 && q92 ? `${q15.size} vs ${q92.size}` : 'timed out',
);
lastSrc = q15?.src ?? lastSrc;

// oxipng lossless: effort replaces quality
await page.$$eval('.dt-ic-format', (buttons) =>
	buttons.find((b) => b.textContent.trim() === 'PNG').click(),
);
result = await waitForNewResult(lastSrc);
check(
	'switching to PNG re-encodes through OxiPNG',
	result && isMagic(result, [[0, 0x89], [1, 0x50], [2, 0x4e], [3, 0x47]]),
);
lastSrc = result?.src ?? lastSrc;
check('and the quality slider becomes effort', !!(await page.$('.dt-ic-effort')) && !(await page.$('.dt-ic-quality')));

// slow once ungated
const countSegments = () =>
	page.$$eval('.dt-ic-format', (buttons) => buttons.length);
check('AVIF is gated out of the formats', (await countSegments()) === 3);
await page.$eval('.dt-ic-switch', (el) => el.click());
check('the gate reveals AVIF', (await countSegments()) === 4);
await page.$$eval('.dt-ic-format', (buttons) =>
	buttons.find((b) => b.textContent.trim() === 'AVIF').click(),
);
result = await waitForNewResult(lastSrc, 120000);
check(
	'AVIF encodes (slow, hence the gate)',
	result && ascii(result, 4, 8) === 'ftyp',
	result ? `${result.size} B` : 'timed out',
);

check(
	'the download button is enabled with a result',
	await page.$eval('.dt-ic-download', (el) => !el.disabled),
);

await finish(browser);
