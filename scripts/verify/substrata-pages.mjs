import { readFileSync } from 'node:fs';
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

const { browser, page } = await launch({ viewport: { width: 1400, height: 1000 } });
page.on('dialog', (d) => d.accept());
await page.evaluateOnNewDocument(() => localStorage.setItem('substrata:onboarding-seen', '1'));
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata && window.__substrataUi, { timeout: 30000 });
await sleep(600);
await page.evaluate(() =>
	window.__substrata.addRaster(400, 300, [{ x: 0, y: 0, w: 400, h: 300, colour: '#2244cc' }], { x: 600, y: 500 }),
);
await sleep(400);

const rect = (sel) =>
	page.evaluate((s) => {
		const r = document.querySelector(s)?.getBoundingClientRect();
		return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
	}, sel);
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null, sel);
const click = (sel) => page.click(sel).then(() => sleep(300));
const clickText = async (sel, t) => {
	const hit = await page.evaluate(
		([s, t]) => {
			const el = [...document.querySelectorAll(s)].find((e) => e.textContent.replace(/\s+/g, ' ').trim() === t);
			el?.click();
			return !!el;
		},
		[sel, t],
	);
	await sleep(350);
	return hit;
};
const cell = (label) => `.sub-ed-stack [title="${label}"]`;
const rowValue = (title) =>
	page.evaluate((t) => {
		const r = [...document.querySelectorAll('.sub-pg-block .canon-row')].find((x) => x.querySelector('.canon-row-title')?.textContent.trim() === t);
		return r?.querySelector('.canon-row-control')?.textContent.replace(/\s+/g, ' ').trim() ?? null;
	}, title);
const switchIn = (title) =>
	page.evaluate((t) => {
		const r = [...document.querySelectorAll('.canon-row')].find((x) => x.querySelector('.canon-row-title')?.textContent.trim() === t);
		const s = r?.querySelector('input[role="switch"]');
		s?.click();
		return s ? s.checked : null;
	}, title);
const segment = (title, label) =>
	page.evaluate(
		([t, l]) => {
			const r = [...document.querySelectorAll('.canon-row')].find((x) => x.querySelector('.canon-row-title')?.textContent.trim() === t);
			const b = [...(r?.querySelectorAll('button') ?? [])].find((x) => x.textContent.trim() === l);
			b?.click();
			return !!b;
		},
		[title, label],
	);

const unnamed = (sel) =>
	page.evaluate((s) => {
		const root = document.querySelector(s);
		if (!root) return ['(no surface)'];
		return [...root.querySelectorAll('button, input, select, a[href], [role="slider"]')]
			.filter((el) => el.getAttribute('aria-hidden') !== 'true' && el.tabIndex >= 0)
			.filter((el) => {
				const name =
					el.getAttribute('aria-label') ||
					el.getAttribute('title') ||
					(el.getAttribute('aria-labelledby') &&
						el
							.getAttribute('aria-labelledby')
							.split(' ')
							.map((id) => document.getElementById(id)?.textContent)
							.join('')
							.trim()) ||
					el.textContent.trim() ||
					el.closest('label')?.textContent.trim();
				return !name;
			})
			.map((el) => el.outerHTML.slice(0, 80));
	}, sel);

check('nothing open at start', !(await rect('.sub-pg-drawer')));
await click(cell('Menu'));
const drawer = await rect('.sub-pg-drawer');
const column = await rect('.sub-ed-column');
check('menu opens the settings drawer', !!drawer);
check('drawer sits on the bottom edge', drawer && Math.abs(drawer.bottom - 1000) < 1, JSON.stringify(drawer));
check('drawer is 440 px tall', drawer && Math.abs(drawer.height - 440) < 1, `${drawer?.height}`);
check('drawer stops left of the column', drawer && column && drawer.right <= column.left, `${drawer?.right} ${column?.left}`);
const blocks = await page.evaluate(() =>
	[...document.querySelectorAll('.sub-pg-block')].map((b) => {
		const box = b.getBoundingClientRect();
		const over = [...b.children].filter((c) => {
			const r = c.getBoundingClientRect();
			return r.right > box.right + 1 || r.bottom > box.bottom + 1;
		}).length;
		return { id: b.dataset.section, over };
	}),
);
check('every section flows inside its columns', blocks.every((b) => b.over === 0), JSON.stringify(blocks));
check('sections: project to about', blocks.map((b) => b.id).join() === 'project,canvas,surface,general,editing,storage,reset,about', blocks.map((b) => b.id).join());
check('settings controls are named', (await unnamed('.sub-pg-drawer')).length === 0, (await unnamed('.sub-pg-drawer')).join(' | '));

const scroller = await rect('.sub-pg-scroller');
await page.mouse.move(scroller.left + 100, scroller.top + 100);
await page.mouse.wheel({ deltaY: 300 });
await sleep(200);
check('vertical wheel scrolls the settings sideways', (await page.evaluate(() => document.querySelector('.sub-pg-scroller').scrollLeft)) > 0);
await page.evaluate(() => (document.querySelector('.sub-pg-scroller').scrollLeft = 0));

await page.evaluate(() => {
	const input = [...document.querySelectorAll('.canon-row')].find((r) => r.querySelector('.canon-row-title')?.textContent.trim() === 'Name')?.querySelector('input');
	input.focus();
	input.value = 'Poster';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(300);
check('name row renames the document', (await text('.sub-ed-title-name')) === 'Poster', await text('.sub-ed-title-name'));
check('about shows the package version', (await rowValue('Version')) === `v${VERSION}`, await rowValue('Version'));
check('layers row counts the layers', (await rowValue('Layers')) === '1', await rowValue('Layers'));

const resPlus = await page.evaluate(() => {
	const r = [...document.querySelectorAll('.canon-row')].find((x) => x.querySelector('.canon-row-title')?.textContent.trim() === 'Resolution');
	const plus = [...r.querySelectorAll('button')].at(-1);
	plus.click();
	return true;
});
await sleep(300);
const res = await page.evaluate(() => [...document.querySelectorAll('.canon-row')].find((x) => x.querySelector('.canon-row-title')?.textContent.trim() === 'Resolution')?.querySelector('input')?.value);
check('resolution steps the artboard', resPlus && res === '73', res);

check('transparent switch turns on', (await switchIn('Transparent')) === true);
await sleep(300);
check('transparent clears the background', (await rowValue('Background')) === '—', await rowValue('Background'));
await switchIn('Transparent');
await sleep(300);
check('opaque again is white', /#ffffff/i.test(await rowValue('Background')), await rowValue('Background'));

await segment('Handedness', 'Left');
await sleep(500);
const mirrored = await page.evaluate(() => ({
	hand: document.querySelector('.sub-ed').dataset.hand,
	column: document.querySelector('.sub-ed-column').getBoundingClientRect().left,
	help: document.querySelector('.sub-ed-help').getBoundingClientRect().left,
}));
check('left hand mirrors the column', mirrored.hand === 'left' && mirrored.column < 100 && mirrored.help > 1200, JSON.stringify(mirrored));
await segment('Tool Settings', 'Left');
await sleep(300);
const leftBar = await rect('.sub-ed-bar');
check('tool settings Left goes to the left edge while mirrored', leftBar && leftBar.left < 700, JSON.stringify(leftBar));
await segment('Handedness', 'Right');
await sleep(500);
check('right hand puts the column back', (await rect('.sub-ed-column')).left > 1200);
await segment('Tool Settings', 'Top');
await sleep(300);
check('tool settings Top moves the bar', await page.evaluate(() => !!document.querySelector('.sub-ed-bar.is-top')));
await segment('Tool Settings', 'Bottom');

await switchIn('Help Button');
await sleep(200);
check('help button off hides the help cell', (await rect('.sub-ed-help'))?.width === 0 || !(await rect('.sub-ed-help'))?.width);
await switchIn('Help Button');
await sleep(200);

const gridBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('substrata:guides') ?? '{}').grid ?? false);
await switchIn('Grid');
await sleep(200);
const gridAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('substrata:guides') ?? '{}').grid);
check('grid switch writes the guides pref', gridAfter === !gridBefore, `${gridBefore} → ${gridAfter}`);
await switchIn('Grid');

await click('.sub-pg-link-cell');
check('canvas size row opens the form', await page.evaluate(() => !!document.querySelector('.sub-pg-pop:popover-open')));
await click('.sub-pg-pop .paper-popover-trigger');
await sleep(300);
await page.keyboard.type('1920x1080');
await sleep(200);
await click('.paper-popover:popover-open .paper-cell');
await sleep(300);
await clickText('.sub-pg-pop button', 'Apply');
check('apply resizes the artboard', (await rowValue('Canvas Size')) === '1920 × 1080 px', await rowValue('Canvas Size'));
check('the form closes', !(await page.evaluate(() => !!document.querySelector('.sub-pg-pop'))));

await clickText('.sub-pg-block button', 'Reset');
check('reset asks to confirm', await clickText('.sub-pg-block button', 'Cancel'));

await clickText('.sub-pg-link', 'Keyboard shortcuts');
check('keyboard shortcuts dialog', await page.evaluate(() => !!document.querySelector('dialog[open] .sub-pg-key-row')));
await page.keyboard.press('Escape');
await sleep(400);
await clickText('.sub-pg-link', 'About delphitools');
check('about delphitools dialog', await page.evaluate(() => !!document.querySelector('dialog[open] .dt-about-body')));
await page.keyboard.press('Escape');
await sleep(400);

await page.evaluate(() => document.querySelector('.sub-pg-tile')?.click());
await sleep(500);
check('gallery tile swaps the page for the gallery', (await text('.sub-pg-drawer .sub-panel-title')) === 'Projects', await text('.sub-pg-drawer .sub-panel-title'));
check('gallery shows New and the open document', await page.evaluate(() => document.querySelectorAll('.sub-gal-tile').length >= 2 && !!document.querySelector('.sub-gal-tile.is-current')));
check('gallery controls are named', (await unnamed('.sub-pg-drawer')).length === 0, (await unnamed('.sub-pg-drawer')).join(' | '));
await click('.sub-gal-tile.is-new');
check('new tile opens the new form', await page.evaluate(() => !!document.querySelector('.sub-pg-pop:popover-open')));
await click('.sub-pg-pop .paper-popover-trigger');
await sleep(300);
check('size popover opens', await page.evaluate(() => !!document.querySelector('.paper-popover:popover-open')));
await page.keyboard.type('instagram square');
await sleep(200);
const found = await page.$$eval('.paper-popover:popover-open .paper-cell', (c) => c.map((x) => x.textContent.trim()));
check('find narrows to one size', found.length === 1, found.join(' | '));
await click('.paper-popover .paper-cell');
await sleep(300);
check('pick closes the size popover, keeps the form', await page.evaluate(() => !document.querySelector('.paper-popover:popover-open') && !!document.querySelector('.sub-pg-pop:popover-open')));
check('trigger names the size', (await text('.sub-pg-pop .paper-popover-trigger')) === 'Instagram Square', await text('.sub-pg-pop .paper-popover-trigger'));
await clickText('.sub-pg-pop button', 'Create');
check('create closes the gallery', !(await rect('.sub-pg-drawer')));
await click(cell('Menu'));
check('the new document is 1080 square', (await rowValue('Canvas Size')) === '1080 × 1080 px', await rowValue('Canvas Size'));
check('it has no layers', (await rowValue('Layers')) === '0');
await click(cell('Menu'));
check('menu closes the page', !(await rect('.sub-pg-drawer')));

await page.evaluate(() =>
	window.__substrata.addRaster(200, 200, [{ x: 0, y: 0, w: 200, h: 200, colour: '#cc2222' }], { x: 540, y: 540 }),
);
await sleep(300);
await click(cell('Share'));
const pop = await rect('.sub-pg-pop');
const share = await rect(cell('Share'));
check('share opens the export popover', !!pop);
check('popover sits beside the share cell', pop && share && pop.right <= share.left + 1 && Math.abs(pop.top - share.top) < 40, JSON.stringify({ pop, share }));
check('share cell shows it open', await page.evaluate((s) => document.querySelector(s).classList.contains('canon-button--filled'), cell('Share')));
check('pixels at 1×', /1080\s*×\s*1080/.test(await text('.sub-pg-pop')), await text('.sub-pg-pop'));
await clickText('.sub-pg-pop button', '2×');
await sleep(200);
check('2× doubles the pixels', /2160\s*×\s*2160/.test(await text('.sub-pg-pop')), '');
await sleep(700);
check('file size estimate shows', /≈\s*[\d.,]+/.test(await text('.sub-pg-pop')), '');
await clickText('.sub-pg-pop button', 'Custom');
check('custom shows its field', /Custom/.test(await page.evaluate(() => [...document.querySelectorAll('.sub-pg-pop .canon-row-title')].map((t) => t.textContent).join())));
await clickText('.sub-pg-pop button', 'JPEG');
await sleep(150);
const q0 = await text('.sub-pg-pop .canon-slider');
await page.focus('.sub-pg-pop [role="slider"]');
await page.keyboard.press('ArrowLeft');
await sleep(150);
const q1 = await text('.sub-pg-pop .canon-slider');
check('quality slider takes arrow keys', q0 !== q1, `${q0} → ${q1}`);
check('export controls are named', (await unnamed('.sub-pg-pop')).length === 0, (await unnamed('.sub-pg-pop')).join(' | '));
await clickText('.sub-pg-pop button', 'Export');
await page.waitForFunction(() => !document.querySelector('.sub-pg-pop'), { timeout: 10000 }).catch(() => {});
check('export runs and closes the popover', !(await rect('.sub-pg-pop')));
await page.keyboard.down('Meta');
await page.keyboard.press('e');
await page.keyboard.up('Meta');
await sleep(400);
check('cmd+e opens the popover', !!(await rect('.sub-pg-pop')));
await page.keyboard.press('Escape');
await sleep(300);
check('escape closes it', !(await rect('.sub-pg-pop')));

await click('.sub-ed-title-name');
check('the title opens the rename form', await page.evaluate(() => document.activeElement?.matches('.sub-pg-pop input')));
await page.keyboard.type('Flyer');
await page.keyboard.press('Enter');
await sleep(300);
check('enter renames', (await text('.sub-ed-title-name')) === 'Flyer', await text('.sub-ed-title-name'));

await click('.sub-ed-help .sub-cell');
await sleep(800);
const help = await page.evaluate(() => {
	const notes = [...document.querySelectorAll('.sub-help-notes .sub-help-note')].map((n) => n.getBoundingClientRect());
	const overlap = notes.some((a, i) => notes.some((b, j) => j > i && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
	const inside = notes.every((r) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight);
	return { count: notes.length, overlap, inside, arrows: document.querySelectorAll('.sub-help-arrows path').length };
});
check('help notes every control', help.count >= 14 && help.arrows === help.count, JSON.stringify(help));
check('help notes stay on screen, apart', help.inside && !help.overlap, JSON.stringify(help));
await page.mouse.click(700, 500);
await sleep(400);
check('a click closes help', !(await rect('.sub-help')));

await click(cell('Menu'));
await switchIn('Save in this browser');
await sleep(800);
await page.evaluate(() => document.querySelector('.sub-pg-tile')?.click());
await sleep(1200);
const tiles = () => page.evaluate(() => document.querySelectorAll('.sub-gal-tile:not(.is-new):not(.is-persist)').length);
const before = await tiles();
check('saved, the gallery lists the project', before >= 1, `${before}`);
await page.evaluate(() => {
	const t = document.querySelector('.sub-gal-tile.is-current');
	t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 900 }));
});
await sleep(300);
await clickText('[role="menuitem"]', 'Duplicate');
await sleep(800);
check('duplicate adds a project', (await tiles()) === before + 1, `${await tiles()}`);
await page.evaluate(() => {
	const t = [...document.querySelectorAll('.sub-gal-tile:not(.is-new):not(.is-persist):not(.is-current)')][0];
	t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 900 }));
});
await sleep(300);
await clickText('[role="menuitem"]', 'Delete');
check('delete asks first', await page.evaluate(() => !!document.querySelector('dialog[open][role="alertdialog"]')));
await clickText('dialog[open] button', 'Delete');
await sleep(800);
check('delete removes it', (await tiles()) === before, `${await tiles()}`);
await click('.sub-pg-drawer .sub-panel-header [title="Close"]');
await click(cell('Menu'));
await switchIn('Save in this browser');
await sleep(300);
await click(cell('Menu'));

check('no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

await page.setViewport({ width: 390, height: 844 });
await sleep(800);
await click('.sub-ed-phone-stack [title="Menu"]');
const phoneDrawer = await rect('.sub-pg-drawer');
check('phone: settings drawer spans the width', phoneDrawer && phoneDrawer.left === 0 && phoneDrawer.right === 390, JSON.stringify(phoneDrawer));
await click('.sub-ed-phone-stack [title="Menu"]');
await click('.sub-ed-phone-stack [title="Share"]');
await sleep(400);
check('phone: export is a bottom sheet', await page.evaluate(() => !!document.querySelector('dialog.canon-sheet[open] .canon-segmented, dialog.canon-sheet[open] [role="radiogroup"], dialog.canon-sheet[open] button')));
await page.keyboard.press('Escape');
await sleep(500);
await click('.sub-ed-help .sub-cell');
await sleep(800);
const phoneHelp = await page.evaluate(() =>
	[...document.querySelectorAll('.sub-help-notes .sub-help-note')].every((n) => {
		const r = n.getBoundingClientRect();
		return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
	}),
);
check('phone: help notes stay on screen', phoneHelp);
check('phone: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

const fresh = await browser.newPage();
await fresh.setViewport({ width: 1400, height: 1000 });
await fresh.evaluateOnNewDocument(() => {
	Object.defineProperty(navigator, 'webdriver', { get: () => false });
	localStorage.removeItem('substrata:onboarding-seen');
});
await fresh.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await fresh.waitForFunction(() => window.__substrataUi, { timeout: 30000 });
await sleep(800);
check('onboarding opens on a first visit', await fresh.evaluate(() => !!document.querySelector('dialog[open] .sub-pg-onb-page')));
for (let i = 0; i < 6; i++) {
	const done = await fresh.evaluate(() => {
		const b = [...document.querySelectorAll('dialog[open] .sub-pg-onb-bar button')].at(-1);
		if (!b) return true;
		b.click();
		return false;
	});
	await sleep(250);
	if (done) break;
}
await sleep(400);
check('onboarding ends on the New card', await fresh.evaluate(() => !document.querySelector('dialog[open] .sub-pg-onb-page') && !!document.querySelector('.sub-new .sub-empty-card')));
await fresh.keyboard.press('Escape');
await sleep(400);
check('closing the New card leaves the default scene', (await fresh.evaluate(() => document.querySelector('.sub-ed-title-name')?.textContent.trim())) === 'Untitled scene');

await page.evaluate(() => {
	window.__substrataUi.helpOpen = false;
	window.__substrataUi.pageOpen = true;
});
await sleep(300);
await page.evaluate(() => document.querySelector('.sub-pg-drawer .sub-panel-header [title="Back to delphitools"]').click());
await page.waitForFunction(() => location.pathname === '/', { timeout: 5000 }).catch(() => {});
check('header cell goes back to delphitools', await page.evaluate(() => location.pathname === '/'));

await finish(browser);
