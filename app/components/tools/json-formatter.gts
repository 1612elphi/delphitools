import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import { htmlSafe, type SafeString } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	INDENT_OPTIONS,
	buildTree,
	flattenTree,
	formatJson,
	parseJson,
	type FlatTreeRow,
	type IndentId,
	type JsonErrorInfo,
} from 'delphitools-v2/lib/json-format';

const ACCEPT = '.json';

const COPIED_MS = 1500;

type ViewMode = 'text' | 'tree';

const VIEWS: { id: ViewMode; label: string }[] = [
	{ id: 'text', label: 'Text' },
	{ id: 'tree', label: 'Tree' },
];

interface SourceLine {
	number: number;
	text: string;
	isError: boolean;
}

/** A tree row with its indentation resolved for the style attribute. */
type ViewRow = FlatTreeRow & { rowStyle: SafeString };

export default class JsonFormatterTool extends Component {
	@tracked source = '';
	@tracked fileName: string | null = null;
	@tracked indent: IndentId = '2';
	@tracked view: ViewMode = 'text';
	@tracked copied: string | null = null;
	@tracked collapsedPaths: ReadonlySet<string> = new Set();

	// The editor is a transparent-text textarea over a rendered copy of the
	// source, the only way to highlight one line inside an editable field.
	// These keep the copy in step with the textarea's scroll.
	@tracked scrollTop = 0;
	@tracked scrollLeft = 0;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get indents() {
		return INDENT_OPTIONS;
	}

	get views() {
		return VIEWS;
	}

	get hasInput() {
		return this.source.trim() !== '';
	}

	get parsed() {
		return this.hasInput ? parseJson(this.source) : null;
	}

	get error(): JsonErrorInfo | null {
		const result = this.parsed;
		return result && !result.ok ? result.error : null;
	}

	get hasResult() {
		return this.parsed?.ok ?? false;
	}

	get formatted(): string {
		const result = this.parsed;
		if (!result?.ok) return '';
		return formatJson(result.value, this.indent);
	}

	get treeRows(): FlatTreeRow[] {
		const result = this.parsed;
		if (!result?.ok) return [];
		return flattenTree(
			buildTree(result.value),
			this.collapsedPaths,
		);
	}

	get treeViewRows(): ViewRow[] {
		return this.treeRows.map((row) => ({
			...row,
			rowStyle: htmlSafe(
				`padding-left: ${8 + row.depth * 18}px`,
			),
		}));
	}

	get sourceLines(): SourceLine[] {
		const errorLine = this.error?.line ?? null;
		return this.source.split('\n').map((line, index) => {
			const number = index + 1;
			// A space keeps an empty row at full height.
			return {
				number,
				text: line === '' ? ' ' : line,
				isError: errorLine === number,
			};
		});
	}

	get lineCount(): number {
		return this.sourceLines.length;
	}

	get backdropShift(): SafeString {
		return htmlSafe(
			`transform: translate(${-this.scrollLeft}px, ${-this.scrollTop}px)`,
		);
	}

	get metaLabel(): string {
		const result = this.parsed;
		if (!result) return this.fileName ?? '';
		if (!result.ok) return 'Invalid';
		const root = buildTree(result.value);
		if (root.children === null) return '';
		const noun = root.kind === 'array' ? 'items' : 'entries';
		return `${root.entryCount} ${noun}`;
	}

	get resultMeta(): string {
		if (!this.hasResult) return '';
		return `${this.formatted.length} B`;
	}

	get downloadName() {
		const name = this.fileName ?? 'formatted.json';
		return name.endsWith('.json') ? name : `${name}.json`;
	}

	setSource = (event: Event) => {
		this.source = (event.target as HTMLTextAreaElement).value;
		this.fileName = null;
	};

	syncScroll = (event: Event) => {
		const area = event.target as HTMLTextAreaElement;
		this.scrollTop = area.scrollTop;
		this.scrollLeft = area.scrollLeft;
	};

	readFile = (file: File) => void this.#load(file);

	async #load(file: File) {
		this.source = await file.text();
		this.fileName = file.name;
		this.scrollTop = 0;
		this.scrollLeft = 0;
	}

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setIndent = (id: IndentId) => {
		this.indent = id;
	};

	setView = (mode: ViewMode) => {
		this.view = mode;
	};

	toggleCollapsed = (path: string) => {
		const next = new Set(this.collapsedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		this.collapsedPaths = next;
	};

	copyValue = (value: string, key: string) => void this.copy(value, key);

	async copy(value: string, key: string) {
		await navigator.clipboard.writeText(value);
		this.copied = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	}

	download = () => {
		if (!this.hasResult) return;
		downloadText(
			this.formatted,
			this.downloadName,
			'application/json;charset=utf-8',
		);
	};

	clear = () => {
		this.source = '';
		this.fileName = null;
		this.collapsedPaths = new Set();
		this.scrollTop = 0;
		this.scrollLeft = 0;
	};

	<template>
		<div class="dt-jf" {{filePaste this.readFile accept=ACCEPT}}>
			<div
				class="dt-jf-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				<div class="dt-jf-bar">
					<Icon @name="braces" />
					<span class="dt-jf-name">JSON Formatter</span>
					{{#if this.metaLabel}}
						<span
							class="dt-jf-meta"
						>{{this.metaLabel}}</span>
					{{/if}}
					<div class="dt-jf-bar-tools">
						<label
							class="dt-jf-btn"
							aria-label="Open file"
						>
							<input
								type="file"
								class="dt-sr-only"
								accept=".json"
								{{on
									"change"
									this.chooseFile
								}}
							/>
							<Icon @name="upload" />
						</label>
						<button
							type="button"
							class="dt-jf-btn"
							aria-label="Clear"
							disabled={{unless
								this.hasInput
								true
							}}
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="x" />
						</button>
						<button
							type="button"
							class="dt-jf-btn
								{{if
									(eq
										this.copied
										'bar'
									)
									'is-copied'
								}}"
							aria-label="Copy"
							disabled={{unless
								this.hasResult
								true
							}}
							{{on
								"click"
								(fn
									this.copyValue
									this.formatted
									"bar"
								)
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"bar"
									)
									"check"
									"copy"
								}}
							/>
						</button>
						<button
							type="button"
							class="dt-jf-btn is-primary"
							aria-label={{passAlong
								"Download"
							}}
							disabled={{unless
								this.hasResult
								true
							}}
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name={{(downloadIcon
								)}}
							/>
						</button>
					</div>
				</div>

				<div class="dt-jf-settings">
					<div class="dt-jf-cell">
						<span>Indent</span>
						<div
							class="segmented dt-jf-indent"
						>
							{{#each
								this.indents
								key="id"
								as |option|
							}}
								<button
									type="button"
									class="dt-jf-opt
										{{if
											(eq
												this.indent
												option.id
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setIndent
											option.id
										)
									}}
								>{{option.label}}</button>
							{{/each}}
						</div>
					</div>
					<div class="dt-jf-cell">
						<span>View</span>
						<div
							class="segmented dt-jf-view"
						>
							{{#each
								this.views
								key="id"
								as |option|
							}}
								<button
									type="button"
									class="dt-jf-opt
										{{if
											(eq
												this.view
												option.id
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setView
											option.id
										)
									}}
								>{{option.label}}</button>
							{{/each}}
						</div>
					</div>
				</div>

				<div class="dt-jf-panes">
					<section class="dt-jf-pane">
						<div class="dt-jf-pane-head">
							<span
								class="dt-jf-pane-label"
							>Source</span>
							<span
								class="dt-jf-pane-meta"
							>{{this.lineCount}}
								lines</span>
						</div>
						<div class="dt-jf-editor">
							<div
								class="dt-jf-lines"
								aria-hidden="true"
							>
								<div
									class="dt-jf-lines-inner"
									style={{this.backdropShift}}
								>
									{{#each
										this.sourceLines
										key="number"
										as |line|
									}}
										<div
											class="dt-jf-line
												{{if
													line.isError
													'is-error'
												}}"
										><span
												class="dt-jf-line-no"
											>{{line.number}}</span><span
												class="dt-jf-line-text"
											>{{line.text}}</span></div>
									{{/each}}
								</div>
							</div>
							<textarea
								class="dt-jf-source"
								aria-label="JSON source"
								placeholder="Paste JSON"
								spellcheck="false"
								autocomplete="off"
								autocorrect="off"
								autocapitalize="off"
								wrap="off"
								value={{this.source}}
								{{on
									"input"
									this.setSource
								}}
								{{on
									"scroll"
									this.syncScroll
								}}
							></textarea>
						</div>
					</section>

					<section class="dt-jf-pane is-result">
						<div class="dt-jf-pane-head">
							<span
								class="dt-jf-pane-label"
							>Result</span>
							<span
								class="dt-jf-pane-meta"
							>{{this.resultMeta}}</span>
						</div>
						{{#if this.error}}
							<div
								class="dt-jf-error"
							>
								<Icon
									@name="alert-triangle"
								/>
								<span
									class="dt-jf-error-message"
								>{{this.error.message}}</span>
								<span
									class="dt-jf-error-position"
								>{{this.error.line}}:{{this.error.column}}</span>
							</div>
						{{else if
							(eq this.view "tree")
						}}
							<div class="dt-jf-tree">
								{{#each
									this.treeViewRows
									key="node.path"
									as |row|
								}}
									<div
										class="dt-jf-tree-row"
										style={{row.rowStyle}}
									>
										{{#if
											row.node.children
										}}
											<button
												type="button"
												class="dt-jf-tree-caret"
												aria-label={{if
													row.collapsed
													"Expand"
													"Collapse"
												}}
												{{on
													"click"
													(fn
														this.toggleCollapsed
														row.node.path
													)
												}}
											>
												<Icon
													@name={{if
														row.collapsed
														"chevron-right"
														"chevron-down"
													}}
												/>
											</button>
										{{else}}
											<span
												class="dt-jf-tree-leaf"
											></span>
										{{/if}}
										{{#unless
											(eq
												row.node.key
												null
											)
										}}
											<span
												class="dt-jf-tree-key"
											>{{row.node.key}}</span>
										{{/unless}}
										{{#if
											(eq
												row.node.children
												null
											)
										}}
											<span
												class="dt-jf-tree-value is-{{row.node.kind}}"
											>{{row.display}}</span>
										{{else}}
											<span
												class="dt-jf-tree-count"
											>{{row.node.entryCount}}
												{{if
													(eq
														row.node.kind
														"array"
													)
													"items"
													"entries"
												}}</span>
										{{/if}}
									</div>
								{{/each}}
							</div>
						{{else}}
							<textarea
								class="dt-jf-output"
								aria-label="Formatted output"
								placeholder="Output"
								spellcheck="false"
								readonly
								wrap="off"
								value={{this.formatted}}
							></textarea>
						{{/if}}
					</section>
				</div>
			</div>
		</div>
	</template>
}
