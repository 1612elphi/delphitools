import { launch, visit, check, finish, sleep, captureObjectUrl } from './harness.mjs';

const { browser, page } = await launch();

const PAGE = [
	[40, 20],
	[170, 30],
	[160, 105],
	[30, 95],
];

async function dropFixture(selector) {
	await page.evaluate(
		async ({ sel, corners }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 200;
			canvas.height = 120;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#223';
			ctx.fillRect(0, 0, 200, 120);
			ctx.fillStyle = '#fff';
			ctx.beginPath();
			corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
			ctx.closePath();
			ctx.fill();
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const transfer = new DataTransfer();
			transfer.items.add(new File([blob], 'page.png', { type: 'image/png' }));
			document.querySelector(sel).dispatchEvent(
				new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
			);
		},
		{ sel: selector, corners: PAGE },
	);
}

const outputText = () =>
	page.$eval('.dt-dsk-cell-value', (el) => el.textContent.replace(/\s+/g, ' ').trim());

const handleRects = () =>
	page.$$eval('.dt-dsk-handle', (els) =>
		els.map((el) => {
			const r = el.getBoundingClientRect();
			return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		}),
	);

const stageRect = () =>
	page.$eval('.dt-dsk-stage', (el) => {
		const r = el.getBoundingClientRect();
		return { left: r.left, top: r.top, width: r.width, height: r.height };
	});

await visit(page, '/tools/image-deskewer');
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

check('drop zone renders', await page.$('.dt-dsk-drop'));

const dragEvent = (kind, files) =>
	page.evaluate(
		({ kind, files }) => {
			const transfer = new DataTransfer();
			const send = () =>
				document
					.querySelector('.dt-dsk-frame')
					.dispatchEvent(new DragEvent(kind, { dataTransfer: transfer, bubbles: true }));
			if (!files) return void send();
			const canvas = document.createElement('canvas');
			canvas.toBlob((blob) => {
				transfer.items.add(new File([blob], 'x.png', { type: 'image/png' }));
				send();
			}, 'image/png');
		},
		{ kind, files },
	);
const frameOver = () =>
	page.$eval('.dt-dsk-frame', (el) => el.classList.contains('is-dragging'));
await dragEvent('dragover', true);
await sleep(120);
check('a file drag highlights the frame', await frameOver());
await dragEvent('dragleave', true);
await sleep(120);
check('dragleave clears the highlight', !(await frameOver()));
await dragEvent('dragover', false);
await sleep(120);
check('a text drag does not highlight the frame', !(await frameOver()));

await dropFixture('.dt-dsk-frame');
await page.waitForSelector('.dt-dsk-handle', { timeout: 10000 });
await sleep(200);

check('four handles', (await page.$$('.dt-dsk-handle')).length === 4);
check(
	'source dims in the bar',
	(await page.$eval('.dt-dsk-size', (el) => el.textContent.replace(/\s+/g, ' ').trim())) ===
		'200 × 120',
);
check(
	'aspect control is labelled output aspect ratio',
	(await page.$eval('.dt-dsk-cell > span:first-child', (el) =>
		el.textContent.replace(/\s+/g, ' ').trim(),
	)) === 'Output aspect ratio',
);
const initial = await outputText();
check('output size starts from the inset quad', initial === '152 × 91 px', initial);

const resultDims = () =>
	page.$eval('.dt-dsk-result', (el) => ({ w: el.width, h: el.height }));
let dims = await resultDims();
check('result canvas drawn at the output size', dims.w === 152 && dims.h === 91, JSON.stringify(dims));

const stage = await stageRect();
const scale = stage.width / 200;
for (let i = 0; i < 4; i++) {
	const handles = await handleRects();
	const from = handles[i];
	const to = {
		x: stage.left + PAGE[i][0] * scale,
		y: stage.top + PAGE[i][1] * scale,
	};
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
	await page.mouse.move(to.x, to.y, { steps: 4 });
	await page.mouse.up();
	await sleep(80);
}
const dragged = await outputText();
check('dragging corners changes the output size', dragged !== initial, dragged);
const [w, h] = dragged.match(/\d+/g).map(Number);
check('output measures the page quad', w >= 125 && w <= 135 && h >= 70 && h <= 80, dragged);

const quadPoints = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
check('overlay polygon follows the corners', /^\d+(\.\d+)?,\d+/.test(quadPoints), quadPoints);

await sleep(200);
const white = await page.$eval('.dt-dsk-result', (el) => {
	const ctx = el.getContext('2d');
	const { data } = ctx.getImageData(0, 0, el.width, el.height);
	let bright = 0;
	for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 2] > 200) bright++;
	return bright / (data.length / 4);
});
check('corrected image is mostly the white page', white > 0.9, white.toFixed(3));

await page.focus('.dt-dsk-handle:nth-of-type(1)');
const before = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
await sleep(100);
const after = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
const dx = Number(after.split(' ')[0].split(',')[0]) - Number(before.split(' ')[0].split(',')[0]);
check('shift+arrow nudges the corner by ten pixels', dx === 10, String(dx));

const first = (await handleRects())[0];
await page.mouse.move(first.x, first.y);
await page.mouse.down();
await page.mouse.up();
await sleep(80);
const xOf = (s) => Number(s.split(' ')[0].split(',')[0]);
const beforeLeft = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
await page.keyboard.press('ArrowLeft');
await sleep(80);
const afterLeft = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
check('click-then-arrow nudges, no Tab focus needed', xOf(afterLeft) === xOf(beforeLeft) - 1, `${xOf(beforeLeft)} -> ${xOf(afterLeft)}`);

const beforeRight = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
await page.mouse.move(first.x, first.y);
await page.mouse.down({ button: 'right' });
await page.mouse.move(first.x + 40, first.y + 40, { steps: 3 });
await page.mouse.up({ button: 'right' });
await sleep(100);
check('right-button drag moves nothing',
	(await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'))) === beforeRight);

const again = (await handleRects())[0];
await page.mouse.move(again.x, again.y);
await page.mouse.down();
await page.mouse.move(again.x + 40, again.y + 25);
await sleep(80);
const jumped = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
await page.mouse.move(again.x + 52, again.y + 20);
await sleep(80);
const followed = await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'));
check('fast drag keeps tracking', followed !== jumped, `${jumped} -> ${followed}`);
await page.mouse.up();
await sleep(80);
await page.mouse.move(again.x - 100, again.y - 50);
await sleep(80);
check('release ends the drag wherever it lands',
	(await page.$eval('.dt-dsk-quad', (el) => el.getAttribute('points'))) === followed);
check('no handle stays active', !(await page.$('.dt-dsk-handle.is-active')));

await page.evaluate(() =>
	[...document.querySelectorAll('.dt-dsk-btn')].find((b) => b.textContent.trim() === 'Reset').click(),
);
await sleep(100);

await page.evaluate(() =>
	[...document.querySelectorAll('.dt-dsk-aspect')].find((b) => b.textContent.trim() === '1:1').click(),
);
await sleep(150);
const square = await outputText();
const [sw, sh] = square.match(/\d+/g).map(Number);
check('1:1 preset squares the output on its long edge', sw === sh, square);

await page.evaluate(() =>
	[...document.querySelectorAll('.dt-dsk-aspect')].find((b) => b.textContent.trim() === 'A4').click(),
);
await sleep(150);
const a4 = await outputText();
const [aw, ah] = a4.match(/\d+/g).map(Number);
check('A4 preset keeps landscape at √2', Math.abs(aw / ah - Math.SQRT2) < 0.02, a4);

await captureObjectUrl(page);
await page.click('.dt-dsk-btn.is-primary');
await page.waitForFunction(() => window.__result, { timeout: 5000 });
const decoded = await page.evaluate(async () => {
	const bitmap = await createImageBitmap(window.__result);
	return { type: window.__result.type, w: bitmap.width, h: bitmap.height };
});
check('download is a PNG', decoded.type === 'image/png', decoded.type);
check('download decodes at the output size', decoded.w === aw && decoded.h === ah, JSON.stringify(decoded));

await page.evaluate(() =>
	[...document.querySelectorAll('.dt-dsk-btn')].find((b) => b.textContent.trim() === 'Reset').click(),
);
await sleep(100);
const reset = await outputText();
check('reset restores the inset quad', reset === '152 × 107 px', reset);
await page.click('.dt-dsk-btn[aria-label="Clear"]');
await sleep(100);
check('clear returns to the drop zone', await page.$('.dt-dsk-drop'));

await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['nope'], 'notes.txt', { type: 'text/plain' }));
	document
		.querySelector('.dt-dsk-frame')
		.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
});
await sleep(200);
check(
	'the error row renders inside the drop frame',
	await page.$eval('.dt-dsk-error', (el) => !!el.closest('.dt-dsk-frame')),
);

await finish(browser);
