/*
 * every op returns NEW doc; untouched branches shared by REFERENCE.
 * doc order bottom→top; "front"/"forward" move ids toward END.
 */

import { module, test } from 'qunit';
import {
	canUndo,
	getSnapshot,
	setDoc,
	undo,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	getSelectedLayerIds,
	setSelection,
} from 'delphitools-v2/lib/substrata/selection';
import {
	deleteLayer,
	deleteLayers,
	duplicateLayer,
	duplicateLayers,
	groupLayers,
	insertAfter,
	moveLayer,
	nudgeSelection,
	reorderLayers,
	setFill,
	setSiblingOrder,
	setTransforms,
	ungroupLayer,
} from 'delphitools-v2/lib/substrata/layer-ops';
import {
	DEFAULT_ARTBOARD,
	SCHEMA_VERSION,
} from 'delphitools-v2/lib/substrata/doc-model';
import type {
	FreehandLayer,
	Gradient,
	GroupLayer,
	Layer,
	RasterLayer,
	ShapeLayer,
	SubstrataDoc,
	Transform,
} from 'delphitools-v2/lib/substrata/doc-model';

function xform(x = 0, y = 0): Transform {
	return {
		x,
		y,
		scaleX: 1,
		scaleY: 1,
		angle: 0,
		flipX: false,
		flipY: false,
	};
}

function base(id: string, x = 0, y = 0) {
	return {
		id,
		name: id,
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over' as const,
		transform: xform(x, y),
		filters: [],
		effects: [],
	};
}

function leaf(id: string, x = 0, y = 0): RasterLayer {
	return {
		...base(id, x, y),
		kind: 'raster',
		blobHash: `blob-${id}`,
		naturalWidth: 100,
		naturalHeight: 80,
	};
}

function group(id: string, children: Layer[]): GroupLayer {
	return { ...base(id), kind: 'group', children };
}

function shape(id: string, fill: ShapeLayer['fill']): ShapeLayer {
	return {
		...base(id),
		kind: 'shape',
		params: {
			shape: 'rectangle',
			width: 10,
			height: 10,
			cornerRadius: 0,
		},
		fill,
		stroke: null,
	};
}

function freehand(id: string, fill: string): FreehandLayer {
	return {
		...base(id),
		kind: 'freehand',
		rawPoints: [[0, 0, 0.5]],
		strokeOptions: {
			size: 8,
			thinning: 0.5,
			smoothing: 0.5,
			streamline: 0.5,
			simulatePressure: true,
		},
		fill,
	};
}

const GRADIENT: Gradient = {
	type: 'linear',
	stops: [
		{ offset: 0, colour: '#000000' },
		{ offset: 1, colour: '#ffffff' },
	],
	coords: { x1: 0, y1: 0, x2: 1, y2: 0 },
};

/** installs doc and returns it so tests can assert ops never touched it */
function load(layers: Layer[]): SubstrataDoc {
	const doc: SubstrataDoc = {
		id: 'doc-1',
		schemaVersion: SCHEMA_VERSION,
		name: 'test',
		artboard: { ...DEFAULT_ARTBOARD },
		layers,
		guides: [],
		createdAt: 1,
		updatedAt: 1,
	};
	setDoc(doc);
	return doc;
}

function live(): SubstrataDoc {
	const doc = getSnapshot();
	if (!doc) throw new Error('no doc loaded');
	return doc;
}

/** doc order as string, e.g. 'a,g(b,c),d' */
function tree(layers: readonly Layer[] = live().layers): string {
	return layers
		.map((l) =>
			l.kind === 'group'
				? `${l.id}(${tree(l.children)})`
				: l.id,
		)
		.join(',');
}

function findMaybe(layers: readonly Layer[], id: string): Layer | null {
	for (const l of layers) {
		if (l.id === id) return l;
		if (l.kind === 'group') {
			const hit = findMaybe(l.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

function find(id: string, layers: readonly Layer[] = live().layers): Layer {
	const hit = findMaybe(layers, id);
	if (!hit) throw new Error(`no layer ${id}`);
	return hit;
}

function kids(id: string): readonly Layer[] {
	const g = find(id);
	if (g.kind !== 'group') throw new Error(`${id} is not a group`);
	return g.children;
}

module('Unit | Substrata | layer-ops', function (hooks) {
	hooks.afterEach(function () {
		setDoc(null);
		setSelection([], { anchor: null });
	});

	module('insertAfter', function () {
		test('places the node directly after its target', function (assert) {
			const list = [leaf('a'), leaf('b'), leaf('c')];
			const out = insertAfter(list, 'a', leaf('n'));
			assert.strictEqual(tree(out), 'a,n,b,c');
			assert.strictEqual(
				tree(list),
				'a,b,c',
				'the input list is untouched',
			);
		});

		test('appends when the target is the last element', function (assert) {
			const out = insertAfter(
				[leaf('a'), leaf('b')],
				'b',
				leaf('n'),
			);
			assert.strictEqual(tree(out), 'a,b,n');
		});

		// only group on path may rebuild; else siblings re-render, history stops sharing
		test('descends into a group and rebuilds only that path', function (assert) {
			const outside = leaf('z');
			const g = group('g', [leaf('x'), leaf('y')]);
			const list = [outside, g];
			const out = insertAfter(list, 'x', leaf('n'));
			assert.strictEqual(tree(out), 'z,g(x,n,y)');
			assert.strictEqual(
				out[0],
				outside,
				'unrelated sibling shared',
			);
			assert.notStrictEqual(
				out[1],
				g,
				'the group on the path is new',
			);
			assert.strictEqual(
				tree(list),
				'z,g(x,y)',
				'input untouched',
			);
		});

		test('returns the very same array when the target is missing', function (assert) {
			const list = [leaf('a'), group('g', [leaf('x')])];
			assert.strictEqual(
				insertAfter(list, 'nope', leaf('n')),
				list,
			);
		});
	});

	module('duplicateLayers', function () {
		test('drops the copy right after its source and selects it', function (assert) {
			load([leaf('a'), leaf('b')]);
			duplicateLayers(['a']);
			const order = live().layers.map((l) => l.id);
			assert.strictEqual(order.length, 3);
			assert.strictEqual(order[0], 'a');
			assert.strictEqual(order[2], 'b');
			assert.notStrictEqual(
				order[1],
				'a',
				'the copy has a fresh id',
			);
			assert.deepEqual(
				[...getSelectedLayerIds()],
				[order[1]],
				'the copy becomes the selection',
			);
		});

		test('offsets a leaf copy by exactly +24/+24', function (assert) {
			const src = leaf('a', 10, 20);
			load([src]);
			duplicateLayers(['a']);
			const copy = live().layers[1]!;
			assert.strictEqual(copy.transform.x, 34);
			assert.strictEqual(copy.transform.y, 44);
			assert.strictEqual(
				src.transform.x,
				10,
				'source not moved',
			);
			assert.strictEqual(
				src.transform.y,
				20,
				'source not moved',
			);
		});

		// group transform identity by contract (folder semantics); offset lands on leaves
		test('keeps a group copy at identity and nudges its leaves', function (assert) {
			load([
				group('g', [
					leaf('x', 5, 5),
					group('h', [leaf('y', 0, 0)]),
				]),
			]);
			duplicateLayers(['g']);
			const copy = live().layers[1]!;
			assert.strictEqual(copy.kind, 'group');
			assert.strictEqual(
				copy.transform.x,
				0,
				'group stays at identity',
			);
			assert.strictEqual(
				copy.transform.y,
				0,
				'group stays at identity',
			);
			const copied = copy as GroupLayer;
			assert.strictEqual(copied.children[0]!.transform.x, 29);
			assert.strictEqual(copied.children[0]!.transform.y, 29);
			const inner = copied.children[1] as GroupLayer;
			assert.strictEqual(inner.children[0]!.transform.x, 24);
			assert.strictEqual(inner.children[0]!.transform.y, 24);
		});

		test('gives every node in a cloned subtree a fresh id', function (assert) {
			load([
				group('g', [
					leaf('x'),
					group('h', [leaf('y')]),
				]),
			]);
			duplicateLayers(['g']);
			const copy = live().layers[1] as GroupLayer;
			const oldIds = new Set(['g', 'x', 'h', 'y']);
			const seen: string[] = [];
			const walk = (l: Layer) => {
				seen.push(l.id);
				if (l.kind === 'group')
					l.children.forEach(walk);
			};
			walk(copy);
			assert.strictEqual(
				seen.length,
				4,
				'whole subtree cloned',
			);
			assert.strictEqual(
				seen.filter((id) => oldIds.has(id)).length,
				0,
				'no id reused from the source',
			);
			assert.strictEqual(
				tree(kids('g')),
				'x,h(y)',
				'source untouched',
			);
		});

		// child cloned via its group must not also clone standalone
		test('clones only the topmost selected node', function (assert) {
			load([group('g', [leaf('x')])]);
			duplicateLayers(['g', 'x']);
			assert.strictEqual(
				live().layers.length,
				2,
				'one copy, not two',
			);
			const copy = live().layers[1] as GroupLayer;
			assert.strictEqual(copy.children.length, 1);
		});

		test('copies a nested layer inside its own group', function (assert) {
			const doc = load([
				leaf('z'),
				group('g', [leaf('x'), leaf('y')]),
			]);
			duplicateLayers(['x']);
			const children = kids('g');
			assert.strictEqual(children.length, 3);
			assert.strictEqual(children[0]!.id, 'x');
			assert.strictEqual(children[2]!.id, 'y');
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'the untouched root sibling is shared',
			);
		});

		test('is a no-op for an empty id list', function (assert) {
			const doc = load([leaf('a')]);
			duplicateLayers([]);
			assert.strictEqual(
				getSnapshot(),
				doc,
				'no new doc, no history step',
			);
			assert.false(canUndo());
		});

		test('is a no-op when the id is not in the tree', function (assert) {
			const doc = load([leaf('a')]);
			duplicateLayers(['nope']);
			assert.strictEqual(getSnapshot(), doc);
		});

		test('duplicateLayer forwards to duplicateLayers', function (assert) {
			load([leaf('a')]);
			duplicateLayer('a');
			assert.strictEqual(live().layers.length, 2);
		});
	});

	module('deleteLayers', function () {
		test('removes a whole subtree for a group id', function (assert) {
			const doc = load([
				leaf('a'),
				group('g', [leaf('x'), leaf('y')]),
				leaf('b'),
			]);
			deleteLayers(['g']);
			assert.strictEqual(tree(), 'a,b');
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'a shared',
			);
			assert.strictEqual(
				live().layers[1],
				doc.layers[2],
				'b shared',
			);
			assert.strictEqual(
				tree(doc.layers),
				'a,g(x,y),b',
				'input untouched',
			);
		});

		test('drops deleted ids from the selection', function (assert) {
			load([leaf('a'), group('g', [leaf('x')])]);
			setSelection(['a', 'x', 'g']);
			deleteLayers(['g']);
			assert.deepEqual([...getSelectedLayerIds()], ['a']);
		});

		test('removes a leaf from inside a group, sharing the rest', function (assert) {
			const doc = load([
				leaf('a'),
				group('g', [leaf('x'), leaf('y')]),
			]);
			const y = kids('g')[1]!;
			deleteLayers(['x']);
			assert.strictEqual(tree(), 'a,g(y)');
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'a shared',
			);
			assert.strictEqual(
				kids('g')[0],
				y,
				'the surviving child is shared',
			);
		});

		test('deletes across two sibling lists in one pass', function (assert) {
			load([leaf('a'), group('g', [leaf('x'), leaf('y')])]);
			deleteLayers(['a', 'x']);
			assert.strictEqual(tree(), 'g(y)');
		});

		test('leaves the layer tree shared when no id matches', function (assert) {
			const doc = load([leaf('a'), group('g', [leaf('x')])]);
			deleteLayers(['nope']);
			assert.strictEqual(
				live().layers,
				doc.layers,
				'the same array comes back out',
			);
		});

		test('is a no-op for an empty id list', function (assert) {
			const doc = load([leaf('a')]);
			deleteLayers([]);
			assert.strictEqual(getSnapshot(), doc);
		});

		test('deleteLayer forwards to deleteLayers', function (assert) {
			load([leaf('a'), leaf('b')]);
			deleteLayer('a');
			assert.strictEqual(tree(), 'b');
		});
	});

	module('groupLayers', function () {
		test('takes the topmost member slot, children in doc order', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
			// ids arrive click order; children must stay doc order
			const gid = groupLayers(['c', 'b']);
			assert.strictEqual(
				tree().replace(gid!, 'G'),
				'a,G(b,c),d',
			);
		});

		test('keeps the members themselves by reference', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			const gid = groupLayers(['b', 'c'])!;
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'a shared',
			);
			assert.strictEqual(
				kids(gid)[0],
				doc.layers[1],
				'b shared',
			);
			assert.strictEqual(
				kids(gid)[1],
				doc.layers[2],
				'c shared',
			);
			assert.strictEqual(
				tree(doc.layers),
				'a,b,c',
				'input untouched',
			);
		});

		// grouping is collect-into-one-slot; intervening layers stay put
		test('pulls non-adjacent members together', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
			const gid = groupLayers(['a', 'c'])!;
			assert.strictEqual(
				tree().replace(gid, 'G'),
				'b,G(a,c),d',
			);
		});

		test('groups at the top of a list', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c')]);
			const gid = groupLayers(['b', 'c'])!;
			assert.strictEqual(
				tree().replace(gid, 'G'),
				'a,G(b,c)',
			);
		});

		test('groups inside a group, rebuilding only that path', function (assert) {
			const doc = load([
				leaf('z'),
				group('g', [leaf('a'), leaf('b'), leaf('c')]),
			]);
			const gid = groupLayers(['a', 'b'])!;
			assert.strictEqual(
				tree().replace(gid, 'G'),
				'z,g(G(a,b),c)',
			);
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'z shared',
			);
		});

		test('refuses ids from two different sibling lists', function (assert) {
			const doc = load([leaf('a'), group('g', [leaf('x')])]);
			assert.strictEqual(groupLayers(['a', 'x']), null);
			assert.strictEqual(
				getSnapshot(),
				doc,
				'no doc change, no history',
			);
			assert.false(canUndo());
		});

		test('refuses fewer than two ids', function (assert) {
			const doc = load([leaf('a'), leaf('b')]);
			assert.strictEqual(groupLayers(['a']), null);
			assert.strictEqual(groupLayers([]), null);
			assert.strictEqual(getSnapshot(), doc);
		});

		test('refuses an id that is not in the tree', function (assert) {
			const doc = load([leaf('a'), leaf('b')]);
			assert.strictEqual(groupLayers(['a', 'nope']), null);
			assert.strictEqual(getSnapshot(), doc);
		});

		test('the new group is an identity-transform folder and goes active', function (assert) {
			load([leaf('a'), leaf('b')]);
			const gid = groupLayers(['a', 'b'])!;
			const g = find(gid);
			assert.strictEqual(
				g.name,
				'',
				'blank name, the panel supplies one',
			);
			assert.true(g.visible);
			assert.false(g.locked);
			assert.strictEqual(g.opacity, 1);
			assert.strictEqual(g.blendMode, 'source-over');
			assert.deepEqual(g.transform, xform(0, 0));
			assert.deepEqual([...getSelectedLayerIds()], [gid]);
		});
	});

	module('ungroupLayer', function () {
		test('children take the group slot in order and are shared', function (assert) {
			const doc = load([
				leaf('a'),
				group('g', [leaf('x'), leaf('y')]),
				leaf('b'),
			]);
			const x = kids('g')[0]!;
			ungroupLayer('g');
			assert.strictEqual(tree(), 'a,x,y,b');
			assert.strictEqual(
				live().layers[1],
				x,
				'the child object is shared',
			);
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'a shared',
			);
			assert.deepEqual(
				[...getSelectedLayerIds()],
				['x', 'y'],
			);
		});

		// group→ungroup reflex must restore exact same objects in same order
		test('round-trips an adjacent selection back to the original layers', function (assert) {
			const doc = load([
				leaf('a'),
				leaf('b'),
				leaf('c'),
				leaf('d'),
			]);
			const before = [...doc.layers];
			const gid = groupLayers(['b', 'c'])!;
			ungroupLayer(gid);
			assert.strictEqual(tree(), 'a,b,c,d');
			live().layers.forEach((l, i) => {
				assert.strictEqual(
					l,
					before[i],
					`layer ${i} is shared`,
				);
			});
		});

		test('promotes children into the parent group when nested', function (assert) {
			load([
				group('g', [
					leaf('a'),
					group('h', [leaf('x'), leaf('y')]),
					leaf('b'),
				]),
			]);
			ungroupLayer('h');
			assert.strictEqual(tree(), 'g(a,x,y,b)');
		});

		test('an empty group simply disappears', function (assert) {
			load([leaf('a'), group('g', [])]);
			ungroupLayer('g');
			assert.strictEqual(tree(), 'a');
			assert.deepEqual([...getSelectedLayerIds()], []);
		});

		test('is a no-op on a non-group id', function (assert) {
			const doc = load([leaf('a'), group('g', [leaf('x')])]);
			ungroupLayer('a');
			assert.strictEqual(getSnapshot(), doc);
			assert.false(canUndo());
		});

		test('is a no-op on a missing id', function (assert) {
			const doc = load([group('g', [leaf('x')])]);
			ungroupLayer('nope');
			assert.strictEqual(getSnapshot(), doc);
		});
	});

	module('moveLayer', function () {
		test('moves a root leaf into a group at the given index', function (assert) {
			load([leaf('a'), group('g', [leaf('x'), leaf('y')])]);
			moveLayer('a', 'g', 1);
			assert.strictEqual(tree(), 'g(x,a,y)');
		});

		test('index 0 is the bottom of the destination list', function (assert) {
			load([leaf('a'), group('g', [leaf('x'), leaf('y')])]);
			moveLayer('a', 'g', 0);
			assert.strictEqual(tree(), 'g(a,x,y)');
		});

		test('moves a nested layer back out to the root list', function (assert) {
			load([group('g', [leaf('x'), leaf('y')]), leaf('b')]);
			moveLayer('x', null, 2);
			assert.strictEqual(tree(), 'g(y),b,x');
		});

		test('moves a whole group as one block', function (assert) {
			load([leaf('a'), group('g', [leaf('x')]), leaf('b')]);
			moveLayer('g', null, 2);
			assert.strictEqual(tree(), 'a,b,g(x)');
		});

		test('clamps an index past the end of the destination list', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c')]);
			moveLayer('a', null, 99);
			assert.strictEqual(tree(), 'b,c,a');
		});

		test('a same-slot drop changes nothing and records nothing', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			moveLayer('b', null, 1);
			assert.strictEqual(getSnapshot(), doc);
			assert.false(canUndo());
		});

		// clamp must run before same-slot comparison
		test('an over-range index onto the top item is still a same-slot drop', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			moveLayer('c', null, 7);
			assert.strictEqual(getSnapshot(), doc);
		});

		test('refuses to move a group into its own descendant', function (assert) {
			const doc = load([
				group('g', [group('h', [leaf('x')])]),
			]);
			moveLayer('g', 'h', 0);
			assert.strictEqual(getSnapshot(), doc);
		});

		test('refuses to move a layer into itself', function (assert) {
			const doc = load([group('g', [leaf('x')]), leaf('b')]);
			moveLayer('g', 'g', 0);
			assert.strictEqual(getSnapshot(), doc);
		});

		test('refuses a target that is not a group, or is missing', function (assert) {
			const doc = load([leaf('a'), leaf('b')]);
			moveLayer('a', 'b', 0);
			assert.strictEqual(
				getSnapshot(),
				doc,
				'leaf target refused',
			);
			moveLayer('a', 'nope', 0);
			assert.strictEqual(
				getSnapshot(),
				doc,
				'missing target refused',
			);
			moveLayer('nope', null, 0);
			assert.strictEqual(
				getSnapshot(),
				doc,
				'missing layer refused',
			);
		});

		test('shares the sibling that is not on the path', function (assert) {
			const doc = load([
				leaf('z'),
				group('g', [leaf('x'), leaf('y')]),
			]);
			moveLayer('x', 'g', 1);
			assert.strictEqual(tree(), 'z,g(y,x)');
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'z shared',
			);
			assert.strictEqual(
				tree(doc.layers),
				'z,g(x,y)',
				'input untouched',
			);
		});
	});

	module('reorderLayers', function () {
		test('forward steps one slot toward the top', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['a'], 'forward');
			assert.strictEqual(tree(), 'b,a,c');
		});

		test('backward steps one slot toward the bottom', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['c'], 'backward');
			assert.strictEqual(tree(), 'a,c,b');
		});

		// end-of-list is where indexed swap loops overread or rotate silently
		test('forward on the topmost layer changes nothing', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['c'], 'forward');
			assert.strictEqual(getSnapshot(), doc, 'no doc change');
			assert.false(canUndo(), 'and no history step');
		});

		test('backward on the bottom layer changes nothing', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['a'], 'backward');
			assert.strictEqual(getSnapshot(), doc);
			assert.false(canUndo());
		});

		test('a single layer in a single-element list cannot move', function (assert) {
			const doc = load([leaf('a')]);
			reorderLayers(['a'], 'forward');
			reorderLayers(['a'], 'backward');
			reorderLayers(['a'], 'front');
			reorderLayers(['a'], 'back');
			assert.strictEqual(getSnapshot(), doc);
		});

		test('a contiguous block steps forward as a block', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
			reorderLayers(['b', 'c'], 'forward');
			assert.strictEqual(tree(), 'a,d,b,c');
		});

		test('a contiguous block steps backward as a block', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
			reorderLayers(['b', 'c'], 'backward');
			assert.strictEqual(tree(), 'b,c,a,d');
		});

		// loop must skip other selected items or block shears apart
		test('a block already at the top does not shear', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['b', 'c'], 'forward');
			assert.strictEqual(getSnapshot(), doc);
		});

		test('a block already at the bottom does not shear', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['a', 'b'], 'backward');
			assert.strictEqual(getSnapshot(), doc);
		});

		test('a split selection steps each run independently', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
			reorderLayers(['a', 'c'], 'forward');
			assert.strictEqual(tree(), 'b,a,d,c');
		});

		test('front moves the selection to the end, relative order kept', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
			reorderLayers(['c', 'a'], 'front');
			assert.strictEqual(tree(), 'b,d,a,c');
		});

		test('back moves the selection to the start, relative order kept', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
			reorderLayers(['d', 'b'], 'back');
			assert.strictEqual(tree(), 'b,d,a,c');
		});

		test('front on an already-frontmost block changes nothing', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['b', 'c'], 'front');
			assert.strictEqual(getSnapshot(), doc);
			assert.false(canUndo());
		});

		test('back on an already-backmost block changes nothing', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['a', 'b'], 'back');
			assert.strictEqual(getSnapshot(), doc);
		});

		test('restacks inside a group without touching the root list', function (assert) {
			const doc = load([
				leaf('z'),
				group('g', [leaf('x'), leaf('y'), leaf('w')]),
			]);
			const before = (doc.layers[1] as GroupLayer).children;
			reorderLayers(['x'], 'front');
			assert.strictEqual(tree(), 'z,g(y,w,x)');
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'z shared',
			);
			assert.strictEqual(
				kids('g')[2],
				before[0],
				'x itself is shared',
			);
			assert.strictEqual(
				tree(doc.layers),
				'z,g(x,y,w)',
				'input untouched',
			);
		});

		test('restacked siblings come back by reference', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			reorderLayers(['a'], 'front');
			assert.strictEqual(tree(), 'b,c,a');
			assert.strictEqual(live().layers[0], doc.layers[1]);
			assert.strictEqual(live().layers[1], doc.layers[2]);
			assert.strictEqual(live().layers[2], doc.layers[0]);
		});

		test('refuses ids from two different sibling lists', function (assert) {
			const doc = load([
				leaf('a'),
				group('g', [leaf('x'), leaf('y')]),
			]);
			reorderLayers(['a', 'x'], 'front');
			assert.strictEqual(getSnapshot(), doc);
		});

		test('is a no-op for an empty list or a missing id', function (assert) {
			const doc = load([leaf('a'), leaf('b')]);
			reorderLayers([], 'front');
			assert.strictEqual(getSnapshot(), doc);
			reorderLayers(['nope'], 'front');
			assert.strictEqual(getSnapshot(), doc);
		});
	});

	module('setSiblingOrder', function () {
		test('rewrites the root list to the given order', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			setSiblingOrder(null, ['c', 'a', 'b']);
			assert.strictEqual(tree(), 'c,a,b');
			assert.strictEqual(
				live().layers[0],
				doc.layers[2],
				'shared',
			);
		});

		test('rewrites a group child list', function (assert) {
			load([leaf('z'), group('g', [leaf('x'), leaf('y')])]);
			setSiblingOrder('g', ['y', 'x']);
			assert.strictEqual(tree(), 'z,g(y,x)');
		});

		test('declines an id list that does not cover the sibling list', function (assert) {
			const doc = load([leaf('a'), leaf('b'), leaf('c')]);
			setSiblingOrder(null, ['b', 'a']);
			assert.strictEqual(
				tree(),
				'a,b,c',
				'partial order ignored',
			);
			assert.strictEqual(live().layers, doc.layers);
		});

		test('declines a parent id that is not a group', function (assert) {
			load([leaf('a'), leaf('b')]);
			setSiblingOrder('a', ['b', 'a']);
			assert.strictEqual(tree(), 'a,b');
		});

		// update() must not push history for a declined op
		test('a declined sibling order records no history step', function (assert) {
			load([leaf('a'), leaf('b'), leaf('c')]);
			setSiblingOrder(null, ['b', 'a']);
			assert.false(canUndo());
		});
	});

	module('setTransforms', function () {
		test('commits many transforms as one undo step, input untouched', function (assert) {
			const doc = load([leaf('a', 0, 0), leaf('b', 5, 5)]);
			setTransforms([
				{ id: 'a', transform: xform(1, 2) },
				{ id: 'b', transform: xform(3, 4) },
			]);
			assert.strictEqual(find('a').transform.x, 1);
			assert.strictEqual(find('b').transform.y, 4);
			undo();
			assert.strictEqual(
				getSnapshot(),
				doc,
				'one step back is the exact original doc object',
			);
			assert.strictEqual(
				doc.layers[0]!.transform.x,
				0,
				'input untouched',
			);
		});

		test('an empty entry list records nothing', function (assert) {
			const doc = load([leaf('a')]);
			setTransforms([]);
			assert.strictEqual(getSnapshot(), doc);
			assert.false(canUndo());
		});
	});

	module('nudgeSelection', function () {
		test('moves every leaf under a selected group, group stays identity', function (assert) {
			load([
				group('g', [
					leaf('x', 10, 20),
					leaf('y', 0, 0),
				]),
			]);
			setSelection(['g']);
			nudgeSelection(5, -3);
			assert.strictEqual(find('x').transform.x, 15);
			assert.strictEqual(find('x').transform.y, 17);
			assert.strictEqual(find('y').transform.x, 5);
			assert.strictEqual(find('y').transform.y, -3);
			assert.strictEqual(
				find('g').transform.x,
				0,
				'group not moved',
			);
		});

		// lock/visibility are effective (inherited from group); locked folder protects unlocked children
		test('skips leaves locked or hidden by an ancestor', function (assert) {
			const locked = group('g', [leaf('x')]);
			locked.locked = true;
			const hidden = group('h', [leaf('y')]);
			hidden.visible = false;
			const doc = load([locked, hidden]);
			setSelection(['g', 'h']);
			nudgeSelection(5, 5);
			assert.strictEqual(
				getSnapshot(),
				doc,
				'nothing to move, no step',
			);
			assert.false(canUndo());
		});
	});

	module('kind-guarded setters', function () {
		test('a flat colour replaces a gradient fill on a shape', function (assert) {
			load([shape('s', GRADIENT)]);
			setFill('s', '#ff0000');
			assert.strictEqual(
				(find('s') as ShapeLayer).fill,
				'#ff0000',
			);
		});

		// freehand fill is string-typed; gradient must fall through
		test('a gradient on a freehand layer leaves the layer alone', function (assert) {
			const doc = load([freehand('f', '#000000')]);
			setFill('f', GRADIENT);
			assert.strictEqual(
				live().layers[0],
				doc.layers[0],
				'the layer object is untouched',
			);
			assert.strictEqual(
				(find('f') as FreehandLayer).fill,
				'#000000',
			);
		});

		test('setFill ignores a layer kind that has no fill', function (assert) {
			const doc = load([leaf('a')]);
			setFill('a', '#ff0000');
			assert.strictEqual(live().layers[0], doc.layers[0]);
		});
	});
});
