import { module, test } from 'qunit';
import {
	applyFades,
	encodeWav,
	extractPeaks,
	fftMagnitudes,
	integratedLufs,
	meterLevel,
	peakDb,
} from 'delphitools-v2/lib/audio';

function sine(
	frequency: number,
	sampleRate: number,
	seconds: number,
	amplitude = 1,
): Float32Array {
	const out = new Float32Array(Math.round(sampleRate * seconds));
	for (let i = 0; i < out.length; i++)
		out[i] =
			amplitude *
			Math.sin((2 * Math.PI * frequency * i) / sampleRate);
	return out;
}

module('Unit | Lib | audio', function () {
	test('wav header and samples', function (assert) {
		const left = new Float32Array([0, 0.5, -0.5, 1, -1]);
		const right = new Float32Array([0, 0, 0, 0, 0]);
		const wav = encodeWav([left, right], 44100);
		const view = new DataView(
			wav.buffer,
			wav.byteOffset,
			wav.byteLength,
		);

		assert.strictEqual(wav.length, 44 + 5 * 2 * 2);
		assert.strictEqual(
			String.fromCharCode(...wav.subarray(0, 4)),
			'RIFF',
		);
		assert.strictEqual(
			String.fromCharCode(...wav.subarray(8, 12)),
			'WAVE',
		);
		assert.strictEqual(view.getUint16(20, true), 1, 'PCM');
		assert.strictEqual(view.getUint16(22, true), 2, 'channels');
		assert.strictEqual(view.getUint32(24, true), 44100);
		assert.strictEqual(view.getUint32(28, true), 44100 * 4);
		assert.strictEqual(view.getUint16(34, true), 16, 'bit depth');
		assert.strictEqual(view.getUint32(40, true), 20, 'data bytes');

		// interleave frame1 0.5→16383
		assert.strictEqual(view.getInt16(44 + 4, true), 16383);
		// frame4 clamp -1→-32768
		assert.strictEqual(view.getInt16(44 + 16, true), -32768);
	});

	test('peaks per bucket across channels', function (assert) {
		const a = new Float32Array([0.5, 0.5, -0.25, -0.25]);
		const b = new Float32Array([-0.75, 0, 0, 1]);
		const peaks = extractPeaks([a, b], 2);

		assert.deepEqual(
			[...peaks.max].map((v) => +v.toFixed(2)),
			[0.5, 1],
		);
		assert.deepEqual(
			[...peaks.min].map((v) => +v.toFixed(2)),
			[-0.75, -0.25],
		);
	});

	test('fades taper both ends', function (assert) {
		const channel = new Float32Array(1000).fill(1);
		applyFades([channel], 1000, 0.1, 0.2);

		assert.strictEqual(channel[0], 0, 'fade-in starts silent');
		assert.strictEqual(channel[500], 1, 'middle untouched');
		assert.strictEqual(channel[999], 0, 'fade-out ends silent');
		assert.true(channel[50]! > 0.4, 'halfway up the fade-in');
		assert.true(channel[50]! < 0.6, 'not yet full level');
	});

	test('peak level in dBFS', function (assert) {
		assert.strictEqual(
			peakDb([new Float32Array([0, 0.5, 0])]),
			20 * Math.log10(0.5),
		);
		assert.strictEqual(peakDb([new Float32Array(4)]), -Infinity);
	});

	test('meter level from byte time-domain data', function (assert) {
		const silent = new Uint8Array(64).fill(128);
		assert.strictEqual(meterLevel(silent), 0);

		const full = new Uint8Array(64).fill(0);
		assert.strictEqual(meterLevel(full), 1);

		const half = new Uint8Array(64).fill(192);
		assert.strictEqual(meterLevel(half), 0.5);
	});

	test('integrated loudness of the BS.1770 reference tone', function (assert) {
		// bs.1770 ref tone -3.01 lufs
		const left = sine(997, 48000, 2);
		const right = new Float32Array(left.length);
		const lufs = integratedLufs([left, right], 48000);
		assert.true(
			Math.abs(lufs - -3.01) < 0.3,
			`${lufs} within 0.3 LU of -3.01`,
		);
	});

	test('loudness gates out silence and near-silence', function (assert) {
		assert.true(
			Number.isNaN(
				integratedLufs(
					[new Float32Array(48000)],
					48000,
				),
			),
			'pure silence has no loudness',
		);
	});

	test('fft finds the tone bin', function (assert) {
		const n = 1024;
		const sampleRate = 8192;
		const bin = 64; // 512 Hz = 64*8192/1024
		const tone = sine(
			(bin * sampleRate) / n,
			sampleRate,
			n / sampleRate,
		);
		const magnitudes = fftMagnitudes(tone.subarray(0, n));

		let peak = 0;
		let peakBin = -1;
		magnitudes.forEach((m, i) => {
			if (m > peak) {
				peak = m;
				peakBin = i;
			}
		});
		assert.strictEqual(peakBin, bin);
		assert.true(peak > 0.4, `bin magnitude ${peak} ≈ 0.5`);
		assert.throws(() => fftMagnitudes(new Float32Array(1000)));
	});
});
