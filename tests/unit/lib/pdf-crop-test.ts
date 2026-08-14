import { module, test } from 'qunit';
import {
	boxFromPoints,
	dragRect,
	intersectBox,
} from 'delphitools-v2/lib/pdf-crop';

module('Unit | Lib | pdf-crop', function () {
	module('dragRect', function () {
		test('keeps a top-left to bottom-right drag', function (assert) {
			assert.deepEqual(dragRect(10, 20, 110, 220, 200, 300), {
				x: 10,
				y: 20,
				width: 100,
				height: 200,
			});
		});

		test('normalises a drag in any direction', function (assert) {
			assert.deepEqual(dragRect(110, 220, 10, 20, 200, 300), {
				x: 10,
				y: 20,
				width: 100,
				height: 200,
			});
			assert.deepEqual(dragRect(10, 220, 110, 20, 200, 300), {
				x: 10,
				y: 20,
				width: 100,
				height: 200,
			});
		});

		test('clamps to the preview bounds', function (assert) {
			assert.deepEqual(
				dragRect(-50, -50, 250, 350, 200, 300),
				{
					x: 0,
					y: 0,
					width: 200,
					height: 300,
				},
			);
		});

		test('a drag outside the bounds collapses to the edge', function (assert) {
			assert.deepEqual(dragRect(-20, 10, -5, 100, 200, 300), {
				x: 0,
				y: 10,
				width: 0,
				height: 90,
			});
		});
	});

	module('boxFromPoints', function () {
		test('is corner-order independent', function (assert) {
			const expected = {
				x: 10,
				y: 20,
				width: 100,
				height: 200,
			};
			assert.deepEqual(
				boxFromPoints(10, 20, 110, 220),
				expected,
			);
			assert.deepEqual(
				boxFromPoints(110, 220, 10, 20),
				expected,
			);
			assert.deepEqual(
				boxFromPoints(10, 220, 110, 20),
				expected,
			);
		});

		test('keeps fractional points', function (assert) {
			assert.deepEqual(
				boxFromPoints(148.5, 210.5, 446.5, 631.5),
				{
					x: 148.5,
					y: 210.5,
					width: 298,
					height: 421,
				},
			);
		});
	});

	module('intersectBox', function () {
		test('returns the overlap of two crossing boxes', function (assert) {
			assert.deepEqual(
				intersectBox(
					{ x: 0, y: 0, width: 100, height: 100 },
					{
						x: 50,
						y: 50,
						width: 100,
						height: 100,
					},
				),
				{ x: 50, y: 50, width: 50, height: 50 },
			);
		});

		test('a contained box is its own overlap', function (assert) {
			const inner = { x: 10, y: 10, width: 20, height: 20 };
			assert.deepEqual(
				intersectBox(inner, {
					x: 0,
					y: 0,
					width: 100,
					height: 100,
				}),
				inner,
			);
		});

		test('disjoint boxes have no overlap', function (assert) {
			assert.strictEqual(
				intersectBox(
					{ x: 0, y: 0, width: 10, height: 10 },
					{ x: 20, y: 20, width: 10, height: 10 },
				),
				null,
			);
		});

		test('edge-touching boxes have no overlap', function (assert) {
			assert.strictEqual(
				intersectBox(
					{ x: 0, y: 0, width: 10, height: 10 },
					{ x: 10, y: 0, width: 10, height: 10 },
				),
				null,
			);
		});
	});
});
