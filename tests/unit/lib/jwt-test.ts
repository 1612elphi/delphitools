import { module, test } from 'qunit';
import {
	base64UrlToBytes,
	decodeJwt,
	formatAbsolute,
	readTimeClaims,
	type JwtResult,
} from 'delphitools-v2/lib/jwt';

type Decoded = Extract<JwtResult, { kind: 'decoded' }>;

const b64u = (text: string) =>
	btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const tokenFor = (
	header: string,
	payload: string,
	signature = 'c2lnbmF0dXJl',
) => `${b64u(header)}.${b64u(payload)}.${signature}`;

/** Narrow for the assertions, failing loudly when the shape is wrong. */
const asDecoded = (result: JwtResult): Decoded => {
	if (result.kind !== 'decoded')
		throw new Error(`expected decoded, got ${result.kind}`);
	return result;
};

// jwt.io's HS256 demo token; its iat is 2018-01-18 01:30:22 UTC.
const JWTIO =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
	'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
	'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const NOW = new Date('2026-08-16T12:00:00Z');

module('Unit | Lib | jwt', function () {
	test('base64UrlToBytes handles padding-less segments', function (assert) {
		const hi = [104, 105];
		assert.deepEqual(
			[...base64UrlToBytes('aGk')!],
			hi,
			'len%4 === 3, padding-less',
		);
		assert.deepEqual(
			[...base64UrlToBytes('aQ')!],
			[105],
			'len%4 === 2, padding-less',
		);
		assert.strictEqual(
			base64UrlToBytes('')!.length,
			0,
			'empty segment is zero bytes',
		);
	});

	test('base64UrlToBytes tolerates padding and rejects junk', function (assert) {
		assert.deepEqual(
			[...base64UrlToBytes('aGk=')!],
			[104, 105],
			'padded form',
		);
		assert.strictEqual(
			base64UrlToBytes('a'),
			null,
			'len%4 === 1 is not encodable',
		);
		assert.strictEqual(base64UrlToBytes('a%'), null, 'bad charset');
		assert.strictEqual(
			base64UrlToBytes('a+i/'),
			null,
			'standard base64 alphabet rejected',
		);
	});

	test('decodes a well-formed token', function (assert) {
		const decoded = asDecoded(decodeJwt(JWTIO, NOW));
		assert.strictEqual(decoded.algorithm, 'HS256');
		assert.strictEqual(decoded.tokenType, 'JWT');
		assert.deepEqual(decoded.header.value, {
			alg: 'HS256',
			typ: 'JWT',
		});
		assert.true(
			decoded.header.pretty!.includes('"alg": "HS256"'),
			'pretty header',
		);
		assert.strictEqual(
			decoded.signature.bytes,
			32,
			'43-char segment → 32 bytes',
		);
		assert.strictEqual(decoded.signature.error, null);
	});

	test('reads only the numeric registered time claims', function (assert) {
		const decoded = asDecoded(decodeJwt(JWTIO, NOW));
		assert.deepEqual(
			decoded.timeClaims.map((claim) => claim.key),
			['iat'],
			'nbf/exp absent',
		);
	});

	test('claims humanise to absolute local dates', function (assert) {
		const claims = readTimeClaims(
			{ iat: 1516239022, nbf: 1516239100.5, exp: 'soon' },
			NOW,
		);
		assert.deepEqual(
			claims.map((claim) => claim.label),
			['Issued', 'Not before'],
			'non-numeric exp skipped',
		);
		assert.true(
			/^\d{2} \w{3} \d{4}, \d{2}:\d{2}:\d{2}$/.test(
				claims[0]!.absolute,
			),
			`absolute shape: ${claims[0]!.absolute}`,
		);
		assert.true(
			claims[0]!.absolute.includes(
				`${new Date(1516239022 * 1000).getFullYear()}`,
			),
			'local year matches the epoch',
		);
	});

	test('formatAbsolute pads every component', function (assert) {
		const date = new Date(2026, 0, 5, 6, 7, 8);
		assert.strictEqual(
			formatAbsolute(date),
			'05 Jan 2026, 06:07:08',
		);
	});

	test('exp past reads as expired, exp future as valid', function (assert) {
		const past = readTimeClaims(
			{ exp: NOW.getTime() / 1000 - 60 },
			NOW,
		);
		assert.true(past[0]!.past, 'one minute ago is past');
		const future = readTimeClaims(
			{ exp: NOW.getTime() / 1000 + 3600 },
			NOW,
		);
		assert.false(future[0]!.past, 'one hour ahead is not');

		const pastResult = asDecoded(
			decodeJwt(
				tokenFor(
					'{"alg":"none"}',
					JSON.stringify({
						exp: NOW.getTime() / 1000 - 60,
					}),
					'',
				),
				NOW,
			),
		);
		assert.true(pastResult.timeClaims[0]!.past);
	});

	test('rejects the empty string without error', function (assert) {
		assert.deepEqual(decodeJwt(''), { kind: 'empty' });
		assert.deepEqual(
			decodeJwt('   \n'),
			{ kind: 'empty' },
			'blank',
		);
	});

	test('reports the wrong segment count', function (assert) {
		assert.deepEqual(decodeJwt('abc'), {
			kind: 'segments',
			found: 1,
		});
		assert.deepEqual(decodeJwt('a.b'), {
			kind: 'segments',
			found: 2,
		});
		assert.deepEqual(decodeJwt('a.b.c.d'), {
			kind: 'segments',
			found: 4,
		});
	});

	test('a bad header does not block the payload', function (assert) {
		const decoded = asDecoded(
			decodeJwt(`%%.${b64u('{"sub":"3"}')}.c2ln`, NOW),
		);
		assert.strictEqual(decoded.header.error, 'not base64url');
		assert.strictEqual(decoded.header.bytes, null);
		assert.deepEqual(
			decoded.payload.value,
			{ sub: '3' },
			'payload still decodes',
		);
		assert.strictEqual(
			decoded.algorithm,
			null,
			'no header → no algorithm',
		);
	});

	test('a bad payload does not block the signature', function (assert) {
		const decoded = asDecoded(
			decodeJwt(`${b64u('{"alg":"RS256"}')}.%%.c2ln`, NOW),
		);
		assert.strictEqual(decoded.payload.error, 'not base64url');
		assert.strictEqual(decoded.algorithm, 'RS256');
		assert.strictEqual(decoded.signature.bytes, 3);
		assert.deepEqual(
			decoded.timeClaims,
			[],
			'no payload → no claims',
		);
	});

	test('a non-JSON segment says so', function (assert) {
		const decoded = asDecoded(
			decodeJwt(tokenFor('hello', '{}'), NOW),
		);
		assert.strictEqual(decoded.header.error, 'not JSON');
		assert.strictEqual(decoded.payload.error, null);
	});

	test('non-object JSON segments name the real problem', function (assert) {
		const arrayHeader = asDecoded(
			decodeJwt(tokenFor('[1,2]', '{}'), NOW),
		);
		assert.strictEqual(arrayHeader.header.error, 'not an object');
		assert.strictEqual(arrayHeader.payload.error, null);

		const decoded = asDecoded(
			decodeJwt(tokenFor('{}', 'null'), NOW),
		);
		assert.strictEqual(decoded.payload.error, 'not an object');
		assert.strictEqual(decoded.header.error, null);
	});

	test('a bad signature reports per-segment while the rest decodes', function (assert) {
		const decoded = asDecoded(
			decodeJwt(
				tokenFor(
					'{"alg":"HS256"}',
					'{"sub":"x"}',
					'a-b!',
				),
				NOW,
			),
		);
		assert.strictEqual(decoded.signature.error, 'not base64url');
		assert.strictEqual(decoded.signature.bytes, null);
		assert.strictEqual(decoded.algorithm, 'HS256');
	});

	test('an empty signature is zero bytes, not an error', function (assert) {
		const decoded = asDecoded(
			decodeJwt(tokenFor('{"alg":"none"}', '{}', ''), NOW),
		);
		assert.strictEqual(decoded.signature.bytes, 0);
		assert.strictEqual(decoded.signature.error, null);
		assert.strictEqual(decoded.algorithm, 'none');
	});
});
