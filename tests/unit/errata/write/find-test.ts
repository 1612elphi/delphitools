import { module, test } from 'qunit';
import { findAll, replaceRanges } from 'delphitools-v2/lib/errata/write/find';
import { newDoc, paraText } from 'delphitools-v2/lib/errata/write/model';
import type {
	Block,
	Paragraph,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

function para(...runs: [string, boolean?][]): Paragraph {
	return {
		kind: 'para',
		id: crypto.randomUUID(),
		style: 'body',
		props: {},
		runs: runs.map(([text, bold]) => ({
			text,
			props: bold ? { bold } : {},
		})),
		dir: 'ltr',
	};
}

const doc = (...blocks: Block[]): WriteDoc => ({ ...newDoc('t'), blocks });

const texts = (d: WriteDoc) =>
	d.blocks.map((b) => (b.kind === 'para' ? paraText(b) : '<br>'));

module('Unit | errata | write | find', function () {
	test('findAll matches within paragraphs, case and regex safe', function (assert) {
		const d = doc(
			para(['The cat. the (cat)']),
			{ kind: 'break', id: 'b' },
			para(['ca'], ['t sat', true]),
			para(['the end']),
		);
		assert.deepEqual(findAll(d, 'cat', false), [
			{ block: 0, start: 4, end: 7 },
			{ block: 0, start: 14, end: 17 },
			{ block: 2, start: 0, end: 3 },
		]);
		assert.deepEqual(
			findAll(d, 'The', true).map((m) => m.start),
			[0],
		);
		assert.strictEqual(findAll(d, 'THE', false).length, 3);
		assert.deepEqual(findAll(d, '(cat)', true), [
			{ block: 0, start: 13, end: 18 },
		]);
		assert.deepEqual(findAll(d, '', false), []);
		assert.deepEqual(findAll(d, 'cat. the', false).length, 1);
		assert.deepEqual(findAll(d, 'sat\nthe', false), []);
	});

	test('replaceRanges keeps offsets and first-character props', function (assert) {
		const d = doc(para(['aXbX']), para(['X', true], ['y']));
		const r = replaceRanges(d, findAll(d, 'X', true), 'long');
		assert.deepEqual(texts(r), ['alongblong', 'longy']);
		const second = r.blocks[1] as Paragraph;
		assert.deepEqual(second.runs, [
			{ text: 'long', props: { bold: true } },
			{ text: 'y', props: {} },
		]);
		assert.strictEqual(r.blocks[0]!.id, d.blocks[0]!.id);
		assert.deepEqual(
			texts(replaceRanges(d, findAll(d, 'X', true), '')),
			['ab', 'y'],
		);
		assert.strictEqual(replaceRanges(d, [], 'z'), d);
	});

	test('replace at a link edge keeps the link', function (assert) {
		const link = { link: 'https://a.example/', underline: true };
		const d = doc({
			...para(['x']),
			runs: [
				{ text: 'site', props: link },
				{ text: ' x', props: {} },
			],
		});
		const r = replaceRanges(d, findAll(d, 'e', true), 'E');
		assert.deepEqual((r.blocks[0] as Paragraph).runs[0], {
			text: 'sitE',
			props: link,
		});
	});
});
