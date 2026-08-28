import { module, test } from 'qunit';
import {
	everyPageAlone,
	fitPlacement,
	normaliseRotation,
	pageSetupPt,
	parsePageRanges,
	PX_TO_POINTS,
} from 'delphitools-v2/lib/pdf-pages';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';

module('Unit | Lib | pdf-pages', function () {
	module('parsePageRanges', function () {
		test('parses single pages and ranges, 1-based inclusive', function (assert) {
			assert.deepEqual(parsePageRanges('1-3, 5', 10), [
				[0, 1, 2],
				[4],
			]);
			assert.deepEqual(parsePageRanges('2', 10), [[1]]);
		});

		test('tolerates whitespace and gaps around dashes', function (assert) {
			assert.deepEqual(parsePageRanges(' 4 - 6 ,8 ', 10), [
				[3, 4, 5],
				[7],
			]);
		});

		test('allows the last page as the upper bound', function (assert) {
			assert.deepEqual(parsePageRanges('9-10', 10), [[8, 9]]);
		});

		test('rejects pages outside the document', function (assert) {
			assert.throws(
				() => parsePageRanges('1-11', 10),
				/out of range/,
			);
			assert.throws(
				() => parsePageRanges('0', 10),
				/out of range/,
			);
		});

		test('rejects reversed, empty and non-numeric input', function (assert) {
			assert.throws(
				() => parsePageRanges('6-3', 10),
				/reversed/,
			);
			assert.throws(
				() => parsePageRanges('1,,3', 10),
				/empty range/,
			);
			assert.throws(
				() => parsePageRanges('   ', 10),
				/empty range/,
			);
			assert.throws(
				() => parsePageRanges('two', 10),
				/bad range/,
			);
			assert.throws(
				() => parsePageRanges('1-', 10),
				/bad range/,
			);
		});
	});

	test('everyPageAlone groups each page on its own', function (assert) {
		assert.deepEqual(everyPageAlone(3), [[0], [1], [2]]);
		assert.deepEqual(everyPageAlone(0), []);
	});

	test('normaliseRotation snaps to quarter turns', function (assert) {
		assert.strictEqual(normaliseRotation(0), 0);
		assert.strictEqual(normaliseRotation(450), 90);
		assert.strictEqual(normaliseRotation(-90), 270);
		assert.strictEqual(normaliseRotation(44), 0);
	});

	module('fitPlacement', function () {
		test('contain fits a wide image to the area width, centred', function (assert) {
			const p = fitPlacement(200, 100, 100, 100, 'contain');
			assert.deepEqual(p, {
				x: 0,
				y: 25,
				width: 100,
				height: 50,
			});
		});

		test('contain fits a tall image to the area height, centred', function (assert) {
			const p = fitPlacement(100, 200, 100, 100, 'contain');
			assert.deepEqual(p, {
				x: 25,
				y: 0,
				width: 50,
				height: 100,
			});
		});

		test('cover overflows the short axis and centres the crop', function (assert) {
			const p = fitPlacement(200, 100, 100, 100, 'cover');
			assert.deepEqual(p, {
				x: -50,
				y: 0,
				width: 200,
				height: 100,
			});
		});

		test('stretch fills the area regardless of aspect', function (assert) {
			const p = fitPlacement(200, 100, 100, 80, 'stretch');
			assert.deepEqual(p, {
				x: 0,
				y: 0,
				width: 100,
				height: 80,
			});
		});
	});

	module('pageSetupPt', function () {
		test('A4 portrait in points', function (assert) {
			const setup = pageSetupPt(
				'a4',
				'portrait',
				100,
				100,
				0,
			);
			assert.strictEqual(setup.width, 210 * MM_TO_POINTS);
			assert.strictEqual(setup.height, 297 * MM_TO_POINTS);
		});

		test('auto picks landscape for a wide image', function (assert) {
			const setup = pageSetupPt('a4', 'auto', 200, 100, 0);
			assert.strictEqual(setup.width, 297 * MM_TO_POINTS);
			assert.strictEqual(setup.height, 210 * MM_TO_POINTS);
		});

		test('auto keeps portrait for a square image', function (assert) {
			const setup = pageSetupPt('a4', 'auto', 100, 100, 0);
			assert.ok(setup.height > setup.width);
		});

		test('match sizes the page to the image plus margins', function (assert) {
			const margin = 10 * MM_TO_POINTS;
			const setup = pageSetupPt(
				'match',
				'auto',
				400,
				200,
				margin,
			);
			assert.strictEqual(
				setup.width,
				400 * PX_TO_POINTS + margin * 2,
			);
			assert.strictEqual(
				setup.height,
				200 * PX_TO_POINTS + margin * 2,
			);
		});

		test('rejects an unknown size id', function (assert) {
			assert.throws(() =>
				pageSetupPt('b5', 'auto', 100, 100, 0),
			);
		});
	});
});
