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
				if (!url.startsWith(PDFJS_WASM_ROUTE))
					return next();
				const name = url
					.slice(PDFJS_WASM_ROUTE.length)
					.split(/[?#]/)[0];
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
