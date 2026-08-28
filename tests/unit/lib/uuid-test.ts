import { module, test } from 'qunit';
import {
	clampCount,
	formatIdentifier,
	generateIdentifier,
	generateIdentifiers,
	nanoid,
	NANOID_ALPHABET,
	NANOID_LENGTH,
	uuid4,
	uuid7,
	uuid7Timestamp,
} from 'delphitools-v2/lib/uuid';

const V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NANO = /^[A-Za-z0-9_-]+$/;

const variantNibble = (uuid: string) => uuid.replaceAll('-', '').charAt(16);

const VARIANT_10 = /[89ab]/;

module('Unit | Lib | uuid', function () {
	test('uuid4 has the RFC 9562 version and variant bits', function (assert) {
		const ids = Array.from({ length: 10_000 }, () => uuid4());
		assert.strictEqual(
			ids.filter((id) => V4.test(id)).length,
			ids.length,
			'all 10,000 are canonical v4',
		);
		assert.strictEqual(
			ids.filter((id) => VARIANT_10.test(variantNibble(id)))
				.length,
			ids.length,
			'all 10,000 have variant 10',
		);
		assert.strictEqual(
			new Set(ids).size,
			ids.length,
			'no duplicates over 10,000 draws',
		);
	});

	test('uuid7 embeds the timestamp in its first 48 bits', function (assert) {
		const stamp = 1_789_234_567_890;
		assert.strictEqual(uuid7Timestamp(uuid7(stamp)), stamp);
	});

	test('uuid7 has the RFC 9562 version and variant bits', function (assert) {
		const ids = Array.from({ length: 10_000 }, () => uuid7());
		assert.strictEqual(
			ids.filter((id) => id[14] === '7').length,
			ids.length,
			'all 10,000 are version 7',
		);
		assert.strictEqual(
			ids.filter((id) => VARIANT_10.test(variantNibble(id)))
				.length,
			ids.length,
			'all 10,000 have variant 10',
		);
	});

	test('uuid7 sorts by creation order', function (assert) {
		const base = 1_789_234_567_000;
		const ids = [uuid7(base), uuid7(base + 1), uuid7(base + 2)];
		assert.deepEqual(
			[...ids].sort(),
			ids,
			'ascending timestamps sort lexicographically',
		);
	});

	test('nanoid length and alphabet hold', function (assert) {
		const ids = Array.from({ length: 10_000 }, () => nanoid());
		assert.strictEqual(
			ids.filter((id) => id.length === NANOID_LENGTH).length,
			ids.length,
			'all 10,000 are 21 characters',
		);
		assert.strictEqual(
			ids.filter((id) => NANO.test(id)).length,
			ids.length,
			'all 10,000 are url-safe',
		);
		assert.strictEqual(
			NANOID_ALPHABET.length,
			64,
			'the alphabet is 64 chars, so byte % 64 is unbiased',
		);
		assert.strictEqual(nanoid(8).length, 8, 'custom length');
		assert.strictEqual(
			new Set(ids).size,
			ids.length,
			'no duplicates over 10,000 draws',
		);
	});

	test('formatIdentifier uppercases and strips hyphens', function (assert) {
		const id = uuid4();
		assert.strictEqual(
			formatIdentifier(id, 'uuid4', {
				uppercase: true,
				stripHyphens: false,
			}),
			id.toUpperCase(),
		);
		const stripped = formatIdentifier(id, 'uuid4', {
			uppercase: false,
			stripHyphens: true,
		});
		assert.strictEqual(stripped.length, 32);
		assert.false(stripped.includes('-'));
	});

	test('formatIdentifier leaves Nano IDs untouched', function (assert) {
		const id = nanoid();
		assert.strictEqual(
			formatIdentifier(id, 'nanoid', {
				uppercase: true,
				stripHyphens: true,
			}),
			id,
		);
	});

	test('clampCount holds the 1–100 contract', function (assert) {
		assert.strictEqual(clampCount(0), 1);
		assert.strictEqual(clampCount(-5), 1);
		assert.strictEqual(clampCount(101), 100);
		assert.strictEqual(clampCount(3.9), 3, 'truncates');
		assert.strictEqual(clampCount(NaN), 1);
		assert.strictEqual(clampCount(Infinity), 1);
	});

	test('generateIdentifier dispatches on kind', function (assert) {
		assert.true(V4.test(generateIdentifier('uuid4')));
		assert.true(generateIdentifier('uuid7').includes('-'));
		assert.true(NANO.test(generateIdentifier('nanoid')));
	});

	test('generateIdentifiers clamps the batch', function (assert) {
		assert.strictEqual(generateIdentifiers('nanoid', 0).length, 1);
		assert.strictEqual(
			generateIdentifiers('uuid4', 200).length,
			100,
		);
		assert.strictEqual(generateIdentifiers('uuid7', 10).length, 10);
	});
});
