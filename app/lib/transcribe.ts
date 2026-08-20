/**
 * Local speech-to-text for the auto-subtitle tool, through transformers.js.
 *
 * Everything runs in the browser. Whisper weights are fetched from the Hugging
 * Face hub on first use and left to the browser's HTTP cache (transformers.js'
 * own Cache API layer is off — unreliable on iOS Safari), the same setup
 * lib/bg-removal.ts uses, so the two share the ONNX runtime binary. The import
 * is dynamic so the ~835 kB runtime never reaches the main bundle.
 */
import type { Cue } from 'delphitools-v2/lib/subtitles';

export type Mode = 'fast' | 'reasonable' | 'experimental';
export type Device = 'webgpu' | 'wasm';

interface ModelSpec {
	/** transformers.js hub id, or null for the parakeet.js path */
	whisper: string | null;
}

// Xenova/* are the transformers.js-native Whisper exports (quantised onnx
// variants present, word-timestamp path tested on v3). Parakeet is not a
// transformers.js architecture — it needs the parakeet.js runtime, wired
// separately once that dependency lands.
const MODELS: Record<Mode, ModelSpec> = {
	fast: { whisper: 'Xenova/whisper-tiny' },
	reasonable: { whisper: 'Xenova/whisper-base' },
	experimental: { whisper: null },
};

export interface TranscribeOptions {
	mode: Mode;
	/** a Whisper language name/code (e.g. "english"), or undefined to auto-detect */
	language?: string;
	/** 'transcribe' keeps the source language; 'translate' outputs English */
	task?: 'transcribe' | 'translate';
	/** 0-100 while weights download */
	onProgress?: (percent: number) => void;
}

/** A word with its span in seconds, as Whisper hands it back. */
export interface Word {
	text: string;
	start: number;
	end: number;
}

// One comfortable subtitle line; longer runs split. Netflix/BBC style caps a
// line near 42 chars. ponytail: single line, no two-line wrap — players wrap
// long cues, and a mid-cue break is a later refinement.
const MAX_CHARS = 42;
const MAX_DURATION = 6000; // ms — a cue this long is hard to read
const GAP_BREAK = 0.8; // s of silence forces a new cue

// Sentence-final punctuation, allowing a trailing quote/bracket.
const SENTENCE_END = /[.!?…]["')\]]?$/;

/**
 * Groups Whisper's per-word timestamps into subtitle cues. Pure and
 * deterministic — the one piece of real logic here, covered by unit tests.
 *
 * A cue closes before adding a word when the silence gap is long, or the line
 * would overflow, or the cue would run too long; and after adding a word that
 * ends a sentence.
 */
export function wordsToCues(words: Word[]): Cue[] {
	const cues: Cue[] = [];
	let buf: Word[] = [];

	const flush = () => {
		if (buf.length === 0) return;
		cues.push({
			start: Math.round(buf[0]!.start * 1000),
			end: Math.round(buf[buf.length - 1]!.end * 1000),
			text: buf.map((w) => w.text).join(' '),
		});
		buf = [];
	};

	for (const w of words) {
		const last = buf[buf.length - 1];
		if (last) {
			const gap = w.start - last.end;
			const wouldLen =
				buf.reduce((n, x) => n + x.text.length + 1, 0) +
				w.text.length;
			const wouldDur = w.end * 1000 - buf[0]!.start * 1000;
			if (
				gap > GAP_BREAK ||
				wouldLen > MAX_CHARS ||
				wouldDur > MAX_DURATION
			)
				flush();
		}
		buf.push(w);
		if (SENTENCE_END.test(w.text)) flush();
	}
	flush();
	return cues;
}

// The shape transformers.js returns for an ASR run with word timestamps.
interface AsrChunk {
	text: string;
	timestamp: [number | null, number | null];
}
interface AsrOutput {
	text: string;
	chunks?: AsrChunk[];
}

/** Whisper chunks → words, carrying the cursor forward across null timestamps. */
function readWords(out: AsrOutput): Word[] {
	const words: Word[] = [];
	let cursor = 0;
	for (const chunk of out.chunks ?? []) {
		const text = chunk.text.trim();
		if (!text) continue;
		const start = chunk.timestamp[0] ?? cursor;
		const end = chunk.timestamp[1] ?? start;
		cursor = end;
		words.push({ text, start, end });
	}
	return words;
}

/** Decode any audio/video file to the 16 kHz mono PCM Whisper expects. */
async function toMono16k(file: File): Promise<Float32Array> {
	const ctx = new AudioContext();
	let decoded: AudioBuffer;
	try {
		decoded = await ctx.decodeAudioData(await file.arrayBuffer());
	} finally {
		void ctx.close();
	}
	// OfflineAudioContext with 1 channel downmixes to mono and resamples to
	// its own rate on render — no manual resampler needed.
	const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
	const offline = new OfflineAudioContext(1, frames, 16000);
	const src = offline.createBufferSource();
	src.buffer = decoded;
	src.connect(offline.destination);
	src.start();
	const rendered = await offline.startRendering();
	return rendered.getChannelData(0);
}

type AsrPipeline = (
	audio: Float32Array,
	options: Record<string, unknown>,
) => Promise<AsrOutput>;

/**
 * Transcribes a media file to subtitle cues. Prefers WebGPU, falls back to the
 * CPU/wasm path both on load failure and on a run that fails inside the GPU
 * kernel (the same two-stage fallback lib/bg-removal.ts needs).
 */
export async function transcribe(
	file: File,
	options: TranscribeOptions,
): Promise<Cue[]> {
	const spec = MODELS[options.mode];
	if (!spec.whisper) return transcribeExperimental();

	const pcm = await toMono16k(file);

	const { pipeline, env } = await import('@huggingface/transformers');
	env.allowLocalModels = false;
	env.useBrowserCache = false;

	const progress_callback = (event: {
		status: string;
		progress?: number;
	}) => {
		if (event.status === 'progress' && event.progress !== undefined)
			options.onProgress?.(Math.round(event.progress));
	};

	const build = async (device: Device) =>
		(await pipeline('automatic-speech-recognition', spec.whisper!, {
			device,
			// fp16 whisper encoder has known WebGPU precision issues
			// (transformers.js #1590); fp32 on the GPU, q8 on the CPU
			// path to keep the download small.
			dtype: device === 'webgpu' ? 'fp32' : 'q8',
			progress_callback,
		})) as unknown as AsrPipeline;

	const run = (pipe: AsrPipeline) =>
		pipe(pcm, {
			chunk_length_s: 30,
			stride_length_s: 5,
			return_timestamps: 'word',
			language: options.language || undefined,
			task: options.task ?? 'transcribe',
		});

	let device: Device = 'webgpu';
	let pipe: AsrPipeline;
	try {
		pipe = await build('webgpu');
	} catch {
		pipe = await build('wasm');
		device = 'wasm';
	}

	let out: AsrOutput;
	try {
		out = await run(pipe);
	} catch (error) {
		if (device === 'wasm') throw error;
		pipe = await build('wasm');
		out = await run(pipe);
	}

	return wordsToCues(readWords(out));
}

// ponytail: Parakeet-TDT-0.6B-v3 via parakeet.js (WebGPU + onnxruntime-web).
// Not wired — parakeet.js is not a dependency and its WebGPU-only, hundreds-of-
// MB model needs the dep added and its API read before integration. Rejects
// with a code the component maps to a message.
function transcribeExperimental(): Promise<Cue[]> {
	return Promise.reject(new Error('parakeet-unavailable'));
}
