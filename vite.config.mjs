import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';

/**
 * Build-time commit SHA for the sidebar's version label. Prefers an explicit env
 * var so CI or Docker builds without a .git directory can pass one, then the
 * local git HEAD, then "dev".
 */
function commitSha() {
	if (process.env.DT_COMMIT_SHA) return process.env.DT_COMMIT_SHA;
	try {
		return execSync('git rev-parse --short HEAD', {
			stdio: ['ignore', 'pipe', 'ignore'],
		})
			.toString()
			.trim();
	} catch {
		return 'dev';
	}
}

/**
 * Pride styling (rainbow wordmark + "trans rights" tagline). Resolved at build
 * time so the value is identical in the prerendered HTML and the client bundle.
 * Auto-enables during June. DT_PRIDE overrides: 1/true/on/yes force it on,
 * anything else forces it off.
 */
function prideEnabled() {
	const override = process.env.DT_PRIDE;
	if (override) return /^(1|true|on|yes)$/i.test(override.trim());
	return new Date().getMonth() === 5; // 5 = June
}

/**
 * Serve pdf.js's image-codec wasm. pdf.js 5.x decodes JBIG2, JPEG2000 and CCITT
 * images through wasm it fetches at runtime from the `wasmUrl` directory passed
 * to getDocument (see app/lib/pdfjs.ts); without it a scanned PDF renders its
 * vector text but drops every scanned page image. The files ship inside
 * pdfjs-dist, pinned by the lockfile — serving them from there rather than a
 * committed copy keeps them in lockstep with the API and worker, which reject
 * even a patch-level version mismatch.
 */
const wasmRequire = createRequire(import.meta.url);
const PDFJS_WASM_DIR = join(
	dirname(wasmRequire.resolve('pdfjs-dist/package.json')),
	'wasm',
);
const PDFJS_WASM_ROUTE = '/pdfjs-wasm/';

function pdfjsWasm() {
	const contentType = (name) => {
		if (name.endsWith('.wasm')) return 'application/wasm';
		if (name.endsWith('.js')) return 'text/javascript';
		return 'application/octet-stream';
	};
	return {
		name: 'pdfjs-wasm',
		// Dev has no bundle step, so a middleware serves the pinned dir.
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url ?? '';
				if (!url.startsWith(PDFJS_WASM_ROUTE))
					return next();
				const name = url
					.slice(PDFJS_WASM_ROUTE.length)
					.split(/[?#]/)[0];
				// One flat directory: reject any path separator.
				if (!name || name.includes('/')) return next();
				let body;
				try {
					body = readFileSync(
						join(PDFJS_WASM_DIR, name),
					);
				} catch {
					return next();
				}
				res.setHeader(
					'Content-Type',
					contentType(name),
				);
				res.end(body);
			});
		},
		// Build emits each file at the same stable route.
		generateBundle() {
			for (const name of readdirSync(PDFJS_WASM_DIR)) {
				this.emitFile({
					type: 'asset',
					fileName: `pdfjs-wasm/${name}`,
					source: readFileSync(
						join(PDFJS_WASM_DIR, name),
					),
				});
			}
		},
	};
}

export default defineConfig({
	plugins: [
		classicEmberSupport(),
		ember(),
		// extra plugins here
		pdfjsWasm(),
		babel({
			babelHelpers: 'runtime',
			extensions,
		}),
	],
	define: {
		__DT_COMMIT_SHA__: JSON.stringify(commitSha()),
		__DT_PRIDE__: JSON.stringify(prideEnabled()),
	},
	optimizeDeps: {
		// @pdf-lib/standard-fonts stores each font as a deflated payload in a
		// file named .json, and its own es/Font.js imports them as JSON. The
		// dev dep-optimizer parses them and fails the whole pass with
		// "trailing characters", which takes the dev server down with it —
		// every pdf tool then 504s on its dynamic import. The production build
		// does not run the optimizer and has never been affected.
		exclude: ['pdf-lib'],
		// Excluding the parent leaves its own dependencies unconverted, and
		// pdf-lib reaches pako 1.0.11 — CommonJS — down three separate paths,
		// each resolving to its own nested copy. Served raw, any of them
		// throws "does not provide an export named 'default'" the first time a
		// tool touches pdf-lib, which pdf-preflight then reports as a
		// malformed PDF. All three have to be named: an entry only covers the
		// copy at that exact path.
		include: [
			// transformers.js is only reached through a dynamic import in
			// app/lib/bg-removal.ts (and its substrata twin), so Vite's initial
			// scan never sees it. Without this, first open of the background
			// remover triggers on-demand optimization + a forced full reload;
			// the in-flight dynamic import races that reload and 404s on the
			// now-dead ?v= chunk URL. Pre-bundling at server start avoids it.
			'@huggingface/transformers',
			'pdf-lib > pako',
			'pdf-lib > @pdf-lib/standard-fonts > pako',
			'pdf-lib > @pdf-lib/upng > pako',
		],
	},
	css: {
		preprocessorOptions: {
			scss: {
				// crayon-css resolves as a bare specifier; see app/styles/_crayon-config.scss
				loadPaths: ['node_modules', 'app/styles'],
				// Sass 1.100 deprecated the old if() form. The three uses are all
				// in crayon-css itself (_borders.scss 38 and 88, _svg_masks.scss
				// 22), none in this app, so the warning is noise we cannot fix
				// here. Narrow on purpose — other deprecations still surface.
				// Remove once crayon-css ships the modern syntax.
				silenceDeprecations: ['if-function'],
			},
		},
	},
	server: {
		// the scripts/verify harnesses hard-code :3000
		port: 3000,
	},
});
