// Exercises Video Atlas with a webm generated in the page (canvas
// captureStream + MediaRecorder), which loads the self-hosted MediaInfo wasm.
//
// Usage: npm start, then node scripts/verify/video-atlas.mjs

import {
	launch,
	visit,
	check,
	finish,
	makeClip,
	dropClip,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/video-atlas');

check(
	'empty state: drop zone, copy disabled',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-va-drop') &&
			document.querySelector('.dt-va-btn')?.disabled === true,
	),
);

await makeClip(page, { name: 'sweep.webm' });
await dropClip(page, '.dt-va-frame');

await page.waitForSelector('.dt-va-panel', { timeout: 30000 });
const report = await page.evaluate(() =>
	[...document.querySelectorAll('.dt-va-panel')].map((panel) => ({
		title: panel.querySelector('.dt-va-panel-title')?.textContent?.trim(),
		rows: Object.fromEntries(
			[...panel.querySelectorAll('.dt-va-cell')].map((cell) => [
				cell.querySelector('dt')?.textContent?.trim(),
				cell.querySelector('dd')?.textContent?.trim(),
			]),
		),
	})),
);
const general = report.find((p) => p.title === 'General');
const video = report.find((p) => p.title === 'Video #1');
check(
	'MediaInfo reports the container and the video stream',
	/WebM|Matroska/.test(general?.rows.Container ?? '') &&
		/VP8/.test(video?.rows.Codec ?? '') &&
		video?.rows['Frame size']?.startsWith('320 × 180'),
	JSON.stringify(report),
);
check(
	'bar shows the stream count and enables Copy report',
	await page.evaluate(
		() =>
			/^\d+ streams?$/.test(
				document.querySelector('.dt-va-status')?.textContent?.trim() ?? '',
			) && document.querySelector('.dt-va-btn')?.disabled === false,
	),
);

await page.click('.dt-va-clear');
check(
	'Clear returns to the empty state',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-va-drop') &&
			document.querySelectorAll('.dt-va-panel').length === 0,
	),
);

await finish(browser);
