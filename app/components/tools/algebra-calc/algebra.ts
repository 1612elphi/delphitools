type MathModule = typeof import('mathjs');
type Cas = typeof import('nerdamer');

export interface Engines {
	math: MathModule;
	// mathjs lacks factor, integrate
	cas: Cas;
}

let engines: Promise<Engines> | null = null;
export function loadEngines(): Promise<Engines> {
	engines ??= Promise.all([
		import('mathjs'),
		import('delphitools-v2/components/tools/algebra-calc/cas'),
	]).then(([math, cas]) => ({ math, cas: cas.default }));
	return engines;
}

export type Operation =
	'simplify' | 'expand' | 'factor' | 'solve' | 'derivative' | 'integral';

const ROOT_PRECISION = 10;

export const OPERATIONS: {
	id: Operation;
	label: string;
	result: string;
}[] = [
	{ id: 'simplify', label: 'Simplify', result: 'Simplified' },
	{ id: 'expand', label: 'Expand', result: 'Expanded' },
	{ id: 'factor', label: 'Factor', result: 'Factored' },
	{ id: 'solve', label: 'Solve', result: 'Solutions' },
	{ id: 'derivative', label: 'd/dx', result: 'Derivative' },
	{ id: 'integral', label: '∫', result: 'Integral' },
];

export const EXAMPLES: Record<Operation, string[]> = {
	simplify: ['(x+1)^2 - x^2', 'sin(x)^2 + cos(x)^2', '(a*b)/(a*c)'],
	expand: ['(x+1)^3', '(a+b)*(a-b)', '(x+y+z)^2'],
	factor: ['x^2 - 4', 'x^3 - 1', 'x^2 + 5*x + 6'],
	solve: ['x^2 - 4 = 0', '2*x + 3 = 7', 'x^2 + x - 6 = 0'],
	derivative: ['x^3', 'sin(x)*cos(x)', 'e^x * x^2'],
	integral: ['x^2', 'sin(x)', '1/x'],
};

export const SYNTAX: [label: string, syntax: string][] = [
	['Power', 'x^2'],
	['Multiply', 'a*b'],
	['Divide', 'a/b'],
	['Square root', 'sqrt(x)'],
	['Trig', 'sin(x)'],
	['Natural log', 'log(x)'],
	["Euler's number", 'e'],
	['Pi', 'pi'],
	['Absolute', 'abs(x)'],
];

export function needsVariable(operation: Operation): boolean {
	return (
		operation === 'solve' ||
		operation === 'derivative' ||
		operation === 'integral'
	);
}

export function equationToPolynomial(expression: string): string {
	const split = expression.indexOf('=');
	if (split === -1) return expression;
	return `(${expression.slice(0, split)}) - (${expression.slice(split + 1)})`;
}

/** The roots of a polynomial equation, each to ten significant figures. */
export function solveRoots(math: MathModule, expression: string): string[] {
	const { coefficients } = math.rationalize(
		equationToPolynomial(expression),
		{},
		true,
	);
	const roots = (
		math.polynomialRoot as (...args: unknown[]) => unknown[]
	)(...coefficients);
	return roots.map((root) =>
		math.format(root, { precision: ROOT_PRECISION }),
	);
}

export function compute(
	{ math, cas }: Engines,
	operation: Operation,
	expression: string,
	variable: string,
): string {
	switch (operation) {
		case 'simplify':
			// rationalize expands polynomials
			try {
				return math
					.simplify(math.rationalize(expression))
					.toString();
			} catch {
				return math.simplify(expression).toString();
			}

		case 'expand':
			return math.rationalize(expression).toString();

		case 'solve':
			return `[${solveRoots(math, expression).join(',')}]`;

		case 'derivative':
			return math.derivative(expression, variable).toString();

		case 'factor':
		case 'integral': {
			const polynomial = equationToPolynomial(expression);
			try {
				return operation === 'factor'
					? cas
							.factor(polynomial)
							.text('fractions')
					: `${cas.integrate(polynomial, variable).text('fractions')} + C`;
			} finally {
				// nerdamer persists assignments
				cas.clearVars();
			}
		}
	}
}

/** `x` alone, or `x₁`, `x₂` for several. */
export function solutionName(
	variable: string,
	index: number,
	count: number,
): string {
	if (count < 2) return variable;
	return (
		variable +
		[...String(index + 1)]
			.map((digit) =>
				String.fromCodePoint(0x2080 + Number(digit)),
			)
			.join('')
	);
}
