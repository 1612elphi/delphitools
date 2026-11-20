import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1000 },
});

async function boot(p) {
	await p.goto(`${BASE}/editor`, { waitUntil: 'domcontentloaded' });
	await p.waitForFunction(() => window.__substrata && window.__substrataUi, {
		timeout: 25000,
	});
	await sleep(500);
}

const run = (fn, ...args) => page.evaluate(fn, ...args);
const fxOf = (stack) =>
	run((s) => {
		const doc = window.__substrata.doc();
		const layer = doc.layers.find((l) => l.kind === 'raster');
		return layer ? layer[s] : [];
	}, stack);
const param = async (stack, type, key) =>
	(await fxOf(stack)).find((f) => f.type === type)?.params[key];
const undo = async () => {
	await run(() => document.querySelector('.sub-ed-stack [title="Undo"]').click());
	await sleep(200);
};
const box = (sel) =>
	run((s) => {
		const b = document.querySelector(s)?.getBoundingClientRect();
		return b && { x: b.x, y: b.y, w: b.width, h: b.height };
	}, sel);
async function dragBy(sel, dx, dy = 0, from = 0.5) {
	const b = await box(sel);
	const x = b.x + b.w * from;
	const y = b.y + b.h / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) {
		await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
		await sleep(16);
	}
	await page.mouse.up();
	await sleep(250);
}
async function pick(type) {
	await run(() =>
		document
			.querySelector('.sub-fxp-panel .sub-panel-header [aria-label="Add Effect"]')
			.click(),
	);
	await sleep(400);
	await run((t) => document.querySelector(`[data-fx-pick="${t}"]`).click(), type);
	await sleep(400);
}
const block = (type) => `.sub-fxp-block[data-fx-type="${type}"]`;

await boot(page);
await run(() => window.__substrataUi.toggle('fx'));
await sleep(300);

const empty = await run(() => ({
	text: document.querySelector('.sub-fxp-panel .canon-empty-row')?.textContent.trim(),
	add: document.querySelector('.sub-fxp-panel [aria-label="Add Effect"]')?.disabled,
}));
check('no layer: the empty row shows', empty.text === 'Select a layer first...', empty.text);
check('no layer: Add Effect is off', empty.add === true);

await run(() =>
	window.__substrata.addRaster(
		320,
		200,
		[
			{ x: 0, y: 0, w: 320, h: 100, colour: '#7f9cc0' },
			{ x: 0, y: 100, w: 320, h: 100, colour: '#3e5c3a' },
		],
		{ x: 500, y: 400 },
	),
);
await sleep(800);
const none = await run(() => ({
	text: document.querySelector('.sub-fxp-panel .canon-empty-row')?.textContent.trim(),
	addOne: !!document.querySelector('.sub-fxp-add-one'),
}));
check('a raster with no fx offers Add one?', none.text === 'No effects yet' && none.addOne, JSON.stringify(none));

await run(() => document.querySelector('.sub-fxp-add-one').click());
await sleep(500);
const picker = await run(() => {
	const cards = [...document.querySelectorAll('.sub-card [data-fx-pick]')];
	return {
		heads: [...document.querySelectorAll('.sub-card .canon-heading')].map((h) => h.textContent.trim()),
		cards: cards.length,
		named: cards.filter((c) => c.textContent.trim() && c.querySelector('svg')).length,
		width: document.querySelector('.sub-card')?.getBoundingClientRect().width,
		scroll: (() => {
			const c = document.querySelector('.sub-card');
			return c && c.scrollWidth <= c.clientWidth;
		})(),
	};
});
check('picker: Filters then Effects', JSON.stringify(picker.heads) === '["Filters","Effects"]', JSON.stringify(picker.heads));
check('picker: every web type is a card', picker.cards === 34, `${picker.cards}`);
check('picker: every card has an icon and a name', picker.named === picker.cards);
check('picker: 416 px card, no sideways scroll', picker.width === 416 && picker.scroll, `${picker.width}`);
await page.keyboard.press('Escape');
await sleep(300);
check('picker: Esc closes it', !(await run(() => !!document.querySelector('.sub-card'))));

await pick('brightness');
let filters = await fxOf('filters');
check('pick writes the filter', filters.map((f) => f.type).join() === 'brightness');
check('the new block opens', await run((b) => !!document.querySelector(`${b} .sub-fxp-body`), block('brightness')));
const slider = `${block('brightness')} .sub-fxp-cslider`;
check('brightness gets the centred gradient slider', await run((s) => !!document.querySelector(`${s}.is-gradient`), slider));

await run((s) => document.querySelector(s).focus(), slider);
await page.keyboard.press('ArrowRight');
await sleep(150);
check('arrow key steps the slider', (await param('filters', 'brightness', 'amount')) === 10);
await undo();
check('undo takes the step back', (await param('filters', 'brightness', 'amount')) === 0);

await dragBy(slider, 60, 0, 0.3);
const dragged = await param('filters', 'brightness', 'amount');
check('a drag moves the amount', typeof dragged === 'number' && dragged !== 0, String(dragged));
await undo();
check('the whole drag is one undo step', (await param('filters', 'brightness', 'amount')) === 0);

await pick('levels');
const levels = await run((b) => ({
	path: !!document.querySelector(`${b} .sub-fxp-tones-plot path`),
	handles: document.querySelectorAll(`${b} .sub-fxp-tones-handle`).length,
	open: document.querySelectorAll('.sub-fxp-body').length,
}), block('levels'));
check('levels: histogram from the layer pixels', levels.path);
check('levels: five handles', levels.handles === 5);
check('one block open at a time', levels.open === 1);
await dragBy(`${block('levels')} .sub-fxp-tones-handle[data-key="inBlack"]`, 60);
const inBlack = await param('filters', 'levels', 'inBlack');
check('levels: dragging black moves in black', inBlack > 20, String(inBlack));
await undo();
check('levels: the drag is one undo step', (await param('filters', 'levels', 'inBlack')) === 0);
await run((b) => document.querySelector(`${b} .sub-fxp-tones-handle[data-key="gamma"]`).focus(), block('levels'));
await page.keyboard.press('ArrowLeft');
await sleep(150);
check('levels: arrow keys step gamma', (await param('filters', 'levels', 'gamma')) === 0.9);

await run((b) => document.querySelector(`${b} .sub-fxp-lamp`).click(), block('levels'));
await sleep(200);
const off = (await fxOf('filters')).find((f) => f.type === 'levels');
check('the lamp turns the fx off', off.enabled === false);
check('a lamp names its state', await run((b) => document.querySelector(`${b} .sub-fxp-lamp`).getAttribute('aria-pressed') === 'false', block('levels')));
await run((b) => document.querySelector(`${b} .sub-fxp-lamp`).click(), block('levels'));
await sleep(200);

await run((b) => document.querySelector(`${b} .sub-fxp-more`).click(), block('levels'));
await sleep(300);
await run(() => [...document.querySelectorAll('.canon-menu-item')].find((i) => i.textContent.includes('Reset') && i.checkVisibility()).click());
await sleep(200);
check('More > Reset restores the defaults', (await param('filters', 'levels', 'gamma')) === 1);

await pick('drop-shadow');
const divided = await run(() => !!document.querySelector('.sub-fxp-rule'));
check('a rule divides filters from effects', divided);
const pad = `${block('drop-shadow')} .sub-fxp-pad`;
await dragBy(pad, -40, -30);
const ox = await param('effects', 'drop-shadow', 'offsetX');
check('shadow pad: dragging moves the offset', ox < 0, String(ox));
await undo();
check('shadow pad: one undo step', (await param('effects', 'drop-shadow', 'offsetX')) === 8);

const well = `${block('drop-shadow')} .sub-fxp-well`;
await run((w) => {
	const input = document.querySelector(`${w} input`);
	input.value = 'ff0000';
	input.dispatchEvent(new Event('change', { bubbles: true }));
}, well);
await sleep(200);
check('colour well: typed hex writes the colour', (await param('effects', 'drop-shadow', 'colour')) === '#ff0000');
await run((w) => document.querySelector(`${w} .sub-fxp-well-swatch`).click(), well);
await sleep(200);
const ring = await run(() => ({
	open: window.__substrataUi.ringOpen,
	hex: window.__substrataUi.ringTarget?.hex,
}));
check('colour well: the swatch opens the ring for this colour', ring.open && ring.hex === '#ff0000', JSON.stringify(ring));
await run(() => {
	const t = window.__substrataUi.ringTarget;
	t.send('#00ff00', 1, false);
	t.send('#0000ff', 1, true);
	window.__substrataUi.closeRing();
});
await sleep(200);
check('ring sends land in the param', (await param('effects', 'drop-shadow', 'colour')) === '#0000ff');
await undo();
check('a ring burst is one undo step', (await param('effects', 'drop-shadow', 'colour')) === '#ff0000');

await run(() => document.querySelector('.sub-fxp-panel .sub-panel-header [aria-label="Add Effect"]').click());
await sleep(400);
const greyed = await run(() => ({
	taken: document.querySelector('[data-fx-pick="brightness"]').disabled,
	free: document.querySelector('[data-fx-pick="sharpen"]').disabled,
}));
check('picker greys the types the layer has', greyed.taken && !greyed.free);
await page.keyboard.press('Escape');
await sleep(300);

const before = (await fxOf('filters')).map((f) => f.type).join();
const grips = await run(() =>
	[...document.querySelectorAll('.sub-fxp-zone[data-stack="filters"] .sub-fxp-grip')].map((g) => {
		const b = g.getBoundingClientRect();
		return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
	}),
);
if (grips.length >= 2) {
	const [a, b] = grips;
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	for (let i = 1; i <= 15; i++) {
		await page.mouse.move(a.x, a.y + ((b.y - a.y + 20) * i) / 15);
		await sleep(30);
	}
	await page.mouse.up();
	await sleep(500);
}
const after = (await fxOf('filters')).map((f) => f.type).join();
check('dragging the grip reorders the stack', before !== after, `${before} -> ${after}`);
const shown = await run(() =>
	[...document.querySelectorAll('.sub-fxp-zone[data-stack="filters"] .sub-fxp-block')]
		.map((b) => b.dataset.fxType)
		.join(),
);
check('the blocks show in the new order', shown === after, shown);

await dragBy(`${block('brightness')} .sub-fxp-title`, 120, 0, 0.2);
const revealed = await run((b) => document.querySelector(b).classList.contains('is-revealed'), block('brightness'));
check('a slide shows Delete', revealed);
await run((b) => document.querySelector(`${b} .sub-fxp-delete`).click(), block('brightness'));
await sleep(300);
check('Delete removes the fx', !(await fxOf('filters')).some((f) => f.type === 'brightness'));

await run((b) => document.querySelector(`${b} .sub-fxp-more`).click(), block('drop-shadow'));
await sleep(300);
await run(() => [...document.querySelectorAll('.canon-menu-item')].find((i) => i.textContent.includes('Remove') && i.checkVisibility()).click());
await sleep(300);
check('More > Remove drops the effect and the rule', (await fxOf('effects')).length === 0 && !(await run(() => !!document.querySelector('.sub-fxp-rule'))));

const TYPES = [
	['filters', 'contrast'], ['filters', 'exposure'], ['filters', 'saturation'], ['filters', 'vibrance'],
	['filters', 'hue-rotate'], ['filters', 'temperature'], ['filters', 'grayscale'], ['filters', 'sepia'],
	['filters', 'invert'], ['filters', 'threshold'], ['filters', 'gamma'], ['filters', 'posterize'],
	['filters', 'colour-balance'], ['filters', 'duotone'], ['filters', 'gaussian-blur'], ['filters', 'sharpen'],
	['filters', 'emboss'], ['filters', 'edge-detect'], ['filters', 'noise'], ['filters', 'pixelate'], ['filters', 'dither'],
	['filters', 'vignette'], ['effects', 'outer-glow'], ['effects', 'stroke'], ['effects', 'inner-shadow'],
	['effects', 'inner-glow'], ['effects', 'colour-overlay'],
];
const unnamed = [];
const unopened = [];
for (const [, type] of TYPES) {
	await pick(type);
	const r = await run((b) => {
		const el = document.querySelector(b);
		if (!el) return { missing: true };
		const static_ = !el.querySelector('.sub-fxp-title[aria-expanded]');
		const body = el.querySelector('.sub-fxp-body');
		const controls = [...el.querySelectorAll('button, input, [role="slider"], [role="radio"]')];
		const nameless = controls.filter((c) => {
			if (c.getAttribute('aria-hidden') === 'true' || c.tabIndex < 0) return false;
			const label = c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.textContent.trim();
			return !label;
		});
		const overflow = el.scrollWidth > el.clientWidth + 1;
		return { static_, open: !!body, nameless: nameless.map((c) => c.className).join(' '), overflow };
	}, block(type));
	if (r.missing || (!r.static_ && !r.open)) unopened.push(type);
	if (r.nameless) unnamed.push(`${type}: ${r.nameless}`);
	if (r.overflow) unopened.push(`${type} overflows`);
}
check('every editor opens in place', unopened.length === 0, unopened.join(', '));
check('every control has a name', unnamed.length === 0, unnamed.join(' | '));

await run((b) => document.querySelector(`${b} .sub-fxp-title`).click(), block('duotone'));
await sleep(300);
await run(() => document.querySelector('.sub-fxp-chip[aria-label="Xerox"]').click());
await sleep(200);
check('duotone: a pair writes both colours', (await param('filters', 'duotone', 'highlightColour')) === '#00c2d1');
const wellsBefore = await run((b) => document.querySelectorAll(`${b} .sub-fxp-well`).length, block('duotone'));
await run(() => document.querySelector('.sub-fxp-chip.is-custom').click());
await sleep(200);
const wellsAfter = await run((b) => document.querySelectorAll(`${b} .sub-fxp-well`).length, block('duotone'));
check('duotone: Custom folds out the wells', wellsBefore === 0 && wellsAfter === 2, `${wellsBefore} -> ${wellsAfter}`);
await dragBy(`${block('duotone')} .sub-fxp-duo-track`, 40, 0, 0.5);
check('duotone: dragging the track moves the midpoint', (await param('filters', 'duotone', 'midpoint')) > 50);

await run((b) => document.querySelector(`${b} .sub-fxp-title`).click(), block('stroke'));
await sleep(300);
await run((b) => document.querySelector(`${b} .sub-fxp-position-cell.is-inner`).click(), block('stroke'));
await sleep(200);
check('stroke: a position cell writes the position', (await param('effects', 'stroke', 'position')) === 'inner');

await run((b) => document.querySelector(`${b} .sub-fxp-title`).click(), block('hue-rotate'));
await sleep(300);
await run((b) => document.querySelector(`${b} .sub-fxp-cover`).focus(), block('hue-rotate'));
await page.keyboard.press('ArrowRight');
await sleep(150);
check('hue: arrow keys turn 15°', (await param('filters', 'hue-rotate', 'angle')) === 15);

const panelOverflow = await run(() => {
	const body = document.querySelector('.sub-fxp-panel .sub-rail-body');
	return body.scrollWidth > body.clientWidth + 1;
});
check('panel body never scrolls sideways', !panelOverflow);

await run(() =>
	window.__substrata.addRaster(80, 80, [{ x: 0, y: 0, w: 80, h: 80, colour: '#aa3333' }], { x: 200, y: 200 }),
);
await sleep(700);
await run(() => {
	const ids = window.__substrata.layers().map((l) => l.id);
	const group = window.__substrata.groupLayers(ids);
	window.__substrata.select([group]);
});
await sleep(400);
const grouped = await run(() => document.querySelector('.sub-fxp-panel .canon-empty-row')?.textContent.trim());
check('a group asks for a layer inside it', grouped === 'Select a layer inside this group...', grouped);

const phone = await browser.newPage();
await phone.setViewport({ width: 390, height: 844 });
await boot(phone);
await phone.evaluate(() =>
	window.__substrata.addRaster(200, 200, [{ x: 0, y: 0, w: 200, h: 200, colour: '#888888' }], { x: 300, y: 300 }),
);
await sleep(800);
await phone.evaluate(() => {
	const id = window.__substrata.layers()[0].id;
	window.__substrata.fx(id, 'brightness');
	window.__substrata.fx(id, 'contrast');
	window.__substrataUi.toggle('fx', true);
});
await sleep(400);
await phone.evaluate(() => document.querySelector('.sub-fxp-title').click());
await sleep(400);
const alone = await phone.evaluate(() => ({
	blocks: document.querySelectorAll('.sub-fxp-block').length,
	stop: window.__substrataUi.trayStop,
	tray: !!document.querySelector('.sub-ed-rail.is-tray .sub-fxp-panel'),
	wide: document.documentElement.scrollWidth <= innerWidth,
}));
check('phone: the open block shows alone', alone.blocks === 1 && alone.tray, JSON.stringify(alone));
check('phone: the tray rises to full', alone.stop === 'full');
check('phone: no sideways page scroll', alone.wide);
await phone.evaluate(() => document.querySelector('.sub-fxp-title').click());
await sleep(400);
const back = await phone.evaluate(() => ({
	blocks: document.querySelectorAll('.sub-fxp-block').length,
	stop: window.__substrataUi.trayStop,
}));
check('phone: closing it brings the list and the stop back', back.blocks === 2 && back.stop === 'short', JSON.stringify(back));
await phone.close({ runBeforeUnload: false });

await finish(browser);
