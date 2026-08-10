// favicon-genny: upload, canvas resize, the .ico container, and clear.
//
// The ICO bytes are the reason this rig exists — buildIco writes a binary
// format no unit test can prove the browser will actually download.

import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launch, visit, check, sleep, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(root, 'public/delphi.png');
const SIZES = [16, 32, 48, 64, 128, 180, 192, 512];
const ICO_SIZES = [16, 32, 48, 64];

const downloads = mkdtempSync(join(tmpdir(), 'dt-favicon-'));
const { browser, page } = await launch();

const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

await visit(page, '/tools/favicon-genny');

check('drop zone renders', await page.$('.dt-favicon-drop'), 'before any file');
check('no list yet', !(await page.$('.dt-favicon-list')));

const input = await page.$('.dt-favicon-drop input[type="file"]');
await input.uploadFile(SOURCE);
await page.waitForSelector('.dt-favicon-list', { timeout: 10000 });

const rows = await page.$$eval('.dt-favicon-row', (els) =>
	els.map((el) => ({
		size: el.querySelector('.dt-favicon-size')?.textContent.trim(),
		role: el.querySelector('.dt-favicon-role')?.textContent.trim(),
	})),
);
check('one row per size', rows.length === SIZES.length, `${rows.length} rows`);
check(
	'rows are labelled by dimension',
	rows.every((r, i) => r.size === `${SIZES[i]}×${SIZES[i]}`),
	rows.map((r) => r.size).join(' '),
);
check(
	'the platform sizes are named',
	rows[5]?.role === 'Apple Touch' &&
		rows[6]?.role === 'Android' &&
		rows[7]?.role === 'PWA',
	[rows[5]?.role, rows[6]?.role, rows[7]?.role].join(' / '),
);

// Decode each generated PNG rather than trusting the label next to it.
const decoded = await page.evaluate(() =>
	Promise.all(
		[...document.querySelectorAll('.dt-favicon-chip img')].map(
			(img) =>
				new Promise((resolve) => {
					const probe = new Image();
					probe.onload = () =>
						resolve([
							probe.naturalWidth,
							probe.naturalHeight,
						]);
					probe.src = img.src;
				}),
		),
	),
);
check(
	'each PNG is square at its stated size',
	decoded.every(([w, h], i) => w === h && w === SIZES[i]),
	decoded.map(([w, h]) => `${w}x${h}`).join(' '),
);

check(
	'source preview shows the uploaded file',
	await page.$eval('.dt-favicon-thumb img', (el) =>
		el.src.startsWith('data:image/'),
	),
);
check(
	'the file name becomes the title',
	(await page.$eval('.dt-favicon-bar-title', (el) =>
		el.textContent.trim(),
	)) === 'delphi',
);

// .ico download
const ico = join(downloads, 'favicon.ico');
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-favicon-bar-btn')]
		.find((b) => b.textContent.includes('.ico'))
		.click();
});
for (let i = 0; i < 40 && !existsSync(ico); i++) await sleep(100);

if (!existsSync(ico)) {
	check('favicon.ico downloads', false, `nothing at ${ico}`);
} else {
	const buf = readFileSync(ico);
	const count = buf.readUInt16LE(4);
	check('favicon.ico downloads', true, `${buf.length} bytes`);
	check(
		'ICONDIR is reserved 0, type 1',
		buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1,
	);
	check(
		'holds the four small sizes',
		count === ICO_SIZES.length,
		`${count}`,
	);

	const widths = [];
	let bytesAccountedFor = 6 + count * 16;
	for (let i = 0; i < count; i++) {
		const entry = 6 + i * 16;
		widths.push(buf.readUInt8(entry));
		const length = buf.readUInt32LE(entry + 8);
		const offset = buf.readUInt32LE(entry + 12);
		bytesAccountedFor += length;
		// Every frame must be a PNG at the offset the entry claims.
		const magic = buf.subarray(offset, offset + 8).toString('hex');
		check(
			`entry ${i} points at a PNG`,
			magic === '89504e470d0a1a0a',
			magic,
		);
	}
	check(
		'entries are ordered smallest first',
		widths.join() === ICO_SIZES.join(),
		widths.join(' '),
	);
	check(
		'no stray bytes',
		bytesAccountedFor === buf.length,
		`${bytesAccountedFor} vs ${buf.length}`,
	);
}

// clear returns to the drop zone
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-favicon-bar-btn')]
		.find((b) => b.textContent.includes('Clear'))
		.click();
});
await sleep(300);
check('clear restores the drop zone', await page.$('.dt-favicon-drop'));
check('clear drops the list', !(await page.$('.dt-favicon-list')));

// A file the browser will accept by extension but cannot decode. The Next
// version hung on "Generating favicons…" forever here.
const broken = join(downloads, 'broken.png');
writeFileSync(broken, Buffer.from('not a png at all'));
await (await page.$('.dt-favicon-drop input[type="file"]')).uploadFile(broken);
await sleep(600);
check(
	'an undecodable file surfaces an error',
	await page.$('.dt-favicon-error'),
);
check(
	'and does not leave the tool generating',
	!(await page.$('.dt-favicon-status')),
);
check('and returns to the drop zone', await page.$('.dt-favicon-drop'));

await finish(browser);
