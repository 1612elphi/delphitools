// needs npm start first

import puppeteer from 'puppeteer-core';

export const CHROME =
	process.env.CHROME_PATH ??
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let checks = 0;

export function check(label, ok, detail = '') {
	checks += 1;
	if (!ok) failures += 1;
	const tail = detail ? ` — ${detail}` : '';
	console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${tail}`);
}

export function fail(label, detail) {
	check(label, false, detail);
}

// userDataDir skips weight re-downloads
export async function launch({
	viewport = { width: 1400, height: 1000 },
	ignore = [],
	userDataDir,
	args = [],
} = {}) {
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: 'new',
		// 180s protocolTimeout too short
		protocolTimeout: 0,
		...(userDataDir ? { userDataDir } : {}),
		args,
	});
	const page = await browser.newPage();
	await page.setViewport(viewport);

	const heard = (text) => ignore.some((re) => re.test(text));
	page.on('pageerror', (e) => {
		if (!heard(e.message)) fail('uncaught exception', e.message);
	});
	page.on('console', (m) => {
		if (m.type() === 'error' && !heard(m.text()))
			fail('console error', m.text());
	});

	return { browser, page };
}

export async function visit(page, path) {
	await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
	await page.waitForSelector('.dt-main', { timeout: 15000 });
	await sleep(300);
}

// omnibar triggers key by title
export async function openModule(page, title) {
	const found = await page.evaluate((t) => {
		const b = [...document.querySelectorAll('button')].find(
			(x) => (x.getAttribute('title') ?? '').toLowerCase() === t,
		);
		b?.click();
		return !!b;
	}, title.toLowerCase());
	await sleep(600);
	return found;
}

export async function finish(browser) {
	await browser?.close();
	if (failures) {
		console.log(`\nFAILURES: ${failures} of ${checks}`);
		// exitCode lets node drain
		process.exitCode = 1;
		return;
	}
	console.log(`\nALL PASS (${checks})`);
}

export function makeClip(
	page,
	{ width = 320, height = 180, ms = 1500, audio = false, name = 'clip.webm' } = {},
) {
	return page.evaluate(
		async ({ width, height, ms, audio, name }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			const stream = canvas.captureStream(30);
			let osc;
			if (audio) {
				const ac = new AudioContext();
				osc = ac.createOscillator();
				const dest = ac.createMediaStreamDestination();
				osc.connect(dest);
				osc.start();
				for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
			}
			const recorder = new MediaRecorder(stream, {
				mimeType: audio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8',
			});
			const chunks = [];
			recorder.ondataavailable = (e) => chunks.push(e.data);
			const stopped = new Promise((r) => (recorder.onstop = r));
			recorder.start(100);
			const t0 = performance.now();
			await new Promise((resolve) => {
				const tick = () => {
					const t = performance.now() - t0;
					ctx.fillStyle = `hsl(${(t / 10) % 360} 80% 50%)`;
					ctx.fillRect(0, 0, width, height);
					if (t < ms) requestAnimationFrame(tick);
					else resolve();
				};
				tick();
			});
			recorder.stop();
			await stopped;
			osc?.stop();
			const blob = new Blob(chunks, { type: 'video/webm' });
			window.__clip = new File([blob], name, { type: 'video/webm' });
			return blob.size;
		},
		{ width, height, ms, audio, name },
	);
}

export function dropClip(page, selector, extra = []) {
	return page.evaluate(
		({ selector, extra }) => {
			const transfer = new DataTransfer();
			transfer.items.add(window.__clip);
			for (const { name, text, type } of extra)
				transfer.items.add(new File([text], name, { type }));
			document.querySelector(selector)?.dispatchEvent(
				new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
			);
		},
		{ selector, extra },
	);
}

export function captureObjectUrl(page) {
	return page.evaluate(() => {
		const original = URL.createObjectURL.bind(URL);
		URL.createObjectURL = (blob) => {
			window.__result = blob;
			return original(blob);
		};
	});
}

export function makeWav(
	page,
	{
		rate = 48000,
		seconds = 3,
		amplitude = 0.1,
		frequency = 1000,
		channels = 2,
		name = 'tone.wav',
	} = {},
) {
	return page.evaluate(
		({ rate, seconds, amplitude, frequency, channels, name }) => {
			const n = rate * seconds;
			const frame = channels * 2;
			const bytes = new ArrayBuffer(44 + n * frame);
			const view = new DataView(bytes);
			const ascii = (offset, text) => {
				for (let i = 0; i < text.length; i++)
					view.setUint8(offset + i, text.charCodeAt(i));
			};
			ascii(0, 'RIFF');
			view.setUint32(4, 36 + n * frame, true);
			ascii(8, 'WAVE');
			ascii(12, 'fmt ');
			view.setUint32(16, 16, true);
			view.setUint16(20, 1, true);
			view.setUint16(22, channels, true);
			view.setUint32(24, rate, true);
			view.setUint32(28, rate * frame, true);
			view.setUint16(32, frame, true);
			view.setUint16(34, 16, true);
			ascii(36, 'data');
			view.setUint32(40, n * frame, true);
			for (let i = 0; i < n; i++) {
				const v = Math.round(
					amplitude * Math.sin((2 * Math.PI * frequency * i) / rate) * 32767,
				);
				for (let c = 0; c < channels; c++)
					view.setInt16(44 + i * frame + c * 2, v, true);
			}
			window.__clip = new File([bytes], name, { type: 'audio/wav' });
			return bytes.byteLength;
		},
		{ rate, seconds, amplitude, frequency, channels, name },
	);
}
