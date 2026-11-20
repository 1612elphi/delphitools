import { module, test } from 'qunit';
import {
	LIST_STEP,
	NOTE_RULE,
	layoutDoc,
	type Resolver,
} from 'delphitools-v2/lib/errata/write/layout';
import {
	copy,
	inner,
	keydown,
	paste,
	type NoteEdit,
	remove,
	selectRange,
	typeText,
} from 'delphitools-v2/lib/errata/write/editor';
import { findAll, replaceRanges } from 'delphitools-v2/lib/errata/write/find';
import { readDoc, AtaError } from 'delphitools-v2/lib/errata/write/ata';
import { docToRtf, rtfToDoc } from 'delphitools-v2/lib/errata/write/rtf';
import {
	caret,
	newDoc,
	normaliseDoc,
	paraText,
} from 'delphitools-v2/lib/errata/write/model';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import {
	browserMetrics,
	ensureFonts,
	filesForFamilies,
} from 'delphitools-v2/lib/errata/write/fonts';
import { FIELD_CHAR } from 'delphitools-v2/lib/errata/write/types';
import type {
	Block,
	Layout,
	Metrics,
	NoteRef,
	Paragraph,
	ResolvedChar,
	ResolvedPara,
	Run,
	StyleId,
	Table,
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
		widow: false,
		...p.props,
	}),
};

let ids = 0;
const text = (t: string): Run => ({ text: t, props: {} });
const ref = (id: string, kind: NoteRef['kind'] = 'foot'): Run => ({
	text: FIELD_CHAR,
	props: { note: { id, kind } },
});
const para = (runs: Run[] | string, style: StyleId = 'body'): Paragraph => ({
	kind: 'para',
	id: `p${ids++}`,
	style,
	props: {},
	runs: typeof runs === 'string' ? [text(runs)] : runs,
	dir: 'ltr',
});
const lines = (n: number, t = 'n') => Array.from({ length: n }, () => para(t));

// fifteen 12 pt lines
const docOf = (
	blocks: Block[],
	notes?: Record<string, Paragraph[]>,
): WriteDoc => ({
	version: 1,
	name: 't',
	setup: {
		width: 100,
		height: 200,
		margins: { top: 10, right: 10, bottom: 10, left: 10 },
	},
	blocks,
	...(notes ? { notes } : {}),
});
const lay = (doc: WriteDoc): Layout => layoutDoc(doc, fake, resolver);

module('Unit | errata | write | notes', function (hooks) {
	hooks.afterEach(() => {
		inner.set(null);
		writeStore.close();
	});

	test('footnotes count 1, 2, 3 and endnotes i, ii', function (assert) {
		const doc = docOf(
			[
				para([text('a'), ref('x'), ref('y', 'end')]),
				para([ref('z'), ref('w', 'end')]),
			],
			{
				x: [para('one')],
				y: [para('two')],
				z: [para('three')],
				w: [para('four')],
			},
		);
		const page = lay(doc).pages[0]!;
		const shown = page.lines.flatMap((l) =>
			l.spans.filter((s) => s.shown),
		);
		assert.deepEqual(
			shown.map((s) => s.shown),
			['1', 'i', '2', 'ii'],
		);
		assert.deepEqual(
			page.notes
				.toSorted((a, b) => a.top - b.top)
				.map((l) => [l.note, l.marker?.text]),
			[
				['y', 'i'],
				['w', 'ii'],
				['x', '1'],
				['z', '2'],
			],
		);
		assert.ok(
			shown.every((s) => s.rise > 0 && s.size < 10),
			'superscript',
		);
	});

	test('a footnote sits at the page foot and the body shrinks', function (assert) {
		const blocks = lines(30);
		const plain = lay(docOf(blocks)).pages[0]!;
		assert.strictEqual(plain.lines.length, 15);
		blocks[0] = para([text('a'), ref('x')]);
		const page = lay(docOf(blocks, { x: [para('note')] }))
			.pages[0]!;
		assert.strictEqual(page.lines.length, 13);
		assert.strictEqual(page.notes.length, 1);
		const note = page.notes[0]!;
		assert.deepEqual(
			[note.note, note.block, note.top],
			['x', 0, 178],
		);
		assert.strictEqual(note.marker?.text, '1');
		assert.strictEqual(note.left, 10 + LIST_STEP);
		const rule = page.boxes.find((b) => b.h < 1)!;
		assert.ok(rule.y > 190 - 12 - NOTE_RULE, 'rule above');
		assert.ok(Math.abs(rule.w - 80 / 3) < 1e-6, 'third');
	});

	test('a reference whose note does not fit moves to the next page', function (assert) {
		const blocks = lines(20);
		blocks[14] = para([text('a'), ref('x')]);
		const { pages } = lay(docOf(blocks, { x: [para('note')] }));
		assert.strictEqual(pages[0]!.lines.length, 14);
		assert.strictEqual(pages[0]!.notes.length, 0);
		assert.strictEqual(pages[1]!.lines[0]!.block, 14);
		assert.strictEqual(pages[1]!.notes[0]!.note, 'x');
	});

	test('a note over half the page splits and continues', function (assert) {
		const blocks = lines(5);
		blocks[0] = para([text('a'), ref('x')]);
		const { pages } = lay(docOf(blocks, { x: lines(20) }));
		assert.strictEqual(pages[0]!.lines.length, 1);
		assert.strictEqual(pages[0]!.notes.length, 13);
		assert.strictEqual(pages[1]!.notes.length, 7);
		assert.deepEqual(
			pages[1]!.notes.map((l) => l.block),
			[13, 14, 15, 16, 17, 18, 19],
		);
		assert.strictEqual(pages[1]!.lines[0]!.block, 1);
		assert.strictEqual(pages.length, 2);
	});

	test('a note longer than many pages terminates', function (assert) {
		const blocks = [para([text('a'), ref('x')])];
		const { pages } = lay(docOf(blocks, { x: lines(100) }));
		const placed = pages.flatMap((p) => p.notes).length;
		assert.strictEqual(placed, 100);
		assert.ok(pages.length >= 7, `${pages.length} pages`);
	});

	test('two columns keep their own footnotes', function (assert) {
		const doc = docOf(lines(60));
		doc.setup = { ...doc.setup, columns: 2, gutter: 0 };
		doc.blocks[20] = para([ref('x')]);
		doc.notes = { x: [para('note')] };
		const page = lay(doc).pages[0]!;
		assert.strictEqual(page.notes.length, 1);
		assert.strictEqual(page.notes[0]!.col, 1);
		assert.strictEqual(
			page.notes[0]!.left,
			page.cols[1]!.left + LIST_STEP,
		);
	});

	test('endnotes follow the last body block', function (assert) {
		const doc = docOf(
			[para([text('a'), ref('e', 'end')]), para('b')],
			{
				e: [para('end one'), para('end two')],
			},
		);
		const page = lay(doc).pages[0]!;
		assert.strictEqual(page.lines.length, 2);
		assert.deepEqual(
			page.notes.map((l) => [l.note, l.block]),
			[
				['e', 0],
				['e', 1],
			],
		);
		const last = page.lines[1]!;
		assert.ok(
			page.notes[0]!.top >=
				last.top + last.height + NOTE_RULE,
		);
		assert.strictEqual(page.notes[0]!.marker?.text, 'i');
		assert.ok(page.boxes.some((b) => b.h < 1));
	});

	test('contents list headings with leaders and page numbers', function (assert) {
		const doc = docOf([
			{ kind: 'toc', id: 't', levels: 3 },
			{ kind: 'break', id: 'b1' },
			para('Alpha', 'h1'),
			para('body'),
			{ kind: 'break', id: 'b2' },
			para('Beta', 'h2'),
			para('Gamma', 'h3'),
		]);
		doc.setup = { ...doc.setup, width: 300 };
		const layout = lay(doc);
		const page = layout.pages[0]!;
		const entries = page.toc.map((l) => [
			l.block,
			l.spans[0]!.text,
			l.spans.at(-1)!.text,
		]);
		assert.deepEqual(entries, [
			[2, 'Alpha', '2'],
			[5, 'Beta', '3'],
			[6, 'Gamma', '3'],
		]);
		const beta = page.toc[1]!;
		assert.strictEqual(beta.left, 10 + LIST_STEP);
		const leader = beta.spans.at(-2)!;
		assert.ok(/^\.+$/.test(leader.text), leader.text);
		assert.ok(Math.abs(beta.spans.at(-1)!.xs.at(-1)! - 290) < 1e-6);
		assert.strictEqual(page.lines[0]!.kind, 'toc');
		doc.blocks[0] = { kind: 'toc', id: 't', levels: 1 };
		assert.deepEqual(
			lay(doc).pages[0]!.toc.map((l) => l.block),
			[2],
		);
	});

	test('contents that push headings on settle their numbers', function (assert) {
		const blocks: Block[] = [{ kind: 'toc', id: 't', levels: 3 }];
		for (let i = 0; i < 40; i++)
			blocks.push(para(`Heading ${i}`, 'h1'), ...lines(5));
		const doc = docOf(blocks);
		doc.setup = { ...doc.setup, width: 300 };
		const layout = lay(doc);
		const pageOf = new Map<number, string>();
		for (const p of layout.pages)
			for (const l of p.lines)
				if (!pageOf.has(l.block))
					pageOf.set(l.block, p.label);
		const entries = layout.pages.flatMap((p) => p.toc);
		assert.strictEqual(entries.length, 40);
		assert.ok(
			layout.pages[3]!.toc.length > 0,
			'contents span pages',
		);
		for (const e of entries)
			assert.strictEqual(
				e.spans.at(-1)!.text,
				pageOf.get(e.block),
				`entry ${e.block}`,
			);
		const again = layoutDoc(doc, fake, resolver, null, layout);
		assert.deepEqual(
			again.pages.map((p) => p.toc.length),
			layout.pages.map((p) => p.toc.length),
		);
	});

	test('deleting a reference deletes its note in one undo step', function (assert) {
		writeStore.open({
			...newDoc('t'),
			blocks: [para([text('ab'), ref('x'), text('c')])],
			notes: { x: [para('note')] },
		});
		selectRange(caret({ block: 0, offset: 3 }));
		remove(-1, 'char');
		const s = writeStore.get()!;
		assert.strictEqual(
			paraText(s.doc.blocks[0] as Paragraph),
			'abc',
		);
		assert.strictEqual(s.doc.notes, undefined);
		writeStore.undo();
		assert.deepEqual(Object.keys(writeStore.get()!.doc.notes!), [
			'x',
		]);
	});

	test('the keyboard inserts a footnote, typing fills it, escape returns', function (assert) {
		writeStore.open({ ...newDoc('t'), blocks: [para('abc')] });
		selectRange(caret({ block: 0, offset: 2 }));
		const key = (init: KeyboardEventInit) =>
			keydown(new KeyboardEvent('keydown', init), {
				pages: [],
			});
		assert.true(
			key({
				key: 'ƒ',
				code: 'KeyF',
				metaKey: true,
				altKey: true,
			}),
		);
		const ne = inner.get() as NoteEdit | null;
		assert.ok(ne, 'editing the note');
		typeText('Source');
		const s = writeStore.get()!;
		assert.strictEqual(
			paraText(s.doc.notes![ne!.id]![0]!),
			'Source',
		);
		assert.strictEqual(s.doc.notes![ne!.id]![0]!.style, 'note');
		const body = s.doc.blocks[0] as Paragraph;
		assert.deepEqual(body.runs[1]!.props.note, {
			id: ne!.id,
			kind: 'foot',
		});
		key({ key: 'Escape' });
		assert.strictEqual(inner.get() as NoteEdit | null, null);
		assert.deepEqual(writeStore.get()!.sel.focus, {
			block: 0,
			offset: 3,
		});
		key({ key: '∑', code: 'KeyE', metaKey: true, altKey: true });
		const end = inner.get() as NoteEdit;
		assert.strictEqual(
			(
				writeStore.get()!.doc.blocks[0] as Paragraph
			).runs.find((r) => r.props.note?.id === end.id)?.props
				.note?.kind,
			'end',
		);
	});

	test('copying a reference pastes a copy of its note', function (assert) {
		writeStore.open({
			...newDoc('t'),
			blocks: [
				para([text('a'), ref('x'), text('b')]),
				para(''),
			],
			notes: { x: [para('note')] },
		});
		selectRange({
			anchor: { block: 0, offset: 0 },
			focus: { block: 0, offset: 3 },
		});
		const data = new DataTransfer();
		copy(data, false);
		selectRange(caret({ block: 1, offset: 0 }));
		paste(data);
		const doc = writeStore.get()!.doc;
		const refs = doc.blocks.flatMap((b) =>
			b.kind === 'para'
				? b.runs.flatMap((r) => r.props.note ?? [])
				: [],
		);
		assert.strictEqual(refs.length, 2);
		assert.notStrictEqual(refs[0]!.id, refs[1]!.id);
		assert.deepEqual(
			refs.map((r) => paraText(doc.notes![r.id]![0]!)),
			['note', 'note'],
		);
	});

	test('find searches and replaces note text', function (assert) {
		const doc = docOf([para([text('body'), ref('x')])], {
			x: [para('a note')],
		});
		const matches = findAll(doc, 'note', false);
		assert.deepEqual(
			matches.map((m) => [m.block, m.note?.id, m.start]),
			[[1, 'x', 2]],
		);
		const next = replaceRanges(doc, matches, 'gloss');
		assert.strictEqual(paraText(next.notes!['x']![0]!), 'a gloss');
	});

	test('.ata validation of notes and contents', function (assert) {
		const raw = (v: object) =>
			JSON.parse(JSON.stringify(v)) as unknown;
		const cell = (r: Run) => ({ paras: [para([r])] });
		const doc = readDoc(
			raw(
				docOf(
					[
						para([
							ref('a'),
							ref('a'),
							ref('missing'),
						]),
						{
							kind: 'table',
							id: 't',
							cols: [50],
							rows: [
								[
									cell(
										ref(
											'b',
										),
									),
								],
							],
							border: {
								kind: 'all',
								width: 1,
								colour: '#000000',
							},
						},
						{
							kind: 'toc',
							id: 'c',
							levels: 7,
						},
					],
					{
						a: [
							para([
								text('x'),
								ref('c'),
							]),
						],
						b: [para('cell')],
						c: [],
						'bad id!': [para('x')],
					},
				),
			),
		);
		assert.deepEqual(Object.keys(doc.notes!), ['a']);
		assert.deepEqual(
			(doc.blocks[0] as Paragraph).runs.map(
				(r) => r.props.note?.id,
			),
			['a'],
		);
		assert.strictEqual(paraText(doc.notes!['a']![0]!), 'x');
		assert.deepEqual(doc.blocks[2], {
			kind: 'toc',
			id: 'c',
			levels: 3,
		});
		assert.throws(
			() =>
				readDoc(
					raw(
						docOf([para([ref('a')])], {
							a: [
								{
									kind: 'break',
									id: 'k',
								} as never,
							],
						}),
					),
				),
			AtaError,
		);
		const none = readDoc(
			raw(docOf([para('x')], { a: [para('y')] })),
		);
		assert.strictEqual(none.notes, undefined);
	});

	test('RTF round trip keeps notes and contents', function (assert) {
		const doc: WriteDoc = {
			...newDoc('r'),
			blocks: [
				{ kind: 'toc', id: 't', levels: 2 },
				para('Intro', 'h1'),
				para([
					text('see'),
					ref('f'),
					text(' and'),
					ref('e', 'end'),
				]),
			],
			notes: {
				f: [para('Foot text', 'note')],
				e: [
					para('End one', 'note'),
					para('End two', 'note'),
				],
			},
		};
		const rtf = docToRtf(doc, new Map([[doc.blocks[1]!.id, '2']]));
		assert.ok(/\\fldinst TOC \\\\o "1-2"/.test(rtf), 'toc field');
		assert.ok(/Intro\\tab 2\\par/.test(rtf), 'result with page');
		const back = rtfToDoc(rtf, 'r');
		assert.deepEqual(back.blocks[0], {
			kind: 'toc',
			id: back.blocks[0]!.id,
			levels: 2,
		});
		const body = back.blocks.find(
			(b) =>
				b.kind === 'para' &&
				paraText(b).startsWith('see'),
		) as Paragraph;
		const notes = body.runs.flatMap((r) => r.props.note ?? []);
		assert.deepEqual(
			notes.map((n) => n.kind),
			['foot', 'end'],
		);
		assert.deepEqual(
			notes.map((n) => back.notes![n.id]!.map(paraText)),
			[['Foot text'], ['End one', 'End two']],
		);
		assert.strictEqual(
			back.notes![notes[0]!.id]![0]!.style,
			'note',
		);
	});

	test('a Word 2000 RTF with a footnote and an endnote', function (assert) {
		const WORD = String.raw`{\rtf1\ansi\ansicpg1252\uc1 \deff0\deflang1033\deflangfe1033{\fonttbl{\f0\froman\fcharset0\fprq2{\*\panose 02020603050405020304}Times New Roman;}}
{\colortbl;\red0\green0\blue0;}
{\stylesheet{\ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs24\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 \snext0 Normal;}{\*\cs10 \additive Default Paragraph Font;}{\s15\ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs20\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 \sbasedon0 \snext15 footnote text;}{\*\cs16 \additive \super \sbasedon10 footnote reference;}{\s17\ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs20\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 \sbasedon0 \snext17 endnote text;}{\*\cs18 \additive \super \sbasedon10 endnote reference;}}
{\info{\title Notes}{\author Jane}}\paperw12240\paperh15840\margl1800\margr1800\margt1440\margb1440 \widowctrl\ftnbj\aenddoc\noxlattoyen\expshrtn\noultrlspc\dntblnsbdb\nospaceforul\formshade\horzdoc\dgmargin\dghspace180\dgvspace180\dghorigin1800\dgvorigin1440\dghshow1\dgvshow1\jexpand\viewkind1\viewscale100\pgbrdrhead\pgbrdrfoot\splytwnine\ftnlytwnine\htmautsp\nolnhtadjtbl\useltbaln\alntblind\lytcalctblwd\lyttblrtgr\lnbrkrule \fet2{\*\ftnsep \pard\plain \ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs24\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 {\chftnsep \par }}{\*\aftnsep \pard\plain \ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs24\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 {\chftnsep \par }}\sectd \linex0\endnhere\sectlinegrid360\sectdefaultcl {\*\pnseclvl1\pnucrm\pnstart1\pnindent720\pnhang{\pntxta .}}
\pard\plain \ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs24\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 {First sentence}{\cs16\super \chftn {\footnote \pard\plain \s15\ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs20\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 {\cs16\super \chftn } A footnote.}}{ and more}{\cs18\super \chftn {\footnote \ftnalt \pard\plain \s17\ql \li0\ri0\widctlpar\aspalpha\aspnum\faauto\adjustright\rin0\lin0\itap0 \fs20\lang1033\langfe1033\cgrid\langnp1033\langfenp1033 {\cs18\super \chftn } An endnote.}}{.\par }}`;
		const doc = rtfToDoc(WORD, 'notes');
		const body = doc.blocks[0] as Paragraph;
		assert.strictEqual(
			paraText(body),
			`First sentence${FIELD_CHAR} and more${FIELD_CHAR}.`,
		);
		const notes = body.runs.flatMap((r) => r.props.note ?? []);
		assert.deepEqual(
			notes.map((n) => [
				n.kind,
				paraText(doc.notes![n.id]![0]!),
			]),
			[
				['foot', 'A footnote.'],
				['end', 'An endnote.'],
			],
		);
		assert.strictEqual(doc.notes![notes[0]!.id]![0]!.style, 'note');
		assert.strictEqual(doc.blocks.length, 1);
	});

	test("a keep-with-next heading counts the next line's footnote", function (assert) {
		const blocks = lines(12);
		const heading = para('h', 'h1');
		heading.props = { keepNext: true };
		blocks.push(heading, para([text('a'), ref('x')]), ...lines(3));
		const { pages } = lay(docOf(blocks, { x: [para('note')] }));
		assert.strictEqual(pages[0]!.lines.at(-1)!.block, 11);
		assert.strictEqual(pages[1]!.lines[0]!.block, 12);
		assert.strictEqual(pages[1]!.notes[0]!.note, 'x');
	});

	test('a reference in a long paragraph places its note where its line lands', function (assert) {
		const runs: Run[] = [];
		const notes: Record<string, Paragraph[]> = {};
		for (let i = 0; i < 20; i++) {
			runs.push(text('aaaaaaa '), ref(`r${i}`));
			notes[`r${i}`] = [para('n')];
		}
		const { pages } = lay(docOf([para(runs)], notes));
		const all = pages.flatMap((p) => p.notes.map((l) => l.note));
		assert.deepEqual(
			all,
			runs.flatMap((r) => r.props.note?.id ?? []),
		);
		for (const page of pages) {
			const body = page.lines.at(-1)!;
			assert.ok(
				page.notes.every(
					(n) => n.top >= body.top + body.height,
				),
				`page ${page.index} notes below text`,
			);
		}
	});

	test('a footnote keeps below a float placed before it', function (assert) {
		const image = {
			id: 'i',
			w: 30,
			h: 60,
			float: {
				wrap: 'square' as const,
				side: 'left' as const,
				distance: 0,
				x: 50,
				y: 110,
			},
		};
		const blocks = lines(10);
		blocks[0] = para([
			{ text: FIELD_CHAR, props: { image } },
			text('n'),
		]);
		blocks[5] = para([text('a'), ref('x')]);
		const { pages } = lay(docOf(blocks, { x: [para('note')] }));
		for (const page of pages) {
			const low = Math.max(
				0,
				...page.floats.map((f) => f.y + f.boxH),
			);
			assert.ok(
				page.notes.every((n) => n.top >= low),
				`page ${page.index} notes clear of floats`,
			);
		}
		assert.strictEqual(pages[0]!.floats.length, 1);
		assert.strictEqual(pages[1]!.notes[0]!.note, 'x');
		assert.strictEqual(pages[1]!.lines[0]!.block, 5);
	});

	test('a note continued on a page with a longer page number repeats and skips no line', function (assert) {
		const field: Run = {
			text: FIELD_CHAR,
			props: { field: 'page' },
		};
		// wraps past page 9
		const long = Array.from({ length: 30 }, () =>
			para([text('aaaaaaaaaaaaaa '), field]),
		);
		const doc = docOf([para([text('a'), ref('x')])], {
			x: [para('x'), ...long],
		});
		doc.setup = { ...doc.setup, restart: 9 };
		const { pages } = lay(doc);
		assert.ok(pages.length > 1, 'note spans pages');
		const placed = pages.flatMap((p) =>
			p.notes.map((l) => [l.block, l.start]),
		);
		const seen = new Set(placed.map((b) => b.join()));
		assert.strictEqual(seen.size, placed.length, 'no repeats');
		assert.deepEqual(
			[...new Set(placed.map(([b]) => b))],
			Array.from({ length: 31 }, (_, i) => i),
			'every paragraph in order',
		);
	});

	test('a second contents and references outside body paragraphs drop', function (assert) {
		const cell = (paras: Paragraph[]) => ({ paras });
		const doc = normaliseDoc(
			docOf(
				[
					{ kind: 'toc', id: 't1', levels: 3 },
					para([text('a'), ref('b')]),
					{
						kind: 'table',
						id: 'tb',
						cols: [80],
						rows: [
							[
								cell([
									para([
										text(
											'c',
										),
										ref(
											'c',
										),
									]),
								]),
							],
						],
						border: {
							kind: 'all',
							width: 1,
							colour: '#000000',
						},
					},
					{ kind: 'toc', id: 't2', levels: 2 },
					para('d'),
				],
				{
					b: [para([text('b'), ref('n')])],
					c: [para('c')],
					n: [para('n')],
				},
			),
		);
		assert.deepEqual(
			doc.blocks.map((b) => b.kind),
			['toc', 'para', 'table', 'para'],
		);
		const table = doc.blocks[2] as Table;
		assert.strictEqual(paraText(table.rows[0]![0]!.paras[0]!), 'c');
		assert.deepEqual(Object.keys(doc.notes!), ['b']);
		assert.strictEqual(paraText(doc.notes!.b![0]!), 'b');
	});

	test('typing in a heading lays the contents out once', function (assert) {
		let paras = 0;
		const counting: Resolver = {
			char: (p, run) => resolver.char(p, run),
			para: (p) => {
				paras++;
				return resolver.para(p);
			},
		};
		const blocks: Block[] = [
			{ kind: 'toc', id: 't', levels: 3 },
			para('Intro', 'h1'),
			...lines(40),
		];
		const first = layoutDoc(docOf(blocks), fake, counting);
		const edited = blocks.slice();
		edited[1] = {
			...(blocks[1] as Paragraph),
			runs: [text('Intro2')],
		};
		paras = 0;
		layoutDoc(docOf(edited), fake, counting, null, first);
		assert.ok(paras < 2 * edited.length, `${paras} resolves`);
	});

	test('LibreOffice starred footnotes import', function (assert) {
		const doc = rtfToDoc(
			String.raw`{\rtf1\ansi{\fonttbl{\f0 Times;}}\pard\plain Text{\super\chftn}{\*\footnote\pard\plain{\super\chftn} A note.} after.\par}`,
			'lo',
		);
		const body = doc.blocks[0] as Paragraph;
		assert.strictEqual(paraText(body), `Text${FIELD_CHAR} after.`);
		const id = body.runs.find((r) => r.props.note)!.props.note!.id;
		assert.strictEqual(paraText(doc.notes![id]![0]!), 'A note.');
	});

	test('100 pages with 200 footnotes', async function (assert) {
		await ensureFonts(filesForFamilies(['source-serif-4']));
		const words =
			'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
		const notes: Record<string, Paragraph[]> = {};
		const blocks = Array.from({ length: 820 }, (_, i) => {
			if (i % 4 || i >= 800) return para(words.repeat(4));
			const id = `n${i}`;
			notes[id] = [
				para(
					'Ibid., a short note of one line.',
					'note',
				),
			];
			return para([
				text(words.repeat(2)),
				ref(id),
				text(words.repeat(2)),
			]);
		});
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
			},
			blocks,
			notes,
		};
		const r: Resolver = {
			char: (p, run) => ({
				...resolver.char(p, run),
				font: 'source-serif-4',
				size: p.style === 'note' ? 9 : 11,
			}),
			para: (p) => ({ ...resolver.para(p), spaceAfter: 6 }),
		};
		layoutDoc(doc, browserMetrics, r);
		const fresh = {
			...doc,
			blocks: blocks.map((b) => ({ ...b })),
			notes: Object.fromEntries(
				Object.entries(notes).map(([k, v]) => [
					k,
					v.map((p) => ({ ...p })),
				]),
			),
		};
		const t = performance.now();
		const { pages } = layoutDoc(fresh, browserMetrics, r);
		const ms = performance.now() - t;
		assert.ok(pages.length >= 100, `${pages.length} pages`);
		assert.strictEqual(pages.flatMap((p) => p.notes).length, 200);
		assert.ok(ms < 150, `${ms.toFixed(1)} ms`);
		const edited = fresh.blocks.slice();
		edited[401] = para(words.repeat(4) + 'x');
		const t1 = performance.now();
		layoutDoc({ ...fresh, blocks: edited }, browserMetrics, r);
		const edit = performance.now() - t1;
		assert.ok(edit < 10, `edit ${edit.toFixed(2)} ms`);
	});

	test('contents of 300 headings', async function (assert) {
		await ensureFonts(filesForFamilies(['source-serif-4']));
		const blocks: Block[] = [{ kind: 'toc', id: 't', levels: 3 }];
		const styles: StyleId[] = ['h1', 'h2', 'h3'];
		for (let i = 0; i < 300; i++)
			blocks.push(
				para(
					`Section heading number ${i}`,
					styles[i % 3],
				),
				para(
					'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
				),
			);
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
			},
			blocks,
		};
		const r: Resolver = {
			char: (p, run) => ({
				...resolver.char(p, run),
				font: 'source-serif-4',
				size: 11,
			}),
			para: (p) => ({ ...resolver.para(p), spaceAfter: 6 }),
		};
		const t = performance.now();
		const { pages } = layoutDoc(doc, browserMetrics, r);
		const ms = performance.now() - t;
		const entries = pages.flatMap((p) => p.toc);
		assert.strictEqual(entries.length, 300);
		assert.ok(
			entries.every((e) =>
				/^\d+$/.test(e.spans.at(-1)!.text),
			),
			'numbered',
		);
		assert.ok(ms < 150, `${ms.toFixed(1)} ms`);
	});
});
