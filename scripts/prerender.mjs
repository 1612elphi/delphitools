import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serve } from './static-server.mjs';
import { renderPng, toolCard, siteCard } from './og.mjs';

const CHROME =
	process.env.CHROME_PATH ??
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = 'https://delphi.tools';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? join(root, 'dist');

// node strips typescript
const { allTools } = await import('../app/lib/tools.ts');

const toolRoutes = allTools.filter(
	(t) => !t.external && t.href.startsWith('/tools/'),
);

const esc = (s) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function headFor({ title, description, url, image, imageAlt }) {
	return [
		`<title>${esc(title)}</title>`,
		`<meta name="description" content="${esc(description)}">`,
		`<meta property="og:type" content="website">`,
		`<meta property="og:site_name" content="delphitools">`,
		`<meta property="og:title" content="${esc(title)}">`,
		`<meta property="og:description" content="${esc(description)}">`,
		`<meta property="og:url" content="${ORIGIN}${url === '/' ? '' : url}">`,
		`<meta property="og:image" content="${ORIGIN}${image}">`,
		`<meta property="og:image:width" content="1200">`,
		`<meta property="og:image:height" content="630">`,
		`<meta property="og:image:alt" content="${esc(imageAlt)}">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${esc(title)}">`,
		`<meta name="twitter:description" content="${esc(description)}">`,
		`<meta name="twitter:image" content="${ORIGIN}${image}">`,
		`<meta name="twitter:image:alt" content="${esc(imageAlt)}">`,
		`<meta name="twitter:image:width" content="1200">`,
		`<meta name="twitter:image:height" content="630">`,
	].join('\n    ');
}

function withHead(shell, head) {
	return shell
		.replace(/<title>[\s\S]*?<\/title>/, '@@HEAD@@')
		.replace(
			/\n\s*<meta (?:name="description"|property="og:|name="twitter:)[^>]*>/g,
			'',
		)
		.replace('@@HEAD@@', head);
}

console.log(`registry: ${toolRoutes.length} tool routes`);

const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const port = 4321;
const server = await serve(dist, port);
// the deploy image has no chrome
const browser = existsSync(CHROME)
	? await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
	: null;
if (!browser) console.warn('chrome not found, skipping boot checks');

// evaluate runs in browser context
async function boot(url, evaluate) {
	if (!browser) return null;
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`http://localhost:${port}${url}`, {
		waitUntil: 'networkidle2',
	});
	const result = await page.evaluate(evaluate);
	await page.close();
	if (errors.length) {
		console.error(`  ${url}: ${errors[0]}`);
		process.exitCode = 1;
	}
	return result;
}

const routes = [
	{
		url: '/',
		title: 'delphitools — privacy-first browser tools',
		description:
			'A collection of small, low stakes and low effort tools. No logins, no registration, no data collection. Everything runs locally in your browser.',
		image: '/og.png',
		imageAlt: 'delphitools hero image',
		card: siteCard(),
	},
	...toolRoutes.map((t) => ({
		url: `/tools/${t.id}`,
		title: `${t.name} - delphitools`,
		description: t.description,
		image: `/tools/${t.id}/og.png`,
		imageAlt: 'A share card for a free tool on delphitools',
		card: toolCard(t.name),
	})),
	{
		url: '/editor',
		title: 'Substrata',
		description:
			allTools.find((t) => t.id === 'substrata')
				?.description ?? '',
		image: '/editor/og.png',
		imageAlt: 'A share card for Substrata, the delphitools image editor',
		card: toolCard('Substrata'),
	},
];

let written = 0;
for (const route of routes) {
	const dir = route.url === '/' ? dist : join(dist, route.url);
	mkdirSync(dir, { recursive: true });

	writeFileSync(join(dir, 'og.png'), await renderPng(route.card));

	const rendered = await boot(
		route.url,
		() =>
			document
				.querySelector('.dt-header-title h1')
				?.textContent?.trim() ?? '',
	);

	writeFileSync(join(dir, 'index.html'), withHead(shell, headFor(route)));
	written += 1;
	if (written % 10 === 0 || written === routes.length) {
		console.log(
			`  ${written}/${routes.length} (last: ${route.url} -> "${rendered ?? ''}")`,
		);
	}
}

// cloudflare serves root 404
{
	const sceneRendered = await boot(
		'/no-such-page',
		() => document.querySelector('.dt-404-page') !== null,
	);
	if (browser && !sceneRendered) {
		console.error(
			'  /no-such-page: 404 scene missing (.dt-404-page)',
		);
		process.exitCode = 1;
	}
	writeFileSync(
		join(dist, '404.html'),
		withHead(
			shell,
			headFor({
				title: '404 — delphitools',
				description: 'File not found',
				url: '/404',
				image: '/og.png',
				imageAlt: 'delphitools hero image',
			}),
		),
	);
	console.log('  404.html written');
}

await browser?.close();
server.close();
console.log(`wrote ${written} routes with per-route head tags and og.png`);
