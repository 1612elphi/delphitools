// SHOTS=<dir> saves screenshots

import { join } from 'node:path';
import { BASE, launch, check, finish, sleep } from './harness.mjs';

const shots = process.env.SHOTS;
const { browser, page } = await launch({ viewport: { width: 1400, height: 1000 } });
await page.evaluateOnNewDocument(() => {
	window.__reads = 0;
	for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
		if (!C) continue;
		const original = C.prototype.readPixels;
		C.prototype.readPixels = function (...a) {
			window.__reads++;
			return original.apply(this, a);
		};
	}
});
await page.goto(`${BASE}/editor`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__substrata && window.__substrataUi, { timeout: 25000 });
await sleep(500);

// 75 % grey over 25 % grey
await page.evaluate(() =>
	window.__substrata.addRaster(
		320,
		200,
		[
			{ x: 0, y: 0, w: 320, h: 100, colour: '#c0c0c0' },
			{ x: 0, y: 100, w: 320, h: 100, colour: '#404040' },
		],
		{ x: 500, y: 400 },
	),
);
await sleep(800);
const id = await page.evaluate(() => window.__substrata.doc().layers.find((l) => l.kind === 'raster').id);

const points = [];
for (let y = 250; y < 560; y += 3) for (let x = 300; x < 700; x += 3) points.push([x / 1999, y / 1499]);
const probe = async () => (await page.evaluate((p) => window.__substrata.exportBlob({ format: 'png', scale: 1 }, p), points)).probe;

const before = await probe();
const light = [];
const dark = [];
before.forEach((p, i) => (p[0] === 192 ? light : p[0] === 64 ? dark : []).push(i));
check('the probes cover both bands', light.length > 1000 && dark.length > 1000, `${light.length} ${dark.length}`);

const reads = await page.evaluate(() => window.__reads);
await page.evaluate((id) => window.__substrata.fx(id, 'dither'), id);
await sleep(600);
const after = await probe();
const white = (band) => band.filter((i) => after[i][0] === 255).length / band.length;
const grey = [...light, ...dark].filter((i) => after[i][0] !== 0 && after[i][0] !== 255).length;
check('webgl: the filter reads the texture back', (await page.evaluate(() => window.__reads)) > reads);
check('default: black and white only', grey === 0, String(grey));
check('the light band stays on top at 75 % white', Math.abs(white(light) - 0.75) < 0.05, white(light).toFixed(3));
check('the dark band is 25 % white', Math.abs(white(dark) - 0.25) < 0.05, white(dark).toFixed(3));

await page.evaluate(() => window.__substrataUi.toggle('fx'));
await sleep(400);
await page.evaluate(() => document.querySelector('.sub-fxp-block[data-fx-type="dither"] .sub-fxp-title').click());
await sleep(400);
const row = await page.evaluate(() => {
	const select = document.querySelector('[data-fx-param="algorithm"] select');
	return select && { options: select.options.length, named: !!select.getAttribute('aria-labelledby') };
});
check('Algorithm is a menu of ten', row?.options === 10 && row.named, JSON.stringify(row));
await page.select('[data-fx-param="algorithm"] select', '8');
await sleep(500);
check(
	'the menu writes the parameter',
	(await page.evaluate((id) => window.__substrata.doc().layers.find((l) => l.id === id).filters[0].params.algorithm, id)) === 'bayer-4',
);
if (shots) await page.screenshot({ path: join(shots, 'substrata-dither.png') });

await finish(browser);
