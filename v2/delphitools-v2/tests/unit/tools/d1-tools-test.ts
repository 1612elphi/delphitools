// The pure logic behind the smallest tools. One file rather than eight,
// because each exports only a function or two and they are all the same shape:
// a value in, a formatted string or a count out.

import { module, test } from 'qunit';
import { countText } from 'delphitools-v2/components/tools/word-counter';
import { pxToRem, remToPx } from 'delphitools-v2/components/tools/px-to-rem';
import { lineHeightPx } from 'delphitools-v2/components/tools/line-height-calc';
import {
	looksLikeSvg,
	formatBytes,
} from 'delphitools-v2/components/tools/svg-optimiser';
import { previewHost } from 'delphitools-v2/components/tools/meta-tag-genny';

module('Unit | Tools | D1', function () {
	module('word-counter', function () {
		test('counts an ordinary sentence', function (assert) {
			const s = countText('The quick brown fox.');
			assert.strictEqual(s.words, 4, 'words');
			assert.strictEqual(s.characters, 20, 'characters');
			assert.strictEqual(
				s.charactersNoSpaces,
				17,
				'characters without spaces',
			);
			assert.strictEqual(s.sentences, 1, 'sentences');
		});

		test('counts nothing in an empty string', function (assert) {
			const s = countText('');
			assert.strictEqual(s.words, 0);
			assert.strictEqual(s.characters, 0);
			assert.strictEqual(s.sentences, 0);
		});

		// Runs of whitespace are one separator, not several empty words.
		test('does not count whitespace as words', function (assert) {
			assert.strictEqual(countText('   \n\t  ').words, 0);
			assert.strictEqual(countText('one    two').words, 2);
		});

		test('separates paragraphs on blank lines', function (assert) {
			const s = countText('First para.\n\nSecond para.');
			assert.strictEqual(s.paragraphs, 2, 'paragraphs');
			assert.strictEqual(
				s.lines,
				3,
				'lines, blank one included',
			);
		});

		test('reports a reading and a speaking time', function (assert) {
			const s = countText('word '.repeat(400));
			assert.true(s.readingTime.length > 0, s.readingTime);
			assert.true(s.speakingTime.length > 0, s.speakingTime);
		});
	});

	module('px-to-rem', function () {
		test('converts against the base', function (assert) {
			assert.strictEqual(pxToRem(16, 16), '1');
			assert.strictEqual(pxToRem(24, 16), '1.5');
			assert.strictEqual(pxToRem(8, 16), '0.5');
		});

		test('round-trips', function (assert) {
			for (const px of [1, 12, 16, 37.5, 100]) {
				const rem = Number(pxToRem(px, 16));
				assert.strictEqual(
					Number(remToPx(rem, 16)),
					px,
					`${px}px`,
				);
			}
		});

		test('honours a base other than 16', function (assert) {
			assert.strictEqual(pxToRem(20, 10), '2');
			assert.strictEqual(remToPx(2, 10), '20');
		});
	});

	module('line-height-calc', function () {
		// One decimal place, matching the Next app: a ratio rarely lands on a
		// whole pixel and rounding to one hides that.
		test('multiplies size by ratio, to one decimal place', function (assert) {
			assert.strictEqual(lineHeightPx(16, 1.5), '24.0');
			assert.strictEqual(lineHeightPx(20, 1.2), '24.0');
			assert.strictEqual(lineHeightPx(16, 1.618), '25.9');
		});
	});

	module('svg-optimiser', function () {
		test('recognises an svg by its opening tag', function (assert) {
			assert.true(
				looksLikeSvg('<svg viewBox="0 0 1 1"></svg>'),
			);
			assert.true(
				looksLikeSvg('  \n<?xml version="1.0"?><svg/>'),
				'leading whitespace and an xml declaration',
			);
		});

		test('rejects anything else', function (assert) {
			assert.false(looksLikeSvg(''));
			assert.false(looksLikeSvg('<html></html>'));
			assert.false(
				looksLikeSvg('text mentioning <svg> midway'),
				'the tag has to open the document',
			);
		});

		test('formats byte counts', function (assert) {
			assert.true(
				/^0\b/.test(formatBytes(0)),
				formatBytes(0),
			);
			assert.true(
				/KB|kB/i.test(formatBytes(2048)),
				formatBytes(2048),
			);
		});
	});

	module('meta-tag-genny', function () {
		test('takes the hostname out of a url', function (assert) {
			assert.strictEqual(
				previewHost(
					'https://delphi.tools/tools/qr-genny',
				),
				'delphi.tools',
			);
		});

		// The preview should never blank out while a url is half-typed.
		test('falls back rather than throwing on a broken url', function (assert) {
			assert.true(previewHost('not a url').length > 0);
			assert.true(previewHost('').length > 0);
		});
	});
});
