import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import FormatPick from 'delphitools-v2/components/tools/doc-converter/format-pick';
import {
	convertLocally,
	convertsLocally,
} from 'delphitools-v2/components/tools/doc-converter/local';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
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
} from 'delphitools-v2/lib/pandoc/formats';
import {
	injectPrintStyles,
	printHtmlInIframe,
} from 'delphitools-v2/lib/pandoc/print-pdf';
import { pastedHtml } from 'delphitools-v2/lib/pasted-html';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import './doc-converter/doc-converter.css';

const SCRATCHPAD_KEY = 'delphitools-scratchpad';
const PANDOC_VERSION = '3.9';
const PANDOC_URL = `https://github.com/jgm/pandoc/tree/${PANDOC_VERSION}`;
const dash = '—';
const PREVIEW_CSS = '<style>body { padding: 24px 28px; }</style>';
const ABOUT =
	'Conversion runs entirely in your browser — your documents are never uploaded. On first use the ~50 MB Pandoc engine is fetched from a CDN and cached for the rest of your visit. Powered by';
const CODE_HEIGHT = 360;

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const FilesIcon = <template><IconSvg @name="folder" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;
const ScratchpadIcon = <template><IconSvg @name="clipboard-paste" /></template>;
const FileIcon = <template><IconSvg @name="file-text" /></template>;
const ConvertIcon = <template><IconSvg @name="file-type-2" /></template>;
const SwapIcon = <template><IconSvg @name="arrow-left-right" /></template>;
const SaveIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const PrintIcon = <template><IconSvg @name="printer" /></template>;

type ConvResult =
	| { kind: 'text'; text: string; name: string }
	| { kind: 'binary'; blob: Blob; name: string }
	| { kind: 'pdf'; html: string; name: string };

function stem(filename: string | null): string {
	if (!filename) return 'document';
	const name = filename.slice(filename.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
}

function extractWarnings(res: PandocConvertResult): string[] {
	if (!Array.isArray(res.warnings)) return [];
	return res.warnings.map((w: unknown) => {
		if (typeof w === 'string') return w;
		const { message, pretty } =
			(w as { message?: unknown; pretty?: unknown } | null) ??
			{};
		if (typeof message === 'string') return message;
		return typeof pretty === 'string' ? pretty : JSON.stringify(w);
	});
}

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.matches('input, textarea, select'));

export default class DocConverterTool extends Component {
	@tracked text = '';
	@tracked file: File | null = null;
	@tracked fileName: string | null = null;
	@tracked fileError: string | null = null;
	@tracked notice: string | null = null;
	@tracked over = false;

	@tracked from: string = AUTO_DETECT;
	@tracked to = 'html';
	@tracked standalone = true;
	@tracked toc = false;
	@tracked numberSections = false;

	@tracked engineState: EngineState = getEngineState();
	@tracked progress: LoadProgress | null = null;
	@tracked converting = false;
	@tracked result: ConvResult | null = null;
	@tracked preview: string | null = null;
	@tracked warnings: string[] = [];
	@tracked error: string | null = null;

	#picker?: HTMLInputElement;
	#run = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const from = query.get('docFrom');
		if (from && getFormat(from)?.input) this.from = from;
		const to = query.get('docTo');
		if (to && getFormat(to)?.output) this.to = to;
		const text = query.get('docText');
		if (text) this.text = text.replaceAll('\\n', '\n');
		if (query.get('docRun'))
			void Promise.resolve().then(this.doConvert);
	}

	willDestroy() {
		super.willDestroy();
		this.#run++;
	}

	get detectedId(): string | null {
		const named = this.file?.name ?? this.fileName;
		const byName = named ? guessFormatFromFilename(named) : null;
		if (byName) return byName;
		return this.text.trim()
			? guessFormatFromContent(this.text)
			: null;
	}

	get sourceId(): string {
		return this.from === AUTO_DETECT
			? (this.detectedId ?? 'markdown')
			: this.from;
	}

	get sourceLabel() {
		return getFormat(this.sourceId)?.label ?? this.sourceId;
	}

	get toFormat() {
		return getFormat(this.to)!;
	}

	get autoDetectedLabel(): string | null {
		const id = this.detectedId;
		return id ? (getFormat(id)?.label ?? null) : null;
	}

	get hasInput() {
		return !!this.file || this.text.trim().length > 0;
	}

	get needsFile() {
		return (
			getFormat(this.sourceId)?.kind === 'binary' &&
			!this.file
		);
	}

	get binaryPaste() {
		return this.needsFile && this.text.trim().length > 0;
	}

	get busy() {
		return this.engineState === 'loading' || this.converting;
	}

	get loading() {
		return this.engineState === 'loading';
	}

	get convertDisabled() {
		return (
			this.busy ||
			!this.hasInput ||
			!!this.fileError ||
			this.needsFile
		);
	}

	get convertLabel() {
		if (this.busy)
			return this.loading
				? 'Downloading engine…'
				: 'Converting…';
		if (this.engineState === 'error' && this.error) return 'Retry';
		return `Convert to ${this.toFormat.label}`;
	}

	get pct(): number | null {
		const ratio = this.progress?.ratio;
		return ratio != null ? Math.round(ratio * 100) : null;
	}

	get progressShare() {
		return this.progress?.ratio ?? 0;
	}

	get progressCaption() {
		const mb = (
			(this.progress?.receivedBytes ?? 0) /
			(1024 * 1024)
		).toFixed(1);
		return `Fetching Pandoc engine — ${mb} MB${this.pct != null ? ` (${this.pct}%)` : ''}…`;
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

	get standaloneApplies() {
		return this.toFormat.kind === 'text';
	}

	get inputTiles() {
		const text = this.file ? '' : this.text;
		const bytes = this.file
			? this.file.size
			: new TextEncoder().encode(text).length;
		const shown = this.hasInput || this.from !== AUTO_DETECT;
		return [
			{
				label: 'Name',
				value: this.file?.name ?? this.fileName ?? dash,
			},
			{
				label: 'Format',
				value: shown ? this.sourceLabel : dash,
			},
			{
				label: 'Size',
				value: this.hasInput
					? formatBytes(bytes)
					: dash,
			},
			{
				label: 'Words',
				value: text.trim()
					? text
							.trim()
							.split(/\s+/)
							.length.toLocaleString()
					: dash,
			},
		];
	}

	get outputTiles() {
		const result = this.result;
		const tiles = [
			{ label: 'Name', value: result?.name ?? dash },
			{
				label: 'Format',
				value: result ? this.toFormat.label : dash,
			},
			{
				label: 'Size',
				value:
					result?.kind === 'text'
						? formatBytes(
								new Blob([
									result.text,
								]).size,
							)
						: result?.kind === 'binary'
							? formatBytes(
									result
										.blob
										.size,
								)
							: dash,
			},
		];
		if (!result || result.kind === 'text')
			tiles.push({
				label: 'Lines',
				value: result
					? result.text
							.split('\n')
							.length.toLocaleString()
					: dash,
			});
		return tiles;
	}

	get textResult() {
		return this.result?.kind === 'text' ? this.result : null;
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

	get downloadText() {
		return passAlong('Download');
	}

	#changed() {
		this.#run++;
		this.result = null;
		this.preview = null;
		this.warnings = [];
		this.error = null;
		this.converting = false;
	}

	#loadText(text: string, name: string | null) {
		this.text = text;
		this.fileName = name;
		this.file = null;
		this.fileError = null;
		this.notice = null;
		if (getFormat(this.from)?.kind === 'binary')
			this.from = AUTO_DETECT;
		this.#changed();
	}

	setText = (event: Event) => {
		this.text = (event.target as HTMLTextAreaElement).value;
		this.notice = null;
		this.#changed();
	};

	selectFile = (file: File) => {
		this.notice = null;
		const unreadable = unreadableInputLabel(file.name);
		const guessed = guessFormatFromFilename(file.name);
		if (unreadable || getFormat(guessed ?? '')?.kind === 'binary') {
			this.text = '';
			this.fileName = null;
			this.file = file;
			this.fileError = unreadable
				? `Pandoc can't read ${unreadable}s. It converts text and word-processor documents (Word, ODT, EPUB, Markdown, HTML…). Paste the text instead, or pick a different file.`
				: null;
			if (guessed) this.from = guessed;
			this.#changed();
			return;
		}
		void file.text().then((text) => {
			if (this.isDestroying) return;
			this.#loadText(text, file.name);
			if (guessed) this.from = guessed;
		});
	};

	#loadHtml(html: string | undefined) {
		const rich = html ? pastedHtml(html) : null;
		if (!rich) return false;
		this.#loadText(rich, null);
		this.from = 'html';
		return true;
	}

	paste = async () => {
		// read() carries text/html, readText() does not
		const html = await navigator.clipboard
			.read()
			.then((items) =>
				items
					.find((item) =>
						item.types.includes(
							'text/html',
						),
					)
					?.getType('text/html'),
			)
			.then((blob) => blob?.text())
			.catch(() => undefined);
		if (this.isDestroying || this.#loadHtml(html)) return;
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.#loadText(text, null);
	};

	choose = () => this.#picker?.click();

	clear = () => {
		this.#loadText('', null);
	};

	loadScratchpad = () => {
		let saved: string | null = null;
		try {
			saved = localStorage.getItem(SCRATCHPAD_KEY);
		} catch {
			saved = null;
		}
		if (saved?.trim()) this.#loadText(saved, null);
		else
			this.notice =
				'Your Text Scratchpad is empty — nothing to load.';
	};

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.selectFile(file);
		input.value = '';
	};

	setFrom = (id: string) => {
		this.from = id;
		this.#changed();
	};

	setTo = (id: string) => {
		this.to = id;
		this.#changed();
	};

	swap = () => {
		if (!this.canSwap) return;
		[this.from, this.to] = [this.to, this.from];
		this.#changed();
	};

	setStandalone = (on: boolean) => {
		this.standalone = on;
		this.#changed();
	};

	setToc = (on: boolean) => {
		this.toc = on;
		this.#changed();
	};

	setNumberSections = (on: boolean) => {
		this.numberSections = on;
		this.#changed();
	};

	picker = modifier((element: HTMLInputElement) => {
		this.#picker = element;
	});

	dragEnter = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		this.over = true;
	};

	dragLeave = (event: DragEvent) => {
		const root = event.currentTarget as Element;
		if (!root.contains(event.relatedTarget as Node | null))
			this.over = false;
	};

	drop = (event: DragEvent) => {
		this.over = false;
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		this.selectFile(file);
	};

	pasteText = modifier(() => {
		const paste = (event: ClipboardEvent) => {
			if (event.clipboardData?.files.length) return;
			// an empty document field takes rich text too
			const field =
				event.target instanceof HTMLTextAreaElement &&
				event.target.classList.contains('dc-editor') &&
				!event.target.value;
			if (editable(event.target) && !field) return;
			if (
				this.#loadHtml(
					event.clipboardData?.getData(
						'text/html',
					),
				)
			) {
				event.preventDefault();
				return;
			}
			if (field) return;
			const text =
				event.clipboardData?.getData('text/plain') ??
				'';
			if (!text.trim()) return;
			event.preventDefault();
			this.#loadText(text, null);
		};
		document.addEventListener('paste', paste);
		return () => document.removeEventListener('paste', paste);
	});

	doConvert = async () => {
		if (this.convertDisabled) return;
		this.#changed();
		const run = this.#run;
		const live = () => run === this.#run;
		const file = this.file;
		const text = this.text;
		const toFormat = this.toFormat;
		const fromId = this.sourceId;
		const name = `${stem(file?.name ?? this.fileName)}.${toFormat.ext}`;
		const local = (to: string) =>
			!file &&
			!this.toc &&
			!this.numberSections &&
			convertsLocally(fromId, to);

		const stdin = file ? null : text;
		const files: Record<string, Blob | string> = file
			? { [file.name]: file }
			: {};
		const base: Record<string, unknown> = { from: fromId };
		if (file) base['input-files'] = [file.name];
		if (this.toc) base['table-of-contents'] = true;
		if (this.numberSections) base['number-sections'] = true;
		const rendered = async () => {
			if (local('html'))
				return {
					warnings: [],
					stderr: '',
					html: convertLocally(
						text,
						fromId,
						'html',
						true,
					),
				};
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
			return {
				warnings: extractWarnings(res),
				stderr: res.stderr,
				html: res.stdout?.trim()
					? injectPrintStyles(res.stdout)
					: null,
			};
		};

		const engine = !local(
			toFormat.kind === 'pdf' ? 'html' : this.to,
		);
		if (engine && getEngineState() !== 'ready') {
			this.engineState = 'loading';
			try {
				await loadEngine((p) => {
					if (!this.isDestroying)
						this.progress = p;
				});
				if (this.isDestroying) return;
				this.engineState = 'ready';
			} catch (e) {
				if (this.isDestroying) return;
				this.engineState = 'error';
				this.error =
					e instanceof Error
						? e.message
						: String(e);
				return;
			}
		}
		if (!live()) return;

		this.converting = true;
		try {
			if (toFormat.kind === 'pdf') {
				const { warnings, stderr, html } =
					await rendered();
				if (!live()) return;
				this.warnings = warnings;
				if (html) {
					this.result = {
						kind: 'pdf',
						html,
						name,
					};
					this.preview = html + PREVIEW_CSS;
					printHtmlInIframe(html);
				} else
					this.error =
						stderr?.trim() ||
						'Conversion produced no output.';
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
				if (!live()) return;
				this.warnings = extractWarnings(res);
				const blob = res.files[outName];
				if (blob instanceof Blob && blob.size > 0)
					this.result = {
						kind: 'binary',
						blob,
						name,
					};
				else
					this.error =
						res.stderr?.trim() ||
						'Conversion produced no output.';
			} else if (local(this.to)) {
				this.result = {
					kind: 'text',
					text: convertLocally(
						text,
						fromId,
						this.to,
						this.standalone,
					),
					name,
				};
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
				if (!live()) return;
				this.warnings = extractWarnings(res);
				if (res.stdout || !res.stderr?.trim())
					this.result = {
						kind: 'text',
						text: res.stdout ?? '',
						name,
					};
				else this.error = res.stderr.trim();
			}
			if (!this.result) return;
			if (
				toFormat.kind === 'binary' ||
				toFormat.id === 'rtf'
			) {
				const { html } = await rendered();
				if (live() && html)
					this.preview = html + PREVIEW_CSS;
			}
		} catch (e) {
			if (live())
				this.error =
					e instanceof Error
						? e.message
						: String(e);
		} finally {
			if (live()) this.converting = false;
		}
	};

	download = () => {
		const result = this.result;
		if (result?.kind === 'binary')
			downloadBlob(result.blob, result.name);
		else if (result?.kind === 'text')
			downloadBlob(
				new Blob([result.text], {
					type: 'text/plain;charset=utf-8',
				}),
				result.name,
			);
		else if (result?.kind === 'pdf') printHtmlInIframe(result.html);
	};

	<template>
		<CanonSplit
			class="doc-converter"
			@halves={{true}}
			{{filePaste this.selectFile}}
			{{this.pasteText}}
			{{on "dragenter" this.dragEnter}}
			{{on "dragover" this.dragEnter}}
			{{on "dragleave" this.dragLeave}}
			{{on "drop" this.drop}}
		>
			<:sidebar>
				<CanonRows class="dc-source" @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.file}}
						<CanonRow
							class="dc-file"
							@title={{this.file.name}}
							@detail={{formatBytes
								this.file.size
							}}
							@icon={{FileIcon}}
						/>
					{{else}}
						<textarea
							class="dc-editor
								{{if
									this.over
									'dc-editor--over'
								}}"
							aria-label="Document text"
							placeholder="Paste or type the document you want to convert…"
							spellcheck="false"
							value={{this.text}}
							{{on
								"input"
								this.setText
							}}
						></textarea>
					{{/if}}
					{{#if this.fileError}}
						<CanonStatus
							class="dc-file-error"
							@text={{this.fileError}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					{{#if this.notice}}
						<CanonStatus
							class="dc-notice-status"
							@text={{this.notice}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonGrid @columns={{2}}>
						<CanonButton
							class="dc-paste"
							@text="Paste"
							@icon={{PasteIcon}}
							@onClick={{this.paste}}
						/>
						<CanonButton
							class="dc-files"
							@text="Files"
							@icon={{FilesIcon}}
							@onClick={{this.choose}}
						/>
						<CanonButton
							class="dc-scratchpad"
							@text="From Scratchpad"
							@icon={{ScratchpadIcon}}
							title="Load from the Text Scratchpad"
							@onClick={{this.loadScratchpad}}
						/>
						<CanonButton
							class="dc-clear"
							@text="Clear"
							@icon={{ClearIcon}}
							@disabled={{if
								this.hasInput
								false
								true
							}}
							@onClick={{this.clear}}
						/>
					</CanonGrid>
					<input
						class="dc-picker"
						type="file"
						aria-label="Files"
						hidden
						{{this.picker}}
						{{on "change" this.picked}}
					/>
				</CanonRows>
				<CanonRows class="dc-settings" @framed={{true}}>
					<CanonHeading @text="Convert" />
					<div class="dc-formats" role="group">
						<FormatPick
							@value={{this.from}}
							@formats={{inputFormats}}
							@label="Source format"
							@includeAuto={{true}}
							@autoDetectedLabel={{this.autoDetectedLabel}}
							@onChange={{this.setFrom}}
						/>
						<CanonButton
							class="dc-swap"
							@kind="cell"
							@icon={{SwapIcon}}
							@label={{this.swapTitle}}
							title={{this.swapTitle}}
							@disabled={{if
								this.canSwap
								false
								true
							}}
							@onClick={{this.swap}}
						/>
						<FormatPick
							@value={{this.to}}
							@formats={{outputFormats}}
							@label="Target format"
							@onChange={{this.setTo}}
						/>
					</div>
					{{#if this.binaryPaste}}
						<CanonStatus
							class="dc-binary"
							@text="{{this.sourceLabel}} input must be uploaded as a file."
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonRow
						class="dc-standalone"
						@title="Standalone document"
						@detail="Emit a complete file with header/footer, not a fragment."
						as |titleId|
					>
						<CanonSwitch
							aria-labelledby={{titleId}}
							@on={{this.standalone}}
							@disabled={{if
								this.standaloneApplies
								false
								true
							}}
							@onChange={{this.setStandalone}}
						/>
					</CanonRow>
					<CanonRow
						class="dc-toc"
						@title="Table of contents"
						@detail="Generate a TOC from the headings."
						as |titleId|
					>
						<CanonSwitch
							aria-labelledby={{titleId}}
							@on={{this.toc}}
							@onChange={{this.setToc}}
						/>
					</CanonRow>
					<CanonRow
						class="dc-number"
						@title="Number sections"
						@detail="Prefix headings with section numbers."
						as |titleId|
					>
						<CanonSwitch
							aria-labelledby={{titleId}}
							@on={{this.numberSections}}
							@onChange={{this.setNumberSections}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows class="dc-action" @framed={{true}}>
					{{#if this.loading}}
						<CanonRow
							class="dc-progress"
							@title={{this.progressCaption}}
						>
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
						<CanonBar
							@share={{this.progressShare}}
						/>
					{{/if}}
					<CanonButton
						class="dc-convert"
						@kind="primary"
						@text={{this.convertLabel}}
						@icon={{ConvertIcon}}
						@iconStyle="oversized"
						@disabled={{this.convertDisabled}}
						@onClick={{this.doConvert}}
					/>
					{{#if this.error}}
						<CanonStatus
							@text="Failed"
							@tone="warn"
							@row={{true}}
						/>
						<pre
							class="dc-error"
						>{{this.error}}</pre>
					{{/if}}
				</CanonRows>
				<CanonRows class="dc-about" @framed={{true}}>
					<p class="dc-about-text">
						{{ABOUT}}
						<a
							href={{PANDOC_URL}}
							target="_blank"
							rel="noreferrer noopener"
						>Pandoc {{PANDOC_VERSION}}</a>
						(GPL-2.0-or-later).
					</p>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows class="dc-input" @framed={{true}}>
					<CanonHeading @text="Input" />
					<CanonTiles
						@items={{this.inputTiles}}
					/>
				</CanonRows>
				<CanonRows class="dc-output" @framed={{true}}>
					<CanonHeading @text="Output" />
					<CanonTiles
						@items={{this.outputTiles}}
					/>
					{{#if this.preview}}
						<iframe
							class="dc-preview"
							title="Preview"
							sandbox=""
							srcdoc={{this.preview}}
						></iframe>
					{{/if}}
					{{#if this.textResult}}
						<CanonCodeBlock
							class="dc-code"
							aria-label="Converted output"
							@code={{this.textResult.text}}
							@maxHeight={{CODE_HEIGHT}}
						/>
					{{/if}}
					{{#if this.warnings.length}}
						<CanonStatus
							class="dc-warnings-head"
							@text={{this.warningHeader}}
							@tone="warn"
							@row={{true}}
						/>
						<ul class="dc-warnings">
							{{#each
								this.shownWarnings
								as |w|
							}}
								<li>{{w}}</li>
							{{/each}}
							{{#if
								this.moreWarningCount
							}}
								<li>…and
									{{this.moreWarningCount}}
									more</li>
							{{/if}}
						</ul>
					{{/if}}
					{{#if this.pdfResult}}
						<CanonButton
							class="dc-save"
							@kind="primary"
							@text="Save as PDF"
							@icon={{PrintIcon}}
							@iconStyle="oversized"
							@onClick={{this.download}}
						/>
					{{else}}
						<CanonButton
							class="dc-save"
							@kind="primary"
							@text={{this.downloadText}}
							@icon={{SaveIcon}}
							@iconStyle="oversized"
							@disabled={{if
								this.result
								false
								true
							}}
							@onClick={{this.download}}
						/>
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
