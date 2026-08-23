// Drives the Morse Code tool: encode, auto-detect decode, the direction
// override, WebAudio playback ending by itself, and the copy button.
//
// Usage: npm start, then node scripts/verify/morse-code.mjs

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

await visit(page, '/tools/morse-code');

const output = () =>
	page.$eval('.dt-morse-output', (el) => el.textContent.trim());

const setInput = async (text) => {
	await page.$eval('.dt-morse-input', (el) => {
		el.focus();
		el.select();
	});
	await page.keyboard.press('Backspace');
	await page.type('.dt-morse-input', text);
	await sleep(50);
};

await setInput('SOS');
check('SOS encodes', (await output()) === '... --- ...', await output());

await setInput('... --- ...');
check('Auto decodes Morse', (await output()) === 'SOS', await output());

await page.evaluate(() =>
	[...document.querySelectorAll('.dt-morse-dir')]
		.find((b) => b.textContent.trim() === 'Encode')
		.click(),
);
await sleep(50);
check(
	'Encode overrides Auto',
	(await output()) !== 'SOS' && (await output()).startsWith('.-.-.-'),
	await output(),
);
check(
	'Encode is marked active',
	await page.$eval('.dt-morse-dir.is-active', (el) =>
		el.textContent.trim(),
	) === 'Encode',
);

await setInput('HELLO WORLD');
check(
	'HELLO WORLD encodes',
	(await output()) ===
		'.... . .-.. .-.. --- / .-- --- .-. .-.. -..',
	await output(),
);

const playButton = '.dt-morse-bar button:nth-of-type(1)';
await page.click(playButton);
const playing = await page
	.waitForSelector(`${playButton}.is-playing`, { timeout: 2000 })
	.then(() => true)
	.catch(() => false);
check('Play marks the button is-playing', playing);
if (playing) {
	const ended = await page
		.waitForSelector(`${playButton}:not(.is-playing)`, {
			timeout: 15000,
		})
		.then(() => true)
		.catch(() => false);
	check('playback ends by itself', ended);
}

await page.click('.dt-morse-btn.is-primary');
await sleep(50);
check(
	'Copy reads Copied',
	await page.$eval('.dt-morse-btn.is-primary', (el) =>
		el.textContent.trim(),
	) === 'Copied',
);
check(
	'the clipboard holds the output',
	(await page.evaluate(() => navigator.clipboard.readText())) ===
		(await output()),
);

check(
	'Download is enabled with output',
	await page.$eval(
		'.dt-morse-bar button:nth-of-type(2)',
		(el) => !el.disabled,
	),
);

await finish(browser);
