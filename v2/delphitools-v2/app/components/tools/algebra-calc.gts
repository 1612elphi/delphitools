import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';

type MathModule = typeof import('mathjs');

export type Operation =
	'simplify' | 'expand' | 'factor' | 'solve' | 'derivative' | 'integral';

const COPIED_MS = 1500;
const ROOT_PRECISION = 10;

// ∑CG: error shown in the result panel when the chosen operation is one this build cannot perform
//   spec: one line, no more than 70 characters, names the operation as unavailable, factual, no apology
//   sample: "Factoring is not available in this build"
const UNSUPPORTED_OP = '∑CG';

/** Labels carried over from the Next app, verbatim. */
export const OPERATIONS: { id: Operation; label: string }[] = [
	{ id: 'simplify', label: 'Simplify' },
	{ id: 'expand', label: 'Expand' },
	{ id: 'factor', label: 'Factor' },
	{ id: 'solve', label: 'Solve' },
	{ id: 'derivative', label: 'd/dx' },
	{ id: 'integral', label: '∫' },
];

/** Example expressions carried over from the Next app, verbatim. */
export const EXAMPLES: Record<Operation, string[]> = {
	simplify: ['(x+1)^2 - x^2', 'sin(x)^2 + cos(x)^2', '(a*b)/(a*c)'],
	expand: ['(x+1)^3', '(a+b)*(a-b)', '(x+y+z)^2'],
	factor: ['x^2 - 4', 'x^3 - 1', 'x^2 + 5*x + 6'],
	solve: ['x^2 - 4 = 0', '2*x + 3 = 7', 'x^2 + x - 6 = 0'],
	derivative: ['x^3', 'sin(x)*cos(x)', 'e^x * x^2'],
	integral: ['x^2', 'sin(x)', '1/x'],
};

/** Syntax table carried over from the Next app, verbatim. */
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

const OPERATIONS_WITH_VARIABLE: Operation[] = [
	'solve',
	'derivative',
	'integral',
];

/**
 * `lhs = rhs` as a single expression whose roots are the equation's solutions.
 * Anything without an `=` is already in that form.
 */
export function equationToPolynomial(expression: string): string {
	const split = expression.indexOf('=');
	if (split === -1) return expression;
	return `(${expression.slice(0, split)}) - (${expression.slice(split + 1)})`;
}

/**
 * Roots of the polynomial the equation reduces to, in nerdamer's bracket form
 * so the copied text matches what the Next app produced.
 *
 * mathjs solves by coefficients, so this covers cubics and below in one
 * variable; anything else throws mathjs's own message.
 */
function solveEquation(math: MathModule, expression: string): string {
	const { coefficients } = math.rationalize(
		equationToPolynomial(expression),
		{},
		true,
	);
	const roots = (
		math.polynomialRoot as (...args: unknown[]) => unknown[]
	)(...coefficients);
	return `[${roots
		.map((root) => math.format(root, { precision: ROOT_PRECISION }))
		.join(',')}]`;
}

/**
 * The operation applied, as plain text. Throws on bad input; the message shown
 * is mathjs's own wherever mathjs raised it.
 *
 * Takes the module rather than importing it, so the algebra is testable without
 * a dynamic import.
 */
export function compute(
	math: MathModule,
	operation: Operation,
	expression: string,
	variable: string,
): string {
	switch (operation) {
		case 'simplify':
			// mathjs's simplify does not multiply brackets out, so `(x+1)^2 - x^2`
			// would come back unchanged. rationalize expands first; it rejects
			// non-polynomials such as sin(x)^2, which then take the plain path.
			try {
				return math
					.simplify(math.rationalize(expression))
					.toString();
			} catch {
				return math.simplify(expression).toString();
			}

		case 'expand':
			// The expanded polynomial with its terms left as they fall; simplify
			// is the operation that collects them.
			return math.rationalize(expression).toString();

		case 'solve':
			return solveEquation(math, expression);

		case 'derivative':
			return math.derivative(expression, variable).toString();

		case 'factor':
		case 'integral':
			throw new Error(UNSUPPORTED_OP);
	}
}

interface Result {
	input: string;
	output: string;
}

let mathModule: Promise<MathModule> | null = null;

/** One import for the lifetime of the page; mathjs is large. */
function loadMath(): Promise<MathModule> {
	mathModule ??= import('mathjs');
	return mathModule;
}

export default class AlgebraCalcTool extends Component {
	@tracked expression = '';
	@tracked variable = 'x';
	@tracked operation: Operation = 'simplify';
	@tracked result: Result | null = null;
	@tracked error: string | null = null;
	@tracked loading = false;
	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get operations() {
		return OPERATIONS;
	}

	get syntax() {
		return SYNTAX.map(([label, syntax]) => ({ label, syntax }));
	}

	get examples() {
		return EXAMPLES[this.operation];
	}

	get showVariable() {
		return OPERATIONS_WITH_VARIABLE.includes(this.operation);
	}

	get placeholder() {
		// wording carried over from the Next app
		return this.operation === 'solve'
			? 'e.g., x^2 - 4 = 0'
			: 'e.g., (x+1)^2 - x^2';
	}

	get canCalculate() {
		return Boolean(this.expression.trim()) && !this.loading;
	}

	get isDisabled() {
		return !this.canCalculate;
	}

	chooseOperation = (operation: Operation) => {
		this.operation = operation;
	};

	setExpression = (event: Event) => {
		this.expression = (event.target as HTMLInputElement).value;
	};

	setVariable = (event: Event) => {
		this.variable = (event.target as HTMLInputElement).value || 'x';
	};

	useExample = (example: string) => {
		this.expression = example;
	};

	onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Enter') void this.calculate();
	};

	calculate = async () => {
		if (!this.canCalculate) return;

		this.loading = true;
		this.error = null;
		this.result = null;

		try {
			const math = await loadMath();
			const output = compute(
				math,
				this.operation,
				this.expression,
				this.variable,
			);
			this.result = { input: this.expression, output };
		} catch (error) {
			// wording carried over from the Next app
			this.error =
				error instanceof Error
					? error.message
					: 'Invalid expression';
		} finally {
			this.loading = false;
		}
	};

	runCalculate = () => void this.calculate();

	copyResult = () => {
		const result = this.result;
		if (!result) return;
		void navigator.clipboard.writeText(result.output);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	<template>
		<div class="dt-alg">
			<div class="segmented dt-alg-ops">
				{{#each this.operations key="id" as |item|}}
					<button
						type="button"
						class="dt-alg-op
							{{if
								(eq
									this.operation
									item.id
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.chooseOperation
								item.id
							)
						}}
					>{{item.label}}</button>
				{{/each}}
			</div>

			<div class="dt-alg-section">
				{{! wording carried over from the Next app }}
				<span class="dt-alg-label">Expression</span>
				<div class="dt-alg-field">
					<input
						type="text"
						class="dt-alg-input"
						value={{this.expression}}
						placeholder={{this.placeholder}}
						aria-label="Expression"
						{{on
							"input"
							this.setExpression
						}}
						{{on "keydown" this.onKeyDown}}
					/>
					{{#if this.showVariable}}
						<div class="dt-alg-var">
							{{! wording carried over from the Next app }}
							<span
								class="dt-alg-var-label"
							>var</span>
							<input
								type="text"
								class="dt-alg-var-input"
								value={{this.variable}}
								maxlength="2"
								aria-label="Variable"
								{{on
									"input"
									this.setVariable
								}}
							/>
						</div>
					{{/if}}
				</div>
			</div>

			<button
				type="button"
				class="dt-alg-run"
				disabled={{this.isDisabled}}
				{{on "click" this.runCalculate}}
			>
				{{#if this.loading}}
					<Icon
						class="dt-alg-spinner"
						@name="loader-circle"
					/>
					{{! wording carried over from the Next app }}
					Calculating…
				{{else}}
					{{! wording carried over from the Next app }}
					Calculate
				{{/if}}
			</button>

			{{#if this.error}}
				<div class="dt-alg-result">
					<div
						class="dt-alg-error"
					>{{this.error}}</div>
				</div>
			{{else if this.result}}
				<div class="dt-alg-result">
					<div class="dt-alg-echo">
						{{! wording carried over from the Next app }}
						<span>Input:</span>
						<span
							class="dt-alg-echo-value"
						>{{this.result.input}}</span>
					</div>
					<div class="dt-alg-output-row">
						<div
							class="dt-alg-output"
						>{{this.result.output}}</div>
						<button
							type="button"
							class="dt-alg-copy"
							aria-label="Copy"
							{{on
								"click"
								this.copyResult
							}}
						>
							<Icon
								@name={{if
									this.copied
									"check"
									"copy"
								}}
							/>
						</button>
					</div>
				</div>
			{{/if}}

			<div class="dt-alg-block">
				<div class="dt-alg-block-head">
					{{! wording carried over from the Next app }}
					<span
						class="dt-alg-label"
					>Examples</span>
				</div>
				<div class="dt-alg-examples">
					{{#each
						this.examples key="@identity"
						as |example|
					}}
						<button
							type="button"
							class="dt-alg-example"
							{{on
								"click"
								(fn
									this.useExample
									example
								)
							}}
						>{{example}}</button>
					{{/each}}
				</div>
			</div>

			<div class="dt-alg-block is-last">
				<div class="dt-alg-block-head">
					{{! wording carried over from the Next app }}
					<span class="dt-alg-label">Syntax
						Reference</span>
				</div>
				<div class="dt-alg-syntax">
					{{#each
						this.syntax key="label"
						as |row|
					}}
						<div class="dt-alg-syntax-row">
							<span
								class="dt-alg-syntax-label"
							>{{row.label}}</span>
							<span
								class="dt-alg-syntax-code"
							>{{row.syntax}}</span>
						</div>
					{{/each}}
				</div>
			</div>
		</div>
	</template>
}
