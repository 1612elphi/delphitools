import { module, test } from 'qunit';
import {
	byteFigure,
	clampSide,
	scaleLabel,
} from 'delphitools-v2/components/substrata/pages/figures';
import {
	clear,
	ease,
	pages,
	place,
	type Measure,
	type Target,
} from 'delphitools-v2/components/substrata/pages/help-layout';
import { findSizes, sizeFor } from 'delphitools-v2/lib/substrata/canvas-sizes';
import { uniqueName } from 'delphitools-v2/lib/substrata/projects';

module('Unit | Substrata | pages', function () {
	test('byteFigure: decimal units, one place below 100', function (assert) {
		assert.deepEqual(byteFigure(999, 'en'), ['999', 'B']);
		assert.deepEqual(byteFigure(193_400, 'en'), ['193', 'KB']);
		assert.deepEqual(byteFigure(63_700, 'en'), ['63.7', 'KB']);
		assert.deepEqual(byteFigure(1_250_000, 'en'), ['1.3', 'MB']);
		assert.deepEqual(byteFigure(1_250_000, 'de'), ['1,3', 'MB']);
	});

	test('canvas sizes and sides', function (assert) {
		assert.strictEqual(sizeFor(1080, 1920)?.id, 'instagram-story');
		assert.strictEqual(
			sizeFor(1080, 1920, 'tiktok-video')?.id,
			'tiktok-video',
		);
		assert.strictEqual(
			sizeFor(1080, 1920, 'x-post')?.id,
			'instagram-story',
		);
		assert.strictEqual(sizeFor(1081, 1920), undefined);
		const ids = (q: string) =>
			findSizes(q).flatMap((s) => s.sizes.map((z) => z.id));
		assert.deepEqual(ids('insta story'), ['instagram-story']);
		assert.deepEqual(ids('1500 × 500'), ['x-header']);
		assert.deepEqual(ids('zzz'), []);
		assert.strictEqual(
			new Set(
				findSizes('').flatMap((s) =>
					s.sizes.map((z) => z.id),
				),
			).size,
			findSizes('').flatMap((s) => s.sizes).length,
		);
		assert.strictEqual(clampSide(0), 1);
		assert.strictEqual(clampSide(25_000), 20_000);
		assert.strictEqual(clampSide(1079.6), 1080);
		assert.strictEqual(clampSide(Number.NaN), 1);
		assert.strictEqual(scaleLabel(0.5, 'en'), '0.5×');
	});

	test('uniqueName: iOS DocumentLibrary rules', function (assert) {
		assert.strictEqual(uniqueName('Poster', []), 'Poster');
		assert.strictEqual(
			uniqueName('Poster', ['poster']),
			'Poster 2',
		);
		assert.strictEqual(
			uniqueName('Poster 2', ['Poster', 'Poster 2']),
			'Poster 3',
		);
	});

	test('ease keeps spans apart and inside the bounds', function (assert) {
		assert.deepEqual(
			ease(
				[
					{ top: 0, height: 10 },
					{ top: 5, height: 10 },
				],
				0,
				100,
			),
			[0, 18],
		);
		assert.deepEqual(ease([{ top: 95, height: 10 }], 0, 100), [90]);
	});

	const short: Measure = (_, w) => ({ w: Math.min(w, 150), h: 40 });

	test('a column of cells gets notes beside it, in order', function (assert) {
		const area = { x: 12, y: 60, w: 378, h: 740 };
		const column: Target[] = Array.from({ length: 13 }, (_, i) => ({
			frame: { x: 320, y: 60 + i * 54, w: 46, h: 44 },
			side: 'right',
		}));
		const placed = place(column, area, [], short)!;
		for (let i = 1; i < placed.length; i++)
			assert.true(
				placed[i]!.note.y >=
					placed[i - 1]!.note.y +
						placed[i - 1]!.note.h +
						7.5,
			);
		assert.true(
			placed.every(
				(p) =>
					p.note.x + p.note.w <= 320 - 44 + 0.5 &&
					p.trailing,
			),
		);
		assert.true(clear(placed, area, []));
	});

	test('a row gets stepped notes with straight arrows', function (assert) {
		const area = { x: 12, y: 60, w: 1000, h: 700 };
		const row: Target[] = [
			{ frame: { x: 12, y: 60, w: 40, h: 40 }, side: 'top' },
			{ frame: { x: 300, y: 60, w: 80, h: 40 }, side: 'top' },
		];
		const placed = place(row, area, [], short)!;
		assert.true(placed.every((p) => p.points.length === 2));
		assert.true(clear(placed, area, []));
	});

	test('pages split a crowded phone by side', function (assert) {
		const phone = { x: 12, y: 70, w: 378, h: 760 };
		const tall: Measure = (_, w) => ({
			w: Math.min(w, 240),
			h: w < 200 ? 92 : 70,
		});
		const top: Target[] = [12, 64, 300, 344].map((x) => ({
			frame: { x, y: 62, w: 44, h: 44 },
			side: 'top',
		}));
		const bottom: Target[] = Array.from({ length: 7 }, (_, i) => ({
			frame: { x: 16 + i * 50, y: 790, w: 46, h: 52 },
			side: 'bottom',
		}));
		const all = [...top, ...bottom];
		const split = pages(all, phone, [], tall);
		assert.true(split.length >= 2);
		assert.deepEqual(
			split.flat().sort((a, b) => a - b),
			all.map((_, i) => i),
		);
	});
});
