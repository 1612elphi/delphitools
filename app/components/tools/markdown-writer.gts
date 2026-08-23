import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import type Owner from '@ember/owner';
import Icon from 'delphitools-v2/components/icon';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { downloadText } from 'delphitools-v2/lib/download';
import { TEXT_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';

const STORAGE_KEY = 'delphitools-scratchpad';
const ACCEPT = acceptAttr(TEXT_ACCEPT);
const SAVE_DEBOUNCE_MS = 1000;
const COPIED_MS = 1500;

/* ── Case conversions ──────────────────────────────────────────────────── */

export function toUpper(text: string): string {
	return text.toUpperCase();
}

export function toLower(text: string): string {
	return text.toLowerCase();
}

export function toTitleCase(text: string): string {
	return text.replace(
		/\w\S*/g,
		(word) =>
			word.charAt(0).toUpperCase() +
			word.slice(1).toLowerCase(),
	);
}

export function toSentenceCase(text: string): string {
	return text
		.toLowerCase()
		.replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase());
}

export function toCamelCase(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) =>
			c.toUpperCase(),
		);
}

export function toSnakeCase(text: string): string {
	return text
		.replace(/\s+/g, '_')
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.replace(/_+/g, '_');
}

export function toKebabCase(text: string): string {
	return text
		.replace(/\s+/g, '-')
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-');
}

/* ── Line operations ───────────────────────────────────────────────────── */

export function sortLines(text: string): string {
	return text
		.split('\n')
		.sort((a, b) => a.localeCompare(b))
		.join('\n');
}

export function sortLinesReverse(text: string): string {
	return text
		.split('\n')
		.sort((a, b) => b.localeCompare(a))
		.join('\n');
}

export function sortByLength(text: string): string {
	return text
		.split('\n')
		.sort((a, b) => a.length - b.length)
		.join('\n');
}

export function reverseLines(text: string): string {
	return text.split('\n').reverse().join('\n');
}

/** Fisher–Yates over a copy; the source shuffled the array it had just split. */
export function shuffleLines(text: string): string {
	const lines = text.split('\n');
	for (let i = lines.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const a = lines[i]!;
		const b = lines[j]!;
		lines[i] = b;
		lines[j] = a;
	}
	return lines.join('\n');
}

export function removeDuplicates(text: string): string {
	return [...new Set(text.split('\n'))].join('\n');
}

export function addLineNumbers(text: string): string {
	return text
		.split('\n')
		.map((line, i) => `${i + 1}. ${line}`)
		.join('\n');
}

export function removeLineNumbers(text: string): string {
	return text
		.split('\n')
		.map((line) => line.replace(/^\d+[.):-]\s*/, ''))
		.join('\n');
}

/* ── Clean up ──────────────────────────────────────────────────────────── */

export function trimWhitespace(text: string): string {
	return text
		.split('\n')
		.map((line) => line.trim())
		.join('\n');
}

export function removeEmptyLines(text: string): string {
	return text
		.split('\n')
		.filter((line) => line.trim())
		.join('\n');
}

export function removeLineBreaks(text: string): string {
	return text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function removeExtraSpaces(text: string): string {
	return text.replace(/[^\S\n]+/g, ' ');
}

/** Greedy wrap at `width` columns. A word longer than `width` gets its own line. */
export function wrapAt(text: string, width: number): string {
	const lines: string[] = [];
	let current = '';
	for (const word of text.split(/\s+/)) {
		if (current.length + word.length + 1 <= width) {
			current += (current ? ' ' : '') + word;
		} else {
			if (current) lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines.join('\n');
}

export function encodeUrl(text: string): string {
	return encodeURIComponent(text);
}

/** Throws on a malformed percent sequence; the caller reports that. */
export function decodeUrl(text: string): string {
	return decodeURIComponent(text);
}

/* ── Find and replace ──────────────────────────────────────────────────── */

/** Throws when `useRegex` is on and the pattern does not compile. */
export function replaceIn(
	text: string,
	find: string,
	replacement: string,
	useRegex: boolean,
	all: boolean,
): string {
	if (useRegex) {
		return text.replace(
			new RegExp(find, all ? 'g' : ''),
			replacement,
		);
	}
	return all
		? text.split(find).join(replacement)
		: text.replace(find, replacement);
}

/** Zero for an empty or uncompilable pattern, so the count never reads as an error. */
export function countMatches(
	text: string,
	find: string,
	useRegex: boolean,
): number {
	if (!find) return 0;
	try {
		if (useRegex) {
			return (text.match(new RegExp(find, 'g')) ?? []).length;
		}
		return text.split(find).length - 1;
	} catch {
		return 0;
	}
}

/* ── Extraction ────────────────────────────────────────────────────────── */

export const EXTRACT_PATTERNS = {
	emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	urls: /https?:\/\/[^\s<>"{}|\\^`[\]]+/g,
	numbers: /-?\d+\.?\d*/g,
} as const;

export type ExtractKind = keyof typeof EXTRACT_PATTERNS;

/** Deduplicated, in first-seen order. */
export function extract(text: string, kind: ExtractKind): string[] {
	return [...new Set(text.match(EXTRACT_PATTERNS[kind]) ?? [])];
}

/* ── Panel data ────────────────────────────────────────────────────────── */

interface TransformButton {
	label: string;
	run: (text: string) => string;
	/** Alerted instead of thrown when `run` rejects the input. */
	error?: string;
	title?: string;
	wide?: boolean;
}

// Labels and titles carried over from the Next app, verbatim.
export const PANELS: { id: string; icon: string; label: string }[] = [
	{ id: 'case', icon: 'case-upper', label: 'Case' },
	{ id: 'lines', icon: 'arrow-up-down', label: 'Lines' },
	{ id: 'cleanup', icon: 'sparkles', label: 'Clean Up' },
	{ id: 'find', icon: 'search', label: 'Find & Replace' },
	{ id: 'extract', icon: 'file-text', label: 'Extract' },
];

const CASE_BUTTONS: TransformButton[] = [
	{ label: 'UPPERCASE', run: toUpper },
	{ label: 'lowercase', run: toLower },
	{ label: 'Title Case', run: toTitleCase },
	{ label: 'Sentence case', run: toSentenceCase },
	{ label: 'camelCase', run: toCamelCase },
	{ label: 'snake_case', run: toSnakeCase },
	{ label: 'kebab-case', run: toKebabCase, wide: true },
];

const LINE_BUTTONS: TransformButton[] = [
	{ label: 'Sort A–Z', run: sortLines },
	{ label: 'Sort Z–A', run: sortLinesReverse },
	{ label: 'By Length', run: sortByLength },
	{ label: 'Reverse Order', run: reverseLines },
	{ label: 'Shuffle', run: shuffleLines },
	{ label: 'Remove Duplicates', run: removeDuplicates },
	{ label: 'Add Line Nos.', run: addLineNumbers },
	{ label: 'Remove Line Nos.', run: removeLineNumbers },
];

const CLEANUP_BUTTONS: TransformButton[] = [
	{ label: 'Trim Lines', run: trimWhitespace },
	{ label: 'Remove Empty Lines', run: removeEmptyLines },
	{ label: 'Remove Extra Spaces', run: removeExtraSpaces },
	{ label: 'Join Lines', run: removeLineBreaks },
	{ label: 'Wrap at 80', run: (t) => wrapAt(t, 80) },
	{ label: 'Wrap at 120', run: (t) => wrapAt(t, 120) },
	{
		label: 'Encode URL',
		run: encodeUrl,
		title: 'Encode special characters (e.g. / → %2F)',
	},
	{
		label: 'Decode URL',
		run: decodeUrl,
		title: 'Decode %XX characters (e.g. %2F → /)',
		error: 'Unable to decode - text may contain invalid percent-encoded sequences',
	},
];

const EXTRACT_BUTTONS: { label: string; kind: ExtractKind }[] = [
	{ label: 'Extract Emails', kind: 'emails' },
	{ label: 'Extract URLs', kind: 'urls' },
	{ label: 'Extract Numbers', kind: 'numbers' },
];

const INVALID_REGEX = 'Invalid regex pattern';
const CLEAR_PROMPT = 'Clear all content?';

export default class MarkdownWriterTool extends Component {
	@tracked content = '';
	@tracked copied = false;
	@tracked lastSaved: Date | null = null;
	@tracked findText = '';
	@tracked replaceText = '';
	@tracked useRegex = false;
	@tracked extractedItems: string[] = [];
	@tracked activePanel: string | null = null;

	#editor: HTMLTextAreaElement | null = null;
	#saveTimer?: ReturnType<typeof setTimeout>;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		if (typeof localStorage === 'undefined') return;
		this.content = localStorage.getItem(STORAGE_KEY) ?? '';
	}

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#saveTimer);
		clearTimeout(this.#copiedTimer);
	}

	// The textarea's own value is the input to every transform, so the element
	// itself is the state the handlers need.
	registerEditor = modifier((element: HTMLTextAreaElement) => {
		this.#editor = element;
		return () => {
			if (this.#editor === element) this.#editor = null;
		};
	});

	get panels() {
		return PANELS;
	}

	get caseButtons() {
		return CASE_BUTTONS;
	}

	get lineButtons() {
		return LINE_BUTTONS;
	}

	get cleanupButtons() {
		return CLEANUP_BUTTONS;
	}

	get extractButtons() {
		return EXTRACT_BUTTONS;
	}

	get wordCount() {
		return this.content.trim()
			? this.content.trim().split(/\s+/).length
			: 0;
	}

	get charCount() {
		return this.content.length;
	}

	get lineCount() {
		return this.content ? this.content.split('\n').length : 0;
	}

	get savedAt() {
		return this.lastSaved?.toLocaleTimeString() ?? '';
	}

	get matchCount() {
		return countMatches(this.content, this.findText, this.useRegex);
	}

	togglePanel = (id: string) => {
		this.activePanel = this.activePanel === id ? null : id;
	};

	setContent = (event: Event) => {
		this.content = (event.target as HTMLTextAreaElement).value;
		this.#scheduleSave();
	};

	/** a dropped, pasted or handed-off file replaces the draft */
	readFile = async (file: File) => {
		if (!matchesAccept(file, ACCEPT)) return;
		if (this.content.trim() && !confirm('Replace draft?')) return;
		this.content = await file.text();
		this.#scheduleSave();
	};

	drop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) void this.readFile(file);
	};

	dragOver = (event: DragEvent) => event.preventDefault();

	#scheduleSave() {
		clearTimeout(this.#saveTimer);
		if (!this.content) return;
		this.#saveTimer = setTimeout(() => {
			localStorage.setItem(STORAGE_KEY, this.content);
			this.lastSaved = new Date();
		}, SAVE_DEBOUNCE_MS);
	}

	/**
	 * Routed through the textarea's own insertText command so the browser's undo
	 * stack (Ctrl+Z) records the change, as the Next app did.
	 */
	#applyTransform(transform: (text: string) => string) {
		const editor = this.#editor;
		if (!editor) return;
		const next = transform(editor.value);
		if (next === editor.value) return;
		editor.focus();
		editor.select();
		document.execCommand('insertText', false, next);
		// Fallback where insertText is a no-op; undo is lost, the edit is not.
		if (editor.value !== next) editor.value = next;
		this.content = editor.value;
		this.#scheduleSave();
	}

	apply = (button: TransformButton) => {
		try {
			this.#applyTransform(button.run);
		} catch (error) {
			if (!button.error) throw error;
			alert(button.error);
		}
	};

	setFindText = (event: Event) => {
		this.findText = (event.target as HTMLInputElement).value;
	};

	setReplaceText = (event: Event) => {
		this.replaceText = (event.target as HTMLInputElement).value;
	};

	setUseRegex = (event: Event) => {
		this.useRegex = (event.target as HTMLInputElement).checked;
	};

	doReplace = (all: boolean) => {
		if (!this.findText) return;
		try {
			this.#applyTransform((text) =>
				replaceIn(
					text,
					this.findText,
					this.replaceText,
					this.useRegex,
					all,
				),
			);
		} catch {
			alert(INVALID_REGEX);
		}
	};

	runExtract = (kind: ExtractKind) => {
		this.extractedItems = extract(this.content, kind);
	};

	copyExtracted = () => {
		void navigator.clipboard.writeText(
			this.extractedItems.join('\n'),
		);
	};

	copyContent = () => {
		void navigator.clipboard.writeText(this.content);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	downloadContent = () => {
		downloadText(this.content, 'scratchpad.txt', 'text/plain');
	};

	clearContent = () => {
		if (!confirm(CLEAR_PROMPT)) return;
		this.content = '';
		if (this.#editor) this.#editor.value = '';
		clearTimeout(this.#saveTimer);
		localStorage.removeItem(STORAGE_KEY);
		this.lastSaved = null;
	};

	<template>
		<div
			class="dt-md"
			{{filePaste this.readFile accept=ACCEPT}}
			{{on "drop" this.drop}}
			{{on "dragover" this.dragOver}}
		>
			<div class="dt-md-tabs">
				{{#each this.panels key="id" as |panel|}}
					<button
						type="button"
						class="dt-md-tab
							{{if
								(eq
									this.activePanel
									panel.id
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.togglePanel
								panel.id
							)
						}}
					>
						<Icon @name={{panel.icon}} />
						{{panel.label}}
						<Icon
							class="dt-md-tab-chevron"
							@name="chevron-down"
						/>
					</button>
				{{/each}}
			</div>

			{{#if (eq this.activePanel "case")}}
				<div class="dt-md-panel">
					<div class="segmented dt-md-actions">
						{{#each
							this.caseButtons
							key="label"
							as |op|
						}}
							<button
								type="button"
								class="dt-md-action
									{{if
										op.wide
										'is-wide'
									}}"
								{{on
									"click"
									(fn
										this.apply
										op
									)
								}}
							>{{op.label}}</button>
						{{/each}}
					</div>
				</div>
			{{/if}}

			{{#if (eq this.activePanel "lines")}}
				<div class="dt-md-panel">
					<div class="segmented dt-md-actions">
						{{#each
							this.lineButtons
							key="label"
							as |op|
						}}
							<button
								type="button"
								class="dt-md-action"
								{{on
									"click"
									(fn
										this.apply
										op
									)
								}}
							>{{op.label}}</button>
						{{/each}}
					</div>
				</div>
			{{/if}}

			{{#if (eq this.activePanel "cleanup")}}
				<div class="dt-md-panel">
					<div class="segmented dt-md-actions">
						{{#each
							this.cleanupButtons
							key="label"
							as |op|
						}}
							<button
								type="button"
								class="dt-md-action"
								title={{op.title}}
								{{on
									"click"
									(fn
										this.apply
										op
									)
								}}
							>{{op.label}}</button>
						{{/each}}
					</div>
				</div>
			{{/if}}

			{{#if (eq this.activePanel "find")}}
				<div class="dt-md-panel">
					<div class="dt-md-find">
						{{! wording carried over from the Next app }}
						<input
							type="text"
							class="dt-md-find-input"
							value={{this.findText}}
							placeholder="Find…"
							aria-label="Find"
							{{on
								"input"
								this.setFindText
							}}
						/>
						{{! wording carried over from the Next app }}
						<input
							type="text"
							class="dt-md-find-input"
							value={{this.replaceText}}
							placeholder="Replace with…"
							aria-label="Replace with"
							{{on
								"input"
								this.setReplaceText
							}}
						/>
					</div>
					<div class="dt-md-find-bar">
						<label class="dt-md-check">
							<input
								type="checkbox"
								checked={{this.useRegex}}
								{{on
									"change"
									this.setUseRegex
								}}
							/>
							{{! wording carried over from the Next app }}
							Use Regex
						</label>
						{{#if this.findText}}
							{{! wording carried over from the Next app }}
							<span
								class="dt-md-matches"
							>{{this.matchCount}}
								matches</span>
						{{/if}}
						<div
							class="segmented dt-md-replace-actions"
						>
							<button
								type="button"
								class="dt-md-action"
								{{on
									"click"
									(fn
										this.doReplace
										false
									)
								}}
							>Replace</button>
							<button
								type="button"
								class="dt-md-action is-primary"
								{{on
									"click"
									(fn
										this.doReplace
										true
									)
								}}
							>Replace All</button>
						</div>
					</div>
				</div>
			{{/if}}

			{{#if (eq this.activePanel "extract")}}
				<div class="dt-md-panel">
					<div
						class="segmented dt-md-actions is-thirds"
					>
						{{#each
							this.extractButtons
							key="kind"
							as |op|
						}}
							<button
								type="button"
								class="dt-md-action"
								{{on
									"click"
									(fn
										this.runExtract
										op.kind
									)
								}}
							>{{op.label}}</button>
						{{/each}}
					</div>
					{{#if this.extractedItems}}
						<div class="dt-md-extracted">
							<div
								class="dt-md-extracted-bar"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-md-extracted-count"
								>{{this.extractedItems.length}}
									items
									found</span>
								<button
									type="button"
									class="dt-md-extracted-copy"
									{{on
										"click"
										this.copyExtracted
									}}
								>
									<Icon
										@name="copy"
									/>
									{{! wording carried over from the Next app }}
									Copy All
								</button>
							</div>
							<div
								class="dt-md-extracted-list"
							>
								{{#each
									this.extractedItems
									key="@identity"
									as |item|
								}}
									<div
										class="dt-md-extracted-item"
									>{{item}}</div>
								{{/each}}
							</div>
						</div>
					{{/if}}
				</div>
			{{/if}}

			{{! wording carried over from the Next app }}
			<textarea
				class="dt-md-editor"
				aria-label="Scratchpad"
				placeholder="Start typing or paste text here…"
				value={{this.content}}
				{{this.registerEditor}}
				{{on "input" this.setContent}}
			></textarea>

			<div class="dt-md-status">
				<div class="dt-md-stats">
					{{! wording carried over from the Next app }}
					<span>{{this.wordCount}} words</span>
					{{! wording carried over from the Next app }}
					<span>{{this.charCount}} chars</span>
					{{! wording carried over from the Next app }}
					<span>{{this.lineCount}} lines</span>
					{{#if this.lastSaved}}
						{{! wording carried over from the Next app }}
						<span class="dt-md-saved">Saved
							{{this.savedAt}}</span>
					{{/if}}
				</div>
				<div class="dt-md-status-actions">
					<button
						type="button"
						class="dt-md-status-btn"
						title="Copy"
						aria-label="Copy"
						{{on "click" this.copyContent}}
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
						class="dt-md-status-btn"
						title={{passAlong "Download"}}
						aria-label={{passAlong
							"Download"
						}}
						{{on
							"click"
							this.downloadContent
						}}
					>
						<Icon
							@name={{(downloadIcon)}}
						/>
					</button>
					<button
						type="button"
						class="dt-md-status-btn"
						title="Clear"
						aria-label="Clear"
						{{on "click" this.clearContent}}
					>
						<Icon @name="trash-2" />
					</button>
				</div>
			</div>
		</div>
	</template>
}
