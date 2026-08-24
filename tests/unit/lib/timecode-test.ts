import { module, test } from 'qunit';
import {
	formatTc,
	framesToTc,
	parseTc,
	rateById,
	tcToFrames,
} from 'delphitools-v2/lib/timecode';

const df = rateById('29.97df');
const ndf = rateById('29.97ndf');
const df60 = rateById('59.94df');
const r24 = rateById('24');

module('Unit | Lib | timecode', function () {
	test('drop-frame anchors match SMPTE reference frame numbers', function (assert) {
		assert.strictEqual(
			tcToFrames({ h: 1, m: 0, s: 0, f: 0 }, df),
			107892,
			'01:00:00;00 @ 29.97 DF',
		);
		assert.strictEqual(
			tcToFrames({ h: 0, m: 10, s: 0, f: 0 }, df),
			17982,
			'00:10:00;00 @ 29.97 DF',
		);
		assert.strictEqual(
			tcToFrames({ h: 1, m: 0, s: 0, f: 0 }, df60),
			215784,
			'01:00:00;00 @ 59.94 DF',
		);
	});

	test('the first frame of a dropped minute renumbers to ;02', function (assert) {
		assert.strictEqual(
			formatTc(framesToTc(1800, df), df),
			'00:01:00;02',
			'frame 1800',
		);
		assert.strictEqual(
			formatTc(framesToTc(17982, df), df),
			'00:10:00;00',
			'minute 10 keeps ;00 (not a dropped minute)',
		);
	});

	test('non-drop rates count straight through', function (assert) {
		assert.strictEqual(
			tcToFrames({ h: 1, m: 0, s: 0, f: 0 }, ndf),
			108000,
		);
		assert.strictEqual(
			tcToFrames({ h: 0, m: 0, s: 1, f: 0 }, r24),
			24,
		);
		assert.strictEqual(
			formatTc(framesToTc(24, r24), r24),
			'00:00:01:00',
		);
	});

	test('framesToTc and tcToFrames round-trip on every frame for hours', function (assert) {
		for (const rate of [df, ndf, df60, r24]) {
			// ~2h of frames, crosses drop + 10-min resets
			const limit = Math.round(rate.exact * 3600 * 2);
			let broke = -1;
			for (let fn = 0; fn <= limit; fn++) {
				if (
					tcToFrames(
						framesToTc(fn, rate),
						rate,
					) !== fn
				) {
					broke = fn;
					break;
				}
			}
			assert.strictEqual(
				broke,
				-1,
				`${rate.label} round-trips (0..${limit})`,
			);
		}
	});

	test('negative frame counts carry the sign both ways', function (assert) {
		const p = framesToTc(-1800, df);
		assert.true(p.negative, 'flagged negative');
		assert.strictEqual(formatTc(p, df), '-00:01:00;02');
		assert.strictEqual(
			tcToFrames(p, df),
			-1800,
			'round-trips negative',
		);
	});

	// ternary not if/&&: qunit lint forbids both here
	test('parseTc reads full and right-aligned forms', function (assert) {
		const full = parseTc('01:00:30:12', ndf);
		assert.deepEqual(
			full.ok
				? {
						...full.parts,
						negative: !!full.parts.negative,
					}
				: null,
			{ h: 1, m: 0, s: 30, f: 12, negative: false },
			'full form',
		);
		const bare = parseTc('12', ndf);
		assert.strictEqual(
			bare.ok ? formatTc(bare.parts, ndf) : null,
			'00:00:00:12',
			'bare number is frames',
		);
		const two = parseTc('1:15', ndf);
		assert.strictEqual(
			two.ok ? formatTc(two.parts, ndf) : null,
			'00:00:01:15',
			'two fields are SS:FF',
		);
	});

	test('parseTc rejects misinput with a code instead of NaN', function (assert) {
		const cases: [string, string][] = [
			['', 'empty'],
			['   ', 'empty'],
			['abc', 'not-numeric'],
			['01:xx:00:00', 'not-numeric'],
			['1:2:3:4:5', 'too-many'],
		];
		for (const [bad, code] of cases) {
			const r = parseTc(bad, ndf);
			assert.strictEqual(
				r.ok ? '(parsed)' : r.error,
				code,
				`"${bad}" → ${code}`,
			);
		}
	});

	test('parseTc flags a frame out of range with the limit as data', function (assert) {
		const r = parseTc('00:00:00:30', ndf);
		assert.strictEqual(
			r.ok ? '(parsed)' : r.error,
			'frame-range',
			'code',
		);
		assert.deepEqual(
			r.ok ? null : r.detail,
			{ value: 30, max: 29 },
			'offending value + limit',
		);
	});

	test('parseTc snaps a dropped drop-frame value up to the first legal frame', function (assert) {
		const r = parseTc('00:01:00;00', df); // minute 1 skips ;00 and ;01
		assert.strictEqual(r.ok ? r.parts.f : -1, 2, 'snapped to ;02');
		assert.strictEqual(
			r.ok ? r.snappedFrom : null,
			'00:01:00;00',
			'keeps the original for the note',
		);
		const ok = parseTc('00:10:00;00', df); // minute 10 not dropped (df rule)
		assert.strictEqual(
			ok.ok ? (ok.snappedFrom ?? 'none') : 'fail',
			'none',
			'no snap on a tenth minute',
		);
	});

	test('arithmetic through frames crosses drop boundaries correctly', function (assert) {
		// +1 frame into minute 1, renumbers to ;02
		const a = parseTc('00:00:59;29', df);
		assert.strictEqual(
			a.ok
				? formatTc(framesToTc(a.frames + 1, df), df)
				: null,
			'00:01:00;02',
		);
	});
});
