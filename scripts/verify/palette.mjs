// palette-genny: generate, lock, the count stepper, and the strategy combobox.
//
// The combobox is the reason this rig exists. It stacks the vendored popover on
// the vendored command list, and neither renders at all until a real click has
// opened a portal, so nothing short of a browser proves the strategy changes.

import { launch, visit, check, sleep, finish } from './harness.mjs';

// Counted from the registry rather than pinned, so adding a strategy does not
// fail this rig. Node 26 strips the types, the same trick prerender.mjs uses.
const { STRATEGY_CATEGORIES, STRATEGY_INFO } =
	await import('../../app/lib/palette-strategies.ts');
const CATEGORY_COUNT = Object.keys(STRATEGY_CATEGORIES).length;
const STRATEGY_COUNT = Object.keys(STRATEGY_INFO).length;

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1200 },
});
await visit(page, '/tools/palette-genny');

// The inline style, not .dt-swatch-value: the caption is rewritten by whatever
// notation the header is set to, the fill is always the raw hex.
const fills = () =>
	page.$$eval('.dt-swatch-colour', (els) =>
		els.map((el) => el.getAttribute('style')),
	);
const strategyName = () =>
	page.$eval('.dt-strategy-name', (el) => el.textContent.trim());
const commandOpen = () => page.$('.dt-command');

// ── what the tool opens with ────────────────────────────────────────────────

check(
	'the page is the palette tool',
	(await page.$eval('.dt-tool-header h1', (el) =>
		el.textContent.trim(),
	)) === 'Palette Generator',
);

const initial = await fills();
check('five swatches by default', initial.length === 5, `${initial.length}`);
check(
	'the list mirrors the swatches',
	(await page.$$eval('.dt-colour-row', (els) => els.length)) ===
		initial.length,
);
check(
	'every fill is a hex colour',
	initial.every((s) => /^background-color:\s*#[\da-f]{6};?$/i.test(s)),
	initial.join(' '),
);
check(
	'the strategy opens on Random',
	(await strategyName()) === 'Random',
	await strategyName(),
);

const captions = await page.$$eval('.dt-swatch-value', (els) =>
	els.map((el) => el.textContent.trim()),
);
check(
	'captions read as hex',
	captions.length === initial.length &&
		captions.every((v) => /^#[\da-f]{6}$/i.test(v)),
	captions.join(' '),
);
const names = await page.$$eval('.dt-swatch-name', (els) =>
	els.map((el) => el.textContent.trim()),
);
check(
	'every swatch is named',
	names.length === initial.length && names.every((n) => n.length > 0),
	names.slice(0, 3).join(' / '),
);

// ── generate ────────────────────────────────────────────────────────────────

await page.click('.dt-generate');
await sleep(400);
const generated = await fills();
check(
	'generate replaces the palette',
	generated.join() !== initial.join(),
	generated.join(' '),
);
check('and keeps the count', generated.length === initial.length);

// ── lock ────────────────────────────────────────────────────────────────────

await page.click('.dt-swatch .dt-swatch-btn');
await sleep(250);
check(
	'locking marks the button',
	await page.$('.dt-swatch .dt-swatch-btn.is-locked'),
);
check(
	'and puts a lock on the fill',
	await page.$('.dt-swatch .dt-swatch-lock'),
);

const locked = (await fills())[0];
await page.click('.dt-generate');
await sleep(400);
const afterLock = await fills();
check(
	'a locked swatch survives generate',
	afterLock[0] === locked,
	`${locked} -> ${afterLock[0]}`,
);
check(
	'the rest still change',
	afterLock.slice(1).join() !== generated.slice(1).join(),
);

await page.click('.dt-swatch .dt-swatch-btn');
await sleep(250);
check(
	'unlocking clears the mark',
	!(await page.$('.dt-swatch .dt-swatch-btn.is-locked')),
);

// ── the count stepper ───────────────────────────────────────────────────────

const before = (await fills()).length;
await page.click('.dt-count button:last-child');
await sleep(300);
const added = (await fills()).length;
check('plus adds one swatch', added === before + 1, `${before} -> ${added}`);
// Direct child: each stepper button holds an icon <span> of its own.
check(
	'the stepper reports the new count',
	(await page.$eval('.dt-count > span', (el) =>
		el.textContent.trim(),
	)) === `${added}`,
);

await page.click('.dt-count button:first-child');
await sleep(300);
const removed = (await fills()).length;
check('minus takes it back', removed === before, `${added} -> ${removed}`);

// ── the strategy combobox ───────────────────────────────────────────────────

check('the command list starts closed', !(await commandOpen()));
await page.click('.dt-strategy');
await sleep(600);
check('clicking the strategy opens the command list', await commandOpen());
check(
	'one group per strategy category',
	(await page.$$eval('.dt-command-group', (els) => els.length)) ===
		CATEGORY_COUNT,
	`${await page.$$eval('.dt-command-group', (els) => els.length)} of ${CATEGORY_COUNT}`,
);
check(
	'every strategy is listed',
	(await page.$$eval('.dt-command-item', (els) => els.length)) ===
		STRATEGY_COUNT,
	`${await page.$$eval('.dt-command-item', (els) => els.length)} of ${STRATEGY_COUNT}`,
);
check(
	'the current strategy is ticked',
	(
		await page.$$eval('.dt-command-item', (els) =>
			els
				.filter((el) =>
					el.querySelector(
						'.dt-strategy-check.is-on',
					),
				)
				.map((el) =>
					el
						.querySelector(
							'.dt-strategy-name',
						)
						.textContent.trim(),
				),
		)
	).join() === 'Random',
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-command-item')]
		.find(
			(el) =>
				el
					.querySelector('.dt-strategy-name')
					?.textContent.trim() === 'Analogous',
		)
		.click();
});
await sleep(500);
check('picking a strategy closes the list', !(await commandOpen()));
check(
	'the trigger shows the new strategy',
	(await strategyName()) === 'Analogous',
	await strategyName(),
);
check(
	'and its description follows',
	(await page.$eval('.dt-strategy-desc', (el) =>
		el.textContent.trim(),
	)) === 'Adjacent hues on the colour wheel',
);

const beforeStrategy = await fills();
await page.click('.dt-generate');
await sleep(400);
const afterStrategy = await fills();
check(
	'generate still works on the new strategy',
	afterStrategy.join() !== beforeStrategy.join(),
	afterStrategy.join(' '),
);

await page.click('.dt-strategy');
await sleep(600);
check(
	'reopening ticks the strategy that was chosen',
	(
		await page.$$eval('.dt-command-item', (els) =>
			els
				.filter((el) =>
					el.querySelector(
						'.dt-strategy-check.is-on',
					),
				)
				.map((el) =>
					el
						.querySelector(
							'.dt-strategy-name',
						)
						.textContent.trim(),
				),
		)
	).join() === 'Analogous',
);

await finish(browser);
