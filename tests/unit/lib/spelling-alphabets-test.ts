import { module, test } from 'qunit';
import {
	ALPHABETS,
	looksSpelled,
	spell,
	spellText,
	unspell,
} from 'delphitools-v2/lib/spelling-alphabets';

const [nato, din5009, german] = ALPHABETS as [
	(typeof ALPHABETS)[number],
	(typeof ALPHABETS)[number],
	(typeof ALPHABETS)[number],
];

module('Unit | lib | spelling-alphabets', function () {
	test('spell gives one entry per character in each table', function (assert) {
		assert.deepEqual(spell('Hi 5', nato), [
			{ char: 'H', word: 'Hotel' },
			{ char: 'i', word: 'India' },
			{ char: ' ', word: null },
			{ char: '5', word: 'Five' },
		]);
		assert.deepEqual(
			spell('Hi 5', din5009).map((c) => c.word),
			['Hamburg', 'Ingelheim', null, 'Fünf'],
		);
		assert.deepEqual(
			spell('Hi 5', german).map((c) => c.word),
			['Heinrich', 'Ida', null, 'Fünf'],
		);
	});

	test('spell keeps the source case and matches umlauts and eszett', function (assert) {
		assert.deepEqual(
			spell('äÖß', din5009).map((c) => c.char),
			['ä', 'Ö', 'ß'],
		);
		assert.deepEqual(
			spell('äÖß', din5009).map((c) => c.word),
			['Umlaut Aachen', 'Umlaut Offenbach', 'Eszett'],
		);
		assert.strictEqual(spell('!', nato)[0]?.word, null);
	});

	test('spellText joins words and marks a space with a slash', function (assert) {
		assert.strictEqual(
			spellText('Hi 5', nato),
			'Hotel India / Five',
		);
		assert.strictEqual(spellText('a!', nato), 'Alfa !');
	});

	test('unspell reads a spelled text back', function (assert) {
		assert.strictEqual(
			unspell(spellText('HELLO WORLD 42', nato), nato),
			'HELLO WORLD 42',
		);
		assert.strictEqual(unspell('tango echo', nato), 'TE');
		assert.strictEqual(unspell('X-ray Xray xray', nato), 'XXX');
		assert.strictEqual(
			unspell('Umlaut Aachen Aachen Eszett', din5009),
			'ÄAß',
		);
		assert.strictEqual(unspell('tango ? echo', nato), 'T?E');
	});

	test('looksSpelled needs two tokens and every one a code word', function (assert) {
		assert.true(looksSpelled('tango echo', nato));
		assert.true(looksSpelled('Umlaut Aachen / Berlin', din5009));
		assert.false(looksSpelled('tango', nato));
		assert.false(looksSpelled('Hi 5', nato));
		assert.false(looksSpelled('tango foo', nato));
		assert.false(looksSpelled('', nato));
	});
});
