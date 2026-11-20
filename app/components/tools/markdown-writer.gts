import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import MarkedEditor from 'delphitools-v2/components/tools/media/marked-editor';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { TEXT_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import {
	addLineNumbers,
	decodeUrl,
	encodeUrl,
	extract,
	findRanges,
	pieces,
	removeDuplicates,
	removeEmptyLines,
	removeExtraSpaces,
	removeLineBreaks,
	removeLineNumbers,
	replaceIn,
	reverseLines,
	shuffleLines,
	sortByLength,
	sortLines,
	sortLinesReverse,
	toCamelCase,
	toKebabCase,
	toLower,
	toSentenceCase,
	toSnakeCase,
	toTitleCase,
	toUpper,
	trimWhitespace,
	wrapAt,
	type ExtractKind,
} from 'delphitools-v2/components/tools/markdown-writer/text-ops';
import './markdown-writer/markdown-writer.css';

const STORAGE_KEY = 'delphitools-scratchpad';
const ACCEPT = acceptAttr(TEXT_ACCEPT);
const saveDelay = 1000;
const listed = 50;
// ponytail: marks past this stay unlit; the count stays exact
const markLimit = 10_000;

interface Transform {
	label: string;
	run: (text: string) => string;
	title?: string;
}

const caseOps: Transform[] = [
	{ label: 'UPPERCASE', run: toUpper },
	{ label: 'lowercase', run: toLower },
	{ label: 'Title Case', run: toTitleCase },
	{ label: 'Sentence case', run: toSentenceCase },
	{ label: 'camelCase', run: toCamelCase },
	{ label: 'snake_case', run: toSnakeCase },
	{ label: 'kebab-case', run: toKebabCase },
];

const lineOps: Transform[] = [
	{ label: 'Sort A–Z', run: sortLines },
	{ label: 'Sort Z–A', run: sortLinesReverse },
	{ label: 'Sort by Length', run: sortByLength },
	{ label: 'Reverse Order', run: reverseLines },
	{ label: 'Shuffle', run: shuffleLines },
	{ label: 'Remove Duplicates', run: removeDuplicates },
	{ label: 'Add Line Numbers', run: addLineNumbers },
	{ label: 'Remove Line Numbers', run: removeLineNumbers },
];

const cleanOps: Transform[] = [
	{ label: 'Trim Lines', run: trimWhitespace },
	{ label: 'Remove Empty Lines', run: removeEmptyLines },
	{ label: 'Remove Extra Spaces', run: removeExtraSpaces },
	{ label: 'Join Lines', run: removeLineBreaks },
	{ label: 'Wrap at 80', run: (text) => wrapAt(text, 80) },
	{ label: 'Wrap at 120', run: (text) => wrapAt(text, 120) },
	{
		label: 'URL Encode',
		run: encodeUrl,
		title: 'Encode special characters (e.g. / → %2F)',
	},
];

const extractOps: { label: string; kind: ExtractKind }[] = [
	{ label: 'Emails', kind: 'emails' },
	{ label: 'URLs', kind: 'urls' },
	{ label: 'Numbers', kind: 'numbers' },
];

const FilesIcon = <template><IconSvg @name="folder" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;
const CopyIcon = <template><IconSvg @name="copy" /></template>;
const DownloadIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const count = (n: number) => n.toLocaleString();

function readStore(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? '';
	} catch {
		return '';
	}
}

function writeStore(text: string) {
	try {
		if (text) localStorage.setItem(STORAGE_KEY, text);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// private mode: the draft stays in memory
	}
}

export default class MarkdownWriterTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked text = '';
	@tracked lastSaved: Date | null = null;
	@tracked findText = '';
	@tracked replaceText = '';
	@tracked useRegex = false;
	@tracked extracted: string[] | null = null;
	@tracked decodeFailed = false;

	#editor?: HTMLTextAreaElement;
	#file?: HTMLInputElement;
	#saveTimer?: number;
	#persists = true;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const padText = query.get('padText');
		if (padText !== null) {
			this.text = padText.replaceAll('\\n', '\n');
			this.#persists = false;
		} else {
			this.text = readStore();
		}
		this.findText = query.get('padFind') ?? '';
		this.useRegex = query.get('padRegex') === '1';
		const kind = query.get('padExtract');
		if (kind && extractOps.some((op) => op.kind === kind))
			this.runExtract(kind as ExtractKind);
		window.addEventListener('pagehide', this.#flush);
	}

	willDestroy() {
		super.willDestroy();
		window.removeEventListener('pagehide', this.#flush);
		this.#flush();
	}

	#flush = () => {
		if (this.#saveTimer === undefined) return;
		window.clearTimeout(this.#saveTimer);
		this.#saveTimer = undefined;
		writeStore(this.text);
	};

	get caseOps() {
		return caseOps;
	}

	get lineOps() {
		return lineOps;
	}

	get cleanOps() {
		return cleanOps;
	}

	get extractOps() {
		return extractOps;
	}

	get empty() {
		return !this.text;
	}

	get words() {
		const trimmed = this.text.trim();
		return count(trimmed ? trimmed.split(/\s+/).length : 0);
	}

	get chars() {
		return count(this.text.length);
	}

	get lines() {
		return count(this.text ? this.text.split('\n').length : 0);
	}

	get savedAt() {
		return this.lastSaved?.toLocaleTimeString() ?? '';
	}

	@cached
	get ranges() {
		return findRanges(this.text, this.findText, this.useRegex);
	}

	get badPattern() {
		return this.ranges === null;
	}

	get matchCount() {
		return this.ranges?.length ?? 0;
	}

	get matchText() {
		return count(this.matchCount);
	}

	get matchUnit() {
		return this.matchCount === 1 ? 'match' : 'matches';
	}

	get cantReplace() {
		return this.matchCount === 0;
	}

	get pieces() {
		return pieces(
			this.text,
			(this.ranges ?? []).slice(0, markLimit),
		);
	}

	get extractHeading() {
		const found = this.extracted;
		return found?.length
			? `${count(found.length)} found`
			: 'Extract';
	}

	get hasExtracted() {
		return this.extracted !== null;
	}

	get listedItems() {
		return this.extracted?.slice(0, listed) ?? [];
	}

	editorElement = modifier((element: HTMLElement) => {
		this.#editor = element.querySelector('textarea') ?? undefined;
	});

	fileField = modifier((element: HTMLInputElement) => {
		this.#file = element;
	});

	setText = (text: string) => {
		this.text = text;
		if (!this.#persists) return;
		window.clearTimeout(this.#saveTimer);
		this.#saveTimer = window.setTimeout(() => {
			this.#saveTimer = undefined;
			writeStore(this.text);
			this.lastSaved = this.text ? new Date() : null;
		}, saveDelay);
	};

	#write(next: string) {
		const editor = this.#editor;
		if (!editor || next === editor.value) return;
		const back = document.activeElement as HTMLElement | null;
		const scroller = editor.closest('.mw-scroll');
		const top = scroller?.scrollTop ?? 0;
		const caret = Math.min(editor.selectionStart, next.length);
		editor.focus({ preventScroll: true });
		editor.select();
		document.execCommand('insertText', false, next);
		if (editor.value !== next) editor.value = next;
		editor.setSelectionRange(caret, caret);
		if (scroller) scroller.scrollTop = top;
		if (back && back !== editor)
			back.focus({ preventScroll: true });
		this.setText(editor.value);
	}

	apply = (op: Transform) => {
		this.decodeFailed = false;
		this.#write(op.run(this.text));
	};

	decode = () => {
		this.decodeFailed = false;
		try {
			this.#write(decodeUrl(this.text));
		} catch {
			this.decodeFailed = true;
		}
	};

	setFind = (value: string) => (this.findText = value);

	setReplace = (value: string) => (this.replaceText = value);

	setRegex = (on: boolean) => (this.useRegex = on);

	replace = (all: boolean) => {
		if (this.cantReplace) return;
		this.#write(
			replaceIn(
				this.text,
				this.findText,
				this.replaceText,
				this.useRegex,
				all,
			),
		);
	};

	runExtract = (kind: ExtractKind) => {
		this.extracted = extract(this.text, kind);
	};

	copyFound = () =>
		void this.toast.copy(this.extracted?.join('\n') ?? '');

	copy = () => void this.toast.copy(this.text);

	download = () =>
		downloadText(this.text, 'scratchpad.txt', 'text/plain');

	clear = () => {
		if (!confirm('Clear all content?')) return;
		this.#write('');
		window.clearTimeout(this.#saveTimer);
		this.#saveTimer = undefined;
		if (this.#persists) writeStore('');
		this.lastSaved = null;
	};

	openFiles = () => this.#file?.click();

	pick = (event: Event) => {
		const field = event.target as HTMLInputElement;
		const file = field.files?.[0];
		field.value = '';
		if (file) void this.readFile(file);
	};

	readFile = async (file: File) => {
		if (!matchesAccept(file, ACCEPT)) return;
		if (this.text.trim() && !confirm('Replace draft?')) return;
		const text = await file.text();
		if (!this.isDestroying) this.#write(text);
	};

	drop = (event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		void this.readFile(file);
	};

	dragOver = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	<template>
		<CanonSplit
			class="markdown-writer"
			@halves={{true}}
			@collapsesTo={{180}}
			{{filePaste this.readFile accept=ACCEPT}}
			{{on "drop" this.drop}}
			{{on "dragover" this.dragOver}}
		>
			<:sidebar>
				<CanonCanvas @height={{2000}}>
					<div class="mw-editor">
						<div class="mw-strip">
							<span
								class="mw-counts"
								role="group"
								aria-label="{{this.words}} words, {{this.chars}} chars, {{this.lines}} lines"
							>
								<CanonFigure
									@text={{this.words}}
									@unit="words"
									@size={{15}}
									@colour="var(--canon-foreground)"
								/>
								<CanonFigure
									@text={{this.chars}}
									@unit="chars"
									@size={{15}}
									@colour="var(--canon-foreground)"
								/>
								<CanonFigure
									@text={{this.lines}}
									@unit="lines"
									@size={{15}}
									@colour="var(--canon-foreground)"
								/>
							</span>
							{{#if this.lastSaved}}
								<span
									class="mw-saved"
								>Saved
									{{this.savedAt}}</span>
							{{/if}}
						</div>
						<div class="mw-scroll">
							<MarkedEditor
								class="mw-text"
								@text={{this.text}}
								@placeholder="Paste or type text here…"
								@label="Text"
								@onInput={{this.setText}}
								{{this.editorElement}}
							>
								{{~#each
									this.pieces
									as |piece|
								~}}
									<span
										class={{if
											piece.hit
											"mw-hit"
										}}
									>{{piece.text}}</span>
								{{~/each~}}
							</MarkedEditor>
						</div>
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Text" />
					<CanonGrid @columns={{2}}>
						<CanonButton
							@text="Files"
							@icon={{FilesIcon}}
							@onClick={{this.openFiles}}
						/>
						<CanonButton
							@text="Clear"
							@icon={{ClearIcon}}
							@disabled={{this.empty}}
							@onClick={{this.clear}}
						/>
					</CanonGrid>
					<input
						type="file"
						accept={{ACCEPT}}
						hidden
						aria-label="Files"
						{{this.fileField}}
						{{on "change" this.pick}}
					/>
					<CanonGrid>
						<CanonButton
							class="mw-download"
							@text={{passAlong
								"Download"
							}}
							@icon={{DownloadIcon}}
							@disabled={{this.empty}}
							@onClick={{this.download}}
						/>
						<CanonButton
							class="mw-copy"
							@text="Copy"
							@icon={{CopyIcon}}
							@iconStyle="oversized"
							@kind="primary"
							@disabled={{this.empty}}
							@onClick={{this.copy}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Case" />
					<CanonGrid @columns={{2}}>
						{{#each this.caseOps as |op|}}
							<CanonButton
								@text={{op.label}}
								@onClick={{fn
									this.apply
									op
								}}
							/>
						{{/each}}
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Lines" />
					<CanonGrid @columns={{2}}>
						{{#each this.lineOps as |op|}}
							<CanonButton
								@text={{op.label}}
								@onClick={{fn
									this.apply
									op
								}}
							/>
						{{/each}}
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Clean Up" />
					<CanonGrid @columns={{2}}>
						{{#each this.cleanOps as |op|}}
							<CanonButton
								title={{op.title}}
								@text={{op.label}}
								@onClick={{fn
									this.apply
									op
								}}
							/>
						{{/each}}
						<CanonButton
							title="Decode %XX characters (e.g. %2F → /)"
							@text="URL Decode"
							@onClick={{this.decode}}
						/>
					</CanonGrid>
					{{#if this.decodeFailed}}
						<CanonStatus
							@text="Invalid escape"
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Find & Replace" />
					<label class="mw-field">
						<IconSvg @name="search" />
						<CanonTextCell
							@value={{this.findText}}
							@placeholder="Find"
							@onChange={{this.setFind}}
							aria-label="Find"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
						/>
					</label>
					<label class="mw-field">
						<IconSvg
							@name="corner-down-right"
						/>
						<CanonTextCell
							@value={{this.replaceText}}
							@placeholder="Replace"
							@onChange={{this.setReplace}}
							aria-label="Replace"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
						/>
					</label>
					<div class="mw-find-status">
						<CanonRow
							@title="Regex"
							as |titleId|
						>
							<CanonSwitch
								aria-labelledby={{titleId}}
								@on={{this.useRegex}}
								@onChange={{this.setRegex}}
							/>
						</CanonRow>
						<span class="mw-find-count">
							{{#if this.badPattern}}
								<CanonStatus
									@text="Invalid regex"
									@tone="warn"
								/>
							{{else if
								this.findText
							}}
								<CanonFigure
									@text={{this.matchText}}
									@unit={{this.matchUnit}}
									@size={{17}}
									@colour="var(--canon-foreground)"
								/>
							{{/if}}
						</span>
					</div>
					<CanonGrid @columns={{2}}>
						<CanonButton
							@text="Replace"
							@disabled={{this.cantReplace}}
							@onClick={{fn
								this.replace
								false
							}}
						/>
						<CanonButton
							@text="Replace All"
							@disabled={{this.cantReplace}}
							@onClick={{fn
								this.replace
								true
							}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text={{this.extractHeading}}
					/>
					<CanonGrid @columns={{3}}>
						{{#each
							this.extractOps
							as |op|
						}}
							<CanonButton
								@text={{op.label}}
								@onClick={{fn
									this.runExtract
									op.kind
								}}
							/>
						{{/each}}
					</CanonGrid>
					{{#if this.hasExtracted}}
						{{#each
							this.listedItems
							key="@index"
							as |item index|
						}}
							<CanonValueLine
								@layout="numbered"
								@label={{rank
									index
								}}
								@value={{item}}
							/>
						{{else}}
							<CanonEmptyRow
								@text="None"
							/>
						{{/each}}
						{{#if this.listedItems.length}}
							<CanonButton
								@text="Copy All"
								@icon={{CopyIcon}}
								@onClick={{this.copyFound}}
							/>
						{{/if}}
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}

function rank(index: number) {
	return String(index + 1);
}
