// needs npm start first

import { launch, visit, check, sleep, finish } from './harness.mjs';

// node strips .ts types
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
// cdp select-all fails headless
const typeSearch = async (text) => {
	await page.$eval('.dt-http-search-input', (el) => {
		el.value = '';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.type('.dt-http-search-input', text);
	await sleep(250);
};

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
		HTTP_STATUSES.length * 2, // total plus per-class doubles
);

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

await page.$$eval('.dt-http-row .dt-http-tint', (els) =>
	els.find((el) => el.classList.contains('is-2xx'))?.click(),
);
await sleep(200);
check(
	'the row tint chip filters to its class',
	(await rowCount()) === rowsFor('', 2),
);
await clickFilter('All');

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
