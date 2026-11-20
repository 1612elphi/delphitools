import { module, test } from 'qunit';
import {
	bayerMatrix,
	dither,
	DITHER_ALGORITHMS,
} from 'delphitools-v2/lib/dither';

function flat(side: number, grey: number, alpha = 255) {
	const data = new Uint8ClampedArray(side * side * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = data[i + 1] = data[i + 2] = grey;
		data[i + 3] = alpha;
	}
	return data;
}

module('Unit | Lib | dither', function () {
	test('bayer matrices', function (assert) {
		assert.deepEqual(bayerMatrix(2), [
			[0, 2],
			[3, 1],
		]);
		assert.deepEqual(
			bayerMatrix(4)
				.flat()
				.sort((a, b) => a - b),
			Array.from({ length: 16 }, (_, i) => i),
		);
	});

	test('every algorithm keeps mid grey near half white', function (assert) {
		for (const { id } of DITHER_ALGORITHMS) {
			const data = flat(64, 128, 200);
			dither(data, 64, 64, {
				algorithm: id,
				colour: false,
				levels: 2,
				scale: 1,
			});
			let white = 0;
			let other = 0;
			for (let i = 0; i < data.length; i += 4) {
				if (data[i] === 255) white++;
				else if (data[i] !== 0) other++;
				if (data[i + 3] !== 200) other++;
			}
			assert.strictEqual(other, 0, `${id} is two level`);
			const share = white / (64 * 64);
			assert.true(
				Math.abs(share - 0.5) < 0.1,
				`${id} white share ${share}`,
			);
		}
	});

	test('colour levels and cell size', function (assert) {
		const data = new Uint8ClampedArray(8 * 8 * 4);
		for (let i = 0; i < data.length; i++) data[i] = (i * 37) % 256;
		dither(data, 8, 8, {
			algorithm: 'bayer-4',
			colour: true,
			levels: 4,
			scale: 4,
		});
		const allowed = [0, 85, 170, 255];
		let bad = 0;
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 8; x++)
				for (let k = 0; k < 3; k++) {
					const v = data[(y * 8 + x) * 4 + k]!;
					const cell =
						data[
							((y & 4) * 8 +
								(x & 4)) *
								4 +
								k
						]!;
					if (!allowed.includes(v) || v !== cell)
						bad++;
				}
		assert.strictEqual(bad, 0);
	});
});
