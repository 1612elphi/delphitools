import { readFileSync } from 'node:fs';
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const PNG = readFileSync(new URL('../../public/heroes/garbajcam.png', import.meta.url));
const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
// one page plus more
const ROWS = Array.from({ length: 21 }, (_, i) => [
	`https://img.example.org/p${i}.png`,
	`Photo ${i}`,
	'Tester',
	`https://example.org/p${i}`,
	i === 1 ? 'pdm' : 'cc0',
]);
const INDEX = {
	shard: 1000,
	count: ROWS.length,
	words: { lake: ROWS.map((_, i) => i), mountain: [1, 3] },
};

const { browser, page } = await launch({ viewport: { width: 1400, height: 1000 } });
const hits = { openverse: 0, iconify: 0, index: 0 };
await page.setRequestInterception(true);
page.on('request', (req) => {
	const url = new URL(req.url());
	const cors = { 'Access-Control-Allow-Origin': '*' };
	if (url.host === 'api.openverse.org') hits.openverse++;
	if (url.pathname.startsWith('/substrata/photos/')) {
		hits.index++;
		const body = url.pathname.endsWith('index.json') ? INDEX : ROWS;
		return req.respond({ contentType: 'application/json', body: JSON.stringify(body) });
	}
	if (url.host === 'api.iconify.design') {
		hits.iconify++;
		if (url.pathname === '/search')
			return req.respond({
				headers: cors,
				contentType: 'application/json',
				body: JSON.stringify({
					icons: ['mdi:apple', 'mdi:pear'],
					total: 2,
					collections: {
						mdi: {
							name: 'Material Design Icons',
							author: { name: 'Pictogrammers', url: 'https://example.org/mdi' },
							license: { title: 'Apache 2.0', url: 'https://example.org/apache' },
						},
					},
				}),
			});
		return req.respond({ headers: cors, contentType: 'image/svg+xml', body: SVG });
	}
	if (url.host.endsWith('example.org'))
		return req.respond({ headers: cors, contentType: 'image/png', body: PNG });
	return req.continue();
});

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata && window.__substrataUi);
await page.evaluate(() => localStorage.removeItem('substrata:assets'));
await sleep(300);

const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const rect = (sel) =>
	page.evaluate((s) => {
		const r = document.querySelector(s)?.getBoundingClientRect();
		return r && { l: r.left, r: r.right };
	}, sel);
const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
const layers = () => page.evaluate(() => window.__substrata.doc().layers);
const search = async (text) => {
	await page.click('.sub-assets-search', { clickCount: 3 });
	await page.type('.sub-assets-search', text);
	await page.keyboard.press('Enter');
	await sleep(500);
};

await click('.sub-ed-panel-keys button[aria-label="Assets"]');
await sleep(300);
check('Assets key opens the panel', await has('.sub-ed-assets [data-panel="assets"]'));
const panel = await rect('.sub-ed-assets');
const column = await rect('.sub-ed-column');
check('right hand: assets on the left of the column', panel && column && panel.r < column.l, JSON.stringify({ panel, column }));
check('no request before turning on', hits.index + hits.iconify === 0);
check('opt-in note shown', await has('.sub-assets-note'));

await click('.sub-assets-on');
await sleep(200);
check('turning on shows the search', await has('.sub-assets-search'));
check('consent kept', (await page.evaluate(() => localStorage.getItem('substrata:assets'))) === '1');

await search('mountain lake');
const tiles = await page.$$eval('.sub-asset', (b) => b.map((x) => x.getAttribute('aria-label')));
check('photo search reads the index, never openverse', hits.index === 2 && hits.openverse === 0, JSON.stringify(hits));
check('best match first, licence tags on tiles', tiles.length === 20 && tiles[0] === 'Photo 1, Public domain' && tiles[1] === 'Photo 3, CC0', tiles.join(' | '));
check('more pages offered', await has('.sub-assets-more'));

await click('.sub-asset');
await sleep(1200);
let ls = await layers();
check('click places a layer with its source', ls.length === 1 && ls[0].source?.provider === 'openverse' && ls[0].source.title === 'Photo 1', JSON.stringify(ls[0]?.source));

const frameId = ls[0].id;
await page.evaluate(() => window.__substrataUi.toggle('layers'));
await sleep(300);
await page.click(`.sub-layer-main[data-layer-id="${frameId}"]`, { button: 'right' });
await sleep(250);
await page.evaluate(() => [...document.querySelectorAll('[data-layer-menu] button')].find((b) => b.textContent.trim() === 'More Options').click());
await sleep(200);
await page.evaluate(() => [...document.querySelectorAll('[data-layer-menu] button')].find((b) => b.textContent.trim() === 'Make Stratum').click());
await sleep(300);
await page.evaluate((id) => window.__substrata.select([id]), frameId);
await sleep(200);
await click('.sub-asset:nth-child(2)');
await sleep(1200);
ls = await layers();
check('a selected frame takes the asset', ls.length === 1 && ls[0].source?.title === 'Photo 3', JSON.stringify(ls.map((l) => l.source?.title)));

await page.evaluate(() => window.__substrata.select([]));
const third = await page.$eval('.sub-asset:nth-child(3)', (b) => b.getAttribute('aria-label').split(',')[0]);
await page.evaluate((id) => {
	const p = window.__substrata.layers().find((l) => l.id === id).screen;
	const dt = new DataTransfer();
	document.querySelector('.sub-asset:nth-child(3)').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
	document.querySelector('.sub-canvas-drop-hint').parentElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, dataTransfer: dt }));
}, frameId);
await sleep(1200);
ls = await layers();
check('an asset dragged onto a frame fills it', ls.length === 1 && ls[0].source?.title === third, JSON.stringify(ls.map((l) => l.source?.title)));

await click('.sub-ed-assets .sub-panel-header button[aria-label="Close"]');
await click('.sub-ed-panel-keys button[aria-label="Assets"]');
await sleep(300);
await page.evaluate(() => [...document.querySelectorAll('.sub-assets-panel .canon-button')].find((b) => b.textContent.trim() === 'Icons')?.click());
await search('apple');
check('icons tab lists icons', (await page.$$('.is-icons .sub-asset')).length === 2);
await page.evaluate(() => window.__substrata.select([]));
await click('.is-icons .sub-asset');
await sleep(1200);
ls = await layers();
check('icon placed with its set licence', ls.length === 2 && ls[1].source?.licence === 'Apache 2.0', JSON.stringify(ls[1]?.source));

await click('.sub-ed-stack button[aria-label="Share"]');
await sleep(500);
const credits = await page.evaluate(() => [...document.querySelectorAll('.sub-pg-credit')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
check('export lists both credits', credits.length === 2 && credits.join().includes(third) && credits.join().includes('Apache 2.0'), credits.join(' | '));
await page.keyboard.press('Escape');
await sleep(200);

await page.evaluate(() => {
	document.querySelector('.sub-ed').dataset.hand = 'left';
});
await sleep(300);
const panelL = await rect('.sub-ed-assets');
const columnL = await rect('.sub-ed-column');
check('left hand: assets on the right of the column', panelL && columnL && panelL.l > columnL.r, JSON.stringify({ panelL, columnL }));

await page.setViewport({ width: 390, height: 844 });
await sleep(600);
check('phone: assets panel in the tray', await has('.sub-ed-rail.is-tray [data-panel="assets"]'));
check('phone: no desktop column', !(await has('.sub-ed-assets')));
await page.evaluate(() => {
	const ui = window.__substrataUi;
	if (ui.isOpen('layers')) ui.toggle('layers', true);
	ui.toggle('layers', true);
});
await sleep(300);
check('phone: opening a panel closes assets', !(await has('[data-panel="assets"]')));
await click('[data-panel="layers"] .sub-panel-header button[aria-label="Add Layer"]');
await sleep(300);
await page.evaluate(() => [...document.querySelectorAll('.sub-lm-add button')].find((b) => b.textContent.trim() === 'Assets')?.click());
await sleep(300);
check('phone: Add > Assets swaps layers for assets', (await has('.sub-ed-rail.is-tray [data-panel="assets"]')) && !(await has('[data-panel="layers"]')));
check('phone: row keeps the colour key on screen', await page.evaluate(() => { const r = document.querySelector('.sub-ed-row .sub-ed-colour-key, .sub-ed-row [class*=colour-key]')?.getBoundingClientRect(); return !!r && r.right <= innerWidth; }));

await browser.close();
finish();
