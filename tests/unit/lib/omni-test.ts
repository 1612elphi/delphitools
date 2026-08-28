import { module, test } from 'qunit';
import { readInput, searchTools, toolsForFile } from 'delphitools-v2/lib/omni';

function answerFor(
	reading: Awaited<ReturnType<typeof readInput>>,
	toolId: string,
) {
	return reading?.answers.find((a) => a.toolId === toolId);
}

module('Unit | Lib | omni', function () {
	test('search matches names and descriptions', function (assert) {
		const hits = searchTools('pal').map((t) => t.id);
		assert.true(hits.includes('palette-genny'));
		assert.true(hits.includes('palette-extractor'));
		assert.false(hits.includes('word-counter'));
		assert.deepEqual(searchTools('  '), []);
	});

	test('routes a file by the accepts field', function (assert) {
		const png = new File([''], 'IMG_2041.png', {
			type: 'image/png',
		});
		const ids = toolsForFile(png).map((t) => t.id);
		assert.true(ids.includes('image-converter'));
		assert.true(ids.includes('image-clipper'));
		assert.false(ids.includes('subtitle-converter'));

		const srt = new File([''], 'film.srt', { type: '' });
		const srtIds = toolsForFile(srt).map((t) => t.id);
		assert.deepEqual(srtIds, [
			'subtitle-converter',
			'subtitle-studio',
		]);
	});

	test('a colour input answers with the colour rows and a carry list', async function (assert) {
		const reading = await readInput('#2E7D32');
		assert.ok(reading, 'reads as a colour');

		assert.strictEqual(
			reading?.answers[0]?.toolId,
			'colour-atlas',
			'atlas is the headline row',
		);
		assert.true(
			answerFor(reading, 'colour-converter')?.value.includes(
				'rgb(46 125 50)',
			),
		);
		assert.strictEqual(
			answerFor(reading, 'tailwind-shades')?.swatches?.length,
			11,
		);
		assert.strictEqual(
			answerFor(reading, 'harmony-genny')?.swatches?.length,
			4,
		);
		assert.deepEqual(reading?.carryQuery, { color: '2e7d32' });
		assert.true((reading?.carry ?? []).every((t) => t.carryColour));
		assert.false(
			(reading?.carry ?? []).some(
				(t) => t.id === 'colour-atlas',
			),
			'answered tools stay out of the carry list',
		);
	});

	test('a bare digit run is a number, not hex', async function (assert) {
		const reading = await readInput('123456');
		assert.notOk(answerFor(reading, 'colour-atlas'));
		assert.true(
			answerFor(reading, 'base-converter')?.value.includes(
				'0x1E240',
			),
		);
	});

	test('a unit value answers with rem and sibling units', async function (assert) {
		const reading = await readInput('18px');
		assert.true(
			answerFor(reading, 'px-to-rem')?.value.startsWith(
				'1.125rem',
			),
		);
		assert.true(
			answerFor(reading, 'typo-calc')?.value.includes(
				'13.5pt',
			),
		);
	});

	test('a unix timestamp answers with the iso form', async function (assert) {
		const reading = await readInput('1723372800');
		assert.true(
			answerFor(reading, 'time-calc')?.value.startsWith(
				'2024-08-11T',
			),
		);
		assert.ok(
			answerFor(reading, 'base-converter'),
			'the digits also read as a number',
		);
	});

	test('an expression answers with its value', async function (assert) {
		const reading = await readInput('2*(3+4)^2');
		assert.strictEqual(answerFor(reading, 'sci-calc')?.value, '98');
	});

	test('pasted prose answers with the word count', async function (assert) {
		const reading = await readInput(
			'the quick brown fox jumps over the lazy dog',
		);
		assert.true(
			answerFor(reading, 'word-counter')?.value.startsWith(
				'9 words',
			),
		);
	});

	test('caesar ciphertext answers with the decode', async function (assert) {
		const reading = await readInput(
			'WKH TXLFN EURZQ IRA MXPSV RYHU WKH ODCB GRJ',
		);
		const row = answerFor(reading, 'decoder');
		assert.ok(row, 'decoder row present');
		assert.true(
			row?.value
				.toLowerCase()
				.includes('the quick brown fox'),
			row?.value,
		);
	});

	test('a short search term reads as nothing', async function (assert) {
		assert.strictEqual(await readInput('pal'), null);
		assert.strictEqual(await readInput(''), null);
	});

	test('a named css colour reads as a colour', async function (assert) {
		const reading = await readInput('red');
		assert.ok(answerFor(reading, 'colour-atlas'));
		assert.true(
			answerFor(reading, 'colour-converter')?.value.includes(
				'rgb(255 0 0)',
			),
		);
	});

	test('a general unit value answers with sibling units', async function (assert) {
		const reading = await readInput('5km');
		const row = answerFor(reading, 'unit-converter');
		assert.ok(row, 'reads as a unit');
		assert.true(
			row?.value.includes('m'),
			'includes base unit metres',
		);
	});

	test('an unknown unit does not answer', async function (assert) {
		assert.notOk(
			answerFor(await readInput('5x'), 'unit-converter'),
		);
	});

	test('a base64-shaped paste decodes in the encoder row', async function (assert) {
		const reading = await readInput('aGVsbG8gd29ybGQ=');
		const row = answerFor(reading, 'encoder');
		assert.ok(row, 'encoder row present');
		assert.true(row?.value.includes('hello world'), row?.value);
	});

	test('plain text does not read as base64', async function (assert) {
		const reading = await readInput('the quick brown fox');
		const row = answerFor(reading, 'encoder');
		assert.notOk(row, 'encoder stays silent on prose');
	});

	test('a url-encoded paste decodes in the encoder row', async function (assert) {
		const reading = await readInput('hello%20world');
		const row = answerFor(reading, 'encoder');
		assert.ok(row, 'encoder row present');
		assert.true(row?.value.includes('hello world'), row?.value);
	});

	test('plain text does not read as url-encoded', async function (assert) {
		const reading = await readInput('50% off');
		const row = answerFor(reading, 'encoder');
		assert.notOk(row, 'encoder stays silent on a stray percent');
	});

	test('english words transliterate to shavian', async function (assert) {
		const reading = await readInput('hello world');
		assert.ok(
			answerFor(reading, 'shavian-transliterator'),
			'shavian row present',
		);
	});

	test('a single arbitrary word does not read as shavian', async function (assert) {
		assert.notOk(
			answerFor(
				await readInput('hello'),
				'shavian-transliterator',
			),
		);
	});

	test('a paper size name answers with its dimensions', async function (assert) {
		const reading = await readInput('A4');
		const row = answerFor(reading, 'paper-sizes');
		assert.ok(row, 'paper row present');
		assert.true(row?.value.includes('210'), row?.value);
		assert.true(row?.value.includes('297'), row?.value);
	});

	test('a non-paper-size string does not answer as paper', async function (assert) {
		assert.notOk(
			answerFor(await readInput('notapaper'), 'paper-sizes'),
		);
	});

	test('a single glyph answers with its codepoint and block', async function (assert) {
		const reading = await readInput('A');
		const row = answerFor(reading, 'glyph-browser');
		assert.ok(row, 'glyph row present');
		assert.true(row?.value.includes('U+0041'), row?.value);
	});

	test('U+XXXX answers as a glyph', async function (assert) {
		const reading = await readInput('U+1F600');
		assert.ok(
			answerFor(reading, 'glyph-browser'),
			'U+XXXX reads as glyph',
		);
	});

	test('a multi-character string does not read as a glyph', async function (assert) {
		assert.notOk(answerFor(await readInput('AB'), 'glyph-browser'));
	});

	test('a tailwind class answers with its css', async function (assert) {
		const reading = await readInput('m-4');
		const row = answerFor(reading, 'tailwind-cheatsheet');
		assert.ok(row, 'tailwind row present');
		assert.true(row?.value.includes('margin'), row?.value);
	});

	test('an unknown string does not read as a tailwind class', async function (assert) {
		assert.notOk(
			answerFor(
				await readInput('notaclass'),
				'tailwind-cheatsheet',
			),
		);
	});

	test('a url answers with a qr preview', async function (assert) {
		const reading = await readInput('https://example.com');
		const row = answerFor(reading, 'qr-genny');
		assert.ok(row, 'qr row present');
		assert.ok(
			row?.image?.startsWith('data:image/png'),
			'image is png',
		);
	});

	test('plain text does not read as a qr code', async function (assert) {
		assert.notOk(
			answerFor(await readInput('not a url'), 'qr-genny'),
		);
	});

	test('svg markup answers with optimisation stats', async function (assert) {
		const reading = await readInput(
			'<svg><rect width="10" height="10"/></svg>',
		);
		const row = answerFor(reading, 'svg-optimiser');
		assert.ok(row, 'svg row present');
		assert.true(row?.value.includes('saved'), row?.value);
	});

	test('non-svg text does not read as svg', async function (assert) {
		assert.notOk(
			answerFor(await readInput('not svg'), 'svg-optimiser'),
		);
	});

	test('an equation answers with its solution', async function (assert) {
		const reading = await readInput('x^2 - 4 = 0');
		const row = answerFor(reading, 'algebra-calc');
		assert.ok(row, 'algebra row present');
		assert.true(row?.value.includes('2'), row?.value);
	});

	test('a plain number does not read as algebra', async function (assert) {
		assert.notOk(answerFor(await readInput('123'), 'algebra-calc'));
	});
});
