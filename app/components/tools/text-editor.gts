import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from 'delphitools-v2/components/ui/popover';
import {
	DEFAULT_SETTINGS,
	type EditorSettings,
} from 'delphitools-v2/lib/editor/settings';
import {
	GUTTER_FIELDS,
	measureGutter,
	type GutterRow,
} from 'delphitools-v2/lib/editor/gutter';
import type { BlockChoice } from 'delphitools-v2/lib/editor/block-types';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import type Owner from '@ember/owner';

type EditorCore = typeof import('delphitools-v2/lib/editor/core');

const DOC_KEY = 'delphitools-editor';
const SEED = '';
// Ghost text shown in an empty document; wording carried over from the Next app.
const PLACEHOLDER =
	'The Karman Institute for Planetary Observation has confirmed that Earth is no longer able to sustain organic life. After decades of atmospheric collapse, sensor data from the Donna Shirley Space Telescope indicates that oxygen and nitrogen concentrations in the atmosphere have reached irreversible levels of depletion. Carbon dioxide levels, combined with solar radiation and the absence of a protective ozone layer, have rendered the surface barren. The final viable microbial traces recorded last year by automated spectroscopic satellites have now vanished.';

const HIDE_MS = 2500;
const COPIED_MS = 1500;

type BoolKey = Exclude<keyof EditorSettings, 'enabledFields'>;

interface Bubble {
	top: number;
	left: number;
	strong: boolean;
	em: boolean;
	strikethrough: boolean;
	code: boolean;
	link: boolean;
}

interface BlockMenu {
	pos: number;
	top: number;
	node: PMNode | null;
}

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
	let node = el?.parentElement ?? null;
	while (node) {
		const oy = getComputedStyle(node).overflowY;
		if (
			(oy === 'auto' || oy === 'scroll') &&
			node.scrollHeight > node.clientHeight
		)
			return node;
		node = node.parentElement;
	}
	return null;
}

export default class TextEditorTool extends Component {
	@tracked rows: GutterRow[] = [];
	@tracked settings: EditorSettings = DEFAULT_SETTINGS;
	@tracked source = '';
	@tracked copied = false;
	@tracked zen = false;
	@tracked toolbarVisible = true;
	@tracked wordCount = 0;
	@tracked activeBlockPos: number | null = null;
	@tracked bubble: Bubble | null = null;
	@tracked blockMenu: BlockMenu | null = null;
	@tracked choices: BlockChoice[] = [];

	ed: EditorCore | null = null;
	view: EditorView | null = null;
	frame = 0;
	// The document is never persisted (privacy). `dirty` tracks unsaved edits so
	// we can warn before the page unloads. Cleared when the user exports a copy.
	dirty = false;
	menuEl: HTMLElement | null = null;
	hideTimer: ReturnType<typeof setTimeout> | null = null;
	copiedTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(owner: Owner, args: Record<string, never>) {
		super(owner, args);
		window.addEventListener('beforeunload', this.onBeforeUnload);
	}

	willDestroy() {
		super.willDestroy();
		window.removeEventListener('beforeunload', this.onBeforeUnload);
		window.removeEventListener('mousemove', this.zenActivity);
		document.removeEventListener('keydown', this.zenKeydown);
		document.removeEventListener('mousedown', this.menuOutside);
		document.removeEventListener('keydown', this.menuKey);
		if (this.hideTimer) clearTimeout(this.hideTimer);
		if (this.copiedTimer) clearTimeout(this.copiedTimer);
	}

	onBeforeUnload = (e: BeforeUnloadEvent) => {
		if (this.dirty) {
			e.preventDefault();
			e.returnValue = '';
		}
	};

	get toolbarFaded() {
		return this.zen && !this.toolbarVisible;
	}

	get hasPad() {
		return this.settings.showGutter || this.settings.showMarginLine;
	}

	get gutterRows() {
		return this.rows.map((row) => ({
			row,
			key: row.key,
			active: row.pos === this.activeBlockPos,
			// offsets come from ProseMirror's own layout measurements
			style: htmlSafe(`top: ${row.top}px`),
		}));
	}

	get menuItems() {
		const menu = this.blockMenu;
		if (!menu) return [];
		return this.choices.map((choice) => ({
			choice,
			pos: menu.pos,
			active: menu.node ? choice.isActive(menu.node) : false,
		}));
	}

	get blockMenuStyle() {
		return htmlSafe(`top: ${this.blockMenu?.top ?? 0}px; left: 0`);
	}

	get bubbleStyle() {
		const b = this.bubble;
		if (!b) return htmlSafe('');
		return htmlSafe(`top: ${b.top - 8}px; left: ${b.left}px`);
	}

	get fieldRows() {
		return GUTTER_FIELDS.map((field) => ({
			field,
			enabled: this.settings.enabledFields.includes(field.id),
		}));
	}

	// wording carried over from the Next app
	get wordCountLabel() {
		const n = this.wordCount;
		let label = `${n} ${n === 1 ? 'word' : 'words'}`;
		if (n > 0) label += ` · ~${Math.ceil(n / 200)} min read`;
		return label;
	}

	scheduleMeasure = () => {
		cancelAnimationFrame(this.frame);
		this.frame = requestAnimationFrame(() => {
			const v = this.view;
			if (v && this.settings.showGutter)
				this.rows = measureGutter(
					v,
					this.settings.enabledFields,
				);
		});
	};

	mount = modifier((element: HTMLElement) => {
		let disposed = false;
		let ro: ResizeObserver | null = null;

		void (async () => {
			const ed =
				await import('delphitools-v2/lib/editor/core');
			if (disposed) return;
			this.ed = ed;
			this.choices = ed.blockChoices(ed.schema);

			// Nothing is persisted across sessions — clean up anything an older
			// build left.
			try {
				localStorage.removeItem(DOC_KEY);
			} catch {
				/* ignore */
			}
			ed.clearStoredSettings();

			let initialState = ed.EditorState.create({
				doc: ed.parseMarkdown(SEED),
				plugins: ed.buildPlugins(
					ed.schema,
					this.settings,
					PLACEHOLDER,
				),
			});
			const fix = ed.fixTables(initialState);
			if (fix) initialState = initialState.apply(fix);

			const view: EditorView = new ed.EditorView(element, {
				state: initialState,
				attributes: {
					class: 'dt-editor',
					spellcheck: 'true',
				},
				nodeViews: ed.buildNodeViews(),
				// Pasting plain text parses it as Markdown (ProseMirror only calls
				// this when there's no rich HTML on the clipboard, so web copy-paste
				// still works).
				clipboardTextParser: (text) => {
					const doc = ed.parseMarkdown(text);
					const first = doc.firstChild;
					// A single paragraph pastes inline (merges into the current
					// line); anything richer pastes as blocks.
					if (
						doc.childCount === 1 &&
						first &&
						first.type.name === 'paragraph'
					) {
						return new ed.Slice(
							first.content,
							0,
							0,
						);
					}
					return doc.slice(0, doc.content.size);
				},
				dispatchTransaction: (tr) => {
					const next = view.state.apply(tr);
					view.updateState(next);
					this.scheduleMeasure();
					if (tr.docChanged) this.dirty = true;

					// Derived UI state: active block, selection bubble, word count.
					const sel = next.selection;
					this.activeBlockPos =
						sel.$from.depth >= 1
							? sel.$from.before(1)
							: null;
					if (
						sel instanceof
							ed.TextSelection &&
						!sel.empty &&
						view.hasFocus()
					) {
						try {
							const a =
								view.coordsAtPos(
									sel.from,
								);
							const b =
								view.coordsAtPos(
									sel.to,
								);
							const has = (
								name: string,
							) => {
								const type =
									next
										.schema
										.marks[
										name
									];
								return type
									? next.doc.rangeHasMark(
											sel.from,
											sel.to,
											type,
										)
									: false;
							};
							this.bubble = {
								top: Math.min(
									a.top,
									b.top,
								),
								left:
									(a.left +
										b.right) /
									2,
								strong: has(
									'strong',
								),
								em: has('em'),
								strikethrough:
									has(
										'strikethrough',
									),
								code: has(
									'code',
								),
								link: has(
									'link',
								),
							};
						} catch {
							this.bubble = null;
						}
					} else {
						this.bubble = null;
					}
					if (tr.docChanged) {
						const text = next.doc
							.textBetween(
								0,
								next.doc.content
									.size,
								' ',
								' ',
							)
							.trim();
						this.wordCount = text
							? text.split(/\s+/)
									.length
							: 0;
					}
				},
				handleScrollToSelection: (v) => {
					if (!this.settings.typewriter)
						return false;
					const coords = v.coordsAtPos(
						v.state.selection.from,
					);
					const scroller = getScrollParent(v.dom);
					if (scroller) {
						const r =
							scroller.getBoundingClientRect();
						scroller.scrollTop +=
							coords.top -
							r.top -
							scroller.clientHeight /
								2;
					} else {
						window.scrollTo({
							top:
								window.scrollY +
								coords.top -
								window.innerHeight /
									2,
						});
					}
					return true;
				},
			});
			this.view = view;
			this.scheduleMeasure();
			const initialText = view.state.doc
				.textBetween(
					0,
					view.state.doc.content.size,
					' ',
					' ',
				)
				.trim();
			this.wordCount = initialText
				? initialText.split(/\s+/).length
				: 0;

			ro = new ResizeObserver(() => this.scheduleMeasure());
			ro.observe(view.dom);
		})();

		return () => {
			disposed = true;
			ro?.disconnect();
			cancelAnimationFrame(this.frame);
			this.view?.destroy();
			this.view = null;
		};
	});

	registerMenu = modifier((element: HTMLElement) => {
		this.menuEl = element;
		return () => {
			this.menuEl = null;
		};
	});

	applySettings = (patch: Partial<EditorSettings>) => {
		const next = { ...this.settings, ...patch };
		this.settings = next;
		const v = this.view;
		if (v && this.ed)
			v.dispatch(v.state.tr.setMeta(this.ed.focusKey, next));
		this.scheduleMeasure();
	};

	toggleBool = (key: BoolKey) => {
		this.applySettings({ [key]: !this.settings[key] });
	};

	toggleField = (id: string) => {
		const fields = this.settings.enabledFields;
		this.applySettings({
			enabledFields: fields.includes(id)
				? fields.filter((x) => x !== id)
				: [...fields, id],
		});
	};

	toggleCodeMode = () => {
		const ed = this.ed;
		const v = this.view;
		if (!ed || !v) return;
		if (!this.settings.codeMode) {
			this.source = ed.serializeDoc(v.state.doc);
			this.applySettings({ codeMode: true });
		} else {
			v.updateState(
				ed.EditorState.create({
					doc: ed.parseMarkdown(this.source),
					plugins: ed.buildPlugins(
						ed.schema,
						this.settings,
						PLACEHOLDER,
					),
				}),
			);
			this.dirty = true;
			this.applySettings({ codeMode: false });
			this.scheduleMeasure();
		}
	};

	setSource = (event: Event) => {
		this.source = (event.target as HTMLTextAreaElement).value;
		this.dirty = true;
	};

	currentDoc(): PMNode | null {
		const ed = this.ed;
		const v = this.view;
		if (!ed || !v) return null;
		return this.settings.codeMode
			? ed.parseMarkdown(this.source)
			: v.state.doc;
	}

	doExport = (kind: 'markdown' | 'html' | 'pdf') => {
		const ed = this.ed;
		const doc = this.currentDoc();
		if (!ed || !doc) return;
		if (kind === 'markdown') ed.exportMarkdown(doc);
		else if (kind === 'html') ed.exportHtml(doc);
		else ed.exportPdf(doc);
		this.dirty = false;
	};

	copyRich = () => {
		const ed = this.ed;
		const doc = this.currentDoc();
		if (!ed || !doc) return;
		void ed
			.copyRichText(doc)
			.then(() => {
				this.copied = true;
				if (this.copiedTimer)
					clearTimeout(this.copiedTimer);
				this.copiedTimer = setTimeout(
					() => (this.copied = false),
					COPIED_MS,
				);
			})
			.catch(() => {
				/* clipboard unavailable */
			});
	};

	// Inline formatting (bubble toolbar on selection).
	applyMark = (markName: string) => {
		const ed = this.ed;
		const view = this.view;
		if (!ed || !view) return;
		const type = view.state.schema.marks[markName];
		if (type) ed.toggleMark(type)(view.state, view.dispatch);
		view.focus();
	};

	addLink = () => {
		const ed = this.ed;
		const view = this.view;
		if (!ed || !view) return;
		const type = view.state.schema.marks.link;
		if (!type) return;
		const { from, to } = view.state.selection;
		if (view.state.doc.rangeHasMark(from, to, type)) {
			ed.toggleMark(type)(view.state, view.dispatch);
		} else {
			const href = window.prompt('Link URL');
			if (href)
				ed.toggleMark(type, { href })(
					view.state,
					view.dispatch,
				);
		}
		view.focus();
	};

	eatMousedown = (event: Event) => {
		event.preventDefault();
	};

	// Convert the block at `pos` (the one whose gutter label was clicked).
	runBlockCommand = (pos: number, choice: BlockChoice) => {
		const ed = this.ed;
		const view = this.view;
		if (!ed || !view) return;
		const { bullet_list, ordered_list, paragraph } =
			view.state.schema.nodes;
		const block = view.state.doc.nodeAt(pos);

		// Block is already a list and a list type was picked → swap the list's
		// type in place (bullet ↔ numbered), keeping the items.
		if (
			choice.listType &&
			block &&
			(block.type === bullet_list ||
				block.type === ordered_list)
		) {
			if (block.type !== choice.listType) {
				view.dispatch(
					view.state.tr.setNodeMarkup(
						pos,
						choice.listType,
					),
				);
			}
			view.focus();
			this.setBlockMenu(null);
			return;
		}

		const inside = Math.min(
			pos + 1,
			view.state.doc.content.size - 1,
		);
		view.dispatch(
			view.state.tr.setSelection(
				ed.TextSelection.near(
					view.state.doc.resolve(inside),
				),
			),
		);
		// For wrapping choices (list/quote), demote a styled block (heading/code)
		// to a plain paragraph first, so the result isn't a heading-sized list item.
		if (choice.wrap && paragraph) {
			const parent = view.state.selection.$from.parent;
			if (parent.isTextblock && parent.type !== paragraph) {
				ed.setBlockType(paragraph)(
					view.state,
					view.dispatch,
				);
			}
		}
		choice.command(view.state, view.dispatch);
		view.focus();
		this.setBlockMenu(null);
	};

	toggleBlockMenu = (row: GutterRow) => {
		const node = this.view?.state.doc.nodeAt(row.pos) ?? null;
		this.setBlockMenu(
			this.blockMenu?.pos === row.pos
				? null
				: { pos: row.pos, top: row.top, node },
		);
	};

	setBlockMenu(menu: BlockMenu | null) {
		if (menu && !this.blockMenu) {
			document.addEventListener(
				'mousedown',
				this.menuOutside,
			);
			document.addEventListener('keydown', this.menuKey);
		} else if (!menu && this.blockMenu) {
			document.removeEventListener(
				'mousedown',
				this.menuOutside,
			);
			document.removeEventListener('keydown', this.menuKey);
		}
		this.blockMenu = menu;
	}

	// Close the block menu on Escape or an outside click (but not on a gutter
	// label, whose own click handler toggles the menu).
	menuOutside = (event: MouseEvent) => {
		const target = event.target as HTMLElement;
		if (
			this.menuEl?.contains(target) ||
			target.closest?.('.dt-block-trigger')
		)
			return;
		this.setBlockMenu(null);
	};

	menuKey = (event: KeyboardEvent) => {
		if (event.key === 'Escape') this.setBlockMenu(null);
	};

	toggleZen = () => {
		this.toolbarVisible = true;
		if (this.zen) this.exitZen();
		else this.enterZen();
	};

	// In Focus mode, auto-hide the toolbar when idle; reveal on mouse/key
	// activity. Escape exits — unless a footnote sub-editor or the block menu
	// should handle it first.
	// zenKeydown goes on the document so it runs BEFORE the block menu's own
	// Escape listener (same target, and zen is always entered first): it must
	// see the menu still open and leave that Escape to the menu.
	enterZen() {
		this.zen = true;
		window.addEventListener('mousemove', this.zenActivity);
		document.addEventListener('keydown', this.zenKeydown);
		this.armHideTimer();
	}

	exitZen() {
		this.zen = false;
		this.toolbarVisible = true;
		window.removeEventListener('mousemove', this.zenActivity);
		document.removeEventListener('keydown', this.zenKeydown);
		if (this.hideTimer) clearTimeout(this.hideTimer);
	}

	zenActivity = () => {
		this.toolbarVisible = true;
		this.armHideTimer();
	};

	zenKeydown = (event: KeyboardEvent) => {
		if (
			event.key === 'Escape' &&
			!this.blockMenu &&
			!(
				document.activeElement as HTMLElement | null
			)?.closest?.('.footnote-tooltip')
		) {
			this.exitZen();
			return;
		}
		this.zenActivity();
	};

	armHideTimer() {
		if (this.hideTimer) clearTimeout(this.hideTimer);
		this.hideTimer = setTimeout(
			() => (this.toolbarVisible = false),
			HIDE_MS,
		);
	}

	<template>
		<div class={{if this.zen "dt-te-zen"}}>
			<div class="dt-te {{if this.zen 'is-zen'}}">
				<div
					class="dt-te-toolbar
						{{if this.zen 'is-zen'}}
						{{if
							this.toolbarFaded
							'is-faded'
						}}"
				>
					{{! wording carried over from the Next app }}
					<button
						type="button"
						class="dt-te-tb-btn is-lead"
						title={{if
							this.zen
							"Exit focus mode"
							"Distraction-free focus mode"
						}}
						{{on "click" this.toggleZen}}
					>
						{{#if this.zen}}
							<Icon
								@name="minimize-2"
							/>
							Exit
						{{else}}
							<Icon
								@name="maximize-2"
							/>
							Focus
						{{/if}}
					</button>
					{{! wording carried over from the Next app }}
					<button
						type="button"
						class="dt-te-tb-btn"
						title="Toggle raw Markdown source"
						{{on
							"click"
							this.toggleCodeMode
						}}
					>
						{{#if this.settings.codeMode}}
							<Icon
								@name="file-text"
							/>
							Preview
						{{else}}
							<Icon @name="code-2" />
							Source
						{{/if}}
					</button>

					<Popover>
						<PopoverTrigger
							@asChild={{true}}
							as |trigger|
						>
							<button
								type="button"
								class="dt-te-tb-btn"
								{{trigger.modifiers}}
							>
								<Icon
									@name="download"
								/>
								Export
							</button>
						</PopoverTrigger>
						<PopoverContent
							class="dt-te-menu is-export"
							@align="end"
						>
							<button
								type="button"
								class="dt-te-menu-item"
								{{on
									"click"
									(fn
										this.doExport
										"markdown"
									)
								}}
							>
								<DownloadLabel
									@label="Markdown (.md)"
									@icon={{false}}
								/>
							</button>
							<button
								type="button"
								class="dt-te-menu-item"
								{{on
									"click"
									(fn
										this.doExport
										"html"
									)
								}}
							>
								<DownloadLabel
									@label="HTML (.html)"
									@icon={{false}}
								/>
							</button>
							{{! wording carried over from the Next app }}
							<button
								type="button"
								class="dt-te-menu-item"
								{{on
									"click"
									this.copyRich
								}}
							>
								{{#if
									this.copied
								}}
									<Icon
										@name="check"
									/>
									Copied!
								{{else}}
									<Icon
										@name="copy"
									/>
									Copy as
									rich
									text
								{{/if}}
							</button>
							<button
								type="button"
								class="dt-te-menu-item"
								{{on
									"click"
									(fn
										this.doExport
										"pdf"
									)
								}}
							>
								PDF (print)
							</button>
						</PopoverContent>
					</Popover>

					<Popover>
						<PopoverTrigger
							@asChild={{true}}
							as |trigger|
						>
							<button
								type="button"
								class="dt-te-tb-btn is-icon"
								title="Settings"
								{{trigger.modifiers}}
							>
								<Icon
									@name="settings"
								/>
							</button>
						</PopoverTrigger>
						<PopoverContent
							class="dt-te-menu is-settings"
							@align="end"
						>
							{{! wording carried over from the Next app }}
							<label
								class="dt-te-setting"
							>
								<span>Highlight
									current
									sentence</span>
								<input
									type="checkbox"
									class="dt-te-switch"
									checked={{this.settings.highlightSentence}}
									{{on
										"change"
										(fn
											this.toggleBool
											"highlightSentence"
										)
									}}
								/>
							</label>
							<label
								class="dt-te-setting"
							>
								<span>Highlight
									current
									paragraph</span>
								<input
									type="checkbox"
									class="dt-te-switch"
									checked={{this.settings.highlightParagraph}}
									{{on
										"change"
										(fn
											this.toggleBool
											"highlightParagraph"
										)
									}}
								/>
							</label>
							<label
								class="dt-te-setting"
							>
								<span>Dim
									inactive
									paragraphs</span>
								<input
									type="checkbox"
									class="dt-te-switch"
									checked={{this.settings.dimInactive}}
									{{on
										"change"
										(fn
											this.toggleBool
											"dimInactive"
										)
									}}
								/>
							</label>
							<label
								class="dt-te-setting"
							>
								<span>Typewriter
									scrolling</span>
								<input
									type="checkbox"
									class="dt-te-switch"
									checked={{this.settings.typewriter}}
									{{on
										"change"
										(fn
											this.toggleBool
											"typewriter"
										)
									}}
								/>
							</label>
							<hr class="dt-te-sep" />
							<label
								class="dt-te-setting"
							>
								<span>Show
									gutter</span>
								<input
									type="checkbox"
									class="dt-te-switch"
									checked={{this.settings.showGutter}}
									{{on
										"change"
										(fn
											this.toggleBool
											"showGutter"
										)
									}}
								/>
							</label>
							<label
								class="dt-te-setting"
							>
								<span>Show
									margin
									line</span>
								<input
									type="checkbox"
									class="dt-te-switch"
									checked={{this.settings.showMarginLine}}
									{{on
										"change"
										(fn
											this.toggleBool
											"showMarginLine"
										)
									}}
								/>
							</label>
							<hr class="dt-te-sep" />
							<p
								class="dt-te-menu-caption"
							>Gutter fields</p>
							{{#each
								this.fieldRows
								key="field.id"
								as |row|
							}}
								<label
									class="dt-te-setting"
								>
									<span
										class="is-capitalised"
									>{{row.field.label}}</span>
									<input
										type="checkbox"
										class="dt-te-switch"
										checked={{row.enabled}}
										{{on
											"change"
											(fn
												this.toggleField
												row.field.id
											)
										}}
									/>
								</label>
							{{/each}}
						</PopoverContent>
					</Popover>
				</div>

				<div class="dt-te-surface">
					{{#if this.settings.codeMode}}
						<textarea
							class="dt-te-source"
							spellcheck="false"
							aria-label="Markdown source"
							value={{this.source}}
							{{on
								"input"
								this.setSource
							}}
						></textarea>
					{{/if}}

					<div
						class="dt-te-canvas
							{{if
								this.settings.codeMode
								'is-hidden'
							}}"
					>
						{{#if this.settings.showGutter}}
							<div
								class="dt-te-gutter"
							>
								{{#each
									this.gutterRows
									key="key"
									as |r|
								}}
									<div
										class="dt-te-gutter-row"
										style={{r.style}}
									>
										<button
											type="button"
											class="dt-block-trigger
												{{if
													r.active
													'is-active'
												}}"
											title="Change block type"
											{{on
												"click"
												(fn
													this.toggleBlockMenu
													r.row
												)
											}}
										>
											{{r.row.type}}
										</button>
										{{#each
											r.row.fields
											key="id"
											as |f|
										}}
											<div
												class="dt-te-gutter-field"
											>
												{{f.value}}
												{{f.label}}
											</div>
										{{/each}}
									</div>
								{{/each}}
							</div>
						{{/if}}

						{{#if this.blockMenu}}
							<div
								class="dt-te-blockmenu"
								style={{this.blockMenuStyle}}
								{{this.registerMenu}}
							>
								{{#each
									this.menuItems
									key="choice.label"
									as |item|
								}}
									<button
										type="button"
										class="dt-te-blockmenu-item
											{{if
												item.active
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.runBlockCommand
												item.pos
												item.choice
											)
										}}
									>
										{{item.choice.label}}
										{{#if
											item.active
										}}
											<Icon
												@name="check"
											/>
										{{/if}}
									</button>
								{{/each}}
							</div>
						{{/if}}

						{{#if
							this.settings.showMarginLine
						}}
							<div
								class="dt-te-margin"
								aria-hidden="true"
							></div>
						{{/if}}

						<div
							class="dt-te-host
								{{if
									this.hasPad
									'has-pad'
								}}"
							{{this.mount}}
						></div>
					</div>
				</div>

				{{#if this.bubble}}
					{{! mousedown would move the editor selection away, which is what the bubble is anchored to }}
					{{! template-lint-disable no-pointer-down-event-binding no-invalid-interactive }}
					<div
						class="dt-te-bubble"
						style={{this.bubbleStyle}}
						{{on
							"mousedown"
							this.eatMousedown
						}}
					>
						<button
							type="button"
							class="dt-te-bubble-btn
								{{if
									this.bubble.strong
									'is-on'
								}}"
							title="Bold"
							{{on
								"click"
								(fn
									this.applyMark
									"strong"
								)
							}}
						>
							<Icon @name="bold" />
						</button>
						<button
							type="button"
							class="dt-te-bubble-btn
								{{if
									this.bubble.em
									'is-on'
								}}"
							title="Italic"
							{{on
								"click"
								(fn
									this.applyMark
									"em"
								)
							}}
						>
							<Icon @name="italic" />
						</button>
						<button
							type="button"
							class="dt-te-bubble-btn
								{{if
									this.bubble.strikethrough
									'is-on'
								}}"
							title="Strikethrough"
							{{on
								"click"
								(fn
									this.applyMark
									"strikethrough"
								)
							}}
						>
							<Icon
								@name="strikethrough"
							/>
						</button>
						<button
							type="button"
							class="dt-te-bubble-btn
								{{if
									this.bubble.code
									'is-on'
								}}"
							title="Code"
							{{on
								"click"
								(fn
									this.applyMark
									"code"
								)
							}}
						>
							<Icon @name="code" />
						</button>
						<button
							type="button"
							class="dt-te-bubble-btn
								{{if
									this.bubble.link
									'is-on'
								}}"
							title="Link"
							{{on
								"click"
								this.addLink
							}}
						>
							<Icon @name="link" />
						</button>
					</div>
				{{/if}}

				{{#if this.zen}}
					<div
						class="dt-te-count
							{{if
								this.toolbarFaded
								'is-faded'
							}}"
					>
						{{this.wordCountLabel}}
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
