
import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/uuid-genny');

const rows = () =>
	page.$$eval('.dt-uuid-row .dt-uuid-value', (els) =>
		els.map((el) => el.textContent.trim()),
	);
const V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NANO = /^[A-Za-z0-9_-]{21}$/;

// microtask/rAF queue
const settle = () => sleep(200);

const setCount = (value) =>
	page.$eval('.dt-uuid-settings input[type=number]', (el, v) => {
		el.value = v;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, String(value));

const clickBarButton = (label) =>
	page.$$eval('.dt-uuid-btn', (els, l) =>
		els.find((el) => el.textContent.includes(l))?.click(),
		label,
	);

const clickKind = (label) =>
	page.$$eval('.dt-uuid-kind', (els, l) =>
		els.find((el) => el.textContent.trim() === l)?.click(),
		label,
	);

let batch = await rows();
check(
	'v4 by default: 10 canonical ids',
	batch.length === 10 && batch.every((id) => V4.test(id)),
	`${batch.length} rows`,
);

const readout = await page.$eval('.dt-uuid-meta', (el) =>
	el.textContent.replace(/\s+/g, ' ').trim(),
);
check(
	'the bar readout shows the batch size',
	readout === '10 generated',
	readout,
);

await setCount(500);
await settle();
batch = await rows();
check('count clamps at 100', batch.length === 100, `${batch.length} rows`);

await setCount(5);
await settle();
batch = await rows();
check('count shrinks the batch', batch.length === 5, `${batch.length} rows`);

const before = batch;
await page.click('[aria-label="Uppercase"]');
await settle();
let now = await rows();
check(
	'uppercase reformats the same ids',
	now.every((id, i) => id === before[i].toUpperCase()),
	now[0],
);

await page.click('[aria-label="Strip hyphens"]');
await settle();
now = await rows();
check(
	'strip hyphens reformats the same ids',
	now.every(
		(id, i) => id === before[i].replaceAll('-', '').toUpperCase(),
	),
	now[0],
);
await page.click('[aria-label="Uppercase"]');
await page.click('[aria-label="Strip hyphens"]');
await settle();

const t0 = Date.now();
await clickKind('UUID v7');
const t1 = Date.now();
await settle();
batch = await rows();
const stamps = batch.map((id) =>
	parseInt(id.replaceAll('-', '').slice(0, 12), 16),
);
check(
	'v7 ids carry version 7 and variant 10',
	batch.every(
		(id) =>
			id[14] === '7' && /[89ab]/.test(id.replaceAll('-', '')[16]),
	),
	batch[0],
);
check(
	'v7 ids embed the time they were made',
	stamps.every((ts) => ts >= t0 - 1000 && ts <= t1 + 1000),
	`${stamps[0]} ∈ [${t0 - 1000}, ${t1 + 1000}]`,
);
check(
	'v7 ids come out in creation order',
	stamps.every((ts, i) => i === 0 || ts >= stamps[i - 1]),
	stamps.join(','),
);

await clickKind('Nano ID');
await settle();
batch = await rows();
check(
	'nano ids are 21 url-safe chars',
	batch.length === 5 && batch.every((id) => NANO.test(id)),
	batch[0],
);
const optionCells = await page.evaluate(() => ({
	upper: !!document.querySelector('[aria-label="Uppercase"]'),
	hyphens: !!document.querySelector('[aria-label="Strip hyphens"]'),
}));
check(
	'uuid-only options hide for nano ids',
	!optionCells.upper && !optionCells.hyphens,
);

await page.click('.dt-uuid-row .dt-uuid-copy');
check(
	'copying one marks its row',
	await page
		.waitForSelector('.dt-uuid-copy.is-copied', { timeout: 2000 })
		.then(() => true)
		.catch(() => false),
);
await sleep(1600);
check(
	'the copied mark clears',
	(await page.$('.dt-uuid-copy.is-copied')) === null,
);

await clickBarButton('Copy all');
check(
	'copy all marks the bar button',
	await page
		.waitForSelector('.dt-uuid-btn.is-copied', {
			timeout: 2000,
		})
		.then(() => true)
		.catch(() => false),
);
await sleep(1600);

const stale = batch;
await clickBarButton('Regenerate');
await settle();
batch = await rows();
check(
	'regenerate replaces the batch',
	batch.length === 5 && batch.every((id) => !stale.includes(id)),
);

await finish(browser);
