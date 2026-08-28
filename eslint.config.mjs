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
	// vendored assets
	globalIgnores([
		'dist/',
		'coverage/',
		'public/jxl/',
		'public/compress/',
		'public/mupdf/',
		'public/mediainfo/',
		'public/lib/imagetracer_v1.2.6.js',
		'app/lib/pandoc/pandoc-core.js',
		// legacy scripts allow process.exit
		'scripts/verify/',
		'scripts/build-shavian-dict.ts',
		'!**/.*',
	]),
	js.configs.recommended,
	ember.configs.base,
	ember.configs.gjs,
	ember.configs.gts,
	eslintConfigPrettier,
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
		// page callbacks use browser globals
		files: ['scripts/**/*.mjs'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
	},
]);
