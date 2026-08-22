import { module, test } from 'qunit';
import { encodeWav, integratedLufs, peakDb } from 'delphitools-v2/lib/audio';
import { dbToGain, planGain } from 'delphitools-v2/lib/normalise';

const RATE = 48000;

// BS.1770 sums the channel powers, so a dual-mono 1 kHz sine of amplitude A
// reads -0.691 + 10·log10(2 · A² / 2) plus the K-weighting's ~+0.7 dB at
// 1 kHz: about -20.0 LUFS for A = 0.1.
function sine(amplitude: number, seconds = 3): Float32Array[] {
	const n = RATE * seconds;
	const out = new Float32Array(n);
	for (let i = 0; i < n; i++)
		out[i] = amplitude * Math.sin((2 * Math.PI * 1000 * i) / RATE);
	return [out, new Float32Array(out)];
}

const measure = (channels: Float32Array[]) => ({
	lufs: integratedLufs(channels, RATE),
	peak: peakDb(channels),
});

module('Unit | Lib | normalise', function () {
	test('gain lifts a quiet tone to the target', function (assert) {
		const { lufs, peak } = measure(sine(0.1));
		assert.ok(Math.abs(lufs - -20) < 0.6, `lufs ${lufs}`);
		assert.ok(Math.abs(peak - -20) < 0.1, `peak ${peak}`);
		const plan = planGain(lufs, peak, -14);
		assert.ok(
			Math.abs(plan.gainDb - 6) < 0.6,
			`gain ${plan.gainDb}`,
		);
		assert.false(plan.limited);
	});

	test('gain attenuates a hot tone', function (assert) {
		const { lufs, peak } = measure(sine(0.5));
		const plan = planGain(lufs, peak, -14);
		assert.ok(plan.gainDb < -7.4, `gain ${plan.gainDb}`);
		assert.ok(plan.gainDb > -8.6, `gain ${plan.gainDb}`);
		assert.false(plan.limited);
	});

	test('the ceiling caps the gain', function (assert) {
		const plan = planGain(-20, -20, 0, -1);
		assert.true(plan.limited);
		assert.strictEqual(plan.gainDb, 19);
		assert.strictEqual(plan.outPeakDb, -1);
	});

	test('silence gets no gain', function (assert) {
		const plan = planGain(-Infinity, -Infinity, -14);
		assert.strictEqual(plan.gainDb, 0);
		assert.false(plan.limited);
	});

	test('encodeWav applies a linear gain before the clamp', function (assert) {
		const bytes = encodeWav(
			[new Float32Array([0.25, -0.25, 0.9])],
			8000,
			dbToGain(6.0206),
		);
		const view = new DataView(bytes.buffer);
		assert.ok(Math.abs(view.getInt16(44, true) - 16383) <= 1);
		assert.ok(Math.abs(view.getInt16(46, true) - -16384) <= 1);
		assert.strictEqual(view.getInt16(48, true), 32767, 'clamped');
	});
});
