import { module, test } from 'qunit';
import {
	applyChar,
	insertText,
	newDoc,
	paraText,
} from 'delphitools-v2/lib/errata/write/model';
import { createWriteStore } from 'delphitools-v2/lib/errata/write/store';
import type { Paragraph } from 'delphitools-v2/lib/errata/write/types';

function setup() {
	let t = 0;
	const store = createWriteStore(() => t);
	store.open(newDoc('t'));
	const type = (text: string, dt = 10) => {
		t += dt;
		const s = store.get()!;
		store.commit(insertText(s.doc, s.sel, text), 'type');
	};
	const text = () => paraText(store.get()!.doc.blocks[0] as Paragraph);
	return { store, type, text };
}

module('Unit | errata | write | store', function () {
	test('typing merges until whitespace', function (assert) {
		const { store, type, text } = setup();
		for (const ch of 'one two') type(ch);
		assert.strictEqual(text(), 'one two');
		store.undo();
		assert.strictEqual(text(), 'one ');
		store.undo();
		assert.strictEqual(text(), '');
		assert.false(store.canUndo());
		store.redo();
		store.redo();
		assert.strictEqual(text(), 'one two');
		assert.false(store.canRedo());
	});

	test('a pause or a kind change starts a new step', function (assert) {
		const { store, type, text } = setup();
		type('a');
		type('b', 1500);
		const s = store.get()!;
		store.commit(
			applyChar(
				s.doc,
				{
					anchor: { block: 0, offset: 0 },
					focus: s.sel.focus,
				},
				{ bold: true },
			),
			'format',
		);
		type('c');
		store.undo();
		assert.strictEqual(text(), 'ab');
		store.undo();
		store.undo();
		assert.strictEqual(text(), 'a');
	});

	test('selection-only commits skip history', function (assert) {
		const { store, type, text } = setup();
		type('a');
		const s = store.get()!;
		store.commit({ doc: s.doc, sel: s.sel }, 'other');
		type('b');
		assert.strictEqual(text(), 'ab');
		store.undo();
		assert.strictEqual(text(), 'a', 'caret move breaks the merge');
	});

	test('new commits clear redo; stack capped at 200', function (assert) {
		const { store, type } = setup();
		for (let i = 0; i < 250; i++) type(' ');
		let n = 0;
		while (store.canUndo()) {
			store.undo();
			n++;
		}
		assert.strictEqual(n, 200);
		type('x');
		assert.false(store.canRedo());
		store.close();
		assert.strictEqual(store.get(), null);
	});
});
