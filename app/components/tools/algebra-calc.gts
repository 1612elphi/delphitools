import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMathField, {
	CanonMathFieldHandle,
} from 'delphicanon/components/canon-math-field';
import CanonMathKey from 'delphicanon/components/canon-math-key';
import CanonMathView from 'delphicanon/components/canon-math-view';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import type { Key } from 'delphicanon/lib/math/expression';
import { keyForKeyboard } from 'delphicanon/lib/math/keypad';
import { N, parse, present, same, type Node } from 'delphicanon/lib/math/node';
import press from 'delphicanon/modifiers/canon-press';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	EXAMPLES,
	OPERATIONS,
	SYNTAX,
	compute,
	loadEngines,
	needsVariable,
	solutionName,
	solveRoots,
	type Engines,
	type Operation,
} from 'delphitools-v2/components/tools/algebra-calc/algebra';
import Picture, {
	pictureHeight,
	type PictureLine,
} from 'delphitools-v2/components/tools/algebra-calc/picture';
import './algebra-calc/algebra-calc.css';

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const ReuseIcon = <template><IconSvg @name="corner-left-up" /></template>;

const operationLabels = OPERATIONS.map((op) => op.label);
const operationIds = OPERATIONS.map((op) => op.id);
const keys: Key[] = [
	{ kind: 'fraction' },
	{ kind: 'power' },
	{ kind: 'square' },
	{ kind: 'root' },
	{ kind: 'open' },
	{ kind: 'symbol', symbol: '×' },
	{ kind: 'symbol', symbol: '=' },
	{ kind: 'symbol', symbol: 'π' },
];
const syntaxTiles = SYNTAX.map(([label, value]) => ({ label, value }));
const canvasHeight = pictureHeight + 4;

interface Outcome {
	output?: string;
	roots?: string[];
	error?: string;
}

function withoutConstant(text: string) {
	return text.endsWith(' + C') ? text.slice(0, -4) : text;
}

export default class AlgebraCalcTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked expression = '';
	@tracked variableText = 'x';
	@tracked operation: Operation = 'simplify';
	@tracked engines?: Engines;
	@tracked promoted = 0;
	handle = new CanonMathFieldHandle();

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.expression = query.get('algExpr') ?? '';
		const op = query.get('algOp')?.toLowerCase();
		if (operationIds.includes(op as Operation))
			this.operation = op as Operation;
		this.variableText = query.get('algVar')?.slice(0, 2) ?? 'x';
		void loadEngines().then((engines) => {
			if (!this.isDestroying) this.engines = engines;
		});
	}

	get variable() {
		return this.variableText.trim() || 'x';
	}

	get trimmed() {
		return this.expression.trim();
	}

	evaluate(expression: string): Outcome | undefined {
		const { engines } = this;
		if (!engines || !expression) return undefined;
		try {
			if (this.operation === 'solve')
				return {
					roots: solveRoots(
						engines.math,
						expression,
					),
				};
			return {
				output: compute(
					engines,
					this.operation,
					expression,
					this.variable,
				),
			};
		} catch (error) {
			return {
				error:
					error instanceof Error
						? error.message
						: 'Invalid expression',
			};
		}
	}

	get outcome() {
		return this.evaluate(this.trimmed);
	}

	get failure() {
		return this.outcome?.error;
	}

	get hasResult() {
		const outcome = this.outcome;
		return !!outcome && !outcome.error;
	}

	get operationIndex() {
		return operationIds.indexOf(this.operation);
	}

	get resultTitle() {
		return OPERATIONS[this.operationIndex]!.result;
	}

	get showsVariable() {
		return needsVariable(this.operation);
	}

	get resultLines() {
		const outcome = this.outcome;
		if (!outcome || outcome.error)
			return [{ label: '=', value: undefined }];
		if (outcome.roots)
			return outcome.roots.map((value, index, all) => ({
				label: `${solutionName(this.variable, index, all.length)} =`,
				value,
			}));
		return [{ label: '=', value: outcome.output }];
	}

	get noSolution() {
		return this.outcome?.roots?.length === 0;
	}

	get canReuse() {
		return this.hasResult && this.operation !== 'solve';
	}

	get examples() {
		const typed = parse(this.trimmed);
		return EXAMPLES[this.operation].map((expression) => {
			const node = parse(expression);
			return {
				expression,
				current: !!typed && !!node && same(node, typed),
			};
		});
	}

	inputNode(input: string): Node | undefined {
		const node = parse(input);
		if (!node) return undefined;
		switch (this.operation) {
			case 'derivative':
				return N.derivative(node, this.variable);
			case 'integral':
				return N.integral(node, this.variable);
			case 'solve':
				return node.k === 'relation'
					? node
					: N.relation('=', node, N.number('0'));
			default:
				return node;
		}
	}

	resultNode(outcome: Outcome): Node | undefined {
		if (outcome.roots) {
			const variable = N.symbol(this.variable);
			if (!outcome.roots.length)
				return N.relation('∈', variable, N.symbol('∅'));
			const relations = outcome.roots.map(
				(value, index, all) => {
					const parsed = parse(value);
					return N.relation(
						'=',
						all.length > 1
							? N.sub(
									variable,
									String(
										index +
											1,
									),
								)
							: variable,
						parsed
							? present(parsed)
							: N.word(value),
					);
				},
			);
			return relations.length === 1
				? relations[0]
				: N.list(relations);
		}
		const output = outcome.output ?? '';
		const constant = output !== withoutConstant(output);
		const parsed = parse(withoutConstant(output));
		if (!parsed) return undefined;
		const shown = present(parsed);
		const terms = shown.k === 'sum' ? shown.items : [shown];
		return N.relation(
			'=',
			N.word(''),
			constant ? N.sum([...terms, N.symbol('C')]) : shown,
		);
	}

	lines(input: string, outcome: Outcome | undefined): PictureLine[] {
		const lines: PictureLine[] = [
			{
				node: this.inputNode(input),
				fallback: input,
				size: 24,
				ink: 'input',
			},
		];
		if (outcome && !outcome.error)
			lines.push({
				node: this.resultNode(outcome),
				fallback: `= ${outcome.output ?? outcome.roots?.join(', ')}`,
				size: 32,
				ink: 'result',
			});
		return lines;
	}

	get ghost() {
		return EXAMPLES[this.operation][0]!;
	}

	get faint() {
		return !this.trimmed;
	}

	get pictureLines() {
		return this.faint
			? this.lines(this.ghost, this.evaluate(this.ghost))
			: this.lines(this.trimmed, this.outcome);
	}

	get pictureLabel() {
		return this.pictureLines
			.map((line) => line.fallback)
			.join(', ');
	}

	get copyText() {
		const outcome = this.outcome;
		if (!outcome || outcome.error) return undefined;
		if (outcome.roots)
			return outcome.roots
				.map((value) => `${this.variable} = ${value}`)
				.join(', ');
		return outcome.output;
	}

	setVariable = (text: string) => (this.variableText = text.slice(0, 2));

	choose = (index: number) => (this.operation = operationIds[index]!);

	useExample = (expression: string) => (this.expression = expression);

	openKeypad = (key: Key) => this.handle.edit([key]);

	keypadChanged = (text: string) => (this.expression = text);

	typeInField = (event: KeyboardEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const key = keyForKeyboard(event.key);
		if (!key || ['left', 'right', 'up', 'down'].includes(key.kind))
			return;
		event.preventDefault();
		if (key.kind !== 'delete') this.expression = '';
		this.handle.edit([key]);
	};

	useAsInput = () => {
		const output = this.outcome?.output;
		if (!output || !this.canReuse) return;
		this.expression = withoutConstant(output);
		this.promoted += 1;
	};

	copy = () => {
		const text = this.copyText;
		if (text) void this.toast.copy(text);
	};

	<template>
		<CanonSplit class="algebra-calc" @halves={{true}}>
			<:banner>
				<CanonCanvas @height={{canvasHeight}}>
					<Picture
						@lines={{this.pictureLines}}
						@faint={{this.faint}}
						@promoted={{this.promoted}}
						@label={{this.pictureLabel}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonMathField
						class="alg-field"
						@text={{this.expression}}
						@variable={{this.variable}}
						@placeholder={{this.ghost}}
						@size={{30}}
						@handle={{this.handle}}
						@onChange={{this.keypadChanged}}
						@onCompletion={{this.keypadChanged}}
						{{on
							"keydown"
							this.typeInField
						}}
					/>
					{{#if this.failure}}
						<CanonStatus
							@text={{this.failure}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonGrid @columns={{4}}>
						{{#each keys as |key|}}
							<CanonMathKey
								@key={{key}}
								@variable={{this.variable}}
								@onClick={{fn
									this.openKeypad
									key
								}}
							/>
						{{/each}}
					</CanonGrid>
					{{#if this.showsVariable}}
						<CanonRow
							@title="Variable"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								class="alg-variable"
								@value={{this.variableText}}
								@onChange={{this.setVariable}}
								maxlength="2"
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					{{/if}}
					<CanonHeading @text="Operation" />
					<CanonSegmented
						aria-label="Operation"
						@items={{operationLabels}}
						@columns={{3}}
						@selected={{this.operationIndex}}
						@onChange={{this.choose}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text={{this.resultTitle}}
					/>
					{{#if this.noSolution}}
						<CanonStatus
							@text="No solution"
							@tone="muted"
							@row={{true}}
						/>
					{{else}}
						{{#each
							this.resultLines
							as |line|
						}}
							<CanonValueLine
								@label={{line.label}}
								@value={{line.value}}
								@layout="wrapping"
							/>
						{{/each}}
					{{/if}}
					<CanonGrid @columns={{2}}>
						<CanonButton
							@kind="secondary"
							@text="Use as input"
							@icon={{ReuseIcon}}
							@disabled={{if
								this.canReuse
								false
								true
							}}
							@onClick={{this.useAsInput}}
						/>
						<CanonButton
							@kind="primary"
							@text="Copy"
							@icon={{CopyIcon}}
							@disabled={{if
								this.hasResult
								false
								true
							}}
							@onClick={{this.copy}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Examples" />
					{{#each
						this.examples key="expression"
						as |example|
					}}
						<button
							type="button"
							class="alg-example"
							aria-label={{example.expression}}
							aria-current={{if
								example.current
								"true"
							}}
							{{press}}
							{{on
								"click"
								(fn
									this.useExample
									example.expression
								)
							}}
						>
							<CanonMathView
								class="alg-example-math"
								@text={{example.expression}}
								@size={{19}}
								@label=""
							/>
							<span
								class="alg-example-code"
							>{{example.expression}}</span>
						</button>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="Syntax Reference"
					/>
					<CanonTiles @items={{syntaxTiles}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
