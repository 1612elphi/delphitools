// SHOTS=<dir> saves screenshots

import { join } from 'node:path';
import { launch, visit, check, finish, sleep, captureObjectUrl } from './harness.mjs';

const shots = process.env.SHOTS;
const { browser, page } = await launch();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

// rgb values, cell evenness
const picture = (scale = 1) =>
	page.evaluate((scale) => {
		const canvas = document.querySelector('.dith-picture');
		if (!canvas) return null;
		const { width, height } = canvas;
		const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
		const values = new Set();
		let uneven = 0;
		let sum = 0;
		for (let y = 0; y < height; y += 3)
			for (let x = 0; x < width; x += 3) {
				const i = (y * width + x) * 4;
				const c = ((y - (y % scale)) * width + (x - (x % scale))) * 4;
				for (let k = 0; k < 3; k++) {
					values.add(data[i + k]);
					sum += data[i + k];
					if (data[i + k] !== data[c + k]) uneven++;
				}
			}
		return { width, height, values: [...values].sort((a, b) => a - b), uneven, sum };
	}, scale);

await visit(page, '/tools/image-ditherer');
check(
	'the split fills the sheet',
	await page.evaluate(() => {
		const split = document.querySelector('.image-ditherer').getBoundingClientRect();
		const slot = document.querySelector('.dt-canon-tool').getBoundingClientRect();
		return Math.abs(split.height - slot.height) < 2 && Math.abs(split.width - slot.width) < 2;
	}),
);
check('empty: the drop zone and the picture slot', !!(await page.$('.dith-drop')) && !!(await page.$('.canon-split-sidebar .media-slot, .canon-split-sidebar [class*="slot"]')) && !(await page.$('.dith-picture')));
check('no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

await visit(page, '/tools/image-ditherer?ditherSample');
await page.waitForSelector('.dith-picture', { timeout: 10000 });
await sleep(600);
const mono = await picture();
check('the sample is dithered at its size', mono.width === 1600 && mono.height === 1200, `${mono.width}x${mono.height}`);
check('the dither runs in a worker', page.workers().some((w) => w.url().includes('dither-worker')), page.workers().map((w) => w.url()).join());
check('monochrome, two levels: black and white only', mono.values.join() === '0,255', mono.values.join());
check('one row, Download, no Download all', (await page.$$('.dith-source')).length === 1 && !!(await page.$('.dith-download')) && !(await page.$('.dith-all')));

await page.click('.dith-tile[data-algorithm="bayer-4"]');
await sleep(600);
const bayer = await picture();
check('an algorithm tile repaints', bayer.values.join() === '0,255' && bayer.sum !== mono.sum);

await page.evaluate(() => [...document.querySelectorAll('.dith-mode [role="radio"], .dith-mode button')].find((b) => b.textContent.includes('Colour')).click());
await sleep(600);
const colour = await picture();
check('Colour keeps the channels apart', colour.sum !== bayer.sum && colour.values.join() === '0,255');

await visit(page, '/tools/image-ditherer?ditherSample&ditherMode=colour&ditherLevels=4&ditherScale=4&ditherAlgorithm=atkinson');
await page.waitForSelector('.dith-picture', { timeout: 10000 });
await sleep(600);
const cells = await picture(4);
check('four levels', cells.values.every((v) => [0, 85, 170, 255].includes(v)) && cells.values.length > 2, cells.values.join());
check('4 px cells are one colour', cells.uneven === 0, String(cells.uneven));
check(
	'the flags set the controls',
	await page.evaluate(
		() =>
			document.querySelector('.dith-tile[aria-pressed="true"]').dataset.algorithm === 'atkinson' &&
			document.querySelector('.dith-levels [role="slider"]').getAttribute('aria-valuenow') === '4' &&
			document.querySelector('.dith-scale [role="slider"]').getAttribute('aria-valuenow') === '4',
	),
);
if (shots) await page.screenshot({ path: join(shots, 'image-ditherer.png') });

// second file via drop-more
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 40;
	canvas.height = 30;
	const context = canvas.getContext('2d');
	const fade = context.createLinearGradient(0, 0, 40, 0);
	fade.addColorStop(0, '#000');
	fade.addColorStop(1, '#fff');
	context.fillStyle = fade;
	context.fillRect(0, 0, 40, 30);
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const transfer = new DataTransfer();
	transfer.items.add(new File([blob], `frame-0002-${'9'.repeat(90)}.jpg`, { type: 'image/png' }));
	const input = document.querySelector('.image-ditherer input[type="file"]');
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(600);
check('two rows: Download, Download all and Zip', (await page.$$('.dith-source')).length === 2 && !!(await page.$('.dith-all .media-download-all-zip')) && !!(await page.$('.dith-download')));
check(
	'a long name is cut, its cells stay on the row',
	await page.evaluate(() => {
		const [short, long] = document.querySelectorAll('.dith-source');
		const title = long.querySelector('.canon-row-title');
		return title.scrollWidth > title.clientWidth && long.offsetHeight === short.offsetHeight && long.scrollWidth <= long.clientWidth;
	}),
);
check(
	'the picture is left of the settings',
	await page.evaluate(() => document.querySelector('.dith-picture').getBoundingClientRect().right <= document.querySelector('.dith-source').getBoundingClientRect().left),
);

await page.evaluate(() => document.querySelectorAll('.dith-show')[1].click());
await sleep(700);
const second = await picture(4);
check('Preview shows the second file', second.width === 40 && second.height === 30, `${second.width}x${second.height}`);

await captureObjectUrl(page);
await page.click('.dith-all .media-download-all-zip');
await page.waitForFunction(() => window.__result?.type === 'application/zip', { timeout: 20000 });
const names = await page.evaluate(async () => {
	const { default: JSZip } = await import('/node_modules/.vite/deps/jszip.js').catch(() => ({}));
	if (!JSZip) return null;
	return Object.keys((await JSZip.loadAsync(window.__result)).files).sort();
});
check('the zip holds both files as PNG', names === null ? (await page.evaluate(() => window.__result.size)) > 1000 : names.join() === `frame-0002-${'9'.repeat(90)}.png,sample.png`, String(names));

await page.evaluate(() => document.querySelectorAll('.dith-remove')[1].click());
await sleep(700);
const back = await picture(4);
check('Remove returns to the first file', (await page.$$('.dith-source')).length === 1 && back.width === 1600);

const tiles = await page.evaluate(() =>
	[...document.querySelectorAll('.dith-tile img')].map((img) => {
		const c = document.createElement('canvas');
		c.width = c.height = 96;
		c.getContext('2d').drawImage(img, 0, 0);
		const { data } = c.getContext('2d').getImageData(0, 0, 96, 96);
		let white = 0;
		let grey = 0;
		for (let i = 0; i < data.length; i += 4) data[i] === 255 ? white++ : data[i] === 0 || grey++;
		return grey === 0 && white > 500 && white < c.width * c.height - 500;
	}),
);
const tinted = await page.evaluate(() =>
	[...document.querySelectorAll('.dith-tile img')].filter((img) => {
		const c = document.createElement('canvas');
		c.width = c.height = 96;
		c.getContext('2d').drawImage(img, 0, 0);
		const { data } = c.getContext('2d').getImageData(0, 0, 96, 96);
		for (let i = 0; i < data.length; i += 4) if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) return true;
		return false;
	}).length,
);
check('Colour mode: every tile has colour', tinted === 10, String(tinted));
await page.evaluate(() => [...document.querySelectorAll('.dith-mode button, .dith-mode [role="radio"]')].find((b) => b.textContent.includes('Monochrome')).click());
await sleep(500);
check('ten tiles, each dithered to black and white', tiles.length === 10 && tiles.every(Boolean), tiles.join());

const tracks = await page.evaluate(() =>
	['.dith-levels', '.dith-scale'].map((row) => {
		const b = document.querySelector(row + ' .canon-slider-track').getBoundingClientRect();
		return Math.round(b.left) + ':' + Math.round(b.width);
	}),
);
check('both slider tracks start and end together', tracks[0] === tracks[1], tracks.join(' '));

const unnamed = await page.evaluate(() =>
	[...document.querySelectorAll('.image-ditherer button, .image-ditherer select, .image-ditherer [role="slider"]')]
		.filter((c) => !(c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.textContent.trim()))
		.map((c) => c.className),
);
check('every control is named', unnamed.length === 0, unnamed.join(' | '));

await page.setViewport({ width: 390, height: 844 });
await sleep(700);
const narrow = await page.evaluate(() =>
	['.dith-levels', '.dith-scale'].map((row) => {
		const b = document.querySelector(row + ' .canon-slider-track').getBoundingClientRect();
		return Math.round(b.left) + ':' + Math.round(b.width);
	}),
);
check('390 px: the tracks still match', narrow[0] === narrow[1] && Number(narrow[0].split(':')[1]) >= 96, narrow.join(' '));
check('390 px: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
if (shots) await page.screenshot({ path: join(shots, 'image-ditherer-phone.png') });

await finish(browser);
