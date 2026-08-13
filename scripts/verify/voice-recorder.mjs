// Voice recorder end-to-end using Chrome's fake audio device.
//
// getUserMedia is granted automatically by the fake-device flags, so the
// MediaRecorder path records real audio frames. The resulting webm is decoded
// for the waveform and playback surface.
//
// Usage: npm start, then node scripts/verify/voice-recorder.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch({
	args: [
		'--use-fake-device-for-media-stream',
		'--use-fake-ui-for-media-stream',
	],
});

await visit(page, '/tools/voice-recorder');

// Idle state: the primary action is Record.
check(
	'idle state shows a Record button',
	await page.$eval('.dt-vr-btn.is-primary', (btn) =>
		btn.textContent.includes('Record'),
	),
);

// Start a recording. With the fake device flags this succeeds without a picker.
await page.click('.dt-vr-btn.is-primary');
await page.waitForFunction(
	() => document.querySelector('.dt-vr-meter') !== null,
	{ timeout: 10000 },
);
check('recording starts and the input meter appears', true);

// Let a few frames of fake audio accumulate.
await sleep(800);

// Pause freezes the clock and swaps in the Resume action.
await page.evaluate(() => {
	const pause = [...document.querySelectorAll('.dt-vr-btn')].find((b) =>
		b.textContent.includes('Pause'),
	);
	pause?.click();
});
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.dt-vr-btn')].some((b) =>
			b.textContent.includes('Resume'),
		),
	{ timeout: 5000 },
);
const frozenAt = await page.$eval('.dt-vr-time', (el) => el.textContent);
await sleep(1200);
check(
	'pause freezes the elapsed clock',
	(await page.$eval('.dt-vr-time', (el) => el.textContent)) === frozenAt,
	`paused at ${frozenAt}`,
);

// Resume restarts it.
await page.evaluate(() => {
	const resume = [...document.querySelectorAll('.dt-vr-btn')].find((b) =>
		b.textContent.includes('Resume'),
	);
	resume?.click();
});
await page.waitForFunction(
	(frozen) =>
		[...document.querySelectorAll('.dt-vr-btn')].some((b) =>
			b.textContent.includes('Pause'),
		) && document.querySelector('.dt-vr-time')?.textContent !== frozen,
	{ timeout: 5000 },
	frozenAt,
);
check('resume restarts the clock', true);

// Stop the recording.
await page.evaluate(() => {
	const stop = [...document.querySelectorAll('.dt-vr-btn')].find((b) =>
		b.textContent.includes('Stop'),
	);
	stop?.click();
});
await page.waitForFunction(
	() => document.querySelector('.dt-vr-wave') !== null,
	{ timeout: 15000 },
);
check('take finishes and the waveform renders', true);

// Playback from the take.
await page.click('.dt-vr-btn.is-primary');
await sleep(300);
check(
	'playback starts',
	await page.$eval('.dt-vr-btn.is-primary', (btn) =>
		btn.textContent.includes('Stop'),
	),
);

await page.click('.dt-vr-btn.is-primary');
check(
	'playback stops',
	await page.$eval('.dt-vr-btn.is-primary', (btn) =>
		btn.textContent.includes('Play'),
	),
);

// Clear returns to the idle state.
const cleared = await page.evaluate(() => {
	const btn = [...document.querySelectorAll('button')].find((b) =>
		b.textContent.includes('Clear'),
	);
	if (!btn) return false;
	btn.click();
	return true;
});
check('clear button exists', cleared);
if (cleared) {
	await sleep(200);
	check(
		'clear returns to idle',
		await page.$eval('.dt-vr-btn.is-primary', (btn) =>
			btn.textContent.includes('Record'),
		),
	);
}

await finish(browser);
