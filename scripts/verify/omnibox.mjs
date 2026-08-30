import { readFileSync } from 'node:fs';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const VERSION = JSON.parse(
	readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;

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
	// debounce 120ms, chunk import
	await sleep(600);
}

const idle = await page.evaluate(() => ({
	legend: document.querySelectorAll('.dt-omni-legend-btn').length,
	sections: document.querySelectorAll('.dt-section').length,
	art: document
		.querySelector('.dt-hero.is-doodle .dt-hero-art')
		?.getAttribute('src'),
}));
check('idle: legend strip with three entries', idle.legend === 3);
check('idle: catalogue sections render', idle.sections > 5, `${idle.sections}`);
check('idle: hero art renders from the manifest', !!idle.art, idle.art ?? '');

await type('palette');
// chunks load on demand
await page.waitForFunction(
	() => !!document.querySelector('.dt-omni-catalogue.is-dimmed'),
	{ timeout: 10000 },
);
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

// app/controllers/tools/tool.ts declares color param
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-omni-open')]
		.find((a) => a.getAttribute('href')?.includes('colour-converter'))
		?.click(),
);
await page.waitForSelector('.dt-cc-value', { timeout: 15000 });
const landed = await page.evaluate(() => ({
	search: location.search,
	value: document.querySelector('.dt-cc-value')?.value,
}));
check(
	'colour: the converter opens on the carried colour',
	landed.search === '?color=2e7d32' && landed.value === '#2e7d32',
	JSON.stringify(landed),
);
await visit(page, '/');

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
// mathjs chunk loads slowly
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

await page.keyboard.down('Meta');
await page.keyboard.press('k');
await page.keyboard.up('Meta');
const focused = await page.evaluate(() =>
	document.activeElement?.classList.contains('dt-omni-input'),
);
check('⌘K focuses the field', focused === true);

await visit(page, '/');
const legend = await page.$$eval('.dt-omni-legend-btn', (buttons) =>
	buttons.map((b) => b.textContent?.replace(/\s+/g, ' ').trim()),
);
check(
	'legend: three actions under the box',
	legend.join('|') === "Choose a file|Paste from clipboard|I'm feeling lucky",
	legend.join('|'),
);
const pill = await page.$eval('.dt-hero-pill', (el) =>
	el.textContent.replace(/\s+/g, ' ').trim(),
);
check(
	'the 2.0 pill above the hero art',
	pill === 'welcome to delphitools 2.0!',
	pill,
);
await page.click('.dt-hero-pill');
await sleep(200);
check(
	"pill opens the what's-new dialog",
	await page.$eval('.dt-wn', (el) => el.open),
);
for (let i = 0; i < 3; i++) {
	await page.evaluate(() =>
		[...document.querySelectorAll('.dt-wn-btn')]
			.find((b) => b.textContent.trim() === 'Next')
			?.click(),
	);
}
await sleep(100);
const lastBtn = await page.$eval('.dt-wn-btn.is-primary', (el) =>
	el.textContent.trim(),
);
check("the last slide ends on let's go", lastBtn === 'let\u2019s go', lastBtn);
await page.click('.dt-wn-btn.is-primary');
await sleep(200);
check('closing returns to the page', await page.$eval('.dt-wn', (el) => !el.open));
check(
	'two pills above the hero art',
	(await page.$$('.dt-hero-pill')).length === 2,
);
const second = await page.$$eval('.dt-hero-pill', (els) =>
	els[1].textContent.replace(/\s+/g, ' ').trim(),
);
check("the second pill reads what's new?", second === "what's new?", second);
await page.$$eval('.dt-hero-pill', (els) => els[1].click());
await sleep(200);
check('it opens the changelog popup', await page.$eval('.dt-cl', (el) => el.open));
check(
	'with the current version picked in the title',
	await page.$eval('.dt-cl-version', (el, v) => el.value === v, VERSION),
	VERSION,
);
await page.select('.dt-cl-version', '2.0.0');
await sleep(100);
check(
	'picking an older version switches the release',
	await page.$eval('.dt-cl-version', (el) => el.value === '2.0.0'),
);
check(
	'tool entries carry a badge and a link',
	(await page.$$('.dt-cl-tool .dt-cl-badge')).length > 0,
);
check('and three tabs', (await page.$$('.dt-cl-tab')).length === 3);
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-cl-tab')]
		.find((b) => b.textContent.trim() === 'Technical')
		?.click(),
);
await sleep(100);
check(
	'tabs switch',
	await page.$eval(
		'.dt-cl-tab[aria-selected="true"]',
		(el) => el.textContent.trim() === 'Technical',
	),
);
await page.click('.dt-cl-close');
await sleep(200);
check(
	'the changelog closes',
	await page.$eval('.dt-cl', (el) => !el.open),
);
await page.click('.dt-omni-legend-btn:last-child');
await page.waitForFunction(() => location.pathname !== '/', { timeout: 10000 });
check(
	'legend: feeling lucky opens a tool page',
	await page.evaluate(() => /^\/(tools\/|editor|workflows)/.test(location.pathname)),
	await page.evaluate(() => location.pathname),
);

await finish(browser);
