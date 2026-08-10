// The About dialog, which is the only user of ui/dialog.gts.
//
// That component is deliberately thin: focus trapping, Escape, the top layer
// and ::backdrop all come from <dialog showModal()>, and the wrapper only owns
// open state and returning focus. These checks are aimed at the parts the
// browser provides, because they are what the thin wrapper is betting on.

import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/');

const state = () =>
	page.evaluate(() => {
		const dialog = document.querySelector('dialog');
		return {
			exists: !!dialog,
			open: dialog?.open ?? false,
			chips: document.querySelectorAll('.dt-chips a').length,
			focused:
				document.activeElement?.className ||
				document.activeElement?.tagName,
		};
	});

const before = await state();
check('the dialog element is in the DOM from the start', before.exists);
check('but closed', !before.open);

await page.click('.dt-about');
await sleep(500);
const opened = await state();
check('the trigger opens it', opened.open);
check('with its content', opened.chips > 0, `${opened.chips} links`);
check(
	'focus moves inside',
	await page.evaluate(() =>
		document
			.querySelector('dialog')
			?.contains(document.activeElement),
	),
	opened.focused,
);

// showModal puts the element in the top layer, which is what makes the rest of
// the page inert without any JS of ours.
check(
	'it is in the top layer with a ::backdrop',
	await page.evaluate(() => {
		const dialog = document.querySelector('dialog');
		const backdrop = getComputedStyle(dialog, '::backdrop');
		return (
			backdrop.backgroundColor !== '' &&
			backdrop.backgroundColor !== 'rgba(0, 0, 0, 0)'
		);
	}),
	await page.evaluate(
		() =>
			getComputedStyle(
				document.querySelector('dialog'),
				'::backdrop',
			).backgroundColor,
	),
);

check(
	'a click behind it cannot reach the page',
	await page.evaluate(() => {
		const link = document.querySelector('.dt-nav-link');
		const rect = link.getBoundingClientRect();
		const hit = document.elementFromPoint(rect.x + 4, rect.y + 4);
		return hit !== link && !link.contains(hit);
	}),
);

await page.keyboard.press('Escape');
await sleep(500);
const afterEscape = await state();
check('Escape closes it', !afterEscape.open);
check(
	'and focus returns to the trigger',
	afterEscape.focused?.includes('dt-about'),
	afterEscape.focused,
);

await page.click('.dt-about');
await sleep(400);
await page.click('.dt-dialog-close');
await sleep(400);
check('the close button closes it too', !(await state()).open);
check(
	'and also returns focus',
	(await state()).focused?.includes('dt-about'),
	(await state()).focused,
);

// Leaving the route with the dialog mounted exercises the modifier teardown.
await page.click('.dt-about');
await sleep(300);
await page.evaluate(() => {
	document.querySelector(
		'.dt-nav-link[href="/tools/palette-genny"]',
	)?.click();
});
await sleep(700);
check(
	'navigating with it open tears down cleanly',
	await page.$('.dt-palette-frame'),
	'console errors would have failed above',
);

await finish(browser);
