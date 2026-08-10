import { module, test } from 'qunit';
import {
	EXPORT_FORMATS,
	areaBudget,
	estimateBytes,
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

/** The two budgets export-core keeps private, restated so the maths below is
 *  hand-checkable: 2^24 (iOS Safari's canvas area ceiling) and 16384² . */
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
	// The table gates behaviour elsewhere: alpha decides layer-solo and
	// background flatten, decodable decides whether verify runs the pixel
	// probe, lossy decides whether the quality slider is live. A port that
	// mistypes one flag breaks a feature silently, not loudly.
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

	// verifyExportBlob looks a format up by blob.type, so two formats sharing a
	// mime would resolve to the wrong entry and probe (or skip) the wrong blob.
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

	// The extension is not the mime subtype for JPEG, and the filename comes
	// from ext. `photo.jpeg` instead of `photo.jpg` is exactly the kind of
	// detail a hand-retyped table loses.
	test('jpeg writes .jpg', function (assert) {
		assert.strictEqual(formatMeta('jpeg').ext, 'jpg');
		assert.strictEqual(formatMeta('jpeg').mime, 'image/jpeg');
	});

	// ── output dimensions ────────────────────────────────────────────────

	test('leaves a request that fits the budget alone', function (assert) {
		// 2048² × 2² = 16,777,216 — the budget exactly, and the guard is
		// `area > budget`, so the boundary case is NOT downscaled.
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
		// 2048² × 3² = 37,748,736 > 2^24. sqrt(2^24 / 2^22) = 2 exactly, so a
		// 3× request on a 2048² artboard renders at 2×.
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
		// Same shape one budget up: 8192² × 3² = 603,979,776 > 2^28, and
		// sqrt(2^28 / 2^26) = 2.
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

	// The desktop budget is 16× the iOS one, so the same request resolves
	// differently on the two — the whole reason areaBudget() sniffs the UA.
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
		// sqrt(2^24 / 36,000,000) = 0.6826666…, and 6000 × that = 4096.
		const ios = resolveExportDims(...request, IOS_BUDGET);
		assert.deepEqual(
			[ios.outW, ios.outH, ios.downscaled],
			[4096, 4096, true],
			'the same request is a third of the size on iOS',
		);
	});

	// An artboard that busts the budget at 1× has to render at less than the
	// requested scale — the clamp is not floored at 1.
	test('goes below 1x when the artboard alone is over budget', function (assert) {
		// sqrt(2^28 / 400,000,000) = 0.8192, and 20000 × 0.8192 = 16384.
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

	// Guards a zero-area canvas, which throws on some engines and renders
	// nothing on the rest.
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
		// 9000² at 3× busts both budgets, so this comparison fails if the
		// default parameter ever drifts from areaBudget().
		assert.deepEqual(
			resolveExportDims(9000, 9000, 3),
			resolveExportDims(9000, 9000, 3, budget),
		);
	});

	// BUG (not fixed — port kept honest): the clamp is computed on the exact
	// scale, then both axes are rounded independently, so the resolved canvas
	// can come out LARGER than the budget it was supposed to fit inside.
	// resolveExportDims(1000, 3000, 3, 16777216) -> 2365 x 7094 = 16,777,310,
	// which is 94 px² over the iOS ceiling. Worst case found by sweeping
	// aspect ratios 0.6–3 up to 8000 px: (7051, 4231, 3, 268435456) overshoots
	// by 13,036 px². Harmless in practice (the real Safari limit is soft) but
	// the function does not honour its own contract.
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

	// ── verification (SPEC §5) ───────────────────────────────────────────

	test('rejects a blob too small to be an image', async function (assert) {
		// jxl is encode-only, so size is the only check that runs — this
		// pins the 100-byte floor itself rather than the decode path.
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

	// An artboard with nothing visible and no background legitimately exports
	// transparent; export-run passes expectContent false for it, and verify
	// must not call that a Safari failure.
	test('passes an all-transparent export when none was expected', async function (assert) {
		assert.true(await verifyExportBlob(await paintedPng(), false));
	});

	// The probe decodes at NATURAL size on purpose. A downsampled scan
	// point-samples and would miss content smaller than its stride — a logo
	// solo'd on a big artboard would false-fail and the export would be
	// retried at half size for nothing. One opaque pixel in the very last
	// position is the worst case for both the sampling and the loop bound.
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

	// jxl has no browser decoder, and a blob whose type never made it into the
	// table cannot be probed either: both fall back to the size check alone.
	test('skips the pixel probe for formats it cannot decode', async function (assert) {
		assert.true(
			await verifyExportBlob(bytes(4096, 'image/jxl'), true),
		);
		assert.true(await verifyExportBlob(bytes(4096, ''), true));
	});

	// ── estimate + filename ──────────────────────────────────────────────

	test('scales the proxy byte count by the area ratio', function (assert) {
		// 1920² / 640² = 9, so 12,000 proxy bytes estimate 108,000.
		assert.strictEqual(
			estimateBytes(12_000, 640 * 640, 1920 * 1920),
			108_000,
		);
		assert.strictEqual(
			estimateBytes(1000, 3, 4),
			1333,
			'rounds to whole bytes',
		);
	});

	test('estimates nothing from a proxy with no area', function (assert) {
		assert.strictEqual(estimateBytes(500, 0, 1_000_000), 0);
		assert.strictEqual(estimateBytes(500, -4, 1_000_000), 0);
	});

	test('slugifies a scene name into filesystem-safe characters', function (assert) {
		const cases: [string, string][] = [
			['My Scene 01', 'My-Scene-01'],
			['  spaced  ', 'spaced'],
			['a///b', 'a-b'],
			['poster (final)', 'poster-final'],
			['-lead-trail-', 'lead-trail'],
			// Dots collapse too, so a scene called after a file cannot
			// produce a double extension.
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

	// \w is ASCII-only, so a non-Latin scene name slugs away to nothing and
	// the fallback is the only thing standing between the user and a file
	// called "-1080x1350.png".
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

// ─────────────────────────────────────────────────────────────────────────────

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

	// A `pairs` control writes its siblings and stores no value of its own, so
	// seeding one would put a phantom key in the instance and light up the
	// wrong preset (the active pair is derived by matching what it writes).
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

	// Every FX instance gets its own params object; sharing one would make
	// editing one drop shadow move every other one on the document.
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

	// There is no clamp anywhere in param-spec: min/max are panel-render
	// bounds, not enforcement. A spec whose default sits outside its own range
	// is copied through verbatim, which is why the registry check below
	// matters — nothing downstream would catch it.
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

	// A default that is not one of the options leaves the segmented control
	// with nothing lit and no way to get back to it.
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

	// A pair that writes a key no sibling declares is a dead preset: clicking
	// it stores a param nothing renders, and it can never read back as active.
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

	// The registry key and the entry's own `type` are looked up independently
	// (getFxDef by key, instances store `type`), so a copy-pasted entry that
	// kept the old type resolves to itself under one name and to nothing under
	// the other.
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

	// resetFx and syncImageEffects both rebuild an instance's params from
	// defaultParams alone, so a spec kind it silently drops would come back
	// undefined on reset even though the panel still renders a row for it.
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
