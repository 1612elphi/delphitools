import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	apply,
	baseOf,
	format,
	highestDigit,
	idealHeight,
	maxValue,
	operations,
	radixes,
	read,
	valueOf,
	wordFitting,
	words,
	type Reading,
} from 'delphitools-v2/components/tools/base-converter/base-number';
import Register, {
	type Operand,
} from 'delphitools-v2/components/tools/base-converter/register';
import './base-converter/base-converter.css';

const radixNames = radixes.map((r) => r.name);
const wordTitles = words.map(String);
const operationTitles = operations.map((o) => o.title);

export default class BaseConverter extends Component {
	@tracked radixIndex = 0;
	@tracked chosenWord = 16;
	@tracked text = '';
	@tracked operandText = '';
	@tracked bitwise = false;
	@tracked operationIndex = 0;
	@tracked shift = 1;
	@tracked width = 0;
	@tracked entryHeight = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const index = (key: string, count: number) => {
			const n = Number(query.get(key));
			return Number.isInteger(n) && n >= 0 && n < count
				? n
				: 0;
		};
		this.radixIndex = index('baseRadix', radixes.length);
		const word = Number(query.get('baseWord'));
		if (words.includes(word)) this.chosenWord = word;
		this.bitwise = query.get('baseBitwise') === '1';
		this.operationIndex = index('baseOp', operations.length);
		const shift = Number(query.get('baseShift'));
		if (Number.isInteger(shift) && shift >= 0) this.shift = shift;
		this.text = query.get('baseValue') ?? '';
		this.operandText = query.get('baseB') ?? '';
	}

	get radix() {
		return radixes[this.radixIndex]!;
	}

	get operation() {
		return operations[this.operationIndex]!;
	}

	get reading() {
		return read(this.text, this.radix);
	}

	get operandReading() {
		return read(this.operandText, this.radix);
	}

	get a() {
		return valueOf(this.reading);
	}

	get takesOperand() {
		return this.bitwise && this.operation.takesOperand;
	}

	get takesShift() {
		return this.bitwise && this.operation.takesShift;
	}

	get b() {
		return this.takesOperand
			? valueOf(this.operandReading)
			: undefined;
	}

	get needed() {
		const a = this.a ?? 0n;
		const b = this.b ?? 0n;
		return wordFitting(a > b ? a : b);
	}

	get word() {
		return Math.max(this.chosenWord, this.needed);
	}

	get wordIndex() {
		return words.indexOf(this.word);
	}

	get smallWords() {
		return words.flatMap((w, i) => (w < this.needed ? [i] : []));
	}

	get shiftMax() {
		return this.word - 1;
	}

	get shiftAmount() {
		return Math.min(this.shift, this.shiftMax);
	}

	get result() {
		const { a } = this;
		return this.bitwise && a !== undefined
			? apply(
					this.operation,
					a,
					this.b,
					this.shiftAmount,
					this.word,
				)
			: undefined;
	}

	errorText(reading: Reading, text: string) {
		if (reading.kind === 'invalid') {
			const base = baseOf(text, this.radix);
			return `${reading.character} is not a digit in ${base.name}, which takes 0 to ${highestDigit(base)}`;
		}
		return reading.kind === 'tooLarge'
			? 'Larger than 64 bits'
			: undefined;
	}

	get error() {
		return this.errorText(this.reading, this.text);
	}

	get operandError() {
		return this.takesOperand
			? this.errorText(this.operandReading, this.operandText)
			: undefined;
	}

	get unit() {
		return baseOf(this.text, this.radix).short;
	}

	get inputMode() {
		return this.radix.radix === 16 ? 'text' : 'numeric';
	}

	linesFor(value: bigint | undefined) {
		return radixes.map((radix) => ({
			name: radix.name,
			value:
				value === undefined
					? undefined
					: format(value, radix, true),
		}));
	}

	get values() {
		return this.linesFor(this.a);
	}

	get results() {
		return this.linesFor(this.result);
	}

	get operands(): Operand[] {
		const only: Operand = {
			value: this.a ?? 0n,
			role: this.bitwise ? 'operand' : 'only',
			label: this.bitwise ? 'A' : 'Bits',
		};
		if (!this.bitwise) return [only];
		const { operation } = this;
		const list = [only];
		if (operation.takesOperand)
			list.push({
				value: this.b ?? 0n,
				sign: operation.title,
				role: 'operand',
				label: 'B',
			});
		list.push({
			value: this.result ?? 0n,
			sign: operation.takesOperand
				? '='
				: operation.title === 'NOT'
					? operation.title
					: `${operation.title} ${this.shiftAmount}`,
			role: 'result',
			label: 'Result',
		});
		return list;
	}

	get figure() {
		const value = this.bitwise ? this.result : this.a;
		return value === undefined ? undefined : value.toString();
	}

	get collapsedHeight() {
		return Math.round(this.entryHeight + 200);
	}

	get pictureHeight() {
		if (!this.width) return undefined;
		const register = idealHeight(
			this.word,
			this.operands.length,
			this.operands.length > 1,
			this.width,
			460,
		);
		return Math.round(
			this.entryHeight +
				Math.min(Math.max(register, 200), 460) +
				4,
		);
	}

	measured = (width: number, entry: number) => {
		if (width !== this.width) this.width = width;
		if (entry !== this.entryHeight) this.entryHeight = entry;
	};

	typed = (text: string) => (this.text = text);

	typedOperand = (text: string) => (this.operandText = text);

	step = (direction: -1 | 1) => {
		const value = this.a ?? 0n;
		const next =
			direction > 0
				? value === maxValue
					? value
					: value + 1n
				: value === 0n
					? 0n
					: value - 1n;
		this.text = format(next, this.radix);
	};

	toggle = (operand: number, bit: number) => {
		const flip = 1n << BigInt(bit);
		if (operand === 0)
			this.text = format((this.a ?? 0n) ^ flip, this.radix);
		else
			this.operandText = format(
				(valueOf(this.operandReading) ?? 0n) ^ flip,
				this.radix,
			);
	};

	pickRadix = (index: number) => {
		const a = this.a;
		const b = valueOf(this.operandReading);
		this.radixIndex = index;
		this.text = a === undefined ? '' : format(a, this.radix);
		this.operandText = b === undefined ? '' : format(b, this.radix);
	};

	pickWord = (index: number) => (this.chosenWord = words[index]!);

	flipBitwise = (on: boolean) => (this.bitwise = on);

	pickOperation = (index: number) => (this.operationIndex = index);

	pickShift = (shift: number) => (this.shift = shift);

	<template>
		<CanonSplit
			class="base-converter"
			@halves={{true}}
			@collapsesTo={{this.collapsedHeight}}
		>
			<:sidebar>
				<CanonCanvas
					@height={{this.pictureHeight}}
					@pattern={{true}}
				>
					<Register
						@text={{this.text}}
						@placeholder={{this.radix.placeholder}}
						@unit={{this.unit}}
						@inputMode={{this.inputMode}}
						@error={{this.error}}
						@operands={{this.operands}}
						@word={{this.word}}
						@figure={{this.figure}}
						@onInput={{this.typed}}
						@onStep={{this.step}}
						@onToggle={{this.toggle}}
						@onMeasure={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Number" />
					<CanonSegmented
						aria-label="Base"
						@items={{radixNames}}
						@columns={{2}}
						@selected={{this.radixIndex}}
						@onChange={{this.pickRadix}}
					/>
					<CanonHeading @text="Word size" />
					<CanonSegmented
						aria-label="Word size"
						@items={{wordTitles}}
						@selected={{this.wordIndex}}
						@disabledIndices={{this.smallWords}}
						@onChange={{this.pickWord}}
					/>
				</CanonRows>
				<CanonRows class="bc-values" @framed={{true}}>
					<CanonHeading @text="Values" />
					{{#each this.values as |line|}}
						<CanonValueLine
							@label={{line.name}}
							@value={{line.value}}
							@layout="above"
						/>
					{{/each}}
				</CanonRows>
				<CanonRows class="bc-values" @framed={{true}}>
					<CanonRow @title="Bitwise" as |titleId|>
						<CanonSwitch
							aria-labelledby={{titleId}}
							@on={{this.bitwise}}
							@onChange={{this.flipBitwise}}
						/>
					</CanonRow>
					{{#if this.bitwise}}
						<CanonSegmented
							aria-label="Operation"
							@items={{operationTitles}}
							@columns={{6}}
							@selected={{this.operationIndex}}
							@onChange={{this.pickOperation}}
						/>
						{{#if this.takesOperand}}
							<CanonRow
								@title="B"
								@form="flush"
								as |titleId|
							>
								<CanonTextCell
									class="bc-operand-field"
									aria-labelledby={{titleId}}
									autocomplete="off"
									spellcheck="false"
									inputmode={{this.inputMode}}
									autocapitalize="characters"
									@value={{this.operandText}}
									@placeholder={{this.radix.placeholder}}
									@onChange={{this.typedOperand}}
								/>
							</CanonRow>
							{{#if
								this.operandError
							}}
								<CanonStatus
									@text={{this.operandError}}
									@tone="warn"
									@row={{true}}
								/>
							{{/if}}
						{{/if}}
						{{#if this.takesShift}}
							<CanonRow
								@title="Shift"
								@form="flush"
								as |titleId|
							>
								<CanonNumberField
									@value={{this.shiftAmount}}
									@min={{0}}
									@max={{this.shiftMax}}
									@labelledBy={{titleId}}
									@onChange={{this.pickShift}}
								/>
							</CanonRow>
						{{/if}}
						<CanonHeading @text="Result" />
						{{#each this.results as |line|}}
							<CanonValueLine
								@label={{line.name}}
								@value={{line.value}}
								@layout="above"
							/>
						{{/each}}
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
