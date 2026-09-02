import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import Switch from 'delphitools-v2/components/ui/switch';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { resolveDuration } from 'delphitools-v2/lib/video';

const EMPTY_HINT = 'Choose a screen, window or tab to start recording.';

const DISPLAY_FAILED = 'Screen sharing failed. Check browser permissions.';

const MIC_DENIED =
	'Microphone access was denied, so audio will not be mixed in.';

const UNSUPPORTED = 'Screen recording is not supported in this browser.';

const MIC_LABEL = 'Mix in microphone audio';

// cancel throws NotAllowedError
const isCancel = (err: unknown) => {
	const name = (err as Error)?.name;
	return name === 'NotAllowedError' || name === 'AbortError';
};
const ECHO_LABEL = 'Echo cancellation';
const NOISE_LABEL = 'Noise suppression';
const GAIN_LABEL = 'Auto gain control';

export default class ScreenRecorderTool extends Component {
	@tracked status: 'idle' | 'recording' | 'paused' | 'finished' = 'idle';
	@tracked elapsedMs = 0;
	@tracked micMixIn = false;
	@tracked echoCancellation = false;
	@tracked noiseSuppression = false;
	@tracked autoGainControl = false;
	@tracked videoBlob: Blob | null = null;
	@tracked videoUrl: string | null = null;
	@tracked duration = 0;
	@tracked width = 0;
	@tracked height = 0;
	@tracked error = '';
	@tracked playing = false;

	#recorder: MediaRecorder | null = null;
	#displayStream: MediaStream | null = null;
	#micStream: MediaStream | null = null;
	#combinedStream: MediaStream | null = null;
	#audioCtx: AudioContext | null = null;
	#chunks: Blob[] = [];
	#startedAt = 0;
	#pausedAt = 0;
	#rafId = 0;
	#video: HTMLVideoElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.#stopRecording();
		this.#releaseTake();
	}

	get elapsedLabel() {
		const total = Math.floor(this.elapsedMs / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	get meta() {
		if (!this.duration) return '';
		return `${this.width} × ${this.height} · ${this.duration.toFixed(2)} s`;
	}

	#tickElapsed = () => {
		if (this.status !== 'recording') return;
		this.elapsedMs = performance.now() - this.#startedAt;
		this.#rafId = requestAnimationFrame(this.#tickElapsed);
	};

	start = async () => {
		this.error = '';
		if (
			!navigator.mediaDevices?.getDisplayMedia ||
			typeof MediaRecorder === 'undefined'
		) {
			this.error = UNSUPPORTED;
			return;
		}

		try {
			try {
				this.#displayStream =
					await navigator.mediaDevices.getDisplayMedia(
						{
							video: true,
							audio: {
								echoCancellation: false,
								noiseSuppression: false,
								autoGainControl: false,
								sampleRate: 48000,
								channelCount: 2,
							},
						},
					);
			} catch (err) {
				// rethrow, no second picker
				if (isCancel(err)) throw err;
				this.#displayStream =
					await navigator.mediaDevices.getDisplayMedia(
						{
							video: true,
							audio: true,
						},
					);
			}
		} catch (err) {
			if (!isCancel(err)) this.error = DISPLAY_FAILED;
			return;
		}

		if (!this.#displayStream) return;

		this.#micStream = null;

		if (this.micMixIn) {
			try {
				this.#micStream =
					await navigator.mediaDevices.getUserMedia(
						{
							audio: {
								echoCancellation:
									{
										ideal: this
											.echoCancellation,
									},
								noiseSuppression:
									{
										ideal: this
											.noiseSuppression,
									},
								autoGainControl:
									{
										ideal: this
											.autoGainControl,
									},
							},
						},
					);
			} catch {
				this.error = MIC_DENIED;
			}
		}

		const displayAudio = this.#displayStream.getAudioTracks();
		const micAudio = this.#micStream?.getAudioTracks() ?? [];
		const audioTracks = [...displayAudio, ...micAudio];
		const videoTrack = this.#displayStream.getVideoTracks()[0];
		const finalTracks: MediaStreamTrack[] = [];
		if (videoTrack) finalTracks.push(videoTrack);

		// Always normalize audio through AudioContext @ 48kHz to avoid Opus
		// clock drift: tab/system audio is often 44.1kHz while Opus expects 48kHz.
		// Raw track → slow/pitch-down playback. For >1 tracks this also mixes.
		if (audioTracks.length >= 1) {
			try {
				const ctx = new AudioContext({
					sampleRate: 48000,
				});
				this.#audioCtx = ctx;
				if (ctx.state === 'suspended')
					await ctx.resume();
				const dest = ctx.createMediaStreamDestination();
				for (const t of audioTracks) {
					const src = ctx.createMediaStreamSource(
						new MediaStream([t]),
					);
					src.connect(dest);
				}
				const mixed = dest.stream.getAudioTracks()[0];
				if (mixed) finalTracks.push(mixed);
				else {
					for (const t of audioTracks)
						if (t) finalTracks.push(t);
				}
			} catch {
				for (const t of audioTracks)
					if (t) finalTracks.push(t);
			}
		}

		this.#combinedStream = new MediaStream(finalTracks);

		// omit opus codec when no audio tracks exist to prevent recorder onstop hangs
		const hasAudio = finalTracks.some((t) => t.kind === 'audio');
		const candidates = hasAudio
			? [
					'video/webm;codecs=vp9,opus',
					'video/webm;codecs=vp8,opus',
					'video/webm',
				]
			: [
					'video/webm;codecs=vp9',
					'video/webm;codecs=vp8',
					'video/webm',
				];
		const mimeType =
			candidates.find((t) => {
				try {
					return MediaRecorder.isTypeSupported(t);
				} catch {
					return false;
				}
			}) ?? '';
		const recorderOpts: MediaRecorderOptions = {};
		if (mimeType) recorderOpts.mimeType = mimeType;
		if (hasAudio) recorderOpts.audioBitsPerSecond = 128000;
		recorderOpts.videoBitsPerSecond = 2500000;
		this.#recorder = new MediaRecorder(
			this.#combinedStream,
			recorderOpts,
		);
		this.#chunks = [];
		this.#recorder.ondataavailable = (event) => {
			if (event.data.size > 0) this.#chunks.push(event.data);
		};
		this.#recorder.onstop = () => this.#onStop();
		this.#recorder.onpause = () => {
			this.status = 'paused';
			this.#pausedAt = performance.now();
			cancelAnimationFrame(this.#rafId);
		};
		this.#recorder.onresume = () => {
			this.status = 'recording';
			this.#startedAt += performance.now() - this.#pausedAt;
			this.#rafId = requestAnimationFrame(this.#tickElapsed);
		};

		this.#displayStream
			.getVideoTracks()[0]
			?.addEventListener('ended', () => {
				// chrome stop fires 'ended'
				this.stop();
			});

		this.elapsedMs = 0;
		this.#startedAt = performance.now();
		this.status = 'recording';
		this.#recorder.start();
		this.#rafId = requestAnimationFrame(this.#tickElapsed);
	};

	#onStop() {
		this.#displayStream
			?.getTracks()
			.forEach((track) => track.stop());
		this.#micStream?.getTracks().forEach((track) => track.stop());
		this.#displayStream = null;
		this.#micStream = null;
		this.#combinedStream = null;
		void this.#audioCtx?.close().catch(() => {});
		this.#audioCtx = null;
		cancelAnimationFrame(this.#rafId);

		if (this.#chunks.length === 0) {
			this.#recorder = null;
			this.status = 'idle';
			return;
		}

		const blob = new Blob(this.#chunks, {
			type: this.#recorder?.mimeType || 'video/webm',
		});
		this.#recorder = null;
		this.#finishTake(blob);
	}

	#finishTake(blob: Blob) {
		this.videoBlob = blob;
		this.videoUrl = URL.createObjectURL(blob);
		this.status = 'finished';
	}

	#stopRecording() {
		void this.#audioCtx?.close().catch(() => {});
		this.#audioCtx = null;
		const recorder = this.#recorder;
		if (recorder) {
			// prevent resurrecting discarded takes
			recorder.ondataavailable = null;
			recorder.onstop = null;
			recorder.onpause = null;
			recorder.onresume = null;
			try {
				recorder.stop();
			} catch {
				// stop() throws when idle
			}
		}
		this.#recorder = null;
		this.#displayStream
			?.getTracks()
			.forEach((track) => track.stop());
		this.#micStream?.getTracks().forEach((track) => track.stop());
		this.#displayStream = null;
		this.#micStream = null;
		this.#combinedStream = null;
		cancelAnimationFrame(this.#rafId);
	}

	#releaseTake() {
		const url = this.videoUrl;
		this.videoUrl = null;
		if (url) setTimeout(() => URL.revokeObjectURL(url), 500);
		this.videoBlob = null;
		this.duration = 0;
		this.width = 0;
		this.height = 0;
		this.elapsedMs = 0;
		this.playing = false;
	}

	stop = () => {
		if (
			this.#recorder?.state === 'recording' ||
			this.#recorder?.state === 'paused'
		) {
			this.#recorder.stop();
		}
	};

	togglePause = () => {
		// bookkeeping in onpause/onresume handlers
		if (this.status === 'recording') this.#recorder?.pause();
		else if (this.status === 'paused') this.#recorder?.resume();
	};

	// dynamically update filters on active mic tracks
	#applyMicConstraints() {
		for (const track of this.#micStream?.getAudioTracks() ?? []) {
			void track
				.applyConstraints({
					echoCancellation: {
						ideal: this.echoCancellation,
					},
					noiseSuppression: {
						ideal: this.noiseSuppression,
					},
					autoGainControl: {
						ideal: this.autoGainControl,
					},
				})
				.catch(() => {});
		}
	}

	setMicMixIn = (value: boolean) => {
		this.micMixIn = value;
	};

	setEchoCancellation = (value: boolean) => {
		this.echoCancellation = value;
		this.#applyMicConstraints();
	};

	setNoiseSuppression = (value: boolean) => {
		this.noiseSuppression = value;
		this.#applyMicConstraints();
	};

	setAutoGainControl = (value: boolean) => {
		this.autoGainControl = value;
		this.#applyMicConstraints();
	};

	clear = () => {
		this.#stopRecording();
		this.#releaseTake();
		this.status = 'idle';
		this.error = '';
	};

	download = () => {
		if (this.videoBlob) {
			const stamp = new Date()
				.toISOString()
				.replace(/[:.]/g, '-');
			downloadBlob(
				this.videoBlob,
				`screen-recording-${stamp}.webm`,
			);
		}
	};

	onVideoReady = async (event: Event) => {
		const video = event.target as HTMLVideoElement;
		this.duration = await resolveDuration(video);
		this.width = video.videoWidth;
		this.height = video.videoHeight;
	};

	registerLive = modifier((video: HTMLVideoElement) => {
		const vTrack =
			this.#displayStream?.getVideoTracks()[0] ??
			this.#combinedStream?.getVideoTracks()[0];
		if (vTrack) {
			video.srcObject = new MediaStream([vTrack]);
			video.muted = true;
			// Firefox can ignore muted attribute on MediaStream with audio
			video.volume = 0;
			void video.play();
		}
		return () => {
			video.srcObject = null;
		};
	});

	registerPlayback = modifier((video: HTMLVideoElement) => {
		this.#video = video;
		if (this.videoUrl) {
			video.src = this.videoUrl;
			video.load();
		}
		return () => {
			if (this.#video === video) this.#video = null;
			video.pause();
			video.removeAttribute('src');
			video.load();
		};
	});

	togglePlay = () => {
		const video = this.#video;
		if (!video) return;
		if (video.paused) {
			void video.play();
		} else {
			video.pause();
		}
	};

	handlePlay = () => {
		this.playing = true;
	};

	handlePause = () => {
		this.playing = false;
	};

	handleEnded = () => {
		this.playing = false;
	};

	<template>
		<div class="dt-sr">
			<div class="dt-sr-frame">
				<div class="dt-sr-bar">
					{{#if (eq this.status "idle")}}
						<button
							type="button"
							class="dt-sr-btn is-primary"
							{{on
								"click"
								this.start
							}}
						>
							<Icon
								@name="monitor-up"
							/>
							Share screen
						</button>
					{{/if}}

					{{#if (eq this.status "recording")}}
						<button
							type="button"
							class="dt-sr-btn"
							{{on
								"click"
								this.togglePause
							}}
						>
							<Icon @name="pause" />
							Pause
						</button>
						<button
							type="button"
							class="dt-sr-btn"
							{{on "click" this.stop}}
						>
							<Icon @name="square" />
							Stop
						</button>
					{{/if}}

					{{#if (eq this.status "paused")}}
						<button
							type="button"
							class="dt-sr-btn is-primary"
							{{on
								"click"
								this.togglePause
							}}
						>
							<Icon @name="play" />
							Resume
						</button>
						<button
							type="button"
							class="dt-sr-btn"
							{{on "click" this.stop}}
						>
							<Icon @name="square" />
							Stop
						</button>
					{{/if}}

					{{#if (eq this.status "finished")}}
						<button
							type="button"
							class="dt-sr-btn is-primary"
							{{on
								"click"
								this.togglePlay
							}}
						>
							<Icon
								@name={{if
									this.playing
									"pause"
									"play"
								}}
							/>
							{{if
								this.playing
								"Pause"
								"Play"
							}}
						</button>
						<button
							type="button"
							class="dt-sr-btn"
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel />
						</button>
						<button
							type="button"
							class="dt-sr-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					{{/if}}

					<span
						class="dt-sr-time"
					>{{this.elapsedLabel}}</span>
				</div>

				<div class="dt-sr-fields">
					<label class="dt-sr-field">
						<span>Microphone</span>
						<Switch
							@checked={{this.micMixIn}}
							@onChange={{this.setMicMixIn}}
							@label={{MIC_LABEL}}
						/>
					</label>
				</div>
				{{#if this.micMixIn}}
					<div class="dt-sr-fields">
						<label class="dt-sr-field">
							<span>Echo cancellation</span>
							<Switch
								@checked={{this.echoCancellation}}
								@onChange={{this.setEchoCancellation}}
								@label={{ECHO_LABEL}}
							/>
						</label>
						<label class="dt-sr-field">
							<span>Noise suppression</span>
							<Switch
								@checked={{this.noiseSuppression}}
								@onChange={{this.setNoiseSuppression}}
								@label={{NOISE_LABEL}}
							/>
						</label>
						<label class="dt-sr-field">
							<span>Auto gain</span>
							<Switch
								@checked={{this.autoGainControl}}
								@onChange={{this.setAutoGainControl}}
								@label={{GAIN_LABEL}}
							/>
						</label>
					</div>
				{{/if}}

				<div class="dt-sr-surface">
					{{#if (eq this.status "idle")}}
						<p
							class="dt-sr-hint"
						>{{EMPTY_HINT}}</p>
					{{/if}}

					{{#if (eq this.status "recording")}}
						{{! template-lint-disable require-media-caption }}
						<video
							class="dt-sr-live"
							autoplay
							muted
							playsinline
							{{this.registerLive}}
						></video>
					{{/if}}

					{{#if (eq this.status "finished")}}
						{{#if this.meta}}
							<p
								class="dt-sr-meta"
							>{{this.meta}}</p>
						{{/if}}
						{{! template-lint-disable require-media-caption }}
						<video
							class="dt-sr-video"
							controls
							playsinline
							preload="metadata"
							{{this.registerPlayback}}
							{{on
								"loadedmetadata"
								this.onVideoReady
							}}
							{{on
								"play"
								this.handlePlay
							}}
							{{on
								"pause"
								this.handlePause
							}}
							{{on
								"ended"
								this.handleEnded
							}}
						></video>
					{{/if}}
				</div>
			</div>

			{{#if this.error}}
				<p
					class="dt-sr-error"
					role="alert"
				>{{this.error}}</p>
			{{/if}}
			<p class="dt-sr-aside">Isn't it crazy that your browser
				can do this, by the way?</p>
		</div>
	</template>
}
