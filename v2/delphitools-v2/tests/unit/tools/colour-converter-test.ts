import { module, test } from 'qunit';
import {
	parseColour,
	convert,
	formatOutput,
	FORMATS,
	type ColourFormat,
} from 'delphitools-v2/components/tools/colour-converter';

const IDS = FORMATS.map((f) => f.id);

module('Unit | Tool | colour-converter', function () {
	test('reads every format back to the same sRGB triple', function (assert) {
		const values = convert('hex', '#3b82f6');
		assert.deepEqual(values?.rgb, [59, 130, 246]);

		for (const id of IDS) {
			const written = formatOutput(id, values!);
			const read = parseColour(id, written);
			assert.deepEqual(
				read?.map(Math.round),
				[59, 130, 246],
				`${id}: ${written}`,
			);
		}
	});

	// Within one 8-bit step, not exact: the table shows OKLCH hue to one
	// decimal place, which is not enough to pin a saturated colour to the same
	// byte. Same drift as the Next app, which prints at the same precision.
	test('round-trips a spread of colours through every format', function (assert) {
		const hexes = [
			'#000000',
			'#ffffff',
			'#ff0000',
			'#00ff00',
			'#0000ff',
			'#808080',
			'#fa5f3c',
			'#1a2744',
		];
		for (const hex of hexes) {
			const values = convert('hex', hex)!;
			for (const id of IDS) {
				const again = convert(
					id,
					formatOutput(id, values),
				);
				const drift = again!.rgb.map((c, i) =>
					Math.abs(c - values.rgb[i]!),
				);
				assert.true(
					Math.max(...drift) <= 1,
					`${hex} via ${id} -> ${again?.hex}`,
				);
			}
		}
	});

	test('accepts the placeholder each format advertises', function (assert) {
		for (const format of FORMATS) {
			assert.ok(
				convert(format.id, format.placeholder),
				`${format.id}: ${format.placeholder}`,
			);
		}
	});

	test('rejects input that is not three numbers', function (assert) {
		for (const junk of ['', 'zzz', '1, 2', 'rgb()', '.', '-']) {
			assert.strictEqual(
				convert('rgb', junk),
				null,
				JSON.stringify(junk),
			);
		}
	});

	// hexToRgb is strict about length; the other formats route through the
	// shared three-number pattern instead.
	test('rejects three- and eight-digit hex', function (assert) {
		assert.strictEqual(convert('hex', '#fff'), null);
		assert.strictEqual(convert('hex', '#3b82f6ff'), null);
		assert.ok(convert('hex', '3b82f6'), 'bare six-digit is fine');
	});

	test('clamps out-of-gamut input into sRGB', function (assert) {
		assert.deepEqual(
			convert('rgb', '300, -20, 128')?.rgb,
			[255, 0, 128],
		);
	});

	test('formats hue, chroma and lightness to the advertised precision', function (assert) {
		const values = convert('hex', '#3b82f6')!;
		assert.strictEqual(
			formatOutput('rgb', values),
			'rgb(59, 130, 246)',
		);
		assert.strictEqual(
			formatOutput('rgb-decimal', values),
			'rgb(0.2314, 0.5098, 0.9647)',
		);
		assert.strictEqual(
			formatOutput('hsl', values),
			'hsl(217.2, 91.2%, 59.8%)',
		);
	});

	test('every format id has a name and a placeholder', function (assert) {
		const seen = new Set<ColourFormat>();
		for (const format of FORMATS) {
			assert.false(
				seen.has(format.id),
				`${format.id} is unique`,
			);
			seen.add(format.id);
			assert.ok(format.name, `${format.id} has a name`);
			assert.ok(
				format.placeholder,
				`${format.id} has a placeholder`,
			);
		}
	});
});
