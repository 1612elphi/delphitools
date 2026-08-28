import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch({
	args: [
		'--use-fake-device-for-media-stream',
		'--use-fake-ui-for-media-stream',
	],
});

await visit(page, '/tools/voice-recorder');

check(
	'idle state shows a Record button',
	await page.$eval('.dt-vr-btn.is-primary', (btn) =>
		btn.textContent.includes('Record'),
	),
);

await page.click('.dt-vr-btn.is-primary');
await page.waitForFunction(
	() => document.querySelector('.dt-vr-meter') !== null,
	{ timeout: 10000 },
);
check('recording starts and the input meter appears', true);

await sleep(800);

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
