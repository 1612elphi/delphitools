import { module, test } from 'qunit';
import {
	oklabDistance,
	clusterPixels,
	rankClusters,
} from 'delphitools-v2/components/tools/palette-extractor';
import type { Triple } from 'delphitools-v2/lib/colour-maths';

/** Pinned so the seeding is the same on every run. */
function fixedRandom(seed = 1) {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) % 2147483648;
		return state / 2147483648;
	};
}

/** Three tight, well-separated blobs in OKLAB. */
function blobs(): Triple[] {
	const centres: Triple[] = [
		[0.2, -0.1, -0.1],
		[0.6, 0.0, 0.0],
		[0.9, 0.1, 0.1],
	];
	const out: Triple[] = [];
	for (const [l, a, b] of centres) {
		for (let i = 0; i < 30; i++) {
			const j = (i % 5) * 0.001;
			out.push([l + j, a + j, b + j]);
		}
	}
	return out;
}

module('Unit | Tool | palette-extractor', function () {
	module('oklabDistance', function () {
		test('is zero for a colour against itself', function (assert) {
			assert.strictEqual(
				oklabDistance(
					[0.5, 0.1, -0.2],
					[0.5, 0.1, -0.2],
				),
				0,
			);
		});

		test('is symmetric', function (assert) {
			const a: Triple = [0.2, 0.05, -0.1];
			const b: Triple = [0.7, -0.03, 0.2];
			assert.strictEqual(
				oklabDistance(a, b),
				oklabDistance(b, a),
			);
		});

		test('grows with separation', function (assert) {
			const origin: Triple = [0, 0, 0];
			assert.true(
				oklabDistance(origin, [0.1, 0, 0]) <
					oklabDistance(origin, [0.2, 0, 0]),
			);
		});
	});

	module('clusterPixels', function () {
		test('finds the blobs that are there', function (assert) {
			const clusters = clusterPixels(
				blobs(),
				3,
				fixedRandom(),
			);
			assert.strictEqual(clusters.length, 3);

			// Each blob centre should have a centroid sitting on it.
			for (const centre of [
				[0.2, -0.1, -0.1],
				[0.6, 0, 0],
				[0.9, 0.1, 0.1],
			] as Triple[]) {
				const nearest = Math.min(
					...clusters.map((c) =>
						oklabDistance(
							c.centroid,
							centre,
						),
					),
				);
				assert.true(
					nearest < 0.01,
					`a centroid is near ${centre.join(', ')} (${nearest.toFixed(4)})`,
				);
			}
		});

		test('every pixel lands in exactly one cluster', function (assert) {
			const pixels = blobs();
			const clusters = clusterPixels(
				pixels,
				3,
				fixedRandom(),
			);
			const counted = clusters.reduce(
				(n, c) => n + c.count,
				0,
			);
			assert.strictEqual(counted, pixels.length);
		});

		test('drops empty clusters rather than returning k of them', function (assert) {
			const two: Triple[] = [
				[0.1, 0, 0],
				[0.1, 0, 0],
				[0.9, 0, 0],
				[0.9, 0, 0],
			];
			assert.true(
				clusterPixels(two, 8, fixedRandom()).length <=
					2,
			);
		});

		test('returns nothing for no pixels', function (assert) {
			assert.deepEqual(
				clusterPixels([], 5, fixedRandom()),
				[],
			);
		});

		test('is deterministic for a pinned seed', function (assert) {
			const a = clusterPixels(blobs(), 3, fixedRandom(7));
			const b = clusterPixels(blobs(), 3, fixedRandom(7));
			assert.deepEqual(
				a.map((c) => c.centroid),
				b.map((c) => c.centroid),
			);
		});
	});

	module('rankClusters', function () {
		test('returns at most the count asked for', function (assert) {
			const clusters = clusterPixels(
				blobs(),
				3,
				fixedRandom(),
			);
			assert.strictEqual(
				rankClusters(clusters, 'vibrant', 2).length,
				2,
			);
			assert.strictEqual(
				rankClusters(clusters, 'vibrant', 10).length,
				3,
				'and never more than it was given',
			);
		});

		test('returns a subset of what it was given', function (assert) {
			const clusters = clusterPixels(
				blobs(),
				3,
				fixedRandom(),
			);
			const ranked = rankClusters(clusters, 'dominant', 3);
			assert.true(ranked.every((c) => clusters.includes(c)));
		});
	});
});
