import { module, test } from 'qunit';
import {
	barChar,
	caretAt,
	formatChar,
	inner,
	insertNote,
	linkAt,
	type NoteEdit,
	pending,
	replaceAround,
	selectRange,
	setLink,
	typeText,
} from 'delphitools-v2/lib/errata/write/editor';
import { caret, newDoc, paraText } from 'delphitools-v2/lib/errata/write/model';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import type {
	CharProps,
	Paragraph,
	Run,
	StyleId,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

const URL_A = 'https://a.example/';
const URL_B = 'https://b.example/';
const LINK = { link: URL_A, underline: true, colour: '#0563c1' };

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

function open(...blocks: Paragraph[]): void {
	const doc: WriteDoc = { ...newDoc('t'), blocks };
	writeStore.open(doc);
}

const runs = (block = 0): Run[] =>
	(writeStore.get()!.doc.blocks[block] as Paragraph).runs;

const at = (offset: number, block = 0) => selectRange(caret({ block, offset }));

module('Unit | errata | write | editor links', function (hooks) {
	hooks.afterEach(() => {
		writeStore.close();
	});

	test('typing at a link edge does not extend the link', function (assert) {
		open(para([['a '], ['site', LINK], [' b']]));
		at(6);
		typeText('x');
		assert.deepEqual(runs()[2], { text: 'x b', props: {} });
		at(2);
		typeText('y');
		assert.deepEqual(runs()[0], { text: 'a y', props: {} });
		assert.strictEqual(runs()[1]!.props.link, URL_A);
		at(7);
		assert.notOk(barChar(writeStore.get()!).link);
	});

	test('typing inside a link keeps it, across runs', function (assert) {
		open(
			para([
				['ab', LINK],
				['cd', { ...LINK, bold: true }],
			]),
		);
		at(2);
		typeText('x');
		assert.strictEqual(runs()[0]!.text, 'abx');
		assert.strictEqual(runs()[0]!.props.link, URL_A);
		at(1);
		assert.strictEqual(barChar(writeStore.get()!).link, URL_A);
	});

	test('linkAt finds one-character and multi-run links', function (assert) {
		open(para([['a', LINK], [' b']]));
		const doc = () => writeStore.get()!.doc;
		assert.strictEqual(
			linkAt(doc(), { block: 0, offset: 0 }),
			URL_A,
		);
		assert.strictEqual(
			linkAt(doc(), { block: 0, offset: 1 }),
			URL_A,
		);
		assert.strictEqual(
			linkAt(doc(), { block: 0, offset: 2 }),
			undefined,
		);
	});

	test('remove and edit take the whole link from its end', function (assert) {
		open(
			para([
				['x '],
				['ab', LINK],
				['cd', { ...LINK, bold: true }],
			]),
		);
		at(6);
		assert.true(setLink(URL_B));
		assert.deepEqual(
			runs().map((r) => r.props.link),
			[undefined, URL_B, URL_B],
		);
		at(6);
		setLink(null);
		assert.deepEqual(runs(), [
			{ text: 'x ab', props: {} },
			{ text: 'cd', props: { bold: true } },
		]);
	});
});

module('Unit | errata | write | editor replaceAround', function (hooks) {
	hooks.afterEach(() => {
		inner.set(null);
		writeStore.close();
	});

	const text = (block = 0) =>
		paraText(writeStore.get()!.doc.blocks[block] as Paragraph);

	test('keeps pending props across a recomposition', function (assert) {
		open(para([['teh']]));
		at(3);
		formatChar({ bold: true });
		replaceAround(0, 3, 'the');
		assert.deepEqual(pending.get(), { bold: true });
		replaceAround(3, 3, ' x');
		assert.strictEqual(text(), 'the x');
		assert.true(runs().at(-1)!.props.bold, 'typed bold');
	});

	test('edits the block the composition started in', function (assert) {
		open(para([['abc']]), para([['def']]));
		at(3);
		const start = caretAt();
		at(1, 1);
		replaceAround(0, 3, 'xyz', start);
		assert.deepEqual([text(0), text(1)], ['xyz', 'def']);
	});

	test('edits the note the composition started in', function (assert) {
		open(para([['abc']]), para([['def']]));
		at(3);
		insertNote('foot');
		typeText('Src');
		const start = caretAt();
		const ne = inner.get() as NoteEdit;
		at(0, 1);
		assert.strictEqual(inner.get(), null, 'left the note');
		replaceAround(0, 3, 'Source', start);
		const note = writeStore.get()!.doc.notes![ne.id]![0]!;
		assert.strictEqual(paraText(note), 'Source');
		assert.strictEqual(text(1), 'def');
	});
});
