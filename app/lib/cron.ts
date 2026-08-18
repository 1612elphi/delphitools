/**
 * Standard five-field cron expressions: parse, describe, and iterate run times.
 *
 * Fields: minute (0-59) · hour (0-23) · day of month (1-31) · month (1-12 or
 * JAN-DEC) · day of week (0-7 or SUN-SAT; 0 and 7 are both Sunday). Names are
 * three letters, case-insensitive. Lists (`,`), ranges (`-`) and steps (`/`)
 * follow the Vixie grammar: a step applies to `*`, a range, or a single value
 * (which then steps to the field's end — `9/30` is `9-59/30`). Wrap-around
 * ranges (`FRI-MON`) are rejected, as in Vixie cron.
 *
 * When BOTH day-of-month and day-of-week are restricted (not `*`), a run
 * happens when EITHER matches — the standard OR semantics each next-run check
 * applies inside nextRuns(). A restricted `*`-less field that the calendar can
 * never satisfy (e.g. 31 February) simply yields no run for that day rule.
 *
 * Everything is local-time: the iterator walks real calendar days, so 29 Feb
 * occurs only in leap years and DST edges resolve through Date (a wall-clock
 * minute that does not exist locally shifts forward).
 */

export type FieldKind = 'minute' | 'hour' | 'dom' | 'month' | 'dow';

export interface FieldRule {
	kind: FieldKind;
	/** short UI label */
	label: string;
	min: number;
	/** highest number a user may type (7 for day-of-week) */
	max: number;
	/** highest number after normalisation (6 for day-of-week — 7 folds to 0) */
	rangeMax: number;
	names?: Record<string, number>;
}

const MONTH_NAMES: Record<string, number> = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12,
};

const DOW_NAMES: Record<string, number> = {
	sun: 0,
	mon: 1,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
	sat: 6,
};

export const MONTH_LONG = [
	'',
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

export const DOW_LONG = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

export const FIELD_RULES: FieldRule[] = [
	{
		kind: 'minute',
		label: 'Minute',
		min: 0,
		max: 59,
		rangeMax: 59,
	},
	{
		kind: 'hour',
		label: 'Hour',
		min: 0,
		max: 23,
		rangeMax: 23,
	},
	{
		kind: 'dom',
		label: 'Day of month',
		min: 1,
		max: 31,
		rangeMax: 31,
	},
	{
		kind: 'month',
		label: 'Month',
		min: 1,
		max: 12,
		rangeMax: 12,
		names: MONTH_NAMES,
	},
	{
		kind: 'dow',
		label: 'Day of week',
		min: 0,
		max: 7,
		rangeMax: 6,
		names: DOW_NAMES,
	},
];

export interface ParseIssue {
	/** two or three words — the value and legal range sit in `data` */
	text:
		| 'Empty item'
		| 'Bad syntax'
		| 'Out of range'
		| 'Unknown name'
		| 'Wrong field'
		| 'Bad step'
		| 'Reversed range';
	data?: string;
}

/**
 * Structural shape of a field, derived from its syntax (not its value set), so
 * the describer can phrase `* /5` as "every 5 minutes" rather than a 12-item
 * list. A single value with a step folds into a range ending at rangeMax.
 */
export type FieldShape =
	| { kind: 'star' }
	| { kind: 'step'; step: number }
	| { kind: 'single'; value: number }
	| { kind: 'range'; lo: number; hi: number; step: number }
	| { kind: 'set' };

export type FieldParse =
	| {
			ok: true;
			source: string;
			/** sorted, unique, normalised values */
			values: number[];
			/** the bare `*` — every value, unrestricted */
			any: boolean;
			shape: FieldShape;
			/** normalised source: names to numbers, 7 to 0, a/n to a-max/n */
			canon: string;
	  }
	| { ok: false; source: string; error: ParseIssue };

const DIGITS = /^\d+$/;
const LETTERS = /^[a-z]+$/i;

/**
 * Tracks single values already emitted into the canon so `0,7` (two spellings
 * of Sunday) collapses to `0` instead of `0,0`. Ranges are never collapsed —
 * their text says more than their value list.
 */
interface CanonState {
	parts: string[];
	singles: number[];
}

type Atom = { value: number } | { error: ParseIssue };

function atom(token: string, rule: FieldRule): Atom {
	if (DIGITS.test(token)) {
		const n = parseInt(token, 10);
		if (n < rule.min || n > rule.max) {
			return {
				error: {
					text: 'Out of range',
					data: `${token} (${rule.min}–${rule.max})`,
				},
			};
		}
		return { value: n };
	}
	if (LETTERS.test(token)) {
		const lower = token.toLowerCase();
		const hit =
			lower.length === 3 ? rule.names?.[lower] : undefined;
		if (hit !== undefined) return { value: hit };
		// A name the map of one named field carries, typed into the other.
		const other =
			rule.kind === 'month'
				? DOW_NAMES
				: rule.kind === 'dow'
					? MONTH_NAMES
					: undefined;
		if (lower.length === 3 && other?.[lower] !== undefined) {
			return {
				error: {
					text: 'Wrong field',
					data: token.toUpperCase(),
				},
			};
		}
		return {
			error: {
				text: 'Unknown name',
				data: token.toUpperCase(),
			},
		};
	}
	return { error: { text: 'Bad syntax', data: token } };
}

/** Day-of-week folds 7 onto 0; every other field normalises to itself. */
function norm(rule: FieldRule, n: number): number {
	return rule.kind === 'dow' && n === 7 ? 0 : n;
}

export function parseField(source: string, rule: FieldRule): FieldParse {
	const items = source.split(',');
	const values = new Set<number>();
	const canon: CanonState = { parts: [], singles: [] };
	let singleShape: FieldShape | null = null;
	let mixed = false;

	for (const item of items) {
		if (item === '') {
			return {
				ok: false,
				source,
				error: { text: 'Empty item', data: source },
			};
		}
		const slash = item.split('/');
		if (slash.length > 2 || slash[0] === '') {
			return {
				ok: false,
				source,
				error: { text: 'Bad syntax', data: item },
			};
		}
		const base = slash[0]!;
		const stepToken = slash[1];
		let step = 1;
		if (stepToken !== undefined) {
			if (
				!DIGITS.test(stepToken) ||
				parseInt(stepToken, 10) === 0
			) {
				return {
					ok: false,
					source,
					error: {
						text: 'Bad step',
						data: stepToken,
					},
				};
			}
			step = parseInt(stepToken, 10);
		}

		let lo: number;
		let hi: number;
		let star = false;
		let explicitRange = false;
		if (base === '*') {
			star = true;
			lo = rule.min;
			hi = rule.rangeMax;
		} else if (base.includes('-')) {
			const seg = base.split('-');
			if (
				seg.length !== 2 ||
				seg[0] === '' ||
				seg[1] === ''
			) {
				return {
					ok: false,
					source,
					error: {
						text: 'Bad syntax',
						data: item,
					},
				};
			}
			const a = atom(seg[0]!, rule);
			if ('error' in a)
				return { ok: false, source, error: a.error };
			const b = atom(seg[1]!, rule);
			if ('error' in b)
				return { ok: false, source, error: b.error };
			if (a.value > b.value) {
				return {
					ok: false,
					source,
					error: {
						text: 'Reversed range',
						data: base.toUpperCase(),
					},
				};
			}
			lo = a.value;
			hi = b.value;
			explicitRange = true;
		} else {
			const a = atom(base, rule);
			if ('error' in a)
				return { ok: false, source, error: a.error };
			lo = a.value;
			// Vixie: `a/n` steps from a to the field's end.
			hi = step > 1 ? rule.rangeMax : a.value;
		}

		for (let v = lo; v <= hi; v += step) values.add(norm(rule, v));

		if (star) {
			canon.parts.push(step > 1 ? `*/${step}` : '*');
		} else if (explicitRange) {
			canon.parts.push(
				step > 1
					? `${lo}-${hi}/${step}`
					: `${lo}-${hi}`,
			);
		} else if (step > 1) {
			canon.parts.push(`${lo}-${rule.rangeMax}/${step}`);
		} else {
			const v = norm(rule, lo);
			if (!canon.singles.includes(v)) {
				canon.singles.push(v);
				canon.parts.push(String(v));
			}
		}

		// Shape only survives when the field is exactly one item.
		if (items.length === 1) {
			if (star && step === 1) singleShape = { kind: 'star' };
			else if (star) singleShape = { kind: 'step', step };
			else if (explicitRange)
				singleShape = { kind: 'range', lo, hi, step };
			else if (step > 1)
				singleShape = {
					kind: 'range',
					lo,
					hi: rule.rangeMax,
					step,
				};
			else
				singleShape = {
					kind: 'single',
					value: norm(rule, lo),
				};
		} else {
			mixed = true;
		}
	}

	const shape = mixed ? { kind: 'set' as const } : singleShape!;
	return {
		ok: true,
		source,
		values: [...values].sort((a, b) => a - b),
		any: source === '*',
		shape,
		canon: canon.parts.join(','),
	};
}

export type CronParse =
	| { ok: true; fields: FieldParse[]; fieldCount: 5; expression: string }
	| { ok: false; fields: FieldParse[]; fieldCount: number };

/** Split, then parse every field independently so errors per-field collect. */
export function parseCron(input: string): CronParse {
	const parts = input.trim().split(/\s+/).filter(Boolean);
	if (parts.length !== 5) {
		return { ok: false, fields: [], fieldCount: parts.length };
	}
	const fields = parts.map((p, i) => parseField(p, FIELD_RULES[i]!));
	if (fields.some((f) => !f.ok)) {
		return { ok: false, fields, fieldCount: 5 };
	}
	return {
		ok: true,
		fields,
		fieldCount: 5,
		expression: fields
			.map((f) => (f.ok ? f.canon : f.source))
			.join(' '),
	};
}

/* ── Description ─────────────────────────────────────────────────────────── */

/** "9, 12 and 18" */
function joinList(parts: string[]): string {
	if (parts.length === 1) return parts[0]!;
	if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
	const tail = parts.slice(0, -1).join(', ');
	return `${tail} and ${parts[parts.length - 1]}`;
}

/** Contiguous value runs collapse to "a–b"; anything else is a list. */
function joinValues(values: number[], name?: (n: number) => string): string {
	const label = name ?? String;
	if (values.length >= 2) {
		let contiguous = true;
		for (let i = 1; i < values.length; i++) {
			if (values[i]! !== values[i - 1]! + 1) {
				contiguous = false;
				break;
			}
		}
		if (contiguous)
			return `${label(values[0]!)}–${label(values[values.length - 1]!)}`;
	}
	return joinList(values.map((v) => label(v)));
}

/** "during hours 9–17" — empty for an unrestricted hour field. */
function hourClause(field: FieldParse): string {
	if (!field.ok || field.any) return '';
	const s = field.shape;
	if (s.kind === 'single') return `during hour ${s.value}`;
	if (s.kind === 'range' && s.step > 1)
		return `every ${s.step} hours from ${s.lo} to ${s.hi}`;
	if (s.kind === 'range') return `during hours ${s.lo}–${s.hi}`;
	return `during hours ${joinValues(field.values)}`;
}

function timeClause(minute: FieldParse, hour: FieldParse): string {
	if (!minute.ok) return '';
	const hourOk = hour.ok && !hour.any;
	const hc = hourClause(hour);
	const m = minute.shape;
	if (m.kind === 'star') {
		return hourOk ? `Every minute ${hc}` : 'Every minute';
	}
	if (m.kind === 'step') {
		if (m.step === 1)
			return hourOk ? `Every minute ${hc}` : 'Every minute';
		return hourOk
			? `Every ${m.step} minutes ${hc}`
			: `Every ${m.step} minutes`;
	}
	if (m.kind === 'single') {
		if (hour.ok && hour.shape.kind === 'single') {
			return `At ${String(hour.shape.value).padStart(2, '0')}:${String(
				m.value,
			).padStart(2, '0')}`;
		}
		return hourOk
			? `At minute ${m.value} ${hc}`
			: `At minute ${m.value} past every hour`;
	}
	if (m.kind === 'range') {
		const base =
			m.step > 1
				? `Every ${m.step} minutes from ${m.lo} to ${m.hi}`
				: `Minutes ${m.lo}–${m.hi}`;
		return hourOk ? `${base} ${hc}` : `${base} past every hour`;
	}
	const base = `Minutes ${joinValues(minute.values)}`;
	return hourOk ? `${base} ${hc}` : `${base} past every hour`;
}

/** "on day 1 of the month" — empty when unrestricted. */
function domText(dom: FieldParse): string {
	if (!dom.ok || dom.any) return '';
	const values = dom.values;
	const suffix = values.length === 1 ? 'day' : 'days';
	return `on ${suffix} ${joinValues(values)} of the month`;
}

/** "on weekdays" / "on Monday and Friday" — empty when unrestricted. */
function dowText(dow: FieldParse): string {
	if (!dow.ok || dow.any) return '';
	const values = dow.values;
	if (values.length === 5 && values.every((v, i) => v === i + 1))
		return 'on weekdays';
	if (values.length === 2 && values[0] === 0 && values[1] === 6)
		return 'on weekends';
	const single = (v: number) => DOW_LONG[v]!;
	if (values.length === 1) return `on ${single(values[0]!)}`;
	return `on ${joinList(values.map(single))}`;
}

/** "in January and March" — empty when unrestricted. */
function monthText(month: FieldParse): string {
	if (!month.ok || month.any) return '';
	return `in ${joinValues(month.values, (m) => MONTH_LONG[m]!)}`;
}

/**
 * Plain-language reading assembled from the parsed fields. Both day fields
 * restricted joins with "or", mirroring the OR the scheduler applies.
 */
export function describeCron(fields: FieldParse[]): string {
	const [minute, hour, dom, month, dow] = fields as [
		FieldParse,
		FieldParse,
		FieldParse,
		FieldParse,
		FieldParse,
	];
	const parts: string[] = [timeClause(minute, hour)];
	const domPart = domText(dom);
	const dowPart = dowText(dow);
	if (domPart && dowPart) {
		parts.push(`${domPart} or ${dowPart.slice(3)}`);
	} else if (domPart || dowPart) {
		parts.push(domPart || dowPart);
	}
	const monthPart = monthText(month);
	if (monthPart) parts.push(monthPart);
	return parts.join(' ');
}

/* ── Next runs ───────────────────────────────────────────────────────────── */

/**
 * Worst-case wait for a satisfiable expression is just under five years:
 * `0 0 29 2 *` from March 2101 reaches February 2104 (the 2100 non-leap
 * year). Past this cap the expression can never fire (31 February) and the
 * caller gets whatever has collected — possibly nothing.
 */
const MAX_SCAN_DAYS = 366 * 5;

/**
 * The next `count` run times strictly after `from`, local timezone. Walks
 * calendar days so a leap-day expression costs ~1500 day checks rather than
 * a million minute increments.
 */
export function nextRuns(
	parse: { ok: true; fields: FieldParse[] },
	count: number,
	from: Date = new Date(),
): Date[] {
	const [minute, hour, dom, month, dow] = parse.fields as [
		Extract<FieldParse, { ok: true }>,
		Extract<FieldParse, { ok: true }>,
		Extract<FieldParse, { ok: true }>,
		Extract<FieldParse, { ok: true }>,
		Extract<FieldParse, { ok: true }>,
	];
	const minutes = minute.values;
	const hours = hour.values;
	const domSet = new Set(dom.values);
	const monthSet = new Set(month.values);
	const dowSet = new Set(dow.values);
	const domAny = dom.any;
	const dowAny = dow.any;

	const out: Date[] = [];
	const day = new Date(
		from.getFullYear(),
		from.getMonth(),
		from.getDate(),
	);
	for (let d = 0; d < MAX_SCAN_DAYS && out.length < count; d++) {
		if (!monthSet.has(day.getMonth() + 1)) {
			day.setMonth(day.getMonth() + 1, 1);
			continue;
		}
		const domHit = domAny || domSet.has(day.getDate());
		const dowHit = dowAny || dowSet.has(day.getDay());
		// Standard cron: both restricted → either may match; only one
		// restricted → that one must.
		const runsToday =
			domAny && dowAny
				? true
				: domAny
					? dowHit
					: dowAny
						? domHit
						: domHit || dowHit;
		if (!runsToday) {
			day.setDate(day.getDate() + 1);
			continue;
		}
		for (const h of hours) {
			for (const m of minutes) {
				const t = new Date(
					day.getFullYear(),
					day.getMonth(),
					day.getDate(),
					h,
					m,
				);
				if (t.getTime() > from.getTime()) {
					out.push(t);
					if (out.length === count) return out;
				}
			}
		}
		day.setDate(day.getDate() + 1);
	}
	return out;
}
