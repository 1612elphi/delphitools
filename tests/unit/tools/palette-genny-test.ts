import { module, test } from 'qunit';
import { coloursFromQuery } from 'delphitools-v2/components/tools/palette-genny';

module('Unit | Tool | palette-genny | share link', function () {
	test('accepts bare hex', function (assert) {
		assert.deepEqual(coloursFromQuery('?colors=1a2744,2c4a7c'), [
			'#1a2744',
			'#2c4a7c',
		]);
	});

	test('accepts hex with a leading hash', function (assert) {
		assert.deepEqual(
			coloursFromQuery('?colors=%231a2744,%232c4a7c'),
			['#1a2744', '#2c4a7c'],
		);
	});

	test('tolerates whitespace around each value', function (assert) {
		assert.deepEqual(
			coloursFromQuery('?colors= 1a2744 , 2c4a7c '),
			['#1a2744', '#2c4a7c'],
		);
	});

	// Below the minimum the tool would render a stub, so a fresh palette is
	// better than an honoured but unusable link.
	test('rejects a single colour', function (assert) {
		assert.strictEqual(coloursFromQuery('?colors=1a2744'), null);
	});

	test('drops malformed values and rejects what is left if too few', function (assert) {
		assert.strictEqual(
			coloursFromQuery('?colors=notahex,zzz'),
			null,
		);
		assert.deepEqual(
			coloursFromQuery('?colors=1a2744,zzz,2c4a7c'),
			['#1a2744', '#2c4a7c'],
		);
	});

	test('rejects three- and eight-digit hex', function (assert) {
		assert.strictEqual(coloursFromQuery('?colors=abc,def'), null);
		assert.strictEqual(
			coloursFromQuery('?colors=1a2744ff,2c4a7cff'),
			null,
		);
	});

	test('returns null without the param', function (assert) {
		assert.strictEqual(coloursFromQuery(''), null);
		assert.strictEqual(coloursFromQuery('?other=1'), null);
		assert.strictEqual(coloursFromQuery('?colors='), null);
	});
});
