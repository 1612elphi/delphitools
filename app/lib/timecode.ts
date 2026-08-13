/**
 * SMPTE timecode maths, drop-frame included.
 *
 * The drop-frame rule is what every broken online calculator gets wrong:
 * drop-frame does NOT remove frames, it RENUMBERS them so 29.97/59.94 timecode
 * stays aligned with wall-clock time. It skips the first two (at 30) or four
 * (at 60) frame NUMBERS of every minute except every tenth minute. Reference:
 * SMPTE ST 12-1; the standard derivation is David Heidelberger's article.
 *
 * Everything routes through an integer frame number, so arithmetic is exact and
 * the two directions round-trip (see tests/unit/lib/timecode-test.ts, which
 * checks every frame across several hours).
 */

export interface Parts {
	h: number;
	m: number;
	s: number;
	f: number;
	/** true when the whole value is negative (result of a subtraction) */
	negative?: boolean;
}

export interface Rate {
	id: string;
	label: string;
	/** integer frames counted per second (24, 25, 30, 50, 60) */
	nominal: number;
	/** real playback rate, for wall-clock time (24000/1001, 30000/1001, ...) */
	exact: number;
	/** drop-frame counting — only ever true for 29.97 and 59.94 */
	drop: boolean;
}

// The picker's presets. 29.97 and 59.94 appear twice (NDF and DF); the rest
// cannot be drop-frame, so they do not.
export const RATES: Rate[] = [
	{
		id: '23.976',
		label: '23.976',
		nominal: 24,
		exact: 24000 / 1001,
		drop: false,
	},
	{ id: '24', label: '24', nominal: 24, exact: 24, drop: false },
	{ id: '25', label: '25', nominal: 25, exact: 25, drop: false },
	{
		id: '29.97ndf',
		label: '29.97 NDF',
		nominal: 30,
		exact: 30000 / 1001,
		drop: false,
	},
	{
		id: '29.97df',
		label: '29.97 DF',
		nominal: 30,
		exact: 30000 / 1001,
		drop: true,
	},
	{ id: '30', label: '30', nominal: 30, exact: 30, drop: false },
	{ id: '50', label: '50', nominal: 50, exact: 50, drop: false },
	{
		id: '59.94ndf',
		label: '59.94 NDF',
		nominal: 60,
		exact: 60000 / 1001,
		drop: false,
	},
	{
		id: '59.94df',
		label: '59.94 DF',
		nominal: 60,
		exact: 60000 / 1001,
		drop: true,
	},
	{ id: '60', label: '60', nominal: 60, exact: 60, drop: false },
];

export function rateById(id: string): Rate {
	return RATES.find((r) => r.id === id) ?? RATES[5]!; // default 30
}

/** Frame NUMBERS dropped per drop-minute: 2 at 30 fps, 4 at 60 fps. */
function dropPerMinute(nominal: number): number {
	return nominal >= 60 ? 4 : 2;
}

/** Timecode -> absolute frame number. Assumes `parts` is already in range. */
export function tcToFrames(parts: Parts, rate: Rate): number {
	const base = rate.nominal;
	let frames = ((parts.h * 60 + parts.m) * 60 + parts.s) * base + parts.f;
	if (rate.drop) {
		const dpm = dropPerMinute(base);
		const totalMinutes = parts.h * 60 + parts.m;
		frames -= dpm * (totalMinutes - Math.floor(totalMinutes / 10));
	}
	return parts.negative ? -frames : frames;
}

/** Absolute frame number -> timecode. Negative counts come back with the flag. */
export function framesToTc(frameNumber: number, rate: Rate): Parts {
	const negative = frameNumber < 0;
	let fn = Math.abs(frameNumber);
	const base = rate.nominal;

	if (rate.drop) {
		const dpm = dropPerMinute(base);
		const framesPer10Min = base * 60 * 10 - dpm * 9;
		const framesPerMin = base * 60 - dpm;
		const d = Math.floor(fn / framesPer10Min);
		const mod = fn % framesPer10Min;
		fn +=
			mod >= dpm
				? dpm * 9 * d +
					dpm *
						Math.floor(
							(mod - dpm) /
								framesPerMin,
						)
				: dpm * 9 * d;
	}

	const f = fn % base;
	const s = Math.floor(fn / base) % 60;
	const m = Math.floor(fn / (base * 60)) % 60;
	const h = Math.floor(fn / (base * 3600));
	return { h, m, s, f, negative: negative && frameNumber !== 0 };
}

/** Real elapsed seconds a frame count represents at this rate's true speed. */
export function framesToSeconds(frameNumber: number, rate: Rate): number {
	return frameNumber / rate.exact;
}

/** "HH:MM:SS:FF" (":" separator) or "HH:MM:SS;FF" (";" = drop-frame). */
export function formatTc(parts: Parts, rate: Rate): string {
	const sep = rate.drop ? ';' : ':';
	const p2 = (n: number) => String(n).padStart(2, '0');
	const sign = parts.negative ? '-' : '';
	return `${sign}${p2(parts.h)}:${p2(parts.m)}:${p2(parts.s)}${sep}${p2(parts.f)}`;
}

/** Wall-clock elapsed time as "HH:MM:SS.mmm". */
export function formatClock(seconds: number): string {
	const sign = seconds < 0 ? '-' : '';
	const abs = Math.abs(seconds);
	const whole = Math.floor(abs);
	const ms = Math.round((abs - whole) * 1000);
	const h = Math.floor(whole / 3600);
	const m = Math.floor(whole / 60) % 60;
	const s = whole % 60;
	const p2 = (n: number) => String(n).padStart(2, '0');
	return `${sign}${p2(h)}:${p2(m)}:${p2(s)}.${String(ms).padStart(3, '0')}`;
}

// Error codes, not prose — the UI owns the user-facing wording (copy). `detail`
// carries the offending value + the rate's frame ceiling so the UI can show the
// specifics as data.
export type ParseError =
	| 'empty'
	| 'too-many'
	| 'not-numeric'
	| 'frame-range'
	| 'seconds-range'
	| 'minutes-range';

export type ParseResult =
	| {
			ok: true;
			parts: Parts;
			frames: number;
			/** original value when a drop-frame skip was snapped up to a legal frame */
			snappedFrom?: string;
	  }
	| {
			ok: false;
			error: ParseError;
			detail?: { value: number; max: number };
	  };

// Accept ":", ";", "." or "," between fields; a bare number is frames.
const FIELD_SPLIT = /[:;.,]/;

/**
 * Parse a timecode string against a rate WITHOUT ever throwing or returning
 * NaN. Fewer than four fields are read right-aligned (a lone number is frames,
 * two fields are SS:FF, and so on). Out-of-range fields and drop-frame values
 * that name a skipped frame are reported by code, not silently mangled; a
 * skipped drop-frame value snaps up to the first legal frame and flags it.
 */
export function parseTc(input: string, rate: Rate): ParseResult {
	const raw = input.trim();
	if (raw === '') return { ok: false, error: 'empty' };

	const negative = raw.startsWith('-');
	const body = negative ? raw.slice(1).trim() : raw;

	const tokens = body.split(FIELD_SPLIT).map((t) => t.trim());
	if (tokens.length > 4) return { ok: false, error: 'too-many' };
	if (tokens.some((t) => t === '' || !/^\d+$/.test(t))) {
		return { ok: false, error: 'not-numeric' };
	}

	// Right-align: [f] | [s,f] | [m,s,f] | [h,m,s,f].
	const nums = tokens.map((t) => Number.parseInt(t, 10));
	const padded = [0, 0, 0, 0];
	nums.forEach((n, i) => {
		padded[4 - nums.length + i] = n;
	});
	const h = padded[0]!;
	const m = padded[1]!;
	const s = padded[2]!;
	const f = padded[3]!;

	if (f >= rate.nominal) {
		return {
			ok: false,
			error: 'frame-range',
			detail: { value: f, max: rate.nominal - 1 },
		};
	}
	if (s > 59)
		return {
			ok: false,
			error: 'seconds-range',
			detail: { value: s, max: 59 },
		};
	if (m > 59)
		return {
			ok: false,
			error: 'minutes-range',
			detail: { value: m, max: 59 },
		};

	const parts: Parts = { h, m, s, f, negative };
	let snappedFrom: string | undefined;

	// A drop-frame timecode at :00 seconds of a non-tenth minute cannot name the
	// first dpm frames — they were skipped. Snap up rather than reject.
	if (rate.drop) {
		const dpm = dropPerMinute(rate.nominal);
		if (m % 10 !== 0 && s === 0 && f < dpm) {
			snappedFrom = formatTc({ h, m, s, f }, rate);
			parts.f = dpm;
		}
	}

	return {
		ok: true,
		parts,
		frames: tcToFrames(parts, rate),
		snappedFrom,
	};
}
