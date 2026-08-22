import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadUrl } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import { probeAudio, type AudioProbe } from 'delphitools-v2/lib/media-probe';
import {
	AUDIO_TARGETS,
	audioTargetSupport,
	extractAudio,
	type AudioTarget,
	type ConvertResult,
} from 'delphitools-v2/lib/media-convert';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);

// ∑CG: empty-state title on the Audio Extractor stage
//   spec: <= 32 chars, one line, parallels Frame Extractor's "Drop a video here or click to upload"
//   sample: "Drop a video here"
const DROP_TITLE = '∑CG';

// ∑CG: status line in the bar when the loaded video has no audio track, so there is nothing to extract
//   spec: <= 24 chars, one line, states the file is silent
//   sample: "No audio track"
const NO_AUDIO = '∑CG';

// ∑CG: error line when the extraction fails (unreadable container, or no encoder for the chosen target)
//   spec: <= 48 chars, one sentence, suggests WAV as the target that always works
//   sample: "Couldn't extract that audio. WAV always works."
const EXTRACT_ERROR = '∑CG';

export default class AudioExtractorTool extends Component {
	intake = new VideoIntake({
		onLoad: (file) => {
			this.#reset();
			void this.#probe(file);
		},
		canLoad: () => !this.busy,
	});

	/** undefined until the probe answers, null when the file has no audio */
	@tracked probe: AudioProbe | null | undefined = undefined;
	@tracked support: Record<AudioTarget, boolean> | null = null;
	@tracked target: AudioTarget = 'wav';
	@tracked busy = false;
	@tracked pct = 0;
	@tracked result: ConvertResult | null = null;
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

	get silent() {
		return this.probe === null;
	}

	get targets() {
		return AUDIO_TARGETS.map((t) => ({
			...t,
			supported: this.#supports(t.id),
		}));
	}

	get ready() {
		return (
			!this.busy &&
			!!this.probe &&
			this.#supports(this.target)
		);
	}

	// PCM needs no encoder, so WAV is on before the support probe answers.
	#supports(id: AudioTarget) {
		return this.support?.[id] ?? id === 'wav';
	}

	get baseName() {
		return this.intake.baseName || 'audio';
	}

	get status() {
		if (this.busy) return `${this.pct}%`;
		if (this.silent) return NO_AUDIO;
		const p = this.probe;
		if (!p) return '';
		return `${p.codec ?? 'audio'} · ${p.sampleRate} Hz`;
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
		if (this.errorCode === 'extract') return EXTRACT_ERROR;
		return '';
	}

	async #probe(file: File) {
		const token = ++this.#token;
		const probe = await probeAudio(file);
		if (token !== this.#token) return;
		this.probe = probe;
		if (!probe) return;
		const support = await audioTargetSupport(probe.codec);
		if (token !== this.#token) return;
		this.support = support;
	}

	setTarget = (event: Event) => {
		this.target = (event.target as HTMLSelectElement)
			.value as AudioTarget;
		this.#releaseResult();
	};

	extract = () => void this.#extract();

	async #extract() {
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
			const result = await extractAudio(file, this.target, {
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
			console.error('Extract failed:', error);
			this.errorCode = 'extract';
		} finally {
			if (this.#abort === abort) this.#abort = null;
			if (token === this.#token) this.busy = false;
		}
	}

	download = () => {
		if (!this.result) return;
		downloadUrl(
			this.resultUrl,
			`${this.baseName}.${this.result.ext}`,
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
		this.probe = undefined;
		this.support = null;
		this.busy = false;
		this.pct = 0;
		this.errorCode = '';
	}

	clear = () => {
		this.#reset();
		this.intake.clear();
	};

	<template>
		<div class="dt-ax" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-ax-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				<div class="dt-ax-bar">
					<label
						class="dt-ax-file"
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
							class="dt-ax-filename"
						>{{if
								this.intake.fileName
								this.intake.fileName
								"Choose video"
							}}</span>
					</label>
					{{#if this.status}}
						<span
							class="dt-ax-status"
							role="status"
						>{{this.status}}</span>
					{{/if}}
					<select
						class="dt-ax-format"
						aria-label="Audio format"
						{{on "change" this.setTarget}}
					>
						{{#each
							this.targets key="id"
							as |t|
						}}
							<option
								value={{t.id}}
								disabled={{unless
									t.supported
									true
								}}
								selected={{eq
									this.target
									t.id
								}}
							>{{t.label}}</option>
						{{/each}}
					</select>
					<button
						type="button"
						class="dt-ax-go"
						disabled={{unless
							this.ready
							true
						}}
						aria-busy={{if
							this.busy
							"true"
							"false"
						}}
						{{on "click" this.extract}}
					>
						<Icon
							@name={{if
								this.busy
								"loader"
								"file-audio"
							}}
						/>
						<span>Extract</span>
					</button>
					<button
						type="button"
						class="dt-ax-clear"
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

				<div class="dt-ax-stage">
					{{#if this.hasVideo}}
						{{! user-supplied video; there is no caption track to offer }}
						{{! template-lint-disable require-media-caption }}
						<video
							src={{this.intake.url}}
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
						<label class="dt-ax-drop">
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
								@name="file-audio"
							/>
							<span
								class="dt-ax-drop-title"
							>{{DROP_TITLE}}</span>
							{{! hint reused verbatim from Background Remover }}
							<span
								class="dt-ax-drop-hint"
							>or click to select a
								file, or paste</span>
						</label>
					{{/if}}
				</div>

				{{#if this.result}}
					<div class="dt-ax-out">
						<span
							class="dt-ax-out-label"
						>Audio</span>
						{{! the extracted track, so it can be checked by ear }}
						{{! template-lint-disable require-media-caption }}
						<audio
							class="dt-ax-player"
							src={{this.resultUrl}}
							controls
						></audio>
						<span
							class="dt-ax-result-label"
						>{{this.resultLabel}}</span>
						<button
							type="button"
							class="dt-ax-btn is-primary"
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name="download"
							/>
							<span>Download</span>
						</button>
					</div>
				{{/if}}

				{{#if this.errorMessage}}
					<p
						class="dt-ax-error"
						role="alert"
					>{{this.errorMessage}}</p>
				{{/if}}

				{{#if this.busy}}
					<span
						class="dt-ax-progress"
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
