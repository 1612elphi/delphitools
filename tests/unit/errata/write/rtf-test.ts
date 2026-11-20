import { module, test } from 'qunit';
import {
	RtfError,
	byteString,
	docToRtf,
	rtfToDoc,
} from 'delphitools-v2/lib/errata/write/rtf';
import { applySuggestedHeadings } from 'delphitools-v2/lib/errata/write/model';
import type {
	Block,
	Paragraph,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

const WORD = String.raw`{\rtf1\ansi\ansicpg1252\uc1 \deff0\deflang1033\deflangfe1033
{\fonttbl{\f0\froman\fcharset0\fprq2{\*\panose 02020603050405020304}Times New Roman;}{\f1\fswiss\fcharset0\fprq2{\*\panose 020b0604020202020204}Arial;}{\f3\froman\fcharset2\fprq2{\*\panose 05050102010706020507}Symbol;}{\f4\fmodern\fcharset0\fprq1 Courier New;}}
{\colortbl;\red0\green0\blue0;\red255\green0\blue0;\red255\green255\blue0;}
{\stylesheet{\ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs24\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 \snext0 Normal;}{\s1\ql \li0\ri0\sb240\sa60\keepn\widctlpar\aspalpha\aspnum\faauto\outlinelevel0\adjustright\rin0\lin0\itap0 \b\f1\fs32\lang1033\langfe1033\kerning32\cgrid\langnp1033\langfenp1033 \sbasedon0 \snext0 heading 1;}{\*\cs10 \additive Default Paragraph Font;}}
{\info{\title Report}{\author Jane}{\creatim\yr2001\mo3\dy4\hr10\min5}}
\paperw11906\paperh16838\margl1800\margr1800\margt1440\margb1440 \widowctrl\ftnbj\aenddoc\formshade\viewkind1\viewscale100 \fet0\sectd \linex0\headery709\footery709\colsx709\endnhere\sectdefaultcl {\header \pard\plain \s15\ql \li0\ri0\widctlpar \fs24 {Header text\par }}
{\*\pnseclvl1\pnucrm\pnstart1\pnindent720\pnhang{\pntxta .}}
\pard\plain \s1\ql \li0\ri0\sb240\sa60\keepn\widctlpar\aspalpha\aspnum\faauto\outlinelevel0\adjustright\rin0\lin0\itap0 \b\f1\fs32\lang1033\langfe1033\kerning32\cgrid\langnp1033\langfenp1033 {Gr\'fc\'dfe aus M\'e4rz\par }
\pard\plain \ql \li0\ri0\sa120\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs24\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 {Price: 5 \'80 or \u8364\'80 here, }{\b bold}{ and }{\cf2 red}{\highlight3 marked}{{\field{\*\fldinst {HYPERLINK "https://example.com"}}{\fldrslt {\ul link}}}.\par }
{\pntext\pard\plain\f3\fs24\cf0 \'b7\tab}\pard\plain \fi-360\li720\ri0\widctlpar{\*\pn \pnlvlblt\ilvl0\ls1\pnrnot0\pnf3\pnstart1\pnindent360\pnhang{\pntxtb \'b7}}\aspalpha\aspnum\faauto\ls1\adjustright\rin0\lin720\itap0 \fs24\lang1033 {First item\par }
{\pntext\pard\plain\f3\fs24\cf0 \'b7\tab}\pard\plain \fi-360\li720\ri0\widctlpar{\*\pn \pnlvlblt\ilvl0\ls1\pnrnot0\pnf3\pnstart1\pnindent360\pnhang{\pntxtb \'b7}}\aspalpha\aspnum\faauto\ls1\adjustright\rin0\lin720\itap0 \fs24\lang1033 {Second item\par }
\pard \ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 {\f4 code}{\page }{After break\par }}`;

const TEXTEDIT = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2761
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;\f1\fmodern\fcharset0 Courier;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue255;}
{\*\expandedcolortbl;;\csgenericrgb\c0\c0\c100000;}
{\*\listtable{\list\listtemplateid1\listhybrid{\listlevel\levelnfc23\levelnfcn23\leveljc0\leveljcn0\levelfollow0\levelstartat1\levelspace360\levelindent0{\*\levelmarker \{disc\}}{\leveltext\leveltemplateid1\'01\uc0\u8226 ;}{\levelnumbers;}\fi-360\li720\lin720 }{\listname ;}\listid1}
{\list\listtemplateid2\listhybrid{\listlevel\levelnfc0\levelnfcn0\leveljc0\leveljcn0\levelfollow0\levelstartat1\levelspace360\levelindent0{\*\levelmarker \{decimal\}.}{\leveltext\leveltemplateid101\'02\'00.;}{\levelnumbers\'01;}\fi-360\li720\lin720 }{\listname ;}\listid2}}
{\*\listoverridetable{\listoverride\listid1\listoverridecount0\ls1}{\listoverride\listid2\listoverridecount0\ls2}}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx566\tx1133\tx1700\pardirnatural\qc\partightenfactor0

\f0\fs24 \cf0 Centred caf\'e9\
\pard\pardirnatural\partightenfactor0
\cf0 Tab\tab here \cf2 blue\cf0  \uc0\u8364 x\
\pard\tx220\tx720\li720\fi-720\pardirnatural\partightenfactor0
\ls1\ilvl0\cf0 {\listtext	\uc0\u8226 	}Dot\
{\listtext	\uc0\u8226 	}Dot two\
\pard\tx720\li720\fi-720\pardirnatural\partightenfactor0
\ls2\ilvl0\cf0 {\listtext	1.	}One\
\pard\pardirnatural\partightenfactor0
\cf0 \
\f1 Mono}`;

const text = (b?: Block) =>
	b?.kind === 'para' ? b.runs.map((r) => r.text).join('') : null;

const strip = (doc: WriteDoc) => doc.blocks.map((b) => ({ ...b, id: '' }));

const DOC: WriteDoc = {
	version: 1,
	name: 'Notes',
	setup: {
		width: 595,
		height: 842,
		margins: { top: 72, right: 60, bottom: 50, left: 72 },
	},
	blocks: [
		{
			kind: 'para',
			id: 'a',
			style: 'title',
			props: { align: 'centre' },
			runs: [{ text: 'Title {x} \\ y', props: {} }],
			dir: 'ltr',
		},
		{
			kind: 'para',
			id: 'b',
			style: 'h1',
			props: { spaceBefore: 4 },
			runs: [
				{ text: 'Grüße ', props: { bold: false } },
				{ text: '€ 😀', props: { font: 'cmu-serif' } },
			],
			dir: 'ltr',
		},
		{
			kind: 'para',
			id: 'c',
			style: 'body',
			props: {
				align: 'justify',
				lineSpacing: 1.5,
				indent: 18,
				firstLine: -9,
				spaceAfter: 0,
			},
			runs: [
				{ text: 'plain ', props: {} },
				{
					text: 'all',
					props: {
						bold: true,
						italic: true,
						underline: true,
						strike: true,
						size: 14.5,
					},
				},
				{ text: '2', props: { script: 'super' } },
				{
					text: 'col',
					props: {
						colour: '#ff0000',
						highlight: '#ffff00',
						font: 'ibm-plex-mono',
					},
				},
				{ text: 'j', props: { font: 'jost' } },
				{ text: 'o', props: { font: 'oswald' } },
				{ text: 'i', props: { font: 'inter' } },
				{ text: 's', props: { font: 'cmu-sans' } },
				{
					text: 't',
					props: { font: 'cmu-typewriter' },
				},
			],
			dir: 'ltr',
		},
		{
			kind: 'para',
			id: 'd',
			style: 'body',
			props: { list: { kind: 'number', level: 0 } },
			runs: [{ text: 'one', props: {} }],
			dir: 'ltr',
		},
		{
			kind: 'para',
			id: 'e',
			style: 'body',
			props: { list: { kind: 'bullet', level: 1 } },
			runs: [{ text: 'sub', props: { script: 'sub' } }],
			dir: 'ltr',
		},
		{ kind: 'break', id: 'f' },
		{
			kind: 'para',
			id: 'g',
			style: 'quote',
			props: {},
			runs: [{ text: '', props: {} }],
			dir: 'ltr',
		},
		{
			kind: 'para',
			id: 'h',
			style: 'caption',
			props: {},
			runs: [{ text: 'cap', props: {} }],
			dir: 'ltr',
		},
		{
			kind: 'para',
			id: 'i',
			style: 'h3',
			props: {},
			runs: [{ text: 'h3', props: {} }],
			dir: 'ltr',
		},
	],
};

module('Unit | errata | write | rtf', function () {
	test('reads Word 2000 output', function (assert) {
		const doc = rtfToDoc(WORD, 'Report');
		assert.strictEqual(doc.name, 'Report');
		const { header, ...page } = doc.setup;
		assert.deepEqual(page, {
			width: 595.3,
			height: 841.9,
			margins: { top: 72, right: 90, bottom: 72, left: 90 },
		});
		assert.deepEqual(header?.map(text), ['Header text']);
		assert.deepEqual(doc.blocks.map(text), [
			'Grüße aus März',
			'Price: 5 € or € here, bold and redmarkedlink.',
			'First item',
			'Second item',
			'code',
			null,
			'After break',
		]);
		const [h1, body, li] = doc.blocks as Paragraph[];
		assert.strictEqual(h1!.style, 'h1');
		assert.deepEqual(h1!.props, { spaceBefore: 12, spaceAfter: 3 });
		assert.deepEqual(h1!.runs[0]!.props, {
			font: 'inter',
			size: 16,
		});
		assert.deepEqual(body!.props, {});
		assert.deepEqual(
			body!.runs.map((r) => r.props),
			[
				{ size: 12 },
				{ size: 12, bold: true },
				{ size: 12 },
				{ size: 12, colour: '#ff0000' },
				{ size: 12, highlight: '#ffff00' },
				{
					size: 12,
					underline: true,
					link: 'https://example.com/',
				},
				{ size: 12 },
			],
		);
		assert.deepEqual(li!.props, {
			spaceAfter: 0,
			indent: 36,
			firstLine: -18,
			list: { kind: 'bullet', level: 0 },
		});
		assert.deepEqual((doc.blocks[4] as Paragraph).runs[0]!.props, {
			font: 'ibm-plex-mono',
			size: 12,
		});
	});

	test('reads TextEdit output', function (assert) {
		const doc = rtfToDoc(TEXTEDIT, 't');
		assert.deepEqual(doc.blocks.map(text), [
			'Centred café',
			'Tab    here blue €x',
			'Dot',
			'Dot two',
			'One',
			'',
			'Mono',
		]);
		const p = doc.blocks as Paragraph[];
		assert.deepEqual(p[0]!.props, {
			align: 'centre',
			spaceAfter: 0,
		});
		assert.deepEqual(p[0]!.runs[0]!.props, {
			font: 'inter',
			size: 12,
		});
		assert.deepEqual(p[1]!.runs[1], {
			text: 'blue',
			props: { font: 'inter', size: 12, colour: '#0000ff' },
		});
		assert.deepEqual(
			p.slice(2, 5).map((b) => b.props.list),
			[
				{ kind: 'bullet', level: 0 },
				{ kind: 'bullet', level: 0 },
				{ kind: 'number', level: 0 },
			],
		);
		assert.deepEqual(p[5]!.runs, [{ text: '', props: {} }]);
		assert.strictEqual(p[6]!.runs[0]!.props.font, 'ibm-plex-mono');
		assert.deepEqual(doc.setup.width, 595);
	});

	test('rejects non-RTF input', function (assert) {
		assert.throws(() => rtfToDoc('hello', 'x'), RtfError);
		assert.throws(() => rtfToDoc('', 'x'), RtfError);
		assert.throws(
			() =>
				rtfToDoc(
					'{\\rtf1 ' +
						' '.repeat(33 * 1024 * 1024),
					'x',
				),
			RtfError,
		);
	});

	test('garbage and unbalanced braces do not throw', function (assert) {
		const junk = [
			'{\\rtf1 a}}}} b {{{ c',
			'{\\rtf1 \\u-99999999999 \\bin99999999999 x',
			"{\\rtf1 \\'zz\\'4\\\\\\",
			'{\\rtf1 \u0000\u0001\u0007 \\fs-4\\f999\\cf999\\s999 x\\par}',
			'{\\rtf1{\\fonttbl\\f0 ;;;}{\\colortbl\\red999;}\\paperw-5\\margl99999999 x}',
			'{\\rtf1\\' + 'a'.repeat(1000) + '1234567890123 y}',
		];
		for (const src of junk) {
			const doc = rtfToDoc(src, 'x');
			assert.ok(doc.blocks.length >= 1, src.slice(0, 30));
		}
		assert.strictEqual(
			text(rtfToDoc('{\\rtf1 a}}}} b {{{ c', 'x').blocks[0]),
			'a b  c',
		);
		assert.strictEqual(rtfToDoc('{\\rtf1 }', 'x').blocks.length, 1);
	});

	test('deep nesting', function (assert) {
		const n = 200_000;
		const doc = rtfToDoc(
			'{\\rtf1 ' +
				'{'.repeat(n) +
				'deep' +
				'}'.repeat(n) +
				'}',
			'x',
		);
		assert.strictEqual(text(doc.blocks[0]), 'deep');
	});

	test('round trip', function (assert) {
		const rtf = docToRtf(DOC);
		assert.ok(rtf.startsWith('{\\rtf1\\ansi\\ansicpg1252\\deff0'));
		assert.ok(rtf.includes('{\\s1 heading 1;}'));
		// eslint-disable-next-line no-control-regex
		assert.notOk(/[^\x00-\x7f]/.test(rtf));
		const back = rtfToDoc(rtf, 'Notes');
		assert.deepEqual(back.setup, DOC.setup);
		assert.deepEqual(strip(back), strip(DOC));
	});

	test('vertical alignment round trips', function (assert) {
		const setup = { ...DOC.setup, valign: 'bottom' as const };
		assert.deepEqual(
			rtfToDoc(docToRtf({ ...DOC, setup }), 'Notes').setup,
			setup,
		);
	});

	test('links round trip', function (assert) {
		const link = {
			link: 'https://example.com/a?b=1',
			underline: true,
			colour: '#0563c1',
		};
		const doc: WriteDoc = {
			...DOC,
			blocks: [
				{
					kind: 'para',
					id: 'l',
					style: 'body',
					props: {},
					runs: [
						{ text: 'see ', props: {} },
						{ text: 'here', props: link },
						{
							text: ' bold',
							props: {
								...link,
								bold: true,
							},
						},
					],
					dir: 'ltr',
				},
			],
		};
		const rtf = docToRtf(doc);
		assert.ok(
			rtf.includes(
				'{\\field{\\*\\fldinst HYPERLINK "https://example.com/a?b=1"}{\\fldrslt ',
			),
		);
		assert.deepEqual(strip(rtfToDoc(rtf, 'Notes')), strip(doc));
		const bad = rtfToDoc(
			String.raw`{\rtf1 {\field{\*\fldinst HYPERLINK "javascript:x"}{\fldrslt bad}}}`,
			'x',
		);
		const [run] = (bad.blocks[0] as Paragraph).runs;
		assert.strictEqual(run!.text, 'bad');
		assert.strictEqual(run!.props.link, undefined);
	});

	test('raw high bytes use the code page', function (assert) {
		const bytes = new Uint8Array([
			...new TextEncoder().encode(
				String.raw`{\rtf1\ansi\ansicpg1251 `,
			),
			0xcf,
			0xf0,
			0xe8,
			0xe2,
			0xe5,
			0xf2,
			...new TextEncoder().encode(String.raw` \'e8}`),
		]);
		const doc = rtfToDoc(byteString(bytes), 'x');
		assert.strictEqual(text(doc.blocks[0]), 'Привет и');
	});

	test('200k paragraphs open', function (assert) {
		const doc = rtfToDoc(
			'{\\rtf1 ' + 'a\\par '.repeat(200000) + '}',
			'x',
		);
		assert.strictEqual(
			applySuggestedHeadings(doc).blocks.length,
			doc.blocks.length,
		);
	});

	test('a file cut off inside a header keeps the body', function (assert) {
		const doc = rtfToDoc(
			String.raw`{\rtf1\ansi Hello{\header Head`,
			'x',
		);
		assert.deepEqual(
			doc.blocks.map((b) => (b as Paragraph).runs[0]!.text),
			['Hello'],
		);
		assert.strictEqual(
			doc.setup.header?.[0]?.runs[0]?.text,
			'Head',
		);
	});
});
