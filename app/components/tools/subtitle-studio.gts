import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { eq, or } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import type { CanonLamp } from 'delphicanon/components/canon-lamps';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonReadoutBand from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { IconSvg } from 'delphitools-v2/components/icon';
import CueRow from 'delphitools-v2/components/tools/media/cue-row';
import CueTimeline, {
	type CueLane,
} from 'delphitools-v2/components/tools/media/cue-timeline';
import Job from 'delphitools-v2/components/tools/media/job';
import Playback from 'delphitools-v2/components/tools/media/playback';
import Sections from 'delphitools-v2/components/tools/media/sections';
import Slot from 'delphitools-v2/components/tools/media/slot';
import Strips, {
	bandHeight,
} from 'delphitools-v2/components/tools/media/strips';
import {
	release,
	thumbnails,
} from 'delphitools-v2/components/tools/media/frames';
import {
	clampPosition,
	jumpTarget,
	placement,
	shown,
} from 'delphitools-v2/components/tools/subtitle-studio/board';
import Picture from 'delphitools-v2/components/tools/subtitle-studio/picture';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { downloadUrl } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import {
	analyzeMedia,
	sections,
	type Section,
} from 'delphitools-v2/lib/mediainfo';
import {
	detectFormat,
	formatTimestamp,
	parseSubtitles,
	type Cue,
} from 'delphitools-v2/lib/subtitles';
import { seekTo, VideoIntake } from 'delphitools-v2/lib/video';
import {
	SUBTITLE_ACCEPT,
	VIDEO_ACCEPT,
	acceptAttr,
} from 'delphitools-v2/lib/tools';
import { formatFps } from 'delphitools-v2/lib/media-probe';
import {
	burnVideo,
	encodableCodecs,
	type BurnCodec,
} from 'delphitools-v2/lib/media-convert';
import {
	DEFAULT_STYLE,
	SIZE_RANGE,
	WIDTH_RANGE,
	activeCue,
	bitrateFor,
	drawSubtitle,
	stripTags,
	supportedFormats,
	type BurnStyle,
	type FontChoice,
	type TextBox,
	type TextStyle,
} from 'delphitools-v2/lib/subtitle-burn';
import './media/media.css';
import './subtitle-studio/subtitle-studio.css';

const VIDEO = acceptAttr(VIDEO_ACCEPT);
const SUBS = acceptAttr(SUBTITLE_ACCEPT);
const ANY = `${VIDEO},${SUBS}`;
const SUBS_RE = /\.(srt|vtt)$/i;

const CAPTURE_FPS = 30;
const tallest = 1.25;
const tallestPreview = 420;
const BLANK_BOARD = htmlSafe(`--ss-aspect: ${16 / 9}`);
const GHOST = 0.45;
const LAMPS: CanonLamp[] = ['play', 'pause'];
const [SIZE_MIN, SIZE_MAX] = SIZE_RANGE;
const [WIDTH_MIN, WIDTH_MAX] = WIDTH_RANGE;

const FONTS: FontChoice[] = ['sans', 'serif', 'mono', 'quattro'];
const FONT_LABELS = ['Sans', 'Serif', 'Mono', 'Quattro'];
const WEIGHTS = ['Regular', 'Bold'];
const TEXT_STYLES: TextStyle[] = ['outline', 'box', 'shadow', 'plain'];
const TEXT_LABELS = ['Outline', 'Box', 'Shadow', 'Plain'];

const SUBS_ERROR = 'Not a valid subtitle file.';
const BURN_ERROR = 'Writing failed, please try again';
const HIDDEN_ERROR =
	'Burn failed because the tab was backgrounded. Please try again and keep it in focus.';

const FORMATS = supportedFormats();

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Flame = <template><IconSvg @name="flame" /></template>;
const PlayIcon = <template><IconSvg @name="play" /></template>;
const PauseIcon = <template><IconSvg @name="pause" /></template>;
const BackFrame = <template><IconSvg @name="chevron-left" /></template>;
const ForwardFrame = <template><IconSvg @name="chevron-right" /></template>;
const PreviousCue = <template><IconSvg @name="skip-back" /></template>;
const NextCue = <template><IconSvg @name="skip-forward" /></template>;
const PLACES = [
	{
		text: 'Top',
		icon: <template><IconSvg @name="arrow-up-to-line" /></template>,
	},
	{
		text: 'Middle',
		icon: <template><IconSvg @name="arrow-up-down" /></template>,
	},
	{
		text: 'Bottom',
		icon: <template>
			<IconSvg @name="arrow-down-to-line" />
		</template>,
	},
];

const tc = (ms: number) => formatTimestamp(ms, '.');
const rgb = (colour: string): Rgb => parseHex(colour) ?? [1, 1, 1];
const off = (on: boolean) => !on;

const sameBox = (a: TextBox | null, b: TextBox | null) =>
	a === b ||
	(!!a &&
		!!b &&
		a.x === b.x &&
		a.y === b.y &&
		a.width === b.width &&
		a.height === b.height);

export default class SubtitleStudioTool extends Component {
	intake = new VideoIntake({
		onLoad: (file) => this.#load(file),
		onReady: (video) => {
			this.#fitCanvas(video);
			void this.#probeEncoders(video);
		},
		probe: true,
		canLoad: () => !this.burning,
	});
	playback = new Playback();

	@tracked cues: Cue[] = [];
	@tracked subsName = '';
	@tracked subsFailed = false;
	@tracked style: BurnStyle = DEFAULT_STYLE;
	@tracked currentMs = 0;
	@tracked box: TextBox | null = null;
	@tracked frames: string[] = [];
	@tracked burning = false;
	@tracked burnPct = 0;
	@tracked resultBlob: Blob | null = null;
	@tracked resultUrl = '';
	@tracked resultExt = 'webm';
	@tracked resultSpeed = 0;
	@tracked info: Section[] = [];
	@tracked encoders: Set<BurnCodec> | null = null;
	@tracked errorCode: '' | 'burn' | 'hidden' = '';
	@tracked formatId = '';

	canvas: HTMLCanvasElement | null = null;

	#token = 0;
	#burnId = 0;
	#burnWatcher: AbortController | null = null;
	#subsToken = 0;
	#audio: {
		video: HTMLVideoElement;
		ctx: AudioContext;
		dest: MediaStreamAudioDestinationNode;
		gain: GainNode;
	} | null = null;
	#frame = 0;
	#frameKind: 'video' | 'raf' = 'raf';
	#launch: { at?: number; run?: boolean } = {};

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const index = (key: string) =>
			query.has(key) ? Number(query.get(key)) : undefined;
		const style = { ...DEFAULT_STYLE };
		style.font = FONTS[index('ssFont') ?? -1] ?? style.font;
		if (query.has('ssWeight')) style.bold = index('ssWeight') === 1;
		style.text = TEXT_STYLES[index('ssText') ?? -1] ?? style.text;
		const place = index('ssPlace');
		if (place !== undefined) style.y = placement(place, style.size);
		this.style = style;
		const subs = query.get('ssSubs');
		if (subs) {
			this.cues = parseSubtitles(subs).sort(
				(a, b) => a.start - b.start,
			);
			this.subsName = `subtitles.${detectFormat(subs) ?? 'srt'}`;
		}
		const at = index('ssAt');
		if (at !== undefined && Number.isFinite(at))
			this.#launch.at = at;
		this.#launch.run = query.get('ssRun') === '1';
		const sample = query.get('ssSample');
		if (sample?.startsWith('/') && !sample.startsWith('//'))
			void this.#fetchSample(sample);
	}

	async #fetchSample(url: string) {
		const response = await fetch(url).catch(() => null);
		if (!response?.ok || this.isDestroying) return;
		const blob = await response.blob();
		const name = url.split('/').pop() || 'video';
		this.intake.load(new File([blob], name, { type: blob.type }));
	}

	registerCanvas = modifier((element: HTMLCanvasElement) => {
		this.canvas = element;
		const video = this.intake.video;
		if (video?.videoWidth) this.#fitCanvas(video);
		return () => {
			if (this.canvas === element) this.canvas = null;
		};
	});

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#stopBurn();
		this.#cancelFrame();
		this.intake.release();
		this.#resetResult();
		release(this.frames);
		void this.#audio?.ctx.close();
	}

	get formats() {
		return this.encoders
			? supportedFormats(this.encoders)
			: FORMATS;
	}

	get format() {
		const formats = this.formats;
		return (
			formats.find(
				(f) => f.id === this.formatId && f.supported,
			) ?? formats.find((f) => f.supported)
		);
	}

	get formatLabels() {
		return this.formats.map((f) => f.label);
	}

	get formatIndex() {
		return Math.max(0, this.formats.indexOf(this.format!));
	}

	get unsupported() {
		return this.formats.flatMap((f, index) =>
			f.supported ? [] : [index],
		);
	}

	get loaded() {
		return this.intake.url !== null;
	}

	get playable() {
		return this.intake.duration > 0 && !this.burning;
	}

	get ready() {
		return this.playable && this.cues.length > 0 && !!this.format;
	}

	get shown() {
		return shown(this.cues, this.currentMs);
	}

	get markedIndex() {
		const shown = this.shown;
		return shown && !shown.ghost ? shown.index : null;
	}

	get lanes(): CueLane[] {
		return [{ cues: this.cues, active: this.markedIndex }];
	}

	get span() {
		return this.intake.duration * 1000 || undefined;
	}

	get aspect() {
		const { width, height } = this.intake;
		return width && height ? width / height : 16 / 9;
	}

	get previewAspect() {
		return Math.max(this.aspect, 1 / tallest);
	}

	get pictureName() {
		const shown = this.shown;
		return shown
			? stripTags(this.cues[shown.index]!.text)
			: this.intake.fileName;
	}

	get meta() {
		const { duration, width, height } = this.intake;
		if (!duration) return '';
		return `${width} × ${height} · ${formatFps(this.intake.fps)} · ${tc(duration * 1000)}`;
	}

	get videoDetail() {
		return this.intake.error || this.meta;
	}

	get cueCount() {
		return `${this.cues.length} cues`;
	}

	get isPlain() {
		return this.style.text === 'plain';
	}

	get fontIndex() {
		return FONTS.indexOf(this.style.font);
	}

	get textIndex() {
		return TEXT_STYLES.indexOf(this.style.text);
	}

	get weightIndex() {
		return this.style.bold ? 1 : 0;
	}

	get colour() {
		return rgb(this.style.colour);
	}

	get backing() {
		return rgb(this.style.backing);
	}

	get baseName() {
		return this.intake.baseName || 'video';
	}

	get fileName() {
		return `${this.baseName}-subtitled.${this.resultExt}`;
	}

	get resultRow() {
		if (!this.resultBlob) return null;
		const speed =
			this.resultSpeed > 0
				? ` · ${this.resultSpeed.toFixed(1)}×`
				: '';
		return {
			name: this.fileName,
			detail: `${this.resultExt} · ${formatBytes(this.resultBlob.size)}${speed}`,
		};
	}

	get failed() {
		return this.errorCode !== '';
	}

	get jumps() {
		return this.playable && this.cues.length > 0;
	}

	get failure() {
		return this.errorCode === 'hidden' ? HIDDEN_ERROR : BURN_ERROR;
	}

	get progress() {
		return this.burnPct / 100;
	}

	#load(file: File) {
		this.#stopBurn();
		this.#resetResult();
		this.#token++;
		release(this.frames);
		this.frames = [];
		this.encoders = null;
		this.box = null;
		this.currentMs = 0;
		const token = this.#token;
		const live = () => token === this.#token;
		void thumbnails(file, live).then((urls) => {
			if (!live()) return release(urls);
			this.frames = urls;
		});
	}

	readSubs = async (file: File) => {
		if (this.burning) return;
		const token = ++this.#subsToken;
		const cues = parseSubtitles(await file.text());
		if (this.isDestroying || token !== this.#subsToken) return;
		if (cues.length === 0) {
			this.subsFailed = true;
			return;
		}
		this.#setCues(cues, file.name);
	};

	#setCues(cues: Cue[], name: string) {
		this.cues = cues.slice().sort((a, b) => a.start - b.start);
		this.subsName = name;
		this.subsFailed = false;
		this.#resetResult();
		this.draw();
	}

	readAny = (file: File) => {
		if (SUBS_RE.test(file.name)) void this.readSubs(file);
		else this.intake.load(file);
	};

	readFiles = (files: File[]) => files.forEach(this.readAny);

	allowDrop = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	dropAnywhere = (event: DragEvent) => {
		if (event.defaultPrevented) return;
		const files = [...(event.dataTransfer?.files ?? [])].filter(
			(f) => matchesAccept(f, ANY),
		);
		if (files.length === 0) return;
		event.preventDefault();
		this.readFiles(files);
	};

	#patch(patch: Partial<BurnStyle>) {
		if (this.burning) return;
		this.style = { ...this.style, ...patch };
		this.#resetResult();
		this.draw();
	}

	pickFont = (index: number) => this.#patch({ font: FONTS[index] });

	pickWeight = (index: number) => this.#patch({ bold: index === 1 });

	setSize = (size: number) => this.#patch({ size });

	setWidth = (width: number) => this.#patch({ width });

	pickText = (index: number) => this.#patch({ text: TEXT_STYLES[index] });

	setColour = (colour: Rgb) => this.#patch({ colour: hex(colour) });

	setBacking = (colour: Rgb) => this.#patch({ backing: hex(colour) });

	move = (x: number, y: number) => this.#patch(clampPosition(x, y));

	place = (index: number) =>
		this.#patch({ x: 0, y: placement(index, this.style.size) });

	pickFormat = (index: number) => {
		const format = this.formats[index];
		if (!format) return;
		this.formatId = format.id;
		this.#resetResult();
	};

	editCue = (index: number, cue: Cue) => {
		if (this.burning) return;
		const next = this.cues.slice();
		next[index] = cue;
		this.cues = next;
		this.#resetResult();
		this.draw();
	};

	toggle = () => {
		if (this.burning) return;
		void this.#audio?.ctx.resume();
		this.playback.toggle();
	};

	scrub = (seconds: number) => {
		if (!this.burning) this.playback.scrub(seconds);
	};

	seekCue = (index: number) => {
		const cue = this.cues[index];
		if (!cue || !this.playable) return;
		this.playback.pause();
		this.scrub(
			Math.min(
				cue.start / 1000 + 1 / this.intake.fps,
				cue.end / 1000,
			),
		);
	};

	step = (frames: number) => {
		const video = this.intake.video;
		if (!video || !this.playable) return;
		this.playback.pause();
		this.scrub(
			Math.min(
				Math.max(
					video.currentTime +
						frames / this.intake.fps,
					0,
				),
				this.intake.duration,
			),
		);
	};

	jump = (offset: -1 | 1) => {
		const target = jumpTarget(this.cues, this.currentMs, offset);
		if (target !== null) this.seekCue(target);
	};

	syncPlaying = (event: Event) => {
		this.intake.syncPlaying(event);
		if (this.intake.playing) this.#loop();
	};

	draw = () => {
		const video = this.intake.video;
		const canvas = this.canvas;
		if (!video || !canvas || !canvas.width) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const { width, height } = canvas;
		ctx.drawImage(video, 0, 0, width, height);
		const ms = video.currentTime * 1000;
		this.currentMs = ms;
		const on = this.burning ? null : shown(this.cues, ms);
		const cue = on ? this.cues[on.index] : activeCue(this.cues, ms);
		ctx.globalAlpha = on?.ghost ? GHOST : 1;
		const drawn = cue
			? drawSubtitle(ctx, cue.text, width, height, this.style)
			: null;
		ctx.globalAlpha = 1;
		const box = drawn && {
			x: drawn.x / width,
			y: drawn.y / height,
			width: drawn.width / width,
			height: drawn.height / height,
		};
		if (!sameBox(box, this.box)) this.box = box;
		if (this.burning && this.intake.duration) {
			const pct = Math.round(
				(100 * ms) / (this.intake.duration * 1000),
			);
			if (pct !== this.burnPct) this.burnPct = pct;
		}
	};

	#loop = () => {
		this.#cancelFrame();
		if (!this.intake.playing && !this.burning) return;
		this.draw();
		const video = this.intake.video;
		if (video && 'requestVideoFrameCallback' in video) {
			this.#frameKind = 'video';
			this.#frame = video.requestVideoFrameCallback(
				this.#loop,
			);
		} else {
			this.#frameKind = 'raf';
			this.#frame = requestAnimationFrame(this.#loop);
		}
	};

	#cancelFrame() {
		if (this.#frameKind === 'video')
			this.intake.video?.cancelVideoFrameCallback(
				this.#frame,
			);
		else cancelAnimationFrame(this.#frame);
	}

	async #probeEncoders(video: HTMLVideoElement) {
		const file = this.intake.file;
		const encoders = await encodableCodecs(
			video.videoWidth,
			video.videoHeight,
		);
		if (this.isDestroying || this.intake.file !== file) return;
		this.encoders = encoders?.size ? encoders : null;
		const { at, run } = this.#launch;
		this.#launch = {};
		if (at !== undefined) this.scrub(at);
		if (run) this.burn();
	}

	#fitCanvas(video: HTMLVideoElement) {
		const canvas = this.canvas;
		if (!canvas) return;
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		this.draw();
	}

	#audioGraph(video: HTMLVideoElement) {
		if (this.#audio?.video === video) return this.#audio;
		void this.#audio?.ctx.close();
		const ctx = new AudioContext();
		const source = ctx.createMediaElementSource(video);
		const dest = ctx.createMediaStreamDestination();
		const gain = ctx.createGain();
		source.connect(dest);
		source.connect(gain);
		gain.connect(ctx.destination);
		this.#audio = { video, ctx, dest, gain };
		return this.#audio;
	}

	burn = () => {
		if (!this.ready) return;
		this.playback.pause();
		if (this.encoders) void this.#burnFast();
		else void this.#burnLive();
	};

	async #burnFast() {
		const file = this.intake.file;
		const canvas = this.canvas;
		const format = this.format;
		if (!file || !canvas || !format || !this.ready) return;
		const id = ++this.#burnId;
		this.burning = true;
		this.burnPct = 0;
		this.errorCode = '';
		this.#resetResult();
		const watcher = new AbortController();
		this.#burnWatcher = watcher;
		const cues = this.cues;
		const style = this.style;
		const started = performance.now();
		try {
			const result = await burnVideo(file, {
				container: format.ext,
				codec: format.codec,
				bitrate: bitrateFor(
					canvas.width,
					canvas.height,
					this.intake.fps,
				),
				overlay: (seconds) => {
					const cue = activeCue(
						cues,
						seconds * 1000,
					);
					return cue
						? (ctx, width, height) =>
								void drawSubtitle(
									ctx,
									cue.text,
									width,
									height,
									style,
								)
						: null;
				},
				onProgress: (fraction) => {
					if (id !== this.#burnId) return;
					const pct = Math.round(fraction * 100);
					if (pct !== this.burnPct)
						this.burnPct = pct;
				},
				signal: watcher.signal,
			});
			if (id !== this.#burnId) return;
			this.resultSpeed =
				this.intake.duration /
				((performance.now() - started) / 1000);
			this.#finish(result.blob, result.ext, id);
		} catch (error) {
			if (id !== this.#burnId) return;
			if ((error as Error).name === 'AbortError') return;
			console.error('Burn failed:', error);
			this.errorCode = 'burn';
		} finally {
			watcher.abort();
			if (this.#burnWatcher === watcher)
				this.#burnWatcher = null;
			if (id === this.#burnId) this.burning = false;
		}
	}

	async #burnLive() {
		const video = this.intake.video;
		const canvas = this.canvas;
		if (!video || !canvas || !this.ready) return;
		const id = ++this.#burnId;
		this.burning = true;
		this.burnPct = 0;
		this.errorCode = '';
		this.#resetResult();
		let stream: MediaStream | null = null;
		let active: MediaRecorder | null = null;
		const watcher = new AbortController();
		this.#burnWatcher = watcher;
		try {
			video.pause();
			await seekTo(video, 0);
			const audio = this.#audioGraph(video);
			await audio.ctx.resume();
			audio.gain.gain.value = 0;
			stream = canvas.captureStream(CAPTURE_FPS);
			for (const track of audio.dest.stream.getAudioTracks())
				stream.addTrack(track);
			const format = this.format!;
			const recorder = new MediaRecorder(stream, {
				mimeType: format.mime,
				videoBitsPerSecond: bitrateFor(
					canvas.width,
					canvas.height,
					CAPTURE_FPS,
				),
				audioBitsPerSecond: 128_000,
			});
			active = recorder;
			const chunks: Blob[] = [];
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0)
					chunks.push(event.data);
			};
			const stopped = new Promise<void>((resolve) => {
				recorder.onstop = () => resolve();
			});
			this.draw();
			recorder.start(250);
			const ended = new Promise<void>((resolve) =>
				video.addEventListener(
					'ended',
					() => resolve(),
					{
						once: true,
						signal: watcher.signal,
					},
				),
			);
			const aborted = new Promise<never>((_, reject) =>
				watcher.signal.addEventListener('abort', () =>
					reject(new Error('stopped')),
				),
			);
			const hidden = new Promise<never>((_, reject) =>
				document.addEventListener(
					'visibilitychange',
					() => {
						if (document.hidden)
							reject(
								new Error(
									'hidden',
								),
							);
					},
					{ signal: watcher.signal },
				),
			);
			await video.play();
			this.#loop();
			await Promise.race([ended, hidden, aborted]);
			if (id !== this.#burnId) return;
			this.draw();
			recorder.stop();
			await stopped;
			if (id !== this.#burnId) return;
			const blob = new Blob(chunks, {
				type: recorder.mimeType || 'video/webm',
			});
			this.#finish(blob, format.ext, id);
		} catch (error) {
			const message = (error as Error).message;
			if (message !== 'hidden' && message !== 'stopped')
				console.error('Burn failed:', error);
			if (id === this.#burnId)
				this.errorCode =
					message === 'hidden'
						? 'hidden'
						: 'burn';
		} finally {
			for (const track of stream?.getVideoTracks() ?? [])
				track.stop();
			watcher.abort();
			if (this.#burnWatcher === watcher)
				this.#burnWatcher = null;
			if (active && active.state !== 'inactive')
				active.stop();
			video.pause();
			if (id === this.#burnId) {
				this.burning = false;
				if (this.#audio)
					this.#audio.gain.gain.value = 1;
			}
		}
	}

	#finish(blob: Blob, ext: string, id: number) {
		this.resultBlob = blob;
		this.resultUrl = URL.createObjectURL(blob);
		this.resultExt = ext;
		this.burnPct = 100;
		void this.#describe(blob, id);
	}

	async #describe(blob: Blob, id: number) {
		try {
			const tracks = await analyzeMedia(
				new File([blob], this.fileName, {
					type: blob.type,
				}),
			);
			if (id === this.#burnId && this.resultBlob === blob)
				this.info = sections(tracks);
		} catch {
			// no report: the sidebar stays empty
		}
	}

	#stopBurn() {
		this.#burnId++;
		this.#burnWatcher?.abort();
		this.#burnWatcher = null;
		this.intake.video?.pause();
		this.burning = false;
		if (this.#audio) this.#audio.gain.gain.value = 1;
	}

	#resetResult() {
		if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
		this.resultUrl = '';
		this.resultBlob = null;
		this.resultSpeed = 0;
		this.burnPct = 0;
		this.info = [];
	}

	cancel = () => {
		this.#stopBurn();
		this.#resetResult();
	};

	save = () => {
		if (this.resultUrl) downloadUrl(this.resultUrl, this.fileName);
	};

	clear = () => {
		this.#stopBurn();
		this.#resetResult();
		this.#token++;
		this.playback.unload();
		this.intake.clear();
		release(this.frames);
		this.frames = [];
		this.encoders = null;
		this.errorCode = '';
		this.currentMs = 0;
		this.box = null;
	};

	clearSubs = () => {
		if (this.burning) return;
		this.#subsToken++;
		this.cues = [];
		this.subsName = '';
		this.subsFailed = false;
		this.#resetResult();
		this.draw();
	};

	<template>
		<CanonSplit
			class="subtitle-studio"
			@bannerSticks={{true}}
			@mainLeadsStacked={{true}}
			{{filePaste this.readAny accept=ANY}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
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
						@lamps={{LAMPS}}
					>
						<div class="ss-strips">
							<Strips
								@thumbnails={{this.frames}}
								@aspect={{this.aspect}}
								@duration={{this.intake.duration}}
								@playhead={{this.playback.playhead}}
								@onScrub={{this.scrub}}
								@blank={{off
									this.loaded
								}}
							/>
							<CueTimeline
								class="ss-lane"
								@lanes={{this.lanes}}
								@span={{this.span}}
								@playhead={{this.playback.playhead}}
								@onScrub={{if
									this.playable
									this.scrub
								}}
								@onCue={{if
									this.playable
									this.seekCue
								}}
							/>
						</div>
					</CanonReadoutBand>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows class="ss-look" @framed={{true}}>
					<CanonHeading @text="Font" />
					<CanonSegmented
						class="ss-font"
						aria-label="Font"
						@items={{FONT_LABELS}}
						@columns={{4}}
						@selected={{this.fontIndex}}
						@disabled={{this.burning}}
						@onChange={{this.pickFont}}
					/>
					<CanonSegmented
						class="ss-weight"
						aria-label="Weight"
						@items={{WEIGHTS}}
						@selected={{this.weightIndex}}
						@disabled={{this.burning}}
						@onChange={{this.pickWeight}}
					/>
					<CanonRow
						class="ss-size"
						@title="Size"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.style.size}}
							@min={{SIZE_MIN}}
							@max={{SIZE_MAX}}
							@step={{0.01}}
							@labelledBy={{titleId}}
							@onChange={{this.setSize}}
						/>
					</CanonRow>
					<CanonRow
						class="ss-width"
						@title="Width"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.style.width}}
							@min={{WIDTH_MIN}}
							@max={{WIDTH_MAX}}
							@step={{0.05}}
							@labelledBy={{titleId}}
							@onChange={{this.setWidth}}
						/>
					</CanonRow>
					<CanonHeading @text="Style" />
					<CanonSegmented
						class="ss-text"
						aria-label="Style"
						@items={{TEXT_LABELS}}
						@columns={{4}}
						@selected={{this.textIndex}}
						@disabled={{this.burning}}
						@onChange={{this.pickText}}
					/>
					<CanonColourWell
						class="ss-colour"
						@label="Text"
						@colour={{this.colour}}
						@onChange={{this.setColour}}
					/>
					{{#unless this.isPlain}}
						<CanonColourWell
							class="ss-backing"
							@label="Backing"
							@colour={{this.backing}}
							@onChange={{this.setBacking}}
						/>
					{{/unless}}
					<CanonHeading @text="Position" />
					<CanonGrid class="ss-place">
						{{#each PLACES as |item index|}}
							<CanonButton
								@kind="cell"
								@text={{item.text}}
								@icon={{item.icon}}
								@disabled={{or
									this.burning
									(eq
										this.cues.length
										0
									)
								}}
								@onClick={{fn
									this.place
									index
								}}
							/>
						{{/each}}
					</CanonGrid>
				</CanonRows>
				<CanonRows class="ss-export" @framed={{true}}>
					<CanonHeading @text="Format" />
					<CanonSegmented
						class="ss-format"
						aria-label="Format"
						@items={{this.formatLabels}}
						@columns={{2}}
						@selected={{this.formatIndex}}
						@disabledIndices={{this.unsupported}}
						@disabled={{this.burning}}
						@onChange={{this.pickFormat}}
					/>
					<Job
						@title="Burn"
						@icon={{Flame}}
						@failure={{this.failure}}
						@disabled={{off this.ready}}
						@busy={{this.burning}}
						@progress={{this.progress}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.burn}}
						@onCancel={{this.cancel}}
						@onSave={{this.save}}
					/>
				</CanonRows>
				<Sections @sections={{this.info}} />
			</:sidebar>
			<:main>
				<CanonCanvas
					class="ss-preview"
					@aspect={{this.previewAspect}}
					@maxHeight={{tallestPreview}}
					@boxing="unlessWide"
					@background={{if this.loaded "#000"}}
				>
					{{#if this.loaded}}
						<Picture
							@aspect={{this.aspect}}
							@box={{this.box}}
							@style={{this.style}}
							@disabled={{this.burning}}
							@onMove={{this.move}}
						>
							{{! template-lint-disable require-media-caption }}
							<video
								src={{this.intake.url}}
								playsinline
								preload="auto"
								hidden
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
								{{on
									"play"
									this.syncPlaying
								}}
								{{on
									"pause"
									this.syncPlaying
								}}
								{{on
									"seeked"
									this.draw
								}}
							></video>
							<canvas
								class="ss-canvas"
								role="img"
								aria-label={{this.pictureName}}
								{{this.registerCanvas}}
							></canvas>
						</Picture>
					{{else}}
						<div
							class="ss-board"
							style={{BLANK_BOARD}}
						>
							<span
								class="ss-picture ss-blank"
							></span>
						</div>
					{{/if}}
				</CanonCanvas>
				<CanonRows class="ss-source" @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="ss-video"
							@title={{this.intake.fileName}}
							@detail={{this.videoDetail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{this.burning}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<Slot
							class="ss-video-slot"
							@prompt="Choose video file"
							@icon="film"
							@row={{true}}
							@multiple={{true}}
							@accept={{ANY}}
							@onFiles={{this.readFiles}}
						/>
						{{#if this.intake.error}}
							<CanonStatus
								@text={{this.intake.error}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					{{/if}}
					<CanonHeading @text="Subtitles" />
					{{#if this.cues.length}}
						<CanonRow
							class="ss-subs"
							@title={{this.subsName}}
							@detail={{this.cueCount}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{this.burning}}
								@onClick={{this.clearSubs}}
							/>
						</CanonRow>
					{{else}}
						<Slot
							class="ss-subs-drop"
							@prompt="SRT or VTT"
							@icon="captions"
							@row={{true}}
							@multiple={{true}}
							@accept={{SUBS}}
							@onFiles={{this.readFiles}}
						/>
					{{/if}}
					{{#if this.subsFailed}}
						<CanonStatus
							class="ss-subs-error"
							@text={{SUBS_ERROR}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				{{#if this.cues.length}}
					<CanonRows
						class="ss-cues"
						@framed={{true}}
					>
						<CanonHeading
							@text="Subtitles"
						/>
						{{#each
							this.cues key="@index"
							as |cue index|
						}}
							<CueRow
								@index={{index}}
								@cue={{cue}}
								@editable={{true}}
								@marked={{eq
									index
									this.markedIndex
								}}
								@onChange={{fn
									this.editCue
									index
								}}
								@onSelect={{fn
									this.seekCue
									index
								}}
							/>
						{{/each}}
					</CanonRows>
				{{else}}
					<CanonRows
						class="ss-cues"
						@framed={{true}}
					>
						<CanonHeading
							@text="Subtitles"
						/>
						<CanonEmptyRow
							class="ss-cues-blank"
							@text=""
						/>
					</CanonRows>
				{{/if}}
			</:main>
			<:footer>
				<CanonGrid class="ss-transport">
					<CanonButton
						class="ss-previous"
						@label="Previous cue"
						@icon={{PreviousCue}}
						@disabled={{off this.jumps}}
						@onClick={{fn this.jump -1}}
					/>
					<CanonButton
						class="ss-back"
						@label="Back one frame"
						@icon={{BackFrame}}
						@repeats={{true}}
						@disabled={{off this.playable}}
						@onClick={{fn this.step -1}}
					/>
					<CanonButton
						class="ss-play"
						@kind="primary"
						@text={{if
							this.playback.playing
							"Pause"
							"Play"
						}}
						@icon={{if
							this.playback.playing
							PauseIcon
							PlayIcon
						}}
						@disabled={{off this.playable}}
						@onClick={{this.toggle}}
					/>
					<CanonButton
						class="ss-forward"
						@label="Forward one frame"
						@icon={{ForwardFrame}}
						@repeats={{true}}
						@disabled={{off this.playable}}
						@onClick={{fn this.step 1}}
					/>
					<CanonButton
						class="ss-next"
						@label="Next cue"
						@icon={{NextCue}}
						@disabled={{off this.jumps}}
						@onClick={{fn this.jump 1}}
					/>
				</CanonGrid>
			</:footer>
		</CanonSplit>
	</template>
}
