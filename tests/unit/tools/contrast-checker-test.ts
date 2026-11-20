import { module, test } from 'qunit';
import {
	contrastFigure,
	contrastRatio,
	fromHsl,
	hsl,
	parseHex,
} from 'delphicanon/lib/colour';
import {
	adjust,
	grade,
	share,
	suggest,
	targets,
} from 'delphitools-v2/components/tools/contrast-checker/contrast';

const colour = (code: string) => parseHex(code)!;
const white = colour('FFFFFF');
const black = colour('000000');

module('Unit | Tool | contrast-checker', function () {
	test('grades at the thresholds', function (assert) {
		assert.deepEqual([21, 7, 6.99, 4.5, 4.49, 3, 2.99].map(grade), [
			'AAA',
			'AAA',
			'AA',
			'AA',
			'AA Large',
			'AA Large',
			'Fail',
		]);
	});

	test('the figure never rounds up past a threshold', function (assert) {
		assert.strictEqual(contrastFigure(4.499), '4.49');
		assert.strictEqual(contrastFigure(4.5), '4.5');
		assert.strictEqual(contrastFigure(7.001), '7');
		assert.strictEqual(
			contrastFigure(contrastRatio(white, black)),
			'21',
		);
	});

	test('the scale is logarithmic from 1 to 21', function (assert) {
		assert.strictEqual(share(1), 0);
		assert.strictEqual(share(0.5), 0);
		assert.strictEqual(share(21), 1);
		assert.true(Math.abs(share(Math.sqrt(21)) - 0.5) < 1e-9);
	});

	test('adjust moves grey to the nearest passing lightness, darker on white', function (assert) {
		const grey = colour('777777');
		const fixed = adjust(grey, white, 4.5);
		assert.true(contrastRatio(fixed, white) >= 4.5);
		assert.true(hsl(fixed)[2] < hsl(grey)[2]);
		// nearest lightness, not extreme
		const [h, s, l] = hsl(fixed);
		assert.true(contrastRatio(fromHsl(h, s, l + 1), white) < 4.5);
	});

	test('adjust moves lighter on a dark ground', function (assert) {
		const dark = colour('1A1A2E');
		const ink = colour('444444');
		const fixed = adjust(ink, dark, 7);
		assert.true(contrastRatio(fixed, dark) >= 7);
		assert.true(hsl(fixed)[2] > hsl(ink)[2]);
	});

	test('suggestions are empty once the level passes, and when none reaches it', function (assert) {
		const [fgAa, fgAaa, bgAa] = targets;
		assert.strictEqual(suggest(fgAa!, black, white), undefined);
		const grey = colour('808080');
		const candidate = suggest(fgAa!, grey, grey);
		assert.true(contrastRatio(candidate!, grey) >= 4.5);
		const moved = suggest(bgAa!, grey, grey);
		assert.true(contrastRatio(grey, moved!) >= 4.5);
		// max 5.32:1 on grey
		assert.strictEqual(suggest(fgAaa!, grey, grey), undefined);
	});
});
