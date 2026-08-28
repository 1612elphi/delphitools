import { module, test } from 'qunit';
import {
	convertProse,
	formatAmount,
	parseQuantity,
	scaleIngredient,
} from 'delphitools-v2/lib/recipe-scale';

module('Unit | lib | recipe-scale', function () {
	test('parses numbers, fractions, ranges and units', function (assert) {
		assert.deepEqual(parseQuantity('1½ lb firm tomatoes'), {
			amount: 1.5,
			unit: 'lb',
			rest: 'firm tomatoes',
		});
		assert.deepEqual(parseQuantity('1 1/2 cups flour'), {
			amount: 1.5,
			unit: 'cup',
			rest: 'flour',
		});
		assert.deepEqual(parseQuantity('200g spaghetti'), {
			amount: 200,
			unit: 'g',
			rest: 'spaghetti',
		});
		assert.deepEqual(parseQuantity('2-3 cloves garlic'), {
			amount: 2,
			upper: 3,
			rest: 'cloves garlic',
		});
		assert.deepEqual(parseQuantity('¼ cup cilantro'), {
			amount: 0.25,
			unit: 'cup',
			rest: 'cilantro',
		});
		assert.strictEqual(parseQuantity('pinch of salt'), null);
		assert.strictEqual(parseQuantity('salted water'), null);
	});

	test('formats amounts as vulgar fractions', function (assert) {
		assert.strictEqual(formatAmount(0.5), '½');
		assert.strictEqual(formatAmount(1.75), '1¾');
		assert.strictEqual(formatAmount(2), '2');
		assert.strictEqual(formatAmount(0.333), '⅓');
		assert.strictEqual(formatAmount(2.45), '2.45');
	});

	test('scales and converts ingredients', function (assert) {
		assert.strictEqual(
			scaleIngredient('200 g spaghetti', 2, 'written'),
			'400 g spaghetti',
		);
		assert.strictEqual(
			scaleIngredient('2 cloves garlic', 1.5, 'metric'),
			'3 cloves garlic',
		);
		assert.strictEqual(
			scaleIngredient('1 cup flour', 1, 'metric'),
			'240 ml flour',
		);
		assert.strictEqual(
			scaleIngredient('1 lb beef', 1, 'metric'),
			'455 g beef',
		);
		assert.strictEqual(
			scaleIngredient('500 g beef', 1, 'imperial'),
			'1⅛ lb beef',
		);
		assert.strictEqual(
			scaleIngredient('1 tsp salt', 1, 'metric'),
			'5 ml salt',
		);
		assert.strictEqual(
			scaleIngredient('60 ml milk', 1, 'imperial'),
			'¼ cup milk',
		);
		assert.strictEqual(
			scaleIngredient('2-3 Tbsp oil', 2, 'metric'),
			'60–90 ml oil',
		);
		assert.strictEqual(
			scaleIngredient('pinch salt', 3, 'metric'),
			'pinch salt',
		);
	});

	test('converts temperatures and pan sizes in prose', function (assert) {
		assert.strictEqual(
			convertProse('bake 350°F 30 min', 'metric'),
			'bake 175°C 30 min',
		);
		assert.strictEqual(
			convertProse('bake 180°C', 'imperial'),
			'bake 355°F',
		);
		assert.strictEqual(
			convertProse('8x8-inch pan', 'metric'),
			'20×20 cm pan',
		);
		assert.strictEqual(
			convertProse('23 cm tin', 'imperial'),
			'9 in tin',
		);
		assert.strictEqual(
			convertProse('bake 350°F', 'written'),
			'bake 350°F',
		);
	});
});

module('Unit | lib | recipe-scale audit fixes', function () {
	test('small amounts never round to zero', function (assert) {
		assert.notStrictEqual(
			scaleIngredient('1 g salt', 1, 'imperial'),
			'0 oz salt',
		);
		assert.notStrictEqual(
			scaleIngredient('0.5 ml vanilla', 1, 'imperial'),
			'0 tsp vanilla',
		);
		assert.false(
			convertProse(
				'cut 0.5 cm slices',
				'imperial',
			).startsWith('cut 0 in'),
		);
	});

	test('compound, spaced and thousands quantities', function (assert) {
		assert.strictEqual(
			scaleIngredient('½ cup + 2 Tbsp sugar', 1.5, 'written'),
			'¾ cup + 3 Tbsp sugar',
		);
		assert.strictEqual(
			scaleIngredient('1 ½ cup flour', 2, 'written'),
			'3 cups flour',
		);
		assert.strictEqual(
			scaleIngredient('1,000 g flour', 1, 'written'),
			'1000 g flour',
		);
		assert.strictEqual(
			scaleIngredient('2 T butter', 1, 'metric'),
			'30 ml butter',
		);
	});

	test('counts stay countable', function (assert) {
		assert.strictEqual(
			scaleIngredient('3 large eggs', 1.5, 'written'),
			'4½ large eggs',
		);
		assert.strictEqual(
			scaleIngredient('1 large egg', 0.5, 'written'),
			'½ large egg',
		);
		assert.strictEqual(
			scaleIngredient('2 l stock', 1, 'imperial'),
			'2 quarts stock',
		);
	});

	test('prose lengths need a real inch marker', function (assert) {
		assert.strictEqual(
			convertProse('rest 10 in the fridge', 'metric'),
			'rest 10 in the fridge',
		);
		assert.strictEqual(
			convertProse('cut 1/2 inch cubes', 'metric'),
			'cut 1½ cm cubes',
		);
		assert.strictEqual(
			convertProse('bake 350°F (175°C)', 'metric'),
			'bake 350°F (175°C)',
		);
		assert.strictEqual(
			convertProse('roll to 3 mm', 'imperial'),
			'roll to ⅛ in',
		);
	});
});
