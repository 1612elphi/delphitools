import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonReadoutBand from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadUrl } from 'delphitools-v2/lib/download';
import { AnimatedGifEncoder } from 'delphitools-v2/lib/gif';
import { formatFps } from 'delphitools-v2/lib/media-probe';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import { seekTo, VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Marks from 'delphitools-v2/components/tools/media/marks';
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
import {
	release,
	thumbnails,
} from 'delphitools-v2/components/tools/media/frames';
import {
	frameCount,
	maxFrames,
	outputSize,
} from 'delphitools-v2/components/tools/video-to-gif/plan';
import './media/media.css';
import './video-to-gif/video-to-gif.css';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);
const TOO_MANY_FRAMES =
	'Over 300 frames. Please lower the fps or shorten the range';
const DROP_TITLE = 'Drop a video here or click to upload';
const ENCODE_ERROR = "Couldn't read frames from this video.";

const frameLabel = (n: number) => (n === 1 ? '1 frame' : `${n} frames`);
const tc = (seconds: number) => formatTimestamp(seconds * 1000, '.');
const whole = (value: number) => String(Math.round(value));

const editorHeight = 72;
const tallest = 1.25;
const tallestPreview = 340;
const DASH = '—';
const firstCut = 5;

function flags() {
	if (typeof window === 'undefined') return null;
	const query = new URLSearchParams(window.location.search);
	const cut = (query.get('gifCut') ?? '').split(',').map(Number);
	return {
		cut:
			cut.length === 2 && cut.every(Number.isFinite)
				? cut
				: null,
		fps: Number(query.get('gifFps')) || 0,
		run: query.get('gifRun') === 'yes',
	};
}

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Clapper = <template><IconSvg @name="clapperboard" /></template>;
const SetIn = <template><IconSvg @name="arrow-right-to-line" /></template>;
const SetOut = <template><IconSvg @name="arrow-left-to-line" /></template>;
const Back = <template><IconSvg @name="chevron-left" /></template>;
const Forward = <template><IconSvg @name="chevron-right" /></template>;

export default class VideoToGif extends Component {
	intake = new VideoIntake({
		onLoad: (file) => this.#load(file),
		onReady: () => this.#ready(),
		probe: true,
		canLoad: () => !this.busy,
	});
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));
	playback = new Playback();

	@tracked start = 0;
	@tracked end = 0;
	@tracked fps = 10;
	@tracked width = 480;
	@tracked busy = false;
	@tracked progress = 0;
	@tracked failed = false;
	@tracked gifUrl = '';
	@tracked gifBytes = 0;
	@tracked gifFrames = 0;
	@tracked frames: string[] = [];

	#token = 0;
	#job = 0;
	#running: Promise<void> = Promise.resolve();
	#runOnReady = false;

	willDestroy() {
		super.willDestroy();
		this.#job++;
		this.#token++;
		this.intake.release();
		this.#releaseGif();
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

	get unselected() {
		return !this.selected;
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

	get length() {
		return Math.max(0, this.end - this.start);
	}

	get startMax() {
		return Math.max(0, this.end - minimumSpan);
	}

	get endMin() {
		return Math.min(this.duration, this.start + minimumSpan);
	}

	get frameCount() {
		return frameCount(this.start, this.end, this.fps);
	}

	get overCap() {
		return this.selected && this.frameCount > maxFrames;
	}

	get runDisabled() {
		return this.busy || this.unselected || this.overCap;
	}

	get size() {
		return outputSize(
			this.width,
			this.intake.width,
			this.intake.height,
		);
	}

	get frameMarks() {
		if (this.unselected || this.overCap) return [];
		return Array.from(
			{ length: this.frameCount },
			(_, i) => this.start + i / this.fps,
		);
	}

	get widthLocked() {
		return this.loaded && this.unselected;
	}

	get budget() {
		if (!this.loaded)
			return [
				{ label: 'Frames', value: DASH, level: 0 },
				{ label: 'Size', value: DASH },
			];
		const [w, h] = this.size;
		return [
			{
				label: 'Frames',
				value: frameLabel(this.frameCount),
				level:
					Math.min(this.frameCount, maxFrames) /
					maxFrames,
			},
			{ label: 'Size', value: h > 0 ? `${w} × ${h}` : '—' },
		];
	}

	get meta() {
		const { duration, width, height, fps } = this.intake;
		if (!duration) return '';
		return `${width} × ${height} · ${formatFps(fps)} · ${tc(duration)}`;
	}

	get warning() {
		return this.intake.error;
	}

	get fileName() {
		return `${this.intake.baseName || 'clip'}.gif`;
	}

	get resultRow() {
		if (!this.gifUrl) return null;
		return {
			name: this.fileName,
			detail: `${Math.max(1, Math.round(this.gifBytes / 1024))} KB · ${frameLabel(this.gifFrames)}`,
		};
	}

	get startText() {
		return this.loaded ? tc(this.start) : DASH;
	}

	get endText() {
		return this.loaded ? tc(this.end) : DASH;
	}

	get #frameSeconds() {
		return 1 / (this.intake.fps || 30);
	}

	stepBack = () => this.playback.stepBy(-this.#frameSeconds);
	stepForward = () => this.playback.stepBy(this.#frameSeconds);

	#load(file: File) {
		this.#reset();
		const token = this.#token;
		const live = () => token === this.#token;
		void thumbnails(file, live).then((urls) => {
			if (!live()) return release(urls);
			this.frames = urls;
		});
	}

	#ready() {
		const preset = flags();
		const end =
			Math.floor(Math.min(this.duration, firstCut) * 10) / 10;
		if (preset?.fps)
			this.fps = Math.min(50, Math.max(1, preset.fps));
		if (preset?.cut)
			this.select(
				Math.min(...preset.cut),
				Math.max(...preset.cut),
			);
		else this.select(0, end);
		if (preset?.run && !this.#runOnReady) {
			this.#runOnReady = true;
			this.encode();
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

	setFps = (value: number) => {
		const fps = Math.min(50, Math.max(1, Math.round(value)));
		if (fps === this.fps) return;
		this.fps = fps;
		this.#invalidate();
	};

	setWidth = (value: number) => {
		if (value === this.width) return;
		this.width = value;
		this.#invalidate();
	};

	#invalidate() {
		if (this.busy) this.cancel();
		this.failed = false;
		this.#releaseGif();
	}

	encode = () => {
		const run = this.#running.then(() => this.#encode());
		this.#running = run.catch(() => undefined);
	};

	async #encode() {
		const video = this.intake.video;
		if (!video || this.runDisabled) return;
		const job = ++this.#job;
		const live = () => job === this.#job && !this.isDestroyed;
		const { start, fps } = this;
		const frames = this.frameCount;
		const [width, height] = this.size;
		this.busy = true;
		this.progress = 0;
		this.failed = false;
		this.#releaseGif();
		this.playback.pause();
		const returnTo = video.currentTime;
		try {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d', {
				willReadFrequently: true,
			});
			if (!ctx) throw new Error('no 2d context');
			const encoder = new AnimatedGifEncoder(width, height);
			for (let i = 0; i < frames; i++) {
				await seekTo(video, start + i / fps);
				if (!live()) return;
				ctx.drawImage(video, 0, 0, width, height);
				encoder.addFrame(
					ctx.getImageData(0, 0, width, height)
						.data,
					1000 / fps,
				);
				this.progress = (i + 1) / frames;
			}
			const bytes = encoder.finish();
			await seekTo(video, returnTo);
			if (!live()) return;
			this.gifUrl = URL.createObjectURL(
				new Blob([bytes], { type: 'image/gif' }),
			);
			this.gifBytes = bytes.length;
			this.gifFrames = frames;
		} catch (error) {
			if (!live()) return;
			console.error('GIF encode failed:', error);
			this.failed = true;
		} finally {
			if (job === this.#job && !this.isDestroyed)
				this.busy = false;
		}
	}

	cancel = () => {
		this.#job++;
		this.busy = false;
		this.progress = 0;
	};

	save = () => {
		if (this.gifUrl) downloadUrl(this.gifUrl, this.fileName);
	};

	#releaseGif() {
		if (this.gifUrl) URL.revokeObjectURL(this.gifUrl);
		this.gifUrl = '';
		this.gifBytes = 0;
		this.gifFrames = 0;
	}

	#reset() {
		this.#token++;
		this.#job++;
		this.#releaseGif();
		release(this.frames);
		this.frames = [];
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
			class="video-to-gif"
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
						<div class="vg-lane">
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
							<Marks
								@dim={{this.frameMarks}}
								@duration={{this.duration}}
							/>
						</div>
					</CanonReadoutBand>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Range" />
					<CanonRow
						class="vg-fps"
						@title="FPS"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.fps}}
							@min={{1}}
							@max={{50}}
							@step={{1}}
							@readout={{whole}}
							@labelledBy={{titleId}}
							@onChange={{this.setFps}}
						/>
					</CanonRow>
					<CanonRow
						class="vg-width"
						@title="Width"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.width}}
							@min={{16}}
							@max={{1920}}
							@step={{16}}
							@unit="px"
							@labelledBy={{titleId}}
							@disabled={{this.widthLocked}}
							@onChange={{this.setWidth}}
						/>
					</CanonRow>
					<CanonTiles
						class="vg-budget"
						@items={{this.budget}}
					/>
					{{#if this.overCap}}
						<CanonStatus
							class="vg-over"
							@text={{TOO_MANY_FRAMES}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<Job
						@title="Create GIF"
						@icon={{Clapper}}
						@failure={{ENCODE_ERROR}}
						@disabled={{this.runDisabled}}
						@busy={{this.busy}}
						@progress={{this.progress}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.encode}}
						@onCancel={{this.cancel}}
						@onSave={{this.save}}
					/>
					{{#if this.gifUrl}}
						<img
							class="vg-gif"
							src={{this.gifUrl}}
							alt="Encoded GIF"
						/>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="vg-source"
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
							class="vg-slot"
							@prompt={{DROP_TITLE}}
							@icon="clapperboard"
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
					class="vg-preview"
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
							class="vg-video"
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
					class="vg-editor"
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
						class="vg-start"
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
						class="vg-end"
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
							class="vg-set-in"
							@text="Set in"
							@icon={{SetIn}}
							@disabled={{this.unselected}}
							@onClick={{this.setIn}}
						/>
						<CanonButton
							class="vg-set-out"
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
							class="vg-back"
							@label="Back one frame"
							@icon={{Back}}
							@repeats={{true}}
							@disabled={{this.unselected}}
							@onClick={{this.stepBack}}
						/>
					</:before>
					<:default>
						<CanonButton
							class="vg-forward"
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
