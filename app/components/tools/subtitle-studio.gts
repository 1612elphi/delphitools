import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadUrl } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import {
	formatTimestamp,
	parseSubtitles,
	type Cue,
} from 'delphitools-v2/lib/subtitles';
import { seekTo, VideoIntake } from 'delphitools-v2/lib/video';
import {
	SUBTITLE_ACCEPT,
	VIDEO_ACCEPT,
	acceptAttr,
} from 'delphitools-v2/lib/tools';
import { formatFps } from 'delphitools-v2/lib/media-probe';
import {
	burnVideo,
	encodableCodecs,
	type BurnCodec,
} from 'delphitools-v2/lib/media-convert';
import {
	DEFAULT_STYLE,
	activeCue,
	bitrateFor,
	drawSubtitle,
	supportedFormats,
	type BurnStyle,
	type FontChoice,
	type TextStyle,
} from 'delphitools-v2/lib/subtitle-burn';

const VIDEO = acceptAttr(VIDEO_ACCEPT);
const SUBS = acceptAttr(SUBTITLE_ACCEPT);
const PASTE_ACCEPT = `${VIDEO},${SUBS}`;
const SUBS_RE = /\.(srt|vtt)$/i;

const CAPTURE_FPS = 30;

const tc = (ms: number) => formatTimestamp(ms, '.');
const nth = (index: number) => index + 1;

const FONTS: { id: FontChoice; label: string }[] = [
	{ id: 'sans', label: 'Sans' },
	{ id: 'serif', label: 'Serif' },
	{ id: 'mono', label: 'Mono' },
	{ id: 'quattro', label: 'Quattro' },
];

const TEXT_STYLES: { id: TextStyle; label: string }[] = [
	{ id: 'outline', label: 'Outline' },
	{ id: 'box', label: 'Box' },
	{ id: 'plain', label: 'Plain' },
];

// probed once; static per browser
const FORMATS = supportedFormats();

const VIDEO_DROP_TITLE = 'Drop a video file';

const SUBS_DROP_TITLE = 'Drop an SRT or VTT file';

const SUBS_ERROR = 'Not a valid subtitle file.';

const BURN_ERROR = 'Writing failed, please try again';

const HIDDEN_ERROR =
	'Burn failed because the tab was backgrounded. Please try again and keep it in focus.';

interface Drag {
	pointerId: number;
	startX: number;
	startY: number;
	x0: number;
	y0: number;
	width: number;
	height: number;
}

export default class SubtitleStudioTool extends Component {
	intake = new VideoIntake({
		onLoad: () => {
			this.#stopBurn();
			this.#resetResult();
		},
		onReady: (video) => {
			this.#fitCanvas(video);
			void this.#probeEncoders(video);
		},
		probe: true,
		canLoad: () => !this.burning,
	});

	@tracked cues: Cue[] = [];
	@tracked subsName = '';
	@tracked style: BurnStyle = DEFAULT_STYLE;
	@tracked currentMs = 0;
	@tracked burning = false;
	@tracked burnPct = 0;
	@tracked resultUrl = '';
	@tracked resultSize = 0;
	@tracked resultExt = 'webm';
	/** sec of video / wall clock sec; 0 unknown */
	@tracked resultSpeed = 0;
	@tracked encoders: Set<BurnCodec> | null = null;
	@tracked errorCode = '';
	@tracked formatId = '';

	canvas: HTMLCanvasElement | null = null;

	#burnId = 0;
	#burnWatcher: AbortController | null = null;
	#subsToken = 0;
	#audio: {
		ctx: AudioContext;
		dest: MediaStreamAudioDestinationNode;
		gain: GainNode;
	} | null = null;
	#drag: Drag | null = null;
	#frame = 0;
	#frameKind: 'video' | 'raf' = 'raf';

	registerCanvas = modifier((element: HTMLCanvasElement) => {
		this.canvas = element;
		return () => {
			this.canvas = null;
		};
	});

	willDestroy() {
		super.willDestroy();
		this.#stopBurn();
		this.#cancelFrame();
		this.intake.release();
		this.#resetResult();
		void this.#audio?.ctx.close();
	}

	// per-encoder support with webcodecs;
	// else mediarecorder answers stand.
	get formats() {
		return this.encoders
			? supportedFormats(this.encoders)
			: FORMATS;
	}

	get format() {
		const formats = this.formats;
		return (
			formats.find(
				(f) => f.id === this.formatId && f.supported,
			) ?? formats.find((f) => f.supported)
		);
	}

	get activeIndex() {
		const ms = this.currentMs;
		return this.cues.findIndex((c) => ms >= c.start && ms < c.end);
	}

	get hasVideo() {
		return this.intake.url !== null;
	}

	get ready() {
		return (
			this.intake.duration > 0 &&
			this.cues.length > 0 &&
			!!this.format &&
			!this.burning
		);
	}

	setFormat = (event: Event) => {
		this.formatId = (event.target as HTMLSelectElement).value;
		this.#resetResult();
	};

	get baseName() {
		return this.intake.baseName || 'video';
	}

	get meta() {
		const { duration, width, height } = this.intake;
		if (!duration) return '';
		return `${width} × ${height} · ${formatFps(this.intake.fps)} · ${tc(duration * 1000)}`;
	}

	get stats() {
		if (this.cues.length === 0) return '';
		return `${this.cues.length} cues · ${tc(this.currentMs)}`;
	}

	get sizePercent() {
		return Math.round(this.style.size * 100);
	}

	get positionLabel() {
		const { x, y } = this.style;
		return `${Math.round(x * 100)} · ${Math.round(y * 100)}`;
	}

	get progressStyle() {
		return htmlSafe(`width: ${this.burnPct}%`);
	}

	get resultLabel() {
		const speed =
			this.resultSpeed > 0
				? ` · ${this.resultSpeed.toFixed(1)}×`
				: '';
		return `${this.resultExt} · ${formatBytes(this.resultSize)}${speed}`;
	}

	get errorMessage() {
		if (this.intake.error) return this.intake.error;
		if (this.errorCode === 'subs') return SUBS_ERROR;
		if (this.errorCode === 'burn') return BURN_ERROR;
		if (this.errorCode === 'hidden') return HIDDEN_ERROR;
		return '';
	}

	chooseSubs = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void this.readSubs(file);
		input.value = '';
	};

	readSubs = async (file: File) => {
		const token = ++this.#subsToken;
		const cues = parseSubtitles(await file.text());
		if (this.isDestroyed || token !== this.#subsToken) return;
		if (cues.length === 0) {
			this.errorCode = 'subs';
			return;
		}
		this.cues = cues.slice().sort((a, b) => a.start - b.start);
		this.subsName = file.name;
		this.errorCode = '';
		this.#resetResult();
		this.draw();
	};

	// routed by extension: srt/vtt → subs, else video
	readAny = (file: File) => {
		if (SUBS_RE.test(file.name)) void this.readSubs(file);
		else this.intake.load(file);
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		if (this.burning) return;
		for (const file of event.dataTransfer?.files ?? [])
			this.readAny(file);
	};

	#patch(patch: Partial<BurnStyle>) {
		this.style = { ...this.style, ...patch };
		this.draw();
	}

	setFont = (font: FontChoice) => this.#patch({ font });

	setSize = (event: Event) =>
		this.#patch({
			size:
				Number(
					(event.target as HTMLInputElement)
						.value,
				) / 100,
		});

	setColour = (event: Event) =>
		this.#patch({
			colour: (event.target as HTMLInputElement).value,
		});

	setTextStyle = (text: TextStyle) => this.#patch({ text });

	resetPosition = () =>
		this.#patch({ x: DEFAULT_STYLE.x, y: DEFAULT_STYLE.y });

	// css-box scale → frame fractions; 1:1 at any size
	pointerDown = (event: PointerEvent) => {
		const canvas = this.canvas;
		if (!canvas || this.burning || !this.cues.length) return;
		// object-fit: contain letterboxes; deltas scale against frame
		const rect = canvas.getBoundingClientRect();
		const scale = Math.min(
			rect.width / canvas.width,
			rect.height / canvas.height,
		);
		this.#drag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			x0: this.style.x,
			y0: this.style.y,
			width: canvas.width * scale,
			height: canvas.height * scale,
		};
		canvas.setPointerCapture(event.pointerId);
	};

	pointerMove = (event: PointerEvent) => {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		const x = drag.x0 + (event.clientX - drag.startX) / drag.width;
		const y = drag.y0 + (event.clientY - drag.startY) / drag.height;
		this.#patch({
			x: Math.max(-0.45, Math.min(0.45, x)),
			y: Math.max(-0.9, Math.min(0.05, y)),
		});
	};

	pointerUp = (event: PointerEvent) => {
		if (this.#drag?.pointerId === event.pointerId)
			this.#drag = null;
	};

	togglePlayback = () => {
		if (this.burning) return;
		void this.#audio?.ctx.resume();
		this.intake.togglePlayback();
	};

	syncPlaying = (event: Event) => {
		this.intake.syncPlaying(event);
		if (this.intake.playing) this.#loop();
	};

	seekRow = (index: number) => {
		const video = this.intake.video;
		const cue = this.cues[index];
		if (!video || !cue || this.burning) return;
		video.pause();
		void seekTo(video, cue.start / 1000).then(() => this.draw());
	};

	setText = (index: number, event: Event) => {
		const next = this.cues.slice();
		next[index] = {
			...next[index]!,
			text: (event.target as HTMLInputElement).value,
		};
		this.cues = next;
		this.#resetResult();
		this.draw();
	};

	draw = () => {
		const video = this.intake.video;
		const canvas = this.canvas;
		if (!video || !canvas || !canvas.width) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const { width, height } = canvas;
		ctx.drawImage(video, 0, 0, width, height);
		const ms = video.currentTime * 1000;
		const cue = activeCue(this.cues, ms);
		if (cue) drawSubtitle(ctx, cue.text, width, height, this.style);
		this.currentMs = ms;
		if (this.burning && this.intake.duration) {
			const pct = Math.round(
				(100 * ms) / (this.intake.duration * 1000),
			);
			if (pct !== this.burnPct) this.burnPct = pct;
		}
	};

	// rVFC one draw/frame (chrome 83+, safari 15.4+, firefox 132+); rAF fallback
	#loop = () => {
		this.#cancelFrame();
		if (!this.intake.playing && !this.burning) return;
		this.draw();
		const video = this.intake.video;
		if (video && 'requestVideoFrameCallback' in video) {
			this.#frameKind = 'video';
			this.#frame = video.requestVideoFrameCallback(
				this.#loop,
			);
		} else {
			this.#frameKind = 'raf';
			this.#frame = requestAnimationFrame(this.#loop);
		}
	};

	#cancelFrame() {
		if (this.#frameKind === 'video')
			this.intake.video?.cancelVideoFrameCallback(
				this.#frame,
			);
		else cancelAnimationFrame(this.#frame);
	}

	async #probeEncoders(video: HTMLVideoElement) {
		const file = this.intake.file;
		const encoders = await encodableCodecs(
			video.videoWidth,
			video.videoHeight,
		);
		// webcodecs present; no encoder valid → mediarecorder
		if (!this.isDestroyed && this.intake.file === file)
			this.encoders = encoders?.size ? encoders : null;
	}

	#fitCanvas(video: HTMLVideoElement) {
		const canvas = this.canvas;
		if (!canvas) return;
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		this.draw();
	}

	// createMediaElementSource binds permanently; build once, gain 1 = playback
	#audioGraph(video: HTMLVideoElement) {
		if (this.#audio) return this.#audio;
		const ctx = new AudioContext();
		const source = ctx.createMediaElementSource(video);
		const dest = ctx.createMediaStreamDestination();
		const gain = ctx.createGain();
		source.connect(dest);
		source.connect(gain);
		gain.connect(ctx.destination);
		this.#audio = { ctx, dest, gain };
		return this.#audio;
	}

	burn = () => {
		if (this.encoders) void this.#burnFast();
		else void this.#burnLive();
	};

	async #burnFast() {
		const file = this.intake.file;
		const canvas = this.canvas;
		const format = this.format;
		if (!file || !canvas || !format || !this.ready) return;
		const id = ++this.#burnId;
		this.burning = true;
		this.burnPct = 0;
		this.errorCode = '';
		this.#resetResult();
		this.intake.video?.pause();
		const watcher = new AbortController();
		this.#burnWatcher = watcher;
		const cues = this.cues;
		const style = this.style;
		const started = performance.now();
		try {
			const result = await burnVideo(file, {
				container: format.ext,
				codec: format.codec,
				bitrate: bitrateFor(
					canvas.width,
					canvas.height,
					this.intake.fps,
				),
				overlay: (seconds) => {
					const cue = activeCue(
						cues,
						seconds * 1000,
					);
					return cue
						? (ctx, width, height) =>
								drawSubtitle(
									ctx,
									cue.text,
									width,
									height,
									style,
								)
						: null;
				},
				onProgress: (fraction) => {
					if (id !== this.#burnId) return;
					const pct = Math.round(fraction * 100);
					if (pct !== this.burnPct)
						this.burnPct = pct;
				},
				signal: watcher.signal,
			});
			if (id !== this.#burnId) return;
			this.resultUrl = URL.createObjectURL(result.blob);
			this.resultSize = result.blob.size;
			this.resultExt = result.ext;
			this.resultSpeed =
				this.intake.duration /
				((performance.now() - started) / 1000);
			this.burnPct = 100;
		} catch (error) {
			if (id !== this.#burnId) return;
			if ((error as Error).name === 'AbortError') return;
			console.error('Burn failed:', error);
			this.errorCode = 'burn';
		} finally {
			watcher.abort();
			if (this.#burnWatcher === watcher)
				this.#burnWatcher = null;
			if (id === this.#burnId) this.burning = false;
		}
	}

	async #burnLive() {
		const video = this.intake.video;
		const canvas = this.canvas;
		if (!video || !canvas || !this.ready) return;
		const id = ++this.#burnId;
		this.burning = true;
		this.burnPct = 0;
		this.errorCode = '';
		this.#resetResult();
		let stream: MediaStream | null = null;
		let active: MediaRecorder | null = null;
		const watcher = new AbortController();
		this.#burnWatcher = watcher;
		try {
			video.pause();
			await seekTo(video, 0);
			const audio = this.#audioGraph(video);
			await audio.ctx.resume();
			audio.gain.gain.value = 0;
			stream = canvas.captureStream(CAPTURE_FPS);
			for (const track of audio.dest.stream.getAudioTracks())
				stream.addTrack(track);
			const format = this.format!;
			const recorder = new MediaRecorder(stream, {
				mimeType: format.mime,
				videoBitsPerSecond: bitrateFor(
					canvas.width,
					canvas.height,
					CAPTURE_FPS,
				),
				audioBitsPerSecond: 128_000,
			});
			active = recorder;
			const chunks: Blob[] = [];
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0)
					chunks.push(event.data);
			};
			const stopped = new Promise<void>((resolve) => {
				recorder.onstop = () => resolve();
			});
			this.draw();
			recorder.start(250);
			const ended = new Promise<void>((resolve) =>
				video.addEventListener(
					'ended',
					() => resolve(),
					{
						once: true,
						signal: watcher.signal,
					},
				),
			);
			// stop must abort or burn suspends; watcher drops listeners too
			const aborted = new Promise<never>((_, reject) =>
				watcher.signal.addEventListener('abort', () =>
					reject(new Error('stopped')),
				),
			);
			// backgrounded tab throttles capture; abort rather than stutter
			const hidden = new Promise<never>((_, reject) =>
				document.addEventListener(
					'visibilitychange',
					() => {
						if (document.hidden)
							reject(
								new Error(
									'hidden',
								),
							);
					},
					{ signal: watcher.signal },
				),
			);
			await video.play();
			this.#loop();
			await Promise.race([ended, hidden, aborted]);
			if (id !== this.#burnId) return;
			this.draw();
			recorder.stop();
			await stopped;
			if (id !== this.#burnId) return;
			const blob = new Blob(chunks, {
				type: recorder.mimeType || 'video/webm',
			});
			this.resultUrl = URL.createObjectURL(blob);
			this.resultSize = blob.size;
			this.resultExt = format.ext;
			this.burnPct = 100;
		} catch (error) {
			const message = (error as Error).message;
			if (message !== 'hidden' && message !== 'stopped')
				console.error('Burn failed:', error);
			if (id === this.#burnId)
				this.errorCode =
					message === 'hidden'
						? 'hidden'
						: 'burn';
		} finally {
			for (const track of stream?.getVideoTracks() ?? [])
				track.stop();
			watcher.abort();
			if (this.#burnWatcher === watcher)
				this.#burnWatcher = null;
			if (active && active.state !== 'inactive')
				active.stop();
			video.pause();
			if (id === this.#burnId) {
				this.burning = false;
				if (this.#audio)
					this.#audio.gain.gain.value = 1;
			}
		}
	}

	#stopBurn() {
		this.#burnId++;
		this.#burnWatcher?.abort();
		this.#burnWatcher = null;
		this.intake.video?.pause();
		this.burning = false;
		if (this.#audio) this.#audio.gain.gain.value = 1;
	}

	#resetResult() {
		if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
		this.resultUrl = '';
		this.resultSize = 0;
		this.resultSpeed = 0;
		this.burnPct = 0;
	}

	downloadResult = () => {
		if (!this.resultUrl) return;
		downloadUrl(
			this.resultUrl,
			`${this.baseName}-subtitled.${this.resultExt}`,
		);
	};

	clear = () => {
		this.#stopBurn();
		this.#resetResult();
		this.intake.clear();
		this.cues = [];
		this.subsName = '';
		this.errorCode = '';
		this.currentMs = 0;
		if (this.canvas) this.canvas.width = 0;
	};

	<template>
		<div
			class="dt-ss"
			{{filePaste this.readAny accept=PASTE_ACCEPT}}
		>
			<div
				class="dt-ss-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.intake.dragOver}}
			>
				<div class="dt-ss-bar">
					<label
						class="dt-ss-file"
						aria-label="Open video file"
					>
						<input
							type="file"
							class="dt-sr-only"
							accept={{VIDEO}}
							{{on
								"change"
								this.intake.chooseFile
							}}
						/>
						<Icon @name="film" />
						<span
							class="dt-ss-filename"
						>{{if
								this.intake.fileName
								this.intake.fileName
								"Choose video"
							}}</span>
					</label>
					<label
						class="dt-ss-file"
						aria-label="Open subtitle file"
					>
						<input
							type="file"
							class="dt-sr-only"
							accept={{SUBS}}
							{{on
								"change"
								this.chooseSubs
							}}
						/>
						<Icon @name="captions" />
						<span
							class="dt-ss-filename"
						>{{if
								this.subsName
								this.subsName
								"Choose subtitles"
							}}</span>
					</label>
					<select
						class="dt-ss-format"
						aria-label="Export format"
						{{on "change" this.setFormat}}
					>
						{{#each
							this.formats key="id"
							as |f|
						}}
							<option
								value={{f.id}}
								disabled={{unless
									f.supported
									true
								}}
								selected={{eq
									f.id
									this.format.id
								}}
							>{{f.label}}</option>
						{{/each}}
					</select>
					<button
						type="button"
						class="dt-ss-go"
						disabled={{unless
							this.ready
							true
						}}
						aria-busy={{if
							this.burning
							"true"
							"false"
						}}
						{{on "click" this.burn}}
					>
						{{#if this.burning}}
							<NdsLoader />
						{{else}}
							<Icon @name="flame" />
						{{/if}}
						<span>Burn</span>
					</button>
					<button
						type="button"
						class="dt-ss-clear"
						disabled={{unless
							this.hasVideo
							(unless
								this.subsName
								true
							)
						}}
						aria-label="Clear"
						{{on "click" this.clear}}
					>
						<Icon @name="x" />
					</button>
				</div>

				<div class="dt-ss-settings">
					<div class="dt-ss-set">
						<span
							class="dt-ss-label"
						>Font</span>
						<div
							class="segmented dt-ss-fonts"
						>
							{{#each
								FONTS key="id"
								as |f|
							}}
								<button
									type="button"
									class="dt-ss-seg
										{{if
											(eq
												this.style.font
												f.id
											)
											'is-active'
										}}"
									aria-pressed={{if
										(eq
											this.style.font
											f.id
										)
										"true"
										"false"
									}}
									{{on
										"click"
										(fn
											this.setFont
											f.id
										)
									}}
								>{{f.label}}</button>
							{{/each}}
						</div>
					</div>

					<div class="dt-ss-set">
						<span
							class="dt-ss-label"
						>Size</span>
						<div class="dt-ss-range">
							<input
								type="range"
								min="2"
								max="14"
								step="1"
								value={{this.sizePercent}}
								aria-label="Text size"
								{{on
									"input"
									this.setSize
								}}
							/>
							<span
								class="dt-ss-readout"
							>{{this.sizePercent}}%</span>
						</div>
					</div>

					<div class="dt-ss-set">
						<span
							class="dt-ss-label"
						>Colour</span>
						<div class="dt-ss-colour">
							<input
								type="color"
								value={{this.style.colour}}
								aria-label="Text colour"
								{{on
									"input"
									this.setColour
								}}
							/>
							<span
								class="dt-ss-readout"
							>{{this.style.colour}}</span>
						</div>
					</div>

					<div class="dt-ss-set">
						<span
							class="dt-ss-label"
						>Style</span>
						<div
							class="segmented dt-ss-styles"
						>
							{{#each
								TEXT_STYLES
								key="id"
								as |s|
							}}
								<button
									type="button"
									class="dt-ss-seg
										{{if
											(eq
												this.style.text
												s.id
											)
											'is-active'
										}}"
									aria-pressed={{if
										(eq
											this.style.text
											s.id
										)
										"true"
										"false"
									}}
									{{on
										"click"
										(fn
											this.setTextStyle
											s.id
										)
									}}
								>{{s.label}}</button>
							{{/each}}
						</div>
					</div>

				</div>

				<div class="dt-ss-stage">
					{{! no caption track in uploaded file }}
					{{! template-lint-disable require-media-caption }}
					<video
						src={{this.intake.url}}
						playsinline
						preload="auto"
						hidden
						{{this.intake.register}}
						{{on
							"loadedmetadata"
							this.intake.ready
						}}
						{{on
							"error"
							this.intake.failed
						}}
						{{on "play" this.syncPlaying}}
						{{on "pause" this.syncPlaying}}
						{{on "seeked" this.draw}}
					></video>
					{{! canvas = subtitle drag surface }}
					{{! template-lint-disable no-invalid-interactive no-pointer-down-event-binding }}
					<canvas
						class="dt-ss-canvas
							{{unless
								this.hasVideo
								'is-hidden'
							}}"
						{{this.registerCanvas}}
						{{on
							"pointerdown"
							this.pointerDown
						}}
						{{on
							"pointermove"
							this.pointerMove
						}}
						{{on
							"pointerup"
							this.pointerUp
						}}
						{{on
							"pointercancel"
							this.pointerUp
						}}
					></canvas>
					{{#if this.meta}}
						<span
							class="dt-ss-meta"
						>{{this.meta}}</span>
					{{/if}}
					{{#if this.hasVideo}}
						<div class="dt-ss-pos">
							<Icon @name="move" />
							<span
								class="dt-ss-readout"
							>{{this.positionLabel}}</span>
							<button
								type="button"
								class="dt-ss-reset"
								{{on
									"click"
									this.resetPosition
								}}
							>Reset</button>
						</div>
					{{/if}}
					{{#unless this.hasVideo}}
						<label class="dt-ss-drop">
							<input
								type="file"
								class="dt-sr-only"
								accept={{VIDEO}}
								{{on
									"change"
									this.intake.chooseFile
								}}
							/>
							<Icon @name="film" />
							<span
								class="dt-ss-drop-title"
							>{{VIDEO_DROP_TITLE}}</span>
							{{! hint shared with background remover }}
							<span
								class="dt-ss-drop-hint"
							>or click to select a
								file, or paste</span>
						</label>
					{{/unless}}
				</div>

				<div class="dt-ss-transport">
					<button
						type="button"
						class="dt-ss-tbtn"
						disabled={{if
							this.burning
							true
						}}
						aria-label="Back 5 seconds"
						{{on
							"click"
							(fn
								this.intake.jumpBy
								-5
							)
						}}
					>
						<Icon @name="rewind" />
						<span>5 s</span>
					</button>
					<button
						type="button"
						class="dt-ss-tbtn"
						disabled={{if
							this.burning
							true
						}}
						aria-label="Back 1 second"
						{{on
							"click"
							(fn
								this.intake.jumpBy
								-1
							)
						}}
					>
						<Icon @name="chevrons-left" />
						<span>1 s</span>
					</button>
					<button
						type="button"
						class="dt-ss-tbtn"
						disabled={{if
							this.burning
							true
						}}
						aria-label="Back one frame"
						{{on
							"click"
							(fn
								this.intake.jumpFrame
								-1
							)
						}}
					>
						<Icon @name="chevron-left" />
						<span>Frame</span>
					</button>
					<button
						type="button"
						class="dt-ss-tbtn is-play"
						disabled={{if
							this.burning
							true
						}}
						{{on
							"click"
							this.togglePlayback
						}}
					>
						<Icon
							@name={{if
								this.intake.playing
								"pause"
								"play"
							}}
						/>
						<span>{{if
								this.intake.playing
								"Pause"
								"Play"
							}}</span>
					</button>
					<button
						type="button"
						class="dt-ss-tbtn"
						disabled={{if
							this.burning
							true
						}}
						aria-label="Forward one frame"
						{{on
							"click"
							(fn
								this.intake.jumpFrame
								1
							)
						}}
					>
						<Icon @name="chevron-right" />
						<span>Frame</span>
					</button>
					<button
						type="button"
						class="dt-ss-tbtn"
						disabled={{if
							this.burning
							true
						}}
						aria-label="Forward 1 second"
						{{on
							"click"
							(fn
								this.intake.jumpBy
								1
							)
						}}
					>
						<Icon @name="chevrons-right" />
						<span>1 s</span>
					</button>
					<button
						type="button"
						class="dt-ss-tbtn"
						disabled={{if
							this.burning
							true
						}}
						aria-label="Forward 5 seconds"
						{{on
							"click"
							(fn
								this.intake.jumpBy
								5
							)
						}}
					>
						<Icon @name="fast-forward" />
						<span>5 s</span>
					</button>
				</div>

				<div class="dt-ss-out">
					<div class="dt-ss-out-head">
						<span
							class="dt-ss-out-label"
						>Subtitles</span>
						{{#if this.stats}}
							<span
								class="dt-ss-stats"
							>{{this.stats}}</span>
						{{/if}}
						<div class="dt-ss-out-tools">
							{{#if this.resultUrl}}
								<span
									class="dt-ss-result"
								>{{this.resultLabel}}</span>
								<button
									type="button"
									class="dt-ss-btn is-wide is-primary"
									{{on
										"click"
										this.downloadResult
									}}
								>
									<DownloadLabel
									/>
								</button>
							{{/if}}
						</div>
					</div>

					{{#if this.cues.length}}
						<div class="dt-ss-grid">
							<div
								class="dt-ss-row dt-ss-grid-head"
							>
								<span
									class="dt-ss-n"
								>#</span>
								<span
								>Start</span>
								<span>End</span>
								<span
								>Text</span>
							</div>
							{{#each
								this.cues
								key="@index"
								as |cue index|
							}}
								<div
									class="dt-ss-row
										{{if
											(eq
												index
												this.activeIndex
											)
											'is-active'
										}}"
								>
									<button
										type="button"
										class="dt-ss-n"
										aria-label="Seek to cue"
										{{on
											"click"
											(fn
												this.seekRow
												index
											)
										}}
									>{{nth
											index
										}}</button>
									<span
										class="dt-ss-tc"
									>{{tc
											cue.start
										}}</span>
									<span
										class="dt-ss-tc"
									>{{tc
											cue.end
										}}</span>
									<input
										type="text"
										class="dt-ss-text"
										aria-label="Text"
										value={{cue.text}}
										{{on
											"input"
											(fn
												this.setText
												index
											)
										}}
									/>
								</div>
							{{/each}}
						</div>
					{{else}}
						<label
							class="dt-ss-drop is-subs"
						>
							<input
								type="file"
								class="dt-sr-only"
								accept={{SUBS}}
								{{on
									"change"
									this.chooseSubs
								}}
							/>
							<Icon
								@name="captions"
							/>
							<span
								class="dt-ss-drop-title"
							>{{SUBS_DROP_TITLE}}</span>
							{{! hint shared with background remover }}
							<span
								class="dt-ss-drop-hint"
							>or click to select a
								file, or paste</span>
						</label>
					{{/if}}
				</div>

				{{#if this.errorMessage}}
					<p
						class="dt-ss-error"
						role="alert"
					>{{this.errorMessage}}</p>
				{{/if}}

				{{#if this.burning}}
					<span
						class="dt-ss-progress"
						role="progressbar"
						aria-label="Burn progress"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={{this.burnPct}}
					>
						<span
							style={{this.progressStyle}}
						></span>
					</span>
				{{/if}}
			</div>
		</div>
	</template>
}
