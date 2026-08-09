import { execSync } from 'node:child_process';
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

export default defineConfig({
	plugins: [
		classicEmberSupport(),
		ember(),
		// extra plugins here
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
