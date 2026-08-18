// http-status: the reference browser end-to-end.
//
// The unit tests pin the table and the filter; what they cannot cover is the
// component wiring: live search, class filters, row expansion, click-to-copy
// and the spec link rendering. This rig drives a real page for those.
//
// Usage: start `npm start`, then `node scripts/verify/http-status.mjs`.

import { launch, visit, check, sleep, finish } from './harness.mjs';

// Counted from the data rather than pinned, so adding a code does not fail
// this rig. Node strips the types, the same trick palette.mjs uses.
const { HTTP_STATUSES, filterStatuses, lookupStatus } = await import(
	'../../app/lib/http-status.ts'
);

const { browser, page } = await launch();
await visit(page, '/tools/http-status');

const rowCount = () => page.$$eval('.dt-http-code', (els) => els.length);
const visibleCodes = () =>
	page.$$eval('.dt-http-code', (els) =>
		els.map((el) => el.textContent.trim()),
	);
const rowsFor = (search, cls) =>
	filterStatuses(search, cls).reduce(
		(sum, group) => sum + group.items.length,
		0,
	);
const clickFilter = async (label) => {
	await page.$$eval('.dt-http-filter', (els, text) => {
		els.find((el) => el.textContent.trim().startsWith(text))?.click();
	}, label);
	await sleep(200);
};
// Meta/Control+A does not reach the field through CDP in headless Chrome, so
// clearing happens through a real input event — that is also what Glimmer's
// {{on "input"}} listens for.
const typeSearch = async (text) => {
	await page.$eval('.dt-http-search-input', (el) => {
		el.value = '';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.type('.dt-http-search-input', text);
	await sleep(250);
};

// ── default render ──────────────────────────────────────────────────────────

check(
	'the page is the http-status tool',
	(await page.$eval('.dt-tool-header h1', (el) =>
		el.textContent.trim(),
	)) === 'HTTP Status',
);

check(
	'one row per table entry',
	(await rowCount()) === HTTP_STATUSES.length,
	`${await rowCount()} of ${HTTP_STATUSES.length}`,
);

check(
	'All plus the five class filters',
	(await page.$$eval('.dt-http-filter', (els) => els.length)) === 6,
);

check(
	'filter counts match the table',
	(
		await page.$$eval('.dt-http-filter-count', (els) =>
			els.map((el) => Number(el.textContent.trim())),
		)
	).reduce((a, b) => a + b, 0) ===
		HTTP_STATUSES.length * 2, // total + per-class sums to double
);

// ── class filter ────────────────────────────────────────────────────────────

await clickFilter('5xx');
check(
	'5xx narrow the list to server errors',
	(await rowCount()) === rowsFor('', 5),
	`${await rowCount()} of ${rowsFor('', 5)}`,
);
check(
	'and nothing outside 5xx survives',
	(await visibleCodes()).every((code) => code.startsWith('5')),
);

await clickFilter('All');
check('All restores the table', (await rowCount()) === HTTP_STATUSES.length);

// Chip tap does the same as the strip: click a row's 2xx tint chip.
await page.$$eval('.dt-http-row .dt-http-tint', (els) =>
	els.find((el) => el.classList.contains('is-2xx'))?.click(),
);
await sleep(200);
check(
	'the row tint chip filters to its class',
	(await rowCount()) === rowsFor('', 2),
);
await clickFilter('All');

// ── search ──────────────────────────────────────────────────────────────────

await typeSearch('418');
check(
	'code search finds exactly the teapot',
	(await visibleCodes()).join() === '418',
);
check(
	'with its registered phrase',
	(
		await page.$eval('.dt-http-phrase', (el) => el.textContent.trim())
	).includes('Teapot'),
);

await typeSearch('unauthorized');
check(
	'phrase search is case-insensitive',
	(await visibleCodes()).join() === '401',
);

await typeSearch('zzz-no-such-code');
check(
	'a miss shows the empty state',
	await page.$('.dt-http-empty'),
);

await page.click('.dt-http-clear');
await sleep(200);
check('Clear restores the table', (await rowCount()) === HTTP_STATUSES.length);

// ── detail + copy ───────────────────────────────────────────────────────────

await page.$$eval('.dt-http-code', (els) => {
	els.find((el) => el.textContent.trim() === '200')
		?.closest('.dt-http-row')
		?.querySelector('.dt-http-row-expand')
		?.click();
});
await sleep(200);
check(
	'expanding a row shows its reference',
	(await page.$eval('.dt-http-ref', (el) => el.textContent.trim())) ===
		(lookupStatus(200)?.ref ?? 'no detail rendered'),
);

const expected200 = lookupStatus(200);
const href = await page.$eval('.dt-http-ref', (el) => el.getAttribute('href'));
check(
	'the reference links to the spec section',
	href === expected200?.url,
	href ?? 'no href',
);
check(
	'200 reads cacheable, from the table',
	(await page.$eval('.dt-http-cacheable', (el) =>
		el.textContent.trim(),
	)) === (expected200?.cacheable ? 'Yes' : 'No'),
);

await page.$$eval('.dt-http-code', (els) =>
	els.find((el) => el.textContent.trim() === '404')?.click(),
);
await sleep(100);
check(
	'clicking a code arms the copied state',
	await page.$$eval('.dt-http-code', (els) =>
		els.some(
			(el) =>
				el.classList.contains('dt-http-code') &&
				el.querySelector('.dt-icon'),
		),
	),
);

await finish(browser);
