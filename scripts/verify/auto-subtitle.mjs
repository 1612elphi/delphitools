// Exercises the Auto Subtitle shell without downloading Whisper weights.
// Experimental deliberately fails locally, which verifies the unavailable-mode
// state while keeping this normal rig lightweight.
//
// Usage: npm start, then node scripts/verify/auto-subtitle.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/auto-subtitle');

const initial = await page.evaluate(() => ({
	accept: document.querySelector('.dt-asub-file input')?.accept ?? '',
	transcribeDisabled: document.querySelector('.dt-asub-go')?.disabled,
	copyDisabled: document.querySelector('[aria-label="Copy subtitles"]')
		?.disabled,
	downloadDisabled: document.querySelector('.dt-asub-btn.is-wide')?.disabled,
}));
check(
	'accepts both audio and video',
	initial.accept.includes('audio/') && initial.accept.includes('video/'),
	initial.accept,
);
check(
	'transcription is disabled before a file is selected',
	initial.transcribeDisabled,
);
check('copy is disabled before transcription', initial.copyDisabled);
check('download is disabled before transcription', initial.downloadDisabled);

await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(
		new File(['not actually decoded'], 'recording.wav', {
			type: 'audio/wav',
		}),
	);
	document.querySelector('.dt-asub-frame')?.dispatchEvent(
		new DragEvent('drop', {
			dataTransfer: transfer,
			bubbles: true,
		}),
	);
});
await page.waitForFunction(
	() =>
		document.querySelector('.dt-asub-filename')?.textContent ===
		'recording.wav',
);
check(
	'dropped file enables transcription',
	await page.$eval('.dt-asub-go', (button) => !button.disabled),
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-asub-mode')]
		.find((button) => button.textContent?.includes('Fast'))
		?.click();
});
check(
	'Fast mode selects',
	await page.$eval(
		'.dt-asub-mode.is-active',
		(button) => button.textContent?.trim() === 'Fast',
	),
);

await page.focus('.dt-asub-lang');
await page.keyboard.type('German');
check(
	'language accepts an optional source language',
	await page.$eval('.dt-asub-lang', (input) => input.value === 'German'),
);

await page.click('.dt-asub-toggle input');
check(
	'translate toggle selects English output',
	await page.$eval('.dt-asub-toggle input', (input) => input.checked),
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-asub-format')]
		.find((button) => button.textContent?.includes('VTT'))
		?.click();
});
check(
	'VTT format selects',
	await page.$eval(
		'.dt-asub-format.is-active',
		(button) => button.textContent?.trim() === 'VTT',
	),
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-asub-mode')]
		.find((button) => button.textContent?.includes('Experimental'))
		?.click();
});
await page.click('.dt-asub-go');
await page.waitForSelector('.dt-asub-error', { timeout: 5000 });
check(
	'Experimental mode reports its unavailable state',
	await page.$eval(
		'.dt-asub-error',
		(error) => /Fast or Reasonable/.test(error.textContent ?? ''),
	),
);

await page.click('.dt-asub-clear');
await sleep(50);
const cleared = await page.evaluate(() => ({
	name: document.querySelector('.dt-asub-filename')?.textContent?.trim(),
	transcribeDisabled: document.querySelector('.dt-asub-go')?.disabled,
	error: !!document.querySelector('.dt-asub-error'),
}));
check(
	'Clear resets file and unavailable-state error',
	cleared.name === 'Choose file' &&
		cleared.transcribeDisabled &&
		!cleared.error,
	JSON.stringify(cleared),
);

await finish(browser);
