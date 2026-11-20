import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonReadoutBand from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import {
	applyFades,
	AudioIntake,
	channelsOf,
	encodeWav,
	extractPeaks,
	ViewWindow,
} from 'delphitools-v2/lib/audio';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Playback from 'delphitools-v2/components/tools/media/playback';
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
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import {
	centredOn,
	envelope,
	fadeGain,
	fadeLimit,
	gainAt,
} from 'delphitools-v2/components/tools/audio-trimmer/fades';
import './media/media.css';
import './audio-trimmer/audio-trimmer.css';

const ACCEPT = acceptAttr(AUDIO_ACCEPT);
const DROP_PROMPT = 'Drop an audio file here or click to upload';
const EXPORT_ERROR = "Couldn't write the trimmed file.";
const tc = (seconds: number) => formatTimestamp(seconds * 1000, '.');
const fixed = (seconds: number) => seconds.toFixed(2);
const noFrames: string[] = [];

const editorHeight = 180;

const flag = (name: string) =>
	typeof window !== 'undefined' &&
	new URLSearchParams(window.location.search).get(name) === 'yes';

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name="download" /></template>;
const SetIn = <template><IconSvg @name="arrow-right-to-line" /></template>;
const SetOut = <template><IconSvg @name="arrow-left-to-line" /></template>;
const ZoomOut = <template><IconSvg @name="zoom-out" /></template>;
const ZoomIn = <template><IconSvg @name="zoom-in" /></template>;
const Fit = <template><IconSvg @name="maximize" /></template>;

export default class AudioTrimmer extends Component {
	intake = new AudioIntake({
		onLoad: (file) => this.#load(file),
		onDecoded: (buffer) => this.#decoded(buffer),
	});
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));
	playback = new Playback();
	view = new ViewWindow();

	@tracked url = '';
	@tracked start = 0;
	@tracked end = 0;
	@tracked fadeIn = 0;
	@tracked fadeOut = 0;
	@tracked busy = false;
	@tracked failed = false;
	@tracked result: Blob | null = null;
	@tracked resultUrl = '';
	#cut: [number, number] = [0, 0];
	#token = 0;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.playback.unload();
		this.#releaseUrl();
		this.#releaseResult();
	}

	get loaded() {
		return this.intake.fileName !== '';
	}

	get blank() {
		return !this.loaded;
	}

	get decoded() {
		return this.intake.buffer !== null;
	}

	get undecoded() {
		return !this.decoded;
	}

	get duration() {
		return this.intake.buffer?.duration ?? 0;
	}

	get detail() {
		if (this.intake.error) return this.intake.error;
		const buffer = this.intake.buffer;
		if (!buffer) return 'Decoding…';
		return `${buffer.duration.toFixed(2)} s · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} ch`;
	}

	get selection(): [number, number] | null {
		return this.decoded ? [this.start, this.end] : null;
	}

	get startMax() {
		return Math.max(0, this.end - minimumSpan);
	}

	get endMin() {
		return Math.min(this.duration, this.start + minimumSpan);
	}

	get startText() {
		return tc(this.start);
	}

	get endText() {
		return tc(this.end);
	}

	get length() {
		return Math.max(0, this.end - this.start);
	}

	get fadeMax() {
		return fadeLimit(this.start, this.end);
	}

	get noPlayhead() {
		return this.playback.playhead === null;
	}

	@cached
	get peaks() {
		const buffer = this.intake.buffer;
		return buffer
			? extractPeaks(channelsOf(buffer), peakBuckets)
			: null;
	}

	@cached
	get viewPeaks() {
		const buffer = this.intake.buffer;
		if (!buffer || !this.view.isZoomed) return this.peaks;
		const from = Math.floor(this.view.start * buffer.sampleRate);
		const to = Math.max(
			from + 2,
			Math.ceil(this.view.end * buffer.sampleRate),
		);
		return extractPeaks(
			channelsOf(buffer).map((c) => c.subarray(from, to)),
			peakBuckets,
		);
	}

	#inView(seconds: number) {
		const { start, span } = this.view;
		return Math.min(Math.max(seconds - start, 0), span);
	}

	get viewStart() {
		return this.#inView(this.start);
	}

	get viewEnd() {
		return this.#inView(this.end);
	}

	get viewPlayhead() {
		const at = this.playback.playhead;
		if (at === null) return null;
		const { start, end } = this.view;
		return at >= start && at <= end ? at - start : null;
	}

	get viewLabel() {
		return this.view.isZoomed ? this.view.label : '';
	}

	get curve() {
		if (!this.decoded || !(this.fadeIn > 0 || this.fadeOut > 0))
			return '';
		const { start, span } = this.view;
		return envelope(this.start, this.end, this.fadeIn, this.fadeOut)
			.map(([t, gain]) => `${(t - start) / span},${1 - gain}`)
			.join(' ');
	}

	get fileName() {
		return `${this.intake.baseName || 'audio'}-trimmed.wav`;
	}

	get resultRow() {
		const blob = this.result;
		if (!blob) return null;
		const [from, to] = this.#cut;
		return {
			name: this.fileName,
			detail: `wav · ${formatBytes(blob.size)} · ${tc(from)} – ${tc(to)}`,
		};
	}

	gain = (seconds: number) =>
		gainAt(
			seconds,
			this.start,
			this.end,
			this.fadeIn,
			this.fadeOut,
		);

	#load(file: File) {
		this.#reset();
		this.url = URL.createObjectURL(file);
	}

	#decoded(buffer: AudioBuffer) {
		this.view.reset(buffer.duration);
		this.select(0, Math.floor(buffer.duration * 100) / 100);
		if (flag('trimFades')) this.#fades(1.5, 2.5);
		if (flag('trimLoop')) {
			this.playback.looping = true;
			this.select(1, 1.6);
			this.playback.play();
		}
	}

	select = (start: number, end: number, moved?: TrimEdge) => {
		[this.start, this.end] = clampSpan(
			start,
			end,
			this.duration,
			moved,
		);
		this.playback.range = [this.start, this.end];
		this.#fades(this.fadeIn, this.fadeOut);
	};

	selectStart = (seconds: number) => this.select(seconds, this.end);
	selectEnd = (seconds: number) =>
		this.select(this.start, seconds, 'end');

	edit = (start: number, end: number, moved: TrimEdge) => {
		const origin = this.view.start;
		if (moved === 'start') this.select(start + origin, this.end);
		else this.select(this.start, end + origin, 'end');
		this.playback.scrub(moved === 'start' ? this.start : this.end);
	};

	setIn = () => {
		const at = this.playback.playhead;
		if (at !== null) this.select(at, this.end);
	};

	setOut = () => {
		const at = this.playback.playhead;
		if (at !== null) this.select(this.start, at, 'end');
	};

	setFadeIn = (seconds: number) => this.#fades(seconds, this.fadeOut);
	setFadeOut = (seconds: number) => this.#fades(this.fadeIn, seconds);

	#fades(fadeIn: number, fadeOut: number) {
		const most = this.fadeMax;
		this.fadeIn = Math.min(Math.max(fadeIn, 0), most);
		this.fadeOut = Math.min(Math.max(fadeOut, 0), most);
		this.#invalidate();
	}

	follow = (event: Event) => {
		const at = (event.target as HTMLMediaElement).currentTime;
		const { start, end, span, isZoomed } = this.view;
		if (!isZoomed || (at >= start && at <= end)) return;
		this.view.set(...centredOn(at, span, this.duration));
	};

	zoomIn = () => this.view.zoomIn();
	zoomOut = () => this.view.zoomOut();
	fit = () => this.view.fit();

	#invalidate() {
		if (this.busy) this.#token++;
		this.busy = false;
		this.failed = false;
		this.#releaseResult();
	}

	export = () => void this.#export();

	async #export() {
		const buffer = this.intake.buffer;
		if (!buffer || this.busy) return;
		const token = ++this.#token;
		this.busy = true;
		this.failed = false;
		this.#releaseResult();
		this.playback.pause();
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.isDestroyed || token !== this.#token) return;
		const { sampleRate } = buffer;
		const from = Math.floor(this.start * sampleRate);
		const to = Math.min(
			buffer.length,
			Math.ceil(this.end * sampleRate),
		);
		try {
			const channels = channelsOf(buffer).map(
				(c) => new Float32Array(c.subarray(from, to)),
			);
			applyFades(
				channels,
				sampleRate,
				this.fadeIn,
				this.fadeOut,
			);
			this.result = new Blob(
				[encodeWav(channels, sampleRate)],
				{
					type: 'audio/wav',
				},
			);
			this.resultUrl = URL.createObjectURL(this.result);
			this.#cut = [this.start, this.end];
		} catch (error) {
			console.error('Export failed:', error);
			this.failed = true;
		}
		this.busy = false;
	}

	save = () => {
		if (this.result) downloadBlob(this.result, this.fileName);
	};

	preview = () => {
		if (this.resultUrl) window.open(this.resultUrl, '_blank');
	};

	#releaseResult() {
		if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
		this.resultUrl = '';
		this.result = null;
	}

	#releaseUrl() {
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = '';
	}

	#reset() {
		this.#token++;
		this.playback.unload();
		this.playback.range = null;
		this.#releaseUrl();
		this.#releaseResult();
		this.view.reset(0);
		this.start = 0;
		this.end = 0;
		this.fadeIn = 0;
		this.fadeOut = 0;
		this.busy = false;
		this.failed = false;
	}

	clear = () => {
		this.#reset();
		this.playback.looping = false;
		this.intake.clear();
	};

	<template>
		<CanonSplit
			class="audio-trimmer"
			@sidebarWidth={{380}}
			@bannerSticks={{true}}
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
							this.decoded
							this.length
							null
						}}
					>
						<Strips
							class="at-band"
							@thumbnails={{noFrames}}
							@waveform={{true}}
							@peaks={{this.peaks}}
							@duration={{this.duration}}
							@playhead={{this.playback.playhead}}
							@selection={{this.selection}}
							@onScrub={{this.playback.scrub}}
							@blank={{this.blank}}
						/>
					</CanonReadoutBand>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="at-source
								{{if
									this.intake.error
									'at-source--failed'
								}}"
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
							class="at-slot"
							@prompt={{DROP_PROMPT}}
							@icon="audio-waveform"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.intake.load}}
						/>
						{{#if this.intake.error}}
							<CanonStatus
								@text={{this.intake.error}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					{{/if}}
					<CanonHeading @text="Fades" />
					<CanonRow
						class="at-fade at-fade-in
							{{if
								this.blank
								'at-fade--off'
							}}"
						@title="Fade in (s)"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.fadeIn}}
							@max={{this.fadeMax}}
							@step={{0.01}}
							@readout={{fixed}}
							@labelledBy={{titleId}}
							@onChange={{this.setFadeIn}}
							aria-disabled={{if
								this.blank
								"true"
							}}
							tabindex={{if
								this.blank
								"-1"
								"0"
							}}
						/>
					</CanonRow>
					<CanonRow
						class="at-fade at-fade-out
							{{if
								this.blank
								'at-fade--off'
							}}"
						@title="Fade out (s)"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.fadeOut}}
							@max={{this.fadeMax}}
							@step={{0.01}}
							@readout={{fixed}}
							@fillsFromTrailing={{true}}
							@labelledBy={{titleId}}
							@onChange={{this.setFadeOut}}
							aria-disabled={{if
								this.blank
								"true"
							}}
							tabindex={{if
								this.blank
								"-1"
								"0"
							}}
						/>
					</CanonRow>
					<Job
						@title="Export WAV"
						@icon={{Save}}
						@failure={{EXPORT_ERROR}}
						@disabled={{this.undecoded}}
						@busy={{this.busy}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.export}}
						@onSave={{this.save}}
						@onPreview={{this.preview}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonCanvas
					class="at-editor"
					@height={{editorHeight}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
				>
					<Trim
						@duration={{this.view.span}}
						@start={{this.viewStart}}
						@end={{this.viewEnd}}
						@origin={{this.view.start}}
						@disabled={{this.undecoded}}
						@onChange={{this.edit}}
					>
						<div class="at-lane">
							<Strips
								@thumbnails={{noFrames}}
								@waveform={{true}}
								@peaks={{this.viewPeaks}}
								@duration={{this.view.span}}
								@playhead={{this.viewPlayhead}}
								@blank={{this.blank}}
							/>
							{{#if this.curve}}
								<svg
									class="at-curve"
									viewBox="0 0 1 1"
									preserveAspectRatio="none"
									aria-hidden="true"
								><polyline
										points={{this.curve}}
									/></svg>
							{{/if}}
						</div>
					</Trim>
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<CanonRow
						class="at-start"
						@title="Start"
						@detail={{this.startText}}
						@form="flush"
						as |titleId|
					>
						<CanonDecimalField
							@value={{this.start}}
							@max={{this.startMax}}
							@labelledBy={{titleId}}
							@disabled={{this.undecoded}}
							@onChange={{this.selectStart}}
						/>
					</CanonRow>
					<CanonRow
						class="at-end"
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
							@disabled={{this.undecoded}}
							@onChange={{this.selectEnd}}
						/>
					</CanonRow>
					<CanonGrid>
						<CanonButton
							class="at-set-in"
							@text="Set in"
							@icon={{SetIn}}
							@disabled={{this.noPlayhead}}
							@onClick={{this.setIn}}
						/>
						<CanonButton
							class="at-set-out"
							@text="Set out"
							@icon={{SetOut}}
							@disabled={{this.noPlayhead}}
							@onClick={{this.setOut}}
						/>
					</CanonGrid>
					<CanonGrid class="at-zoom">
						<CanonButton
							class="at-zoom-out"
							@label="Zoom out"
							@icon={{ZoomOut}}
							@disabled={{if
								this.view.isZoomed
								false
								true
							}}
							@onClick={{this.zoomOut}}
						/>
						<CanonButton
							class="at-zoom-in"
							@label="Zoom in"
							@icon={{ZoomIn}}
							@disabled={{this.undecoded}}
							@onClick={{this.zoomIn}}
						/>
						<CanonButton
							class="at-fit"
							@label="Reset zoom"
							@icon={{Fit}}
							@disabled={{if
								this.view.isZoomed
								false
								true
							}}
							@onClick={{this.fit}}
						/>
					</CanonGrid>
					{{#if this.viewLabel}}
						<CanonRow
							class="at-view"
							@title="View"
							@detail={{this.viewLabel}}
						/>
					{{/if}}
				</CanonRows>
				{{#if this.loaded}}
					{{! template-lint-disable require-media-caption }}
					<audio
						class="at-audio"
						src={{this.url}}
						preload="auto"
						{{this.playback.register}}
						{{fadeGain this.gain}}
						{{on "timeupdate" this.follow}}
					></audio>
				{{/if}}
			</:main>
			<:footer>
				<Transport
					@playback={{this.playback}}
					@ready={{this.decoded}}
				/>
			</:footer>
		</CanonSplit>
	</template>
}
