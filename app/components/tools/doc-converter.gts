import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadBlob } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from 'delphitools-v2/components/ui/popover';
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandSeparator,
} from 'delphitools-v2/components/ui/command';
import {
	convert,
	getEngineState,
	loadEngine,
	type EngineState,
	type LoadProgress,
} from 'delphitools-v2/lib/pandoc/client';
import type { PandocConvertResult } from 'delphitools-v2/lib/pandoc/pandoc-core';
import {
	AUTO_DETECT,
	getFormat,
	guessFormatFromContent,
	guessFormatFromFilename,
	inputFormats,
	outputFormats,
	unreadableInputLabel,
	type PandocFormat,
} from 'delphitools-v2/lib/pandoc/formats';
import {
	injectPrintStyles,
	printHtmlInIframe,
} from 'delphitools-v2/lib/pandoc/print-pdf';

const SCRATCHPAD_KEY = 'delphitools-scratchpad';
const PANDOC_VERSION = '3.9';
const PANDOC_URL = `https://github.com/jgm/pandoc/tree/${PANDOC_VERSION}`;

type InputMode = 'paste' | 'upload';

type ConvResult =
	| { kind: 'text'; text: string; ext: string }
	| { kind: 'binary'; blob: Blob; filename: string }
	| { kind: 'pdf'; html: string };

function baseName(filename: string): string {
	const slash = filename.lastIndexOf('/');
	const name = slash >= 0 ? filename.slice(slash + 1) : filename;
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
}

function extractWarnings(res: PandocConvertResult): string[] {
	const out: string[] = [];
	if (Array.isArray(res.warnings)) {
		for (const w of res.warnings) {
			if (typeof w === 'string') out.push(w);
			else if (w && typeof w === 'object') {
				const message = (w as { message?: unknown })
					.message;
				out.push(
					typeof message === 'string'
						? message
						: JSON.stringify(w),
				);
			}
		}
	}
	return out;
}

interface FormatComboboxSignature {
	Args: {
		value: string;
		onValueChange: (id: string) => void;
		formats: PandocFormat[];
		includeAuto?: boolean;
		autoDetectedLabel?: string | null;
		ariaLabel?: string;
	};
}

class FormatCombobox extends Component<FormatComboboxSignature> {
	@tracked open = false;

	setOpen = (open: boolean) => {
		this.open = open;
	};

	choose = (id: string) => {
		this.args.onValueChange(id);
		this.open = false;
	};

	chooseAuto = () => {
		this.choose(AUTO_DETECT);
	};

	get tier1() {
		return this.args.formats.filter((f) => f.tier === 1);
	}

	get tier2() {
		return this.args.formats.filter((f) => f.tier === 2);
	}

	get triggerLabel() {
		const { value, autoDetectedLabel } = this.args;
		if (value === AUTO_DETECT) {
			return autoDetectedLabel
				? `Auto-detect · ${autoDetectedLabel}`
				: 'Auto-detect';
		}
		return getFormat(value)?.label ?? value;
	}

	get autoSubtitle() {
		return this.args.autoDetectedLabel
			? `Looks like ${this.args.autoDetectedLabel}`
			: 'Guess from the input';
	}

	<template>
		<Popover @open={{this.open}} @onOpenChange={{this.setOpen}}>
			<PopoverTrigger @asChild={{true}} as |trigger|>
				<button
					type="button"
					class="dt-docconv-picker"
					aria-expanded={{if
						this.open
						"true"
						"false"
					}}
					aria-label={{@ariaLabel}}
					{{trigger.modifiers}}
				>
					<span
						class="dt-docconv-picker-label"
					>{{this.triggerLabel}}</span>
					<Icon
						@name="chevrons-up-down"
						class="dt-docconv-picker-chevron"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				@align="start"
				class="dt-docconv-popover"
			>
				<Command>
					<CommandInput
						@placeholder="Search formats…"
					/>
					<CommandList>
						<CommandEmpty>No format found.</CommandEmpty>
						{{#if @includeAuto}}
							<CommandGroup>
								<CommandItem
									@value="auto detect automatic guess"
									@onSelect={{this.chooseAuto}}
								>
									<Icon
										@name="check"
										class="dt-docconv-check
											{{if
												(eq
													@value
													AUTO_DETECT
												)
												'is-on'
											}}"
									/>
									<span
										class="dt-docconv-item-text"
									>
										<span
											class="dt-docconv-item-name"
										>Auto-detect</span>
										<span
											class="dt-docconv-item-desc"
										>{{this.autoSubtitle}}</span>
									</span>
								</CommandItem>
							</CommandGroup>
							<CommandSeparator />
						{{/if}}
						<CommandGroup @heading="Common">
							{{#each
								this.tier1
								key="id"
								as |f|
							}}
								<CommandItem
									@value="{{f.label}} {{f.id}} {{f.ext}} {{f.subtitle}}"
									@onSelect={{fn
										this.choose
										f.id
									}}
								>
									<Icon
										@name="check"
										class="dt-docconv-check
											{{if
												(eq
													@value
													f.id
												)
												'is-on'
											}}"
									/>
									<span
										class="dt-docconv-item-text"
									>
										<span
											class="dt-docconv-item-name"
										>{{f.label}}</span>
										<span
											class="dt-docconv-item-desc"
										>{{f.subtitle}}</span>
									</span>
								</CommandItem>
							{{/each}}
						</CommandGroup>
						{{#if this.tier2.length}}
							<CommandSeparator />
							<CommandGroup
								@heading="More formats"
							>
								{{#each
									this.tier2
									key="id"
									as |f|
								}}
									<CommandItem
										@value="{{f.label}} {{f.id}} {{f.ext}} {{f.subtitle}}"
										@onSelect={{fn
											this.choose
											f.id
										}}
									>
										<Icon
											@name="check"
											class="dt-docconv-check
												{{if
													(eq
														@value
														f.id
													)
													'is-on'
												}}"
										/>
										<span
											class="dt-docconv-item-text"
										>
											<span
												class="dt-docconv-item-name"
											>{{f.label}}</span>
											<span
												class="dt-docconv-item-desc"
											>{{f.subtitle}}</span>
										</span>
									</CommandItem>
								{{/each}}
							</CommandGroup>
						{{/if}}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	</template>
}

export default class DocConverterTool extends Component {
	@tracked inputMode: InputMode = 'upload';
	@tracked text = '';
	@tracked file: File | null = null;
	@tracked dragging = false;

	@tracked from: string = AUTO_DETECT;
	@tracked to = 'html';

	@tracked standalone = true;
	@tracked toc = false;
	@tracked numberSections = false;
	@tracked optionsOpen = false;

	// reuse engine state
	@tracked engineState: EngineState = getEngineState();
	@tracked progress: LoadProgress | null = null;
	@tracked converting = false;

	@tracked result: ConvResult | null = null;
	@tracked warnings: string[] = [];
	@tracked error: string | null = null;
	@tracked fileError: string | null = null;
	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		clearTimeout(this.#copiedTimer);
	}

	get fromFormat() {
		return this.from === AUTO_DETECT
			? null
			: (getFormat(this.from) ?? null);
	}

	get toFormat() {
		return getFormat(this.to) ?? null;
	}

	get canSwap() {
		return (
			this.from !== AUTO_DETECT &&
			!!getFormat(this.from)?.output &&
			!!getFormat(this.to)?.input
		);
	}

	get swapTitle() {
		return this.canSwap
			? 'Swap formats'
			: 'Swap unavailable for this pair';
	}

	get swapDisabled() {
		return !this.canSwap;
	}

	get autoDetectedLabel(): string | null {
		const id =
			this.inputMode === 'upload' && this.file
				? guessFormatFromFilename(this.file.name)
				: this.inputMode === 'paste' && this.text.trim()
					? guessFormatFromContent(this.text)
					: null;
		return id ? (getFormat(id)?.label ?? null) : null;
	}

	get loading() {
		return this.engineState === 'loading';
	}

	get busy() {
		return this.loading || this.converting;
	}

	get pct(): number | null {
		const ratio = this.progress?.ratio;
		return ratio != null ? Math.round(ratio * 100) : null;
	}

	get indeterminate() {
		return this.pct == null;
	}

	get progressStyle() {
		return htmlSafe(`width: ${this.pct ?? 100}%`);
	}

	get progressCaption() {
		const mb = (
			(this.progress?.receivedBytes ?? 0) /
			(1024 * 1024)
		).toFixed(1);
		return `Fetching Pandoc engine — ${mb} MB${this.pct != null ? ` (${this.pct}%)` : ''}…`;
	}

	get convertLabel() {
		if (this.busy)
			return this.loading
				? 'Downloading engine…'
				: 'Converting…';
		return `Convert${this.toFormat ? ` to ${this.toFormat.label}` : ''}`;
	}

	get sourceNeedsFile() {
		return this.fromFormat?.kind === 'binary';
	}

	get showBinaryPasteWarning() {
		return this.sourceNeedsFile && this.inputMode === 'paste';
	}

	get sourceLabel() {
		return this.fromFormat?.label ?? '';
	}

	get convertDisabled() {
		return (
			this.busy ||
			(this.inputMode === 'upload' &&
				!!this.file &&
				!!this.fileError) ||
			(this.inputMode === 'paste' && this.sourceNeedsFile)
		);
	}

	get textResult() {
		return this.result?.kind === 'text' ? this.result : null;
	}

	get binaryResult() {
		return this.result?.kind === 'binary' ? this.result : null;
	}

	get pdfResult() {
		return this.result?.kind === 'pdf' ? this.result : null;
	}

	get shownWarnings() {
		return this.warnings.slice(0, 8);
	}

	get moreWarningCount() {
		return this.warnings.length > 8 ? this.warnings.length - 8 : 0;
	}

	get warningHeader() {
		const n = this.warnings.length;
		return `${n} warning${n > 1 ? 's' : ''}`;
	}

	setFrom = (id: string) => {
		this.from = id;
	};

	setTo = (id: string) => {
		this.to = id;
	};

	setText = (event: Event) => {
		this.text = (event.target as HTMLTextAreaElement).value;
	};

	usePasteMode = () => {
		this.inputMode = 'paste';
	};

	toggleOptions = () => {
		this.optionsOpen = !this.optionsOpen;
	};

	useUploadMode = () => {
		this.inputMode = 'upload';
	};

	toggleStandalone = (event: Event) => {
		this.standalone = (event.target as HTMLInputElement).checked;
	};

	toggleToc = (event: Event) => {
		this.toc = (event.target as HTMLInputElement).checked;
	};

	toggleNumberSections = (event: Event) => {
		this.numberSections = (
			event.target as HTMLInputElement
		).checked;
	};

	selectFile = (file: File) => {
		this.file = file;
		this.inputMode = 'upload';
		this.result = null;
		this.error = null;

		const unreadable = unreadableInputLabel(file.name);
		if (unreadable) {
			this.fileError = `Pandoc can't read ${unreadable}s. It converts text and word-processor documents (Word, ODT, EPUB, Markdown, HTML…). Paste the text instead, or pick a different file.`;
			return;
		}
		this.fileError = null;
		const guessed = guessFormatFromFilename(file.name);
		if (guessed) this.from = guessed;
	};

	clearFile = () => {
		this.file = null;
		this.fileError = null;
	};

	onFileInput = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.selectFile(file);
		input.value = '';
	};

	onDrop = (event: DragEvent) => {
		event.preventDefault();
		this.dragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) this.selectFile(file);
	};

	onDragOver = (event: DragEvent) => {
		event.preventDefault();
		this.dragging = true;
	};

	onDragLeave = () => {
		this.dragging = false;
	};

	loadScratchpad = () => {
		const saved = localStorage.getItem(SCRATCHPAD_KEY);
		if (saved && saved.trim()) {
			this.text = saved;
			this.inputMode = 'paste';
			this.result = null;
			this.error = null;
		} else {
			this.error =
				'Your Text Scratchpad is empty — nothing to load.';
		}
	};

	swap = () => {
		if (!this.canSwap) return;
		const from = this.from;
		this.from = this.to;
		this.to = from;
		this.result = null;
	};

	doConvert = async () => {
		this.error = null;
		this.result = null;
		this.warnings = [];

		const file = this.file;
		const hasFile = this.inputMode === 'upload' && !!file;
		const hasText =
			this.inputMode === 'paste' &&
			this.text.trim().length > 0;
		const toFormat = this.toFormat;

		if (!hasFile && !hasText) {
			this.error =
				'Add some text or upload a file to convert.';
			return;
		}
		if (hasFile && this.fileError) {
			this.error = this.fileError;
			return;
		}
		if (!toFormat) {
			this.error = 'Choose an output format.';
			return;
		}

		let fromId = this.from;
		if (fromId === AUTO_DETECT) {
			fromId =
				hasFile && file
					? (guessFormatFromFilename(file.name) ??
						'markdown')
					: guessFormatFromContent(this.text);
		}
		if (getFormat(fromId)?.kind === 'binary' && !hasFile) {
			this.error = `${getFormat(fromId)?.label} input must be uploaded as a file.`;
			return;
		}

		let stdin: string | null = null;
		const files: Record<string, Blob | string> = {};
		if (hasFile && file) files[file.name] = file;
		else stdin = this.text;

		const base: Record<string, unknown> = { from: fromId };
		if (hasFile && file) base['input-files'] = [file.name];
		if (this.toc) base['table-of-contents'] = true;
		if (this.numberSections) base['number-sections'] = true;

		if (getEngineState() !== 'ready') {
			this.engineState = 'loading';
			try {
				await loadEngine((p) => {
					if (!this.#destroyed) this.progress = p;
				});
				if (this.#destroyed) return;
				this.engineState = 'ready';
			} catch (e) {
				if (this.#destroyed) return;
				this.engineState = 'error';
				this.error =
					e instanceof Error
						? e.message
						: String(e);
				return;
			}
		}

		this.converting = true;
		try {
			if (toFormat.id === 'pdf') {
				const res = await convert(
					{
						...base,
						to: 'html',
						standalone: true,
						'embed-resources': true,
					},
					stdin,
					files,
				);
				if (this.#destroyed) return;
				this.warnings = extractWarnings(res);
				if (res.stdout?.trim()) {
					const html = injectPrintStyles(
						res.stdout,
					);
					this.result = { kind: 'pdf', html };
					printHtmlInIframe(html);
				} else {
					this.error =
						res.stderr?.trim() ||
						'Conversion produced no output.';
				}
			} else if (toFormat.kind === 'binary') {
				const outName = `output.${toFormat.ext}`;
				const res = await convert(
					{
						...base,
						to: this.to,
						'output-file': outName,
					},
					stdin,
					files,
				);
				if (this.#destroyed) return;
				this.warnings = extractWarnings(res);
				const blob = res.files[outName];
				if (blob instanceof Blob && blob.size > 0) {
					const name = baseName(
						hasFile && file
							? file.name
							: 'document',
					);
					this.result = {
						kind: 'binary',
						blob,
						filename: `${name}.${toFormat.ext}`,
					};
				} else {
					this.error =
						res.stderr?.trim() ||
						'Conversion produced no output.';
				}
			} else {
				const options: Record<string, unknown> = {
					...base,
					to: this.to,
				};
				if (this.standalone)
					options['standalone'] = true;
				const res = await convert(
					options,
					stdin,
					files,
				);
				if (this.#destroyed) return;
				this.warnings = extractWarnings(res);
				if (res.stdout && res.stdout.length > 0) {
					this.result = {
						kind: 'text',
						text: res.stdout,
						ext: toFormat.ext,
					};
				} else if (res.stderr?.trim()) {
					this.error = res.stderr.trim();
				} else {
					this.result = {
						kind: 'text',
						text: '',
						ext: toFormat.ext,
					};
				}
			}
		} catch (e) {
			if (this.#destroyed) return;
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.converting = false;
		}
	};

	copyOutput = async () => {
		if (this.result?.kind !== 'text') return;
		await navigator.clipboard.writeText(this.result.text);
		if (this.#destroyed) return;
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			1500,
		);
	};

	downloadResult = () => {
		const result = this.result;
		if (!result) return;
		if (result.kind === 'binary')
			downloadBlob(result.blob, result.filename);
		else if (result.kind === 'text')
			downloadBlob(
				new Blob([result.text], {
					type: 'text/plain;charset=utf-8',
				}),
				`converted.${result.ext}`,
			);
	};

	reprint = () => {
		if (this.result?.kind === 'pdf')
			printHtmlInIframe(this.result.html);
	};

	<template>
		<div class="dt-docconv" {{filePaste this.selectFile}}>
			<div class="dt-docconv-frame">
				<div class="dt-docconv-section">
					<div class="dt-docconv-section-head">
						<span
							class="dt-docconv-label"
						>Input</span>
						<button
							type="button"
							class="dt-docconv-ghost"
							title="Load from the Text Scratchpad"
							{{on
								"click"
								this.loadScratchpad
							}}
						>
							<Icon
								@name="clipboard-paste"
							/>
							From Scratchpad
						</button>
					</div>

					{{#if (eq this.inputMode "upload")}}
						<div
							class="dt-docconv-drop
								{{if
									this.dragging
									'is-dragging'
								}}"
							{{on
								"drop"
								this.onDrop
							}}
							{{on
								"dragover"
								this.onDragOver
							}}
							{{on
								"dragleave"
								this.onDragLeave
							}}
						>
							{{#if this.file}}
								<div
									class="dt-docconv-file"
								>
									<Icon
										@name="file-text"
										class="dt-docconv-file-icon"
									/>
									<div
										class="dt-docconv-file-meta"
									>
										<p
											class="dt-docconv-file-name"
										>{{this.file.name}}</p>
										<p
											class="dt-docconv-file-size"
										>{{formatBytes
												this.file.size
											}}</p>
									</div>
									<button
										type="button"
										class="dt-docconv-icon-btn"
										title="Remove file"
										{{on
											"click"
											this.clearFile
										}}
									>
										<Icon
											@name="x"
										/>
									</button>
								</div>
							{{else}}
								<Icon
									@name="upload"
									class="dt-docconv-drop-icon"
								/>
								<p
									class="dt-docconv-drop-text"
								>Drag &amp; drop
									a file
									here, or</p>
								<label
									class="dt-docconv-choose"
								>
									<input
										type="file"
										class="dt-sr-only"
										{{on
											"change"
											this.onFileInput
										}}
									/>
									Choose
									file
								</label>
							{{/if}}
						</div>
						{{#if this.fileError}}
							<p
								class="dt-docconv-file-error"
							>
								<Icon
									@name="alert-triangle"
								/>
								{{this.fileError}}
							</p>
						{{/if}}
						<button
							type="button"
							class="dt-docconv-mode-link"
							{{on
								"click"
								this.usePasteMode
							}}
						>No file? Paste text instead</button>
					{{else}}
						<textarea
							class="dt-docconv-textarea"
							aria-label="Document text"
							placeholder="Paste or type the document you want to convert…"
							value={{this.text}}
							{{on
								"input"
								this.setText
							}}
						></textarea>
						<button
							type="button"
							class="dt-docconv-mode-link"
							{{on
								"click"
								this.useUploadMode
							}}
						>Upload a file instead</button>
					{{/if}}
				</div>

				<div class="dt-docconv-section is-formats">
					<span
						class="dt-docconv-label"
					>Format</span>
					<div class="dt-docconv-formats">
						<div
							class="dt-docconv-side is-from"
						>
							<span
								class="dt-docconv-sub"
							>Convert from</span>
							<FormatCombobox
								@value={{this.from}}
								@onValueChange={{this.setFrom}}
								@formats={{inputFormats}}
								@includeAuto={{true}}
								@autoDetectedLabel={{this.autoDetectedLabel}}
								@ariaLabel="Source format"
							/>
						</div>
						<div
							class="dt-docconv-swap-cell"
						>
							<button
								type="button"
								class="dt-docconv-swap"
								title={{this.swapTitle}}
								disabled={{this.swapDisabled}}
								{{on
									"click"
									this.swap
								}}
							>
								<Icon
									@name="arrow-left-right"
								/>
							</button>
						</div>
						<div
							class="dt-docconv-side is-to"
						>
							<span
								class="dt-docconv-sub"
							>Convert to</span>
							<FormatCombobox
								@value={{this.to}}
								@onValueChange={{this.setTo}}
								@formats={{outputFormats}}
								@ariaLabel="Target format"
							/>
						</div>
					</div>

					{{#if this.showBinaryPasteWarning}}
						<p
							class="dt-docconv-binary-warn"
						>{{this.sourceLabel}}
							is a binary format —
							switch to
							<strong>Upload file</strong>.</p>
					{{/if}}
				</div>

				<div class="dt-docconv-options">
					<button
						type="button"
						class="dt-docconv-options-summary"
						aria-expanded={{if
							this.optionsOpen
							"true"
							"false"
						}}
						{{on
							"click"
							this.toggleOptions
						}}
					>
						Options
						<Icon
							@name="chevron-down"
							class="dt-docconv-options-chevron
								{{if
									this.optionsOpen
									'is-open'
								}}"
						/>
					</button>
					{{#if this.optionsOpen}}
						<div
							class="dt-docconv-option-list"
						>
							<label
								class="dt-docconv-option"
							>
								<span
									class="dt-docconv-option-text"
								>
									<span
										class="dt-docconv-option-name"
									>Standalone
										document</span>
									<span
										class="dt-docconv-option-desc"
									>Emit a
										complete
										file
										with
										header/footer,
										not
										a
										fragment.</span>
								</span>
								<input
									type="checkbox"
									class="dt-docconv-option-input"
									checked={{this.standalone}}
									{{on
										"change"
										this.toggleStandalone
									}}
								/>
							</label>
							<label
								class="dt-docconv-option"
							>
								<span
									class="dt-docconv-option-text"
								>
									<span
										class="dt-docconv-option-name"
									>Table
										of
										contents</span>
									<span
										class="dt-docconv-option-desc"
									>Generate
										a
										TOC
										from
										the
										headings.</span>
								</span>
								<input
									type="checkbox"
									class="dt-docconv-option-input"
									checked={{this.toc}}
									{{on
										"change"
										this.toggleToc
									}}
								/>
							</label>
							<label
								class="dt-docconv-option"
							>
								<span
									class="dt-docconv-option-text"
								>
									<span
										class="dt-docconv-option-name"
									>Number
										sections</span>
									<span
										class="dt-docconv-option-desc"
									>Prefix
										headings
										with
										section
										numbers.</span>
								</span>
								<input
									type="checkbox"
									class="dt-docconv-option-input"
									checked={{this.numberSections}}
									{{on
										"change"
										this.toggleNumberSections
									}}
								/>
							</label>
						</div>
					{{/if}}
				</div>

				<button
					type="button"
					class="dt-docconv-convert"
					disabled={{this.convertDisabled}}
					{{on "click" this.doConvert}}
				>
					{{#if this.busy}}
						<NdsLoader />
					{{/if}}
					{{this.convertLabel}}
				</button>

				{{#if this.loading}}
					<div class="dt-docconv-progress">
						<div
							class="dt-docconv-progress-track"
						>
							<div
								class="dt-docconv-progress-fill
									{{if
										this.indeterminate
										'is-indeterminate'
									}}"
								style={{this.progressStyle}}
							></div>
						</div>
						<p
							class="dt-docconv-progress-caption"
						>{{this.progressCaption}}</p>
					</div>
				{{/if}}
			</div>

			{{#if this.error}}
				<div class="dt-docconv-error">
					<Icon @name="alert-triangle" />
					<pre>{{this.error}}</pre>
				</div>
			{{/if}}

			{{#if this.result}}
				<div class="dt-docconv-output">
					<div class="dt-docconv-output-head">
						<span
							class="dt-docconv-label"
						>Output</span>
						{{#if this.textResult}}
							<button
								type="button"
								class="dt-docconv-output-btn"
								{{on
									"click"
									this.copyOutput
								}}
							>
								{{#if
									this.copied
								}}
									<Icon
										@name="check"
									/>
									Copied
								{{else}}
									<Icon
										@name="copy"
									/>
									Copy
								{{/if}}
							</button>
						{{/if}}
						{{#if this.pdfResult}}
							<button
								type="button"
								class="dt-docconv-output-btn is-primary"
								{{on
									"click"
									this.reprint
								}}
							>
								<Icon
									@name="printer"
								/>
								Save as PDF
							</button>
						{{else}}
							<button
								type="button"
								class="dt-docconv-output-btn is-primary"
								{{on
									"click"
									this.downloadResult
								}}
							>
								<DownloadLabel
								/>
							</button>
						{{/if}}
					</div>

					{{#if this.textResult}}
						<textarea
							class="dt-docconv-output-text"
							aria-label="Converted output"
							readonly
							value={{this.textResult.text}}
						></textarea>
					{{else if this.pdfResult}}
						<div
							class="dt-docconv-output-row"
						>
							<Icon
								@name="printer"
								class="dt-docconv-output-icon"
							/>
							<div
								class="dt-docconv-output-meta"
							>
								<p
									class="dt-docconv-output-name"
								>Print dialog
									opened</p>
								<p
									class="dt-docconv-output-note"
								>Choose “Save as
									PDF” as
									the
									destination.
									Didn't
									see it?
									Use the
									button.</p>
							</div>
						</div>
					{{else if this.binaryResult}}
						<div
							class="dt-docconv-output-row"
						>
							<Icon
								@name="file-text"
								class="dt-docconv-output-icon"
							/>
							<div
								class="dt-docconv-output-meta"
							>
								<p
									class="dt-docconv-output-name"
								>{{this.binaryResult.filename}}</p>
								<p
									class="dt-docconv-output-note"
								>{{formatBytes
										this.binaryResult.blob.size
									}}</p>
							</div>
						</div>
					{{/if}}
				</div>
			{{/if}}

			{{#if this.warnings.length}}
				<div class="dt-docconv-warnings">
					<p class="dt-docconv-warnings-head">
						<Icon @name="alert-triangle" />
						{{this.warningHeader}}
					</p>
					<ul>
						{{#each
							this.shownWarnings
							as |w|
						}}
							<li>{{w}}</li>
						{{/each}}
						{{#if this.moreWarningCount}}
							<li>…and
								{{this.moreWarningCount}}
								more</li>
						{{/if}}
					</ul>
				</div>
			{{/if}}

			<div class="dt-docconv-notice">
				<Icon @name="info" />
				<p>
					Conversion runs entirely in your browser
					— your documents are never uploaded. On
					first use the ~16 MB Pandoc engine is
					fetched from a CDN and cached for the
					rest of your visit. Powered by
					<a
						href={{PANDOC_URL}}
						target="_blank"
						rel="noreferrer noopener"
					>Pandoc
						{{PANDOC_VERSION}}</a>
					(GPL-2.0-or-later).
				</p>
			</div>
		</div>
	</template>
}
