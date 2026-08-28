import { module, test } from 'qunit';
import {
	SEMAPHORE,
	flagSvg,
	semaphoreSvg,
} from 'delphitools-v2/lib/signal-flags';

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

module('Unit | lib | signal-flags', function () {
	test('every letter has a flag and a semaphore signal', function (assert) {
		for (const letter of LETTERS) {
			assert.true(
				flagSvg(letter).startsWith('<svg'),
				`flag ${letter}`,
			);
			const angles = SEMAPHORE[letter]!;
			assert.strictEqual(
				angles.length,
				2,
				`semaphore ${letter}`,
			);
			assert.notStrictEqual(
				angles[0],
				angles[1],
				`arms of ${letter} differ`,
			);
			for (const angle of angles) {
				const step =
					angle % 45 === 0 &&
					angle >= 0 &&
					angle < 360;
				assert.true(
					step,
					`angle ${angle} of ${letter} is a 45° step`,
				);
			}
		}
	});

	test('no two letters share a signal', function (assert) {
		const seen = new Set(
			LETTERS.map((l) =>
				[...SEMAPHORE[l]!].sort((a, b) => a - b).join(),
			),
		);
		assert.strictEqual(seen.size, LETTERS.length);
	});

	test('Quebec is a plain yellow rectangle', function (assert) {
		const q = flagSvg('Q');
		assert.strictEqual(q.match(/<rect/g)?.length, 1);
		assert.true(q.includes('#f5c928'));
	});

	test('Alfa and Bravo are swallowtailed', function (assert) {
		assert.true(flagSvg('A').includes('L95 45'));
		assert.true(flagSvg('B').includes('95 45'));
		assert.false(flagSvg('C').includes('95 45'));
	});

	test('November is chequy of sixteen', function (assert) {
		assert.strictEqual(flagSvg('N').match(/<rect/g)?.length, 16);
	});

	test('unknown characters have no chart entry', function (assert) {
		assert.strictEqual(flagSvg('5'), '');
		assert.strictEqual(semaphoreSvg('ß'), '');
	});

	test('lower case resolves to the same letter', function (assert) {
		assert.strictEqual(flagSvg('m'), flagSvg('M'));
	});

	test('Delta arms point straight up and down', function (assert) {
		const d = semaphoreSvg('D');
		assert.true(d.includes('x2="24.0" y2="44.0"'), 'down arm');
		assert.true(d.includes('x2="24.0" y2="4.0"'), 'up arm');
	});
});
