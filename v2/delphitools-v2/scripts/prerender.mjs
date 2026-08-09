// Writes a per-route index.html into the build output, each with its own head
// tags, and renders the share cards beside them.
//
// An Ember SPA ships one index.html, so every route would otherwise share the
// root's <title> and og:image and scrapers would see the same card everywhere.
// prember is the traditional answer, but it is built on the classic broccoli
// pipeline that Ember 7 no longer defaults to. This drives the built app in
// headless Chrome instead, which is framework-independent and reuses the
// puppeteer-core already present for the verification harnesses.
//
// Usage: node scripts/prerender.mjs [distDir]

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer-core';
import { renderPng, toolCard, siteCard } from './og.mjs';

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = 'https://delphi.tools';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? join(root, 'dist');

// Node 26 strips TypeScript natively, so the registry is imported rather than
// parsed — it stays the single source of truth, as PARITY.md requires.
const { allTools } = await import('../app/lib/tools.ts');

/** `external: true` entries have no /tools/:id page in the Next app either. */
const toolRoutes = allTools.filter((t) => !t.external);

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
  ].join('\n    ');
}

/** Swap the shell's <title> and description for this route's head block. */
function withHead(shell, head) {
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, '@@HEAD@@')
    .replace(/\n\s*<meta name="description"[^>]*>/, '')
    .replace('@@HEAD@@', head);
}

function serve(dir, port) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
  };
  const isFile = (p) => existsSync(p) && statSync(p).isFile();
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const asked = join(dir, path);
    // A route directory exists once this script has written it, so a plain
    // existsSync would hand the browser a directory and throw EISDIR. Prefer
    // that directory's own index.html, then the SPA shell.
    const file = isFile(asked)
      ? asked
      : isFile(join(asked, 'index.html'))
        ? join(asked, 'index.html')
        : join(dir, 'index.html');
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, {
      'content-type': types[ext] ?? 'application/octet-stream',
    });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

console.log(`registry: ${toolRoutes.length} tool routes`);

const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const port = 4321;
const server = await serve(dist, port);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
});

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
];

let written = 0;
for (const route of routes) {
  const dir = route.url === '/' ? dist : join(dist, route.url);
  mkdirSync(dir, { recursive: true });

  // The card is deterministic, so it does not need the browser.
  writeFileSync(join(dir, 'og.png'), await renderPng(route.card));

  // Boot the route so a failure to render surfaces here rather than in
  // production. The body is left as the shell: Ember owns it at runtime, and a
  // snapshot would be replaced on boot anyway.
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}${route.url}`, {
    waitUntil: 'networkidle2',
  });
  // serialised and evaluated in the page, not in node
  const rendered = await page.evaluate(
    () =>
      document.querySelector('.dt-header-title h1')?.textContent?.trim() ?? '',
  );
  await page.close();
  if (errors.length) {
    console.error(`  ${route.url}: ${errors[0]}`);
    process.exitCode = 1;
  }

  writeFileSync(join(dir, 'index.html'), withHead(shell, headFor(route)));
  written += 1;
  if (written % 10 === 0 || written === routes.length) {
    console.log(
      `  ${written}/${routes.length} (last: ${route.url} -> "${rendered}")`,
    );
  }
}

await browser.close();
server.close();
console.log(`wrote ${written} routes with per-route head tags and og.png`);
