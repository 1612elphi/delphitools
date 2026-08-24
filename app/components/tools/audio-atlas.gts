import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import WaveMinimap from 'delphitools-v2/components/wave-minimap';
import {
	AudioIntake,
	audioContext,
	channelsOf,
	drawWaveform,
	extractPeaks,
	fftMagnitudes,
	integratedLufs,
	peakDb,
	ViewWindow,
} from 'delphitools-v2/lib/audio';
import { probeAudio, type AudioProbe } from 'delphitools-v2/lib/media-probe';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import filePaste from 'delphitools-v2/modifiers/file-paste';

const ACCEPT = acceptAttr(AUDIO_ACCEPT);

const DROP_TITLE = 'Drop an audio file here or click to upload';

const PEAK_BUCKETS = 1000;
const FFT_SIZE = 1024;
const SPECTRO_MAX_COLUMNS = 800;
const SPECTRO_ROWS = 256;
const SPECTRO_FLOOR_DB = -90;
const COLUMNS_PER_FRAME = 24;

interface MetaRow {
	label: string;
	value: string;
}

function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

function spectroPalette(): Uint8ClampedArray {
	const lut = new Uint8ClampedArray(256 * 3);
	const stops: [number, number, number][] = [
		[16, 18, 16],
		[46, 125, 50],
		[240, 255, 240],
	];
	for (let i = 0; i < 256; i++) {
		const t = i / 255;
		const seg = t < 0.5 ? 0 : 1;
		const local = (t - seg * 0.5) * 2;
		for (let c = 0; c < 3; c++)
			lut[i * 3 + c] =
				stops[seg]![c]! +
				(stops[seg + 1]![c]! - stops[seg]![c]!) * local;
	}
	return lut;
}

export default class AudioAtlasTool extends Component {
	@tracked lufs: number | null = null;
	@tracked playing = false;
	@tracked looping = false;
	@tracked playheadS = 0;

	view = new ViewWindow();

	#spectroToken = 0;
	#source: AudioBufferSourceNode | null = null;
	#pausedAt = 0;
	#startOffset = 0;
	#startedCtxTime = 0;
	#rafId = 0;

	@tracked source: AudioProbe | null = null;

	intake = new AudioIntake({
		onLoad: (file) => {
			this.source = null;
			void this.#probeSource(file);
		},
		onDecoded: (buffer) => {
			this.view.reset(buffer.duration);
			this.#resetPlayback();
			void this.#measureLoudness(buffer);
		},
	});

	willDestroy() {
		super.willDestroy();
		this.#spectroToken++;
		this.#resetPlayback();
	}

	get duration() {
		return this.intake.buffer?.duration ?? 0;
	}

	#resetPlayback() {
		this.#pause();
		this.#pausedAt = 0;
		this.playheadS = 0;
		this.looping = false;
	}

	#position(): number {
		const source = this.#source;
		if (!source) return this.#pausedAt;
		const elapsed =
			audioContext().currentTime - this.#startedCtxTime;
		let position = this.#startOffset + elapsed;
		if (source.loop && source.loopEnd > source.loopStart) {
			const a = source.loopStart;
			const b = source.loopEnd;
			if (position > b)
				position = a + ((position - a) % (b - a));
		}
		return Math.min(position, this.duration);
	}

	#tick = () => {
		if (!this.playing) return;
		this.playheadS = this.#position();
		this.#rafId = requestAnimationFrame(this.#tick);
	};

	#pause() {
		cancelAnimationFrame(this.#rafId);
		const source = this.#source;
		if (!source) {
			this.playing = false;
			return;
		}
		this.#pausedAt = this.#position();
		this.playheadS = this.#pausedAt;

		this.#source = null;
		source.onended = null;
		source.stop();
		this.playing = false;
	}

	#play() {
		const buffer = this.intake.buffer;
		if (!buffer) return;
		const ctx = audioContext();
		void ctx.resume();

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);

		let offset = Math.min(this.#pausedAt, buffer.duration);
		if (this.looping) {
			source.loop = true;
			source.loopStart = this.view.start;
			source.loopEnd = this.view.end;
			if (offset < this.view.start || offset >= this.view.end)
				offset = this.view.start;
		}

		source.onended = () => {
			if (this.#source === source) {
				this.#source = null;
				this.playing = false;
				this.#pausedAt = 0;
				this.playheadS = 0;
			}
		};
		this.#source = source;
		this.#startOffset = offset;
		this.#startedCtxTime = ctx.currentTime;
		this.playing = true;
		source.start(0, offset);
		this.#rafId = requestAnimationFrame(this.#tick);
	}

	togglePlay = () => {
		if (this.playing) this.#pause();
		else this.#play();
	};

	toggleLoop = () => {
		this.looping = !this.looping;
		if (this.playing) {
			this.#pause();
			this.#play();
		}
	};

	seek = (event: MouseEvent) => {
		if (!this.duration) return;
		const element = event.currentTarget as HTMLElement;
		const rect = element.getBoundingClientRect();
		const x = Math.min(
			rect.width,
			Math.max(0, event.clientX - rect.left),
		);
		const time =
			this.view.start + (x / rect.width) * this.view.span;

		const wasPlaying = this.playing;
		if (wasPlaying) this.#pause();
		this.#pausedAt = time;
		this.playheadS = time;
		if (wasPlaying) this.#play();
	};

	clear = () => {
		this.#resetPlayback();
		this.intake.clear();
	};

	get playheadMiniStyle() {
		if (!this.duration) return null;
		const pct = (this.playheadS / this.duration) * 100;
		return htmlSafe(`left: ${pct.toFixed(3)}%`);
	}

	get playheadViewStyle() {
		if (!this.duration) return null;
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

	async #probeSource(file: File) {
		const probe = await probeAudio(file);
		if (this.isDestroyed || this.intake.file !== file) return;
		this.source = probe;
	}

	async #measureLoudness(buffer: AudioBuffer) {
		this.lufs = null;
		// defer loudness scan.
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.isDestroyed || this.intake.buffer !== buffer) return;
		this.lufs = integratedLufs(
			channelsOf(buffer),
			buffer.sampleRate,
		);
	}

	// cache full-buffer peak.
	@cached
	get peak(): number {
		const buffer = this.intake.buffer;
		return buffer ? peakDb(channelsOf(buffer)) : -Infinity;
	}

	@cached
	get rows(): MetaRow[] {
		const buffer = this.intake.buffer;
		if (!buffer) return [];
		const format =
			this.intake.fileType ||
			this.intake.fileName.split('.').pop()?.toUpperCase() ||
			'';
		const source = this.source;
		const peak = this.peak;
		const lufs = this.lufs;

		return [
			{
				label: 'Duration',
				value: `${buffer.duration.toFixed(2)} s`,
			},
			{
				label: 'Sample rate',
				value:
					source &&
					source.sampleRate !== buffer.sampleRate
						? `${source.sampleRate} Hz (decoded at ${buffer.sampleRate})`
						: `${source?.sampleRate ?? buffer.sampleRate} Hz`,
			},
			...(source?.codec
				? [{ label: 'Codec', value: source.codec }]
				: []),
			{
				label: 'Channels',
				value: `${buffer.numberOfChannels}`,
			},
			{
				label: 'File size',
				value: formatBytes(this.intake.fileBytes),
			},
			{ label: 'Format', value: format },
			{
				label: 'Peak',
				value:
					peak === -Infinity
						? '-∞ dBFS'
						: `${peak.toFixed(1)} dBFS`,
			},
			{
				label: 'Loudness',
				value:
					lufs === null
						? '…'
						: Number.isNaN(lufs)
							? '—'
							: `${lufs.toFixed(1)} LUFS`,
			},
		];
	}

	@cached
	get peaks() {
		const buffer = this.intake.buffer;
		if (!buffer) return null;
		return extractPeaks(channelsOf(buffer), PEAK_BUCKETS);
	}

	#viewChannels(): Float32Array[] | null {
		const buffer = this.intake.buffer;
		if (!buffer) return null;
		const from = Math.floor(this.view.start * buffer.sampleRate);
		const to = Math.max(
			from + 2,
			Math.ceil(this.view.end * buffer.sampleRate),
		);
		return channelsOf(buffer).map((channel) =>
			channel.subarray(from, to),
		);
	}

	@cached
	get viewPeaks() {
		const channels = this.#viewChannels();
		if (!channels) return null;
		return extractPeaks(channels, PEAK_BUCKETS);
	}

	drawWave = modifier((canvas: HTMLCanvasElement) => {
		const render = () => {
			const peaks = this.viewPeaks;
			const dpr = window.devicePixelRatio || 1;
			canvas.width = canvas.clientWidth * dpr;
			canvas.height = canvas.clientHeight * dpr;
			const ctx = canvas.getContext('2d');
			if (!ctx || !peaks) return;
			ctx.fillStyle =
				getComputedStyle(canvas).getPropertyValue(
					'--primary',
				);
			drawWaveform(ctx, peaks, canvas.width, canvas.height);
		};
		render();
		const observer = new ResizeObserver(render);
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	drawSpectrogram = modifier((canvas: HTMLCanvasElement) => {
		const buffer = this.intake.buffer;
		if (!buffer) return;
		const token = ++this.#spectroToken;

		const sampleRate = buffer.sampleRate;
		const from = Math.floor(this.view.start * sampleRate);
		const to = Math.min(
			buffer.length,
			Math.max(
				from + FFT_SIZE,
				Math.ceil(this.view.end * sampleRate),
			),
		);
		const channels = channelsOf(buffer);
		const mono = new Float32Array(to - from);
		for (const channel of channels)
			for (let i = 0; i < mono.length; i++)
				mono[i]! +=
					channel[from + i]! / channels.length;

		const hop = Math.max(
			FFT_SIZE / 8,
			Math.floor(
				(mono.length - FFT_SIZE) / SPECTRO_MAX_COLUMNS,
			),
		);
		const columns = Math.max(
			1,
			Math.floor((mono.length - FFT_SIZE) / hop) + 1,
		);

		canvas.width = columns;
		canvas.height = SPECTRO_ROWS;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const lut = spectroPalette();
		const window_ = new Float32Array(FFT_SIZE);
		for (let i = 0; i < FFT_SIZE; i++)
			window_[i] =
				0.5 *
				(1 -
					Math.cos(
						(2 * Math.PI * i) /
							(FFT_SIZE - 1),
					));

		const block = new Float32Array(FFT_SIZE);
		const binsPerRow = FFT_SIZE / 2 / SPECTRO_ROWS;
		let column = 0;

		const paintSome = () => {
			if (token !== this.#spectroToken) return;
			const image = ctx.createImageData(
				Math.min(COLUMNS_PER_FRAME, columns - column),
				SPECTRO_ROWS,
			);

			for (
				let batch = 0;
				batch < image.width;
				batch++, column++
			) {
				const offset = column * hop;
				for (let i = 0; i < FFT_SIZE; i++)
					block[i] =
						mono[offset + i]! * window_[i]!;
				const magnitudes = fftMagnitudes(block);

				for (let row = 0; row < SPECTRO_ROWS; row++) {
					const bin = Math.floor(
						(SPECTRO_ROWS - 1 - row) *
							binsPerRow,
					);
					const db =
						20 *
						Math.log10(
							magnitudes[bin]! +
								1e-12,
						);
					const t = Math.min(
						1,
						Math.max(
							0,
							1 -
								db /
									SPECTRO_FLOOR_DB,
						),
					);
					const index = Math.round(t * 255) * 3;
					const px =
						(row * image.width + batch) * 4;
					image.data[px] = lut[index]!;
					image.data[px + 1] = lut[index + 1]!;
					image.data[px + 2] = lut[index + 2]!;
					image.data[px + 3] = 255;
				}
			}

			ctx.putImageData(image, column - image.width, 0);
			if (column < columns) requestAnimationFrame(paintSome);
		};

		requestAnimationFrame(paintSome);
		return () => {
			this.#spectroToken++;
		};
	});

	<template>
		<div class="dt-aa" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-aa-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				{{#unless this.intake.fileName}}
					<label class="dt-aa-drop">
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
							class="dt-aa-drop-title"
						>{{DROP_TITLE}}</span>
					</label>
				{{/unless}}

				{{#if this.intake.busy}}
					<p class="dt-aa-status">
						<NdsLoader />
						Decoding…
					</p>
				{{/if}}

				{{#if this.intake.buffer}}
					<div class="dt-aa-bar">
						<p
							class="dt-aa-name"
						>{{this.intake.fileName}}</p>
						<button
							type="button"
							class="dt-aa-btn"
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
							class="dt-aa-btn
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
							Loop A–B
						</button>
						<button
							type="button"
							class="dt-aa-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>

					<dl class="dt-aa-meta">
						{{#each
							this.rows key="label"
							as |row|
						}}
							<div class="dt-aa-cell">
								<dt
								>{{row.label}}</dt>
								<dd
								>{{row.value}}</dd>
							</div>
						{{/each}}
					</dl>

					<div class="dt-aa-panel">
						<div class="dt-aa-panel-head">
							<h3
								class="dt-aa-panel-title"
							>Waveform</h3>
							{{#if
								this.view.isZoomed
							}}
								<span
									class="dt-aa-view"
								>{{this.view.label}}</span>
							{{/if}}
							<div class="dt-aa-zoom">
								<button
									type="button"
									class="dt-aa-zoom-btn"
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
									class="dt-aa-zoom-btn"
									aria-label="Zoom in"
									{{on
										"click"
										this.view.zoomIn
									}}
								>
									<Icon
										@name="zoom-in"
									/>
								</button>
								<button
									type="button"
									class="dt-aa-zoom-btn"
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
							</div>
						</div>
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
							{{! keyboard controls available }}
							{{! template-lint-disable no-invalid-interactive }}
							<canvas
								class="dt-aa-wave"
								{{this.drawWave}}
								{{on
									"click"
									this.seek
								}}
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
					</div>

					<div class="dt-aa-panel">
						<h3
							class="dt-aa-panel-title"
						>Spectrogram</h3>
						<div class="dt-wavewrap">
							{{! keyboard controls available }}
							{{! template-lint-disable no-invalid-interactive }}
							<canvas
								class="dt-aa-spectro"
								{{this.drawSpectrogram}}
								{{on
									"click"
									this.seek
								}}
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
					</div>
				{{/if}}
			</div>

			{{#if this.intake.error}}
				<p
					class="dt-aa-error"
					role="alert"
				>{{this.intake.error}}</p>
			{{/if}}
		</div>
	</template>
}
