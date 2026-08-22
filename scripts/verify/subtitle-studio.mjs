// Exercises Subtitle Studio end to end with a video generated in the page
// (canvas.captureStream + MediaRecorder, two seconds), an SRT dropped on the
// frame, and a real burn through MediaRecorder.
//
// Usage: npm start, then node scripts/verify/subtitle-studio.mjs

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
await visit(page, '/tools/subtitle-studio');

const initial = await page.evaluate(() => ({
	burnDisabled: document.querySelector('.dt-ss-go')?.disabled,
	videoDrop: !!document.querySelector('.dt-ss-drop:not(.is-subs)'),
	subsDrop: !!document.querySelector('.dt-ss-drop.is-subs'),
	canvasHidden: document
		.querySelector('.dt-ss-canvas')
		?.classList.contains('is-hidden'),
}));
check(
	'empty state: burn disabled, both drop zones, canvas hidden',
	initial.burnDisabled &&
		initial.videoDrop &&
		initial.subsDrop &&
		initial.canvasHidden,
	JSON.stringify(initial),
);

const made = await makeClip(page, { ms: 2000, name: 'sweep.webm' });
check('generated a test video in the page', made > 0, `${made} bytes`);

await dropClip(page, '.dt-ss-frame', [
	{
		name: 'sweep.srt',
		type: 'application/x-subrip',
		text: '1\n00:00:00,200 --> 00:00:01,000\nHello <i>there</i>\n\n2\n00:00:01,200 --> 00:00:01,900\nSecond cue\n',
	},
]);
await page.waitForFunction(
	() => document.querySelectorAll('.dt-ss-row:not(.dt-ss-grid-head)').length === 2,
	{ timeout: 5000 },
);
await page.waitForFunction(
	() => !document.querySelector('.dt-ss-go')?.disabled,
	{ timeout: 10000 },
);
const loaded = await page.evaluate(() => ({
	name: document.querySelector('.dt-ss-filename')?.textContent?.trim(),
	meta: document.querySelector('.dt-ss-meta')?.textContent?.trim(),
	canvas: (() => {
		const c = document.querySelector('.dt-ss-canvas');
		return `${c.width}x${c.height} hidden=${c.classList.contains('is-hidden')}`;
	})(),
	rows: document.querySelectorAll('.dt-ss-row:not(.dt-ss-grid-head)').length,
}));
check(
	'one drop loads both the video and the SRT',
	loaded.name === 'sweep.webm' &&
		loaded.canvas === '320x180 hidden=false' &&
		loaded.rows === 2,
	JSON.stringify(loaded),
);

await page.evaluate(() => {
	document.querySelectorAll('button.dt-ss-n')[0]?.click();
});
await sleep(400);
check(
	'seeking to a cue highlights its row',
	await page.evaluate(
		() =>
			document
				.querySelectorAll('.dt-ss-row:not(.dt-ss-grid-head)')[0]
				?.classList.contains('is-active') &&
			/^2 cues · 00:00:00\.2/.test(
				document.querySelector('.dt-ss-stats')?.textContent ?? '',
			),
	),
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-ss-seg')]
		.find((b) => b.textContent?.trim() === 'Box')
		?.click();
});
check(
	'style segmented selects Box',
	await page.$eval(
		'.dt-ss-styles .is-active',
		(b) => b.textContent?.trim() === 'Box',
	),
);

const formats = await page.$$eval('.dt-ss-format option', (options) =>
	options.map((o) => `${o.value}${o.disabled ? '!' : ''}`),
);
check(
	'format select lists six formats with the unsupported ones disabled',
	formats.length === 6 && formats.some((f) => !f.endsWith('!')),
	formats.join(' '),
);
await page.select('.dt-ss-format', 'h264');
// Capture the result blob as it is handed to createObjectURL.
await captureObjectUrl(page);

await page.click('.dt-ss-go');
await page.waitForFunction(
	() => !!document.querySelector('.dt-ss-result'),
	{ timeout: 15000 },
);
const result = await page.evaluate(() => ({
	label: document.querySelector('.dt-ss-result')?.textContent?.trim(),
	burnDisabled: document.querySelector('.dt-ss-go')?.disabled,
	progress: !!document.querySelector('.dt-ss-progress'),
	download: !!document.querySelector('.dt-ss-btn.is-primary'),
}));
check(
	'fast burn produces a downloadable mp4 in the chosen format',
	/^mp4 · [\d.]+ [KM]B( · [\d.]+×)?$/.test(result.label ?? '') &&
		!result.burnDisabled &&
		!result.progress &&
		result.download,
	JSON.stringify(result),
);

const burned = await page.evaluate(async () => {
	const blob = window.__result;
	if (!blob) return { error: 'no blob' };
	const video = document.createElement('video');
	video.muted = true;
	video.src = URL.createObjectURL(blob);
	await new Promise((resolve, reject) => {
		video.onloadeddata = resolve;
		video.onerror = () => reject(new Error('decode'));
	});
	video.currentTime = 0.6;
	await new Promise((resolve) => (video.onseeked = resolve));
	const canvas = document.createElement('canvas');
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(video, 0, 0);
	// The sweep is saturated colour; white text pixels sit in the bottom band.
	const band = ctx.getImageData(0, Math.round(canvas.height * 0.8), canvas.width, Math.round(canvas.height * 0.2)).data;
	let white = 0;
	for (let i = 0; i < band.length; i += 4)
		if (band[i] > 200 && band[i + 1] > 200 && band[i + 2] > 200) white++;
	return { size: `${video.videoWidth}x${video.videoHeight}`, white, type: blob.type };
});
check(
	'the burned file decodes and carries the subtitle in the bottom band',
	burned.size === '320x180' && burned.white > 40,
	JSON.stringify(burned),
);

await page.click('.dt-ss-clear');
await sleep(100);
check(
	'Clear returns to the empty state',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-ss-drop:not(.is-subs)') &&
			!!document.querySelector('.dt-ss-drop.is-subs') &&
			document.querySelector('.dt-ss-go')?.disabled === true,
	),
);

await finish(browser);
