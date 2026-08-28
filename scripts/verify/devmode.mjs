import { launch, visit, check, sleep, finish } from './harness.mjs';

const NAME = 'Ocean Sunset!!';
const IMPORTED = ['#1a2744', '#2c4a7c', '#c9a227', '#f4e4ba'];

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1300 },
});
await visit(page, '/tools/palette-genny');

const panel = () => page.$('.dt-export-panel');
const json = () =>
	page.$eval('.dt-export-json pre', (el) => el.textContent.trim());
const parsed = async () => {
	try {
		return JSON.parse((await json()).replace(/,$/, ''));
	} catch {
		return null;
	}
};

check(
	'the panel is hidden by default',
	!(await panel()),
	'nothing links to it',
);

await page.keyboard.press('KeyP');
await sleep(400);
check('P opens it', await panel());
check('with no JSON until it is named', !(await page.$('.dt-export-json')));
check(
	'and the import button disabled',
	await page.$eval('.dt-export-import-row button', (el) => el.disabled),
);
await page.type('#dt-export-name', NAME);
await sleep(400);
check(
	'the name is slugged into an id',
	(await page.$eval('.dt-export-note code', (el) =>
		el.textContent.trim(),
	)) === 'ocean-sunset',
	await page.$eval('.dt-export-note code', (el) => el.textContent.trim()),
);

const named = await json();
const entry = await parsed();
check('the JSON parses', entry !== null, named.slice(0, 60));
check(
	'it carries the id and the untouched name',
	entry?.id === 'ocean-sunset' && entry?.name === NAME,
	`${entry?.id} / ${entry?.name}`,
);
check(
	'and the palette on screen',
	entry?.colors?.join() ===
		(
			await page.$$eval('.dt-swatch-value', (els) =>
				els.map((el) => el.textContent.trim()),
			)
		).join(),
	entry?.colors?.join(' '),
);
// paste into array literal
check('it ends with a comma', named.endsWith(','), named.slice(-20));

await page.select('#dt-export-cat', 'keycaps');
await sleep(400);
check(
	'the category select reaches the JSON',
	(await parsed())?.category === 'keycaps',
	(await parsed())?.category,
);
await page.type(
	'#dt-export-import',
	IMPORTED.map((h) => h.slice(1)).join('\n'),
);
await sleep(300);
check(
	'text enables the import button',
	!(await page.$eval(
		'.dt-export-import-row button',
		(el) => el.disabled,
	)),
);

await page.click('.dt-export-import-row button');
await sleep(500);
const swatches = await page.$$eval('.dt-swatch-value', (els) =>
	els.map((el) => el.textContent.trim().toLowerCase()),
);
check(
	'the palette is replaced by the imported colours',
	swatches.join() === IMPORTED.join(),
	swatches.join(' '),
);
check(
	'the textarea is emptied',
	(await page.$eval('#dt-export-import', (el) => el.value)) === '',
	await page.$eval('#dt-export-import', (el) => el.value),
);
check(
	'and the JSON follows the import',
	(await parsed())?.colors?.join() === IMPORTED.join(),
	(await parsed())?.colors?.join(' '),
);
await page.keyboard.press('KeyP');
await sleep(400);
check('P closes it again', !(await panel()));
check(
	'the imported palette outlives the panel',
	(
		await page.$$eval('.dt-swatch-value', (els) =>
			els.map((el) => el.textContent.trim().toLowerCase()),
		)
	).join() === IMPORTED.join(),
);

await finish(browser);
