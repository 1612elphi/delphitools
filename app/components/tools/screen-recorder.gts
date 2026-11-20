import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	capturing,
	downloadIcon,
	passAlong,
} from 'delphitools-v2/lib/flow-hooks';
import {
	Capture,
	overview,
} from 'delphitools-v2/components/tools/media/capture';
import {
	peakBuckets,
	release,
	thumbnails,
} from 'delphitools-v2/components/tools/media/frames';
import Playback from 'delphitools-v2/components/tools/media/playback';
import {
	RecorderBand,
	RecorderTransport,
} from 'delphitools-v2/components/tools/media/recorder';
import Strips, {
	bandHeight,
} from 'delphitools-v2/components/tools/media/strips';
import './media/media.css';
import './screen-recorder/screen-recorder.css';

const EMPTY_HINT = 'Choose a screen, window or tab to start recording.';
const DISPLAY_FAILED = 'Screen sharing failed. Check browser permissions.';
const MIC_DENIED =
	'Microphone access was denied, so audio will not be mixed in.';
const UNSUPPORTED = 'Screen recording is not supported in this browser.';
const MIC_LABEL = 'Mix in microphone audio';
const ASIDE = "Isn't it crazy that your browser can do this, by the way?";

const overviewHeight = 96;
const tallest = 1.25;
const tallestPreview = 480;

const isCancel = (err: unknown) => {
	const name = (err as Error)?.name;
	return name === 'NotAllowedError' || name === 'AbortError';
};

function clock(seconds: number) {
	const total = Math.round(seconds);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

class Take {
	@tracked width = 0;
	@tracked height = 0;
	@tracked frames: string[] = [];
	date = new Date();
	url: string;
	name: string;

	constructor(
		readonly id: number,
		readonly blob: Blob,
		readonly peaks: number[],
		readonly duration: number,
		readonly audio: boolean,
	) {
		this.url = URL.createObjectURL(blob);
		this.name = `screen-recording-${this.date.toISOString().replace(/[:.]/g, '-')}`;
	}

	get aspect() {
		return this.width && this.height
			? this.width / this.height
			: 16 / 9;
	}

	get detail() {
		const parts = [clock(this.duration)];
		if (this.width) parts.push(`${this.width} × ${this.height}`);
		parts.push(
			this.date.toLocaleString(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}),
		);
		return parts.join(' · ');
	}
}

const PlayIcon = <template><IconSvg @name="play" /></template>;
const StopIcon = <template><IconSvg @name="square" /></template>;
const TrashIcon = <template><IconSvg @name="trash-2" /></template>;
const SaveIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;

export default class ScreenRecorder extends Component {
	capture = new Capture();
	playback = new Playback();

	@tracked takes: Take[] = [];
	@tracked current: Take | null = null;
	@tracked micMixIn = false;
	@tracked echoCancellation = false;
	@tracked noiseSuppression = false;
	@tracked autoGainControl = false;
	@tracked error = '';
	@tracked starting = false;
	@tracked liveSize: [number, number] = [0, 0];

	#recorder: MediaRecorder | null = null;
	#display: MediaStream | null = null;
	#mic: MediaStream | null = null;
	#mix: AudioContext | null = null;
	#finish: (() => void) | null = null;
	#queued: Take | null = null;
	#ids = 0;

	willDestroy() {
		super.willDestroy();
		const recorder = this.#recorder;
		if (recorder) {
			recorder.ondataavailable = null;
			recorder.onstop = null;
			if (recorder.state !== 'inactive') recorder.stop();
		}
		this.#release();
		this.capture.stop();
		this.playback.unload();
		for (const take of this.takes) {
			URL.revokeObjectURL(take.url);
			release(take.frames);
		}
	}

	get loaded() {
		return this.current && !this.capture.active
			? [this.current]
			: [];
	}

	get previewAspect() {
		const aspect = this.capture.active
			? this.liveSize[0] / this.liveSize[1] || 16 / 9
			: (this.current?.aspect ?? 16 / 9);
		return Math.max(aspect, 1 / tallest);
	}

	get previewBackground() {
		return this.capture.active || this.current
			? '#000'
			: 'var(--canon-muted)';
	}

	@cached
	get overview() {
		return this.current?.audio
			? overview(this.current.peaks, peakBuckets)
			: null;
	}

	get newest() {
		return this.takes[0];
	}

	isPlaying = (take: Take) =>
		this.current === take && this.playback.active;

	record = () => void this.#record();

	async #record() {
		if (this.capture.active || this.starting) return;
		this.error = '';
		if (
			!navigator.mediaDevices?.getDisplayMedia ||
			typeof MediaRecorder === 'undefined'
		) {
			this.error = UNSUPPORTED;
			return;
		}
		this.playback.stop();
		this.starting = true;
		try {
			await this.#open();
		} finally {
			this.starting = false;
		}
	}

	async #open() {
		let display: MediaStream;
		try {
			try {
				display =
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
				if (isCancel(err)) throw err;
				display =
					await navigator.mediaDevices.getDisplayMedia(
						{ video: true, audio: true },
					);
			}
		} catch (err) {
			if (!isCancel(err) && !this.isDestroyed)
				this.error = DISPLAY_FAILED;
			return;
		}
		if (this.isDestroyed) {
			display.getTracks().forEach((track) => track.stop());
			return;
		}
		this.#display = display;

		if (this.micMixIn) {
			try {
				this.#mic =
					await navigator.mediaDevices.getUserMedia(
						{
							audio: this.#micConstraints(),
						},
					);
			} catch {
				this.error = MIC_DENIED;
			}
		}
		if (this.isDestroyed) {
			this.#release();
			return;
		}

		const video = display.getVideoTracks()[0];
		const tracks: MediaStreamTrack[] = video ? [video] : [];
		const audio = [
			...display.getAudioTracks(),
			...(this.#mic?.getAudioTracks() ?? []),
		];
		if (audio.length) {
			try {
				const context = new AudioContext({
					sampleRate: 48000,
				});
				this.#mix = context;
				if (context.state === 'suspended')
					await context.resume();
				if (this.isDestroyed) {
					this.#release();
					return;
				}
				const destination =
					context.createMediaStreamDestination();
				for (const track of audio)
					context.createMediaStreamSource(
						new MediaStream([track]),
					).connect(destination);
				const mixed =
					destination.stream.getAudioTracks()[0];
				tracks.push(...(mixed ? [mixed] : audio));
			} catch {
				tracks.push(...audio);
			}
		}
		const stream = new MediaStream(tracks);

		const hasAudio = tracks.some((track) => track.kind === 'audio');
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
		const mimeType = candidates.find((type) => {
			try {
				return MediaRecorder.isTypeSupported(type);
			} catch {
				return false;
			}
		});
		let recorder: MediaRecorder;
		try {
			recorder = new MediaRecorder(stream, {
				...(mimeType ? { mimeType } : {}),
				...(hasAudio
					? { audioBitsPerSecond: 128000 }
					: {}),
				videoBitsPerSecond: 2500000,
			});
		} catch {
			this.#release();
			this.error = UNSUPPORTED;
			return;
		}

		const chunks: Blob[] = [];
		let ended = { peaks: [] as number[], duration: 0 };
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = () => {
			if (this.isDestroyed || chunks.length === 0) return;
			this.#keep(
				new Blob(chunks, {
					type: recorder.mimeType || 'video/webm',
				}),
				ended.peaks,
				ended.duration,
				hasAudio,
			);
		};
		this.#finish = () => {
			ended = this.capture.stop();
			this.#finish = null;
			this.#recorder = null;
			if (recorder.state !== 'inactive') recorder.stop();
			this.#release();
		};
		video?.addEventListener('ended', this.stop);
		this.#recorder = recorder;
		this.liveSize = [0, 0];
		recorder.start(100);
		this.capture.start(stream);
	}

	#micConstraints() {
		return {
			echoCancellation: { ideal: this.echoCancellation },
			noiseSuppression: { ideal: this.noiseSuppression },
			autoGainControl: { ideal: this.autoGainControl },
		};
	}

	#release() {
		this.#display?.getTracks().forEach((track) => track.stop());
		this.#mic?.getTracks().forEach((track) => track.stop());
		this.#display = null;
		this.#mic = null;
		void this.#mix?.close().catch(() => {});
		this.#mix = null;
	}

	stop = () => this.#finish?.();

	togglePause = () => {
		const recorder = this.#recorder;
		if (!recorder) return;
		if (this.capture.state === 'recording') {
			recorder.pause();
			this.capture.pause();
		} else {
			recorder.resume();
			this.capture.resume();
		}
	};

	#keep(blob: Blob, peaks: number[], duration: number, audio: boolean) {
		const take = new Take(
			++this.#ids,
			blob,
			peaks,
			duration,
			audio,
		);
		[take.width, take.height] = this.liveSize;
		this.playback.unload();
		this.takes = [take, ...this.takes];
		this.current = take;
		void thumbnails(blob, () => this.takes.includes(take)).then(
			(urls) => {
				if (this.takes.includes(take))
					take.frames = urls;
				else release(urls);
			},
		);
	}

	setMicMixIn = (on: boolean) => (this.micMixIn = on);

	#applyMic() {
		for (const track of this.#mic?.getAudioTracks() ?? [])
			void track
				.applyConstraints(this.#micConstraints())
				.catch(() => {});
	}

	setEchoCancellation = (on: boolean) => {
		this.echoCancellation = on;
		this.#applyMic();
	};

	setNoiseSuppression = (on: boolean) => {
		this.noiseSuppression = on;
		this.#applyMic();
	};

	setAutoGainControl = (on: boolean) => {
		this.autoGainControl = on;
		this.#applyMic();
	};

	live = modifier((video: HTMLVideoElement) => {
		const track = this.#display?.getVideoTracks()[0];
		if (track) {
			video.srcObject = new MediaStream([track]);
			void video.play().catch(() => {});
		}
		return () => {
			video.srcObject = null;
		};
	});

	liveMetadata = (event: Event) => {
		const video = event.target as HTMLVideoElement;
		if (video.videoWidth && video.videoHeight)
			this.liveSize = [video.videoWidth, video.videoHeight];
	};

	takeMetadata = (take: Take, event: Event) => {
		const video = event.target as HTMLVideoElement;
		take.width = video.videoWidth;
		take.height = video.videoHeight;
	};

	play = (take: Take) => {
		if (this.capture.active) return;
		if (this.current === take) {
			if (this.playback.active) this.playback.stop();
			else this.playback.play();
			return;
		}
		this.playback.unload();
		this.#queued = take;
		this.current = take;
	};

	playQueued = modifier((_element: HTMLVideoElement, [take]: [Take]) => {
		if (this.#queued !== take) return;
		this.#queued = null;
		queueMicrotask(() => {
			if (this.current === take) this.playback.play();
		});
	});

	save = (take: Take) => downloadBlob(take.blob, `${take.name}.webm`);

	passNewest = () => {
		if (this.newest) this.save(this.newest);
	};

	remove = (take: Take) => {
		if (this.current === take) {
			this.playback.unload();
			this.current =
				this.takes.find((other) => other !== take) ??
				null;
		}
		this.takes = this.takes.filter((other) => other !== take);
		release(take.frames);
		setTimeout(() => URL.revokeObjectURL(take.url));
	};

	<template>
		<CanonSplit
			class="screen-recorder"
			@bannerSticks={{true}}
			@mainLeadsStacked={{true}}
		>
			<:banner>
				<CanonCanvas @height={{bandHeight}}>
					<RecorderBand
						@capture={{this.capture}}
						@playback={{this.playback}}
						@take={{this.current}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					{{#if this.error}}
						<CanonStatus
							class="sr-error"
							@text={{this.error}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonRow
						class="sr-mic"
						@title="Microphone"
						@detail={{MIC_LABEL}}
						as |titleId|
					>
						<CanonSwitch
							aria-labelledby={{titleId}}
							@on={{this.micMixIn}}
							@disabled={{this.capture.active}}
							@onChange={{this.setMicMixIn}}
						/>
					</CanonRow>
					{{#if this.micMixIn}}
						<CanonRow
							class="sr-echo"
							@title="Echo cancellation"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.echoCancellation}}
								@onChange={{this.setEchoCancellation}}
							/>
						</CanonRow>
						<CanonRow
							class="sr-noise"
							@title="Noise suppression"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.noiseSuppression}}
								@onChange={{this.setNoiseSuppression}}
							/>
						</CanonRow>
						<CanonRow
							class="sr-gain"
							@title="Auto gain"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.autoGainControl}}
								@onChange={{this.setAutoGainControl}}
							/>
						</CanonRow>
					{{/if}}
					<CanonHeading @text="Takes" />
					{{#each this.takes key="id" as |take|}}
						<div
							class="sr-take
								{{if
									(this.isPlaying
										take
									)
									'sr-take--playing'
								}}"
						>
							<CanonButton
								class="sr-take-play"
								@kind="cell"
								@label={{if
									(this.isPlaying
										take
									)
									"Stop"
									"Play"
								}}
								@icon={{if
									(this.isPlaying
										take
									)
									StopIcon
									PlayIcon
								}}
								@disabled={{this.capture.active}}
								@onClick={{fn
									this.play
									take
								}}
							/>
							<div
								class="sr-take-text"
							>
								<span
									class="sr-take-name"
								>{{take.name}}</span>
								<span
									class="sr-take-detail"
								>{{take.detail}}</span>
							</div>
							<CanonButton
								class="sr-take-save"
								@kind="cell"
								@label={{passAlong
									"Download"
								}}
								@icon={{SaveIcon}}
								@onClick={{fn
									this.save
									take
								}}
							/>
							<CanonButton
								class="sr-take-delete"
								@kind="cell"
								@label="Delete"
								@icon={{TrashIcon}}
								@onClick={{fn
									this.remove
									take
								}}
							/>
						</div>
					{{else}}
						<CanonEmptyRow
							@text="No takes"
						/>
					{{/each}}
					{{#if (capturing)}}
						{{#if this.newest}}
							<CanonButton
								class="sr-pass"
								@kind="primary"
								@text={{passAlong
									"Download"
								}}
								@icon={{SaveIcon}}
								@onClick={{this.passNewest}}
							/>
						{{/if}}
					{{/if}}
				</CanonRows>
				<p class="sr-aside">{{ASIDE}}</p>
			</:sidebar>
			<:main>
				<CanonCanvas
					class="sr-preview"
					@aspect={{this.previewAspect}}
					@maxHeight={{tallestPreview}}
					@boxing="unlessWide"
					@background={{this.previewBackground}}
				>
					{{#if this.capture.active}}
						{{! template-lint-disable require-media-caption }}
						<video
							class="sr-video sr-live"
							autoplay
							muted
							playsinline
							{{this.live}}
							{{on
								"loadedmetadata"
								this.liveMetadata
							}}
							{{on
								"resize"
								this.liveMetadata
							}}
						></video>
					{{else if this.current}}
						{{#each
							this.loaded key="id"
							as |take|
						}}
							{{! template-lint-disable require-media-caption }}
							<video
								class="sr-video sr-player"
								src={{take.url}}
								playsinline
								preload="auto"
								{{this.playback.register}}
								{{this.playQueued
									take
								}}
								{{on
									"loadedmetadata"
									(fn
										this.takeMetadata
										take
									)
								}}
							></video>
						{{/each}}
					{{else}}
						<button
							type="button"
							class="media-slot sr-slot"
							disabled={{this.starting}}
							{{on
								"click"
								this.record
							}}
						>
							<span
								class="media-slot-icon"
							><IconSvg
									@name="monitor-up"
								/></span>
							<span
								class="media-slot-prompt"
							>{{EMPTY_HINT}}</span>
						</button>
					{{/if}}
				</CanonCanvas>
				{{#if this.current}}
					{{#unless this.capture.active}}
						<CanonCanvas
							class="sr-overview"
							@height={{overviewHeight}}
							@background="var(--canon-muted)"
						>
							<Strips
								@thumbnails={{this.current.frames}}
								@aspect={{this.current.aspect}}
								@waveform={{this.current.audio}}
								@peaks={{this.overview}}
								@duration={{this.current.duration}}
								@playhead={{this.playback.playhead}}
								@onScrub={{this.playback.scrub}}
							/>
						</CanonCanvas>
					{{/unless}}
				{{/if}}
			</:main>
			<:footer>
				<RecorderTransport
					@capture={{this.capture}}
					@playback={{this.playback}}
					@duration={{if
						this.current
						this.current.duration
						0
					}}
					@recordText="Share screen"
					@disabled={{this.starting}}
					@onRecord={{this.record}}
					@onStop={{this.stop}}
					@onPause={{this.togglePause}}
				/>
			</:footer>
		</CanonSplit>
	</template>
}
