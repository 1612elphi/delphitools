export interface Pair {
	key: string;
	value: string;
}

export interface RequestSpec {
	method: string;
	url: string;
	params: Pair[];
	headers: Pair[];
	body: string;
}

export const METHODS = [
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'HEAD',
	'OPTIONS',
] as const;

const live = (pairs: Pair[]) => pairs.filter((pair) => pair.key.trim() !== '');

const findHeader = (headers: Pair[], name: string) =>
	headers.some((pair) => pair.key.trim().toLowerCase() === name);

// escape posix quotes
const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

export function fullUrl(spec: RequestSpec): string {
	const extra = live(spec.params)
		.map(
			(pair) =>
				`${encodeURIComponent(pair.key.trim())}=${encodeURIComponent(pair.value)}`,
		)
		.join('&');
	if (!extra) return spec.url;
	return spec.url + (spec.url.includes('?') ? '&' : '?') + extra;
}

export function toCurl(spec: RequestSpec): string {
	const url = quote(fullUrl(spec));
	const parts: string[] = [];
	if (spec.method === 'GET') parts.push(`curl ${url}`);
	else if (spec.method === 'HEAD') parts.push(`curl -I ${url}`);
	else parts.push(`curl -X ${spec.method} ${url}`);
	for (const pair of live(spec.headers))
		parts.push(`-H ${quote(`${pair.key.trim()}: ${pair.value}`)}`);
	if (spec.body) parts.push(`--data ${quote(spec.body)}`);
	return parts.join(' \\\n  ');
}

export function toHttp(spec: RequestSpec): string {
	const full = fullUrl(spec);
	let host = '';
	let target = full || '/';
	try {
		const url = new URL(full);
		host = url.host;
		target = url.pathname + url.search;
	} catch {
	}

	const headers = live(spec.headers);
	const lines = [`${spec.method} ${target || '/'} HTTP/1.1`];
	if (host && !findHeader(headers, 'host')) lines.push(`Host: ${host}`);
	for (const pair of headers)
		lines.push(`${pair.key.trim()}: ${pair.value}`);
	if (spec.body && !findHeader(headers, 'content-length')) {
		lines.push(
			`Content-Length: ${new TextEncoder().encode(spec.body).length}`,
		);
	}

	return lines.join('\n') + (spec.body ? `\n\n${spec.body}` : '\n');
}
