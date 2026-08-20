import { module, test } from 'qunit';
import { wordsToCues, type Word } from 'delphitools-v2/lib/transcribe';

const w = (text: string, start: number, end: number): Word => ({
	text,
	start,
	end,
});

module('Unit | Lib | transcribe', function () {
	test('empty input yields no cues', function (assert) {
		assert.deepEqual(wordsToCues([]), []);
	});

	test('a short sentence is one cue, timed to its span', function (assert) {
		const cues = wordsToCues([
			w('Hello', 0, 0.4),
			w('there.', 0.4, 0.9),
		]);
		assert.strictEqual(cues.length, 1);
		assert.strictEqual(cues[0]!.text, 'Hello there.');
		assert.strictEqual(cues[0]!.start, 0);
		assert.strictEqual(cues[0]!.end, 900);
	});

	test('sentence-final punctuation breaks the cue', function (assert) {
		const cues = wordsToCues([
			w('Stop.', 0, 0.5),
			w('Go', 0.6, 0.9),
			w('now.', 0.9, 1.2),
		]);
		assert.deepEqual(
			cues.map((c) => c.text),
			['Stop.', 'Go now.'],
		);
	});

	test('a long silence gap forces a new cue', function (assert) {
		const cues = wordsToCues([
			w('one', 0, 0.3),
			w('two', 0.4, 0.7),
			// 1.5 s gap > GAP_BREAK
			w('three', 2.2, 2.5),
		]);
		assert.deepEqual(
			cues.map((c) => c.text),
			['one two', 'three'],
		);
	});

	test('a line over the char cap splits without punctuation', function (assert) {
		// eight 8-char words, no punctuation: exceeds the 42-char line.
		const words = Array.from({ length: 8 }, (_, i) =>
			w('abcdefgh', i * 0.3, i * 0.3 + 0.25),
		);
		const cues = wordsToCues(words);
		assert.true(cues.length > 1, 'splits into multiple cues');
		assert.true(
			cues.every((c) => c.text.length <= 42),
			'no cue exceeds the line cap',
		);
	});

	test('null-timestamp words carry the cursor forward', function (assert) {
		// readWords is internal; wordsToCues assumes resolved numbers, but a
		// zero-length word (start === end) must not crash or reorder.
		const cues = wordsToCues([w('a', 1, 1), w('b.', 1, 1.2)]);
		assert.strictEqual(cues.length, 1);
		assert.strictEqual(cues[0]!.start, 1000);
		assert.strictEqual(cues[0]!.end, 1200);
	});
});
