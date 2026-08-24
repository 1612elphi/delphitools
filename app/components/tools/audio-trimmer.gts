import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import WaveMinimap from 'delphitools-v2/components/wave-minimap';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	applyFades,
	AudioIntake,
	audioContext,
	channelsOf,
	drawWaveform,
	encodeWav,
	extractPeaks,
	ViewWindow,
} from 'delphitools-v2/lib/audio';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import filePaste from 'delphitools-v2/modifiers/file-paste';

const ACCEPT = acceptAttr(AUDIO_ACCEPT);

const DROP_TITLE = 'Drop an audio file here or click to upload';

const PEAK_BUCKETS = 800;
const MIN_SELECTION_S = 0.01;

export default class AudioTrimmerTool extends Component {
	@tracked startS = 0;
	@tracked endS = 0;
	@tracked fadeInS = 0;
	@tracked fadeOutS = 0;
	@tracked playing = false;
	@tracked looping = false;
	@tracked playheadS: number | null = null;

	view = new ViewWindow();

	#source: AudioBufferSourceNode | null = null;
	#dragging = false;
	#rafId = 0;
	#startedCtxTime = 0;
	#playedFromS = 0;
	#playedSpanS = 0;

	intake = new AudioIntake({
		onDecoded: (buffer) => {
			this.startS = 0;
			this.endS = Math.floor(buffer.duration * 100) / 100;
			this.fadeInS = 0;
			this.fadeOutS = 0;
			this.view.reset(buffer.duration);
		},
	});

	willDestroy() {
		super.willDestroy();
		this.#stopSource();
	}

	get duration() {
		return this.intake.buffer?.duration ?? 0;
	}

	get meta() {
		const buffer = this.intake.buffer;
		if (!buffer) return '';
		return `${buffer.duration.toFixed(2)} s · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} ch`;
	}

	get selectionLabel() {
		const from = Math.min(this.startS, this.endS);
		const to = Math.max(this.startS, this.endS);
		return `${from.toFixed(2)} – ${to.toFixed(2)} s · ${(to - from).toFixed(2)} s`;
	}

	@cached
	get peaks() {
		const buffer = this.intake.buffer;
		if (!buffer) return null;
		return extractPeaks(channelsOf(buffer), PEAK_BUCKETS);
	}

	// subarrays avoid copies
	@cached
	get viewPeaks() {
		const buffer = this.intake.buffer;
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

	drawWave = modifier(
		(
			canvas: HTMLCanvasElement,
			_positional: [],
			named: { start: number; end: number },
		) => {
			const render = () => {
				const peaks = this.viewPeaks;
				const dpr = window.devicePixelRatio || 1;
				const width = canvas.clientWidth * dpr;
				const height = canvas.clientHeight * dpr;
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				if (!ctx || !peaks) return;

				const styles = getComputedStyle(canvas);
				ctx.clearRect(0, 0, width, height);
				ctx.fillStyle =
					styles.getPropertyValue('--primary');
				drawWaveform(ctx, peaks, width, height);

				const toX = (time: number) =>
					Math.min(
						width,
						Math.max(
							0,
							((time -
								this.view
									.start) /
								this.view
									.span) *
								width,
						),
					);
				const from = toX(
					Math.min(named.start, named.end),
				);
				const to = toX(
					Math.max(named.start, named.end),
				);
				ctx.fillStyle =
					styles.getPropertyValue(
						'--muted-foreground',
					);
				ctx.globalAlpha = 0.55;
				ctx.fillRect(0, 0, from, height);
				ctx.fillRect(to, 0, width - to, height);
				ctx.globalAlpha = 1;
			};

			render();
			const observer = new ResizeObserver(render);
			observer.observe(canvas);
			return () => observer.disconnect();
		},
	);

	#timeAt(canvas: HTMLCanvasElement, clientX: number): number {
		const rect = canvas.getBoundingClientRect();
		const x = Math.min(
			rect.width,
			Math.max(0, clientX - rect.left),
		);
		const time =
			this.view.start + (x / rect.width) * this.view.span;
		return Math.round(time * 1000) / 1000;
	}

	pointerDown = (event: PointerEvent) => {
		if (!this.duration) return;
		const canvas = event.currentTarget as HTMLCanvasElement;
		canvas.setPointerCapture(event.pointerId);
		this.#dragging = true;
		this.startS = this.#timeAt(canvas, event.clientX);
		this.endS = this.startS;
	};

	pointerMove = (event: PointerEvent) => {
		if (!this.#dragging) return;
		const canvas = event.currentTarget as HTMLCanvasElement;
		this.endS = this.#timeAt(canvas, event.clientX);
	};

	pointerUp = () => {
		if (!this.#dragging) return;
		this.#dragging = false;
		if (Math.abs(this.endS - this.startS) < MIN_SELECTION_S) {
			this.startS = 0;
			this.endS = this.duration;
		}
	};

	#number = (event: Event) =>
		parseFloat((event.target as HTMLInputElement).value);

	setStart = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value))
			this.startS = Math.max(
				0,
				Math.min(this.duration, value),
			);
	};

	setEnd = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value))
			this.endS = Math.max(0, Math.min(this.duration, value));
	};

	setFadeIn = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value)) this.fadeInS = Math.max(0, value);
	};

	setFadeOut = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value)) this.fadeOutS = Math.max(0, value);
	};

	#selectionChannels(): {
		channels: Float32Array<ArrayBuffer>[];
		sampleRate: number;
	} | null {
		const buffer = this.intake.buffer;
		if (!buffer) return null;
		const sampleRate = buffer.sampleRate;
		const from = Math.floor(
			Math.min(this.startS, this.endS) * sampleRate,
		);
		const to = Math.min(
			buffer.length,
			Math.ceil(
				Math.max(this.startS, this.endS) * sampleRate,
			),
		);
		if (to - from < 1) return null;

		// copytochannel requires arraybuffer
		const channels = channelsOf(buffer).map(
			(channel) =>
				new Float32Array(channel.subarray(from, to)),
		);
		applyFades(channels, sampleRate, this.fadeInS, this.fadeOutS);
		return { channels, sampleRate };
	}

	#stopSource() {
		cancelAnimationFrame(this.#rafId);
		this.#source?.stop();
		this.#source = null;
		this.playing = false;
		this.playheadS = null;
	}

	#tick = () => {
		if (!this.playing || this.#playedSpanS <= 0) return;
		const elapsed =
			audioContext().currentTime - this.#startedCtxTime;
		this.playheadS =
			this.#playedFromS + (elapsed % this.#playedSpanS);
		this.#rafId = requestAnimationFrame(this.#tick);
	};

	toggleLoop = () => {
		this.looping = !this.looping;
		// loop changes avoid restart
		if (this.#source) this.#source.loop = this.looping;
	};

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

	togglePlay = () => {
		if (this.playing) {
			this.#stopSource();
			return;
		}
		const selection = this.#selectionChannels();
		if (!selection) return;

		const ctx = audioContext();
		void ctx.resume();
		const buffer = ctx.createBuffer(
			selection.channels.length,
			selection.channels[0]!.length,
			selection.sampleRate,
		);
		selection.channels.forEach((channel, i) =>
			buffer.copyToChannel(channel, i),
		);

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.loop = this.looping;
		source.connect(ctx.destination);
		source.onended = () => {
			if (this.#source === source) {
				this.#source = null;
				this.playing = false;
				this.playheadS = null;
			}
		};
		this.#source = source;
		this.playing = true;
		this.#playedFromS = Math.min(this.startS, this.endS);
		this.#playedSpanS = buffer.duration;
		this.#startedCtxTime = ctx.currentTime;
		this.playheadS = this.#playedFromS;
		source.start();
		this.#rafId = requestAnimationFrame(this.#tick);
	};

	exportWav = () => {
		const selection = this.#selectionChannels();
		if (!selection) return;
		downloadBlob(
			new Blob(
				[
					encodeWav(
						selection.channels,
						selection.sampleRate,
					),
				],
				{ type: 'audio/wav' },
			),
			`${this.intake.baseName || 'audio'}-trimmed.wav`,
		);
	};

	clear = () => {
		this.#stopSource();
		this.looping = false;
		this.intake.clear();
	};

	<template>
		<div class="dt-at" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-at-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				{{#unless this.intake.fileName}}
					<label class="dt-at-drop">
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.intake.chooseFile
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-at-drop-title"
						>{{DROP_TITLE}}</span>
					</label>
				{{/unless}}

				{{#if this.intake.busy}}
					<p class="dt-at-status">
						<NdsLoader />
						Decoding…
					</p>
				{{/if}}

				{{#if this.intake.buffer}}
					<div class="dt-at-bar">
						<div class="dt-at-info">
							<p
								class="dt-at-name"
							>{{this.intake.fileName}}</p>
							<p
								class="dt-at-meta"
							>{{this.meta}}</p>
						</div>
						<button
							type="button"
							class="dt-at-btn"
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
							class="dt-at-btn
								{{if
									this.looping
									'is-active'
								}}"
							aria-pressed={{if
								this.looping
								"true"
								"false"
							}}
							{{on
								"click"
								this.toggleLoop
							}}
						>
							<Icon @name="repeat" />
							Loop
						</button>
						<button
							type="button"
							class="dt-at-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-at-btn is-primary"
							{{on
								"click"
								this.exportWav
							}}
						>
							<DownloadLabel
								@label="Export WAV"
							/>
						</button>
					</div>

					<div class="dt-at-fields">
						<label class="dt-at-field">
							<span>Start (s)</span>
							<input
								type="number"
								min="0"
								step="0.01"
								value={{this.startS}}
								{{on
									"input"
									this.setStart
								}}
							/>
						</label>
						<label class="dt-at-field">
							<span>End (s)</span>
							<input
								type="number"
								min="0"
								step="0.01"
								value={{this.endS}}
								{{on
									"input"
									this.setEnd
								}}
							/>
						</label>
						<label class="dt-at-field">
							<span>Fade in (s)</span>
							<input
								type="number"
								min="0"
								step="0.1"
								value={{this.fadeInS}}
								{{on
									"input"
									this.setFadeIn
								}}
							/>
						</label>
						<label class="dt-at-field">
							<span>Fade out (s)</span>
							<input
								type="number"
								min="0"
								step="0.1"
								value={{this.fadeOutS}}
								{{on
									"input"
									this.setFadeOut
								}}
							/>
						</label>
					</div>

					<div class="dt-at-viewbar">
						<button
							type="button"
							class="dt-at-zoom-btn"
							aria-label="Zoom out"
							{{on
								"click"
								this.view.zoomOut
							}}
						>
							<Icon
								@name="zoom-out"
							/>
						</button>
						<button
							type="button"
							class="dt-at-zoom-btn"
							aria-label="Zoom in"
							{{on
								"click"
								this.view.zoomIn
							}}
						>
							<Icon @name="zoom-in" />
						</button>
						<button
							type="button"
							class="dt-at-zoom-btn"
							aria-label="Reset zoom"
							{{on
								"click"
								this.view.fit
							}}
						>
							<Icon
								@name="maximize"
							/>
						</button>
						{{#if this.view.isZoomed}}
							<span
								class="dt-at-view"
							>{{this.view.label}}</span>
						{{/if}}
					</div>

					{{#if this.peaks}}
						<div class="dt-wavewrap">
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
						{{! drag selection needs the down event; the
							start/end fields are the keyboard path }}
						{{! template-lint-disable no-pointer-down-event-binding }}
						<canvas
							class="dt-at-wave"
							{{this.drawWave
								start=this.startS
								end=this.endS
							}}
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
						></canvas>
						{{#if this.playheadViewStyle}}
							<span
								class="dt-playhead"
								style={{this.playheadViewStyle}}
							></span>
						{{/if}}
					</div>

					<p
						class="dt-at-selection"
					>{{this.selectionLabel}}</p>
				{{/if}}
			</div>

			{{#if this.intake.error}}
				<p
					class="dt-at-error"
					role="alert"
				>{{this.intake.error}}</p>
			{{/if}}
		</div>
	</template>
}
