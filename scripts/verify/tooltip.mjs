// unmount rides animationend; app.scss keyframes

import { launch, visit, check, sleep, finish } from './harness.mjs';

const TOGGLE = ".dt-icon-btn[aria-label='Toggle sidebar']";

const { browser, page } = await launch({
	viewport: { width: 1400, height: 900 },
});
await visit(page, '/');

const count = () =>
	page.$$eval('.dt-tooltip', (els) => els.length).catch(() => 0);

await page.hover('.dt-nav-link');
await sleep(500);
check(
	'an expanded rail shows no tooltip',
	(await count()) === 0,
	'the label is already visible',
);

await page.click(TOGGLE);
await sleep(600);
await page.hover('.dt-nav-link');
await sleep(600);

const shown = await page.evaluate(() => {
	const tip = document.querySelector('.dt-tooltip');
	if (!tip) return null;
	const rect = tip.getBoundingClientRect();
	return {
		text: tip.textContent.trim(),
		side: tip.dataset.side,
		state: tip.dataset.state,
		x: Math.round(rect.x),
		width: Math.round(rect.width),
		inBody: tip.parentElement === document.body,
		background: getComputedStyle(tip).backgroundColor,
	};
});
check('a collapsed rail shows one on hover', shown, JSON.stringify(shown));
check('naming the link it belongs to', shown?.text === 'Home', shown?.text);
check('placed to the side', shown?.side === 'right', shown?.side);
check('portalled to the body', shown?.inBody);
check(
	'positioned clear of the rail',
	shown && shown.x > 0 && shown.width > 0,
	`x=${shown?.x} w=${shown?.width}`,
);
check(
	'and painted, not transparent',
	shown?.background !== 'rgba(0, 0, 0, 0)',
	shown?.background,
);

await page.mouse.move(900, 500);
await sleep(900);
check(
	'moving away unmounts it rather than hiding it',
	(await count()) === 0,
	'without the exit keyframes this stays at 1 forever',
);

await page.evaluate(() => document.querySelector('.dt-nav-link').focus());
await sleep(500);
check('keyboard focus opens it too', (await count()) === 1, `${await count()}`);

await page.evaluate(() => document.activeElement.blur());
await sleep(900);
check('and blur closes it', (await count()) === 0);

// tooltip's subtree dies on rail expand
await page.hover('.dt-nav-link');
await sleep(500);
await page.click(TOGGLE);
await sleep(800);
check(
	'expanding the rail mid-hover tears down cleanly',
	await page.$('.dt-nav-label'),
	'console errors would have failed above',
);

await finish(browser);
