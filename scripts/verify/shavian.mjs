// The transliterator glosses in two tiers: a 7,500-word core imported with the
// tool, then the 125k-entry CMU dictionary fetched from public/data. When the
// second tier does not arrive, every word past the core is spelled out by a
// letter-by-letter heuristic — "vigilant" becomes v-ɪ-g-ɪ-l-æ-n-t instead of
// /ˈvɪdʒələnt/ — and the tool still renders a full, plausible-looking gloss.
//
// That is exactly what shipped: the 5.4 MB asset was left behind in the port
// and no gate noticed, because nothing imports it and fetch resolves on 404.
// This rig drives the default sentence, whose words sit on both sides of the
// core boundary, and fails if any of them is a guess.
//
// Usage: npm start, then node scripts/verify/shavian.mjs

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

// "vigilant" is outside the core, so its gloss is proof the fetched tier is
// the one answering: the heuristic has no way to reach dʒ from the letter g.
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
