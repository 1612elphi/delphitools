// json-formatter: what the unit tests cannot see — the booted two-pane tool.
// Indent presets written into the result pane, the tree view's expand/collapse,
// a parse failure's line:column + source-line highlight, copy feedback, a real
// download, and the three file paths (open / drop / paste).
//
// Usage: npm start, then node scripts/verify/json-formatter.mjs
//   (or `npm run verify:json-formatter`).

import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
const downloads = mkdtempSync(join(tmpdir(), 'dt-jf-dl-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

// Ember re-renders off the microtask/rAF queue; settle after every action.
const settle = () => sleep(200);

const typing = (text) =>
	page.$eval(
		'.dt-jf-source',
		(el, value) => {
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		text,
	);

const clickOpt = (group, label) =>
	page.$$eval(
		`.dt-jf-${group} .dt-jf-opt`,
		(els, l) => els.find((el) => el.textContent.trim() === l)?.click(),
		label,
	);

const output = () => page.$eval('.dt-jf-output', (el) => el.value);
const source = () => page.$eval('.dt-jf-source', (el) => el.value);
const treeRowCount = () => page.$$eval('.dt-jf-tree-row', (els) => els.length);

/** Chrome writes a .crdownload first, so wait for a settled, named file. */
async function waitForDownload(match, timeout = 15000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name) {
			const path = join(downloads, name);
			if (statSync(path).size >= 0) return { name, text: readFileSync(path, 'utf8') };
		}
		await sleep(150);
	}
	return null;
}

const DOC = '{"a":1,"b":{"c":[2,3]}}';
const TWO_SPACES = '{\n  "a": 1,\n  "b": {\n    "c": [\n      2,\n      3\n    ]\n  }\n}';

await visit(page, '/tools/json-formatter');

// ── defaults ──────────────────────────────────────────────────────────────
check(
	'defaults: 2-space indent and the text view are active',
	await page.evaluate(() => {
		const pick = (sel) =>
			document.querySelector(`${sel} .dt-jf-opt.is-active`)?.textContent.trim();
		return pick('.dt-jf-indent') === '2 spaces' && pick('.dt-jf-view') === 'Text';
	}),
);
check(
	'defaults: copy and download are disabled without input',
	await page.evaluate(
		() =>
			document.querySelector('[aria-label="Copy"]').disabled &&
			document.querySelector('[aria-label="Download"]').disabled,
	),
);

// ── indent presets ────────────────────────────────────────────────────────
await typing(DOC);
await settle();
check('2 spaces formats the document', (await output()) === TWO_SPACES);

await clickOpt('indent', '4 spaces');
await settle();
check(
	'4 spaces formats the document',
	(await output()) ===
		'{\n    "a": 1,\n    "b": {\n        "c": [\n            2,\n            3\n        ]\n    }\n}',
);

await clickOpt('indent', 'Tabs');
await settle();
check(
	'tabs format the document',
	(await output()) ===
		'{\n\t"a": 1,\n\t"b": {\n\t\t"c": [\n\t\t\t2,\n\t\t\t3\n\t\t]\n\t}\n}',
);

await clickOpt('indent', 'Minify');
await settle();
check('minify emits a single line', (await output()) === '{"a":1,"b":{"c":[2,3]}}');

await clickOpt('indent', '2 spaces');
await settle();

// ── copy arms ─────────────────────────────────────────────────────────────
await page.click('[aria-label="Copy"]');
check(
	'copy arms with the check state',
	await page
		.waitForSelector('.dt-jf-btn.is-copied', { timeout: 2000 })
		.then(() => true)
		.catch(() => false),
);

// ── download triggers ─────────────────────────────────────────────────────
await page.click('[aria-label="Download"]');
const download = await waitForDownload(/^formatted\.json$/);
check('Download writes formatted.json', !!download, download?.name ?? 'nothing landed');
check(
	'the download carries the formatted text',
	download?.text === (await output()),
	download ? `${download.text.length} bytes` : 'no file',
);

// ── tree view ─────────────────────────────────────────────────────────────
await clickOpt('view', 'Tree');
await settle();
// root, a, b, c, 0, 1 — all expanded.
check('the tree lists every node', (await treeRowCount()) === 6, '6 rows');
const counts = await page.$$eval('.dt-jf-tree-count', (els) =>
	els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
);
check(
	'containers show their entry counts',
	counts.join(', ') === '2 entries, 1 entries, 2 items',
	counts.join(', '),
);

await page.click('.dt-jf-tree-caret');
await settle();
check(
	'collapsing the root withholds every child',
	(await treeRowCount()) === 1,
	'1 row',
);
await page.click('.dt-jf-tree-caret');
await settle();
check('re-expanding restores the walk', (await treeRowCount()) === 6, '6 rows');

// collapse a mid-tree container: b hides its subtree, root/a/b stay.
await page.$$eval('.dt-jf-tree-caret', (els) => els[1]?.click());
await settle();
check(
	'collapsing a branch keeps the other branches',
	(await treeRowCount()) === 3,
	'3 rows',
);
const left = await page.$$eval('.dt-jf-tree-count', (els) =>
	els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
);
check('the collapsed branch still shows its count', left[1] === '1 entries', left.join(', '));

await clickOpt('view', 'Text');
await settle();

// ── invalid JSON: message, line:column, source-line highlight ─────────────
await typing('{\n  "a": 1,\n  "b": tru\n}');
await settle();
check(
	'invalid JSON shows the error panel',
	await page
		.waitForSelector('.dt-jf-error', { timeout: 2000 })
		.then(() => true)
		.catch(() => false),
);
const position = await page.$eval('.dt-jf-error-position', (el) =>
	el.textContent.trim(),
);
check('the panel carries a line:column', /^3:\d+$/.test(position), position);
const errorMessage = await page.$eval('.dt-jf-error-message', (el) =>
	el.textContent.trim(),
);
check('the panel carries the engine message', errorMessage.length > 0);
const hit = await page.$eval('.dt-jf-line.is-error', (el) => el.textContent.trim());
check('the offending source line is highlighted', /"b": tru/.test(hit), hit);
check(
	'invalid JSON disables copy and download',
	await page.evaluate(
		() =>
			document.querySelector('[aria-label="Copy"]').disabled &&
			document.querySelector('[aria-label="Download"]').disabled,
	),
);

// ── open a .json file through the hidden input ────────────────────────────
const fixture = join(downloads, 'rig-fixture.json');
writeFileSync(fixture, '{"from":"file","nested":{"ok":true}}');
await (await page.$('.dt-jf-bar input[type="file"]')).uploadFile(fixture);
await sleep(400);
check(
	'opening a file loads it as the source',
	(await source()) === '{"from":"file","nested":{"ok":true}}',
);
check('the file formats', (await output()) !== '', '');

// ── drop a .json file ─────────────────────────────────────────────────────
await page.$eval('.dt-jf-frame', (el) => {
	const transfer = new DataTransfer();
	transfer.items.add(
		new File(['{"dropped":true}'], 'drop-sample.json', { type: 'application/json' }),
	);
	el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
});
await sleep(400);
check('dropping a file loads it as the source', (await source()) === '{"dropped":true}');

// ── paste a .json file ────────────────────────────────────────────────────
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(
		new File(['{"pasted":1}'], 'paste-sample.json', { type: 'application/json' }),
	);
	document.dispatchEvent(
		new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
	);
});
await sleep(400);
check('pasting a file loads it as the source', (await source()) === '{"pasted":1}');

// ── scroll sync: the rendered copy tracks the textarea ────────────────────
const tall = JSON.stringify(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`key${i}`, i])), null, 2);
await typing(tall);
await settle();
await page.$eval('.dt-jf-source', (el) => {
	el.scrollTop = 300;
	el.dispatchEvent(new Event('scroll', { bubbles: true }));
});
await settle();
check(
	'scrolling the source tracks the rendered copy',
	await page.$eval('.dt-jf-lines-inner', (el) =>
		el.getAttribute('style').includes('translate(0px, -300px)'),
	),
);

// ── clear ─────────────────────────────────────────────────────────────────
await page.click('[aria-label="Clear"]');
await settle();
check('clear empties source and result', (await source()) === '' && (await output()) === '');

await finish(browser);
