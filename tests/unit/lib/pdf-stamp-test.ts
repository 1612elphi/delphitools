import { module, test } from 'qunit';
import {
	expandNumber,
	formatNumeral,
	placeText,
	resolvePageNumbers,
} from 'delphitools-v2/lib/pdf-stamp';

module('Unit | Lib | pdf-stamp', function () {
	test('placeText anchors to each corner with the margin', function (assert) {
		const p = (a: Parameters<typeof placeText>[4]) =>
			placeText(600, 800, 100, 12, a, 20);

		assert.deepEqual(
			p('top-left'),
			{ x: 20, y: 800 - 20 - 12 },
			'top-left',
		);
		assert.deepEqual(
			p('bottom-right'),
			{ x: 600 - 100 - 20, y: 20 },
			'bottom-right',
		);
	});

	test('placeText centres horizontally and vertically', function (assert) {
		const c = placeText(600, 800, 100, 12, 'middle-center', 20);
		assert.strictEqual(c.x, (600 - 100) / 2, 'x centred');
		assert.strictEqual(c.y, (800 - 12) / 2, 'y centred');

		const tc = placeText(600, 800, 100, 12, 'top-center', 20);
		assert.strictEqual(
			tc.x,
			(600 - 100) / 2,
			'top-center x still centred',
		);
	});

	test('expandNumber substitutes the {n} and {N} strings', function (assert) {
		assert.strictEqual(
			expandNumber('{n} / {N}', '3', '10'),
			'3 / 10',
		);
		assert.strictEqual(
			expandNumber('Page {n}', 'iv', '5'),
			'Page iv',
		);
		assert.strictEqual(
			expandNumber('DRAFT', '2', '5'),
			'DRAFT',
			'no token = fixed stamp',
		);
	});

	test('formatNumeral renders each numeral system', function (assert) {
		assert.strictEqual(formatNumeral(4, 'arabic'), '4');
		assert.strictEqual(formatNumeral(4, 'roman-lower'), 'iv');
		assert.strictEqual(formatNumeral(14, 'roman-upper'), 'XIV');
		assert.strictEqual(formatNumeral(1, 'alpha-lower'), 'a');
		assert.strictEqual(formatNumeral(27, 'alpha-lower'), 'aa');
		assert.strictEqual(formatNumeral(28, 'alpha-upper'), 'AB');
	});

	test('formatNumeral falls back to arabic outside a clean range', function (assert) {
		assert.strictEqual(
			formatNumeral(0, 'roman-lower'),
			'0',
			'zero has no roman form',
		);
		assert.strictEqual(
			formatNumeral(4000, 'roman-upper'),
			'4000',
			'beyond MMMCMXCIX',
		);
		assert.strictEqual(
			formatNumeral(0, 'alpha-lower'),
			'0',
			'zero has no letter',
		);
	});

	test('resolvePageNumbers applies sections in fromPage order', function (assert) {
		// The headline case: front matter in roman, body in arabic from 1.
		const labels = resolvePageNumbers(
			[
				{ fromPage: 4, style: 'arabic', startAt: 1 },
				{
					fromPage: 1,
					style: 'roman-lower',
					startAt: 1,
				},
			],
			6,
		);
		assert.deepEqual(
			labels,
			['i', 'ii', 'iii', '1', '2', '3'],
			'roman i–iii then arabic reset to 1',
		);
	});

	test('resolvePageNumbers leaves pages before the first section unnumbered', function (assert) {
		const labels = resolvePageNumbers(
			[{ fromPage: 3, style: 'arabic', startAt: 1 }],
			4,
		);
		assert.deepEqual(
			labels,
			[null, null, '1', '2'],
			'first two pages skipped, then counts',
		);
	});

	test('resolvePageNumbers honours a non-1 startAt for a continuing counter', function (assert) {
		const labels = resolvePageNumbers(
			[
				{
					fromPage: 1,
					style: 'roman-lower',
					startAt: 1,
				},
				{ fromPage: 3, style: 'arabic', startAt: 3 },
			],
			4,
		);
		assert.deepEqual(
			labels,
			['i', 'ii', '3', '4'],
			'continues at 3',
		);
	});
});
