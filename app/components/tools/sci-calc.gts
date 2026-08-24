import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from 'delphitools-v2/components/ui/popover';
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
} from 'delphitools-v2/components/ui/command';
import {
	MATH_CONSTANTS,
	formatScientific,
} from 'delphitools-v2/lib/math-constants';

export type AngleMode = 'deg' | 'rad';

export interface HistoryItem {
	id: number;
	expression: string;
	result: string;
}

const HISTORY_LIMIT = 20;
const COPIED_MS = 1500;

const BUTTON_ROWS = [
	['C', '(', ')', '%', '⌫'],
	['sin', 'cos', 'tan', 'π', '÷'],
	['asin', 'acos', 'atan', 'e', '×'],
	['x²', '√', 'xʸ', 'ʸ√x', '−'],
	['log', 'ln', '!', '|x|', '+'],
	['7', '8', '9', '10ˣ', 'eˣ'],
	['4', '5', '6', 'Const', 'Ans'],
];

// split around the double-height = so grid auto-placement places it
const BOTTOM_LEFT = [
	['1', '2', '3', '.'],
	['0', '±', 'EE', 'mod'],
];

export const KEYPAD: string[] = [
	...BUTTON_ROWS.flat(),
	...(BOTTOM_LEFT[0] ?? []),
	'=',
	...(BOTTOM_LEFT[1] ?? []),
];

const OPERATORS = ['+', '−', '×', '÷', '%'];
const DIGIT = /^[0-9.]$/;

export function keyVariant(btn: string): string {
	if (btn === '=') return 'is-equals';
	if (btn === 'C' || btn === '⌫') return 'is-clear';
	if (OPERATORS.includes(btn)) return 'is-operator';
	if (DIGIT.test(btn)) return 'is-digit';
	if (btn === 'Const') return 'is-const';
	return 'is-default';
}

// math.PI/E equal mathjs pi/e; avoids loading the library until evaluation
export function prepareExpression(expr: string, lastAnswer: number): string {
	return (
		expr
			.replace(/×/g, '*')
			.replace(/÷/g, '/')
			.replace(/−/g, '-')
			.replace(/π/g, `(${Math.PI})`)
			// protect 5e10 notation before standalone-e rule
			.replace(/(\d\.?\d*)[eE]([+-]?\d)/g, '$1e$2')
			// lone e is Euler's number, not an exponent
			.replace(/(^|[^0-9])e(?!x|[0-9])/g, `$1(${Math.E})`)
			.replace(/Ans/g, `(${lastAnswer})`)
			.replace(/(\d+)!/g, 'factorial($1)')
			.replace(/\|([^|]+)\|/g, 'abs($1)')
	);
}

// scope, not string rewrite, so nested calls compose
export function angleScope(
	mode: AngleMode,
): Record<string, (x: number) => number> {
	if (mode === 'rad') return {};
	return {
		sin: (x) => Math.sin((x * Math.PI) / 180),
		cos: (x) => Math.cos((x * Math.PI) / 180),
		tan: (x) => Math.tan((x * Math.PI) / 180),
		asin: (x) => (Math.asin(x) * 180) / Math.PI,
		acos: (x) => (Math.acos(x) * 180) / Math.PI,
		atan: (x) => (Math.atan(x) * 180) / Math.PI,
	};
}

// mathjs units/complex/matrices print via String()
export function resultText(value: unknown): string {
	return typeof value === 'number'
		? formatScientific(value)
		: String(value);
}

// ~700 KB; loaded on first = and cached
let mathjs: typeof import('mathjs') | null = null;

async function loadMathjs() {
	mathjs ??= await import('mathjs');
	return mathjs;
}

export default class SciCalcTool extends Component {
	@tracked expression = '';
	@tracked result: string | null = null;
	@tracked error: string | null = null;
	@tracked angleMode: AngleMode = 'deg';
	@tracked history: HistoryItem[] = [];
	@tracked historyOpen = false;
	@tracked lastAnswer = 0;
	@tracked copied = false;
	@tracked constantsOpen = false;

	#nextHistoryId = 0;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get buttons() {
		return KEYPAD.map((label) => ({
			key: label,
			label,
			variant: keyVariant(label),
			isConst: label === 'Const',
		}));
	}

	get display() {
		return this.expression || '0';
	}

	get readout() {
		return this.error ?? this.result ?? '0';
	}

	get showCopy() {
		return this.result !== null && this.error === null;
	}

	get constantGroups() {
		// next app verbatim headings
		return [
			{ key: 'mathematical', heading: 'Mathematical' },
			{ key: 'physical', heading: 'Physical' },
			{ key: 'chemical', heading: 'Chemical' },
		].map((group) => ({
			...group,
			constants: MATH_CONSTANTS.filter(
				(c) => c.category === group.key,
			).map((c) => ({
				name: c.name,
				symbol: c.symbol,
				value: c.value,
				search: `${c.name} ${c.symbol}`,
			})),
		}));
	}

	// document, not window, so it only fires while tool is on screen
	shortcuts = modifier((element: HTMLElement) => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement) return;

			const key = event.key;
			if (/^[0-9.+\-*/()%^]$/.test(key)) {
				event.preventDefault();
				const mapped =
					key === '*'
						? '×'
						: key === '/'
							? '÷'
							: key === '-'
								? '−'
								: key;
				this.press(mapped);
			} else if (key === 'Enter') {
				event.preventDefault();
				void this.calculate();
			} else if (key === 'Backspace') {
				event.preventDefault();
				this.press('⌫');
			} else if (key === 'Escape') {
				event.preventDefault();
				this.press('C');
			}
		};

		element.ownerDocument.addEventListener('keydown', onKeyDown);
		return () =>
			element.ownerDocument.removeEventListener(
				'keydown',
				onKeyDown,
			);
	});

	calculate = async () => {
		if (!this.expression.trim()) return;

		try {
			const { evaluate } = await loadMathjs();
			const prepared = prepareExpression(
				this.expression,
				this.lastAnswer,
			);
			const value: unknown = evaluate(
				prepared,
				angleScope(this.angleMode),
			);
			const text = resultText(value);

			this.result = text;
			this.error = null;
			this.lastAnswer = typeof value === 'number' ? value : 0;
			this.history = [
				{
					id: this.#nextHistoryId++,
					expression: this.expression,
					result: text,
				},
				...this.history.slice(0, HISTORY_LIMIT - 1),
			];
		} catch {
			// next app wording
			this.error = 'Error';
			this.result = null;
		}
	};

	press = (btn: string) => {
		this.error = null;

		switch (btn) {
			case 'C':
				this.expression = '';
				this.result = null;
				break;
			case '⌫':
				this.expression = this.expression.slice(0, -1);
				break;
			case '=':
				void this.calculate();
				break;
			case '±':
				// strip leaves ×/^ so exponential results negate wrong
				if (this.result !== null) {
					const num = Number.parseFloat(
						this.result.replace(
							/[^\d.-]/g,
							'',
						),
					);
					if (!Number.isNaN(num)) {
						this.expression = String(-num);
						this.result = null;
					}
				} else if (this.expression) {
					this.expression =
						this.expression.startsWith('-')
							? this.expression.slice(
									1,
								)
							: `-${this.expression}`;
				}
				break;
			case 'x²':
				this.expression = `(${this.expression || '0'})^2`;
				break;
			case '√':
				this.expression = `sqrt(${this.expression})`;
				break;
			case 'xʸ':
				this.expression += '^';
				break;
			case 'ʸ√x':
				this.expression += 'nthRoot(';
				break;
			case '10ˣ':
				this.expression = `10^(${this.expression})`;
				break;
			case 'eˣ':
				this.expression = `exp(${this.expression})`;
				break;
			case 'log':
				this.expression += 'log10(';
				break;
			case 'ln':
				this.expression += 'log(';
				break;
			case '!':
				this.expression += '!';
				break;
			case '|x|':
				this.expression = `|${this.expression}|`;
				break;
			case 'sin':
			case 'cos':
			case 'tan':
			case 'asin':
			case 'acos':
			case 'atan':
				this.expression += `${btn}(`;
				break;
			case 'EE':
				this.expression += 'e';
				break;
			case 'mod':
				this.expression += ' mod ';
				break;
			case 'Ans':
				this.expression += 'Ans';
				break;
			default:
				// digit on a result starts a fresh expression
				if (this.result !== null && DIGIT.test(btn)) {
					this.expression = btn;
					this.result = null;
				} else {
					this.expression += btn;
				}
		}
	};

	setAngleMode = (mode: AngleMode) => {
		this.angleMode = mode;
	};

	toggleHistory = () => {
		this.historyOpen = !this.historyOpen;
	};

	setConstantsOpen = (open: boolean) => {
		this.constantsOpen = open;
	};

	chooseConstant = (value: number) => {
		this.expression += formatScientific(value);
		this.constantsOpen = false;
	};

	loadFromHistory = (item: HistoryItem) => {
		this.expression = item.expression;
		this.result = item.result;
		this.historyOpen = false;
	};

	copyResult = async () => {
		if (!this.result) return;
		await navigator.clipboard.writeText(this.result);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	copy = () => void this.copyResult();

	<template>
		<div class="dt-sci" {{this.shortcuts}}>
			<div class="dt-sci-frame">
				<div class="dt-sci-head">
					<button
						type="button"
						class="dt-sci-mode
							{{if
								(eq
									this.angleMode
									'deg'
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setAngleMode
								"deg"
							)
						}}
					>DEG</button>
					<button
						type="button"
						class="dt-sci-mode
							{{if
								(eq
									this.angleMode
									'rad'
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setAngleMode
								"rad"
							)
						}}
					>RAD</button>
					<button
						type="button"
						class="dt-sci-history-toggle"
						aria-expanded={{if
							this.historyOpen
							"true"
							"false"
						}}
						{{on
							"click"
							this.toggleHistory
						}}
					>
						<Icon @name="clock" />
						{{! next app wording }}
						History
						<Icon
							@name="chevron-down"
							class="dt-sci-chevron
								{{if
									this.historyOpen
									'is-open'
								}}"
						/>
					</button>
				</div>

				<div class="dt-sci-display">
					<div
						class="dt-sci-expression"
					>{{this.display}}</div>
					<div class="dt-sci-readout">
						<div
							class="dt-sci-value
								{{if
									this.error
									'is-error'
								}}"
						>{{this.readout}}</div>
						{{#if this.showCopy}}
							<button
								type="button"
								class="dt-sci-copy"
								aria-label="Copy result"
								{{on
									"click"
									this.copy
								}}
							>
								<Icon
									@name={{if
										this.copied
										"check"
										"copy"
									}}
									class={{if
										this.copied
										"is-copied"
									}}
								/>
							</button>
						{{/if}}
					</div>
				</div>

				{{#if this.historyOpen}}
					<div class="dt-sci-history">
						{{#each
							this.history key="id"
							as |item|
						}}
							<button
								type="button"
								class="dt-sci-history-item"
								{{on
									"click"
									(fn
										this.loadFromHistory
										item
									)
								}}
							>
								<div
									class="dt-sci-history-expression"
								>{{item.expression}}</div>
								<div
									class="dt-sci-history-result"
								>{{item.result}}</div>
							</button>
						{{else}}
							{{! next app wording }}
							<p
								class="dt-sci-history-empty"
							>No history yet</p>
						{{/each}}
					</div>
				{{/if}}

				<div class="dt-sci-keypad segmented">
					{{#each
						this.buttons key="key"
						as |btn|
					}}
						{{#if btn.isConst}}
							<Popover
								@open={{this.constantsOpen}}
								@onOpenChange={{this.setConstantsOpen}}
							>
								<PopoverTrigger
									@asChild={{true}}
									as |trigger|
								>
									{{! next app wording }}
									<button
										type="button"
										class="dt-sci-key is-const"
										{{trigger.modifiers}}
									>Const</button>
								</PopoverTrigger>
								<PopoverContent
									@align="start"
									class="dt-sci-constants"
								>
									<Command
									>
										{{! next app wording }}
										<CommandInput
											@placeholder="Search constants..."
										/>
										<CommandList
										>
											{{! next app wording }}
											<CommandEmpty
											>No
												constant
												found.</CommandEmpty>
											{{#each
												this.constantGroups
												key="key"
												as |group|
											}}
												<CommandGroup
													@heading={{group.heading}}
												>
													{{#each
														group.constants
														key="name"
														as |constant|
													}}
														<CommandItem
															@value={{constant.search}}
															@onSelect={{fn
																this.chooseConstant
																constant.value
															}}
														>
															<span
																class="dt-sci-constant-symbol"
															>{{constant.symbol}}</span>
															<span
																class="dt-sci-constant-name"
															>{{constant.name}}</span>
														</CommandItem>
													{{/each}}
												</CommandGroup>
											{{/each}}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						{{else}}
							<button
								type="button"
								class="dt-sci-key
									{{btn.variant}}"
								{{on
									"click"
									(fn
										this.press
										btn.key
									)
								}}
							>{{btn.label}}</button>
						{{/if}}
					{{/each}}
				</div>
			</div>

			{{! next app wording }}
			<p class="dt-sci-hint">Keyboard supported: numbers,
				operators, Enter to calculate, Escape to clear</p>
		</div>
	</template>
}
