import {
	launch,
	visit,
	check,
	finish,
	makeClip,
	dropClip,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/video-muter');

check(
	'empty state: drop zone, mute disabled',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-vm-drop') &&
			document.querySelector('.dt-vm-go')?.disabled === true,
	),
);

await makeClip(page, { audio: true, name: 'tone.webm' });
await dropClip(page, '.dt-vm-frame');

await page.waitForFunction(
	() => document.querySelector('.dt-vm-go')?.disabled === false,
	{ timeout: 15000 },
);
check(
	'probe finds the audio track and enables Mute',
	await page.evaluate(() =>
		/1 audio track/.test(
			document.querySelector('.dt-vm-status')?.textContent ?? '',
		),
	),
	await page.$eval('.dt-vm-status', (s) => s.textContent?.trim()),
);

const containers = await page.$$eval('.dt-vm-format option', (options) =>
	options.map((o) => `${o.value || 'same'}${o.disabled ? '!' : ''}`),
);
check(
	'container select lists the four containers, WebM and MKV enabled for VP8',
	containers.length === 5 &&
		containers.includes('webm') &&
		containers.includes('mkv'),
	containers.join(' '),
);
await page.select('.dt-vm-format', 'mkv');

await page.click('.dt-vm-go');
await page.waitForSelector('.dt-vm-out', { timeout: 30000 });
const result = await page.evaluate(() => ({
	label: document.querySelector('.dt-vm-result-label')?.textContent?.trim(),
	video: !!document.querySelector('video.dt-vm-result'),
	progress: !!document.querySelector('.dt-vm-progress'),
	error: !!document.querySelector('.dt-vm-error'),
}));
check(
	'mute into MKV produces a result with a preview and no error',
	/^mkv · /.test(result.label ?? '') &&
		result.video &&
		!result.progress &&
		!result.error,
	JSON.stringify(result),
);

await page.click('.dt-vm-clear');
check(
	'Clear returns to the empty state',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-vm-drop') &&
			!document.querySelector('.dt-vm-out'),
	),
);

await finish(browser);
