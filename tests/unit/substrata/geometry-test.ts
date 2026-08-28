import { module, test } from 'qunit';
import {
	layerDims,
	polygonPoints,
	shapeDims,
	starPoints,
	type Pt,
} from 'delphitools-v2/lib/substrata/shape-geometry';
import {
	buildSnapField,
	computeSnap,
	type SnapBox,
} from 'delphitools-v2/lib/substrata/snap-engine';
import {
	angleToCoords,
	coordsToAngle,
} from 'delphitools-v2/lib/substrata/gradient-geometry';
import {
	PRESET_SHAPES,
	SYMBOL_GRID,
	presetShape,
} from 'delphitools-v2/lib/substrata/preset-shapes';
import {
	createFreehandLayer,
	createRasterLayer,
	createShapeLayer,
	createTextLayer,
	identityTransform,
	type GroupLayer,
} from 'delphitools-v2/lib/substrata/doc-model';

const EPS = 1e-6;

function near(assert: Assert, actual: number, expected: number, what: string) {
	assert.true(
		Math.abs(actual - expected) < EPS,
		`${what}: ${actual} (expected ${expected})`,
	);
}

/** +0 folds -0 so deepEqual on point lists compares 0 equal */
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
const xy = (pts: readonly Pt[]) => pts.map((p) => [r6(p.x), r6(p.y)]);

function angleGap(a: number, b: number): number {
	return ((((a - b) % 360) + 540) % 360) - 180;
}

const PATH_ARGS: Record<string, number> = {
	m: 2,
	l: 2,
	h: 1,
	v: 1,
	c: 6,
	s: 4,
	q: 4,
	t: 2,
	a: 7,
	z: 0,
};

/** svg path absolute endpoints; control points ignored, so bbox subset */
function pathEndpoints(d: string): Pt[] {
	const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
	const pts: Pt[] = [];
	let cmd = '';
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	let i = 0;
	while (i < tokens.length) {
		const token = tokens[i]!;
		const isCommand = /[A-Za-z]/.test(token);
		if (isCommand) {
			cmd = token;
			i++;
		}
		const key = cmd.toLowerCase();
		const argc = PATH_ARGS[key];
		if (argc === undefined || (argc === 0 && !isCommand)) {
			throw new Error(
				`bad path data near "${token}" in ${d}`,
			);
		}
		const args = tokens.slice(i, i + argc).map(Number);
		i += argc;
		const relative = cmd === key;
		if (key === 'z') {
			x = startX;
			y = startY;
		} else if (key === 'h') {
			x = relative ? x + args[0]! : args[0]!;
		} else if (key === 'v') {
			y = relative ? y + args[0]! : args[0]!;
		} else {
			const endX = args[argc - 2]!;
			const endY = args[argc - 1]!;
			x = relative ? x + endX : endX;
			y = relative ? y + endY : endY;
			if (key === 'm') {
				startX = x;
				startY = y;
			}
		}
		pts.push({ x, y });
		// svg spec: extra moveto args are implicit lineto
		if (key === 'm') cmd = relative ? 'l' : 'L';
	}
	return pts;
}

module('Unit | Substrata | geometry', function () {
	module('shape-geometry', function () {
		// -pi/2 start, clockwise in y-down: dropping offset rotates every polygon
		test('a four-sided polygon is a diamond with its first vertex up', function (assert) {
			assert.deepEqual(xy(polygonPoints(4, 100)), [
				[0, -100],
				[100, 0],
				[0, 100],
				[-100, 0],
			]);
		});

		test('every vertex sits on the circumradius, one turn split n ways', function (assert) {
			for (let n = 3; n <= 12; n++) {
				const pts = polygonPoints(n, 50);
				assert.strictEqual(
					pts.length,
					n,
					`${n} vertices`,
				);
				for (const [i, p] of pts.entries()) {
					near(
						assert,
						Math.hypot(p.x, p.y),
						50,
						`n=${n} vertex ${i} radius`,
					);
					near(
						assert,
						angleGap(
							(Math.atan2(p.y, p.x) *
								180) /
								Math.PI,
							-90 + (i * 360) / n,
						),
						0,
						`n=${n} vertex ${i} bearing`,
					);
				}
			}
		});

		test('vertex counts round, and never fall below three', function (assert) {
			assert.strictEqual(polygonPoints(3.4, 10).length, 3);
			assert.strictEqual(polygonPoints(3.6, 10).length, 4);
			assert.strictEqual(polygonPoints(2, 10).length, 3);
			assert.strictEqual(polygonPoints(0, 10).length, 3);
			assert.strictEqual(polygonPoints(-5, 10).length, 3);
			assert.strictEqual(starPoints(2, 10, 5).length, 6);
			assert.strictEqual(starPoints(5, 10, 5).length, 10);
		});

		// fabric Polygon.setDimensions mutates points in place; memoised return would corrupt
		test('polygon points are a fresh array every call', function (assert) {
			const a = polygonPoints(6, 40);
			const b = polygonPoints(6, 40);
			assert.notStrictEqual(a, b, 'array');
			assert.notStrictEqual(a[0], b[0], 'point');
			assert.deepEqual(xy(a), xy(b), 'same values');
		});

		test('a star alternates outer and inner radius from the top', function (assert) {
			const pts = starPoints(5, 100, 40);
			assert.strictEqual(pts.length, 10);
			assert.deepEqual(
				xy([pts[0]!]),
				[[0, -100]],
				'first is up',
			);
			for (const [i, p] of pts.entries()) {
				near(
					assert,
					Math.hypot(p.x, p.y),
					i % 2 === 0 ? 100 : 40,
					`vertex ${i} radius`,
				);
				near(
					assert,
					angleGap(
						(Math.atan2(p.y, p.x) * 180) /
							Math.PI,
						-90 + i * 36,
					),
					0,
					`vertex ${i} bearing`,
				);
			}
		});

		test('rectangle and ellipse dims come straight from the params', function (assert) {
			assert.deepEqual(
				shapeDims({
					shape: 'rectangle',
					width: 120,
					height: 40,
					cornerRadius: 12,
				}),
				{ width: 120, height: 40 },
				'corner radius does not shrink the box',
			);
			assert.deepEqual(
				shapeDims({ shape: 'ellipse', rx: 30, ry: 10 }),
				{ width: 60, height: 20 },
			);
		});

		// align/distribute divides by these; clamping height to 1 shifts lines
		test('a line has zero height', function (assert) {
			assert.deepEqual(
				shapeDims({ shape: 'line', length: 80 }),
				{
					width: 80,
					height: 0,
				},
			);
		});

		// vertex bbox not circumscribed circle; triangle 2r*cos30 wide, r(1+sin30) tall
		test('polygon dims are the vertex bbox, not the circle', function (assert) {
			const tri = shapeDims({
				shape: 'polygon',
				sides: 3,
				radius: 100,
			});
			near(
				assert,
				tri.width,
				Math.sqrt(3) * 100,
				'triangle width',
			);
			near(assert, tri.height, 150, 'triangle height');

			// pentagon 2r*sin72 wide, r*(1+cos36) tall
			const pent = shapeDims({
				shape: 'polygon',
				sides: 5,
				radius: 100,
			});
			near(assert, pent.width, 190.211303, 'pentagon width');
			near(
				assert,
				pent.height,
				180.901699,
				'pentagon height',
			);

			assert.deepEqual(
				shapeDims({
					shape: 'polygon',
					sides: 4,
					radius: 100,
				}),
				{ width: 200, height: 200 },
			);
		});

		test('star dims span the outer radius on both axes', function (assert) {
			assert.deepEqual(
				shapeDims({
					shape: 'star',
					points: 4,
					outerRadius: 100,
					innerRadius: 50,
				}),
				{ width: 200, height: 200 },
			);
		});

		// symbol reports 256 grid not glyph bbox; sync.ts maps grid onto drag box
		test('a symbol reports its grid box', function (assert) {
			assert.deepEqual(
				shapeDims({
					shape: 'symbol',
					symbolId: 'cloud',
					width: 90,
					height: 70,
				}),
				{ width: 90, height: 70 },
			);
		});

		test('layerDims reads raster natural size and shape geometry', function (assert) {
			const raster = createRasterLayer({
				name: 'r',
				blobHash: 'abc',
				naturalWidth: 640,
				naturalHeight: 480,
				transform: identityTransform(),
			});
			assert.deepEqual(layerDims(raster), {
				width: 640,
				height: 480,
			});

			const shape = createShapeLayer({
				name: 's',
				params: { shape: 'ellipse', rx: 5, ry: 25 },
				fill: '#000',
				stroke: null,
				transform: identityTransform(),
			});
			assert.deepEqual(layerDims(shape), {
				width: 10,
				height: 50,
			});
		});

		// round cap adds half width each end; rawPoints would give 100×0
		test('layerDims measures a freehand outline, not its raw points', function (assert) {
			const options = {
				size: 8,
				thinning: 0,
				smoothing: 0.5,
				streamline: 0.5,
				simulatePressure: false,
			};
			const stroke = createFreehandLayer({
				name: 'f',
				rawPoints: [
					[0, 0, 0.5],
					[100, 0, 0.5],
				],
				strokeOptions: options,
				fill: '#000',
				transform: identityTransform(),
			});
			const dims = layerDims(stroke)!;
			near(
				assert,
				dims.height,
				8,
				'height is the stroke width',
			);
			assert.true(
				dims.width > 100,
				`width ${dims.width} exceeds the 100px span`,
			);
			assert.true(
				dims.width < 110,
				`width ${dims.width} < 110`,
			);

			const empty = createFreehandLayer({
				name: 'f',
				rawPoints: [],
				strokeOptions: options,
				fill: '#000',
				transform: identityTransform(),
			});
			assert.deepEqual(layerDims(empty), {
				width: 0,
				height: 0,
			});
		});

		// null signals skip; 0×0 would look like a real size
		test('text and group have no intrinsic dims', function (assert) {
			const text = createTextLayer({
				name: 't',
				text: 'hello',
				fontFamily: 'sans',
				fontSize: 24,
				fill: '#000',
				stroke: null,
				plate: null,
				transform: identityTransform(),
			});
			assert.strictEqual(layerDims(text), null, 'text');

			const group: GroupLayer = {
				...text,
				kind: 'group',
				children: [text],
			};
			assert.strictEqual(layerDims(group), null, 'group');
		});
	});

	module('snap-engine', function () {
		const ARTBOARD = { width: 1000, height: 800 };

		test('an empty artboard field is its edges and centre', function (assert) {
			assert.deepEqual(buildSnapField(ARTBOARD, []), {
				v: [0, 500, 1000],
				h: [0, 400, 800],
			});
		});

		test('a sibling contributes its edges and centre, in that order', function (assert) {
			const others: SnapBox[] = [
				{ x: 300, y: 200, w: 100, h: 60 },
			];
			assert.deepEqual(buildSnapField(ARTBOARD, others), {
				v: [0, 500, 1000, 250, 300, 350],
				h: [0, 400, 800, 170, 200, 230],
			});
			assert.deepEqual(
				others,
				[{ x: 300, y: 200, w: 100, h: 60 }],
				'input untouched',
			);
		});

		test('a box near the artboard centre is pulled onto it', function (assert) {
			const field = buildSnapField(ARTBOARD, []);
			const result = computeSnap(
				{ x: 497, y: 400, w: 100, h: 50 },
				field,
				null,
				8,
			);
			assert.deepEqual(result, {
				dx: 3,
				dy: 0,
				v: [500],
				h: [400],
			});
			assert.deepEqual(
				field,
				{ v: [0, 500, 1000], h: [0, 400, 800] },
				'field untouched',
			);
		});

		test('nothing within the threshold is a no-op with no guides', function (assert) {
			assert.deepEqual(
				computeSnap(
					{ x: 300, y: 300, w: 100, h: 50 },
					buildSnapField(ARTBOARD, []),
					null,
					8,
				),
				{ dx: 0, dy: 0, v: [], h: [] },
			);
		});

		// pair either side of boundary catches </<= flip
		test('the threshold is inclusive', function (assert) {
			const field = { v: [500], h: [] };
			const at = computeSnap(
				{ x: 492, y: 0, w: 100, h: 0 },
				field,
				null,
				8,
			);
			assert.strictEqual(at.dx, 8, 'exactly 8 away snaps');
			const past = computeSnap(
				{ x: 491.9, y: 0, w: 100, h: 0 },
				field,
				null,
				8,
			);
			assert.strictEqual(past.dx, 0, '8.1 away does not');
			assert.deepEqual(past.v, [], 'and draws no guide');
		});

		// nearest of left/centre/right wins
		test('an edge wins over the centre when it is nearer', function (assert) {
			// centre 300 → 305 is 5; right edge 350 → 352 is 2
			const result = computeSnap(
				{ x: 300, y: 0, w: 100, h: 0 },
				{ v: [305, 352], h: [] },
				null,
				8,
			);
			assert.strictEqual(result.dx, 2);
			assert.deepEqual(result.v, [352]);
		});

		test('an equal-distance tie goes to the earlier probe', function (assert) {
			// left edge 50→55 and centre 100→105 are both +5
			const result = computeSnap(
				{ x: 100, y: 0, w: 100, h: 0 },
				{ v: [55, 105], h: [] },
				null,
				8,
			);
			assert.strictEqual(result.dx, 5);
			assert.deepEqual(result.v, [55], 'the left edge line');
		});

		// zero-delta reports guide so overlay keeps drawing
		test('an aligned box still reports its guides', function (assert) {
			assert.deepEqual(
				computeSnap(
					{ x: 500, y: 400, w: 100, h: 50 },
					buildSnapField(ARTBOARD, []),
					null,
					8,
				),
				{ dx: 0, dy: 0, v: [500], h: [400] },
			);
		});

		test('a zero-size box collapses all three probes onto its centre', function (assert) {
			assert.deepEqual(
				computeSnap(
					{ x: 3, y: 797, w: 0, h: 0 },
					buildSnapField(ARTBOARD, []),
					null,
					8,
				),
				{ dx: -3, dy: 3, v: [0], h: [800] },
			);
		});

		test('the grid snaps on its own, with no candidate lines', function (assert) {
			// probes 253/303/353 are 3 past a multiple of 10
			assert.deepEqual(
				computeSnap(
					{ x: 303, y: 303, w: 100, h: 50 },
					{ v: [], h: [] },
					10,
					8,
				),
				{ dx: -3, dy: 2, v: [250], h: [280] },
			);
		});

		test('the nearer of grid and candidate line wins', function (assert) {
			// left edge 250 on grid, 2 from line 252
			assert.deepEqual(
				computeSnap(
					{ x: 300, y: 0, w: 100, h: 0 },
					{ v: [252], h: [] },
					10,
					8,
				).v,
				[250],
				'grid beats the line',
			);
			// centre 300 is on both grid and line; move line off grid
			assert.deepEqual(
				computeSnap(
					{ x: 304, y: 0, w: 100, h: 0 },
					{ v: [253], h: [] },
					10,
					8,
				).v,
				[253],
				'line beats the grid',
			);
		});

		test('grid snapping is off for null, zero and negative pitch', function (assert) {
			const box = { x: 303, y: 303, w: 100, h: 50 };
			const none = { v: [], h: [] };
			for (const grid of [null, 0, -10]) {
				assert.deepEqual(
					computeSnap(box, none, grid, 8),
					{ dx: 0, dy: 0, v: [], h: [] },
					`grid ${grid}`,
				);
			}
		});

		// correction must land probe on reported line else object rests off-guide
		test('applying the correction puts a probe on the reported line', function (assert) {
			const field = buildSnapField(ARTBOARD, [
				{ x: 320, y: 240, w: 80, h: 40 },
			]);
			for (let x = 200; x < 260; x += 0.5) {
				const box: SnapBox = { x, y: 0, w: 100, h: 0 };
				// grid 10 threshold 8 → every position snaps
				const result = computeSnap(box, field, 10, 8);
				assert.true(
					Math.abs(result.dx) <= 8,
					`x=${x} moved ${result.dx}`,
				);
				const moved = box.x + result.dx;
				const probes = [moved - 50, moved, moved + 50];
				const line = result.v[0]!;
				assert.true(
					probes.some(
						(p) => Math.abs(p - line) < EPS,
					),
					`x=${x} -> ${moved}, guide ${line}`,
				);
			}
		});
	});

	module('gradient-geometry', function () {
		test('the cardinal angles run edge to edge', function (assert) {
			assert.deepEqual(
				angleToCoords(0),
				{ x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
				'0 is left to right',
			);
			assert.deepEqual(
				angleToCoords(90),
				{ x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
				'90 is top to bottom, y down',
			);
			assert.deepEqual(
				angleToCoords(180),
				{ x1: 1, y1: 0.5, x2: 0, y2: 0.5 },
				'180 is right to left',
			);
			assert.deepEqual(
				angleToCoords(270),
				{ x1: 0.5, y1: 1, x2: 0.5, y2: 0 },
				'270 is bottom to top',
			);
		});

		// |cos|+|sin| length: unit vector stops 45° at 0.146/0.854, corners flat
		test('45 degrees runs corner to corner', function (assert) {
			assert.deepEqual(angleToCoords(45), {
				x1: 0,
				y1: 0,
				x2: 1,
				y2: 1,
			});
		});

		// widest overshoot 22.5°: 0.5+(1+√2)/4=1.1036, rounds 1.104
		test('oblique angles overshoot the unit box by at most 0.104', function (assert) {
			assert.deepEqual(angleToCoords(22.5), {
				x1: -0.104,
				y1: 0.25,
				x2: 1.104,
				y2: 0.75,
			});
			for (let deg = 0; deg < 360; deg += 0.5) {
				const c = angleToCoords(deg);
				for (const [k, v] of Object.entries(c)) {
					assert.true(
						v >= -0.104,
						`${deg} ${k} = ${v}`,
					);
					assert.true(
						v <= 1.104,
						`${deg} ${k} = ${v}`,
					);
				}
			}
		});

		test('coords are rounded to three decimal places', function (assert) {
			for (let deg = 0; deg < 360; deg += 7) {
				for (const v of Object.values(
					angleToCoords(deg),
				)) {
					assert.true(
						Number.isInteger(
							Math.round(v * 1e6) /
								1000,
						),
						`${deg}: ${v}`,
					);
				}
			}
		});

		// rounding tiny negative yields -0; prints as "-0" when shown raw
		test('a rounded-away negative comes out as positive zero', function (assert) {
			assert.true(
				Object.is(angleToCoords(180).x2, 0),
				`180 x2 is ${angleToCoords(180).x2}`,
			);
			assert.true(
				Object.is(angleToCoords(270).y2, 0),
				`270 y2 is ${angleToCoords(270).y2}`,
			);
		});

		test('every whole degree survives the round trip', function (assert) {
			for (let deg = 0; deg < 360; deg++) {
				assert.strictEqual(
					coordsToAngle(angleToCoords(deg)),
					deg,
					`${deg} degrees`,
				);
			}
		});

		test('angles outside 0-359 normalise into range', function (assert) {
			assert.deepEqual(
				angleToCoords(-90),
				angleToCoords(270),
			);
			assert.deepEqual(angleToCoords(450), angleToCoords(90));
			assert.deepEqual(angleToCoords(720), angleToCoords(0));
		});

		// outer % 360 else a hair under 360 rounds to 360 and stepper shows out-of-range
		test('coordsToAngle never returns 360', function (assert) {
			assert.strictEqual(
				coordsToAngle({
					x1: 0.5,
					y1: 0.5,
					x2: 1,
					y2: 0.4999,
				}),
				0,
				'just short of a full turn',
			);
			assert.strictEqual(
				coordsToAngle({
					x1: 0,
					y1: 0.5,
					x2: 1,
					y2: 0.5,
				}),
				0,
			);
			assert.strictEqual(
				coordsToAngle({
					x1: 0.5,
					y1: 1,
					x2: 0.5,
					y2: 0,
				}),
				270,
			);
		});

		test('a zero-length line reads as zero degrees', function (assert) {
			assert.strictEqual(
				coordsToAngle({
					x1: 0.5,
					y1: 0.5,
					x2: 0.5,
					y2: 0.5,
				}),
				0,
			);
		});
	});

	module('preset-shapes', function () {
		test('ids are unique and every entry is named', function (assert) {
			const seen = new Set<string>();
			for (const shape of PRESET_SHAPES) {
				assert.false(
					seen.has(shape.id),
					`${shape.id} is unique`,
				);
				seen.add(shape.id);
				assert.true(
					shape.name.length > 0,
					`${shape.id} is named`,
				);
			}
			assert.strictEqual(
				seen.size,
				PRESET_SHAPES.length,
				'no entry lost',
			);
		});

		test('lookup finds every entry and nothing else', function (assert) {
			for (const shape of PRESET_SHAPES) {
				assert.strictEqual(
					presetShape(shape.id),
					shape,
					shape.id,
				);
			}
			assert.strictEqual(
				presetShape('no-such-symbol'),
				undefined,
			);
			assert.strictEqual(presetShape(''), undefined);
		});

		// sync.ts falls back to M0,0 on bad d; truncated string → invisible layer not throw
		test('every path is one closed d string', function (assert) {
			for (const shape of PRESET_SHAPES) {
				assert.true(
					shape.d.startsWith('M'),
					`${shape.id} starts with a moveto`,
				);
				assert.true(
					shape.d.endsWith('Z'),
					`${shape.id} ends closed`,
				);
			}
		});

		// sync.ts scales by width/SYMBOL_GRID no translation; off-grid path lands outside box
		test('every path is drawn on the 256 grid and fills most of it', function (assert) {
			assert.strictEqual(SYMBOL_GRID, 256);
			for (const shape of PRESET_SHAPES) {
				const pts = pathEndpoints(shape.d);
				const xs = pts.map((p) => p.x);
				const ys = pts.map((p) => p.y);
				const box = {
					left: Math.min(...xs),
					top: Math.min(...ys),
					right: Math.max(...xs),
					bottom: Math.max(...ys),
				};
				const where = `${shape.id} ${JSON.stringify(box)}`;
				assert.true(box.left >= 0, `${where} left`);
				assert.true(box.top >= 0, `${where} top`);
				assert.true(
					box.right <= SYMBOL_GRID,
					`${where} right`,
				);
				assert.true(
					box.bottom <= SYMBOL_GRID,
					`${where} bottom`,
				);
				assert.true(
					box.right - box.left > 150,
					`${where} width`,
				);
				assert.true(
					box.bottom - box.top > 150,
					`${where} height`,
				);
			}
		});
	});
});
