import { module, test } from 'qunit';
import {
	DEFAULT_IMPOSITION_CONFIG,
	IMPOSITION_LAYOUTS,
	cropMarks,
	effectiveSheetH,
	effectiveSheetW,
	getLayoutById,
	placeInCell,
	turnsTopOverBottom,
	type ImpositionConfig,
	type PagePlacement,
} from 'delphitools-v2/lib/imposition';

const bind = (pages: number, signaturePages = 16) =>
	getLayoutById('perfect-bind')!.calculate(pages, {
		...DEFAULT_IMPOSITION_CONFIG,
		layoutId: 'perfect-bind',
		signaturePages,
	});

const round = (box: Record<string, number>) =>
	Object.fromEntries(
		Object.entries(box).map(([k, v]) => [
			k,
			Math.round(v * 1000) / 1000,
		]),
	);

module('Unit | Lib | imposition', function () {
	test('placeInCell fits, fills and keeps the actual size', function (assert) {
		const tall = { x: 0, y: 0, width: 100, height: 200 };
		const square = { width: 50, height: 50 };
		assert.deepEqual(round(placeInCell(tall, square, 0, 'fit')), {
			x: 0,
			y: 50,
			width: 100,
			height: 100,
		});
		assert.deepEqual(round(placeInCell(tall, square, 0, 'fill')), {
			x: -50,
			y: 0,
			width: 200,
			height: 200,
		});
	});

	test('placeInCell centres a turned page', function (assert) {
		const wide = { x: 0, y: 0, width: 200, height: 100 };
		assert.deepEqual(
			round(
				placeInCell(
					wide,
					{ width: 50, height: 100 },
					90,
					'fit',
				),
			),
			{ x: 200, y: 0, width: 100, height: 200 },
		);
		const square = { x: 0, y: 0, width: 100, height: 100 };
		assert.deepEqual(
			round(
				placeInCell(
					square,
					{ width: 40, height: 60 },
					180,
					'actual',
				),
			),
			{ x: 70, y: 80, width: 40, height: 60 },
		);
	});

	// ios ImposerViewController.selfCheck
	test('perfect bind folds 38 pages into three 16-page signatures', function (assert) {
		const bound = bind(38);
		assert.deepEqual(
			bound.sheets.map((s) => s.signature),
			[0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],
		);
		assert.strictEqual(bound.totalPages, 48);
		assert.strictEqual(bound.blanksAdded, 10);
		const front = (i: number) =>
			bound.sheets[i]!.front.map((p) => p.pageNumber).sort(
				(a, b) => a - b,
			);
		assert.deepEqual(front(4), [17, 32]);
		assert.deepEqual(front(8), [0, 33]);
		const placed = bound.sheets.flatMap((sheet) =>
			[...sheet.front, ...sheet.back].map((p) => ({
				signature: sheet.signature,
				page: p.pageNumber,
			})),
		);
		const blanks = placed.filter((p) => p.page === 0);
		assert.strictEqual(blanks.length, 10);
		assert.true(blanks.every((p) => p.signature === 2));
		assert.deepEqual(
			[
				...new Set(
					placed
						.map((p) => p.page)
						.filter((n) => n > 0),
				),
			]
				.sort((a, b) => a - b)
				.join(),
			Array.from({ length: 38 }, (_, i) => i + 1).join(),
		);
	});

	test('perfect bind numbers sheets across signatures and pads the size to 4', function (assert) {
		const bound = bind(10, 6);
		assert.deepEqual(
			bound.sheets.map((s) => s.sheetNumber),
			[1, 2, 3, 4],
		);
		assert.strictEqual(bound.totalPages, 16);
	});

	test('backs register behind fronts', function (assert) {
		for (const layoutId of [
			'saddle-stitch',
			'perfect-bind',
			'four-up-booklet',
		])
			for (const orientation of [
				'portrait',
				'landscape',
			] as const)
				for (const duplexFlip of [
					'long-edge',
					'short-edge',
				] as const) {
					const config: ImpositionConfig = {
						...DEFAULT_IMPOSITION_CONFIG,
						layoutId,
						orientation,
						duplexFlip,
						signaturePages: 8,
					};
					const width = effectiveSheetW(
						config.paperSize,
						orientation,
					);
					const height = effectiveSheetH(
						config.paperSize,
						orientation,
					);
					const tumble =
						turnsTopOverBottom(config);
					const sheets = getLayoutById(
						layoutId,
					)!.calculate(24, config).sheets;
					const ok = sheets.every((sheet) =>
						sheet.front.every((page) => {
							const x =
								page.x +
								page.width / 2;
							const y =
								page.y +
								page.height / 2;
							const [sx, sy] = tumble
								? [
										x,
										height -
											y,
									]
								: [
										width -
											x,
										y,
									];
							const reverse =
								sheet.back.find(
									(b) =>
										sx >
											b.x &&
										sx <
											b.x +
												b.width &&
										sy >
											b.y &&
										sy <
											b.y +
												b.height,
								);
							if (!reverse)
								return false;
							const turn =
								(tumble
									? reverse.rotation +
										180
									: reverse.rotation) %
								360;
							const partner =
								page.pageNumber %
									2 ===
								1
									? page.pageNumber +
										1
									: page.pageNumber -
										1;
							return (
								reverse.pageNumber ===
									partner &&
								turn ===
									page.rotation
							);
						}),
					);
					assert.true(
						ok,
						`${layoutId} ${orientation} ${duplexFlip}`,
					);
				}
	});

	test('right to left mirrors each sheet', function (assert) {
		const across = (layoutId: string, rtl: boolean) => {
			const sheet = getLayoutById(layoutId)!.calculate(8, {
				...DEFAULT_IMPOSITION_CONFIG,
				layoutId,
				customGrid: [1, 2],
				rtl,
			}).sheets[0]!;
			const byX = (side: typeof sheet.front) =>
				[...side]
					.sort((a, b) => a.x - b.x)
					.map((p) => p.pageNumber);
			return [byX(sheet.front), byX(sheet.back)];
		};
		// landscape tumbles the backs
		assert.deepEqual(across('saddle-stitch', false), [
			[8, 1],
			[7, 2],
		]);
		assert.deepEqual(across('saddle-stitch', true), [
			[1, 8],
			[2, 7],
		]);
		assert.deepEqual(across('custom-nup', true), [
			[2, 1],
			[4, 3],
		]);
		assert.deepEqual(
			across('step-and-repeat', true),
			across('step-and-repeat', false),
		);
	});

	test('long edge on a landscape sheet turns top over bottom', function (assert) {
		const landscape = {
			...DEFAULT_IMPOSITION_CONFIG,
			orientation: 'landscape' as const,
		};
		assert.true(
			turnsTopOverBottom({
				...landscape,
				duplexFlip: 'long-edge',
			}),
		);
		assert.false(
			turnsTopOverBottom({
				...landscape,
				duplexFlip: 'short-edge',
			}),
		);
	});

	test('4-up booklet: the 8-page right-angle fold, sheets nested', function (assert) {
		const config: ImpositionConfig = {
			...DEFAULT_IMPOSITION_CONFIG,
			layoutId: 'four-up-booklet',
			duplexFlip: 'short-edge',
		};
		const sheets = getLayoutById('four-up-booklet')!.calculate(
			16,
			config,
		).sheets;
		const read = (cells: PagePlacement[]) =>
			cells.map(
				(c) =>
					`${c.pageNumber}${c.rotation ? '↓' : ''}`,
			);
		// row-major from top left
		assert.deepEqual(read(sheets[0]!.front), [
			'13↓',
			'4↓',
			'16',
			'1',
		]);
		assert.deepEqual(read(sheets[0]!.back), [
			'3↓',
			'14↓',
			'2',
			'15',
		]);
		assert.deepEqual(read(sheets[1]!.front), [
			'9↓',
			'8↓',
			'12',
			'5',
		]);
		assert.deepEqual(read(sheets[1]!.back), [
			'7↓',
			'10↓',
			'6',
			'11',
		]);
	});

	test('every layout keeps margins, gutters and marks on the sheet', function (assert) {
		const marginMm = 10;
		const gutterMm = 4;
		const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
		for (const layout of IMPOSITION_LAYOUTS)
			for (const orientation of [
				'portrait',
				'landscape',
			] as const)
				for (const duplexFlip of [
					'long-edge',
					'short-edge',
				] as const) {
					const config: ImpositionConfig = {
						...DEFAULT_IMPOSITION_CONFIG,
						layoutId: layout.id,
						orientation,
						duplexFlip,
						marginMm,
						gutterMm,
						creepMm: 0,
						nUp: 6,
						customGrid: [3, 2],
						signaturePages: 8,
					};
					const width = effectiveSheetW(
						config.paperSize,
						orientation,
					);
					const height = effectiveSheetH(
						config.paperSize,
						orientation,
					);
					const label = `${layout.id} ${orientation} ${duplexFlip}`;
					for (const sheet of layout.calculate(
						16,
						config,
					).sheets)
						for (const cells of [
							sheet.front,
							sheet.back,
						]) {
							const left = Math.min(
								...cells.map(
									(c) =>
										c.x,
								),
							);
							const top = Math.min(
								...cells.map(
									(c) =>
										c.y,
								),
							);
							const right = Math.max(
								...cells.map(
									(c) =>
										c.x +
										c.width,
								),
							);
							const bottom = Math.max(
								...cells.map(
									(c) =>
										c.y +
										c.height,
								),
							);
							const margins =
								near(
									left,
									marginMm,
								) &&
								near(
									top,
									marginMm,
								) &&
								near(
									width -
										right,
									marginMm,
								) &&
								near(
									height -
										bottom,
									marginMm,
								);
							const gutters =
								cells.every(
									(a) =>
										cells.every(
											(
												b,
											) =>
												a ===
													b ||
												!(
													near(
														a.y,
														b.y,
													) &&
													b.x >
														a.x
												) ||
												b.x -
													(a.x +
														a.width) >
													gutterMm -
														0.01,
										),
								);
							const corners = new Set(
								cells.flatMap(
									(c) =>
										[
											[
												c.x,
												c.y,
											],
											[
												c.x +
													c.width,
												c.y,
											],
											[
												c.x,
												c.y +
													c.height,
											],
											[
												c.x +
													c.width,
												c.y +
													c.height,
											],
										].map(
											([
												x,
												y,
											]) =>
												`${x!.toFixed(2)},${y!.toFixed(2)}`,
										),
								),
							);
							const marks = cropMarks(
								cells,
							).every(
								(m) =>
									corners.has(
										`${m.x2.toFixed(2)},${m.y2.toFixed(2)}`,
									) ||
									corners.has(
										`${m.x1.toFixed(2)},${m.y1.toFixed(2)}`,
									),
							);
							const inside =
								cropMarks(
									cells,
								).every(
									(m) =>
										Math.min(
											m.x1,
											m.x2,
										) >=
											0 &&
										Math.max(
											m.x1,
											m.x2,
										) <=
											width &&
										Math.min(
											m.y1,
											m.y2,
										) >=
											0 &&
										Math.max(
											m.y1,
											m.y2,
										) <=
											height,
								);
							assert.deepEqual(
								{
									margins,
									gutters,
									marks,
									inside,
								},
								{
									margins: true,
									gutters: true,
									marks: true,
									inside: true,
								},
								label,
							);
						}
				}
	});

	test('creep moves outer sheets out from the spine, clamped at the margin', function (assert) {
		const config: ImpositionConfig = {
			...DEFAULT_IMPOSITION_CONFIG,
			marginMm: 5,
			gutterMm: 2,
			creepMm: 2,
		};
		const sheets = getLayoutById('saddle-stitch')!.calculate(
			16,
			config,
		).sheets;
		const spine = (cells: PagePlacement[]) =>
			cells[1]!.x - (cells[0]!.x + cells[0]!.width);
		const centre = (cells: PagePlacement[]) =>
			(cells[1]!.x + cells[0]!.x + cells[0]!.width) / 2;
		// first clamped at margin
		assert.deepEqual(
			sheets.map((sheet) => spine(sheet.front)),
			[12, 10, 6, 2],
		);
		assert.true(
			sheets.every(
				(sheet) =>
					Math.abs(
						centre(sheet.front) - 297 / 2,
					) < 0.01 &&
					Math.abs(centre(sheet.back) - 297 / 2) <
						0.01,
			),
			'the spine stays on the fold',
		);
		assert.true(
			sheets.every((sheet) => sheet.front[0]!.x >= 0),
			'no page leaves the sheet',
		);
	});
});
