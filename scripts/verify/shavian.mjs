// two-tier gloss: 7.5k core then 125k cmu fetched from public/data
// missing tier falls back to letter-by-letter heuristic silently
// 5.4mb asset was dropped in port, fetch resolves on 404 so no gate noticed

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

await visit(page, '/tools/shavian-transliterator');

const settled = await page
	.waitForFunction(
		() =>
			!!document.querySelector(
				'.dt-shav-status.is-ready, .dt-shav-status.is-degraded',
			),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
await sleep(300);

const gloss = await page.evaluate(() => {
	const status = document.querySelector('.dt-shav-status');
	return {
		degraded: !!document.querySelector(
			'.dt-shav-status.is-degraded',
		),
		status: status?.textContent?.replace(/\s+/g, ' ').trim(),
		words: [...document.querySelectorAll('.dt-shav-word')].map(
			(word) => ({
				latin: word
					.querySelector('.dt-shav-latin')
					?.textContent?.trim(),
				heuristic: !!word.querySelector(
					'.is-heuristic',
				),
			}),
		),
	};
});

check(
	'the full dictionary loads',
	settled && !gloss.degraded,
	gloss.status ?? 'no status shown',
);

const guessed = gloss.words.filter((word) => word.heuristic);
check(
	'and every word of the default sentence comes from it',
	gloss.words.length > 0 && guessed.length === 0,
	guessed.length
		? `guessed: ${guessed.map((w) => w.latin).join(' ')}`
		: `${gloss.words.length} words, none guessed`,
);

// "vigilant" is outside 7.5k core; heuristic can't reach dʒ from g
const vigilant = await page.evaluate(() => {
	const word = [...document.querySelectorAll('.dt-shav-word')].find(
		(w) =>
			w
				.querySelector('.dt-shav-latin')
				?.textContent?.trim() === 'vigilant',
	);
	return word?.textContent?.replace(/\s+/g, ' ').trim();
});
check(
	'a word only the fetched tier knows is glossed from it',
	!!vigilant && vigilant.includes('dʒ'),
	vigilant ?? 'word not found',
);

await finish(browser);
