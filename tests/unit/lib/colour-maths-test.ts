import { module, test } from 'qunit';
import { rgbToCmyk } from 'delphitools-v2/lib/colour-maths';

module('Unit | Lib | colour-maths', function () {
	test('rgbToCmyk converts the primaries and white', function (assert) {
		assert.deepEqual(
			rgbToCmyk(255, 255, 255),
			[0, 0, 0, 0],
			'white',
		);
		assert.deepEqual(rgbToCmyk(255, 0, 0), [0, 100, 100, 0], 'red');
		assert.deepEqual(
			rgbToCmyk(0, 255, 0),
			[100, 0, 100, 0],
			'green',
		);
		assert.deepEqual(
			rgbToCmyk(0, 0, 255),
			[100, 100, 0, 0],
			'blue',
		);
	});

	test('rgbToCmyk pulls black out of a mid grey', function (assert) {
		assert.deepEqual(rgbToCmyk(128, 128, 128), [0, 0, 0, 50]);
	});

	test('rgbToCmyk short-circuits pure black', function (assert) {
		assert.deepEqual(rgbToCmyk(0, 0, 0), [0, 0, 0, 100]);
	});
});
