import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
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
	parseTimestamp,
	writeSrt,
	writeVtt,
	type Cue,
	type SubtitleFormat,
} from 'delphitools-v2/lib/subtitles';
import { MODELS, transcribe, type Mode } from 'delphitools-v2/lib/transcribe';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from 'delphitools-v2/components/ui/popover';
import Dialog from 'delphitools-v2/components/ui/dialog';
import LanguageCombobox from 'delphitools-v2/components/ui/language-combobox';

const ACCEPT = acceptAttr([...AUDIO_ACCEPT, ...VIDEO_ACCEPT]);
const COPIED_MS = 1500;
const MIME: Record<SubtitleFormat, string> = {
	srt: 'application/x-subrip',
	vtt: 'text/vtt',
};

const tc = (ms: number) => formatTimestamp(ms, '.');
const nth = (index: number) => index + 1;

// UI-only edit marker against the transcription snapshot; never exported.
const altered = (original: Cue[], cue: Cue, index: number) => {
	const o = original[index];
	return (
		!o ||
		o.start !== cue.start ||
		o.end !== cue.end ||
		o.text !== cue.text
	);
};

const MODES: { id: Mode; label: string }[] = [
	{ id: 'fast', label: 'Rough' },
	{ id: 'reasonable', label: 'Decent' },
	{ id: 'accurate', label: 'Experimental' },
];

const MODEL_ROWS = MODES.map(({ id, label }) => ({
	label,
	name: MODELS[id].name,
	href: `https://huggingface.co/${MODELS[id].model}`,
	sizeMb: MODELS[id].sizeMb,
}));

const DECODE_ERROR = "Couldn't read that file, try WAV or MP4";

const WEBGPU_ERROR = 'WebGPU required';

const GENERIC_ERROR = 'Transcription failed. Try again';

const DROP_TITLE = 'Drop an audio or video file';

export default class AutoSubtitleTool extends Component {
	@tracked file: File | null = null;
	@tracked fileName = '';
	@tracked mode: Mode = 'reasonable';
	@tracked language = '';
	@tracked target: SubtitleFormat = 'srt';
	@tracked busy = false;
	@tracked percent = 0;
	@tracked errorCode = '';
	@tracked cues: Cue[] = [];
	@tracked original: Cue[] = [];
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

	// Sizes follow the device the run would use; navigator.gpu is the sync
	// proxy for the adapter check in lib/transcribe.
	get modelRows() {
		const device =
			typeof navigator !== 'undefined' && 'gpu' in navigator
				? 'webgpu'
				: 'wasm';
		return MODEL_ROWS.map((row) => ({
			...row,
			size: `${row.sizeMb[device]} MB`,
		}));
	}

	get hasFile() {
		return this.file !== null;
	}

	get dropTitle() {
		return DROP_TITLE;
	}

	get showEmpty() {
		return this.cues.length === 0 && !this.busy;
	}

	get indeterminate() {
		return this.percent === 0 || this.percent === 100;
	}

	get progressStyle() {
		return htmlSafe(`width: ${this.percent}%`);
	}

	get status() {
		if (!this.busy) return '';
		if (this.percent > 0 && this.percent < 100)
			return `Downloading… ${this.percent}%`;
		return 'Transcribing…';
	}

	get errorMessage() {
		if (this.errorCode === 'decode') return DECODE_ERROR;
		if (this.errorCode === 'webgpu') return WEBGPU_ERROR;
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
		this.#token++;
		this.file = file;
		this.fileName = file.name;
		this.cues = [];
		this.original = [];
		this.errorCode = '';
		this.percent = 0;
		this.busy = false;
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

	#experimentalOk = false;

	pickMode = (mode: Mode, openWarning: () => void) => {
		if (mode === 'accurate' && !this.#experimentalOk) openWarning();
		else this.setMode(mode);
	};

	confirmExperimental = (returnValue: string) => {
		if (returnValue !== 'confirm') return;
		this.#experimentalOk = true;
		this.setMode('accurate');
	};

	setLanguage = (code: string) => {
		this.language = code;
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
		this.original = [];
		this.percent = 0;

		try {
			const cues = await transcribe(this.file, {
				mode: this.mode,
				language: this.language.trim() || undefined,
				onProgress: (p) => {
					if (token === this.#token)
						this.percent = p;
				},
			});
			if (token !== this.#token) return;
			this.cues = cues;
			this.original = cues;
		} catch (error) {
			if (token !== this.#token) return;
			console.error('Transcription failed:', error);
			const message = (error as Error).message;
			const name = (error as DOMException).name;
			this.errorCode =
				message === 'webgpu-required'
					? 'webgpu'
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
		this.original = [];
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

	#patch(index: number, patch: Partial<Cue>) {
		const next = this.cues.slice();
		next[index] = { ...next[index]!, ...patch };
		this.cues = next;
	}

	setText = (index: number, event: Event) => {
		this.#patch(index, {
			text: (event.target as HTMLInputElement).value,
		});
	};

	// Unparseable input snaps back to the cue's current value on commit, so
	// the grid never shows a time the export does not contain.
	#setTime(key: 'start' | 'end', index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		const ms = parseTimestamp(input.value);
		if (ms === null) input.value = tc(this.cues[index]![key]);
		else this.#patch(index, { [key]: ms });
	}

	setStart = (index: number, event: Event) =>
		this.#setTime('start', index, event);

	setEnd = (index: number, event: Event) =>
		this.#setTime('end', index, event);

	<template>
		<Dialog @onClose={{this.confirmExperimental}} as |d|>
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
								<Icon
									@name="loader"
								/>
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
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="x" />
						</button>
					</div>

					<div class="dt-asub-settings">
						<div class="dt-asub-set">
							<span
								class="dt-asub-labelinfo"
							>
								<span
									class="dt-asub-label"
								>Mode</span>
								<Popover>
									<PopoverTrigger
										class="dt-asub-info"
										aria-label="Models used"
									>
										<Icon
											@name="info"
										/>
									</PopoverTrigger>
									<PopoverContent
										@side="bottom"
										@align="start"
										class="dt-asub-infopanel"
									>
										{{#each
											this.modelRows
											as |row|
										}}
											<span
												class="dt-asub-model-label"
											>{{row.label}}</span>
											<a
												class="dt-asub-model-id"
												href={{row.href}}
												target="_blank"
												rel="noopener noreferrer"
											>{{row.name}}</a>
											<span
												class="dt-asub-model-size"
											>{{row.size}}</span>
										{{/each}}
										<span
											class="dt-asub-model-note"
										>Experimental
											requires
											WebGPU</span>
									</PopoverContent>
								</Popover>
							</span>
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
												this.pickMode
												m.id
												d.open
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
							<LanguageCombobox
								@value={{this.language}}
								@onValueChange={{this.setLanguage}}
							/>
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
							<div
								class="dt-asub-out-tools"
							>
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
						{{#if this.showEmpty}}
							<label
								class="dt-asub-drop"
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
								<Icon
									@name="upload"
								/>
								<span
									class="dt-asub-drop-title"
								>{{this.dropTitle}}</span>
								{{! hint reused verbatim from Background Remover }}
								<span
									class="dt-asub-drop-hint"
								>or click to
									select a
									file, or
									paste</span>
							</label>
						{{else}}
							<div
								class="dt-asub-grid"
							>
								<div
									class="dt-asub-row dt-asub-grid-head"
								>
									<span
										class="dt-asub-n"
									>#</span>
									<span
									>Start</span>
									<span
									>End</span>
									<span
									>Text</span>
								</div>
								{{#each
									this.cues
									key="@index"
									as |cue index|
								}}
									<div
										class="dt-asub-row"
									>
										<span
											class="dt-asub-n"
										>{{nth
												index
											}}{{#if
												(altered
													this.original
													cue
													index
												)
											}}<Icon
													@name="star"
												/>{{/if}}</span>
										<input
											type="text"
											class="dt-asub-tc"
											spellcheck="false"
											aria-label="Start"
											value={{tc
												cue.start
											}}
											{{on
												"change"
												(fn
													this.setStart
													index
												)
											}}
										/>
										<input
											type="text"
											class="dt-asub-tc"
											spellcheck="false"
											aria-label="End"
											value={{tc
												cue.end
											}}
											{{on
												"change"
												(fn
													this.setEnd
													index
												)
											}}
										/>
										<input
											type="text"
											class="dt-asub-text"
											aria-label="Text"
											value={{cue.text}}
											{{on
												"input"
												(fn
													this.setText
													index
												)
											}}
										/>
									</div>
								{{/each}}
							</div>
						{{/if}}
					</div>

					{{#if this.errorMessage}}
						<p
							class="dt-asub-error"
							role="alert"
						>{{this.errorMessage}}</p>
					{{/if}}

					{{#if this.busy}}
						<span
							class="dt-asub-progress"
							role="progressbar"
							aria-label="Progress"
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={{unless
								this.indeterminate
								this.percent
							}}
						>
							<span
								class="{{if
										this.indeterminate
										'is-indeterminate'
									}}"
								style={{unless
									this.indeterminate
									this.progressStyle
								}}
							></span>
						</span>
					{{/if}}
				</div>
			</div>
			<d.Content
				class="dt-asub-warn"
				aria-label="Experimental mode"
			>
				<div class="dt-asub-warn-body">
					<img
						class="dt-asub-warn-art"
						src="/art/760mb.webp"
						width="960"
						height="435"
						alt=""
					/>
					{{! wording by Ruby }}
					<p class="dt-asub-warn-text">This will
						download 760 MB of engine files
						to work, and needs a pretty
						beefy computer, are you sure?</p>
				</div>
				<form
					method="dialog"
					class="dt-asub-warn-actions"
				>
					<button
						type="submit"
						class="dt-asub-warn-btn is-ghost"
						value="cancel"
					>Cancel</button>
					<button
						type="submit"
						class="dt-asub-warn-btn is-primary"
						value="confirm"
					>Proceed</button>
				</form>
			</d.Content>
		</Dialog>
	</template>
}
