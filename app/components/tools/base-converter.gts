import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';

export type Base = 'dec' | 'hex' | 'bin' | 'oct';
export type BitwiseOp = 'AND' | 'OR' | 'XOR' | 'NOT' | 'LSH' | 'RSH';

export interface BaseValues {
	dec: string;
	hex: string;
	bin: string;
	oct: string;
}

export const BASE_INFO: Record<
	Base,
	{ name: string; prefix: string; radix: number; placeholder: string }
> = {
	dec: { name: 'Decimal', prefix: '', radix: 10, placeholder: '255' },
	hex: {
		name: 'Hexadecimal',
		prefix: '0x',
		radix: 16,
		placeholder: 'FF',
	},
	bin: {
		name: 'Binary',
		prefix: '0b',
		radix: 2,
		placeholder: '11111111',
	},
	oct: { name: 'Octal', prefix: '0o', radix: 8, placeholder: '377' },
};

export const BASES: Base[] = ['dec', 'hex', 'bin', 'oct'];

export const BITWISE_OPS: BitwiseOp[] = [
	'AND',
	'OR',
	'XOR',
	'NOT',
	'LSH',
	'RSH',
];

const OP_BUTTON: Record<BitwiseOp, string> = {
	AND: 'AND',
	OR: 'OR',
	XOR: 'XOR',
	NOT: 'NOT',
	LSH: '<<',
	RSH: '>>',
};

const OP_SIGN: Record<BitwiseOp, string> = {
	AND: 'AND',
	OR: 'OR',
	XOR: 'XOR',
	NOT: '~',
	LSH: '<<',
	RSH: '>>',
};

export const BITWISE_REF: { op: string; desc: string }[] = [
	{ op: 'AND (&)', desc: '1 if both bits are 1' },
	{ op: 'OR (|)', desc: '1 if either bit is 1' },
	{ op: 'XOR (^)', desc: '1 if bits differ' },
	{ op: 'NOT (~)', desc: 'Flip all bits' },
	{ op: '<< (LSH)', desc: 'Shift bits left' },
	{ op: '>> (RSH)', desc: 'Shift bits right' },
];

const EMPTY: BaseValues = { dec: '', hex: '', bin: '', oct: '' };

const BIT_COUNT = 16;
const COPIED_MS = 1500;

export function parseValue(value: string, base: Base): number | null {
	const cleaned = value.trim().toLowerCase();
	if (!cleaned) return null;

	const prefix = BASE_INFO[base].prefix;
	const toParse =
		prefix && cleaned.startsWith(prefix)
			? cleaned.slice(prefix.length)
			: cleaned;

	const result = Number.parseInt(toParse, BASE_INFO[base].radix);
	return Number.isNaN(result) ? null : result;
}

export function convertAll(num: number): BaseValues {
	return {
		dec: num.toString(10),
		hex: num.toString(16).toUpperCase(),
		bin: num.toString(2),
		oct: num.toString(8),
	};
}

export function applyBitwise(
	op: BitwiseOp,
	a: number | null,
	b: number | null,
	shift: number,
): number | null {
	if (a === null) return null;

	switch (op) {
		case 'AND':
			return b === null ? null : (a & b) >>> 0;
		case 'OR':
			return b === null ? null : (a | b) >>> 0;
		case 'XOR':
			return b === null ? null : (a ^ b) >>> 0;
		case 'NOT':
			return ~a >>> 0;
		case 'LSH':
			return (a << shift) >>> 0;
		case 'RSH':
			return a >>> shift;
	}
}

export function getBits(value: string): boolean[] {
	const num = Number.parseInt(value, 10);
	if (Number.isNaN(num) || num < 0)
		return Array<boolean>(BIT_COUNT).fill(false);

	const bits: boolean[] = [];
	for (let i = BIT_COUNT - 1; i >= 0; i--) {
		bits.push(((num >> i) & 1) === 1);
	}
	return bits;
}

export default class BaseConverterTool extends Component {
	@tracked values: BaseValues = EMPTY;
	@tracked activeBase: Base | null = null;
	@tracked error: string | null = null;
	@tracked copied: Base | null = null;

	@tracked bitwiseA: BaseValues = EMPTY;
	@tracked bitwiseB: BaseValues = EMPTY;
	@tracked bitwiseOp: BitwiseOp = 'AND';
	@tracked bitwiseResult: BaseValues | null = null;
	@tracked shiftAmount = '1';

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get hasValue() {
		return this.values.dec !== '';
	}

	get converterRows() {
		return BASES.map((base) => {
			const value = this.values[base];
			return {
				id: base,
				name: BASE_INFO[base].name,
				prefix: BASE_INFO[base].prefix,
				placeholder: BASE_INFO[base].placeholder,
				value,
				isEmpty: value === '',
				isActive:
					this.activeBase === base &&
					this.hasValue,
				isCopied: this.copied === base,
			};
		});
	}

	get showBits() {
		return (
			!this.hasValue ||
			Number.parseInt(this.values.dec, 10) <= 65535
		);
	}

	get bitCells() {
		return getBits(this.values.dec).map((on, position) => ({
			on,
			position,
			label: BIT_COUNT - 1 - position,
			digit: on ? '1' : '0',
		}));
	}

	get ops() {
		return BITWISE_OPS.map((op) => ({
			op,
			label: OP_BUTTON[op],
			isActive: this.bitwiseOp === op,
		}));
	}

	get showValueB() {
		return (
			this.bitwiseOp !== 'NOT' &&
			this.bitwiseOp !== 'LSH' &&
			this.bitwiseOp !== 'RSH'
		);
	}

	get showShift() {
		return this.bitwiseOp === 'LSH' || this.bitwiseOp === 'RSH';
	}

	get bitwiseARows() {
		return this.#inputRows(this.bitwiseA);
	}

	get bitwiseBRows() {
		return this.#inputRows(this.bitwiseB);
	}

	get resultRows() {
		const result = this.bitwiseResult;
		if (!result) return [];
		return BASES.map((base) => ({
			id: base,
			name: BASE_INFO[base].name,
			text: BASE_INFO[base].prefix + result[base],
		}));
	}

	get resultSummary() {
		const sign = OP_SIGN[this.bitwiseOp];
		const operand = this.showShift
			? this.shiftAmount
			: this.bitwiseOp === 'NOT'
				? ''
				: this.bitwiseB.dec;
		return `${this.bitwiseA.dec} ${sign} ${operand}`;
	}

	get reference() {
		return BITWISE_REF;
	}

	#inputRows(values: BaseValues) {
		return BASES.map((base) => ({
			id: base,
			name: BASE_INFO[base].name,
			prefix: BASE_INFO[base].prefix,
			placeholder: BASE_INFO[base].placeholder,
			value: values[base],
		}));
	}

	setBase = (base: Base, event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		this.activeBase = base;
		this.error = null;

		if (!value.trim()) {
			this.values = EMPTY;
			return;
		}

		const num = parseValue(value, base);
		if (num === null || num < 0) {
			this.error = `Invalid ${BASE_INFO[base].name.toLowerCase()} number`;
			this.values = { ...this.values, [base]: value };
			return;
		}

		this.values = convertAll(num);
	};

	toggleBit = (position: number) => {
		const num = Number.parseInt(this.values.dec, 10) || 0;
		this.values = convertAll(
			num ^ (1 << (BIT_COUNT - 1 - position)),
		);
	};

	setBitwise = (target: 'a' | 'b', base: Base, event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		const previous = target === 'a' ? this.bitwiseA : this.bitwiseB;

		let next: BaseValues;
		if (!value.trim()) {
			next = EMPTY;
		} else {
			const num = parseValue(value, base);
			next =
				num === null || num < 0
					? { ...previous, [base]: value }
					: convertAll(num);
		}

		if (target === 'a') this.bitwiseA = next;
		else this.bitwiseB = next;
	};

	setShiftAmount = (event: Event) => {
		this.shiftAmount = (event.target as HTMLInputElement).value;
	};

	chooseOp = (op: BitwiseOp) => {
		this.bitwiseOp = op;
		this.bitwiseResult = null;
	};

	calculate = () => {
		const parsedShift = Number.parseInt(this.shiftAmount, 10);
		const shift = Number.isNaN(parsedShift) ? 1 : parsedShift;

		const result = applyBitwise(
			this.bitwiseOp,
			parseValue(this.bitwiseA.dec, 'dec'),
			parseValue(this.bitwiseB.dec, 'dec'),
			shift,
		);

		this.bitwiseResult =
			result === null ? null : convertAll(result);
	};

	copy = async (base: Base) => {
		const value = this.values[base];
		if (!value) return;
		await navigator.clipboard.writeText(
			BASE_INFO[base].prefix + value,
		);
		this.copied = base;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copyBase = (base: Base) => void this.copy(base);

	<template>
		<div class="dt-bc">
			<Tabs @defaultValue="converter">
				<TabsList class="dt-bc-tabs">
					{{! wording carried over from the Next app }}
					<TabsTrigger
						class="dt-bc-tab"
						@value="converter"
					>Converter</TabsTrigger>
					{{! wording carried over from the Next app }}
					<TabsTrigger
						class="dt-bc-tab"
						@value="bitwise"
					>Bitwise Ops</TabsTrigger>
				</TabsList>

				<div class="dt-bc-panel">
					<TabsContent
						class="dt-bc-content"
						@value="converter"
					>
						<div class="dt-bc-rows">
							{{#each
								this.converterRows
								key="id"
								as |row|
							}}
								<div
									class="dt-bc-row
										{{if
											row.isActive
											'is-active'
										}}"
								>
									<span
										class="dt-bc-name"
									>{{row.name}}</span>
									<div
										class="dt-bc-field"
									>
										{{#if
											row.prefix
										}}
											<span
												class="dt-bc-prefix"
											>{{row.prefix}}</span>
										{{/if}}
										<input
											type="text"
											class="dt-bc-input"
											value={{row.value}}
											placeholder={{row.placeholder}}
											aria-label={{row.name}}
											{{on
												"input"
												(fn
													this.setBase
													row.id
												)
											}}
										/>
									</div>
									<button
										type="button"
										class="dt-bc-copy
											{{if
												row.isCopied
												'is-copied'
											}}"
										disabled={{row.isEmpty}}
										aria-label="Copy
											{{row.name}}"
										{{on
											"click"
											(fn
												this.copyBase
												row.id
											)
										}}
									>
										<Icon
											@name={{if
												row.isCopied
												"check"
												"copy"
											}}
										/>
									</button>
								</div>
							{{/each}}
						</div>

						{{#if this.error}}
							<div
								class="dt-bc-error"
							>{{this.error}}</div>
						{{/if}}

						{{#if this.showBits}}
							<div class="dt-bc-bits">
								{{! wording carried over from the Next app }}
								<span
									class="dt-bc-label"
								>Bit Toggle
									(16-bit)</span>
								<div
									class="dt-bc-bit-grid segmented"
								>
									{{#each
										this.bitCells
										key="position"
										as |cell|
									}}
										<button
											type="button"
											class="dt-bc-bit
												{{if
													cell.on
													'is-on'
												}}"
											aria-label="Bit
												{{cell.label}}"
											aria-pressed={{if
												cell.on
												"true"
												"false"
											}}
											{{on
												"click"
												(fn
													this.toggleBit
													cell.position
												)
											}}
										>{{cell.digit}}</button>
									{{/each}}
								</div>
								<div
									class="dt-bc-bit-labels"
								>
									{{#each
										this.bitCells
										key="position"
										as |cell|
									}}
										<span
										>{{cell.label}}</span>
									{{/each}}
								</div>
							</div>
						{{/if}}
					</TabsContent>

					<TabsContent
						class="dt-bc-content"
						@value="bitwise"
					>
						<div class="dt-bc-block">
							{{! wording carried over from the Next app }}
							<span
								class="dt-bc-label"
							>Operation</span>
							<div
								class="dt-bc-ops segmented"
							>
								{{#each
									this.ops
									key="op"
									as |option|
								}}
									<button
										type="button"
										class="dt-bc-op
											{{if
												option.isActive
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.chooseOp
												option.op
											)
										}}
									>{{option.label}}</button>
								{{/each}}
							</div>
						</div>

						<div class="dt-bc-block">
							{{! wording carried over from the Next app }}
							<span
								class="dt-bc-label"
							>Value A</span>
							<div
								class="dt-bc-operand"
							>
								{{#each
									this.bitwiseARows
									key="id"
									as |row|
								}}
									<div
										class="dt-bc-row"
									>
										<span
											class="dt-bc-name is-muted"
										>{{row.name}}</span>
										<div
											class="dt-bc-field"
										>
											{{#if
												row.prefix
											}}
												<span
													class="dt-bc-prefix"
												>{{row.prefix}}</span>
											{{/if}}
											<input
												type="text"
												class="dt-bc-input"
												value={{row.value}}
												placeholder={{row.placeholder}}
												aria-label="A
													{{row.name}}"
												{{on
													"input"
													(fn
														this.setBitwise
														"a"
														row.id
													)
												}}
											/>
										</div>
									</div>
								{{/each}}
							</div>
						</div>

						{{#if this.showValueB}}
							<div
								class="dt-bc-block"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-bc-label"
								>Value B</span>
								<div
									class="dt-bc-operand"
								>
									{{#each
										this.bitwiseBRows
										key="id"
										as |row|
									}}
										<div
											class="dt-bc-row"
										>
											<span
												class="dt-bc-name is-muted"
											>{{row.name}}</span>
											<div
												class="dt-bc-field"
											>
												{{#if
													row.prefix
												}}
													<span
														class="dt-bc-prefix"
													>{{row.prefix}}</span>
												{{/if}}
												<input
													type="text"
													class="dt-bc-input"
													value={{row.value}}
													placeholder={{row.placeholder}}
													aria-label="B
														{{row.name}}"
													{{on
														"input"
														(fn
															this.setBitwise
															"b"
															row.id
														)
													}}
												/>
											</div>
										</div>
									{{/each}}
								</div>
							</div>
						{{/if}}

						{{#if this.showShift}}
							<div
								class="dt-bc-block"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-bc-label"
								>Shift Amount</span>
								<input
									type="number"
									class="dt-bc-shift"
									value={{this.shiftAmount}}
									placeholder="1"
									aria-label="Shift amount"
									min="0"
									max="31"
									{{on
										"input"
										this.setShiftAmount
									}}
								/>
							</div>
						{{/if}}

						{{! wording carried over from the Next app }}
						<button
							type="button"
							class="dt-bc-calculate"
							{{on
								"click"
								this.calculate
							}}
						>Calculate</button>

						{{#if this.resultRows}}
							<div
								class="dt-bc-block"
							>
								<span
									class="dt-bc-label"
								>
									Result:
									{{this.resultSummary}}
								</span>
								<div
									class="dt-bc-operand"
								>
									{{#each
										this.resultRows
										key="id"
										as |row|
									}}
										<div
											class="dt-bc-row"
										>
											<span
												class="dt-bc-name is-muted"
											>{{row.name}}</span>
											<code
												class="dt-bc-result"
											>{{row.text}}</code>
										</div>
									{{/each}}
								</div>
							</div>
						{{/if}}

						<div
							class="dt-bc-block is-last"
						>
							{{! wording carried over from the Next app }}
							<span
								class="dt-bc-label"
							>Reference</span>
							<div
								class="dt-bc-ref segmented"
							>
								{{#each
									this.reference
									key="op"
									as |entry|
								}}
									<div
										class="dt-bc-ref-item"
									>
										<div
											class="dt-bc-ref-op"
										>{{entry.op}}</div>
										{{! wording carried over from the Next app }}
										<p
											class="dt-bc-ref-desc"
										>{{entry.desc}}</p>
									</div>
								{{/each}}
							</div>
						</div>
					</TabsContent>
				</div>
			</Tabs>
		</div>
	</template>
}
