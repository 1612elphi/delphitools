import { module, test } from 'qunit';
import { strToU8, zipSync } from 'fflate';
import {
	ATA_MIME,
	AtaError,
	openAta,
	saveAta,
} from 'delphitools-v2/lib/errata/write/ata';
import type { WriteDoc } from 'delphitools-v2/lib/errata/write/types';

const DOC: WriteDoc = {
	version: 1,
	name: 'Notes',
	setup: {
		width: 595,
		height: 842,
		margins: { top: 72, right: 72, bottom: 72, left: 72 },
	},
	blocks: [
		{
			kind: 'para',
			id: 'a',
			style: 'h1',
			props: {
				align: 'centre',
				list: { kind: 'number', level: 1 },
				firstLine: -12,
			},
			runs: [
				{
					text: 'Hi',
					props: {
						bold: true,
						colour: '#ff0000',
						script: 'super',
					},
				},
			],
			dir: 'ltr',
		},
		{ kind: 'break', id: 'b' },
	],
};

function zip(json: unknown, mime = ATA_MIME): Uint8Array {
	return zipSync({
		mimetype: [strToU8(mime), { level: 0 }],
		'document.json': strToU8(JSON.stringify(json)),
	});
}

module('Unit | errata | write | ata', function () {
	test('round trip, mimetype first and stored', function (assert) {
		const bytes = saveAta(DOC);
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		assert.strictEqual(view.getUint16(8, true), 0);
		assert.strictEqual(
			new TextDecoder().decode(bytes.subarray(30, 38)),
			'mimetype',
		);
		assert.deepEqual(openAta(bytes), DOC);
	});

	test('vertical alignment round trips', function (assert) {
		const doc: WriteDoc = {
			...DOC,
			setup: {
				...DOC.setup,
				valign: 'centre',
				titlePage: true,
			},
		};
		assert.deepEqual(openAta(saveAta(doc)).setup, doc.setup);
	});

	test('sanitises unknown keys, ranges, runs and ids', function (assert) {
		const out = openAta(
			zip({
				version: 1,
				name: 'x',
				extra: true,
				setup: {
					width: 1e9,
					height: 10,
					margins: {
						top: -5,
						right: 1e6,
						bottom: 0,
						left: 0,
					},
				},
				blocks: [
					{
						kind: 'para',
						id: 'a',
						style: 'body',
						props: {
							lineSpacing: 99,
							evil: 1,
						},
						runs: [],
						dir: 'rtl',
					},
					{ kind: 'break', id: 'a' },
					{ kind: 'break' },
				],
			}),
		);
		assert.notOk('extra' in out);
		assert.deepEqual(out.setup, {
			width: 14400,
			height: 72,
			margins: { top: 0, right: 7164, bottom: 0, left: 0 },
		});
		const first = out.blocks[0]!;
		assert.deepEqual(first, {
			kind: 'para',
			id: 'a',
			style: 'body',
			props: { lineSpacing: 5 },
			runs: [{ text: '', props: {} }],
			dir: 'ltr',
		});
		const ids = out.blocks.map((b) => b.id);
		assert.strictEqual(new Set(ids).size, 3);
		assert.ok(ids.every((id) => typeof id === 'string' && id));
	});

	test('empty blocks get one paragraph', function (assert) {
		const out = openAta(zip({ ...DOC, blocks: [] }));
		assert.strictEqual(out.blocks.length, 1);
		assert.strictEqual(out.blocks[0]!.kind, 'para');
	});

	test('malformed input throws AtaError', function (assert) {
		const bad = (
			json: unknown,
			edit: (d: Record<string, unknown>) => void,
		) => {
			const copy = structuredClone(json) as Record<
				string,
				unknown
			>;
			edit(copy);
			return zip(copy);
		};
		const para = (d: Record<string, unknown>) =>
			(d.blocks as Record<string, unknown>[])[0]!;
		const run = (d: Record<string, unknown>) =>
			(para(d).runs as Record<string, unknown>[])[0]!
				.props as Record<string, unknown>;
		const cases: [string, Uint8Array][] = [
			['not a zip', new Uint8Array([1, 2, 3])],
			['wrong mimetype', zip(DOC, 'application/zip')],
			[
				'no document',
				zipSync({
					mimetype: [
						strToU8(ATA_MIME),
						{ level: 0 },
					],
				}),
			],
			[
				'bad json',
				zipSync({
					mimetype: [
						strToU8(ATA_MIME),
						{ level: 0 },
					],
					'document.json': strToU8('{'),
				}),
			],
			['array root', zip([])],
			['version', bad(DOC, (d) => (d.version = 2))],
			['name type', bad(DOC, (d) => (d.name = 3))],
			[
				'nan width',
				bad(
					DOC,
					(d) =>
						((
							d.setup as {
								width: unknown;
							}
						).width = 'wide'),
				),
			],
			[
				'block kind',
				bad(DOC, (d) => (para(d).kind = 'image')),
			],
			['style', bad(DOC, (d) => (para(d).style = 'h9'))],
			['runs', bad(DOC, (d) => (para(d).runs = 'Hi'))],
			[
				'run text',
				bad(
					DOC,
					(d) =>
						((
							para(d).runs as {
								text: unknown;
							}[]
						)[0]!.text = 1),
				),
			],
			['colour', bad(DOC, (d) => (run(d).colour = 'red'))],
			['font', bad(DOC, (d) => (run(d).font = 'comic-sans'))],
			['bold', bad(DOC, (d) => (run(d).bold = 'yes'))],
			['size', bad(DOC, (d) => (run(d).size = null))],
			[
				'list',
				bad(
					DOC,
					(d) =>
						((
							para(d).props as {
								list: unknown;
							}
						).list = {
							kind: 'roman',
							level: 0,
						}),
				),
			],
		];
		for (const [label, bytes] of cases)
			assert.throws(() => openAta(bytes), AtaError, label);
	});

	test('links: allowed schemes kept, others dropped', function (assert) {
		const run = (link: unknown) => ({
			...DOC,
			blocks: [
				{
					kind: 'para',
					id: 'a',
					style: 'body',
					props: {},
					runs: [
						{
							text: 'x',
							props: {
								link,
								bold: true,
							},
						},
					],
					dir: 'ltr',
				},
			],
		});
		const props = (link: unknown) => {
			const b = openAta(zip(run(link))).blocks[0]!;
			return b.kind === 'para' ? b.runs[0]!.props : null;
		};
		assert.deepEqual(props('https://a.b/c'), {
			bold: true,
			link: 'https://a.b/c',
		});
		assert.deepEqual(props('example.com'), {
			bold: true,
			link: 'https://example.com/',
		});
		assert.deepEqual(props('mailto:x@y.z')?.link, 'mailto:x@y.z');
		assert.deepEqual(props('javascript:alert(1)'), { bold: true });
		assert.deepEqual(props(42), { bold: true });
	});
});
