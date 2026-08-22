import { module, test } from 'qunit';
import {
	EXPORT_FORMATS,
	activeCue,
	bitrateFor,
	stripTags,
	supportedFormats,
	wrapLines,
} from 'delphitools-v2/lib/subtitle-burn';

// ten units per character, so a 40-unit maxWidth holds four characters
const measurer = {
	measureText: (text: string) => ({ width: text.length * 10 }),
};

module('Unit | Lib | subtitle-burn', function () {
	test('activeCue picks the cue covering the time, end exclusive', function (assert) {
		const cues = [
			{ start: 0, end: 1000, text: 'a' },
			{ start: 1500, end: 2000, text: 'b' },
		];
		assert.strictEqual(activeCue(cues, 0)?.text, 'a');
		assert.strictEqual(activeCue(cues, 999)?.text, 'a');
		assert.strictEqual(activeCue(cues, 1000), undefined);
		assert.strictEqual(activeCue(cues, 1200), undefined);
		assert.strictEqual(activeCue(cues, 1500)?.text, 'b');
		assert.strictEqual(activeCue(cues, 2500), undefined);
	});

	test('stripTags drops VTT inline markup', function (assert) {
		assert.strictEqual(
			stripTags('<v Ruby>Hello <i>there</i></v>'),
			'Hello there',
		);
	});

	test('wrapLines keeps explicit breaks and wraps long lines on spaces', function (assert) {
		assert.deepEqual(wrapLines(measurer, 'ab cd\nef', 100), [
			'ab cd',
			'ef',
		]);
		assert.deepEqual(wrapLines(measurer, 'one two three', 70), [
			'one two',
			'three',
		]);
		assert.deepEqual(wrapLines(measurer, 'longword x', 30), [
			'longword',
			'x',
		]);
		assert.deepEqual(wrapLines(measurer, '', 30), []);
	});

	test('export formats carry a container-matching extension', function (assert) {
		for (const format of EXPORT_FORMATS)
			assert.strictEqual(
				format.ext,
				format.mime.startsWith('video/mp4')
					? 'mp4'
					: 'webm',
				format.id,
			);
		const formats = supportedFormats();
		assert.strictEqual(formats.length, EXPORT_FORMATS.length);
		assert.ok(
			formats.some((f) => f.supported),
			'Chrome encodes at least one',
		);
	});

	test('bitrateFor scales with the frame and clamps', function (assert) {
		assert.strictEqual(bitrateFor(1920, 1080), 7_464_960);
		assert.strictEqual(bitrateFor(320, 180), 1_000_000);
		assert.strictEqual(bitrateFor(7680, 4320), 40_000_000);
	});
});
