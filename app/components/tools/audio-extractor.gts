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
import { probeAudio, type AudioProbe } from 'delphitools-v2/lib/media-probe';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import { type WaveformPeaks } from 'delphitools-v2/lib/audio';
import {
	analyzeMedia,
	blankSections,
	sections,
	type Section,
} from 'delphitools-v2/lib/mediainfo';
import {
	AUDIO_TARGETS,
	audioTargetSupport,
	extractAudio,
	type AudioTarget,
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
const NO_AUDIO = 'No audio track detected';
const EXTRACT_ERROR = "Couldn't extract, try WAV format";
const BLANK_INFO = blankSections(['General', 'Audio']);
const formatLabels = AUDIO_TARGETS.map((t) => t.label);

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Extract = <template><IconSvg @name="file-audio" /></template>;

export default class AudioExtractor extends Component {
	intake = new VideoIntake({
		onLoad: (file) => this.#load(file),
		canLoad: () => !this.busy,
	});
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));
	playback = new Playback();

	@tracked probe: AudioProbe | null | undefined = undefined;
	@tracked support: Record<AudioTarget, boolean> | null = null;
	@tracked target: AudioTarget = 'wav';
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

	get silent() {
		return this.probe === null;
	}

	get playUrl() {
		return this.resultUrl || this.intake.url || undefined;
	}

	get targetIndex() {
		return AUDIO_TARGETS.findIndex((t) => t.id === this.target);
	}

	get unsupported() {
		return AUDIO_TARGETS.flatMap((t, index) =>
			(this.support?.[t.id] ?? t.id === 'wav') ? [] : [index],
		);
	}

	get ready() {
		return (
			!this.busy &&
			!!this.probe &&
			!this.unsupported.includes(this.targetIndex)
		);
	}

	get warning() {
		if (this.intake.error) return this.intake.error;
		if (this.silent) return NO_AUDIO;
		return '';
	}

	get detail() {
		const parts = [];
		if (this.intake.duration > 0)
			parts.push(
				formatTimestamp(
					this.intake.duration * 1000,
					'.',
				),
			);
		if (this.probe)
			parts.push(
				`${this.probe.codec ?? 'audio'} · ${this.probe.sampleRate} Hz`,
			);
		return parts.join(' · ');
	}

	get baseName() {
		return this.intake.baseName || 'audio';
	}

	get fileName() {
		return this.result ? `${this.baseName}.${this.result.ext}` : '';
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
		void (async () => {
			const probe = await probeAudio(file);
			if (!live()) return;
			this.probe = probe;
			if (!probe) return;
			void peaks(file).then((found) => {
				if (live()) this.peaks = found;
			});
			const support = await audioTargetSupport(probe.codec);
			if (live()) this.support = support;
		})();
	}

	metadata = (event: Event) => {
		if (!this.result) this.intake.ready(event);
		const video = event.target as HTMLVideoElement;
		if (video.videoWidth && video.videoHeight)
			this.aspect = video.videoWidth / video.videoHeight;
	};

	pickTarget = (index: number) => {
		const target = AUDIO_TARGETS[index]?.id;
		if (!target || target === this.target) return;
		this.target = target;
		this.failed = false;
		this.#releaseResult();
	};

	extract = () => void this.#extract();

	async #extract() {
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
			const result = await extractAudio(file, this.target, {
				signal: abort.signal,
				onProgress: (fraction) => {
					if (job === this.#job)
						this.progress = fraction;
				},
			});
			if (job !== this.#job) return;
			this.result = result;
			this.resultUrl = URL.createObjectURL(result.blob);
			void this.#describe(result, job);
		} catch (error) {
			if (job !== this.#job) return;
			if ((error as Error).name === 'AbortError') return;
			console.error('Extract failed:', error);
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
		this.probe = undefined;
		this.support = null;
		this.busy = false;
		this.progress = 0;
		this.failed = false;
	}

	clear = () => {
		this.playback.unload();
		this.#reset();
		this.intake.clear();
	};

	<template>
		<CanonSplit
			class="audio-extractor"
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
							class="ax-source"
							@title={{this.intake.fileName}}
							@detail={{this.detail}}
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
							class="ax-slot"
							@prompt="Drop a video file"
							@icon="film"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.intake.load}}
						/>
					{{/if}}
					{{#if this.warning}}
						<CanonStatus
							class="ax-warning"
							@text={{this.warning}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonHeading @text="Format" />
					<CanonSegmented
						class="ax-formats"
						@items={{formatLabels}}
						@columns={{2}}
						@selected={{this.targetIndex}}
						@disabledIndices={{this.unsupported}}
						@disabled={{this.busy}}
						@onChange={{this.pickTarget}}
					/>
					<Job
						@title="Extract"
						@icon={{Extract}}
						@failure={{EXTRACT_ERROR}}
						@disabled={{if
							this.ready
							false
							true
						}}
						@busy={{this.busy}}
						@progress={{this.progress}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.extract}}
						@onCancel={{this.cancel}}
						@onSave={{this.save}}
					/>
				</CanonRows>
				{{#if this.loaded}}
					{{! template-lint-disable require-media-caption }}
					<video
						src={{this.playUrl}}
						hidden
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
