import {
	loadMediabunny,
	openInput,
	type Container,
} from 'delphitools-v2/lib/media-probe';

// mediabunny classes require structural types
interface ConversionLike {
	readonly isValid: boolean;
	readonly discardedTracks: readonly {
		track: { type: string };
		reason: string;
	}[];
	onProgress?: (progress: number, processedTime: number) => unknown;
	cancel(): Promise<void>;
	execute(): Promise<void>;
}

interface BufferOutput {
	target: { buffer: ArrayBuffer | null };
}

export interface ConvertResult {
	blob: Blob;
	ext: string;
}

export interface ConvertControls {
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
}

export const CONTAINERS: { id: Container; label: string }[] = [
	{ id: 'mp4', label: 'MP4' },
	{ id: 'mov', label: 'MOV' },
	{ id: 'webm', label: 'WebM' },
	{ id: 'mkv', label: 'MKV' },
];

async function outputFormat(id: Container) {
	const m = await loadMediabunny();
	switch (id) {
		case 'mp4':
			return new m.Mp4OutputFormat();
		case 'mov':
			return new m.MovOutputFormat();
		case 'webm':
			return new m.WebMOutputFormat();
		case 'mkv':
			return new m.MkvOutputFormat();
	}
}

export async function containerSupport(
	codec: string | null,
): Promise<Record<Container, boolean>> {
	const formats = await Promise.all(
		CONTAINERS.map(({ id }) => outputFormat(id)),
	);
	const out = {} as Record<Container, boolean>;
	CONTAINERS.forEach(({ id }, i) => {
		out[id] =
			codec !== null &&
			(
				formats[
					i
				]!.getSupportedVideoCodecs() as string[]
			).includes(codec);
	});
	return out;
}

function abortError() {
	return new DOMException('The conversion was aborted', 'AbortError');
}

function outputBlob(output: BufferOutput, type: string): Blob {
	const buffer = output.target.buffer;
	if (!buffer) throw new Error('convert-empty');
	return new Blob([buffer], { type });
}

async function runConversion(
	conversion: ConversionLike,
	output: BufferOutput,
	mime: string,
	controls: ConvertControls,
	label: string,
): Promise<Blob> {
	if (!conversion.isValid) {
		const reason = conversion.discardedTracks
			.map((d) => d.reason)
			.join(', ');
		throw new Error(`${label}-invalid: ${reason}`);
	}
	for (const { track, reason } of conversion.discardedTracks)
		console.warn(`${label} drops ${track.type} track: ${reason}`);
	conversion.onProgress = (fraction) => controls.onProgress?.(fraction);
	controls.signal?.throwIfAborted();
	controls.signal?.addEventListener(
		'abort',
		() => void conversion.cancel(),
		{ once: true },
	);
	// converts cancellation to aborterror
	try {
		await conversion.execute();
	} catch (error) {
		if (controls.signal?.aborted) throw abortError();
		throw error;
	}
	if (controls.signal?.aborted) throw abortError();
	return outputBlob(output, mime);
}

const ext = (format: { fileExtension: string }) =>
	format.fileExtension.replace(/^\./, '');

export async function muteVideo(
	file: File,
	container: Container,
	controls: ConvertControls = {},
): Promise<ConvertResult> {
	const m = await loadMediabunny();
	const format = await outputFormat(container);
	const output = new m.Output({ format, target: new m.BufferTarget() });
	const conversion = await m.Conversion.init({
		input: openInput(m, file),
		output,
		audio: { discard: true },
		showWarnings: false,
	});
	const blob = await runConversion(
		conversion,
		output,
		format.mimeType,
		controls,
		'mute',
	);
	return { blob, ext: ext(format) };
}

export const BURN_CODECS = ['avc', 'hevc', 'vp9', 'vp8', 'av1'] as const;
export type BurnCodec = (typeof BURN_CODECS)[number];

export async function encodableCodecs(
	width: number,
	height: number,
): Promise<Set<BurnCodec> | null> {
	if (!('VideoEncoder' in globalThis)) return null;
	const { canEncodeVideo } = await loadMediabunny();
	const answers = await Promise.all(
		BURN_CODECS.map((codec) =>
			canEncodeVideo(codec, { width, height }),
		),
	);
	return new Set(BURN_CODECS.filter((_, i) => answers[i]));
}

export type Overlay = (
	ctx: OffscreenCanvasRenderingContext2D,
	width: number,
	height: number,
) => void;

export interface BurnOptions extends ConvertControls {
	container: Container;
	codec: BurnCodec;
	bitrate: number;
	overlay: (seconds: number) => Overlay | null;
}

export async function burnVideo(
	file: File,
	options: BurnOptions,
): Promise<ConvertResult> {
	const m = await loadMediabunny();
	const format = await outputFormat(options.container);
	const output = new m.Output({ format, target: new m.BufferTarget() });
	let canvas: OffscreenCanvas | null = null;
	let ctx: OffscreenCanvasRenderingContext2D | null = null;
	const conversion = await m.Conversion.init({
		input: openInput(m, file),
		output,
		video: {
			codec: options.codec,
			bitrate: options.bitrate,
			forceTranscode: true,
			process: (sample) => {
				const paint = options.overlay(sample.timestamp);
				if (!paint) return sample;
				const { displayWidth: w, displayHeight: h } =
					sample;
				if (
					!canvas ||
					!ctx ||
					canvas.width !== w ||
					canvas.height !== h
				) {
					canvas = new OffscreenCanvas(w, h);
					ctx = canvas.getContext('2d')!;
				}
				sample.draw(ctx, 0, 0, w, h);
				paint(ctx, w, h);
				// samples must own pixels
				return new m.VideoSample(canvas, {
					timestamp: sample.timestamp,
					duration: sample.duration,
				});
			},
		},
		showWarnings: false,
	});
	const blob = await runConversion(
		conversion,
		output,
		format.mimeType,
		options,
		'burn',
	);
	return { blob, ext: ext(format) };
}

export interface TrimOptions extends ConvertControls {
	start: number;
	end: number;
	// exact trimming re-encodes video
	mode: 'keyframe' | 'exact';
	container: Container;
}

export interface TrimResult extends ConvertResult {
	// actual trim start
	start: number;
	end: number;
}

export async function trimVideo(
	file: File,
	options: TrimOptions,
): Promise<TrimResult> {
	const m = await loadMediabunny();
	const input = openInput(m, file);
	const format = await outputFormat(options.container);
	const output = new m.Output({ format, target: new m.BufferTarget() });

	if (options.mode === 'exact') {
		const conversion = await m.Conversion.init({
			input,
			output,
			trim: { start: options.start, end: options.end },
			showWarnings: false,
		});
		const blob = await runConversion(
			conversion,
			output,
			format.mimeType,
			options,
			'trim',
		);
		return {
			blob,
			ext: ext(format),
			start: options.start,
			end: options.end,
		};
	}

	const throwIfAborted = () => options.signal?.throwIfAborted();
	const video = await input.getPrimaryVideoTrack();
	if (!video?.codec) throw new Error('trim-no-video');
	const audio = await input.getPrimaryAudioTrack();
	const videoSink = new m.EncodedPacketSink(video);
	const key =
		(await videoSink.getKeyPacket(options.start)) ??
		(await videoSink.getFirstPacket());
	if (!key) throw new Error('trim-no-packets');
	const from = key.timestamp;
	const to = options.end;

	const videoSource = new m.EncodedVideoPacketSource(video.codec);
	output.addVideoTrack(videoSource, { rotation: video.rotation });
	// unsupported audio is dropped
	const audioCodec =
		audio?.codec &&
		(format.getSupportedAudioCodecs() as string[]).includes(
			audio.codec,
		)
			? audio.codec
			: null;
	const audioSink = audioCodec ? new m.EncodedPacketSink(audio!) : null;
	const audioSource = audioCodec
		? new m.EncodedAudioPacketSource(audioCodec)
		: null;
	if (audioSource) output.addAudioTrack(audioSource);
	const [videoConfig, audioConfig, audioStart] = await Promise.all([
		video.getDecoderConfig(),
		audio?.getDecoderConfig() ?? Promise.resolve(null),
		audioSink
			? audioSink
					.getPacket(from)
					.then(
						(p) =>
							p ??
							audioSink.getFirstPacket(),
					)
			: Promise.resolve(null),
	]);
	await output.start();

	const videoPackets = videoSink.packets(key)[Symbol.asyncIterator]();
	const audioPackets =
		audioSink && audioStart
			? audioSink.packets(audioStart)[Symbol.asyncIterator]()
			: null;
	let v = await videoPackets.next();
	let a = audioPackets ? await audioPackets.next() : null;
	let firstVideo = true;
	let firstAudio = true;
	while (!v.done || (a && !a.done)) {
		throwIfAborted();
		const vTs = v.done ? Infinity : v.value.timestamp;
		const aTs = !a || a.done ? Infinity : a.value.timestamp;
		if (vTs <= aTs) {
			if (vTs >= to) {
				v = { done: true, value: undefined };
				continue;
			}
			// open gops precede keyframes
			if (vTs < from) {
				v = await videoPackets.next();
				continue;
			}
			await videoSource.add(
				v.value!.clone({ timestamp: vTs - from }),
				firstVideo && videoConfig
					? { decoderConfig: videoConfig }
					: undefined,
			);
			firstVideo = false;
			options.onProgress?.(
				Math.min(1, (vTs - from) / (to - from)),
			);
			v = await videoPackets.next();
		} else {
			if (aTs >= to) {
				a = { done: true, value: undefined };
				continue;
			}
			if (aTs >= from && audioSource) {
				await audioSource.add(
					a!.value!.clone({
						timestamp: aTs - from,
					}),
					firstAudio && audioConfig
						? { decoderConfig: audioConfig }
						: undefined,
				);
				firstAudio = false;
			}
			a = await audioPackets!.next();
		}
	}
	await output.finalize();
	throwIfAborted();
	return {
		blob: outputBlob(output, format.mimeType),
		ext: ext(format),
		start: from,
		end: to,
	};
}

export type AudioTarget = 'wav' | 'm4a' | 'ogg' | 'flac';

export const AUDIO_TARGETS: {
	id: AudioTarget;
	label: string;
	codec: 'pcm-s16' | 'aac' | 'opus' | 'flac';
	ext: string;
	mime: string;
}[] = [
	{
		id: 'wav',
		label: 'WAV',
		codec: 'pcm-s16',
		ext: 'wav',
		mime: 'audio/wav',
	},
	{
		id: 'm4a',
		label: 'M4A (AAC)',
		codec: 'aac',
		ext: 'm4a',
		mime: 'audio/mp4',
	},
	{
		id: 'ogg',
		label: 'Ogg (Opus)',
		codec: 'opus',
		ext: 'ogg',
		mime: 'audio/ogg',
	},
	{
		id: 'flac',
		label: 'FLAC',
		codec: 'flac',
		ext: 'flac',
		mime: 'audio/flac',
	},
];

async function audioOutputFormat(id: AudioTarget) {
	const m = await loadMediabunny();
	switch (id) {
		case 'wav':
			return new m.WavOutputFormat();
		case 'm4a':
			return new m.Mp4OutputFormat();
		case 'ogg':
			return new m.OggOutputFormat();
		case 'flac':
			return new m.FlacOutputFormat();
	}
}

export async function audioTargetSupport(
	sourceCodec: string | null,
): Promise<Record<AudioTarget, boolean>> {
	const { canEncodeAudio } = await loadMediabunny();
	const answers = await Promise.all(
		AUDIO_TARGETS.map((target) =>
			target.codec === 'pcm-s16' ||
			target.codec === sourceCodec
				? Promise.resolve(true)
				: canEncodeAudio(target.codec),
		),
	);
	const out = {} as Record<AudioTarget, boolean>;
	AUDIO_TARGETS.forEach((target, i) => (out[target.id] = answers[i]!));
	return out;
}

export async function extractAudio(
	file: File,
	target: AudioTarget,
	controls: ConvertControls = {},
): Promise<ConvertResult> {
	const m = await loadMediabunny();
	const spec = AUDIO_TARGETS.find((t) => t.id === target)!;
	const format = await audioOutputFormat(target);
	const output = new m.Output({ format, target: new m.BufferTarget() });
	const conversion = await m.Conversion.init({
		input: openInput(m, file),
		output,
		video: { discard: true },
		audio: { codec: spec.codec },
		showWarnings: false,
	});
	const blob = await runConversion(
		conversion,
		output,
		spec.mime,
		controls,
		'extract',
	);
	return { blob, ext: spec.ext };
}
