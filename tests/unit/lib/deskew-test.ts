import { module, test } from 'qunit';
import {
	fitAspect,
	homography,
	insetQuad,
	outputSize,
	warp,
	type Quad,
} from 'delphitools-v2/lib/deskew';

/** Applies the coefficient list from homography() to one output point. */
function apply(h: number[], u: number, v: number) {
	const [a, b, c, d, e, f, g, k] = h as [
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
	];
	const den = g * u + k * v + 1;
	return { x: (a * u + b * v + c) / den, y: (d * u + e * v + f) / den };
}

function solid(width: number, height: number, rgba: number[]): ImageData {
	const image = new ImageData(width, height);
	for (let i = 0; i < image.data.length; i += 4) image.data.set(rgba, i);
	return image;
}

module('Unit | lib | deskew', function () {
	test('homography sends the output corners onto the quad', function (assert) {
		const quad: Quad = [
			{ x: 12, y: 8 },
			{ x: 90, y: 14 },
			{ x: 84, y: 70 },
			{ x: 5, y: 60 },
		];
		const h = homography(quad, 80, 60)!;
		const rect = [
			[0, 0],
			[80, 0],
			[80, 60],
			[0, 60],
		] as const;
		rect.forEach(([u, v], i) => {
			const { x, y } = apply(h, u, v);
			assert.true(
				Math.abs(x - quad[i]!.x) < 1e-9,
				`corner ${i} x`,
			);
			assert.true(
				Math.abs(y - quad[i]!.y) < 1e-9,
				`corner ${i} y`,
			);
		});
	});

	test('homography of a degenerate quad is null', function (assert) {
		const coincident: Quad = [
			{ x: 0, y: 0 },
			{ x: 0, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		assert.strictEqual(
			homography(coincident, 10, 10),
			null,
			'coincident',
		);
		const bowTie: Quad = [
			{ x: 0, y: 0 },
			{ x: 10, y: 10 },
			{ x: 10, y: 0 },
			{ x: 0, y: 10 },
		];
		assert.strictEqual(homography(bowTie, 10, 10), null, 'bow tie');
	});

	test('warp with the full image as the quad is the identity', function (assert) {
		const source = new ImageData(5, 4);
		for (let i = 0; i < source.data.length; i++)
			source.data[i] = (i * 37) % 256;
		const quad: Quad = [
			{ x: 0, y: 0 },
			{ x: 5, y: 0 },
			{ x: 5, y: 4 },
			{ x: 0, y: 4 },
		];
		const out = warp(source, quad, 5, 4);
		assert.deepEqual([...out.data], [...source.data]);
	});

	test('warp pulls a sub-quad up to the output size', function (assert) {
		// Left half red, right half blue; the quad is the right half.
		const source = new ImageData(8, 4);
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 8; x++) {
				const i = (y * 8 + x) * 4;
				source.data.set(
					x < 4
						? [255, 0, 0, 255]
						: [0, 0, 255, 255],
					i,
				);
			}
		}
		const quad: Quad = [
			{ x: 4, y: 0 },
			{ x: 8, y: 0 },
			{ x: 8, y: 4 },
			{ x: 4, y: 4 },
		];
		const out = warp(source, quad, 8, 8);
		// Output pixel 0 samples source x = 4.25, a blend across the edge.
		assert.true(
			out.data[2]! > out.data[0]!,
			'first pixel is mostly blue',
		);
		for (let y = 0; y < 8; y++) {
			for (let x = 1; x < 8; x++) {
				const i = (y * 8 + x) * 4;
				assert.deepEqual(
					[...out.data.slice(i, i + 4)],
					[0, 0, 255, 255],
					`pixel ${x},${y} is blue`,
				);
			}
		}
	});

	test('warp of a degenerate quad is transparent', function (assert) {
		const source = solid(4, 4, [255, 255, 255, 255]);
		const quad: Quad = [
			{ x: 1, y: 1 },
			{ x: 1, y: 1 },
			{ x: 3, y: 3 },
			{ x: 1, y: 3 },
		];
		const out = warp(source, quad, 4, 4);
		assert.true([...out.data].every((v) => v === 0));
	});

	test('outputSize keeps the longer of each opposite edge pair', function (assert) {
		const quad: Quad = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 80, y: 50 },
			{ x: 0, y: 60 },
		];
		assert.deepEqual(outputSize(quad), { width: 100, height: 60 });
	});

	test('fitAspect keeps the orientation and the long edge', function (assert) {
		assert.deepEqual(fitAspect({ width: 100, height: 60 }, null), {
			width: 100,
			height: 60,
		});
		assert.deepEqual(fitAspect({ width: 100, height: 60 }, 2), {
			width: 100,
			height: 50,
		});
		assert.deepEqual(fitAspect({ width: 60, height: 100 }, 2), {
			width: 50,
			height: 100,
		});
	});

	test('insetQuad pulls every corner in by the fraction', function (assert) {
		assert.deepEqual(insetQuad(100, 50, 0.1), [
			{ x: 10, y: 5 },
			{ x: 90, y: 5 },
			{ x: 90, y: 45 },
			{ x: 10, y: 45 },
		]);
	});
});
