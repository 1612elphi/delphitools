// The wave-2 audio tools against a synthesised clip: a 1.5 s 440 Hz wav is
// written in-page and dropped into each tool, so the rig needs no fixture.
//
// Usage: npm start, then node scripts/verify/audio-tools.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

/** Builds the wav File in page context and drops it on `selector`. */
async function dropWav(selector) {
	await page.evaluate((sel) => {
		const sampleRate = 22050;
		const frames = Math.round(sampleRate * 1.5);
		const data = new ArrayBuffer(44 + frames * 2);
		const view = new DataView(data);
		const ascii = (offset, text) => {
			for (let i = 0; i < text.length; i++)
				view.setUint8(offset + i, text.charCodeAt(i));
		};
		ascii(0, 'RIFF');
		view.setUint32(4, 36 + frames * 2, true);
		ascii(8, 'WAVE');
		ascii(12, 'fmt ');
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, 1, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * 2, true);
		view.setUint16(32, 2, true);
		view.setUint16(34, 16, true);
		ascii(36, 'data');
		view.setUint32(40, frames * 2, true);
		for (let i = 0; i < frames; i++)
			view.setInt16(
				44 + i * 2,
				Math.sin((2 * Math.PI * 440 * i) / sampleRate) *
					0.5 *
					0x7fff,
				true,
			);

		const transfer = new DataTransfer();
		transfer.items.add(
			new File([data], 'tone.wav', { type: 'audio/wav' }),
		);
		document.querySelector(sel).dispatchEvent(
			new DragEvent('drop', {
				dataTransfer: transfer,
				bubbles: true,
			}),
		);
	}, selector);
}

/** True when the canvas has at least one painted (non-blank) pixel. */
function painted(selector) {
	return page.evaluate((sel) => {
		const canvas = document.querySelector(sel);
		if (!canvas) return false;
		const ctx = canvas.getContext('2d');
		const { data } = ctx.getImageData(
			0,
			0,
			canvas.width,
			canvas.height,
		);
		for (let i = 3; i < data.length; i += 4)
			if (data[i] > 0) return true;
		return false;
	}, selector);
}

// --- audio-trimmer ---------------------------------------------------------
await visit(page, '/tools/audio-trimmer');
await dropWav('.dt-at-frame');
await page.waitForSelector('.dt-at-wave', { timeout: 15000 });
await sleep(400);

// decodeAudioData resamples to the context rate, so the buffer's rate is
// machine-dependent — assert shape, not the source file's 22050.
const trimMeta = await page.$eval('.dt-at-meta', (el) => el.textContent);
check(
	'trimmer: decodes and shows meta',
	/1\.50 s · \d+ Hz · 1 ch/.test(trimMeta),
	trimMeta.trim(),
);
check('trimmer: waveform painted', await painted('.dt-at-wave'));

const selection = await page.$eval(
	'.dt-at-selection',
	(el) => el.textContent,
);
check(
	'trimmer: selection defaults to the whole clip',
	/0\.00 – 1\.50 s/.test(selection),
	selection.trim(),
);

// Transport: play shows the playhead line; the loop button latches.
const atBtn = async (label) =>
	(
		await page.evaluateHandle(
			(text) =>
				[...document.querySelectorAll('.dt-at-btn')].find(
					(b) => b.textContent.includes(text),
				),
			label,
		)
	).asElement();
await (await atBtn('Play')).click();
await sleep(200);
check(
	'trimmer: playhead appears while playing',
	await page.evaluate(() => !!document.querySelector('.dt-playhead')),
);
await (await atBtn('Loop')).click();
check(
	'trimmer: loop button latches',
	await page.evaluate(
		() =>
			document
				.querySelector('.dt-at-btn.is-active')
				?.getAttribute('aria-pressed') === 'true',
	),
);
await (await atBtn('Stop')).click();
check(
	'trimmer: stop hides the playhead',
	await page.evaluate(() => !document.querySelector('.dt-playhead')),
);

// --- audio-atlas -----------------------------------------------------------
await visit(page, '/tools/audio-atlas');
await dropWav('.dt-aa-frame');
await page.waitForSelector('.dt-aa-meta', { timeout: 15000 });
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.dt-aa-cell')].some((cell) =>
			/LUFS/.test(cell.textContent),
		),
	{ timeout: 15000 },
);

const cells = await page.evaluate(() =>
	[...document.querySelectorAll('.dt-aa-cell')].map((cell) =>
		cell.textContent.replace(/\s+/g, ' ').trim(),
	),
);
check(
	'atlas: meta rows include duration and rate',
	cells.some((c) => c.includes('1.50 s')) &&
		cells.some((c) => /Sample rate \d+ Hz/.test(c)),
	cells.join(' | '),
);
check(
	'atlas: peak of a -6 dBFS sine reads ≈ -6',
	cells.some((c) => /Peak -6\.\d dBFS/.test(c)),
	cells.find((c) => c.startsWith('Peak')) ?? 'no peak row',
);
check(
	'atlas: loudness computed',
	cells.some((c) => /-\d+\.\d LUFS/.test(c)),
	cells.find((c) => c.startsWith('Loudness')) ?? 'no loudness row',
);
check('atlas: waveform painted', await painted('.dt-aa-wave'));
await sleep(800);
check('atlas: spectrogram painted', await painted('.dt-aa-spectro'));

// Transport: play toggles to pause; the loop button latches.
const playBtn = async (label) =>
	(
		await page.evaluateHandle(
			(text) =>
				[...document.querySelectorAll('.dt-aa-btn')].find(
					(b) => b.textContent.includes(text),
				),
			label,
		)
	).asElement();
await (await playBtn('Play')).click();
await sleep(200);
check(
	'atlas: play toggles to pause',
	await page.evaluate(() =>
		[...document.querySelectorAll('.dt-aa-btn')].some((b) =>
			b.textContent.includes('Pause'),
		),
	),
);
await (await playBtn('Loop')).click();
check(
	'atlas: loop button latches',
	await page.evaluate(
		() =>
			document
				.querySelector('.dt-aa-btn.is-active')
				?.getAttribute('aria-pressed') === 'true',
	),
);
await (await playBtn('Pause')).click();

// Click-to-seek: a click at three quarters of the waveform moves the
// playhead line there.
await page.evaluate(() => {
	const wave = document.querySelector('.dt-aa-wave');
	const rect = wave.getBoundingClientRect();
	wave.dispatchEvent(
		new MouseEvent('click', {
			clientX: rect.left + rect.width * 0.75,
			clientY: rect.top + rect.height / 2,
			bubbles: true,
		}),
	);
});
await sleep(100);
const playheadLeft = await page.evaluate(() =>
	parseFloat(
		document.querySelector('.dt-playhead')?.style.left ?? '-1',
	),
);
check(
	'atlas: click seeks the playhead',
	playheadLeft > 70 && playheadLeft < 80,
	`${playheadLeft}%`,
);

// --- waveform-genny --------------------------------------------------------
await visit(page, '/tools/waveform-genny');
await dropWav('.dt-wg-frame');
await page.waitForSelector('.dt-wg-preview', { timeout: 15000 });
await sleep(300);
check('genny: preview painted', await painted('.dt-wg-preview'));

const before = await page.$eval('.dt-wg-preview', (el) => el.width);
await page.evaluate(() => {
	[...document.querySelectorAll('.dt-wg-preset')]
		.find((b) => b.textContent.includes('Full HD'))
		.click();
});
await sleep(200);
const after = await page.$eval('.dt-wg-preview', (el) => el.width);
check(
	'genny: preset switch resizes the canvas',
	before === 1500 && after === 1920,
	`${before} → ${after}`,
);

await finish(browser);
