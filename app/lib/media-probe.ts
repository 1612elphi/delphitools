
export function loadMediabunny() {
	return import('mediabunny');
}

type Mediabunny = Awaited<ReturnType<typeof loadMediabunny>>;

export function openInput(m: Mediabunny, file: File) {
	return new m.Input({
		source: new m.BlobSource(file),
		formats: m.ALL_FORMATS,
	});
}

export function formatFps(fps: number): string {
	return `${fps.toFixed(3).replace(/\.?0+$/, '')} fps`;
}

export type Container = 'mp4' | 'mov' | 'webm' | 'mkv';

export interface VideoProbe {
	container: Container;
	// packet average over 200
	fps: number | null;
	width: number;
	height: number;
	codec: string | null;
	audioTracks: number;
}

export async function probeVideo(file: File): Promise<VideoProbe | null> {
	try {
		const m = await loadMediabunny();
		const input = openInput(m, file);
		const video = await input.getPrimaryVideoTrack();
		if (!video) return null;
		const [stats, audio, format] = await Promise.all([
			video.computePacketStats(200),
			input.getAudioTracks(),
			input.getFormat(),
		]);
		const families = new Map<unknown, Container>([
			[m.WEBM, 'webm'],
			[m.MATROSKA, 'mkv'],
			[m.QTFF, 'mov'],
		]);
		return {
			container: families.get(format) ?? 'mp4',
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
		const m = await loadMediabunny();
		const audio = await openInput(m, file).getPrimaryAudioTrack();
		if (!audio) return null;
		return { sampleRate: audio.sampleRate, codec: audio.codec };
	} catch {
		return null;
	}
}
