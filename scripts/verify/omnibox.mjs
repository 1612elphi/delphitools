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

// --- remaining microtools ------------------------------------------------
async function rowFor(name) {
	return page.evaluate((n) => {
		const row = [...document.querySelectorAll('.dt-omni-row')].find(
			(r) =>
				r
					.querySelector('.dt-omni-row-name')
					?.textContent.trim()
					.includes(n),
		);
		return row
			? {
					name: row
						.querySelector('.dt-omni-row-name')
						?.textContent.trim(),
					value: row
						.querySelector('.dt-omni-row-val')
						?.textContent.trim(),
					hasImage: !!row.querySelector('.dt-omni-thumb'),
				}
			: null;
	}, name);
}

async function waitForRow(name, timeout = 10000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const row = await rowFor(name);
		if (row) return row;
		await sleep(100);
	}
	return null;
}

await type('red');
check(
	'named colour: red reads as a colour',
	(await waitForRow('Colour Atlas')) !== null,
);

await type('5km');
const unitRow = await waitForRow('Unit Converter');
check(
	'general unit: 5km reads as unit converter',
	unitRow?.value.includes('m'),
	unitRow?.value,
);

await type('A4');
const paperRow = await waitForRow('Paper Sizes');
check(
	'paper size: A4 shows dimensions',
	paperRow?.value.includes('210'),
	paperRow?.value,
);

await type('m-4');
const tailwindRow = await waitForRow('Tailwind');
check(
	'tailwind: m-4 maps to css',
	tailwindRow?.value.includes('margin'),
	tailwindRow?.value,
);

await type('U+1F600');
const glyphRow = await waitForRow('Glyph Browser');
check(
	'glyph: U+1F600 shows the codepoint',
	glyphRow?.value.includes('U+1F600'),
	glyphRow?.value,
);

await type('aGVsbG8gd29ybGQ=');
const encRow = await waitForRow('Encoding Tools');
check(
	'encoding: base64 paste decodes',
	encRow?.value.includes('hello world'),
	encRow?.value,
);

await type('hello world');
check(
	'shavian: two english words transliterate',
	(await waitForRow('Shavian')) !== null,
);

await type('https://example.com');
const qrRow = await waitForRow('QR');
check(
	'qr: url produces a preview image',
	qrRow?.hasImage,
	qrRow?.hasImage
		? 'preview rendered'
		: qrRow
			? 'image missing'
			: 'row missing',
);

await type('<svg><rect width="10" height="10"/></svg>');
const svgRow = await waitForRow('SVG');
check(
	'svg: markup shows optimisation stats',
	svgRow?.value.includes('saved'),
	svgRow?.value,
);

await type('x^2 - 4 = 0');
const algebra = await page
	.waitForFunction(
		() => {
			const row = [...document.querySelectorAll('.dt-omni-row')].find(
				(r) =>
					r
						.querySelector('.dt-omni-row-name')
						?.textContent.includes('Algebra'),
			);
			return row
				? row
						.querySelector('.dt-omni-row-val')
						?.textContent.trim()
				: '';
		},
		{ timeout: 30000 },
	)
	.then((handle) => handle.jsonValue())
	.catch(() => '');
check(
	'algebra: equation solves',
	algebra?.includes('2'),
	algebra,
);

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
