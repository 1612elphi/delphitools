import { module, test } from 'qunit';
import {
	buildTree,
	errorInfo,
	flattenTree,
	formatJson,
	parseJson,
	positionFromLineColumn,
	positionInfo,
} from 'delphitools-v2/lib/json-format';

const V8 = 'Unexpected token } in JSON at position 12 (line 2 column 5)';
const V8_CLASSIC = 'Unexpected token } in JSON at position 12';
const FIREFOX =
	'JSON.parse: expected property name or } at line 2 column 5 of the JSON data';

module('Unit | Lib | json-format', function () {
	module('positionInfo / positionFromLineColumn', function () {
		const source = 'aaa\nbb\n\nc';

		test('offsets collapse to line and column correctly', function (assert) {
			assert.deepEqual(positionInfo(source, 0), {
				line: 1,
				column: 1,
			});
			assert.deepEqual(positionInfo(source, 2), {
				line: 1,
				column: 3,
			});
			assert.deepEqual(positionInfo(source, 3), {
				line: 1,
				column: 4,
			});
			assert.deepEqual(positionInfo(source, 4), {
				line: 2,
				column: 1,
			});
			assert.deepEqual(positionInfo(source, 6), {
				line: 2,
				column: 3,
			});
			assert.deepEqual(positionInfo(source, 7), {
				line: 3,
				column: 1,
			});
			assert.deepEqual(positionInfo(source, 8), {
				line: 4,
				column: 1,
			});
			assert.deepEqual(positionInfo(source, 9), {
				line: 4,
				column: 2,
			});
		});

		test('an offset past the end clamps to the last byte', function (assert) {
			assert.deepEqual(positionInfo(source, 999), {
				line: 4,
				column: 2,
			});
		});

		test('line/column conversion round-trips through positionInfo', function (assert) {
			for (let i = 0; i <= source.length; i++) {
				const { line, column } = positionInfo(
					source,
					i,
				);
				assert.strictEqual(
					positionFromLineColumn(
						source,
						line,
						column,
					),
					i,
					`offset ${i}`,
				);
			}
		});
	});

	module('errorInfo', function () {
		test('current V8 messages carry both position and line/column', function (assert) {
			const info = errorInfo('aaaaaaaa\nbbbbbbbbbb', V8);
			assert.strictEqual(info.message, V8);
			assert.strictEqual(info.line, 2);
			assert.strictEqual(info.column, 5);
			assert.strictEqual(info.position, 13);
		});

		test('classic V8 messages derive line/column from the offset', function (assert) {
			const info = errorInfo(
				'aaaaaaaa\nbbbbbbbbbb',
				V8_CLASSIC,
			);
			assert.strictEqual(info.line, 2);
			assert.strictEqual(info.column, 4);
			assert.strictEqual(info.position, 12);
		});

		test('SpiderMonkey messages carry line and column', function (assert) {
			const info = errorInfo('aaaaaaaa\nbbbbbbbbbb', FIREFOX);
			assert.strictEqual(info.message, FIREFOX);
			assert.strictEqual(info.line, 2);
			assert.strictEqual(info.column, 5);
			assert.strictEqual(info.position, 13);
		});

		test('an unterminated document points at the last byte', function (assert) {
			const info = errorInfo(
				'{"a": 1,\n"b": 2',
				'Unexpected end of JSON input',
			);
			assert.deepEqual(
				{ line: info.line, column: info.column },
				{ line: 2, column: 7 },
			);
			assert.strictEqual(info.position, 15);
		});

		test('an unrecognised message shape falls back to the first byte', function (assert) {
			const info = errorInfo(
				'{"a": }',
				'JSON.parse: somehow wrong',
			);
			assert.strictEqual(info.line, 1);
			assert.strictEqual(info.column, 1);
			assert.strictEqual(info.position, 0);
		});

		test('V8 token-echo grammar: the quoted window pins the token', function (assert) {
			const source = '{"a": }';
			const info = errorInfo(
				source,
				`Unexpected token '}', "{"a": }" is not valid JSON`,
			);
			assert.deepEqual(
				{
					line: info.line,
					column: info.column,
					position: info.position,
				},
				{ line: 1, column: 7, position: 6 },
			);
		});

		test('V8 token-echo grammar with a clipped window', function (assert) {
			const source =
				'[' +
				' '.repeat(300) +
				'@' +
				' '.repeat(300) +
				']';
			const window = ' '.repeat(10) + '@' + ' '.repeat(9);
			const info = errorInfo(
				source,
				`Unexpected token '@', ..."${window}"... is not valid JSON`,
			);
			assert.deepEqual(
				{
					line: info.line,
					column: info.column,
					position: info.position,
				},
				{ line: 1, column: 302, position: 301 },
			);
		});

		test('V8 token-echo grammar: an escaped newline token resolves mid-document', function (assert) {
			const source = '{\n  "a": 1,\n  "b": tru\n}';
			const info = errorInfo(
				source,
				`Unexpected token '\\n', ..."  \\"b\\": tru\\n}"... is not valid JSON`,
			);
			assert.deepEqual(
				{
					line: info.line,
					column: info.column,
					position: info.position,
				},
				{ line: 3, column: 11, position: 22 },
			);
		});

		test('JavaScriptCore identifiers are found in the source', function (assert) {
			const info = errorInfo(
				'{"a": tru}',
				'JSON Parse error: Unexpected identifier "tru"',
			);
			assert.deepEqual(
				{
					line: info.line,
					column: info.column,
					position: info.position,
				},
				{ line: 1, column: 7, position: 6 },
			);
		});
	});

	module('parseJson', function () {
		test('a valid document parses', function (assert) {
			const result = parseJson('{"a": 1, "b": [true, null]}');
			assert.true(result.ok);
			assert.deepEqual(result.ok ? result.value : null, {
				a: 1,
				b: [true, null],
			});
		});

		test('blank input is an error, not the value undefined', function (assert) {
			const result = parseJson('   ');
			assert.false(result.ok);
			const message = result.ok ? '' : result.error.message;
			assert.strictEqual(typeof message, 'string');
		});

		test('an invalid document reports the engine message and a location', function (assert) {
			const result = parseJson('{\n  "a": 1,\n  "b": tru\n}');
			assert.false(result.ok);
			const error = result.ok ? null : result.error;
			assert.true(error!.message.length > 0);
			assert.strictEqual(error!.line, 3);
			assert.true(error!.column >= 3);
		});
	});

	module('formatJson', function () {
		const value = { a: 1, b: { c: [2, 3] } };

		test('space indents nest each level', function (assert) {
			assert.strictEqual(
				formatJson(value, '2'),
				'{\n  "a": 1,\n  "b": {\n    "c": [\n      2,\n      3\n    ]\n  }\n}',
			);
			assert.strictEqual(
				formatJson(value, '4'),
				formatJson(value, '2').replaceAll(
					/ {2}/g,
					'    ',
				),
			);
		});

		test('tabs indent one level at a time', function (assert) {
			assert.strictEqual(
				formatJson(value, 'tab'),
				'{\n\t"a": 1,\n\t"b": {\n\t\t"c": [\n\t\t\t2,\n\t\t\t3\n\t\t]\n\t}\n}',
			);
		});

		test('minify emits a single line', function (assert) {
			assert.strictEqual(
				formatJson(value, 'minify'),
				'{"a":1,"b":{"c":[2,3]}}',
			);
		});
	});

	module('flattenTree', function () {
		const tree = buildTree({ a: 1, list: [true, null] });

		test('an expanded walk lists every node depth-first', function (assert) {
			const rows = flattenTree(tree, new Set());
			assert.deepEqual(
				rows.map((row) => row.node.key ?? 'root'),
				['root', 'a', 'list', '0', '1'],
			);
			assert.deepEqual(
				rows.map((row) => row.depth),
				[0, 1, 1, 2, 2],
			);
			assert.false(rows.some((row) => row.collapsed));
		});

		test('collapsing a container withholds its subtree only', function (assert) {
			const list = tree.children?.[1];
			assert.strictEqual(list?.kind, 'array');
			const rows = flattenTree(
				tree,
				new Set([list?.path ?? '']),
			);
			assert.deepEqual(
				rows.map((row) => row.node.key ?? 'root'),
				['root', 'a', 'list'],
			);
			assert.true(rows[2]!.collapsed);
		});

		test('primitives carry a display payload, containers do not', function (assert) {
			const rows = flattenTree(tree, new Set());
			assert.strictEqual(rows[0]!.display, null);
			assert.strictEqual(rows[1]!.display, '1');
			assert.strictEqual(rows[3]!.display, 'true');
			assert.strictEqual(rows[4]!.display, 'null');

			const quoted = flattenTree(
				buildTree({ s: 'a"b' }),
				new Set(),
			);
			assert.strictEqual(quoted[1]!.display, '"a\\"b"');
		});
	});

	module('buildTree', function () {
		test('a document node describes itself and carries children', function (assert) {
			const tree = buildTree({ a: 1, list: [true, null] });
			assert.strictEqual(tree.kind, 'object');
			assert.strictEqual(tree.key, null);

			const children = tree.children ?? [];
			assert.strictEqual(children.length, 2);
			assert.strictEqual(children[0]?.kind, 'number');
			assert.strictEqual(children[0]?.key, 'a');
			assert.strictEqual(children[0]?.value, 1);

			assert.strictEqual(children[1]?.kind, 'array');
			assert.strictEqual(children[1]?.key, 'list');
			assert.strictEqual(children[1]?.entryCount, 2);

			const listChildren = children[1]?.children ?? [];
			assert.strictEqual(listChildren.length, 2);
			assert.strictEqual(listChildren[0]?.kind, 'boolean');
			assert.strictEqual(listChildren[0]?.key, '0');
			assert.true(listChildren[0]?.value);
			assert.strictEqual(listChildren[1]?.kind, 'null');
			assert.strictEqual(listChildren[1]?.value, null);
		});

		test('paths are unique across sibling subtrees', function (assert) {
			const tree = buildTree({ a: { x: 1 }, 'a\0x': 2 });
			const paths = (tree.children ?? []).map(
				(node) => node.path,
			);
			assert.strictEqual(new Set(paths).size, paths.length);
		});

		test('a top-level primitive is a root with no children', function (assert) {
			const tree = buildTree('plain');
			assert.strictEqual(tree.kind, 'string');
			assert.strictEqual(tree.value, 'plain');
			assert.strictEqual(tree.entryCount, 0);
			assert.strictEqual(tree.children, null);
		});
	});
});
