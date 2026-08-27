import { module, test } from 'qunit';
import { layout, type Op as TreeOp } from 'delphitools-v2/lib/recipe-table';
import { parse, serialize } from 'delphitools-v2/lib/recipe-dsl';
import {
	addRef,
	moveInputTo,
	moveOpTo,
	present,
	removeSection,
	targets,
	toTree,
	validate,
} from 'delphitools-v2/lib/recipe-doc';
import { toHtml, toPdf, toText } from 'delphitools-v2/lib/recipe-export';
import type { Input } from 'delphitools-v2/lib/recipe-doc';

const textOf = (input: Input) =>
	input.kind === 'ing' ? input.text : input.note;
const prepOf = (input: Input) => (input.kind === 'ing' ? input.prep : '');
const targetOf = (input: Input) => (input.kind === 'ref' ? input.target : '');

const PASTA = `title: Aglio e olio
serves: 2

> Salt a large pot of water

## sauce
fry | 2 min
- 2 Tbsp olive oil
- 2 cloves garlic | slice

## pasta
boil | 9 min
- 200 g spaghetti

drain = pasta water
x most of the water

toss (sauce) | 1 min

loosen (pasta water: ¼ cup)

serve
- parsley | chop`;

const grid = (text: string) => layout(toTree(parse(text).doc));

module('Unit | lib | recipe-dsl', function () {
	test('parses a document with sections, references and prep', function (assert) {
		const { doc, errors } = parse(PASTA);
		assert.deepEqual(errors, []);
		assert.strictEqual(doc.title, 'Aglio e olio');
		assert.strictEqual(doc.serves, 2);
		assert.deepEqual(
			doc.preps.map((p) => p.text),
			['Salt a large pot of water'],
		);
		assert.deepEqual(
			doc.sections.map((s) => s.name),
			['sauce', 'pasta'],
		);
		const [sauce, pasta] = doc.sections;
		assert.strictEqual(sauce!.ops[0]!.inputs[1]!.kind, 'ing');
		const garlic = sauce!.ops[0]!.inputs[1]!;
		assert.strictEqual(prepOf(garlic), 'slice');
		const toss = pasta!.ops[2]!;
		assert.strictEqual(toss.inputs[0]!.kind, 'ref');
		assert.strictEqual(targetOf(toss.inputs[0]!), sauce!.id);
		const loosen = pasta!.ops[3]!;
		const link = loosen.inputs[0]!;
		assert.strictEqual(targetOf(link), pasta!.ops[1]!.id);
		assert.strictEqual(textOf(link), '¼ cup');
		assert.deepEqual(pasta!.ops[1]!.discard, ['most of the water']);
	});

	test('reports orphans and unknown names; a self reference is the chain', function (assert) {
		assert.deepEqual(parse('- flour\nmix').errors, [
			{ line: 1, message: 'no operation above' },
		]);
		assert.deepEqual(
			parse('## a\nmix\n- x\n## b\nstir (a, c)').errors,
			[{ line: 5, message: 'unknown section' }],
		);
		const { doc, errors } = parse('## a\nmix\n- x\nstir (a)');
		assert.deepEqual(errors, []);
		assert.strictEqual(doc.sections[0]!.ops[1]!.label, 'stir');
		assert.strictEqual(doc.sections[0]!.ops[1]!.inputs.length, 0);
	});

	test('serialize round-trips the canonical form', function (assert) {
		const { doc } = parse(PASTA);
		assert.strictEqual(serialize(doc), PASTA);
		const again = parse(serialize(doc)).doc;
		assert.strictEqual(serialize(again), PASTA);
	});
});

module('Unit | lib | recipe-doc', function () {
	test('validate finds unused, unreachable, duplicate and empty', function (assert) {
		const { doc } = parse('## a\nmix\n- x\n## b\nstir\n- y');
		assert.deepEqual(
			validate(doc).map((p) => p.message),
			['unused section'],
		);
		const empty = parse('## a\n## b\nstir\n- y').doc;
		assert.deepEqual(
			validate(empty).map((p) => p.message),
			['no operations'],
		);
		const dup = parse('## a\nmix = a\n- x\n## b\nstir (a)').doc;
		assert.deepEqual(
			validate(dup)
				.map((p) => p.message)
				.sort(),
			['duplicate name', 'duplicate name'],
		);
		const base = parse(PASTA).doc;
		const gone = removeSection(base, base.sections[0]!.id);
		assert.deepEqual(
			validate(gone).map((p) => p.message),
			['unreachable target'],
		);
	});

	test('targets are earlier sections and earlier named results', function (assert) {
		const { doc } = parse(PASTA);
		const pasta = doc.sections[1]!;
		assert.deepEqual(
			targets(doc, pasta.ops[0]!.id).map((t) => t.label),
			['sauce'],
		);
		assert.deepEqual(
			targets(doc, pasta.ops[3]!.id).map((t) => t.label),
			['sauce', 'pasta water'],
		);
		assert.deepEqual(targets(doc, doc.sections[0]!.ops[0]!.id), []);
	});

	test('moves keep ids and change containment', function (assert) {
		const { doc } = parse(PASTA);
		const [sauce, pasta] = doc.sections;
		const oil = sauce!.ops[0]!.inputs[0]!;
		const moved = moveInputTo(doc, oil.id, pasta!.ops[0]!.id, 0);
		assert.strictEqual(moved.sections[0]!.ops[0]!.inputs.length, 1);
		assert.strictEqual(
			moved.sections[1]!.ops[0]!.inputs[0]!.id,
			oil.id,
		);
		const fry = sauce!.ops[0]!;
		const ops = moveOpTo(doc, fry.id, pasta!.id, 1);
		assert.deepEqual(
			ops.sections[1]!.ops.map((op) => op.label),
			['boil', 'fry', 'drain', 'toss', 'loosen', 'serve'],
		);
		assert.strictEqual(ops.sections[0]!.ops.length, 0);
	});

	test('toTree inlines the first use and links later uses', function (assert) {
		const { doc } = parse(PASTA);
		const root = toTree(doc)!;
		assert.strictEqual(root.label, 'serve');
		assert.strictEqual(root.name, '');
		const loosen = root.children[0] as TreeOp;
		assert.deepEqual(
			loosen.children.map((c) => c.kind),
			['op', 'ref'],
		);
		const toss = loosen.children[0] as TreeOp;
		const sauce = toss.children[1] as TreeOp;
		assert.strictEqual(sauce.name, 'sauce');
		assert.strictEqual(sauce.label, 'fry');
		const twice = addRef(
			doc,
			doc.sections[1]!.ops[3]!.id,
			doc.sections[0]!.id,
		);
		const again = toTree(twice)!;
		const loosen2 = again.children[0] as TreeOp;
		assert.deepEqual(
			loosen2.children.map((c) => c.kind),
			['op', 'ref', 'ref'],
		);
	});

	test('present scales every text field and rewrites settings', function (assert) {
		const { doc } = parse(PASTA);
		const out = present(doc, 2, 'metric', 4);
		assert.strictEqual(out.serves, 4);
		assert.strictEqual(out.units, 'metric');
		const oil = out.sections[0]!.ops[0]!.inputs[0]!;
		assert.strictEqual(textOf(oil), '60 ml olive oil');
		const link = out.sections[1]!.ops[3]!.inputs[0]!;
		assert.strictEqual(textOf(link), '120 ml');
	});
});

module('Unit | lib | recipe-table layout', function () {
	test('tiles the grid exactly once, in cooking order', function (assert) {
		const g = grid(PASTA);
		assert.strictEqual(g.rows, 5);
		const covered = Array.from({ length: g.rows }, () =>
			new Array<number>(g.cols).fill(0),
		);
		for (const cell of g.cells)
			for (let r = cell.row; r < cell.row + cell.rows; r++)
				for (
					let c = cell.col;
					c < cell.col + cell.cols;
					c++
				)
					covered[r]![c]!++;
		assert.true(covered.flat().every((n) => n === 1));
		const ops = g.cells
			.filter((c) => c.kind === 'op')
			.map((c) => c.text);
		assert.deepEqual(ops, [
			'boil',
			'drain',
			'slice',
			'fry',
			'toss',
			'loosen',
			'chop',
			'serve',
		]);
		const root = g.cells.find((c) => c.text === 'serve')!;
		assert.strictEqual(root.rows, g.rows);
		assert.true(root.opId.length > 0);
	});

	test('empty input is an empty grid', function (assert) {
		assert.deepEqual(layout(toTree(parse('').doc)), {
			cells: [],
			rows: 0,
			cols: 0,
		});
	});
});

module('Unit | lib | recipe-export', function () {
	const meta = {
		title: 'Aglio e olio',
		preps: ['Salt a large pot of water'],
	};

	test('html table covers every square with a cell', function (assert) {
		const g = grid(PASTA);
		const html = toHtml(meta, g);
		assert.true(html.includes('rowspan="5"'));
		assert.strictEqual(
			(html.match(/<tr>/g) ?? []).length,
			g.rows + 1,
		);
		assert.strictEqual(
			(html.match(/<td/g) ?? []).length,
			g.cells.length + 1,
		);
		assert.true(html.includes('class="op"'));
	});

	test('text export is tab separated', function (assert) {
		const text = toText(meta, grid(PASTA));
		assert.true(
			text.startsWith(
				'Aglio e olio\n\nSalt a large pot of water\n\n',
			),
		);
		assert.true(text.includes('\t'));
	});

	test('pdf is a single page sized to the table', async function (assert) {
		const bytes = await toPdf(meta, grid(PASTA));
		assert.strictEqual(
			new TextDecoder().decode(bytes.slice(0, 5)),
			'%PDF-',
		);
		const { PDFDocument } = await import('pdf-lib');
		const doc = await PDFDocument.load(bytes);
		assert.strictEqual(doc.getPageCount(), 1);
		const { width, height } = doc.getPage(0).getSize();
		assert.true(width > 300, String(width));
		assert.true(width < 600, String(width));
		assert.true(height > 200, String(height));
		assert.true(height < 500, String(height));
	});
});
