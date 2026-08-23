// Request Builder: fill the form, read both hand-over formats, copy one.
//
// Usage: npm start, then node scripts/verify/request-builder.mjs

import { launch, visit, check, finish, sleep, BASE } from './harness.mjs';

const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

await visit(page, '/tools/request-builder');

const out = (which) =>
	page.$eval(`.dt-req-out.is-${which} .dt-req-pre`, (el) => el.textContent);

check(
	'an empty form still renders a request line',
	(await out('http')).startsWith('GET / HTTP/1.1'),
	await out('http'),
);

await page.type('.dt-req-url', 'https://api.example.com/things');
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-req-method')]
		.find((b) => b.textContent.trim() === 'POST')
		.click(),
);
await page.click('.dt-req-section.is-headers .dt-req-add');
await page.type(
	'.dt-req-section.is-headers .dt-req-row input[aria-label="Name"]',
	'Content-Type',
);
await page.type(
	'.dt-req-section.is-headers .dt-req-row input[aria-label="Value"]',
	'application/json',
);
await page.click('.dt-req-section.is-query .dt-req-add');
await page.type(
	'.dt-req-section.is-query .dt-req-row input[aria-label="Name"]',
	'page',
);
await page.type(
	'.dt-req-section.is-query .dt-req-row input[aria-label="Value"]',
	'2',
);
await page.type('.dt-req-body', '{"name":"delphi"}');
await sleep(150);

const curl = await out('curl');
check('curl names the method', curl.includes('curl -X POST'), curl);
check(
	'curl carries the query in the URL',
	curl.includes("'https://api.example.com/things?page=2'"),
);
check(
	'curl carries the header',
	curl.includes("-H 'Content-Type: application/json'"),
);
check('curl carries the body', curl.includes(`--data '{"name":"delphi"}'`));
check('curl breaks across lines', curl.includes(' \\\n'));

const http = await out('http');
check(
	'raw request line and host',
	http.startsWith('POST /things?page=2 HTTP/1.1\nHost: api.example.com'),
	http.split('\n')[0],
);
check('raw request counts the body', http.includes('Content-Length: 17'));
check('blank line before the body', http.includes('\n\n{"name":"delphi"}'));

// Removing the header row drops it from both formats.
await page.click('.dt-req-section.is-headers .dt-req-remove');
await sleep(100);
check(
	'removing the row removes the header',
	!(await out('curl')).includes('Content-Type'),
);

await page.click('.dt-req-out.is-curl .dt-req-copy');
await sleep(150);
check(
	'copy shows Copied',
	(await page.$eval('.dt-req-out.is-curl .dt-req-copy', (el) =>
		el.textContent.trim(),
	)) === 'Copied',
);
check(
	'and the clipboard holds the command',
	(await page.evaluate(() => navigator.clipboard.readText())).startsWith(
		'curl -X POST',
	),
);

await finish(browser);
