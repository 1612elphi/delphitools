import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { formatTimestamp, parseTimestamp } from 'delphitools-v2/lib/subtitles';
import { VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import {
	formatFps,
	type Container,
	type VideoProbe,
} from 'delphitools-v2/lib/media-probe';
import {
	CONTAINERS,
	containerSupport,
	trimVideo,
	type TrimResult,
} from 'delphitools-v2/lib/media-convert';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);
const tc = (ms: number) => formatTimestamp(ms, '.');

type Mode = 'keyframe' | 'exact';
const MODES: { id: Mode; label: string }[] = [
	{ id: 'keyframe', label: 'Keyframe' },
	{ id: 'exact', label: 'Exact' },
];

const DROP_TITLE = 'Drop a video file';

const TRIM_ERROR = "Couldn't process. Try MP4, MOV or WEBM";

export default class VideoTrimmerTool extends Component {
	intake = new VideoIntake({
		onLoad: () => this.#reset(),
		onReady: () => {
			this.outMs = Math.round(this.intake.duration * 1000);
		},
		probe: true,
		onProbe: (probe) => void this.#support(probe),
		canLoad: () => !this.busy,
	});

	@tracked inMs = 0;
	@tracked outMs = 0;
	@tracked mode: Mode = 'keyframe';
	@tracked container: Container | '' = '';
	@tracked support: Record<Container, boolean> | null = null;
	@tracked busy = false;
	@tracked pct = 0;
	@tracked result: TrimResult | null = null;
	@tracked resultUrl = '';
	@tracked errorCode = '';

	#token = 0;
	#abort: AbortController | null = null;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#abort?.abort();
		this.intake.release();
		this.#releaseResult();
	}

	get hasVideo() {
		return this.intake.url !== null;
	}

	get targetContainer(): Container {
		return this.container || this.intake.probe?.container || 'mp4';
	}

	get containers() {
		return CONTAINERS.map((c) => ({
			...c,
			supported: this.support?.[c.id] ?? false,
		}));
	}

	get ready() {
		return (
			!this.busy &&
			this.intake.duration > 0 &&
			this.outMs > this.inMs &&
			this.support?.[this.targetContainer] === true
		);
	}

	get baseName() {
		return this.intake.baseName || 'video';
	}

	get meta() {
		const { duration, width, height, fps } = this.intake;
		if (!duration) return '';
		return `${width} × ${height} · ${formatFps(fps)} · ${tc(duration * 1000)}`;
	}

	get inLabel() {
		return tc(this.inMs);
	}

	get outLabel() {
		return tc(this.outMs);
	}

	get selectionLabel() {
		return tc(Math.max(0, this.outMs - this.inMs));
	}

	get rangeStyle() {
		const total = this.intake.duration * 1000;
		if (!total) return htmlSafe('left: 0; width: 0');
		const left = (100 * this.inMs) / total;
		const width =
			(100 * Math.max(0, this.outMs - this.inMs)) / total;
		return htmlSafe(
			`left: ${left.toFixed(3)}%; width: ${width.toFixed(3)}%`,
		);
	}

	get progressStyle() {
		return htmlSafe(`width: ${this.pct}%`);
	}

	get resultLabel() {
		const r = this.result;
		if (!r) return '';
		return `${r.ext} · ${formatBytes(r.blob.size)} · ${tc(r.start * 1000)} – ${tc(r.end * 1000)}`;
	}

	get errorMessage() {
		if (this.intake.error) return this.intake.error;
		if (this.errorCode === 'trim') return TRIM_ERROR;
		return '';
	}

	async #support(probe: VideoProbe | null) {
		const token = ++this.#token;
		if (!probe) {
			this.errorCode = 'trim';
			return;
		}
		const support = await containerSupport(probe.codec);
		if (token !== this.#token) return;
		this.support = support;
	}

	setMode = (mode: Mode) => {
		this.mode = mode;
		this.#releaseResult();
	};

	setContainer = (event: Event) => {
		this.container = (event.target as HTMLSelectElement).value as
			Container | '';
		this.#releaseResult();
	};

	// Unparseable input snaps back to the current value on commit, so the
	// field never shows a time the cut would not use.
	#setPoint(key: 'inMs' | 'outMs', event: Event) {
		const input = event.target as HTMLInputElement;
		const ms = parseTimestamp(input.value);
		if (ms === null) {
			input.value = tc(this[key]);
			return;
		}
		this[key] = Math.max(
			0,
			Math.min(this.intake.duration * 1000, ms),
		);
		// An unchanged value leaves the tracked field alone, so the field is
		// normalised by hand too.
		input.value = tc(this[key]);
		this.#releaseResult();
	}

	setIn = (event: Event) => this.#setPoint('inMs', event);
	setOut = (event: Event) => this.#setPoint('outMs', event);

	markPoint = (key: 'inMs' | 'outMs') => {
		const video = this.intake.video;
		if (!video) return;
		this[key] = Math.round(video.currentTime * 1000);
		this.#releaseResult();
	};

	trim = () => void this.#trim();

	async #trim() {
		const file = this.intake.file;
		if (!file || !this.ready) return;
		const token = ++this.#token;
		this.busy = true;
		this.pct = 0;
		this.errorCode = '';
		this.#releaseResult();
		this.intake.video?.pause();
		const abort = new AbortController();
		this.#abort = abort;
		try {
			const result = await trimVideo(file, {
				start: this.inMs / 1000,
				end: this.outMs / 1000,
				mode: this.mode,
				container: this.targetContainer,
				signal: abort.signal,
				onProgress: (fraction) => {
					if (token !== this.#token) return;
					const pct = Math.round(fraction * 100);
					if (pct !== this.pct) this.pct = pct;
				},
			});
			if (token !== this.#token) return;
			this.result = result;
			this.resultUrl = URL.createObjectURL(result.blob);
			this.pct = 100;
		} catch (error) {
			if (token !== this.#token) return;
			if ((error as Error).name === 'AbortError') return;
			console.error('Trim failed:', error);
			this.errorCode = 'trim';
		} finally {
			if (this.#abort === abort) this.#abort = null;
			if (token === this.#token) this.busy = false;
		}
	}

	download = () => {
		if (!this.result) return;
		downloadBlob(
			this.result.blob,
			`${this.baseName}-${tc(this.result.start * 1000).replace(/[:.]/g, '-')}.${this.result.ext}`,
		);
	};

	#releaseResult() {
		if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
		this.resultUrl = '';
		this.result = null;
	}

	#reset() {
		this.#token++;
		this.#abort?.abort();
		this.#abort = null;
		this.#releaseResult();
		this.support = null;
		this.container = '';
		this.inMs = 0;
		this.outMs = 0;
		this.busy = false;
		this.pct = 0;
		this.errorCode = '';
	}

	clear = () => {
		this.#reset();
		this.intake.clear();
	};

	<template>
		<div class="dt-vt" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-vt-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				<div class="dt-vt-bar">
					<label
						class="dt-vt-file"
						aria-label="Open video file"
					>
						<input
							type="file"
							class="dt-sr-only"
							accept={{ACCEPT}}
							{{on
								"change"
								this.intake.chooseFile
							}}
						/>
						<Icon @name="film" />
						<span
							class="dt-vt-filename"
						>{{if
								this.intake.fileName
								this.intake.fileName
								"Choose video"
							}}</span>
					</label>
					<select
						class="dt-vt-format"
						aria-label="Output container"
						{{on
							"change"
							this.setContainer
						}}
					>
						<option
							value=""
							selected={{eq
								this.container
								""
							}}
						>Same as source</option>
						{{#each
							this.containers key="id"
							as |c|
						}}
							<option
								value={{c.id}}
								disabled={{unless
									c.supported
									true
								}}
								selected={{eq
									this.container
									c.id
								}}
							>{{c.label}}</option>
						{{/each}}
					</select>
					<button
						type="button"
						class="dt-vt-go"
						disabled={{unless
							this.ready
							true
						}}
						aria-busy={{if
							this.busy
							"true"
							"false"
						}}
						{{on "click" this.trim}}
					>
						{{#if this.busy}}
							<NdsLoader />
						{{else}}
							<Icon
								@name="scissors"
							/>
						{{/if}}
						<span>Trim</span>
					</button>
					<button
						type="button"
						class="dt-vt-clear"
						disabled={{unless
							this.hasVideo
							true
						}}
						aria-label="Clear"
						{{on "click" this.clear}}
					>
						<Icon @name="x" />
					</button>
				</div>

				<div class="dt-vt-settings">
					<div class="dt-vt-set">
						<span
							class="dt-vt-label"
						>In</span>
						<div class="dt-vt-point">
							<input
								type="text"
								class="dt-vt-tc"
								spellcheck="false"
								aria-label="In"
								value={{this.inLabel}}
								{{on
									"change"
									this.setIn
								}}
							/>
							<button
								type="button"
								class="dt-vt-mark"
								disabled={{unless
									this.hasVideo
									true
								}}
								{{on
									"click"
									(fn
										this.markPoint
										"inMs"
									)
								}}
							>Mark</button>
						</div>
					</div>
					<div class="dt-vt-set">
						<span
							class="dt-vt-label"
						>Out</span>
						<div class="dt-vt-point">
							<input
								type="text"
								class="dt-vt-tc"
								spellcheck="false"
								aria-label="Out"
								value={{this.outLabel}}
								{{on
									"change"
									this.setOut
								}}
							/>
							<button
								type="button"
								class="dt-vt-mark"
								disabled={{unless
									this.hasVideo
									true
								}}
								{{on
									"click"
									(fn
										this.markPoint
										"outMs"
									)
								}}
							>Mark</button>
						</div>
					</div>
					<div class="dt-vt-set">
						<span
							class="dt-vt-label"
						>Cut</span>
						<div
							class="segmented dt-vt-modes"
						>
							{{#each
								MODES key="id"
								as |m|
							}}
								<button
									type="button"
									class="dt-vt-seg
										{{if
											(eq
												this.mode
												m.id
											)
											'is-active'
										}}"
									aria-pressed={{if
										(eq
											this.mode
											m.id
										)
										"true"
										"false"
									}}
									{{on
										"click"
										(fn
											this.setMode
											m.id
										)
									}}
								>{{m.label}}</button>
							{{/each}}
						</div>
					</div>
					<div class="dt-vt-set">
						<span
							class="dt-vt-label"
						>Length</span>
						<span
							class="dt-vt-readout"
						>{{this.selectionLabel}}</span>
					</div>
				</div>

				<div class="dt-vt-stage">
					{{#if this.hasVideo}}
						{{#if this.resultUrl}}
							{{! the cut output, so the result can be checked before download }}
							{{! template-lint-disable require-media-caption }}
							<video
								class="dt-vt-result"
								src={{this.resultUrl}}
								controls
								playsinline
								preload="metadata"
							></video>
						{{/if}}
						{{! the source stays mounted (hidden behind a result) so readiness fires once per file }}
						{{! template-lint-disable require-media-caption }}
						<video
							src={{this.intake.url}}
							hidden={{if
								this.resultUrl
								true
							}}
							playsinline
							preload="auto"
							{{this.intake.register}}
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
								this.intake.syncPlaying
							}}
							{{on
								"pause"
								this.intake.syncPlaying
							}}
						></video>
						{{#if this.meta}}
							<span
								class="dt-vt-meta"
							>{{this.meta}}</span>
						{{/if}}
					{{else}}
						<label class="dt-vt-drop">
							<input
								type="file"
								class="dt-sr-only"
								accept={{ACCEPT}}
								{{on
									"change"
									this.intake.chooseFile
								}}
							/>
							<Icon
								@name="scissors"
							/>
							<span
								class="dt-vt-drop-title"
							>{{DROP_TITLE}}</span>
							{{! hint reused verbatim from Background Remover }}
							<span
								class="dt-vt-drop-hint"
							>or click to select a
								file, or paste</span>
						</label>
					{{/if}}
				</div>

				{{#if this.hasVideo}}
					{{! the transport drives the source, which is hidden while a result shows }}
					{{#unless this.resultUrl}}
						<div
							class="dt-vt-range"
							aria-hidden="true"
						>
							<span
								class="dt-vt-range-fill"
								style={{this.rangeStyle}}
							></span>
						</div>
						<div class="dt-vt-transport">
							<button
								type="button"
								class="dt-vt-tbtn"
								aria-label="Back 5 seconds"
								{{on
									"click"
									(fn
										this.intake.jumpBy
										-5
									)
								}}
							>
								<Icon
									@name="rewind"
								/>
								<span>5 s</span>
							</button>
							<button
								type="button"
								class="dt-vt-tbtn"
								aria-label="Back 1 second"
								{{on
									"click"
									(fn
										this.intake.jumpBy
										-1
									)
								}}
							>
								<Icon
									@name="chevrons-left"
								/>
								<span>1 s</span>
							</button>
							<button
								type="button"
								class="dt-vt-tbtn"
								aria-label="Back one frame"
								{{on
									"click"
									(fn
										this.intake.jumpFrame
										-1
									)
								}}
							>
								<Icon
									@name="chevron-left"
								/>
								<span
								>Frame</span>
							</button>
							<button
								type="button"
								class="dt-vt-tbtn is-play"
								{{on
									"click"
									this.intake.togglePlayback
								}}
							>
								<Icon
									@name={{if
										this.intake.playing
										"pause"
										"play"
									}}
								/>
								<span>{{if
										this.intake.playing
										"Pause"
										"Play"
									}}</span>
							</button>
							<button
								type="button"
								class="dt-vt-tbtn"
								aria-label="Forward one frame"
								{{on
									"click"
									(fn
										this.intake.jumpFrame
										1
									)
								}}
							>
								<Icon
									@name="chevron-right"
								/>
								<span
								>Frame</span>
							</button>
							<button
								type="button"
								class="dt-vt-tbtn"
								aria-label="Forward 1 second"
								{{on
									"click"
									(fn
										this.intake.jumpBy
										1
									)
								}}
							>
								<Icon
									@name="chevrons-right"
								/>
								<span>1 s</span>
							</button>
							<button
								type="button"
								class="dt-vt-tbtn"
								aria-label="Forward 5 seconds"
								{{on
									"click"
									(fn
										this.intake.jumpBy
										5
									)
								}}
							>
								<Icon
									@name="fast-forward"
								/>
								<span>5 s</span>
							</button>
						</div>
					{{/unless}}
				{{/if}}

				{{#if this.result}}
					<div class="dt-vt-out">
						<span
							class="dt-vt-out-label"
						>Cut</span>
						<span
							class="dt-vt-result-label"
						>{{this.resultLabel}}</span>
						<button
							type="button"
							class="dt-vt-btn is-primary"
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel />
						</button>
					</div>
				{{/if}}

				{{#if this.errorMessage}}
					<p
						class="dt-vt-error"
						role="alert"
					>{{this.errorMessage}}</p>
				{{/if}}

				{{#if this.busy}}
					<span
						class="dt-vt-progress"
						role="progressbar"
						aria-label="Progress"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={{this.pct}}
					>
						<span
							style={{this.progressStyle}}
						></span>
					</span>
				{{/if}}
			</div>
		</div>
	</template>
}
