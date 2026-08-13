/**
 * Debugging:
 *   https://eslint.org/docs/latest/use/configure/debug
 *  ----------------------------------------------------
 *
 *   Print a file's calculated configuration
 *
 *     npx eslint --print-config path/to/file.js
 *
 *   Inspecting the config
 *
 *     npx eslint --inspect-config
 *
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import globals from 'globals';
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';

import ts from 'typescript-eslint';

import ember from 'eslint-plugin-ember/recommended';

import eslintConfigPrettier from 'eslint-config-prettier';
import qunit from 'eslint-plugin-qunit';
import n from 'eslint-plugin-n';

import babelParser from '@babel/eslint-parser/experimental-worker';

const parserOptions = {
	esm: {
		js: {
			ecmaFeatures: { modules: true },
			ecmaVersion: 'latest',
		},
		ts: {
			projectService: true,
			tsconfigRootDir: dirname(
				fileURLToPath(import.meta.url),
			),
		},
	},
};

export default defineConfig([
	// Everything here is vendored verbatim and served as-is: public/jxl is the
	// libjxl emscripten build from @jsquash/jxl, public/compress the @jsquash
	// mozjpeg/webp/oxipng/avif codec builds and their hand-written dispatcher,
	// pandoc-core.js is the MIT
	// pandoc-wasm wrapper, and imagetracer is the standalone build
	// image-tracer builds its worker from.
	globalIgnores([
		'dist/',
		'coverage/',
		'public/jxl/',
		'public/compress/',
		'public/lib/imagetracer_v1.2.6.js',
		'app/lib/pandoc/pandoc-core.js',
		// Substrata harnesses and the dictionary builder predate this repo's
		// lint setup (they moved in with the Next-era root) and keep their
		// own idiom, process.exit included.
		'scripts/verify/',
		'scripts/build-shavian-dict.ts',
		'!**/.*',
	]),
	js.configs.recommended,
	ember.configs.base,
	ember.configs.gjs,
	ember.configs.gts,
	eslintConfigPrettier,
	/**
	 * https://eslint.org/docs/latest/use/configure/configuration-files#configuring-linter-options
	 */
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
		},
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			parser: babelParser,
		},
	},
	{
		files: ['**/*.{js,gjs}'],
		languageOptions: {
			parserOptions: parserOptions.esm.js,
			globals: {
				...globals.browser,
			},
		},
	},
	{
		files: ['**/*.{ts,gts}'],
		languageOptions: {
			parser: ember.parser,
			parserOptions: parserOptions.esm.ts,
			globals: {
				...globals.browser,
			},
		},
		extends: [
			...ts.configs.recommendedTypeChecked,
			ember.configs.gts,
		],
	},
	{
		...qunit.configs.recommended,
		files: ['tests/**/*-test.{js,gjs,ts,gts}'],
		plugins: {
			qunit,
		},
	},
	/**
	 * CJS node files
	 */
	{
		...n.configs['flat/recommended-script'],
		files: ['**/*.cjs', 'config/**/*.js'],
		plugins: {
			n,
		},

		languageOptions: {
			sourceType: 'script',
			ecmaVersion: 'latest',
			globals: {
				...globals.node,
			},
		},
	},
	/**
	 * ESM node files
	 */
	{
		...n.configs['flat/recommended-module'],
		files: ['**/*.mjs'],
		plugins: {
			n,
		},

		languageOptions: {
			sourceType: 'module',
			ecmaVersion: 'latest',
			parserOptions: parserOptions.esm.js,
			globals: {
				...globals.node,
			},
		},
	},
	{
		// scripts/ runs in node but embeds callbacks that puppeteer serialises and
		// evaluates in the page, so both global sets are legitimately in scope.
		files: ['scripts/**/*.mjs'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
	},
]);
