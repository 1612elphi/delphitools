import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';

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

function prideEnabled() {
	const override = process.env.DT_PRIDE;
	if (override) return /^(1|true|on|yes)$/i.test(override.trim());
	return new Date().getMonth() === 5;
}

// pdf.js loads runtime wasm
const wasmRequire = createRequire(import.meta.url);
const PDFJS_WASM_DIR = join(
	dirname(wasmRequire.resolve('pdfjs-dist/package.json')),
	'wasm',
);
const PDFJS_WASM_ROUTE = '/pdfjs-wasm/';
// pdf.js standard fonts
const PDFJS_FONTS_DIR = join(
	dirname(wasmRequire.resolve('pdfjs-dist/package.json')),
	'standard_fonts',
);
const PDFJS_FONTS_ROUTE = '/pdfjs-fonts/';

function pdfjsWasm() {
	const contentType = (name) => {
		if (name.endsWith('.wasm')) return 'application/wasm';
		if (name.endsWith('.js')) return 'text/javascript';
		return 'application/octet-stream';
	};
	return {
		name: 'pdfjs-wasm',
		// dev serves package wasm
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url ?? '';
				const route = url.startsWith(PDFJS_WASM_ROUTE)
					? [PDFJS_WASM_ROUTE, PDFJS_WASM_DIR]
					: url.startsWith(PDFJS_FONTS_ROUTE)
						? [
								PDFJS_FONTS_ROUTE,
								PDFJS_FONTS_DIR,
							]
						: null;
				if (!route) return next();
				const name = url
					.slice(route[0].length)
					.split(/[?#]/)[0];
				if (!name || name.includes('/')) return next();
				let body;
				try {
					body = readFileSync(
						join(route[1], name),
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
		generateBundle() {
			for (const [dir, prefix] of [
				[PDFJS_WASM_DIR, 'pdfjs-wasm'],
				[PDFJS_FONTS_DIR, 'pdfjs-fonts'],
			])
				for (const name of readdirSync(dir)) {
					this.emitFile({
						type: 'asset',
						fileName: `${prefix}/${name}`,
						source: readFileSync(
							join(dir, name),
						),
					});
				}
		},
	};
}

// http lacks secure context
function devCrypto() {
	return {
		name: 'dev-crypto',
		apply: 'serve',
		transformIndexHtml: () => [
			{
				tag: 'script',
				injectTo: 'head-prepend',
				children: readFileSync(
					'scripts/dev-insecure-crypto.mjs',
					'utf8',
				),
			},
		],
	};
}

export default defineConfig({
	plugins: [
		classicEmberSupport(),
		ember(),
		pdfjsWasm(),
		devCrypto(),
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
		// prebundle worker entries
		entries: [
			'index.html',
			'tests/index.html',
			'app/**/*.{js,ts,gts}',
		],
		// pdf-lib fonts are non-json
		exclude: ['pdf-lib'],
		// nested pako requires bundling
		include: [
			// dynamic import misses dependency scan
			'@huggingface/transformers',
			'pdf-lib > pako',
			'pdf-lib > @pdf-lib/standard-fonts > pako',
			'pdf-lib > @pdf-lib/upng > pako',
		],
	},
	css: {
		preprocessorOptions: {
			scss: {
				loadPaths: ['node_modules', 'app/styles'],
				// silence crayon sass deprecation
				silenceDeprecations: ['if-function'],
			},
		},
	},
	server: {
		// verification requires port 3000
		port: 3000,
	},
});
