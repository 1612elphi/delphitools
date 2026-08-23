// The transcriber reads the same two dictionary tiers as the Shavian tool, so
// the same failure applies: a missing full tier leaves every word past the
// core to the letter-by-letter heuristic while the page still looks right.
// "vigilant" is outside the core and the heuristic cannot reach dʒ from a g,
// so its transcription proves the fetched tier answers.
//
// Usage: npm start, then node scripts/verify/ipa-transcriber.mjs
// SHOT=path.png also saves a full-page screenshot.

import {
	launch,
	visit,
	check,
	finish,
	sleep,
	BASE,
} from './harness.mjs';

const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

await visit(page, '/tools/ipa-transcriber');

const ready = await page
	.waitForFunction(
		() => !!document.querySelector('.dt-ipa-status.is-ready'),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
await sleep(300);

const readOutput = () =>
	page.evaluate(() => ({
		text: document.querySelector('.dt-ipa-text')?.textContent ?? '',
		words: [...document.querySelectorAll('.dt-ipa-word')].map((w) => ({
			title: w.getAttribute('title'),
			ipa: w.textContent,
			guess: w.classList.contains('is-guess'),
		})),
	}));

check(
	'the full dictionary loads',
	ready,
	await page.evaluate(
		() => document.querySelector('.dt-ipa-status')?.textContent?.trim(),
	),
);

let out = await readOutput();
check(
	'the transcription sits between slashes',
	out.text.startsWith('/') && out.text.endsWith('/'),
	out.text,
);

const vigilant = out.words.find((w) => w.title === 'vigilant');
check(
	'a word only the fetched tier knows is transcribed from it',
	!!vigilant && vigilant.ipa.includes('dʒ'),
	vigilant?.ipa ?? 'word not found',
);

const guessed = out.words.filter((w) => w.guess);
check(
	'no word of the default sentence is a guess',
	out.words.length === 6 && guessed.length === 0,
	guessed.length
		? `guessed: ${guessed.map((w) => w.title).join(' ')}`
		: `${out.words.length} words`,
);

await page.evaluate(() => {
	const input = document.querySelector('.dt-ipa-input');
	input.value = 'hello blorptastic';
	input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
out = await readOutput();
const nonsense = out.words.find((w) => w.title === 'blorptastic');
check(
	'a nonsense word is flagged as a guess',
	!!nonsense && nonsense.guess && nonsense.ipa.length > 0,
	nonsense?.ipa ?? 'word not found',
);
check(
	'and the known word beside it is not',
	out.words.some((w) => w.title === 'hello' && !w.guess),
	out.text,
);

await page.click('.dt-ipa-copy');
await sleep(200);
check(
	'Copy reports Copied',
	await page.evaluate(
		() => document.querySelector('.dt-ipa-copy')?.textContent?.trim(),
	).then((t) => t === 'Copied'),
);
const clipboard = await page.evaluate(() => navigator.clipboard.readText());
check(
	'and the clipboard holds the slashed transcription',
	clipboard === out.text,
	clipboard,
);

if (process.env.SHOT)
	await page.screenshot({ path: process.env.SHOT, fullPage: true });

await finish(browser);
