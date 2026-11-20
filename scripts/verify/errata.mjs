import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, beginText, decodePDFRawStream, degrees, endText, moveText, rgb, setFontAndSize, showText } from 'pdf-lib';
import * as mupdf from 'mupdf';
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { BASE, check, finish, launch, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page.goto(`${BASE}/errata`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__errata, { timeout: 20000 });

const src = await PDFDocument.create();
src.addPage([400, 500]).drawText('one', { x: 40, y: 450, size: 24 });
// widths cover e..o only
const limited = src.addPage([500, 300]);
limited.node.setFontDictionary(
	PDFName.of('F9'),
	src.context.register(
		src.context.obj({
			Type: 'Font',
			Subtype: 'Type1',
			BaseFont: 'Helvetica',
			Encoding: 'WinAnsiEncoding',
			FirstChar: 101,
			LastChar: 111,
			Widths: [556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556],
			FontDescriptor: src.context.register(src.context.obj({ Type: 'FontDescriptor', FontName: 'Helvetica', Flags: 32, FontBBox: [-166, -225, 1000, 931], ItalicAngle: 0, Ascent: 718, Descent: -207, CapHeight: 718, StemV: 88 })),
		}),
	),
);
limited.pushOperators(beginText(), setFontAndSize('F9', 24), moveText(40, 250), showText(PDFHexString.of('6f6e65')), endText());
const bytes = [...(await src.save())];

const loaderSeen = await page.evaluate((b) => {
	let seen = false;
	const watch = new MutationObserver(() => {
		seen ||= !!document.querySelector('.err-opening .canon-loader');
	});
	watch.observe(document.body, { childList: true, subtree: true });
	return window.__errata.open(new Uint8Array(b).buffer, 'fixture.pdf', 'application/pdf').then(() => {
		watch.disconnect();
		return seen;
	});
}, bytes);
await page.waitForFunction(() => window.__errata.doc()?.pages.length === 2, {
	timeout: 10000,
});
await sleep(600);
check('open loader shown', loaderSeen);
check('open loader gone', !(await page.$('.err-opening')));

const doc = () => page.evaluate(() => window.__errata.doc());
const activeTool = () => page.evaluate(() => document.querySelector('.sub-ed-tools [aria-pressed="true"]')?.getAttribute("aria-label"));
const objects = async () => (await doc()).pages[await page.evaluate(() => window.__errata.pageIndex())].objects;

check('page label', (await page.$eval('[data-page-label]', (e) => e.textContent.trim())) === 'Page 1 / 2');
check('rail cells', (await page.$$('.err-page-cell')).length === 2);
check('thumb rendered', await page.$eval('.err-page-thumb', (i) => i.src.startsWith('data:image/png') && i.naturalWidth > 0));

const box = await page.$eval('.sub-canvas-wrap canvas', (c) => {
	const r = c.getBoundingClientRect();
	return { x: r.left, y: r.top, w: r.width, h: r.height };
});
const cx = box.x + box.w / 2;
const cy = box.y + box.h / 2;

await page.keyboard.press('e');
await sleep(700);
const rect0 = await page.evaluate(() => window.__errata.pageRect(0));
const line = await page.evaluate(async () => (await window.__errata.content(0)).lines[0]);
check('content line', line && line.text === 'one', JSON.stringify(line));
const zoom = rect0.w / 400;
const lx = rect0.x + (line.box.x + line.box.width / 2) * zoom;
const ly = rect0.y + (line.box.y + line.box.height / 2) * zoom;
await page.mouse.move(lx, ly);
await page.mouse.down();
await page.mouse.move(lx + 20 * zoom, ly + 10 * zoom, { steps: 8 });
await page.mouse.move(lx + 40 * zoom, ly + 20 * zoom, { steps: 8 });
await page.mouse.up();
await sleep(900);
let edits = (await doc()).pages[0].edits;
check('content moved', edits.length === 1 && edits[0].kind === 'move' && Math.abs(edits[0].dx - 40) < 1.5 && Math.abs(edits[0].dy + 20) < 1.5, JSON.stringify(edits));
const movedLine = await page.evaluate(async () => (await window.__errata.content(0)).lines[0]);
check('content re-read', Math.abs(movedLine.box.x - line.box.x - edits[0].dx) < 0.01 && Math.abs(movedLine.box.y - line.box.y + edits[0].dy) < 0.01, JSON.stringify(movedLine.box));
check('content stays selected', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.hoverCursor === 'move'));
check('content hud', await page.$eval('.err-hud', (h) => !h.hidden && /Text · Helvetica 24/.test(h.textContent) && /pt$/.test(h.textContent)), await page.$eval('.err-hud', (h) => h.textContent));
const hudLeft = await page.$eval('.err-hud', (h) => h.getBoundingClientRect().left);
check('content hud placed', Math.abs(hudLeft - (rect0.x + movedLine.box.x * zoom)) < 4, `${hudLeft} vs ${rect0.x + movedLine.box.x * zoom}`);
await page.keyboard.press('Backspace');
await sleep(900);
edits = (await doc()).pages[0].edits;
check('content deleted', edits.length === 2 && edits[1].kind === 'delete', JSON.stringify(edits));
check('content gone', (await page.evaluate(async () => (await window.__errata.content(0)).lines.length)) === 0);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(600);
check('content undo', (await doc()).pages[0].edits.length === 1);
await sleep(600);

const line2 = await page.evaluate(async () => (await window.__errata.content(0)).lines[0]);
const ex = rect0.x + (line2.box.x + line2.box.width / 2) * zoom;
const ey = rect0.y + (line2.box.y + line2.box.height / 2) * zoom;
await page.mouse.click(ex, ey);
await page.mouse.click(ex, ey);
await sleep(700);
check('text editor open', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.isEditing === true));
check('text editor covers original', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.backgroundColor === '#fff'));
const face0 = await page.evaluate(() => window.__errata.fontFace(0, 'Helvetica'));
check('text editor font', face0 && face0.sample === 'two' && (await page.evaluate(() => window.__errataCanvas.getActiveObject()?.fontFamily)) === face0.family, JSON.stringify(face0));
await page.keyboard.type('two');
await page.keyboard.press('Enter');
await sleep(1000);
edits = (await doc()).pages[0].edits;
check('text edit stored', edits.length === 2 && edits[1].kind === 'text' && edits[1].text === 'two' && edits[1].codes.join() === '116,119,111', JSON.stringify(edits[1]));
check('text edit re-read', (await page.evaluate(async () => (await window.__errata.content(0)).lines[0]?.text)) === 'two');
check('text editor closed', await page.evaluate(() => !window.__errataCanvas.getObjects().some((o) => o.isEditing)));
await page.mouse.click(ex, ey);
await page.mouse.click(ex, ey);
await sleep(700);
await page.keyboard.type('→');
await page.keyboard.press('Enter');
await sleep(400);
check('text edit refused', await page.$eval('.err-hud', (h) => !h.hidden && h.textContent.includes('✗')) && (await doc()).pages[0].edits.length === 2);
check('text editor still open', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.isEditing === true));
await page.keyboard.press('Escape');
await sleep(400);
check('text edit cancelled', (await doc()).pages[0].edits.length === 2 && (await page.evaluate(() => !window.__errataCanvas.getObjects().some((o) => o.isEditing))));

await page.keyboard.press(']');
await sleep(900);
const rect1 = await page.evaluate(() => window.__errata.pageRect(1));
const line3 = await page.evaluate(async () => (await window.__errata.content(1)).lines[0]);
check('limited line', line3?.text === 'one', JSON.stringify(line3));
const zoom1 = rect1.w / 500;
const sx = rect1.x + (line3.box.x + line3.box.width / 2) * zoom1;
const sy = rect1.y + (line3.box.y + line3.box.height / 2) * zoom1;
await page.mouse.click(sx, sy);
await page.mouse.click(sx, sy);
await sleep(700);
check('limited editor open', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.isEditing === true));
await page.keyboard.type('zone');
await sleep(200);
check('hud font unavailable', await page.$eval('.err-hud', (h) => !h.hidden && h.classList.contains('is-warn') && h.textContent === 'Font unavailable'), await page.$eval('.err-hud', (h) => h.className + ' ' + h.textContent));
await page.keyboard.press('Enter');
await sleep(1000);
const subEdits = (await doc()).pages[1].edits;
check('substitute edit stored', subEdits.length === 1 && subEdits[0].kind === 'text' && subEdits[0].font === 'Helvetica' && subEdits[0].codes.join() === '122,111,110,101', JSON.stringify(subEdits));
const subLine = await page.evaluate(async () => { const c = await window.__errata.content(1); return { text: c.lines[0]?.text, warnings: c.warnings }; });
check('substitute re-read', subLine.text === 'zone' && subLine.warnings.length === 0, JSON.stringify(subLine));
check('substitute hud after commit', await page.$eval('.err-hud', (h) => !h.hidden && h.classList.contains('is-warn') && /Helvetica 24/.test(h.textContent) && /Font unavailable/.test(h.textContent)), await page.$eval('.err-hud', (h) => h.textContent));
await page.keyboard.press('[');
await sleep(600);
await page.keyboard.press('v');
await sleep(200);

const pngPath = join(tmpdir(), 'errata-harness.png');
const pngData = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 64); return c.toDataURL().split(',')[1]; });
writeFileSync(pngPath, Buffer.from(pngData, 'base64'));
const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.keyboard.press('i')]);
await chooser.accept([pngPath]);
await sleep(800);
let objs = await objects();
check('image placed', objs.length === 1 && objs[0].kind === 'image' && Math.round(objs[0].cx) === 200 && Math.round(objs[0].cy) === 250 && objs[0].w === 64 && objs[0].h === 64, JSON.stringify(objs[0]).slice(0, 160));
check('image tool returns to select', (await activeTool()) === 'Select (V)');
const imgOpacity = () => page.evaluate(() => window.__errataCanvas.getActiveObject()?.opacity);
check('image opaque inside', (await imgOpacity()) === 1);
const rectImg = await page.evaluate(() => window.__errata.pageRect(0));
const zi = rectImg.w / 400;
const ix = rectImg.x + 200 * zi;
const iy = rectImg.y + 250 * zi;
await page.mouse.move(ix, iy);
await page.mouse.down();
await page.mouse.move(ix - 100 * zi, iy, { steps: 6 });
await page.mouse.move(ix - 250 * zi, iy, { steps: 6 });
check('image dims outside', (await imgOpacity()) === 0, `opacity ${await imgOpacity()}`);
await page.mouse.move(ix - 50 * zi, iy, { steps: 6 });
check('image opaque again', (await imgOpacity()) === 1);
await page.mouse.up();
await sleep(300);
check('image still one object', (await objects()).length === 1);
await page.keyboard.press('Delete');
await sleep(300);
check('image removed', (await objects()).length === 0);

await page.keyboard.press('h');
await page.mouse.move(cx - 60, cy - 20);
await page.mouse.down();
await page.mouse.move(cx + 60, cy + 10, { steps: 6 });
await page.mouse.up();
await sleep(200);
objs = await objects();
check('highlight added', objs.length === 1 && objs[0].kind === 'shape' && objs[0].shape === 'highlight', JSON.stringify(objs[0]));
check('highlight size', objs[0] && objs[0].w > 50 && objs[0].h > 10, `${objs[0]?.w}x${objs[0]?.h}`);

await page.keyboard.press('p');
await page.mouse.move(cx - 40, cy + 60);
await page.mouse.down();
await page.mouse.move(cx + 40, cy + 90, { steps: 8 });
await page.mouse.up();
await sleep(200);
objs = await objects();
check('ink added', objs.length === 2 && objs[1].kind === 'ink' && objs[1].d.startsWith('M'), objs[1]?.d?.slice(0, 30));
const inkScreen = await page.evaluate(() => {
	const c = window.__errataCanvas;
	const ink = c.getObjects().findLast((o) => o.type === 'path');
	const p = ink.getCenterPoint();
	const v = c.viewportTransform;
	const r = c.upperCanvasEl.getBoundingClientRect();
	return { x: r.left + p.x * v[0] + v[4], y: r.top + p.y * v[3] + v[5] };
});
check('ink stays where drawn', Math.abs(inkScreen.x - cx) < 4 && Math.abs(inkScreen.y - (cy + 75)) < 4, JSON.stringify({ inkScreen, want: [cx, cy + 75] }));

await page.keyboard.press('t');
await page.mouse.click(cx - 100, cy - 120);
await sleep(150);
await page.keyboard.type('Hello');
await page.keyboard.press('Escape');
await sleep(200);
objs = await objects();
check('text added', objs.length === 3 && objs[2].kind === 'text' && objs[2].text === 'Hello', JSON.stringify(objs[2]));
check('text measured', objs[2] && objs[2].w > 10 && objs[2].h > 5, `${objs[2]?.w}x${objs[2]?.h}`);

await page.keyboard.press('v');
await page.mouse.click(cx, cy - 5);
await page.mouse.down();
await page.mouse.move(cx + 30, cy + 25, { steps: 5 });
await page.mouse.up();
await sleep(200);
const moved = (await objects())[0];
check('highlight moved', Math.abs(moved.cx - objs[0].cx) > 5, `${objs[0].cx} -> ${moved.cx}`);

await page.keyboard.press('Delete');
await sleep(150);
check('delete removes', (await objects()).length === 2);

await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(150);
check('undo restores', (await objects()).length === 3);

const before = (await doc()).pages[0];
await page.click('.err-page-cell.is-current .err-page-action[aria-label="Rotate page"]');
await sleep(400);
const after = (await doc()).pages[0];
check('rotation stored', after.rotation === 90, String(after.rotation));
check('objects carried', after.objects[2].angle === before.objects[2].angle + 90);

await page.keyboard.press('v');
await page.mouse.move(cx, cy);
await page.mouse.wheel({ deltaY: 3000 });
await sleep(400);
check('scroll changes page', (await page.evaluate(() => window.__errata.pageIndex())) === 1);
await page.mouse.wheel({ deltaY: -3000 });
await sleep(400);
check('scroll back', (await page.evaluate(() => window.__errata.pageIndex())) === 0);

await page.hover('.err-page-gap[data-index="1"]');
await page.click('.err-page-gap[data-index="1"] [aria-label="Insert blank page"]');
await sleep(200);
check(
	'blank inserted',
	(await doc()).pages.length === 3 && (await doc()).pages[1].sourceIndex === null,
);
check('current follows insert', (await page.evaluate(() => window.__errata.pageIndex())) === 1);
await page.keyboard.press(']');
await sleep(150);
check('page key', (await page.evaluate(() => window.__errata.pageIndex())) === 2);

await page.click('[data-toolbox]');
await sleep(500);
check('sheet opens', await page.$eval('.err-sheet', (e) => e.classList.contains('is-open')));
check('bar hidden', !(await page.$('.sub-ed-bar')));
await page.evaluate(() => [...document.querySelectorAll('.err-sheet .sub-menu-card')].find((b) => b.querySelector('.sub-menu-card-title')?.textContent.trim() === 'Crop')?.click());
await sleep(500);
check('sheet closes', !(await page.$eval('.err-sheet', (e) => e.classList.contains('is-open'))));
check('mode bar', await page.$eval('.err-mode', (e) => e.classList.contains('is-open')));

await sleep(300);
const box3 = await page.evaluate(() => window.__errata.pageRect(2));
check('page 3 rect', !!box3 && box3.w > 100 && box3.h > 50, JSON.stringify(box3));
await page.mouse.move(box3.x + box3.w / 2 - 100, box3.y + box3.h / 2 - 40);
await page.mouse.down();
await page.mouse.move(box3.x + box3.w / 2 + 100, box3.y + box3.h / 2 + 40, { steps: 6 });
await page.mouse.up();
await sleep(300);
check('crop waits for apply', !(await doc()).pages[2].crop);
// client px, page points
const cropDraft = () => page.evaluate(() => {
	const c = window.__errataCanvas;
	const a = c.getActiveObject();
	if (!a || !a.strokeDashArray || a.type !== 'rect') return null;
	const r = c.upperCanvasEl.getBoundingClientRect();
	const at = (k) => ({ x: r.left + a.oCoords[k].x, y: r.top + a.oCoords[k].y });
	return { tl: at('tl'), br: at('br'), mr: at('mr'), rotate: a.isControlVisible('mtr'), w: a.width * a.scaleX, h: a.height * a.scaleY };
});
let draft = await cropDraft();
check('crop draft shown', !!draft && !draft.rotate && Math.abs(draft.w - 200 / (box3.w / 500)) < 2, JSON.stringify(draft));
const cropZ = box3.w / 500;
const mid = { x: (draft.tl.x + draft.br.x) / 2, y: (draft.tl.y + draft.br.y) / 2 };
await page.mouse.move(mid.x, mid.y);
await page.mouse.down();
await page.mouse.move(mid.x + 10 * cropZ, mid.y + 5 * cropZ, { steps: 4 });
await page.mouse.move(mid.x + 20 * cropZ, mid.y + 10 * cropZ, { steps: 4 });
await page.mouse.up();
await sleep(250);
const movedDraft = await cropDraft();
check('crop draft moves', !!movedDraft && Math.abs(movedDraft.tl.x - draft.tl.x - 20 * cropZ) < 2 && Math.abs(movedDraft.tl.y - draft.tl.y - 10 * cropZ) < 2, JSON.stringify(movedDraft));
await page.mouse.move(movedDraft.mr.x, movedDraft.mr.y);
await page.mouse.down();
await page.mouse.move(movedDraft.mr.x - 20 * cropZ, movedDraft.mr.y, { steps: 4 });
await page.mouse.move(movedDraft.mr.x - 40 * cropZ, movedDraft.mr.y, { steps: 4 });
await page.mouse.up();
await sleep(250);
draft = await cropDraft();
check('crop draft resizes', !!draft && Math.abs(draft.w - movedDraft.w + 40) < 2, JSON.stringify(draft));
check('crop still waits', !(await doc()).pages[2].crop);
const wantCrop = { x: (draft.tl.x - box3.x) / cropZ, y: (draft.tl.y - box3.y) / cropZ, width: draft.w, height: draft.h };
await page.evaluate(() => [...document.querySelectorAll('.err-mode.is-open button')].find((b) => b.textContent.trim() === 'Apply')?.click());
await sleep(300);
let cropped = (await doc()).pages[2];
check('crop stored', !!cropped.crop && ['x', 'y', 'width', 'height'].every((k) => Math.abs(cropped.crop[k] - wantCrop[k]) < 1.5), `${JSON.stringify(cropped.crop)} vs ${JSON.stringify(wantCrop)}`);
check('crop inside source', cropped.crop.x >= 0 && cropped.crop.x + cropped.crop.width <= 500);
check('mode bar gone', !(await page.$eval('.err-mode', (e) => e.classList.contains('is-open'))));
check('crop draft gone', await page.evaluate(() => !window.__errataCanvas.getObjects().some((o) => o.type === 'rect' && o.strokeDashArray && o.evented !== false && o.selectable)));

const modeOpen = (m) => page.$(`.err-mode.is-open[data-mode="${m}"]`).then((e) => !!e);
const clickIn = (label) => page.evaluate((l) => [...document.querySelectorAll('.err-mode.is-open button')].find((b) => b.textContent.trim() === l || b.getAttribute('aria-label') === l)?.click(), label);

await page.click('.sub-ed-stack [aria-label="Menu"]');
await sleep(300);
await page.click('.err-menu [data-menu="page-size"]');
await sleep(500);
check('page size panel', await modeOpen('page-size'));
check('page size not a dialog', !(await page.$('dialog[open]')));
await clickIn('A4');
await clickIn('Resample');
await sleep(100);
await clickIn('Fit page');
await page.evaluate(() => document.querySelector('.err-mode.is-open .canon-switch')?.click());
await clickIn('Apply');
await sleep(400);
check('page size panel closed', !(await modeOpen('page-size')));
cropped = (await doc()).pages[2];
check('resize stored', cropped.resize?.mode === 'fit' && Math.round(cropped.resize.width) === 859 && Math.round(cropped.resize.height) === 612 && Math.round(cropped.resize.bleed) === 9, JSON.stringify(cropped.resize));
check('thumb re-rendered', await page.$$eval('.err-page-thumb', (imgs) =>
		Math.abs(imgs[2].naturalWidth / imgs[2].naturalHeight - 859 / 612) < 0.05));

const sizesOf = async () => (await doc()).pages.map((p) => p.resize && [Math.round(p.resize.width), Math.round(p.resize.height)]);
const sizesBefore = await sizesOf();
await page.click('[data-toolbox]');
await sleep(400);
await page.evaluate(() => [...document.querySelectorAll('.err-sheet .sub-menu-card')].find((b) => b.querySelector('.sub-menu-card-title')?.textContent.trim() === 'Page size')?.click());
await sleep(500);
check('page size from toolbox', await modeOpen('page-size'));
await clickIn('A3');
await clickIn('Range');
await sleep(100);
check('page size waits for a range', await page.$eval('.err-mode.is-open .err-mode-apply', (b) => b.disabled));
await page.type('.err-mode.is-open input[aria-label="Range"]', '1-2');
await sleep(100);
await clickIn('Apply');
await sleep(400);
// click() keeps input focused
await page.evaluate(() => document.activeElement?.blur());
const sizesScoped = await sizesOf();
// turned page stored unrotated
check('page size range applied', JSON.stringify(sizesScoped.slice(0, 2)) === '[[859,1208],[1208,859]]' && JSON.stringify(sizesScoped[2]) === JSON.stringify(sizesBefore[2]), JSON.stringify(sizesScoped));
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
check('page size range one undo step', JSON.stringify(await sizesOf()) === JSON.stringify(sizesBefore), JSON.stringify(await sizesOf()));

await page.keyboard.press('g');
await sleep(700);
const barVisible = () => page.evaluate(() => document.querySelector('.sub-ed-bar')?.offsetParent != null);
check('signature panel', (await modeOpen('signature')) && !(await page.$('dialog[open]')) && !(await barVisible()));
const pad = await page.$eval('.err-sig-pad', (c) => {
	const r = c.getBoundingClientRect();
	return { x: r.left, y: r.top };
});
await page.mouse.move(pad.x + 40, pad.y + 90);
await page.mouse.down();
await page.mouse.move(pad.x + 200, pad.y + 60, { steps: 10 });
await page.mouse.move(pad.x + 300, pad.y + 120, { steps: 10 });
await page.mouse.up();
await clickIn('Place');
await sleep(400);
check('signature panel closes on place', !(await modeOpen('signature')) && (await barVisible()));
objs = await objects();
check('signature placed', objs.length === 1 && objs[0].kind === 'image' && objs[0].dataUrl.startsWith('data:image/png'));
check('signature saved', await page.evaluate(() => JSON.parse(localStorage.getItem('errata:signatures') ?? '[]').length === 1));

const out = await page.evaluate(() => window.__errata.export());
check('export bytes', Array.isArray(out) && out.length > 500);
const result = await PDFDocument.load(new Uint8Array(out));
check('export pages', result.getPageCount() === 3);
check('export resized page', Math.round(result.getPage(2).getWidth()) === 859 && Math.round(result.getPage(2).getHeight()) === 612);
check('export rotation', result.getPage(0).getRotation().angle === 90);
// export wraps q/Q streams
const contents0 = result.getPage(0).node.Contents();
const streams0 = contents0.constructor.name === 'PDFArray' ? contents0.asArray().map((r) => result.context.lookup(r)) : [contents0];
const text0 = streams0.map((st) => new TextDecoder('latin1').decode(decodePDFRawStream(st).decode())).join('\n');
check('export edited stream', /Tm\s*\[[-\d.]+\]\s*TJ/.test(text0));
check('export edited text', /<74776f> Tj/i.test(text0));
// resized page is xobject
const allText = result.context.enumerateIndirectObjects().flatMap(([, obj]) => {
	if (!obj || typeof obj.getContents !== 'function' || obj.constructor.name !== 'PDFRawStream') return [];
	try { return [new TextDecoder('latin1').decode(decodePDFRawStream(obj).decode())]; } catch { return []; }
}).join('\n');
check('export substitute font', /\/ErrHelv 24 Tf\s*<7a6f6e65> Tj\s*\/F9 24 Tf/.test(allText));
// blank copies rotated size
check('export blank size', result.getPage(1).getWidth() === 500 && result.getPage(1).getHeight() === 400);

const openCell = async (name) => {
	await page.click('[data-toolbox]');
	await sleep(400);
	await page.evaluate((n) => [...document.querySelectorAll('.err-sheet .sub-menu-card')].find((b) => b.querySelector('.sub-menu-card-title')?.textContent.trim() === n)?.click(), name);
	await sleep(500);
};
const previews = () => page.evaluate(() => window.__errataCanvas.getObjects().filter((o) => !o.evented && typeof o.text === 'string').map((o) => o.text));
const texts = async () => (await doc()).pages.map((p) => p.objects.filter((o) => o.kind === 'text').map((o) => o.text));

await openCell('Page numbers');
check('numbers mode bar', await modeOpen('page-numbers'));
const fieldColumns = (sel = '.err-mode.is-open') => page.$$eval(`${sel} .err-mode-body > .err-mode-field .canon-row-title`, (ls) => new Set(ls.map((l) => Math.round(l.getBoundingClientRect().left))).size);
const panelBox = () => page.$eval('.err-mode.is-open', (e) => {
	const r = e.getBoundingClientRect();
	return { left: r.left, right: r.right, h: r.height, vw: innerWidth };
});
const wide = await panelBox();
const wideColumns = await fieldColumns();
check('numbers panel columns', wide.h < 180 && wideColumns >= 2, JSON.stringify({ ...wide, wideColumns }));
const anchorCells = (sel = '.err-mode.is-open') => page.$$eval(`${sel} .err-anchor-cell`, (cs) => cs.map((c) => `${c.dataset.anchor}:${c.getAttribute('aria-checked')}`));
const numberCells = await anchorCells();
check('numbers position picker', numberCells.length === 9 && numberCells.filter((c) => c.endsWith(':true')).join() === 'bottom-center:true', JSON.stringify(numberCells));
const previewAt = () => page.evaluate(() => window.__errataCanvas.getObjects().filter((o) => !o.evented && typeof o.text === 'string').map((o) => ({ left: o.left, top: o.top })));
const atBottom = await previewAt();
await page.click('.err-mode.is-open .err-anchor-cell[data-anchor="top-right"]');
await sleep(200);
const atTop = await previewAt();
check('numbers picker moves preview', atTop.length === 3 && atTop.every((p, i) => p.top < atBottom[i].top && p.left > atBottom[i].left), JSON.stringify([atBottom[0], atTop[0]]));
await page.click('.err-mode.is-open .err-anchor-cell[data-anchor="bottom-center"]');
await sleep(200);
await page.setViewport({ width: 640, height: 1000 });
await sleep(400);
const narrow = await panelBox();
const narrowColumns = await fieldColumns();
check('numbers panel one column when narrow', narrow.h > wide.h && narrowColumns === 1 && narrow.left >= 0 && narrow.right <= narrow.vw, JSON.stringify({ ...narrow, narrowColumns }));
await page.setViewport({ width: 1400, height: 1000 });
await sleep(400);
check('numbers markup bar hidden', !(await page.$('.sub-ed-bar')));
check('numbers preview', JSON.stringify(await previews()) === JSON.stringify(['1 / 3', '2 / 3', '3 / 3']), JSON.stringify(await previews()));
await page.keyboard.press('t');
check('numbers mode swallows tool keys', (await activeTool()) === 'Select (V)');
const beforeNumbers = await texts();
await clickIn('Apply');
await sleep(500);
let afterTexts = await texts();
check('numbers applied', afterTexts.every((t, i) => t.length === beforeNumbers[i].length + 1 && t.at(-1) === `${i + 1} / 3`), JSON.stringify(afterTexts));
check('numbers mode closed', !(await modeOpen('page-numbers')) && (await previews()).length === 0);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
check('numbers one undo step', JSON.stringify(await texts()) === JSON.stringify(beforeNumbers));
await page.keyboard.down('Meta');
await page.keyboard.down('Shift');
await page.keyboard.press('z');
await page.keyboard.up('Shift');
await page.keyboard.up('Meta');
await sleep(300);

await openCell('Watermark');
check('watermark mode bar', await modeOpen('watermark'));
await clickIn('Current');
await sleep(200);
check('watermark preview current only', (await previews()).length === 1);
const slide = async (label, value) => {
	const sel = `.err-mode.is-open [role="slider"][aria-label="${label}"]`;
	await page.focus(sel);
	await page.keyboard.press('Home');
	for (let i = 0; i < 400; i++) {
		const now = await page.$eval(sel, (el) => Number(el.getAttribute('aria-valuenow')));
		if (now >= value) break;
		await page.keyboard.press('ArrowRight');
	}
};
const wmPreview = () => page.evaluate(() => window.__errataCanvas.getObjects().filter((o) => !o.evented && o.text === 'DRAFT').map((o) => [Math.round(o.opacity * 100), o.angle]));
const sliderRange = await page.$$eval('.err-mode.is-open [role="slider"]', (els) => els.map((e) => `${e.getAttribute('aria-label')}:${e.getAttribute('aria-valuemin')}..${e.getAttribute('aria-valuemax')}`));
check('watermark sliders', sliderRange.join() === 'Opacity:5..100,Angle:-90..90', sliderRange.join());
await slide('Opacity', 60);
await slide('Angle', 45);
await sleep(100);
const wmMid = await wmPreview();
await slide('Opacity', 30);
await slide('Angle', 20);
await sleep(100);
const wmEnd = await wmPreview();
check('watermark preview follows sliders', JSON.stringify(wmMid) === '[[60,45]]' && JSON.stringify(wmEnd) === '[[30,20]]', JSON.stringify([wmMid, wmEnd]));
check('watermark slider readout', (await page.$$eval('.err-mode.is-open .canon-slider-readout', (els) => els.map((e) => e.textContent.trim()))).join() === '30%,20°');
const wmPage = await page.evaluate(() => window.__errata.pageIndex());
await clickIn('Apply');
await sleep(500);
const wm = (await doc()).pages[wmPage].objects.at(-1);
check('watermark applied', wm?.kind === 'text' && wm.text === 'DRAFT' && wm.opacity === 0.3 && wm.angle === 20, JSON.stringify(wm));
check('watermark canvas opacity', await page.evaluate((id) => window.__errataCanvas.getObjects().some((o) => o.text === 'DRAFT' && Math.abs(o.opacity - 0.3) < 1e-9 && o.evented), wm?.id));

await openCell('Stamp');
check('stamp mode bar', await modeOpen('stamp'));
await clickIn('Range');
await sleep(200);
check('stamp apply waits for a range', await page.$eval('.err-mode.is-open .err-mode-apply', (b) => b.disabled));
await page.type('.err-mode.is-open input[aria-label="Range"]', '1, 3');
await sleep(200);
await clickIn('Apply');
await sleep(500);
afterTexts = await texts();
check('stamp applied to range', afterTexts[0].includes('APPROVED') && !afterTexts[1].includes('APPROVED') && afterTexts[2].includes('APPROVED'), JSON.stringify(afterTexts));

await openCell('Stamp');
const stampCells = await anchorCells();
check('stamp position picker', stampCells.length === 9 && stampCells.filter((c) => c.endsWith(':true')).join() === 'top-right:true', JSON.stringify(stampCells));
await page.evaluate(() => {
	const label = document.querySelector('.err-mode.is-open select[aria-label="Label"]');
	label.value = [...label.options].find((o) => o.textContent.trim() === 'Custom').value;
	label.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(200);
check('stamp custom waits for text', await page.$eval('.err-mode.is-open .err-mode-apply', (b) => b.disabled));
await page.type('.err-mode.is-open input[aria-label="Custom label"]', 'Seen ok');
await page.click('.err-mode.is-open input[aria-label="Bold"]');
await page.click('.err-mode.is-open [aria-label="Blue"]');
await page.click('.err-mode.is-open .err-anchor-cell[data-anchor="bottom-left"]');
await clickIn('Custom');
await sleep(100);
await page.focus('.err-mode.is-open input[aria-label="Custom size"]');
await page.keyboard.press('ArrowUp');
await clickIn('Current');
await sleep(200);
const customPreview = await page.evaluate(() => window.__errataCanvas.getObjects().filter((o) => !o.evented && o.text === 'Seen ok').map((o) => `${o.fontWeight}:${o.fill}`));
check('stamp custom preview', JSON.stringify(customPreview) === '["bold:#0550ae"]', JSON.stringify(customPreview));
const customPage = await page.evaluate(() => window.__errata.pageIndex());
await clickIn('Apply');
await sleep(500);
const custom = (await doc()).pages[customPage].objects.at(-1);
check('stamp custom applied', custom?.text === 'Seen ok' && custom.bold === true && custom.colour === '#0550ae' && Math.abs(custom.cx - custom.w / 2 - 24) < 0.01, JSON.stringify(custom));
check('stamp custom size stepper', custom?.fontSize === 25, String(custom?.fontSize));
check('stamp custom canvas bold', await page.evaluate(() => window.__errataCanvas.getObjects().some((o) => o.evented && o.text === 'Seen ok' && o.fontWeight === 'bold')));
await openCell('Stamp');
await page.keyboard.press('Escape');
await sleep(300);
check('escape cancels mode', !(await modeOpen('stamp')) && (await previews()).length === 0);

const stamped = await PDFDocument.load(new Uint8Array(await page.evaluate(() => window.__errata.export())));
const gs = stamped.getPage(wmPage).node.Resources()?.lookup(PDFName.of('ExtGState'));
const gsOpacity = gs ? gs.entries().map(([, v]) => String(stamped.context.lookup(v).get(PDFName.of('ca')))) : [];
check('export watermark opacity', gsOpacity.includes('0.3'), JSON.stringify(gsOpacity));
const customOut = stamped.getPage(customPage).node;
const customFonts = customOut.Resources()?.lookup(PDFName.of('Font'));
const fontNames = Object.fromEntries(customFonts ? customFonts.entries().map(([k, v]) => [k.asString().slice(1), String(stamped.context.lookup(v).get(PDFName.of('BaseFont')))]) : []);
const customContents = customOut.Contents();
const customStreams = customContents.constructor.name === 'PDFArray' ? customContents.asArray().map((r) => stamped.context.lookup(r)) : [customContents];
const customText = customStreams.map((st) => new TextDecoder('latin1').decode(decodePDFRawStream(st).decode())).join('\n');
const customFont = /\/(\S+) [\d.]+ Tf[^/]*?<5365656e206f6b> Tj/i.exec(customText)?.[1];
check('export custom stamp bold font', fontNames[customFont] === '/Helvetica-Bold', JSON.stringify({ customFont, fontNames }));

const downloads = mkdtempSync(join(tmpdir(), 'errata-dl-'));
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
const undoStep = async () => {
	await page.keyboard.down('Meta');
	await page.keyboard.press('z');
	await page.keyboard.up('Meta');
	await sleep(600);
};
const loadPdf = (b) => getDocument({ data: b.slice(), isEvalSupported: false, standardFontDataUrl: new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise;
const exportBytes = async () => new Uint8Array(await page.evaluate(() => window.__errata.export()));

const beforeCompress = await doc();
await openCell('Compress');
check('compress mode bar', await modeOpen('compress'));
await clickIn('Apply');
await page.waitForSelector('[data-compress-result]', { timeout: 30000 }).catch(() => null);
const afterCompress = await doc();
const objectCount = (d) => d.pages.reduce((n, p) => n + p.objects.filter((o) => o.kind !== 'comment').length + p.edits.length, 0);
check('compress replaces source', !!afterCompress.source && afterCompress.source !== beforeCompress.source && afterCompress.pages.length === 3 && afterCompress.pages.every((p, i) => p.sourceIndex === i && !p.resize && !p.crop), JSON.stringify(afterCompress.pages.map((p) => [p.sourceIndex, p.resize, p.crop])));
check('compress bakes objects and edits', objectCount(beforeCompress) > 0 && objectCount(afterCompress) === 0);
check('compress renders new source', (await page.evaluate(() => window.__errata.activePdf()))?.pages === 3);
check('compress shows sizes', /\d.*→.*\d/.test(await page.$eval('[data-compress-result]', (e) => e.textContent).catch(() => '')));
check('compress panel stays open', await modeOpen('compress'));
check('compress no download', !readdirSync(downloads).some((n) => /-compressed\.pdf$/.test(n)));
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(600);
const undone = await doc();
check('compress undo restores doc', undone.source === beforeCompress.source && JSON.stringify(undone.pages) === JSON.stringify(beforeCompress.pages));
check('compress undo restores source', (await page.evaluate(() => window.__errata.activePdf()))?.pages === 2);
check('compress undo hides sizes', !(await page.$('[data-compress-result]')));
const undoneExport = await PDFDocument.load(new Uint8Array(await page.evaluate(() => window.__errata.export())));
check('compress undo export', undoneExport.getPageCount() === 3 && Math.round(undoneExport.getPage(2).getWidth()) === 859);
await page.keyboard.down('Meta');
await page.keyboard.down('Shift');
await page.keyboard.press('z');
await page.keyboard.up('Shift');
await page.keyboard.up('Meta');
await sleep(600);
check('compress redo', (await doc()).source === afterCompress.source && (await page.evaluate(() => window.__errata.activePdf()))?.pages === 3);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(600);
await clickIn('Cancel');
await sleep(300);
check('compress mode closed', !(await modeOpen('compress')));

const beforeAbort = await doc();
await openCell('Impose');
const abortBusy = await page.evaluate(() => new Promise((resolve) => {
	const btn = (l) => [...document.querySelectorAll('.err-mode.is-open button')].find((b) => b.textContent.trim() === l);
	const apply = btn('Apply');
	let busy = false;
	const done = (v) => {
		seen.disconnect();
		resolve(v);
	};
	const seen = new MutationObserver(() => {
		if (apply.disabled) busy = true;
		else if (busy) done(true);
	});
	seen.observe(apply, { attributes: true });
	apply.click();
	btn('Cancel').click();
	setTimeout(() => done(busy), 30000);
}));
check('abort run was busy', abortBusy);
await sleep(600);
const afterAbort = await doc();
check('abort keeps doc', !(await modeOpen('impose')) && afterAbort.source === beforeAbort.source && JSON.stringify(afterAbort.pages) === JSON.stringify(beforeAbort.pages));
await page.keyboard.down('Meta');
await page.keyboard.down('Shift');
await page.keyboard.press('z');
await page.keyboard.up('Shift');
await page.keyboard.up('Meta');
await sleep(600);
check('abort adds no undo step', (await doc()).source === afterCompress.source);
await undoStep();

const beforeImpose = await doc();
const sheetsOf = async () => {
	const out = await exportBytes();
	const pdf = await PDFDocument.load(out);
	const ops = (await (await (await loadPdf(out)).getPage(1)).getOperatorList()).fnArray;
	// rotated pages nest forms
	let dangling = 0;
	const walk = (res) => res?.lookup(PDFName.of('XObject'))?.entries().forEach(([, ref]) => {
		const x = pdf.context.lookup(ref);
		if (!x?.dict) dangling++;
		else walk(x.dict.lookup(PDFName.of('Resources')));
	});
	pdf.getPages().forEach((p) => walk(p.node.Resources()));
	return { dangling, count: pdf.getPageCount(), w: Math.round(pdf.getPage(0).getWidth()), h: Math.round(pdf.getPage(0).getHeight()), paths: ops.filter((f) => f === OPS.constructPath).length };
};
const imposeApply = async () => {
	await clickIn('Apply');
	await page.waitForFunction(() => window.__errata.doc().pages.length === 2, { timeout: 30000 }).catch(() => {});
	await sleep(600);
};
await openCell('Impose');
check('impose mode bar', await modeOpen('impose'));
check('impose form grid', (await fieldColumns('.err-mode.is-open[data-mode="impose"]')) >= 2);
check('impose has a reading direction', await page.$eval('.err-mode.is-open[data-mode="impose"]', (e) => [...e.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Right to left')));
await imposeApply();
const afterImpose = await doc();
// padded to 4 pages
const landscape = await sheetsOf();
check('impose replaces source', afterImpose.source !== beforeImpose.source && afterImpose.pages.length === 2 && objectCount(afterImpose) === 0, `${afterImpose.pages.length}`);
check('impose renders sheets', (await page.evaluate(() => window.__errata.activePdf()))?.pages === 2);
check('impose sheets', landscape.count === 2 && landscape.w === 842 && landscape.h === 595, JSON.stringify(landscape));
check('impose crop marks', landscape.paths > 0, JSON.stringify(landscape));
check('impose forms resolve', landscape.dangling === 0, JSON.stringify(landscape));
check('impose mode closed', !(await modeOpen('impose')));
check('impose no download', !readdirSync(downloads).some((n) => /-imposed/.test(n)));
await undoStep();
const undoneImpose = await doc();
check('impose undo restores', undoneImpose.source === beforeImpose.source && JSON.stringify(undoneImpose.pages) === JSON.stringify(beforeImpose.pages) && (await page.evaluate(() => window.__errata.activePdf()))?.pages === 2);
await openCell('Impose');
await clickIn('Portrait');
await page.evaluate(() => document.querySelector('.err-mode.is-open input[aria-label="Crop marks"]').click());
await sleep(200);
await imposeApply();
const portrait = await sheetsOf();
check('impose portrait', portrait.count === 2 && portrait.w === 595 && portrait.h === 842, JSON.stringify(portrait));
check('impose crop marks off', portrait.paths < landscape.paths, JSON.stringify([landscape.paths, portrait.paths]));
await undoStep();
check('impose undo again', (await doc()).source === beforeImpose.source && (await doc()).pages.length === 3);

const orgCells = () => page.$$('.err-organise-cell');
const pressed = () => page.$$eval('.err-organise-cell', (cs) => cs.map((c) => c.getAttribute('aria-pressed') === 'true'));
const orgClick = (label) => page.evaluate((l) => document.querySelector(`.err-organise button[aria-label="${l}"]`)?.click(), label);
const withKey = async (key, fn) => {
	await page.keyboard.down(key);
	await fn();
	await page.keyboard.up(key);
};
const undo = () => withKey('Meta', () => page.keyboard.press('z'));
const pageIds = async () => (await doc()).pages.map((p) => p.id);

await openCell('Organise');
check('organise grid', (await orgCells()).length === 3 && (await page.$eval('.err-organise .err-mode', (e) => e.dataset.mode === 'organise')));
check('organise markup bar hidden', !(await page.$('.sub-ed-bar')));
await sleep(600);
check('organise thumbs', await page.$$eval('.err-organise .err-page-thumb', (imgs) => imgs.every((i) => i.naturalWidth >= 270)));
let cs = await orgCells();
await cs[0].click();
await withKey('Shift', () => cs[2].click());
check('organise shift range', JSON.stringify(await pressed()) === '[true,true,true]');
await withKey('Meta', () => cs[1].click());
check('organise cmd toggle', JSON.stringify(await pressed()) === '[true,false,true]');

const org0 = await doc();
await orgClick('Rotate right');
await sleep(200);
let orgDoc = await doc();
check('organise rotate selection', orgDoc.pages.every((p, i) => p.rotation === (i === 1 ? org0.pages[i].rotation : (org0.pages[i].rotation + 90) % 360)), JSON.stringify(orgDoc.pages.map((p) => p.rotation)));
check('organise rotate carries objects', orgDoc.pages[0].objects.length === org0.pages[0].objects.length && orgDoc.pages[0].objects[0].angle === org0.pages[0].objects[0].angle + 90);
await undo();
await sleep(200);
check('organise rotate one undo', JSON.stringify((await doc()).pages.map((p) => p.rotation)) === JSON.stringify(org0.pages.map((p) => p.rotation)));

cs = await orgCells();
await cs[0].click();
await orgClick('Duplicate');
await sleep(200);
orgDoc = await doc();
check('organise duplicate', orgDoc.pages.length === 4 && orgDoc.pages[1].sourceIndex === org0.pages[0].sourceIndex && orgDoc.pages[1].id !== org0.pages[0].id && orgDoc.pages[1].objects.length === org0.pages[0].objects.length && orgDoc.pages[1].objects[0].id !== org0.pages[0].objects[0].id);
check('organise duplicate selects copy', JSON.stringify(await pressed()) === '[false,true,false,false]');
const dupPdf = await PDFDocument.load(new Uint8Array(await page.evaluate(() => window.__errata.export())));
const pageText = (pdf, i) => {
	const c = pdf.getPage(i).node.Contents();
	const list = c.constructor.name === 'PDFArray' ? c.asArray().map((r) => pdf.context.lookup(r)) : [c];
	return list.map((st) => new TextDecoder('latin1').decode(decodePDFRawStream(st).decode())).join('\n');
};
check('organise duplicate exports edits once', dupPdf.getPageCount() === 4 && [0, 1].every((i) => (pageText(dupPdf, i).match(/<74776f> Tj/gi) ?? []).length === 1));
await page.keyboard.press('Backspace');
await sleep(200);
orgDoc = await doc();
check('organise delete key', JSON.stringify(orgDoc.pages.map((p) => p.id)) === JSON.stringify(org0.pages.map((p) => p.id)) && orgDoc.pages.every((p, i) => p.objects.length === org0.pages[i].objects.length));

cs = await orgCells();
await cs[1].click();
await orgClick('Insert blank page');
await sleep(200);
orgDoc = await doc();
check('organise insert blank', orgDoc.pages.length === 4 && orgDoc.pages[2].sourceIndex === null && orgDoc.pages[2].objects.length === 0);
await undo();
await sleep(200);

await page.evaluate(() => {
	const cells = [...document.querySelectorAll('.err-organise-cell')];
	const dt = new DataTransfer();
	const fire = (el, type, x) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x }));
	const r = cells[2].getBoundingClientRect();
	fire(cells[0], 'dragstart', 0);
	fire(cells[2], 'dragover', r.right - 4);
	fire(cells[2], 'drop', r.right - 4);
	fire(cells[0], 'dragend', 0);
});
await sleep(200);
orgDoc = await doc();
const movedId = org0.pages[0].id;
check('organise drag reorder', JSON.stringify(orgDoc.pages.map((p) => p.id)) === JSON.stringify([org0.pages[1].id, org0.pages[2].id, movedId]), JSON.stringify(orgDoc.pages.map((p) => p.id)));
check('organise objects stay attached', JSON.stringify(orgDoc.pages[2].objects) === JSON.stringify(org0.pages[0].objects));
await undo();
await sleep(200);
check('organise drag one undo', JSON.stringify(await pageIds()) === JSON.stringify(org0.pages.map((p) => p.id)));

cs = await orgCells();
await cs[2].click();
await page.evaluate(() => document.querySelector('.err-organise .err-mode-apply')?.click());
await sleep(300);
check('organise done', (await orgCells()).length === 0 && !!(await page.$('.sub-ed-bar')));
check('organise done opens selected page', (await page.evaluate(() => window.__errata.pageIndex())) === 2);

await openCell('Organise');
await page.evaluate(() => document.querySelector('.err-organise-cell').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
await sleep(300);
check('organise double-click opens page', (await orgCells()).length === 0 && (await page.evaluate(() => window.__errata.pageIndex())) === 0);
await openCell('Organise');
await page.keyboard.press('Escape');
await sleep(300);
check('organise escape closes', (await orgCells()).length === 0);
const preflightOpen = () => page.$('.err-mode.is-open[data-mode="preflight"]').then((e) => !!e);
const findings = () => page.$$eval('.err-preflight.is-open .err-preflight-group', (gs) => gs.map((g) => ({
	head: g.querySelector('.err-preflight-page')?.textContent.trim(),
	issues: [...g.querySelectorAll('.err-preflight-message')].map((m) => m.textContent.trim()),
})));
await page.keyboard.press('[');
await page.keyboard.press('[');
await sleep(300);
await openCell('Preflight');
check('preflight mode bar', await preflightOpen());
check('preflight markup bar hidden', !(await page.$('.sub-ed-bar')));
await page.waitForSelector('.err-preflight.is-open .err-preflight-group', { timeout: 15000 }).catch(() => {});
const groups = await findings();
check('preflight pages', JSON.stringify(groups.filter((g) => g.head !== 'Document').map((g) => g.head)) === JSON.stringify(['Page 1', 'Page 2', 'Page 3']), JSON.stringify(groups.map((g) => g.head)));
check('preflight checks run', groups.every((g) => g.head === 'Document' || g.issues.includes('No BleedBox defined')));
// transparency comes from watermark
check('preflight sees edits', groups.find((g) => g.head === `Page ${wmPage + 1}`)?.issues.some((m) => /transparency effects/.test(m)), JSON.stringify(groups));
check('preflight counts', /\d+ (warnings?|errors?|info)/.test(await page.$eval('.err-mode.is-open[data-mode="preflight"]', (e) => e.textContent)));
await page.evaluate(() => [...document.querySelectorAll('.err-preflight-group')].find((g) => g.querySelector('.err-preflight-page')?.textContent.trim() === 'Page 3')?.querySelector('.err-preflight-issue')?.click());
await sleep(500);
check('preflight finding goes to page', (await page.evaluate(() => window.__errata.pageIndex())) === 2);
const canvasTop = await page.$eval('.sub-canvas-wrap canvas', (c) => c.getBoundingClientRect().top);
const p3 = await page.evaluate(() => window.__errata.pageRect(2));
const insetTop = await page.$eval('.sub-shell-canvas-area', (a) => Number(a.dataset.inset?.split(',')[0] ?? 0));
check('preflight finding scrolls', p3 && Math.abs(p3.y - canvasTop - insetTop) < 40, `${p3?.y} vs ${canvasTop} + ${insetTop}`);
await clickIn('Close');
await sleep(400);
check('preflight close', !(await preflightOpen()) && !(await page.$('.err-preflight.is-open')));
await openCell('Preflight');
await page.keyboard.press('Escape');
await sleep(300);
check('preflight escape', !(await preflightOpen()));
const pngBytes = await page.evaluate(() => {
	const c = document.createElement('canvas');
	c.width = c.height = 20;
	c.getContext('2d').fillRect(0, 0, 20, 20);
	return [...atob(c.toDataURL('image/png').split(',')[1])].map((ch) => ch.charCodeAt(0));
});
const idoc = await PDFDocument.create();
idoc.addPage([400, 500]).drawImage(await idoc.embedPng(Uint8Array.from(pngBytes)), { x: 100, y: 200, width: 80, height: 60 });
const ibytes = [...(await idoc.save())];
await page.evaluate((b) => window.__errata.open(new Uint8Array(b).buffer, 'lowres.pdf', 'application/pdf'), ibytes);
await page.waitForFunction(() => window.__errata.doc()?.name === 'lowres', { timeout: 10000 });
await sleep(600);
await openCell('Preflight');
await page.waitForFunction(() => [...document.querySelectorAll('.err-preflight.is-open .err-preflight-message')].some((m) => m.textContent.includes('Very low resolution')), { timeout: 15000 }).catch(() => {});
await page.evaluate(() => [...document.querySelectorAll('.err-preflight.is-open .err-preflight-issue')].find((b) => b.textContent.includes('Very low resolution'))?.click());
await sleep(300);
const highlighted = () => page.evaluate(() => {
	const c = window.__errataCanvas;
	const v = c.viewportTransform;
	const w = document.querySelector('.sub-canvas-wrap').getBoundingClientRect();
	return c.getObjects().filter((o) => o.stroke === '#e6007e').map((o) => ({ x: w.left + o.left * v[0] + v[4], y: w.top + o.top * v[3] + v[5], w: o.width * v[0], h: o.height * v[3] }));
});
const irect = await page.evaluate(() => window.__errata.pageRect(0));
const iz = irect.w / 400;
let hl = await highlighted();
const near = (a, b) => Math.abs(a - b) < 1.5;
check('preflight image highlight', hl.length === 1 && near(hl[0].x, irect.x + 100 * iz) && near(hl[0].y, irect.y + 240 * iz) && near(hl[0].w, 80 * iz) && near(hl[0].h, 60 * iz), JSON.stringify({ hl, irect, iz }));
await page.keyboard.press('Escape');
await sleep(200);
hl = await highlighted();
check('preflight highlight escape clears first', hl.length === 0 && (await preflightOpen()));
await page.evaluate(() => [...document.querySelectorAll('.err-preflight.is-open .err-preflight-issue')].find((b) => b.textContent.includes('Very low resolution'))?.click());
await sleep(200);
await page.mouse.click(irect.x + 10, irect.y + 10);
await sleep(200);
check('preflight highlight click clears', (await highlighted()).length === 0);
await clickIn('Close');
await sleep(300);
const cdoc = await PDFDocument.create();
const cpage = cdoc.addPage([400, 500]);
const cctx = cdoc.context;
const srcNote = cctx.register(cctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 400, 70, 420], Contents: PDFHexString.fromText('Imported note\nline two'), T: PDFHexString.fromText('Ann') }));
const srcPopup = cctx.register(cctx.obj({ Type: 'Annot', Subtype: 'Popup', Parent: srcNote, Rect: [70, 300, 250, 420] }));
cctx.lookup(srcNote).set(PDFName.of('Popup'), srcPopup);
const srcSquare = cctx.register(cctx.obj({ Type: 'Annot', Subtype: 'Square', Rect: [100, 100, 150, 150] }));
for (const r of [srcNote, srcPopup, srcSquare]) cpage.node.addAnnot(r);
const cbytes = [...(await cdoc.save())];
await page.evaluate((b) => window.__errata.open(new Uint8Array(b).buffer, 'comments.pdf', 'application/pdf'), cbytes);
await page.waitForFunction(() => window.__errata.doc()?.name === 'comments', { timeout: 10000 });
await sleep(600);
const comments = async () => (await doc()).pages[0].objects.filter((o) => o.kind === 'comment');
cs = await comments();
check('comment imported', cs.length === 1 && cs[0].text === 'Imported note\nline two' && cs[0].author === 'Ann' && Math.round(cs[0].cx) === 60 && Math.round(cs[0].cy) === 90, JSON.stringify(cs));
await openCell('Comment');
const bar = '.err-mode.is-open[data-mode="comment"]';
check('comment mode bar', !!(await page.$(bar)));
const [authorInput] = await page.$$(`${bar} input`);
await authorInput.evaluate((el) => el.select());
await authorInput.type('Ruby');
const crect = await page.evaluate(() => window.__errata.pageRect(0));
const cz = crect.w / 400;
const at = (x, y) => [crect.x + x * cz, crect.y + y * cz];
const popover = () => page.evaluate(() => {
	const el = document.querySelector('.err-note');
	return el && getComputedStyle(el).visibility === 'visible'
		? { text: el.querySelector('.err-note-text').value, author: el.querySelector('.err-note-author').textContent.trim(), date: el.querySelector('time').textContent.trim(), focused: document.activeElement === el.querySelector('.err-note-text') }
		: null;
});
const metaZ = async () => {
	await page.keyboard.down('Meta');
	await page.keyboard.press('z');
	await page.keyboard.up('Meta');
	await sleep(300);
};
await page.mouse.click(...at(200, 250));
await sleep(400);
cs = await comments();
check('comment placed', cs.length === 2 && cs[1].text === '' && cs[1].author === 'Ruby' && Math.round(cs[1].cx) === 200 && Math.round(cs[1].cy) === 250, JSON.stringify(cs[1]));
let pop = await popover();
check('comment popover on place, focused', pop?.focused && pop.text === '', JSON.stringify(pop));
const notePlace = await page.evaluate(() => {
	const note = document.querySelector('.err-note');
	const a = document.querySelector('.err-note-anchor').getBoundingClientRect();
	const n = note.getBoundingClientRect();
	return { open: note.matches(':popover-open'), gap: Math.round(n.left - a.right), top: Math.round(n.top - a.top), w: Math.round(a.width) };
});
check('comment popover sits right of its comment, top-aligned', notePlace.open && notePlace.gap === 6 && notePlace.top === 0 && notePlace.w > 0, JSON.stringify(notePlace));
await page.keyboard.type('Fresh note');
await page.keyboard.press('Enter');
await page.keyboard.type('second line');
await sleep(100);
cs = await comments();
check('comment enter is a newline', cs[1].text === '' && (await popover())?.text === 'Fresh note\nsecond line');
await page.keyboard.press('Escape');
await sleep(300);
cs = await comments();
check('comment escape commits and closes', cs[1].text === 'Fresh note\nsecond line' && !!cs[1].date && !(await popover()), JSON.stringify(cs[1]));
check('comment escape keeps mode', !!(await page.$(bar)));
await page.mouse.click(...at(200, 250));
await sleep(400);
pop = await popover();
check('comment popover opens on click', pop?.text === 'Fresh note\nsecond line' && pop.author === 'Ruby' && pop.date.length > 0 && cs.length === 2, JSON.stringify(pop));
await page.mouse.click(...at(60, 90));
await sleep(400);
pop = await popover();
check('comment popover switches note', pop?.text === 'Imported note\nline two' && pop.author === 'Ann' && (await comments()).length === 2, JSON.stringify(pop));
await page.keyboard.press('Escape');
await sleep(200);
const listSelect = `${bar} select[aria-label="List"]`;
const options = await page.$$eval(`${listSelect} option:not([hidden])`, (els) => els.map((e) => e.textContent.trim()));
check('comment list', options.length === 2 && options[0] === '1 · Imported note line two' && options[1] === '1 · Fresh note second line', JSON.stringify(options));
// select ignores same option
const pickListed = (text) =>
	page.$eval(
		listSelect,
		(s, t) => {
			s.value = [...s.options].find((o) => o.textContent.includes(t)).value;
			s.dispatchEvent(new Event('change', { bubbles: true }));
		},
		text,
	);
await pickListed('Fresh');
await sleep(400);
check('comment list shows the pick', (await popover())?.text === 'Fresh note\nsecond line' && (await page.$eval(listSelect, (s) => s.selectedOptions[0]?.textContent.trim())) === '1 · Fresh note second line');
await page.keyboard.press('Escape');
await sleep(200);
await pickListed('Imported');
await sleep(400);
check('comment list opens popover', (await popover())?.text === 'Imported note\nline two' && (await page.evaluate(() => !!window.__errataCanvas.getActiveObject())));
await page.focus('.err-note-text');
await page.evaluate(() => document.querySelector('.err-note-text').select());
await page.keyboard.type('Edited');
await page.mouse.click(...at(300, 120));
await sleep(400);
cs = await comments();
check('comment edit kept on switch', cs.length === 3 && cs[0].text === 'Edited' && cs[2].text === '', JSON.stringify(cs.map((c) => c.text)));
// textarea has own undo
await page.keyboard.press('Escape');
await sleep(200);
await metaZ();
check('comment place one undo', (await comments()).length === 2);
await metaZ();
check('comment edit one undo', (await comments())[0].text === 'Imported note\nline two');
await page.keyboard.down('Meta');
await page.keyboard.down('Shift');
await page.keyboard.press('z');
await page.keyboard.press('z');
await page.keyboard.up('Shift');
await page.keyboard.up('Meta');
await sleep(300);
check('comment redo', (await comments()).length === 3);
await page.mouse.move(...at(200, 250));
await page.mouse.down();
await page.mouse.move(...at(220, 260), { steps: 6 });
await page.mouse.move(...at(240, 270), { steps: 6 });
await page.mouse.up();
await sleep(300);
cs = await comments();
check('comment moved', Math.round(cs[1].cx) === 240 && Math.round(cs[1].cy) === 270, `${cs[1].cx},${cs[1].cy}`);
check('comment drag opens no popover', !(await popover()));
await page.keyboard.press('Backspace');
await sleep(300);
check('comment deleted', (await comments()).length === 2);
await metaZ();
check('comment undo', (await comments()).length === 3);
await page.mouse.click(...at(300, 120));
await sleep(400);
await page.click('.err-note-delete');
await sleep(300);
check('comment popover delete', (await comments()).length === 2 && !(await popover()));
await metaZ();
check('comment popover delete undo', (await comments()).length === 3);
await clickIn('Done');
await sleep(300);
check('comment mode closed', !(await page.$(bar)));
await page.mouse.click(...at(60, 90));
await sleep(400);
check('comment popover in select tool', (await popover())?.text === 'Edited');
await page.mouse.click(...at(380, 480));
await sleep(300);
check('comment popover click outside closes', !(await popover()));

const commented = await PDFDocument.load(new Uint8Array(await page.evaluate(() => window.__errata.export())));
const annots = commented.getPage(0).node.Annots().asArray().map((r) => commented.context.lookup(r));
const sub = (d) => d.get(PDFName.of('Subtype')).toString();
const notes = annots.filter((d) => sub(d) === '/Text');
const noteText = (d) => d.lookup(PDFName.of('Contents')).decodeText();
check('export comments once', notes.length === 3 && JSON.stringify(notes.map(noteText)) === JSON.stringify(['Edited', 'Fresh note\nsecond line', '']), JSON.stringify(notes.map(noteText)));
check('export drops source popup', !annots.some((d) => sub(d) === '/Popup'));
check('export keeps other annots', annots.some((d) => sub(d) === '/Square'));
const fresh = notes[1];
check('export comment dict', fresh.lookup(PDFName.of('T')).decodeText() === 'Ruby' && !!fresh.get(PDFName.of('M')) && fresh.get(PDFName.of('P')) === commented.getPage(0).ref);
check('export comment rect', notes[0].get(PDFName.of('Rect')).toString().replace(/\s+/g, ' ') === '[ 50 400 70 420 ]', notes[0].get(PDFName.of('Rect')).toString());

// second page nests first
const rd = await PDFDocument.create();
const helv = await rd.embedFont(StandardFonts.Helvetica);
const rp = rd.addPage([400, 500]);
rp.drawText('TOPSECRET', { x: 40, y: 440, size: 18, font: helv });
rp.drawText('KEEPME', { x: 40, y: 200, size: 18, font: helv });
rp.drawText('LINESECRET', { x: 40, y: 120, size: 18, font: helv });
// crosses the mark edge
rp.drawLine({ start: { x: 200, y: 430 }, end: { x: 390, y: 430 }, thickness: 4, color: rgb(1, 0, 0) });
const greenPng = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#00c853'; g.fillRect(0, 0, 16, 16); return c.toDataURL().split(',')[1]; });
rp.drawImage(await rd.embedPng(Buffer.from(greenPng, 'base64')), { x: 200, y: 400, width: 60, height: 60 });
const rform = rd.getForm();
const secretField = rform.createTextField('secret');
secretField.setText('FIELDSECRET');
secretField.addToPage(rp, { x: 40, y: 400, width: 120, height: 20 });
const keepField = rform.createTextField('keep');
keepField.setText('FIELDKEEP');
keepField.addToPage(rp, { x: 40, y: 40, width: 120, height: 20 });
rp.node.addAnnot(rd.context.register(rd.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 470, 150, 490], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://secret.example/') } })));
rd.addPage([400, 500]).drawPage(await rd.embedPage(rp));
const rdBytes = await rd.save();
await page.evaluate((b) => window.__errata.open(new Uint8Array(b).buffer, 'redact.pdf', 'application/pdf'), [...rdBytes]);
await page.waitForFunction(() => window.__errata.doc()?.name === 'redact' && window.__errata.doc().pages.length === 2, { timeout: 10000 });
await sleep(800);
const marks = async () => (await doc()).pages.map((p) => p.objects.filter((o) => o.kind === 'redact'));
const pageRectR = (i) => page.evaluate((n) => window.__errata.pageRect(n), i);
const lineBox = (i, text) => page.evaluate(async (n, t) => (await window.__errata.content(n)).lines.find((l) => l.text === t)?.box, i, text);
const clickBox = async (r, b, w) => {
	const z = r.w / w;
	await page.mouse.click(r.x + (b.x + b.width / 2) * z, r.y + (b.y + b.height / 2) * z);
	await sleep(600);
};

await openCell('Redact');
check('redact mode bar', await modeOpen('redact'));
check('redact apply waits for a mark', await page.$eval('.err-mode.is-open .err-mode-apply', (b) => b.disabled));
let rr = await pageRectR(0);
let rz = rr.w / 400;
await page.mouse.move(rr.x + 20 * rz, rr.y + 5 * rz);
await page.mouse.down();
await page.mouse.move(rr.x + 300 * rz, rr.y + 110 * rz, { steps: 6 });
await page.mouse.up();
await sleep(300);
let rm = await marks();
check('redact area marked', rm[0].length === 1 && Math.abs(rm[0][0].w - 280) < 2 && Math.abs(rm[0][0].h - 105) < 2, JSON.stringify(rm[0]));
check('redact mark hatched', await page.evaluate(() => window.__errataCanvas.getObjects().some((o) => o.fill?.source && o.stroke === '#d1242f')));
await clickBox(rr, await lineBox(0, 'LINESECRET'), 400);
rm = await marks();
const lsb = await lineBox(0, 'LINESECRET');
check('redact text line marked', rm[0].length === 2 && Math.abs(rm[0][1].cx - (lsb.x + lsb.width / 2)) < 1 && rm[0][1].w > lsb.width, JSON.stringify(rm[0][1]));
check('redact count', await page.$eval('.err-mode.is-open', (e) => e.textContent.replace(/\s+/g, ' ').includes('2 marked')));
await clickBox(rr, lsb, 400);
await page.keyboard.press('Backspace');
await sleep(300);
check('redact mark deleted', (await marks())[0].length === 1);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
check('redact mark undo', (await marks())[0].length === 2);
await clickIn('Cancel');
await sleep(300);
const afterCancel = await marks();
check('redact cancel drops session marks', afterCancel[0].length === 0 && !(await modeOpen('redact')), JSON.stringify([afterCancel, await page.evaluate(() => [...document.querySelectorAll('.err-mode.is-open')].map((e) => e.dataset.mode + ':' + e.textContent.replace(/\\s+/g, ' ').trim()))]));
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(300);
check('redact cancel one undo step', (await marks())[0].length === 2);
await openCell('Redact');
await page.mouse.move(rr.x + 250 * rz, rr.y + 300 * rz);
await page.mouse.down();
await page.mouse.move(rr.x + 380 * rz, rr.y + 350 * rz, { steps: 6 });
await page.mouse.up();
await sleep(300);
check('redact escape setup', (await marks())[0].length === 3);
await page.keyboard.press('Escape');
await sleep(300);
check('redact escape drops session marks', (await marks())[0].length === 2 && !(await modeOpen('redact')));

await page.keyboard.press(']');
await sleep(600);
await page.evaluate(() => window.__errata.resize({ width: 595.28, height: 841.89, mode: 'fit', anchor: 'middle-center' }));
await sleep(900);
await openCell('Redact');
rr = await pageRectR(1);
await clickBox(rr, await lineBox(1, 'TOPSECRET'), 595.28);
rm = await marks();
check('redact form line marked', rm[1].length === 1, JSON.stringify(rm[1]));
const beforeBurn = await doc();
await clickIn('Apply');
await page.waitForFunction(() => !window.__errata.doc().pages.some((p) => p.objects.some((o) => o.kind === 'redact')), { timeout: 30000 }).catch(() => {});
await sleep(800);
const burnt = await doc();
check('redact applied in place', burnt.source !== beforeBurn.source && (await marks()).flat().length === 0 && !(await modeOpen('redact')));
check('redact no download', !readdirSync(downloads).some((n) => /-redacted/.test(n)));
const linesOf = async (i) => (await page.evaluate(async (n) => (await window.__errata.content(n)).lines.map((l) => l.text), i)).join(' ');
check('redact source text gone', !(await linesOf(0)).includes('TOPSECRET') && (await linesOf(0)).includes('KEEPME'), await linesOf(0));
{
	const outBytes = await exportBytes();
	const pdf = await loadPdf(outBytes);
	const textOf = async (n) => (await (await pdf.getPage(n)).getTextContent()).items.map((i) => i.str).join(' ');
	const t1 = await textOf(1);
	const t2 = await textOf(2);
	check('redact text gone', !t1.includes('TOPSECRET') && !t1.includes('LINESECRET') && !t2.includes('TOPSECRET'), `${t1} | ${t2}`);
	check('redact text outside kept', t1.includes('KEEPME') && t2.includes('KEEPME') && t2.includes('LINESECRET'), `${t1} | ${t2}`);
	const annots = await (await pdf.getPage(1)).getAnnotations();
	check('redact link and field gone', !annots.some((a) => a.url || a.fieldValue === 'FIELDSECRET') && annots.some((a) => a.fieldValue === 'FIELDKEEP'), JSON.stringify(annots.map((a) => [a.subtype, a.fieldValue ?? a.url])));
	// pdf-lib writes hex strings
	const rawOf = (b) => new TextDecoder('latin1').decode(new mupdf.PDFDocument(b.slice()).saveToBuffer('decompress').asUint8Array()).toLowerCase();
	const hex = (s) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
	const hex16 = (s) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
	const leaks = (raw, s) => [s.toLowerCase(), hex(s), hex16(s)].some((v) => raw.includes(v));
	const rawIn = rawOf(rdBytes);
	const rawOut = rawOf(outBytes);
	// unmarked on page 2
	const gone = ['TOPSECRET', 'FIELDSECRET', 'secret.example'];
	check('redact raw control', gone.every((s) => leaks(rawIn, s)));
	check('redact raw gone', !gone.some((s) => leaks(rawOut, s)) && leaks(rawOut, 'KEEPME') && leaks(rawOut, 'FIELDKEEP'), gone.filter((s) => leaks(rawOut, s)).join());
	// page 1 images only
	const greenPixels = (b) => {
		const m = new mupdf.PDFDocument(b.slice());
		let n = 0;
		const walk = (res) => res.get('XObject').forEach((x) => {
			if (String(x.get('Subtype')) === '/Form') return walk(x.get('Resources'));
			const px = m.loadImage(x).toPixmap().getPixels();
			for (let j = 0; j + 2 < px.length; j += 3) if (px[j] < 40 && px[j + 1] > 160 && px[j + 2] < 120) n++;
		});
		walk(m.loadPage(0).getObject().get('Resources'));
		return n;
	};
	check('redact image control', greenPixels(rdBytes) > 0);
	check('redact image gone', greenPixels(outBytes) === 0, String(greenPixels(outBytes)));
	const pix = new mupdf.PDFDocument(outBytes.slice()).loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
	const at = (x, y) => [...pix.getPixels().slice((y * pix.getWidth() + x) * 3, (y * pix.getWidth() + x) * 3 + 3)];
	check('redact black box', at(150, 50).every((v) => v < 10) && at(150, 300).every((v) => v > 245), JSON.stringify([at(150, 50), at(150, 300)]));
	const redPixels = (b) => {
		const px = new mupdf.PDFDocument(b.slice()).loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false).getPixels();
		let n = 0;
		for (let j = 0; j + 2 < px.length; j += 3) if (px[j] > 200 && px[j + 1] < 80 && px[j + 2] < 80) n++;
		return n;
	};
	check('redact crossing path control', redPixels(rdBytes) > 0);
	check('redact crossing path gone', redPixels(outBytes) === 0, String(redPixels(outBytes)));
}
await undoStep();
check('redact undo restores marks', (await marks()).flat().length === 3 && (await doc()).source === beforeBurn.source);
check('redact undo restores content', (await linesOf(0)).includes('TOPSECRET'), await linesOf(0));
const pendingText = (await (await (await loadPdf(await exportBytes())).getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
check('redact export burns pending marks', !pendingText.includes('TOPSECRET') && pendingText.includes('KEEPME'), pendingText);

const formSrc = await PDFDocument.create();
formSrc.addPage([400, 500]);
formSrc.addPage([400, 500]).setRotation(degrees(90));
formSrc.getForm().createTextField('given').addToPage(formSrc.getPage(0), { x: 40, y: 400, width: 150, height: 20 });
formSrc.getForm().createCheckBox('agree').addToPage(formSrc.getPage(1), { x: 40, y: 40, width: 14, height: 14 });
await page.evaluate((b) => window.__errata.open(new Uint8Array(b).buffer, 'form.pdf', 'application/pdf'), [...(await formSrc.save())]);
await page.waitForFunction(() => window.__errata.doc()?.name === 'form', { timeout: 10000 });
await sleep(600);
const exported = async () => PDFDocument.load(new Uint8Array(await page.evaluate(() => window.__errata.export())));
const onPage = (pdf, field, index) => {
	const annots = pdf.getPage(index).node.Annots()?.asArray() ?? [];
	return field.acroField.getWidgets().every((w) => annots.some((a) => pdf.context.lookup(a) === w.dict));
};

const plain = await exported();
const plainFields = plain.getForm().getFields();
check('form source fields kept', plainFields.map((f) => f.getName()).join() === 'given,agree', plainFields.map((f) => f.getName()).join());
check('form source widgets on their pages', onPage(plain, plain.getForm().getTextField('given'), 0) && onPage(plain, plain.getForm().getCheckBox('agree'), 1));

await openCell('Prepare form');
check('form mode bar', await modeOpen('form'));
check('form tool active', await page.evaluate(() => window.__errataCanvas.defaultCursor === 'crosshair'));
await page.waitForFunction(() => window.__errataCanvas.getObjects().filter((o) => o.type === 'group' && !o.evented).length === 2, { timeout: 20000 }).catch(() => {});
const standIn = await page.evaluate(() => {
	const c = window.__errataCanvas;
	const g = c.getObjects().find((o) => o.type === 'group' && !o.evented);
	if (!g) return null;
	const p = g.getCenterPoint();
	const v = c.viewportTransform;
	const r = c.upperCanvasEl.getBoundingClientRect();
	return { x: r.left + p.x * v[0] + v[4], y: r.top + p.y * v[3] + v[5], w: g.width * v[0] };
});
const fr0 = await page.evaluate(() => window.__errata.pageRect(0));
const fz = fr0.w / 400;
check('form source widgets shown', !!standIn && Math.abs(standIn.x - (fr0.x + 115 * fz)) < 2 && Math.abs(standIn.y - (fr0.y + 90 * fz)) < 2, JSON.stringify(standIn));

const setInput = (label, value) =>
	page.evaluate(
		(l, v) => {
			const i = [...document.querySelectorAll('.err-mode.is-open .err-mode-field')].find((e) => e.querySelector('.canon-row-title')?.textContent.trim().startsWith(l)).querySelector('input');
			i.value = v;
			i.dispatchEvent(new Event('change', { bubbles: true }));
		},
		label,
		value,
	);
const toggle = (label) => page.evaluate((l) => [...document.querySelectorAll('.err-mode.is-open .err-mode-field')].find((e) => e.querySelector('.canon-row-title')?.textContent.trim().startsWith(l)).querySelector('input').click(), label);
const nameValue = () => page.evaluate(() => [...document.querySelectorAll('.err-mode.is-open .err-mode-field')].find((e) => e.querySelector('.canon-row-title')?.textContent.trim().startsWith('Name')).querySelector('input').value);
const fieldObjs = async (i = 0) => (await doc()).pages[i].objects.filter((o) => o.kind === 'field');
const drag = async (r, a, b) => {
	const z = r.w / 400;
	await page.mouse.move(r.x + a[0] * z, r.y + a[1] * z);
	await page.mouse.down();
	await page.mouse.move(r.x + ((a[0] + b[0]) / 2) * z, r.y + ((a[1] + b[1]) / 2) * z, { steps: 4 });
	await page.mouse.move(r.x + b[0] * z, r.y + b[1] * z, { steps: 4 });
	await page.mouse.up();
	await sleep(250);
};

await setInput('Name', 'email');
await setInput('Default', 'a@b.c');
await toggle('Required');
await drag(fr0, [60, 150], [260, 175]);
let fobjs = await fieldObjs();
const email = fobjs[0];
check('form text field placed', fobjs.length === 1 && email.field === 'text' && email.name === 'email' && email.value === 'a@b.c' && email.required && Math.abs(email.w - 200) < 1 && Math.abs(email.h - 25) < 1, JSON.stringify(email));
check('form field selected', (await nameValue()) === 'email');
await setInput('Name', 'mail');
check('form rename selected', (await fieldObjs())[0].name === 'mail');
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(200);
check('form rename undo', (await fieldObjs())[0].name === 'email');

await drag(fr0, [370, 20], [371, 21]);
check('form click deselects', (await fieldObjs()).length === 1 && (await nameValue()) === 'email');
await setInput('Name', '');
await clickIn('Radio');
await sleep(100);
await setInput('Options', 'Yes, No');
await drag(fr0, [60, 220], [160, 270]);
await drag(fr0, [370, 20], [371, 21]);
await clickIn('Dropdown');
await sleep(100);
await setInput('Options', 'Red, Green');
await drag(fr0, [200, 220], [320, 242]);
await drag(fr0, [370, 20], [371, 21]);
await clickIn('Checkbox');
await sleep(100);
await toggle('Checked');
await drag(fr0, [60, 300], [76, 316]);
await drag(fr0, [370, 20], [371, 21]);
await clickIn('Signature');
await drag(fr0, [200, 300], [360, 340]);
fobjs = await fieldObjs();
check('form five types', fobjs.map((o) => `${o.field}:${o.name}`).join() === 'text:email,radio:radio,dropdown:dropdown,checkbox:checkbox,signature:signature', fobjs.map((o) => `${o.field}:${o.name}`).join());

// resize bakes into w/h
const placed = fobjs[0];
const z0 = fr0.w / 400;
await page.mouse.move(fr0.x + placed.cx * z0, fr0.y + placed.cy * z0);
await page.mouse.down();
await page.mouse.move(fr0.x + (placed.cx + 10) * z0, fr0.y + (placed.cy + 5) * z0, { steps: 4 });
await page.mouse.move(fr0.x + (placed.cx + 20) * z0, fr0.y + (placed.cy + 10) * z0, { steps: 4 });
await page.mouse.up();
await sleep(250);
const movedField = (await fieldObjs())[0];
check('form field moves', Math.abs(movedField.cx - placed.cx - 20) < 1 && Math.abs(movedField.cy - placed.cy - 10) < 1, `${placed.cx},${placed.cy} -> ${movedField.cx},${movedField.cy}`);
const handle = await page.evaluate(() => {
	const c = window.__errataCanvas;
	const a = c.getActiveObject();
	const r = c.upperCanvasEl.getBoundingClientRect();
	return { x: r.left + a.oCoords.mr.x, y: r.top + a.oCoords.mr.y, w: a.getScaledWidth() * c.viewportTransform[0] };
});
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + handle.w / 4, handle.y, { steps: 4 });
await page.mouse.move(handle.x + handle.w / 2, handle.y, { steps: 4 });
await page.mouse.up();
await sleep(250);
const scaled = (await fieldObjs())[0];
check('form resize bakes', Math.abs(scaled.w - placed.w * 1.5) < 0.5 && scaled.scaleX === 1, `${scaled.w} ${scaled.scaleX}`);
check('form stays selected after rebuild', (await nameValue()) === 'email');

await page.keyboard.press(']');
await sleep(700);
const fr1 = await page.evaluate(() => window.__errata.pageRect(1));
await drag(fr0, [370, 20], [371, 21]);
await clickIn('Text');
await setInput('Name', 'turned');
await drag({ ...fr1, w: (fr1.w * 400) / 500 }, [100, 100], [250, 120]);
check('form field on turned page', (await fieldObjs(1)).length === 1);

await clickIn('Done');
await sleep(400);
check('form done closes', !(await modeOpen('form')) && (await activeTool()) === 'Select (V)');

const formOut = await exported();
const form = formOut.getForm();
const kinds = form.getFields().map((f) => `${f.getName()}:${f.constructor.name}`).join();
check('form export fields', kinds === 'given:PDFTextField,agree:PDFCheckBox,email:PDFTextField,radio:PDFRadioGroup,dropdown:PDFDropdown,checkbox:PDFCheckBox,signature:PDFSignature,turned:PDFTextField', kinds);
const final = (await doc()).pages[0].objects.find((o) => o.name === 'email');
const er = form.getTextField('email').acroField.getWidgets()[0].getRectangle();
const want = { x: final.cx - final.w / 2, y: 500 - final.cy - final.h / 2, width: final.w, height: final.h };
check('form export rect', ['x', 'y', 'width', 'height'].every((k) => Math.abs(er[k] - want[k]) < 0.01), `${JSON.stringify(er)} vs ${JSON.stringify(want)}`);
check('form export values', form.getTextField('email').getText() === 'a@b.c' && form.getTextField('email').isRequired() && form.getCheckBox('checkbox').isChecked() && form.getDropdown('dropdown').getOptions().join() === 'Red,Green' && form.getRadioGroup('radio').getOptions().join() === 'Yes,No');
check('form export pages', onPage(formOut, form.getTextField('email'), 0) && onPage(formOut, form.getSignature('signature'), 0) && onPage(formOut, form.getTextField('turned'), 1) && onPage(formOut, form.getCheckBox('agree'), 1));
const mk = form.getTextField('turned').acroField.getWidgets()[0].getAppearanceCharacteristics()?.getRotation();
check('form turned page widget upright', mk === 90, String(mk));

const sigDir = mkdtempSync(join(tmpdir(), 'errata-sig-'));
for (const [name, w, h] of [['tall', 60, 600], ['wide', 1200, 80]]) {
	const url = await page.evaluate((w, h) => {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		c.getContext('2d').fillRect(0, 0, w, h);
		return c.toDataURL('image/png');
	}, w, h);
	writeFileSync(join(sigDir, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
	await page.keyboard.press('g');
	await sleep(300);
	const input = await page.$('input[aria-label="Upload signature"]');
	await input.uploadFile(join(sigDir, `${name}.png`));
	await sleep(500);
}
await page.keyboard.press('g');
await sleep(700);
const thumbs = await page.$$eval('.err-sig-cell', (cells) => cells.map((c) => {
	const a = c.getBoundingClientRect();
	const b = c.querySelector('.err-sig-img').getBoundingClientRect();
	return { cell: [a.left, a.top, a.right, a.bottom], img: [b.left, b.top, b.right, b.bottom] };
}));
const inside = ({ cell, img }) => img[0] >= cell[0] && img[1] >= cell[1] && img[2] <= cell[2] && img[3] <= cell[3];
const apart = (p, q) => p[2] <= q[0] || q[2] <= p[0] || p[3] <= q[1] || q[3] <= p[1];
check('signature thumbs fit cells', thumbs.length === 3 && thumbs.every(inside), JSON.stringify(thumbs));
check('signature thumbs do not overlap', thumbs.every((t, i) => thumbs.every((u, j) => i === j || apart(t.img, u.img))), JSON.stringify(thumbs.map((t) => t.img)));
await page.keyboard.press('Escape');

const stripSrc = await PDFDocument.create();
const stripFont = await stripSrc.embedFont(StandardFonts.HelveticaBold);
stripSrc.addPage([400, 500]).drawText('MMMM', { x: 20, y: 420, size: 48, font: stripFont });
stripSrc.addPage([300, 200]);
await page.evaluate((b) => window.__errata.open(new Uint8Array(b).buffer, 'strips.pdf', 'application/pdf'), [...(await stripSrc.save())]);
await page.waitForFunction(() => window.__errata.doc()?.name === 'strips', { timeout: 10000 });
await sleep(800);
const pagesNow = async () => (await doc()).pages;
// dark-pixel centroid, 0..1
const inkAt = (index) => page.evaluate((i) => {
	const c = window.__errataCanvas;
	const el = c.lowerCanvasEl;
	const k = el.width / el.clientWidth;
	const r = window.__errata.pageRect(i);
	const o = el.getBoundingClientRect();
	const x0 = Math.round((r.x - o.left) * k);
	const y0 = Math.round((r.y - o.top) * k);
	const w = Math.round(r.w * k);
	const h = Math.round(r.h * k);
	const data = el.getContext('2d').getImageData(x0, y0, w, h).data;
	let sx = 0, sy = 0, n = 0;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++)
			if (data[(y * w + x) * 4 + 3] > 0 && data[(y * w + x) * 4] < 100) { sx += x; sy += y; n++; }
	return n ? { x: sx / n / w, y: sy / n / h, n, all: n / (w * h) } : null;
}, index);
const thumbInk = (index) => page.evaluate(async (i) => {
	const img = document.querySelectorAll('.err-page-thumb')[i];
	await img.decode();
	const c = document.createElement('canvas');
	c.width = img.naturalWidth;
	c.height = img.naturalHeight;
	const g = c.getContext('2d');
	g.drawImage(img, 0, 0);
	const data = g.getImageData(0, 0, c.width, c.height).data;
	let sx = 0, sy = 0, n = 0;
	for (let y = 0; y < c.height; y++)
		for (let x = 0; x < c.width; x++)
			if (data[(y * c.width + x) * 4] < 100) { sx += x; sy += y; n++; }
	return n ? { x: sx / n / c.width, y: sy / n / c.height } : null;
}, index);
const ink0 = await inkAt(0);
check('strips fixture ink top-left', !!ink0 && ink0.x < 0.5 && ink0.y < 0.3, JSON.stringify(ink0));

await openCell('Rotate');
check('rotate strip', await modeOpen('rotate'));
check('rotate strip waits for a choice', (await pagesNow()).every((p) => p.rotation === 0));
await clickIn('Rotate right');
await sleep(300);
let sp = await pagesNow();
check('rotate right current page only', sp[0].rotation === 90 && sp[1].rotation === 0, JSON.stringify(sp.map((p) => p.rotation)));
await clickIn('Rotate left');
await sleep(300);
check('rotate left', (await pagesNow())[0].rotation === 0);
await clickIn('Flip horizontal');
await sleep(900);
sp = await pagesNow();
check('flip horizontal stored', sp[0].flipX === true && !sp[0].flipY && !sp[1].flipX, JSON.stringify(sp.map((p) => [p.flipX, p.flipY])));
const inkH = await inkAt(0);
check('flip mirrors the raster', !!inkH && inkH.x > 0.5 && inkH.y < 0.3, JSON.stringify(inkH));
const thumbH = await thumbInk(0);
check('flip mirrors the thumb', !!thumbH && thumbH.x > 0.5 && thumbH.y < 0.3, JSON.stringify(thumbH));
const lineH = (await page.evaluate(() => window.__errata.content(0))).lines[0];
check('flip mirrors content boxes', lineH && lineH.box.x > 200, JSON.stringify(lineH?.box));
await undoStep();
sp = await pagesNow();
check('flip one undo step', !sp[0].flipX && sp[0].rotation === 0, JSON.stringify(sp[0]));
await clickIn('Rotate right');
await clickIn('Flip horizontal');
await sleep(300);
// turned mirror swaps axis
sp = await pagesNow();
check('flip on a turned page', sp[0].rotation === 90 && sp[0].flipY === true && !sp[0].flipX, JSON.stringify(sp[0]));
await clickIn('All');
await clickIn('Flip vertical');
await sleep(900);
sp = await pagesNow();
check('flip vertical all pages', sp[0].flipX === true && sp[0].flipY === true && sp[1].flipY === true && !sp[1].flipX, JSON.stringify(sp.map((p) => [p.flipX, p.flipY])));
// both flips: half turn
const inkTurned = await inkAt(0);
check('flipped turned raster', !!inkTurned && inkTurned.x < 0.3 && inkTurned.y > 0.5, JSON.stringify(inkTurned));
await clickIn('Close');
await sleep(400);
check('rotate strip closes', !(await modeOpen('rotate')));

const flipOut = await exported();
const flipStream = (index) => {
	const contents = flipOut.getPage(index).node.Contents();
	const streams = contents.constructor.name === 'PDFArray' ? contents.asArray().map((r) => flipOut.context.lookup(r)) : [contents];
	return streams.map((st) => new TextDecoder('latin1').decode(decodePDFRawStream(st).decode())).join('\n');
};
check('export flip matrix', /-1 0 0 -1 400 500 cm/.test(flipStream(0)), flipStream(0).slice(0, 120).replace(/\s+/g, ' '));
check('export flip keeps rotation', flipOut.getPage(0).getRotation().angle === 90);
check('export flip blank page', !flipOut.getPage(1).node.Contents());
const flipPdf = await getDocument({ data: new Uint8Array(await flipOut.save()), isEvalSupported: false, standardFontDataUrl: new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise;
const flipText = await (await flipPdf.getPage(1)).getTextContent();
const flipItem = flipText.items.find((it) => it.str === 'MMMM');
// run starts top-right, mirrored
check('export flip moves the text', !!flipItem && flipItem.transform[0] < 0 && flipItem.transform[3] < 0 && flipItem.transform[4] > 300 && flipItem.transform[5] < 100, JSON.stringify(flipItem?.transform));
// source pixel (399-y, x)
{
	const raster = (b) => new mupdf.PDFDocument(b).loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false);
	const want = raster(await stripSrc.save());
	const got = raster(await exportBytes());
	const [w, h] = [got.getWidth(), got.getHeight()];
	const a = got.getPixels();
	const b = want.getPixels();
	let off = 0;
	let ink = 0;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const v = b[x * want.getWidth() + 399 - y];
			if (v < 128) ink++;
			if (Math.abs(a[y * w + x] - v) > 64) off++;
		}
	check('export flip render matches', w === 500 && h === 400 && ink > 1000 && off < 50, JSON.stringify({ w, h, ink, off }));
}

await openCell('Insert page');
check('insert strip', await modeOpen('insert'));
const count0 = (await pagesNow()).length;
check('insert strip waits for a choice', count0 === 2);
await page.evaluate(() => window.__errata.pageIndex() === 0 || document.querySelectorAll('.err-page-cell')[0].click());
await sleep(200);
await clickIn('Duplicate');
await sleep(300);
sp = await pagesNow();
check('insert duplicate', sp.length === 3 && sp[1].sourceIndex === 0 && sp[1].id !== sp[0].id && sp[1].flipX === sp[0].flipX && sp[1].rotation === sp[0].rotation, JSON.stringify(sp.map((p) => [p.sourceIndex, p.rotation])));
check('insert duplicate is current', (await page.evaluate(() => window.__errata.pageIndex())) === 1);
await clickIn('Black');
await sleep(900);
sp = await pagesNow();
check('insert black', sp.length === 4 && sp[2].image?.naturalWidth === 1 && sp[2].baseWidth === 500 && sp[2].baseHeight === 400, JSON.stringify({ ...sp[2], image: !!sp[2].image }));
const inkBlack = await inkAt(2);
check('insert black renders black', !!inkBlack && inkBlack.all > 0.95, JSON.stringify(inkBlack));
await clickIn('Text');
await sleep(400);
sp = await pagesNow();
const word = sp[3].objects[0];
check('insert text page', sp.length === 5 && sp[3].sourceIndex === null && !sp[3].image && word?.kind === 'text' && word.text === 'Title' && word.cx === 250 && word.cy === 200, JSON.stringify(word));
check('insert text selected', await page.evaluate(() => window.__errataCanvas.getActiveObject()?.text === 'Title'));
await clickIn('Blank');
await sleep(300);
sp = await pagesNow();
check('insert blank', sp.length === 6 && sp[4].sourceIndex === null && !sp[4].image && sp[4].objects.length === 0 && sp[5].sourceIndex === 1);
await undoStep();
check('insert one undo step', (await pagesNow()).length === 5);
const stripPng = join(tmpdir(), 'errata-strip.png');
writeFileSync(stripPng, Buffer.from(pngData, 'base64'));
const fileInput = await page.$('.err-mode.is-open input[type="file"]');
await fileInput.uploadFile(stripPng);
await sleep(600);
sp = await pagesNow();
const current = await page.evaluate(() => window.__errata.pageIndex());
check('insert image page', sp.length === 6 && sp[current]?.image?.naturalWidth === 64 && current === 5, JSON.stringify({ n: sp.length, current }));
await clickIn('Close');
await sleep(400);
check('insert strip closes', !(await modeOpen('insert')));

await openCell('Crop');
const cr = await page.evaluate((i) => window.__errata.pageRect(i), await page.evaluate(() => window.__errata.pageIndex()));
await page.mouse.move(cr.x + cr.w * 0.3, cr.y + cr.h * 0.3);
await page.mouse.down();
await page.mouse.move(cr.x + cr.w * 0.7, cr.y + cr.h * 0.7, { steps: 6 });
await page.mouse.up();
await sleep(300);
check('crop cancel draft', !!(await cropDraft()));
await clickIn('Cancel');
await sleep(400);
check('crop cancel', (await pagesNow()).every((p) => !p.crop) && !(await cropDraft()) && !(await page.$('.err-mode.is-open')));
check('crop cancel removes draft', await page.evaluate(() => !window.__errataCanvas.getObjects().some((o) => o.type === 'rect' && o.strokeDashArray && o.selectable && o.evented !== false)));

const dashedDraft = () => page.evaluate(() => window.__errataCanvas.getObjects().some((o) => o.type === 'rect' && o.strokeDashArray && o.selectable && o.evented !== false));
await openCell('Crop');
const ecr = await page.evaluate((i) => window.__errata.pageRect(i), await page.evaluate(() => window.__errata.pageIndex()));
await page.mouse.move(ecr.x + ecr.w * 0.3, ecr.y + ecr.h * 0.3);
await page.mouse.down();
await page.mouse.move(ecr.x + ecr.w * 0.7, ecr.y + ecr.h * 0.7, { steps: 6 });
await page.mouse.up();
await sleep(300);
check('crop escape draft', await dashedDraft());
await page.keyboard.press('Escape');
await sleep(400);
check('crop escape closes', !(await modeOpen('crop')) && !(await dashedDraft()));
await page.keyboard.press('c');
await sleep(400);
check('crop key starts fresh', (await modeOpen('crop')) && !(await dashedDraft()));
await page.keyboard.press('Escape');
await sleep(400);

const cropNow = async () => (await pagesNow())[await page.evaluate(() => window.__errata.pageIndex())].crop;
for (const [cell, control] of [['Stamp', 'input[aria-label="Bold"]'], ['Watermark', '[role="slider"][aria-label="Opacity"]']]) {
	await page.evaluate(() => window.__errata.crop({ x: 0, y: 0, width: 100, height: 100 }));
	await sleep(200);
	await openCell(cell);
	await page.click(`.err-mode.is-open ${control}`);
	await sleep(100);
	await undoStep();
	check(`undo after ${cell.toLowerCase()} control`, !(await cropNow()));
	await page.keyboard.press('Escape');
	await sleep(400);
}

check('closed panels inert', await page.$$eval('.err-mode:not(.is-open)', (els) => els.length > 5 && els.every((e) => e.inert)));
check('closed panel refuses focus', await page.evaluate(() => {
	const b = document.querySelector('.err-mode:not(.is-open) button');
	b.focus();
	return document.activeElement !== b;
}));
await openCell('Watermark');
await page.click('.err-mode.is-open input[aria-label="Text"]');
await page.keyboard.press('Escape');
await sleep(100);
check('escape blurs a panel field', (await modeOpen('watermark')) && (await page.evaluate(() => document.activeElement === document.body)));
await page.keyboard.press('Escape');
await sleep(400);
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await sleep(200);
check('shell stays unscrolled', await page.$eval('.err-ed', (e) => e.scrollTop === 0));

for (const [m, want] of [['page-numbers', /^\d+ \/ \d+$/], ['watermark', /^DRAFT$/], ['stamp', /^(?!DRAFT$|\d+ \/ \d+$)/]]) {
	await page.evaluate((id) => window.__errata.setMode(id), m);
	await sleep(300);
	const shown = await previews();
	check(`${m} preview alone`, shown.length > 0 && shown.every((t) => want.test(t)), JSON.stringify(shown));
}
await page.evaluate(() => window.__errata.setMode(null));
await sleep(300);
check('previews cleared', (await previews()).length === 0);

{
	await page.evaluate(() => window.__errata.setTool?.('select'));
	const vy = () => page.evaluate(() => window.__errataCanvas.viewportTransform[5]);
	const finger = (type, y) =>
		page.evaluate(
			(type, y) => {
				const el = document.querySelector('.sub-canvas-wrap canvas.upper-canvas');
				const r = el.getBoundingClientRect();
				const t = new Touch({ identifier: 1, target: el, clientX: r.left + 3, clientY: r.top + y });
				el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
			},
			type,
			y,
		);
	await page.evaluate(() => window.__errataCanvas.setZoom(2));
	await finger('touchstart', 300);
	const y0 = await vy();
	await finger('touchmove', 240);
	const y1 = await vy();
	await finger('touchend', 240);
	check('touch: a finger on empty space pans', Math.abs(y1 - y0) > 1, JSON.stringify({ y0, y1 }));
	check('touch: marquee selection is back after the pan', await page.evaluate(() => window.__errataCanvas.selection));
}

await finish(browser);
