import { module, test } from 'qunit';
import {
	BORDER_PAD,
	fieldDate,
	layoutDoc,
	type Resolver,
} from 'delphitools-v2/lib/errata/write/layout';
import {
	caretRect,
	hitTest,
	moveVertical,
	selectionRects,
} from 'delphitools-v2/lib/errata/write/geometry';
import {
	buildHyphenator,
	ensureHyphenator,
	hyphenatorFor,
} from 'delphitools-v2/lib/errata/write/hyphenate';
import {
	caret,
	insertField,
	insertSectionBreak,
	insertText,
	newDoc,
	sectionIndex,
	sectionSetup,
} from 'delphitools-v2/lib/errata/write/model';
import {
	copy,
	editState,
	insertField as insertFieldCommand,
	inner,
	keydown,
	leaveInner,
	paste,
	sectionBreak,
	selectRange,
	storyDoubleClick,
	type StoryEdit,
	typeText,
} from 'delphitools-v2/lib/errata/write/editor';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import {
	FIELD_CHAR,
	SOFT_HYPHEN,
	type Block,
	type FieldKind,
	type Metrics,
	type Paragraph,
	type ParaProps,
	type ResolvedChar,
	type ResolvedPara,
	type SectionBreak,
	type Setup,
	type StyleId,
	type WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

// 5pt chars, 12pt lines
const fake: Metrics = { pick: () => ({ file: 'f', advance: 0.5 }) };

const resolver: Resolver = {
	char: (_p, run): ResolvedChar => ({
		font: 'inter',
		size: 10,
		bold: false,
		italic: false,
		underline: false,
		strike: false,
		colour: '#000000',
		...run.props,
	}),
	para: (p): ResolvedPara => ({
		align: 'left',
		lineSpacing: 1,
		spaceBefore: 0,
		spaceAfter: 0,
		indent: 0,
		firstLine: 0,
		...(p.style === 'h1' ? { keepNext: true } : {}),
		...p.props,
	}),
};

let ids = 0;
const para = (
	text: string,
	props: ParaProps = {},
	style: StyleId = 'body',
): Paragraph => ({
	kind: 'para',
	id: `p${ids++}`,
	style,
	props,
	runs: [{ text, props: {} }],
	dir: 'ltr',
});

const field = (kind: FieldKind, before = ''): Paragraph => ({
	...para(before),
	runs: [
		{ text: before, props: {} },
		{ text: FIELD_CHAR, props: { field: kind } },
	],
});

// 4 lines, 90pt columns
const SETUP: Setup = {
	width: 210,
	height: 68,
	margins: { top: 10, right: 10, bottom: 10, left: 10 },
};

const docOf = (
	blocks: Block[],
	setup: Partial<Setup> = {},
	extra: Partial<WriteDoc> = {},
): WriteDoc => ({
	version: 1,
	name: 'Report',
	setup: { ...SETUP, ...setup },
	blocks,
	...extra,
});

const lay = (doc: WriteDoc, hyph = null as Parameters<typeof layoutDoc>[3]) =>
	layoutDoc(doc, fake, resolver, hyph);

const lines = (n: number, text = 'aaaa') =>
	Array.from({ length: n }, () => para(text));

const cols = { columns: 2, gutter: 10 };

module('Unit | errata | write | sections', function () {
	test('text flows column by column', function (assert) {
		const { pages } = lay(docOf(lines(10), cols));
		assert.strictEqual(pages.length, 2);
		const p0 = pages[0]!;
		assert.deepEqual(p0.cols, [
			{ left: 10, width: 90 },
			{ left: 110, width: 90 },
		]);
		assert.deepEqual(
			p0.lines.map((l) => [l.col, l.left, l.top]),
			[
				[0, 10, 10],
				[0, 10, 22],
				[0, 10, 34],
				[0, 10, 46],
				[1, 110, 10],
				[1, 110, 22],
				[1, 110, 34],
				[1, 110, 46],
			],
		);
		assert.strictEqual(p0.lines[4]!.spans[0]!.xs[0], 110);
	});

	test('the last page balances its columns', function (assert) {
		const { pages } = lay(docOf(lines(10), cols));
		assert.deepEqual(
			pages[1]!.lines.map((l) => [l.col, l.top]),
			[
				[0, 10],
				[1, 10],
			],
		);
		const one = lay(docOf(lines(5), cols)).pages;
		assert.strictEqual(one.length, 1);
		assert.deepEqual(
			one[0]!.lines.map((l) => l.col),
			[0, 0, 0, 1, 1],
		);
	});

	test('a column break moves to the next column and skips balancing', function (assert) {
		const blocks: Block[] = [
			para('a'),
			{ kind: 'column', id: 'c' },
			para('b'),
			para('c'),
		];
		const { pages } = lay(docOf(blocks, cols));
		assert.strictEqual(pages.length, 1);
		assert.deepEqual(
			pages[0]!.lines.map((l) => [l.block, l.col, l.kind]),
			[
				[0, 0, undefined],
				[1, 0, 'break'],
				[2, 1, undefined],
				[3, 1, undefined],
			],
		);
	});

	test('a section break starts a new page with its own setup', function (assert) {
		const blocks: Block[] = [
			para('a'),
			{
				kind: 'section',
				id: 's',
				setup: { ...SETUP, width: 300, columns: 3 },
			},
			para('b'),
		];
		const doc = docOf(blocks);
		const { pages } = lay(doc);
		assert.strictEqual(pages.length, 2);
		assert.deepEqual(
			pages.map((p) => [p.width, p.section, p.sectionBlock]),
			[
				[210, 0, -1],
				[300, 1, 1],
			],
		);
		assert.strictEqual(pages[0]!.lines[1]!.kind, 'break');
		assert.strictEqual(pages[1]!.cols.length, 3);
		assert.deepEqual(
			[0, 1, 2].map((b) => sectionIndex(doc, b)),
			[0, 0, 1],
		);
		assert.strictEqual(sectionSetup(doc, 2).width, 300);
		assert.strictEqual(sectionSetup(doc, 1).width, 210);
	});

	test('insertSectionBreak copies the caret section', function (assert) {
		const doc = docOf([para('abcd')], cols);
		const { doc: next, sel } = insertSectionBreak(
			doc,
			caret({ block: 0, offset: 2 }),
		);
		assert.deepEqual(
			next.blocks.map((b) => b.kind),
			['para', 'section', 'para'],
		);
		assert.strictEqual(sectionSetup(next, 2).columns, 2);
		assert.deepEqual(sel.focus, { block: 2, offset: 0 });
	});

	test('headers and footers sit in the margins; first page differs', function (assert) {
		const doc = docOf(
			lines(6, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
			{
				margins: {
					top: 30,
					right: 10,
					bottom: 30,
					left: 10,
				},
				height: 108,
				header: [para('H')],
				footer: [para('F')],
				titlePage: true,
				firstHeader: [para('First')],
			},
		);
		const { pages } = lay(doc);
		assert.strictEqual(pages.length, 2);
		const [p0, p1] = pages;
		assert.deepEqual(
			[p0!.headerPart, p0!.footerPart, p1!.headerPart],
			['firstHeader', 'firstFooter', 'header'],
		);
		assert.strictEqual(p0!.header[0]!.spans[0]!.text, 'First');
		assert.strictEqual(p0!.header[0]!.top, 15);
		assert.strictEqual(p1!.header[0]!.spans[0]!.text, 'H');
		assert.strictEqual(p1!.footer[0]!.top, 108 - 15 - 12);
		assert.strictEqual(p0!.footer[0]!.spans[0]!.text, '');
	});

	test('fields resolve per page with numbering and restart', function (assert) {
		const footer = [field('page', 'p '), field('pages')];
		// room for the footer
		const height = 93;
		const blocks: Block[] = [
			...lines(5),
			{
				kind: 'section',
				id: 's',
				setup: {
					...SETUP,
					height,
					footer,
					numbering: 'ROMAN',
					restart: 1,
				},
			},
			...lines(5),
			field('section'),
		];
		const doc = docOf(blocks, { footer, height });
		const { pages } = lay(doc);
		assert.deepEqual(
			pages.map((p) => p.label),
			['1', '2', 'I', 'II'],
		);
		const shown = (i: number, line: number) =>
			pages[i]!.footer[line]!.spans.find((s) => s.shown)
				?.shown;
		assert.deepEqual(
			[0, 1, 2, 3].map((i) => shown(i, 0)),
			['1', '2', 'I', 'II'],
		);
		assert.strictEqual(shown(3, 1), '4');
		const sec = pages[3]!.lines.at(-1)!.spans[0]!;
		assert.strictEqual(sec.shown, '2');
		const ii = pages[3]!.footer[0]!.spans.at(-1)!;
		assert.deepEqual(ii.shownXs, [20, 25, 30]);
		assert.deepEqual(ii.xs, [20, 30]);
		const roman = lay(
			docOf(lines(1), { numbering: 'roman', restart: 4 }),
		).pages[0]!;
		assert.strictEqual(roman.label, 'iv');
		const alpha = lay(
			docOf(lines(1), { numbering: 'alpha', restart: 28 }),
		).pages[0]!;
		assert.strictEqual(alpha.label, 'ab');
	});

	test('date and title fields use the document', function (assert) {
		const created = '2026-03-04T12:00:00.000Z';
		const doc = docOf(
			[field('date'), field('title')],
			{},
			{ created },
		);
		const [d, t] = lay(doc).pages[0]!.lines;
		assert.strictEqual(
			d!.spans[0]!.shown,
			fieldDate(created, 'en'),
		);
		assert.ok(d!.spans[0]!.shown!.includes('2026'));
		assert.strictEqual(t!.spans[0]!.shown, 'Report');
		assert.ok(
			fieldDate(created, 'de').includes('März'),
			fieldDate(created, 'de'),
		);
	});

	test('a field is one character in the model', function (assert) {
		const doc = docOf([para('ab')]);
		const { doc: next, sel } = insertField(
			doc,
			caret({ block: 0, offset: 1 }),
			'page',
			{ bold: true },
		);
		const p = next.blocks[0] as Paragraph;
		assert.deepEqual(
			p.runs.map((r) => [r.text, r.props.field]),
			[
				['a', undefined],
				[FIELD_CHAR, 'page'],
				['b', undefined],
			],
		);
		assert.deepEqual(sel.focus, { block: 0, offset: 2 });
		const typed = insertText(next, sel, 'x').doc
			.blocks[0] as Paragraph;
		assert.deepEqual(
			typed.runs.map((r) => [r.text, r.props]),
			[
				['a', {}],
				[FIELD_CHAR, { bold: true, field: 'page' }],
				['x', { bold: true }],
				['b', {}],
			],
		);
	});

	test('borders and shading merge across equal paragraphs', function (assert) {
		const box = {
			top: { width: 1, colour: '#000000' },
			bottom: { width: 1, colour: '#000000' },
		};
		const { pages } = lay(
			docOf([
				para('a', { border: box, shading: '#eeeeee' }),
				para('b', { border: box, shading: '#eeeeee' }),
				para('c', { border: { bottom: box.bottom } }),
				para('d'),
			]),
		);
		const [first, second] = pages[0]!.boxes;
		assert.strictEqual(pages[0]!.boxes.length, 2);
		// borders take space
		assert.deepEqual(
			pages[0]!.lines.slice(0, 3).map((l) => l.top),
			[10 + BORDER_PAD + 1, 22 + BORDER_PAD + 1, 42],
		);
		assert.deepEqual(first, {
			x: 10 - BORDER_PAD,
			y: 10,
			w: 190 + 2 * BORDER_PAD,
			h: 24 + 2 * BORDER_PAD + 2,
			fill: '#eeeeee',
			border: box,
		});
		assert.deepEqual(
			[second!.y, second!.h, second!.fill],
			[42 - BORDER_PAD, 12 + 2 * BORDER_PAD + 1, undefined],
		);
	});

	test('widow and orphan control', function (assert) {
		const long = 'a '.repeat(54);
		// orphan: lone first line
		let { pages } = lay(docOf([...lines(3), para(long)]));
		assert.deepEqual(
			pages.map((p) => p.lines.length),
			[3, 3],
		);
		// widow: lone last line
		({ pages } = lay(docOf([para('x'), para('a '.repeat(72))])));
		assert.deepEqual(
			pages.map((p) => p.lines.length),
			[3, 2],
		);
		({ pages } = lay(
			docOf([
				para('x'),
				para('a '.repeat(72), { widow: false }),
			]),
		));
		assert.deepEqual(
			pages.map((p) => p.lines.length),
			[4, 1],
		);
	});

	test('a heading keeps with the next paragraph', function (assert) {
		const { pages } = lay(
			docOf([
				...lines(3),
				para('Heading', {}, 'h1'),
				para('a '.repeat(36)),
			]),
		);
		assert.deepEqual(
			pages.map((p) => p.lines.map((l) => l.block)),
			[
				[0, 1, 2],
				[3, 4, 4],
			],
		);
	});

	test('geometry across columns', function (assert) {
		const layout = lay(docOf(lines(8), cols));
		const r = caretRect(layout, { block: 5, offset: 2 });
		assert.deepEqual([r.page, r.x, r.top], [0, 120, 22]);
		assert.deepEqual(hitTest(layout, 0, 121, 25).focus, {
			block: 5,
			offset: 2,
		});
		assert.deepEqual(hitTest(layout, 0, 21, 25).focus, {
			block: 1,
			offset: 2,
		});
		assert.deepEqual(
			moveVertical(layout, { block: 3, offset: 1 }, 1, 115)
				.focus,
			{ block: 4, offset: 1 },
		);
		const rects = selectionRects(
			layout,
			{ block: 3, offset: 0 },
			{ block: 4, offset: 4 },
		);
		assert.deepEqual(
			rects.map((x) => [x.x, x.y]),
			[
				[10, 46],
				[110, 10],
			],
		);
	});

	test('hyphenation breaks inside a word with a drawn hyphen', function (assert) {
		const hyph = (w: string) => (w === 'abcdefgh' ? [3] : []);
		const width = { width: 70 };
		const [a, b] = lay(docOf([para('xx abcdefgh')], width), hyph)
			.pages[0]!.lines;
		assert.deepEqual([a!.start, a!.end, b!.start], [0, 6, 6]);
		assert.strictEqual(a!.hyphen?.text, '-');
		assert.deepEqual(a!.hyphen?.xs, [40, 45]);
		const plain = lay(docOf([para('xx abcdefgh')], width)).pages[0]!
			.lines;
		assert.strictEqual(plain[0]!.end, 3);
		const centred = lay(
			docOf(
				[para('xx abcdefgh', { align: 'centre' })],
				width,
			),
			hyph,
		).pages[0]!.lines;
		assert.strictEqual(
			centred[0]!.end,
			3,
			'centred text is not hyphenated',
		);
		const justified = lay(
			docOf(
				[para('xx abcdefgh', { align: 'justify' })],
				width,
			),
			hyph,
		).pages[0]!.lines[0]!;
		assert.strictEqual(
			justified.hyphen!.xs[1],
			60,
			'justified to the edge',
		);
	});

	test('soft hyphens break and are invisible otherwise', function (assert) {
		const text = `xx abc${SOFT_HYPHEN}defgh`;
		const [a] = lay(docOf([para(text)], { width: 70 })).pages[0]!
			.lines;
		assert.deepEqual([a!.end, a!.hyphen?.text], [7, '-']);
		const [whole] = lay(docOf([para(text)])).pages[0]!.lines;
		assert.strictEqual(whole!.hyphen, undefined);
		const xs = whole!.spans[0]!.xs;
		assert.strictEqual(xs[7]! - xs[6]!, 0, 'zero width');
	});

	test('Liang patterns: exceptions, minimums, real languages', async function (assert) {
		const h = buildHyphenator('1ba 1na', 'ta-ble');
		assert.deepEqual(h('banana'), [2], 'three after');
		assert.deepEqual(h('table'), [2]);
		assert.deepEqual(h('bana'), [], 'shorter than five');
		await ensureHyphenator('en');
		await ensureHyphenator('de');
		assert.deepEqual(hyphenatorFor('en')!('hyphenation'), [2, 6]);
		assert.deepEqual(hyphenatorFor('en')!('associate'), [2, 4]);
		assert.deepEqual(
			hyphenatorFor('de')!('Silbentrennung'),
			[3, 6, 10],
		);
		assert.deepEqual(
			hyphenatorFor('de')!('Übergrößenträger'),
			[4, 7, 10, 13],
		);
	});

	test('header editing routes edits into the story', function (assert) {
		const doc = { ...newDoc('t'), blocks: [para('body')] };
		writeStore.open(doc);
		inner.set({
			kind: 'story',
			section: null,
			part: 'footer',
			page: 0,
			sel: caret({ block: 0, offset: 0 }),
		});
		typeText('Page ');
		insertFieldCommand('page');
		const s = writeStore.get()!;
		const footer = s.doc.setup.footer!;
		assert.deepEqual(
			footer[0]!.runs.map((r) => [r.text, r.props.field]),
			[
				['Page ', undefined],
				[FIELD_CHAR, 'page'],
			],
		);
		assert.strictEqual(
			(s.doc.blocks[0] as Paragraph).runs[0]!.text,
			'body',
		);
		assert.deepEqual(editState()!.sel.focus, {
			block: 0,
			offset: 6,
		});
		writeStore.undo();
		assert.deepEqual(
			writeStore
				.get()!
				.doc.setup.footer![0]!.runs.map((r) => r.text),
			['Page '],
		);
		leaveInner();
		assert.strictEqual(editState(), writeStore.get());
		writeStore.close();
	});

	test('a story follows its section break by id and ends with it', function (assert) {
		const s1: SectionBreak = {
			kind: 'section',
			id: 's1',
			setup: SETUP,
		};
		const s2: SectionBreak = {
			kind: 'section',
			id: 's2',
			setup: SETUP,
		};
		writeStore.open(
			docOf([para('a'), s1, para('b'), s2, para('c')]),
		);
		inner.set({
			kind: 'story',
			section: 's2',
			part: 'header',
			page: 2,
			sel: caret({ block: 0, offset: 0 }),
		});
		const cur = writeStore.get()!;
		writeStore.commit(
			{
				doc: {
					...cur.doc,
					blocks: cur.doc.blocks.filter(
						(b) => b !== s1,
					),
				},
				sel: cur.sel,
			},
			'other',
		);
		typeText('H');
		const blocks = writeStore.get()!.doc.blocks;
		assert.strictEqual(
			(blocks[2] as SectionBreak).setup.header?.[0]?.runs[0]
				?.text,
			'H',
			'edits the moved section',
		);
		assert.strictEqual(
			writeStore.get()!.doc.setup.header,
			undefined,
		);

		writeStore.open(docOf([para('a'), para('b')]));
		selectRange(caret({ block: 1, offset: 0 }));
		sectionBreak();
		const id = writeStore.get()!.doc.blocks[1]!.id;
		inner.set({
			kind: 'story',
			section: id,
			part: 'header',
			page: 1,
			sel: caret({ block: 0, offset: 0 }),
		});
		typeText('H');
		writeStore.undo();
		writeStore.undo();
		assert.strictEqual(inner.get(), null, 'undo ends the story');
		typeText('x');
		const doc = writeStore.get()!.doc;
		assert.deepEqual(
			doc.blocks.map((b) => (b as Paragraph).runs[0]!.text),
			['a', 'xb'],
		);
		assert.strictEqual(doc.setup.header, undefined);
		writeStore.close();
	});

	test('a tall header or footer moves the body', function (assert) {
		const doc = docOf(lines(8), {
			height: 108,
			header: [para('H1'), para('H2')],
			footer: [para('F')],
		});
		const { pages } = lay(doc);
		const p0 = pages[0]!;
		assert.deepEqual(
			[p0.header.at(-1)!.top + 12, p0.footer[0]!.top],
			[29, 91],
		);
		assert.deepEqual(
			[p0.content.top, p0.content.top + p0.content.height],
			[35, 85],
		);
		assert.deepEqual(
			p0.lines.map((l) => l.top),
			[35, 47, 59, 71],
		);
		writeStore.open(doc);
		assert.ok(storyDoubleClick(lay(doc), 0, 50, 32));
		assert.strictEqual(
			(inner.get() as StoryEdit | null)?.part,
			'header',
		);
		leaveInner();
		writeStore.close();
	});

	test('keep-with-next is dropped for a chain taller than a column', function (assert) {
		const { pages } = lay(
			docOf(
				Array.from({ length: 6 }, () =>
					para('a '.repeat(36), {
						keepNext: true,
					}),
				),
			),
		);
		assert.deepEqual(
			pages.map((p) => p.lines.length),
			[4, 4, 4],
		);
	});

	test('NUMPAGES settles after the field reflows the body', function (assert) {
		const blocks = Array.from({ length: 40 }, () =>
			field('pages', 'a'.repeat(37)),
		);
		const { pages } = lay(docOf(blocks));
		assert.strictEqual(pages.length, 20);
		const shown = pages
			.at(-1)!
			.lines.flatMap((l) => l.spans)
			.find((s) => s.shown)?.shown;
		assert.strictEqual(shown, '20');
	});

	test('fields draw in the face of their shown text', function (assert) {
		const metrics: Metrics = {
			pick: (_f, _b, _i, ch) => ({
				file: ch === FIELD_CHAR ? 'symbols' : 'f',
				advance: 0.5,
			}),
		};
		const { pages } = layoutDoc(
			docOf([field('page', 'p ')]),
			metrics,
			resolver,
		);
		const s = pages[0]!.lines[0]!.spans.find((x) => x.shown)!;
		assert.strictEqual(s.file, 'f');
	});

	test('a list paragraph border starts at the list indent', function (assert) {
		const border = { left: { width: 1, colour: '#000000' } };
		const { pages } = lay(
			docOf([
				para('a', {
					border,
					list: { kind: 'bullet', level: 0 },
				}),
			]),
		);
		assert.strictEqual(pages[0]!.boxes[0]!.x, 10 + 18 - BORDER_PAD);
	});

	test('pasting copied breaks into a story keeps paragraphs only', function (assert) {
		writeStore.open(
			docOf(
				[
					para('ab'),
					{ kind: 'break', id: 'k' },
					para('cd'),
				],
				{
					header: [para('XY')],
				},
			),
		);
		selectRange({
			anchor: { block: 0, offset: 0 },
			focus: { block: 2, offset: 2 },
		});
		const data = new DataTransfer();
		copy(data, false);
		inner.set({
			kind: 'story',
			section: null,
			part: 'header',
			page: 0,
			sel: caret({ block: 0, offset: 1 }),
		});
		paste(data);
		assert.deepEqual(
			writeStore
				.get()!
				.doc.setup.header!.map((p) => p.runs[0]!.text),
			['Xab', 'cdY'],
		);
		assert.deepEqual(editState()!.sel.focus, {
			block: 1,
			offset: 2,
		});
		leaveInner();
		writeStore.close();
	});

	test('story typing starts its own undo steps', function (assert) {
		const doc = docOf([para('b')]);
		writeStore.open(doc);
		selectRange(caret({ block: 0, offset: 1 }));
		typeText('a');
		assert.ok(storyDoubleClick(lay(doc), 0, 50, 2));
		typeText('ab');
		keydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), {
			pages: [],
		});
		typeText('c');
		writeStore.undo();
		const s = writeStore.get()!;
		assert.strictEqual(
			s.doc.setup.header?.[0]?.runs[0]?.text,
			'ab',
		);
		writeStore.undo();
		assert.strictEqual(
			(writeStore.get()!.doc.blocks[0] as Paragraph).runs[0]!
				.text,
			'ba',
			'body typing kept',
		);
		leaveInner();
		writeStore.close();
	});
});
