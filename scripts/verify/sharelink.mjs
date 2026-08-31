// share link parser for ?colors= param
// must accept escaped-# and bare-hex, fall back on truncation

import { launch, visit, check, sleep, finish } from './harness.mjs';

const DEFAULT_COUNT = 5;

// expect: hexes, or null = fall back to random palette (<2 survive parse)
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

// cold start per case, links are first-visit only
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

// in-app: the collection card must carry ?colors= through the transition
{
	const { browser, page } = await launch();
	await visit(page, '/tools/palette-collection');

	const strip = await page.$$eval(
		'.dt-collection-cell:first-child .dt-collection-swatch',
		(els) =>
			els.map((el) =>
				(el.getAttribute('style') ?? '')
					.replace('background-color:', '')
					.trim()
					.toLowerCase(),
			),
	);

	await page.click('.dt-collection-card');
	await sleep(800);

	check(
		'the collection card keeps colors in the url',
		new URL(page.url()).searchParams.has('colors'),
		page.url(),
	);

	const swatches = await page.$$eval('.dt-swatch-value', (els) =>
		els.map((el) => el.textContent.trim().toLowerCase()),
	);
	check(
		'and the generator opens on that palette',
		swatches.join() === strip.join(),
		`${swatches.join(' ')} vs ${strip.join(' ')}`,
	);

	await browser.close();
}

await finish();
