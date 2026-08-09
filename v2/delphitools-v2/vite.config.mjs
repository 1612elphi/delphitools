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
	css: {
		preprocessorOptions: {
			scss: {
				// crayon-css resolves as a bare specifier; see app/styles/_crayon-config.scss
				loadPaths: ['node_modules', 'app/styles'],
			},
		},
	},
	server: {
		// the scripts/verify harnesses hard-code :3000
		port: 3000,
	},
});
