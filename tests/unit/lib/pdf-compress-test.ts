import { module, test } from 'qunit';
import {
	resizeTo,
	STRUCTURAL_OPTIONS,
	savingsPercent,
	formatBytes,
} from 'delphitools-v2/lib/pdf-compress';

module('Unit | Lib | pdf-compress', function () {
	test('the structural pass compresses streams, images, fonts and dedupes', function (assert) {
		assert.true(STRUCTURAL_OPTIONS['compress'], 'compress');
		assert.true(STRUCTURAL_OPTIONS['compress-images'], 'images');
		assert.true(STRUCTURAL_OPTIONS['compress-fonts'], 'fonts');
		assert.strictEqual(
			STRUCTURAL_OPTIONS['garbage'],
			'deduplicate',
		);
	});

	test('resizeTo caps the longest edge and keeps the aspect ratio', function (assert) {
		assert.deepEqual(
			resizeTo(4000, 3000, 1000),
			{ w: 1000, h: 750 },
			'landscape scales on width',
		);
		assert.deepEqual(
			resizeTo(3000, 4000, 1000),
			{ w: 750, h: 1000 },
			'portrait scales on height',
		);
	});

	test('resizeTo is a no-op when already within the cap or the cap is off', function (assert) {
		assert.strictEqual(
			resizeTo(800, 600, 1000),
			null,
			'under the cap',
		);
		assert.strictEqual(
			resizeTo(1000, 600, 1000),
			null,
			'exactly at the cap',
		);
		assert.strictEqual(resizeTo(4000, 3000, 0), null, 'cap off');
	});

	test('resizeTo never rounds a dimension below 1px', function (assert) {
		const r = resizeTo(2000, 3, 100);
		assert.strictEqual(r?.w, 100, 'width capped');
		assert.strictEqual(r?.h, 1, 'height floored at 1, not 0');
	});

	test('savingsPercent is signed against the input size', function (assert) {
		assert.strictEqual(
			savingsPercent(1000, 550),
			-45,
			'shrank 45%',
		);
		assert.strictEqual(savingsPercent(1000, 1120), 12, 'grew 12%');
		assert.strictEqual(savingsPercent(1000, 1000), 0, 'unchanged');
		assert.strictEqual(
			savingsPercent(0, 500),
			0,
			'empty input never divides',
		);
	});

	test('formatBytes scales the unit', function (assert) {
		assert.strictEqual(formatBytes(512), '512 B');
		assert.strictEqual(formatBytes(2048), '2.0 KB');
		assert.strictEqual(formatBytes(3 * 1024 * 1024), '3.0 MB');
	});
});
