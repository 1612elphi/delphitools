// 1khz: -20dbfs ≈ -20lufs
import {
	launch,
	visit,
	check,
	finish,
	makeWav,
	dropClip,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/audio-normaliser');

check(
	'empty state: drop zone, normalise disabled',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-an-drop') &&
			document.querySelector('.dt-an-go')?.disabled === true,
	),
);

await captureObjectUrl(page);
await makeWav(page, { amplitude: 0.1, name: 'tone.wav' });
await dropClip(page, '.dt-an-frame');

await page.waitForFunction(
	() => document.querySelectorAll('.dt-an-cell').length === 4,
	{ timeout: 15000 },
);
const rows = await page.evaluate(() =>
	Object.fromEntries(
		[...document.querySelectorAll('.dt-an-cell')].map((cell) => [
			cell.querySelector('dt')?.textContent?.trim(),
			cell.querySelector('dd')?.textContent?.trim(),
		]),
	),
);
check(
	'measures about -20 LUFS / -20 dBFS and plans about +6 dB to -14',
	/^-(19|20)\.\d LUFS$/.test(rows.Loudness ?? '') &&
		/^-20\.0 dBFS$/.test(rows.Peak ?? '') &&
		/^\+[56]\.\d dB$/.test(rows.Gain ?? ''),
	JSON.stringify(rows),
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-an-seg')]
		.find((b) => b.textContent?.includes('-23'))
		?.click();
});
check(
	'switching the target to -23 re-plans without re-measuring',
	await page.evaluate(() => {
		const gain = [...document.querySelectorAll('.dt-an-cell')].find(
			(c) => c.querySelector('dt')?.textContent?.trim() === 'Gain',
		);
		return /^-[23]\.\d dB$/.test(gain?.querySelector('dd')?.textContent?.trim() ?? '');
	}),
);
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-an-seg')]
		.find((b) => b.textContent?.includes('-14'))
		?.click();
});

await page.click('.dt-an-go');
await page.waitForSelector('.dt-an-out', { timeout: 30000 });
const result = await page.evaluate(async () => {
	const blob = window.__result;
	const ctx = new AudioContext();
	const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
	let peak = 0;
	for (let c = 0; c < buffer.numberOfChannels; c++)
		for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
	return {
		label: document.querySelector('.dt-an-result-label')?.textContent?.trim(),
		peakDb: 20 * Math.log10(peak),
		player: !!document.querySelector('audio.dt-an-player'),
	};
});
check(
	'the render lands at -14 LUFS with the peak raised by the same gain',
	/^wav · .* · -1[34]\.\d LUFS$/.test(result.label ?? '') &&
		result.peakDb > -15 &&
		result.peakDb < -13 &&
		result.player,
	JSON.stringify(result),
);

await page.click('.dt-an-clear');
check(
	'Clear returns to the empty state',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-an-drop') &&
			!document.querySelector('.dt-an-out'),
	),
);

await finish(browser);
