import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadText } from 'delphitools-v2/lib/download';
import {
	AUDIO_ACCEPT,
	VIDEO_ACCEPT,
	acceptAttr,
} from 'delphitools-v2/lib/tools';
import {
	formatTimestamp,
	writeSrt,
	writeVtt,
	type Cue,
	type SubtitleFormat,
} from 'delphitools-v2/lib/subtitles';
import { transcribe, type Mode } from 'delphitools-v2/lib/transcribe';

const ACCEPT = acceptAttr([...AUDIO_ACCEPT, ...VIDEO_ACCEPT]);
const COPIED_MS = 1500;
const MIME: Record<SubtitleFormat, string> = {
	srt: 'application/x-subrip',
	vtt: 'text/vtt',
};

const MODES: { id: Mode; label: string }[] = [
	{ id: 'fast', label: 'Fast' },
	{ id: 'reasonable', label: 'Reasonable' },
	{ id: 'experimental', label: 'Experimental' },
];

const DECODE_ERROR = "Couldn't read that file. Try WAV or MP4.";

const EXPERIMENTAL_ERROR =
	'Use Fast or Reasonable for now. Experimental coming soon.';

const GENERIC_ERROR = 'Transcription failed. Try again.';

export default class AutoSubtitleTool extends Component {
	@tracked file: File | null = null;
	@tracked fileName = '';
	@tracked mode: Mode = 'reasonable';
	@tracked language = '';
	@tracked translate = false;
	@tracked target: SubtitleFormat = 'srt';
	@tracked busy = false;
	@tracked percent = 0;
	@tracked errorCode = '';
	@tracked cues: Cue[] = [];
	@tracked copied = false;

	#token = 0;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		clearTimeout(this.#copiedTimer);
	}

	get accept() {
		return ACCEPT;
	}

	get modes() {
		return MODES;
	}

	get hasFile() {
		return this.file !== null;
	}

	get status() {
		if (!this.busy) return '';
		if (this.percent > 0 && this.percent < 100)
			return `Downloading… ${this.percent}%`;
		return 'Transcribing…';
	}

	get errorMessage() {
		if (this.errorCode === 'decode') return DECODE_ERROR;
		if (this.errorCode === 'experimental')
			return EXPERIMENTAL_ERROR;
		if (this.errorCode === 'generic') return GENERIC_ERROR;
		return '';
	}

	@cached
	get output() {
		if (this.cues.length === 0) return '';
		if (this.target === 'srt') return writeSrt(this.cues);
		return writeVtt(this.cues, { kind: 'captions' });
	}

	get stats() {
		if (this.cues.length === 0) return '';
		const last = this.cues[this.cues.length - 1]!;
		return `${this.cues.length} cues · ${formatTimestamp(last.end, '.')}`;
	}

	get downloadName() {
		const base =
			this.fileName.replace(/\.[^.]+$/, '') || 'subtitles';
		return `${base}.${this.target}`;
	}

	readFile = (file: File) => {
		this.file = file;
		this.fileName = file.name;
		this.cues = [];
		this.errorCode = '';
		this.percent = 0;
	};

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setMode = (mode: Mode) => {
		this.mode = mode;
		this.errorCode = '';
	};

	setLanguage = (event: Event) => {
		this.language = (event.target as HTMLInputElement).value;
	};

	setTranslate = (event: Event) => {
		this.translate = (event.target as HTMLInputElement).checked;
	};

	setTarget = (target: SubtitleFormat) => {
		this.target = target;
	};

	run = () => void this.#run();

	async #run() {
		if (!this.file || this.busy) return;
		const token = ++this.#token;
		this.busy = true;
		this.errorCode = '';
		this.cues = [];
		this.percent = 0;

		try {
			const cues = await transcribe(this.file, {
				mode: this.mode,
				language: this.language.trim() || undefined,
				task: this.translate
					? 'translate'
					: 'transcribe',
				onProgress: (p) => {
					if (token === this.#token)
						this.percent = p;
				},
			});
			if (token !== this.#token) return;
			this.cues = cues;
		} catch (error) {
			if (token !== this.#token) return;
			const message = (error as Error).message;
			const name = (error as DOMException).name;
			this.errorCode =
				message === 'parakeet-unavailable'
					? 'experimental'
					: name === 'EncodingError'
						? 'decode'
						: 'generic';
		} finally {
			if (token === this.#token) this.busy = false;
		}
	}

	clear = () => {
		this.#token++;
		this.file = null;
		this.fileName = '';
		this.cues = [];
		this.errorCode = '';
		this.percent = 0;
		this.busy = false;
	};

	copy = () => void this.#copy();

	async #copy() {
		if (!this.output) return;
		await navigator.clipboard.writeText(this.output);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	}

	download = () => {
		if (!this.output) return;
		downloadText(this.output, this.downloadName, MIME[this.target]);
	};

	<template>
		<div
			class="dt-asub"
			{{filePaste this.readFile accept=this.accept}}
		>
			<div
				class="dt-asub-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				<div class="dt-asub-bar">
					<label
						class="dt-asub-file"
						aria-label="Open media file"
					>
						<input
							type="file"
							class="dt-sr-only"
							accept={{this.accept}}
							{{on
								"change"
								this.chooseFile
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-asub-filename"
						>{{if
								this.fileName
								this.fileName
								"Choose file"
							}}</span>
					</label>
					<button
						type="button"
						class="dt-asub-go"
						disabled={{unless
							this.hasFile
							true
						}}
						aria-busy={{if
							this.busy
							"true"
							"false"
						}}
						{{on "click" this.run}}
					>
						{{#if this.busy}}
							<Icon @name="loader" />
						{{else}}
							<Icon
								@name="captions"
							/>
						{{/if}}
						<span>Transcribe</span>
					</button>
					<button
						type="button"
						class="dt-asub-clear"
						disabled={{unless
							this.hasFile
							true
						}}
						aria-label="Clear"
						{{on "click" this.clear}}
					>
						<Icon @name="x" />
					</button>
				</div>

				<div class="dt-asub-settings">
					<div class="dt-asub-set">
						<span
							class="dt-asub-label"
						>Mode</span>
						<div
							class="segmented dt-asub-modes"
						>
							{{#each
								this.modes
								key="id"
								as |m|
							}}
								<button
									type="button"
									class="dt-asub-mode
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

					<div class="dt-asub-set">
						<span
							class="dt-asub-label"
						>Language</span>
						<input
							type="text"
							class="dt-asub-lang"
							placeholder="auto"
							aria-label="Language"
							value={{this.language}}
							{{on
								"input"
								this.setLanguage
							}}
						/>
					</div>

					<div class="dt-asub-set">
						<span
							class="dt-asub-label"
						>Translate</span>
						<label class="dt-asub-toggle">
							<input
								type="checkbox"
								checked={{this.translate}}
								{{on
									"change"
									this.setTranslate
								}}
							/>
							<span>to English</span>
						</label>
					</div>

					<div class="dt-asub-set">
						<span
							class="dt-asub-label"
						>Format</span>
						<div
							class="segmented dt-asub-format-group"
						>
							<button
								type="button"
								class="dt-asub-format
									{{if
										(eq
											this.target
											'srt'
										)
										'is-active'
									}}"
								aria-pressed={{if
									(eq
										this.target
										"srt"
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.setTarget
										"srt"
									)
								}}
							>SRT</button>
							<button
								type="button"
								class="dt-asub-format
									{{if
										(eq
											this.target
											'vtt'
										)
										'is-active'
									}}"
								aria-pressed={{if
									(eq
										this.target
										"vtt"
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.setTarget
										"vtt"
									)
								}}
							>VTT</button>
						</div>
					</div>
				</div>

				<div class="dt-asub-out">
					<div class="dt-asub-out-head">
						<span
							class="dt-asub-out-label"
						>Subtitles</span>
						{{#if this.status}}
							<span
								class="dt-asub-status"
								role="status"
							>{{this.status}}</span>
						{{else if this.stats}}
							<span
								class="dt-asub-stats"
							>{{this.stats}}</span>
						{{/if}}
						<div class="dt-asub-out-tools">
							<button
								type="button"
								class="dt-asub-btn"
								disabled={{unless
									this.output
									true
								}}
								aria-label="Copy subtitles"
								{{on
									"click"
									this.copy
								}}
							>
								<Icon
									@name={{if
										this.copied
										"check"
										"copy"
									}}
								/>
							</button>
							<button
								type="button"
								class="dt-asub-btn is-wide"
								disabled={{unless
									this.output
									true
								}}
								{{on
									"click"
									this.download
								}}
							>
								<Icon
									@name="download"
								/>
								<span
								>Download</span>
							</button>
						</div>
					</div>
					<textarea
						class="dt-asub-textarea"
						readonly
						spellcheck="false"
						aria-label="Transcribed subtitles"
						value={{this.output}}
					></textarea>
				</div>
			</div>

			{{#if this.errorMessage}}
				<p
					class="dt-asub-error"
					role="alert"
				>{{this.errorMessage}}</p>
			{{/if}}
		</div>
	</template>
}
