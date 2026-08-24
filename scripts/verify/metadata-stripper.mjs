
import { launch, visit, check, finish } from './harness.mjs';

const { browser, page } = await launch();

async function dropTaggedJpeg(selector) {
	await page.evaluate(async (sel) => {
		const u16 = (n) => [n & 0xff, n >> 8];
		const u32le = (n) => [
			n & 0xff,
			(n >> 8) & 0xff,
			(n >> 16) & 0xff,
			(n >> 24) & 0xff,
		];
		const rat = (a, b) => [...u32le(a), ...u32le(b)];
		const asc = (s) => [...s].map((c) => c.charCodeAt(0));
		const ent = (tag, type, count, v) => [
			tag & 0xff,
			tag >> 8,
			type,
			0,
			count & 0xff,
			(count >> 8) & 0xff,
			(count >> 16) & 0xff,
			(count >> 24) & 0xff,
			...(typeof v === 'number' ? u32le(v) : v),
		];
		const tiff = [
			0x49, 0x49, 42, 0, 8, 0, 0, 0,
			...u16(5),
			...ent(0x010f, 2, 8, 206),
			...ent(0x0110, 2, 8, 214),
			...ent(0x0132, 2, 20, 222),
			...ent(0x8769, 4, 1, 74),
			...ent(0x8825, 4, 1, 116),
			...u32le(0),
			...u16(3),
			...ent(0x9003, 2, 20, 242),
			...ent(0x927c, 7, 4, [1, 2, 3, 4]),
			...ent(0xa431, 2, 8, 262),
			...u32le(0),
			...u16(7),
			...ent(0, 2, 2, [0x4e, 0, 0, 0]),
			...ent(1, 5, 3, 270),
			...ent(2, 2, 2, [0x45, 0, 0, 0]),
			...ent(3, 5, 3, 294),
			...ent(4, 1, 1, [0, 0, 0, 0]),
			...ent(5, 5, 1, 318),
			...ent(0x1d, 2, 11, 326),
			...u32le(0),
			...asc('TestCam\0'),
			...asc('Model X\0'),
			...asc('2024:05:01 12:00:00\0'),
			...asc('2024:04:30 09:15:22\0'),
			...asc('SN-0042\0'),
			...rat(51, 1), ...rat(30, 1), ...rat(0, 1),
			...rat(0, 1), ...rat(7, 1), ...rat(36, 1),
			...rat(100, 1),
			...asc('2024:05:01\0'),
		];
		const seg = (marker, payload) => [
			0xff,
			marker,
			(payload.length + 2) >> 8,
			(payload.length + 2) & 0xff,
			...payload,
		];

		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#c33';
		ctx.fillRect(0, 0, 64, 64);
		const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
		const jpeg = new Uint8Array(
			atob(dataUrl.split(',')[1])
				.split('')
				.map((c) => c.charCodeAt(0)),
		);

		const tagged = new Uint8Array([
			...jpeg.slice(0, 2),
			...seg(0xe1, [...asc('Exif\0\0'), ...tiff]),
			...seg(0xe2, [...asc('ICC_PROFILE\0'), 1, 1, 9, 9]),
			...jpeg.slice(2),
		]);

		const transfer = new DataTransfer();
		transfer.items.add(
			new File([tagged], 'photo.jpg', { type: 'image/jpeg' }),
		);
		document.querySelector(sel).dispatchEvent(
			new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
		);
	}, selector);
}

async function armDownloadCapture() {
	await page.evaluate(() => {
		const original = URL.createObjectURL.bind(URL);
		window.__captured = null;
		URL.createObjectURL = (blob) => {
			window.__captured = blob;
			return original(blob);
		};
	});
}

await visit(page, '/tools/metadata-stripper');
// real download hangs browser.close()
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
await dropTaggedJpeg('.dt-strip-frame');
await page.waitForFunction(() => document.querySelector('.dt-strip-list'), {
	timeout: 10000,
});

const rows = await page.$$eval('.dt-strip-pane:first-child .dt-strip-row', (els) =>
	els.map((el) => ({
		label: el.querySelector('.dt-strip-row-label')?.textContent.trim(),
		detail: el.querySelector('.dt-strip-row-detail')?.textContent.trim(),
		gps: el.classList.contains('is-gps'),
	})),
);
const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

check(
	'GPS coordinates surface with the exact fix',
	byLabel['GPS coordinates']?.detail ===
		'51.500000° N, 0.126667° E · alt 100 m',
	byLabel['GPS coordinates']?.detail,
);
check(
	'GPS row is highlighted as the headline item',
	byLabel['GPS coordinates']?.gps === true,
);
check(
	'camera make and model surface',
	byLabel['Camera']?.detail === 'TestCam Model X',
	byLabel['Camera']?.detail,
);
check(
	'taken timestamp surfaces',
	byLabel['Taken']?.detail === '2024:04:30 09:15:22',
	byLabel['Taken']?.detail,
);

const removed = await page.$eval(
	'.dt-strip-cell:nth-child(3) .dt-strip-cell-value',
	(el) => el.textContent.trim(),
);
check(
	'removed cell names the dropped segments',
	removed.includes('EXIF (APP1)'),
	removed,
);

const afterText = await page.$eval('.dt-strip-pane.is-right', (el) =>
	el.textContent.replace(/\s+/g, ' '),
);
check(
	'after pane shows only the kept ICC profile',
	afterText.includes('Colour profile') && !afterText.includes('TestCam'),
	afterText.trim().slice(0, 80),
);

await armDownloadCapture();
await page.click('.dt-strip-btn.is-primary');
await page.waitForFunction(() => window.__captured, { timeout: 5000 });
const cleaned = await page.evaluate(async () => {
	const buf = new Uint8Array(await window.__captured.arrayBuffer());
	let text = '';
	for (const b of buf) text += String.fromCharCode(b);
	const url = URL.createObjectURL(window.__captured);
	const image = new Image();
	const decoded = await new Promise((resolve) => {
		image.onload = () => resolve(true);
		image.onerror = () => resolve(false);
		image.src = url;
	});
	return {
		soi: buf[0] === 0xff && buf[1] === 0xd8,
		decoded,
		width: image.naturalWidth,
		hasCam: text.includes('TestCam'),
		hasIcc: text.includes('ICC_PROFILE'),
	};
});
check(
	'cleaned JPEG still decodes at 64×64',
	cleaned.soi && cleaned.decoded && cleaned.width === 64,
	JSON.stringify(cleaned),
);
check('camera string is gone from the output', !cleaned.hasCam);
check('ICC kept by default', cleaned.hasIcc);

await page.click('.dt-strip-switch');
await page.waitForFunction(
	() =>
		document
			.querySelector('.dt-strip-cell:nth-child(3) .dt-strip-cell-value')
			?.textContent.includes('ICC profile (APP2)'),
	{ timeout: 5000 },
);
check('removing the colour profile names it in the removed cell', true);

const afterToggle = await page.$eval('.dt-strip-pane.is-right', (el) =>
	el.textContent.replace(/\s+/g, ' '),
);
check(
	'after pane now reports nothing left',
	afterToggle.includes('Nothing left'),
	afterToggle.trim().slice(0, 80),
);

await finish(browser);
