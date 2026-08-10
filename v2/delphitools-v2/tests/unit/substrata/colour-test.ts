import { module, test } from 'qunit';
import {
	clampOklch,
	hexToOklch,
	hexToRgb,
	linearToSrgb,
	oklabToOklch,
	oklabToRgb,
	oklchToHex,
	oklchToOklab,
	oklchToRgb,
	rgbToHex,
	rgbToOklab,
	rgbToOklch,
	srgbToLinear,
	type RGB,
} from 'delphitools-v2/lib/substrata/colour-convert';
import {
	hslToRgb,
	hsvToHsl,
	hsvToRgb,
	rgbToHsl,
	rgbToHsv,
} from 'delphitools-v2/lib/substrata/colour-hsv';
import {
	band,
	prismColour,
	prismHex,
	wavelengthToRgb,
	PRISM_HI,
	PRISM_LO,
} from 'delphitools-v2/lib/substrata/colour-prism';
import {
	bandCentre,
	spectrumToRgb,
	SPECTRUM_HI,
	SPECTRUM_LO,
} from 'delphitools-v2/lib/substrata/colour-spectrum';

/**
 * Float comparison where `expected` is written as the arithmetic that produces
 * it, so the assertion carries the derivation rather than a copied constant.
 */
function near(
	assert: Assert,
	actual: number,
	expected: number,
	epsilon: number,
	message: string,
): void {
	assert.true(
		Math.abs(actual - expected) <= epsilon,
		`${message}: ${actual} within ${epsilon} of ${expected}`,
	);
}

/** Every 17th byte: 0, 17, … 255, so 255 itself is covered. */
const BYTE_SWEEP = Array.from({ length: 16 }, (_, i) => i * 17);

module('Unit | Substrata | colour-convert', function () {
	test('parses six-digit hex with or without the hash, in any case', function (assert) {
		const blue: RGB = { r: 59, g: 130, b: 246 };
		assert.deepEqual(hexToRgb('#3b82f6'), blue);
		assert.deepEqual(hexToRgb('3b82f6'), blue);
		assert.deepEqual(hexToRgb('#3B82F6'), blue);
		assert.deepEqual(hexToRgb('  #3b82f6  '), blue);
	});

	test('rejects hex that is not exactly six digits', function (assert) {
		for (const junk of [
			'',
			'#fff',
			'#3b82f6ff',
			'#3b82f',
			'zzzzzz',
			'#12345g',
			'rgb(1,2,3)',
		]) {
			assert.strictEqual(
				hexToRgb(junk),
				null,
				JSON.stringify(junk),
			);
		}
	});

	test('rounds and clamps out-of-gamut channels when writing hex', function (assert) {
		assert.strictEqual(
			rgbToHex({ r: 300, g: -20, b: 127.5 }),
			'#ff0080',
		);
		assert.strictEqual(rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
		assert.strictEqual(
			rgbToHex({ r: 255, g: 255, b: 255 }),
			'#ffffff',
		);
		// Single-digit channels need the zero pad, or the string loses a byte.
		assert.strictEqual(rgbToHex({ r: 1, g: 2, b: 3 }), '#010203');
	});

	test('the sRGB transfer function and its inverse agree, and meet at the kink', function (assert) {
		assert.strictEqual(srgbToLinear(0), 0);
		assert.strictEqual(srgbToLinear(1), 1);
		assert.strictEqual(linearToSrgb(0), 0);
		near(assert, linearToSrgb(1), 1, 1e-12, 'linear 1 is sRGB 1');
		near(
			assert,
			srgbToLinear(0.5),
			Math.pow((0.5 + 0.055) / 1.055, 2.4),
			1e-15,
			'the curve branch is the IEC 61966-2-1 power law',
		);

		let worst = 0;
		for (let i = 0; i <= 100; i++) {
			const c = i / 100;
			worst = Math.max(
				worst,
				Math.abs(linearToSrgb(srgbToLinear(c)) - c),
			);
		}
		near(
			assert,
			worst,
			0,
			1e-12,
			'round trip over the whole 0..1 sweep',
		);

		// The two branches are only continuous if the thresholds match; a port
		// that copied one and not the other shows up as a step here.
		near(
			assert,
			linearToSrgb(srgbToLinear(0.04045)),
			0.04045,
			1e-6,
			'the piecewise branches join at the threshold',
		);
	});

	test('white and black sit on the OKLab poles', function (assert) {
		const white = rgbToOklab({ r: 255, g: 255, b: 255 });
		near(assert, white.L, 1, 1e-6, 'white L');
		near(assert, white.a, 0, 1e-6, 'white a');
		near(assert, white.b, 0, 1e-6, 'white b');
		assert.deepEqual(rgbToOklab({ r: 0, g: 0, b: 0 }), {
			L: 0,
			a: 0,
			b: 0,
		});
	});

	test('every sampled sRGB triple survives the OKLab round trip byte-exact', function (assert) {
		let worst = 0;
		let offender = '';
		for (const r of BYTE_SWEEP) {
			for (const g of BYTE_SWEEP) {
				for (const b of BYTE_SWEEP) {
					const back = oklabToRgb(
						rgbToOklab({ r, g, b }),
					);
					const drift = Math.max(
						Math.abs(back.r - r),
						Math.abs(back.g - g),
						Math.abs(back.b - b),
					);
					if (drift > worst) {
						worst = drift;
						offender = `${r},${g},${b} -> ${back.r},${back.g},${back.b}`;
					}
				}
			}
		}
		assert.strictEqual(
			worst,
			0,
			`worst drift over 4096 triples ${offender}`,
		);
	});

	test('hex survives the OKLCH round trip byte-exact', function (assert) {
		for (const hex of [
			'#000000',
			'#ffffff',
			'#ff0000',
			'#00ff00',
			'#0000ff',
			'#808080',
			'#3b82f6',
			'#fa5f3c',
			'#1a2744',
		]) {
			assert.strictEqual(oklchToHex(hexToOklch(hex)!), hex);
		}
	});

	test('OKLab to OKLCH is the polar form of (a, b)', function (assert) {
		const polar = oklabToOklch({ L: 0.5, a: 0.3, b: 0.4 });
		assert.strictEqual(polar.L, 0.5, 'L passes through');
		near(assert, polar.C, 0.5, 1e-15, 'C is hypot(0.3, 0.4)');
		near(
			assert,
			polar.h,
			(Math.atan2(0.4, 0.3) * 180) / Math.PI,
			1e-12,
			'h is 53.13 degrees',
		);

		// atan2 returns negatives below the a axis; the hue must come back as
		// 270, not -90, or every blue-violet lands in the wrong quadrant.
		near(
			assert,
			oklabToOklch({ L: 0.5, a: 0.1, b: 0 }).h,
			0,
			1e-12,
			'a+',
		);
		near(
			assert,
			oklabToOklch({ L: 0.5, a: 0, b: 0.1 }).h,
			90,
			1e-12,
			'b+',
		);
		near(
			assert,
			oklabToOklch({ L: 0.5, a: -0.1, b: 0 }).h,
			180,
			1e-12,
			'a-',
		);
		near(
			assert,
			oklabToOklch({ L: 0.5, a: 0, b: -0.1 }).h,
			270,
			1e-12,
			'b-',
		);
	});

	test('OKLCH back to OKLab is the inverse of the polar form', function (assert) {
		const lab = { L: 0.62, a: -0.05, b: -0.17 };
		const back = oklchToOklab(oklabToOklch(lab));
		near(assert, back.L, lab.L, 1e-12, 'L');
		near(assert, back.a, lab.a, 1e-12, 'a');
		near(assert, back.b, lab.b, 1e-12, 'b');
	});

	test('clampOklch bounds L and C and wraps hue into [0, 360)', function (assert) {
		assert.deepEqual(clampOklch({ L: 2, C: 0.9, h: 370 }), {
			L: 1,
			C: 0.4,
			h: 10,
		});
		assert.deepEqual(clampOklch({ L: -1, C: -0.1, h: -10 }), {
			L: 0,
			C: 0,
			h: 350,
		});
		assert.strictEqual(clampOklch({ L: 0.5, C: 0.1, h: 360 }).h, 0);
		assert.strictEqual(clampOklch({ L: 0.5, C: 0.1, h: 720 }).h, 0);
		assert.strictEqual(
			clampOklch({ L: 0.5, C: 0.1, h: -370 }).h,
			350,
		);
	});

	test('oklchToRgb clamps its input first', function (assert) {
		assert.deepEqual(
			oklchToRgb({ L: 0.7, C: 0.15, h: 420 }),
			oklchToRgb({ L: 0.7, C: 0.15, h: 60 }),
			'hue past 360 wraps rather than falling off the end',
		);
		assert.deepEqual(
			oklchToRgb({ L: 0.7, C: 5, h: 60 }),
			oklchToRgb({ L: 0.7, C: 0.4, h: 60 }),
			'chroma above the cap is the capped colour',
		);
		assert.deepEqual(oklchToRgb({ L: 1, C: 0, h: 0 }), {
			r: 255,
			g: 255,
			b: 255,
		});
		assert.deepEqual(oklchToRgb({ L: 0, C: 0, h: 0 }), {
			r: 0,
			g: 0,
			b: 0,
		});
	});

	// The matrices do not cancel exactly for equal channels, so grey keeps a
	// chroma around 2e-8 and a hue of ~89.9 degrees rather than 0. Anything
	// reading hue back off a grey swatch gets that number, which is why the
	// picker stores HSV instead (see colour-hsv.ts).
	test('grey has no chroma, and therefore no meaningful hue', function (assert) {
		for (const v of [0, 64, 128, 200, 255]) {
			const oklch = rgbToOklch({ r: v, g: v, b: v });
			near(assert, oklch.C, 0, 1e-6, `grey ${v} chroma`);
		}
		near(
			assert,
			rgbToOklch({ r: 255, g: 255, b: 255 }).h,
			rgbToOklch({ r: 128, g: 128, b: 128 }).h,
			1e-6,
			'the phantom hue is at least the same for every grey',
		);
	});

	test('hexToOklch reports unparsable hex as null', function (assert) {
		assert.strictEqual(hexToOklch('#fff'), null);
		assert.strictEqual(hexToOklch('nope'), null);
		assert.ok(hexToOklch('#3b82f6'));
	});
});

module('Unit | Substrata | colour-hsv', function () {
	const CORNERS: [number, RGB][] = [
		[0, { r: 255, g: 0, b: 0 }],
		[60, { r: 255, g: 255, b: 0 }],
		[120, { r: 0, g: 255, b: 0 }],
		[180, { r: 0, g: 255, b: 255 }],
		[240, { r: 0, g: 0, b: 255 }],
		[300, { r: 255, g: 0, b: 255 }],
	];

	test('full saturation at the six hue corners gives the pure sRGB corners', function (assert) {
		for (const [h, rgb] of CORNERS) {
			assert.deepEqual(
				hsvToRgb({ h, s: 1, v: 1 }),
				rgb,
				`hsv ${h}`,
			);
			assert.deepEqual(
				hslToRgb({ h, s: 1, l: 0.5 }),
				rgb,
				`hsl ${h}`,
			);
		}
	});

	test('hue wraps at 360 in both directions', function (assert) {
		assert.deepEqual(hsvToRgb({ h: 360, s: 1, v: 1 }), {
			r: 255,
			g: 0,
			b: 0,
		});
		assert.deepEqual(hsvToRgb({ h: -60, s: 1, v: 1 }), {
			r: 255,
			g: 0,
			b: 255,
		});
		assert.deepEqual(hsvToRgb({ h: 840, s: 1, v: 1 }), {
			r: 0,
			g: 255,
			b: 0,
		});
		assert.deepEqual(
			hslToRgb({ h: -120, s: 1, l: 0.5 }),
			hslToRgb({ h: 240, s: 1, l: 0.5 }),
		);
	});

	test('zero saturation is grey at the value, and zero value is black', function (assert) {
		assert.deepEqual(hsvToRgb({ h: 200, s: 0, v: 0.5 }), {
			r: 128,
			g: 128,
			b: 128,
		});
		assert.deepEqual(hsvToRgb({ h: 200, s: 1, v: 0 }), {
			r: 0,
			g: 0,
			b: 0,
		});
	});

	test('HSL lightness at the extremes is white and black whatever the hue', function (assert) {
		for (const [h] of CORNERS) {
			assert.deepEqual(
				hslToRgb({ h, s: 1, l: 1 }),
				{ r: 255, g: 255, b: 255 },
				`hue ${h} at l=1`,
			);
			assert.deepEqual(
				hslToRgb({ h, s: 1, l: 0 }),
				{ r: 0, g: 0, b: 0 },
				`hue ${h} at l=0`,
			);
		}
	});

	test('achromatic sRGB reads as zero saturation and hue zero', function (assert) {
		for (const v of [0, 64, 128, 255]) {
			const hsv = rgbToHsv({ r: v, g: v, b: v });
			assert.strictEqual(
				hsv.s,
				0,
				`grey ${v} hsv saturation`,
			);
			assert.strictEqual(hsv.h, 0, `grey ${v} hsv hue`);
			assert.strictEqual(hsv.v, v / 255, `grey ${v} value`);

			const hsl = rgbToHsl({ r: v, g: v, b: v });
			assert.strictEqual(
				hsl.s,
				0,
				`grey ${v} hsl saturation`,
			);
			assert.strictEqual(hsl.h, 0, `grey ${v} hsl hue`);
			assert.strictEqual(
				hsl.l,
				v / 255,
				`grey ${v} lightness`,
			);
		}
	});

	test('every sampled sRGB triple survives the HSV and HSL round trips byte-exact', function (assert) {
		let worstHsv = 0;
		let worstHsl = 0;
		let offender = '';
		for (const r of BYTE_SWEEP) {
			for (const g of BYTE_SWEEP) {
				for (const b of BYTE_SWEEP) {
					const viaHsv = hsvToRgb(
						rgbToHsv({ r, g, b }),
					);
					const viaHsl = hslToRgb(
						rgbToHsl({ r, g, b }),
					);
					const dv = Math.max(
						Math.abs(viaHsv.r - r),
						Math.abs(viaHsv.g - g),
						Math.abs(viaHsv.b - b),
					);
					const dl = Math.max(
						Math.abs(viaHsl.r - r),
						Math.abs(viaHsl.g - g),
						Math.abs(viaHsl.b - b),
					);
					if (
						Math.max(dv, dl) >
						Math.max(worstHsv, worstHsl)
					) {
						offender = `${r},${g},${b}`;
					}
					worstHsv = Math.max(worstHsv, dv);
					worstHsl = Math.max(worstHsl, dl);
				}
			}
		}
		assert.strictEqual(
			worstHsv,
			0,
			`hsv worst drift at ${offender}`,
		);
		assert.strictEqual(
			worstHsl,
			0,
			`hsl worst drift at ${offender}`,
		);
	});

	// #1a2744 is (26, 39, 68): max = b, min = r, so hue runs off the blue
	// branch and every component below is hand-derivable from those three.
	test('reads a mid-tone blue as hand-computed HSV and HSL', function (assert) {
		const navy: RGB = { r: 0x1a, g: 0x27, b: 0x44 };

		const hsv = rgbToHsv(navy);
		near(assert, hsv.h, ((26 - 39) / 42 + 4) * 60, 1e-12, 'hue');
		near(assert, hsv.s, 42 / 68, 1e-15, 'saturation is d/max');
		near(assert, hsv.v, 68 / 255, 1e-15, 'value is max');

		const hsl = rgbToHsl(navy);
		near(
			assert,
			hsl.h,
			((26 - 39) / 42 + 4) * 60,
			1e-12,
			'same hue',
		);
		near(
			assert,
			hsl.l,
			(68 + 26) / 2 / 255,
			1e-15,
			'lightness is mid',
		);
		near(
			assert,
			hsl.s,
			42 /
				255 /
				(1 - Math.abs((2 * (68 + 26)) / 2 / 255 - 1)),
			1e-15,
			'saturation is d over the chroma envelope',
		);
	});

	test('reads the hue of a colour whose maximum is red and whose blue exceeds green', function (assert) {
		// ((g - b) / d) % 6 is negative here; without the +360 the picker's hue
		// ring would jump to the far side for every magenta.
		assert.strictEqual(rgbToHsv({ r: 255, g: 0, b: 255 }).h, 300);
		assert.strictEqual(rgbToHsl({ r: 255, g: 0, b: 255 }).h, 300);
		near(
			assert,
			rgbToHsv({ r: 255, g: 0, b: 128 }).h,
			360 - (128 / 255) * 60,
			1e-12,
			'a rose lands between magenta and red',
		);
	});

	test('HSV to HSL agrees with converting each to sRGB', function (assert) {
		let worst = 0;
		let offender = '';
		for (let h = 0; h < 360; h += 15) {
			for (let si = 0; si <= 10; si++) {
				for (let vi = 0; vi <= 10; vi++) {
					const hsv = {
						h,
						s: si / 10,
						v: vi / 10,
					};
					const direct = hsvToRgb(hsv);
					const bridged = hslToRgb(hsvToHsl(hsv));
					const drift = Math.max(
						Math.abs(direct.r - bridged.r),
						Math.abs(direct.g - bridged.g),
						Math.abs(direct.b - bridged.b),
					);
					if (drift > worst) {
						worst = drift;
						offender = `${h}/${si / 10}/${vi / 10}`;
					}
				}
			}
		}
		// One byte apart at most: the two paths round at different points.
		assert.true(worst <= 1, `worst drift ${worst} at ${offender}`);
		assert.deepEqual(hsvToHsl({ h: 0, s: 1, v: 1 }), {
			h: 0,
			s: 1,
			l: 0.5,
		});
		assert.deepEqual(hsvToHsl({ h: 210, s: 1, v: 0 }), {
			h: 210,
			s: 0,
			l: 0,
		});
		assert.deepEqual(hsvToHsl({ h: 210, s: 0, v: 1 }), {
			h: 210,
			s: 0,
			l: 1,
		});
	});

	test('hsvToHsl passes the hue through without wrapping', function (assert) {
		assert.strictEqual(hsvToHsl({ h: 400, s: 1, v: 1 }).h, 400);
		assert.strictEqual(hsvToHsl({ h: -40, s: 1, v: 1 }).h, -40);
	});

	// The four converters do no range checking; callers hold the 0..1 / 0..255
	// contract. Pinned because a caller that stops clamping gets these values
	// rather than an exception.
	test('out-of-range input is passed through, not clamped', function (assert) {
		assert.deepEqual(hsvToRgb({ h: 0, s: 1, v: 2 }), {
			r: 510,
			g: 0,
			b: 0,
		});
		assert.deepEqual(hslToRgb({ h: 0, s: 1, l: 1.5 }), {
			r: 255,
			g: 510,
			b: 510,
		});
		near(
			assert,
			rgbToHsv({ r: 300, g: 0, b: 0 }).v,
			300 / 255,
			1e-15,
			'value above 1',
		);
	});
});

module('Unit | Substrata | colour-prism', function () {
	test('the reel spans the visible range', function (assert) {
		assert.strictEqual(PRISM_LO, 380);
		assert.strictEqual(PRISM_HI, 700);
	});

	test('each band label starts at its own edge', function (assert) {
		const edges: [number, string][] = [
			[449, 'violet'],
			[450, 'blue'],
			[484, 'blue'],
			[485, 'cyan'],
			[499, 'cyan'],
			[500, 'green'],
			[564, 'green'],
			[565, 'yellow'],
			[589, 'yellow'],
			[590, 'orange'],
			[624, 'orange'],
			[625, 'red'],
			[700, 'red'],
		];
		for (const [wl, name] of edges) {
			assert.strictEqual(band(wl), name, `${wl} nm`);
		}
	});

	test('band saturates outside the reel rather than returning nothing', function (assert) {
		assert.strictEqual(band(PRISM_LO), 'violet');
		assert.strictEqual(band(-100), 'violet');
		assert.strictEqual(band(2000), 'red');
	});

	test('the spectrum anchors are the pure primaries and secondaries', function (assert) {
		assert.deepEqual(
			wavelengthToRgb(440),
			{ r: 0, g: 0, b: 255 },
			'440 blue',
		);
		assert.deepEqual(
			wavelengthToRgb(490),
			{ r: 0, g: 255, b: 255 },
			'490 cyan',
		);
		assert.deepEqual(
			wavelengthToRgb(510),
			{ r: 0, g: 255, b: 0 },
			'510 green',
		);
		assert.deepEqual(
			wavelengthToRgb(580),
			{ r: 255, g: 255, b: 0 },
			'580 yellow',
		);
		assert.deepEqual(
			wavelengthToRgb(645),
			{ r: 255, g: 0, b: 0 },
			'645 red',
		);
		assert.deepEqual(
			wavelengthToRgb(PRISM_HI),
			{ r: 255, g: 0, b: 0 },
			'the top of the reel is still full red, before the roll-off',
		);
	});

	test('the violet end rolls off to 30 per cent intensity', function (assert) {
		// At 380 the roll-off factor is 0.3, and the 0.8 display gamma turns
		// that into round(255 * 0.3 ** 0.8) = 97 on both lit channels.
		assert.deepEqual(wavelengthToRgb(380), {
			r: Math.round(255 * Math.pow(0.3, 0.8)),
			g: 0,
			b: Math.round(255 * Math.pow(0.3, 0.8)),
		});
		assert.strictEqual(wavelengthToRgb(380).b, 97, 'which is 97');
		// The roll-off stops at 420, so blue is at full there.
		assert.strictEqual(wavelengthToRgb(420).b, 255);
	});

	test('WATTS scales toward black and NTU lifts toward white', function (assert) {
		assert.deepEqual(prismColour(550, { watts: 0, ntu: 0 }), {
			r: 0,
			g: 0,
			b: 0,
		});
		assert.deepEqual(
			prismColour(550, { watts: 0, ntu: 1 }),
			{ r: 255, g: 255, b: 255 },
			'full haze is white even with the light off',
		);
		assert.deepEqual(prismColour(645, { watts: 0.5, ntu: 0 }), {
			r: 128,
			g: 0,
			b: 0,
		});
		// Half haze on pure red: 0 + (255 - 0) * 0.5 rounds up to 128.
		assert.deepEqual(prismColour(645, { watts: 1, ntu: 0.5 }), {
			r: 255,
			g: 128,
			b: 128,
		});
	});

	test('watts 1 and ntu 0 is the bare wavelength colour', function (assert) {
		for (let wl = PRISM_LO; wl <= PRISM_HI; wl += 10) {
			assert.deepEqual(
				prismColour(wl, { watts: 1, ntu: 0 }),
				wavelengthToRgb(wl),
				`${wl} nm`,
			);
		}
	});

	test('knob values outside 0..1 still produce a valid byte', function (assert) {
		assert.deepEqual(prismColour(645, { watts: -1, ntu: 0 }), {
			r: 0,
			g: 0,
			b: 0,
		});
		assert.deepEqual(prismColour(645, { watts: 2, ntu: 0 }), {
			r: 255,
			g: 0,
			b: 0,
		});
	});

	test('prismHex writes two upper-case digits per channel', function (assert) {
		assert.strictEqual(
			prismHex(645, { watts: 1, ntu: 0 }),
			'#FF0000',
		);
		assert.strictEqual(
			prismHex(645, { watts: 1, ntu: 0.5 }),
			'#FF8080',
		);
		assert.strictEqual(
			prismHex(550, { watts: 0, ntu: 0 }),
			'#000000',
		);
		// 460 nm is r=0, g=123: the red channel needs the pad.
		assert.strictEqual(
			prismHex(460, { watts: 1, ntu: 0 }),
			'#007BFF',
		);
	});

	// The intensity roll-off is linear in wavelength and goes negative past
	// ~814 nm, and Math.pow of a negative base with a fractional exponent is
	// NaN. Nothing guards it, so callers must keep the input inside the reel.
	test('far outside the reel the colour becomes NaN', function (assert) {
		assert.strictEqual(
			wavelengthToRgb(800).r,
			48,
			'800 nm still resolves',
		);
		assert.true(
			Number.isNaN(wavelengthToRgb(1000).r),
			'1000 nm does not',
		);
		assert.strictEqual(
			prismHex(1000, { watts: 1, ntu: 0 }),
			'#NAN0000',
		);
	});
});

module('Unit | Substrata | colour-spectrum', function () {
	const flat = (n: number, v: number): number[] =>
		Array.from({ length: n }, () => v);

	/** n bands, all dark except the listed indices. */
	function lit(n: number, ...indices: number[]): number[] {
		const bands = flat(n, 0);
		for (const i of indices) bands[i] = 1;
		return bands;
	}

	test('band centres are inset half a band from each end', function (assert) {
		assert.strictEqual(SPECTRUM_LO, 380);
		assert.strictEqual(SPECTRUM_HI, 700);
		assert.strictEqual(
			bandCentre(0, 1),
			540,
			'one band centres the range',
		);
		assert.deepEqual(
			[bandCentre(0, 2), bandCentre(1, 2)],
			[460, 620],
			'two bands sit a quarter in from each end',
		);
		assert.deepEqual(
			[0, 1, 2, 3, 4, 5, 6, 7].map((i) => bandCentre(i, 8)),
			[400, 440, 480, 520, 560, 600, 640, 680],
			'eight bands step by 40 nm',
		);
	});

	test('a flat SPD renders the same colour at any band count', function (assert) {
		// An equal-energy SPD is illuminant E, which under the D65 matrix comes
		// out warm rather than neutral, so the answer is not 255,255,255.
		const white = { r: 255, g: 230, b: 225 };
		for (const n of [1, 2, 4, 32, 64]) {
			assert.deepEqual(
				spectrumToRgb(flat(n, 1)),
				white,
				`${n} bands`,
			);
		}
		// The n === 1 shortcut in the interpolator has to agree with the
		// general path at any other level too.
		assert.deepEqual(
			spectrumToRgb([0.5]),
			spectrumToRgb(flat(8, 0.5)),
		);
	});

	test('the brightness cap normalises, and lowering the bands darkens', function (assert) {
		const one = spectrumToRgb(flat(32, 1));
		assert.deepEqual(
			spectrumToRgb(flat(32, 2)),
			one,
			'above the cap the ratios are all that survive',
		);

		const half = spectrumToRgb(flat(32, 0.5));
		assert.true(half.r < one.r, `r ${half.r} < ${one.r}`);
		assert.true(half.g < one.g, `g ${half.g} < ${one.g}`);
		assert.true(half.b < one.b, `b ${half.b} < ${one.b}`);

		const quarter = spectrumToRgb(flat(32, 0.25));
		assert.true(quarter.r < half.r, `r ${quarter.r} < ${half.r}`);
	});

	test('an empty, dark or negative SPD is black', function (assert) {
		assert.deepEqual(
			spectrumToRgb([]),
			{ r: 0, g: 0, b: 0 },
			'no bands',
		);
		assert.deepEqual(
			spectrumToRgb(flat(16, 0)),
			{ r: 0, g: 0, b: 0 },
			'all dark',
		);
		assert.deepEqual(
			spectrumToRgb(flat(16, -1)),
			{ r: 0, g: 0, b: 0 },
			'negative energy clamps rather than wrapping or going NaN',
		);
	});

	test('does not mutate the band array', function (assert) {
		const bands = [0.1, 0.2, 0.9, 0.4];
		spectrumToRgb(bands);
		assert.deepEqual(bands, [0.1, 0.2, 0.9, 0.4]);
	});

	test('a single lit band lands in the channel its wavelength belongs to', function (assert) {
		// 16 bands centre on 390, 410 … 690.
		const blue = spectrumToRgb(lit(16, 3));
		assert.strictEqual(bandCentre(3, 16), 450, 'band 3 is 450 nm');
		assert.true(
			blue.b > blue.r,
			`450 nm: b ${blue.b} > r ${blue.r}`,
		);
		assert.true(
			blue.b > blue.g,
			`450 nm: b ${blue.b} > g ${blue.g}`,
		);

		const green = spectrumToRgb(lit(16, 8));
		assert.strictEqual(bandCentre(8, 16), 550, 'band 8 is 550 nm');
		assert.true(
			green.g > green.r,
			`550 nm: g ${green.g} > r ${green.r}`,
		);
		assert.true(
			green.g > green.b,
			`550 nm: g ${green.g} > b ${green.b}`,
		);

		const red = spectrumToRgb(lit(16, 12));
		assert.strictEqual(
			bandCentre(12, 16),
			630,
			'band 12 is 630 nm',
		);
		assert.true(red.r > red.g, `630 nm: r ${red.r} > g ${red.g}`);
		assert.true(red.r > red.b, `630 nm: r ${red.r} > b ${red.b}`);
	});

	test('two lobes reach a colour no single band reaches', function (assert) {
		const blue = spectrumToRgb(lit(16, 3));
		const red = spectrumToRgb(lit(16, 12));
		const magenta = spectrumToRgb(lit(16, 3, 12));

		assert.strictEqual(
			magenta.g,
			0,
			'no green between the two lobes',
		);
		assert.true(magenta.r >= red.r, `r ${magenta.r} >= ${red.r}`);
		assert.true(magenta.b >= blue.b, `b ${magenta.b} >= ${blue.b}`);
		// Neither lobe alone gets both ends up; that is the whole point of
		// integrating the curve rather than picking a wavelength.
		assert.true(red.b < 150, `red lobe alone has b ${red.b}`);
		assert.true(blue.r < 150, `blue lobe alone has r ${blue.r}`);
	});
});
