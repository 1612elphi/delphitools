import { module, test } from 'qunit';
import { parse, type Step } from 'delphitools-v2/lib/recipe-parse';
import {
	ingredients,
	layout,
	render,
	type Cell,
} from 'delphitools-v2/lib/recipe-layout';
import { toHtml, toPrintable, toText } from 'delphitools-v2/lib/recipe-export';
import { EXAMPLES } from 'delphitools-v2/lib/recipe-examples';

const SAMPLE = `title: Aglio e olio
serves: 2
units: metric

> Salt a large pot of water

fry | 2 min
- olive oil: 2 Tbsp
- garlic: 2 cloves / slice
- chilli flakes: 1 pinch
= sauce

boil | 9 min
- spaghetti: 200 g
- water: salted
drain
x most of the water
= pasta water
toss | 1 min
@ sauce
loosen
@ pasta water | ¼ cup
serve
- parmesan: 30 g | grated
- parsley: 1 handful / chop
- olive oil: 1 Tbsp`;

const MARKED = SAMPLE.replace(
	'serve\n- parmesan',
	'> have a little dance\nserve\n- parmesan',
);

const WRITTEN = { factor: 1, display: 'written' as const };

const steps = (step: Step): Step[] =>
	step.inputs.flatMap((input) =>
		input.kind === 'step' ? [input.step] : [],
	);
const labels = (step: Step) => steps(step).map((s) => s.label);
const at = (cells: Cell[], row: number, col: number) =>
	cells.find((c) => c.row === row && c.col === col);

module('Unit | lib | recipe-parse', function () {
	test('metadata is read from the head of the document', function (assert) {
		const recipe = parse(SAMPLE);
		assert.strictEqual(recipe.title, 'Aglio e olio');
		assert.strictEqual(recipe.serves, 2);
		assert.strictEqual(recipe.units, 'metric');
		assert.deepEqual(recipe.banners, ['Salt a large pot of water']);
		assert.deepEqual(
			recipe.notes,
			[],
			'a preamble note is a banner',
		);
		assert.deepEqual(recipe.problems, []);
	});

	test('a key: value line after the first step is a step', function (assert) {
		const recipe = parse('fry\n\nreduce: by half');
		assert.strictEqual(recipe.title, '');
		assert.strictEqual(recipe.root?.label, 'reduce: by half');
	});

	test('the last chain ends at the root', function (assert) {
		const root = parse(SAMPLE).root!;
		assert.strictEqual(root.label, 'serve');
		assert.deepEqual(
			root.inputs.map((i) => i.kind),
			['step', 'ing', 'step', 'ing'],
		);
	});

	test('an unprefixed line consumes the step above it', function (assert) {
		const root = parse(SAMPLE).root!;
		const loosen = steps(root)[0]!;
		const toss = steps(loosen)[0]!;
		const drain = steps(toss)[0]!;
		assert.strictEqual(loosen.label, 'loosen');
		assert.strictEqual(toss.label, 'toss');
		assert.strictEqual(drain.label, 'drain');
		assert.deepEqual(labels(drain), ['boil']);
	});

	test('a blank line starts a chain that does not consume the one above', function (assert) {
		const boil = parse(SAMPLE)
			.root!.inputs.flatMap((i) =>
				i.kind === 'step' ? [i.step] : [],
			)
			.at(0);
		assert.ok(boil, 'the chain resolved');
		const first = parse('a\n- x\n\nb\n- y').root!;
		assert.strictEqual(first.label, 'b');
		assert.deepEqual(
			first.inputs.map((i) => i.kind),
			['ing'],
		);
	});

	test('a slash on an ingredient line makes a prep step', function (assert) {
		const recipe = parse('fry\n- garlic: 2 cloves / slice | thin');
		const prep = steps(recipe.root!)[0]!;
		assert.strictEqual(prep.label, 'slice');
		assert.deepEqual(prep.detail, ['thin']);
		assert.deepEqual(prep.inputs, [
			{
				kind: 'ing',
				name: 'garlic',
				quantity: '2 cloves',
				detail: [],
			},
		]);
	});

	test('detail is pipe separated on every kind of line', function (assert) {
		const recipe = parse(
			'fry | 2 min | covered\n- oil: 1 Tbsp | cold',
		);
		assert.deepEqual(recipe.root!.detail, ['2 min', 'covered']);
		const ing = recipe.root!.inputs[0]!;
		assert.deepEqual(ing.kind === 'ing' ? ing.detail : [], [
			'cold',
		]);
	});

	test('the first use of a name inlines that chain', function (assert) {
		const root = parse(SAMPLE).root!;
		const toss = steps(steps(root)[0]!)[0]!;
		assert.deepEqual(labels(toss), ['drain', 'fry']);
	});

	test('a name used inside its own chain stays a link row', function (assert) {
		const loosen = steps(parse(SAMPLE).root!)[0]!;
		const ref = loosen.inputs.find((i) => i.kind === 'ref');
		assert.strictEqual(
			ref?.kind === 'ref' ? ref.name : '',
			'pasta water',
		);
		assert.deepEqual(ref?.kind === 'ref' ? ref.detail : [], [
			'¼ cup',
		]);
	});

	test('a second use of a name is a link row', function (assert) {
		const recipe = parse(
			'mix\n- flour\n= dough\n\nbake\n@ dough\n\nserve\n@ dough',
		);
		const bake = parse(
			'mix\n- flour\n= dough\n\nbake\n@ dough',
		).root!;
		assert.deepEqual(labels(bake), ['mix'], 'first use inlines');
		assert.deepEqual(
			recipe.root!.inputs.map((i) => i.kind),
			['ref'],
			'second use links',
		);
	});

	test('names resolve backwards only', function (assert) {
		const recipe = parse('bake\n@ dough\n\nmix\n- flour\n= dough');
		assert.deepEqual(
			recipe.problems.map((p) => p.message),
			['unknown name: dough', 'unused chain'],
		);
	});

	test('an attachment with no step above is a problem', function (assert) {
		const recipe = parse('- oil\n@ x\nx spent\n= name');
		assert.deepEqual(
			recipe.problems.map((p) => p.line),
			[1, 2, 3, 4],
		);
		assert.strictEqual(recipe.root, null);
	});

	test('an ingredient splits into a name and a quantity', function (assert) {
		const recipe = parse('boil\n- spaghetti: 200 g\n- water');
		assert.deepEqual(recipe.root!.inputs, [
			{
				kind: 'ing',
				name: 'spaghetti',
				quantity: '200 g',
				detail: [],
			},
			{
				kind: 'ing',
				name: 'water',
				quantity: '',
				detail: [],
			},
		]);
	});

	test('only the first colon splits the line', function (assert) {
		const recipe = parse('boil\n- stock: 1 l | ratio 2:1');
		const ing = recipe.root!.inputs[0]!;
		assert.strictEqual(ing.kind === 'ing' ? ing.name : '', 'stock');
		assert.strictEqual(
			ing.kind === 'ing' ? ing.quantity : '',
			'1 l',
		);
		assert.deepEqual(ing.kind === 'ing' ? ing.detail : [], [
			'ratio 2:1',
		]);
	});

	test('a chain nobody references is a problem', function (assert) {
		const recipe = parse('mix\n- flour\n\nbake\n- salt');
		assert.deepEqual(recipe.problems, [
			{ line: 1, message: 'unused chain' },
		]);
	});

	test('a duplicate name is a problem', function (assert) {
		const recipe = parse('mix\n= a\n\nstir\n= a\n\nbake\n@ a');
		assert.ok(
			recipe.problems.some((p) =>
				p.message.startsWith('duplicate name'),
			),
		);
	});

	test('x needs a space to be a discard', function (assert) {
		const recipe = parse('boil\n- water\nxanthan gum');
		assert.strictEqual(recipe.root!.label, 'xanthan gum');
		assert.deepEqual(recipe.root!.discard, []);
	});

	test('an empty document has no root', function (assert) {
		const recipe = parse('');
		assert.strictEqual(recipe.root, null);
		assert.deepEqual(recipe.problems, []);
	});
});

module('Unit | lib | recipe-layout', function () {
	test('leaves stack in column 0 and steps march right', function (assert) {
		const { cells, rows, cols } = layout(
			parse(SAMPLE).root,
			WRITTEN,
		);
		assert.strictEqual(rows, 9);
		assert.strictEqual(cols, 6);
		assert.strictEqual(at(cells, 0, 0)?.text, '200 g spaghetti');
		assert.strictEqual(at(cells, 1, 0)?.text, 'salted water');
		assert.strictEqual(at(cells, 0, 1)?.text, 'boil');
		assert.strictEqual(at(cells, 0, 2)?.text, 'drain');
		assert.strictEqual(at(cells, 2, 2)?.text, 'fry');
		assert.strictEqual(at(cells, 0, 3)?.text, 'toss');
		assert.strictEqual(at(cells, 0, 5)?.text, 'serve');
	});

	test('a step spans the rows of everything feeding it', function (assert) {
		const { cells } = layout(parse(SAMPLE).root, WRITTEN);
		assert.strictEqual(at(cells, 0, 1)?.rows, 2, 'boil');
		assert.strictEqual(at(cells, 2, 2)?.rows, 3, 'fry');
		assert.strictEqual(at(cells, 0, 5)?.rows, 9, 'serve');
	});

	test('discards and names ride on their own step', function (assert) {
		const { cells } = layout(parse(SAMPLE).root, WRITTEN);
		const drain = at(cells, 0, 2)!;
		assert.deepEqual(drain.discard, ['most of the water']);
		assert.strictEqual(drain.name, 'pasta water');
	});

	test('a link row keeps its note', function (assert) {
		const { cells } = layout(parse(SAMPLE).root, WRITTEN);
		const ref = cells.find((c) => c.kind === 'ref')!;
		assert.strictEqual(ref.text, 'pasta water');
		assert.deepEqual(ref.detail, ['¼ cup']);
	});

	test('every square is covered exactly once', function (assert) {
		const { cells, rows, cols } = layout(
			parse(SAMPLE).root,
			WRITTEN,
		);
		const seen = Array.from({ length: rows }, () =>
			new Array<number>(cols).fill(0),
		);
		for (const cell of cells)
			for (let r = cell.row; r < cell.row + cell.rows; r++)
				for (
					let c = cell.col;
					c < cell.col + cell.cols;
					c++
				)
					seen[r]![c]! += 1;
		assert.ok(
			seen.every((line) => line.every((n) => n === 1)),
			'no gap and no overlap',
		);
	});

	test('a note marks the step written after it', function (assert) {
		const { cells } = layout(parse(MARKED).root, WRITTEN);
		const marked = cells
			.filter((c) => c.marks.length)
			.map((c) => `${c.marks.join()} ${c.text}`)
			.sort();
		assert.deepEqual(marked, ['1 serve']);
	});

	test('every other cell is unmarked', function (assert) {
		const { cells } = layout(parse(MARKED).root, WRITTEN);
		assert.strictEqual(
			cells.filter((c) => c.marks.length).length,
			1,
		);
	});

	test('a note above the first step is a banner', function (assert) {
		const recipe = parse('> heat the oven\n\nbake\n- dough: 400 g');
		assert.deepEqual(recipe.banners, ['heat the oven']);
		assert.deepEqual(recipe.notes, [], 'it is not numbered');
		const { cells, rows, cols } = layout(
			recipe.root,
			WRITTEN,
			recipe.banners,
		);
		const banner = cells.find((c) => c.kind === 'banner')!;
		assert.strictEqual(banner.text, 'heat the oven');
		assert.strictEqual(banner.row, 0, 'it sits on top');
		assert.strictEqual(banner.col, 0);
		assert.strictEqual(banner.cols, cols, 'and spans the table');
		assert.ok(
			cells.every((c) => c.marks.length === 0),
			'it hangs on no step',
		);
		assert.strictEqual(
			rows,
			layout(recipe.root, WRITTEN).rows + 1,
			'the table grew by one row',
		);
	});

	test('a banner pushes the tree down without gaps', function (assert) {
		const recipe = parse(SAMPLE);
		const { cells, rows, cols } = layout(
			recipe.root,
			WRITTEN,
			recipe.banners,
		);
		const seen = Array.from({ length: rows }, () =>
			new Array<number>(cols).fill(0),
		);
		for (const cell of cells)
			for (let r = cell.row; r < cell.row + cell.rows; r++)
				for (
					let c = cell.col;
					c < cell.col + cell.cols;
					c++
				)
					seen[r]![c]! += 1;
		assert.ok(
			seen.every((line) => line.every((n) => n === 1)),
			'every square still covered exactly once',
		);
		assert.strictEqual(
			cells.find((c) => c.text === '200 g spaghetti')?.row,
			1,
			'the first leaf moved below the banner',
		);
	});

	test('a note below the first step is numbered and marks', function (assert) {
		const recipe = parse(
			'> heat the oven\n\nmix\n- dough: 400 g\n> wait\nbake',
		);
		const { cells } = layout(recipe.root, WRITTEN);
		const marked = cells.filter((c) => c.marks.length);
		assert.deepEqual(recipe.banners, ['heat the oven']);
		assert.deepEqual(
			recipe.notes,
			['wait'],
			'numbering skips banners',
		);
		assert.deepEqual(
			marked.map((c) => `${c.marks.join()} ${c.text}`),
			['1 bake'],
		);
	});

	test('several notes in a row stack on one step', function (assert) {
		const recipe = parse('boil\n- water\n\n> one\n> two\nserve');
		const { cells } = layout(recipe.root, WRITTEN);
		const serve = cells.find((c) => c.text === 'serve')!;
		assert.deepEqual(serve.marks, [1, 2]);
		assert.deepEqual(recipe.notes, ['one', 'two']);
	});

	test('a note after the last step marks nothing', function (assert) {
		const recipe = parse('boil\n- water\n> afterwards');
		const { cells } = layout(recipe.root, WRITTEN);
		assert.deepEqual(recipe.notes, ['afterwards']);
		assert.ok(cells.every((c) => c.marks.length === 0));
	});

	test('a note does not break the chain it sits in', function (assert) {
		const root = parse(MARKED).root!;
		assert.strictEqual(root.label, 'serve');
		assert.deepEqual(labels(root), ['loosen', 'chop']);
	});

	test('an empty recipe lays out nothing', function (assert) {
		assert.deepEqual(layout(null, WRITTEN), {
			cells: [],
			rows: 0,
			cols: 0,
		});
	});

	test('scale is applied to the cells, never to the source', function (assert) {
		const recipe = parse(SAMPLE);
		const doubled = layout(recipe.root, {
			factor: 2,
			display: 'written',
		});
		assert.strictEqual(
			at(doubled.cells, 0, 0)?.text,
			'400 g spaghetti',
		);
		assert.strictEqual(
			at(layout(recipe.root, WRITTEN).cells, 0, 0)?.text,
			'200 g spaghetti',
			'the parsed recipe is untouched',
		);
	});

	test('the ingredient list is generated from the leaves', function (assert) {
		const list = ingredients(parse(SAMPLE).root, WRITTEN);
		assert.deepEqual(
			list.map((i) => i.name),
			[
				'spaghetti',
				'water',
				'olive oil',
				'garlic',
				'chilli flakes',
				'parmesan',
				'parsley',
			],
			'one line per name, in the order the table reaches them',
		);
	});

	test('a split ingredient is summed once for the list', function (assert) {
		const list = ingredients(parse(SAMPLE).root, WRITTEN);
		const oil = list.find((i) => i.name === 'olive oil');
		assert.strictEqual(oil?.amount, '3 Tbsp', '2 Tbsp plus 1 Tbsp');
	});

	test('but each use keeps its own amount in the table', function (assert) {
		const { cells } = layout(parse(SAMPLE).root, WRITTEN);
		const oils = cells
			.filter((c) => c.text.includes('olive oil'))
			.map((c) => c.text)
			.sort();
		assert.deepEqual(oils, [
			'1 Tbsp olive oil',
			'2 Tbsp olive oil',
		]);
	});

	test('amounts that will not add are joined, not lost', function (assert) {
		const list = ingredients(
			parse('boil\n- salt: a pinch\n- salt: 1 tsp').root,
			WRITTEN,
		);
		assert.deepEqual(list, [
			{ name: 'salt', amount: '1 tsp + a pinch' },
		]);
	});

	test('a single written amount keeps the unit it was written in', function (assert) {
		const list = ingredients(
			parse('boil\n- potatoes: 4 cups\n- stock: 2 l').root,
			WRITTEN,
		);
		assert.deepEqual(
			list.map((i) => `${i.name} ${i.amount}`),
			['potatoes 4 cups', 'stock 2 l'],
		);
	});

	test('but a sum has to pick one, and converting still converts', function (assert) {
		const split = parse('boil\n- oil: 2 Tbsp\n- oil: 1 cup');
		assert.deepEqual(ingredients(split.root, WRITTEN), [
			{ name: 'oil', amount: '1⅛ cups' },
		]);
		assert.deepEqual(
			ingredients(parse('boil\n- potatoes: 4 cups').root, {
				factor: 1,
				display: 'metric',
			}),
			[{ name: 'potatoes', amount: '960 ml' }],
		);
	});

	test('a quantity-less ingredient lists as a bare name', function (assert) {
		const list = ingredients(
			parse('boil\n- parsley').root,
			WRITTEN,
		);
		assert.deepEqual(list, [{ name: 'parsley', amount: '' }]);
	});

	test('the list scales and converts with the view', function (assert) {
		const doubled = ingredients(parse(SAMPLE).root, {
			factor: 2,
			display: 'written',
		});
		assert.strictEqual(
			doubled.find((i) => i.name === 'spaghetti')?.amount,
			'400 g',
		);
		const imperial = ingredients(parse(SAMPLE).root, {
			factor: 1,
			display: 'imperial',
		});
		assert.strictEqual(
			imperial.find((i) => i.name === 'spaghetti')?.amount,
			'7 oz',
		);
	});

	test('render carries the title and notes through the view', function (assert) {
		const out = render(parse(SAMPLE), WRITTEN);
		assert.strictEqual(out.title, 'Aglio e olio');
		assert.deepEqual(out.banners, ['Salt a large pot of water']);
		assert.deepEqual(out.notes, []);
		assert.strictEqual(
			out.grid.rows,
			10,
			'nine rows of tree plus the banner',
		);
	});
});

module('Unit | lib | recipe-export', function () {
	test('text export leads with the title, then the shopping list, then the notes', function (assert) {
		const text = toText(render(parse(SAMPLE), WRITTEN));
		assert.strictEqual(text.split('\n')[0], 'Aglio e olio');
		const at = (needle: string) => text.indexOf(needle);
		assert.ok(at('olive oil: 3 Tbsp') > 0, 'the summed list');
		assert.ok(
			at('olive oil: 3 Tbsp') <
				at('Salt a large pot of water'),
			'list before the banner',
		);
		assert.ok(
			at('Salt a large pot of water') < at('200 g spaghetti'),
			'and the banner heads the table',
		);
		assert.ok(
			toText(render(parse(MARKED), WRITTEN)).includes(
				'(1) serve',
			),
			'a marked step names its note',
		);
		assert.ok(text.includes('✕ most of the water'), 'discard');
		assert.ok(text.includes('↩ pasta water'), 'link row');
	});

	test('the printable document wraps the exported table', function (assert) {
		const out = render(parse(MARKED), WRITTEN);
		const doc = toPrintable(out);
		assert.ok(
			doc.startsWith('<!doctype html>'),
			'a whole document',
		);
		assert.ok(
			doc.includes('<title>Aglio e olio</title>'),
			'the title names the saved file',
		);
		assert.ok(
			doc.includes('iAWriterQuattroV.woff2'),
			'the brand face',
		);
		assert.ok(
			doc.includes(toHtml(out)),
			'the exact exported table',
		);
	});

	test('a title-less recipe still names the print document', function (assert) {
		const doc = toPrintable(
			render(parse('boil\n- water'), WRITTEN),
		);
		assert.ok(doc.includes('<title>Recipe</title>'));
	});

	test('cell parts are tagged so print can style them', function (assert) {
		const html = toHtml(render(parse(SAMPLE), WRITTEN));
		assert.ok(
			html.includes('<span class="l">boil</span>'),
			'label',
		);
		assert.ok(
			html.includes('<span class="d">9 min</span>'),
			'detail',
		);
		assert.ok(
			html.includes(
				'<span class="x">✕ most of the water</span>',
			),
			'discard',
		);
		assert.ok(
			html.includes('<span class="n">[pasta water]</span>'),
			'name',
		);
	});

	test('note numbers in the list match the ones in the cells', function (assert) {
		const out = render(parse(MARKED), WRITTEN);
		const text = toText(out);
		assert.ok(text.includes('1. have a little dance'), 'the list');
		assert.ok(text.includes('(1) serve'), 'the cell');
		assert.ok(
			toHtml(out).includes('1. have a little dance'),
			'html carries the number too',
		);
		assert.ok(
			toHtml(out).includes('class="banner"'),
			'and the banner is a row of the table',
		);
	});
});

module('Unit | lib | recipe-examples', function () {
	test('every example has an id, a name and a source', function (assert) {
		const ids = EXAMPLES.map((e) => e.id);
		assert.ok(EXAMPLES.length > 0);
		assert.strictEqual(
			new Set(ids).size,
			ids.length,
			'ids are unique',
		);
		for (const example of EXAMPLES) {
			assert.ok(example.name, `${example.id} is named`);
			assert.ok(
				example.category,
				`${example.id} is categorised`,
			);
		}
	});

	for (const example of EXAMPLES)
		test(`${example.id} parses clean and lays out`, function (assert) {
			const recipe = parse(example.text);
			assert.deepEqual(recipe.problems, [], 'no diagnostics');
			assert.ok(recipe.root, 'it has a root');
			assert.strictEqual(
				recipe.title,
				example.name,
				'the title matches the picker',
			);

			const { cells, rows, cols } = layout(
				recipe.root,
				WRITTEN,
			);
			assert.ok(rows > 0, 'it has rows');
			assert.ok(cols > 1, 'it has columns');
			const seen = Array.from({ length: rows }, () =>
				new Array<number>(cols).fill(0),
			);
			for (const cell of cells)
				for (
					let r = cell.row;
					r < cell.row + cell.rows;
					r++
				)
					for (
						let c = cell.col;
						c < cell.col + cell.cols;
						c++
					)
						seen[r]![c]! += 1;
			assert.ok(
				seen.every((line) =>
					line.every((n) => n === 1),
				),
				'every square covered once',
			);

			assert.ok(
				ingredients(recipe.root, WRITTEN).length > 0,
				'it lists ingredients',
			);
		});

	test('every example scales and converts without throwing', function (assert) {
		for (const example of EXAMPLES) {
			const recipe = parse(example.text);
			for (const display of [
				'written',
				'metric',
				'imperial',
			] as const) {
				const out = render(recipe, {
					factor: 2.5,
					display,
				});
				assert.ok(
					out.grid.rows > 0,
					`${example.id} at ${display}`,
				);
			}
		}
	});
});
