import { module, test } from 'qunit';
import {
	dots,
	fromBraille,
	looksLikeBraille,
	toBraille,
} from 'delphitools-v2/lib/braille';

module('Unit | lib | braille', function () {
	test('letters', function (assert) {
		assert.strictEqual(
			toBraille('abcdefghijklmnopqrstuvwxyz'),
			'⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵',
		);
		assert.strictEqual(fromBraille('⠁⠃⠉⠭⠽⠵'), 'abcxyz');
	});

	test('capital and numeric indicators', function (assert) {
		assert.strictEqual(toBraille('Hello 42'), '⠠⠓⠑⠇⠇⠕ ⠼⠙⠃');
		assert.strictEqual(fromBraille('⠠⠓⠑⠇⠇⠕ ⠼⠙⠃'), 'Hello 42');
	});

	test('all-caps word', function (assert) {
		assert.strictEqual(toBraille('NASA'), '⠠⠠⠝⠁⠎⠁');
		assert.strictEqual(fromBraille('⠠⠠⠝⠁⠎⠁ ⠕⠅'), 'NASA ok');
		assert.strictEqual(toBraille('McDonald'), '⠠⠍⠉⠠⠙⠕⠝⠁⠇⠙');
		assert.strictEqual(toBraille('A'), '⠠⠁');
	});

	test('numeric mode ends at a letter', function (assert) {
		assert.strictEqual(toBraille('42k'), '⠼⠙⠃⠅');
		assert.strictEqual(fromBraille('⠼⠙⠃⠅'), '42k');
		assert.strictEqual(toBraille('42a'), '⠼⠙⠃⠰⠁');
		assert.strictEqual(fromBraille('⠼⠙⠃⠰⠁'), '42a');
		assert.strictEqual(toBraille('3.14'), '⠼⠉⠲⠁⠙');
		assert.strictEqual(fromBraille('⠼⠉⠲⠁⠙'), '3.14');
	});

	test('punctuation', function (assert) {
		assert.strictEqual(
			toBraille(`,;:.!?'-()/ "hi"`),
			'⠂⠆⠒⠲⠖⠦⠄⠤⠐⠣⠐⠜⠸⠌ ⠦⠓⠊⠴',
		);
		assert.strictEqual(
			fromBraille('⠂⠆⠒⠲⠖⠦⠄⠤⠐⠣⠐⠜⠸⠌ ⠦⠓⠊⠴'),
			`,;:.!?'-()/ "hi"`,
		);
	});

	test('unknown characters pass through', function (assert) {
		assert.strictEqual(toBraille('a & é\n'), '⠁ & é\n');
		assert.strictEqual(fromBraille('⠁ & é\n'), 'a & é\n');
	});

	test('round trip', function (assert) {
		const sentence =
			'The Quick brown fox, at 3:45, said "NO!" (twice).';
		assert.strictEqual(fromBraille(toBraille(sentence)), sentence);
	});

	test('dots', function (assert) {
		assert.strictEqual(dots('⠓'), '1-2-5');
		assert.strictEqual(dots('⠠'), '6');
		assert.strictEqual(dots('⣿'), '1-2-3-4-5-6-7-8');
		assert.strictEqual(dots('⠀'), '');
		assert.strictEqual(dots('a'), '');
	});

	test('looksLikeBraille', function (assert) {
		assert.true(looksLikeBraille('hi ⠓'));
		assert.false(looksLikeBraille('hi'));
		assert.false(looksLikeBraille(''));
	});
});
