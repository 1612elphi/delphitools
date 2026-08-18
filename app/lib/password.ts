/**
 * Password/passphrase generation core: charset assembly, an unbiased
 * crypto-backed sampler, entropy arithmetic, and the passphrase builder.
 *
 * Pure — no DOM, no fetch; the component lazy-fetches the EFF wordlist from
 * /data/eff-large-wordlist.txt and injects it here. Testable end to end via
 * the injected integer source.
 */

export const CHARSET_LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
export const CHARSET_UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const CHARSET_DIGITS = '0123456789';

/* The pragmatic symbol set: always-safe specials without quotes, backslash or
 * space, which break when pasted into quoted or whitespace-trimming fields. */
export const CHARSET_SYMBOLS = '!@#$%^&*()-=_+?[]{};:,.<>/~';

/* Lookalikes dropped by the exclude-ambiguous toggle (the KeePassXC set). The
 * digits 0 and 1 stay out only via their letters O/l/I collision, so 0/1 are
 * listed directly. */
export const AMBIGUOUS_CHARS = 'Il1O0';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSPHRASE_MIN_WORDS = 3;
export const PASSPHRASE_MAX_WORDS = 10;

export interface PasswordSpec {
	/** Defaults to 16 when omitted; clamped to the 8–128 range either way. */
	length?: number;
	lowercase: boolean;
	uppercase: boolean;
	digits: boolean;
	symbols: boolean;
	excludeAmbiguous: boolean;
}

export interface PassphraseSpec {
	words: number;
	separator: string;
	capitaliseFirst: boolean;
	trailingDigit: boolean;
}

export type CharKind = 'letter' | 'digit' | 'symbol';

/* Record lookups, not Sets: the tables are static. Single-char keys can
 * never collide with Object.prototype members, so `in` is a true test. */
const DIGIT_LOOKUP: Record<string, true> = Object.fromEntries(
	[...CHARSET_DIGITS].map((ch) => [ch, true]),
);
const SYMBOL_LOOKUP: Record<string, true> = Object.fromEntries(
	[...CHARSET_SYMBOLS].map((ch) => [ch, true]),
);

/* Coarser than the sampler's pools by design: anything outside the digit and
 * pragmatic symbol sets renders as a letter (e.g. a space separator). */
export function charKind(ch: string): CharKind {
	if (ch in DIGIT_LOOKUP) return 'digit';
	if (ch in SYMBOL_LOOKUP) return 'symbol';
	return 'letter';
}

/** A source of uniformly distributed integers in [0, max). */
export type IntSource = () => number;

const FULL_UINT32_RANGE = 2 ** 32;

/** The default source: one CSPRNG uint32 per draw. */
export const cryptoUint32: IntSource = () => {
	const buffer = new Uint32Array(1);
	crypto.getRandomValues(buffer);
	return buffer[0]!;
};

/** Up to and including this bound the draw is used; above it, re-drawn. */
export function unbiasedLimit(n: number, max: number): number {
	return max - (max % n);
}

/**
 * Uniform draw in [0, n) from a [0, max) source, without modulo bias: draws
 * at or past the largest multiple of n that fits in the range are rejected,
 * so every index lands with probability exactly 1/n. Assumes 1 ≤ n ≤ max and
 * that the source honours its bound.
 */
export function randomIndex(n: number, max: number, next: IntSource): number {
	if (n < 1) throw new RangeError('n must be at least 1');
	if (n > max) throw new RangeError('n exceeds the source range');
	const limit = unbiasedLimit(n, max);
	let value = next();
	while (value >= limit) value = next();
	return value % n;
}

/** Uniform index over a [0, 2^32) CSPRNG stream. */
export function secureIndex(n: number, next: IntSource = cryptoUint32): number {
	return randomIndex(n, FULL_UINT32_RANGE, next);
}

/**
 * The character pool for a spec: enabled classes concatenated, lookalikes
 * stripped when asked. The UI keeps at least one class on; the throw guards
 * every other caller, since an empty pool cannot produce entropy.
 */
export function buildCharset(spec: PasswordSpec): string {
	let pool = '';
	if (spec.lowercase) pool += CHARSET_LOWERCASE;
	if (spec.uppercase) pool += CHARSET_UPPERCASE;
	if (spec.digits) pool += CHARSET_DIGITS;
	if (spec.symbols) pool += CHARSET_SYMBOLS;
	if (spec.excludeAmbiguous) {
		pool = [...pool]
			.filter((char) => !AMBIGUOUS_CHARS.includes(char))
			.join('');
	}
	if (pool.length === 0)
		throw new RangeError('no character class enabled');
	return pool;
}

export function generatePassword(
	spec: PasswordSpec,
	next: IntSource = cryptoUint32,
): string {
	const pool = buildCharset(spec);
	const length = Math.round(
		Math.min(
			PASSWORD_MAX_LENGTH,
			Math.max(PASSWORD_MIN_LENGTH, spec.length ?? 16),
		),
	);
	let out = '';
	for (let i = 0; i < length; i++) {
		out += pool[secureIndex(pool.length, next)];
	}
	return out;
}

/**
 * Bits of entropy for a uniform pick: length picks from a pool carry
 * log2(pool) each. Selection rule changes that delete outcomes (capitalise
 * the first letter, for instance) add or remove no bits and are not counted;
 * an appended random digit adds log2(10).
 */
export function passwordEntropy(length: number, poolSize: number): number {
	if (poolSize < 2) return 0;
	return length * Math.log2(poolSize);
}

export function passphraseEntropy(
	words: number,
	wordlistSize: number,
	trailingDigit: boolean,
): number {
	if (wordlistSize < 2) return 0;
	return (
		words * Math.log2(wordlistSize) +
		(trailingDigit ? Math.log2(10) : 0)
	);
}

const STRENGTH_BANDS = [
	{ min: 0, label: 'Weak' },
	{ min: 40, label: 'Fair' },
	{ min: 60, label: 'Strong' },
	{ min: 95, label: 'Very strong' },
] as const;

/** The worded band for a bit count; thresholds are the band edges above. */
export function strengthBand(bits: number): string {
	let label: string = STRENGTH_BANDS[0].label;
	for (const band of STRENGTH_BANDS) {
		if (bits >= band.min) label = band.label;
	}
	return label;
}

/**
 * EFF wordlist text to words. The canonical file is `dice<TAB>word` per line;
 * bare-word lines pass through, so a trimmed list still parses.
 */
export function parseWordlist(text: string): string[] {
	return text
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s*\d+\s*/, '')
				.trim()
				.toLowerCase(),
		)
		.filter((word) => /^[a-z]+$/.test(word));
}

export function buildPassphrase(
	wordlist: readonly string[],
	spec: PassphraseSpec,
	next: IntSource = cryptoUint32,
): string {
	if (wordlist.length === 0) throw new RangeError('wordlist is empty');
	const count = Math.round(
		Math.min(
			PASSPHRASE_MAX_WORDS,
			Math.max(PASSPHRASE_MIN_WORDS, spec.words),
		),
	);
	const picked: string[] = [];
	for (let i = 0; i < count; i++) {
		picked.push(wordlist[secureIndex(wordlist.length, next)]!);
	}
	if (spec.capitaliseFirst && picked.length > 0) {
		const first = picked[0]!;
		picked[0] = first.charAt(0).toUpperCase() + first.slice(1);
	}
	let out = picked.join(spec.separator);
	if (spec.trailingDigit) out += secureIndex(10, next);
	return out;
}
