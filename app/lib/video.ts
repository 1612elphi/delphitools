import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { probeVideo } from 'delphitools-v2/lib/media-probe';

const DEFAULT_FPS = 30;

const NOT_A_VIDEO = 'Only video files are supported.';
const LOAD_FAILED = 'Failed to load video.';

/** Resolves once the frame at `time` is current. */
export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
	// A seek to the current position may not fire seeked (HTML spec allows
	// skipping it), which would park a seek loop on its first frame.
	if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2)
		return Promise.resolve();
	return new Promise((resolve) => {
		video.addEventListener('seeked', () => resolve(), {
			once: true,
		});
		video.currentTime = time;
	});
}

/**
 * MediaRecorder output (screen and voice recordings) reports
 * `duration: Infinity` until the file has been scanned — Chromium bug
 * 642012. Seeking far past the end forces the scan; the real value arrives
 * with durationchange.
 */
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
	/** after a new file passes the type check, before its URL is set */
	onLoad?: (file: File) => void;
	/** once the metadata (finite duration, dimensions) is in */
	onReady?: (video: HTMLVideoElement) => void;
	/** read the real frame rate from the container (mediabunny, lazy) into `fps` */
	probeFps?: boolean;
}

/**
 * The file-intake plumbing every video tool repeats: type check, object-URL
 * lifecycle, element registration, metadata resolution, decode errors.
 * Tracked, so tool templates read its fields directly.
 */
export class VideoIntake {
	@tracked url: string | null = null;
	@tracked fileName = '';
	@tracked duration = 0;
	@tracked width = 0;
	@tracked height = 0;
	@tracked error = '';
	/** container frame rate when probed, else an assumed 30 */
	@tracked fps = DEFAULT_FPS;

	video: HTMLVideoElement | null = null;
	file: File | null = null;

	#hooks: VideoIntakeHooks;

	constructor(hooks: VideoIntakeHooks = {}) {
		this.#hooks = hooks;
	}

	/** stripped of its extension; empty until a file is loaded */
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
		this.#hooks.onLoad?.(file);
		this.url = URL.createObjectURL(file);
		if (this.#hooks.probeFps) void this.#probeFps(file);
	};

	async #probeFps(file: File) {
		const probe = await probeVideo(file);
		if (this.file === file && probe?.fps) this.fps = probe.fps;
	}

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.load(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	drop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.load(file);
	};

	// Without this the browser navigates to the dropped file instead.
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

	/** revokes the object URL; the tool's willDestroy and clear both route here */
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
		this.error = '';
	};
}
