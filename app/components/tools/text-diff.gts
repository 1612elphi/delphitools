import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';

export type DiffLine =
	| { type: 'same'; text: string; oldLine: number; newLine: number }
	| { type: 'del'; text: string; oldLine: number }
	| { type: 'add'; text: string; newLine: number };

/** (n+1)×(m+1) Int32 LCS table; 100k×100k lines = 40 tb. above this the middle is wholesale-replaced */
const MAX_CELLS = 4_000_000;

function diffMiddle(a: string[], b: string[], offset: number): DiffLine[] {
	const n = a.length;
	const m = b.length;
	const out: DiffLine[] = [];

	if ((n + 1) * (m + 1) > MAX_CELLS) {
		for (let i = 0; i < n; i++)
			out.push({
				type: 'del',
				text: a[i]!,
				oldLine: offset + i + 1,
			});
		for (let j = 0; j < m; j++)
			out.push({
				type: 'add',
				text: b[j]!,
				newLine: offset + j + 1,
			});
		return out;
	}

	const w = m + 1;
	const lcs = new Int32Array((n + 1) * w);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i * w + j] =
				a[i] === b[j]
					? lcs[(i + 1) * w + j + 1]! + 1
					: Math.max(
							lcs[(i + 1) * w + j]!,
							lcs[i * w + j + 1]!,
						);
		}
	}

	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({
				type: 'same',
				text: a[i]!,
				oldLine: offset + i + 1,
				newLine: offset + j + 1,
			});
			i++;
			j++;
		} else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
			out.push({
				type: 'del',
				text: a[i]!,
				oldLine: offset + i + 1,
			});
			i++;
		} else {
			out.push({
				type: 'add',
				text: b[j]!,
				newLine: offset + j + 1,
			});
			j++;
		}
	}
	while (i < n) {
		out.push({ type: 'del', text: a[i]!, oldLine: offset + i + 1 });
		i++;
	}
	while (j < m) {
		out.push({ type: 'add', text: b[j]!, newLine: offset + j + 1 });
		j++;
	}
	return out;
}

/** oldest first; line nums from 1 both sides */
export function diffLines(oldText: string, newText: string): DiffLine[] {
	const a = oldText.split('\n');
	const b = newText.split('\n');

	// shared head/tail trimmed; shrinks lcs table quadratically
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head])
		head++;

	let tail = 0;
	while (
		tail < a.length - head &&
		tail < b.length - head &&
		a[a.length - 1 - tail] === b[b.length - 1 - tail]
	)
		tail++;

	const out: DiffLine[] = [];
	for (let k = 0; k < head; k++)
		out.push({
			type: 'same',
			text: a[k]!,
			oldLine: k + 1,
			newLine: k + 1,
		});

	out.push(
		...diffMiddle(
			a.slice(head, a.length - tail),
			b.slice(head, b.length - tail),
			head,
		),
	);

	for (let k = 0; k < tail; k++) {
		const oldIndex = a.length - tail + k;
		const newIndex = b.length - tail + k;
		out.push({
			type: 'same',
			text: a[oldIndex]!,
			oldLine: oldIndex + 1,
			newLine: newIndex + 1,
		});
	}

	return out;
}

export function diffStats(diff: DiffLine[]): {
	added: number;
	removed: number;
} {
	let added = 0;
	let removed = 0;
	for (const line of diff) {
		if (line.type === 'add') added++;
		else if (line.type === 'del') removed++;
	}
	return { added, removed };
}

/** context-diff format for clipboard */
export function diffPatch(diff: DiffLine[]): string {
	return diff
		.map((line) => {
			if (line.type === 'add') return `+ ${line.text}`;
			if (line.type === 'del') return `- ${line.text}`;
			return `  ${line.text}`;
		})
		.join('\n');
}

export interface DiffRow {
	type: DiffLine['type'];
	marker: string;
	oldNum: string;
	newNum: string;
	text: string;
}

export function diffRows(diff: DiffLine[]): DiffRow[] {
	return diff.map((line) => ({
		type: line.type,
		// U+2212 aligns under monospaced + sign
		marker:
			line.type === 'add'
				? '+'
				: line.type === 'del'
					? '−'
					: ' ',
		oldNum: line.type === 'add' ? '' : String(line.oldLine),
		newNum: line.type === 'del' ? '' : String(line.newLine),
		// empty line still a row tall
		text: line.text || ' ',
	}));
}

const COPIED_MS = 1500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_ACCEPT =
	'text/*,.txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx';

/** typing defers diff; panes bound to raw text, no o(n·m) wait */
const DEFER_MS = 120;

/**
 * word wrap breaks fixed line-height; mirrored text at same width yields real
 * row heights. written to DOM direct, not tracked state (gutter renders earlier
 * this pass → backtracking rerender).
 */
const alignGutter = modifier(
	(
		root: HTMLElement,
		_positional: [],
		named: { wrap: boolean; text: string },
	) => {
		const gutter = root.querySelector<HTMLElement>('.dt-td-gutter');
		const mirror = root.querySelector<HTMLElement>('.dt-td-mirror');
		const textarea = root.querySelector('textarea');
		if (!gutter || !mirror || !textarea) return;

		const apply = () => {
			const cells = Array.from(
				gutter.children,
			) as HTMLElement[];

			if (!named.wrap) {
				mirror.replaceChildren();
				for (const cell of cells)
					cell.style.height = '';
				return;
			}

			mirror.style.width = `${textarea.clientWidth}px`;
			mirror.replaceChildren(
				...named.text.split('\n').map((line) => {
					const row =
						document.createElement('div');
					row.textContent = line || ' ';
					return row;
				}),
			);

			cells.forEach((cell, index) => {
				const row = mirror.children.item(
					index,
				) as HTMLElement | null;
				cell.style.height = row
					? `${row.offsetHeight}px`
					: '';
			});
		};

		apply();
		const observer = new ResizeObserver(apply);
		observer.observe(textarea);
		return () => observer.disconnect();
	},
);

interface TextPaneSignature {
	Args: {
		label: string;
		value: string;
		onChange: (value: string) => void;
		wrap: boolean;
		isRight?: boolean;
	};
}

class TextPane extends Component<TextPaneSignature> {
	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get lines() {
		return this.args.value ? this.args.value.split('\n') : [''];
	}

	get lineNumbers() {
		return this.lines.map((_, index) => index + 1);
	}

	get accept() {
		return FILE_ACCEPT;
	}

	get placeholder() {
		return `Paste ${this.args.label.toLowerCase()} here...`;
	}

	get copyLabel() {
		return `Copy ${this.args.label.toLowerCase()} to clipboard`;
	}

	get wrapMode() {
		return this.args.wrap ? 'soft' : 'off';
	}

	get isEmpty() {
		return this.args.value.length === 0;
	}

	get paneClass() {
		return this.args.isRight ? 'dt-td-pane is-right' : 'dt-td-pane';
	}

	readFile = async (file: File) => {
		// skip above cap; lcs is o(n²) in lines
		if (file.size > MAX_FILE_BYTES) return;
		this.args.onChange(await file.text());
	};

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void this.readFile(file);
		// reset; same file re-fires change
		input.value = '';
	};

	setValue = (event: Event) => {
		this.args.onChange((event.target as HTMLTextAreaElement).value);
	};

	clear = () => {
		this.args.onChange('');
	};

	// gutter scrollbar hidden; drive scroll here
	syncScroll = (event: Event) => {
		const textarea = event.target as HTMLTextAreaElement;
		const gutter = textarea
			.closest('.dt-td-editor')
			?.querySelector('.dt-td-gutter');
		if (gutter) gutter.scrollTop = textarea.scrollTop;
	};

	paste = () => void this.pasteFromClipboard();

	async pasteFromClipboard() {
		try {
			this.args.onChange(
				await navigator.clipboard.readText(),
			);
		} catch {
		}
	}

	copy = () => void this.copyToClipboard();

	async copyToClipboard() {
		if (!this.args.value) return;
		await navigator.clipboard.writeText(this.args.value);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	}

	<template>
		<div class={{this.paneClass}}>
			<div class="dt-td-pane-head">
				<span class="dt-td-pane-label">{{@label}}</span>
				<div class="dt-td-pane-tools">
					{{! name on label: visible word hidden below sm; display:none names nothing }}
					<label
						class="dt-td-btn is-wide"
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
						<Icon @name="upload" />
						<span
							class="dt-td-btn-text"
						>Open</span>
					</label>
					<button
						type="button"
						class="dt-td-btn"
						aria-label="Paste from clipboard"
						{{on "click" this.paste}}
					>
						<Icon @name="clipboard-paste" />
					</button>
					<button
						type="button"
						class="dt-td-btn"
						disabled={{this.isEmpty}}
						aria-label={{this.copyLabel}}
						{{on "click" this.copy}}
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
						class="dt-td-btn"
						disabled={{this.isEmpty}}
						aria-label="Clear"
						{{on "click" this.clear}}
					>
						<Icon @name="x" />
					</button>
				</div>
			</div>

			<div
				class="dt-td-editor"
				{{alignGutter wrap=@wrap text=@value}}
			>
				<div
					class="dt-td-mirror"
					aria-hidden="true"
				></div>
				<div class="dt-td-gutter" aria-hidden="true">
					{{#each
						this.lineNumbers key="@index"
						as |number|
					}}
						<div>{{number}}</div>
					{{/each}}
				</div>
				<textarea
					class="dt-td-textarea"
					spellcheck="false"
					wrap={{this.wrapMode}}
					aria-label={{@label}}
					placeholder={{this.placeholder}}
					value={{@value}}
					{{on "input" this.setValue}}
					{{on "scroll" this.syncScroll}}
				></textarea>
			</div>
		</div>
	</template>
}

export default class TextDiffTool extends Component {
	@tracked oldText = '';
	@tracked newText = '';
	@tracked deferredOld = '';
	@tracked deferredNew = '';
	@tracked wrap = false;
	@tracked copied = false;

	#deferTimer?: ReturnType<typeof setTimeout>;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#deferTimer);
		clearTimeout(this.#copiedTimer);
	}

	get diff() {
		return diffLines(this.deferredOld, this.deferredNew);
	}

	get stats() {
		return diffStats(this.diff);
	}

	get rows() {
		return diffRows(this.diff);
	}

	get hasContent() {
		return this.oldText.length > 0 || this.newText.length > 0;
	}

	get allSame() {
		return (
			this.hasContent &&
			this.stats.added === 0 &&
			this.stats.removed === 0
		);
	}

	#defer() {
		clearTimeout(this.#deferTimer);
		this.#deferTimer = setTimeout(() => {
			this.deferredOld = this.oldText;
			this.deferredNew = this.newText;
		}, DEFER_MS);
	}

	setOld = (value: string) => {
		this.oldText = value;
		this.#defer();
	};

	setNew = (value: string) => {
		this.newText = value;
		this.#defer();
	};

	setWrap = (wrap: boolean) => {
		this.wrap = wrap;
	};

	readFile = async (file: File) => {
		if (file.size > MAX_FILE_BYTES) return;
		this.setOld(await file.text());
	};

	copyPatch = () => void this.copy();

	async copy() {
		await navigator.clipboard.writeText(diffPatch(this.diff));
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	}

	<template>
		<div
			class="dt-td"
			{{filePaste this.readFile accept=FILE_ACCEPT}}
		>
			<div class="dt-td-frame">
				<div class="dt-td-options">
					{{#if this.hasContent}}
						<div class="dt-td-stats">
							<span
								class="dt-td-stat"
							>
								<span
									class="dt-td-chip is-add"
								></span>
								{{this.stats.added}}
								added
							</span>
							<span
								class="dt-td-stat"
							>
								<span
									class="dt-td-chip is-del"
								></span>
								{{this.stats.removed}}
								removed
							</span>
						</div>
					{{else}}
						<span></span>
					{{/if}}

					<div
						class="segmented dt-td-wrap-toggle"
					>
						<button
							type="button"
							class="dt-td-wrap-option
								{{unless
									this.wrap
									'is-active'
								}}"
							aria-pressed={{unless
								this.wrap
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.setWrap
									false
								)
							}}
						>
							No wrap
						</button>
						<button
							type="button"
							class="dt-td-wrap-option
								{{if
									this.wrap
									'is-active'
								}}"
							aria-pressed={{if
								this.wrap
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.setWrap
									true
								)
							}}
						>
							Word wrap
						</button>
					</div>
				</div>

				<div class="dt-td-panes">
					<TextPane
						@label="Old Text"
						@value={{this.oldText}}
						@onChange={{this.setOld}}
						@wrap={{this.wrap}}
					/>
					<TextPane
						@label="New Text"
						@value={{this.newText}}
						@onChange={{this.setNew}}
						@wrap={{this.wrap}}
						@isRight={{true}}
					/>
				</div>

				<div class="dt-td-output-head">
					<span
						class="dt-td-output-label"
					>Differences</span>
					<button
						type="button"
						class="dt-td-btn is-wide"
						disabled={{unless
							this.hasContent
							true
						}}
						{{on "click" this.copyPatch}}
					>
						<Icon
							@name={{if
								this.copied
								"check"
								"copy"
							}}
						/>
						<span
							class="dt-td-btn-text"
						>{{if
								this.copied
								"Copied"
								"Copy patch"
							}}</span>
					</button>
				</div>

				<div class="dt-td-output">
					{{#if this.hasContent}}
						{{#if this.allSame}}
							<p
								class="dt-td-empty"
							>Texts are identical.</p>
						{{else}}
							<div
								class="dt-td-diff
									{{if
										this.wrap
										'is-wrap'
									}}"
							>
								{{#each
									this.rows
									key="@index"
									as |row|
								}}
									<div
										class="dt-td-row is-{{row.type}}"
									>
										<span
											class="dt-td-num"
										>{{row.oldNum}}</span>
										<span
											class="dt-td-num"
										>{{row.newNum}}</span>
										<span
											class="dt-td-marker"
										>{{row.marker}}</span>
										<span
											class="dt-td-text"
										>{{row.text}}</span>
									</div>
								{{/each}}
							</div>
						{{/if}}
					{{else}}
						<p class="dt-td-empty">Paste
							text on both sides to
							see the differences.</p>
					{{/if}}
				</div>
			</div>

			<p class="dt-td-credit">
				contributed by
				<a
					href="https://github.com/Pranavk-official"
					target="_blank"
					rel="noopener noreferrer"
				>Pranav K</a>
				with some tweaks: word wrap toggle with synced
				line numbers, flat typed array for the lcs
				table, deferred diff computation, file size cap,
				and a few accessibility fixes.
			</p>
		</div>
	</template>
}
