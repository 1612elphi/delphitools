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
		assert.deepEqual(srtIds, ['subtitle-converter']);
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
});
