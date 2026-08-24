import { module, test } from 'qunit';
import {
	DEFAULT_ARTBOARD,
	SCHEMA_VERSION,
	createEmptyDoc,
	createFreehandLayer,
	createRasterLayer,
	createShapeLayer,
	createTextLayer,
	identityTransform,
	stampLoadedDoc,
} from 'delphitools-v2/lib/substrata/doc-model';
import type {
	GroupLayer,
	Layer,
	ShapeLayer,
	SubstrataDoc,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	collectIds,
	flattenForPanel,
	findLayer,
	leafLayers,
	leafRenderList,
	mapLayerInTree,
	parentIdOf,
	removeLayers,
	selectableLeafIds,
	siblingListOf,
} from 'delphitools-v2/lib/substrata/layer-tree';

interface Flags {
	visible?: boolean;
	locked?: boolean;
	opacity?: number;
}

function leaf(id: string, flags: Flags = {}): ShapeLayer {
	return {
		...createShapeLayer({
			name: id,
			params: {
				shape: 'rectangle',
				width: 10,
				height: 10,
				cornerRadius: 0,
			},
			fill: '#000000',
			stroke: null,
			transform: identityTransform(),
		}),
		id,
		visible: flags.visible ?? true,
		locked: flags.locked ?? false,
		opacity: flags.opacity ?? 1,
	};
}

function group(id: string, children: Layer[], flags: Flags = {}): GroupLayer {
	return {
		kind: 'group',
		id,
		name: id,
		visible: flags.visible ?? true,
		locked: flags.locked ?? false,
		opacity: flags.opacity ?? 1,
		blendMode: 'source-over',
		transform: identityTransform(),
		filters: [],
		effects: [],
		children,
	};
}

// a·g[b·h[c]·d]·e; doc a g b h c d e; panel e g d h c b a
function fixture() {
	const a = leaf('a');
	const b = leaf('b');
	const c = leaf('c');
	const d = leaf('d');
	const e = leaf('e');
	const h = group('h', [c]);
	const g = group('g', [b, h, d]);
	return { layers: [a, g, e] as Layer[], a, b, c, d, e, g, h };
}

module('Unit | Substrata | doc-model', function () {
	test('a new scene opens empty at the default artboard', function (assert) {
		const doc = createEmptyDoc();
		assert.strictEqual(doc.schemaVersion, SCHEMA_VERSION);
		assert.strictEqual(doc.name, '');
		assert.strictEqual(doc.layers.length, 0);
		assert.strictEqual(doc.guides.length, 0);
		assert.deepEqual(doc.artboard, DEFAULT_ARTBOARD);
		assert.strictEqual(
			doc.createdAt,
			doc.updatedAt,
			'one timestamp for both fields',
		);
	});

	// shared constant; resize would mutate every later scene
	test('the artboard is copied, never the shared default', function (assert) {
		const doc = createEmptyDoc();
		assert.notStrictEqual(doc.artboard, DEFAULT_ARTBOARD);
		doc.artboard.width = 640;
		assert.strictEqual(DEFAULT_ARTBOARD.width, 2000);

		const supplied = { ...DEFAULT_ARTBOARD, width: 100 };
		const other = createEmptyDoc('other', supplied);
		other.artboard.width = 200;
		assert.strictEqual(
			supplied.width,
			100,
			'a supplied artboard is copied too',
		);
	});

	test('two documents never share an id', function (assert) {
		assert.notStrictEqual(createEmptyDoc().id, createEmptyDoc().id);
	});

	test('the identity transform is neutral, and is a fresh object each call', function (assert) {
		assert.deepEqual(identityTransform(), {
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			flipX: false,
			flipY: false,
		});
		assert.notStrictEqual(identityTransform(), identityTransform());
	});

	module('factories', function () {
		const raster = () =>
			createRasterLayer({
				name: 'photo',
				blobHash: 'abc123',
				naturalWidth: 800,
				naturalHeight: 600,
				transform: identityTransform(),
			});

		test('every kind starts visible, unlocked, opaque and normal-blended', function (assert) {
			const layers: Layer[] = [
				raster(),
				leaf('shape'),
				createTextLayer({
					name: 't',
					text: 'hi',
					fontFamily: 'sans',
					fontSize: 12,
					fill: '#000000',
					stroke: null,
					plate: null,
					transform: identityTransform(),
				}),
				createFreehandLayer({
					name: 'f',
					rawPoints: [[0, 0, 0.5]],
					strokeOptions: {
						size: 8,
						thinning: 0.5,
						smoothing: 0.5,
						streamline: 0.5,
						simulatePressure: true,
					},
					fill: '#000000',
					transform: identityTransform(),
				}),
			];
			for (const l of layers) {
				assert.true(l.visible, `${l.kind} visible`);
				assert.false(l.locked, `${l.kind} locked`);
				assert.strictEqual(
					l.opacity,
					1,
					`${l.kind} opacity`,
				);
				assert.strictEqual(
					l.blendMode,
					'source-over',
					`${l.kind} blend`,
				);
				assert.strictEqual(
					l.filters.length,
					0,
					`${l.kind} filters`,
				);
				assert.strictEqual(
					l.effects.length,
					0,
					`${l.kind} effects`,
				);
			}
		});

		test('no two layers share a filter or effect stack', function (assert) {
			const one = raster();
			const two = raster();
			assert.notStrictEqual(one.filters, two.filters);
			assert.notStrictEqual(one.effects, two.effects);
			assert.notStrictEqual(one.id, two.id);
			one.filters.push({
				id: 'f1',
				type: 'brightness',
				enabled: true,
				params: {},
			});
			assert.strictEqual(two.filters.length, 0);
		});

		test('the raster, shape and freehand factories carry their fields through', function (assert) {
			const r = raster();
			assert.strictEqual(r.kind, 'raster');
			assert.strictEqual(r.blobHash, 'abc123');
			assert.strictEqual(r.naturalWidth, 800);
			assert.strictEqual(r.naturalHeight, 600);

			const s = createShapeLayer({
				name: 'star',
				params: {
					shape: 'star',
					points: 5,
					outerRadius: 50,
					innerRadius: 20,
				},
				fill: {
					type: 'linear',
					stops: [
						{
							offset: 0,
							colour: '#000000',
						},
						{
							offset: 1,
							colour: '#ffffff',
						},
					],
					coords: { x1: 0, y1: 0, x2: 1, y2: 0 },
				},
				stroke: { colour: '#ff0000', width: 2 },
				transform: identityTransform(),
			});
			assert.deepEqual(s.params, {
				shape: 'star',
				points: 5,
				outerRadius: 50,
				innerRadius: 20,
			});
			assert.strictEqual(
				typeof s.fill === 'string'
					? null
					: s.fill.stops.length,
				2,
				'a gradient fill survives as a gradient',
			);
			assert.strictEqual(s.stroke?.width, 2);

			const points: [number, number, number][] = [
				[0, 0, 0.1],
				[5, 5, 0.9],
			];
			const f = createFreehandLayer({
				name: 'ink',
				rawPoints: points,
				strokeOptions: {
					size: 8,
					thinning: 0.5,
					smoothing: 0.5,
					streamline: 0.5,
					simulatePressure: false,
				},
				fill: '#123456',
				transform: identityTransform(),
			});
			assert.deepEqual(f.rawPoints, points);
			assert.false(f.strokeOptions.simulatePressure);
		});

		test('the text factory carries typography through, align included', function (assert) {
			const t = createTextLayer({
				name: 'title',
				text: 'hello',
				fontFamily: 'serif',
				fontSize: 48,
				fill: '#111111',
				stroke: { colour: '#ffffff', width: 3 },
				plate: {
					shape: 'pill',
					colour: '#eeeeee',
					padding: 12,
				},
				align: 'center',
				transform: identityTransform(),
			});
			assert.strictEqual(t.text, 'hello');
			assert.strictEqual(t.fontFamily, 'serif');
			assert.strictEqual(t.fontSize, 48);
			assert.strictEqual(t.stroke?.width, 3);
			assert.strictEqual(t.plate?.shape, 'pill');
			assert.strictEqual(t.plate?.padding, 12);
			assert.strictEqual(t.align, 'center');
		});

		test('the text factory keeps a null stroke and plate null', function (assert) {
			const t = createTextLayer({
				name: 'plain',
				text: 'x',
				fontFamily: 'sans',
				fontSize: 16,
				fill: '#000000',
				stroke: null,
				plate: null,
				transform: identityTransform(),
			});
			assert.strictEqual(t.stroke, null);
			assert.strictEqual(t.plate, null);
			assert.strictEqual(
				t.align,
				undefined,
				'align is left to the consumer default',
			);
		});
	});

	module('stampLoadedDoc', function () {
		// schema v1; guides key absent not empty
		function loadedV1(): SubstrataDoc {
			const doc = createEmptyDoc('old');
			return JSON.parse(
				JSON.stringify({
					...doc,
					schemaVersion: 1,
					guides: undefined,
				}),
			) as SubstrataDoc;
		}

		test('stamps a v1 doc forward and defaults the guides it predates', function (assert) {
			const v1 = loadedV1();
			assert.false(
				'guides' in v1,
				'precondition: no guides key',
			);

			const stamped = stampLoadedDoc(v1);
			assert.strictEqual(
				stamped.schemaVersion,
				SCHEMA_VERSION,
			);
			assert.strictEqual(stamped.guides.length, 0);
			assert.strictEqual(stamped.id, v1.id);
			assert.strictEqual(stamped.name, 'old');
		});

		test('leaves the doc it was handed untouched', function (assert) {
			const v1 = loadedV1();
			stampLoadedDoc(v1);
			assert.strictEqual(v1.schemaVersion, 1);
			assert.false('guides' in v1);
		});

		test('keeps the guides and layers a doc already has, by reference', function (assert) {
			const doc = createEmptyDoc('x');
			doc.guides.push({ id: 'g1', axis: 'x', pos: 40 });
			doc.layers.push(leaf('a'));

			const stamped = stampLoadedDoc(doc);
			assert.notStrictEqual(stamped, doc, 'a new doc object');
			assert.strictEqual(stamped.guides, doc.guides);
			assert.strictEqual(stamped.layers, doc.layers);
		});
	});
});

module('Unit | Substrata | layer-tree', function () {
	module('findLayer', function () {
		test('finds a layer at the root, in a group, and two groups deep', function (assert) {
			const f = fixture();
			assert.strictEqual(findLayer(f.layers, 'a'), f.a);
			assert.strictEqual(findLayer(f.layers, 'e'), f.e);
			assert.strictEqual(findLayer(f.layers, 'g'), f.g);
			assert.strictEqual(findLayer(f.layers, 'b'), f.b);
			assert.strictEqual(findLayer(f.layers, 'h'), f.h);
			assert.strictEqual(findLayer(f.layers, 'c'), f.c);
		});

		test('returns null for an id that is not there and for an empty tree', function (assert) {
			assert.strictEqual(
				findLayer(fixture().layers, 'zzz'),
				null,
			);
			assert.strictEqual(findLayer([], 'a'), null);
		});
	});

	module('collectIds and leafLayers', function () {
		test('lists every id depth-first, a group before its children', function (assert) {
			assert.deepEqual(collectIds(fixture().layers), [
				'a',
				'g',
				'b',
				'h',
				'c',
				'd',
				'e',
			]);
			assert.deepEqual(collectIds([]), []);
		});

		test('walks a group down to its leaves in doc order', function (assert) {
			const f = fixture();
			assert.deepEqual(
				leafLayers(f.g).map((l) => l.id),
				['b', 'c', 'd'],
			);
		});

		test('treats a non-group as its own only leaf', function (assert) {
			const f = fixture();
			assert.deepEqual(leafLayers(f.a), [f.a]);
		});

		test('finds no leaves under an empty group', function (assert) {
			assert.deepEqual(leafLayers(group('empty', [])), []);
		});
	});

	module('mapLayerInTree', function () {
		test('replaces a root layer and shares every sibling', function (assert) {
			const f = fixture();
			const next = mapLayerInTree(f.layers, 'a', (l) => ({
				...l,
				name: 'renamed',
			}));
			assert.notStrictEqual(next, f.layers);
			assert.strictEqual(next.length, 3);
			assert.strictEqual(next[0]?.name, 'renamed');
			assert.strictEqual(next[1], f.g, 'the untouched group');
			assert.strictEqual(next[2], f.e);
			assert.strictEqual(f.a.name, 'a', 'the input layer');
			assert.strictEqual(f.layers[0], f.a, 'the input list');
		});

		// full rebuild would balloon undo memory
		test('rebuilds only the path down to a nested layer', function (assert) {
			const f = fixture();
			const next = mapLayerInTree(f.layers, 'c', (l) => ({
				...l,
				opacity: 0.5,
			}));
			assert.strictEqual(next[0], f.a);
			assert.strictEqual(next[2], f.e);

			const g = next[1] as GroupLayer;
			assert.notStrictEqual(
				g,
				f.g,
				'the containing group is new',
			);
			assert.strictEqual(g.children[0], f.b);
			assert.strictEqual(g.children[2], f.d);

			const h = g.children[1] as GroupLayer;
			assert.notStrictEqual(h, f.h);
			assert.strictEqual(h.children[0]?.opacity, 0.5);
			assert.strictEqual(f.c.opacity, 1, 'the input layer');
			assert.strictEqual(
				f.h.children[0],
				f.c,
				'the input group',
			);
		});

		test('returns the very same array for an id that is not there', function (assert) {
			const f = fixture();
			let calls = 0;
			const next = mapLayerInTree(f.layers, 'zzz', (l) => {
				calls += 1;
				return l;
			});
			assert.strictEqual(next, f.layers);
			assert.strictEqual(calls, 0);
		});
	});

	module('removeLayers', function () {
		test('removes a root layer and reports it', function (assert) {
			const f = fixture();
			const { layers, removed } = removeLayers(
				f.layers,
				new Set(['a']),
			);
			assert.deepEqual(collectIds(layers), [
				'g',
				'b',
				'h',
				'c',
				'd',
				'e',
			]);
			assert.strictEqual(removed.length, 1);
			assert.strictEqual(removed[0], f.a);
			assert.strictEqual(
				f.layers.length,
				3,
				'the input list',
			);
		});

		test('removes a nested layer and rebuilds only its group', function (assert) {
			const f = fixture();
			const { layers } = removeLayers(
				f.layers,
				new Set(['c']),
			);
			assert.deepEqual(collectIds(layers), [
				'a',
				'g',
				'b',
				'h',
				'd',
				'e',
			]);
			assert.strictEqual(layers[0], f.a);
			assert.strictEqual(layers[2], f.e);
			const g = layers[1] as GroupLayer;
			assert.strictEqual(
				g.children[0],
				f.b,
				'the kept sibling',
			);
			assert.strictEqual(g.children[2], f.d);
			assert.strictEqual(
				f.h.children.length,
				1,
				'the input group still holds c',
			);
		});

		test('removes a group with everything under it, in one piece', function (assert) {
			const f = fixture();
			const { layers, removed } = removeLayers(
				f.layers,
				new Set(['g']),
			);
			assert.deepEqual(collectIds(layers), ['a', 'e']);
			assert.strictEqual(removed.length, 1);
			assert.strictEqual(
				removed[0],
				f.g,
				'the subtree comes back whole, so undo can put it back',
			);
		});

		test('reports removals in doc order across levels', function (assert) {
			const f = fixture();
			const { removed } = removeLayers(
				f.layers,
				new Set(['e', 'c', 'a']),
			);
			assert.deepEqual(
				removed.map((l) => l.id),
				['a', 'c', 'e'],
			);
		});

		test('is the identity for an empty set and for unknown ids', function (assert) {
			const f = fixture();
			const none = removeLayers(f.layers, new Set());
			assert.strictEqual(none.layers, f.layers);
			assert.strictEqual(none.removed.length, 0);

			const miss = removeLayers(f.layers, new Set(['zzz']));
			assert.strictEqual(miss.layers, f.layers);
			assert.strictEqual(miss.removed.length, 0);
		});

		test('can empty the tree', function (assert) {
			const f = fixture();
			const { layers, removed } = removeLayers(
				f.layers,
				new Set(['a', 'g', 'e']),
			);
			assert.deepEqual(layers, []);
			assert.strictEqual(removed.length, 3);
		});
	});

	module('parentIdOf and siblingListOf', function () {
		test('names the group a layer sits in, at every depth', function (assert) {
			const f = fixture();
			assert.strictEqual(parentIdOf(f.layers, 'a'), null);
			assert.strictEqual(parentIdOf(f.layers, 'g'), null);
			assert.strictEqual(parentIdOf(f.layers, 'b'), 'g');
			assert.strictEqual(parentIdOf(f.layers, 'h'), 'g');
			assert.strictEqual(
				parentIdOf(f.layers, 'c'),
				'h',
				'the immediate group, not the outer one',
			);
		});

		// null = at root, undefined = not in doc
		test('separates a root layer from one that is not in the tree', function (assert) {
			const f = fixture();
			assert.strictEqual(
				parentIdOf(f.layers, 'zzz'),
				undefined,
			);
			assert.strictEqual(parentIdOf([], 'a'), undefined);
			assert.strictEqual(parentIdOf(f.layers, 'a'), null);
		});

		test('hands back the list a layer lives in, by reference', function (assert) {
			const f = fixture();
			assert.strictEqual(
				siblingListOf(f.layers, 'a'),
				f.layers,
			);
			assert.strictEqual(
				siblingListOf(f.layers, 'g'),
				f.layers,
			);
			assert.strictEqual(
				siblingListOf(f.layers, 'b'),
				f.g.children,
			);
			assert.strictEqual(
				siblingListOf(f.layers, 'h'),
				f.g.children,
			);
			assert.strictEqual(
				siblingListOf(f.layers, 'c'),
				f.h.children,
			);
		});

		test('has no sibling list for an id that is not there', function (assert) {
			assert.strictEqual(
				siblingListOf(fixture().layers, 'zzz'),
				null,
			);
			assert.strictEqual(siblingListOf([], 'a'), null);
		});
	});

	module('leafRenderList', function () {
		const idsOf = (list: { layer: Layer }[]) =>
			list.map((entry) => entry.layer.id);

		test('flattens groups away and keeps doc order', function (assert) {
			const f = fixture();
			const entries = leafRenderList(f.layers);
			assert.deepEqual(idsOf(entries), [
				'a',
				'b',
				'c',
				'd',
				'e',
			]);
			assert.strictEqual(
				entries[1]?.layer,
				f.b,
				'entries point at the tree nodes themselves',
			);
		});

		test('renders nothing for an empty group or an empty tree', function (assert) {
			assert.deepEqual(
				leafRenderList([group('empty', [])]),
				[],
			);
			assert.deepEqual(leafRenderList([]), []);
		});

		// powers of two; exact in binary
		test('multiplies opacity down through every group', function (assert) {
			const c = leaf('c', { opacity: 0.5 });
			const b = leaf('b');
			const h = group('h', [c], { opacity: 0.5 });
			const g = group('g', [b, h], { opacity: 0.5 });
			const a = leaf('a', { opacity: 0.25 });
			const by = new Map(
				leafRenderList([a, g]).map((e) => [
					e.layer.id,
					e,
				]),
			);
			assert.strictEqual(by.get('a')?.opacity, 0.25);
			assert.strictEqual(by.get('b')?.opacity, 0.5);
			assert.strictEqual(by.get('c')?.opacity, 0.125);
		});

		test('a hidden group hides its descendants and nothing else', function (assert) {
			const c = leaf('c');
			const h = group('h', [c]);
			const g = group('g', [h], { visible: false });
			const a = leaf('a');
			const entries = leafRenderList([a, g]);
			assert.deepEqual(
				idsOf(entries),
				['a', 'c'],
				'still listed',
			);
			assert.true(entries[0]?.visible);
			assert.false(entries[1]?.visible);
		});

		test('a hidden leaf hides only itself', function (assert) {
			const entries = leafRenderList([
				group('g', [
					leaf('b', { visible: false }),
					leaf('d'),
				]),
			]);
			assert.false(entries[0]?.visible);
			assert.true(entries[1]?.visible);
		});

		test('a locked group locks its descendants and nothing else', function (assert) {
			const g = group('g', [group('h', [leaf('c')])], {
				locked: true,
			});
			const entries = leafRenderList([leaf('a'), g]);
			assert.false(entries[0]?.locked);
			assert.true(entries[1]?.locked);
		});
	});

	module('selectableLeafIds', function () {
		test('skips hidden and locked leaves', function (assert) {
			assert.deepEqual(
				selectableLeafIds([
					leaf('a'),
					leaf('hidden', { visible: false }),
					leaf('locked', { locked: true }),
					leaf('e'),
				]),
				['a', 'e'],
			);
		});

		test('skips everything under a hidden or locked group', function (assert) {
			assert.deepEqual(
				selectableLeafIds([
					group(
						'locked',
						[leaf('b'), leaf('c')],
						{
							locked: true,
						},
					),
					group('hidden', [leaf('d')], {
						visible: false,
					}),
					leaf('e'),
				]),
				['e'],
			);
		});

		test('selects nothing in an empty tree', function (assert) {
			assert.deepEqual(selectableLeafIds([]), []);
		});
	});

	module('flattenForPanel', function () {
		test('lists top-first at every level, with depth and parent', function (assert) {
			const rows = flattenForPanel(
				fixture().layers,
				new Set(),
			);
			assert.deepEqual(
				rows.map((r) => r.layer.id),
				['e', 'g', 'd', 'h', 'c', 'b', 'a'],
			);
			assert.deepEqual(
				rows.map((r) => r.depth),
				[0, 0, 1, 1, 2, 1, 0],
			);
			assert.deepEqual(
				rows.map((r) => r.parentId),
				[null, null, 'g', 'g', 'h', 'g', null],
			);
		});

		// panel top-down, doc bottom-up; lastChild gets └
		test('marks the bottom of each level as the last child', function (assert) {
			const rows = flattenForPanel(
				fixture().layers,
				new Set(),
			);
			assert.deepEqual(
				rows
					.filter((r) => r.lastChild)
					.map((r) => r.layer.id),
				['c', 'b', 'a'],
			);
		});

		test('a collapsed group keeps its own row and drops its descendants', function (assert) {
			const f = fixture();
			assert.deepEqual(
				flattenForPanel(f.layers, new Set(['g'])).map(
					(r) => r.layer.id,
				),
				['e', 'g', 'a'],
			);
			assert.deepEqual(
				flattenForPanel(f.layers, new Set(['h'])).map(
					(r) => r.layer.id,
				),
				['e', 'g', 'd', 'h', 'b', 'a'],
				'collapsing the inner group only hides c',
			);
		});

		test('collapsing an id that is not a group changes nothing', function (assert) {
			const f = fixture();
			assert.deepEqual(
				flattenForPanel(
					f.layers,
					new Set(['a', 'zzz']),
				).map((r) => r.layer.id),
				['e', 'g', 'd', 'h', 'c', 'b', 'a'],
			);
		});

		test('the trail records whether each ancestor was the bottom of its level', function (assert) {
			const f = fixture();
			const rows = flattenForPanel(f.layers, new Set());
			const rowFor = (id: string) =>
				rows.find((r) => r.layer.id === id);
			assert.deepEqual(rowFor('a')?.trail, [], 'a root row');
			assert.deepEqual(
				rowFor('d')?.trail,
				[false],
				'g is not the bottom of the root level',
			);
			assert.deepEqual(rowFor('c')?.trail, [false, false]);

			const deep = flattenForPanel(
				[group('g', [group('h', [leaf('c')])])],
				new Set(),
			);
			assert.deepEqual(
				deep.find((r) => r.layer.id === 'c')?.trail,
				[true, true],
				'both ancestors are the only, so the bottom, of their level',
			);
		});

		test('flattens an empty tree to no rows', function (assert) {
			assert.deepEqual(flattenForPanel([], new Set()), []);
		});
	});
});
