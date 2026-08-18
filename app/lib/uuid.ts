/**
 * Identifier generation for the UUID Generator tool: UUID v4 and v7 per
 * RFC 9562 (the bit layout is assembled here; entropy is
 * `crypto.getRandomValues`) and Nano IDs on the url-safe alphabet.
 */

export type IdentifierKind = 'uuid4' | 'uuid7' | 'nanoid';

export const IDENTIFIER_KINDS: { id: IdentifierKind; label: string }[] = [
	{ id: 'uuid4', label: 'UUID v4' },
	{ id: 'uuid7', label: 'UUID v7' },
	{ id: 'nanoid', label: 'Nano ID' },
];

export const NANOID_ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export const NANOID_LENGTH = 21;

export const COUNT_MIN = 1;
export const COUNT_MAX = 100;

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

/** 16 bytes as the canonical 8-4-4-4-12 hyphenated hex form. */
function toUuidString(bytes: Uint8Array): string {
	const hex: string[] = [];
	for (const b of bytes) hex.push(b.toString(16).padStart(2, '0'));
	return (
		hex.slice(0, 4).join('') +
		'-' +
		hex.slice(4, 6).join('') +
		'-' +
		hex.slice(6, 8).join('') +
		'-' +
		hex.slice(8, 10).join('') +
		'-' +
		hex.slice(10).join('')
	);
}

/** UUID v4 (RFC 9562 §5.4): all random, version nibble 4, variant 10. */
export function uuid4(): string {
	const bytes = randomBytes(16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x40;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	return toUuidString(bytes);
}

/**
 * UUID v7 (RFC 9562 §5.7): 48-bit unix-epoch milliseconds, then 74 random
 * bits. Ordering holds at millisecond granularity: draws within the same
 * millisecond share the timestamp block and sort randomly after it.
 */
export function uuid7(timestamp: number = Date.now()): string {
	const bytes = randomBytes(16);
	const hi = Math.floor(timestamp / 2 ** 32);
	const lo = timestamp % 2 ** 32;
	bytes[0] = (hi >> 8) & 0xff;
	bytes[1] = hi & 0xff;
	bytes[2] = (lo >>> 24) & 0xff;
	bytes[3] = (lo >>> 16) & 0xff;
	bytes[4] = (lo >>> 8) & 0xff;
	bytes[5] = lo & 0xff;
	bytes[6] = (bytes[6]! & 0x0f) | 0x70;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	return toUuidString(bytes);
}

/** The 48-bit timestamp embedded in a v7 UUID (its first 12 hex digits). */
export function uuid7Timestamp(uuid: string): number {
	return parseInt(uuid.replaceAll('-', '').slice(0, 12), 16);
}

// The alphabet is exactly 64 characters, so byte % 64 has no modulo bias.
export function nanoid(length: number = NANOID_LENGTH): string {
	const bytes = randomBytes(length);
	let id = '';
	for (const b of bytes) id += NANOID_ALPHABET.charAt(b % 64);
	return id;
}

export interface IdentifierOptions {
	uppercase: boolean;
	stripHyphens: boolean;
}

/**
 * Display/copy transforms. Both are no-ops for Nano IDs: they have no hyphens
 * and case is significant in their alphabet.
 */
export function formatIdentifier(
	id: string,
	kind: IdentifierKind,
	{ uppercase, stripHyphens }: IdentifierOptions,
): string {
	if (kind === 'nanoid') return id;
	const text = stripHyphens ? id.replaceAll('-', '') : id;
	return uppercase ? text.toUpperCase() : text;
}

export function clampCount(count: number): number {
	if (!Number.isFinite(count)) return COUNT_MIN;
	return Math.min(COUNT_MAX, Math.max(COUNT_MIN, Math.trunc(count)));
}

export function generateIdentifier(kind: IdentifierKind): string {
	switch (kind) {
		case 'uuid4':
			return uuid4();
		case 'uuid7':
			return uuid7();
		case 'nanoid':
			return nanoid();
	}
}

export function generateIdentifiers(
	kind: IdentifierKind,
	count: number,
): string[] {
	return Array.from({ length: clampCount(count) }, () =>
		generateIdentifier(kind),
	);
}
