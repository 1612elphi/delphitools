import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonBigNumberField from 'delphicanon/components/canon-big-number-field';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonStatus from 'delphicanon/components/canon-status';
import {
	layout,
	metrics,
} from 'delphitools-v2/components/tools/base-converter/base-number';

export type Role = 'only' | 'operand' | 'result';

export interface Operand {
	value: bigint;
	sign?: string;
	role: Role;
	label: string;
}

interface RegisterSignature {
	Args: {
		text: string;
		placeholder: string;
		unit: string;
		inputMode: string;
		error?: string;
		operands: Operand[];
		word: number;
		figure?: string;
		onInput: (text: string) => void;
		onStep: (direction: -1 | 1) => void;
		onToggle: (operand: number, bit: number) => void;
		onMeasure: (width: number, entry: number) => void;
	};
}

const observe = modifier(
	(
		element: HTMLElement,
		[report]: [(width: number, height: number) => void],
	) => {
		const observer = new ResizeObserver(() =>
			report(element.clientWidth, element.offsetHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

const inputMode = modifier((element: HTMLElement, [mode]: [string]) => {
	const input = element.querySelector('input');
	if (!input) return;
	input.inputMode = mode;
	input.autocapitalize = 'characters';
});

function selectAll(event: FocusEvent) {
	const field = event.target;
	if (field instanceof HTMLInputElement)
		requestAnimationFrame(() => field.select());
}

export default class Register extends Component<RegisterSignature> {
	@tracked area = { width: 0, height: 0 };
	#width = 0;
	#entry = 0;

	get signs() {
		return this.args.operands.some((o) => o.sign !== undefined);
	}

	get geometry() {
		const { width, height } = this.area;
		if (width < 20 || height < 20) return undefined;
		return layout(
			this.args.word,
			this.args.operands.map((_, i) => i === 0),
			this.signs,
			width,
			height,
		);
	}

	get style() {
		const cell = Math.max(4, this.geometry?.cell ?? 0);
		return htmlSafe(
			`--bc-cell: ${cell}px; --bc-sign: ${this.signs ? metrics.signWidth : 0}px`,
		);
	}

	get chars() {
		const length = Math.max(
			this.args.text.length,
			this.args.placeholder.length,
			4,
		);
		return htmlSafe(`--bc-chars: ${length}`);
	}

	get operands() {
		const { word } = this.args;
		const perLine = this.geometry?.perLine ?? word;
		const lines = word / perLine;
		const last = this.args.operands.length - 1;
		return this.args.operands.map((operand, index) => ({
			index,
			role: operand.role,
			sign: operand.sign,
			label: operand.label,
			editable: operand.role !== 'result',
			numbered: index === 0,
			ruled: index > 0 && index === last && this.signs,
			lines: Array.from({ length: lines }, (_, line) => {
				const highest = word - 1 - line * perLine;
				return Array.from(
					{ length: perLine / 4 },
					(_, nibble) => {
						const top =
							highest - nibble * 4;
						return {
							highest: top,
							digit: (
								(operand.value >>
									BigInt(
										top -
											3,
									)) &
								0xfn
							)
								.toString(16)
								.toUpperCase(),
							bits: [
								top,
								top - 1,
								top - 2,
								top - 3,
							].map((bit) => ({
								bit,
								on:
									((operand.value >>
										BigInt(
											bit,
										)) &
										1n) ===
									1n,
								style: htmlSafe(
									`--bc-bit: ${bit}`,
								),
							})),
						};
					},
				);
			}),
		}));
	}

	get caption() {
		return `${this.args.word} bits`;
	}

	get figureColour() {
		return this.args.figure === undefined
			? 'var(--canon-muted-foreground)'
			: undefined;
	}

	measurePicture = (width: number) => {
		this.#width = width;
		this.args.onMeasure(this.#width, this.#entry);
	};

	measureEntry = (_width: number, height: number) => {
		this.#entry = height;
		this.args.onMeasure(this.#width, this.#entry);
	};

	measureArea = (width: number, height: number) => {
		if (width !== this.area.width || height !== this.area.height)
			this.area = { width, height };
	};

	<template>
		<div class="bc-picture" {{observe this.measurePicture}}>
			<div
				class="bc-entry {{if @error 'bc-entry--error'}}"
				style={{this.chars}}
				{{observe this.measureEntry}}
			>
				<CanonBigNumberField
					@value={{@text}}
					@placeholder={{@placeholder}}
					@unit={{@unit}}
					@label="Number"
					@onStep={{@onStep}}
					@onInput={{@onInput}}
					{{inputMode @inputMode}}
					{{on "focusin" selectAll}}
				/>
				{{#if @error}}
					<CanonStatus
						class="bc-entry-status"
						@text={{@error}}
						@tone="warn"
					/>
				{{/if}}
			</div>
			<div class="bc-head">
				<span class="bc-caption">{{this.caption}}</span>
				<CanonFigure
					class="bc-figure"
					@text={{if @figure @figure "—"}}
					@size={{30}}
					@colour={{this.figureColour}}
				/>
			</div>
			<div class="bc-area" {{observe this.measureArea}}>
				{{#if this.geometry}}
					<div
						class="bc-register"
						style={{this.style}}
					>
						{{#each
							this.operands
							as |operand|
						}}
							{{#if operand.ruled}}
								<div
									class="bc-rule"
								></div>
							{{/if}}
							<div
								class="bc-operand bc-operand--{{operand.role}}"
								role="group"
								aria-label={{operand.label}}
								aria-hidden={{if
									operand.editable
									undefined
									"true"
								}}
							>
								<span
									class="bc-sign
										{{if
											operand.numbered
											'bc-sign--numbered'
										}}"
								>{{operand.sign}}</span>
								<div
									class="bc-lines"
								>
									{{#each
										operand.lines
										as |line|
									}}
										<div
											class="bc-line"
										>
											{{#each
												line
												as |nibble|
											}}
												<div
													class="bc-nibble"
												>
													{{#if
														operand.numbered
													}}
														<span
															class="bc-index"
														>{{nibble.highest}}</span>
													{{/if}}
													{{#each
														nibble.bits
														as |lamp|
													}}
														{{#if
															operand.editable
														}}
															<button
																type="button"
																class="bc-lamp
																	{{if
																		lamp.on
																		'bc-lamp--on'
																	}}"
																style={{lamp.style}}
																aria-label="Bit {{lamp.bit}}"
																aria-pressed={{if
																	lamp.on
																	"true"
																	"false"
																}}
																{{on
																	"click"
																	(fn
																		@onToggle
																		operand.index
																		lamp.bit
																	)
																}}
															></button>
														{{else}}
															<span
																class="bc-lamp
																	{{if
																		lamp.on
																		'bc-lamp--on'
																	}}"
																style={{lamp.style}}
															></span>
														{{/if}}
													{{/each}}
													<span
														class="bc-hex"
													>{{nibble.digit}}</span>
												</div>
											{{/each}}
										</div>
									{{/each}}
								</div>
							</div>
						{{/each}}
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
