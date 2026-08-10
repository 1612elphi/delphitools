import { module, test } from 'qunit';
import {
	FORMATS,
	dateToFormats,
	parseToDate,
} from 'delphitools-v2/components/tools/time-calc';

// A whole second: unix seconds and RFC 822 both drop milliseconds, so a date
// carrying them cannot survive its own round trip.
const INSTANT = new Date('2024-01-01T00:00:00.000Z');

module('Unit | Tool | time-calc', function () {
	test('every format parses back to the instant it came from', function (assert) {
		const values = dateToFormats(INSTANT);
		for (const format of FORMATS) {
			assert.strictEqual(
				parseToDate(values[format], format)?.getTime(),
				INSTANT.getTime(),
				`${format}: ${values[format]}`,
			);
		}
	});

	// RSS 2.0 cites RFC 822 for pubDate, allowing the four-digit year. Feed
	// validators reject a locale-translated month or a missing zone.
	test('rfc822 is a day name, a four-digit year and a zone', function (assert) {
		assert.strictEqual(
			dateToFormats(INSTANT).rfc822,
			'Mon, 01 Jan 2024 00:00:00 GMT',
		);
	});

	test('rejects a value that does not parse', function (assert) {
		for (const junk of [
			'',
			'   ',
			'not a date',
			'Xyz, 99 Foo 2024',
		]) {
			assert.strictEqual(
				parseToDate(junk, 'rfc822'),
				null,
				JSON.stringify(junk),
			);
		}
	});
});
