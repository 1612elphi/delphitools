// Workflows: the home catalogue starts a flow; a tool's "Pass along" captures
// its output into IndexedDB, flies into the bar and advances the flow with a
// view transition; a reload restores bar and bag; a fresh tab sweeps an
// orphaned bag; Done appears only once the last step has passed its output
// along and then saves it; a colour flow carries `?color=`; an intake tool
// without a paste modifier takes the hand-off through the intake.
//
// Usage: npm start, then node scripts/verify/workflows.mjs

import {
	launch,
	visit,
	check,
	finish,
	sleep,
	makeClip,
	dropClip,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
page.on('dialog', (dialog) => void dialog.accept());

const bagCount = (p) =>
	p.evaluate(
		() =>
			new Promise((resolve) => {
				const req = indexedDB.open('flow');
				req.onerror = () => resolve(-1);
				req.onsuccess = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains('files')) {
						db.close();
						resolve(0);
						return;
					}
					const count = db.transaction('files').objectStore('files').count();
					count.onsuccess = () => {
						db.close();
						resolve(count.result);
					};
				};
			}),
	);

const barState = () =>
	page.evaluate(() => ({
		present: !!document.querySelector('.dt-flow'),
		name: document.querySelector('.dt-flow-name')?.textContent?.trim(),
		steps: [...document.querySelectorAll('.dt-flow-step')].map((b) =>
			b.classList.contains('is-current')
				? 'current'
				: b.classList.contains('is-done')
					? 'done'
					: 'pending',
		),
		captures: [...document.querySelectorAll('.dt-flow-capture-name')].map((s) =>
			s.textContent?.trim(),
		),
		next: document.querySelector('.dt-flow-next')?.disabled,
		done: !!document.querySelector('.dt-flow-next.is-done'),
		path: location.pathname + location.search,
	}));

const startFlow = async (name) => {
	if (!(await page.$('.dt-wf-row'))) {
		await page.click('.dt-cell.is-highlight[href="/workflows"]');
		await page.waitForSelector('.dt-wf-row', { timeout: 15000 });
	}
	await page.evaluate((name) => {
		[...document.querySelectorAll('.dt-wf-row')]
			.find((b) => b.querySelector('.dt-wf-name span')?.textContent?.trim() === name)
			?.querySelector('.dt-wf-go')
			?.click();
	}, name);
	await page.waitForSelector('.dt-flow', { timeout: 15000 });
	await sleep(400);
};

/** Clicks the tool's own "Pass along" control; false when there is none. */
const passAlong = () =>
	page.evaluate(() => {
		const button = [...document.querySelectorAll('.dt-main button')].find((el) =>
			/Pass along/.test(el.textContent ?? ''),
		);
		button?.click();
		return !!button;
	});

/** The slide between steps has finished. */
const flowSettled = () =>
	page.waitForFunction(
		() => document.querySelector('.dt-main')?.getAnimations().length === 0,
		{ timeout: 5000 },
	);

const buttonText = (selector) =>
	page.$eval(selector, (b) => b.textContent?.replace(/\s+/g, ' ').trim());

await visit(page, '/');
check(
	'Greatest Hits highlights Substrata and Workflows, links Workflows to its page, no bar',
	await page.evaluate(() => {
		const hits = [...document.querySelectorAll('.dt-section')].find((s) =>
			/Greatest/.test(s.querySelector('.dt-section-title')?.textContent ?? ''),
		);
		const cells = [...(hits?.querySelectorAll('.dt-cell.is-highlight') ?? [])];
		return (
			cells.map((c) => c.getAttribute('href')).join() === '/editor,/workflows' &&
			!document.querySelector('.dt-wf-row') &&
			!document.querySelector('.dt-flow')
		);
	}),
);
await visit(page, '/workflows');
check(
	'the Workflows page lists every workflow under its own header',
	await page.evaluate(
		() =>
			document.querySelectorAll('.dt-wf-row').length >= 15 &&
			document.querySelector('.dt-header h1')?.textContent?.trim() === 'Workflows' &&
			[...document.querySelectorAll('.dt-wf-th')].map((h) => h.textContent?.trim()).join() ===
				'Workflow,First,,Then...,Finally,,' &&
			document.querySelectorAll('.dt-wf-row').length >= 15 &&
			[...document.querySelectorAll('.dt-wf-in')].every((s) => (s.textContent?.trim() ?? '') !== ''),
	),
);
await visit(page, '/');

// --- Paste and strip ------------------------------------------------------
await startFlow('Paste and strip');
let state = await barState();
check(
	'starting a flow opens step 1 with Next disabled',
	state.path === '/tools/paste-image' &&
		state.name === 'Paste and strip' &&
		state.steps.join() === 'current,pending' &&
		state.next === true,
	JSON.stringify(state),
);

await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 48;
	canvas.height = 32;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#c0ffee';
	ctx.fillRect(0, 0, 48, 32);
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const transfer = new DataTransfer();
	transfer.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
	document.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }),
	);
});
await page.waitForSelector('.dt-pi-image', { timeout: 10000 });
check(
	'the tool control reads Pass along inside a flow',
	(await buttonText('.dt-pi-btn.is-trailing.is-primary')) === 'Pass along',
	await buttonText('.dt-pi-btn.is-trailing.is-primary'),
);
await page.click('.dt-pi-btn.is-trailing.is-primary');
const ghostSeen = await page
	.waitForSelector('.dt-flow-ghost', { timeout: 3000 })
	.then(() => true)
	.catch(() => false);
await page.waitForFunction(() => location.pathname === '/tools/metadata-stripper', {
	timeout: 15000,
});
await page.waitForSelector('.dt-strip-name', { timeout: 15000 });
await flowSettled();
state = await barState();
check(
	'Pass along flies into the bar and advances into Metadata Stripper with the image loaded',
	ghostSeen &&
		state.steps.join() === 'done,current' &&
		!state.done &&
		(await bagCount(page)) === 1,
	JSON.stringify({ ...state, ghostSeen }),
);

await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.dt-flow', { timeout: 15000 });
const restored = await page
	.waitForSelector('.dt-strip-name', { timeout: 15000 })
	.then(() => true)
	.catch(() => false);
state = await barState();
check(
	'a reload restores the bar and redelivers the bag',
	restored && state.steps.join() === 'done,current' && (await bagCount(page)) === 1,
	JSON.stringify(state),
);

const other = await browser.newPage();
other.on('dialog', (dialog) => void dialog.accept());
await visit(other, '/workflows');
check(
	'a second tab leaves a live flow\'s bag alone',
	(await bagCount(other)) === 1,
);
// the second tab runs a flow of its own, captures, and closes: an orphan
await other.evaluate(() => {
	[...document.querySelectorAll('.dt-wf-row')]
		.find((b) => b.querySelector('.dt-wf-name span')?.textContent?.trim() === 'Paste and strip')
		?.querySelector('.dt-wf-go')
		?.click();
});
await other.waitForSelector('.dt-flow', { timeout: 15000 });
await sleep(400);
await other.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 8;
	canvas.height = 8;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const transfer = new DataTransfer();
	transfer.items.add(new File([blob], 'other.png', { type: 'image/png' }));
	document.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }),
	);
});
await other.waitForSelector('.dt-pi-image', { timeout: 10000 });
await other.click('.dt-pi-btn.is-trailing.is-primary');
await other.waitForFunction(() => location.pathname === '/tools/metadata-stripper', {
	timeout: 15000,
});
check('two flows keep separate rows', (await bagCount(other)) === 2);
await other.close();
const third = await browser.newPage();
await visit(third, '/');
await sleep(600);
check(
	'a boot with no record sweeps the closed tab\'s run and keeps the live one',
	(await bagCount(third)) === 1,
);
await third.close();

await captureObjectUrl(page);
check('Done is absent until the last step passes its output along', !state.done);
check('the last step control reads Pass along', await passAlong());
await page.waitForSelector('.dt-flow-next.is-done', { timeout: 10000 });
await sleep(300);
const finale = await page.evaluate(() => ({
	finished: document.querySelector('.dt-flow')?.classList.contains('is-finished'),
	barHeight: document.querySelector('.dt-flow')?.getBoundingClientRect().height,
	blur: getComputedStyle(document.querySelector('.dt-main')).filter,
}));
check(
	'the finale expands the bar and blurs the tool',
	finale.finished && finale.barHeight >= 76 && /blur/.test(finale.blur),
	JSON.stringify(finale),
);
await page.evaluate(() => {
	window.__result = undefined;
});
await page.click('.dt-flow-next.is-done');
await sleep(500);
check(
	'Done saves the final file and exits: no bar, no record, no files',
	(await page.evaluate(
		() =>
			window.__result instanceof Blob &&
			!document.querySelector('.dt-flow') &&
			sessionStorage.getItem('flow') === null,
	)) && (await bagCount(page)) === 0,
);

// --- Colour to gradient ---------------------------------------------------
await visit(page, '/');
await startFlow('Colour to gradient');
await page.$eval('.dt-cc-value', (input) => {
	const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
	set.call(input, '#ff0000');
	input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
state = await barState();
check(
	'a colour source enables Next as soon as it shows a colour',
	state.path === '/tools/colour-converter' && state.next === false,
	JSON.stringify(state),
);
await page.click('.dt-flow-next');
await page.waitForFunction(() => location.pathname === '/tools/gradient-genny', {
	timeout: 15000,
});
await flowSettled();
state = await barState();
const firstStop = await page.$eval('input[type="color"]', (input) => input.value);
check(
	'Next carries the colour as ?color= and the gradient leads with it',
	state.path === '/tools/gradient-genny?color=ff0000' && firstStop === '#ff0000',
	JSON.stringify({ ...state, firstStop }),
);
check('the gradient step passes its PNG along', await passAlong());
await page.waitForSelector('.dt-flow-next.is-done', { timeout: 10000 });
await page.click('.dt-flow-exit');
await sleep(300);
check(
	'Exit clears the flow',
	await page.evaluate(
		() => !document.querySelector('.dt-flow') && sessionStorage.getItem('flow') === null,
	),
);

// --- Extract and normalise ------------------------------------------------
// An AudioIntake tool with no filePaste modifier (Audio Normaliser) takes the
// hand-off through the intake itself.
await visit(page, '/');
await startFlow('Extract and normalise');
await makeClip(page, { audio: true, ms: 1500, name: 'tone.webm' });
await dropClip(page, '.dt-ax-frame');
await page.waitForFunction(
	() => document.querySelector('.dt-ax-go')?.disabled === false,
	{ timeout: 15000 },
);
await page.click('.dt-ax-go');
await page.waitForSelector('.dt-ax-out', { timeout: 30000 });
check(
	'a non-final step labels its download control Pass along',
	(await buttonText('.dt-ax-btn.is-primary')) === 'Pass along',
	await buttonText('.dt-ax-btn.is-primary'),
);
await page.click('.dt-ax-btn.is-primary');
await page.waitForFunction(
	() => document.querySelectorAll('.dt-an-cell').length === 4,
	{ timeout: 20000 },
);
await flowSettled();
state = await barState();
check(
	'the WAV reaches Audio Normaliser through its intake',
	state.path === '/tools/audio-normaliser' && state.steps.join() === 'done,current',
	JSON.stringify(state),
);
await page.click('.dt-an-go');
await page.waitForSelector('.dt-an-out', { timeout: 30000 });
check(
	'the last step control reads Pass along too',
	(await buttonText('.dt-an-btn.is-primary')) === 'Pass along',
	await buttonText('.dt-an-btn.is-primary'),
);
await captureObjectUrl(page);
await page.click('.dt-an-btn.is-primary');
await page.waitForSelector('.dt-flow-next.is-done', { timeout: 10000 });
await page.evaluate(() => {
	window.__result = undefined;
});
await page.click('.dt-flow-next.is-done');
await sleep(500);
check(
	'Done saves the normalised WAV and exits',
	await page.evaluate(
		() => window.__result?.type === 'audio/wav' && !document.querySelector('.dt-flow'),
	),
);

await finish(browser);
