import { launch, visit, check, sleep, finish } from './harness.mjs';

const DIALOG = 'dialog.dt-mag';
const LAZY = /\/(three|modern-screenshot)[./]/;

const ready = (page) =>
	page.waitForFunction(
		() =>
			window.__magazine?.overlay.ready &&
			window.__magazine.engine.settled,
		{ timeout: 20000 },
	);
const settled = async (page) => {
	await sleep(120);
	await page.waitForFunction(() => window.__magazine.engine.settled, {
		timeout: 10000,
	});
	await sleep(200);
};
const pages = (page) => page.evaluate(() => window.__magazine.engine.pages);
const isOpen = (page) => page.$eval('body', () => !!document.querySelector('dialog.dt-mag[open]'));
const closed = (page) =>
	page.waitForFunction(() => !document.querySelector('dialog.dt-mag'), {
		timeout: 5000,
	});

// share of pixels unlike the backdrop corner
async function paintedShare(page) {
	const shot = await page.screenshot({ encoding: 'base64' });
	return page.evaluate(async (b64) => {
		const img = new Image();
		img.src = `data:image/png;base64,${b64}`;
		await img.decode();
		const canvas = new OffscreenCanvas(img.width, img.height);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		const { data } = ctx.getImageData(0, 0, img.width, img.height);
		const at = (img.height - 2) * img.width * 4 + 8;
		const base = [data[at], data[at + 1], data[at + 2]];
		let painted = 0;
		for (let i = 0; i < data.length; i += 4)
			if (
				Math.abs(data[i] - base[0]) +
					Math.abs(data[i + 1] - base[1]) +
					Math.abs(data[i + 2] - base[2]) >
				90
			)
				painted++;
		return painted / (data.length / 4);
	}, shot);
}

const pointFor = (page, index, u, v) =>
	page.evaluate(
		(index, u, v) => window.__magazine.engine.pointFor(index, u, v),
		index,
		u,
		v,
	);

async function clickLink(page, index, href) {
	const rect = await page.evaluate(
		(index, href) =>
			window.__magazine.links
				.get(index)
				?.find((link) => link.href === href),
		index,
		href,
	);
	if (!rect) return { found: false };
	const point = await pointFor(
		page,
		index,
		(rect.u0 + rect.u1) / 2,
		(rect.v0 + rect.v1) / 2,
	);
	await page.mouse.move(point.x, point.y);
	await sleep(50);
	const cursor = await page.$eval('.dt-mag-canvas', (el) => el.style.cursor);
	await page.mouse.click(point.x, point.y);
	await sleep(300);
	return { found: true, cursor };
}

// desktop
{
	const { browser, page } = await launch({
		viewport: { width: 1400, height: 1000 },
	});
	const requests = [];
	page.on('request', (request) => requests.push(request.url()));
	await visit(page, '/');
	check(
		'three is not loaded with the home',
		!requests.some((url) => LAZY.test(url)),
		requests.filter((url) => LAZY.test(url)).join(', '),
	);

	// cover link
	await visit(page, '/?magazine');
	await page.waitForSelector(`${DIALOG}[open]`);
	await ready(page);
	await sleep(600);
	check(
		'the magazine link opens the magazine',
		await isOpen(page),
	);
	check(
		'three loads when it opens',
		requests.some((url) => /\/three[./]/.test(url)),
	);
	const share = await paintedShare(page);
	check('the canvas paints the cover', share > 0.12, share.toFixed(2));
	check(
		'it opens at the cover',
		JSON.stringify(await pages(page)) === '[0]',
		JSON.stringify(await pages(page)),
	);
	const named = await page.$eval('.dt-mag-canvas', (el) => [
		el.getAttribute('role'),
		el.getAttribute('aria-label'),
	]);
	check('the canvas is a named image', named[0] === 'img' && !!named[1]);

	// keys
	await page.keyboard.press('ArrowRight');
	await settled(page);
	check(
		'ArrowRight opens the cover',
		JSON.stringify(await pages(page)) === '[1,2]',
		JSON.stringify(await pages(page)),
	);
	await page.keyboard.press('PageDown');
	await settled(page);
	check(
		'PageDown turns a page',
		JSON.stringify(await pages(page)) === '[3,4]',
		JSON.stringify(await pages(page)),
	);
	const live = await page.$eval(`${DIALOG} [aria-live]`, (el) =>
		el.textContent.trim(),
	);
	check('the live region reads the pages', /^4–5 \/ 18/.test(live), live);
	const toc = await page.$$eval(`${DIALOG} .dt-mag-toc-num`, (els) =>
		els.map((el) => el.textContent.trim()).join(),
	);
	check(
		'contents lists eight entries; the iOS feature and the 2.3 feature take two pages each',
		toc === '4,6,8,10,11,12,14,16',
		toc,
	);
	await page.keyboard.press('ArrowLeft');
	await settled(page);
	check(
		'ArrowLeft turns back',
		JSON.stringify(await pages(page)) === '[1,2]',
	);
	await page.keyboard.press('End');
	await settled(page);
	check(
		'End shows the back cover',
		JSON.stringify(await pages(page)) === '[17]',
		JSON.stringify(await pages(page)),
	);
	await page.keyboard.press('Home');
	await settled(page);
	check(
		'Home closes it on the front cover',
		JSON.stringify(await pages(page)) === '[0]',
	);

	await page.keyboard.press('ArrowRight');
	await settled(page);
	await page.keyboard.press('ArrowRight');
	await settled(page);
	check(
		'two turns from the cover reach the second spread',
		JSON.stringify(await pages(page)) === '[3,4]',
		JSON.stringify(await pages(page)),
	);

	// clicking the halves
	const right = await pointFor(page, 4, 0.5, 0.15);
	await page.mouse.click(right.x, right.y);
	await settled(page);
	check(
		'a click on the right half turns forward',
		JSON.stringify(await pages(page)) === '[5,6]',
	);
	const left = await pointFor(page, 5, 0.5, 0.15);
	await page.mouse.click(left.x, left.y);
	await settled(page);
	check(
		'a click on the left half turns back',
		JSON.stringify(await pages(page)) === '[3,4]',
	);
	const stats = await page.evaluate(() =>
		window.__magazine.engine.frameStats(),
	);
	console.log(
		`  frame work during turns: median ${stats.median.toFixed(1)} ms, p95 ${stats.p95.toFixed(1)} ms (${stats.samples} frames)`,
	);

	await page.keyboard.press('ArrowRight');
	await settled(page);
	// links
	await page.evaluate(() => {
		window.__opened = [];
		window.open = (...args) => window.__opened.push(args);
	});
	await page.keyboard.press('ArrowLeft');
	await settled(page);
	const store = await clickLink(
		page,
		4,
		'https://apps.apple.com/us/app/delphitools/id6761313703',
	);
	const opened = await page.evaluate(() => window.__opened);
	check('the iOS feature has an App Store badge hotspot', store.found);
	check('the pointer is a hand over it', store.cursor === 'pointer', store.cursor);
	check(
		'it opens the App Store in a new tab without an opener',
		opened.length === 1 &&
			opened[0][0] ===
				'https://apps.apple.com/us/app/delphitools/id6761313703' &&
			opened[0][1] === '_blank' &&
			/noopener/.test(opened[0][2]) &&
			/noreferrer/.test(opened[0][2]),
		JSON.stringify(opened),
	);

	// keyboard reaches the links
	await page.focus('.dt-mag-canvas');
	await page.keyboard.press('Tab');
	const focused = await page.evaluate(() =>
		document.activeElement?.matches('[data-magazine-link]')
			? document.activeElement.textContent.trim()
			: document.activeElement?.tagName,
	);
	check('Tab reaches the page links', !!focused && focused !== 'BODY', focused);

	await page.keyboard.press('Escape');
	await closed(page);
	check('Escape closes it', !(await isOpen(page)));

	// home Elsewhere cell
	await page.$eval('a.dt-cell[data-magazine="cli"]', (el) =>
		el.scrollIntoView({ block: 'center' }),
	);
	await sleep(300);
	await page.click('a.dt-cell[data-magazine="cli"]');
	await page.waitForSelector(`${DIALOG}[open]`);
	await ready(page);
	await settled(page);
	check(
		'the home CLI cell opens on the CLI page',
		(await pages(page)).includes(10),
		JSON.stringify(await pages(page)),
	);
	{
		const share = await paintedShare(page);
		check('and paints', share > 0.12, share.toFixed(2));
	}
	check('the url stays on the home', new URL(page.url()).pathname === '/');
	await page.keyboard.press('Escape');
	await closed(page);
	check(
		'focus returns to the cell',
		await page.evaluate(
			() => document.activeElement?.dataset?.magazine === 'cli',
		),
	);

	// drawer row
	const row = await page.evaluateHandle(() =>
		[...document.querySelectorAll('.canon-sidebar-row')].find(
			(el) => el.textContent.trim() === 'delphitools for iOS',
		),
	);
	await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
	await row.click();
	await page.waitForSelector(`${DIALOG}[open]`);
	await ready(page);
	await settled(page);
	check(
		'the drawer row opens on the iOS page',
		(await pages(page)).includes(3),
		JSON.stringify(await pages(page)),
	);
	{
		const share = await paintedShare(page);
		check('and paints', share > 0.12, share.toFixed(2));
	}

	// the left zone reaches past the page edge
	await page.mouse.click(30, 500);
	await settled(page);
	check(
		'a click left of the magazine turns back',
		JSON.stringify(await pages(page)) === '[1,2]',
		JSON.stringify(await pages(page)),
	);

	await visit(page, '/?magazine=classifieds');
	await ready(page);
	await settled(page);
	await page.evaluate(() => {
		window.__opened = [];
		window.open = (...args) => window.__opened.push(args);
	});
	const ad = await clickLink(page, 16, 'https://www.sakeozo.com/');
	check(
		'the Sakeozo ad opens its site',
		ad.found &&
			(await page.evaluate(() => window.__opened[0]?.[0])) ===
				'https://www.sakeozo.com/',
	);
	await page.keyboard.press('Escape');
	await closed(page);

	await visit(page, `/?magazine=canon-ui-kit`);
	await ready(page);
	await settled(page);
	check(
		'?magazine=canon-ui-kit opens on the kit spread',
		JSON.stringify(await pages(page)) === '[11,12]',
		JSON.stringify(await pages(page)),
	);

	// the feature's kit link routes in-app
	await visit(page, `/?magazine=canon-feature-2`);
	await ready(page);
	await settled(page);
	const kit = await clickLink(page, 6, '/canon');
	check('the feature has an Open the kit hotspot', kit.found);
	await closed(page);
	await page.waitForFunction(
		() => location.pathname.startsWith('/canon'),
		{ timeout: 5000 },
	);
	check(
		'it routes to /canon and closes',
		new URL(page.url()).pathname.startsWith('/canon'),
		page.url(),
	);

	await browser.close();
}

// ?magazine=cli, reduced motion
{
	const { browser, page } = await launch({
		viewport: { width: 1400, height: 1000 },
	});
	await page.emulateMediaFeatures([
		{ name: 'prefers-reduced-motion', value: 'reduce' },
	]);
	await visit(page, '/?magazine=cli');
	await ready(page);
	await settled(page);
	check(
		'?magazine=cli opens on the CLI page under reduced motion',
		JSON.stringify(await pages(page)) === '[9,10]',
		JSON.stringify(await pages(page)),
	);
	{
		const share = await paintedShare(page);
		check('and paints', share > 0.12, share.toFixed(2));
	}
	await page.keyboard.press('ArrowRight');
	await sleep(100);
	const instant = await page.evaluate(() => window.__magazine.engine.pages);
	check(
		'a turn is instant',
		JSON.stringify(instant) === '[11,12]',
		JSON.stringify(instant),
	);
	await page.keyboard.press('Escape');
	await closed(page);
	check(
		'closing drops the query flag',
		!new URL(page.url()).searchParams.has('magazine'),
	);
	await browser.close();
}

// no WebGL
{
	const { browser, page } = await launch({
		viewport: { width: 1400, height: 1000 },
	});
	await page.evaluateOnNewDocument(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
			return /webgl/.test(type) ? null : original.call(this, type, ...rest);
		};
	});
	await visit(page, '/?magazine');
	await page.waitForSelector(`${DIALOG}.is-flat[open]`, { timeout: 5000 });
	const shown = () =>
		page.$$eval(`${DIALOG} .dt-mag-page:not([hidden])`, (els) =>
			els.map((el) => Number(el.dataset.page)),
		);
	check(
		'without WebGL the pages show flat, one at a time',
		JSON.stringify(await shown()) === '[0]',
		JSON.stringify(await shown()),
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('dialog.dt-mag button')]
			.find((el) => el.textContent.trim() === 'Next')
			?.click(),
	);
	await sleep(200);
	check('Next shows the next page', JSON.stringify(await shown()) === '[1]');
	await page.keyboard.press('ArrowRight');
	await sleep(200);
	check('arrow keys work there too', JSON.stringify(await shown()) === '[2]');
	await page.keyboard.press('Escape');
	await closed(page);
	check('Escape closes the flat magazine', !(await isOpen(page)));
	await browser.close();
}

// phone
{
	const { browser, page } = await launch({
		viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
	});
	await visit(page, '/?magazine');
	await ready(page);
	await sleep(600);
	check(
		'phone: one page in view',
		await page.evaluate(() => window.__magazine.engine.narrow),
	);
	check('phone: the closed magazine paints', (await paintedShare(page)) > 0.12);
	const steps = [];
	for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight']) {
		await page.keyboard.press(key);
		await settled(page);
		steps.push(JSON.stringify(await pages(page)));
	}
	check(
		'phone: right opens on the left page, then pans, then turns',
		steps.join() === '[1],[2],[3]',
		steps.join(),
	);
	await page.mouse.click(360, 420);
	await settled(page);
	check(
		'phone: a tap on the right of a left page pans to its right page',
		JSON.stringify(await pages(page)) === '[4]',
		JSON.stringify(await pages(page)),
	);
	await page.mouse.click(30, 420);
	await settled(page);
	check(
		'phone: a tap on the left of a right page pans back',
		JSON.stringify(await pages(page)) === '[3]',
		JSON.stringify(await pages(page)),
	);
	const overflow = await page.evaluate(() => ({
		doc: document.documentElement.scrollWidth,
		dialog: document.querySelector('dialog.dt-mag').scrollWidth,
	}));
	check(
		'phone: no horizontal scroll at 390',
		overflow.doc <= 390 && overflow.dialog <= 390,
		JSON.stringify(overflow),
	);
	await browser.close();
}

await finish();
