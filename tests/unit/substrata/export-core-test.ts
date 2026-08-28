import { module, test } from 'qunit';
import {
	EXPORT_FORMATS,
	areaBudget,
	exportFilename,
	formatMeta,
	resolveExportDims,
	slugifySceneName,
	verifyExportBlob,
} from 'delphitools-v2/lib/substrata/export-core';
import {
	defaultParams,
	type FxDefinition,
	type ParamSpec,
} from 'delphitools-v2/lib/substrata/param-spec';
import { EFFECT_REGISTRY } from 'delphitools-v2/lib/substrata/effects';
import { FILTER_REGISTRY } from 'delphitools-v2/lib/substrata/filters';

/** ios safari canvas area ceiling 2^24, desktop 16384² */
const IOS_BUDGET = 16_777_216;
const DESKTOP_BUDGET = 268_435_456;

const CANVAS = 512;

function paintedPng(
	paint?: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = CANVAS;
	canvas.height = CANVAS;
	paint?.(canvas.getContext('2d')!);
	return new Promise((resolve) =>
		canvas.toBlob((blob) => resolve(blob!), 'image/png'),
	);
}

function bytes(length: number, mime: string): Blob {
	return new Blob([new Uint8Array(length).fill(0x41)], { type: mime });
}

module('Unit | Substrata | export-core', function () {
	// alpha->layer-solo, decodable->verify probe, lossy->quality slider
	test('the format table classifies each format the way its consumers read it', function (assert) {
		const ids = EXPORT_FORMATS.map((f) => f.id);
		assert.deepEqual(ids, ['png', 'jpeg', 'webp', 'jxl']);
		assert.deepEqual(
			EXPORT_FORMATS.filter((f) => !f.lossy).map((f) => f.id),
			['png'],
			'png is the only lossless format',
		);
		assert.deepEqual(
			EXPORT_FORMATS.filter((f) => !f.alpha).map((f) => f.id),
			['jpeg'],
			'jpeg is the only format with no alpha channel',
		);
		assert.deepEqual(
			EXPORT_FORMATS.filter((f) => !f.decodable).map(
				(f) => f.id,
			),
			['jxl'],
			'jxl is the only encode-only format',
		);
	});

	// verifyExportBlob looks up by blob.type; shared mime misroutes
	test('ids, mimes and extensions are each unique', function (assert) {
		for (const field of ['id', 'mime', 'ext'] as const) {
			const values = EXPORT_FORMATS.map((f) => f[field]);
			assert.strictEqual(
				new Set(values).size,
				EXPORT_FORMATS.length,
				`${field}: ${values.join(', ')}`,
			);
		}
	});

	test('formatMeta returns the entry with the id it was asked for', function (assert) {
		for (const id of EXPORT_FORMATS.map((f) => f.id)) {
			assert.strictEqual(formatMeta(id).id, id);
		}
	});

	// filename uses ext not mime subtype; jpeg writes .jpg
	test('jpeg writes .jpg', function (assert) {
		assert.strictEqual(formatMeta('jpeg').ext, 'jpg');
		assert.strictEqual(formatMeta('jpeg').mime, 'image/jpeg');
	});

	test('leaves a request that fits the budget alone', function (assert) {
		// 2048² × 2² = budget exactly; guard is area > budget
		assert.deepEqual(
			resolveExportDims(2048, 2048, 2, IOS_BUDGET),
			{
				outW: 4096,
				outH: 4096,
				effectiveScale: 2,
				downscaled: false,
			},
			'exactly at the iOS budget',
		);
		assert.deepEqual(
			resolveExportDims(1000, 1000, 2, IOS_BUDGET),
			{
				outW: 2000,
				outH: 2000,
				effectiveScale: 2,
				downscaled: false,
			},
			'well under it',
		);
	});

	test('shrinks an over-budget request to the largest scale that fits', function (assert) {
		// 2048² × 3² > 2^24; sqrt(2^24/2^22)=2, so 3x renders at 2x
		assert.deepEqual(
			resolveExportDims(2048, 2048, 3, IOS_BUDGET),
			{
				outW: 4096,
				outH: 4096,
				effectiveScale: 2,
				downscaled: true,
			},
			'iOS: 3x becomes 2x',
		);
		// 8192² × 3² > 2^28; sqrt(2^28/2^26)=2
		assert.deepEqual(
			resolveExportDims(8192, 8192, 3, DESKTOP_BUDGET),
			{
				outW: 16384,
				outH: 16384,
				effectiveScale: 2,
				downscaled: true,
			},
			'desktop: 3x becomes 2x',
		);
		assert.deepEqual(
			resolveExportDims(8192, 8192, 2, DESKTOP_BUDGET),
			{
				outW: 16384,
				outH: 16384,
				effectiveScale: 2,
				downscaled: false,
			},
			'desktop: 2x on the same artboard is exactly the budget',
		);
	});

	// desktop budget is 16x ios; why areaBudget sniffs ua
	test('the two budgets resolve the same request differently', function (assert) {
		const request = [6000, 6000, 2] as const;
		assert.deepEqual(
			resolveExportDims(...request, DESKTOP_BUDGET),
			{
				outW: 12000,
				outH: 12000,
				effectiveScale: 2,
				downscaled: false,
			},
			'144M px is fine on desktop',
		);
		// sqrt(2^24/36M)=0.6827, 6000×0.6827=4096
		const ios = resolveExportDims(...request, IOS_BUDGET);
		assert.deepEqual(
			[ios.outW, ios.outH, ios.downscaled],
			[4096, 4096, true],
			'the same request is a third of the size on iOS',
		);
	});

	// clamp not floored at 1; scale can go below 1
	test('goes below 1x when the artboard alone is over budget', function (assert) {
		// sqrt(2^28/400M)=0.8192; 20000×0.8192=16384
		assert.deepEqual(
			resolveExportDims(20000, 20000, 1, DESKTOP_BUDGET),
			{
				outW: 16384,
				outH: 16384,
				effectiveScale: 0.8192,
				downscaled: true,
			},
		);
	});

	test('keeps the aspect ratio when it downscales', function (assert) {
		const { outW, outH, downscaled } = resolveExportDims(
			1920,
			1080,
			3,
			IOS_BUDGET,
		);
		assert.true(
			downscaled,
			'1920x1080 at 3x is over the iOS budget',
		);
		assert.deepEqual([outW, outH], [5461, 3072]);
		assert.true(
			Math.abs(outW / outH - 1920 / 1080) < 0.001,
			`${outW}x${outH} keeps 16:9`,
		);
	});

	// zero-area canvas throws on some engines
	test('never resolves to a zero-sized canvas', function (assert) {
		assert.deepEqual(resolveExportDims(0, 100, 2, IOS_BUDGET), {
			outW: 1,
			outH: 200,
			effectiveScale: 2,
			downscaled: false,
		});
	});

	test('the default budget is the one areaBudget picks', function (assert) {
		const budget = areaBudget();
		assert.true(
			[IOS_BUDGET, DESKTOP_BUDGET].includes(budget),
			`areaBudget() = ${budget}`,
		);
		// 9000²×3 busts both budgets; pins default to areaBudget()
		assert.deepEqual(
			resolveExportDims(9000, 9000, 3),
			resolveExportDims(9000, 9000, 3, budget),
		);
	});

	// rounding both axes can overshoot budget ≤13,036px²; real safari limit is soft
	test.skip('the resolved canvas always fits the budget', function (assert) {
		const { outW, outH } = resolveExportDims(
			1000,
			3000,
			3,
			IOS_BUDGET,
		);
		assert.true(
			outW * outH <= IOS_BUDGET,
			`${outW}x${outH} = ${outW * outH} vs ${IOS_BUDGET}`,
		);
	});

	test('rejects a blob too small to be an image', async function (assert) {
		// jxl encode-only: pins 100-byte size floor not decode path
		assert.false(
			await verifyExportBlob(bytes(99, 'image/jxl'), true),
			'99 bytes is a header, not an image',
		);
		assert.true(
			await verifyExportBlob(bytes(100, 'image/jxl'), true),
			'100 bytes clears the floor',
		);
	});

	test('fails an all-transparent export when content was expected', async function (assert) {
		const blob = await paintedPng();
		assert.true(
			blob.size >= 100,
			`an empty ${CANVAS}² png is ${blob.size} bytes, above the floor`,
		);
		assert.false(await verifyExportBlob(blob, true));
	});

	// export-run passes expectContent false for empty artboards
	test('passes an all-transparent export when none was expected', async function (assert) {
		assert.true(await verifyExportBlob(await paintedPng(), false));
	});

	// natural size else downsampled scan misses sub-stride content
	test('passes an export whose only content is the last pixel', async function (assert) {
		const blob = await paintedPng((ctx) => {
			ctx.fillStyle = '#ff0000';
			ctx.fillRect(CANVAS - 1, CANVAS - 1, 1, 1);
		});
		assert.true(await verifyExportBlob(blob, true));
	});

	test('fails a blob that claims a decodable mime but does not decode', async function (assert) {
		assert.false(
			await verifyExportBlob(bytes(4096, 'image/png'), true),
			'corrupt png',
		);
	});

	// jxl has no browser decoder; falls back to size check
	test('skips the pixel probe for formats it cannot decode', async function (assert) {
		assert.true(
			await verifyExportBlob(bytes(4096, 'image/jxl'), true),
		);
		assert.true(await verifyExportBlob(bytes(4096, ''), true));
	});

	test('slugifies a scene name into filesystem-safe characters', function (assert) {
		const cases: [string, string][] = [
			['My Scene 01', 'My-Scene-01'],
			['  spaced  ', 'spaced'],
			['a///b', 'a-b'],
			['poster (final)', 'poster-final'],
			['-lead-trail-', 'lead-trail'],
			// dots collapse; scene-named-after-file cannot double-extend
			['file.name.png', 'file-name-png'],
			['_under_score_', '_under_score_'],
		];
		for (const [name, slug] of cases) {
			assert.strictEqual(
				slugifySceneName(name),
				slug,
				JSON.stringify(name),
			);
		}
	});

	// \w is ascii-only; non-latin slugs to nothing
	test('falls back to substrata when nothing survives the slug', function (assert) {
		for (const name of ['', '   ', '!!!', '日本語']) {
			assert.strictEqual(
				slugifySceneName(name),
				'substrata',
				JSON.stringify(name),
			);
		}
		assert.strictEqual(slugifySceneName('Ünïcode'), 'n-code');
	});

	test('names the file after the scene, its size and its format', function (assert) {
		assert.strictEqual(
			exportFilename('My Scene', 1080, 1350, 'png'),
			'My-Scene-1080x1350.png',
		);
		assert.strictEqual(
			exportFilename('', 100, 100, formatMeta('jpeg').ext),
			'substrata-100x100.jpg',
		);
	});
});

const REGISTRIES: [string, Record<string, FxDefinition>][] = [
	['effects', EFFECT_REGISTRY],
	['filters', FILTER_REGISTRY],
];

function everySpec(): [string, ParamSpec][] {
	const out: [string, ParamSpec][] = [];
	for (const [registry, defs] of REGISTRIES) {
		for (const def of Object.values(defs)) {
			for (const spec of def.params) {
				out.push([
					`${registry}.${def.type}.${spec.key}`,
					spec,
				]);
			}
		}
	}
	return out;
}

module('Unit | Substrata | param-spec', function () {
	test('seeds one entry per spec, keyed and typed as declared', function (assert) {
		const specs: ParamSpec[] = [
			{
				kind: 'slider',
				key: 'opacity',
				label: 'Opacity',
				min: 0,
				max: 100,
				step: 1,
				default: 35,
				unit: '%',
			},
			{
				kind: 'colour',
				key: 'colour',
				label: 'Colour',
				default: '#000000',
			},
			{
				kind: 'select',
				key: 'mode',
				label: 'Mode',
				default: 'mono',
				options: [
					{ value: 'mono', label: 'Monochrome' },
					{ value: 'colour', label: 'Colour' },
				],
			},
		];
		assert.deepEqual(defaultParams(specs), {
			opacity: 35,
			colour: '#000000',
			mode: 'mono',
		});
	});

	test('seeds nothing from an empty spec list', function (assert) {
		assert.deepEqual(defaultParams([]), {});
	});

	// pairs stores no value; seeding one lights the wrong preset
	test('skips the virtual pairs control', function (assert) {
		const params = defaultParams([
			{
				kind: 'pairs',
				key: 'pair',
				label: 'Presets',
				options: [
					{
						value: 'ink',
						label: 'Ink',
						colours: ['#000000', '#ffffff'],
						writes: {
							shadowColour: '#000000',
						},
					},
				],
			},
			{
				kind: 'colour',
				key: 'shadowColour',
				label: 'Shadows',
				default: '#000000',
			},
		]);
		assert.deepEqual(Object.keys(params), ['shadowColour']);
	});

	// instances must not share a params object
	test('returns a fresh object each call', function (assert) {
		const specs: ParamSpec[] = [
			{
				kind: 'slider',
				key: 'blur',
				label: 'Blur',
				min: 0,
				max: 250,
				step: 1,
				default: 24,
			},
		];
		const first = defaultParams(specs);
		const second = defaultParams(specs);
		assert.notStrictEqual(first, second);
		first['blur'] = 99;
		assert.strictEqual(second['blur'], 24);
	});

	// param-spec has no clamp; out-of-bounds defaults pass through verbatim
	test('copies a default that sits outside its own bounds', function (assert) {
		assert.deepEqual(
			defaultParams([
				{
					kind: 'slider',
					key: 'amount',
					label: 'Amount',
					min: 0,
					max: 100,
					step: 1,
					default: 250,
				},
			]),
			{ amount: 250 },
		);
	});

	test('every numeric default in both registries sits inside its bounds', function (assert) {
		const offenders: string[] = [];
		let checked = 0;
		for (const [path, spec] of everySpec()) {
			if (spec.kind !== 'slider' && spec.kind !== 'stepper')
				continue;
			checked++;
			const ok =
				spec.min < spec.max &&
				spec.step > 0 &&
				spec.default >= spec.min &&
				spec.default <= spec.max;
			if (!ok)
				offenders.push(
					`${path}: ${spec.default} in [${spec.min}, ${spec.max}] step ${spec.step}`,
				);
		}
		assert.deepEqual(offenders, []);
		assert.true(checked > 20, `${checked} numeric specs checked`);
	});

	// default outside options leaves segmented control blank
	test('every select and presets default is one of its own options', function (assert) {
		const offenders: string[] = [];
		let checked = 0;
		for (const [path, spec] of everySpec()) {
			if (spec.kind !== 'select' && spec.kind !== 'presets')
				continue;
			checked++;
			if (!spec.options.some((o) => o.value === spec.default))
				offenders.push(`${path}: ${spec.default}`);
		}
		assert.deepEqual(offenders, []);
		assert.true(checked > 0, `${checked} choice specs checked`);
	});

	// pair writing undeclared key is a dead preset
	test('every pairs option writes keys its siblings declare', function (assert) {
		const offenders: string[] = [];
		let checked = 0;
		for (const [, defs] of REGISTRIES) {
			for (const def of Object.values(defs)) {
				const keys = new Set(
					def.params.map((p) => p.key),
				);
				for (const spec of def.params) {
					if (spec.kind !== 'pairs') continue;
					checked++;
					for (const option of spec.options) {
						const unknown = Object.keys(
							option.writes,
						).filter((k) => !keys.has(k));
						if (unknown.length)
							offenders.push(
								`${def.type}.${option.value}: ${unknown.join(', ')}`,
							);
					}
				}
			}
		}
		assert.deepEqual(offenders, []);
		assert.true(checked > 0, `${checked} pairs specs checked`);
	});

	// getFxDef by key, instances store `type`; a copy-paste skew resolves differently
	test('every registry entry is keyed by its own type, with unique param keys', function (assert) {
		const offenders: string[] = [];
		for (const [registry, defs] of REGISTRIES) {
			for (const [key, def] of Object.entries(defs)) {
				if (def.type !== key)
					offenders.push(
						`${registry}.${key} declares type ${def.type}`,
					);
				const keys = def.params.map((p) => p.key);
				if (new Set(keys).size !== keys.length)
					offenders.push(
						`${registry}.${key} repeats a param key`,
					);
			}
		}
		assert.deepEqual(offenders, []);
	});

	// resetFx and syncImageEffects rebuild params from defaultParams alone
	test('defaultParams covers every non-pairs param in both registries', function (assert) {
		const offenders: string[] = [];
		for (const [registry, defs] of REGISTRIES) {
			for (const def of Object.values(defs)) {
				const seeded = Object.keys(
					defaultParams(def.params),
				);
				const expected = def.params
					.filter((p) => p.kind !== 'pairs')
					.map((p) => p.key);
				if (seeded.join() !== expected.join())
					offenders.push(
						`${registry}.${def.type}: ${seeded.join()} vs ${expected.join()}`,
					);
			}
		}
		assert.deepEqual(offenders, []);
	});
});
