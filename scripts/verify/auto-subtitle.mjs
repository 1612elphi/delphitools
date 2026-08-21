// Exercises the Auto Subtitle shell without downloading Whisper weights.
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
check(
	'warning dialog is hidden until opened',
	await page.$eval(
		'dialog.dt-asub-warn',
		(dialog) => !dialog.open && getComputedStyle(dialog).display === 'none',
	),
);
check(
	'empty state shows the drop zone, no grid, no progress bar',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-asub-drop input[type=file]') &&
			!document.querySelector('.dt-asub-grid') &&
			!document.querySelector('.dt-asub-progress'),
	),
);
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
		.find((button) => button.textContent?.includes('Rough'))
		?.click();
});
check(
	'Rough mode selects',
	await page.$eval(
		'.dt-asub-mode.is-active',
		(button) => button.textContent?.trim() === 'Rough',
	),
);

await page.click('.dt-lang-combo-trigger');
await page.waitForSelector('.dt-lang-combo-panel .dt-command-input', {
	timeout: 3000,
});
await page.type('.dt-lang-combo-panel .dt-command-input', 'germ');
await sleep(100);
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-lang-combo-panel .dt-command-item')]
		.find((item) => item.dataset.value === 'German')
		?.click();
});
await sleep(150);
check(
	'language combobox searches and picks German with its flag',
	await page.$eval(
		'.dt-lang-combo-trigger',
		(trigger) =>
			trigger.textContent?.trim() === 'German' &&
			trigger.querySelector('img')?.getAttribute('src') === '/flags/de.svg' &&
			trigger.querySelector('img')?.naturalWidth > 0,
	),
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

const clickExperimental = () =>
	page.evaluate(() => {
		[...document.querySelectorAll('.dt-asub-mode')]
			.find((button) => button.textContent?.includes('Experimental'))
			?.click();
	});
const activeMode = () =>
	page.$eval('.dt-asub-mode.is-active', (button) =>
		button.textContent?.trim(),
	);

await clickExperimental();
await page.waitForSelector('dialog[open].dt-asub-warn', { timeout: 3000 });
check(
	'Experimental opens the download warning with its art',
	await page.$eval(
		'dialog[open].dt-asub-warn img',
		(img) => img.complete && img.naturalWidth > 0,
	),
);
await page.click('.dt-asub-warn-btn:not(.is-primary)');
await sleep(100);
check(
	'cancelling the warning keeps the previous mode',
	!(await page.$('dialog[open].dt-asub-warn')) &&
		(await activeMode()) === 'Rough',
);

await clickExperimental();
await page.waitForSelector('dialog[open].dt-asub-warn', { timeout: 3000 });
await page.click('.dt-asub-warn-btn.is-primary');
await sleep(100);
const confirmed = await page.evaluate(() => ({
	open: document.querySelector('dialog.dt-asub-warn')?.open,
	returnValue: document.querySelector('dialog.dt-asub-warn')?.returnValue,
	active: document.querySelector('.dt-asub-mode.is-active')?.textContent?.trim(),
}));
check(
	'confirming the warning selects Experimental',
	!confirmed.open && confirmed.active === 'Experimental',
	JSON.stringify(confirmed),
);

await page.click('.dt-asub-info');
await page.waitForSelector('.dt-asub-infopanel', { timeout: 3000 });
check(
	'info popover lists the three models',
	await page.evaluate(() => {
		const ids = [...document.querySelectorAll('.dt-asub-model-id')].map(
			(a) => a.textContent?.trim(),
		);
		const sizes = [...document.querySelectorAll('.dt-asub-model-size')].map(
			(s) => s.textContent?.trim(),
		);
		return (
			sizes.length === 3 &&
			sizes.every((size) => /^\d+ MB$/.test(size ?? '')) &&
			ids.length === 3 &&
			ids.every((id) => /^Whisper \d \(/.test(id ?? '')) &&
			[...document.querySelectorAll('.dt-asub-model-id')].every((a) =>
				/^https:\/\/huggingface\.co\/[\w-]+\/whisper-/.test(a.href),
			)
		);
	}),
);
await page.click('.dt-asub-out-label');
await sleep(200);
check(
	'click outside closes the info popover',
	!(await page.$('.dt-asub-infopanel')),
);

await page.click('.dt-asub-clear');
await sleep(50);
const cleared = await page.evaluate(() => ({
	name: document.querySelector('.dt-asub-filename')?.textContent?.trim(),
	transcribeDisabled: document.querySelector('.dt-asub-go')?.disabled,
	error: !!document.querySelector('.dt-asub-error'),
}));
check(
	'Clear resets the selected file',
	cleared.name === 'Choose file' &&
		cleared.transcribeDisabled &&
		!cleared.error,
	JSON.stringify(cleared),
);

await finish(browser);
