import { module, test } from 'qunit';
import {
	expandNumber,
	pageLabelNumber,
	placeText,
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

	test('expandNumber substitutes {n} and {N}', function (assert) {
		assert.strictEqual(expandNumber('{n} / {N}', 3, 10), '3 / 10');
		assert.strictEqual(expandNumber('Page {n}', 1, 5), 'Page 1');
		assert.strictEqual(
			expandNumber('DRAFT', 2, 5),
			'DRAFT',
			'no token = fixed stamp',
		);
	});

	test('pageLabelNumber respects start offset and skip-first', function (assert) {
		assert.strictEqual(
			pageLabelNumber(0, 1, false),
			1,
			'first page, start 1',
		);
		assert.strictEqual(
			pageLabelNumber(4, 1, false),
			5,
			'fifth page',
		);
		assert.strictEqual(
			pageLabelNumber(2, 10, false),
			12,
			'start offset',
		);
		assert.strictEqual(
			pageLabelNumber(0, 1, true),
			null,
			'first page skipped',
		);
		assert.strictEqual(
			pageLabelNumber(1, 1, true),
			1,
			'second page is number 1 when first is skipped',
		);
	});
});
