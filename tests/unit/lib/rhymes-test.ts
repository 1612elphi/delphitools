import { module, test } from 'qunit';
import { indexRhymes, rhymeKey, rhymesFor } from 'delphitools-v2/lib/rhymes';

const dictionary = new Map([
	['nation', ['N', 'EY1', 'SH', 'AH0', 'N']],
	['station', ['S', 'T', 'EY1', 'SH', 'AH0', 'N']],
	['creation', ['K', 'R', 'IY0', 'EY1', 'SH', 'AH0', 'N']],
	['bacon', ['B', 'EY1', 'K', 'AH0', 'N']],
	['cat', ['K', 'AE1', 'T']],
	['the', ['DH', 'AH0']],
]);
const common = new Map([['station', []]]);

module('Unit | lib | rhymes', function () {
	test('the key starts at the last primary stress', function (assert) {
		assert.strictEqual(
			rhymeKey(dictionary.get('creation')!, 'perfect'),
			'EY SH AH N',
		);
		assert.strictEqual(
			rhymeKey(dictionary.get('creation')!, 'near'),
			'EY AH',
		);
		assert.strictEqual(
			rhymeKey(dictionary.get('the')!, 'perfect'),
			'AH',
		);
	});

	test('perfect rhymes group by syllables, the word left out', function (assert) {
		const index = indexRhymes(dictionary, 'perfect');
		assert.deepEqual(
			rhymesFor(
				'nation',
				dictionary,
				index,
				'perfect',
				common,
			),
			[
				{ syllables: 2, words: ['station'] },
				{ syllables: 3, words: ['creation'] },
			],
		);
	});

	test('near rhymes match vowels only, common words first', function (assert) {
		const index = indexRhymes(dictionary, 'near');
		assert.deepEqual(
			rhymesFor('nation', dictionary, index, 'near', common),
			[
				{ syllables: 2, words: ['station', 'bacon'] },
				{ syllables: 3, words: ['creation'] },
			],
		);
	});

	test('an unknown word has no answer', function (assert) {
		const index = indexRhymes(dictionary, 'perfect');
		assert.strictEqual(
			rhymesFor('zzz', dictionary, index, 'perfect', common),
			null,
		);
		assert.deepEqual(
			rhymesFor('cat', dictionary, index, 'perfect', common),
			[],
		);
	});
});
