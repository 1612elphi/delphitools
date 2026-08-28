// getDisplayMedia cannot be granted headlessly; picker stubbed for cancel/error checks
// pipeline check uses canvas.captureStream; downstream of permission call runs for real
// usage: npm start, then node scripts/verify/screen-recorder.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

await visit(page, '/tools/screen-recorder');

// idle state: primary action is "share screen"
check(
	'idle state shows a Share screen button',
	await page.$eval('.dt-sr-btn.is-primary', (btn) =>
		btn.textContent.includes('Share screen'),
	),
);

// mic mix-in toggle defaults off, can switch on
const micOff = await page.$eval('.dt-switch', (el) => !el.checked);
check('mic mix-in defaults off', micOff);
await page.click('.dt-switch');
const micOn = await page.$eval('.dt-switch', (el) => el.checked);
check('mic mix-in toggles on', micOn);

// cancelling picker (notallowederror) must not surface an error
await page.evaluate(() => {
	const original = navigator.mediaDevices.getDisplayMedia;
	navigator.mediaDevices.getDisplayMedia = function () {
		navigator.mediaDevices.getDisplayMedia = original;
		return Promise.reject(
			new DOMException('User cancelled', 'NotAllowedError'),
		);
	};
});
await page.click('.dt-sr-btn.is-primary');
await sleep(400);
const errorAfterCancel = await page
	.$eval('.dt-sr-error', (el) => el.textContent)
	.catch(() => '');
check(
	'cancelling the picker is not treated as an error',
	!errorAfterCancel,
	`error text: ${errorAfterCancel}`,
);

// genuine unsupported failure surfaces the error message
await page.evaluate(() => {
	navigator.mediaDevices.getDisplayMedia = function () {
		return Promise.reject(new TypeError('Unsupported'));
	};
});
await page.click('.dt-sr-btn.is-primary');
await page.waitForSelector('.dt-sr-error', { timeout: 5000 });
check('unsupported display media surfaces an error', true);

// full pipeline: getDisplayMedia stubbed to canvas stream; mic on, getUserMedia rejects
// surfaces mic-denied error while recording proceeds without it
await page.evaluate(() => {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 180;
	const ctx = canvas.getContext('2d');
	let hue = 0;
	setInterval(() => {
		hue = (hue + 20) % 360;
		ctx.fillStyle = `hsl(${hue} 60% 40%)`;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}, 50);
	navigator.mediaDevices.getDisplayMedia = () =>
		Promise.resolve(canvas.captureStream(10));
});
await page.click('.dt-sr-btn.is-primary');
await page.waitForFunction(
	() => document.querySelector('.dt-sr-live') !== null,
	{ timeout: 10000 },
);
check('recording starts with the stubbed display stream', true);

await page.waitForSelector('.dt-sr-error', { timeout: 5000 });
check('mic mix-in denial surfaces while recording continues', true);

// record ~1s of canvas frames, then stop
await sleep(1000);
await page.evaluate(() => {
	const stop = [...document.querySelectorAll('.dt-sr-btn')].find((b) =>
		b.textContent.includes('Stop'),
	);
	stop?.click();
});
await page.waitForFunction(
	() => document.querySelector('.dt-sr-video') !== null,
	{ timeout: 15000 },
);
check('take finishes and the playback surface appears', true);

// meta row appears once resolveduration beats infinity
await page.waitForFunction(
	() => (document.querySelector('.dt-sr-meta')?.textContent ?? '') !== '',
	{ timeout: 10000 },
);
const meta = await page.$eval('.dt-sr-meta', (el) => el.textContent);
check(
	'meta shows resolved dimensions and duration',
	/320 × 180 · \d+\.\d{2} s/.test(meta),
	meta,
);

// playback from finished take
await page.click('.dt-sr-btn.is-primary');
await page.waitForFunction(
	() =>
		document
			.querySelector('.dt-sr-btn.is-primary')
			?.textContent.includes('Pause'),
	{ timeout: 5000 },
);
check('playback starts', true);

// download action hands timestamped webm to anchor
const filename = await page.evaluate(
	() =>
		new Promise((resolve) => {
			const original = HTMLAnchorElement.prototype.click;
			HTMLAnchorElement.prototype.click = function () {
				if (this.download) {
					HTMLAnchorElement.prototype.click = original;
					resolve(this.download);
					return;
				}
				original.call(this);
			};
			const button = [...document.querySelectorAll('.dt-sr-btn')].find(
				(b) => b.textContent.includes('Download'),
			);
			button?.click();
			setTimeout(() => resolve(''), 3000);
		}),
);
check(
	'download action produces a webm file',
	/^screen-recording-.+\.webm$/.test(filename),
	filename,
);

await finish(browser);
