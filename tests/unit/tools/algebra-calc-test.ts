import { module, test } from 'qunit';
import {
	compute,
	equationToPolynomial,
	loadEngines,
	needsVariable,
	solutionName,
	solveRoots,
} from 'delphitools-v2/components/tools/algebra-calc/algebra';

module('Unit | Tool | algebra-calc', function () {
	test('an equation becomes one side minus the other', function (assert) {
		assert.strictEqual(
			equationToPolynomial('x^2 = 4'),
			'(x^2 ) - ( 4)',
		);
		assert.strictEqual(equationToPolynomial('x+1'), 'x+1');
	});

	test('solutions are named with subscripts when there are several', function (assert) {
		assert.strictEqual(solutionName('x', 0, 1), 'x');
		assert.strictEqual(solutionName('x', 1, 2), 'x₂');
		assert.strictEqual(solutionName('t', 11, 12), 't₁₂');
	});

	test('the variable row is for solve, d/dx and ∫', function (assert) {
		assert.true(needsVariable('solve'));
		assert.true(needsVariable('integral'));
		assert.false(needsVariable('expand'));
	});

	test('roots and the omnibox string agree', async function (assert) {
		const engines = await loadEngines();
		const { math } = engines;
		assert.deepEqual(solveRoots(math, 'x^2 - 4 = 0'), ['2', '-2']);
		assert.strictEqual(
			compute(engines, 'solve', 'x^2 - 4 = 0', 'x'),
			'[2,-2]',
		);
		assert.strictEqual(
			compute(engines, 'derivative', 'x^3', 'x'),
			'3 * x ^ 2',
		);
	});

	test('factor and integral match iOS', async function (assert) {
		const engines = await loadEngines();
		assert.strictEqual(
			compute(engines, 'factor', 'x^3 - 1', 'x'),
			'(-1+x)*(1+x+x^2)',
		);
		assert.strictEqual(
			compute(engines, 'integral', 'x^2', 'x'),
			'(1/3)*x^3 + C',
		);
	});

	test('an equation does not set a variable', async function (assert) {
		const engines = await loadEngines();
		assert.strictEqual(
			compute(engines, 'factor', 'x = 4', 'x'),
			'-4+x',
		);
		assert.strictEqual(
			compute(engines, 'factor', 'x^2 - 4', 'x'),
			'(-2+x)*(2+x)',
		);
	});
});
