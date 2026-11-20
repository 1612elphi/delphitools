import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as mupdf from 'mupdf';
import { launch, check, finish } from './harness.mjs';

const DIR = 'public/fonts/write';
const SAMPLE = 'Hamburgefonstiv office Waffle AVATAR Straße Übermäßig 1962, "Ünïcödé" — ¶ fjord';
const SIZE = 11;
const files = readdirSync(DIR).filter((f) => /\.(ttf|otf)$/.test(f));

const { browser, page } = await launch();
await page.goto('about:blank');

for (const file of files) {
	const bytes = readFileSync(join(DIR, file));
	let font;
	try {
		font = new mupdf.Font(file, bytes);
	} catch (e) {
		check(`${file} loads in mupdf`, false, String(e));
		continue;
	}
	const chars = [...new Set(SAMPLE)].filter(
		(ch) => font.encodeCharacter(ch) !== 0,
	);
	const mu = chars.map(
		(ch) => font.advanceGlyph(font.encodeCharacter(ch)) * SIZE,
	);
	const canvas = await page.evaluate(
		async (b64, chars, size) => {
			const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
			const face = new FontFace('Probe', buf.buffer);
			await face.load();
			document.fonts.add(face);
			const ctx = document.createElement('canvas').getContext('2d');
			ctx.font = `${size}px Probe`;
			ctx.fontKerning = 'none';
			const widths = chars.map((ch) => ctx.measureText(ch).width);
			document.fonts.delete(face);
			return widths;
		},
		bytes.toString('base64'),
		chars,
		SIZE,
	);
	const worst = Math.max(...mu.map((w, i) => Math.abs(w - canvas[i])));
	check(
		`${file} widths match (${chars.length} glyphs)`,
		worst < 0.01,
		`max diff ${worst.toFixed(4)}px`,
	);
}

await finish(browser);
