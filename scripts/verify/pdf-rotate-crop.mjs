// crop tolerance ±2pt
// npm start, node scripts/verify/pdf-rotate-crop.mjs

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const A4 = [595.28, 841.89];
const near = (a, b) => Math.abs(a - b) < 2;

const fixture = join(mkdtempSync(join(tmpdir(), 'dt-prc-')), 'three.pdf');
{
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (const n of [1, 2, 3]) {
		const page = doc.addPage(A4);
		page.drawText(`PAGE ${n}`, { x: 72, y: A4[1] - 72, font });
	}
	writeFileSync(fixture, await doc.save());
}

const downloads = mkdtempSync(join(tmpdir(), 'dt-prc-dl-'));

// wait past .crdownload
async function waitForDownload(match, timeout = 30000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name) {
			const path = join(downloads, name);
			if (statSync(path).size > 0)
				return { name, bytes: readFileSync(path) };
		}
		await sleep(250);
	}
	return null;
}

// avoid matching previous download
function clearDownloads() {
	for (const name of readdirSync(downloads)) {
		rmSync(join(downloads, name));
	}
}

// fractions of box
async function dragCrop(fx1, fy1, fx2, fy2) {
	const box = await (await page.$('.dt-prc-crop-layer')).boundingBox();
	await page.mouse.move(
		box.x + box.width * fx1,
		box.y + box.height * fy1,
	);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * fx2, box.y + box.height * fy2, {
		steps: 8,
	});
	await page.mouse.up();
}

const clickOpt = (text) =>
	page.$$eval(
		'.dt-prc-cropmode .dt-prc-opt',
		(els, wanted) =>
			els.find((b) => b.textContent.trim() === wanted).click(),
		text,
	);

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

await visit(page, '/tools/pdf-rotate-crop');
await (await page.$('.dt-prc-drop input[type="file"]')).uploadFile(fixture);

const loaded = await page
	.waitForFunction(
		() =>
			document.querySelectorAll('.dt-prc-cell').length === 3 &&
			document.querySelector('.dt-prc-preview img'),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
check('three pages load with a preview', loaded);

const bar = await page.$eval('.dt-prc-info', (el) => el.textContent);
check(
	'the bar names the file and counts pages',
	/three\.pdf/.test(bar) && /3 pages/.test(bar),
	bar.trim().replace(/\s+/g, ' '),
);

const applyDisabled = await page.$$eval(
	'.dt-prc-cropmode .dt-prc-opt',
	(els) => els.slice(0, 2).every((b) => b.disabled),
);
check('apply stays disabled without a drag', applyDisabled);
await page.$$eval('.dt-prc-rotate button[title="Rotate right"]', (els) =>
	els[0].click(),
);
const marked = await page
	.waitForFunction(
		() =>
			document
				.querySelector('.dt-prc-cell .dt-prc-thumb')
				.className.includes('is-rot-90'),
		{ timeout: 5000 },
	)
	.then(() => true)
	.catch(() => false);
check('rotate marks the page thumbnail', marked);

await page.$$eval('.dt-prc-rotate button[title="Rotate left"]', (els) =>
	els[1].click(),
);
const rotClasses = await page
	.waitForFunction(
		() => {
			const cls = [...document.querySelectorAll('.dt-prc-thumb')].map(
				(el) => el.className,
			);
			return /is-rot-270/.test(cls[1]) && /is-rot-270/.test(cls[2])
				? cls.join('|')
				: false;
		},
		{ timeout: 5000 },
	)
	.then((handle) => handle.jsonValue())
	.catch(() => '');
check(
	'rotate-all turns every page but the reset one',
	/is-rot-270/.test(rotClasses) &&
		!/is-rot/.test(rotClasses.split('|')[0]),
	rotClasses.replace(/\s+/g, ' '),
);
// late render clears drag
await sleep(600);
await dragCrop(0.25, 0.25, 0.75, 0.75);
const pendingShown = await page
	.waitForSelector('.dt-prc-pending', { timeout: 5000 })
	.then(() => true)
	.catch(() => false);
check('a drag draws the pending box', pendingShown);

await clickOpt('This page');
const cropMarked = await page
	.waitForSelector('.dt-prc-cropdot', { timeout: 5000 })
	.then(() => true)
	.catch(() => false);
check('applying a crop marks the page', cropMarked);
check(
	'the crop shows on the preview',
	!!(await page.$('.dt-prc-cropbox')),
);

await page.click('.dt-prc-btn.is-primary');
const out = await waitForDownload(/-rotate-crop\.pdf$/);
check('edited PDF downloads', !!out, out?.name ?? 'nothing landed');

if (out) {
	const doc = await PDFDocument.load(out.bytes);
	const pages = doc.getPages();
	const crop = pages[0].getCropBox();
	check(
		'page 1 keeps the dragged half',
		near(crop.x, A4[0] * 0.25) &&
			near(crop.y, A4[1] * 0.25) &&
			near(crop.width, A4[0] * 0.5) &&
			near(crop.height, A4[1] * 0.5),
		`${crop.x.toFixed(1)},${crop.y.toFixed(1)} ${crop.width.toFixed(1)}×${crop.height.toFixed(1)}`,
	);
	check(
		'page 1 rotation is back to 0',
		pages[0].getRotation().angle === 0,
		`${pages[0].getRotation().angle}°`,
	);
	check(
		'rotate-all reached the other pages',
		pages[1].getRotation().angle === 270 &&
			pages[2].getRotation().angle === 270,
		`${pages[1].getRotation().angle}°/${pages[2].getRotation().angle}°`,
	);
	check(
		'uncropped pages stay whole',
		near(pages[1].getCropBox().width, A4[0]) &&
			near(pages[1].getCropBox().height, A4[1]),
		`${pages[1].getCropBox().width.toFixed(1)}×${pages[1].getCropBox().height.toFixed(1)}`,
	);
}
clearDownloads();
await page.$$eval('.dt-prc-cell', (els) => els[1].click());
await sleep(600);
await dragCrop(0.1, 0.1, 0.6, 0.6);
await page.waitForSelector('.dt-prc-pending', { timeout: 5000 });
await clickOpt('All pages');
const allMarked = await page
	.waitForFunction(
		() => document.querySelectorAll('.dt-prc-cropdot').length === 3,
		{ timeout: 5000 },
	)
	.then(() => true)
	.catch(() => false);
check('apply-to-all marks every page', allMarked);

await page.click('.dt-prc-btn.is-primary');
const all = await waitForDownload(/-rotate-crop\.pdf$/);
check('second build downloads', !!all, all?.name ?? 'nothing landed');

if (all) {
	const doc = await PDFDocument.load(all.bytes);
	const pages = doc.getPages();
	const boxes = pages.map((p) => p.getCropBox());
	check(
		'every page lands inside its media box',
		boxes.every(
			(c) =>
				c.x > -1 &&
				c.y > -1 &&
				c.x + c.width < A4[0] + 1 &&
				c.y + c.height < A4[1] + 1 &&
				c.width < A4[0] - 1,
		),
		boxes
			.map(
				(c) =>
					`${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.width.toFixed(0)}×${c.height.toFixed(0)}`,
			)
			.join(' | '),
	);
	// rotation shifts box corner
	check(
		'the crop keeps the dragged half everywhere',
		boxes.every(
			(c) => near(c.width, A4[0] * 0.5) && near(c.height, A4[1] * 0.5),
		),
		boxes
			.map((c) => `${c.width.toFixed(1)}×${c.height.toFixed(1)}`)
			.join(' | '),
	);
	check(
		'rotation shifts where the box lands',
		!near(boxes[0].x, boxes[1].x) || !near(boxes[0].y, boxes[1].y),
		`p1 ${boxes[0].x.toFixed(1)},${boxes[0].y.toFixed(1)} vs p2 ${boxes[1].x.toFixed(1)},${boxes[1].y.toFixed(1)}`,
	);
}
await page.$$eval('.dt-prc-cell', (els) => els[0].click());
await sleep(300);
await clickOpt('Clear');
await sleep(300);
const remaining = await page.$$eval('.dt-prc-cropdot', (els) => els.length);
check(
	'clear drops the crop from the current page',
	remaining === 2,
	`${remaining} crop marks left`,
);

await finish(browser);
