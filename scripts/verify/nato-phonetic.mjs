// Spells "Hi 5" in two tables, reads "tango echo" back through Auto, and
// copies the result. Clipboard reads need the permission override below.
//
// Usage: npm start, then node scripts/verify/nato-phonetic.mjs

import {
	launch,
	visit,
	check,
	finish,
	sleep,
	BASE,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

await visit(page, '/tools/nato-phonetic');
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
await captureObjectUrl(page);

const pairs = () =>
	page.$$eval('.dt-nato-pair', (els) =>
		els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
	);
const clickLabel = async (label) => {
	await page.$$eval(
		'.dt-nato-seg',
		(els, label) => els.find((el) => el.textContent.trim() === label).click(),
		label,
	);
	await sleep(100);
};
const setInput = async (text) => {
	await page.$eval('.dt-nato-input', (el) => el.select());
	await page.keyboard.press('Backspace');
	await page.type('.dt-nato-input', text);
	await sleep(100);
};

check('three alphabets', (await page.$$('.dt-nato-alphabets .dt-nato-seg')).length === 3);

await setInput('Hi 5');
let got = await pairs();
check(
	'Hi 5 spells H Hotel, i India, 5 Five',
	got.join(', ') === 'H Hotel, i India, 5 Five',
	got.join(', '),
);
check(
	'the space is a word break',
	(await page.$$('.dt-nato-break')).length === 1,
);

await clickLabel('DIN 5009');
got = await pairs();
check(
	'DIN 5009 spells Hamburg Ingelheim Fünf',
	got.join(', ') === 'H Hamburg, i Ingelheim, 5 Fünf',
	got.join(', '),
);

await clickLabel('German (1996)');
got = await pairs();
check(
	'German (1996) spells Heinrich Ida Fünf',
	got.join(', ') === 'H Heinrich, i Ida, 5 Fünf',
	got.join(', '),
);

await clickLabel('NATO');
await setInput('tango echo');
const read = await page.$eval('.dt-nato-read', (el) => el.textContent.trim());
check('Auto reads tango echo as TE', read === 'TE', read);

await clickLabel('Spell');
got = await pairs();
check(
	'Spell forces the spelled view',
	got.length === 9 && got[0] === 't Tango',
	got.join(', '),
);
await clickLabel('Auto');

await page.click('.dt-nato-copy');
await sleep(150);
const copyLabel = await page.$eval('.dt-nato-copy', (el) => el.textContent.trim());
check('Copy shows Copied', copyLabel === 'Copied', copyLabel);
check(
	'and lands TE on the clipboard',
	(await page.evaluate(() => navigator.clipboard.readText())) === 'TE',
);

await page.click('.dt-nato-download');
await sleep(150);
const saved = await page.evaluate(() => window.__result?.text());
check('Download saves the read text', saved === 'TE', String(saved));

await finish(browser);
