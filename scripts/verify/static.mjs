// tests built output, not dev server
// prerendered index.html carries per-route head tags for scraping
// jxl.ts dynamic import: dev and prod bundlers disagree on specifiers

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
		// ember replaces prerendered markup, doesn't append
		check(
			`${route.path} has one header, not two`,
			seen.headers === 1,
			`${seen.headers}`,
		);
		// og card beside route's index.html, scraper finds it in html
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

	// pages catch-all: 404.html must carry spa shell head
	const notFoundPath = join(dist, '404.html');
	check(
		'404.html exists for the Pages catch-all',
		existsSync(notFoundPath),
	);
	if (existsSync(notFoundPath)) {
		check(
			'404.html carries the 404 title',
			readFileSync(notFoundPath, 'utf8').includes('<title>404'),
		);
	}
	await page.goto(BASE + '/no-such-route', {
		waitUntil: 'networkidle2',
	});
	check(
		'a bogus route renders the tiled 404 scene',
		(await page.$('.dt-404-page')) !== null,
	);

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

	// window.__substrata dev-only via import.meta.env.DEV; shipping exposes doc model
	await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
	const booted = await page
		.waitForSelector('canvas.upper-canvas', { timeout: 15000 })
		.then(() => true)
		.catch(() => false);
	await sleep(600);
	check('the editor boots from the built output', booted);
	const rig = await page.evaluate(() => typeof window.__substrata);
	check('and the dev rig is stripped', rig === 'undefined', rig);

	const assets = join(dist, 'assets');
	const emitted = readdirSync(assets);

	// registry.ts globs; missing chunk = glob stopped expanding
	const toolIds = readdirSync(join(root, 'app/components/tools'))
		.filter((name) => name.endsWith('.gts'))
		.map((name) => name.slice(0, -'.gts'.length));
	const unsplit = toolIds.filter(
		(id) =>
			!emitted.some((name) =>
				new RegExp(`^${id}-[^.]*\\.js$`).test(name),
			),
	);
	check(
		'every tool is its own chunk',
		toolIds.length > 0 && unsplit.length === 0,
		`${toolIds.length} tools${unsplit.length ? `, still in main: ${unsplit.join(' ')}` : ''}`,
	);

	// staticAppPaths: without it app/lib eager-loads, main balloons 82kb to 570kb
	// npm run test overwrites dist with 56-byte stub main, so floor check too
	const mainJs = emitted.find((name) => /^main-.*\.js$/.test(name));
	const mainBytes = mainJs ? statSync(join(assets, mainJs)).size : 0;
	check(
		'app/lib stays out of the eager graph',
		mainBytes > 20_000 && mainBytes < 200_000,
		`main is ${(mainBytes / 1e3).toFixed(0)} kB`,
	);

	// fetched at runtime from public/, so missing file builds fine
	// missing falls back to 7.5k core + heuristic, reports ready anyway
	const dictionary = join(dist, 'data/shavian-dictionary-full.json');
	const dictBytes = existsSync(dictionary)
		? statSync(dictionary).size
		: 0;
	check(
		'the full shavian dictionary is in the build',
		dictBytes > 4_000_000,
		dictBytes ? `${(dictBytes / 1e6).toFixed(1)} MB` : 'missing',
	);

	// transformers.js falls back to jsdelivr when wasmPaths unset; bundlers emit same 21.6mb binary
	const ortWasm = emitted.filter((name) =>
		/^ort-wasm.*\.wasm$/.test(name),
	);
	check(
		'the ONNX runtime binary is in the build',
		ortWasm.length === 1,
		ortWasm.join(' ') || 'none emitted',
	);
	if (ortWasm[0]) {
		const bytes = statSync(join(assets, ortWasm[0])).size;
		check(
			'and is the whole binary, not a stub',
			bytes > 10_000_000,
			`${(bytes / 1e6).toFixed(1)} MB`,
		);

		const chunk = emitted.find((name) =>
			/^transformers\.web-.*\.js$/.test(name),
		);
		const source = chunk
			? readFileSync(join(assets, chunk), 'utf8')
			: '';
		check(
			'transformers is its own chunk, not part of main',
			!!chunk,
			chunk ?? 'not split out',
		);
		check(
			'and points at the local binary',
			source.includes(ortWasm[0]),
			ortWasm[0],
		);
	}

	await visit('/');
	const jxl = await page.evaluate(async () => {
		try {
			// jxl.ts does runtime import bundler must not rewrite
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
		// ff 0a = bare codestream; jxl at offset 4 = isobmff box
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
