// braille-converter behavioural rig
// headless chrome grants clipboard after overridePermissions below
//
// Usage: npm start, then node scripts/verify/braille-converter.mjs

import {
	launch,
	visit,
	check,
	finish,
	sleep,
	captureObjectUrl,
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

await visit(page, '/tools/braille-converter');

const output = () => page.$eval('.dt-brl-output', (el) => el.textContent);
const clear = () =>
	page.$eval('.dt-brl-input', (el) => {
		el.value = '';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
const clickMode = (label) =>
	page.$$eval(
		'.dt-brl-mode',
		(buttons, text) => buttons.find((b) => b.textContent.trim() === text)?.click(),
		label,
	);

await page.type('.dt-brl-input', 'Hello 42');
await sleep(100);
check(
	'text becomes cells with capital and numeric indicators',
	(await output()) === '⠠⠓⠑⠇⠇⠕ ⠼⠙⠃',
	await output(),
);
check(
	'the first cell is titled with its dot numbers',
	(await page.$eval('.dt-brl-cell', (el) => el.title)) === '6',
);
check(
	'the space is not wrapped as a cell',
	(await page.$$eval('.dt-brl-cell', (els) => els.length)) === 9,
);

await clear();
await page.type('.dt-brl-input', '⠠⠓⠑⠇⠇⠕');
await sleep(100);
check('Auto reads cells back to text', (await output()) === 'Hello', await output());
check(
	'and the output pane drops the braille sizing',
	!!(await page.$('.dt-brl-output.is-text')),
);

await clickMode('To braille');
await clear();
await page.type('.dt-brl-input', 'NASA');
await sleep(100);
check(
	'To braille is the active segment',
	(await page.$eval('.dt-brl-mode.is-active', (el) => el.textContent.trim())) ===
		'To braille',
);
check(
	'an all-caps word takes the caps-word indicator',
	(await output()) === '⠠⠠⠝⠁⠎⠁',
	await output(),
);

await page.click('.dt-brl-copy');
await sleep(100);
check(
	'Copy reports Copied',
	(await page.$eval('.dt-brl-copy', (el) => el.textContent.trim())) === 'Copied',
);
check(
	'and the cells land on the clipboard',
	(await page.evaluate(() => navigator.clipboard.readText())) === '⠠⠠⠝⠁⠎⠁',
);

await captureObjectUrl(page);
await page.click('.dt-brl-download');
await sleep(200);
check(
	'Download saves the cells as text',
	(await page.evaluate(() => window.__result?.text())) === '⠠⠠⠝⠁⠎⠁',
);

await finish(browser);
