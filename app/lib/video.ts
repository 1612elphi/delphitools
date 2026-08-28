import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { probeVideo, type VideoProbe } from 'delphitools-v2/lib/media-probe';

const DEFAULT_FPS = 30;

const NOT_A_VIDEO = 'Only video files are supported.';
const LOAD_FAILED = 'Failed to load video.';

export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
	// current seeks skip seeked
	if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2)
		return Promise.resolve();
	return new Promise((resolve) => {
		video.addEventListener('seeked', () => resolve(), {
			once: true,
		});
		video.currentTime = time;
	});
}

/** chromium 642012 workaround */
export function resolveDuration(video: HTMLVideoElement): Promise<number> {
	if (Number.isFinite(video.duration))
		return Promise.resolve(video.duration);
	return new Promise((resolve) => {
		video.addEventListener(
			'durationchange',
			() => {
				video.currentTime = 0;
				resolve(video.duration);
			},
			{ once: true },
		);
		video.currentTime = 1e101;
	});
}

interface VideoIntakeHooks {
	onLoad?: (file: File) => void;
	onReady?: (video: HTMLVideoElement) => void;
	probe?: boolean;
	onProbe?: (probe: VideoProbe | null) => void;
	canLoad?: () => boolean;
}

export class VideoIntake {
	@tracked url: string | null = null;
	@tracked fileName = '';
	@tracked duration = 0;
	@tracked width = 0;
	@tracked height = 0;
	@tracked error = '';
	@tracked fps = DEFAULT_FPS;
	@tracked probe: VideoProbe | null = null;
	@tracked playing = false;

	video: HTMLVideoElement | null = null;
	file: File | null = null;

	#hooks: VideoIntakeHooks;

	constructor(hooks: VideoIntakeHooks = {}) {
		this.#hooks = hooks;
	}

	get baseName() {
		return this.fileName.replace(/\.[^.]+$/, '');
	}

	register = modifier((element: HTMLVideoElement) => {
		this.video = element;
		return () => {
			this.video = null;
		};
	});

	load = (file: File) => {
		if (this.#hooks.canLoad && !this.#hooks.canLoad()) return;
		if (!file.type.startsWith('video/')) {
			this.error = NOT_A_VIDEO;
			return;
		}
		this.release();
		this.duration = 0;
		this.error = '';
		this.fileName = file.name;
		this.file = file;
		this.fps = DEFAULT_FPS;
		this.probe = null;
		this.playing = false;
		this.#hooks.onLoad?.(file);
		this.url = URL.createObjectURL(file);
		if (this.#hooks.probe) void this.#probe(file);
	};

	async #probe(file: File) {
		const probe = await probeVideo(file);
		if (this.file !== file) return;
		this.probe = probe;
		if (probe?.fps) this.fps = probe.fps;
		this.#hooks.onProbe?.(probe);
	}

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.load(file);
		// reset input for reselect
		input.value = '';
	};

	drop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.load(file);
	};

	// prevent dropped-file navigation
	dragOver = (event: DragEvent) => {
		event.preventDefault();
	};

	ready = (event: Event) =>
		void this.#applyMeta(event.target as HTMLVideoElement);

	async #applyMeta(video: HTMLVideoElement) {
		this.duration = await resolveDuration(video);
		this.width = video.videoWidth;
		this.height = video.videoHeight;
		this.#hooks.onReady?.(video);
	}

	failed = () => {
		this.error = LOAD_FAILED;
	};

	release() {
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = null;
	}

	clear = () => {
		this.release();
		this.fileName = '';
		this.file = null;
		this.duration = 0;
		this.fps = DEFAULT_FPS;
		this.probe = null;
		this.playing = false;
		this.error = '';
	};

	togglePlayback = () => {
		const video = this.video;
		if (!video) return;
		if (video.paused) void video.play();
		else video.pause();
	};

	syncPlaying = (event: Event) => {
		this.playing = !(event.target as HTMLVideoElement).paused;
	};

	jumpBy = (seconds: number) => {
		const video = this.video;
		if (!video) return;
		video.pause();
		video.currentTime = Math.max(
			0,
			Math.min(this.duration, video.currentTime + seconds),
		);
	};

	jumpFrame = (direction: number) => {
		this.jumpBy(direction / this.fps);
	};
}
