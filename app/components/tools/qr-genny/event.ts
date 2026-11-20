// trackedobject needs index signature
export type EventData = {
	title: string;
	location: string;
	notes: string;
	allDay: boolean;
	// datetime-local, or date
	start: string;
	end: string;
};

// rfc 5545 3.3.11
function escapeText(value: string): string {
	return value.replace(/[\\;,]/g, '\\$&').replace(/\r?\n/g, '\\n');
}

const pad = (n: number) => String(n).padStart(2, '0');

// utc for other zones
function utcStamp(local: string): string | null {
	const date = new Date(local);
	if (Number.isNaN(date.getTime())) return null;
	return (
		`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`
	);
}

function dateStamp(day: string, addDays = 0): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (!match) return null;
	const date = new Date(
		Date.UTC(
			Number(match[1]),
			Number(match[2]) - 1,
			Number(match[3]),
		),
	);
	date.setUTCDate(date.getUTCDate() + addDays);
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

export function eventEndsBeforeStart(data: EventData): boolean {
	return !!(data.start && data.end && data.end < data.start);
}

// zxing bare vevent
export function eventString(data: EventData): string {
	if (!data.title.trim() || !data.start) return '';
	if (eventEndsBeforeStart(data)) return '';

	const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeText(data.title)}`];
	if (data.allDay) {
		const start = dateStamp(data.start);
		if (!start) return '';
		// dtend exclusive for date
		const end = dateStamp(data.end || data.start, 1);
		lines.push(`DTSTART;VALUE=DATE:${start}`);
		if (end) lines.push(`DTEND;VALUE=DATE:${end}`);
	} else {
		const start = utcStamp(data.start);
		if (!start) return '';
		lines.push(`DTSTART:${start}`);
		const end = data.end ? utcStamp(data.end) : null;
		if (end) lines.push(`DTEND:${end}`);
	}
	if (data.location) lines.push(`LOCATION:${escapeText(data.location)}`);
	if (data.notes) lines.push(`DESCRIPTION:${escapeText(data.notes)}`);
	lines.push('END:VEVENT');
	return lines.join('\n');
}
