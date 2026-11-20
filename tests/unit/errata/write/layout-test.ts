import { module, test } from 'qunit';
import {
	layoutDoc,
	type Resolver,
} from 'delphitools-v2/lib/errata/write/layout';
import {
	caretRect,
	hitTest,
	lineRange,
	moveVertical,
	selectionRects,
} from 'delphitools-v2/lib/errata/write/geometry';
import { keydown, typeText } from 'delphitools-v2/lib/errata/write/editor';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import {
	browserMetrics,
	cssFamily,
	ensureFonts,
	filesForFamilies,
	fontBytes,
} from 'delphitools-v2/lib/errata/write/fonts';
import {
	ensureHyphenator,
	hyphenatorFor,
} from 'delphitools-v2/lib/errata/write/hyphenate';
import { FIELD_CHAR } from 'delphitools-v2/lib/errata/write/types';
import type {
	Block,
	Metrics,
	Paragraph,
	ParaProps,
	ResolvedChar,
	ResolvedPara,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

// 0.5 em per character
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
		// older tests predate it
		widow: false,
		...p.props,
	}),
};

let ids = 0;
const para = (text: string, props: ParaProps = {}): Block => ({
	kind: 'para',
	id: `p${ids++}`,
	style: 'body',
	props,
	runs: [{ text, props: {} }],
	dir: 'ltr',
});
const brk = (): Block => ({ kind: 'break', id: `b${ids++}` });

// box x 10..90, y 10..46
const docOf = (blocks: Block[]): WriteDoc => ({
	version: 1,
	name: 't',
	setup: {
		width: 100,
		height: 56,
		margins: { top: 10, right: 10, bottom: 10, left: 10 },
	},
	blocks,
});
const lay = (blocks: Block[], metrics = fake) =>
	layoutDoc(docOf(blocks), metrics, resolver);

const ranges = (blocks: Block[]) =>
	lay(blocks).pages.map((p) => p.lines.map((l) => [l.start, l.end]));

module('Unit | errata | write | layout', function () {
	test('wraps after spaces with exact positions', function (assert) {
		const { pages } = lay([para('aaaa bbbb cccc dddd')]);
		const [a, b] = pages[0]!.lines;
		assert.deepEqual(
			[a!.start, a!.end, b!.start, b!.end],
			[0, 15, 15, 19],
		);
		assert.strictEqual(a!.spans[0]!.text, 'aaaa bbbb cccc ');
		assert.deepEqual(b!.spans[0]!.xs, [10, 15, 20, 25, 30]);
		assert.deepEqual(
			[a!.top, a!.baseline, a!.height, b!.top],
			[10, 19, 12, 22],
		);
	});

	test('unchanged paragraphs reuse their spans', function (assert) {
		const a = para('aaaa');
		const b = para('bbbb');
		const first = lay([a, b]).pages[0]!.lines;
		const next = lay([a, para('bbbbb')]).pages[0]!.lines;
		assert.strictEqual(next[0]!.spans, first[0]!.spans);
		assert.notStrictEqual(next[1]!.spans, first[1]!.spans);
		const moved = lay([para('x'), a]).pages[0]!.lines;
		assert.strictEqual(moved[1]!.spans, first[0]!.spans);
		assert.deepEqual([moved[1]!.block, moved[1]!.top], [1, 22]);
	});

	test('trailing spaces do not count toward width', function (assert) {
		assert.deepEqual(ranges([para('abcdefghijklmnop   q')]), [
			[
				[0, 19],
				[19, 20],
			],
		]);
		const { pages } = lay([
			para('abcdefghijklmnop   q', { align: 'right' }),
		]);
		assert.strictEqual(pages[0]!.lines[0]!.spans[0]!.xs[0], 10);
	});

	test('breaks after dashes', function (assert) {
		assert.deepEqual(ranges([para('aaaaaaaaaa-bbbbbbbb')]), [
			[
				[0, 11],
				[11, 19],
			],
		]);
	});

	test('long words break at characters, not inside surrogates', function (assert) {
		assert.deepEqual(ranges([para('x'.repeat(20))]), [
			[
				[0, 16],
				[16, 20],
			],
		]);
		const { pages } = lay([para('x'.repeat(16) + '😀')]);
		const [, b] = pages[0]!.lines;
		assert.deepEqual([b!.start, b!.end], [16, 18]);
		assert.deepEqual(b!.spans[0]!.xs, [10, 15, 15]);
	});

	test('alignments', function (assert) {
		const x0 = (align: ResolvedPara['align']) =>
			lay([para('ab cd', { align })]).pages[0]!.lines[0]!
				.spans[0]!.xs[0];
		assert.strictEqual(x0('left'), 10);
		assert.strictEqual(x0('centre'), 37.5);
		assert.strictEqual(x0('right'), 65);
		assert.strictEqual(x0('justify'), 10);
	});

	test('justify spreads spaces and leaves the last line', function (assert) {
		const { pages } = lay([
			para('aaaa bbbb cccc dddd', { align: 'justify' }),
		]);
		const [a, b] = pages[0]!.lines;
		assert.strictEqual(a!.spans[0]!.xs[5], 40);
		assert.strictEqual(a!.spans[0]!.xs[14], 90);
		assert.deepEqual(b!.spans[0]!.xs.slice(0, 2), [10, 15]);
	});

	test('indent, first line and spacing', function (assert) {
		const { pages } = lay([
			para('aa', { spaceBefore: 5, spaceAfter: 3 }),
			para('bbbbbbbbbbbbbbbb', {
				indent: 10,
				firstLine: 20,
				spaceBefore: 2,
			}),
		]);
		const [a, b, c] = pages.flatMap((p) => p.lines);
		assert.strictEqual(
			a!.top,
			10,
			'space before dropped at page top',
		);
		assert.strictEqual(b!.top, 27);
		assert.deepEqual([b!.left, b!.width, b!.end], [40, 50, 10]);
		assert.deepEqual([c!.left, c!.width], [20, 70]);
	});

	test('line spacing centres the extra space', function (assert) {
		const line = lay([para('a', { lineSpacing: 2 })]).pages[0]!
			.lines[0]!;
		assert.deepEqual([line.height, line.baseline], [24, 25]);
	});

	test('scripts shrink and rise', function (assert) {
		const p = para('');
		if (p.kind === 'para')
			p.runs = [
				{ text: 'x', props: {} },
				{ text: '2', props: { script: 'super' } },
				{ text: '3', props: { script: 'sub' } },
			];
		const spans = lay([p]).pages[0]!.lines[0]!.spans;
		assert.deepEqual(
			spans.map((s) => [s.size, s.rise, s.xs[0]]),
			[
				[10, 0, 10],
				[6.5, 3.5, 15],
				[6.5, -1.5, 18.25],
			],
		);
	});

	test('list markers, numbering and restart', function (assert) {
		const num = { list: { kind: 'number', level: 0 } } as const;
		const { pages } = lay([
			para('a', num),
			para('b', num),
			para('c', { list: { kind: 'bullet', level: 1 } }),
			para('d', num),
			brk(),
			para('e'),
			para('f', num),
			para('g', { list: { kind: 'bullet', level: 0 } }),
			para('h', num),
		]);
		const markers = pages
			.flatMap((p) => p.lines)
			.map((l) => l.marker?.text);
		assert.deepEqual(markers, [
			'1.',
			'2.',
			'–',
			'3.',
			undefined,
			undefined,
			'1.',
			'•',
			'1.',
		]);
		const [a, , c] = pages[0]!.lines;
		assert.deepEqual([a!.marker!.xs[0], a!.left], [10, 28]);
		assert.deepEqual([c!.marker!.xs[0], c!.left], [28, 46]);
	});

	test('a line that does not fit moves to the next page', function (assert) {
		const { pages } = lay([
			para('a'),
			para('b'),
			para('c'),
			para('d', { spaceBefore: 5 }),
		]);
		assert.strictEqual(pages.length, 2);
		assert.deepEqual(
			pages[1]!.lines.map((l) => [l.block, l.top]),
			[[3, 10]],
		);
	});

	test('page breaks end the page', function (assert) {
		const { pages } = lay([para('a'), brk(), para('b')]);
		assert.strictEqual(pages.length, 2);
		const { spans, ...line } = pages[0]!.lines[1]!;
		assert.deepEqual(line, {
			kind: 'break',
			block: 1,
			start: 0,
			end: 0,
			top: 22,
			baseline: 31,
			height: 12,
			left: 10,
			width: 80,
			col: 0,
		});
		assert.strictEqual(spans.length, 0);
		assert.deepEqual(pages[1]!.content, {
			left: 10,
			top: 10,
			width: 80,
			height: 36,
		});
		assert.strictEqual(pages[1]!.lines[0]!.block, 2);
		assert.strictEqual(lay([]).pages.length, 1);
	});

	test('empty paragraphs get one line with an empty span', function (assert) {
		const p = para('');
		if (p.kind === 'para') p.runs[0]!.props = { size: 20 };
		const line = lay([p]).pages[0]!.lines[0]!;
		assert.deepEqual(
			[
				line.start,
				line.end,
				line.height,
				line.spans[0]!.text,
			],
			[0, 0, 24, ''],
		);
	});

	test('empty aligned paragraphs place the caret aligned', function (assert) {
		const x = (props: ParaProps) =>
			caretRect(lay([para('', props)]), {
				block: 0,
				offset: 0,
			}).x;
		assert.strictEqual(x({ align: 'centre' }), 50);
		assert.strictEqual(x({ align: 'right' }), 90);
		assert.strictEqual(x({ align: 'centre', indent: 20 }), 60);
		assert.strictEqual(x({ align: 'left', indent: 20 }), 30);
	});

	test('caretRect and hitTest round trip', function (assert) {
		const layout = lay([para('aaaa bbbb cccc dddd'), para('')]);
		for (let offset = 0; offset <= 19; offset++) {
			const r = caretRect(layout, { block: 0, offset });
			const back = hitTest(layout, r.page, r.x, r.top + 1);
			assert.deepEqual(
				back,
				{ focus: { block: 0, offset } },
				`offset ${offset}`,
			);
		}
		assert.deepEqual(caretRect(layout, { block: 0, offset: 15 }), {
			page: 0,
			x: 10,
			top: 22,
			height: 12,
		});
		assert.deepEqual(hitTest(layout, 0, 0, 40), {
			focus: { block: 1, offset: 0 },
		});
	});

	test('hitTest right of a wrapped line gives the wrap with affinity', function (assert) {
		const layout = lay([para('aaaa bbbb cccc dddd')]);
		const hit = hitTest(layout, 0, 200, 15);
		assert.deepEqual(hit, {
			focus: { block: 0, offset: 15 },
			focusAffinity: 'up',
		});
		assert.deepEqual(
			caretRect(layout, hit.focus, hit.focusAffinity),
			{
				page: 0,
				x: 85,
				top: 10,
				height: 12,
			},
		);
		assert.deepEqual(hitTest(layout, 0, 200, 25), {
			focus: { block: 0, offset: 19 },
		});
	});

	test('hitTest below the last line of a broken page picks the break', function (assert) {
		const layout = lay([para('a'), brk(), para('b')]);
		assert.deepEqual(hitTest(layout, 0, 20, 40), {
			focus: { block: 1, offset: 0 },
		});
		assert.deepEqual(hitTest(layout, 0, 20, 12), {
			focus: { block: 0, offset: 1 },
		});
		assert.deepEqual(caretRect(layout, { block: 1, offset: 0 }), {
			page: 0,
			x: 10,
			top: 22,
			height: 12,
		});
		assert.deepEqual(
			moveVertical(layout, { block: 1, offset: 0 }, 1, 50),
			{ focus: { block: 2, offset: 1 } },
		);
	});

	test('selection across a page break', function (assert) {
		const layout = lay([para('a'), brk(), para('b')]);
		assert.deepEqual(
			selectionRects(
				layout,
				{ block: 0, offset: 0 },
				{ block: 2, offset: 1 },
			),
			[
				{ page: 0, x: 10, y: 10, w: 9, h: 12 },
				{ page: 0, x: 10, y: 22, w: 4, h: 12 },
				{ page: 1, x: 10, y: 10, w: 5, h: 12 },
			],
		);
	});

	test('lineRange', function (assert) {
		const layout = lay([para('aaaa bbbb cccc dddd')]);
		assert.deepEqual(lineRange(layout, { block: 0, offset: 3 }), {
			start: { focus: { block: 0, offset: 0 } },
			end: {
				focus: { block: 0, offset: 15 },
				focusAffinity: 'up',
			},
		});
		assert.deepEqual(lineRange(layout, { block: 0, offset: 15 }), {
			start: { focus: { block: 0, offset: 15 } },
			end: { focus: { block: 0, offset: 19 } },
		});
		assert.deepEqual(
			lineRange(layout, { block: 0, offset: 15 }, 'up').start,
			{ focus: { block: 0, offset: 0 } },
		);
	});

	test('end then typing on a wrapped line', function (assert) {
		const doc = docOf([para('aaaa bbbb cccc dddd')]);
		writeStore.open(doc);
		keydown(
			new KeyboardEvent('keydown', { key: 'End' }),
			lay(doc.blocks),
		);
		assert.deepEqual(writeStore.get()!.sel, {
			anchor: { block: 0, offset: 15 },
			focus: { block: 0, offset: 15 },
			focusAffinity: 'up',
		});
		typeText('X');
		const { doc: next, sel } = writeStore.get()!;
		assert.deepEqual(sel, {
			anchor: { block: 0, offset: 16 },
			focus: { block: 0, offset: 16 },
		});
		const layout = lay(next.blocks);
		assert.deepEqual(
			caretRect(layout, sel.focus, sel.focusAffinity),
			{
				page: 0,
				x: 15,
				top: 22,
				height: 12,
			},
		);
		writeStore.close();
	});

	test('moveVertical crosses pages', function (assert) {
		const layout = lay([
			para('aaa'),
			para('bbb'),
			para('ccc'),
			para('ddd'),
		]);
		const goal = caretRect(layout, { block: 2, offset: 2 }).x;
		const down = moveVertical(
			layout,
			{ block: 2, offset: 2 },
			1,
			goal,
		);
		assert.deepEqual(down, { focus: { block: 3, offset: 2 } });
		assert.strictEqual(caretRect(layout, down.focus).page, 1);
		assert.deepEqual(moveVertical(layout, down.focus, -1, goal), {
			focus: { block: 2, offset: 2 },
		});
		assert.deepEqual(moveVertical(layout, down.focus, 1, goal), {
			focus: { block: 3, offset: 3 },
		});
		assert.deepEqual(
			moveVertical(layout, { block: 0, offset: 2 }, -1, goal),
			{ focus: { block: 0, offset: 0 } },
		);
	});

	test('selectionRects', function (assert) {
		const layout = lay([para('aaaa bbbb cccc dddd'), para('')]);
		assert.deepEqual(
			selectionRects(
				layout,
				{ block: 1, offset: 0 },
				{ block: 0, offset: 2 },
			),
			[
				{ page: 0, x: 20, y: 10, w: 65, h: 12 },
				{ page: 0, x: 10, y: 22, w: 24, h: 12 },
			],
		);
	});

	test('browser fonts: metrics match canvas', async function (assert) {
		const files = filesForFamilies(['inter', 'oswald']);
		assert.strictEqual(
			files.length,
			12,
			'oswald italic reuses upright',
		);
		await ensureFonts(files);
		assert.ok(
			fontBytes('inter-latin-400-normal.ttf').length > 1000,
		);
		const a = browserMetrics.pick('inter', false, false, 'A');
		const ext = browserMetrics.pick('inter', false, false, 'ő');
		const none = browserMetrics.pick('inter', false, false, '◦');
		assert.strictEqual(a.file, 'inter-latin-400-normal.ttf');
		assert.strictEqual(ext.file, 'inter-latin-ext-400-normal.ttf');
		assert.strictEqual(none.file, 'inter-latin-400-normal.ttf');
		const ctx = document.createElement('canvas').getContext('2d')!;
		ctx.fontKerning = 'none';
		ctx.font = `100px "${cssFamily(ext.file)}"`;
		assert.ok(
			Math.abs(
				ctx.measureText('ő').width - ext.advance * 100,
			) < 0.01,
		);
	});

	for (const [paras, cold, change] of [
		[820, 100, 5],
		[4100, 400, 10],
		[8200, 1000, 20],
	] as const)
		test(`${Math.round(paras / 8.2)} pages of body text`, async function (assert) {
			await ensureFonts(filesForFamilies(['source-serif-4']));
			const words =
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
			const blocks = Array.from({ length: paras }, () =>
				para(words.repeat(4)),
			);
			const doc = {
				version: 1 as const,
				name: 't',
				setup: {
					width: 595,
					height: 842,
					margins: {
						top: 72,
						right: 72,
						bottom: 72,
						left: 72,
					},
				},
				blocks,
			};
			const r: Resolver = {
				char: (p, run) => ({
					...resolver.char(p, run),
					font: 'source-serif-4',
					size: 11,
				}),
				para: (p) => ({
					...resolver.para(p),
					spaceAfter: 6,
				}),
			};
			layoutDoc(doc, browserMetrics, r);
			// fresh paragraphs skip cache
			const fresh = {
				...doc,
				blocks: blocks.map((b) => ({ ...b })),
			};
			const t = performance.now();
			const { pages } = layoutDoc(fresh, browserMetrics, r);
			const ms = performance.now() - t;
			assert.ok(
				pages.length >= paras / 8.2,
				`${pages.length} pages`,
			);
			assert.ok(ms < cold, `${ms.toFixed(1)} ms`);
			const edited = fresh.blocks.slice();
			edited[paras / 2] = para(words.repeat(4) + 'x');
			const t1 = performance.now();
			layoutDoc(
				{ ...fresh, blocks: edited },
				browserMetrics,
				r,
			);
			const edit = performance.now() - t1;
			assert.ok(edit < change, `edit ${edit.toFixed(2)} ms`);
		});

	test('100 pages with hyphenation, widow control and a page footer', async function (assert) {
		await ensureFonts(filesForFamilies(['source-serif-4']));
		await ensureHyphenator('en');
		const words =
			'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
		const footer: Paragraph[] = [
			{
				...(para('') as Paragraph),
				runs: [
					{
						text: FIELD_CHAR,
						props: { field: 'page' },
					},
				],
			},
		];
		const doc: WriteDoc = {
			version: 1,
			name: 't',
			setup: {
				width: 595,
				height: 842,
				margins: {
					top: 72,
					right: 72,
					bottom: 72,
					left: 72,
				},
				footer,
			},
			blocks: Array.from({ length: 820 }, () =>
				para(words.repeat(4), { align: 'justify' }),
			),
		};
		const r: Resolver = {
			char: (p, run) => ({
				...resolver.char(p, run),
				font: 'source-serif-4',
				size: 11,
			}),
			para: (p) => ({
				...resolver.para(p),
				spaceAfter: 6,
				widow: true,
			}),
		};
		const hyph = hyphenatorFor('en');
		layoutDoc(doc, browserMetrics, r, hyph);
		const fresh = {
			...doc,
			blocks: doc.blocks.map((b) => ({ ...b })),
		};
		const t = performance.now();
		const { pages } = layoutDoc(fresh, browserMetrics, r, hyph);
		const ms = performance.now() - t;
		assert.ok(pages.length >= 100, `${pages.length} pages`);
		assert.ok(
			pages.some((p) => p.lines.some((l) => l.hyphen)),
			'hyphenated',
		);
		assert.ok(ms < 100, `${ms.toFixed(1)} ms`);
		const edited = fresh.blocks.slice();
		edited[400] = para(words.repeat(4) + 'x', { align: 'justify' });
		const t1 = performance.now();
		layoutDoc(
			{ ...fresh, blocks: edited },
			browserMetrics,
			r,
			hyph,
		);
		const edit = performance.now() - t1;
		assert.ok(edit < 5, `edit ${edit.toFixed(2)} ms`);
	});
});
