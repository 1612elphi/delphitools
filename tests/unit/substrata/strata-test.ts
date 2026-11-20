import { module, test } from 'qunit';
import {
	createEmptyDoc,
	createRasterLayer,
	createShapeLayer,
	createTextLayer,
	identityTransform,
	type RasterLayer,
} from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot, setDoc } from 'delphitools-v2/lib/substrata/doc-store';
import { nudgeSelection } from 'delphitools-v2/lib/substrata/layer-ops';
import { setSelection } from 'delphitools-v2/lib/substrata/selection';
import {
	fitFrame,
	recolourStrata,
	setStratum,
	templateColours,
} from 'delphitools-v2/lib/substrata/strata';

function frame(patch: Partial<RasterLayer> = {}): RasterLayer {
	return {
		...createRasterLayer({
			name: 'frame',
			blobHash: 'h',
			naturalWidth: 400,
			naturalHeight: 200,
			transform: { ...identityTransform(), x: 500, y: 300 },
		}),
		stratum: true,
		...patch,
	};
}

module('Unit | Substrata | strata', function () {
	module('fitFrame', function () {
		test('a tall image covers a wide frame, centred', function (assert) {
			const p = fitFrame(frame(), 100, 400);
			// scale 4, centred crop
			assert.strictEqual(p.transform.scaleX, 4);
			assert.strictEqual(p.transform.scaleY, 4);
			assert.deepEqual(p.crop, {
				x: 0,
				y: 175,
				w: 100,
				h: 50,
			});
			assert.strictEqual(p.transform.x, 500);
			assert.strictEqual(p.transform.y, 300);
		});

		test('same aspect needs no crop', function (assert) {
			const p = fitFrame(frame(), 800, 400);
			assert.strictEqual(p.crop, null);
			assert.strictEqual(p.transform.scaleX, 0.5);
		});

		test('an off-centre crop keeps the frame where it was', function (assert) {
			const l = frame({
				crop: { x: 200, y: 0, w: 200, h: 200 },
				transform: {
					...identityTransform(),
					x: 500,
					y: 300,
					angle: 90,
				},
			});
			const p = fitFrame(l, 100, 100);
			// offset frame, turned 90°
			assert.true(Math.abs(p.transform.x - 500) < 1e-9);
			assert.true(Math.abs(p.transform.y - 400) < 1e-9);
			assert.strictEqual(p.transform.scaleX, 2);
			assert.strictEqual(p.crop, null);
		});

		test('the mask follows the frame into the new image', function (assert) {
			// right half both
			const l = frame({
				crop: { x: 200, y: 0, w: 200, h: 200 },
				mask: {
					d: 'M 50 0 L 100 0 L 100 100 Z',
					label: 'm',
				},
			});
			const p = fitFrame(l, 100, 100);
			assert.strictEqual(
				p.mask?.d,
				'M 0 0 L 100 0 L 100 100 Z',
				'right half of the old box is the whole new box',
			);
		});
	});

	module('template colours', function (hooks) {
		hooks.beforeEach(function () {
			const doc = createEmptyDoc();
			const shape = createShapeLayer({
				name: 's',
				params: {
					shape: 'rectangle',
					width: 10,
					height: 10,
					cornerRadius: 0,
				},
				fill: '#FF0000',
				stroke: null,
				transform: identityTransform(),
			});
			const text = createTextLayer({
				name: 't',
				text: 'x',
				fontFamily: 'Iosevka',
				fontSize: 12,
				fill: '#ff0000',
				stroke: null,
				plate: {
					shape: 'pill',
					colour: '#00ff00',
					padding: 4,
				},
				transform: identityTransform(),
			});
			const user = { ...shape, id: 'user', fill: '#ff0000' };
			setDoc({
				...doc,
				layers: [
					{ ...shape, stratum: true },
					{ ...text, stratum: true },
					user,
				],
			});
		});

		test('lists strata colours once, case-folded', function (assert) {
			assert.deepEqual(templateColours(getSnapshot()!), [
				'#ff0000',
				'#00ff00',
			]);
		});

		test('recolours every stratum with the hex, never user layers', function (assert) {
			recolourStrata('#ff0000', '#0000ff', false);
			const fills = getSnapshot()!.layers.map((l) =>
				'fill' in l ? l.fill : null,
			);
			assert.deepEqual(fills, [
				'#0000ff',
				'#0000ff',
				'#ff0000',
			]);
		});
	});

	module('pinning', function () {
		test('nudge skips strata until they are unlocked', function (assert) {
			const doc = createEmptyDoc();
			setDoc({ ...doc, layers: [frame({ id: 'f' })] });
			setSelection(['f']);
			nudgeSelection(10, 0);
			assert.strictEqual(
				getSnapshot()!.layers[0]?.transform.x,
				500,
			);
			setStratum(['f'], false);
			assert.false(!!getSnapshot()!.layers[0]?.stratum);
			nudgeSelection(10, 0);
			assert.strictEqual(
				getSnapshot()!.layers[0]?.transform.x,
				510,
			);
		});
	});
});
