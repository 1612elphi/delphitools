// seam-seal: stroke=fill, 0.5 wide

import {
	launch,
	visit,
	check,
	finish,
	sleep,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();

await visit(page, '/tools/qr-genny');
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

await page.type('.dt-qr-textarea', 'https://delphi.tools');
await page.waitForFunction(
	() => !document.querySelector('.dt-qr-export.is-primary')?.disabled,
	{ timeout: 15000 },
);
await sleep(300);

await captureObjectUrl(page);
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-qr-export')]
		.find((b) => b.textContent.trim() === 'SVG')
		.click(),
);
await page.waitForFunction(() => window.__result, { timeout: 10000 });

const result = await page.evaluate(async () => {
	const text = await window.__result.text();
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	const filled = [...doc.querySelectorAll('[fill]')].filter(
		(el) => el.getAttribute('fill') !== 'none',
	);
	const sealed = filled.filter(
		(el) =>
			el.getAttribute('stroke') === el.getAttribute('fill') &&
			el.getAttribute('stroke-width') === '0.5',
	);
	return {
		type: window.__result.type,
		parses: !doc.querySelector('parsererror'),
		filled: filled.length,
		sealed: sealed.length,
	};
});

check('export is SVG', result.type === 'image/svg+xml', result.type);
check('and still parses', result.parses);
check('it has filled shapes', result.filled > 0, String(result.filled));
check(
	'every filled shape is sealed with its own colour',
	result.sealed === result.filled,
	`${result.sealed} of ${result.filled}`,
);

await finish(browser);
