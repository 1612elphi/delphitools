import { module, test } from 'qunit';
import {
	generateShades,
	colourFromQuery,
	GENERATION_MODES,
} from 'delphitools-v2/components/tools/tailwind-shades';

const BASE = '#3b82f6';
const LEVELS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

module('Unit | Tool | tailwind-shades', function () {
	test('produces the Tailwind ramp in order', function (assert) {
		const shades = generateShades(BASE, 'classic');
		assert.deepEqual(
			shades?.map((s) => s.level),
			LEVELS,
		);
	});

	test('every shade is a six-digit hex', function (assert) {
		for (const mode of GENERATION_MODES) {
			const shades = generateShades(BASE, mode.value);
			assert.true(
				shades!.every((s) =>
					/^#[\da-f]{6}$/.test(s.hex),
				),
				`${mode.value}: ${shades!.map((s) => s.hex).join(' ')}`,
			);
		}
	});

	// The ramp's lightness is the scale's, not the base colour's, so 50 is
	// always the lightest end and 950 the darkest whatever goes in.
	test('lightness falls monotonically from 50 to 950', function (assert) {
		for (const mode of GENERATION_MODES) {
			const shades = generateShades(BASE, mode.value)!;
			const lightness = shades.map((s) => s.oklch[0]);
			const falling = lightness.every(
				(l, i) => i === 0 || l < lightness[i - 1]!,
			);
			assert.true(
				falling,
				`${mode.value}: ${lightness.map((l) => l.toFixed(2)).join(' ')}`,
			);
		}
	});

	test('hue-shift moves the hue across the ramp and classic does not', function (assert) {
		const hue = (mode: 'classic' | 'hue-shift') =>
			generateShades(BASE, mode)!.map((s) => s.oklch[2]);
		const classic = hue('classic');
		const shifted = hue('hue-shift');
		assert.true(
			classic.every((h) => Math.abs(h - classic[0]!) < 0.001),
			`classic holds one hue: ${classic[0]?.toFixed(1)}`,
		);
		assert.true(
			Math.max(...shifted) - Math.min(...shifted) > 1,
			`hue-shift spreads: ${(Math.max(...shifted) - Math.min(...shifted)).toFixed(1)} degrees`,
		);
	});

	test('vivid is more saturated than muted at every level', function (assert) {
		const vivid = generateShades(BASE, 'vivid')!;
		const muted = generateShades(BASE, 'muted')!;
		assert.true(
			vivid.every((s, i) => s.oklch[1] >= muted[i]!.oklch[1]),
			`vivid ${vivid[5]?.oklch[1].toFixed(3)} vs muted ${muted[5]?.oklch[1].toFixed(3)}`,
		);
	});

	test('a grey base stays grey', function (assert) {
		const shades = generateShades('#808080', 'classic')!;
		assert.true(shades.every((s) => s.oklch[1] < 0.02));
	});

	test('rejects a base colour that does not parse', function (assert) {
		for (const junk of ['', 'zzz', '#fff', '#3b82f6ff']) {
			assert.strictEqual(
				generateShades(junk, 'classic'),
				null,
				JSON.stringify(junk),
			);
		}
	});

	module('share link', function () {
		test('accepts bare and hashed hex', function (assert) {
			assert.strictEqual(
				colourFromQuery('?color=3b82f6'),
				'#3b82f6',
			);
			assert.strictEqual(
				colourFromQuery('?color=%233b82f6'),
				'#3b82f6',
			);
		});

		test('rejects anything that is not six-digit hex', function (assert) {
			for (const junk of [
				'?color=fff',
				'?color=zzz',
				'?color=',
			]) {
				assert.strictEqual(
					colourFromQuery(junk),
					null,
					junk,
				);
			}
		});

		test('returns null without the param', function (assert) {
			assert.strictEqual(colourFromQuery(''), null);
			assert.strictEqual(colourFromQuery('?other=1'), null);
		});
	});
});
