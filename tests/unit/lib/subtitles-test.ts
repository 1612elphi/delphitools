import { module, test } from 'qunit';
import {
	detectFormat,
	formatTimestamp,
	parseSubtitles,
	parseTimestamp,
	scaleCues,
	shiftCues,
	writeSrt,
	writeVtt,
} from 'delphitools-v2/lib/subtitles';

const SRT = `1
00:00:01,000 --> 00:00:02,500
First line

2
00:00:03,000 --> 00:00:04,000
Second cue
with two lines
`;

const VTT = `WEBVTT

NOTE a comment block

intro
00:01.000 --> 00:02.500 position:10%,line-left align:center
First line

00:00:03.000 --> 00:00:04.000
Second cue
`;

module('Unit | Lib | subtitles', function () {
	test('parses timestamps in both notations', function (assert) {
		assert.strictEqual(parseTimestamp('00:00:01,000'), 1000);
		assert.strictEqual(parseTimestamp('01:02:03.004'), 3_723_004);
		assert.strictEqual(parseTimestamp('02:03.004'), 123_004);
		assert.strictEqual(parseTimestamp('nonsense'), null);
	});

	test('formats timestamps zero-padded', function (assert) {
		assert.strictEqual(formatTimestamp(1000, ','), '00:00:01,000');
		assert.strictEqual(
			formatTimestamp(3_723_004, '.'),
			'01:02:03.004',
		);
		assert.strictEqual(formatTimestamp(-5, ','), '00:00:00,000');
	});

	test('detects the format', function (assert) {
		assert.strictEqual(detectFormat(VTT), 'vtt');
		assert.strictEqual(detectFormat(SRT), 'srt');
		assert.strictEqual(detectFormat('plain text'), null);
	});

	test('parses srt blocks, dropping the index line', function (assert) {
		assert.deepEqual(parseSubtitles(SRT), [
			{ start: 1000, end: 2500, text: 'First line' },
			{
				start: 3000,
				end: 4000,
				text: 'Second cue\nwith two lines',
			},
		]);
	});

	test('parses crlf input', function (assert) {
		const cues = parseSubtitles(SRT.replace(/\n/g, '\r\n'));
		assert.strictEqual(cues.length, 2);
		assert.strictEqual(cues[1]?.text, 'Second cue\nwith two lines');
	});

	test('parses vtt, skipping header, notes, ids and settings', function (assert) {
		assert.deepEqual(parseSubtitles(VTT), [
			{ start: 1000, end: 2500, text: 'First line' },
			{ start: 3000, end: 4000, text: 'Second cue' },
		]);
	});

	test('writes srt', function (assert) {
		const cues = parseSubtitles(VTT);
		assert.strictEqual(
			writeSrt(cues),
			'1\n00:00:01,000 --> 00:00:02,500\nFirst line\n\n' +
				'2\n00:00:03,000 --> 00:00:04,000\nSecond cue\n',
		);
	});

	test('writes vtt and round-trips through the parser', function (assert) {
		const cues = parseSubtitles(SRT);
		const vtt = writeVtt(cues);
		assert.true(vtt.startsWith('WEBVTT\n\n'));
		assert.deepEqual(parseSubtitles(vtt), cues);
	});

	test('vtt header carries kind and language, and still parses', function (assert) {
		const cues = parseSubtitles(SRT);
		const vtt = writeVtt(cues, {
			kind: 'captions',
			language: 'en-GB',
		});
		assert.true(
			vtt.startsWith(
				'WEBVTT\nKind: captions\nLanguage: en-GB\n\n',
			),
		);
		assert.deepEqual(parseSubtitles(vtt), cues);
		assert.true(
			writeVtt(cues, { kind: '  ' }).startsWith('WEBVTT\n\n'),
			'blank fields write no header line',
		);
	});

	test('shifts with a floor at zero', function (assert) {
		const cues = [{ start: 500, end: 1500, text: 'a' }];
		assert.deepEqual(shiftCues(cues, 1000), [
			{ start: 1500, end: 2500, text: 'a' },
		]);
		assert.deepEqual(shiftCues(cues, -1000), [
			{ start: 0, end: 500, text: 'a' },
		]);
		assert.deepEqual(shiftCues(cues, -2000), [
			{ start: 0, end: 0, text: 'a' },
		]);
	});

	test('scales timestamps', function (assert) {
		const cues = [{ start: 1000, end: 2000, text: 'a' }];
		assert.deepEqual(scaleCues(cues, 1.5), [
			{ start: 1500, end: 3000, text: 'a' },
		]);
	});
});
