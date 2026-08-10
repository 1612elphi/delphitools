// The wave-1 audio/video tools against a synthesised clip.
//
// The clip is recorded in-page (canvas.captureStream + MediaRecorder), so the
// rig needs no fixture file. MediaRecorder webm reports duration Infinity
// until scanned (Chromium bug 642012), so this doubles as coverage for
// lib/video's resolveDuration path — the same path a dropped screen
// recording takes.
//
// Usage: npm start, then node scripts/verify/av-tools.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

/** Records ~1.2 s of colour-cycling 64×64 webm and drops it on `selector`. */
async function dropClip(selector) {
	await page.evaluate(async (sel) => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		const recorder = new MediaRecorder(canvas.captureStream(15), {
			mimeType: 'video/webm;codecs=vp8',
		});
		const chunks = [];
		recorder.ondataavailable = (e) => chunks.push(e.data);
		const stopped = new Promise((r) => (recorder.onstop = r));
		recorder.start();
		const t0 = performance.now();
		while (performance.now() - t0 < 1200) {
			ctx.fillStyle = `hsl(${((performance.now() - t0) / 4) % 360} 80% 50%)`;
			ctx.fillRect(0, 0, 64, 64);
			await new Promise(requestAnimationFrame);
		}
		recorder.stop();
		await stopped;

		const transfer = new DataTransfer();
		transfer.items.add(
			new File(chunks, 'clip.webm', { type: 'video/webm' }),
		);
		document.querySelector(sel).dispatchEvent(
			new DragEvent('drop', {
				dataTransfer: transfer,
				bubbles: true,
			}),
		);
	}, selector);
}

// --- subtitle-converter: srt in, vtt out -----------------------------------
await visit(page, '/tools/subtitle-converter');
await page.evaluate(() => {
	const area = document.querySelector('.dt-sub-pane textarea');
	Object.getOwnPropertyDescriptor(
		HTMLTextAreaElement.prototype,
		'value',
	).set.call(area, '1\n00:00:01,000 --> 00:00:02,000\nHello\n');
	area.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);

const converted = await page.$eval(
	'.dt-sub-pane.is-right textarea',
	(el) => el.value,
);
check(
	'subtitle converter emits vtt for pasted srt',
	converted.startsWith('WEBVTT\n\n00:00:01.000 --> 00:00:02.000'),
	JSON.stringify(converted.slice(0, 44)),
);

const stats = await page.$eval('.dt-sub-stats', (el) => el.textContent);
check('cue stats render', /1 cues/.test(stats), stats.trim());

// --- video-to-gif: drop, encode, result ------------------------------------
await visit(page, '/tools/video-to-gif');
await dropClip('.dt-vg-frame');
await page.waitForFunction(
	() => {
		const meta = document.querySelector('.dt-vg-meta');
		return meta && !meta.textContent.includes('Infinity');
	},
	{ timeout: 15000 },
);

const range = await page.$eval('.dt-vg-meta', (el) => el.textContent);
check(
	'webm duration resolves to a finite range',
	/00:00:0[12]/.test(range),
	range.trim(),
);

await page.click('.dt-vg-btn.is-primary');
await page.waitForFunction(
	() => document.querySelector('.dt-vg-result img')?.src.startsWith('blob:'),
	{ timeout: 30000 },
);

const gifMeta = await page.$eval(
	'.dt-vg-result-meta',
	(el) => el.textContent,
);
check(
	'gif encodes from the seek loop',
	/\d+ KB · \d+ frames/.test(gifMeta),
	gifMeta.trim(),
);

// --- frame-extractor: drop, grab a still -----------------------------------
await visit(page, '/tools/frame-extractor');
await dropClip('.dt-fx-frame');
await page.waitForFunction(
	() => {
		const meta = document.querySelector('.dt-fx-meta');
		return meta && !meta.textContent.includes('Infinity');
	},
	{ timeout: 15000 },
);

const fxMeta = await page.$eval('.dt-fx-meta', (el) => el.textContent);
check('video metadata renders', /64 × 64/.test(fxMeta), fxMeta.trim());

await page.click('.dt-fx-btn.is-primary');
await page.waitForFunction(
	() => document.querySelector('.dt-fx-still img')?.src.startsWith('blob:'),
	{ timeout: 15000 },
);
check('grabbed still appears in the strip', true);

await finish(browser);
