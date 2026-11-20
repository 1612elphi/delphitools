import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
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
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import Playback from 'delphitools-v2/components/tools/media/playback';
import {
	RecorderBand,
	RecorderTransport,
} from 'delphitools-v2/components/tools/media/recorder';
import Strips, {
	bandHeight,
} from 'delphitools-v2/components/tools/media/strips';
import './media/media.css';
import './voice-recorder/voice-recorder.css';

const EMPTY_HINT = 'Allow microphone access to start recording.';
const MIC_DENIED = 'Microphone access was denied. Check browser permissions.';
const NO_MIC = 'No microphone was found on this device.';
const UNSUPPORTED = 'Recording is not supported in this browser.';

const overviewHeight = 96;
const noFrames: string[] = [];

interface Take {
	id: number;
	blob: Blob;
	url: string;
	name: string;
	detail: string;
	peaks: number[];
	duration: number;
}

const PlayIcon = <template><IconSvg @name="play" /></template>;
const StopIcon = <template><IconSvg @name="square" /></template>;
const TrashIcon = <template><IconSvg @name="trash-2" /></template>;
const SaveIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;

function clock(seconds: number) {
	const total = Math.round(seconds);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default class VoiceRecorder extends Component {
	capture = new Capture();
	playback = new Playback();

	@tracked takes: Take[] = [];
	@tracked current: Take | null = null;
	@tracked devices: MediaDeviceInfo[] = [];
	@tracked deviceId = '';
	@tracked error = '';

	#recorder: MediaRecorder | null = null;
	#stream: MediaStream | null = null;
	#starting = false;
	#ids = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		void this.#refreshDevices();
		const query = new URLSearchParams(window.location.search);
		if (query.has('recStart'))
			void this.#record().then(() => {
				const seconds = Number(query.get('recStop'));
				if (seconds > 0)
					setTimeout(() => {
						if (!this.isDestroyed)
							this.stop();
					}, seconds * 1000);
			});
	}

	willDestroy() {
		super.willDestroy();
		const recorder = this.#recorder;
		if (recorder) {
			recorder.ondataavailable = null;
			recorder.onstop = null;
			if (recorder.state !== 'inactive') recorder.stop();
		}
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.capture.stop();
		this.playback.unload();
		for (const take of this.takes) URL.revokeObjectURL(take.url);
	}

	get loaded() {
		return this.current ? [this.current] : [];
	}

	@cached
	get overview() {
		return this.current
			? overview(this.current.peaks, peakBuckets)
			: null;
	}

	get asksFirst() {
		return (
			!this.error &&
			!this.devices.some((device) => device.label)
		);
	}

	get choosesInput() {
		return this.devices.length > 1;
	}

	get deviceLabels() {
		return this.devices.map((device) => device.label);
	}

	get deviceIndex() {
		const index = this.devices.findIndex(
			(device) => device.deviceId === this.deviceId,
		);
		return index < 0 ? undefined : index;
	}

	get newest() {
		return this.takes[0];
	}

	isPlaying = (take: Take) =>
		this.current === take && this.playback.active;

	async #refreshDevices() {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		const devices = (
			await navigator.mediaDevices.enumerateDevices()
		).filter((d) => d.kind === 'audioinput' && d.deviceId);
		if (this.isDestroyed) return;
		this.devices = devices;
		if (!devices.some((d) => d.deviceId === this.deviceId))
			this.deviceId = devices[0]?.deviceId ?? '';
	}

	chooseInput = (index: number) => {
		const device = this.devices[index];
		if (device) this.deviceId = device.deviceId;
	};

	record = () => void this.#record();

	async #record() {
		if (this.capture.active || this.#starting) return;
		this.error = '';
		if (
			!navigator.mediaDevices?.getUserMedia ||
			typeof MediaRecorder === 'undefined'
		) {
			this.error = UNSUPPORTED;
			return;
		}
		this.playback.stop();
		this.#starting = true;
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: this.deviceId
					? { deviceId: { exact: this.deviceId } }
					: true,
			});
		} catch (err) {
			this.#starting = false;
			if (this.isDestroyed) return;
			this.error =
				(err as Error)?.name === 'NotFoundError'
					? NO_MIC
					: MIC_DENIED;
			return;
		}
		this.#starting = false;
		if (this.isDestroyed) {
			stream.getTracks().forEach((track) => track.stop());
			return;
		}
		void this.#refreshDevices();

		const mimeType = MediaRecorder.isTypeSupported(
			'audio/webm;codecs=opus',
		)
			? 'audio/webm;codecs=opus'
			: 'audio/webm';
		let recorder: MediaRecorder;
		try {
			recorder = new MediaRecorder(stream, { mimeType });
		} catch {
			stream.getTracks().forEach((track) => track.stop());
			this.error = UNSUPPORTED;
			return;
		}
		const chunks: Blob[] = [];
		let ended = { peaks: [] as number[], duration: 0 };
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = () => {
			stream.getTracks().forEach((track) => track.stop());
			if (this.isDestroyed || chunks.length === 0) return;
			this.#keep(
				new Blob(chunks, {
					type: recorder.mimeType || 'audio/webm',
				}),
				ended.peaks,
				ended.duration,
			);
		};
		this.#finish = () => {
			ended = this.capture.stop();
			this.#finish = null;
			this.#recorder = null;
			this.#stream = null;
			if (recorder.state !== 'inactive') recorder.stop();
		};
		this.#stream = stream;
		this.#recorder = recorder;
		recorder.start(100);
		this.capture.start(stream);
	}

	#finish: (() => void) | null = null;

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

	#keep(blob: Blob, peaks: number[], duration: number) {
		const date = new Date();
		const stamp = date.toISOString().replace(/[:.]/g, '-');
		const take: Take = {
			id: ++this.#ids,
			blob,
			url: URL.createObjectURL(blob),
			name: `voice-recording-${stamp}`,
			detail: `${clock(duration)} · ${date.toLocaleString(
				undefined,
				{ dateStyle: 'medium', timeStyle: 'short' },
			)}`,
			peaks,
			duration,
		};
		this.playback.unload();
		this.takes = [take, ...this.takes];
		this.current = take;
	}

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

	#queued: Take | null = null;

	playQueued = modifier((_element: HTMLAudioElement, [take]: [Take]) => {
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
		setTimeout(() => URL.revokeObjectURL(take.url));
	};

	<template>
		<CanonSplit
			class="voice-recorder"
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
							class="vr-error"
							@text={{this.error}}
							@tone="warn"
							@row={{true}}
						/>
					{{else if this.asksFirst}}
						<CanonStatus
							class="vr-hint"
							@text={{EMPTY_HINT}}
							@tone="muted"
							@row={{true}}
						/>
					{{/if}}
					{{#if this.choosesInput}}
						<CanonRow
							class="vr-input"
							@title="Input"
							@form="flush"
							as |titleId|
						>
							<CanonMenuCell
								@items={{this.deviceLabels}}
								@selected={{this.deviceIndex}}
								@labelledBy={{titleId}}
								@disabled={{this.capture.active}}
								@onChange={{this.chooseInput}}
							/>
						</CanonRow>
					{{/if}}
					<CanonHeading @text="Takes" />
					{{#each this.takes key="id" as |take|}}
						<div
							class="vr-take
								{{if
									(this.isPlaying
										take
									)
									'vr-take--playing'
								}}"
						>
							<CanonButton
								class="vr-take-play"
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
								class="vr-take-text"
							>
								<span
									class="vr-take-name"
								>{{take.name}}</span>
								<span
									class="vr-take-detail"
								>{{take.detail}}</span>
							</div>
							<CanonButton
								class="vr-take-save"
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
								class="vr-take-delete"
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
								class="vr-pass"
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
			</:sidebar>
			<:main>
				{{#if this.current}}
					<CanonCanvas
						class="vr-overview"
						@height={{overviewHeight}}
						@background="var(--canon-muted)"
					>
						<Strips
							@thumbnails={{noFrames}}
							@waveform={{true}}
							@peaks={{this.overview}}
							@duration={{this.current.duration}}
							@playhead={{this.playback.playhead}}
							@onScrub={{this.playback.scrub}}
						/>
					</CanonCanvas>
					{{#each this.loaded key="id" as |take|}}
						{{! template-lint-disable require-media-caption }}
						<audio
							class="vr-player"
							src={{take.url}}
							preload="auto"
							{{this.playback.register}}
							{{this.playQueued take}}
						></audio>
					{{/each}}
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
					@onRecord={{this.record}}
					@onStop={{this.stop}}
					@onPause={{this.togglePause}}
				/>
			</:footer>
		</CanonSplit>
	</template>
}
