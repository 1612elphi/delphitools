// Exercises Video Trimmer with a webm generated in the page (canvas +
// oscillator through MediaRecorder): an exact cut (re-encode) and a keyframe
// cut (packet copy), each decoded back to check its length.
//
// Usage: npm start, then node scripts/verify/video-trimmer.mjs

import {
	launch,
	visit,
	check,
	finish,
	sleep,
	makeClip,
	dropClip,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/video-trimmer');

check(
	'empty state: drop zone, trim disabled',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-vt-drop') &&
			document.querySelector('.dt-vt-go')?.disabled === true,
	),
);

await captureObjectUrl(page);

await makeClip(page, { audio: true, ms: 2500, name: 'tone.webm' });
await dropClip(page, '.dt-vt-frame');
await page.waitForFunction(
	() => document.querySelector('.dt-vt-go')?.disabled === false,
	{ timeout: 15000 },
);
const loaded = await page.evaluate(() => ({
	out: document.querySelector('.dt-vt-tc[aria-label="Out"]')?.value,
	length: document.querySelector('.dt-vt-readout')?.textContent?.trim(),
	range: document.querySelector('.dt-vt-range-fill')?.style.width,
}));
check(
	'loading sets Out to the duration and the strip to the whole span',
	/^00:00:02\.[0-9]{3}$/.test(loaded.out ?? '') &&
		loaded.length === loaded.out &&
		loaded.range === '100%',
	JSON.stringify(loaded),
);

const setPoint = async (label, value) => {
	await page.$eval(
		`.dt-vt-tc[aria-label="${label}"]`,
		(input, value) => {
			input.value = value;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		},
		value,
	);
};
await setPoint('In', '00:00:00.500');
await setPoint('Out', '00:00:01.800');
await setPoint('In', 'garbage');
check(
	'points commit through parseTimestamp and garbage snaps back',
	await page.evaluate(
		() =>
			document.querySelector('.dt-vt-tc[aria-label="In"]')?.value ===
				'00:00:00.500' &&
			document.querySelector('.dt-vt-readout')?.textContent?.trim() ===
				'00:00:01.300',
	),
);

const decodedDuration = () =>
	page.evaluate(async () => {
		const blob = window.__result;
		const video = document.createElement('video');
		video.muted = true;
		video.src = URL.createObjectURL(blob);
		await new Promise((resolve, reject) => {
			video.onloadedmetadata = resolve;
			video.onerror = () => reject(new Error('decode'));
		});
		if (!Number.isFinite(video.duration)) {
			video.currentTime = 1e101;
			await new Promise((resolve) => (video.ondurationchange = resolve));
		}
		return { duration: video.duration, type: blob.type, size: blob.size };
	});

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-vt-seg')]
		.find((b) => b.textContent?.trim() === 'Exact')
		?.click();
});
await page.click('.dt-vt-go');
await page.waitForSelector('.dt-vt-out', { timeout: 60000 });
const exact = await decodedDuration();
const exactLabel = await page.$eval('.dt-vt-result-label', (s) =>
	s.textContent?.trim(),
);
check(
	'exact cut re-encodes 0.5–1.8 s into a 1.3 s file',
	Math.abs(exact.duration - 1.3) < 0.25 &&
		/^webm · .* · 00:00:00\.500 – 00:00:01\.800$/.test(exactLabel ?? ''),
	JSON.stringify({ ...exact, exactLabel }),
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-vt-seg')]
		.find((b) => b.textContent?.trim() === 'Keyframe')
		?.click();
});
await sleep(100);
await page.click('.dt-vt-go');
await page.waitForSelector('.dt-vt-out', { timeout: 60000 });
const key = await decodedDuration();
const keyLabel = await page.$eval('.dt-vt-result-label', (s) =>
	s.textContent?.trim(),
);
check(
	'keyframe cut copies packets from the keyframe before In up to Out',
	key.duration > 1.2 &&
		key.duration < 2.0 &&
		/^webm · .* – 00:00:01\.800$/.test(keyLabel ?? ''),
	JSON.stringify({ ...key, keyLabel }),
);

await page.click('.dt-vt-clear');
check(
	'Clear returns to the empty state',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-vt-drop') &&
			!document.querySelector('.dt-vt-out'),
	),
);

await finish(browser);
