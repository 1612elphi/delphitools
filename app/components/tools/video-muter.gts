import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonReadoutBand from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import {
	formatFps,
	type Container,
	type VideoProbe,
} from 'delphitools-v2/lib/media-probe';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import { type WaveformPeaks } from 'delphitools-v2/lib/audio';
import {
	analyzeMedia,
	blankSections,
	sections,
	type Section,
} from 'delphitools-v2/lib/mediainfo';
import {
	CONTAINERS,
	containerSupport,
	muteVideo,
	type ConvertResult,
} from 'delphitools-v2/lib/media-convert';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Playback from 'delphitools-v2/components/tools/media/playback';
import Sections from 'delphitools-v2/components/tools/media/sections';
import Slot from 'delphitools-v2/components/tools/media/slot';
import Strips, {
	bandHeight,
} from 'delphitools-v2/components/tools/media/strips';
import Transport from 'delphitools-v2/components/tools/media/transport';
import {
	peaks,
	release,
	thumbnails,
} from 'delphitools-v2/components/tools/media/frames';
import './media/media.css';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);
const NO_AUDIO = 'No audio track';
const MUTE_ERROR = "Couldn't remux. Try MP4, MOV or WEBM.";
const tallest = 1.25;
const tallestPreview = 340;
const containerLabels = CONTAINERS.map((c) => c.label);
const BLANK_INFO = blankSections(['General', 'Video']);

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Mute = <template><IconSvg @name="volume-x" /></template>;

export default class VideoMuter extends Component {
	intake = new VideoIntake({
		onLoad: (file) => this.#load(file),
		probe: true,
		onProbe: (probe) => void this.#support(probe),
		canLoad: () => !this.busy,
	});
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));
	playback = new Playback();

	@tracked support: Record<Container, boolean> | null = null;
	@tracked container: Container | '' = '';
	@tracked busy = false;
	@tracked progress = 0;
	@tracked failed = false;
	@tracked result: ConvertResult | null = null;
	@tracked resultUrl = '';
	@tracked frames: string[] = [];
	@tracked aspect = 16 / 9;
	@tracked peaks: WaveformPeaks | null = null;
	@tracked info: Section[] = [];

	#token = 0;
	#job = 0;
	#abort: AbortController | null = null;

	willDestroy() {
		super.willDestroy();
		this.#job++;
		this.#token++;
		this.#abort?.abort();
		this.intake.release();
		this.#releaseResult();
		release(this.frames);
	}

	get shownInfo() {
		return this.info.length ? this.info : BLANK_INFO;
	}

	get loaded() {
		return this.intake.url !== null;
	}

	get probe() {
		return this.intake.probe;
	}

	get silent() {
		return this.probe !== null && this.probe.audioTracks === 0;
	}

	get playUrl() {
		return this.resultUrl || this.intake.url || undefined;
	}

	get targetContainer(): Container {
		return this.container || this.probe?.container || 'mp4';
	}

	get containerIndex() {
		if (!this.container && !this.probe) return -1;
		return CONTAINERS.findIndex(
			(c) => c.id === this.targetContainer,
		);
	}

	get unsupported() {
		if (!this.loaded) return [];
		return CONTAINERS.flatMap((c, index) =>
			this.support?.[c.id] ? [] : [index],
		);
	}

	get ready() {
		return (
			!this.busy &&
			!this.silent &&
			this.support?.[this.targetContainer] === true
		);
	}

	get previewAspect() {
		return Math.max(this.aspect, 1 / tallest);
	}

	get warning() {
		if (this.intake.error) return this.intake.error;
		if (this.silent) return NO_AUDIO;
		return '';
	}

	get meta() {
		const p = this.probe;
		if (!p) return '';
		const parts = [`${p.width} × ${p.height}`];
		if (p.fps) parts.push(formatFps(p.fps));
		parts.push(formatTimestamp(this.intake.duration * 1000, '.'));
		parts.push(
			p.audioTracks === 1
				? '1 audio track'
				: `${p.audioTracks} audio tracks`,
		);
		return parts.join(' · ');
	}

	get baseName() {
		return this.intake.baseName || 'video';
	}

	get fileName() {
		return this.result
			? `${this.baseName}-muted.${this.result.ext}`
			: '';
	}

	get resultRow() {
		if (!this.result) return null;
		return {
			name: this.fileName,
			detail: `${this.result.ext} · ${formatBytes(this.result.blob.size)}`,
		};
	}

	#load(file: File) {
		this.#reset();
		const token = this.#token;
		const live = () => token === this.#token;
		void thumbnails(file, live).then((urls) => {
			if (!live()) return release(urls);
			this.frames = urls;
		});
	}

	async #support(probe: VideoProbe | null) {
		const token = this.#token;
		if (!probe) {
			this.failed = true;
			return;
		}
		if (probe.audioTracks > 0)
			void peaks(this.intake.file!).then((found) => {
				if (token === this.#token) this.peaks = found;
			});
		const support = await containerSupport(probe.codec);
		if (token !== this.#token) return;
		this.support = support;
		if (this.container && !support[this.container])
			this.container = '';
	}

	metadata = (event: Event) => {
		if (!this.result) this.intake.ready(event);
		const video = event.target as HTMLVideoElement;
		if (video.videoWidth && video.videoHeight)
			this.aspect = video.videoWidth / video.videoHeight;
	};

	pickContainer = (index: number) => {
		const id = CONTAINERS[index]?.id;
		if (!id || index === this.containerIndex) return;
		this.container = id;
		this.failed = false;
		this.#releaseResult();
	};

	mute = () => void this.#mute();

	async #mute() {
		const file = this.intake.file;
		if (!file || !this.ready) return;
		const job = ++this.#job;
		this.busy = true;
		this.progress = 0;
		this.failed = false;
		this.#releaseResult();
		this.playback.pause();
		const abort = new AbortController();
		this.#abort = abort;
		try {
			const result = await muteVideo(
				file,
				this.targetContainer,
				{
					signal: abort.signal,
					onProgress: (fraction) => {
						if (job === this.#job)
							this.progress =
								fraction;
					},
				},
			);
			if (job !== this.#job) return;
			this.result = result;
			this.resultUrl = URL.createObjectURL(result.blob);
			void this.#describe(result, job);
		} catch (error) {
			if (job !== this.#job) return;
			if ((error as Error).name === 'AbortError') return;
			console.error('Mute failed:', error);
			this.failed = true;
		} finally {
			if (this.#abort === abort) this.#abort = null;
			if (job === this.#job) this.busy = false;
		}
	}

	async #describe(result: ConvertResult, job: number) {
		try {
			const tracks = await analyzeMedia(
				new File([result.blob], this.fileName, {
					type: result.blob.type,
				}),
			);
			if (job === this.#job) this.info = sections(tracks);
		} catch {
			// no report: the sidebar stays empty
		}
	}

	cancel = () => {
		this.#job++;
		this.#abort?.abort();
		this.#abort = null;
		this.busy = false;
		this.progress = 0;
	};

	save = () => {
		if (this.result) downloadBlob(this.result.blob, this.fileName);
	};

	#releaseResult() {
		const url = this.resultUrl;
		this.resultUrl = '';
		if (url) setTimeout(() => URL.revokeObjectURL(url));
		this.result = null;
		this.info = [];
	}

	#reset() {
		this.#token++;
		this.#job++;
		this.#abort?.abort();
		this.#abort = null;
		this.#releaseResult();
		release(this.frames);
		this.frames = [];
		this.peaks = null;
		this.support = null;
		this.busy = false;
		this.progress = 0;
		this.failed = false;
	}

	clear = () => {
		this.playback.unload();
		this.#reset();
		this.container = '';
		this.aspect = 16 / 9;
		this.intake.clear();
	};

	<template>
		<CanonSplit
			class="video-muter"
			@bannerSticks={{true}}
			@mainLeadsStacked={{true}}
			{{filePaste this.intake.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas @height={{bandHeight}}>
					<CanonReadoutBand
						@transport={{this.playback.transport}}
						@idle={{if
							this.intake.duration
							this.intake.duration
							null
						}}
						@readout="below"
					>
						<Strips
							@thumbnails={{this.frames}}
							@aspect={{this.aspect}}
							@waveform={{true}}
							@peaks={{this.peaks}}
							@audioRemoved={{if
								this.result
								true
								false
							}}
							@duration={{this.intake.duration}}
							@playhead={{this.playback.playhead}}
							@onScrub={{this.playback.scrub}}
							@blank={{if
								this.loaded
								false
								true
							}}
						/>
					</CanonReadoutBand>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<Sections @sections={{this.shownInfo}} />
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="vm-source"
							@title={{this.intake.fileName}}
							@detail={{if
								this.warning
								this.warning
								this.meta
							}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<Slot
							class="vm-slot"
							@prompt="Drop a video here"
							@icon="volume-x"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.intake.load}}
						/>
						{{#if this.warning}}
							<CanonStatus
								@text={{this.warning}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					{{/if}}
				</CanonRows>
				<CanonCanvas
					class="vm-preview
						{{unless
							this.loaded
							'vm-preview--blank'
						}}"
					@aspect={{this.previewAspect}}
					@maxHeight={{tallestPreview}}
					@boxing="unlessWide"
					@background={{if
						this.loaded
						"#000"
						"var(--canon-muted)"
					}}
				>
					{{#if this.loaded}}
						{{! template-lint-disable require-media-caption }}
						<video
							class="vm-video"
							src={{this.playUrl}}
							playsinline
							preload="metadata"
							{{this.intake.register}}
							{{this.playback.register}}
							{{on
								"loadedmetadata"
								this.metadata
							}}
							{{on
								"error"
								this.intake.failed
							}}
						></video>
					{{/if}}
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Container" />
					<CanonSegmented
						class="vm-containers"
						@items={{containerLabels}}
						@selected={{this.containerIndex}}
						@disabledIndices={{this.unsupported}}
						@disabled={{this.busy}}
						@onChange={{this.pickContainer}}
					/>
					<Job
						@title="Mute"
						@icon={{Mute}}
						@failure={{MUTE_ERROR}}
						@disabled={{if
							this.ready
							false
							true
						}}
						@busy={{this.busy}}
						@progress={{this.progress}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.mute}}
						@onCancel={{this.cancel}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:main>
			<:footer>
				<Transport
					@playback={{this.playback}}
					@ready={{if
						this.intake.duration
						true
						false
					}}
				/>
			</:footer>
		</CanonSplit>
	</template>
}
