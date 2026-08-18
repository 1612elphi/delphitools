// Password Generator behavioural rig.
//
// Drives /tools/password-genny in headless Chrome: both modes, the
// character-class guarantee, the lookalike exclusion (deterministic in
// digits-only mode), the list/copy flow, and the wordlist failure path
// (the fetch is failed by request interception, then Retried for real).
//
// The clipboard checks need explicit permissions; headless Chrome grants
// them to localhost once overridden below.
//
// Usage: npm start, then node scripts/verify/password-genny.mjs

import { launch, visit, check, finish, sleep, BASE } from './harness.mjs';
import {
	buildCharset,
	passphraseEntropy,
	passwordEntropy,
} from '../../app/lib/password.ts';

const DEFAULT_POOL = buildCharset({
	length: 16,
	lowercase: true,
	uppercase: true,
	digits: true,
	symbols: true,
	excludeAmbiguous: true,
});

const { browser, page } = await launch({
	ignore: [
		/password-genny: wordlist fetch failed/,
		// the rig itself answers the first fetch with a 500
		/Failed to load resource: the server responded with a status of 500/,
	],
});
const context = browser.defaultBrowserContext();
await context.overridePermissions(BASE, [
	'clipboard-read',
	'clipboard-write',
	'clipboard-sanitized-write',
]);

await visit(page, '/tools/password-genny');

const rows = () => page.$$eval('.dt-pg-value', (els) => els.map((e) => e.textContent));
const strength = () => page.$eval('.dt-pg-strength', (el) => el.textContent);

check(
	'route renders the tool, not the placeholder',
	!(await page.$('.dt-tool-soon')),
);
check(
	'header names the tool',
	(await page.$eval('.dt-tool-header h1', (el) => el.textContent)) ===
		'Password Generator',
);

// ── Password mode defaults ────────────────────────────────────────────────

const firstRows = await rows();
check('a batch renders on load', firstRows.length === 10, `${firstRows.length} rows`);
check(
	'every row is the default length 16, from the default pool',
	firstRows.every(
		(row) =>
			row.length === 16 && [...row].every((c) => DEFAULT_POOL.includes(c)),
	),
);
check(
	'no lookalikes in the default batch',
	firstRows.every((row) => !/[Il1O0]/.test(row)),
);
check(
	'strength readout quantifies the default pool',
	(await strength()).includes(
		`${passwordEntropy(16, DEFAULT_POOL.length).toFixed(1)} bits`,
	) && (await strength()).includes('Very strong'),
);

// ── Length slider ─────────────────────────────────────────────────────────

await page.evaluate(() => {
	const slider = document.querySelector(
		'.dt-pg-field.is-length input[type="range"]',
	);
	slider.value = '32';
	slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.dt-pg-value')].every(
			(el) => el.textContent.length === 32,
		),
	{ timeout: 5000 },
);
check('length slider resizes every row', true, 'all rows at 32');

// ── Class toggles and the at-least-one guarantee ──────────────────────────

await page.click('[role="switch"][aria-label="Lowercase"]');
await page.click('[role="switch"][aria-label="Uppercase"]');
await page.click('[role="switch"][aria-label="Symbols"]');
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.dt-pg-value')].every((el) =>
			/^[2-9]+$/.test(el.textContent),
		),
	{ timeout: 5000 },
);
check(
	'digits-only output excludes 0 and 1 while the toggle is on',
	true,
);

await page.click('[role="switch"][aria-label="Digits"]');
await sleep(150);
check(
	'the last active class refuses to switch off',
	await page.$eval(
		'[role="switch"][aria-label="Digits"]',
		(el) => el.getAttribute('aria-checked') === 'true',
	),
);
check(
	'…and the batch is still digits',
	(await rows()).every((row) => /^[2-9]+$/.test(row)),
);
check(
	'every rendered character is a digit-marked span',
	await page.$$eval('.dt-pg-value', (values) =>
		values.every(
			(value) =>
				value.children.length > 0 &&
				[...value.children].every(
					(span) => span.className === 'dt-pg-ch is-digit',
				),
		),
	),
);

await page.click('[role="switch"][aria-label="Lowercase"]');
await page.click('[role="switch"][aria-label="Uppercase"]');
await page.click('[role="switch"][aria-label="Symbols"]');
await page.click('[role="switch"][aria-label="No lookalikes"]');
await page.waitForFunction(
	(expected) =>
		document.querySelector('.dt-pg-strength')?.textContent.includes(
			expected,
		),
	{ timeout: 5000 },
	`${passwordEntropy(32, 89).toFixed(1)} bits`,
);
check(
	'turning exclusion off re-adds the five lookalikes exactly',
	true,
	'pool 84 → 89 in the readout',
);

// ── Bulk list + clipboard ─────────────────────────────────────────────────

await page.click('.dt-pg-countbtn:nth-child(3)');
await page.waitForFunction(
	(n) => document.querySelectorAll('.dt-pg-value').length === n,
	{ timeout: 5000 },
	20,
);
check('bulk count 20 renders 20 rows', true);
check(
	'character spans rebuild the rendered string exactly',
	await page.$$eval('.dt-pg-value', (values) =>
		values.every(
			(value) =>
				[...value.children]
					.map((span) => span.textContent)
					.join('') === value.textContent,
		),
	),
);
check(
	'letters, digits and symbols take three different colours',
	await page.$$eval('.dt-pg-ch', (spans) => {
		const colour = (cls) =>
			getComputedStyle(
				spans.find((span) => span.className === cls) ??
					document.createElement('span'),
			).color;
		const letter = colour('dt-pg-ch');
		const digit = colour('dt-pg-ch is-digit');
		const symbol = colour('dt-pg-ch is-symbol');
		return (
			letter !== digit && digit !== symbol && symbol !== letter
		);
	}),
);

await page.click('.dt-pg-copyall');
await sleep(150);
const allClip = await page.evaluate(() => navigator.clipboard.readText());
check(
	'copy all lands the whole batch on the clipboard',
	allClip === (await rows()).join('\n'),
	`${allClip.split('\n').length} lines`,
);

await page.click('.dt-pg-item .dt-pg-itemcopy');
await sleep(150);
check(
	'row copy lands that row on the clipboard',
	(await page.evaluate(() => navigator.clipboard.readText())) ===
		(await rows())[0],
);

// ── Passphrase mode ───────────────────────────────────────────────────────
// The wordlist is fetched lazily on first passphrase entry and cached for the
// session, so the failure path has to run on the FIRST entry: intercept, fail
// the fetch, then retry for real.

await page.setRequestInterception(true);
let failWordlist = true;
page.on('request', (request) => {
	if (failWordlist && request.url().endsWith('/data/eff-large-wordlist.txt')) {
		request.respond({ status: 500, body: 'rig-induced failure' });
	} else {
		request.continue();
	}
});

await page.click('.dt-pg-mode:nth-child(2)');
await page.waitForFunction(
	() => document.querySelector('.dt-pg-worderror') !== null,
	{ timeout: 5000 },
);
check('a failed fetch surfaces the per-field error', true);
check(
	'Generate is disabled while the wordlist is missing',
	await page.$eval('.dt-pg-generate', (btn) => btn.disabled),
);

failWordlist = false;
await page.click('.dt-pg-retry');
await page.waitForFunction(
	() => document.querySelectorAll('.dt-pg-value').length > 0,
	{ timeout: 10000 },
);
check('Retry recovers and the batch renders', true);
await page.waitForFunction(
	() =>
		document.querySelectorAll('.dt-pg-value').length > 0 &&
		[...document.querySelectorAll('.dt-pg-value')].every((el) =>
			/^[A-Z][a-z]+(-[a-z]+){4}[0-9]$/.test(el.textContent),
		),
	{ timeout: 10000 },
);
check(
	'passphrase mode builds 5 hyphenated words, first capitalised, trailing digit',
	true,
);

const wordsAreReal = await (async () => {
	const list = await page.evaluate(async () => {
		const text = await fetch('/data/eff-large-wordlist.txt').then((r) =>
			r.text(),
		);
		return [...new Set(text.split('\n').map((line) => line.split(/\s+/).pop()))];
	});
	const row = (await rows())[0];
	const words = row.split('-');
	words[0] = words[0].toLowerCase();
	words[words.length - 1] = words[words.length - 1].replace(/[0-9]$/, '');
	return words.every((w) => list.includes(w));
})();
check('every word comes from the EFF list', wordsAreReal);

check(
	'passphrase strength counts words and the digit',
	(await strength()).includes(
		`${passphraseEntropy(5, 7776, true).toFixed(1)} bits`,
	) && (await strength()).includes('Strong'),
);

await page.evaluate(() => {
	const slider = document.querySelector(
		'.dt-pg-field.is-length input[type="range"]',
	);
	slider.value = '8';
	slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.dt-pg-value')].every(
			(el) => el.textContent.split('-').length === 8,
		),
	{ timeout: 5000 },
);
check('word slider drives the word count', true, '8 words per row');

await page.click('.dt-pg-sep[aria-label="Period"]');
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.dt-pg-value')].every(
			(el) => el.textContent.split('.').length === 8,
		),
	{ timeout: 5000 },
);
	check('separator picker applies', true, 'periods, still 8 words');

await finish(browser);
