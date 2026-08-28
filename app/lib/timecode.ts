export interface Parts {
	h: number;
	m: number;
	s: number;
	f: number;
	negative?: boolean;
}

export interface Rate {
	id: string;
	label: string;
	nominal: number;
	exact: number;
	drop: boolean;
}

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
	return RATES.find((r) => r.id === id) ?? RATES[5]!;
}

// drop-frame skip count
function dropPerMinute(nominal: number): number {
	return nominal >= 60 ? 4 : 2;
}

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

export function framesToSeconds(frameNumber: number, rate: Rate): number {
	return frameNumber / rate.exact;
}

export function formatTc(parts: Parts, rate: Rate): string {
	const sep = rate.drop ? ';' : ':';
	const p2 = (n: number) => String(n).padStart(2, '0');
	const sign = parts.negative ? '-' : '';
	return `${sign}${p2(parts.h)}:${p2(parts.m)}:${p2(parts.s)}${sep}${p2(parts.f)}`;
}

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

// ui owns error text
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
			snappedFrom?: string;
	  }
	| {
			ok: false;
			error: ParseError;
			detail?: { value: number; max: number };
	  };

const FIELD_SPLIT = /[:;.,]/;

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

	// right-align parsed fields
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

	// skip invalid drop-frame numbers
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
