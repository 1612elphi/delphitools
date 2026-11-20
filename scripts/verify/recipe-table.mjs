import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
// headless blocks on confirm()
page.on('dialog', (d) => void d.accept());

await page.evaluateOnNewDocument(() =>
	localStorage.removeItem('dt-recipe-text'),
);
await visit(page, '/tools/recipe-table');
await page.waitForSelector('.rt-grid');
await sleep(200);

const shell = await page.evaluate(() => {
	const slot = document.querySelector('.dt-canon-tool');
	const split = slot?.querySelector('.canon-split');
	const a = slot?.getBoundingClientRect();
	const b = split?.getBoundingClientRect();
	return {
		fills:
			!!a &&
			!!b &&
			Math.abs(a.height - b.height) < 2 &&
			b.width > 0,
		docScroll:
			document.scrollingElement.scrollHeight >
			window.innerHeight,
		picture: document
			.querySelector('.canon-split-sidebar .rt-picture')
			?.getAttribute('aria-label'),
		editor: !!document.querySelector('.canon-split-main .media-marked-source'),
	};
});
check('the split fills the slot', shell.fills);
check('the document does not scroll', !shell.docScroll);
check('the table is the named picture', shell.picture === 'Recipe Table', shell.picture);
check('the editor is in the settings pane', shell.editor);

const read = () =>
	page.evaluate(() => {
		const cell = (r, c) =>
			[...document.querySelectorAll('.rt-cell')].find(
				(el) =>
					el.style.gridArea.startsWith(
						`${r + 1} / ${c + 1} /`,
					),
			);
		// banners offset tree rows
		const off = document.querySelectorAll(
			'.rt-cell.is-banner',
		).length;
		const label = (r, c) =>
			cell(off + r, c)?.querySelector('.rt-label')
				?.textContent ?? null;
		return {
			title: document.querySelector('.rt-title')
				?.textContent,
			notes: [
				...document.querySelectorAll('.rt-notes li'),
			].map((li) => li.textContent),
			banners: [
				...document.querySelectorAll('.rt-cell.is-banner'),
			].map((el) => el.textContent.trim()),
			steps: document.querySelectorAll('.rt-cell.is-step')
				.length,
			refs: document.querySelectorAll('.rt-cell.is-ref')
				.length,
			problems: [
				...document.querySelectorAll('.rt-problem'),
			].map((li) => li.textContent.trim()),
			ingredients: [
				...document.querySelectorAll('.rt-shopping li'),
			].map((li) => li.textContent.trim().replace(/\s+/g, ' ')),
			spaghetti: label(0, 0),
			boil: label(0, 1),
			drain: label(0, 2),
			fry: label(2, 2),
			serve: label(0, 5),
			drainRows: cell(off, 2)?.style.gridArea,
		};
	});

const first = await read();
check('the title renders', first.title === 'Aglio e olio', first.title);
check(
	'the preamble note spans the head of the table',
	first.banners[0] === 'Salt a large pot of water',
	first.banners.join(' / '),
);
check(
	'and is not in the numbered list',
	first.notes.length === 0,
	first.notes.join(' / '),
);
check('the sample has no problems', first.problems.length === 0, first.problems.join(' | '));
check('column 0 holds the leaves', first.spaghetti === '200 g spaghetti', first.spaghetti);
check('the chain marches right', first.boil === 'boil', first.boil);
check('and keeps going', first.drain === 'drain', first.drain);
check(
	'the named chain is inlined beside it',
	first.fry === 'fry',
	first.fry,
);
check('the last chain is the root', first.serve === 'serve', first.serve);
check(
	'a same-chain name stays a link row',
	first.refs === 1,
	String(first.refs),
);
check(
	'the shopping list is generated from the leaves',
	first.ingredients.length === 7,
	String(first.ingredients.length),
);
check(
	'and sums an ingredient used twice',
	first.ingredients.includes('olive oil 3 Tbsp'),
	first.ingredients.join(' | '),
);

const syntax = await page.evaluate(() => {
	const marks = document.querySelector('.rt-editor .media-marked-marks');
	const source = document.querySelector('.rt-editor .media-marked-source');
	const lines = [...marks.querySelectorAll('.media-marked-text')].map(
		(el) => el.textContent,
	);
	const colour = (selector) => {
		const el = marks.querySelector(selector);
		return el ? getComputedStyle(el).color : null;
	};
	return {
		same: lines.map((l) => l.trimEnd()).join('\n') === source.value.split('\n').map((l) => l.trimEnd()).join('\n'),
		step: marks.querySelector('.rt-t--step')?.textContent,
		quantity: marks.querySelector('.rt-t--quantity')?.textContent,
		name: marks.querySelector('.rt-t--name')?.textContent,
		stepColour: colour('.rt-t--step'),
		plainColour: colour('.rt-t--ingredient'),
		quantityColour: colour('.rt-t--quantity'),
	};
});
check('syntax: the marks spell the script', syntax.same);
check('syntax: steps, quantities and names are runs', syntax.step === 'fry ' && syntax.quantity === ' 2 Tbsp' && syntax.name === ' sauce', `${syntax.step}|${syntax.quantity}|${syntax.name}`);
check(
	'syntax: steps and quantities take their own colours',
	syntax.stepColour !== syntax.plainColour &&
		syntax.quantityColour !== syntax.plainColour &&
		syntax.stepColour !== syntax.quantityColour,
	`${syntax.stepColour} ${syntax.quantityColour} ${syntax.plainColour}`,
);

const type = async (text) => {
	await page.click('.media-marked-source');
	await page.evaluate(() => {
		const el = document.querySelector('.media-marked-source');
		el.focus();
		el.setSelectionRange(0, el.value.length);
	});
	await page.keyboard.press('Backspace');
	await page.type('.media-marked-source', text);
	await sleep(250);
};

await type('mix\n- flour: 200 g\n- water: 120 ml');
const simple = await read();
check('a one-step recipe renders', simple.steps === 1, String(simple.steps));
check(
	'the caret survives typing',
	await page.evaluate(
		() => document.activeElement === document.querySelector('.media-marked-source'),
	),
);

await type('boil\n- water: 1 l\n\nserve\n- rice: 200 g');
const orphan = await read();
check(
	'an unreferenced chain is reported',
	orphan.problems.some((p) => p.includes('unused chain')),
	orphan.problems.join(' | '),
);

await type('bake\n@ dough');
check(
	'the line a problem names is tinted in the editor',
	await page.evaluate(
		() =>
			document.querySelector('.media-marked-line--lit .media-marked-gutter')
				?.textContent === '2',
	),
);
const unknown = await read();
check(
	'an unknown name is reported',
	unknown.problems.some((p) => p.includes('unknown name: dough')),
	unknown.problems.join(' | '),
);

await type('serves: 2\n\nboil | 9 min\n- spaghetti: 200 g');
await page.focus('.rt-amount');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowDown');
check(
	'the scale field steps with the arrow keys',
	(await page.$eval('.rt-amount', (el) => el.value)) === '2',
	await page.$eval('.rt-amount', (el) => el.value),
);
const source = await page.evaluate(
	() => document.querySelector('.media-marked-source').value,
);
await page.evaluate(() =>
	document.querySelector('.rt-scale .canon-stepper-plus').click(),
);
await sleep(250);
const scaled = await read();
check(
	'scaling lifts the cell',
	scaled.spaghetti === '300 g spaghetti',
	scaled.spaghetti,
);
check(
	'and the shopping list with it',
	scaled.ingredients.includes('spaghetti 300 g'),
	scaled.ingredients.join(' | '),
);
check(
	'and leaves the source alone',
	(await page.evaluate(
		() => document.querySelector('.media-marked-source').value,
	)) === source,
);

await page.evaluate(() =>
	[...document.querySelectorAll('.rt-units [role="radio"]')]
		.find((b) => b.textContent.trim() === 'Imperial')
		.click(),
);
await sleep(250);
check(
	'units convert in the cell',
	!(await read()).spaghetti.includes(' g '),
	(await read()).spaghetti,
);
check(
	'and still leave the source alone',
	(await page.evaluate(
		() => document.querySelector('.media-marked-source').value,
	)) === source,
);

await page.evaluate(() =>
	document.querySelector('.rt-cell.is-step').click(),
);
await sleep(150);
check(
	'a step ticks off',
	await page.evaluate(
		() =>
			document
				.querySelector('.rt-cell.is-step')
				.getAttribute('aria-pressed') === 'true',
	),
);

await type('title: Kept\n\nmix\n- flour: 200 g');
check(
	'the document is stored as text',
	(await page.evaluate(() => localStorage.getItem('dt-recipe-text'))) ===
		'title: Kept\n\nmix\n- flour: 200 g',
);

await type(
	`title: Aglio e olio

> salt the water

boil | 9 min
- 200 g spaghetti
drain
> have a little dance
serve
- parmesan`,
);
// badges keyed by area
const marks = await page.evaluate(() => {
	const byArea = new Map(
		[...document.querySelectorAll('.rt-marks')].map((m) => [
			m.style.gridArea,
			[...m.querySelectorAll('.rt-mark')].map(
				(x) => x.textContent,
			),
		]),
	);
	return [...document.querySelectorAll('.rt-cell.is-step')].map(
		(el) => ({
			label: el.querySelector('.rt-label')?.textContent,
			marks: byArea.get(el.style.gridArea) ?? [],
		}),
	);
});
check(
	'a note above the first step marks nothing',
	marks.find((m) => m.label === 'boil')?.marks.length === 0,
	JSON.stringify(marks.find((m) => m.label === 'boil')),
);
check(
	'a note between two steps marks the later one',
	marks.find((m) => m.label === 'serve')?.marks.join() === '1',
	JSON.stringify(marks.find((m) => m.label === 'serve')),
);
check(
	'a step with no note beside it stays bare',
	marks.find((m) => m.label === 'drain')?.marks.length === 0,
	JSON.stringify(marks.find((m) => m.label === 'drain')),
);
check(
	'the preamble note banners and the later one is numbered',
	await page.evaluate(
		() =>
			document.querySelectorAll('.rt-cell.is-banner')
				.length === 1 &&
			document.querySelectorAll('.rt-notes li').length ===
				1 &&
			document.querySelectorAll('.rt-mark').length === 1,
	),
);
check(
	'a badge straddles a vertical line of the table',
	await page.evaluate(() => {
		const badge = document.querySelector('.rt-mark');
		const b = badge.getBoundingClientRect();
		const mid = b.left + b.width / 2;
		return [...document.querySelectorAll('.rt-cell.is-step')].some(
			(c) => Math.abs(c.getBoundingClientRect().left - mid) < 2,
		);
	}),
);
check(
	'and nothing paints over it',
	await page.evaluate(() => {
		document
			.querySelectorAll('.rt-marks')
			.forEach((m) => (m.style.pointerEvents = 'auto'));
		const covered = [
			...document.querySelectorAll('.rt-mark'),
		].filter((m) => {
			const b = m.getBoundingClientRect();
			return [
				[b.left + 1.5, b.top + 1.5],
				[b.right - 1.5, b.top + 1.5],
				[b.left + 1.5, b.bottom - 1.5],
				[b.right - 1.5, b.bottom - 1.5],
			].some((p) => {
				const hit = document.elementFromPoint(p[0], p[1]);
				return hit !== m && !m.contains(hit);
			});
		});
		document
			.querySelectorAll('.rt-marks')
			.forEach((m) => (m.style.pointerEvents = ''));
		return covered.length === 0;
	}),
);
check(
	'badges sit outside the cells, in a layer of their own',
	await page.evaluate(
		() =>
			[...document.querySelectorAll('.rt-mark')].every(
				(m) => !m.closest('.rt-cell'),
			),
	),
);
check(
	'leaves never wear one',
	await page.evaluate(
		() =>
			document.querySelectorAll(
				'.rt-cell:not(.is-step) .rt-mark',
			).length === 0,
	),
);

const ref = await page.evaluate(async () => {
	const link = document.querySelector(
		'.rt-about a[href$=".pdf"]',
	);
	if (!link) return { found: false };
	const res = await fetch(link.getAttribute('href'));
	const head = new Uint8Array(
		(await res.arrayBuffer()).slice(0, 5),
	);
	return {
		found: true,
		text: link.textContent.trim(),
		downloads: link.hasAttribute('download'),
		status: res.status,
		magic: String.fromCharCode(...head),
	};
});
check('the about text links the reference', ref.found, ref.text ?? '');
check('the link asks to download', ref.downloads === true);
check(
	'and the file is served as a real pdf',
	ref.status === 200 && ref.magic === '%PDF-',
	`${ref.status} ${ref.magic}`,
);

// print uses exported html
await page.evaluate(() => {
	window.__frames = [];
	new MutationObserver((records) => {
		for (const record of records)
			for (const node of record.addedNodes)
				if (node.tagName === 'IFRAME')
					window.__frames.push(node.srcdoc);
	}).observe(document.body, { childList: true });
});
await page.evaluate(() =>
	document.querySelector('[data-action="pdf"]').click(),
);
await sleep(600);
const printed = await page.evaluate(() => window.__frames ?? []);
check('printing builds one document', printed.length === 1, String(printed.length));
const doc = printed[0] ?? '';
check(
	'it is a whole html document',
	doc.startsWith('<!doctype html>'),
	doc.slice(0, 30),
);
check(
	'it carries the app face',
	doc.includes('OpenSansCondensedV.woff2'),
);
check('and no iA Writer Quattro', !doc.includes('Quattro'));
check(
	'it names the saved file after the recipe',
	doc.includes('<title>Aglio e olio</title>'),
	doc.slice(doc.indexOf('<title>'), doc.indexOf('</title>') + 8),
);
check('it contains the table', doc.includes('<table'), '');
check(
	'and the numbered note it points at',
	doc.includes('1. have a little dance') && doc.includes('(1) serve'),
);
check(
	'with the preamble note as a spanning row',
	doc.includes('class="banner"') && doc.includes('salt the water'),
);
check(
	'the carrier frame is offscreen',
	await page.evaluate(() => {
		const frame = document.querySelector('.rt-print');
		if (!frame) return true;
		const box = frame.getBoundingClientRect();
		return box.width === 0 && box.height === 0;
	}),
);
check(
	'the font resolves inside the print document',
	await page.evaluate(async () => {
		const frame = document.querySelector('.rt-print');
		if (!frame) return false;
		await frame.contentWindow.document.fonts.ready;
		return frame.contentWindow.document.fonts.check(
			'10pt "Open Sans Condensed"',
		);
	}),
);

const copyWith = async (impl) => {
	await page.evaluate((body) => {
		delete window.__html;
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			// eslint-disable-next-line no-new-func
			value: new Function(`return (${body})`)(),
		});
	}, impl);
	await page.evaluate(() =>
		document.querySelector('[data-action="copy"]').click(),
	);
	await sleep(500);
	return page.evaluate(() => ({
		label: document
			.querySelector('[data-action="copy"]')
			.textContent.trim(),
		toast:
			document.querySelector('.canon-toast-live')?.textContent ??
			'',
		html: window.__html ?? null,
	}));
};

const good = await copyWith(`{
	async write(items) { window.__html = await (await items[0].getType('text/html')).text(); },
	async writeText(t) { window.__html = t; },
}`);
check(
	'copy confirms through the toast',
	good.toast.includes('Copied'),
	good.toast,
);
check(
	'and hands over a table',
	(good.html ?? '').startsWith('<table'),
	(good.html ?? '').slice(0, 40),
);

const blocked = await copyWith(`{
	async write() { throw new DOMException('denied', 'NotAllowedError'); },
	async writeText() { throw new DOMException('denied', 'NotAllowedError'); },
}`);
check(
	'a blocked clipboard says so instead of throwing',
	blocked.label === 'Copy failed',
	blocked.label,
);

await type(
	`> Butter and flour an 8x8-in pan
> Preheat oven to 170 C

melt
- butter: 115 g
mix
- sugar: 200 g
> now work fast
fold
- flour: 100 g`,
);
const banners = await page.evaluate(() => {
	const cells = [...document.querySelectorAll('.rt-cell.is-banner')];
	const cols = getComputedStyle(
		document.querySelector('.rt-grid'),
	).gridTemplateColumns.split(' ').length;
	const grid = document.querySelector('.rt-grid');
	return {
		texts: cells.map((c) => c.textContent.trim()),
		spans: cells.map((c) => c.style.gridArea),
		cols,
		firstRowIsBanner: cells.some((c) =>
			c.style.gridArea.startsWith('1 / 1 /'),
		),
		widths: cells.map(
			(c) =>
				Math.abs(
					c.getBoundingClientRect().width -
						grid.scrollWidth,
				) < 1,
		),
		listed: [
			...document.querySelectorAll('.rt-notes li'),
		].map((li) => li.textContent.trim()),
		marks: [...document.querySelectorAll('.rt-mark')].map(
			(m) => m.textContent,
		),
	};
});
check(
	'both preamble notes became banners',
	banners.texts.length === 2,
	banners.texts.join(' | '),
);
check(
	'the first one heads the table',
	banners.firstRowIsBanner,
	banners.spans.join(' | '),
);
check(
	'and each spans every column',
	banners.spans.every((a) => a.endsWith(`span ${banners.cols}`)),
	`${banners.spans.join(' | ')} of ${banners.cols}`,
);
check('measured, they fill the grid', banners.widths.every(Boolean));
check(
	'the numbered list keeps only the anchored note',
	banners.listed.length === 1 && banners.listed[0].includes('work fast'),
	banners.listed.join(' | '),
);
check(
	'and its badge is 1, because numbering skips banners',
	banners.marks.join() === '1',
	banners.marks.join(),
);

await type(
	`title: Wide

boil | 9 min
- water: 1 l
drain
x the water
simmer | until reduced by half | stirring now and then
season | with plenty of salt and coarse black pepper
rest | 10 min | off the heat
taste | adjust the seasoning again
ladle | into a jug
strain | through a fine sieve
garnish | with chopped herbs
serve | into warmed bowls`,
);
const lattice = await page.evaluate(() => {
	const pane = document.querySelector('.rt-picture');
	pane.scrollLeft = pane.scrollWidth;
	const cells = [...document.querySelectorAll('.rt-cell')];
	const px = (el, side) =>
		parseFloat(getComputedStyle(el)[`border${side}Width`]);
	return {
		overflows: pane.scrollWidth > pane.clientWidth,
		clipped:
			document.querySelector('.rt-grid').getBoundingClientRect()
				.width < pane.scrollWidth,
		allRight: cells.every((c) => px(c, 'Right') >= 1),
		allBottom: cells.every((c) => px(c, 'Bottom') >= 1),
		topOnFirstRow: cells
			.filter((c) => c.classList.contains('is-top'))
			.every((c) => px(c, 'Top') >= 1),
		noStrayTop: cells
			.filter((c) => !c.classList.contains('is-top'))
			.every((c) => px(c, 'Top') === 0),
		noStrayLeft: cells
			.filter((c) => !c.classList.contains('is-left'))
			.every((c) => px(c, 'Left') === 0),
	};
});
check('the wide table overflows its pane', lattice.overflows);
check(
	'and the grid box is narrower than its own content',
	lattice.clipped,
	'which is why the lines cannot live on it',
);
check('every cell draws its right line', lattice.allRight);
check('every cell draws its bottom line', lattice.allBottom);
check('the first row closes the top', lattice.topOnFirstRow);
check('and no interior cell doubles a line', lattice.noStrayTop);
check('nor doubles a left one', lattice.noStrayLeft);

const discard = await page.evaluate(() => {
	const el = document.querySelector('.rt-discard');
	if (!el) return null;
	const cs = getComputedStyle(el);
	return {
		text: el.textContent.replace(/\s+/g, ' ').trim(),
		decoration: cs.textDecorationLine,
		style: cs.borderRightStyle,
	};
});
check('a discard is a tag, not a strikethrough', discard?.decoration === 'none', discard?.decoration ?? 'missing');
check(
	'and it is dashed, against the solid tag a kept output gets',
	discard?.style === 'dashed',
	discard?.style ?? 'missing',
);

const picked = await page.evaluate(async () => {
	const ids = [
		...document.querySelectorAll('[data-action="example"]'),
	].map((b) => b.dataset.example);
	const out = [];
	for (const id of ids) {
		document
			.querySelector(`[data-example="${id}"]`)
			.click();
		await new Promise((r) => setTimeout(r, 120));
		out.push({
			id,
			title: document.querySelector('.rt-title')?.textContent,
			steps: document.querySelectorAll('.rt-cell.is-step')
				.length,
			problems: document.querySelectorAll('.rt-problem')
				.length,
			listed: document.querySelectorAll('.rt-shopping li')
				.length,
			category: document.querySelector(
				`[data-example="${id}"] .rt-example-category`,
			)?.textContent,
		});
	}
	return out;
});
check(
	'the gallery offers every example',
	picked.length === 16,
	String(picked.length),
);
check(
	'each one loads and draws a table',
	picked.every((p) => p.steps > 0 && p.title),
	picked.map((p) => `${p.id}:${p.steps}`).join(' '),
);
check(
	'none of them report a problem',
	picked.every((p) => p.problems === 0),
	picked.map((p) => `${p.id}:${p.problems}`).join(' '),
);
check(
	'each one lists ingredients',
	picked.every((p) => p.listed > 0),
	picked.map((p) => `${p.id}:${p.listed}`).join(' '),
);
check(
	'each card names a category',
	picked.every((p) => p.category),
	picked.map((p) => p.category).join(' | '),
);
check(
	'the chosen recipe is what got stored',
	(
		await page.evaluate(() =>
			localStorage.getItem('dt-recipe-text'),
		)
	).startsWith('title: Tzatziki'),
);

await visit(page, '/tools/recipe-table?rtText=');
const blank = await page.evaluate(() => ({
	placeholder: document
		.querySelector('.media-marked-source')
		?.matches(':placeholder-shown'),
	dashed:
		getComputedStyle(document.querySelector('.media-marked-source'))
			.borderTopStyle === 'dashed',
	picture: !!document.querySelector('.rt-picture .rt-empty'),
	exports: [
		...document.querySelectorAll(
			'[data-action="copy"], [data-action="pdf"]',
		),
	].every((b) => b.disabled),
}));
check('empty, the editor is the dashed placeholder box', blank.placeholder && blank.dashed);
check('and the picture is a blank frame', blank.picture);
check('and export waits for a recipe', blank.exports);

await finish(browser);
