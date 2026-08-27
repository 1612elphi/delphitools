import { module, test } from 'qunit';
import {
	STUPID_CATEGORIES,
	convertStupid,
	formatStupid,
} from 'delphitools-v2/lib/stupid-units';

module('Unit | lib | stupid-units', function () {
	test('every category is well formed', function (assert) {
		for (const category of STUPID_CATEGORIES) {
			const keys = new Set(category.units.map((u) => u.key));
			assert.strictEqual(
				keys.size,
				category.units.length,
				`${category.key}: unique keys`,
			);
			for (const unit of category.units) {
				assert.true(
					Number.isFinite(unit.factor),
					`${category.key}/${unit.key}: finite factor`,
				);
				assert.true(
					unit.factor > 0,
					`${category.key}/${unit.key}: positive factor`,
				);
			}
			for (let i = 1; i < category.units.length; i++) {
				assert.true(
					category.units[i]!.factor >=
						category.units[i - 1]!.factor,
					`${category.key}: sorted ascending at ${i}`,
				);
			}
		}
	});

	test('converts through the base', function (assert) {
		const length = STUPID_CATEGORIES.find(
			(c) => c.key === 'length',
		)!;
		const banana = length.units.find((u) => u.key === 'banana')!;
		const eiffel = length.units.find(
			(u) => u.key === 'eiffel-tower',
		)!;
		assert.strictEqual(
			Math.round(convertStupid(1, eiffel, banana)),
			1833,
		);
		assert.strictEqual(formatStupid(1833.33), '1,833');
		assert.strictEqual(formatStupid(1e30), '1.00e+30');
		assert.strictEqual(formatStupid(0), '0');
	});
});
