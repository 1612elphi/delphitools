// wav re-encodes, ogg stream-copies
import {
	launch,
	visit,
	check,
	finish,
	makeClip,
	dropClip,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/audio-extractor');

check(
	'empty state: drop zone, extract disabled',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-ax-drop') &&
			document.querySelector('.dt-ax-go')?.disabled === true,
	),
);

await captureObjectUrl(page);

await makeClip(page, { audio: true, ms: 1500, name: 'tone.webm' });
await dropClip(page, '.dt-ax-frame');
await page.waitForFunction(
	() => document.querySelector('.dt-ax-go')?.disabled === false,
	{ timeout: 15000 },
);
check(
	'probe reports the source codec and sample rate',
	await page.$eval('.dt-ax-status', (s) =>
		/^opus · \d+ Hz$/.test(s.textContent?.trim() ?? ''),
	),
	await page.$eval('.dt-ax-status', (s) => s.textContent?.trim()),
);
const targets = await page.$$eval('.dt-ax-format option', (options) =>
	options.map((o) => `${o.value}${o.disabled ? '!' : ''}`),
);
check(
	'format select lists WAV, M4A, Ogg and FLAC with WAV and Ogg enabled',
	targets.length === 4 &&
		targets.includes('wav') &&
		targets.includes('ogg'),
	targets.join(' '),
);

await page.click('.dt-ax-go');
await page.waitForSelector('.dt-ax-out', { timeout: 30000 });
const wav = await page.evaluate(async () => {
	const blob = window.__result;
	const ctx = new AudioContext();
	const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
	return {
		type: blob.type,
		duration: buffer.duration,
		channels: buffer.numberOfChannels,
		label: document.querySelector('.dt-ax-result-label')?.textContent?.trim(),
		player: !!document.querySelector('audio.dt-ax-player'),
	};
});
check(
	'WAV decodes to ~1.5 s of audio with a player and a size label',
	wav.type === 'audio/wav' &&
		Math.abs(wav.duration - 1.5) < 0.4 &&
		wav.channels >= 1 &&
		/^wav · /.test(wav.label ?? '') &&
		wav.player,
	JSON.stringify(wav),
);

await page.select('.dt-ax-format', 'ogg');
await page.click('.dt-ax-go');
await page.waitForSelector('.dt-ax-out', { timeout: 30000 });
const ogg = await page.evaluate(() => ({
	type: window.__result?.type,
	size: window.__result?.size,
	label: document.querySelector('.dt-ax-result-label')?.textContent?.trim(),
}));
check(
	'Ogg (Opus) comes out as a copied Opus stream',
	ogg.type === 'audio/ogg' && ogg.size > 0 && /^ogg · /.test(ogg.label ?? ''),
	JSON.stringify(ogg),
);

await page.click('.dt-ax-clear');
check(
	'Clear returns to the empty state',
	await page.evaluate(
		() =>
			!!document.querySelector('.dt-ax-drop') &&
			!document.querySelector('.dt-ax-out'),
	),
);

await finish(browser);
