// palette-genny's ?colors= share link, as the Next app minted them.
//
// Links are already in the wild, so the parse has to keep accepting both the
// escaped-# and bare-hex spellings, and a link that has been truncated or
// mangled has to fall back to a fresh palette rather than a one-swatch stub.

import { launch, visit, check, sleep, finish } from './harness.mjs';

const DEFAULT_COUNT = 5;

// expect: the hexes the link must produce, or null for "fall back to a random
// palette", which is every case where fewer than two hexes survive the parse.
const CASES = [
	{
		label: 'escaped #',
		query: '?colors=%231a2744,%232c4a7c,%23c9a227',
		expect: ['#1a2744', '#2c4a7c', '#c9a227'],
	},
	{
		label: 'bare hex',
		query: '?colors=1a2744,2c4a7c,c9a227,f4e4ba',
		expect: ['#1a2744', '#2c4a7c', '#c9a227', '#f4e4ba'],
	},
	{ label: 'single colour', query: '?colors=1a2744', expect: null },
	{ label: 'junk', query: '?colors=notahex,zzz', expect: null },
	{ label: 'no param', query: '', expect: null },
];

// One browser per case: a share link is only ever the first thing a visitor
// loads, so each has to be read on a cold start rather than a client transition.
for (const { label, query, expect } of CASES) {
	const { browser, page } = await launch();
	await visit(page, `/tools/palette-genny${query}`);
	await sleep(600);

	const swatches = await page.$$eval('.dt-swatch-value', (els) =>
		els.map((el) => el.textContent.trim().toLowerCase()),
	);

	if (expect) {
		check(
			`${label}: the link sets the palette`,
			swatches.join() === expect.join(),
			swatches.join(' '),
		);
	} else {
		check(
			`${label}: falls back to a full palette`,
			swatches.length === DEFAULT_COUNT,
			`${swatches.length} swatches: ${swatches.join(' ')}`,
		);
		check(
			`${label}: and the fallback is real colours`,
			swatches.every((hex) => /^#[\da-f]{6}$/.test(hex)),
			swatches.join(' '),
		);
	}

	check(
		`${label}: the list matches the swatches`,
		(await page.$$eval('.dt-colour-row', (els) => els.length)) ===
			swatches.length,
	);
	check(
		`${label}: the stepper agrees`,
		(await page.$eval('.dt-count > span', (el) =>
			el.textContent.trim(),
		)) === `${swatches.length}`,
	);

	await browser.close();
}

await finish();
