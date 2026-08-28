import { module, test } from 'qunit';
import {
	formatBytes,
	savingsPercent,
	COMPRESS_EXTENSIONS,
	QUALITY_FORMATS,
	OPAQUE_FORMATS,
	type CompressFormat,
} from 'delphitools-v2/lib/image-compress';

module('Unit | Lib | image-compress', function () {
	test('formatBytes picks the unit by magnitude', function (assert) {
		assert.strictEqual(formatBytes(0), '0 B');
		assert.strictEqual(formatBytes(512), '512 B');
		assert.strictEqual(formatBytes(1023), '1023 B');
		assert.strictEqual(formatBytes(1024), '1.0 KB');
		assert.strictEqual(formatBytes(1536), '1.5 KB');
		assert.strictEqual(formatBytes(1024 * 1024 - 1), '1024.0 KB');
		assert.strictEqual(formatBytes(1024 * 1024), '1.0 MB');
		assert.strictEqual(formatBytes(3.24 * 1024 * 1024), '3.2 MB');
	});

	test('savingsPercent is negative when the output shrinks', function (assert) {
		assert.strictEqual(savingsPercent(1000, 550), -45);
		assert.strictEqual(savingsPercent(1000, 1120), 12);
		assert.strictEqual(savingsPercent(1000, 1000), 0);
	});

	test('savingsPercent guards a zero-length input', function (assert) {
		assert.strictEqual(savingsPercent(0, 100), 0);
	});

	test('every format has a download extension', function (assert) {
		const formats: CompressFormat[] = [
			'mozjpeg',
			'webp',
			'oxipng',
			'avif',
		];
		for (const format of formats) {
			assert.ok(
				COMPRESS_EXTENSIONS[format],
				`${format} has an extension`,
			);
		}
		assert.strictEqual(COMPRESS_EXTENSIONS.mozjpeg, 'jpg');
		assert.strictEqual(COMPRESS_EXTENSIONS.oxipng, 'png');
	});

	test('lossless OxiPNG takes no quality slider; opaque MozJPEG takes no alpha', function (assert) {
		assert.false(QUALITY_FORMATS.includes('oxipng'));
		assert.true(QUALITY_FORMATS.includes('mozjpeg'));
		assert.true(QUALITY_FORMATS.includes('webp'));
		assert.true(QUALITY_FORMATS.includes('avif'));
		assert.deepEqual(OPAQUE_FORMATS, ['mozjpeg']);
	});
});
