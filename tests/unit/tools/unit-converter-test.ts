import { module, test } from 'qunit';
import { draw } from 'delphitools-v2/components/tools/unit-converter/draw';
import {
	categories,
	convert,
	format,
	formula,
	instrumentFor,
	pixels,
	pose,
	easeOutCubic,
	tickLabel,
	ticks,
	weightsOf,
	type Unit,
} from 'delphitools-v2/components/tools/unit-converter/units';

const unit = (category: string, symbol: string): Unit =>
	categories
		.find((c) => c.name === category)!
		.units.find((u) => u.symbol === symbol)!;

const km = unit('Length', 'km');
const mi = unit('Length', 'mi');
const celsius = unit('Temperature', '°C');
const fahrenheit = unit('Temperature', '°F');
const kelvin = unit('Temperature', 'K');

module('Unit | Tool | unit-converter', function () {
	test('pixels follow the density', function (assert) {
		const inch = unit('Length', 'in');
		const cm = unit('Length', 'cm');
		assert.strictEqual(
			format(convert(3000, pixels(300), inch)),
			'10',
		);
		assert.strictEqual(format(convert(1, inch, pixels(72))), '72');
		assert.strictEqual(format(convert(2.54, cm, pixels(96))), '96');
	});

	test('conversions, the web units kept', function (assert) {
		assert.strictEqual(
			format(convert(100, celsius, fahrenheit)),
			'212',
		);
		assert.strictEqual(
			format(convert(-40, fahrenheit, celsius)),
			'-40',
		);
		assert.strictEqual(
			format(convert(0, kelvin, celsius)),
			'-273.15',
		);
		assert.strictEqual(format(convert(5, km, mi)), '3.1069');
		assert.strictEqual(
			convert(1, unit('Data', 'KB'), unit('Data', 'B')),
			1024,
			'binary prefixes, as the web tool',
		);
		assert.strictEqual(
			convert(1, unit('Length', 'nmi'), unit('Length', 'm')),
			1852,
		);
		assert.deepEqual(
			categories.map((c) => c.name),
			[
				'Length',
				'Weight',
				'Temperature',
				'Data',
				'Speed',
				'Volume',
				'Area',
				'Time',
				'Pressure',
			],
		);
	});

	test('format and tick labels, as UnitConverterPicture.selfCheck', function (assert) {
		assert.strictEqual(format(0.6214), '0.6214');
		assert.strictEqual(format(1), '1');
		assert.strictEqual(format(0), '0');
		assert.strictEqual(format(-40), '-40');
		assert.strictEqual(format(0.001), '0.001');
		assert.strictEqual(format(0.00062), '6.2×10⁻⁴');
		assert.strictEqual(format(6.2137e-7), '6.2137×10⁻⁷');
		assert.strictEqual(format(1.5e12), '1.5×10¹²');
		assert.strictEqual(format(9.99999e-5), '1×10⁻⁴');
		assert.strictEqual(tickLabel(0.001), '0.001');
		assert.strictEqual(tickLabel(2_000_000), '2000000');
		assert.strictEqual(tickLabel(-0), '0');
		assert.strictEqual(tickLabel(3e12), '3×10¹²');
	});

	test('formulas as conversion charts print them', function (assert) {
		assert.strictEqual(
			formula(celsius, fahrenheit),
			'°C × 1.8 + 32',
		);
		assert.strictEqual(
			formula(fahrenheit, celsius),
			'(°F − 32) ÷ 1.8',
		);
		assert.strictEqual(formula(celsius, kelvin), '°C + 273.15');
		assert.strictEqual(formula(kelvin, celsius), 'K − 273.15');
	});

	test('poses, ticks and weights', function (assert) {
		const tape = pose('tape', 5, km, mi);
		assert.strictEqual(tape.lo, 0);
		assert.true(Math.abs(tape.span - 10_000) < 1e-6);
		assert.true(Math.abs(tape.value - 5000) < 1e-6);
		const warm = pose('thermometer', 20, celsius, fahrenheit);
		assert.true(Math.abs(warm.lo - 263.15) < 1e-6);
		assert.true(Math.abs(warm.span - 50) < 1e-6);
		assert.deepEqual(weightsOf(2.5), {
			denomination: 1,
			full: 2,
			part: 0.5,
		});
		assert.deepEqual(weightsOf(5000), {
			denomination: 1000,
			full: 5,
			part: 0,
		});
		assert.deepEqual(weightsOf(9.999), {
			denomination: 10,
			full: 1,
			part: 0,
		});
		assert.strictEqual(weightsOf(0), undefined);
		const graduations = ticks(km, 0, 10_000, 400, 40, 9);
		assert.strictEqual(graduations[0]?.label, '0');
		assert.strictEqual(graduations.at(-1)?.label, '10');
		assert.strictEqual(
			graduations.filter((t) => t.major).length,
			11,
		);
		assert.strictEqual(instrumentFor('Pressure'), 'manometer');
		assert.strictEqual(instrumentFor('Data'), 'tape');
	});

	test('every instrument draws', function (assert) {
		for (const category of categories) {
			const [from, to] = category.units as [Unit, Unit];
			const instrument = instrumentFor(category.name);
			const svg = draw({
				width: 600,
				height: 204,
				instrument,
				from,
				to,
				hasValue: true,
				shown: pose(instrument, 7, from, to),
				readout: {
					x: 450,
					y: 6,
					width: 134,
					height: 62,
				},
				id: 'test',
			});
			assert.true(svg.length > 200, category.name);
			assert.false(
				svg.includes('NaN'),
				`${category.name} has no NaN`,
			);
		}
	});

	test('the settle curve rises without overshoot', function (assert) {
		let last = 0;
		let rising = true;
		for (let i = 0; i <= 100; i++) {
			const eased = easeOutCubic(i / 100);
			if (eased < last || eased > 1) rising = false;
			last = eased;
		}
		assert.true(rising, 'never falls back, never passes 1');
		assert.strictEqual(easeOutCubic(0), 0);
		assert.strictEqual(easeOutCubic(1), 1);
	});

	test('time runs from nanoseconds to gregorian years', function (assert) {
		const time = (from: string, to: string) =>
			convert(1, unit('Time', from), unit('Time', to));
		assert.strictEqual(time('ftn', 'd'), 14);
		assert.strictEqual(time('wk', 'hr'), 168);
		assert.strictEqual(time('yr', 'mo'), 12);
		assert.strictEqual(time('yr', 'd'), 365.2425);
		assert.strictEqual(Math.round(time('s', 'ns')), 1e9);
	});
});
