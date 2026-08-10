import { module, test } from 'qunit';
import { detectColour } from 'delphitools-v2/lib/colour-parse';

module('Unit | Lib | colour-parse', function () {
	test('detects hex with and without the hash', function (assert) {
		assert.deepEqual(detectColour('#2e7d32'), [46, 125, 50]);
		assert.deepEqual(detectColour('2e7d32'), [46, 125, 50]);
	});

	test('detects css functional forms by prefix', function (assert) {
		assert.deepEqual(detectColour('rgb(46, 125, 50)'), [46, 125, 50]);
		assert.deepEqual(detectColour('RGB(46 125 50)'), [46, 125, 50]);
		const hsl = detectColour('hsl(123, 46%, 34%)');
		assert.ok(hsl && Math.abs(hsl[0] - 46.8) < 1, 'hsl red channel');
	});

	test('ignores an alpha suffix', function (assert) {
		assert.deepEqual(
			detectColour('rgba(46, 125, 50, 0.5)'),
			[46, 125, 50],
		);
	});

	test('rejects everything else', function (assert) {
		assert.strictEqual(detectColour('not a colour'), null);
		assert.strictEqual(detectColour('#2e7d3'), null);
		assert.strictEqual(detectColour('cmyk(63, 0, 59, 51)'), null);
	});
});
