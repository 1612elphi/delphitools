import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { eq, gt, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import WaveMinimap from 'delphitools-v2/components/wave-minimap';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	audioContext,
	channelsOf,
	drawWaveform,
	extractPeaks,
	meterLevel,
	ViewWindow,
} from 'delphitools-v2/lib/audio';

const EMPTY_HINT = 'Allow microphone access to start recording.';

const MIC_DENIED = 'Microphone access was denied. Check browser permissions.';

const NO_MIC = 'No microphone was found on this device.';

const UNSUPPORTED = 'Recording is not supported in this browser.';

const PEAK_BUCKETS = 800;

export default class VoiceRecorderTool extends Component {
	@tracked status: 'idle' | 'recording' | 'paused' | 'finished' = 'idle';
	@tracked elapsedMs = 0;
	@tracked meter = 0;
	@tracked audioBlob: Blob | null = null;
	@tracked audioUrl: string | null = null;
	@tracked audioBuffer: AudioBuffer | null = null;
	@tracked devices: MediaDeviceInfo[] = [];
	@tracked selectedDeviceId = '';
	@tracked error = '';
	@tracked playing = false;
	@tracked playheadS: number | null = 0;

	view = new ViewWindow();

	#recorder: MediaRecorder | null = null;
	#stream: MediaStream | null = null;
	#analyser: AnalyserNode | null = null;
	#monitor: MediaStreamAudioSourceNode | null = null;
	#source: AudioBufferSourceNode | null = null;
	#chunks: Blob[] = [];
	#startedAt = 0;
	#pausedAt = 0;
	#playStartedAt = 0;
	#rafId = 0;
	#meterData: Uint8Array<ArrayBuffer> | null = null;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		// Enumerate upfront: with a previously granted permission the picker
		// is populated before the first take. Pre-permission entries have
		// empty deviceIds and are dropped; the refresh in start fills them in.
		void this.#refreshDevices();
	}

	willDestroy() {
		super.willDestroy();
		this.#stopPlayback();
		this.#stopRecording();
		this.#releaseTake();
	}

	get elapsedLabel() {
		const total = Math.floor(this.elapsedMs / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	get isRecordingOrPaused() {
		return this.status === 'recording' || this.status === 'paused';
	}

	get meterStyle() {
		return htmlSafe(`width: ${(this.meter * 100).toFixed(1)}%`);
	}

	get duration() {
		return this.audioBuffer?.duration ?? 0;
	}

	get playheadMiniStyle() {
		if (this.playheadS === null || !this.duration) return null;
		const pct = (this.playheadS / this.duration) * 100;
		return htmlSafe(`left: ${pct.toFixed(3)}%`);
	}

	get playheadViewStyle() {
		if (this.playheadS === null || !this.duration) return null;
		if (
			this.playheadS < this.view.start ||
			this.playheadS > this.view.end
		)
			return null;
		const pct =
			((this.playheadS - this.view.start) / this.view.span) *
			100;
		return htmlSafe(`left: ${pct.toFixed(3)}%`);
	}

	@cached
	get peaks() {
		const buffer = this.audioBuffer;
		if (!buffer) return null;
		return extractPeaks(channelsOf(buffer), PEAK_BUCKETS);
	}

	@cached
	get viewPeaks() {
		const buffer = this.audioBuffer;
		if (!buffer) return null;
		const from = Math.floor(this.view.start * buffer.sampleRate);
		const to = Math.max(
			from + 2,
			Math.ceil(this.view.end * buffer.sampleRate),
		);
		return extractPeaks(
			channelsOf(buffer).map((channel) =>
				channel.subarray(from, to),
			),
			PEAK_BUCKETS,
		);
	}

	#tickMeter = () => {
		if (
			!this.#analyser ||
			!this.#meterData ||
			this.status !== 'recording'
		)
			return;
		this.#analyser.getByteTimeDomainData(this.#meterData);
		this.meter = meterLevel(this.#meterData);
		this.elapsedMs = performance.now() - this.#startedAt;
		this.#rafId = requestAnimationFrame(this.#tickMeter);
	};

	#tickPlayhead = () => {
		if (!this.playing) return;
		const ctx = audioContext();
		this.playheadS = Math.min(
			this.duration,
			ctx.currentTime - this.#playStartedAt,
		);
		if (this.playheadS >= this.duration) {
			this.#stopPlayback();
			return;
		}
		this.#rafId = requestAnimationFrame(this.#tickPlayhead);
	};

	async #refreshDevices() {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		const devices = (
			await navigator.mediaDevices.enumerateDevices()
		).filter((d) => d.kind === 'audioinput' && d.deviceId);
		this.devices = devices;
		if (!this.selectedDeviceId && devices.length > 0)
			this.selectedDeviceId = devices[0]!.deviceId;
	}

	start = async () => {
		this.error = '';
		if (!navigator.mediaDevices?.getUserMedia) {
			this.error = UNSUPPORTED;
			return;
		}

		try {
			const constraints: MediaStreamConstraints = {
				audio: this.selectedDeviceId
					? {
							deviceId: {
								exact: this
									.selectedDeviceId,
							},
						}
					: true,
			};
			this.#stream =
				await navigator.mediaDevices.getUserMedia(
					constraints,
				);
			await this.#refreshDevices();
		} catch (err) {
			const name = (err as Error)?.name;
			this.error =
				name === 'NotFoundError' ? NO_MIC : MIC_DENIED;
			return;
		}

		if (!this.#stream) return;
		const ctx = audioContext();
		void ctx.resume();

		this.#monitor = ctx.createMediaStreamSource(this.#stream);
		this.#analyser = ctx.createAnalyser();
		this.#analyser.fftSize = 256;
		this.#meterData = new Uint8Array(
			this.#analyser.frequencyBinCount,
		);
		this.#monitor.connect(this.#analyser);

		const mimeType = MediaRecorder.isTypeSupported(
			'audio/webm;codecs=opus',
		)
			? 'audio/webm;codecs=opus'
			: 'audio/webm';
		this.#recorder = new MediaRecorder(this.#stream, { mimeType });
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
			this.#rafId = requestAnimationFrame(this.#tickMeter);
		};

		this.elapsedMs = 0;
		this.#startedAt = performance.now();
		this.status = 'recording';
		this.#recorder.start(100);
		this.#rafId = requestAnimationFrame(this.#tickMeter);
	};

	async #onStop() {
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
		this.#monitor?.disconnect();
		this.#monitor = null;
		this.#analyser = null;
		this.#meterData = null;
		this.meter = 0;
		cancelAnimationFrame(this.#rafId);

		if (this.#chunks.length === 0) {
			this.#recorder = null;
			this.status = 'idle';
			return;
		}

		const blob = new Blob(this.#chunks, {
			type: this.#recorder?.mimeType || 'audio/webm',
		});
		this.#recorder = null;
		await this.#finishTake(blob);
	}

	async #finishTake(blob: Blob) {
		this.audioBlob = blob;
		this.audioUrl = URL.createObjectURL(blob);
		try {
			const buffer = await audioContext().decodeAudioData(
				await blob.arrayBuffer(),
			);
			this.audioBuffer = buffer;
			this.view.reset(buffer.duration);
		} catch {
			this.audioBuffer = null;
		}
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
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
		this.#monitor?.disconnect();
		this.#monitor = null;
		this.#analyser = null;
		this.#meterData = null;
		this.meter = 0;
		cancelAnimationFrame(this.#rafId);
	}

	#releaseTake() {
		this.#stopPlayback();
		if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
		this.audioUrl = null;
		this.audioBlob = null;
		this.audioBuffer = null;
		this.elapsedMs = 0;
		this.playheadS = 0;
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

	#stopPlayback() {
		cancelAnimationFrame(this.#rafId);
		const source = this.#source;
		if (source) {
			source.onended = null;
			try {
				source.stop();
			} catch {
				// Already stopped.
			}
			this.#source = null;
		}
		this.playing = false;
		this.playheadS = 0;
	}

	togglePlay = () => {
		if (this.playing) {
			this.#stopPlayback();
			return;
		}
		const buffer = this.audioBuffer;
		if (!buffer) return;
		const ctx = audioContext();
		void ctx.resume();
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		source.onended = () => {
			if (this.#source === source) this.#stopPlayback();
		};
		this.#source = source;
		this.playing = true;
		this.#playStartedAt = ctx.currentTime;
		this.playheadS = 0;
		source.start();
		this.#rafId = requestAnimationFrame(this.#tickPlayhead);
	};

	clear = () => {
		this.#stopRecording();
		this.#releaseTake();
		this.status = 'idle';
		this.error = '';
	};

	download = () => {
		if (this.audioBlob) {
			const stamp = new Date()
				.toISOString()
				.replace(/[:.]/g, '-');
			downloadBlob(
				this.audioBlob,
				`voice-recording-${stamp}.webm`,
			);
		}
	};

	setDevice = (event: Event) => {
		this.selectedDeviceId = (
			event.target as HTMLSelectElement
		).value;
	};

	drawWave = modifier((canvas: HTMLCanvasElement) => {
		const render = () => {
			const peaks = this.viewPeaks;
			const dpr = window.devicePixelRatio || 1;
			const width = canvas.clientWidth * dpr;
			const height = canvas.clientHeight * dpr;
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx || !peaks) return;
			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle =
				getComputedStyle(canvas).getPropertyValue(
					'--primary',
				);
			drawWaveform(ctx, peaks, width, height);
		};
		render();
		const observer = new ResizeObserver(render);
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	<template>
		<div class="dt-vr">
			<div class="dt-vr-frame">
				<div class="dt-vr-bar">
					{{#if (eq this.status "idle")}}
						<button
							type="button"
							class="dt-vr-btn is-primary"
							{{on
								"click"
								this.start
							}}
						>
							<Icon @name="mic" />
							Record
						</button>
					{{/if}}

					{{#if (eq this.status "recording")}}
						<button
							type="button"
							class="dt-vr-btn"
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
							class="dt-vr-btn"
							{{on "click" this.stop}}
						>
							<Icon @name="square" />
							Stop
						</button>
					{{/if}}

					{{#if (eq this.status "paused")}}
						<button
							type="button"
							class="dt-vr-btn is-primary"
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
							class="dt-vr-btn"
							{{on "click" this.stop}}
						>
							<Icon @name="square" />
							Stop
						</button>
					{{/if}}

					{{#if (eq this.status "finished")}}
						<button
							type="button"
							class="dt-vr-btn is-primary"
							disabled={{not
								this.audioBuffer
							}}
							{{on
								"click"
								this.togglePlay
							}}
						>
							<Icon
								@name={{if
									this.playing
									"square"
									"play"
								}}
							/>
							{{if
								this.playing
								"Stop"
								"Play"
							}}
						</button>
						<button
							type="button"
							class="dt-vr-btn"
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name="download"
							/>
							Download
						</button>
						<button
							type="button"
							class="dt-vr-btn"
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
						class="dt-vr-time"
					>{{this.elapsedLabel}}</span>
				</div>

				{{#if (gt this.devices.length 1)}}
					<div class="dt-vr-fields">
						<label class="dt-vr-field">
							<span>Input</span>
							<select
								{{on
									"change"
									this.setDevice
								}}
								disabled={{this.isRecordingOrPaused}}
							>
								{{#each
									this.devices
									key="deviceId"
									as |device|
								}}
									<option
										value={{device.deviceId}}
										selected={{eq
											device.deviceId
											this.selectedDeviceId
										}}
									>{{device.label}}</option>
								{{/each}}
							</select>
						</label>
					</div>
				{{/if}}

				<div class="dt-vr-surface">
					{{#if (eq this.status "idle")}}
						<p
							class="dt-vr-hint"
						>{{EMPTY_HINT}}</p>
					{{/if}}

					{{#if (eq this.status "recording")}}
						<div
							class="dt-vr-meter"
							aria-label="Input level"
						>
							<span
								class="dt-vr-meter-fill"
								style={{this.meterStyle}}
							></span>
						</div>
					{{/if}}

					{{#if (eq this.status "finished")}}
						{{#if this.peaks}}
							<div
								class="dt-wavewrap"
							>
								<WaveMinimap
									@peaks={{this.peaks}}
									@duration={{this.view.duration}}
									@viewStart={{this.view.start}}
									@viewEnd={{this.view.end}}
									@onView={{this.view.set}}
								/>
								{{#if
									this.playheadMiniStyle
								}}
									<span
										class="dt-playhead"
										style={{this.playheadMiniStyle}}
									></span>
								{{/if}}
							</div>
						{{/if}}
						<div class="dt-wavewrap">
							<canvas
								class="dt-vr-wave"
								{{this.drawWave}}
							></canvas>
							{{#if
								this.playheadViewStyle
							}}
								<span
									class="dt-playhead"
									style={{this.playheadViewStyle}}
								></span>
							{{/if}}
						</div>
					{{/if}}
				</div>
			</div>

			{{#if this.error}}
				<p
					class="dt-vr-error"
					role="alert"
				>{{this.error}}</p>
			{{/if}}
		</div>
	</template>
}
