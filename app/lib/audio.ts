import { tracked } from '@glimmer/tracking';

const NOT_AUDIO = 'Only audio files are supported';
const DECODE_FAILED = 'Failed to decode audio.';

// chrome limits audio contexts
let sharedContext: AudioContext | null = null;

export function audioContext(): AudioContext {
	sharedContext ??= new AudioContext();
	return sharedContext;
}

export function channelsOf(buffer: AudioBuffer): Float32Array[] {
	return Array.from({ length: buffer.numberOfChannels }, (_, i) =>
		buffer.getChannelData(i),
	);
}

interface AudioIntakeHooks {
	onLoad?: (file: File) => void;
	onDecoded?: (buffer: AudioBuffer) => void;
}

export class AudioIntake {
	@tracked fileName = '';
	@tracked fileBytes = 0;
	file: File | null = null;
	@tracked fileType = '';
	@tracked buffer: AudioBuffer | null = null;
	@tracked busy = false;
	@tracked error = '';

	#hooks: AudioIntakeHooks;
	#loadToken = 0;

	constructor(hooks: AudioIntakeHooks = {}) {
		this.#hooks = hooks;
	}

	get baseName() {
		return this.fileName.replace(/\.[^.]+$/, '');
	}

	load = (file: File) => void this.#load(file);

	async #load(file: File) {
		const looksAudio =
			file.type.startsWith('audio/') ||
			/\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|webm)$/i.test(
				file.name,
			);
		if (!looksAudio) {
			this.error = NOT_AUDIO;
			return;
		}

		const token = ++this.#loadToken;
		this.busy = true;
		this.error = '';
		this.fileName = file.name;
		this.file = file;
		this.fileBytes = file.size;
		this.fileType = file.type;
		this.buffer = null;
		this.#hooks.onLoad?.(file);

		try {
			const buffer = await audioContext().decodeAudioData(
				await file.arrayBuffer(),
			);
			if (token !== this.#loadToken) return;
			this.buffer = buffer;
			this.busy = false;
			this.#hooks.onDecoded?.(buffer);
		} catch {
			if (token !== this.#loadToken) return;
			this.busy = false;
			this.error = DECODE_FAILED;
		}
	}

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.load(file);
		// permit repeat selection
		input.value = '';
	};

	drop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.load(file);
	};

	// prevent file navigation
	dragOver = (event: DragEvent) => {
		event.preventDefault();
	};

	clear = () => {
		this.#loadToken++;
		this.fileName = '';
		this.file = null;
		this.fileBytes = 0;
		this.fileType = '';
		this.buffer = null;
		this.busy = false;
		this.error = '';
	};
}

export class ViewWindow {
	static MIN_SPAN_S = 0.05;

	@tracked duration = 0;
	@tracked start = 0;
	@tracked end = 0;

	reset(duration: number) {
		this.duration = duration;
		this.start = 0;
		this.end = duration;
	}

	get span() {
		return this.end - this.start;
	}

	get isZoomed() {
		return this.start > 0 || this.end < this.duration - 1e-6;
	}

	get label() {
		return `${this.start.toFixed(2)} – ${this.end.toFixed(2)} s`;
	}

	set = (start: number, end: number) => {
		const from = Math.max(0, start);
		const to = Math.min(this.duration, end);
		if (to - from < ViewWindow.MIN_SPAN_S) return;
		this.start = from;
		this.end = to;
	};

	zoomIn = () => {
		const centre = (this.start + this.end) / 2;
		const half = Math.max(ViewWindow.MIN_SPAN_S / 2, this.span / 4);
		this.set(centre - half, centre + half);
	};

	zoomOut = () => {
		const centre = (this.start + this.end) / 2;
		const half = this.span;
		this.start = Math.max(0, centre - half);
		this.end = Math.min(this.duration, centre + half);
	};

	fit = () => {
		this.start = 0;
		this.end = this.duration;
	};
}

export interface WaveformPeaks {
	min: Float32Array;
	max: Float32Array;
}

export function extractPeaks(
	channels: Float32Array[],
	buckets: number,
): WaveformPeaks {
	const length = channels[0]?.length ?? 0;
	const min = new Float32Array(buckets);
	const max = new Float32Array(buckets);
	if (!length || buckets < 1) return { min, max };

	for (let b = 0; b < buckets; b++) {
		const from = Math.floor((b * length) / buckets);
		const to = Math.max(
			from + 1,
			Math.floor(((b + 1) * length) / buckets),
		);
		let lo = Infinity;
		let hi = -Infinity;
		for (const channel of channels) {
			for (let i = from; i < to; i++) {
				const v = channel[i]!;
				if (v < lo) lo = v;
				if (v > hi) hi = v;
			}
		}
		min[b] = lo;
		max[b] = hi;
	}
	return { min, max };
}

export function drawWaveform(
	ctx: CanvasRenderingContext2D,
	peaks: WaveformPeaks,
	width: number,
	height: number,
): void {
	const mid = height / 2;
	const columns = peaks.min.length;
	for (let x = 0; x < columns; x++) {
		const px = (x * width) / columns;
		const w = Math.max(1, width / columns);
		const top = mid - peaks.max[x]! * mid;
		const bottom = mid - peaks.min[x]! * mid;
		ctx.fillRect(px, top, w, Math.max(1, bottom - top));
	}
}

export function encodeWav(
	channels: Float32Array[],
	sampleRate: number,
	gain = 1,
): Uint8Array<ArrayBuffer> {
	const channelCount = channels.length;
	const frames = channels[0]?.length ?? 0;
	const dataBytes = frames * channelCount * 2;
	const out = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(out);

	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++)
			view.setUint8(offset + i, text.charCodeAt(i));
	};

	ascii(0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channelCount * 2, true);
	view.setUint16(32, channelCount * 2, true);
	view.setUint16(34, 16, true);
	ascii(36, 'data');
	view.setUint32(40, dataBytes, true);

	let offset = 44;
	for (let i = 0; i < frames; i++) {
		for (const channel of channels) {
			const s = Math.max(-1, Math.min(1, channel[i]! * gain));
			view.setInt16(
				offset,
				s < 0 ? s * 0x8000 : s * 0x7fff,
				true,
			);
			offset += 2;
		}
	}
	return new Uint8Array(out);
}

export function applyFades(
	channels: Float32Array[],
	sampleRate: number,
	fadeInS: number,
	fadeOutS: number,
): void {
	const frames = channels[0]?.length ?? 0;
	const inFrames = Math.min(frames, Math.round(fadeInS * sampleRate));
	const outFrames = Math.min(frames, Math.round(fadeOutS * sampleRate));

	for (const channel of channels) {
		for (let i = 0; i < inFrames; i++) channel[i]! *= i / inFrames;
		for (let i = 0; i < outFrames; i++)
			channel[frames - 1 - i]! *= i / outFrames;
	}
}

export function meterLevel(data: Uint8Array<ArrayBufferLike>): number {
	let peak = 0;
	for (const v of data) {
		const a = Math.abs((v - 128) / 128);
		if (a > peak) peak = a;
	}
	return peak;
}

export function peakDb(channels: Float32Array[]): number {
	let peak = 0;
	for (const channel of channels)
		for (const v of channel) {
			const a = Math.abs(v);
			if (a > peak) peak = a;
		}
	return peak === 0 ? -Infinity : 20 * Math.log10(peak);
}

interface Biquad {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

// bs.1770-4 k-weighting coefficients
function kWeighting(sampleRate: number): [Biquad, Biquad] {
	let f0 = 1681.974450955533;
	let Q = 0.7071752369554196;
	const gainDb = 3.999843853973347;
	let K = Math.tan((Math.PI * f0) / sampleRate);
	const Vh = Math.pow(10, gainDb / 20);
	const Vb = Math.pow(Vh, 0.4996667741545416);
	let a0 = 1 + K / Q + K * K;
	const shelf: Biquad = {
		b0: (Vh + (Vb * K) / Q + K * K) / a0,
		b1: (2 * (K * K - Vh)) / a0,
		b2: (Vh - (Vb * K) / Q + K * K) / a0,
		a1: (2 * (K * K - 1)) / a0,
		a2: (1 - K / Q + K * K) / a0,
	};

	f0 = 38.13547087602444;
	Q = 0.5003270373238773;
	K = Math.tan((Math.PI * f0) / sampleRate);
	a0 = 1 + K / Q + K * K;
	const highpass: Biquad = {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (K * K - 1)) / a0,
		a2: (1 - K / Q + K * K) / a0,
	};

	return [shelf, highpass];
}

function filtered(
	samples: Float32Array,
	biquads: [Biquad, Biquad],
): Float32Array {
	let current = samples;
	for (const { b0, b1, b2, a1, a2 } of biquads) {
		const next = new Float32Array(current.length);
		let x1 = 0;
		let x2 = 0;
		let y1 = 0;
		let y2 = 0;
		for (let i = 0; i < current.length; i++) {
			const x = current[i]!;
			const y =
				b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
			x2 = x1;
			x1 = x;
			y2 = y1;
			y1 = y;
			next[i] = y;
		}
		current = next;
	}
	return current;
}

export function integratedLufs(
	channels: Float32Array[],
	sampleRate: number,
): number {
	const frames = channels[0]?.length ?? 0;
	const blockFrames = Math.round(0.4 * sampleRate);
	const hopFrames = Math.round(0.1 * sampleRate);
	if (!frames || frames < blockFrames) return NaN;

	const biquads = kWeighting(sampleRate);
	const weighted = channels.map((channel) => filtered(channel, biquads));

	const energies: number[] = [];
	for (let start = 0; start + blockFrames <= frames; start += hopFrames) {
		let sum = 0;
		for (const channel of weighted)
			for (let i = start; i < start + blockFrames; i++)
				sum += channel[i]! * channel[i]!;
		energies.push(sum / blockFrames);
	}

	const loudness = (energy: number) => -0.691 + 10 * Math.log10(energy);
	const mean = (values: number[]) =>
		values.reduce((a, b) => a + b, 0) / values.length;

	const aboveAbsolute = energies.filter((e) => loudness(e) > -70);
	if (aboveAbsolute.length === 0) return NaN;

	const relativeGate = loudness(mean(aboveAbsolute)) - 10;
	const gated = energies.filter((e) => loudness(e) > relativeGate);
	if (gated.length === 0) return NaN;

	return loudness(mean(gated));
}

export function fftMagnitudes(samples: Float32Array): Float32Array {
	const n = samples.length;
	if (n === 0 || (n & (n - 1)) !== 0)
		throw new Error('fft length must be a power of two');

	const re = Float64Array.from(samples);
	const im = new Float64Array(n);

	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			const t = re[i]!;
			re[i] = re[j]!;
			re[j] = t;
		}
	}

	for (let len = 2; len <= n; len <<= 1) {
		const angle = (-2 * Math.PI) / len;
		const wRe = Math.cos(angle);
		const wIm = Math.sin(angle);
		for (let i = 0; i < n; i += len) {
			let curRe = 1;
			let curIm = 0;
			for (let j = 0; j < len / 2; j++) {
				const a = i + j;
				const b = i + j + len / 2;
				const tRe = re[b]! * curRe - im[b]! * curIm;
				const tIm = re[b]! * curIm + im[b]! * curRe;
				re[b] = re[a]! - tRe;
				im[b] = im[a]! - tIm;
				re[a] = re[a]! + tRe;
				im[a] = im[a]! + tIm;
				const nextRe = curRe * wRe - curIm * wIm;
				curIm = curRe * wIm + curIm * wRe;
				curRe = nextRe;
			}
		}
	}

	const magnitudes = new Float32Array(n / 2);
	for (let i = 0; i < n / 2; i++)
		magnitudes[i] = Math.hypot(re[i]!, im[i]!) / n;
	return magnitudes;
}
