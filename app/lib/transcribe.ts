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

export type Mode = 'fast' | 'reasonable' | 'accurate';
export type Device = 'webgpu' | 'wasm';
export type DType = 'q4' | 'q8';

interface ModelSpec {
	model: string;
	name: string;
	webgpuOnly?: boolean;
	/** encoder + merged decoder download, MB, per device (q4 on WebGPU, q8 on wasm); hub file sizes as of 2026-08-22 */
	sizeMb: Record<Device, number>;
}

export const MODELS: Record<Mode, ModelSpec> = {
	fast: {
		model: 'Xenova/whisper-base',
		name: 'Whisper 2 (Base)',
		sizeMb: { webgpu: 142, wasm: 77 },
	},
	reasonable: {
		model: 'Xenova/whisper-small',
		name: 'Whisper 2 (Small)',
		sizeMb: { webgpu: 299, wasm: 249 },
	},
	// The plain onnx-community/whisper-large-v3-turbo export has no
	// cross_attentions outputs and carries large-v3's alignment heads, so
	// return_timestamps: 'word' throws; the _timestamped export fixes both.
	accurate: {
		model: 'onnx-community/whisper-large-v3-turbo_timestamped',
		name: 'Whisper 3 (Large Turbo)',
		webgpuOnly: true,
		sizeMb: { webgpu: 759, wasm: 1085 },
	},
};

// Whisper's 99 languages in transformers.js' order (common_whisper.js), which
// is roughly by training-data volume; the combobox takes its Common group
// from the head of this list.
export const LANGUAGES: { code: string; name: string }[] = [
	{ code: 'en', name: 'English' },
	{ code: 'zh', name: 'Chinese' },
	{ code: 'de', name: 'German' },
	{ code: 'es', name: 'Spanish' },
	{ code: 'ru', name: 'Russian' },
	{ code: 'ko', name: 'Korean' },
	{ code: 'fr', name: 'French' },
	{ code: 'ja', name: 'Japanese' },
	{ code: 'pt', name: 'Portuguese' },
	{ code: 'tr', name: 'Turkish' },
	{ code: 'pl', name: 'Polish' },
	{ code: 'ca', name: 'Catalan' },
	{ code: 'nl', name: 'Dutch' },
	{ code: 'ar', name: 'Arabic' },
	{ code: 'sv', name: 'Swedish' },
	{ code: 'it', name: 'Italian' },
	{ code: 'id', name: 'Indonesian' },
	{ code: 'hi', name: 'Hindi' },
	{ code: 'fi', name: 'Finnish' },
	{ code: 'vi', name: 'Vietnamese' },
	{ code: 'he', name: 'Hebrew' },
	{ code: 'uk', name: 'Ukrainian' },
	{ code: 'el', name: 'Greek' },
	{ code: 'ms', name: 'Malay' },
	{ code: 'cs', name: 'Czech' },
	{ code: 'ro', name: 'Romanian' },
	{ code: 'da', name: 'Danish' },
	{ code: 'hu', name: 'Hungarian' },
	{ code: 'ta', name: 'Tamil' },
	{ code: 'no', name: 'Norwegian' },
	{ code: 'th', name: 'Thai' },
	{ code: 'ur', name: 'Urdu' },
	{ code: 'hr', name: 'Croatian' },
	{ code: 'bg', name: 'Bulgarian' },
	{ code: 'lt', name: 'Lithuanian' },
	{ code: 'la', name: 'Latin' },
	{ code: 'mi', name: 'Maori' },
	{ code: 'ml', name: 'Malayalam' },
	{ code: 'cy', name: 'Welsh' },
	{ code: 'sk', name: 'Slovak' },
	{ code: 'te', name: 'Telugu' },
	{ code: 'fa', name: 'Persian' },
	{ code: 'lv', name: 'Latvian' },
	{ code: 'bn', name: 'Bengali' },
	{ code: 'sr', name: 'Serbian' },
	{ code: 'az', name: 'Azerbaijani' },
	{ code: 'sl', name: 'Slovenian' },
	{ code: 'kn', name: 'Kannada' },
	{ code: 'et', name: 'Estonian' },
	{ code: 'mk', name: 'Macedonian' },
	{ code: 'br', name: 'Breton' },
	{ code: 'eu', name: 'Basque' },
	{ code: 'is', name: 'Icelandic' },
	{ code: 'hy', name: 'Armenian' },
	{ code: 'ne', name: 'Nepali' },
	{ code: 'mn', name: 'Mongolian' },
	{ code: 'bs', name: 'Bosnian' },
	{ code: 'kk', name: 'Kazakh' },
	{ code: 'sq', name: 'Albanian' },
	{ code: 'sw', name: 'Swahili' },
	{ code: 'gl', name: 'Galician' },
	{ code: 'mr', name: 'Marathi' },
	{ code: 'pa', name: 'Punjabi' },
	{ code: 'si', name: 'Sinhala' },
	{ code: 'km', name: 'Khmer' },
	{ code: 'sn', name: 'Shona' },
	{ code: 'yo', name: 'Yoruba' },
	{ code: 'so', name: 'Somali' },
	{ code: 'af', name: 'Afrikaans' },
	{ code: 'oc', name: 'Occitan' },
	{ code: 'ka', name: 'Georgian' },
	{ code: 'be', name: 'Belarusian' },
	{ code: 'tg', name: 'Tajik' },
	{ code: 'sd', name: 'Sindhi' },
	{ code: 'gu', name: 'Gujarati' },
	{ code: 'am', name: 'Amharic' },
	{ code: 'yi', name: 'Yiddish' },
	{ code: 'lo', name: 'Lao' },
	{ code: 'uz', name: 'Uzbek' },
	{ code: 'fo', name: 'Faroese' },
	{ code: 'ht', name: 'Haitian Creole' },
	{ code: 'ps', name: 'Pashto' },
	{ code: 'tk', name: 'Turkmen' },
	{ code: 'nn', name: 'Nynorsk' },
	{ code: 'mt', name: 'Maltese' },
	{ code: 'sa', name: 'Sanskrit' },
	{ code: 'lb', name: 'Luxembourgish' },
	{ code: 'my', name: 'Myanmar' },
	{ code: 'bo', name: 'Tibetan' },
	{ code: 'tl', name: 'Tagalog' },
	{ code: 'mg', name: 'Malagasy' },
	{ code: 'as', name: 'Assamese' },
	{ code: 'tt', name: 'Tatar' },
	{ code: 'haw', name: 'Hawaiian' },
	{ code: 'ln', name: 'Lingala' },
	{ code: 'ha', name: 'Hausa' },
	{ code: 'ba', name: 'Bashkir' },
	{ code: 'jw', name: 'Javanese' },
	{ code: 'su', name: 'Sundanese' },
];

export interface ModelResolution {
	model: string;
	device: Device;
	dtype: DType;
}

export function resolveModel(mode: Mode, device: Device): ModelResolution {
	const spec = MODELS[mode];
	if (spec.webgpuOnly && device === 'wasm')
		throw new Error('webgpu-required');
	return {
		model: spec.model,
		device,
		dtype: device === 'webgpu' ? 'q4' : 'q8',
	};
}

export interface TranscribeOptions {
	mode: Mode;
	/** a Whisper language name/code (e.g. "english"), or undefined to auto-detect */
	language?: string;
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

interface AsrPipeline {
	(
		audio: Float32Array,
		options: Record<string, unknown>,
	): Promise<AsrOutput>;
	dispose?: () => unknown;
}

export interface ProgressEvent {
	status: string;
	file?: string;
	loaded?: number;
	total?: number;
}

type ProgressCallback = (event: ProgressEvent) => void;

type PipelineBuilder = (
	task: 'automatic-speech-recognition',
	model: string,
	options: {
		device: Device;
		dtype: DType;
		progress_callback: ProgressCallback;
	},
) => Promise<unknown>;

// transformers.js reports progress per file, and the encoder/decoder onnx
// files download concurrently; summing loaded/total gives one percentage.
export function progressAggregator(
	onPercent: (percent: number) => void,
): ProgressCallback {
	const files = new Map<string, { loaded: number; total: number }>();
	return (event) => {
		if (event.status !== 'progress' || !event.file || !event.total)
			return;
		files.set(event.file, {
			loaded: event.loaded ?? 0,
			total: event.total,
		});
		let loaded = 0;
		let total = 0;
		for (const entry of files.values()) {
			loaded += entry.loaded;
			total += entry.total;
		}
		onPercent(Math.round((loaded / total) * 100));
	};
}

let cachedPipeline: {
	key: string;
	pipe: AsrPipeline;
} | null = null;

async function loadPipeline(
	build: PipelineBuilder,
	resolution: ModelResolution,
	progress_callback: ProgressCallback,
): Promise<AsrPipeline> {
	const key = `${resolution.model}:${resolution.device}:${resolution.dtype}`;
	if (cachedPipeline?.key === key) return cachedPipeline.pipe;

	const previous = cachedPipeline;
	cachedPipeline = null;
	await previous?.pipe.dispose?.();

	const pipe = (await build(
		'automatic-speech-recognition',
		resolution.model,
		{
			device: resolution.device,
			dtype: resolution.dtype,
			progress_callback,
		},
	)) as AsrPipeline;
	cachedPipeline = { key, pipe };
	return pipe;
}

async function webGpuAvailable(): Promise<boolean> {
	if (!navigator.gpu) return false;
	try {
		return (await navigator.gpu.requestAdapter()) !== null;
	} catch {
		return false;
	}
}

/** Transcribes a media file to subtitle cues. */
export async function transcribe(
	file: File,
	options: TranscribeOptions,
): Promise<Cue[]> {
	const hasWebGpu = await webGpuAvailable();
	if (options.mode === 'accurate' && !hasWebGpu)
		throw new Error('webgpu-required');

	const pcm = await toMono16k(file);

	const { pipeline, env } = await import('@huggingface/transformers');
	env.allowLocalModels = false;
	env.useBrowserCache = false;

	const build = (resolution: ModelResolution) =>
		loadPipeline(
			pipeline,
			resolution,
			progressAggregator((p) => options.onProgress?.(p)),
		);

	const run = (pipe: AsrPipeline) =>
		pipe(pcm, {
			chunk_length_s: 30,
			stride_length_s: 5,
			return_timestamps: 'word',
			language: options.language || undefined,
		});

	let device: Device = hasWebGpu ? 'webgpu' : 'wasm';
	let pipe: AsrPipeline;
	try {
		pipe = await build(resolveModel(options.mode, device));
	} catch (error) {
		if (options.mode === 'accurate' || device === 'wasm')
			throw error;
		device = 'wasm';
		pipe = await build(resolveModel(options.mode, device));
	}

	let out: AsrOutput;
	try {
		out = await run(pipe);
	} catch (error) {
		if (options.mode === 'accurate' || device === 'wasm')
			throw error;
		device = 'wasm';
		pipe = await build(resolveModel(options.mode, device));
		out = await run(pipe);
	}

	return wordsToCues(readWords(out));
}
