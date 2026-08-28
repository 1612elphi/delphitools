import { module, test } from 'qunit';
import {
	decode,
	encode,
	looksLikeMorse,
	timings,
} from 'delphitools-v2/lib/morse';

module('Unit | lib | morse', function () {
	test('SOS both ways', function (assert) {
		assert.strictEqual(encode('SOS'), '... --- ...');
		assert.strictEqual(decode('... --- ...'), 'SOS');
	});

	test('a sentence round trips', function (assert) {
		const morse = encode('the quick brown fox');
		assert.strictEqual(
			morse,
			'- .... . / --.- ..- .. -.-. -.- / -... .-. --- .-- -. / ..-. --- -..-',
		);
		assert.strictEqual(decode(morse), 'THE QUICK BROWN FOX');
	});

	test('punctuation', function (assert) {
		assert.strictEqual(
			encode('Hi, you?'),
			'.... .. --..-- / -.-- --- ..- ..--..',
		);
		assert.strictEqual(
			decode('.--.-. / .-.-.- -....- -.-.--'),
			'@ .-!',
		);
	});

	test('characters outside the table are dropped', function (assert) {
		assert.strictEqual(encode('a~b ~ c'), '.- -... / -.-.');
		assert.strictEqual(encode('a \t\n  b'), '.- / -...');
	});

	test('alternative dit and dah glyphs decode', function (assert) {
		assert.strictEqual(decode('··· ——— •••'), 'SOS');
		assert.strictEqual(decode('··· ––– ···'), 'SOS');
		assert.strictEqual(decode('_ ___'), 'TO');
	});

	test('word gap forms', function (assert) {
		assert.strictEqual(decode('... --- .../- . .-.-.-'), 'SOS TE.');
		assert.strictEqual(decode('... --- ...   -'), 'SOS T');
		assert.strictEqual(decode('... --- ... / -'), 'SOS T');
	});

	test('an unknown code becomes U+FFFD', function (assert) {
		assert.strictEqual(decode('... ........ ...'), 'S�S');
	});

	test('looksLikeMorse', function (assert) {
		assert.true(looksLikeMorse('... --- ...'));
		assert.true(looksLikeMorse(' ··· / —•— \n'));
		assert.false(looksLikeMorse('SOS'));
		assert.false(looksLikeMorse(''));
		assert.false(looksLikeMorse('.-x'));
	});

	test('timings for "E T" at 20 wpm', function (assert) {
		assert.deepEqual(timings('. -', 20), [
			{ on: true, ms: 60 },
			{ on: false, ms: 180 },
			{ on: true, ms: 180 },
		]);
	});

	test('timings inside a letter and across words', function (assert) {
		assert.deepEqual(timings('.. / .', 12), [
			{ on: true, ms: 100 },
			{ on: false, ms: 100 },
			{ on: true, ms: 100 },
			{ on: false, ms: 700 },
			{ on: true, ms: 100 },
		]);
	});
});
