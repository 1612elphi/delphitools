import { launch, check, finish, sleep, BASE } from './harness.mjs';

const { browser, page } = await launch();
// unsaved scenes prompt
page.on('dialog', (d) => void d.accept());

async function open(width, height, raster = true) {
	await page.setViewport({ width, height });
	await page.goto(`${BASE}/editor`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'load' });
	await page.waitForFunction(() => window.__substrataUi, { timeout: 25000 });
	await sleep(300);
	if (!raster) return;
	await page.evaluate(() =>
		window.__substrata.addRaster(
			800,
			1000,
			[
				{ x: 0, y: 0, w: 800, h: 1000, colour: '#7a9cc0' },
				{ x: 100, y: 100, w: 200, h: 200, colour: '#3e6b33' },
			],
			{ x: 540, y: 675 },
		),
	);
	await sleep(600);
}

const tool = async (t, sub) => {
	await page.evaluate((t, s) => window.__substrata.setTool(t, s), t, sub);
	await sleep(250);
};

const nameOf = (b) =>
	(b.getAttribute('aria-label') ?? b.textContent.trim()).split(': ')[0];
const cells = () =>
	page.$$eval(
		'.sub-ed-bar button.sub-cell',
		(bs, f) => bs.map((b) => new Function('b', `return (${f})(b)`)(b)),
		nameOf.toString(),
	);
const cell = async (label) => {
	const h = await page.evaluateHandle(
		(l, f) =>
			[...document.querySelectorAll('.sub-ed-bar button.sub-cell')].find(
				(b) => new Function('b', `return (${f})(b)`)(b) === l,
			) ?? null,
		label,
		nameOf.toString(),
	);
	return h.asElement();
};
const press = async (label) => {
	const b = await cell(label);
	await b?.click();
	await sleep(300);
	return !!b;
};
const state = async (label) => {
	const b = await cell(label);
	return b
		? b.evaluate((e) => ({
				disabled: e.disabled,
				on: e.classList.contains('canon-button--filled'),
				text: e.textContent.trim(),
			}))
		: { disabled: null, on: null, text: null };
};
const openPanel = () =>
	page.evaluate(() => !!document.querySelector('.canon-popover:popover-open'));
const choose = async (...titles) => {
	for (const t of titles) {
		const found = await page.evaluate((title) => {
			const items = [
				...document.querySelectorAll(
					'.canon-menu:popover-open > .canon-menu-item',
				),
			];
			const item = items.find(
				(i) =>
					i.querySelector('.canon-menu-item-title')
						?.textContent.trim() === title,
			);
			item?.click();
			return !!item;
		}, t);
		if (!found) return false;
		await sleep(250);
	}
	return true;
};
const sel = () => page.evaluate(() => window.__substrata.pixelSelection());
const layers = () => page.evaluate(() => window.__substrata.layers());
const vt = () => page.evaluate(() => window.__substrata.vt());
const toPage = async (sx, sy) => {
	const v = await vt();
	const r = await page.evaluate(() => {
		const b = document
			.querySelector('canvas.upper-canvas')
			.getBoundingClientRect();
		return { l: b.left, t: b.top };
	});
	return { x: r.l + sx * v[0] + v[4], y: r.t + sy * v[3] + v[5] };
};
const drag = async (x0, y0, x1, y1) => {
	const a = await toPage(x0, y0);
	const b = await toPage(x1, y1);
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	await page.mouse.move(b.x, b.y, { steps: 8 });
	await page.mouse.up();
	await sleep(300);
};
const sample = async (sx, sy) => {
	const p = await toPage(sx, sy);
	const r = await page.evaluate(() => {
		const b = document
			.querySelector('canvas.upper-canvas')
			.getBoundingClientRect();
		return { l: b.left, t: b.top };
	});
	return page.evaluate(
		(x, y) => window.__substrata.samplePixel(x, y),
		p.x - r.l,
		p.y - r.t,
	);
};
const near = (px, rgba, tol = 14) =>
	!!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const rect = (sel) =>
	page.evaluate((s) => {
		const r = document.querySelector(s)?.getBoundingClientRect();
		return r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
	}, sel);
const select = async () => {
	const ls = await layers();
	await page.evaluate((id) => window.__substrata.select([id]), ls[0].id);
	await sleep(250);
	return ls;
};

await open(1400, 1000);
await tool('move', 'move');
let names = await cells();
check(
	'move: Fit and 100 % then the layer cells with a raster selected',
	names.slice(0, 2).join() === 'Fit,100 %' &&
		names.includes('Develop') &&
		names.includes('Rotate right') &&
		names.includes('Align'),
	names.join(),
);
check('move: Group greyed with one layer', (await state('Group')).disabled);
const unnamed = await page.$$eval('.sub-ed-bar button', (bs) =>
	bs.filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim()))
		.length,
);
check('bar: every button is named', unnamed === 0, String(unnamed));
check(
	'bar: one group per seam',
	(await page.$$('.sub-ed-bar > .sub-cells')).length === 3,
);
const cellBox = await rect('.sub-ed-bar button.sub-cell');
check('bar: 36 px cells', Math.round(cellBox.b - cellBox.t) === 36, JSON.stringify(cellBox));

await press('Develop');
check(
	'move: Develop opens the develop view',
	await page.evaluate(() => window.__substrataUi.developOpen),
);
await page.evaluate(() => {
	window.__substrataUi.developOpen = false;
});
await sleep(200);

await press('Rotate right');
let box = await page.evaluate(() => window.__substrata.selection().box);
check('move: Rotate right turns 90°', Math.round(box.angle) === 90, String(box?.angle));
await press('Rotate left');
await press('Flip horizontal');
check('move: Flip horizontal lights while flipped', (await state('Flip horizontal')).on);
await press('Flip horizontal');

await press('Align');
check('move: Align opens its menu', await openPanel());
check('move: Align left chosen', await choose('Align left'));
let ls = await layers();
check('move: Align left puts the layer at the edge', Math.abs(ls[0].scene.x - 400) < 1.5, JSON.stringify(ls[0].scene));
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
ls = await layers();
check('move: one undo step', Math.abs(ls[0].scene.x - 540) < 1.5, JSON.stringify(ls[0].scene));

await press('Options');
check('move: Options opens its panel', await openPanel());
const snapBefore = await page.evaluate(() =>
	JSON.parse(localStorage.getItem('substrata:guides') ?? '{"snap":true}').snap,
);
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-popover:popover-open .canon-row')]
		.find((r) => r.textContent.includes('Snap'))
		?.querySelector('input')
		?.click(),
);
await sleep(200);
const snapAfter = await page.evaluate(
	() => JSON.parse(localStorage.getItem('substrata:guides')).snap,
);
check('move: Snap switch flips the guides setting', snapBefore !== snapAfter);
await page.keyboard.press('Escape');
await sleep(200);
check('bar: Escape closes the panel', !(await openPanel()));

await page.evaluate(() =>
	window.__substrata.addRaster(200, 200, [{ x: 0, y: 0, w: 200, h: 200, colour: '#cc2222' }], { x: 300, y: 300 }),
);
await sleep(500);
ls = await layers();
await page.evaluate((ids) => window.__substrata.select(ids), ls.map((l) => l.id));
await sleep(250);
check('move: Group lit with two siblings', !(await state('Group')).disabled);
await press('Group');
ls = await layers();
check('move: Group makes a group', ls.every((l) => l.parent), JSON.stringify(ls.map((l) => l.parent)));
names = await cells();
check('move: a group shows Ungroup', names.includes('Ungroup') && !names.includes('Develop'), names.join());
await press('Ungroup');
ls = await layers();
check('move: Ungroup releases it', ls.every((l) => !l.parent));
check('move: Distribute needs three', await (async () => {
	await press('Align');
	const d = await page.evaluate(() =>
		[...document.querySelectorAll('.canon-menu:popover-open .canon-menu-item')]
			.find((i) => i.textContent.includes('Distribute horizontally'))
			?.getAttribute('aria-disabled'),
	);
	await page.keyboard.press('Escape');
	await sleep(200);
	return d === 'true';
})());

await (await cell('Align')).focus();
await page.keyboard.press('Enter');
await sleep(250);
check('keyboard: Enter opens the Align menu', await openPanel());
await page.keyboard.press('Escape');
await sleep(250);
check('keyboard: Escape closes it', !(await openPanel()));
await (await cell('Fit')).focus();
await page.keyboard.press('Tab');
const next = await page.evaluate(() => document.activeElement.textContent.trim());
check('keyboard: Tab moves along the bar', next === '100 %', next);

await open(1400, 1000);
await tool('move', 'crop');
names = await cells();
check('crop: Free 1:1 4:5 16:9', names.join() === 'Free,1:1,4:5,16:9', names.join());
check('crop: Free chosen first', (await state('Free')).on);
await select();
await press('1:1');
ls = await layers();
check('crop: 1:1 crops square', ls[0].crop && ls[0].crop.w === ls[0].crop.h && ls[0].crop.w === 800, JSON.stringify(ls[0].crop));
check('crop: 1:1 lit', (await state('1:1')).on && !(await state('Free')).on);
await press('16:9');
ls = await layers();
check('crop: 16:9 fits the width', ls[0].crop?.w === 800 && ls[0].crop?.h === 450, JSON.stringify(ls[0].crop));
await press('Free');
check('crop: Free keeps the crop', (await layers())[0].crop?.h === 450);
await page.evaluate((id) => window.__substrata.setCrop(id, null), ls[0].id);

await tool('select', 'select');
names = await cells();
check(
	'select: shapes, mode, actions',
	names.join() ===
		'Rectangle,Freehand,Automatic,Add,Invert,Refine,Copy to Layer,Cut to Layer,Fill,Clear,Deselect',
	names.join(),
);
check('select: actions greyed with no selection', (await state('Copy to Layer')).disabled && (await state('Deselect')).disabled && (await state('Refine')).disabled);
await press('Freehand');
check('select: Freehand is the lasso', await (await cell('Freehand')).evaluate((b) => b.getAttribute('aria-pressed') === 'true'));
check('select: lasso shows Options', (await cells()).includes('Options'));
await press('Automatic');
await press('Options');
check('select: wand Options has Tolerance', await page.evaluate(() => !!document.querySelector('.canon-popover:popover-open')?.textContent.includes('Tolerance')));
await page.keyboard.press('Escape');
await press('Rectangle');
await select();
await drag(300, 300, 500, 500);
let s = await sel();
const one = s?.area ?? 0;
check('select: marquee selects', one > 30000, String(one));
await drag(600, 600, 700, 700);
s = await sel();
check('select: Add joins a second shape', s && s.area > one + 9000, String(s?.area));
await press('Add');
check('select: the mode cell turns to Remove', (await state('Remove')).on);
await drag(600, 600, 700, 700);
s = await sel();
check('select: Remove takes it out again', s && Math.abs(s.area - one) < 800, String(s?.area));
await press('Remove');
await press('Refine');
check('select: Grow 8 px', await choose('Grow', '8 px'));
s = await sel();
check('select: Grow widens the selection', s && s.area > one + 4000, String(s?.area));
await press('Refine');
await choose('Feather', '8 px');
s = await sel();
check('select: Feather softens the edge', s && s.area > one, String(s?.area));
await press('Deselect');
check('select: Deselect clears', (await sel()) === null);
await press('Invert');
s = await sel();
check('select: Invert with none selects everything', s && s.area === 2000 * 1500, String(s?.area));
await press('Deselect');

await page.evaluate(() => window.__substrata.colour('#cc2222'));
await select();
await drag(400, 400, 500, 500);
await press('Fill');
await sleep(400);
let px = await sample(450, 450);
check('select: Fill paints the colour key', near(px, [204, 34, 34, 255]), px?.join());
await press('Clear');
await sleep(400);
px = await sample(450, 450);
check('select: Clear empties the pixels', !near(px, [204, 34, 34, 255]) && !near(px, [122, 156, 192, 255]), px?.join());
const before = (await layers()).length;
await drag(200, 700, 300, 800);
await press('Copy to Layer');
await sleep(400);
check('select: Copy to Layer adds a layer', (await layers()).length === before + 1);

await tool('text', 'text');
names = await cells();
check('text: Font, Size, Style, Align', names.join() === 'Font,Size,Style,Align', names.join());
check('text: font cell shows the value', (await state('Font')).text === 'Sans');
await press('Font');
await choose('Serif');
check('text: Serif chosen', (await state('Font')).text === 'Serif');
await press('Size');
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-popover:popover-open button')]
		.find((b) => b.textContent.trim() === '128')
		?.click(),
);
await sleep(200);
check('text: size cell shows 128 px', (await state('Size')).text === '128 px', (await state('Size')).text);
await page.keyboard.press('Escape');
await press('Style');
await choose('Pill');
check('text: Style shows Pill', (await state('Style')).text === 'Pill');
await press('Align');
check('text: Align menu has Justify', await choose('Justify'));

await tool('pieces', 'primitives');
names = await cells();
check('shape: kind menu and Style', names.join() === 'Shape,Style', names.join());
await press('Shape');
await choose('Star');
check('shape: Star chosen', (await state('Shape')).text === 'Star');
await press('Style');
check('shape: Star Style has Points', await page.evaluate(() => document.querySelector('.canon-popover:popover-open')?.textContent.includes('Points')));
await page.keyboard.press('Escape');
await sleep(150);
await press('Shape');
await choose('Symbol');
names = await cells();
check('shape: Symbol shows the gallery cell', names.join() === 'Shape,Symbols', names.join());
await press('Symbols');
const glyphs = await page.$$eval('.canon-popover:popover-open .sub-bar-glyph', (g) => g.length);
check('shape: gallery lists the symbols', glyphs > 10, String(glyphs));
await page.keyboard.press('Escape');

await tool('pieces', 'brush');
names = await cells();
check('draw: Brush, Pencil, Size', names.join() === 'Brush,Pencil,Size', names.join());
check('draw: brush size 24 px', (await state('Size')).text === '24 px');
await press('Pencil');
check('draw: Pencil switches, size 6 px', (await state('Pencil')).on && (await state('Size')).text === '6 px');

await tool('move', 'move');
await page.evaluate(() => window.__substrataUi.setSettingsEdge('leading'));
await sleep(300);
const col = await page.$eval('.sub-ed-bar > .sub-cells', (e) => getComputedStyle(e).flexDirection);
check('leading edge: cells stack in a column', col === 'column', col);
const barBox = await rect('.sub-ed-bar');
const groups = await page.$$eval('.sub-ed-bar > .sub-cells', (gs) =>
	gs.map((g) => Math.round(g.getBoundingClientRect().width)),
);
check('leading edge: groups share one width', new Set(groups).size === 1, groups.join());
await press('Options');
const pop = await rect('.canon-popover:popover-open');
check('leading edge: panel opens beside the bar', pop && pop.l >= barBox.r, `${pop?.l} ${barBox.r}`);
await page.keyboard.press('Escape');
await page.evaluate(() => window.__substrataUi.setSettingsEdge('bottom'));
await sleep(200);
await press('Options');
const pop2 = await rect('.canon-popover:popover-open');
const bar2 = await rect('.sub-ed-bar');
check('bottom edge: panel opens above the bar', pop2 && pop2.b <= bar2.t, `${pop2?.b} ${bar2.t}`);
await page.keyboard.press('Escape');

await open(390, 844);
await tool('move', 'move');
names = await cells();
check('phone: move shows the layer cells only', !names.includes('Fit') && names.includes('Align'), names.join());
const moveBar = await rect('.sub-ed-bar');
check('phone: move bar inside the window', moveBar.l >= 0 && moveBar.r <= 390, JSON.stringify(moveBar));
await tool('select', 'select');
names = await cells();
check('phone: select folds the shapes into one cell', names[0] === 'Rectangle' && !names.includes('Freehand'), names.join());
const phoneBar = await rect('.sub-ed-bar');
check('phone: bar inside the window', phoneBar && phoneBar.l >= 0 && phoneBar.r <= 390, JSON.stringify(phoneBar));
check(
	'phone: no horizontal scroll',
	await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth),
);

await finish(browser);
