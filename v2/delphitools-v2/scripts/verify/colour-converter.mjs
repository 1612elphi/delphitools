// colour-converter, and with it the vendored select.
//
// The select is the point: upstream shipped it with no keyboard handling at
// all, so the arrows, Enter, Escape and the focus return are local additions
// and nothing but a real browser proves they work.

import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/colour-converter');

const rows = () =>
	page.$$eval('.dt-cc-row', (els) =>
		els.map((el) => ({
			name: el
				.querySelector('.dt-cc-name')
				?.textContent.trim(),
			out: el.querySelector('.dt-cc-out')?.textContent.trim(),
		})),
	);

const trigger = '.dt-cc-field .dt-select-trigger';
const value = () => page.$eval('.dt-cc-value', (el) => el.value);
const openContent = () => page.$('.dt-select-content');

// ── the conversion table ────────────────────────────────────────────────────

const initial = await rows();
check('eight formats listed', initial.length === 8, `${initial.length}`);
check(
	'the default colour converts',
	initial[0]?.out === '#3b82f6' &&
		initial[1]?.out === 'rgb(59, 130, 246)' &&
		initial[3]?.out === 'hsl(217.2, 91.2%, 59.8%)',
	initial
		.slice(0, 4)
		.map((r) => r.out)
		.join(' | '),
);

await page.$eval('.dt-cc-value', (el) => {
	el.value = 'nonsense';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
check('unparseable input empties the table', !(await page.$('.dt-cc-row')));
check('and says so', await page.$('.dt-cc-empty'));

await page.$eval('.dt-cc-value', (el) => {
	el.value = '#ff0000';
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
check(
	'recovers on valid input',
	(await rows())[1]?.out === 'rgb(255, 0, 0)',
	(await rows())[1]?.out,
);

// ── the select, by pointer ──────────────────────────────────────────────────

check('closed to begin with', !(await openContent()));
await page.click(trigger);
await sleep(200);
check('clicking the trigger opens the listbox', await openContent());
check(
	'the listbox is focused',
	await page.evaluate(
		() =>
			document.activeElement?.classList.contains(
				'dt-select-content',
			) ?? false,
	),
);
check(
	'trigger reports expanded',
	(await page.$eval(trigger, (el) =>
		el.getAttribute('aria-expanded'),
	)) === 'true',
);
check(
	'the current format is marked selected',
	(
		await page.$$eval('.dt-select-item', (els) =>
			els
				.filter(
					(el) =>
						el.getAttribute(
							'aria-selected',
						) === 'true',
				)
				.map((el) => el.textContent.trim()),
		)
	).join() === 'HEX',
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-select-item')]
		.find((el) => el.textContent.trim() === 'HSL')
		.click();
});
await sleep(250);
check('picking an item closes the listbox', !(await openContent()));
check(
	'the trigger shows the new format',
	(await page.$eval(trigger, (el) => el.textContent.trim())) === 'HSL',
);
check(
	'the input is rewritten in that format',
	(await value()) === 'hsl(0.0, 100.0%, 50.0%)',
	await value(),
);
check(
	'and the colour is unchanged',
	(await rows())[0]?.out === '#ff0000',
	(await rows())[0]?.out,
);

// ── the select, by keyboard ─────────────────────────────────────────────────

await page.focus(trigger);
await page.keyboard.press('ArrowDown');
await sleep(200);
check('ArrowDown on the trigger opens the listbox', await openContent());

const active = () =>
	page.$eval('.dt-select-item[data-active="true"]', (el) =>
		el.textContent.trim(),
	);
check(
	'the active item starts on the current value',
	(await active()) === 'HSL',
);

await page.keyboard.press('ArrowDown');
await sleep(80);
check(
	'ArrowDown moves down the list',
	(await active()) === 'LAB',
	await active(),
);
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
await sleep(80);
check('ArrowUp moves back', (await active()) === 'Decimal RGB', await active());
await page.keyboard.press('Home');
await sleep(80);
check('Home jumps to the first', (await active()) === 'HEX');
await page.keyboard.press('End');
await sleep(80);
check('End jumps to the last', (await active()) === 'OKLCH');

await page.keyboard.press('Enter');
await sleep(250);
check('Enter selects the active item', !(await openContent()));
check(
	'the selection took',
	(await page.$eval(trigger, (el) => el.textContent.trim())) === 'OKLCH',
);
check(
	'focus returned to the trigger',
	await page.evaluate(
		() =>
			document.activeElement?.classList.contains(
				'dt-select-trigger',
			) ?? false,
	),
);

await page.keyboard.press('ArrowDown');
await sleep(200);
check('reopens', await openContent());
await page.keyboard.press('Escape');
await sleep(250);
check('Escape closes without selecting', !(await openContent()));
check(
	'and leaves the format alone',
	(await page.$eval(trigger, (el) => el.textContent.trim())) === 'OKLCH',
);
check(
	'and returns focus to the trigger',
	await page.evaluate(
		() =>
			document.activeElement?.classList.contains(
				'dt-select-trigger',
			) ?? false,
	),
);

// The listbox unmounts on animationend. Without the keyframes in app.scss it
// would stay in the DOM forever, which is how the tooltip and popover broke.
check(
	'the closed listbox is gone from the DOM, not just hidden',
	await page.evaluate(
		() => !document.querySelector('.dt-select-content'),
	),
);

// ── navigating away must not throw from a teardown ──────────────────────────

await page.click(trigger);
await sleep(150);
await page.evaluate(() => {
	document.querySelector(
		'.dt-nav-link[href="/tools/palette-genny"]',
	)?.click();
});
await sleep(600);
check(
	'leaving with the listbox open tears down cleanly',
	await page.$('.dt-palette-frame'),
	'console errors would have failed above',
);

await finish(browser);
