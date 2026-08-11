// The front-page omnibox: search, microtool answer rows, colour carry,
// file-drop routing, ⌘K focus.
//
// Usage: npm start, then node scripts/verify/omnibox.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/');

async function type(value) {
	await page.evaluate((v) => {
		const input = document.querySelector('.dt-omni-input');
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			'value',
		).set.call(input, v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	// debounce (120ms) plus the dynamic import of the answering tool chunk
	await sleep(600);
}

const idle = await page.evaluate(() => ({
	legend: document.querySelectorAll('.dt-omni-legend > span').length,
	sections: document.querySelectorAll('.dt-section').length,
	art: document
		.querySelector('.dt-hero.is-doodle .dt-hero-art')
		?.getAttribute('src'),
}));
check('idle: legend strip with three entries', idle.legend === 3);
check('idle: catalogue sections render', idle.sections > 5, `${idle.sections}`);
check('idle: hero art renders from the manifest', !!idle.art, idle.art ?? '');

// --- search --------------------------------------------------------------
await type('palette');
const search = await page.evaluate(() => ({
	title: document
		.querySelector('.dt-section-title')
		?.textContent.trim()
		.replace(/\s+/g, ' '),
	cells: document.querySelectorAll('.dt-section:first-of-type .dt-cell')
		.length,
	dimmed: !!document.querySelector('.dt-omni-catalogue.is-dimmed'),
}));
check(
	'search: Matches section leads with palette hits',
	search.title?.startsWith('Matches') && search.cells >= 3,
	`${search.title} / ${search.cells} cells`,
);
check('search: catalogue dims while filtering', search.dimmed);

// --- colour --------------------------------------------------------------
await type('#2E7D32');
const colour = await page.evaluate(() => {
	const rows = [...document.querySelectorAll('.dt-omni-row')];
	const names = rows.map((r) =>
		r.querySelector('.dt-omni-row-name')?.textContent.trim(),
	);
	const shadeRow = rows.find((r) =>
		r
			.querySelector('.dt-omni-row-name')
			?.textContent.includes('Tailwind'),
	);
	const carryTitle = [...document.querySelectorAll('.dt-section-title')]
		.map((t) => t.textContent.trim().replace(/\s+/g, ' '))
		.find((t) => t.startsWith('Takes a colour'));
	return {
		names,
		swatches: shadeRow?.querySelectorAll('.dt-omni-swatches i')
			.length,
		carryTitle,
		carryLink: document
			.querySelector('.dt-section .dt-cell')
			?.getAttribute('href'),
		chip: document
			.querySelector('.dt-cell-carry')
			?.textContent.trim(),
	};
});
check(
	'colour: atlas leads the answer rows',
	colour.names[0] === 'Colour Atlas',
	colour.names.join(', '),
);
check('colour: shade strip has 11 swatches', colour.swatches === 11);
check(
	'colour: carry section links with ?color=',
	!!colour.carryTitle && /color=2e7d32/.test(colour.carryLink ?? ''),
	colour.carryLink ?? 'no link',
);
check('colour: carry chip names the value', colour.chip === '→ #2e7d32');

// --- unit / expression ---------------------------------------------------
await type('18px');
const unit = await page.evaluate(() =>
	[...document.querySelectorAll('.dt-omni-row-val')].map((el) =>
		el.textContent.trim(),
	),
);
check(
	'unit: 18px answers 1.125rem',
	unit.some((v) => v.startsWith('1.125rem')),
	unit.join(' | '),
);

await type('2*(3+4)^2');
// mathjs is the heaviest on-demand chunk; its first dev-server fetch can
// outlast the type() settle sleep.
const expr = await page
	.waitForFunction(
		() =>
			document
				.querySelector('.dt-omni-row-val')
				?.textContent.trim() === '98',
		{ timeout: 30000 },
	)
	.then(() => '98')
	.catch(() =>
		page.evaluate(
			() =>
				document
					.querySelector('.dt-omni-row-val')
					?.textContent.trim() ?? '',
		),
	);
check('expression: evaluates to 98', expr === '98', expr);

// --- file drop -----------------------------------------------------------
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(
		new File(['x'], 'IMG_2041.png', { type: 'image/png' }),
	);
	document.querySelector('.dt-omni').dispatchEvent(
		new DragEvent('drop', {
			dataTransfer: transfer,
			bubbles: true,
		}),
	);
});
await sleep(200);
const file = await page.evaluate(() => ({
	name: document
		.querySelector('.dt-omni-file-name')
		?.textContent.trim(),
	meta: document
		.querySelector('.dt-omni-file-meta')
		?.textContent.trim(),
	cells: document.querySelectorAll('.dt-section:first-of-type .dt-cell')
		.length,
}));
check(
	'file: bar shows name and type',
	file.name === 'IMG_2041.png' && file.meta?.startsWith('PNG'),
	`${file.name} / ${file.meta}`,
);
check('file: catalogue filters to image tools', file.cells >= 8, `${file.cells}`);

await page.click('.dt-omni-clear');
await sleep(100);
check(
	'file: clear restores the field',
	await page.evaluate(() => !!document.querySelector('.dt-omni-input')),
);

// --- ⌘K ------------------------------------------------------------------
await page.keyboard.down('Meta');
await page.keyboard.press('k');
await page.keyboard.up('Meta');
const focused = await page.evaluate(() =>
	document.activeElement?.classList.contains('dt-omni-input'),
);
check('⌘K focuses the field', focused === true);

await finish(browser);
