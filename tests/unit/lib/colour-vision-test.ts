import { module, test } from 'qunit';
import { simulateHex } from 'delphitools-v2/lib/colour-vision';

module('Unit | Lib | colour-vision', function () {
	test('normal vision is the identity', function (assert) {
		assert.strictEqual(simulateHex('#2e7d32', 'normal'), '#2e7d32');
	});

	test('achromatopsia is the BT.601 grey', function (assert) {
		// 0.299*46 + 0.587*125 + 0.114*50 ≈ 93
		assert.strictEqual(
			simulateHex('#2e7d32', 'achromatopsia'),
			'#5d5d5d',
		);
	});

	test('null for an unparseable hex', function (assert) {
		assert.strictEqual(simulateHex('nope', 'protanopia'), null);
	});
});
