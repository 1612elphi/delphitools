import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	describeCron,
	FIELD_RULES,
	nextRuns,
	parseCron,
	parseField,
	type FieldKind,
	type FieldParse,
	type FieldRule,
	type CronParse,
} from 'delphitools-v2/lib/cron';

type Mode = 'every' | 'value' | 'range' | 'step';

/** The last picks per mode, so toggling Every → Value → Every keeps choices. */
interface Subs {
	value: number;
	lo: number;
	hi: number;
	step: number;
}

interface FieldRow {
	kind: FieldKind;
	rule: FieldRule;
	label: string;
	/** raw field text as the user typed it (names kept) */
	source: string;
	/** which preset shape the source parses as; null = custom source */
	mode: Mode | null;
	parse: FieldParse;
	error: { text: string; data?: string } | null;
	subs: Subs;
}

interface RunRow {
	key: number;
	text: string;
}

const MODES: { id: Mode; label: string }[] = [
	{ id: 'every', label: 'Every' },
	{ id: 'value', label: 'Value' },
	{ id: 'range', label: 'Range' },
	{ id: 'step', label: 'Step' },
];

const COPIED_MS = 1500;
const DEFAULT_FIELD_TEXTS = ['30', '9', '*', '*', 'MON-FRI'];

const ARITY_WARNING =
	'A cron expression has five fields: minute, hour, day, month, weekday';

/**
 * Which preset shape a parse corresponds to. Steps on ranges (`9-17/2`) and
 * lists have no preset buttons; their field stays on the free input.
 */
function modeOf(parse: FieldParse): Mode | null {
	if (!parse.ok) return null;
	switch (parse.shape.kind) {
		case 'star':
			return 'every';
		case 'single':
			return 'value';
		case 'step':
			return 'step';
		case 'range':
			return parse.shape.step === 1 ? 'range' : null;
		default:
			return null;
	}
}

export default class CronBuilderTool extends Component {
	/** One string per field — the single source of truth. */
	@tracked fields: Record<FieldKind, string> = {
		minute: DEFAULT_FIELD_TEXTS[0]!,
		hour: DEFAULT_FIELD_TEXTS[1]!,
		dom: DEFAULT_FIELD_TEXTS[2]!,
		month: DEFAULT_FIELD_TEXTS[3]!,
		dow: DEFAULT_FIELD_TEXTS[4]!,
	};

	/** Mirrors the field join, except mid-edit in the expression box. */
	@tracked boxText = DEFAULT_FIELD_TEXTS.join(' ');

	@tracked subs: Record<FieldKind, Subs> = {
		minute: { value: 0, lo: 0, hi: 15, step: 5 },
		hour: { value: 9, lo: 9, hi: 17, step: 2 },
		dom: { value: 1, lo: 1, hi: 15, step: 2 },
		month: { value: 1, lo: 1, hi: 6, step: 2 },
		dow: { value: 1, lo: 1, hi: 5, step: 2 },
	};

	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	/** Downstream state reads the box so a mid-paste arity error shows
	 *  instead of last-good rows (cells read fields — see fieldRows). */
	get parsed(): CronParse {
		return parseCron(this.boxText);
	}

	get modes() {
		return MODES;
	}

	/** The expression box diverged from five tokens while typing. */
	get arityError(): boolean {
		return (
			this.boxText.trim().split(/\s+/).filter(Boolean)
				.length !== 5
		);
	}

	get canonical(): string | null {
		return this.parsed.ok ? this.parsed.expression : null;
	}

	get description(): string | null {
		return this.parsed.ok ? describeCron(this.parsed.fields) : null;
	}

	get runs(): RunRow[] {
		if (!this.parsed.ok) return [];
		const format = new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
		return nextRuns(this.parsed, 5, new Date()).map((d, i) => ({
			key: i,
			text: format.format(d),
		}));
	}

	get timeZone(): string {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	}

	get fieldRows(): FieldRow[] {
		return FIELD_RULES.map((rule) => {
			const source = this.fields[rule.kind];
			const parse = parseField(source, rule);
			return {
				kind: rule.kind,
				rule,
				label: rule.label,
				source,
				mode: modeOf(parse),
				parse,
				error: parse.ok ? null : parse.error,
				subs: this.subs[rule.kind],
			};
		});
	}

	/** Broken fields for the error strip, in field order. */
	get errors(): { label: string; text: string; data?: string }[] {
		if (this.parsed.ok || this.parsed.fieldCount !== 5) return [];
		return this.parsed.fields.flatMap((f, i) =>
			f.ok
				? []
				: [
						{
							label: FIELD_RULES[i]!
								.label,
							text: f.error.text,
							data: f.error.data,
						},
					],
		);
	}

	#writeFields(next: Record<FieldKind, string>) {
		this.fields = next;
		this.boxText = FIELD_RULES.map((rule) => next[rule.kind]).join(
			' ',
		);
		// Pull parsed picks into the mode inputs so box edits reflect there.
		const subs = { ...this.subs };
		for (const rule of FIELD_RULES) {
			const p = parseField(next[rule.kind], rule);
			if (!p.ok) continue;
			if (p.shape.kind === 'single')
				subs[rule.kind] = {
					...subs[rule.kind],
					value: p.shape.value,
				};
			else if (p.shape.kind === 'range')
				subs[rule.kind] = {
					...subs[rule.kind],
					lo: p.shape.lo,
					hi: p.shape.hi,
					step: p.shape.step,
				};
			else if (p.shape.kind === 'step')
				subs[rule.kind] = {
					...subs[rule.kind],
					step: p.shape.step,
				};
		}
		this.subs = subs;
	}

	setBoxText = (event: Event) => {
		const raw = (event.target as HTMLInputElement).value;
		this.boxText = raw;
		const parts = raw.trim().split(/\s+/).filter(Boolean);
		if (parts.length !== 5) return;
		this.#writeFields({
			minute: parts[0]!,
			hour: parts[1]!,
			dom: parts[2]!,
			month: parts[3]!,
			dow: parts[4]!,
		});
	};

	setMode = (kind: FieldKind, mode: Mode) => {
		const s = this.subs[kind];
		const source =
			mode === 'every'
				? '*'
				: mode === 'value'
					? String(s.value)
					: mode === 'range'
						? `${s.lo}-${s.hi}`
						: `*/${s.step}`;
		this.#writeFields({ ...this.fields, [kind]: source });
	};

	setSub = (kind: FieldKind, key: keyof Subs, event: Event) => {
		const rule = FIELD_RULES.find((r) => r.kind === kind)!;
		const raw = parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (Number.isNaN(raw)) return;
		// Steps can never divide by zero; every other pick starts at the field's
		// own minimum (1 for the month and day-of-month fields).
		const min = key === 'step' ? 1 : rule.min;
		const max =
			key === 'step'
				? rule.rangeMax - rule.min + 1
				: rule.max;
		const n = Math.min(Math.max(raw, min), max);
		const s = { ...this.subs[kind], [key]: n };
		// A range reads lo..hi; crossing silently reverses, so clamp instead.
		if (key === 'lo' && s.lo > s.hi) s.hi = s.lo;
		if (key === 'hi' && s.hi < s.lo) s.lo = s.hi;
		this.subs = { ...this.subs, [kind]: s };
		const mode = modeOf(parseField(this.fields[kind], rule));
		if (mode === 'value') {
			this.#writeFields({
				...this.fields,
				[kind]: String(n),
			});
		} else if (mode === 'range') {
			this.#writeFields({
				...this.fields,
				[kind]: `${s.lo}-${s.hi}`,
			});
		} else if (mode === 'step') {
			this.#writeFields({
				...this.fields,
				[kind]: `*/${s.step}`,
			});
		}
	};

	setFieldText = (kind: FieldKind, event: Event) => {
		const source = (event.target as HTMLInputElement).value;
		this.#writeFields({ ...this.fields, [kind]: source });
	};

	copyExpression = () => {
		if (this.canonical === null) return;
		void navigator.clipboard.writeText(this.canonical);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	<template>
		<div class="dt-cb">
			<div class="dt-cb-frame">
				<div class="dt-cb-bar">
					<label
						class="dt-cb-bar-label"
						for="dt-cb-expr"
					>
						Expression
					</label>
					<input
						id="dt-cb-expr"
						type="text"
						class="dt-cb-expr"
						spellcheck="false"
						autocomplete="off"
						value={{this.boxText}}
						{{on "input" this.setBoxText}}
					/>
					<button
						type="button"
						class="dt-cb-btn is-primary"
						disabled={{not this.canonical}}
						{{on
							"click"
							this.copyExpression
						}}
					>
						{{#if this.copied}}
							<Icon @name="check" />
							Copied!
						{{else}}
							<Icon @name="copy" />
							Copy
						{{/if}}
					</button>
				</div>

				{{#if this.arityError}}
					<p class="dt-cb-error" role="alert">
						<Icon @name="circle-alert" />
						{{ARITY_WARNING}}
					</p>
				{{/if}}

				<div class="dt-cb-grid">
					{{#each
						this.fieldRows key="kind"
						as |row|
					}}
						<div
							class="dt-cb-cell
								{{if
									row.error
									'is-error'
								}}"
							data-field={{row.kind}}
						>
							<span
								class="dt-cb-label"
							>{{row.label}}</span>

							<div
								class="segmented dt-cb-modes"
							>
								{{#each
									this.modes
									key="id"
									as |m|
								}}
									<button
										type="button"
										class="dt-cb-mode
											{{if
												(eq
													row.mode
													m.id
												)
												'is-active'
											}}"
										aria-pressed={{if
											(eq
												row.mode
												m.id
											)
											"true"
											"false"
										}}
										aria-label="{{m.label}} ({{row.label}})"
										{{on
											"click"
											(fn
												this.setMode
												row.kind
												m.id
											)
										}}
									>{{m.label}}</button>
								{{/each}}
							</div>

							<div class="dt-cb-side">
								{{#if
									(eq
										row.mode
										"value"
									)
								}}
									<div
										class="dt-cb-args"
									>
										<input
											type="number"
											class="dt-cb-num"
											min={{row.rule.min}}
											max={{row.rule.max}}
											value={{row.subs.value}}
											aria-label="{{row.label}} value"
											{{on
												"input"
												(fn
													this.setSub
													row.kind
													"value"
												)
											}}
										/>
									</div>
								{{else if
									(eq
										row.mode
										"range"
									)
								}}
									<div
										class="dt-cb-args"
									>
										<input
											type="number"
											class="dt-cb-num"
											min={{row.rule.min}}
											max={{row.rule.max}}
											value={{row.subs.lo}}
											aria-label="{{row.label}} from"
											{{on
												"input"
												(fn
													this.setSub
													row.kind
													"lo"
												)
											}}
										/>
										<span
											class="dt-cb-args-sep"
										>–</span>
										<input
											type="number"
											class="dt-cb-num"
											min={{row.rule.min}}
											max={{row.rule.max}}
											value={{row.subs.hi}}
											aria-label="{{row.label}} to"
											{{on
												"input"
												(fn
													this.setSub
													row.kind
													"hi"
												)
											}}
										/>
									</div>
								{{else if
									(eq
										row.mode
										"step"
									)
								}}
									<div
										class="dt-cb-args"
									>
										<span
											class="dt-cb-args-sep"
										>*/</span>
										<input
											type="number"
											class="dt-cb-num"
											min="1"
											max="99"
											value={{row.subs.step}}
											aria-label="{{row.label}} every"
											{{on
												"input"
												(fn
													this.setSub
													row.kind
													"step"
												)
											}}
										/>
									</div>
								{{/if}}

								<input
									type="text"
									class="dt-cb-free"
									spellcheck="false"
									autocomplete="off"
									value={{row.source}}
									aria-label="{{row.label}} field"
									{{on
										"input"
										(fn
											this.setFieldText
											row.kind
										)
									}}
								/>
							</div>

							{{#if row.error}}
								<p
									class="dt-cb-field-error"
									role="alert"
								>
									{{row.error.text}}
									{{#if
										row.error.data
									}}
										<code
										>{{row.error.data}}</code>
									{{/if}}
								</p>
							{{/if}}
						</div>
					{{/each}}
				</div>

				<div class="dt-cb-out">
					{{#if this.canonical}}
						<div class="dt-cb-canon-row">
							<span
								class="dt-cb-canon"
							>{{this.canonical}}</span>
						</div>
						<p
							class="dt-cb-desc"
						>{{this.description}}</p>
						<div class="dt-cb-runs">
							<span
								class="dt-cb-runs-label"
							>Next runs ({{this.timeZone}})</span>
							{{#each
								this.runs
								key="key"
								as |run|
							}}
								<span
									class="dt-cb-run"
								>{{run.text}}</span>
							{{/each}}
						</div>
					{{else}}
						{{#unless this.arityError}}
							<ul
								class="dt-cb-errors"
							>
								{{#each
									this.errors
									key="label"
									as |err|
								}}
									<li
										class="dt-cb-error-row"
									>
										<span
											class="dt-cb-error-field"
										>{{err.label}}</span>
										<span
											class="dt-cb-error-text"
										>{{err.text}}
											{{#if
												err.data
											}}
												<code
												>{{err.data}}</code>
											{{/if}}</span>
									</li>
								{{/each}}
							</ul>
						{{/unless}}
					{{/if}}
				</div>
			</div>
		</div>
	</template>
}
