import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1000 },
});

let template = null;
await page.setRequestInterception(true);
page.on('request', (req) => {
	const url = new URL(req.url());
	if (url.pathname === '/substrata/templates/index.json' && template)
		return req.respond({
			contentType: 'application/json',
			body: JSON.stringify([
				{
					file: 't.substrata',
					name: 'T',
					thumb: null,
					width: 10,
					height: 10,
				},
			]),
		});
	if (url.pathname === '/substrata/templates/t.substrata' && template)
		return req.respond({
			contentType: 'application/zip',
			body: Buffer.from(template),
		});
	return req.continue();
});

await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata && window.__substrataUi, {
	timeout: 20000,
});
await sleep(300);

const doc = () => page.evaluate(() => window.__substrata.doc());
const layer = async (id) =>
	(await doc()).layers.find((l) => l.id === id) ?? null;
const screenOf = async (id) =>
	(await page.evaluate(() => window.__substrata.layers())).find(
		(l) => l.id === id,
	)?.screen;
const clickText = (sel, text) =>
	page.evaluate(
		([s, t]) => {
			const el = [...document.querySelectorAll(s)].find(
				(e) => e.textContent.trim() === t,
			);
			el?.click();
			return !!el;
		},
		[sel, text],
	);
const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);

await page.evaluate(() =>
	window.__substrata.addRaster(400, 200, [
		{ x: 0, y: 0, w: 400, h: 200, colour: '#6a8fb5' },
	]),
);
await sleep(300);
const id = (await doc()).layers[0]?.id;
await page.evaluate(() => window.__substrataUi.toggle('layers'));
await sleep(300);
check('raster added', !!id);

const openMenu = async () => {
	await page.click(`.sub-layer-main[data-layer-id="${id}"]`, {
		button: 'right',
	});
	await sleep(250);
	await clickText('[data-layer-menu] button', 'More Options');
	await sleep(200);
};

await openMenu();
check('menu offers Make Stratum', await clickText('[data-layer-menu] button', 'Make Stratum'));
await sleep(300);
check('layer is a stratum', (await layer(id))?.stratum === true);
check(
	'row shows the pin',
	await has(`.sub-layer-main[data-layer-id="${id}"] .sub-layer-kind svg`),
);

const before = (await layer(id)).transform;
const at = await screenOf(id);
await page.mouse.move(at.x, at.y);
await page.mouse.down();
await page.mouse.move(at.x + 120, at.y + 60, { steps: 8 });
await page.mouse.up();
await sleep(300);
const after = (await layer(id)).transform;
check(
	'a pinned stratum does not move on drag',
	after.x === before.x && after.y === before.y,
	`${before.x},${before.y} -> ${after.x},${after.y}`,
);

await page.evaluate(async ({ x, y }) => {
	const c = document.createElement('canvas');
	c.width = 100;
	c.height = 400;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#e0a040';
	ctx.fillRect(0, 0, 100, 400);
	const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
	const dt = new DataTransfer();
	dt.items.add(new File([blob], 'tall.png', { type: 'image/png' }));
	const wrap = document.querySelector('.sub-canvas-drop-hint').parentElement;
	wrap.dispatchEvent(
		new DragEvent('drop', {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			dataTransfer: dt,
		}),
	);
}, at);
await sleep(800);
const framed = await layer(id);
check(
	'drop replaces the frame image',
	framed.naturalWidth === 100 && framed.naturalHeight === 400,
	`${framed.naturalWidth}x${framed.naturalHeight}`,
);
check(
	'the new image covers the frame box',
	framed.crop?.w === 100 &&
		framed.crop?.h === 50 &&
		framed.transform.scaleX === 4,
	JSON.stringify(framed.crop),
);
check('drop adds no layer', (await doc()).layers.length === 1);

await page.evaluate(() =>
	window.__substrata.addRaster(60, 30, [
		{ x: 0, y: 0, w: 60, h: 30, colour: '#40a060' },
	]),
);
await sleep(300);
const loose = (await doc()).layers[1];
const from = await screenOf(loose.id);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(at.x + 10, at.y + 5, { steps: 8 });
await page.mouse.up();
await sleep(500);
const filled = await layer(id);
check(
	'an image layer dropped on a frame fills it',
	filled.blobHash === loose.blobHash && filled.naturalWidth === 60,
	`${filled.naturalWidth}x${filled.naturalHeight}`,
);
check(
	'the dropped layer is consumed',
	(await doc()).layers.length === 1,
);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
check('one undo restores both', (await doc()).layers.length === 2);
await page.keyboard.down('Meta');
await page.keyboard.down('Shift');
await page.keyboard.press('z');
await page.keyboard.up('Shift');
await page.keyboard.up('Meta');
await sleep(300);
check('redo fills the frame again', (await doc()).layers.length === 1);

await page.evaluate((id) => {
	window.__substrata.select([id]);
	if (!window.__substrataUi.isOpen('inspector'))
		window.__substrataUi.toggle('inspector');
}, id);
await sleep(300);
check(
	'inspector shows the Frame row',
	await page.evaluate(() =>
		[...document.querySelectorAll('.sub-ip .canon-row')].some((r) =>
			r.textContent.includes('Frame'),
		),
	),
);

template = await page.evaluate(() => window.__substrata.packScene());

await openMenu();
check('menu offers Unlock Stratum', await clickText('[data-layer-menu] button', 'Unlock Stratum'));
await sleep(300);
check('unlocked layer is a user layer', !(await layer(id))?.stratum);

const oldId = (await doc()).id;
check(
	'rail New cell opens the New card',
	await page.evaluate(() => {
		const b = document.querySelector(
			'.sub-ed-stack button[aria-label="New"]',
		);
		b?.click();
		return !!b;
	}),
);
await sleep(400);
check('New card is up', await has('.sub-new .sub-empty-card'));
const projectCell = () =>
	page.evaluate(() => {
		const b = document.querySelector('.sub-new .sub-cell:last-child');
		return b && { text: b.textContent.trim(), offer: b.classList.contains('is-offer') };
	});
const off = await projectCell();
check('saving off: projects cell is dimmed', off?.offer && off.text === 'Open a project', JSON.stringify(off));
await page.hover('.sub-new .sub-cell:last-child');
await sleep(200);
check('hover asks to turn on saving', (await projectCell())?.text === 'Turn on saving?');
await page.click('.sub-new .sub-cell:last-child');
await sleep(300);
const on = await projectCell();
check(
	'click turns saving on and the cell opens projects',
	(await page.evaluate(() => localStorage.getItem('substrata:persist'))) === '1' &&
		!on?.offer &&
		on?.text === 'Open a project',
	JSON.stringify(on),
);
await page.keyboard.press('Escape');
await sleep(200);
check('Escape closes the New card', !(await has('.sub-new')));
await page.evaluate(() =>
	document.querySelector('.sub-ed-stack button[aria-label="New"]').click(),
);
await sleep(400);
check(
	'Use a template opens the Templates drawer',
	await clickText('.sub-new button', 'Use a template'),
);
await sleep(600);
check(
	'drawer is Templates without the New card',
	!(await has('.sub-new')) &&
		(await page.evaluate(
			() =>
				document.querySelector('.sub-pg-drawer')?.getAttribute(
					'aria-label',
				) === 'Templates',
		)),
);
page.once('dialog', (d) => void d.accept());
check('template tile listed', await page.evaluate(() => {
		const b = document.querySelector('.sub-gal-tile[aria-label^="T,"]');
		b?.click();
		return !!b;
	}));
await sleep(1200);
const opened = await doc();
check('template opens with a new id', opened.id !== oldId);
check('template keeps its strata', opened.layers[0]?.stratum === true);

await browser.close();
finish();
