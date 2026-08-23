import { module, test } from 'qunit';
import { transcribe, toText } from 'delphitools-v2/lib/ipa';

const DICT: Record<string, string[]> = {
	hello: ['HH', 'AH0', 'L', 'OW1'],
	world: ['W', 'ER1', 'L', 'D'],
	about: ['AH0', 'B', 'AW1', 'T'],
	cat: ['K', 'AE1', 'T'],
	understand: ['AH2', 'N', 'D', 'ER0', 'S', 'T', 'AE1', 'N', 'D'],
	"don't": ['D', 'OW1', 'N', 'T'],
	mankind: ['M', 'AE1', 'N', 'K', 'AY1', 'N', 'D'],
};
const lookup = (word: string) => DICT[word];

module('Unit | lib | ipa', function () {
	test('words and whitespace become tokens', function (assert) {
		assert.deepEqual(transcribe('hello world', lookup), [
			{
				type: 'word',
				value: 'hello',
				ipa: 'həˈloʊ',
				guess: false,
			},
			{ type: 'other', value: ' ' },
			{
				type: 'word',
				value: 'world',
				ipa: 'wɚld',
				guess: false,
			},
		]);
	});

	test('primary stress goes before the onset of its syllable', function (assert) {
		assert.deepEqual(toText(transcribe('about', lookup)), 'əˈbaʊt');
	});

	test('a monosyllable carries no stress mark', function (assert) {
		assert.deepEqual(toText(transcribe('cat', lookup)), 'kæt');
	});

	test('secondary stress is marked', function (assert) {
		assert.deepEqual(
			toText(transcribe('understand', lookup)),
			'ˌʌndɚˈstænd',
		);
	});

	test('earlier primaries drop to secondary', function (assert) {
		assert.deepEqual(
			toText(transcribe('mankind', lookup)),
			'ˌmæˈnkaɪnd',
		);
	});

	test('an unknown word is guessed and flagged', function (assert) {
		const tokens = transcribe('blorptastic', lookup);
		assert.propContains(tokens[0], {
			type: 'word',
			value: 'blorptastic',
			guess: true,
		});
		assert.notStrictEqual(toText(tokens), '');
	});

	test('punctuation, case and apostrophes survive', function (assert) {
		assert.deepEqual(
			toText(transcribe("Hello, world! Don't.", lookup)),
			'həˈloʊ, wɚld! doʊnt.',
		);
	});
});
