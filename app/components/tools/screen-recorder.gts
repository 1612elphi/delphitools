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

export default class ScreenRecorderTool extends Component {
	@tracked status: 'idle' | 'recording' | 'paused' | 'finished' = 'idle';
	@tracked elapsedMs = 0;
	@tracked micMixIn = false;
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
		if (!navigator.mediaDevices?.getDisplayMedia) {
			this.error = UNSUPPORTED;
			return;
		}

		try {
			this.#displayStream =
				await navigator.mediaDevices.getDisplayMedia({
					video: true,
					audio: true,
				});
		} catch (err) {
			const name = (err as Error)?.name;
			// User cancelling the picker is NotAllowedError; do not treat as failure.
			if (
				name !== 'NotAllowedError' &&
				name !== 'AbortError'
			) {
				this.error = DISPLAY_FAILED;
			}
			return;
		}

		if (!this.#displayStream) return;

		const tracks = [...this.#displayStream.getTracks()];
		this.#micStream = null;

		if (this.micMixIn) {
			try {
				this.#micStream =
					await navigator.mediaDevices.getUserMedia(
						{
							audio: true,
						},
					);
				tracks.push(
					...this.#micStream.getAudioTracks(),
				);
			} catch {
				this.error = MIC_DENIED;
				// Continue without microphone audio.
			}
		}

		this.#combinedStream = new MediaStream(tracks);

		const candidates = [
			'video/webm;codecs=vp9,opus',
			'video/webm;codecs=vp8,opus',
			'video/webm',
		];
		const mimeType =
			candidates.find((t) =>
				MediaRecorder.isTypeSupported(t),
			) ?? '';
		this.#recorder = new MediaRecorder(
			this.#combinedStream,
			mimeType ? { mimeType } : undefined,
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
				// User stopped sharing from the browser chrome.
				this.stop();
			});

		this.elapsedMs = 0;
		this.#startedAt = performance.now();
		this.status = 'recording';
		this.#recorder.start(100);
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
		const recorder = this.#recorder;
		if (recorder) {
			// Detach first: callers (clear, willDestroy) discard the take,
			// so the async onstop must not finish it after the fact.
			recorder.ondataavailable = null;
			recorder.onstop = null;
			recorder.onpause = null;
			recorder.onresume = null;
			try {
				recorder.stop();
			} catch {
				// Already stopped or never started.
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
		if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
		this.videoUrl = null;
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
		// State bookkeeping lives in the recorder's onpause/onresume handlers.
		if (this.status === 'recording') this.#recorder?.pause();
		else if (this.status === 'paused') this.#recorder?.resume();
	};

	setMicMixIn = (value: boolean) => {
		this.micMixIn = value;
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
		if (this.#combinedStream) {
			video.srcObject = this.#combinedStream;
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
			video.src = '';
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
