import { module, test } from 'qunit';
import { reverseIndex, toLatin } from 'delphitools-v2/lib/shavian/reverse';

const core = new Map([
	['to', ['T', 'UW1']],
	['you', ['Y', 'UW1']],
	['there', ['DH', 'EH1', 'R']],
	['their', ['DH', 'EH1', 'R']],
	['i', ['AY1']],
]);
const full = new Map([
	...core,
	['too', ['T', 'UW1']],
	['two', ['T', 'UW1']],
	['eye', ['AY1']],
	['ewe', ['Y', 'UW1']],
]);
const index = reverseIndex(core, full);
const text = (shavian: string, picks?: Map<number, number>) =>
	toLatin(shavian, index, picks)
		.map((t) => t.latin)
		.join('');

module('Unit | lib | shavian reverse', function () {
	test('homophones share a spelling, the common word first', function (assert) {
		assert.deepEqual(index.get('𐑑'), ['to']);
		assert.deepEqual(index.get('𐑑𐑵'), ['too', 'two']);
		assert.deepEqual(index.get('𐑿'), ['you', 'ewe']);
	});

	test('text keeps punctuation and capitalises sentences', function (assert) {
		assert.strictEqual(text('𐑿 𐑑𐑵. 𐑲 𐑑𐑵!'), 'You too. I too!');
	});

	test('a pick chooses another candidate', function (assert) {
		assert.strictEqual(text('𐑿 𐑑𐑵', new Map([[2, 1]])), 'You two');
	});

	test('markers and unknown words', function (assert) {
		assert.strictEqual(text('𐑑𐑵 ·𐑿 ⸰𐑲 𐑐𐑐'), 'Too You I 𐑐𐑐');
		assert.deepEqual(toLatin('𐑐𐑐', index)[0]!.candidates, []);
	});
});
