import { module, test } from 'qunit';
import { AtaError, readDoc } from 'delphitools-v2/lib/errata/write/ata';
import { docToRtf, rtfToDoc } from 'delphitools-v2/lib/errata/write/rtf';
import {
	FIELD_CHAR,
	type Block,
	type Paragraph,
	type Setup,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

const para = (
	id: string,
	text: string,
	props: Paragraph['props'] = {},
): Paragraph => ({
	kind: 'para',
	id,
	style: 'body',
	props,
	runs: [{ text, props: {} }],
	dir: 'ltr',
});

const SETUP: Setup = {
	width: 595,
	height: 842,
	margins: { top: 72, right: 72, bottom: 72, left: 72 },
};

const raw = (over: Record<string, unknown>) => ({
	version: 1,
	name: 'n',
	setup: SETUP,
	blocks: [para('a', 'x')],
	...over,
});

const throwsAta = (assert: Assert, v: unknown, msg: string) =>
	assert.throws(() => readDoc(v), AtaError, msg);

module('Unit | errata | write | persistence', function () {
	test('.ata reads sections, columns, stories and setup fields', function (assert) {
		const doc = readDoc(
			raw({
				created: '2026-01-02T03:04:05.000Z',
				setup: {
					...SETUP,
					columns: 7,
					gutter: 18,
					header: [para('h', 'Head')],
					titlePage: true,
					firstFooter: [para('f', 'Foot')],
					numbering: 'ROMAN',
					restart: 3.4,
					lang: 'de',
					hyphenate: true,
				},
				blocks: [
					para('a', 'x'),
					{ kind: 'column', id: 'c' },
					{
						kind: 'section',
						id: 's',
						setup: SETUP,
					},
				],
			}),
		);
		assert.strictEqual(doc.created, '2026-01-02T03:04:05.000Z');
		assert.deepEqual(
			[
				doc.setup.columns,
				doc.setup.gutter,
				doc.setup.titlePage,
				doc.setup.numbering,
				doc.setup.restart,
				doc.setup.lang,
				doc.setup.hyphenate,
			],
			[3, 18, true, 'ROMAN', 3, 'de', true],
		);
		assert.strictEqual(doc.setup.header![0]!.runs[0]!.text, 'Head');
		assert.strictEqual(doc.setup.firstFooter![0]!.id, 'f');
		assert.deepEqual(
			doc.blocks.map((b) => b.kind),
			['para', 'column', 'section', 'para'],
			'a closing section gets a paragraph',
		);
	});

	test('.ata rejects bad new fields', function (assert) {
		const withSetup = (extra: object) =>
			raw({ setup: { ...SETUP, ...extra } });
		throwsAta(
			assert,
			withSetup({ numbering: 'greek' }),
			'numbering',
		);
		throwsAta(assert, withSetup({ lang: 'fr' }), 'lang');
		throwsAta(assert, withSetup({ hyphenate: 'yes' }), 'hyphenate');
		throwsAta(assert, withSetup({ columns: '2' }), 'columns');
		throwsAta(assert, withSetup({ header: {} }), 'header shape');
		throwsAta(
			assert,
			withSetup({ header: [{ kind: 'break', id: 'b' }] }),
			'breaks in a header',
		);
		throwsAta(
			assert,
			raw({ blocks: [{ kind: 'section', id: 's' }] }),
			'section without setup',
		);
		throwsAta(
			assert,
			raw({
				blocks: [
					{
						...para('a', 'x'),
						props: {
							border: {
								top: {
									width: 1,
								},
							},
						},
					},
				],
			}),
			'border colour',
		);
		throwsAta(
			assert,
			raw({ blocks: [para('a', 'x', { shading: 'red' })] }),
			'shading colour',
		);
		const bad = raw({ created: 'not a date' });
		assert.strictEqual(readDoc(bad).created, undefined);
	});

	test('.ata sanitises fields and borders', function (assert) {
		const doc = readDoc(
			raw({
				blocks: [
					{
						...para('a', ''),
						runs: [
							{
								text: `ab${FIELD_CHAR}`,
								props: {},
							},
							{
								text: `x${FIELD_CHAR}${FIELD_CHAR}`,
								props: {
									field: 'page',
								},
							},
							{
								text: 'gone',
								props: {
									field: 'date',
								},
							},
						],
						props: {
							border: {
								top: {
									width: 99,
									colour: '#ff0000',
								},
							},
							keepNext: true,
							widow: false,
						},
					},
				],
			}),
		);
		const p = doc.blocks[0] as Paragraph;
		assert.deepEqual(
			p.runs.map((r) => [r.text, r.props.field]),
			[
				['ab', undefined],
				[`${FIELD_CHAR}${FIELD_CHAR}`, 'page'],
			],
		);
		assert.deepEqual(p.props, {
			border: { top: { width: 12, colour: '#ff0000' } },
			keepNext: true,
			widow: false,
		});
		throwsAta(
			assert,
			raw({
				blocks: [
					{
						...para('a', ''),
						runs: [
							{
								text: FIELD_CHAR,
								props: {
									field: 'clock',
								},
							},
						],
					},
				],
			}),
			'unknown field',
		);
	});

	test('RTF round trip of sections, columns, stories, fields, borders', function (assert) {
		const edge = { width: 1, colour: '#ff0000' };
		const field = (
			id: string,
			kind: 'page' | 'pages' | 'title',
		) => ({
			...para(id, ''),
			runs: [
				{ text: 'p ', props: {} },
				{ text: FIELD_CHAR, props: { field: kind } },
			],
		});
		const second: Setup = {
			width: 842,
			height: 595,
			margins: { top: 50, right: 40, bottom: 60, left: 30 },
			columns: 2,
			gutter: 24,
			footer: [field('f2', 'pages')],
			numbering: 'roman',
			restart: 5,
		};
		const blocks: Block[] = [
			para('a', 'one', {
				border: { top: edge, bottom: edge },
				shading: '#eeeeee',
			}),
			{ kind: 'column', id: 'c' },
			para('b', 'two'),
			{ kind: 'section', id: 's', setup: second },
			field('t', 'title'),
		];
		const doc: WriteDoc = {
			version: 1,
			name: 'R',
			setup: {
				...SETUP,
				columns: 3,
				gutter: 12,
				header: [field('h', 'page')],
				titlePage: true,
				firstHeader: [para('fh', 'First')],
				lang: 'de',
				hyphenate: true,
			},
			blocks,
		};
		const rtf = docToRtf(doc);
		for (const word of [
			'\\sect\\sectd',
			'\\cols3\\colsx240',
			'\\column',
			'{\\header ',
			'{\\headerf ',
			'{\\footer ',
			'\\titlepg',
			'\\pgnlcrm',
			'\\pgnstarts5\\pgnrestart',
			'{\\*\\fldinst PAGE}',
			'{\\*\\fldinst NUMPAGES}',
			'{\\*\\fldinst TITLE}',
			'\\brdrt\\brdrs\\brdrw20\\brdrcf',
			'\\cbpat',
			'\\hyphauto1',
			'\\deflang1031',
		])
			assert.ok(rtf.includes(word), word);
		const back = rtfToDoc(rtf, 'R');
		const strip = (b: Block | Paragraph): unknown =>
			b.kind === 'section'
				? { ...b, id: '', setup: stripSetup(b.setup) }
				: { ...b, id: '' };
		const stripSetup = (s: Setup) => ({
			...s,
			header: s.header?.map(strip),
			footer: s.footer?.map(strip),
			firstHeader: s.firstHeader?.map(strip),
			firstFooter: s.firstFooter?.map(strip),
		});
		assert.deepEqual(stripSetup(back.setup), stripSetup(doc.setup));
		assert.deepEqual(back.blocks.map(strip), blocks.map(strip));
	});

	test('RTF reads Word-style fields and section words', function (assert) {
		const doc = rtfToDoc(
			String.raw`{\rtf1\ansi\deflang1033\hyphauto1 \sectd\cols2\colsx720\pgnucrm {\footer \pard {\field{\*\fldinst { PAGE }}{\fldrslt {7}}} of {\field{\*\fldinst NUMPAGES \* MERGEFORMAT}{\fldrslt 9}}\par}
\pard\brdrb\brdrs\brdrw15\brdrnone\box\brdrdb\brdrw30 Text\par}`,
			'w',
		);
		assert.deepEqual(
			[
				doc.setup.columns,
				doc.setup.gutter,
				doc.setup.numbering,
			],
			[2, 36, 'ROMAN'],
		);
		assert.true(doc.setup.hyphenate);
		assert.strictEqual(doc.setup.lang, undefined);
		const footer = doc.setup.footer![0]!;
		assert.deepEqual(
			footer.runs.map((r) => [r.text, r.props.field]),
			[
				[FIELD_CHAR, 'page'],
				[' of ', undefined],
				[FIELD_CHAR, 'pages'],
			],
		);
		const body = doc.blocks[0] as Paragraph;
		assert.strictEqual(body.runs[0]!.text, 'Text');
		const e = { width: 1.5, colour: '#000000' };
		assert.deepEqual(body.props.border, {
			top: e,
			bottom: e,
			left: e,
			right: e,
		});
	});
});
