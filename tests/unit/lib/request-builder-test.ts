import { module, test } from 'qunit';
import {
	fullUrl,
	toCurl,
	toHttp,
	type RequestSpec,
} from 'delphitools-v2/lib/request-builder';

const spec = (over: Partial<RequestSpec>): RequestSpec => ({
	method: 'GET',
	url: 'https://api.example.com/things',
	params: [],
	headers: [],
	body: '',
	...over,
});

module('Unit | lib | request-builder', function () {
	test('a bare GET is one line with no -X', function (assert) {
		assert.strictEqual(
			toCurl(spec({})),
			"curl 'https://api.example.com/things'",
		);
	});

	test('params append to an existing query, encoded', function (assert) {
		const s = spec({
			url: 'https://api.example.com/things?page=2',
			params: [
				{ key: 'q', value: 'a b' },
				{ key: '', value: 'ignored' },
			],
		});
		assert.strictEqual(
			fullUrl(s),
			'https://api.example.com/things?page=2&q=a%20b',
		);
	});

	test('POST carries -X, headers and --data on continued lines', function (assert) {
		const s = spec({
			method: 'POST',
			headers: [
				{
					key: 'Content-Type',
					value: 'application/json',
				},
			],
			body: '{"name":"delphi"}',
		});
		assert.strictEqual(
			toCurl(s),
			"curl -X POST 'https://api.example.com/things' \\\n" +
				"  -H 'Content-Type: application/json' \\\n" +
				'  --data \'{"name":"delphi"}\'',
		);
	});

	test('HEAD becomes curl -I', function (assert) {
		assert.true(
			toCurl(spec({ method: 'HEAD' })).startsWith('curl -I '),
		);
	});

	test('single quotes in the body are shell-escaped', function (assert) {
		const s = spec({ method: 'POST', body: "it's" });
		assert.true(toCurl(s).endsWith(`--data 'it'\\''s'`));
	});

	test('the raw request has a request line, Host and a blank line before the body', function (assert) {
		const s = spec({
			method: 'POST',
			url: 'https://api.example.com:8443/things?page=2',
			headers: [{ key: 'Accept', value: 'text/plain' }],
			body: 'hi',
		});
		assert.strictEqual(
			toHttp(s),
			'POST /things?page=2 HTTP/1.1\n' +
				'Host: api.example.com:8443\n' +
				'Accept: text/plain\n' +
				'Content-Length: 2\n' +
				'\n' +
				'hi',
		);
	});

	test('an explicit Host or Content-Length header wins', function (assert) {
		const s = spec({
			method: 'POST',
			headers: [
				{ key: 'Host', value: 'other.example' },
				{ key: 'Content-Length', value: '99' },
			],
			body: 'hi',
		});
		const http = toHttp(s);
		assert.false(http.includes('Host: api.example.com'));
		assert.false(http.includes('Content-Length: 2'));
		assert.true(http.includes('Host: other.example'));
	});

	test('Content-Length counts bytes, not code units', function (assert) {
		const s = spec({ method: 'POST', body: 'ü' });
		assert.true(toHttp(s).includes('Content-Length: 2'));
	});

	test('a relative URL rides the request line as typed', function (assert) {
		const s = spec({
			url: '/things',
			params: [{ key: 'a', value: '1' }],
		});
		assert.true(toHttp(s).startsWith('GET /things?a=1 HTTP/1.1\n'));
		assert.false(toHttp(s).includes('Host:'));
	});

	test('an empty URL still forms a request line', function (assert) {
		assert.true(
			toHttp(spec({ url: '' })).startsWith('GET / HTTP/1.1'),
		);
	});
});
