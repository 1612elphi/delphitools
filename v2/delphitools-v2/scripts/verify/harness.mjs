// Shared plumbing for the behavioural rigs in this directory.
//
// Each rig drives the dev server in headless Chrome and asserts on the DOM,
// covering what ember-qunit does not: chrome that only exists once the whole
// app is booted, and tool behaviour that depends on layout. Same contract as
// the parent repo's scripts/verify — every rig prints ALL PASS or FAILURES and
// exits non-zero on failure, so they compose in a shell loop.
//
// Usage: start `npm start`, then `node scripts/verify/<rig>.mjs`.

import puppeteer from 'puppeteer-core';

export const CHROME =
	process.env.CHROME_PATH ??
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let checks = 0;

/** One assertion. `detail` is printed either way, so a pass is still readable. */
export function check(label, ok, detail = '') {
	checks += 1;
	if (!ok) failures += 1;
	const tail = detail ? ` — ${detail}` : '';
	console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${tail}`);
}

export function fail(label, detail) {
	check(label, false, detail);
}

/**
 * A page with console errors and uncaught exceptions already wired into the
 * tally — a rig that forgets to look still fails when the app throws.
 * `ignore` takes regexes for noise a rig genuinely expects.
 */
export async function launch({
	viewport = { width: 1400, height: 1000 },
	ignore = [],
} = {}) {
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: 'new',
	});
	const page = await browser.newPage();
	await page.setViewport(viewport);

	const heard = (text) => ignore.some((re) => re.test(text));
	page.on('pageerror', (e) => {
		if (!heard(e.message)) fail('uncaught exception', e.message);
	});
	page.on('console', (m) => {
		if (m.type() === 'error' && !heard(m.text()))
			fail('console error', m.text());
	});

	return { browser, page };
}

/** Navigate and wait for the app to have rendered something. */
export async function visit(page, path) {
	await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
	await page.waitForSelector('.dt-main', { timeout: 15000 });
	await sleep(300);
}

export async function finish(browser) {
	await browser?.close();
	if (failures) {
		console.log(`\nFAILURES: ${failures} of ${checks}`);
		// Not process.exit: closing the browser is the last thing a rig does,
		// so letting node drain leaves nothing to cut short.
		process.exitCode = 1;
		return;
	}
	console.log(`\nALL PASS (${checks})`);
}
