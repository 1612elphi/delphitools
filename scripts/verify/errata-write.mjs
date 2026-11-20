import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import * as mupdf from 'mupdf';
import { launch, check, finish, sleep, BASE } from './harness.mjs';

const { browser, page } = await launch();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setViewport({ width: 1400, height: 900 });
await page.goto(`${BASE}/errata`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__write, { timeout: 20000 });

const text = () =>
	page.evaluate(() =>
		window.__write
			.state()
			.doc.blocks.map((b) =>
				b.kind === 'para' ? b.runs.map((r) => r.text).join('') : '<break>',
			),
	);
const pages = () => page.evaluate(() => window.__write.layout()?.pages.length ?? 0);

await page.click('[data-new-document]');
await page.waitForSelector('.err-write-page canvas', { timeout: 15000 });
await page.waitForFunction(() => window.__write.layout() !== null);
check('new document opens one page', (await pages()) === 1);
check('input focused', await page.evaluate(() => document.activeElement?.classList.contains('err-write-input')));
const caretShown = () => page.evaluate(() => document.activeElement?.classList.contains('err-write-input') && getComputedStyle(document.querySelector('.err-write-caret')).visibility === 'visible');
check('caret shows on open', await caretShown());
const insertDrawer = async () => {
	await page.click('[data-flag-insert]');
	await page.waitForSelector('[data-drawer="insert"].is-open');
	await sleep(450);
};
const drawer = async () => {
	if (await page.$('[data-drawer="format"].is-open')) return;
	await page.click('[data-flag-current]');
	await sleep(450);
};
check('edge: the drawer starts shut', !!(await page.$('[data-drawer="format"]')) && !(await page.$('[data-drawer="format"].is-open')));
await drawer();
check('edge: the flag opens the drawer', !!(await page.$('[data-drawer="format"].is-open')));
check('edge: the flag keeps the caret', await caretShown());
await page.click('[data-format="spacing"]');
await sleep(150);
await page.keyboard.press('Escape');
await sleep(150);
check('caret back after a popover', await caretShown());
await page.click('[data-flag-current]');
await sleep(450);
check('edge: the flag shuts the drawer', !(await page.$('[data-drawer="format"].is-open')));
const railKey = '.sub-ed-panel-keys [aria-label="Pages"]';
const railWasOpen = !!(await page.$('.err-page-pick'));
if (!railWasOpen) await page.click(railKey);
await page.waitForSelector('.err-page-pick', { timeout: 5000 });
await page.click('.err-page-pick');
check('caret stays after a page thumbnail', await caretShown());
if (!railWasOpen) await page.click(railKey);

await page.keyboard.type('Hello world');
check('typing lands in the model', (await text())[0] === 'Hello world', JSON.stringify(await text()));
check('words in status', (await page.$eval('[data-status="words"]', (e) => e.textContent.trim())) === '2');

await page.keyboard.down('Alt');
await page.keyboard.press('Backspace');
await page.keyboard.up('Alt');
check('alt backspace deletes a word', (await text())[0] === 'Hello ', JSON.stringify(await text()));

await page.keyboard.down('Meta');
await page.keyboard.press('KeyZ');
await page.keyboard.up('Meta');
check('undo restores the word', (await text())[0] === 'Hello world', JSON.stringify(await text()));

await page.keyboard.press('Enter');
await page.keyboard.type('Second paragraph');
check('enter splits', (await text()).length === 2);

await page.keyboard.down('Meta');
await page.keyboard.press('KeyB');
await page.keyboard.up('Meta');
await page.keyboard.type(' bold');
const runs = await page.evaluate(() => window.__write.state().doc.blocks[1].runs);
check('bold pending applies to typed text', runs.some((r) => r.text === ' bold' && r.props.bold === true), JSON.stringify(runs));

await page.keyboard.press('Home');
await page.keyboard.down('Shift');
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
check('selection drawn', (await page.$$('.err-write-sel')).length > 0);
await page.keyboard.type('First');
check('typing replaces the selection', (await text())[1].startsWith('First paragraph'), JSON.stringify(await text()));

const cdp = await page.createCDPSession();
await page.keyboard.press('End');
await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
check('preedit visible while composing', (await page.$eval('.err-write-input', (e) => getComputedStyle(e).opacity)) === '1');
await cdp.send('Input.insertText', { text: '日本' });
check('ime commit inserts once', (await text())[1].endsWith('日本'), JSON.stringify(await text()));
check('input hidden after composing', (await page.$eval('.err-write-input', (e) => getComputedStyle(e).opacity)) === '0');

{
	const mirror = () => page.$eval('.err-write-input', (e) => [e.value, e.selectionStart, e.selectionEnd]);
	const [v, a, b] = await mirror();
	check('input mirrors the caret paragraph', v === (await text())[1] && a === v.length && b === a, JSON.stringify([v, a, b]));
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('Home');
	const [v0, a0] = await mirror();
	check('input follows the caret across paragraphs', v0 === 'Hello world' && a0 === 0, JSON.stringify([v0, a0]));
	await page.keyboard.down('Shift');
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
	await page.keyboard.up('Shift');
	const [, s1, e1] = await mirror();
	check('input mirrors the selection', s1 === 0 && e1 === 5, JSON.stringify([s1, e1]));
	await page.keyboard.press('ArrowRight');
	await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
	await sleep(100);
	const shown = await page.$eval('.err-write-input', (e) => ({ w: e.getBoundingClientRect().width, scroll: e.scrollLeft, value: e.value }));
	check('preedit box fits the composition', shown.w > 5 && shown.w < 80, JSON.stringify(shown));
	await page.screenshot({ path: process.env.IME_SHOT ?? '/tmp/errata-write-ime.png' });
	await cdp.send('Input.insertText', { text: '日' });
	check('ime mid paragraph inserts at the caret', (await text())[0] === 'Hello日 world', JSON.stringify(await text()));
	const [v2, a2] = await mirror();
	check('input resyncs after composing', v2 === 'Hello日 world' && a2 === 6, JSON.stringify([v2, a2]));
	await page.$eval('.err-write-input', (el) => {
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = 'Howdy' + el.value.slice(5);
		el.dispatchEvent(new CompositionEvent('compositionend', { data: 'Howdy', bubbles: true }));
	});
	await sleep(100);
	check('recomposition replaces the word', (await text())[0] === 'Howdy日 world', JSON.stringify(await text()));
	for (let i = 0; i < 6 && (await text())[0] !== 'Hello world'; i++) {
		await page.keyboard.down('Meta');
		await page.keyboard.press('KeyZ');
		await page.keyboard.up('Meta');
	}
	check('undo restores the ime edits', (await text())[0] === 'Hello world', JSON.stringify(await text()));
	const native = (type, value, data = null) =>
		page.$eval(
			'.err-write-input',
			(el, type, value, data) => {
				const ev = new InputEvent('beforeinput', { inputType: type, data, bubbles: true, cancelable: true });
				el.dispatchEvent(ev);
				if (ev.defaultPrevented) return;
				el.value = value;
				el.setSelectionRange(value.length, value.length);
				el.dispatchEvent(new InputEvent('input', { inputType: type, bubbles: true }));
			},
			type,
			value,
			data,
		);
	await page.keyboard.press('End');
	await native('insertReplacementText', 'Hello World', 'World');
	check('replacement text replaces the word', (await text())[0] === 'Hello World', JSON.stringify(await text()));
	await native('deleteSoftLineBackward', '');
	check('in-place deletes reach the model', (await text())[0] === '', JSON.stringify(await text()));
	const undoTo = async (want) => {
		for (let i = 0; i < 6 && (await text())[0] !== want; i++) {
			await page.keyboard.down('Meta');
			await page.keyboard.press('KeyZ');
			await page.keyboard.up('Meta');
		}
	};
	await undoTo('Hello world');
	await page.keyboard.press('End');
	await cdp.send('Input.imeSetComposition', { text: 'かな', selectionStart: 2, selectionEnd: 2 });
	const second = await page.evaluate(() => {
		const pg = window.__write.layout().pages[0];
		const l = pg.lines.find((x) => x.block === 1);
		const r = document.querySelector('.err-write-page').getBoundingClientRect();
		const z = r.width / pg.width;
		return { x: r.left + (l.left + 5) * z, y: r.top + (l.top + l.height / 2) * z };
	});
	await page.mouse.click(second.x, second.y);
	await sleep(100);
	const clicked = await text();
	check('click while composing commits in place', clicked[0] === 'Hello worldかな' && !clicked[1].includes('かな'), JSON.stringify(clicked));
	await undoTo('Hello world');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('End');
}

await page.$eval('.err-write-input', (el) => {
	const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
	Object.defineProperty(e, 'keyCode', { get: () => 229 });
	el.dispatchEvent(e);
});
check('keyCode 229 enter does not split', (await text()).length === 2, JSON.stringify(await text()));

const beforeInput = (inputType) =>
	page.$eval('.err-write-input', (el, t) => el.dispatchEvent(new InputEvent('beforeinput', { inputType: t, bubbles: true, cancelable: true })), inputType);
await beforeInput('deleteContentBackward');
check('beforeinput deletes backward', (await text())[1].endsWith('日') && !(await text())[1].endsWith('日本'), JSON.stringify(await text()));
await cdp.send('Input.insertText', { text: '本' });
await beforeInput('insertParagraph');
check('beforeinput splits', (await text()).length === 3, JSON.stringify(await text()));
await beforeInput('deleteContentBackward');
check('beforeinput joins back', (await text()).length === 2 && (await text())[1].endsWith('日本'), JSON.stringify(await text()));

const imageFile = () => {
	const c = document.createElement('canvas');
	c.width = c.height = 4;
	return new Promise((res) => c.toBlob((b) => res(new File([b], 'x.png', { type: 'image/png' })), 'image/png'));
};
const blocksBefore = (await text()).length;
await page.evaluate(async (make) => {
	const file = await new Function(`return (${make})()`)();
	const dt = new DataTransfer();
	dt.items.add(file);
	document.querySelector('.err-write-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, imageFile.toString());
await sleep(500);
const images = () => page.evaluate(() => window.__write.state().doc.blocks.flatMap((b) => (b.kind === 'para' ? b.runs.filter((r) => r.props.image) : [])).length);
check('image paste keeps the document and inserts the image', (await page.evaluate(() => window.__write.state() !== null)) && (await text()).length === blocksBefore && (await images()) === 1);
await page.keyboard.press('ArrowRight');
await page.evaluate(async (make) => {
	const file = await new Function(`return (${make})()`)();
	const dt = new DataTransfer();
	dt.items.add(file);
	document.querySelector('.err-ed').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, imageFile.toString());
await sleep(500);
check('image drop keeps the document and inserts the image', (await page.evaluate(() => window.__write.state() !== null)) && (await text()).length === blocksBefore && (await images()) === 2);

await page.evaluate(() => {
	const dt = new DataTransfer();
	dt.items.add(new File([new Uint8Array([1, 2, 3])], 'bad.ata'));
	document.querySelector('.err-ed').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page.waitForSelector('.err-open-failed', { timeout: 10000 }).catch(() => {});
check('failed open shows a note', !!(await page.$('.err-open-failed')));
check('failed open keeps the document', (await page.evaluate(() => window.__write.state() !== null)) && (await text()).length === blocksBefore);
await page.focus('.err-write-input');

await page.evaluate(() => {
	const body = 'Kingsley Read merged the entries into one design of 48 letters. ';
	const dt = new DataTransfer();
	dt.setData('text/plain', Array.from({ length: 60 }, () => body.repeat(6)).join('\n'));
	document.querySelector('.err-write-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await sleep(300);
const n = await pages();
check('paste paginates', n >= 3, `${n} pages`);
check('pages rendered', (await page.$$('.err-write-page')).length === n);

await page.keyboard.down('Meta');
await page.keyboard.press('Enter');
await page.keyboard.up('Meta');
check('cmd enter inserts a page break', (await text()).includes('<break>'));
check('break starts a page', (await pages()) === n + 1, `${await pages()} vs ${n + 1}`);

await page.$eval('.err-write-page', (e) => e.scrollIntoView({ block: 'start' }));
await sleep(200);
const box = await page.$eval('.err-write-page', (e) => {
	const r = e.getBoundingClientRect();
	return { x: r.left, y: r.top, w: r.width };
});
const z = await page.evaluate(() => {
	const l = window.__write.layout();
	return document.querySelector('.err-write-page').getBoundingClientRect().width / l.pages[0].width;
});
const line0 = await page.evaluate(() => window.__write.layout().pages[0].lines[0]);
await page.mouse.click(box.x + (line0.left + 2) * z, box.y + (line0.top + line0.height / 2) * z);
const sel = await page.evaluate(() => window.__write.state().sel.focus);
check('click puts the caret on line one', sel.block === 0 && sel.offset <= 1, JSON.stringify(sel));

await sleep(600);
const lineY = box.y + (line0.top + line0.height / 2) * z;
await page.mouse.click(box.x + (line0.left + 2) * z, lineY, { count: 2 });
const word = await page.evaluate(() => window.__write.state().sel);
check('double click selects a word', word.anchor.block === 0 && word.anchor.offset === 0 && word.focus.offset === 5, JSON.stringify(word));
await sleep(600);
await page.mouse.click(box.x + (line0.left + 2) * z, lineY, { count: 3 });
const whole = await page.evaluate(() => window.__write.state().sel);
check('triple click selects the paragraph', whole.anchor.offset === 0 && whole.focus.offset === 'Hello world'.length, JSON.stringify(whole));
await sleep(600);
await page.mouse.move(box.x + (line0.left + 2) * z, lineY);
await page.mouse.down();
await page.mouse.move(box.x + (line0.left + 40) * z, lineY, { steps: 4 });
await page.mouse.up();
const dragged = await page.evaluate(() => window.__write.state().sel);
check('drag selects', dragged.anchor.offset === 0 && dragged.focus.offset > 0, JSON.stringify(dragged));

await page.evaluate(() => {
	const top = document.querySelector('.err-write-page[data-page="1"]').getBoundingClientRect().top;
	document.querySelector('.err-write').scrollTop += top - 450;
});
await sleep(300);
const p0 = await page.$eval('.err-write-page[data-page="0"]', (e) => e.getBoundingClientRect().toJSON());
const p1 = await page.$eval('.err-write-page[data-page="1"]', (e) => e.getBoundingClientRect().toJSON());
const [last0, first1] = await page.evaluate(() => {
	const l = window.__write.layout();
	return [l.pages[0].lines.at(-1), l.pages[1].lines[0]];
});
await sleep(600);
await page.mouse.move(p0.left + (last0.left + 2) * z, p0.top + (last0.top + last0.height / 2) * z);
await page.mouse.down();
await page.mouse.move(p1.left + (first1.left + 20) * z, p1.top + (first1.top + first1.height / 2) * z, { steps: 6 });
await page.mouse.up();
const across = await page.evaluate(() => window.__write.state().sel);
check('drag continues onto the next page', across.anchor.block === last0.block && across.focus.block === first1.block && across.focus.offset > first1.start, JSON.stringify([across, last0.block, first1.block, first1.start]));
await page.$eval('.err-write-page', (e) => e.scrollIntoView({ block: 'start' }));
await sleep(200);
await page.mouse.click(box.x + (line0.left + 2) * z, lineY);

await drawer();
await page.click('[data-format="style"]');
await sleep(200);
const item = await page.$$eval('[role="menuitemradio"]', (els) => els.map((e) => e.textContent.trim()));
check('style menu lists styles', item.includes('Heading 1'), JSON.stringify(item));
await page.evaluate(() => [...document.querySelectorAll('[role="menuitemradio"]')].find((e) => e.textContent.trim() === 'Heading 1').click());
await sleep(200);
check('style applies', (await page.evaluate(() => window.__write.state().doc.blocks[0].style)) === 'h1');
check('format bar returns focus', await page.evaluate(() => document.activeElement?.classList.contains('err-write-input')));

await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press('c');
check('letter keys do not switch pdf tools', (await page.evaluate(() => window.__write.mode())) === null);
await page.focus('.err-write-input');

const pdfBytes = Uint8Array.from(await page.evaluate(() => window.__write.exportPdf()));
const doc = mupdf.Document.openDocument(pdfBytes, 'application/pdf');
check('pdf page count matches', doc.countPages() === (await pages()), `${doc.countPages()}`);
const first = JSON.parse(doc.loadPage(0).toStructuredText('preserve-whitespace').asJSON()).blocks[0].lines[0].text;
check('pdf first line text', first.replace(/\s/g, ' ').startsWith('Hello world'), JSON.stringify([...first].map((c) => c.charCodeAt(0))));
const pdfDoc = doc.asPDF();
check('pdf carries document.ata', Object.keys(pdfDoc.getEmbeddedFiles()).includes('document.ata'));

const before = await text();
await page.evaluate(() => window.__write.setDoc({ ...window.__write.state().doc, blocks: window.__write.state().doc.blocks.slice(0, 1) }));
await page.evaluate((b) => window.__write.open(b, 'export.pdf'), [...pdfBytes]);
await sleep(300);
check('hybrid pdf reopens as the document', JSON.stringify(await text()) === JSON.stringify(before), JSON.stringify([await text(), before]).slice(0, 400));

{
	const before = await text();
	const rtf = await page.evaluate(() => window.__write.rtf());
	check('rtf export has a stylesheet', /\\stylesheet/.test(rtf));
	await page.evaluate(() => window.__write.setDoc({ ...window.__write.state().doc, blocks: window.__write.state().doc.blocks.slice(0, 1) }));
	await page.evaluate((t) => window.__write.open([...new TextEncoder().encode(t)], 'doc.rtf'), rtf);
	await sleep(300);
	check('rtf reopens with the same text', JSON.stringify(await text()) === JSON.stringify(before), JSON.stringify((await text()).slice(0, 3)));
}

const ata = await page.evaluate(() => window.__write.ata());
await page.evaluate(() => window.__write.setDoc({ ...window.__write.state().doc, blocks: window.__write.state().doc.blocks.slice(0, 1) }));
await page.evaluate((b) => window.__write.open(b, 'doc.ata'), ata);
await sleep(300);
check('.ata reopens', JSON.stringify(await text()) === JSON.stringify(before));

await page.evaluate(() =>
	window.__write.setDoc({
		...window.__write.state().doc,
		blocks: [{ kind: 'para', id: 'wrap', style: 'body', props: {}, runs: [{ text: 'Wrap '.repeat(200), props: {} }], dir: 'ltr' }],
	}),
);
await sleep(300);
await page.focus('.err-write-input');
await page.keyboard.press('End');
const wrapLine = await page.evaluate(() => window.__write.layout().pages[0].lines[0]);
const endSel = await page.evaluate(() => window.__write.state().sel);
check('end stops at the wrap with affinity', endSel.focus.offset === wrapLine.end && endSel.focusAffinity === 'up', JSON.stringify(endSel));
const caretTop = await page.evaluate(() => {
	const z = document.querySelector('.err-write-page canvas').getBoundingClientRect().width / window.__write.layout().pages[0].width;
	return parseFloat(document.querySelector('.err-write-caret').style.top) / z;
});
check('end caret stays on the first line', Math.abs(caretTop - wrapLine.top) < 1, `${caretTop} vs ${wrapLine.top}`);
await page.keyboard.type('X');
check('typing at end inserts at the wrap', (await text())[0][wrapLine.end] === 'X', (await text())[0].slice(wrapLine.end - 2, wrapLine.end + 3));

await page.click('[data-tool="setup"]');
await sleep(300);
check('setup panel opens', !!(await page.$('[data-mode="write-setup"]')));
const w0 = await page.evaluate(() => window.__write.state().doc.setup.width);
await page.evaluate(() => [...document.querySelectorAll('[data-mode="write-setup"] button, [data-mode="write-setup"] [role="radio"]')].find((e) => e.textContent.trim() === 'Landscape')?.click());
await sleep(300);
const w1 = await page.evaluate(() => window.__write.state().doc.setup.width);
check('landscape swaps sides', w1 > w0, `${w0} -> ${w1}`);

await page.click('[data-tool="setup"]');
await sleep(300);

const P = (id, t, props = {}, style = 'body') => ({ kind: 'para', id, style, props: {}, runs: [{ text: t, props }], dir: 'ltr' });
const setDoc = async (blocks) => {
	await page.evaluate((blocks) => window.__write.setDoc({ ...window.__write.state().doc, blocks }), blocks);
	await sleep(300);
	await page.focus('.err-write-input');
};
const meta = async (key, shift = false) => {
	await page.keyboard.down('Meta');
	if (shift) await page.keyboard.down('Shift');
	await page.keyboard.press(key);
	if (shift) await page.keyboard.up('Shift');
	await page.keyboard.up('Meta');
	await sleep(200);
};
const styles = () => page.evaluate(() => window.__write.state().doc.blocks.map((b) => b.style));
const clickMenuItem = (title) =>
	page.evaluate((t) => [...document.querySelectorAll('[role^="menuitem"]')].find((e) => e.textContent.trim() === t)?.click(), title);

await setDoc([P('h', 'Overview', { bold: true }), P('b', 'Body text follows.'), P('s', 'Details', { bold: true }), P('c', 'More body.')]);
check('style cell marks a suggestion', !!(await page.$('[data-format="style"].has-suggestion')));
await drawer();
await page.click('[data-format="style"]');
await sleep(200);
const menu = await page.$$eval('[role^="menuitem"]', (els) => els.map((e) => e.textContent.trim()));
check('style menu offers the heading first', menu[0] === 'Heading 1?' && menu[1] === 'Skip', JSON.stringify(menu));
await clickMenuItem('Heading 1?');
await sleep(200);
check('suggested heading applies', (await styles())[0] === 'h1', JSON.stringify(await styles()));

await setDoc([P('h', 'Overview', { bold: true }), P('b', 'Body text follows.'), P('s', 'Details', { size: 15 }), P('c', 'More body.')]);
await drawer();
await page.click('[data-format="style"]');
await sleep(200);
await clickMenuItem('Skip');
await sleep(200);
check('skip hides the suggestion', !(await page.$('[data-format="style"].has-suggestion')));
await page.click('.sub-ed-stack [aria-label="Menu"]');
await sleep(300);
await page.click('[data-menu="detect-headings"]');
await sleep(300);
check('detect headings applies all', JSON.stringify(await styles()) === JSON.stringify(['h3', 'body', 'h1', 'body']), JSON.stringify(await styles()));
await page.focus('.err-write-input');
await meta('KeyZ');
check('detect headings is one undo step', (await styles()).every((s) => s === 'body'), JSON.stringify(await styles()));
await meta('KeyZ', true);

await page.evaluate(() => [...document.querySelectorAll('.err-write-tabs button')].find((e) => e.textContent.trim() === 'Outline')?.click());
await sleep(200);
const entries = await page.$$eval('[data-outline]', (els) => els.map((e) => [e.dataset.outline, e.dataset.level, e.textContent.trim()]));
check('outline lists headings by level', JSON.stringify(entries) === JSON.stringify([['0', '2', 'Overview'], ['2', '0', 'Details']]), JSON.stringify(entries));
await page.click('[data-outline="2"]');
await sleep(200);
const outSel = await page.evaluate(() => window.__write.state().sel.focus);
check('outline click moves the caret', outSel.block === 2 && outSel.offset === 0, JSON.stringify(outSel));
check('outline click focuses the editor', await page.evaluate(() => document.activeElement?.classList.contains('err-write-input')));
check('outline marks the caret entry', await page.$eval('[data-outline="2"]', (e) => e.classList.contains('is-on')));

{
	const railTab = (name) => page.evaluate((name) => [...document.querySelectorAll('.err-write-tabs button')].find((b) => b.textContent.trim() === name).click(), name);
	const railOpen = !!(await page.$('.err-write-tabs'));
	await page.evaluate(() => {
		const d = (window.__keep = window.__write.state().doc);
		const P = (id, t, style = 'body') => ({ kind: 'para', id, style, props: {}, runs: [{ text: t, props: {} }], dir: 'ltr' });
		const blocks = [P('n0', 'Body words here')];
		for (let i = 0; i < 150; i++) blocks.push(P('nf' + i, 'Filler paragraph ' + i));
		blocks.push(P('nh', 'Far heading', 'h1'));
		const mark = { id: 'm1', kind: 'shape', shape: 'rect', cx: 300, cy: 400, w: 300, h: 300, angle: 0, scaleX: 1, scaleY: 1, colour: '#ff0000', strokeWidth: 12 };
		window.__write.setDoc({ ...d, setup: { width: 595.28, height: 841.89, margins: { top: 72, right: 72, bottom: 72, left: 72 } }, notes: undefined, images: undefined, blocks, overlays: [[mark]] });
	});
	await sleep(600);
	if (!railOpen) await page.click(railKey);
	await page.waitForSelector('.err-write-tabs');
	await railTab('Pages');
	await page.waitForSelector('.err-page-thumb');
	await sleep(800);
	const red = await page.$eval('.err-page-thumb', (c) => {
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		let n = 0;
		for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) n++;
		return n;
	});
	check('page thumbnail shows markup objects', red > 50, red);
	await railTab('Outline');
	await page.waitForSelector('[data-outline="151"]');
	await page.click('[data-outline="151"]');
	await sleep(900);
	const far = await page.evaluate(() => {
		const c = document.querySelector('.err-write-caret');
		const v = document.querySelector('.err-write');
		return c ? c.getBoundingClientRect().top - v.getBoundingClientRect().top : -1;
	});
	check('outline click scrolls the heading to the top', far >= 0 && far < 200, far);
	await railTab('Pages');
	await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
	await sleep(300);
	const nbox = await page.$eval('.err-write-page', (e) => e.getBoundingClientRect().toJSON());
	const nl = await page.evaluate(() => {
		const p = window.__write.layout().pages[0];
		return { line: p.lines[0], z: document.querySelector('.err-write-page').getBoundingClientRect().width / p.width };
	});
	const nx = nbox.left + (nl.line.left + 20) * nl.z;
	const ny = nbox.top + (nl.line.top + nl.line.height / 2) * nl.z;
	await page.mouse.click(nx, ny);
	await sleep(200);
	await page.keyboard.down('Meta');
	await page.keyboard.down('Alt');
	await page.keyboard.press('KeyF');
	await page.keyboard.up('Alt');
	await page.keyboard.up('Meta');
	await page.keyboard.type('Note');
	await sleep(300);
	check('a footnote has its flag and no ribbon', !!(await page.evaluate(() => window.__write.note())) && (await page.$$('.err-flag[data-flag-current]')).length === 1 && !(await page.$('.err-write-bar')));
	await insertDrawer();
	await page.click('[data-edge-insert="field"]');
	await sleep(300);
	await clickMenuItem('Page count');
	await sleep(300);
	const noteFields = await page.evaluate(() => Object.values(window.__write.state().doc.notes ?? {}).flat().flatMap((p) => p.runs).filter((r) => r.props.field).length);
	check('the insert flag adds a field inside a footnote', noteFields === 1, noteFields);
	await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
	await sleep(300);
	await page.mouse.click(nx + 40, ny);
	await sleep(300);
	check('a click on the body leaves the footnote', !(await page.evaluate(() => window.__write.note())));
	if (railOpen) await railTab('Outline');
	else await page.click(railKey);
	await page.evaluate(() => window.__write.setDoc(window.__keep));
	await sleep(300);
	await page.focus('.err-write-input');
}

await setDoc([P('a', 'one fish two fish'), P('b', 'red Fish blue fish')]);
await meta('KeyF');
check('cmd f opens find', !!(await page.$('[data-mode="write-find"].is-open')));
check('find field focused', await page.evaluate(() => document.activeElement?.dataset.find === 'query'));
await page.keyboard.type('fish');
await sleep(200);
const count = () => page.$eval('[data-find-count]', (e) => e.textContent.trim());
check('find counts matches', (await count()) === '1 / 4', await count());
check('matches highlighted', (await page.$$('.err-write-hit')).length === 4);
await meta('KeyG');
check('cmd g goes next', (await count()) === '2 / 4', await count());
await meta('KeyG', true);
check('shift cmd g goes back', (await count()) === '1 / 4', await count());
await page.click('[data-mode="write-find"] .canon-switch');
await sleep(200);
check('match case narrows', (await count()).endsWith('/ 3'), await count());
await page.click('[data-mode="write-find"] .canon-switch');
await sleep(200);
await page.focus('[data-find="with"]');
await page.keyboard.type('cat');
await page.click('[data-find="all"]');
await sleep(200);
check('replace all', JSON.stringify(await text()) === JSON.stringify(['one cat two cat', 'red cat blue cat']), JSON.stringify(await text()));
check('count after replace all', (await count()) === '0', await count());
await page.focus('[data-find="query"]');
await page.keyboard.press('Escape');
await sleep(300);
check('escape closes find', !(await page.$('[data-mode="write-find"].is-open')));
check('escape returns focus', await page.evaluate(() => document.activeElement?.classList.contains('err-write-input')));
await meta('KeyZ');
check('replace all is one undo step', JSON.stringify(await text()) === JSON.stringify(['one fish two fish', 'red Fish blue fish']), JSON.stringify(await text()));
await meta('KeyF');
await page.keyboard.press('Escape');
await sleep(300);
check('escape then closes the panel', !(await page.$('[data-mode="write-find"].is-open')));

await page.keyboard.press('Home');
await page.keyboard.down('Shift');
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
await meta('KeyK');
check('cmd k opens link panel', !!(await page.$('[data-mode="write-link"].is-open')));
await page.keyboard.type('javascript:alert(1)');
await page.keyboard.press('Enter');
await sleep(200);
check('bad scheme rejected', (await page.$eval('[data-link="url"]', (e) => e.getAttribute('aria-invalid'))) === 'true');
await page.$eval('[data-link="url"]', (e) => e.select());
await page.keyboard.type('example.com');
await page.keyboard.press('Enter');
await sleep(300);
const linked = await page.evaluate(() => window.__write.state().doc.blocks[0].runs[0]);
check('link applied with underline and colour', linked.text === 'one' && linked.props.link === 'https://example.com/' && linked.props.underline === true && linked.props.colour === '#0563c1', JSON.stringify(linked));
check('link panel closes', !(await page.$('[data-mode="write-link"].is-open')));
const linkBytes = await page.evaluate(() => window.__write.exportPdf());
const linkPdf = mupdf.Document.openDocument(Uint8Array.from(linkBytes), 'application/pdf');
const uris = linkPdf.loadPage(0).getLinks().map((l) => l.getURI());
check('pdf has the link', uris.includes('https://example.com/'), JSON.stringify(uris));
check('linked pdf reopens as the document', await page.evaluate((b) => window.__write.open(b, 'l.pdf'), linkBytes));
await sleep(300);
const opened = await page.evaluate(() => {
	const calls = [];
	const orig = window.open;
	window.open = (...a) => calls.push(a);
	const l = window.__write.layout().pages[0].lines[0];
	const el = document.querySelector('.err-write-page');
	const r = el.getBoundingClientRect();
	const z = r.width / window.__write.layout().pages[0].width;
	const x = r.left + (l.spans[0].xs[1] + 1) * z;
	const y = r.top + (l.top + l.height / 2) * z;
	el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, button: 0, metaKey: true, bubbles: true, cancelable: true }));
	window.open = orig;
	return calls;
});
check('cmd click opens the link', opened.length === 1 && opened[0][0] === 'https://example.com/' && opened[0][2] === 'noopener,noreferrer', JSON.stringify(opened));

const FILLER = 'Kingsley Read merged the entries into one design of forty-eight letters and published it. ';
const layoutReady = () => page.waitForFunction(() => window.__write.layout() !== null, { timeout: 15000 });
const openDoc = async (setup, blocks) => {
	await page.evaluate(
		(setup, blocks) => {
			const doc = window.__write.state().doc;
			window.__write.setDoc({ ...doc, setup: { ...doc.setup, ...setup }, blocks });
		},
		setup,
		blocks,
	);
	await layoutReady();
	await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
	await sleep(300);
	await page.focus('.err-write-input');
};
const A4 = { width: 595.28, height: 841.89, margins: { top: 72, right: 72, bottom: 72, left: 72 } };
const bodyParas = (n, body = FILLER.repeat(3), props = {}) =>
	Array.from({ length: n }, (_, i) => ({ kind: 'para', id: `q${i}`, style: 'body', props, runs: [{ text: body, props: {} }], dir: 'ltr' }));

await openDoc({ ...A4, columns: 2, gutter: 18, hyphenate: false }, bodyParas(30));
const cols = await page.evaluate(() => {
	const pages = window.__write.layout().pages;
	const bottoms = (p) => [0, 1].map((c) => Math.max(0, ...p.lines.filter((l) => (l.col ?? 0) === c).map((l) => l.top + l.height)));
	return {
		n: pages.length,
		cols: pages[0].cols,
		firstCol1: pages[0].lines.find((l) => l.col === 1),
		last: bottoms(pages.at(-1)),
		full: bottoms(pages[0]),
	};
});
check('two columns: text reaches column two', cols.n >= 2 && cols.cols.length === 2 && !!cols.firstCol1 && cols.firstCol1.left >= cols.cols[1].left, JSON.stringify(cols).slice(0, 200));
check('two columns: last page balanced', cols.last[1] > 0 && Math.abs(cols.last[0] - cols.last[1]) < 20 && cols.last[0] < cols.full[0] - 20, JSON.stringify(cols.last));
const colClick = await page.evaluate(() => {
	const l = window.__write.layout().pages[0].lines.find((x) => x.col === 1);
	const el = document.querySelector('.err-write-page');
	const r = el.getBoundingClientRect();
	const z = r.width / window.__write.layout().pages[0].width;
	return { x: r.left + (l.left + 20) * z, y: r.top + (l.top + l.height / 2) * z, block: l.block };
});
await page.mouse.click(colClick.x, colClick.y);
await sleep(200);
check('click in column two hits its line', (await page.evaluate(() => window.__write.state().sel.focus.block)) === colClick.block);
await meta('Enter', true);
check('shift cmd enter inserts a column break', (await page.evaluate(() => window.__write.state().doc.blocks.some((b) => b.kind === 'column'))));

await openDoc({ ...A4, columns: undefined, header: undefined, footer: undefined }, bodyParas(60));
const headerAt = await page.evaluate(() => {
	const el = document.querySelector('.err-write-page');
	const r = el.getBoundingClientRect();
	const p = window.__write.layout().pages[0];
	const z = r.width / p.width;
	return { x: r.left + (p.content.left + 30) * z, y: r.top + (p.content.top / 2) * z, body: r.top + (p.content.top + 40) * z };
});
await page.mouse.click(headerAt.x, headerAt.y);
await page.mouse.click(headerAt.x, headerAt.y);
await sleep(300);
check('double click on the header area edits the header', !!(await page.$('.err-write-story[data-story="header"]')) && (await page.$$('.err-write-dim')).length > 0);
await page.keyboard.type('Running head ');
await meta('KeyP', true);
const header = await page.evaluate(() => window.__write.state().doc.setup.header);
check('typing lands in the header', header?.[0]?.runs[0]?.text === 'Running head ' && header[0].runs[1]?.props.field === 'page', JSON.stringify(header));
check('body unchanged while editing the header', (await text())[0] === FILLER.repeat(3));
const headerShown = await page.evaluate(() => window.__write.layout().pages.map((p) => p.header[0]?.spans.find((s) => s.shown)?.shown));
check('header page field shows the page number on page 3', headerShown[2] === '3', JSON.stringify(headerShown));
await page.keyboard.press('Escape');
await sleep(300);
check('escape leaves header editing', !(await page.$('.err-write-story')));
await page.keyboard.press('Home');
await page.keyboard.type('Z');
check('typing after escape goes to the body', (await text())[0].includes('Z') && (await page.evaluate(() => window.__write.state().doc.setup.header[0].runs[0].text)) === 'Running head ');
await page.mouse.click(headerAt.x, headerAt.y);
await page.mouse.click(headerAt.x, headerAt.y);
await sleep(300);
await page.mouse.click(headerAt.x, headerAt.body);
await page.mouse.click(headerAt.x, headerAt.body);
await sleep(300);
check('double click on the body leaves header editing', !(await page.$('.err-write-story')));

const pageField = { kind: 'para', id: 'fp', style: 'body', props: { align: 'centre' }, runs: [{ text: 'Page ', props: {} }, { text: '￼', props: { field: 'page' } }], dir: 'ltr' };
const head = { kind: 'para', id: 'hh', style: 'body', props: {}, runs: [{ text: 'Running head', props: {} }], dir: 'ltr' };
await openDoc({ ...A4, footer: [pageField], header: [head] }, bodyParas(60));
const footerShown = await page.evaluate(() => window.__write.layout().pages.map((p) => p.footer[0]?.spans.find((s) => s.shown)?.shown));
check('footer page field reads 3 on page 3', footerShown[2] === '3' && footerShown.length >= 3, JSON.stringify(footerShown));
check('sec status shows section one', (await page.$eval('[data-status="sec"]', (e) => e.textContent.trim())) === '1');
const readMirror = () => page.$$eval('[data-write-mirror] > *', (els) => els.map((e) => e.textContent.trim()));
await openDoc({ ...A4, footer: [pageField], header: [head] }, bodyParas(8, FILLER.repeat(12)));
{
	const full = (await page.evaluate(() => window.__write.state().doc.blocks[0].runs[0].text)).trim();
	const m0 = await readMirror();
	check('mirror reads header, footer and whole paragraphs', m0[0] === 'Running head' && m0.at(-1) === 'Page 1' && m0[1] === full, JSON.stringify([m0[0], m0[1], m0.at(-1)]));
	const tail = m0.at(-2);
	check('mirror shows the visible part of a split paragraph', tail.length > 0 && tail.length < full.length && full.startsWith(tail), JSON.stringify([tail, full.length]));
	await page.$eval('[data-page="1"]', (e) => e.scrollIntoView({ block: 'start' }));
	await sleep(400);
	const m1 = await readMirror();
	check('mirror continues it on the next page', m1[1].length < full.length && full.endsWith(m1[1]) && tail.length + m1[1].length >= full.length - 1 && m1.at(-1) === 'Page 2', JSON.stringify([m1[1], m1.at(-1)]));
	await openDoc({ ...A4, footer: [pageField], header: [head] }, bodyParas(60));
}

const hfPdf = mupdf.Document.openDocument(Uint8Array.from(await page.evaluate(() => window.__write.exportPdf())), 'application/pdf');
const pageText = (i) =>
	JSON.parse(hfPdf.loadPage(i).toStructuredText('preserve-whitespace').asJSON())
		.blocks.flatMap((b) => b.lines.map((l) => l.text))
		.join('\n');
const t0 = pageText(0);
const t2 = pageText(2);
check('pdf page has the header', t0.replace(/\s/g, ' ').includes('Running head'), JSON.stringify(t0.slice(0, 200)));
check('pdf pages have their numbers', /Page\s*1/.test(t0) && /Page\s*3/.test(t2), JSON.stringify([t0.slice(-40), t2.slice(-40)]));

const DE = 'Die Donaudampfschifffahrtsgesellschaft veröffentlichte Übergrößenträgerverzeichnisse und Rechtschreibungsempfehlungen für Silbentrennungsprogramme. ';
await openDoc({ ...A4, footer: undefined, header: undefined, lang: 'de', hyphenate: true }, bodyParas(2, DE.repeat(3), { align: 'justify' }));
const hy = await page.evaluate(() => {
	const lines = window.__write.layout().pages[0].lines;
	const doc = window.__write.state().doc;
	return lines
		.filter((l) => l.hyphen)
		.map((l) => {
			const t = doc.blocks[l.block].runs.map((r) => r.text).join('');
			return [t[l.end - 1], t[l.end], l.hyphen.xs[1] - (l.left + l.width)];
		});
});
check('german justified paragraph hyphenates inside words', hy.length > 0 && hy.every(([a, b]) => /\p{L}/u.test(a) && /\p{L}/u.test(b)), JSON.stringify(hy));
check('hyphenated justified lines reach the right edge', hy.every(([, , d]) => Math.abs(d) < 0.5), JSON.stringify(hy));
await page.click('[data-tool="setup"]');
await sleep(300);
check('setup panel shows language and hyphenation', !!(await page.$('[data-setup="lang"]')) && !!(await page.$('[data-setup="hyphenate"]')));
await page.click('[data-tool="setup"]');
await sleep(300);

const table = () => page.evaluate(() => window.__write.state().doc.blocks.find((b) => b.kind === 'table'));
const cellTexts = (t) => t.rows.map((r) => r.map((c) => (c.covered ? '-' : c.paras.map((p) => p.runs.map((x) => x.text).join('')).join('|'))));
const cellCentre = (row, col) =>
	page.evaluate(
		(row, col) => {
			const p = window.__write.layout().pages[0];
			const c = p.cells.find((x) => x.row === row && x.col === col && !x.repeat);
			const r = document.querySelector('.err-write-page').getBoundingClientRect();
			const z = r.width / p.width;
			return { x: r.left + (c.x + c.w / 2) * z, y: r.top + (c.y + c.h / 2) * z, right: r.left + (c.x + c.w) * z, z };
		},
		row,
		col,
	);
await openDoc({ ...A4, columns: 1, header: [], footer: [], lang: 'en', hyphenate: false }, bodyParas(1, 'Intro'));
await page.keyboard.press('End');
await insertDrawer();
await page.click('[data-tool="edge-table"]');
await sleep(300);
await page.hover(':popover-open [data-rows="3"][data-cols="3"]');
check('table grid label shows the size', (await page.$eval(':popover-open [data-table-size]', (e) => e.textContent.trim())) === '3 × 3');
await page.click(':popover-open [data-rows="3"][data-cols="3"]');
await sleep(300);
let tb = await table();
check('grid picker inserts a 3 × 3 table', tb?.rows.length === 3 && tb.cols.length === 3, JSON.stringify(tb?.cols));
const names = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3'];
for (const [i, n] of names.entries()) {
	await page.keyboard.type(n);
	if (i < names.length - 1) await page.keyboard.press('Tab');
}
await sleep(200);
tb = await table();
check('typing with Tab fills the cells', JSON.stringify(cellTexts(tb)) === JSON.stringify([names.slice(0, 3), names.slice(3, 6), names.slice(6)]), JSON.stringify(cellTexts(tb)));
check('status shows the cell line and column', (await page.$eval('[data-status="ln"]', (e) => e.textContent.trim())) === '1' && (await page.$eval('[data-status="col"]', (e) => e.textContent.trim())) === '3');
await page.keyboard.press('Tab');
await sleep(200);
tb = await table();
check('tab in the last cell adds a row', tb.rows.length === 4);
const a = await cellCentre(0, 0);
const b = await cellCentre(0, 1);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 4 });
await page.mouse.up();
await sleep(200);
check('drag across cells selects them', (await page.$$('.err-write-sel')).length === 2, JSON.stringify(await page.evaluate(() => window.__write.cell())));
await page.click('[data-tool="table"]');
await sleep(300);
check('table popover shows table actions in a cell', !!(await page.$('[data-table="rowAbove"]')) && !(await page.$('[data-rows]')));
await page.click(':popover-open [data-table="merge"]');
await sleep(300);
tb = await table();
check('merge cells joins two cells', tb.rows[0][0].colspan === 2 && tb.rows[0][1].covered && cellTexts(tb)[0][0] === 'A1|B1', JSON.stringify(cellTexts(tb)[0]));
await page.keyboard.press('Escape');
await sleep(200);
const border = await cellCentre(1, 0);
const cols0 = tb.cols;
await page.mouse.move(border.right, border.y);
await page.mouse.down();
await page.mouse.move(border.right + 20, border.y, { steps: 4 });
await page.mouse.move(border.right + 30, border.y, { steps: 2 });
await page.mouse.up();
await sleep(200);
tb = await table();
const grew = tb.cols[0] - cols0[0];
check(
	'dragging a column border resizes it, snapped to 1 pt',
	Math.abs(grew - 30 / border.z) < 1.5 && Math.abs(tb.cols[0] + tb.cols[1] - cols0[0] - cols0[1]) < 1e-6,
	JSON.stringify([cols0, tb.cols]),
);
await meta('KeyZ');
check('one undo step per column drag', Math.abs((await table()).cols[0] - cols0[0]) < 1e-6);
await meta('KeyZ', true);
const tablePdf = mupdf.Document.openDocument(Uint8Array.from(await page.evaluate(() => window.__write.exportPdf())), 'application/pdf');
const tableText = JSON.parse(tablePdf.loadPage(0).toStructuredText('preserve-whitespace').asJSON())
	.blocks.flatMap((bl) => bl.lines.map((l) => l.text))
	.join(' ');
const order = names.map((n) => tableText.indexOf(n));
check('pdf export has cell text in row order', order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), JSON.stringify([order, tableText.slice(0, 120)]));
const c22 = await cellCentre(2, 2);
await page.mouse.click(c22.x, c22.y, { clickCount: 1 });
await page.mouse.click(c22.x, c22.y, { clickCount: 2 });
await sleep(200);
check('click in a cell edits it', (await page.evaluate(() => window.__write.cell()))?.row === 2);
check('desktop shows the format bar while a cell is edited', !!(await page.$('.err-write-bar')));
await page.click('[data-tool="table"]');
await sleep(400);
if (process.env.TABLE_SHOT) await page.screenshot({ path: process.env.TABLE_SHOT });
await page.keyboard.press('Escape');
await sleep(200);
const longRows = Array.from({ length: 60 }, (_, i) =>
	[0, 1].map((c) => ({
		paras: [{ kind: 'para', id: `t${i}.${c}`, style: 'body', props: {}, runs: [{ text: i ? `row ${i}` : 'Head', props: {} }], dir: 'ltr' }],
	})),
);
await openDoc({ ...A4, columns: 1 }, [
	{ kind: 'table', id: 'long', cols: [200, 251], rows: longRows, header: true, border: { kind: 'all', width: 0.5, colour: '#000000' } },
	{ kind: 'para', id: 'after', style: 'body', props: {}, runs: [{ text: '', props: {} }], dir: 'ltr' },
]);
const repeat = await page.evaluate(() => window.__write.layout().pages.map((p) => p.cells[0] && [p.cells[0].row, !!p.cells[0].repeat]));
check('header row repeats on page 2', repeat.length >= 2 && repeat[1][0] === 0 && repeat[1][1] === true, JSON.stringify(repeat));

const imageCount = () =>
	page.evaluate(() => {
		const doc = window.__write.state().doc;
		let n = 0;
		for (const b of doc.blocks) if (b.kind === 'para') for (const r of b.runs) if (r.props.image) n += r.text.length;
		return n;
	});
const picked = () =>
	page.evaluate(() => {
		const { doc, sel } = window.__write.state();
		const [a, b] = [sel.anchor, sel.focus].sort((x, y) => x.block - y.block || x.offset - y.offset);
		const p = doc.blocks[a.block];
		if (a.block !== b.block || b.offset - a.offset !== 1 || p?.kind !== 'para') return null;
		let pos = 0;
		for (const r of p.runs) {
			pos += r.text.length;
			if (a.offset < pos) return r.props.image ? { block: a.block, offset: a.offset, image: r.props.image } : null;
		}
		return null;
	});
const pageBox = () => page.$eval('.err-write-page', (e) => e.getBoundingClientRect().toJSON());
const zoomOf = () => page.evaluate(() => document.querySelector('.err-write-page').getBoundingClientRect().width / window.__write.layout().pages[0].width);
const pngFile = join(mkdtempSync(join(tmpdir(), 'dt-img-')), 'red.png');
{
	const w = 400;
	const h = 200;
	const raw = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(y < h / 2 ? [200, 30, 30] : [30, 30, 200], y * (w * 3 + 1) + 1 + x * 3);
	const chunk = (t, d) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(d.length);
		const td = Buffer.concat([Buffer.from(t), d]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(td) >>> 0);
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	writeFileSync(pngFile, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
await openDoc({ ...A4, columns: 1, header: [], footer: [], lang: 'en', hyphenate: false }, bodyParas(6, FILLER.repeat(4)));
await page.evaluate(() => window.__write.setDoc({ ...window.__write.state().doc, images: undefined }));
await layoutReady();
await page.focus('.err-write-input');
await page.keyboard.down('Meta');
await page.keyboard.press('ArrowUp');
await page.keyboard.up('Meta');
const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('[data-flag-insert]').then(() => sleep(450)).then(() => page.click('[data-edge-insert="image"]'))]);
await chooser.accept([pngFile]);
await page.waitForFunction(() => Object.keys(window.__write.state().doc.images ?? {}).length === 1, { timeout: 10000 }).catch(() => {});
let img = await picked();
check('image cell inserts the png at the caret and selects it', img?.block === 0 && img.offset === 0 && Math.abs(img.image.w - 300) < 0.01 && Math.abs(img.image.h - 150) < 0.01, JSON.stringify(img));
check('png keeps its bytes', await page.evaluate((id) => window.__write.state().doc.images[id].mime === 'image/png' && window.__write.state().doc.images[id].width === 400, img?.image.id));
check('selected image shows a frame with handles', (await page.$$('[data-image-frame] [data-handle]')).length === 4);
check('the image has its own flag, current while selected', !!(await page.$('.err-flag[data-flag-kind="image"][data-flag-current]')));
check('bar shows image cells', !!(await page.$('[data-format="wrap"]')) && !!(await page.$('[data-format="caption"]')) && !(await page.$('[data-format="style"]')));
const inlineLine = await page.evaluate(() => window.__write.layout().pages[0].lines[0]);
check('inline image raises its line', inlineLine.height > 150, `${inlineLine.height}`);

await sleep(300);
let z3 = await zoomOf();
let se = await page.$eval('[data-handle="se"]', (e) => e.getBoundingClientRect().toJSON());
await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
await page.mouse.down();
await page.mouse.move(se.x + se.width / 2 - 60 * z3, se.y + se.height / 2, { steps: 4 });
await page.mouse.up();
await sleep(200);
const resized = await picked();
check('corner handle resizes keeping the ratio', resized && Math.abs(resized.image.w - 240) < 1.5 && Math.abs(resized.image.w / resized.image.h - 2) < 0.01, JSON.stringify(resized?.image));
await meta('KeyZ');
check('resize is one undo step', Math.abs((await picked())?.image.w - 300) < 0.01, JSON.stringify((await picked())?.image));
await meta('KeyZ', true);

await page.click('[data-format="wrap"]');
await sleep(200);
await clickMenuItem('Square');
await sleep(300);
img = await picked();
check('wrap picker floats the image square', img?.image.float?.wrap === 'square' && img.image.float.side === 'both', JSON.stringify(img?.image));
const wrapped = await page.evaluate(() => {
	const p = window.__write.layout().pages[0];
	const f = p.floats[0];
	const beside = p.lines.filter((l) => l.top < f.y + f.h && l.top + l.height > f.y);
	return { f, beside: beside.map((l) => [l.left, l.width]), full: p.content.width };
});
check('text lines beside the square float are shorter', wrapped.f && wrapped.beside.length >= 3 && wrapped.beside.every(([, w]) => w < wrapped.full - wrapped.f.w + 1), JSON.stringify(wrapped).slice(0, 300));

await page.click('[data-format="caption"]');
await sleep(300);
await page.keyboard.type('Red and blue');
await sleep(200);
const capText = await page.evaluate(() => {
	const doc = window.__write.state().doc;
	const b = doc.blocks[1];
	return { style: b.style, text: b.runs.map((r) => r.text).join(''), field: b.runs[0].props.field };
});
check('caption toggle adds a caption paragraph to type into', capText.style === 'caption' && capText.field === 'figure' && capText.text === '￼ Red and blue', JSON.stringify(capText));
const capShown = await page.evaluate(() => {
	const p = window.__write.layout().pages[0];
	const l = p.lines.find((x) => x.block === 1);
	const f = p.floats[0];
	return { shown: l.spans.find((s) => s.shown)?.shown, inBox: l.top >= f.y + f.h && l.left >= f.x - 0.01 && l.left + l.width <= f.x + f.w + 0.01 };
});
check('caption shows Figure 1 inside the float box', capShown.shown === 'Figure 1' && capShown.inBox, JSON.stringify(capShown));
{
	const m = await readMirror();
	check('mirror reads the image and its caption', m.some((t) => /\bImage\b/.test(t)) && m.includes('Figure 1 Red and blue'), JSON.stringify(m.slice(0, 4)));
}

const fbox = await page.evaluate(() => window.__write.layout().pages[0].floats[0]);
let pb = await pageBox();
await page.mouse.click(pb.left + (fbox.x + fbox.w / 2) * z3, pb.top + (fbox.y + fbox.h / 2) * z3);
await sleep(300);
img = await picked();
check('click selects the float', img?.image.float?.wrap === 'square');
if (process.env.IMAGE_SHOT) await page.screenshot({ path: process.env.IMAGE_SHOT });
await page.mouse.move(pb.left + (fbox.x + fbox.w / 2) * z3, pb.top + (fbox.y + fbox.h / 2) * z3);
await page.mouse.down();
await page.mouse.move(pb.left + (fbox.x + fbox.w / 2 + 40) * z3, pb.top + (fbox.y + fbox.h / 2 + 200) * z3, { steps: 6 });
await page.mouse.up();
await sleep(300);
const movedTo = await page.evaluate(() => ({ f: window.__write.layout().pages[0].floats[0], doc: window.__write.state().doc.blocks.map((b) => b.runs?.some((r) => r.props.image)) }));
check('dragging moves the float', Math.abs(movedTo.f.x - fbox.x - 40) < 2 && Math.abs(movedTo.f.y - fbox.y - 200) < 2, JSON.stringify([fbox.x, fbox.y, movedTo.f.x, movedTo.f.y]));
check('a moved float anchors to the paragraph under it', movedTo.f.block > 0, JSON.stringify(movedTo.doc));
const capAfter = await page.evaluate((bi) => window.__write.state().doc.blocks[bi + 1]?.style, movedTo.f.block);
check('its caption moves along', capAfter === 'caption', capAfter);
await meta('KeyZ');
const undone = await page.evaluate(() => window.__write.layout().pages[0].floats[0]);
check('a move is one undo step', Math.abs(undone.x - fbox.x) < 0.5 && Math.abs(undone.y - fbox.y) < 0.5 && undone.block === 0, JSON.stringify(undone));
await meta('KeyZ', true);

const imgPdf = mupdf.Document.openDocument(Uint8Array.from(await page.evaluate(() => window.__write.exportPdf())), 'application/pdf');
const imgBlocks = JSON.parse(imgPdf.loadPage(0).toStructuredText('preserve-images').asJSON()).blocks.filter((b) => b.type === 'image');
check('pdf page has an image block', imgBlocks.length === 1, JSON.stringify(imgBlocks));

const bytesOf = () => page.evaluate(() => Object.values(window.__write.state().doc.images ?? {}).map((a) => [...a.bytes].join(',')));
const before3 = await bytesOf();
const ata3 = await page.evaluate(() => window.__write.ata());
await page.evaluate(() => window.__write.setDoc({ ...window.__write.state().doc, images: undefined, blocks: window.__write.state().doc.blocks.slice(2) }));
await page.evaluate((b) => window.__write.open(b, 'img.ata'), ata3);
await sleep(300);
check('.ata round trip keeps the image bytes', JSON.stringify(await bytesOf()) === JSON.stringify(before3) && (await imageCount()) === 1);

await layoutReady();
const fl = await page.evaluate(() => window.__write.layout().pages[0].floats[0]);
pb = await pageBox();
z3 = await zoomOf();
await page.mouse.click(pb.left + (fl.x + 10) * z3, pb.top + (fl.y + 10) * z3);
await sleep(300);
await page.evaluate(() => {
	const dt = new DataTransfer();
	const input = document.querySelector('.err-write-input');
	input.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
	window.__clip = dt;
});
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.evaluate(() => {
	const src = window.__clip;
	const dt = new DataTransfer();
	for (const t of src.types) dt.setData(t, src.getData(t));
	document.querySelector('.err-write-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await sleep(300);
check('pasting a copied image keeps the image', (await imageCount()) === 2 && (await page.evaluate(() => Object.keys(window.__write.state().doc.images).length)) === 1);
await page.evaluate(() => {
	const dt = new DataTransfer();
	dt.setData('text/plain', 'plain');
	document.querySelector('.err-write-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await sleep(200);
check('plain text paste adds no image', (await imageCount()) === 2);

await page.mouse.click(pb.left + (fl.x + 10) * z3, pb.top + (fl.y + 10) * z3);
await sleep(300);
await page.keyboard.press('Backspace');
await sleep(200);
check('backspace removes the selected image', (await imageCount()) === 1);
await meta('KeyZ');
check('undo brings it back', (await imageCount()) === 2);

await page.evaluate(() => window.__write.setDoc({ ...window.__write.state().doc, setup: { ...window.__write.state().doc.setup, width: 595.28, height: 841.89 } }));
await sleep(400);
await page.evaluate(() => {
	const d = window.__write.state().doc;
	window.__write.setDoc({ ...d, images: undefined, overlays: undefined, blocks: [{ kind: 'para', id: 'mk', style: 'body', props: {}, runs: [{ text: 'Marked page', props: {} }], dir: 'ltr' }] });
});
await sleep(300);
const boxCard = async (title) => {
	await page.click('[data-toolbox]');
	await page.waitForSelector('.err-sheet.is-open');
	await sleep(450);
	for (const b of await page.$$('.err-sheet.is-open button'))
		if ((await b.evaluate((e) => e.textContent.trim())) === title) {
			await b.click();
			await sleep(450);
			return;
		}
	throw new Error('no Toolbox card ' + title);
};
const marks = () => page.evaluate(() => (window.__write.state().doc.overlays?.[0] ?? []).map((o) => o.kind + (o.kind === 'comment' ? ':' + o.text : '')));
await page.click('[data-markup="ink"]');
await sleep(400);
check('a markup tool keeps the write view', !!(await page.$('.err-write.is-marking')) && (await page.evaluate(() => !!window.__errata.doc() && !!window.__write.state())) && !!(await page.$('.err-settings-bar, .sub-ed-bar')));
const pr = await page.evaluate(() => window.__errata.pageRect(0));
const wr = await page.$eval('.err-write-page', (el) => el.getBoundingClientRect().toJSON());
check('the marks canvas sits on the written page', Math.abs(pr.x - wr.x) < 1 && Math.abs(pr.y - wr.y) < 1 && Math.abs(pr.w - wr.width) < 1, JSON.stringify([pr, wr]));
const at = (fx, fy) => [pr.x + pr.w * fx, pr.y + pr.h * fy];
await page.mouse.move(...at(0.3, 0.3));
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(...at(0.3 + i * 0.04, 0.3 + (i % 2) * 0.03));
await page.mouse.up();
await sleep(300);
check('pen stroke lands in the overlay of page 1', JSON.stringify(await marks()) === '["ink"]', JSON.stringify(await marks()));
await page.click('[data-markup="shape"]');
await page.mouse.move(...at(0.2, 0.5));
await page.mouse.down();
await page.mouse.move(...at(0.6, 0.65), { steps: 6 });
await page.mouse.up();
await sleep(300);
check('shape added', JSON.stringify(await marks()) === '["ink","shape"]', JSON.stringify(await marks()));
await boxCard('Comment');
await page.mouse.click(...at(0.8, 0.2));
await page.waitForSelector('.err-note-text', { timeout: 5000 }).catch(() => {});
await sleep(200);
await page.type('.err-note-text', 'Check this');
// page click adds comment
await page.click('[data-markup="select"]');
await sleep(300);
check('comment added with its text', JSON.stringify(await marks()) === '["ink","shape","comment:Check this"]', JSON.stringify(await marks()));
await page.screenshot({ path: process.env.MARK_SHOT ?? '/tmp/errata-markup.png' });
await page.click('[data-markup="select"]');
await meta('KeyZ');
await sleep(200);
check('undo reverts the comment text', JSON.stringify(await marks()) === '["ink","shape","comment:"]', JSON.stringify(await marks()));
await meta('KeyZ');
await meta('KeyZ');
await sleep(200);
check('undo removes marks in the write history', JSON.stringify(await marks()) === '["ink"]', JSON.stringify(await marks()));
check('the canvas follows undo', (await page.evaluate(() => window.__errata.doc().pages[0].objects.length)) === 1);
for (let i = 0; i < 3; i++) await meta('KeyZ', true);
await sleep(200);
check('redo restores them', JSON.stringify(await marks()) === '["ink","shape","comment:Check this"]', JSON.stringify(await marks()));
await page.mouse.move(...at(0.8, 0.2));
await page.mouse.down();
await page.mouse.move(...at(0.75, 0.25), { steps: 4 });
await meta('KeyZ');
await page.mouse.move(...at(0.7, 0.3), { steps: 4 });
await page.mouse.up();
await sleep(300);
check('undo waits for a drag to end', JSON.stringify(await marks()) === '["ink","shape","comment:Check this"]', JSON.stringify(await marks()));
await meta('KeyZ');
await sleep(200);
const markedBytes = Uint8Array.from(await page.evaluate(() => window.__write.exportPdf()));
const markedPdf = mupdf.Document.openDocument(markedBytes, 'application/pdf');
const mp = markedPdf.loadPage(0);
const annots = mp.getAnnotations().map((a) => [a.getType(), a.getContents()]);
check('the comment exports as a text annotation', annots.some(([type, c]) => type === 'Text' && c === 'Check this'), JSON.stringify(annots));
const pix = mp.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
const px = pix.getPixels();
let red = 0;
for (let i = 0; i < px.length; i += 3) if (px[i] > 180 && px[i + 1] < 90 && px[i + 2] < 90) red++;
check('the pen stroke and shape are drawn on the pdf page', red > 200, `${red} red pixels`);
check('the text is still there', mp.toStructuredText().asText().includes('Marked page'));
check('the export still opens as a document', await page.evaluate((b) => window.__write.open(b, 'marked.pdf'), [...markedBytes]));
await sleep(300);
check('reopening restores the overlay', JSON.stringify(await marks()) === '["ink","shape","comment:Check this"]', JSON.stringify(await marks()));
check('reopened marks are editable on the canvas', (await page.evaluate(() => window.__errata.doc()?.pages[0].objects.length)) === 3);
await page.click('[data-markup="content"]');
await page.waitForSelector('.err-write-input', { timeout: 5000 });
await sleep(200);
check('write returns to text', !(await page.evaluate(() => window.__errata.doc())) && (await page.evaluate(() => document.activeElement?.classList.contains('err-write-input'))));
await page.keyboard.press('End');
await page.keyboard.type(' again');
check('typing works after markup', (await text())[0] === 'Marked page again', JSON.stringify(await text()));
check('marks survive typing', (await marks()).length === 3);
const ink = await page.$eval('.err-write-page canvas', (c) => {
	const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
	let n = 0;
	for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) n++;
	return n;
});
check('write view draws the marks', ink > 200, `${ink}`);
await page.evaluate(() => {
	const d = window.__write.state().doc;
	const blocks = Array.from({ length: 120 }, (_, i) => ({ kind: 'para', id: 'p' + i, style: 'body', props: {}, runs: [{ text: 'Line ' + i, props: {} }], dir: 'ltr' }));
	window.__write.setDoc({ ...d, overlays: undefined, blocks });
});
await sleep(400);
const writePages = () => page.evaluate(() => window.__write.layout()?.pages.length ?? 0);
const shownPage = () =>
	page.evaluate(() => {
		const el = document.querySelector('.err-write');
		const r = el.getBoundingClientRect();
		const mid = r.top + r.height / 2;
		const hit = [...el.querySelectorAll('[data-page]')].find((p) => {
			const b = p.getBoundingClientRect();
			return b.top <= mid && b.bottom >= mid;
		});
		return hit ? Number(hit.dataset.page) : -1;
	});
const lastPage = (await writePages()) - 1;
await page.evaluate(() => {
	const el = document.querySelector('.err-write');
	el.scrollTop = el.scrollHeight;
});
await sleep(300);
const markFrom = await shownPage();
const scrollTop = () => page.$eval('.err-write', (el) => el.scrollTop);
let markTop = await scrollTop();
await page.click('[data-markup="ink"]');
await sleep(400);
check('markup does not scroll the page', (await scrollTop()) === markTop, `${markTop} ${await scrollTop()}`);
await page.click('[data-markup="select"]');
const lineAt = await page.evaluate(() => {
	const r = [...document.querySelectorAll('.err-write-page')].find((p) => p.getBoundingClientRect().bottom > 300).getBoundingClientRect();
	return [r.x + r.width / 2, Math.max(r.y + r.height / 2, 200)];
});
await page.mouse.click(...lineAt, { count: 2 });
await sleep(300);
check('double click on no mark returns to the text', !(await page.$('.err-write.is-marking')) && (await page.evaluate(() => document.activeElement?.classList.contains('err-write-input'))) && (await page.evaluate(() => window.__write.state().sel.focus.block)) > 0, JSON.stringify(await page.evaluate(() => window.__write.state().sel.focus)));
await page.click('[data-markup="ink"]');
await sleep(300);
markTop = await scrollTop();
check('markup opens on the visible page', lastPage > 0 && (await page.evaluate(() => window.__errata.pageIndex())) === markFrom, `${markFrom} of ${lastPage}, ${await page.evaluate(() => window.__errata.pageIndex())}`);
await page.click('[data-markup="content"]');
await page.waitForSelector('.err-write-input', { timeout: 5000 });
await sleep(300);
check('write stays on the marked page', (await scrollTop()) === markTop, `${markTop} ${await scrollTop()}`);
const openFresh = async (blocks) => {
	await page.evaluate((blocks) => {
		const d = window.__write.state().doc;
		window.__write.setDoc({ ...d, setup: { ...d.setup, width: 595.28, height: 841.89, columns: undefined, header: undefined, footer: undefined }, overlays: undefined, images: undefined, notes: undefined, blocks });
	}, blocks);
	await layoutReady();
	await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
	await sleep(300);
	await page.focus('.err-write-input');
};
const metaAlt = async (code) => {
	await page.keyboard.down('Meta');
	await page.keyboard.down('Alt');
	await page.keyboard.press(code);
	await page.keyboard.up('Alt');
	await page.keyboard.up('Meta');
	await sleep(200);
};
const noteTexts = () => page.evaluate(() => Object.values(window.__write.state().doc.notes ?? {}).map((ps) => ps.map((p) => p.runs.map((r) => r.text).join('')).join('|')));
await openFresh(bodyParas(12));
await meta('ArrowUp');
await page.keyboard.press('End');
await metaAlt('KeyF');
check('cmd alt f inserts a footnote and edits it', !!(await page.evaluate(() => window.__write.note())));
await page.keyboard.type('First footnote text');
check('typing lands in the footnote', JSON.stringify(await noteTexts()) === '["First footnote text"]', JSON.stringify(await noteTexts()));
const refAt = await page.evaluate(() => {
	const b = window.__write.state().doc.blocks[0];
	let pos = 0;
	for (const r of b.runs) {
		if (r.props.note) return pos;
		pos += r.text.length;
	}
	return -1;
});
await page.keyboard.press('Escape');
await sleep(200);
const back = await page.evaluate(() => [window.__write.note(), window.__write.state().sel.focus]);
check('escape returns to the body after the reference', back[0] === null && back[1].block === 0 && back[1].offset === refAt + 1, JSON.stringify([back, refAt]));
const foot = await page.evaluate(() => {
	const p = window.__write.layout().pages[0];
	return { notes: p.notes.map((l) => ({ top: l.top, text: l.spans.map((s) => s.text).join(''), marker: l.marker?.text })), bottom: p.content.top + p.content.height, last: p.lines.at(-1).top + p.lines.at(-1).height };
});
check('the footnote sits at the page foot with its number', foot.notes.length === 1 && foot.notes[0].text === 'First footnote text' && foot.notes[0].marker === '1' && foot.notes[0].top > foot.last && foot.notes[0].top > foot.bottom - 40, JSON.stringify(foot));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('End');
await insertDrawer();
await page.click('[data-edge-insert="footnote"]');
await sleep(200);
await page.keyboard.type('Second note');
await page.keyboard.press('Escape');
await sleep(200);
const two = await page.evaluate(() => window.__write.layout().pages[0].notes.map((l) => l.marker?.text ?? ''));
check('a second footnote numbers 2 under the first', JSON.stringify(two) === '["1","2"]', JSON.stringify(two));
const noteAt = await page.evaluate(() => {
	const el = document.querySelector('.err-write-page');
	const r = el.getBoundingClientRect();
	const p = window.__write.layout().pages[0];
	const z = r.width / p.width;
	const l = p.notes[0];
	return { x: r.left + (l.left + 20) * z, y: r.top + (l.top + l.height / 2) * z };
});
await page.evaluate((y) => document.querySelector('.err-write').scrollBy(0, y - window.innerHeight / 2), noteAt.y);
await sleep(300);
const noteAt2 = await page.evaluate(() => {
	const el = document.querySelector('.err-write-page');
	const r = el.getBoundingClientRect();
	const p = window.__write.layout().pages[0];
	const z = r.width / p.width;
	const l = p.notes[0];
	return { x: r.left + (l.left + 20) * z, y: r.top + (l.top + l.height / 2) * z };
});
await page.mouse.click(noteAt2.x, noteAt2.y);
await page.mouse.click(noteAt2.x, noteAt2.y);
await sleep(300);
check('double click on the note text edits it', !!(await page.evaluate(() => window.__write.note())));
await page.keyboard.press('End');
await sleep(200);
check('the caret is drawn in the note', !!(await page.$('.err-write-caret')));
await page.screenshot({ path: process.env.NOTE_SHOT ?? '/tmp/errata-notes.png' });
await page.keyboard.press('Escape');
await sleep(200);
await page.keyboard.press('Backspace');
await sleep(200);
check('backspace over a reference deletes its note', JSON.stringify(await noteTexts()) === '["Second note"]', JSON.stringify(await noteTexts()));
await meta('KeyZ');
check('undo brings the note back', (await noteTexts()).length === 2, JSON.stringify(await noteTexts()));
const H = (id, t, style) => ({ kind: 'para', id, style, props: {}, runs: [{ text: t, props: {} }], dir: 'ltr' });
await openFresh([H('i', 'Intro paragraph', 'body'), H('c1', 'Chapter one', 'h1'), ...bodyParas(14), H('c2', 'Chapter two', 'h1'), ...bodyParas(14).map((b, i) => ({ ...b, id: `r${i}` })), H('c3', 'Details', 'h2'), ...bodyParas(4).map((b, i) => ({ ...b, id: `s${i}` }))]);
{
	const mirror = () => page.$eval('[data-write-mirror]', (e) => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label'), hidden: e.getAttribute('aria-hidden'), tab: e.tabIndex, heads: [...e.querySelectorAll('h1, h2, h3')].map((h) => h.tagName + ':' + h.textContent), ps: e.querySelectorAll('p').length }));
	const m0 = await mirror();
	check('mirror reads page one with its heading', m0.role === 'document' && m0.label === 'Page 1' && m0.hidden === 'false' && m0.tab < 0 && m0.heads.includes('H1:Chapter one') && m0.ps > 1, JSON.stringify(m0));
	await page.evaluate(() => {
		const el = document.querySelector('.err-write');
		el.scrollTop = el.scrollHeight;
	});
	await sleep(400);
	const m1 = await mirror();
	check('mirror follows the shown page', m1.label !== 'Page 1' && m1.heads.includes('H2:Details'), JSON.stringify(m1));
	await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
	await sleep(300);
}
await meta('ArrowUp');
await page.keyboard.press('End');
await metaAlt('KeyF');
await page.keyboard.type('Contents footnote');
await page.keyboard.press('Escape');
await meta('ArrowUp');
await page.click('.sub-ed-stack [aria-label="Menu"]');
await page.waitForSelector('[data-menu="toc"]', { timeout: 5000 });
await sleep(400);
await page.click('[data-menu="toc"]');
await sleep(400);
const toc = await page.evaluate(() => {
	const layout = window.__write.layout();
	const doc = window.__write.state().doc;
	const pageOf = (block) => layout.pages.find((p) => p.lines.some((l) => l.block === block && !l.kind))?.label;
	return {
		has: doc.blocks.filter((b) => b.kind === 'toc').length,
		entries: layout.pages.flatMap((p) => p.toc.map((l) => [l.spans[0].text, l.spans.at(-1).text, pageOf(l.block)])),
	};
});
check('menu inserts contents', toc.has === 1);
check('the contents block has a flag', (await page.$$('.err-flag[data-flag-kind="toc"]')).length === 1);
check('contents list the headings with their pages', toc.entries.length === 3 && toc.entries.every(([, n, p]) => n === p) && toc.entries[0][0] === 'Chapter one', JSON.stringify(toc));
await page.focus('.err-write-input');
await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
await sleep(200);
const entryAt = await page.evaluate(() => {
	const el = document.querySelector('.err-write-page');
	const r = el.getBoundingClientRect();
	const p = window.__write.layout().pages[0];
	const z = r.width / p.width;
	const l = p.toc[1];
	return { x: r.left + (l.left + 10) * z, y: r.top + (l.top + l.height / 2) * z, block: l.block };
});
await page.mouse.click(entryAt.x, entryAt.y);
await sleep(300);
const placed = await page.evaluate(() => window.__write.state().sel.focus);
check('a plain click on an entry does not jump', placed.block !== entryAt.block, JSON.stringify([placed, entryAt]));
// past double-click window
await sleep(600);
await page.keyboard.down('Meta');
await page.mouse.click(entryAt.x, entryAt.y);
await page.keyboard.up('Meta');
await sleep(300);
const jumped = await page.evaluate(() => window.__write.state().sel.focus);
check('cmd-clicking an entry jumps to its heading', jumped.block === entryAt.block && jumped.offset === 0, JSON.stringify([jumped, entryAt]));
await sleep(600);
await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
await sleep(200);
await page.mouse.click(entryAt.x, entryAt.y);
await sleep(300);
check('the caret on the contents shows its card', !!(await page.$('[data-toc-card]')));
await page.evaluate(() => [...document.querySelectorAll('[data-toc="levels"] [role="radio"], [data-toc="levels"] button')].find((b) => b.textContent.trim() === '1')?.click());
await sleep(300);
check('levels 1 drops the h2 entry', (await page.evaluate(() => window.__write.layout().pages[0].toc.length)) === 2);
check('the card stays while the caret does', !!(await page.$('[data-toc-card]')));
await page.click('[data-toc="after"]');
await sleep(200);
check('the after switch sets the contents', await page.evaluate(() => window.__write.state().doc.blocks.find((b) => b.kind === 'toc').after === true));
await page.click('[data-toc="after"]');
await sleep(200);
await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
await sleep(300);
await page.screenshot({ path: process.env.TOC_SHOT ?? '/tmp/errata-toc.png' });
{
	const bytes = Uint8Array.from(await page.evaluate(() => window.__write.exportPdf()));
	const pdf = mupdf.Document.openDocument(bytes, 'application/pdf');
	const texts = Array.from({ length: pdf.countPages() }, (_, i) => pdf.loadPage(i).toStructuredText().asText());
	const labels = await page.evaluate(() => window.__write.layout().pages[0].toc.map((l) => [l.spans[0].text, l.spans.at(-1).text]));
	check('pdf has the footnote text', texts[0].includes('Contents footnote'), texts[0].slice(-300));
	check('pdf has the contents with page numbers', labels.every(([t, n]) => new RegExp(`${t}[ .]*\\.{3,}[ .]*${n}\\b`).test(texts[0].replace(/\s+/g, ' '))), JSON.stringify([labels, texts[0].slice(0, 300)]));
	const links = pdf.loadPage(0).getLinks().filter((l) => !l.isExternal());
	check('pdf contents entries link inside', links.length === labels.length, `${links.length}`);
	const list = await page.$$eval('[data-write-mirror] li', (els) => els.map((e) => e.textContent.trim()));
	const m = await readMirror();
	check('mirror reads contents entries and footnotes', labels.every(([t, n]) => list.some((l) => l.startsWith(t) && l.endsWith(n))) && m.some((t) => t.includes('Contents footnote')), JSON.stringify([list, m.slice(-2)]));
}
{
	const ataBytes = await page.evaluate(() => window.__write.ata());
	await openFresh([H('x', 'gone', 'body')]);
	await page.evaluate((b) => window.__write.open(b, 'notes.ata'), ataBytes);
	await sleep(400);
	const back = await page.evaluate(() => {
		const d = window.__write.state().doc;
		return { toc: d.blocks.filter((b) => b.kind === 'toc').map((b) => b.levels), notes: Object.values(d.notes ?? {}).map((ps) => ps[0].runs[0].text) };
	});
	check('.ata round trip keeps notes and contents', JSON.stringify(back) === '{"toc":[1],"notes":["Contents footnote"]}', JSON.stringify(back));
}
{
	await openFresh(bodyParas(2600));
	const sized = () => page.$$eval('.err-write-page canvas', (cs) => cs.filter((c) => c.width > 0 && c.height > 0).length);
	const n = await pages();
	check('200 pages mount at most 6 canvases', n >= 200 && (await sized()) <= 6, `${n} pages, ${await sized()} canvases`);
	await page.evaluate(() => {
		const el = document.querySelector('.err-write');
		el.scrollTop = el.scrollHeight;
	});
	await sleep(500);
	const last = await page.evaluate(() => {
		const c = document.querySelector('.err-write-page:last-of-type canvas');
		if (!c?.width) return 0;
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		let ink = 0;
		for (let i = 0; i < d.length; i += 4) if (d[i] < 128) ink++;
		return ink;
	});
	check('scrolling to the end paints the last page', last > 100 && (await sized()) <= 6, `${last} ink, ${await sized()} canvases`);
	await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
	await sleep(300);
	check('scrolling back releases the end', (await sized()) <= 6, `${await sized()}`);
}
{
	const phone = await browser.newPage();
	phone.on('pageerror', (e) => errors.push(e.message));
	await phone.evaluateOnNewDocument(() => {
		window.GestureEvent ??= class extends UIEvent {};
	});
	await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	await phone.goto(`${BASE}/errata`, { waitUntil: 'networkidle2' });
	await phone.waitForFunction(() => window.__write, { timeout: 20000 });
	await phone.click('[data-new-document]');
	await phone.waitForSelector('.err-write-page canvas', { timeout: 15000 });
	await phone.focus('.err-write-input');
	await phone.keyboard.type('Phone words');
	const para0 = () => phone.evaluate(() => window.__write.state().doc.blocks[0].runs);
	check('phone: typing lands', (await para0()).map((r) => r.text).join('') === 'Phone words');
	const top = await phone.$$eval('.sub-ed-phone-stack [aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')));
	check('phone: top row has menu, tools, undo, redo, setup, pages, export', JSON.stringify(top) === '["Menu","Edit","Undo","Redo","Document setup","Pages","Export"]', JSON.stringify(top));
	const fitted = await phone.evaluate(() => {
		const p = document.querySelector('.err-write-page').getBoundingClientRect();
		return p.left >= 0 && p.right <= window.innerWidth;
	});
	check('phone: page fits the width', fitted);
	const touch = await phone.createCDPSession();
	const fingers = (type, d) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195 - d, y: 300, id: 0 }, { x: 195 + d, y: 300, id: 1 }] });
	const z0 = await phone.evaluate(() => document.querySelector('.err-write-page').getBoundingClientRect().width);
	const gesture = await phone.$eval('.err-write', (el) => {
		const e = new Event('gesturestart', { cancelable: true });
		el.dispatchEvent(e);
		return e.defaultPrevented;
	});
	check('phone: safari page zoom is blocked', gesture);
	const under = () =>
		phone.evaluate(() => {
			const el = document.elementFromPoint(195, 300).closest('[data-page]');
			const r = el.getBoundingClientRect();
			return { page: el.dataset.page, x: (195 - r.left) / r.width, y: (300 - r.top) / r.height };
		});
	const u0 = await under();
	const cw0 = await phone.$eval('.err-write-page canvas', (c) => c.width);
	await fingers('touchStart', 40);
	await fingers('touchMove', 60);
	await fingers('touchMove', 80);
	await sleep(100);
	const mid = await phone.evaluate(() => ({ t: document.querySelector('.err-write-pages').style.transform, cw: document.querySelector('.err-write-page canvas').width }));
	check('phone: pinch scales without repainting', mid.t.startsWith('scale(') && mid.cw === cw0, JSON.stringify({ cw0, ...mid }));
	await fingers('touchEnd');
	await sleep(300);
	const u1 = await under();
	const pw = await phone.$eval('.err-write-page', (e) => e.getBoundingClientRect().width);
	check('phone: pinch keeps the point between the fingers', u1.page === u0.page && Math.abs(u1.x - u0.x) * pw < 3 && Math.abs(u1.y - u0.y) * pw < 3, JSON.stringify({ u0, u1 }));
	const pinched = await phone.evaluate(() => {
		const el = document.querySelector('.err-write-page');
		const c = el.querySelector('canvas');
		return { w: el.getBoundingClientRect().width, cw: c.width, want: Math.round(el.getBoundingClientRect().width * devicePixelRatio) };
	});
	check('phone: pinch zooms and repaints at scale', pinched.w > z0 * 1.8 && Math.abs(pinched.cw - pinched.want) <= 2, JSON.stringify({ z0, ...pinched }));
	await phone.focus('.err-write-input');
	await phone.keyboard.press('End');
	await sleep(200);
	const ime = await phone.evaluate(() => {
		const i = document.querySelector('.err-write-input').getBoundingClientRect();
		const c = document.querySelector('.err-write-caret').getBoundingClientRect();
		return { il: i.left, ir: i.right, it: i.top, ib: i.bottom, cx: c.left, cy: (c.top + c.bottom) / 2 };
	});
	// ios scrolls to input
	check('phone: the input covers the caret paragraph when zoomed', ime.il - 2 <= ime.cx && ime.cx <= ime.ir + 2 && ime.it - 2 <= ime.cy && ime.cy <= ime.ib + 2, JSON.stringify(ime));
	await phone.click('[aria-label="Menu"]');
	await sleep(300);
	await phone.evaluate(() => [...document.querySelectorAll('.err-menu *')].find((e) => e.textContent.trim() === 'Fit page')?.click());
	await sleep(300);
	await phone.focus('.err-write-input');
	await phone.keyboard.down('Shift');
	for (let i = 0; i < 5; i++) await phone.keyboard.press('ArrowLeft');
	await phone.keyboard.up('Shift');
	check('phone: body text has flags and no ribbon', (await phone.$$('.err-flag[data-flag]')).length > 0 && !(await phone.$('.err-write-bar')));
	await phone.click('[data-flag-current]');
	await phone.waitForSelector('[data-drawer="format"].is-open');
	await sleep(450);
	await phone.click('[data-drawer="format"] [data-toggle="bold"]');
	await sleep(200);
	check('phone: bold from the sheet', (await para0()).some((r) => r.text === 'words' && r.props.bold), JSON.stringify(await para0()));
	await phone.keyboard.press('Escape');
	await phone.click('[data-tool="pages"]');
	await sleep(300);
	check('phone: pages rail opens as a tray', !!(await phone.$('.err-rail.is-tray')));
	await phone.click('[data-tool="pages"]');
	await sleep(300);
	await phone.click('[data-flag-current]');
	await sleep(450);
	await phone.click('[data-flag-insert]');
	await phone.waitForSelector('[data-drawer="insert"].is-open');
	await sleep(450);
	const cells = async (root = '[data-drawer="insert"]', sel = ['[data-edge-insert="page-break"]', '[data-tool="edge-table"]', '[data-edge-insert="image"]']) => phone.evaluate((root, sel) => sel.map((s) => !!document.querySelector(`${root} ${s}`)).join(), root, sel);
	check('phone: the insert sheet offers breaks, table and image', (await cells()) === 'true,true,true', await cells());
	const sheet = await phone.$eval('[data-drawer="insert"]', (e) => {
		const r = e.getBoundingClientRect();
		return { left: r.left, right: r.right, bottom: r.bottom, w: window.innerWidth, h: window.innerHeight };
	});
	check('phone: the sheet fits the width at the bottom', sheet.left >= 0 && sheet.right <= sheet.w && sheet.bottom <= sheet.h && sheet.bottom > sheet.h - 60, JSON.stringify(sheet));
	const kbBottom = () => phone.$eval('[data-drawer="insert"]', (e) => e.getBoundingClientRect().bottom);
	const b0 = await kbBottom();
	await phone.$eval('.err-ed', (e) => e.style.setProperty('--err-kb', '300px'));
	const b1 = await kbBottom();
	await phone.$eval('.err-ed', (e) => e.style.removeProperty('--err-kb'));
	check('phone: keyboard lifts the sheet', Math.abs(b0 - b1 - 300) < 2, JSON.stringify([b0, b1]));
	await phone.click('[data-flag-insert]');
	await sleep(450);
	await phone.focus('.err-write-input');
	await phone.keyboard.type('x');
	await sleep(200);
	check('phone: typing moves the flags aside', !!(await phone.$('.err-write.is-typing')));
	await phone.touchscreen.tap(200, 300);
	await sleep(200);
	check('phone: a tap brings the flags back', !(await phone.$('.err-write.is-typing')));
	await phone.focus('.err-write-input');
	await phone.keyboard.type('y');
	await sleep(200);
	await phone.$eval('[data-flag-insert]', (el) => {
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		el.click();
	});
	await sleep(300);
	check('phone: a tap on an aside flag only brings the flags back', !(await phone.$('.err-write.is-typing')) && !(await phone.$('[data-drawer="insert"].is-open')));
	await phone.click('[aria-label="Menu"]');
	await sleep(300);
	await phone.click('[data-menu="find"]');
	await sleep(300);
	const find = await phone.evaluate(() => {
		const el = document.querySelector('.err-mode.is-open');
		const r = el?.getBoundingClientRect();
		return r ? r.left >= 0 && r.right <= window.innerWidth : false;
	});
	check('phone: find opens within the width', find);
	const over = await phone.evaluate(() => {
		const ed = document.querySelector('.err-ed');
		const wide = [...ed.querySelectorAll('*')].filter((e) => {
			const r = e.getBoundingClientRect();
			return r.width && (r.right > window.innerWidth + 1 || r.left < -1) && !e.closest('.err-write, .err-backdrop');
		});
		return { sw: document.documentElement.scrollWidth, ew: ed.scrollWidth, cw: window.innerWidth, wide: wide.slice(0, 3).map((e) => e.className) };
	});
	check('phone: no horizontal overflow', over.sw <= over.cw && over.ew <= over.cw && over.wide.length === 0, JSON.stringify(over));
	await phone.keyboard.press('Escape');
	{
		await phone.evaluate(() => {
			const words = 'Lacrosse is played with a ball and a stick with a net at one end. ';
			window.__write.setDoc({ ...window.__write.state().doc, images: undefined, overlays: undefined, blocks: Array.from({ length: 60 }, (_, i) => ({ kind: 'para', id: `tp${i}`, style: 'body', props: {}, runs: [{ text: words.repeat(3), props: {} }], dir: 'ltr' })) });
		});
		await sleep(400);
		const sel = () => phone.evaluate(() => JSON.stringify(window.__write.state().sel));
		const scrollTop = () => phone.$eval('.err-write', (e) => e.scrollTop);
		const s0 = await sel();
		const t0 = await scrollTop();
		await touch.send('Input.synthesizeScrollGesture', { x: 195, y: 500, yDistance: -250, gestureSourceType: 'touch', speed: 600 });
		await sleep(300);
		check('touch: a scroll moves the pages', (await scrollTop()) > t0 + 100, JSON.stringify([t0, await scrollTop()]));
		check('touch: a scroll leaves the caret and selects nothing', (await sel()) === s0, await sel());
		await phone.touchscreen.tap(195, 400);
		await sleep(200);
		const s1 = await sel();
		const collapsed = (j) => { const v = JSON.parse(j); return v.anchor.block === v.focus.block && v.anchor.offset === v.focus.offset; };
		check('touch: a tap places the caret', s1 !== s0 && collapsed(s1), s1);
		check('touch: a tap focuses the input', await phone.evaluate(() => document.activeElement?.classList.contains('err-write-input')));
		const finger = (type, x, y) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0 }] });
		await finger('touchStart', 150, 420);
		await sleep(600);
		const held = await sel();
		check('touch: a hold selects the word', !collapsed(held), held);
		const t1 = await scrollTop();
		await finger('touchMove', 150, 440);
		await finger('touchMove', 240, 470);
		await sleep(100);
		const dragged = JSON.parse(await sel());
		await finger('touchEnd');
		await sleep(100);
		check('touch: a held drag extends the selection without scrolling', (await scrollTop()) === t1 && Math.abs(dragged.focus.offset - dragged.anchor.offset) > Math.abs(JSON.parse(held).focus.offset - JSON.parse(held).anchor.offset), JSON.stringify(dragged));
		// ios space bar caret
		await phone.touchscreen.tap(195, 620);
		await sleep(200);
		const at = JSON.parse(await sel()).focus;
		const slide = (o) => phone.$eval('.err-write-input', (el, o) => { el.setSelectionRange(o, o); document.dispatchEvent(new Event('selectionchange')); }, o);
		const field = () => phone.$eval('.err-write-input', (el) => ({ on: 'tracking' in el.dataset, pe: getComputedStyle(el).pointerEvents, at: el.selectionStart, len: el.value.length, lines: el.value.split('\n').length }));
		// ios first move misses
		const miss = () => phone.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.sub-ed-phone-stack')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.dispatchEvent(new Event('selectionchange')); return document.activeElement?.className; });
		await miss();
		await sleep(150);
		const missed = await field();
		check('touch: a missed space bar move keeps the caret and makes the input hit-testable', missed.on && missed.pe === 'auto' && JSON.parse(await sel()).focus.offset === at.offset && JSON.parse(await sel()).focus.block === at.block, JSON.stringify(missed));
		check('touch: the tracked input holds the page paragraphs', missed.lines > 3 && missed.at >= at.offset, JSON.stringify(missed));
		const before = await scrollTop();
		const over = await phone.evaluate(() => {
			const el = document.querySelector('.err-write-input');
			const c = document.querySelector('.err-write-caret').getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const rows = el.value.slice(0, el.selectionStart).split('\n').length - 1;
			const lh = parseFloat(el.style.lineHeight) * (r.width / el.offsetWidth);
			return { want: (c.top + c.bottom) / 2, row: r.top + (rows + 0.5) * lh, lh };
		});
		check('touch: the tracked row is at the caret line', Math.abs(over.want - over.row) < over.lh * 0.75, JSON.stringify(over));
		await slide(missed.len);
		await sleep(200);
		const last = JSON.parse(await sel()).focus;
		check('touch: the space bar moves the caret to another paragraph', last.block > at.block, JSON.stringify(last));
		check('touch: the page holds still while the space bar moves the caret', (await scrollTop()) === before, JSON.stringify([before, await scrollTop()]));
		await slide(0);
		await sleep(150);
		const prev = JSON.parse(await sel()).focus;
		check('touch: the caret crosses into a paragraph before', prev.block < at.block, JSON.stringify(prev));
		await miss();
		await sleep(100);
		check('touch: a later miss leaves the caret', JSON.stringify(JSON.parse(await sel()).focus) === JSON.stringify(prev), await sel());
		await slide(missed.at + 3);
		await sleep(150);
		const after = JSON.parse(await sel());
		check('touch: the input caret moves the document caret', after.focus.block === at.block && after.focus.offset === at.offset + 3 && after.anchor.offset === at.offset + 3, JSON.stringify({ at, after }));
		await phone.keyboard.type('Z');
		const zText = await phone.evaluate((b) => window.__write.state().doc.blocks[b].runs.map((r) => r.text).join(''), at.block);
		check('touch: typing lands at the moved caret', zText[at.offset + 3] === 'Z', zText.slice(at.offset, at.offset + 12));
		const back = await field();
		check('touch: typing gives the pages their taps back and the input its paragraph', back.pe === 'none' && !back.on && back.lines === 1, JSON.stringify(back));
		// cancelled touchend swallows click
		await phone.evaluate(() => document.querySelector('.err-write-caret').scrollIntoView({ block: 'center' }));
		await sleep(300);
		const flagAt = await phone.$eval('[data-flag-current]', (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
		const sheetOpen = async () => !!(await phone.$('[data-drawer="format"].is-open'));
		// first tap restores flags
		for (let i = 0; i < 2 && !(await sheetOpen()); i++) {
			await phone.touchscreen.tap(...flagAt);
			await sleep(500);
		}
		check('touch: a tap on the caret flag opens the sheet', await sheetOpen());
		await phone.touchscreen.tap(...flagAt);
		await sleep(500);
		check('phone: the top row has a tool menu', !!(await phone.$('.sub-ed-phone-stack [data-tool-menu]')));
		await phone.screenshot({ path: process.env.PHONE_TOUCH_SHOT ?? '/tmp/errata-write-phone-touch.png' });
	}
	await phone.evaluate(() => window.__write.setDoc({ ...window.__write.state().doc, blocks: [{ kind: 'table', id: 't', cols: [100, 100], border: { kind: 'all', width: 0.5, colour: '#000000' }, rows: [[{ paras: [{ kind: 'para', id: 'c0', style: 'body', props: {}, runs: [{ text: 'a', props: {} }], dir: 'ltr' }] }, { paras: [{ kind: 'para', id: 'c1', style: 'body', props: {}, runs: [{ text: 'b', props: {} }], dir: 'ltr' }] }]] }, { kind: 'para', id: 'after', style: 'body', props: {}, runs: [{ text: '', props: {} }], dir: 'ltr' }] }));
	await sleep(300);
	await phone.focus('.err-write-input');
	await sleep(200);
	await phone.click('[data-flag-insert]');
	await sleep(450);
	check('phone: in a table the insert sheet still offers the table', (await cells()) === 'true,true,true', await cells());
	const pdfBytes = await phone.evaluate(() => window.__write.exportPdf());
	await phone.evaluate((b) => window.__errata.open(new Uint8Array(b).buffer, 'phone.pdf', 'application/pdf'), pdfBytes);
	await phone.waitForSelector('.sub-ed-row', { timeout: 10000 });
	await sleep(300);
	const rowBottom = () => phone.$eval('.sub-ed-row', (e) => e.getBoundingClientRect().bottom);
	const r0 = await rowBottom();
	await phone.$eval('.err-ed', (e) => e.style.setProperty('--err-kb', '300px'));
	const r1 = await rowBottom();
	await phone.$eval('.err-ed', (e) => e.style.removeProperty('--err-kb'));
	check('phone: keyboard offset skips the pdf row', r0 === r1, JSON.stringify([r0, r1]));
	await phone.screenshot({ path: process.env.PHONE_SHOT ?? '/tmp/errata-write-phone.png' });
	await phone.close();
}
{
	// drawer stays open
	const menu = async (selector) => {
		if (!(await page.$('.err-menu'))) {
			await page.click('.sub-ed-stack [aria-label="Menu"]');
			await sleep(450);
		}
		await page.waitForSelector(selector, { timeout: 5000 });
		await page.click(selector);
		await sleep(300);
	};
	const margins = (n) => menu(`[data-menu="margins"] [role="radio"]:nth-child(${n})`);
	check('rulers off by default', !(await page.$('.err-write-ruler')));
	await menu('[data-menu="rulers"]');
	check('rulers switch keeps the menu open', !!(await page.$('.err-menu')));
	const rul = await page.evaluate(() => {
		const [x, y] = ['x', 'y'].map((a) => document.querySelector(`.err-write-ruler[data-axis="${a}"]`));
		const p = y?.closest('.err-write-page');
		const c = window.__write.layout().pages[Number(p?.dataset.page)]?.content;
		const first = [...(x?.querySelectorAll('.err-write-ruler-paper') ?? [])][0];
		return {
			x: !!x, y: !!y,
			width: x && Math.abs(x.getBoundingClientRect().width - p.getBoundingClientRect().width) < 1,
			paper: first && c && Math.abs(first.getBoundingClientRect().left - p.getBoundingClientRect().left - c.left * (p.getBoundingClientRect().width / window.__write.layout().pages[0].width)) < 1,
			labels: x?.querySelectorAll('text').length ?? 0,
		};
	});
	check('rulers: one across, one down the shown page', rul.x && rul.y && rul.width, JSON.stringify(rul));
	check('rulers: paper starts at the left margin', rul.paper && rul.labels > 10, JSON.stringify(rul));
	await page.evaluate(() => {
		const d = window.__write.state().doc;
		window.__write.setDoc({ ...d, setup: { width: 595.28, height: 841.89, margins: { top: 72, right: 72, bottom: 72, left: 72 } }, overlays: undefined, notes: undefined, blocks: [{ kind: 'para', id: 'r0', style: 'body', props: {}, runs: [{ text: 'Ruler text that wraps onto a second line once the paragraph runs long enough to need one.', props: {} }], dir: 'ltr' }] });
	});
	await page.focus('.err-write-input');
	await sleep(300);
	const handleAt = (axis, kind) => page.$eval(`.err-write-ruler[data-axis="${axis}"] [data-kind="${kind}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
	const dragBy = async (axis, kind, dx, dy, mid) => {
		const h = await handleAt(axis, kind);
		await page.mouse.move(h.x, h.y);
		await page.mouse.down();
		await page.mouse.move(h.x + dx / 2, h.y + dy / 2, { steps: 3 });
		await page.mouse.move(h.x + dx, h.y + dy, { steps: 3 });
		const tip = await page.$eval('.err-write-ruler-tip', (e) => e.textContent.trim()).catch(() => null);
		if (mid) await mid();
		await page.mouse.up();
		return tip;
	};
	const zoom = await page.evaluate(() => { const p = document.querySelector('.err-write-page'); return p.getBoundingClientRect().width / window.__write.layout().pages[0].width; });
	const mm = 72 / 25.4;
	const doc = () => page.evaluate(() => { const d = window.__write.state().doc; return { m: d.setup.margins, p: d.blocks[0].props }; });
	let tip = await dragBy('x', 'left', 10 * mm * zoom, 0);
	let d = await doc();
	check('ruler: left margin drags to 35 mm', Math.abs(d.m.left - 35 * mm) < 0.01, JSON.stringify(d.m));
	check('ruler: tooltip shows the margin', tip === 'Left margin 35 mm', tip);
	check('ruler: tooltip leaves on release', !(await page.$('.err-write-ruler-tip')));
	check('ruler: caret stays in the editor', await page.evaluate(() => document.activeElement?.classList.contains('err-write-input')));
	await page.keyboard.down('Meta');
	await page.keyboard.press('KeyZ');
	await page.keyboard.up('Meta');
	await sleep(200);
	d = await doc();
	check('ruler: one undo restores the margin', Math.abs(d.m.left - 72) < 0.01, JSON.stringify(d.m));
	await dragBy('y', 'top', 0, -5 * mm * zoom);
	d = await doc();
	check('ruler: top margin drags on the side ruler', Math.abs(d.m.top - 20 * mm) < 0.01, JSON.stringify(d.m));
	tip = await dragBy('x', 'first', 10 * mm * zoom, 0);
	d = await doc();
	check('ruler: first-line marker indents the first line', Math.abs(d.p.firstLine - 10 * mm) < 0.01 && !d.p.indent, `${tip} ${JSON.stringify(d.p)}`);
	await dragBy('x', 'hang', 5 * mm * zoom, 0);
	d = await doc();
	check('ruler: hanging marker keeps the first line', Math.abs(d.p.indent - 5 * mm) < 0.01 && Math.abs(d.p.indent + d.p.firstLine - 10 * mm) < 0.01, JSON.stringify(d.p));
	await dragBy('x', 'indent', 5 * mm * zoom, 0);
	d = await doc();
	check('ruler: left indent box moves both', Math.abs(d.p.indent - 10 * mm) < 0.01 && Math.abs(d.p.firstLine - 5 * mm) < 0.01, JSON.stringify(d.p));
	const marker = await page.evaluate(() => { const r = document.querySelector('.err-write-ruler[data-axis="x"] [data-kind="indent"]').getBoundingClientRect(); return r.x + r.width / 2; });
	const line = await page.evaluate(() => { const p = document.querySelector('.err-write-page').getBoundingClientRect(); const pg = window.__write.layout().pages[0]; const l = pg.lines[1]; return p.x + l.left * (p.width / pg.width); });
	check('ruler: indent marker sits over the second line', Math.abs(marker - line) < 1.5, `${marker} ${line}`);
	const guide = () => page.evaluate(() => { const g = document.querySelector('.err-write-guide'); return g ? `${g.dataset.guide} ${g.children.length}` : 'off'; });
	check('margins: corner marks by default', (await guide()) === 'corners 4', await guide());
	await margins(1);
	check('margins: off', (await guide()) === 'off', await guide());
	await margins(2);
	check('margins: border', (await guide()) === 'border 0', await guide());
	await margins(3);
	check('margins: corner marks again', (await guide()) === 'corners 4', await guide());
	await menu('[data-menu="rulers"]');
	check('rulers hide', !(await page.$('.err-write-ruler')));
	await page.keyboard.press('Escape');
	await sleep(200);
	check('escape closes the menu', !(await page.$('.err-menu')));
}
{
	await page.evaluate(() => {
		const d = window.__write.state().doc;
		const para = (id, text) => ({ kind: 'para', id, style: 'body', props: {}, runs: [{ text, props: {} }], dir: 'ltr' });
		window.__write.setDoc({ ...d, setup: { width: 595.28, height: 841.89, margins: { top: 72, right: 72, bottom: 72, left: 72 }, header: [para('h0', 'Report')] }, overlays: undefined, notes: undefined, blocks: [para('n0', 'Numbers')] });
	});
	await page.focus('.err-write-input');
	const insert = async (sel) => {
		await insertDrawer();
		await page.click(sel);
		await sleep(300);
	};
	const stories = () => page.evaluate(() => {
		const s = window.__write.state().doc.setup;
		const show = (ps) => ps?.map((p) => `${p.id === 'page-numbers' ? '#' : ''}${p.props.align ?? 'left'}:${p.runs.map((r) => r.props.field ? `{${r.props.field}}` : r.text).join('')}`).join('|') ?? '';
		return { header: show(s.header), footer: show(s.footer) };
	});
	await insert('[data-edge-insert="page-numbers"]');
	check('numbers: Insert opens the page numbers panel', !!(await page.$('[data-mode="write-numbers"]')));
	const cells = await page.$$eval('[data-mode="write-numbers"] .err-anchor-cell', (cs) => cs.map((c) => `${c.dataset.anchor}@${getComputedStyle(c).gridRowStart}`));
	check('numbers: six spots, header row and footer row', cells.length === 6 && cells.filter((c) => c.endsWith('@3')).length === 3, cells.join(' '));
	await page.click('[data-mode="write-numbers"] [data-anchor="bottom-center"]');
	await sleep(200);
	let st = await stories();
	check('numbers: bottom centre fills the footer', st.footer === '#centre:{page}' && st.header === 'left:Report', JSON.stringify(st));
	const footer = await page.evaluate(() => window.__write.layout().pages[0].footer.length);
	check('numbers: the footer lays out', footer === 1, footer);
	await page.evaluate(() => [...document.querySelectorAll('[data-numbers="format"] [role="radio"]')][3].click());
	await sleep(200);
	st = await stories();
	check('numbers: page n of n format', st.footer === '#centre:Page {page} of {pages}', JSON.stringify(st));
	await page.click('[data-mode="write-numbers"] [data-anchor="top-right"]');
	await sleep(200);
	st = await stories();
	check('numbers: moving to the header keeps its text', st.header === 'left:Report|#right:Page {page} of {pages}' && st.footer === '', JSON.stringify(st));
	await page.click('.sub-ed-stack [aria-label="Undo"]');
	await sleep(200);
	st = await stories();
	check('numbers: undo steps back one change', st.footer === '#centre:Page {page} of {pages}', JSON.stringify(st));
	await page.click('[data-numbers="remove"]');
	await sleep(200);
	st = await stories();
	check('numbers: remove leaves other header text', st.header === 'left:Report' && st.footer === '', JSON.stringify(st));
	await page.evaluate(() => [...document.querySelectorAll('[data-mode="write-numbers"] button')].find((b) => b.textContent.trim() === 'Done').click());
	await sleep(300);
	await page.focus('.err-write-input');
	await page.keyboard.press('End');
	await insert('[data-edge-insert="field"]');
	await clickMenuItem('Page count');
	await sleep(300);
	const fields = await page.evaluate(() => window.__write.state().doc.blocks[0].runs.filter((r) => r.props.field).map((r) => r.props.field));
	check('numbers: Insert adds a page count field at the caret', fields.join() === 'pages', fields.join());
}
{
	await page.evaluate(() => {
		const d = window.__write.state().doc;
		window.__write.setDoc({ ...d, name: 'Untitled', setup: { width: 595.28, height: 841.89, margins: { top: 72, right: 72, bottom: 72, left: 72 } }, overlays: undefined, notes: undefined, blocks: [{ kind: 'para', id: 'u0', style: 'body', props: {}, runs: [{ text: '', props: {} }], dir: 'ltr' }] });
	});
	await page.focus('.err-write-input');
	let worst = -Infinity;
	for (let i = 0; i < 45; i++) {
		await page.keyboard.type(`Line ${i}`);
		await page.keyboard.press('Enter');
		worst = Math.max(worst, await page.evaluate(() => document.querySelector('.err-write-caret').getBoundingClientRect().bottom - document.querySelector('.err-write').getBoundingClientRect().bottom));
	}
	check('typing keeps the caret in view', worst < 0, worst);
	const before = await page.evaluate(() => window.__write.state().doc.blocks.length);
	await page.click('[data-title-name]', { count: 3 });
	await page.keyboard.type('Mind the Gap');
	await page.keyboard.press('Enter');
	await sleep(200);
	const named = await page.evaluate(() => ({ name: window.__write.state().doc.name, focus: document.activeElement?.classList.contains('err-write-input') }));
	check('the title pill renames the document', named.name === 'Mind the Gap' && named.focus, JSON.stringify(named));
	check('typing the name leaves the text alone', (await page.evaluate(() => window.__write.state().doc.blocks.length)) === before);
	const bytes = Uint8Array.from(await page.evaluate(() => window.__write.exportPdf()));
	const title = mupdf.Document.openDocument(bytes, 'application/pdf').getMetaData(mupdf.Document.META_INFO_TITLE);
	check('the pdf title is the document name', title === 'Mind the Gap', title);
	await page.click('[data-title-name]', { count: 3 });
	await page.keyboard.type('Nope');
	await page.keyboard.press('Escape');
	await sleep(200);
	check('escape keeps the old name', (await page.evaluate(() => window.__write.state().doc.name)) === 'Mind the Gap');
	await page.click('[data-title-name]', { count: 3 });
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Enter');
	await sleep(200);
	check('an empty name falls back to Untitled', (await page.evaluate(() => window.__write.state().doc.name)) === 'Untitled');
}
{
	await page.evaluate(() => {
		const d = window.__write.state().doc;
		const P = (id, t) => ({ kind: 'para', id, style: 'body', props: {}, runs: [{ text: t, props: {} }], dir: 'ltr' });
		window.__write.setDoc({ ...d, setup: { width: 595.28, height: 841.89, margins: { top: 72, right: 72, bottom: 72, left: 72 }, footer: [{ ...P('page-numbers', ''), props: { align: 'centre' }, runs: [{ text: '￼', props: { field: 'page' } }] }] }, overlays: undefined, notes: undefined, blocks: [P('c0', 'Body text')] });
	});
	await page.focus('.err-write-input');
	await insertDrawer();
	await page.click('[data-edge-insert="cover"]');
	await sleep(300);
	await page.keyboard.type('Mind the Gap');
	await sleep(300);
	const cover = await page.evaluate(() => {
		const l = window.__write.layout();
		const p0 = l.pages[0];
		const t = p0.lines.find((x) => !x.kind);
		const mid = p0.content.top + p0.content.height / 2;
		return { pages: l.pages.length, centre: t && Math.abs(t.top + t.height / 2 - mid), footer0: p0.footer.flatMap((x) => x.spans).map((s) => s.text).join(''), footer1: l.pages[1]?.footer.flatMap((x) => x.spans).map((s) => s.text).join(''), first: window.__write.state().doc.blocks[0].runs.map((r) => r.text).join(''), body: l.pages[1]?.lines[0]?.top - l.pages[1]?.content.top };
	});
	check('cover page: the title sits centred on its own page', cover.pages === 2 && cover.first === 'Mind the Gap' && cover.centre < 1, JSON.stringify(cover));
	check('cover page: no footer on the cover, numbers after it', cover.footer0 === '' && cover.footer1 !== '', JSON.stringify(cover));
	check('cover page: the body starts at the top of page two', cover.body < 1, JSON.stringify(cover));
	await insertDrawer();
	check('cover page: offered once', await page.$eval('[data-edge-insert="cover"]', (b) => b.disabled || b.getAttribute('aria-disabled') === 'true'));
	await page.keyboard.press('Escape');
}
{
	await page.evaluate(() => {
		const d = window.__write.state().doc;
		window.__write.setDoc({ ...d, overlays: undefined, notes: undefined, blocks: [{ kind: 'para', id: 's0', style: 'body', props: {}, runs: [{ text: 'The London Underground is the oldest underground railway.', props: {} }], dir: 'ltr' }] });
	});
	await page.focus('.err-write-input');
	await page.evaluate(() => document.querySelector('.err-write').scrollTo(0, 0));
	await sleep(300);
	const r = await page.evaluate(() => { const el = document.querySelector('.err-write-page'); const b = el.getBoundingClientRect(); const p = window.__write.layout().pages[0]; const z = b.width / p.width; const l = p.lines[0]; return { y: b.top + (l.top + l.height / 2) * z, x0: b.left + (l.left + 60) * z, x1: b.left + (l.left + 200) * z }; });
	await page.mouse.move(r.x0, r.y);
	await page.mouse.down();
	await page.mouse.move(r.x1, r.y, { steps: 5 });
	check('selection bar: hidden while dragging', !(await page.$('[data-selection-bar]')));
	await page.mouse.up();
	await sleep(300);
	check('selection bar: shows over the selection', !!(await page.$('[data-selection-bar]')));
	await page.click('[data-selection-bar] [data-toggle="bold"]');
	await sleep(300);
	const runs = await page.evaluate(() => window.__write.state().doc.blocks[0].runs.filter((x) => x.props.bold).length);
	check('selection bar: bold applies to the selection', runs === 1, runs);
	check('selection bar: focus returns to the text', await page.evaluate(() => document.activeElement?.classList.contains('err-write-input')));
	await page.keyboard.press('ArrowRight');
	await sleep(200);
	check('selection bar: leaves with the selection', !(await page.$('[data-selection-bar]')));
}
{
	const toggle = async (key) => {
		if (!(await page.$('.err-menu'))) {
			await page.click('.sub-ed-stack [aria-label="Menu"]');
			await sleep(450);
		}
		await page.waitForSelector(`[data-menu="${key}"]`, { timeout: 5000 });
		await page.click(`[data-menu="${key}"]`);
		await sleep(200);
		await page.keyboard.press('Escape');
		await sleep(300);
	};
	await page.evaluate(() => {
		const d = window.__write.state().doc;
		window.__write.setDoc({ ...d, overlays: undefined, notes: undefined, blocks: [{ kind: 'para', id: 't0', style: 'body', props: {}, runs: [{ text: '', props: {} }], dir: 'ltr' }] });
	});
	await toggle('typewriter');
	await page.focus('.err-write-input');
	for (let i = 0; i < 30; i++) {
		await page.keyboard.type(`Line ${i}`);
		await page.keyboard.press('Enter');
	}
	await sleep(300);
	const mid = await page.evaluate(() => {
		const c = document.querySelector('.err-write-caret').getBoundingClientRect();
		const w = document.querySelector('.err-write').getBoundingClientRect();
		return Math.abs(c.top + c.height / 2 - (w.top + w.height / 2));
	});
	check('typewriter: the caret line stays in the middle', mid < 20, mid);
	await toggle('typewriter');
	await toggle('focus');
	const veils = await page.evaluate(() => [...document.querySelectorAll('.err-write-page')].map((p) => p.querySelectorAll('.err-write-veil').length));
	check('focus: the caret paragraph is clear, the rest veiled', veils[0] === 2, JSON.stringify(veils));
	await toggle('focus');
	check('focus: off removes the veils', !(await page.$('.err-write-veil')));
}
{
	await page.evaluate(() => {
		const d = window.__write.state().doc;
		window.__write.setDoc({ ...d, setup: { width: 595.28, height: 841.89, margins: { top: 72, right: 72, bottom: 72, left: 72 } }, overlays: undefined, notes: undefined, blocks: [{ kind: 'para', id: 'r0', style: 'body', props: {}, runs: [{ text: 'Ribbon', props: {} }], dir: 'ltr' }] });
	});
	await page.focus('.err-write-input');
	await page.click('[data-tab="margins"]');
	await sleep(700);
	check('edge: a tab brings its pane in front of the page', await page.$eval('.err-tabpane', (e) => e.classList.contains('is-open') && getComputedStyle(e).zIndex === '4' && !e.inert));
	await page.evaluate(() => [...document.querySelectorAll('.err-tabpane [role="radio"]')].find((e) => e.textContent.trim() === 'Narrow')?.click());
	await sleep(200);
	const m = await page.evaluate(() => window.__write.state().doc.setup.margins.left);
	check('edge: margins preset', Math.abs(m - 36) < 0.1, m);
	check('edge: margins pane shows each side in mm', (await page.$$eval('.err-tabpane input:not([role="switch"])', (els) => els.map((e) => e.value))).join() === '12.7,12.7,12.7,12.7');
	await page.evaluate(() => [...document.querySelectorAll('[data-pane="guide"] [role="radio"]')].find((e) => e.textContent.trim() === 'Box')?.click());
	await sleep(200);
	check('edge: margins pane sets the guide', !!(await page.$('.err-write-guide[data-guide="border"]')));
	await page.evaluate(() => [...document.querySelectorAll('[data-pane="guide"] [role="radio"]')].find((e) => e.textContent.trim() === 'Corners')?.click());
	const ruled = (await page.$$('.err-write-ruler')).length;
	await page.evaluate(() => document.querySelector('[data-pane="rulers"]').click());
	await sleep(300);
	check('edge: margins pane switches the rulers', (await page.$$('.err-write-ruler')).length === (ruled ? 0 : 2), ruled);
	check('edge: the pane stays open over the rulers', await page.$eval('.err-tabpane', (e) => e.classList.contains('is-open')));
	await page.evaluate(() => document.querySelector('[data-pane="rulers"]').click());
	await sleep(300);
	await page.click('[data-tab="paper"]');
	await sleep(200);
	await page.evaluate(() => [...document.querySelectorAll('.err-tabpane [role="radio"]')].find((e) => e.textContent.trim() === 'Landscape')?.click());
	await sleep(200);
	check('edge: paper pane turns the page', await page.evaluate(() => { const s = window.__write.state().doc.setup; return s.width > s.height; }));
	await page.evaluate(() => [...document.querySelectorAll('.err-tabpane [role="radio"]')].find((e) => e.textContent.trim() === 'Portrait')?.click());
	await page.keyboard.press('Escape');
	await sleep(600);
	check('edge: the pane returns behind the page', await page.$eval('.err-tabpane', (e) => !e.classList.contains('is-open') && e.inert && getComputedStyle(e).visibility === 'hidden'));
	check('edge: a pane choice keeps the caret', await caretShown());
	await drawer();
	await page.click('[data-align="centre"]');
	await sleep(200);
	check('edge: paragraph align', (await page.evaluate(() => window.__write.state().doc.blocks[0].props.align)) === 'centre');
	await page.click('[data-format="bullets"]');
	await sleep(200);
	check('edge: bullets', (await page.evaluate(() => window.__write.state().doc.blocks[0].props.list?.kind)) === 'bullet');
	check('edge: a flag per paragraph start', (await page.$$('.err-flag[data-flag]')).length === 1);
	await page.click('[data-flag-insert]');
	await sleep(450);
	check('edge: the plus flag opens the insert drawer', !!(await page.$('[data-drawer="insert"].is-open')));
	await page.click('[data-edge-insert="page-break"]');
	await sleep(300);
	check('edge: insert drawer adds a page break', (await pages()) === 2, await pages());
	check('edge: the insert drawer shuts after an insert', !(await page.$('[data-drawer="insert"].is-open')));
}
check('rail status shown', !!(await page.$('[data-write-status]')));
check('counts shown', (await page.$$('[data-write-count] dd')).length === 6);
await boxCard('Page size');
check('toolbox opens the paper tab', !!(await page.$('.err-tabpane.is-open')));
await page.keyboard.press('Escape');
await boxCard('Stamp');
check('toolbox stamp starts markup in place', !!(await page.$('.err-write.is-marking')) && !!(await page.$('[data-mode="stamp"]')));
await page.keyboard.press('Escape');
await sleep(200);
await boxCard('Impose');
check('a pdf tool asks first', !!(await page.evaluate(() => window.__write.state())) && !!(await page.$('.err-mode.is-open[data-mode="as-pdf"]')));
for (const b of await page.$$('.err-mode[data-mode="as-pdf"] button')) if ((await b.evaluate((e) => e.textContent.trim())) === 'Continue') await b.click();
await page.waitForFunction(() => !window.__write.state() && window.__errata.doc(), { timeout: 15000 }).catch(() => {});
await sleep(500);
check('continue as pdf opens the export in pdf mode', (await page.evaluate(() => !window.__write.state() && window.__errata.doc()?.pages.length)) === 2);
{
	const lib = await browser.newPage();
	lib.on('pageerror', (e) => errors.push(e.message));
	await lib.setViewport({ width: 1400, height: 900 });
	await lib.goto(`${BASE}/errata`, { waitUntil: 'networkidle2' });
	await lib.waitForFunction(() => window.__write, { timeout: 20000 });
	await lib.click('[data-open-library]');
	await lib.waitForSelector('[data-library]');
	// drawer rise animation
	await sleep(400);
	check('library: storing asks first', !!(await lib.$('[data-library-persist]')) && (await lib.$$('[data-library-doc]')).length === 0);
	await lib.click('[data-library-persist]');
	await sleep(300);
	check('library: opting in removes the switch', !(await lib.$('[data-library-persist]')));
	await lib.click('[data-library-new]');
	await lib.waitForSelector('.err-write-page canvas', { timeout: 15000 });
	check('library: new closes the drawer', !(await lib.$('[data-library]')));
	await lib.keyboard.type('Kept words');
	await sleep(1300);
	await lib.reload({ waitUntil: 'networkidle2' });
	await lib.waitForFunction(() => window.__write, { timeout: 20000 });
	await lib.click('[data-open-library]');
	await lib.waitForSelector('[data-library-doc]', { timeout: 5000 }).catch(() => {});
	check('library: an edited document is stored', (await lib.$$('[data-library-doc]')).length === 1);
	await lib.click('[data-library-doc]');
	await lib.waitForFunction(() => window.__write.state(), { timeout: 15000 }).catch(() => {});
	const kept = await lib.evaluate(() => window.__write.state()?.doc.blocks[0].runs.map((r) => r.text).join(''));
	check('library: a stored document reopens', kept === 'Kept words', kept);
	await lib.waitForFunction(() => window.__write.layout() !== null);
	const zoomOf = async () => {
		await lib.click('.sub-ed-title-zoom');
		await sleep(200);
		return lib.$eval('.err-write-page', (e) => Math.round(e.getBoundingClientRect().width));
	};
	await zoomOf();
	await lib.setViewport({ width: 1200, height: 700 });
	await sleep(300);
	const wide = await zoomOf();
	const whole = await zoomOf();
	check('fit: one press leaves the whole page after a resize', wide > whole, JSON.stringify([wide, whole]));
	await zoomOf();
	await lib.click('.sub-ed-column [aria-label="Menu"]');
	await sleep(400);
	await lib.click('[data-menu="library"]');
	await lib.waitForSelector('[data-library-doc].is-current img', { timeout: 5000 }).catch(() => {});
	check('library: the menu opens it and the open document has a picture', !!(await lib.$('[data-library-doc].is-current img')));
	await lib.screenshot({ path: '/tmp/errata-library.png' });
	await lib.setViewport({ width: 390, height: 844 });
	await sleep(500);
	await lib.screenshot({ path: '/tmp/errata-library-phone.png' });
	await lib.keyboard.press('Escape');
	await sleep(200);
	check('library: escape closes it', !(await lib.$('[data-library]')));
	await lib.close();
}
check('desktop has no format bar', !(await page.$('.err-write-bar')));
check('no page errors', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: process.env.SHOT ?? '/tmp/errata-write.png' });
await finish(browser);
