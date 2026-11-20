import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonGrid from 'delphicanon/components/canon-grid';
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
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import { VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import {
	formatFps,
	type Container,
	type VideoProbe,
} from 'delphitools-v2/lib/media-probe';
import {
	analyzeMedia,
	sections,
	type Section,
} from 'delphitools-v2/lib/mediainfo';
import {
	CONTAINERS,
	containerSupport,
	trimVideo,
	type TrimResult,
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
import Trim, {
	type TrimEdge,
} from 'delphitools-v2/components/tools/media/trim';
import {
	clampSpan,
	minimumSpan,
} from 'delphitools-v2/components/tools/media/trim-span';
import {
	release,
	thumbnails,
} from 'delphitools-v2/components/tools/media/frames';
import './media/media.css';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);
const TRIM_ERROR = "Couldn't process. Try MP4, MOV or WEBM";
const tc = (seconds: number) => formatTimestamp(seconds * 1000, '.');

const editorHeight = 72;
const tallest = 1.25;
const tallestPreview = 340;
const DASH = '—';
const containerLabels = CONTAINERS.map((c) => c.label);

type Mode = 'keyframe' | 'exact';
const MODES: Mode[] = ['keyframe', 'exact'];
const modeLabels = ['Keyframe', 'Exact'];

function presetCut(): [number, number] | null {
	if (typeof window === 'undefined') return null;
	const cut = (
		new URLSearchParams(window.location.search).get('vtrimCut') ??
		''
	)
		.split(',')
		.map(Number);
	return cut.length === 2 && cut.every(Number.isFinite)
		? [cut[0]!, cut[1]!]
		: null;
}

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Scissors = <template><IconSvg @name="scissors" /></template>;
const SetIn = <template><IconSvg @name="arrow-right-to-line" /></template>;
const SetOut = <template><IconSvg @name="arrow-left-to-line" /></template>;
const Back = <template><IconSvg @name="chevron-left" /></template>;
const Forward = <template><IconSvg @name="chevron-right" /></template>;

export default class VideoTrimmer extends Component {
	intake = new VideoIntake({
		onLoad: (file) => this.#load(file),
		onReady: () => this.#ready(),
		probe: true,
		onProbe: (probe) => void this.#support(probe),
		canLoad: () => !this.busy,
	});
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));
	playback = new Playback();

	@tracked start = 0;
	@tracked end = 0;
	@tracked mode: Mode = 'keyframe';
	@tracked support: Record<Container, boolean> | null = null;
	@tracked container: Container | '' = '';
	@tracked busy = false;
	@tracked progress = 0;
	@tracked failed = false;
	@tracked result: TrimResult | null = null;
	@tracked resultUrl = '';
	@tracked frames: string[] = [];
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

	get loaded() {
		return this.intake.url !== null;
	}

	get duration() {
		return this.intake.duration;
	}

	get selected() {
		return this.duration > 0 && this.end > this.start;
	}

	get aspect() {
		const { width, height } = this.intake;
		return width && height ? width / height : 16 / 9;
	}

	get previewAspect() {
		return Math.max(this.aspect, 1 / tallest);
	}

	get selection(): [number, number] | null {
		return this.selected ? [this.start, this.end] : null;
	}

	get startMax() {
		return Math.max(0, this.end - minimumSpan);
	}

	get endMin() {
		return Math.min(this.duration, this.start + minimumSpan);
	}

	get targetContainer(): Container {
		return this.container || this.intake.probe?.container || 'mp4';
	}

	get containerIndex() {
		if (!this.container && !this.intake.probe) return -1;
		return CONTAINERS.findIndex(
			(c) => c.id === this.targetContainer,
		);
	}

	get modeIndex() {
		return MODES.indexOf(this.mode);
	}

	get locked() {
		return this.loaded && this.unselected;
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
			this.selected &&
			this.support?.[this.targetContainer] === true
		);
	}

	get meta() {
		const { duration, width, height, fps } = this.intake;
		if (!duration) return '';
		return `${width} × ${height} · ${formatFps(fps)} · ${tc(duration)}`;
	}

	get warning() {
		return this.intake.error;
	}

	get baseName() {
		return this.intake.baseName || 'video';
	}

	get fileName() {
		const r = this.result;
		if (!r) return '';
		return `${this.baseName}-${tc(r.start).replace(/[:.]/g, '-')}.${r.ext}`;
	}

	get resultRow() {
		const r = this.result;
		if (!r) return null;
		return {
			name: this.fileName,
			detail: `${r.ext} · ${formatBytes(r.blob.size)} · ${tc(r.start)} – ${tc(r.end)}`,
		};
	}

	get startText() {
		return this.loaded ? tc(this.start) : DASH;
	}

	get endText() {
		return this.loaded ? tc(this.end) : DASH;
	}

	get unselected() {
		return !this.selected;
	}

	get length() {
		return Math.max(0, this.end - this.start);
	}

	get #frameSeconds() {
		return 1 / (this.intake.fps || 30);
	}

	stepBack = () => this.playback.stepBy(-this.#frameSeconds);
	stepForward = () => this.playback.stepBy(this.#frameSeconds);

	#load(file: File) {
		const { container } = this;
		this.#reset();
		this.container = container;
		const token = this.#token;
		const live = () => token === this.#token;
		void thumbnails(file, live).then((urls) => {
			if (!live()) return release(urls);
			this.frames = urls;
		});
	}

	#ready() {
		const end = Math.floor(this.duration * 1000) / 1000;
		const preset = presetCut();
		if (preset) this.select(preset[0], Math.min(preset[1], end));
		else this.select(0, end);
	}

	async #support(probe: VideoProbe | null) {
		const token = this.#token;
		if (!probe) {
			this.failed = true;
			return;
		}
		const support = await containerSupport(probe.codec);
		if (token !== this.#token) return;
		this.support = support;
		if (this.container && !support[this.container])
			this.container = '';
	}

	select = (start: number, end: number, moved?: TrimEdge) => {
		[this.start, this.end] = clampSpan(
			start,
			end,
			this.duration,
			moved,
		);
		this.playback.range = [this.start, this.end];
		this.#invalidate();
	};

	selectStart = (seconds: number) => this.select(seconds, this.end);
	selectEnd = (seconds: number) =>
		this.select(this.start, seconds, 'end');

	edit = (start: number, end: number, moved: TrimEdge) => {
		this.select(start, end);
		this.playback.scrub(moved === 'start' ? this.start : this.end);
	};

	#now() {
		return this.intake.video?.currentTime ?? 0;
	}

	setIn = () => this.select(this.#now(), this.end);
	setOut = () => this.select(this.start, this.#now(), 'end');

	pickContainer = (index: number) => {
		const id = CONTAINERS[index]?.id;
		if (!id || index === this.containerIndex) return;
		this.container = id;
		this.#invalidate();
	};

	pickMode = (index: number) => {
		const mode = MODES[index];
		if (!mode || mode === this.mode) return;
		this.mode = mode;
		this.#invalidate();
	};

	#invalidate() {
		if (this.busy) this.cancel();
		this.failed = false;
		this.#releaseResult();
	}

	trim = () => void this.#trim();

	async #trim() {
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
			const result = await trimVideo(file, {
				start: this.start,
				end: this.end,
				mode: this.mode,
				container: this.targetContainer,
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
			console.error('Trim failed:', error);
			this.failed = true;
		} finally {
			if (this.#abort === abort) this.#abort = null;
			if (job === this.#job) this.busy = false;
		}
	}

	async #describe(result: TrimResult, job: number) {
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

	preview = () => {
		if (this.resultUrl) window.open(this.resultUrl, '_blank');
	};

	#releaseResult() {
		if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
		this.resultUrl = '';
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
		this.support = null;
		this.container = '';
		this.start = 0;
		this.end = 0;
		this.playback.range = null;
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
			class="video-trimmer"
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
							this.selected
							this.length
							null
						}}
						@readout="below"
					>
						<Strips
							@thumbnails={{this.frames}}
							@aspect={{this.aspect}}
							@duration={{this.duration}}
							@playhead={{this.playback.playhead}}
							@selection={{this.selection}}
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
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Container" />
					<CanonSegmented
						class="vt-containers"
						@items={{containerLabels}}
						@selected={{this.containerIndex}}
						@disabledIndices={{this.unsupported}}
						@disabled={{this.locked}}
						@onChange={{this.pickContainer}}
					/>
					<CanonHeading @text="Cut" />
					<CanonSegmented
						class="vt-modes"
						@items={{modeLabels}}
						@selected={{this.modeIndex}}
						@disabled={{this.locked}}
						@onChange={{this.pickMode}}
					/>
					<Job
						@title="Trim"
						@icon={{Scissors}}
						@failure={{TRIM_ERROR}}
						@disabled={{if
							this.ready
							false
							true
						}}
						@busy={{this.busy}}
						@progress={{this.progress}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.trim}}
						@onCancel={{this.cancel}}
						@onSave={{this.save}}
						@onPreview={{this.preview}}
					/>
				</CanonRows>
				<Sections @sections={{this.info}} />
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="vt-source"
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
							class="vt-slot"
							@prompt="Drop a video file"
							@icon="scissors"
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
					class="vt-preview"
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
							class="vt-video"
							src={{this.intake.url}}
							playsinline
							preload="auto"
							aria-label="Preview"
							{{this.intake.register}}
							{{this.playback.register}}
							{{on
								"loadedmetadata"
								this.intake.ready
							}}
							{{on
								"error"
								this.intake.failed
							}}
						></video>
					{{/if}}
				</CanonCanvas>
				<CanonCanvas
					class="vt-editor"
					@height={{editorHeight}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
				>
					<Trim
						@duration={{this.duration}}
						@start={{this.start}}
						@end={{this.end}}
						@disabled={{this.unselected}}
						@onChange={{this.edit}}
					>
						<Strips
							@thumbnails={{this.frames}}
							@aspect={{this.aspect}}
							@duration={{this.duration}}
							@playhead={{this.playback.playhead}}
							@blank={{if
								this.loaded
								false
								true
							}}
						/>
					</Trim>
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<CanonRow
						class="vt-start"
						@title="Start"
						@detail={{this.startText}}
						@form="flush"
						as |titleId|
					>
						<CanonDecimalField
							@value={{this.start}}
							@max={{this.startMax}}
							@labelledBy={{titleId}}
							@disabled={{this.unselected}}
							@onChange={{this.selectStart}}
						/>
					</CanonRow>
					<CanonRow
						class="vt-end"
						@title="End"
						@detail={{this.endText}}
						@form="flush"
						as |titleId|
					>
						<CanonDecimalField
							@value={{this.end}}
							@min={{this.endMin}}
							@max={{this.duration}}
							@labelledBy={{titleId}}
							@disabled={{this.unselected}}
							@onChange={{this.selectEnd}}
						/>
					</CanonRow>
					<CanonGrid>
						<CanonButton
							class="vt-set-in"
							@text="Set in"
							@icon={{SetIn}}
							@disabled={{this.unselected}}
							@onClick={{this.setIn}}
						/>
						<CanonButton
							class="vt-set-out"
							@text="Set out"
							@icon={{SetOut}}
							@disabled={{this.unselected}}
							@onClick={{this.setOut}}
						/>
					</CanonGrid>
				</CanonRows>
			</:main>
			<:footer>
				<Transport
					@playback={{this.playback}}
					@ready={{this.selected}}
				>
					<:before>
						<CanonButton
							class="vt-back"
							@label="Back one frame"
							@icon={{Back}}
							@repeats={{true}}
							@disabled={{this.unselected}}
							@onClick={{this.stepBack}}
						/>
					</:before>
					<:default>
						<CanonButton
							class="vt-forward"
							@label="Forward one frame"
							@icon={{Forward}}
							@repeats={{true}}
							@disabled={{this.unselected}}
							@onClick={{this.stepForward}}
						/>
					</:default>
				</Transport>
			</:footer>
		</CanonSplit>
	</template>
}
