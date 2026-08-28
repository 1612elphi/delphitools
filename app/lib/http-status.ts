export type StatusClass = 1 | 2 | 3 | 4 | 5;

export type RegistryStatus = 'standard' | 'deprecated' | 'unused';

export interface HttpStatus {
	code: number;
	phrase: string;
	class: StatusClass;
	ref: string;
	url: string;
	cacheable: boolean;
	registered: RegistryStatus;
}

export interface StatusClassInfo {
	class: StatusClass;
	name: string;
}

export const STATUS_CLASSES: StatusClassInfo[] = [
	{ class: 1, name: 'Informational' },
	{ class: 2, name: 'Successful' },
	{ class: 3, name: 'Redirection' },
	{ class: 4, name: 'Client Error' },
	{ class: 5, name: 'Server Error' },
];

export const DEFAULT_CACHEABLE: readonly number[] = [
	200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501,
];

const rfc = (n: number, section: string) =>
	`https://www.rfc-editor.org/rfc/rfc${n}.html#section-${section}`;

type StatusSeed = [
	code: number,
	phrase: string,
	cls: StatusClass,
	rfcNumber: number,
	section: string,
	registered?: RegistryStatus,
];

const SEEDS: StatusSeed[] = [
	[100, 'Continue', 1, 9110, '15.2.1'],
	[101, 'Switching Protocols', 1, 9110, '15.2.2'],
	[102, 'Processing', 1, 2518, '10.1'],
	[103, 'Early Hints', 1, 8297, '2'],

	[200, 'OK', 2, 9110, '15.3.1'],
	[201, 'Created', 2, 9110, '15.3.2'],
	[202, 'Accepted', 2, 9110, '15.3.3'],
	[203, 'Non-Authoritative Information', 2, 9110, '15.3.4'],
	[204, 'No Content', 2, 9110, '15.3.5'],
	[205, 'Reset Content', 2, 9110, '15.3.6'],
	[206, 'Partial Content', 2, 9110, '15.3.7'],
	[207, 'Multi-Status', 2, 4918, '11.1'],
	[208, 'Already Reported', 2, 5842, '7.1'],
	[226, 'IM Used', 2, 3229, '10.4.1'],

	[300, 'Multiple Choices', 3, 9110, '15.4.1'],
	[301, 'Moved Permanently', 3, 9110, '15.4.2'],
	[302, 'Found', 3, 9110, '15.4.3'],
	[303, 'See Other', 3, 9110, '15.4.4'],
	[304, 'Not Modified', 3, 9110, '15.4.5'],
	[305, 'Use Proxy', 3, 9110, '15.4.6', 'deprecated'],
	[306, '(Unused)', 3, 9110, '15.4.7', 'unused'],
	[307, 'Temporary Redirect', 3, 9110, '15.4.8'],
	[308, 'Permanent Redirect', 3, 9110, '15.4.9'],

	[400, 'Bad Request', 4, 9110, '15.5.1'],
	[401, 'Unauthorized', 4, 9110, '15.5.2'],
	[402, 'Payment Required', 4, 9110, '15.5.3'],
	[403, 'Forbidden', 4, 9110, '15.5.4'],
	[404, 'Not Found', 4, 9110, '15.5.5'],
	[405, 'Method Not Allowed', 4, 9110, '15.5.6'],
	[406, 'Not Acceptable', 4, 9110, '15.5.7'],
	[407, 'Proxy Authentication Required', 4, 9110, '15.5.8'],
	[408, 'Request Timeout', 4, 9110, '15.5.9'],
	[409, 'Conflict', 4, 9110, '15.5.10'],
	[410, 'Gone', 4, 9110, '15.5.11'],
	[411, 'Length Required', 4, 9110, '15.5.12'],
	[412, 'Precondition Failed', 4, 9110, '15.5.13'],
	[413, 'Content Too Large', 4, 9110, '15.5.14'],
	[414, 'URI Too Long', 4, 9110, '15.5.15'],
	[415, 'Unsupported Media Type', 4, 9110, '15.5.16'],
	[416, 'Range Not Satisfiable', 4, 9110, '15.5.17'],
	[417, 'Expectation Failed', 4, 9110, '15.5.18'],
	[418, "I'm a Teapot", 4, 9110, '15.5.19', 'unused'],
	[421, 'Misdirected Request', 4, 9110, '15.5.20'],
	[422, 'Unprocessable Content', 4, 9110, '15.5.21'],
	[423, 'Locked', 4, 4918, '11.3'],
	[424, 'Failed Dependency', 4, 4918, '11.4'],
	[425, 'Too Early', 4, 8470, '5.2'],
	[426, 'Upgrade Required', 4, 9110, '15.5.22'],
	[428, 'Precondition Required', 4, 6585, '3'],
	[429, 'Too Many Requests', 4, 6585, '4'],
	[431, 'Request Header Fields Too Large', 4, 6585, '5'],
	[451, 'Unavailable For Legal Reasons', 4, 7725, '3'],

	[500, 'Internal Server Error', 5, 9110, '15.6.1'],
	[501, 'Not Implemented', 5, 9110, '15.6.2'],
	[502, 'Bad Gateway', 5, 9110, '15.6.3'],
	[503, 'Service Unavailable', 5, 9110, '15.6.4'],
	[504, 'Gateway Timeout', 5, 9110, '15.6.5'],
	[505, 'HTTP Version Not Supported', 5, 9110, '15.6.6'],
	[506, 'Variant Also Negotiates', 5, 2295, '8.1'],
	[507, 'Insufficient Storage', 5, 4918, '11.5'],
	[508, 'Loop Detected', 5, 5842, '7.2'],
	[510, 'Not Extended', 5, 2774, '7'],
	[511, 'Network Authentication Required', 5, 6585, '6'],
];

export const HTTP_STATUSES: HttpStatus[] = SEEDS.map(
	([code, phrase, cls, rfcNumber, section, registered]) => ({
		code,
		phrase,
		class: cls,
		ref: `RFC ${rfcNumber} §${section}`,
		url: rfc(rfcNumber, section),
		cacheable: DEFAULT_CACHEABLE.includes(code),
		registered: registered ?? 'standard',
	}),
);

export const TOTAL_STATUSES = HTTP_STATUSES.length;

export interface StatusClassGroup {
	class: StatusClass;
	name: string;
	items: HttpStatus[];
}

export function filterStatuses(
	search: string,
	activeClass: StatusClass | null,
): StatusClassGroup[] {
	let statuses = activeClass
		? HTTP_STATUSES.filter((status) => status.class === activeClass)
		: HTTP_STATUSES;

	const query = search.trim().toLowerCase();
	if (query) {
		statuses = statuses.filter(
			(status) =>
				String(status.code).includes(query) ||
				status.phrase.toLowerCase().includes(query),
		);
	}

	const byClass = new Map<StatusClass, HttpStatus[]>();
	for (const status of statuses) {
		const bucket = byClass.get(status.class) ?? [];
		bucket.push(status);
		byClass.set(status.class, bucket);
	}

	return STATUS_CLASSES.filter((info) => byClass.has(info.class)).map(
		(info) => ({
			class: info.class,
			name: info.name,
			items: byClass.get(info.class) ?? [],
		}),
	);
}

export function lookupStatus(code: number): HttpStatus | null {
	return HTTP_STATUSES.find((status) => status.code === code) ?? null;
}
