import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadText } from 'delphitools-v2/lib/download';
import {
	detectFormat,
	formatTimestamp,
	parseSubtitles,
	scaleCues,
	shiftCues,
	writeSrt,
	writeVtt,
	type SubtitleFormat,
} from 'delphitools-v2/lib/subtitles';

const FILE_ACCEPT = '.srt,.vtt';
const COPIED_MS = 1500;
const MIME: Record<SubtitleFormat, string> = {
	srt: 'application/x-subrip',
	vtt: 'text/vtt',
};

interface ScalePreset {
	id: string;
	label: string;
	factor: number;
}

// factor = from/to fps (pal speedup shrinks timestamps)
const SCALE_PRESETS: ScalePreset[] = [
	{ id: 'custom', label: 'Custom', factor: 1 },
	{ id: 'film-pal', label: '23.976 → 25', factor: 23.976 / 25 },
	{ id: 'pal-film', label: '25 → 23.976', factor: 25 / 23.976 },
	{ id: '24-25', label: '24 → 25', factor: 24 / 25 },
	{ id: '25-24', label: '25 → 24', factor: 25 / 24 },
	{ id: 'film-24', label: '23.976 → 24', factor: 23.976 / 24 },
	{ id: '24-film', label: '24 → 23.976', factor: 24 / 23.976 },
];

const VTT_KINDS = ['', 'captions', 'subtitles', 'descriptions'];

export default class SubtitleConverterTool extends Component {
	@tracked input = '';
	@tracked fileName = '';
	@tracked target: SubtitleFormat = 'vtt';
	@tracked shiftSeconds = 0;
	@tracked scaleFactor = 1;
	@tracked presetId = 'custom';
	@tracked vttKind = '';
	@tracked vttLanguage = '';
	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get detected() {
		return detectFormat(this.input);
	}

	// avoids reparse per template read
	@cached
	get cues() {
		return parseSubtitles(this.input);
	}

	// scale before shift
	@cached
	get adjusted() {
		let cues = this.cues;
		if (this.scaleFactor !== 1 && this.scaleFactor > 0)
			cues = scaleCues(cues, this.scaleFactor);
		if (this.shiftSeconds)
			cues = shiftCues(
				cues,
				Math.round(this.shiftSeconds * 1000),
			);
		return cues;
	}

	@cached
	get output() {
		if (this.cues.length === 0) return '';
		if (this.target === 'srt') return writeSrt(this.adjusted);
		return writeVtt(this.adjusted, {
			kind: this.vttKind,
			language: this.vttLanguage,
		});
	}

	get scalePresets() {
		return SCALE_PRESETS;
	}

	get vttKinds() {
		return VTT_KINDS;
	}

	get hasInput() {
		return this.input.trim().length > 0;
	}

	get noCues() {
		return this.hasInput && this.cues.length === 0;
	}

	get stats() {
		const cues = this.adjusted;
		if (cues.length === 0) return '';
		const first = cues[0]!;
		const last = cues[cues.length - 1]!;
		return `${cues.length} cues · ${formatTimestamp(first.start, '.')} – ${formatTimestamp(last.end, '.')}`;
	}

	get inputLabel() {
		if (!this.detected) return 'Input';
		return this.detected === 'srt' ? 'Input · SRT' : 'Input · VTT';
	}

	get downloadName() {
		const base = this.fileName
			? this.fileName.replace(/\.(srt|vtt)$/i, '')
			: 'subtitles';
		return `${base}.${this.target}`;
	}

	get accept() {
		return FILE_ACCEPT;
	}

	readFile = (file: File) => void this.#load(file);

	async #load(file: File) {
		const text = await file.text();
		this.fileName = file.name;
		this.input = text;
		const detected = detectFormat(text);
		if (detected) this.target = detected === 'srt' ? 'vtt' : 'srt';
	}

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// rearm for same-file change
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	// else browser navigates to file
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setInput = (event: Event) => {
		this.input = (event.target as HTMLTextAreaElement).value;
		this.fileName = '';
	};

	setTarget = (target: SubtitleFormat) => {
		this.target = target;
	};

	setShift = (event: Event) => {
		const value = parseFloat(
			(event.target as HTMLInputElement).value,
		);
		this.shiftSeconds = Number.isFinite(value) ? value : 0;
	};

	setScale = (event: Event) => {
		const value = parseFloat(
			(event.target as HTMLInputElement).value,
		);
		this.scaleFactor =
			Number.isFinite(value) && value > 0 ? value : 1;
		this.presetId = 'custom';
	};

	setPreset = (event: Event) => {
		const id = (event.target as HTMLSelectElement).value;
		const preset = SCALE_PRESETS.find((p) => p.id === id);
		if (!preset) return;
		this.presetId = preset.id;
		if (preset.id !== 'custom') this.scaleFactor = preset.factor;
	};

	setVttKind = (event: Event) => {
		this.vttKind = (event.target as HTMLSelectElement).value;
	};

	setVttLanguage = (event: Event) => {
		this.vttLanguage = (event.target as HTMLInputElement).value;
	};

	clear = () => {
		this.input = '';
		this.fileName = '';
	};

	paste = () => void this.#pasteFromClipboard();

	async #pasteFromClipboard() {
		try {
			this.input = await navigator.clipboard.readText();
			this.fileName = '';
		} catch {
			// clipboard may be unavailable
		}
	}

	copy = () => void this.#copyToClipboard();

	async #copyToClipboard() {
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
			class="dt-sub"
			{{filePaste this.readFile accept=this.accept}}
		>
			<div
				class="dt-sub-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				<div class="dt-sub-settings">
					<label class="dt-sub-field">
						<span>Shift (s)</span>
						<input
							type="number"
							step="0.1"
							value={{this.shiftSeconds}}
							{{on
								"input"
								this.setShift
							}}
						/>
					</label>
					<label class="dt-sub-field">
						<span>Scale (×)</span>
						<input
							type="number"
							step="0.001"
							min="0.001"
							value={{this.scaleFactor}}
							{{on
								"input"
								this.setScale
							}}
						/>
					</label>
					<label class="dt-sub-field">
						<span>Rate</span>
						<select
							{{on
								"change"
								this.setPreset
							}}
						>
							{{#each
								this.scalePresets
								key="id"
								as |preset|
							}}
								<option
									value={{preset.id}}
									selected={{eq
										this.presetId
										preset.id
									}}
								>{{preset.label}}</option>
							{{/each}}
						</select>
					</label>
					{{#if (eq this.target "vtt")}}
						<label class="dt-sub-field">
							<span>Kind</span>
							<select
								{{on
									"change"
									this.setVttKind
								}}
							>
								{{#each
									this.vttKinds
									key="@index"
									as |kind|
								}}
									<option
										value={{kind}}
										selected={{eq
											this.vttKind
											kind
										}}
									>{{if
											kind
											kind
											"—"
										}}</option>
								{{/each}}
							</select>
						</label>
						<label class="dt-sub-field">
							<span>Language</span>
							<input
								type="text"
								placeholder="en"
								value={{this.vttLanguage}}
								{{on
									"input"
									this.setVttLanguage
								}}
							/>
						</label>
					{{/if}}
					<div class="dt-sub-field">
						<span>Target</span>
						<div
							class="segmented dt-sub-format-group"
						>
							<button
								type="button"
								class="dt-sub-format
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
							>
								SRT
							</button>
							<button
								type="button"
								class="dt-sub-format
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
							>
								VTT
							</button>
						</div>
					</div>
				</div>

				<div class="dt-sub-panes">
					<div class="dt-sub-pane">
						<div class="dt-sub-pane-head">
							<span
								class="dt-sub-pane-label"
							>{{this.inputLabel}}</span>
							<div
								class="dt-sub-pane-tools"
							>
								<label
									class="dt-sub-btn"
									aria-label="Open file"
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
								</label>
								<button
									type="button"
									class="dt-sub-btn"
									aria-label="Paste from clipboard"
									{{on
										"click"
										this.paste
									}}
								>
									<Icon
										@name="clipboard-paste"
									/>
								</button>
								<button
									type="button"
									class="dt-sub-btn"
									disabled={{unless
										this.hasInput
										true
									}}
									aria-label="Clear"
									{{on
										"click"
										this.clear
									}}
								>
									<Icon
										@name="x"
									/>
								</button>
							</div>
						</div>
						<textarea
							class="dt-sub-textarea"
							spellcheck="false"
							aria-label="Subtitle input"
							placeholder="Paste subtitles here…"
							value={{this.input}}
							{{on
								"input"
								this.setInput
							}}
						></textarea>
					</div>

					<div class="dt-sub-pane is-right">
						<div class="dt-sub-pane-head">
							<span
								class="dt-sub-pane-label"
							>Output</span>
							{{#if this.stats}}
								<span
									class="dt-sub-stats"
								>{{this.stats}}</span>
							{{/if}}
							<div
								class="dt-sub-pane-tools"
							>
								<button
									type="button"
									class="dt-sub-btn"
									disabled={{unless
										this.output
										true
									}}
									aria-label="Copy output"
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
									class="dt-sub-btn is-wide"
									disabled={{unless
										this.output
										true
									}}
									{{on
										"click"
										this.download
									}}
								>
									<DownloadLabel
									/>
								</button>
							</div>
						</div>
						<textarea
							class="dt-sub-textarea"
							readonly
							spellcheck="false"
							aria-label="Converted output"
							value={{this.output}}
						></textarea>
					</div>
				</div>
			</div>

			{{#if this.noCues}}
				<p class="dt-sub-error" role="alert">No cues
					found.</p>
			{{/if}}
		</div>
	</template>
}
