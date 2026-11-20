import { module, test } from 'qunit';
import {
	eventString,
	type EventData,
} from 'delphitools-v2/components/tools/qr-genny/event';

const base: EventData = {
	title: '',
	location: '',
	notes: '',
	allDay: false,
	start: '',
	end: '',
};

module('Unit | Tool | qr-genny event', function () {
	test('no title or no start encodes nothing', function (assert) {
		assert.strictEqual(
			eventString({ ...base, title: 'Lunch' }),
			'',
		);
		assert.strictEqual(
			eventString({ ...base, start: '2026-11-02T12:00' }),
			'',
		);
	});

	test('timed events are written in UTC', function (assert) {
		const start = new Date('2026-11-02T12:30');
		const pad = (n: number) => String(n).padStart(2, '0');
		const expected = `${start.getUTCFullYear()}${pad(start.getUTCMonth() + 1)}${pad(start.getUTCDate())}T${pad(start.getUTCHours())}${pad(start.getUTCMinutes())}00Z`;
		assert.strictEqual(
			eventString({
				...base,
				title: 'Lunch',
				start: '2026-11-02T12:30',
			}),
			`BEGIN:VEVENT\nSUMMARY:Lunch\nDTSTART:${expected}\nEND:VEVENT`,
		);
	});

	test('all-day end is exclusive and defaults to one day', function (assert) {
		const one = eventString({
			...base,
			title: 'Fair',
			allDay: true,
			start: '2026-12-31',
		});
		assert.true(one.includes('DTSTART;VALUE=DATE:20261231'));
		assert.true(one.includes('DTEND;VALUE=DATE:20270101'));

		const three = eventString({
			...base,
			title: 'Fair',
			allDay: true,
			start: '2026-11-02',
			end: '2026-11-04',
		});
		assert.true(three.includes('DTEND;VALUE=DATE:20261105'));
	});

	test('text values are escaped per RFC 5545', function (assert) {
		const out = eventString({
			...base,
			title: 'A, B; C\\D',
			notes: 'line one\nline two',
			allDay: true,
			start: '2026-11-02',
		});
		assert.true(out.includes('SUMMARY:A\\, B\\; C\\\\D'));
		assert.true(out.includes('DESCRIPTION:line one\\nline two'));
	});

	test('an end before the start encodes nothing', function (assert) {
		assert.strictEqual(
			eventString({
				...base,
				title: 'Lunch',
				start: '2026-11-02T12:00',
				end: '2026-11-02T11:00',
			}),
			'',
		);
	});
});
