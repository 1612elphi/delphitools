import { module, test } from 'qunit';
import { simulateHex } from 'delphitools-v2/lib/colour-vision';

module('Unit | Lib | colour-vision', function () {
	test('normal vision is the identity', function (assert) {
		assert.strictEqual(simulateHex('#2e7d32', 'normal'), '#2e7d32');
	});

	test('achromatopsia is the BT.601 grey', function (assert) {
		// bt.601 luma 0.299r+0.587g+0.114b
		assert.strictEqual(
			simulateHex('#2e7d32', 'achromatopsia'),
			'#5d5d5d',
		);
	});

	test('null for an unparseable hex', function (assert) {
		assert.strictEqual(simulateHex('nope', 'protanopia'), null);
	});
});
