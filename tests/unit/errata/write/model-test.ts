import { module, test } from 'qunit';
import {
	applyChar,
	applyPara,
	applySuggestedHeadings,
	normaliseLink,
	suggestHeading,
	clampMargins,
	caretProps,
	wordAt,
	caret,
	clearFormatting,
	contentsOf,
	commonChar,
	deleteBackward,
	deleteForward,
	deleteSel,
	indent,
	insertBlocks,
	insertPageBreak,
	insertText,
	newDoc,
	normalise,
	paraText,
	setStyle,
	sliceBlocks,
	splitParagraph,
	toggleList,
	toPlainText,
	wordBoundary,
} from 'delphitools-v2/lib/errata/write/model';
import type {
	Block,
	CharProps,
	Paragraph,
	Selection,
	StyleId,
	Toc,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';
import { FIELD_CHAR } from 'delphitools-v2/lib/errata/write/types';

function para(
	runs: [string, CharProps?][],
	style: StyleId = 'body',
): Paragraph {
	return {
		kind: 'para',
		id: crypto.randomUUID(),
		style,
		props: {},
		runs: runs.map(([text, props]) => ({
			text,
			props: props ?? {},
		})),
		dir: 'ltr',
	};
}

function doc(...blocks: Block[]): WriteDoc {
	return { ...newDoc('t'), blocks };
}

const brk = (): Block => ({ kind: 'break', id: crypto.randomUUID() });

const at = (block: number, offset: number): Selection =>
	caret({ block, offset });

const span = (b1: number, o1: number, b2: number, o2: number): Selection => ({
	anchor: { block: b1, offset: o1 },
	focus: { block: b2, offset: o2 },
});

function texts(d: WriteDoc): string[] {
	return d.blocks.map((b) => (b.kind === 'para' ? paraText(b) : '<br>'));
}

function p(d: WriteDoc, i: number): Paragraph {
	return d.blocks[i] as Paragraph;
}

module('Unit | errata | write | model', function () {
	test('newDoc is A4 with one empty body paragraph', function (assert) {
		const d = newDoc('x');
		assert.deepEqual(
			[d.setup.width, d.setup.height].map((n) =>
				n.toFixed(2),
			),
			['595.28', '841.89'],
		);
		assert.strictEqual(d.setup.margins.left, 72);
		assert.deepEqual(texts(d), ['']);
		assert.strictEqual(p(d, 0).style, 'body');
		assert.strictEqual(p(d, 0).runs.length, 1);
	});

	test('insertText takes the props before the caret', function (assert) {
		const d = doc(para([['ab', { bold: true }], ['cd']]));
		const r = insertText(d, at(0, 2), 'X');
		assert.deepEqual(texts(r.doc), ['abXcd']);
		assert.deepEqual(p(r.doc, 0).runs[0], {
			text: 'abX',
			props: { bold: true },
		});
		assert.deepEqual(r.sel, at(0, 3));
		const s = insertText(d, at(0, 0), 'Y');
		assert.deepEqual(p(s.doc, 0).runs[0], {
			text: 'Yab',
			props: { bold: true },
		});
		const e = insertText(d, at(0, 2), 'Z', { italic: true });
		assert.deepEqual(p(e.doc, 0).runs[1], {
			text: 'Z',
			props: { italic: true },
		});
	});

	test('insertText replaces a selection across paragraphs', function (assert) {
		const d = doc(para([['hello']]), para([['world']]));
		const r = insertText(d, span(1, 2, 0, 2), '-');
		assert.deepEqual(texts(r.doc), ['he-rld']);
		assert.deepEqual(r.sel, at(0, 3));
	});

	test('insertText with newlines splits paragraphs', function (assert) {
		const d = doc(para([['abcd']], 'quote'));
		const r = insertText(d, at(0, 2), 'x\ny\r\nz');
		assert.deepEqual(texts(r.doc), ['abx', 'y', 'zcd']);
		assert.deepEqual(r.sel, at(2, 1));
		assert.ok(
			r.doc.blocks.every(
				(b) => (b as Paragraph).style === 'quote',
			),
		);
		assert.strictEqual(
			new Set(r.doc.blocks.map((b) => b.id)).size,
			3,
		);
	});

	test('unchanged blocks are reused', function (assert) {
		const d = doc(para([['a']]), para([['b']]));
		const r = insertText(d, at(1, 1), 'c');
		assert.strictEqual(r.doc.blocks[0], d.blocks[0]);
		assert.notStrictEqual(r.doc.blocks[1], d.blocks[1]);
		assert.deepEqual(texts(d), ['a', 'b'], 'input untouched');
	});

	test('deleteBackward merges at paragraph start', function (assert) {
		const d = doc(
			para([['ab', { bold: true }]], 'h1'),
			para([['cd']]),
		);
		const r = deleteBackward(d, at(1, 0), 'char');
		assert.deepEqual(texts(r.doc), ['abcd']);
		assert.strictEqual(p(r.doc, 0).style, 'h1');
		assert.strictEqual(p(r.doc, 0).runs.length, 2);
		assert.deepEqual(r.sel, at(0, 2));
		const first = deleteBackward(d, at(0, 0), 'char');
		assert.strictEqual(first.doc, d, 'no-op at doc start');
	});

	test('deleteForward merges at paragraph end', function (assert) {
		const d = doc(para([['ab']]), para([['cd']]));
		const r = deleteForward(d, at(0, 2), 'char');
		assert.deepEqual(texts(r.doc), ['abcd']);
		assert.deepEqual(r.sel, at(0, 2));
		assert.strictEqual(deleteForward(d, at(1, 2), 'char').doc, d);
	});

	test('page breaks delete as one unit', function (assert) {
		const d = doc(para([['a']]), brk(), para([['b']]));
		const back = deleteBackward(d, at(2, 0), 'char');
		assert.deepEqual(texts(back.doc), ['a', 'b']);
		assert.deepEqual(back.sel, at(1, 0));
		const fwd = deleteForward(d, at(0, 1), 'char');
		assert.deepEqual(texts(fwd.doc), ['a', 'b']);
		assert.deepEqual(fwd.sel, at(0, 1));
		const on = deleteBackward(d, at(1, 0), 'char');
		assert.deepEqual(texts(on.doc), ['a', 'b']);
		assert.deepEqual(on.sel, at(0, 1));
		const onFwd = deleteForward(d, at(1, 0), 'char');
		assert.deepEqual(onFwd.sel, at(1, 0));
		const range = deleteSel(d, span(0, 1, 2, 0));
		assert.deepEqual(texts(range.doc), ['ab']);
	});

	test('char deletes never split a surrogate pair', function (assert) {
		const d = doc(para([['a😀b']]));
		const back = deleteBackward(d, at(0, 3), 'char');
		assert.deepEqual(texts(back.doc), ['ab']);
		assert.deepEqual(back.sel, at(0, 1));
		const fwd = deleteForward(d, at(0, 1), 'char');
		assert.deepEqual(texts(fwd.doc), ['ab']);
	});

	test('word deletes use word boundaries', function (assert) {
		const d = doc(para([['one two  three']]));
		const back = deleteBackward(d, at(0, 9), 'word');
		assert.deepEqual(texts(back.doc), ['one three']);
		const fwd = deleteForward(d, at(0, 3), 'word');
		assert.deepEqual(texts(fwd.doc), ['one  three']);
		assert.strictEqual(wordBoundary('one two', 5, -1), 4);
		assert.strictEqual(wordBoundary('one two', 3, 1), 7);
		assert.strictEqual(wordBoundary('  ', 2, -1), 0);
		assert.strictEqual(wordBoundary('  ', 0, 1), 2);
	});

	test('splitParagraph uses next style and keeps list', function (assert) {
		const h = doc(para([['Head', { colour: '#ff0000' }]], 'h1'));
		const r = splitParagraph(h, at(0, 4));
		assert.deepEqual(texts(r.doc), ['Head', '']);
		assert.strictEqual(p(r.doc, 1).style, 'body');
		assert.deepEqual(p(r.doc, 1).runs[0]!.props, {
			colour: '#ff0000',
		});
		assert.deepEqual(r.sel, at(1, 0));
		const start = splitParagraph(h, at(0, 0));
		assert.deepEqual(texts(start.doc), ['', 'Head']);
		assert.strictEqual(p(start.doc, 1).style, 'h1');

		const list = para([['item']]);
		list.props = {
			list: { kind: 'bullet', level: 1 },
			align: 'centre',
		};
		const l = splitParagraph(doc(list), at(0, 2));
		assert.deepEqual(texts(l.doc), ['it', 'em']);
		assert.deepEqual(p(l.doc, 1).props, list.props);
		const empty = splitParagraph(l.doc, at(1, 0));
		assert.strictEqual(empty.doc.blocks.length, 3);
		const out = splitParagraph(
			doc({ ...list, runs: [{ text: '', props: {} }] }),
			at(0, 0),
		);
		assert.strictEqual(
			out.doc.blocks.length,
			1,
			'empty item leaves list',
		);
		assert.strictEqual(p(out.doc, 0).props.list, undefined);
	});

	test('insertPageBreak splits and inserts', function (assert) {
		const d = doc(para([['abcd']]));
		const r = insertPageBreak(d, at(0, 2));
		assert.deepEqual(texts(r.doc), ['ab', '<br>', 'cd']);
		assert.deepEqual(r.sel, at(2, 0));
		const s = insertPageBreak(d, at(0, 0));
		assert.deepEqual(texts(s.doc), ['<br>', 'abcd']);
		assert.deepEqual(s.sel, at(1, 0));
	});

	test('typing on a break adds a paragraph before it', function (assert) {
		const d = doc(para([['a']]), brk());
		const r = insertText(d, at(1, 0), 'x');
		assert.deepEqual(texts(r.doc), ['a', 'x', '<br>']);
		assert.deepEqual(r.sel, at(1, 1));
	});

	test('enter on a break adds one paragraph', function (assert) {
		const d = doc(para([['a']]), brk());
		const r = splitParagraph(d, at(1, 0));
		assert.deepEqual(texts(r.doc), ['a', '', '<br>']);
		assert.deepEqual(r.sel, at(2, 0));
	});

	test('clampMargins keeps a content box', function (assert) {
		const s = clampMargins({
			width: 100,
			height: 50,
			margins: { top: 72, right: 72, bottom: 72, left: 10 },
		});
		assert.deepEqual(s.margins, {
			top: 0,
			right: 14,
			bottom: 0,
			left: 10,
		});
	});

	test('applyChar splits runs and clears with undefined', function (assert) {
		const d = doc(para([['abcdef']]));
		const r = applyChar(d, span(0, 4, 0, 2), { bold: true });
		assert.deepEqual(p(r.doc, 0).runs, [
			{ text: 'ab', props: {} },
			{ text: 'cd', props: { bold: true } },
			{ text: 'ef', props: {} },
		]);
		const c = applyChar(r.doc, span(0, 0, 0, 6), {
			bold: undefined,
		});
		assert.deepEqual(p(c.doc, 0).runs, [
			{ text: 'abcdef', props: {} },
		]);
		const multi = applyChar(
			doc(para([['ab']]), brk(), para([['cd']])),
			span(0, 1, 2, 1),
			{ italic: true },
		);
		assert.deepEqual(texts(multi.doc), ['ab', '<br>', 'cd']);
		assert.deepEqual(p(multi.doc, 0).runs[1], {
			text: 'b',
			props: { italic: true },
		});
		assert.deepEqual(p(multi.doc, 2).runs[0], {
			text: 'c',
			props: { italic: true },
		});
		assert.strictEqual(
			applyChar(d, at(0, 2), { bold: true }).doc,
			d,
		);
		const empty = applyChar(newDoc('x'), at(0, 0), { size: 14 });
		assert.deepEqual(p(empty.doc, 0).runs, [
			{ text: '', props: { size: 14 } },
		]);
	});

	test('commonChar reports shared resolved props', function (assert) {
		const d = doc(
			para([
				['ab', { bold: true }],
				['cd', { bold: true, italic: true }],
			]),
		);
		const all = commonChar(d, span(0, 0, 0, 4));
		assert.true(all.bold);
		assert.strictEqual(all.italic, undefined);
		assert.strictEqual(all.size, 11);
		assert.strictEqual(all.font, 'source-serif-4');
		assert.true(commonChar(d, at(0, 3)).italic);
		assert.false(commonChar(d, at(0, 2)).italic);
		const h = doc(para([['x']], 'h1'));
		assert.strictEqual(commonChar(h, at(0, 0)).size, 20);
	});

	test('applyPara, setStyle and clearFormatting', function (assert) {
		const d = doc(
			para([['a', { bold: true }]]),
			para([['b']]),
			para([['c']]),
		);
		const r = applyPara(d, span(0, 0, 1, 0), { align: 'centre' });
		assert.strictEqual(p(r.doc, 0).props.align, 'centre');
		assert.strictEqual(p(r.doc, 1).props.align, 'centre');
		assert.strictEqual(r.doc.blocks[2], d.blocks[2]);
		const s = setStyle(r.doc, at(0, 0), 'h2');
		assert.strictEqual(p(s.doc, 0).style, 'h2');
		assert.deepEqual(p(s.doc, 0).runs[0]!.props, { bold: true });
		const c = clearFormatting(s.doc, at(0, 0));
		assert.deepEqual(p(c.doc, 0).props, {});
		assert.deepEqual(p(c.doc, 0).runs, [{ text: 'a', props: {} }]);
		assert.strictEqual(p(c.doc, 0).style, 'h2');
	});

	test('toggleList and indent', function (assert) {
		const d = doc(para([['a']]), para([['b']]));
		const on = toggleList(d, span(0, 0, 1, 0), 'number');
		assert.deepEqual(p(on.doc, 0).props.list, {
			kind: 'number',
			level: 0,
		});
		assert.deepEqual(p(on.doc, 1).props.list, {
			kind: 'number',
			level: 0,
		});
		const deeper = indent(on.doc, at(1, 0), 1);
		assert.strictEqual(p(deeper.doc, 1).props.list!.level, 1);
		let max = deeper.doc;
		for (let i = 0; i < 9; i++) max = indent(max, at(1, 0), 1).doc;
		assert.strictEqual(p(max, 1).props.list!.level, 5);
		const off = toggleList(on.doc, span(0, 0, 1, 0), 'number');
		assert.false('list' in p(off.doc, 0).props);
		const swap = toggleList(on.doc, at(0, 0), 'bullet');
		assert.strictEqual(p(swap.doc, 0).props.list!.kind, 'bullet');

		const ind = indent(d, at(0, 0), 1);
		assert.strictEqual(p(ind.doc, 0).props.indent, 18);
		const back = indent(
			indent(ind.doc, at(0, 0), -1).doc,
			at(0, 0),
			-1,
		);
		assert.strictEqual(p(back.doc, 0).props.indent, 0);
		const quote = indent(doc(para([['q']], 'quote')), at(0, 0), 1);
		assert.strictEqual(p(quote.doc, 0).props.indent, 42);
	});

	test('normalise merges equal runs and keeps one empty run', function (assert) {
		const n = normalise(
			para([
				['a', { bold: true }],
				['', {}],
				['b', { bold: true }],
				['c'],
			]),
		);
		assert.deepEqual(n.runs, [
			{ text: 'ab', props: { bold: true } },
			{ text: 'c', props: {} },
		]);
		const e = normalise(para([['', { italic: true }], ['']]));
		assert.deepEqual(e.runs, [
			{ text: '', props: { italic: true } },
		]);
	});

	test('sliceBlocks and insertBlocks round trip', function (assert) {
		const d = doc(
			para([['abc', { bold: true }]], 'h1'),
			brk(),
			para([['def']]),
		);
		const frag = sliceBlocks(
			d,
			{ block: 0, offset: 1 },
			{ block: 2, offset: 2 },
		);
		assert.deepEqual(texts(doc(...frag)), ['bc', '<br>', 'de']);
		assert.strictEqual(toPlainText(frag), 'bc\nde');
		const target = doc(para([['XY']]));
		const r = insertBlocks(target, at(0, 1), frag);
		assert.deepEqual(texts(r.doc), ['Xbc', '<br>', 'deY']);
		assert.strictEqual(p(r.doc, 0).style, 'body');
		assert.deepEqual(r.sel, at(2, 2));
		assert.notStrictEqual(r.doc.blocks[1]!.id, d.blocks[1]!.id);
		const inline = insertBlocks(
			target,
			at(0, 1),
			sliceBlocks(
				d,
				{ block: 0, offset: 0 },
				{ block: 0, offset: 2 },
			),
		);
		assert.deepEqual(texts(inline.doc), ['XabY']);
		assert.deepEqual(inline.sel, at(0, 3));
	});
});

module('Unit | errata | write | headings and links', function () {
	const body = (text: string, props: CharProps = {}): Paragraph => ({
		...para([[text, props]]),
	});

	test('contentsOf leaves out the title, deep levels and, when asked, earlier headings', function (assert) {
		const toc: Toc = { kind: 'toc', id: 't', levels: 3 };
		const d = doc(
			para([['Cover']], 'title'),
			para([['Before']], 'h1'),
			toc,
			para([['One']], 'h1'),
			para([['Two']], 'h2'),
			para([['Body']]),
		);
		const list = (t: Toc) =>
			contentsOf(
				{
					...d,
					blocks: d.blocks.map((b) =>
						b === toc ? t : b,
					),
				},
				t,
			).map((e) => e.text);
		assert.deepEqual(list(toc), ['Before', 'One', 'Two']);
		assert.deepEqual(list({ ...toc, levels: 1 }), [
			'Before',
			'One',
		]);
		assert.deepEqual(list({ ...toc, after: true }), ['One', 'Two']);
	});

	test('suggestHeading', function (assert) {
		const d = doc(
			body('Introduction', { bold: true }),
			body('Some text follows here.'),
			body('Big title', { size: 22 }),
			body('More text.'),
			body('Subhead', { size: 15 }),
			body('Body.'),
			body('Minor', { bold: true }),
			body('Body.'),
			body('Ends with a stop.', { bold: true }),
			body('Body.'),
			body('Trailing', { bold: true }),
			body(''),
		);
		const got = d.blocks.map((_, i) => suggestHeading(d, i));
		assert.deepEqual(got, [
			'h3',
			null,
			'h1',
			null,
			'h2',
			null,
			'h3',
			null,
			null,
			null,
			null,
			null,
		]);
		const mixed = doc(
			para([['Half ', { bold: true }], ['plain']]),
			body('x'),
		);
		assert.strictEqual(suggestHeading(mixed, 0), null);
		const list = doc(
			{
				...body('Item', { bold: true }),
				props: { list: { kind: 'bullet', level: 0 } },
			},
			body('x'),
		);
		assert.strictEqual(suggestHeading(list, 0), null);
		const styled = doc(para([['Already']], 'h2'), body('x'));
		assert.strictEqual(suggestHeading(styled, 0), null);
		const long = doc(
			body(
				'one two three four five six seven eight nine ten eleven twelve thirteen',
				{ bold: true },
			),
			body('x'),
		);
		assert.strictEqual(suggestHeading(long, 0), null);
		const only = doc(body('Lonely', { bold: true }), body('x'));
		assert.strictEqual(
			suggestHeading(only, 0),
			'h1',
			'largest in the doc',
		);
	});

	test('applySuggestedHeadings', function (assert) {
		const d = doc(
			body('Big', { size: 20 }),
			body('Text.'),
			body('Small', { bold: true }),
			body('Text.'),
		);
		const out = applySuggestedHeadings(d);
		assert.deepEqual(
			out.blocks.map((b) =>
				b.kind === 'para' ? b.style : '',
			),
			['h1', 'body', 'h3', 'body'],
		);
		assert.strictEqual(out.blocks[1], d.blocks[1]);
		const none = doc(body('Text.'));
		assert.strictEqual(applySuggestedHeadings(none), none);
	});

	test('normaliseLink', function (assert) {
		assert.strictEqual(
			normaliseLink('example.com'),
			'https://example.com/',
		);
		assert.strictEqual(
			normaliseLink(' https://a.b/c?d=1 '),
			'https://a.b/c?d=1',
		);
		assert.strictEqual(normaliseLink('http://a.b'), 'http://a.b/');
		assert.strictEqual(
			normaliseLink('mailto:x@y.z'),
			'mailto:x@y.z',
		);
		assert.strictEqual(normaliseLink('x@y.z'), 'mailto:x@y.z');
		assert.strictEqual(normaliseLink('javascript:alert(1)'), null);
		assert.strictEqual(
			normaliseLink('java\tscript:alert(1)'),
			null,
		);
		assert.strictEqual(normaliseLink('data:text/html,x'), null);
		assert.strictEqual(normaliseLink('file:///etc/passwd'), null);
		assert.strictEqual(normaliseLink(''), null);
		assert.strictEqual(normaliseLink('https://'), null);
		assert.strictEqual(
			normaliseLink('example.com:8080/x'),
			'https://example.com:8080/x',
		);
		assert.strictEqual(
			normaliseLink('localhost:3000'),
			'https://localhost:3000/',
		);
		assert.strictEqual(
			normaliseLink(
				'mailto:x@y.z?subject=Hi%20there&cc=e@v.il&body=b',
			),
			'mailto:x@y.z?subject=Hi%20there',
		);
		assert.strictEqual(
			normaliseLink('mailto:x@y.z?bcc=e@v.il'),
			'mailto:x@y.z',
		);
	});
});

module('Unit | errata | write | link edges', function () {
	const LINK = {
		link: 'https://example.com/',
		underline: true,
		colour: '#0563c1',
	};

	test('caretProps drops a link only at its edge', function (assert) {
		const p = para([
			['a '],
			['si', LINK],
			['te', { ...LINK, bold: true }],
		]);
		assert.deepEqual(caretProps(p, 6), { bold: true });
		assert.deepEqual(caretProps(p, 2), {});
		assert.deepEqual(caretProps(p, 3), LINK);
		assert.deepEqual(caretProps(p, 4), LINK);
		assert.deepEqual(caretProps(para([['x', LINK]]), 0), {});
	});

	test('insertText takes raw props at a link end', function (assert) {
		const d = doc(para([['site', LINK]]));
		const next = insertText(d, at(0, 4), 'x');
		assert.deepEqual(p(next.doc, 0).runs, [
			{ text: 'sitex', props: LINK },
		]);
	});

	test('suggestions survive 200k paragraphs', function (assert) {
		const blocks = Array.from({ length: 200000 }, () =>
			para([['x']]),
		);
		const d: WriteDoc = { ...newDoc('t'), blocks };
		assert.strictEqual(suggestHeading(d, 0), null);
		assert.strictEqual(applySuggestedHeadings(d), d);
	});

	test('wordAt', function (assert) {
		const d = doc(para([['one two']]));
		assert.deepEqual(
			wordAt(d, { block: 0, offset: 5 }),
			span(0, 4, 0, 7),
		);
	});
});

module('Unit | errata | write | captions', function () {
	const figure = (): Block[] => [
		para([['Before']]),
		{
			...para([['']]),
			runs: [
				{
					text: FIELD_CHAR,
					props: {
						image: {
							id: 'i',
							w: 10,
							h: 10,
						},
					},
				},
			],
		},
		{
			...para([['']], 'caption'),
			runs: [
				{
					text: FIELD_CHAR,
					props: { field: 'figure' },
				},
				{ text: ' The map', props: {} },
			],
		},
		para([['After']]),
	];

	test('backspace after a caption moves into it without merging', function (assert) {
		const d = doc(...figure());
		const r = deleteBackward(
			d,
			caret({ block: 3, offset: 0 }),
			'char',
		);
		assert.deepEqual(texts(r.doc), texts(d));
		assert.deepEqual(r.sel.focus, { block: 2, offset: 9 });
	});

	test('the figure field and the image stay', function (assert) {
		const d = doc(...figure());
		for (const r of [
			deleteBackward(
				d,
				caret({ block: 2, offset: 1 }),
				'char',
			),
			deleteBackward(
				d,
				caret({ block: 2, offset: 0 }),
				'char',
			),
			deleteBackward(
				d,
				caret({ block: 2, offset: 9 }),
				'word',
			),
			deleteForward(
				d,
				caret({ block: 2, offset: 0 }),
				'char',
			),
			deleteForward(
				d,
				caret({ block: 2, offset: 9 }),
				'char',
			),
			deleteForward(
				d,
				caret({ block: 1, offset: 1 }),
				'char',
			),
		])
			assert.strictEqual(r.doc.blocks.length, 4);
		const word = deleteBackward(
			d,
			caret({ block: 2, offset: 9 }),
			'word',
		);
		assert.strictEqual(
			paraText(word.doc.blocks[2] as Paragraph),
			`${FIELD_CHAR} The `,
		);
	});

	test('enter in a caption starts body text after it', function (assert) {
		const d = doc(...figure());
		const r = splitParagraph(d, caret({ block: 2, offset: 4 }));
		assert.deepEqual(texts(r.doc).slice(2, 4), [
			`${FIELD_CHAR} The map`,
			'',
		]);
		assert.strictEqual(
			(r.doc.blocks[3] as Paragraph).style,
			'body',
		);
		assert.deepEqual(r.sel.focus, { block: 3, offset: 0 });
	});
});
