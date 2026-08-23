import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
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
	CONTAINERS,
	containerSupport,
	muteVideo,
	type ConvertResult,
} from 'delphitools-v2/lib/media-convert';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);

const DROP_TITLE = 'Drop a video here';

const NO_AUDIO = 'No audio track';

const MUTE_ERROR = "Couldn't remux. Try MP4, MOV or WEBM.";

export default class VideoMuterTool extends Component {
	intake = new VideoIntake({
		onLoad: () => this.#reset(),
		probe: true,
		onProbe: (probe) => void this.#support(probe),
		canLoad: () => !this.busy,
	});

	@tracked support: Record<Container, boolean> | null = null;
	@tracked container: Container | '' = '';
	@tracked busy = false;
	@tracked pct = 0;
	@tracked result: ConvertResult | null = null;
	@tracked resultUrl = '';
	@tracked errorCode = '';

	#token = 0;
	#muteAbort: AbortController | null = null;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#muteAbort?.abort();
		this.intake.release();
		this.#releaseResult();
	}

	get hasVideo() {
		return this.intake.url !== null;
	}

	get silent() {
		return (
			this.intake.probe !== null &&
			this.intake.probe.audioTracks === 0
		);
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
			!this.silent &&
			this.support?.[this.targetContainer] === true
		);
	}

	setContainer = (event: Event) => {
		this.container = (event.target as HTMLSelectElement).value as
			Container | '';
		this.#releaseResult();
	};

	get baseName() {
		return this.intake.baseName || 'video';
	}

	get meta() {
		const p = this.intake.probe;
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

	get status() {
		if (this.busy) return `${this.pct}%`;
		if (this.silent) return NO_AUDIO;
		return this.meta;
	}

	get progressStyle() {
		return htmlSafe(`width: ${this.pct}%`);
	}

	get resultLabel() {
		if (!this.result) return '';
		return `${this.result.ext} · ${formatBytes(this.result.blob.size)}`;
	}

	get errorMessage() {
		if (this.intake.error) return this.intake.error;
		if (this.errorCode === 'mute') return MUTE_ERROR;
		return '';
	}

	async #support(probe: VideoProbe | null) {
		const token = ++this.#token;
		if (!probe) {
			this.errorCode = 'mute';
			return;
		}
		const support = await containerSupport(probe.codec);
		if (token !== this.#token) return;
		this.support = support;
	}

	mute = () => void this.#mute();

	async #mute() {
		const file = this.intake.file;
		if (!file || !this.ready) return;
		const token = ++this.#token;
		this.busy = true;
		this.pct = 0;
		this.errorCode = '';
		this.#releaseResult();
		const abort = new AbortController();
		this.#muteAbort = abort;
		try {
			const result = await muteVideo(
				file,
				this.targetContainer,
				{
					signal: abort.signal,
					onProgress: (fraction) => {
						if (token === this.#token)
							this.pct = Math.round(
								fraction * 100,
							);
					},
				},
			);
			if (token !== this.#token) return;
			this.result = result;
			this.resultUrl = URL.createObjectURL(result.blob);
			this.pct = 100;
		} catch (error) {
			if (token !== this.#token) return;
			if ((error as Error).name === 'AbortError') return;
			console.error('Mute failed:', error);
			this.errorCode = 'mute';
		} finally {
			if (token === this.#token) this.busy = false;
		}
	}

	download = () => {
		if (!this.result) return;
		downloadBlob(
			this.result.blob,
			`${this.baseName}-muted.${this.result.ext}`,
		);
	};

	#releaseResult() {
		if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
		this.resultUrl = '';
		this.result = null;
	}

	// A new file or Clear cancels a running remux; mediabunny stops decoding.
	#reset() {
		this.#token++;
		this.#muteAbort?.abort();
		this.#muteAbort = null;
		this.#releaseResult();
		this.support = null;
		this.container = '';
		this.busy = false;
		this.pct = 0;
		this.errorCode = '';
	}

	clear = () => {
		this.#reset();
		this.intake.clear();
	};

	<template>
		<div class="dt-vm" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-vm-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				<div class="dt-vm-bar">
					<label
						class="dt-vm-file"
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
							class="dt-vm-filename"
						>{{if
								this.intake.fileName
								this.intake.fileName
								"Choose video"
							}}</span>
					</label>
					{{#if this.status}}
						<span
							class="dt-vm-status"
							role="status"
						>{{this.status}}</span>
					{{/if}}
					<select
						class="dt-vm-format"
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
						class="dt-vm-go"
						disabled={{unless
							this.ready
							true
						}}
						aria-busy={{if
							this.busy
							"true"
							"false"
						}}
						{{on "click" this.mute}}
					>
						{{#if this.busy}}
							<NdsLoader />
						{{else}}
							<Icon
								@name="volume-x"
							/>
						{{/if}}
						<span>Mute</span>
					</button>
					<button
						type="button"
						class="dt-vm-clear"
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

				<div class="dt-vm-stage">
					{{#if this.hasVideo}}
						{{#if this.resultUrl}}
							{{! template-lint-disable require-media-caption }}
							<video
								class="dt-vm-result"
								src={{this.resultUrl}}
								controls
								playsinline
								preload="metadata"
							></video>
						{{/if}}
						{{! user-supplied video; there is no caption track to offer }}
						{{! template-lint-disable require-media-caption }}
						<video
							src={{this.intake.url}}
							hidden={{if
								this.resultUrl
								true
							}}
							controls
							playsinline
							preload="metadata"
							{{this.intake.register}}
							{{on
								"loadedmetadata"
								this.intake.ready
							}}
							{{on
								"error"
								this.intake.failed
							}}
						></video>
					{{else}}
						<label class="dt-vm-drop">
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
								@name="volume-x"
							/>
							<span
								class="dt-vm-drop-title"
							>{{DROP_TITLE}}</span>
							{{! hint reused verbatim from Background Remover }}
							<span
								class="dt-vm-drop-hint"
							>or click to select a
								file, or paste</span>
						</label>
					{{/if}}
				</div>

				{{#if this.result}}
					<div class="dt-vm-out">
						<span
							class="dt-vm-out-label"
						>Muted</span>
						<span
							class="dt-vm-result-label"
						>{{this.resultLabel}}</span>
						<button
							type="button"
							class="dt-vm-btn is-primary"
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
						class="dt-vm-error"
						role="alert"
					>{{this.errorMessage}}</p>
				{{/if}}

				{{#if this.busy}}
					<span
						class="dt-vm-progress"
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
