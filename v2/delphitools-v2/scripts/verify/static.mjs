// The built and prerendered output, not the dev server.
//
// Two things only exist here. Prerendering writes a per-route index.html with
// that route's own head tags, which is the whole reason an Ember SPA can be
// scraped at all. And app/lib/jxl.ts loads an emscripten codec through a
// `new Function` import, specifically because the dev server and the production
// bundler disagree about literal dynamic specifiers — so passing in dev proves
// nothing about the build.
//
// Usage: npm run build && npm run prerender, then node scripts/verify/static.mjs

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../static-server.mjs';
import { launch, check, sleep, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = process.argv[2] ?? join(root, 'dist');
const PORT = 4322;
const BASE = `http://localhost:${PORT}`;

if (!existsSync(join(dist, 'index.html'))) {
	console.log(`FAILURES: no build at ${dist} — run npm run build first`);
	process.exitCode = 1;
} else {
	const server = await serve(dist, PORT);
	const { browser, page } = await launch();

	const visit = async (path) => {
		await page.goto(BASE + path, { waitUntil: 'networkidle2' });
		await page.waitForSelector('.dt-main', { timeout: 15000 });
		await sleep(400);
	};

	// ── prerendered entry points ────────────────────────────────────────

	const ROUTES = [
		{ path: '/', title: 'Home', og: '/og.png' },
		{
			path: '/tools/px-to-rem',
			title: 'PX to REM',
			og: '/tools/px-to-rem/og.png',
		},
		{
			path: '/tools/colour-converter',
			title: 'Colour Converter',
			og: '/tools/colour-converter/og.png',
		},
	];

	for (const route of ROUTES) {
		await visit(route.path);
		const seen = await page.evaluate(() => ({
			booted: !!document.querySelector('.dt-sidebar'),
			header: document
				.querySelector('.dt-header-title h1')
				?.textContent.trim(),
			navLinks: document.querySelectorAll('.dt-nav-link')
				.length,
			headers: document.querySelectorAll('.dt-header').length,
			title: document.title,
			og: document
				.querySelector('meta[property="og:image"]')
				?.content.replace('https://delphi.tools', ''),
			description: document
				.querySelector('meta[name="description"]')
				?.content.trim(),
		}));

		check(`${route.path} boots`, seen.booted && seen.navLinks > 50);
		check(
			`${route.path} renders its own title`,
			seen.header === route.title,
			seen.header,
		);
		// The prerendered markup is replaced by Ember's render, not appended to.
		check(
			`${route.path} has one header, not two`,
			seen.headers === 1,
			`${seen.headers}`,
		);
		// The card sits beside the route's own index.html, so a scraper that
		// only reads the HTML at the URL still finds the right image.
		check(
			`${route.path} points at its own share card`,
			seen.og === route.og,
			seen.og,
		);
		check(
			`${route.path} has a description`,
			!!seen.description,
			seen.description,
		);
		check(
			`${route.path} has its share card on disk`,
			existsSync(join(dist, route.og)),
			route.og,
		);
	}

	// ── the router still works from a prerendered entry ─────────────────

	await visit('/tools/px-to-rem');
	await page.evaluate(() => {
		document.querySelector(
			'.dt-nav-link[href="/tools/colour-converter"]',
		)?.click();
	});
	await sleep(800);
	const navigated = await page.evaluate(() => ({
		path: location.pathname,
		header: document
			.querySelector('.dt-header-title h1')
			?.textContent.trim(),
		rows: document.querySelectorAll('.dt-cc-row').length,
	}));
	check(
		'client-side navigation works from a prerendered page',
		navigated.path === '/tools/colour-converter' &&
			navigated.header === 'Colour Converter',
		`${navigated.path} | ${navigated.header}`,
	);
	check(
		'and the tool actually runs',
		navigated.rows === 8,
		`${navigated.rows} rows`,
	);

	// ── the jxl codec, against the built bundle ─────────────────────────

	await visit('/');
	const jxl = await page.evaluate(async () => {
		try {
			// Exactly what app/lib/jxl.ts does: a runtime import the
			// bundler must not have rewritten.
			const load = new Function('u', 'return import(u)');
			const { default: factory } =
				await load('/jxl/jxl_enc.js');
			const mod = await factory({
				noInitialRun: true,
				locateFile: (p) => `/jxl/${p}`,
			});

			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 128;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#1b5e20';
			ctx.fillRect(0, 0, 128, 128);
			ctx.fillStyle = '#faf5e6';
			ctx.fillRect(16, 16, 64, 64);
			const image = ctx.getImageData(0, 0, 128, 128);

			const encoded = mod.encode(image.data, 128, 128, {
				effort: 7,
				progressive: false,
				epf: -1,
				lossyPalette: false,
				decodingSpeedTier: 0,
				photonNoiseIso: 0,
				lossyModular: false,
				quality: 80,
				lossless: false,
			});
			if (!encoded) return { error: 'encode returned null' };
			const bytes = new Uint8Array(encoded);
			return {
				size: bytes.length,
				head: [...bytes.slice(0, 12)],
			};
		} catch (error) {
			return { error: String(error) };
		}
	});

	check(
		'the jxl codec loads from the built output',
		!jxl.error,
		jxl.error ?? `${jxl.size} bytes`,
	);
	if (!jxl.error) {
		// FF 0A is a bare codestream; "JXL " at offset 4 is the ISOBMFF box.
		const raw = jxl.head.slice(0, 2).join() === '255,10';
		const boxed = jxl.head.slice(4, 8).join() === '74,88,76,32';
		check(
			'and emits a real JPEG XL stream',
			raw || boxed,
			raw
				? 'raw codestream'
				: boxed
					? 'ISOBMFF container'
					: jxl.head.join(),
		);
	}

	await finish(browser);
	server.close();
}
