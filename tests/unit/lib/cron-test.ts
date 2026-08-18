import { module, test } from 'qunit';
import {
	describeCron,
	FIELD_RULES,
	nextRuns,
	parseCron,
	parseField,
	type CronParse,
	type FieldParse,
} from 'delphitools-v2/lib/cron';

/** Parse helper that asserts the expression is valid and returns it narrowed. */
function mustParse(expr: string): Extract<CronParse, { ok: true }> {
	const p = parseCron(expr);
	if (!p.ok) throw new Error(`expected "${expr}" to parse`);
	return p;
}

/** Narrow a field parse so value assertions need no type guard. */
function mustOk(parse: FieldParse): Extract<FieldParse, { ok: true }> {
	if (!parse.ok)
		throw new Error(
			`expected "${parse.source}" to parse (${parse.error.text})`,
		);
	return parse;
}

/** Narrow to a failed field parse for per-field error assertions. */
function mustFail(parse: FieldParse): Extract<FieldParse, { ok: false }> {
	if (parse.ok)
		throw new Error(`expected "${parse.source}" not to parse`);
	return parse;
}

const minuteRule = FIELD_RULES[0]!;

const fmt = (d: Date) =>
	[
		d.getFullYear(),
		String(d.getMonth() + 1).padStart(2, '0'),
		String(d.getDate()).padStart(2, '0'),
	].join('-') +
	` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

module('Unit | Lib | cron', function () {
	module('parseField', function () {
		test('star parses as unrestricted', function (assert) {
			const f = parseField('*', minuteRule);
			assert.true(f.ok);
			const star = mustOk(f);
			assert.true(star.any);
			assert.strictEqual(star.values.length, 60);
			assert.deepEqual(star.shape, { kind: 'star' });
		});

		test('lists expand, dedupe and sort', function (assert) {
			const f = parseField('15,45,15,0', minuteRule);
			assert.true(f.ok);
			const list = mustOk(f);
			assert.deepEqual(list.values, [0, 15, 45]);
			assert.deepEqual(list.shape, { kind: 'set' });
		});

		test('ranges expand inclusively', function (assert) {
			const f = parseField('9-17', minuteRule);
			assert.true(f.ok);
			const range = mustOk(f);
			assert.strictEqual(range.values.length, 9);
			assert.strictEqual(range.values[0], 9);
			assert.strictEqual(range.values.at(-1), 17);
			assert.deepEqual(range.shape, {
				kind: 'range',
				lo: 9,
				hi: 17,
				step: 1,
			});
		});

		test('steps work on star, ranges and bare values', function (assert) {
			const starParse = parseField('*/15', minuteRule);
			assert.true(starParse.ok);
			const star = mustOk(starParse);
			assert.deepEqual(star.values, [0, 15, 30, 45]);
			assert.deepEqual(star.shape, {
				kind: 'step',
				step: 15,
			});

			const rangeParse = parseField('10-40/10', minuteRule);
			assert.true(rangeParse.ok);
			const range = mustOk(rangeParse);
			assert.deepEqual(range.values, [10, 20, 30, 40]);
			assert.deepEqual(range.shape, {
				kind: 'range',
				lo: 10,
				hi: 40,
				step: 10,
			});

			// Vixie: a bare value with a step runs to the field's end.
			const bareParse = parseField('5/10', minuteRule);
			assert.true(bareParse.ok);
			const bare = mustOk(bareParse);
			assert.deepEqual(bare.values, [5, 15, 25, 35, 45, 55]);
			assert.strictEqual(bare.canon, '5-59/10');
		});
	});

	module('names and normalisation', function () {
		test('month and day names are case-insensitive', function (assert) {
			for (const expr of [
				'0 9 1 jan mon',
				'0 9 1 JAN MON',
				'0 9 1 Jan Mon',
			]) {
				const p = mustParse(expr);
				assert.strictEqual(
					p.expression,
					'0 9 1 1 1',
					expr,
				);
			}
		});

		test('name ranges expand by number', function (assert) {
			const p = mustParse('0 9 * MAR-SEP TUE-THU');
			assert.deepEqual(
				(
					p.fields[3] as Extract<
						(typeof p.fields)[3],
						{ ok: true }
					>
				).values,
				[3, 4, 5, 6, 7, 8, 9],
			);
			assert.deepEqual(
				(
					p.fields[4] as Extract<
						(typeof p.fields)[4],
						{ ok: true }
					>
				).values,
				[2, 3, 4],
			);
			assert.strictEqual(p.expression, '0 9 * 3-9 2-4');
		});

		test('Sunday is both 0 and 7, canonical 0', function (assert) {
			for (const dow of ['0', '7', '0,7', 'SUN', 'sun']) {
				const p = mustParse(`0 0 * * ${dow}`);
				assert.deepEqual(
					(
						p.fields[4] as Extract<
							(typeof p.fields)[4],
							{ ok: true }
						>
					).values,
					[0],
					dow,
				);
				assert.strictEqual(
					p.expression,
					'0 0 * * 0',
					dow,
				);
			}
		});
	});

	module('invalid expressions give per-field errors', function () {
		test('field count is reported for the wrong arity', function (assert) {
			assert.deepEqual(parseCron('* * *'), {
				ok: false,
				fields: [],
				fieldCount: 3,
			});
			assert.strictEqual(
				parseCron('* * * * * *').fieldCount,
				6,
			);
			assert.false(parseCron('').ok);
		});

		test('every invalid field is named with a precise reason', function (assert) {
			const cases: [string, number, string][] = [
				['61 * * * *', 0, 'Out of range'],
				['* 24 * * *', 1, 'Out of range'],
				['* * 0 * *', 2, 'Out of range'],
				['* * * 13 *', 3, 'Out of range'],
				['* * * * 8', 4, 'Out of range'],
				['* * * FOO *', 3, 'Unknown name'],
				['* * * * JAX', 4, 'Unknown name'],
				// JAN belongs to month, SUN to day-of-week: crossed is Wrong field.
				['* * * * JAN', 4, 'Wrong field'],
				['* * * MON 1', 3, 'Wrong field'],
				['*/0 * * * *', 0, 'Bad step'],
				['*/x * * * *', 0, 'Bad step'],
				['10-5 * * * *', 0, 'Reversed range'],
				['* * * * FRI-MON', 4, 'Reversed range'],
				['1,,2 * * * *', 0, 'Empty item'],
				['1-2-3 * * * *', 0, 'Bad syntax'],
				['1//2 * * * *', 0, 'Bad syntax'],
				['1/ * * * *', 0, 'Bad step'],
				['*? * * * *', 0, 'Bad syntax'],
			];
			for (const [expr, index, reason] of cases) {
				const p = parseCron(expr);
				assert.false(p.ok, expr);
				const f = p.fields[index]!;
				assert.false(f.ok, expr);
				const failed = mustFail(f);
				assert.strictEqual(
					failed.error.text,
					reason,
					expr,
				);
				// the rest of the fields still parsed cleanly
				assert.true(
					p.fields.every(
						(other, i) =>
							i === index || other.ok,
					),
					`${expr}: the other four fields parse`,
				);
			}
		});
	});

	module('describeCron', function () {
		const cases: [string, string][] = [
			['* * * * *', 'Every minute'],
			['*/1 * * * *', 'Every minute'],
			['*/5 * * * *', 'Every 5 minutes'],
			['30 9 * * *', 'At 09:30'],
			['0 0 * * *', 'At 00:00'],
			['30 9 * * MON-FRI', 'At 09:30 on weekdays'],
			['0 0 * * SUN', 'At 00:00 on Sunday'],
			['0 12 * * 6,0', 'At 12:00 on weekends'],
			['0 0 1 * *', 'At 00:00 on day 1 of the month'],
			[
				'0 0 1,15 * *',
				'At 00:00 on days 1 and 15 of the month',
			],
			[
				'0 0 1 * 1',
				'At 00:00 on day 1 of the month or Monday',
			],
			[
				'0 9 1 1 *',
				'At 09:00 on day 1 of the month in January',
			],
			['30 * * * *', 'At minute 30 past every hour'],
			[
				'*/15 9-17 * * *',
				'Every 15 minutes during hours 9–17',
			],
			[
				'0 6-18/4 * * *',
				'At minute 0 every 4 hours from 6 to 18',
			],
			['* 9 * * *', 'Every minute during hour 9'],
			[
				'5/10 * * * *',
				'Every 10 minutes from 5 to 59 past every hour',
			],
			[
				'15,45 9,17 * * MON,WED,FRI',
				'Minutes 15 and 45 during hours 9 and 17 on Monday, Wednesday and Friday',
			],
			[
				'0 0 29 2 *',
				'At 00:00 on day 29 of the month in February',
			],
		];
		for (const [expr, expected] of cases) {
			test(`describes "${expr}"`, function (assert) {
				const p = mustParse(expr);
				assert.strictEqual(
					describeCron(p.fields),
					expected,
				);
			});
		}
	});

	module('nextRuns', function () {
		test('steps strictly after the start time', function (assert) {
			const p = mustParse('*/20 * * * *');
			const runs = nextRuns(
				p,
				3,
				new Date(2026, 7, 16, 9, 7, 30),
			);
			assert.deepEqual(runs.map(fmt), [
				'2026-08-16 09:20',
				'2026-08-16 09:40',
				'2026-08-16 10:00',
			]);
		});

		test('weekday schedules skip the weekend', function (assert) {
			const p = mustParse('30 9 * * MON-FRI');
			// Friday 2026-08-14 09:45 — the next hit is Monday.
			const runs = nextRuns(
				p,
				3,
				new Date(2026, 7, 14, 9, 45),
			);
			assert.deepEqual(runs.map(fmt), [
				'2026-08-17 09:30',
				'2026-08-18 09:30',
				'2026-08-19 09:30',
			]);
		});

		test('day-of-month OR day-of-week when both are restricted', function (assert) {
			const p = mustParse('0 0 13 * 5');
			// Sunday 2026-08-16: neither the 13th nor a Friday. The first hit
			// proves OR — dom-only would wait for Sep 13.
			const runs = nextRuns(p, 12, new Date(2026, 7, 16));
			assert.strictEqual(
				fmt(runs[0]!),
				'2026-08-21 00:00',
				'Friday 21 August matches on day-of-week alone',
			);
			const friday = (d: Date) => d.getDay() === 5;
			assert.true(
				runs.every(
					(d) => friday(d) || d.getDate() === 13,
				),
				'every run is a Friday or the 13th',
			);
			const oct13 = runs.find(
				(d) =>
					d.getFullYear() === 2026 &&
					d.getMonth() === 9 &&
					d.getDate() === 13,
			);
			assert.ok(
				oct13,
				'Tuesday 13 October matches on day-of-month alone',
			);
			assert.false(friday(oct13!), '…and it is not a Friday');
		});

		test('29 February only fires in leap years', function (assert) {
			const p = mustParse('0 0 29 2 *');
			const runs = nextRuns(p, 3, new Date(2026, 2, 1));
			assert.deepEqual(runs.map(fmt), [
				'2028-02-29 00:00',
				'2032-02-29 00:00',
				'2036-02-29 00:00',
			]);
		});

		test('Sunday 0 and 7 schedule identically', function (assert) {
			const from = new Date(2026, 7, 16); // a Sunday, 00:00
			const byZero = nextRuns(
				mustParse('0 0 * * 0'),
				2,
				from,
			);
			const bySeven = nextRuns(
				mustParse('0 0 * * 7'),
				2,
				from,
			);
			assert.deepEqual(bySeven.map(fmt), byZero.map(fmt));
			assert.strictEqual(fmt(byZero[0]!), '2026-08-23 00:00');
		});

		test('an impossible calendar rule returns no runs', function (assert) {
			const p = mustParse('0 0 31 2 *');
			assert.deepEqual(
				nextRuns(p, 5, new Date(2026, 0, 1)),
				[],
			);
		});

		test('five fields at once: minute past hour 9 and 17 on weekdays', function (assert) {
			const p = mustParse('45 9,17 * * 1-5');
			const runs = nextRuns(
				p,
				3,
				new Date(2026, 7, 14, 10, 0),
			); // Friday
			assert.deepEqual(runs.map(fmt), [
				'2026-08-14 17:45',
				'2026-08-17 09:45',
				'2026-08-17 17:45',
			]);
		});
	});
});
