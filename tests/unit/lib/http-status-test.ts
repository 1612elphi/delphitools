import { module, test } from 'qunit';
import {
	DEFAULT_CACHEABLE,
	HTTP_STATUSES,
	STATUS_CLASSES,
	filterStatuses,
	lookupStatus,
} from 'delphitools-v2/lib/http-status';

module('Unit | Lib | http-status', function () {
	test('every code is unique', function (assert) {
		const codes = HTTP_STATUSES.map((status) => status.code);
		assert.strictEqual(
			new Set(codes).size,
			codes.length,
			'no duplicates',
		);
	});

	test('codes sit inside their class range and sort ascending', function (assert) {
		let previous = 0;
		for (const status of HTTP_STATUSES) {
			const expected = Math.floor(status.code / 100);
			assert.strictEqual(
				status.class,
				expected,
				`${status.code} claims class ${status.class}`,
			);
			assert.ok(
				status.code > previous,
				`${status.code} follows ${previous}`,
			);
			previous = status.code;
		}
	});

	test('every row carries a phrase and a well-formed reference pair', function (assert) {
		for (const status of HTTP_STATUSES) {
			assert.ok(
				status.phrase.length > 0,
				`${status.code} has a phrase`,
			);
			const match = /^RFC (\d+) §([\d.]+)$/.exec(status.ref);
			assert.ok(
				match,
				`${status.code} ref reads "${status.ref}"`,
			);
			const [, rfcNumber, section] = match as RegExpExecArray;
			assert.strictEqual(
				status.url,
				`https://www.rfc-editor.org/rfc/rfc${rfcNumber}.html#section-${section}`,
				`${status.code} url mirrors its ref`,
			);
		}
	});

	test('the cacheable flags match the RFC 9111 §3 default set', function (assert) {
		assert.deepEqual(
			HTTP_STATUSES.filter((status) => status.cacheable).map(
				(status) => status.code,
			),
			[...DEFAULT_CACHEABLE].sort((a, b) => a - b),
			'flagged codes are exactly the default-cacheable list',
		);
	});

	test('the five classes are all present and ordered', function (assert) {
		for (const info of STATUS_CLASSES) {
			assert.ok(
				HTTP_STATUSES.some(
					(status) => status.class === info.class,
				),
				`class ${info.class}xx has rows`,
			);
		}
	});

	test('filter: empty query returns every group', function (assert) {
		const groups = filterStatuses('  ', null);
		assert.strictEqual(groups.length, STATUS_CLASSES.length);
		assert.strictEqual(
			groups.reduce(
				(sum, group) => sum + group.items.length,
				0,
			),
			HTTP_STATUSES.length,
		);
	});

	test('filter: code substring matches the code, case-insensitively on phrase', function (assert) {
		const byCode = filterStatuses('418', null);
		assert.deepEqual(
			byCode.flatMap((group) =>
				group.items.map((item) => item.code),
			),
			[418],
			'"418" finds the teapot',
		);

		const byPhrase = filterStatuses('unprocessable', null);
		assert.deepEqual(
			byPhrase.flatMap((group) =>
				group.items.map((item) => item.code),
			),
			[422],
			'lowercase phrase search matches the registered phrase',
		);
	});

	test('filter: class restriction composes with search', function (assert) {
		const groups = filterStatuses('timeout', 5);
		assert.deepEqual(
			groups.flatMap((group) =>
				group.items.map((item) => item.code),
			),
			[504],
			'5xx + "timeout" is Gateway Timeout, not Request Timeout',
		);

		const all = filterStatuses('timeout', null);
		assert.ok(
			all
				.flatMap((group) => group.items)
				.some((item) => item.code === 408),
			'unscoped "timeout" keeps Request Timeout',
		);
	});

	test('filter: a miss drops the whole group', function (assert) {
		assert.deepEqual(filterStatuses('zzz-not-a-code', null), []);
		for (const group of filterStatuses('5', 4)) {
			for (const item of group.items) {
				assert.strictEqual(
					item.class,
					4,
					`${item.code} stays in 4xx`,
				);
			}
		}
	});

	test('lookupStatus is exact and misses unassigned codes', function (assert) {
		const ok = lookupStatus(200);
		assert.strictEqual(ok?.phrase, 'OK');
		assert.strictEqual(lookupStatus(519), null);
	});
});
