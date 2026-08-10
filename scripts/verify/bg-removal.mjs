// background-remover, end to end: the real model, the real inference.
//
// This downloads roughly 44 MB from the Hugging Face hub the first time and
// then runs it, so it is slow and it needs network. It is excluded from
// `npm run verify` for that reason — run it on its own after touching
// lib/bg-removal.ts, the transformers pin, or anything about bundling.
//
// It is worth the wall clock because nothing cheaper proves the interesting
// part: that the pipeline builds on one of the two devices, that a mask comes
// back, and that it lands in the alpha channel rather than being dropped.
//
// Usage: npm start, then node scripts/verify/bg-removal.mjs

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, visit, check, sleep, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(root, 'public/delphi.png');
const MODEL_TIMEOUT_MS = 10 * 60 * 1000;

const { browser, page } = await launch({
	viewport: { width: 1200, height: 1000 },
	// Hub traffic is noisy: a 404 on an optional weight file is how
	// transformers.js probes for quantised variants. The VerifyEachNode lines
	// are ORT saying it put shape ops on CPU, which it always does.
	ignore: [
		/Failed to load resource/,
		/huggingface\.co/,
		/VerifyEachNodeIsAssignedToAnEp/,
	],
});

const requests = [];
page.on('request', (req) => requests.push(req.url()));

await visit(page, '/tools/background-remover');

check('the drop zone renders', await page.$('.dt-bg-drop'));
check('and no run button yet', !(await page.$('.dt-bg-run')));

const input = await page.$('.dt-bg-drop input[type="file"]');
await input.uploadFile(SOURCE);
await page.waitForSelector('.dt-bg-run', { timeout: 10000 });
check(
	'an upload shows the source and the run button',
	await page.$('.dt-bg-source'),
);
check('with no result pane yet', !(await page.$('.dt-bg-compare')));

console.log(
	'  ..    downloading and running the model, minutes on a cold cache',
);
await page.click('.dt-bg-run');

await sleep(1500);
const busy = await page.evaluate(() => {
	const button = document.querySelector('.dt-bg-run');
	return {
		disabled: button?.disabled,
		label: button?.textContent.trim().replace(/\s+/g, ' '),
	};
});
check('the run button disables while it works', busy.disabled === true);
check(
	'and says what it is doing',
	/Downloading|Removing background/.test(busy.label ?? ''),
	busy.label,
);

let outcome;
try {
	outcome = await page
		.waitForFunction(
			() => {
				if (document.querySelector('.dt-bg-compare'))
					return 'done';
				const error = document.querySelector(
					'.dt-bg-error-detail',
				);
				return error
					? `error: ${error.textContent.trim()}`
					: false;
			},
			{ timeout: MODEL_TIMEOUT_MS, polling: 1000 },
		)
		.then((handle) => handle.jsonValue());
} catch {
	outcome = 'timed out';
}

check('the run finishes', outcome === 'done', String(outcome));

if (outcome === 'done') {
	check('a comparison pane appears', await page.$('.dt-bg-compare'));
	check(
		'with the original and the cut-out side by side',
		(await page.$$eval(
			'.dt-bg-canvas img',
			(els) => els.length,
		)) === 2,
	);
	check(
		'and a download button',
		await page.$('.dt-bg-bar-btn.is-primary'),
	);

	const alpha = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const images = [
					...document.querySelectorAll(
						'.dt-bg-canvas img',
					),
				];
				const [source, result] = images;
				const probe = new Image();
				probe.onload = () => {
					const canvas =
						document.createElement(
							'canvas',
						);
					canvas.width = probe.naturalWidth;
					canvas.height = probe.naturalHeight;
					const ctx = canvas.getContext('2d');
					ctx.drawImage(probe, 0, 0);
					const { data } = ctx.getImageData(
						0,
						0,
						canvas.width,
						canvas.height,
					);
					// Not exactly 0 and 255: RMBG's sigmoid does
					// not saturate, so a fully kept pixel comes
					// back at 254 and the edges are a soft ramp.
					let clear = 0;
					let opaque = 0;
					let min = 255;
					let max = 0;
					for (
						let i = 3;
						i < data.length;
						i += 4
					) {
						const a = data[i];
						if (a < 8) clear++;
						else if (a > 247) opaque++;
						if (a < min) min = a;
						if (a > max) max = a;
					}
					const pixels = data.length / 4;
					resolve({
						isPng: result.src.startsWith(
							'data:image/png',
						),
						width: probe.naturalWidth,
						sourceWidth:
							source.naturalWidth,
						clear: clear / pixels,
						opaque: opaque / pixels,
						min,
						max,
					});
				};
				probe.onerror = () => resolve(null);
				probe.src = result.src;
			}),
	);

	check('the result is a PNG', alpha?.isPng, `${alpha?.width}px wide`);
	check(
		'at the source resolution',
		alpha && alpha.width === alpha.sourceWidth,
		`${alpha?.width} vs ${alpha?.sourceWidth}`,
	);
	check(
		'with the background cut away',
		alpha && alpha.clear > 0.02,
		`${(alpha.clear * 100).toFixed(1)}% transparent`,
	);
	check(
		'and the subject kept',
		alpha && alpha.opaque > 0.5,
		`${(alpha.opaque * 100).toFixed(1)}% opaque`,
	);
	// A result with no mask applied would be flat at 255 everywhere.
	check(
		'so the alpha channel actually varies',
		alpha && alpha.min < 8 && alpha.max > 200,
		`alpha ${alpha?.min} to ${alpha?.max}`,
	);
}

// The dev server and the build disagree about where the ONNX runtime comes
// from, the same way lib/jxl.ts does: Rolldown emits the binary into dist/ and
// rewrites the reference, so production self-hosts it, while the dev server
// serves transformers.js unbundled and its own default sends the runtime to
// jsdelivr. static.mjs asserts the production half. The weights come from the
// hub either way.
check(
	'the weights came from the hub',
	requests.some((url) => /huggingface\.co.*RMBG-1\.4/.test(url)),
	'or from the browser cache on a warm run',
);

await finish(browser);
