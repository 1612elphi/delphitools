// Container-level facts through mediabunny (MPL-2.0, pure JS demuxers and
// muxers, WebCodecs-aware): the real frame rate for Frame Extractor and
// Subtitle Studio, the source sample rate for Audio Atlas, and the Video
// Muter's audio-free remux. Imported on demand so the front page and the
// tools that never probe stay clear of it.

async function mb() {
	return import('mediabunny');
}

/** `29.97 fps`, `25 fps`, `23.976 fps` */
export function formatFps(fps: number): string {
	return `${fps.toFixed(3).replace(/\.?0+$/, '')} fps`;
}

export type Container = 'mp4' | 'mov' | 'webm' | 'mkv';

export const CONTAINERS: { id: Container; label: string }[] = [
	{ id: 'mp4', label: 'MP4' },
	{ id: 'mov', label: 'MOV' },
	{ id: 'webm', label: 'WebM' },
	{ id: 'mkv', label: 'MKV' },
];

async function outputFormat(id: Container) {
	const m = await mb();
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

/** the containers that can carry this video codec as-is, no re-encode */
export async function containerSupport(
	codec: string | null,
): Promise<Record<Container, boolean>> {
	const out = {} as Record<Container, boolean>;
	for (const { id } of CONTAINERS) {
		const format = await outputFormat(id);
		out[id] =
			codec !== null &&
			(format.getSupportedVideoCodecs() as string[]).includes(
				codec,
			);
	}
	return out;
}

export interface VideoProbe {
	/** the family the source is in, the remux default */
	container: Container;
	/** average packet rate over the first 200 packets; null when unreadable */
	fps: number | null;
	width: number;
	height: number;
	codec: string | null;
	audioTracks: number;
}

export async function probeVideo(file: File): Promise<VideoProbe | null> {
	try {
		const { Input, BlobSource, ALL_FORMATS, WEBM, MATROSKA, QTFF } =
			await mb();
		const input = new Input({
			source: new BlobSource(file),
			formats: ALL_FORMATS,
		});
		const video = await input.getPrimaryVideoTrack();
		if (!video) return null;
		const [stats, audio, format] = await Promise.all([
			video.computePacketStats(200),
			input.getAudioTracks(),
			input.getFormat(),
		]);
		const families = new Map<unknown, Container>([
			[WEBM, 'webm'],
			[MATROSKA, 'mkv'],
			[QTFF, 'mov'],
		]);
		const container = families.get(format) ?? 'mp4';
		return {
			container,
			fps:
				stats.averagePacketRate > 0
					? stats.averagePacketRate
					: null,
			width: video.displayWidth,
			height: video.displayHeight,
			codec: video.codec,
			audioTracks: audio.length,
		};
	} catch {
		return null;
	}
}

export interface AudioProbe {
	sampleRate: number;
	codec: string | null;
}

export async function probeAudio(file: File): Promise<AudioProbe | null> {
	try {
		const { Input, BlobSource, ALL_FORMATS } = await mb();
		const input = new Input({
			source: new BlobSource(file),
			formats: ALL_FORMATS,
		});
		const audio = await input.getPrimaryAudioTrack();
		if (!audio) return null;
		return {
			sampleRate: audio.sampleRate,
			codec: audio.codec,
		};
	} catch {
		return null;
	}
}

export interface MuteResult {
	blob: Blob;
	ext: string;
}

/**
 * Rewrites the file into `container` without its audio tracks. Video packets
 * are copied, not re-encoded; pick a container `containerSupport` allows.
 */
export async function muteVideo(
	file: File,
	container: Container,
	onProgress?: (fraction: number) => void,
): Promise<MuteResult> {
	const {
		Input,
		BlobSource,
		ALL_FORMATS,
		Output,
		BufferTarget,
		Conversion,
	} = await mb();
	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});
	const format = await outputFormat(container);
	const output = new Output({ format, target: new BufferTarget() });
	const conversion = await Conversion.init({
		input,
		output,
		audio: { discard: true },
		showWarnings: false,
	});
	if (!conversion.isValid) {
		const reason = conversion.discardedTracks
			.map((d) => d.reason)
			.join(', ');
		throw new Error(`mute-invalid: ${reason}`);
	}
	conversion.onProgress = (fraction) => onProgress?.(fraction);
	await conversion.execute();
	const buffer = output.target.buffer;
	if (!buffer) throw new Error('mute-empty');
	return {
		blob: new Blob([buffer], { type: format.mimeType }),
		ext: format.fileExtension.replace(/^\./, ''),
	};
}
