export type SegmentError = 'not base64url' | 'not JSON' | 'not an object';

export interface JwtJsonSegment {
	bytes: number | null;
	value: Record<string, unknown> | null;
	pretty: string | null;
	error: SegmentError | null;
}

export interface JwtSignature {
	raw: string;
	bytes: number | null;
	error: SegmentError | null;
}

export type TimeClaimKey = 'iat' | 'nbf' | 'exp';

export interface JwtTimeClaim {
	key: TimeClaimKey;
	label: 'Issued' | 'Not before' | 'Expires';
	seconds: number;
	absolute: string;
	past: boolean;
}

export type JwtResult =
	| { kind: 'empty' }
	| { kind: 'segments'; found: number }
	| {
			kind: 'decoded';
			header: JwtJsonSegment;
			payload: JwtJsonSegment;
			signature: JwtSignature;
			algorithm: string | null;
			tokenType: string | null;
			timeClaims: JwtTimeClaim[];
	  };

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatAbsolute(date: Date): string {
	const day = pad(date.getDate());
	const month = MONTHS[date.getMonth()];
	const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map(pad)
		.join(':');
	return `${day} ${month} ${date.getFullYear()}, ${time}`;
}

export function base64UrlToBytes(segment: string): Uint8Array | null {
	const unpadded = segment.replace(/=+$/, '');
	if (/[^A-Za-z0-9_-]/.test(unpadded) || unpadded.length % 4 === 1)
		return null;
	const padLen = (4 - (unpadded.length % 4)) % 4;
	const b64 =
		unpadded.replace(/-/g, '+').replace(/_/g, '/') +
		'='.repeat(padLen);
	try {
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++)
			bytes[i] = bin.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function decodeJsonSegment(segment: string): JwtJsonSegment {
	const bytes = base64UrlToBytes(segment);
	if (bytes === null)
		return {
			bytes: null,
			value: null,
			pretty: null,
			error: 'not base64url',
		};
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return {
			bytes: bytes.length,
			value: null,
			pretty: null,
			error: 'not JSON',
		};
	}
	if (!isObject(value))
		return {
			bytes: bytes.length,
			value: null,
			pretty: null,
			error: 'not an object',
		};
	return {
		bytes: bytes.length,
		value,
		pretty: JSON.stringify(value, null, 2),
		error: null,
	};
}

const CLAIMS: { key: TimeClaimKey; label: JwtTimeClaim['label'] }[] = [
	{ key: 'iat', label: 'Issued' },
	{ key: 'nbf', label: 'Not before' },
	{ key: 'exp', label: 'Expires' },
];

export function readTimeClaims(
	payload: Record<string, unknown>,
	now: Date,
): JwtTimeClaim[] {
	const out: JwtTimeClaim[] = [];
	for (const { key, label } of CLAIMS) {
		const value = payload[key];
		if (typeof value !== 'number' || !Number.isFinite(value))
			continue;
		const date = new Date(value * 1000);
		out.push({
			key,
			label,
			seconds: value,
			absolute: formatAbsolute(date),
			past: value * 1000 <= now.getTime(),
		});
	}
	return out;
}

export function decodeJwt(input: string, now = new Date()): JwtResult {
	const token = input.trim();
	if (token === '') return { kind: 'empty' };

	const segments = token.split('.');
	if (segments.length !== 3)
		return { kind: 'segments', found: segments.length };

	const [rawHeader, rawPayload, rawSignature] = segments as [
		string,
		string,
		string,
	];
	const header = decodeJsonSegment(rawHeader);
	const payload = decodeJsonSegment(rawPayload);

	const sigBytes = base64UrlToBytes(rawSignature);
	const signature: JwtSignature = {
		raw: rawSignature,
		bytes: sigBytes === null ? null : sigBytes.length,
		error: sigBytes === null ? 'not base64url' : null,
	};

	const algorithm =
		header.value !== null && typeof header.value['alg'] === 'string'
			? header.value['alg']
			: null;
	const tokenType =
		header.value !== null && typeof header.value['typ'] === 'string'
			? header.value['typ']
			: null;

	return {
		kind: 'decoded',
		header,
		payload,
		signature,
		algorithm,
		tokenType,
		timeClaims: payload.value
			? readTimeClaims(payload.value, now)
			: [],
	};
}
