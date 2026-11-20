import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonReadoutBand from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	AudioIntake,
	channelsOf,
	extractPeaks,
	integratedLufs,
	peakDb,
	ViewWindow,
} from 'delphitools-v2/lib/audio';
import {
	analyzeMedia,
	blankSections,
	sections,
	type Section,
	type Track,
} from 'delphitools-v2/lib/mediainfo';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import { toolsForFile } from 'delphitools-v2/lib/omni';
import { sample } from 'delphitools-v2/lib/workflows';
import Drop from 'delphitools-v2/components/tools/media/drop';
import OpenIn from 'delphitools-v2/components/tools/media/open-in';
import Playback from 'delphitools-v2/components/tools/media/playback';
import Sections from 'delphitools-v2/components/tools/media/sections';
import Slot from 'delphitools-v2/components/tools/media/slot';
import Strips, {
	bandHeight,
} from 'delphitools-v2/components/tools/media/strips';
import Transport from 'delphitools-v2/components/tools/media/transport';
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import { label } from 'delphitools-v2/components/tools/audio-atlas/ruler';
import {
	loudnessTiles,
	rmsDb,
} from 'delphitools-v2/components/tools/audio-atlas/loudness';
import Sheet from 'delphitools-v2/components/tools/audio-atlas/sheet';
import './media/media.css';
import './audio-atlas/audio-atlas.css';

const ACCEPT = acceptAttr(AUDIO_ACCEPT);
const DROP_PROMPT = 'Drop an audio file here or click to upload';
const noFrames: string[] = [];
const BLANK_INFO = blankSections(['General', 'Audio']);
const BLANK_LOUDNESS: Section = {
	type: 'Other',
	title: 'Loudness',
	rows: ['Peak', 'RMS', 'Loudness'].map((label) => ({
		label,
		value: '\u2014',
	})),
};
// ponytail: a WAV's list; an MP3 or FLAC may open in a few others
const BLANK_OPEN = toolsForFile(sample('.wav')).filter(
	(tool) => tool.id !== 'audio-atlas' && !tool.route,
);

const sheetHeight = 304;

const flag = (name: string) =>
	typeof window !== 'undefined' &&
	new URLSearchParams(window.location.search).get(name) === 'yes';

const Trash = <template><IconSvg @name="trash-2" /></template>;
const ZoomOut = <template><IconSvg @name="zoom-out" /></template>;
const ZoomIn = <template><IconSvg @name="zoom-in" /></template>;
const Fit = <template><IconSvg @name="maximize" /></template>;

class ViewPlayback extends Playback {
	#view: ViewWindow;

	constructor(view: ViewWindow) {
		super();
		this.#view = view;
	}

	toggleLoop = () => {
		this.looping = !this.looping;
		this.follow();
		return this.looping;
	};

	follow() {
		const { start, end } = this.#view;
		this.range = this.looping ? [start, end] : null;
		const at = this.playhead;
		if (this.looping && this.playing && at !== null)
			if (at < start || at >= end) this.scrub(start);
	}
}

export default class AudioAtlas extends Component {
	view = new ViewWindow();
	playback = new ViewPlayback(this.view);
	intake = new AudioIntake({
		onLoad: (file) => this.#load(file),
		onDecoded: (buffer) => this.#decoded(buffer),
	});
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));

	@tracked url = '';
	@tracked tracks: Track[] = [];
	@tracked lufs: number | null = null;
	#token = 0;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.playback.unload();
		this.#releaseUrl();
	}

	get loaded() {
		return this.intake.fileName !== '';
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

	get viewText() {
		if (!this.decoded) return '\u2014';
		return `${label(this.view.start, 0.01)} – ${label(this.view.end, 0.01)}`;
	}

	get notZoomed() {
		return !this.view.isZoomed;
	}

	get selection(): [number, number] | null {
		return this.view.isZoomed
			? [this.view.start, this.view.end]
			: null;
	}

	@cached
	get channels() {
		const buffer = this.intake.buffer;
		return buffer ? channelsOf(buffer) : null;
	}

	@cached
	get levels() {
		const channels = this.channels;
		return channels
			? { peak: peakDb(channels), rms: rmsDb(channels) }
			: null;
	}

	get loudness(): Section {
		const levels = this.levels;
		if (!levels) return BLANK_LOUDNESS;
		return {
			type: 'Other',
			title: 'Loudness',
			rows: loudnessTiles(levels.peak, levels.rms, this.lufs),
		};
	}

	@cached
	get sections() {
		const all = this.tracks.length
			? sections(this.tracks)
			: BLANK_INFO;
		return [...all, this.loudness];
	}

	get tags() {
		const general = this.tracks.find(
			(t) => t['@type'] === 'General',
		);
		const text = (key: string) => {
			const value = general?.[key];
			return value === undefined || value === ''
				? ''
				: String(value);
		};
		const tags = {
			title: text('Title') || text('Track'),
			artist: text('Performer'),
			album: text('Album'),
		};
		return tags.title || tags.artist || tags.album ? tags : null;
	}

	@cached
	get peaks() {
		const channels = this.channels;
		return channels ? extractPeaks(channels, peakBuckets) : null;
	}

	// ponytail: the view's peaks rescan its samples on every move; slice the overview while moving if long files drag
	@cached
	get viewPeaks() {
		const buffer = this.intake.buffer;
		const channels = this.channels;
		if (!buffer || !channels || !this.view.isZoomed)
			return this.peaks;
		const from = Math.floor(this.view.start * buffer.sampleRate);
		const to = Math.max(
			from + 2,
			Math.ceil(this.view.end * buffer.sampleRate),
		);
		return extractPeaks(
			channels.map((c) => c.subarray(from, to)),
			peakBuckets,
		);
	}

	#load(file: File) {
		this.#reset();
		this.url = URL.createObjectURL(file);
		const token = this.#token;
		void analyzeMedia(file)
			.then((tracks) => {
				if (token === this.#token) this.tracks = tracks;
			})
			.catch((error: unknown) =>
				console.error('MediaInfo failed:', error),
			);
	}

	#decoded(buffer: AudioBuffer) {
		this.view.reset(buffer.duration);
		void this.#measure(buffer);
		if (flag('atlasZoom'))
			this.moveWindow(
				buffer.duration * 0.3,
				buffer.duration * 0.2,
			);
		if (flag('atlasLoop')) {
			this.playback.toggleLoop();
			this.playback.play();
		}
	}

	async #measure(buffer: AudioBuffer) {
		const token = this.#token;
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.isDestroyed || token !== this.#token) return;
		this.lufs = integratedLufs(
			channelsOf(buffer),
			buffer.sampleRate,
		);
	}

	#setView(start: number, end: number) {
		this.view.set(start, end);
		this.playback.follow();
	}

	moveWindow = (start: number, span: number) => {
		const length = Math.min(
			Math.max(span, ViewWindow.MIN_SPAN_S),
			this.duration,
		);
		const from = Math.min(
			Math.max(0, start),
			this.duration - length,
		);
		this.#setView(from, from + length);
	};

	zoomIn = () => {
		this.view.zoomIn();
		this.playback.follow();
	};

	zoomOut = () => {
		this.view.zoomOut();
		this.playback.follow();
	};

	fit = () => this.#setView(0, this.duration);

	seek = (seconds: number) => this.playback.scrub(seconds);

	nudge = (direction: number) => {
		if (!this.decoded) return;
		const { start, end, span } = this.view;
		const target = Math.min(
			Math.max(
				0,
				(this.playback.playhead ?? start) +
					(direction * span) / 20,
			),
			this.duration,
		);
		if (target < start || target > end)
			this.moveWindow(target - span / 2, span);
		this.seek(target);
	};

	#releaseUrl() {
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = '';
	}

	#reset() {
		this.#token++;
		this.playback.unload();
		this.#releaseUrl();
		this.view.reset(0);
		this.playback.follow();
		this.tracks = [];
		this.lufs = null;
	}

	clear = () => {
		this.#reset();
		this.playback.looping = false;
		this.playback.follow();
		this.intake.clear();
	};

	<template>
		<CanonSplit
			class="audio-atlas"
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
							this.decoded
							this.view.span
							null
						}}
					>
						<Strips
							class="aa-band"
							@thumbnails={{noFrames}}
							@waveform={{true}}
							@peaks={{this.peaks}}
							@duration={{this.duration}}
							@playhead={{this.playback.playhead}}
							@selection={{this.selection}}
							@onScrub={{this.seek}}
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
				{{#if this.tags}}
					<CanonRows
						class="aa-tags"
						@framed={{true}}
					>
						<div class="aa-tags-text">
							{{#if this.tags.title}}
								<p
									class="aa-tags-title"
								>{{this.tags.title}}</p>
							{{/if}}
							{{#if this.tags.artist}}
								<p
									class="aa-tags-artist"
								>{{this.tags.artist}}</p>
							{{/if}}
							{{#if this.tags.album}}
								<p
									class="aa-tags-album"
								>{{this.tags.album}}</p>
							{{/if}}
						</div>
					</CanonRows>
				{{/if}}
				<Sections @sections={{this.sections}} />
			</:sidebar>
			<:main>
				{{#if this.loaded}}
					{{! template-lint-disable require-media-caption }}
					<audio
						class="aa-audio"
						src={{this.url}}
						preload="auto"
						{{this.playback.register}}
					></audio>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="aa-source
								{{if
									this.intake.error
									'aa-source--failed'
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
							class="aa-slot"
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
					<CanonRow
						class="aa-view"
						@title="View"
						@detail={{this.viewText}}
						@form="flush"
					>
						<CanonGrid class="aa-zoom">
							<CanonButton
								class="aa-zoom-out"
								@kind="cell"
								@label="Zoom out"
								@icon={{ZoomOut}}
								@disabled={{this.notZoomed}}
								@onClick={{this.zoomOut}}
							/>
							<CanonButton
								class="aa-zoom-in"
								@kind="cell"
								@label="Zoom in"
								@icon={{ZoomIn}}
								@disabled={{this.undecoded}}
								@onClick={{this.zoomIn}}
							/>
							<CanonButton
								class="aa-fit"
								@kind="cell"
								@label="Reset zoom"
								@icon={{Fit}}
								@disabled={{this.notZoomed}}
								@onClick={{this.fit}}
							/>
						</CanonGrid>
					</CanonRow>
				</CanonRows>
				<CanonCanvas
					class="aa-picture"
					@height={{sheetHeight}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
				>
					{{#if this.intake.buffer}}
						<Sheet
							@buffer={{this.intake.buffer}}
							@peaks={{this.viewPeaks}}
							@start={{this.view.start}}
							@end={{this.view.end}}
							@playhead={{this.playback.playhead}}
							@onSeek={{this.seek}}
							@onWindow={{this.moveWindow}}
							@onNudge={{this.nudge}}
							@onFit={{this.fit}}
						/>
					{{else}}
						<div
							class="aa-sheet aa-sheet--blank"
							aria-hidden="true"
						>
							<span
								class="aa-wave"
							></span>
							<span
								class="aa-ruler"
							></span>
							<span
								class="aa-plate"
							></span>
						</div>
					{{/if}}
				</CanonCanvas>
				{{#if this.loaded}}
					<OpenIn
						class="aa-open"
						@file={{this.intake.file}}
						@self="audio-atlas"
					/>
				{{else}}
					<OpenIn
						class="aa-open media-open--blank"
						@tools={{BLANK_OPEN}}
						inert
					/>
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
