import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenu, {
	CanonMenuList,
	showMenu,
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSheet from 'delphicanon/components/canon-sheet';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { attach } from 'delphicanon/lib/popover';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { TEXT_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import { passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
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
import type { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import {
	blockMark,
	countStats,
} from 'delphitools-v2/components/tools/text-editor/marks';
import * as ed from 'delphitools-v2/lib/editor/core';
import './text-editor/text-editor.css';

const DOC_KEY = 'delphitools-editor';
const ACCEPT = acceptAttr(TEXT_ACCEPT);
const PLACEHOLDER =
	'The Karman Institute for Planetary Observation has confirmed that Earth is no longer able to sustain organic life. After decades of atmospheric collapse, sensor data from the Donna Shirley Space Telescope indicates that oxygen and nitrogen concentrations in the atmosphere have reached irreversible levels of depletion. Carbon dioxide levels, combined with solar radiation and the absence of a protective ozone layer, have rendered the surface barren. The final viable microbial traces recorded last year by automated spectroscopic satellites have now vanished.';

const HIDE_MS = 2500;
const BUBBLE = { half: 96, height: 44 };
const fonts = ['Sans', 'Serif', 'Mono'];
const fontClasses = ['', 'te-pane--serif', 'te-pane--mono'];

type BoolKey = Exclude<keyof EditorSettings, 'enabledFields' | 'codeMode'>;

const switches: { key: BoolKey; title: string }[] = [
	{ key: 'highlightSentence', title: 'Highlight current sentence' },
	{ key: 'highlightParagraph', title: 'Highlight current paragraph' },
	{ key: 'dimInactive', title: 'Dim inactive paragraphs' },
	{ key: 'typewriter', title: 'Typewriter scrolling' },
	{ key: 'showGutter', title: 'Show gutter' },
	{ key: 'showMarginLine', title: 'Show margin line' },
];

const exports = [
	{ title: 'Markdown (.md)', kind: 'markdown', download: true },
	{ title: 'HTML (.html)', kind: 'html', download: true },
	{ title: 'Copy as rich text', kind: 'rich', download: false },
	{ title: 'PDF (print)', kind: 'pdf', download: false },
] as const;

const FolderIcon = <template><IconSvg @name="folder" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;
const FullIcon = <template><IconSvg @name="maximize-2" /></template>;
const ExitIcon = <template><IconSvg @name="minimize-2" /></template>;
const SourceIcon = <template><IconSvg @name="code-2" /></template>;
const ExportIcon = <template><IconSvg @name="download" /></template>;
const CopyIcon = <template><IconSvg @name="copy" /></template>;
const SettingsIcon = <template><IconSvg @name="settings-2" /></template>;

interface Bubble {
	top: number;
	left: number;
	below: boolean;
	strong: boolean;
	em: boolean;
	strikethrough: boolean;
	code: boolean;
	link: boolean;
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

function plainText(doc: PMNode): string {
	return doc.textBetween(0, doc.content.size, '\n', ' ');
}

function isEmptyDoc(doc: PMNode): boolean {
	const first = doc.firstChild;
	return (
		doc.childCount === 1 &&
		!!first &&
		first.isTextblock &&
		first.content.size === 0
	);
}

const clamp = (value: number, low: number, high: number) =>
	Math.min(Math.max(value, low), Math.max(low, high));

export default class TextEditorTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked rows: GutterRow[] = [];
	@tracked settings: EditorSettings = DEFAULT_SETTINGS;
	@tracked source = '';
	@tracked plain = '';
	@tracked empty = true;
	@tracked font = 0;
	@tracked zen = false;
	@tracked toolbarVisible = true;
	@tracked activeBlockPos: number | null = null;
	@tracked bubble: Bubble | null = null;
	@tracked menuNode: PMNode | null = null;
	@tracked choices: BlockChoice[] = [];
	@tracked native = false;
	@tracked overlay = false;
	@tracked settingsOpen = false;

	view: EditorView | null = null;
	#pendingText: string | null = null;
	#startsInSource = false;
	frame = 0;
	dirty = false;
	hideTimer: ReturnType<typeof setTimeout> | null = null;
	#pane?: HTMLElement;
	#picker?: HTMLInputElement;
	#menuPanel?: HTMLElement;
	#menuPoint?: HTMLElement;
	#menuTrigger?: HTMLElement;
	#menuPos = 0;
	#settingsCell?: HTMLElement;

	constructor(owner: Owner, args: Record<string, never>) {
		super(owner, args);
		window.addEventListener('beforeunload', this.onBeforeUnload);
		document.addEventListener(
			'fullscreenchange',
			this.fullscreenChanged,
		);
		const query = new URLSearchParams(window.location.search);
		const text = query.get('teText');
		if (text !== null) this.#pendingText = text;
		this.font = Math.min(
			2,
			Math.max(0, Number(query.get('teFont')) || 0),
		);
		const on = (name: string) => query.get(name) === '1';
		const off = (name: string) => query.get(name) === '0';
		const fields = query.get('teFields');
		this.settings = {
			...DEFAULT_SETTINGS,
			highlightSentence: on('teSentence'),
			highlightParagraph: on('teParagraph'),
			dimInactive: on('teDim'),
			typewriter: on('teTypewriter'),
			showGutter: !off('teGutter'),
			showMarginLine: !off('teMargin'),
			enabledFields:
				fields === null
					? DEFAULT_SETTINGS.enabledFields
					: fields.split(',').filter(Boolean),
		};
		this.#startsInSource = on('teSource');
	}

	willDestroy() {
		super.willDestroy();
		window.removeEventListener('beforeunload', this.onBeforeUnload);
		document.removeEventListener(
			'fullscreenchange',
			this.fullscreenChanged,
		);
		window.removeEventListener('mousemove', this.zenActivity);
		document.removeEventListener('keydown', this.zenKeydown);
		if (this.hideTimer) clearTimeout(this.hideTimer);
		if (document.fullscreenElement === this.#pane)
			void document.exitFullscreen().catch(() => {});
	}

	onBeforeUnload = (e: BeforeUnloadEvent) => {
		if (this.dirty) {
			e.preventDefault();
			e.returnValue = '';
		}
	};

	get paneClass() {
		return [
			'te-pane',
			fontClasses[this.font],
			this.zen && 'te-pane--zen',
			this.overlay && 'te-pane--overlay',
			this.toolbarFaded && 'te-pane--faded',
			this.settings.typewriter && 'te-pane--typewriter',
			this.hasPad && 'te-pane--pad',
		]
			.filter(Boolean)
			.join(' ');
	}

	get toolbarFaded() {
		return this.zen && !this.toolbarVisible;
	}

	get hasPad() {
		return this.settings.showGutter || this.settings.showMarginLine;
	}

	get fonts() {
		return fonts;
	}

	get switchRows() {
		return switches.map((row) => ({
			...row,
			on: this.settings[row.key],
		}));
	}

	get gutterRows() {
		return this.rows.map((row) => ({
			row,
			key: row.key,
			mark: blockMark(row.type),
			name: this.choiceName(row) ?? row.type,
			active: row.pos === this.activeBlockPos,
			style: htmlSafe(`top: ${row.top}px`),
		}));
	}

	nodeAt(pos: number): PMNode | null {
		const doc = this.view?.state.doc;
		return doc && pos < doc.content.size ? doc.nodeAt(pos) : null;
	}

	choiceName(row: GutterRow) {
		const node = this.nodeAt(row.pos);
		return node
			? this.choices.find((choice) => choice.isActive(node))
					?.label
			: undefined;
	}

	get menuItems(): CanonMenuEntry[] {
		const node = this.menuNode;
		return this.choices.map((choice) => ({
			title: choice.label,
			kind: 'radio',
			checked: node ? choice.isActive(node) : false,
		}));
	}

	@cached
	get exportItems(): CanonMenuEntry[] {
		return exports.map((entry) => ({
			title: entry.download
				? passAlong(entry.title)
				: entry.title,
		}));
	}

	get bubbleStyle() {
		const b = this.bubble;
		if (!b) return htmlSafe('');
		return htmlSafe(`top: ${b.top}px; left: ${b.left}px`);
	}

	get fieldRows() {
		return GUTTER_FIELDS.map((field) => ({
			field,
			title:
				field.label.charAt(0).toUpperCase() +
				field.label.slice(1),
			enabled: this.settings.enabledFields.includes(field.id),
		}));
	}

	get stats() {
		return countStats(
			this.settings.codeMode ? this.source : this.plain,
		);
	}

	get figures() {
		const { stats } = this;
		return [
			{ label: 'Words', value: stats.words.toLocaleString() },
			{
				label: 'Characters',
				value: stats.characters.toLocaleString(),
			},
			{ label: 'Lines', value: stats.lines.toLocaleString() },
			{
				label: 'Reading time',
				value: `${stats.minutes} min`,
			},
		];
	}

	get isEmpty() {
		return this.settings.codeMode
			? this.source.trim() === ''
			: this.empty;
	}

	get wordCountLabel() {
		const n = this.stats.words;
		let label = `${n} ${n === 1 ? 'word' : 'words'}`;
		if (n > 0) label += ` · ~${Math.ceil(n / 200)} min read`;
		return label;
	}

	scheduleMeasure = () => {
		cancelAnimationFrame(this.frame);
		this.frame = requestAnimationFrame(() => {
			const v = this.view;
			if (v && this.bubble) this.#updateBubble(v, v.state);
			if (v && this.settings.showGutter)
				this.rows = measureGutter(
					v,
					this.settings.enabledFields,
				);
		});
	};

	#readDoc(doc: PMNode) {
		this.plain = plainText(doc);
		this.empty = isEmptyDoc(doc);
	}

	#updateBubble(view: EditorView, state: EditorState) {
		const sel = state.selection;
		const pane = this.#pane;
		if (
			!pane ||
			!(sel instanceof ed.TextSelection) ||
			sel.empty ||
			!view.hasFocus()
		) {
			this.bubble = null;
			return;
		}
		try {
			const a = view.coordsAtPos(sel.from);
			const b = view.coordsAtPos(sel.to);
			const frame = pane.getBoundingClientRect();
			const top = Math.min(a.top, b.top) - frame.top;
			const below = top < BUBBLE.height;
			const has = (name: string) => {
				const type = state.schema.marks[name];
				return type
					? state.doc.rangeHasMark(
							sel.from,
							sel.to,
							type,
						)
					: false;
			};
			this.bubble = {
				top: below
					? Math.max(a.bottom, b.bottom) -
						frame.top +
						8
					: top - 8,
				left: clamp(
					(a.left + b.right) / 2 - frame.left,
					BUBBLE.half,
					frame.width - BUBBLE.half,
				),
				below,
				strong: has('strong'),
				em: has('em'),
				strikethrough: has('strikethrough'),
				code: has('code'),
				link: has('link'),
			};
		} catch {
			this.bubble = null;
		}
	}

	keepPane = modifier((element: HTMLElement) => {
		this.#pane = element;
	});

	keepPicker = modifier((input: HTMLInputElement) => {
		this.#picker = input;
	});

	keepSettingsCell = modifier((cell: HTMLElement) => {
		this.#settingsCell = cell;
	});

	openSettings = () => (this.settingsOpen = true);

	closeSettings = () => {
		this.settingsOpen = false;
		this.#settingsCell?.focus();
	};

	keepMenu = modifier((panel: HTMLElement) => {
		this.#menuPanel = panel;
		this.#menuPoint = panel.previousElementSibling as HTMLElement;
		return attach(panel, this.#menuPoint, {
			placement: 'bottom-start',
			gap: '0px',
			returnFocus: () => this.#menuTrigger,
		});
	});

	rescroll = () => {
		const v = this.view;
		if (v && this.bubble) this.#updateBubble(v, v.state);
	};

	mount = modifier((element: HTMLElement) => {
		let gone = false;
		let tearDown: (() => void) | undefined;
		queueMicrotask(() => {
			if (!gone) tearDown = this.#setUp(element);
		});
		return () => {
			gone = true;
			tearDown?.();
		};
	});

	#setUp(element: HTMLElement) {
		this.choices = ed.blockChoices(ed.schema);

		try {
			localStorage.removeItem(DOC_KEY);
		} catch {
			// storage blocked: nothing to remove
		}
		ed.clearStoredSettings();

		let initialState = ed.EditorState.create({
			doc: ed.parseMarkdown(''),
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
				role: 'textbox',
				'aria-multiline': 'true',
				'aria-label': 'Text',
			},
			nodeViews: ed.buildNodeViews(),
			clipboardTextParser: (text) => {
				const doc = ed.parseMarkdown(text);
				const first = doc.firstChild;
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
				if (tr.docChanged) {
					this.dirty = true;
					this.#readDoc(next.doc);
				}
				const sel = next.selection;
				this.activeBlockPos =
					sel.$from.depth >= 1
						? sel.$from.before(1)
						: null;
				this.#updateBubble(view, next);
			},
			handleScrollToSelection: (v) => {
				if (!this.settings.typewriter) return false;
				const coords = v.coordsAtPos(
					v.state.selection.from,
				);
				const scroller = getScrollParent(v.dom);
				if (!scroller) return false;
				const r = scroller.getBoundingClientRect();
				scroller.scrollTop +=
					coords.top -
					r.top -
					scroller.clientHeight / 2;
				return true;
			},
		});
		this.view = view;
		if (this.#pendingText !== null) {
			const text = this.#pendingText;
			this.#pendingText = null;
			this.#load(text);
		}
		if (this.#startsInSource) this.toggleCodeMode();
		this.#readDoc(view.state.doc);
		this.scheduleMeasure();

		const ro = new ResizeObserver(() => this.scheduleMeasure());
		ro.observe(view.dom);

		return () => {
			ro.disconnect();
			cancelAnimationFrame(this.frame);
			this.view?.destroy();
			this.view = null;
		};
	}

	applySettings = (patch: Partial<EditorSettings>) => {
		const next = { ...this.settings, ...patch };
		this.settings = next;
		const v = this.view;
		if (v) v.dispatch(v.state.tr.setMeta(ed.focusKey, next));
		this.scheduleMeasure();
	};

	setBool = (key: BoolKey, value: boolean) => {
		this.applySettings({ [key]: value });
	};

	setField = (id: string, value: boolean) => {
		const fields = this.settings.enabledFields.filter(
			(x) => x !== id,
		);
		this.applySettings({
			enabledFields: value ? [...fields, id] : fields,
		});
	};

	setFont = (index: number) => {
		this.font = index;
		this.scheduleMeasure();
	};

	toggleCodeMode = () => {
		const v = this.view;
		if (!v) return;
		if (!this.settings.codeMode) {
			this.source = ed.serializeDoc(v.state.doc);
			this.bubble = null;
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
			this.#readDoc(v.state.doc);
			this.dirty = true;
			this.applySettings({ codeMode: false });
		}
	};

	setSource = (event: Event) => {
		this.source = (event.target as HTMLTextAreaElement).value;
		this.dirty = true;
	};

	readFile = async (file: File) => {
		if (!matchesAccept(file, ACCEPT)) return;
		const text = await file.text();
		if (!this.isDestroying) this.#load(text);
	};

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void this.readFile(file);
	};

	openFile = () => this.#picker?.click();

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

	#load(text: string) {
		const v = this.view;
		if (!v) {
			this.#pendingText = text;
			return;
		}
		if (this.settings.codeMode) {
			this.source = text;
		} else {
			let state = ed.EditorState.create({
				doc: ed.parseMarkdown(text),
				plugins: ed.buildPlugins(
					ed.schema,
					this.settings,
					PLACEHOLDER,
				),
			});
			const fix = ed.fixTables(state);
			if (fix) state = state.apply(fix);
			v.updateState(state);
			this.#readDoc(state.doc);
			this.scheduleMeasure();
		}
		this.dirty = true;
	}

	clear = () => {
		const v = this.view;
		if (this.settings.codeMode) {
			const area =
				document.querySelector<HTMLTextAreaElement>(
					'.text-editor .te-source',
				);
			area?.focus();
			area?.select();
			document.execCommand('delete');
			if (this.source) this.source = '';
			return;
		}
		const paragraph = v?.state.schema.nodes.paragraph;
		if (!v || !paragraph) return;
		v.dispatch(
			v.state.tr.replaceWith(
				0,
				v.state.doc.content.size,
				paragraph.create(),
			),
		);
		v.focus();
	};

	currentDoc(): PMNode | null {
		const v = this.view;
		if (!v) return null;
		return this.settings.codeMode
			? ed.parseMarkdown(this.source)
			: v.state.doc;
	}

	copy = () => {
		const v = this.view;
		if (!v) return;
		void this.toast.copy(
			this.settings.codeMode
				? this.source
				: ed.serializeDoc(v.state.doc),
		);
	};

	doExport = (item: CanonMenuItem) => {
		const doc = this.currentDoc();
		const kind = exports[this.exportItems.indexOf(item)]?.kind;
		if (!doc || !kind) return;
		if (kind === 'rich') {
			void ed
				.copyRichText(doc)
				.then(() => this.toast.show())
				.catch(() => {});
			return;
		}
		if (kind === 'markdown') ed.exportMarkdown(doc);
		else if (kind === 'html') ed.exportHtml(doc);
		else ed.exportPdf(doc);
		this.dirty = false;
	};

	applyMark = (markName: string) => {
		const view = this.view;
		if (!view) return;
		const type = view.state.schema.marks[markName];
		if (type) ed.toggleMark(type)(view.state, view.dispatch);
		view.focus();
	};

	addLink = () => {
		const view = this.view;
		if (!view) return;
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

	openBlockMenu = (row: GutterRow, event: MouseEvent) => {
		const point = this.#menuPoint;
		const panel = this.#menuPanel;
		if (!point || !panel) return;
		const trigger = event.currentTarget as HTMLElement;
		this.#menuTrigger = trigger;
		this.#menuPos = row.pos;
		this.menuNode = this.nodeAt(row.pos);
		point.style.top = `${trigger.offsetTop + trigger.offsetHeight + row.top}px`;
		showMenu(panel, 'first');
	};

	pickBlock = (item: CanonMenuItem) => {
		const choice = this.choices.find((c) => c.label === item.title);
		if (choice) this.runBlockCommand(this.#menuPos, choice);
	};

	runBlockCommand = (pos: number, choice: BlockChoice) => {
		const view = this.view;
		if (!view) return;
		const { bullet_list, ordered_list, paragraph } =
			view.state.schema.nodes;
		const block = view.state.doc.nodeAt(pos);

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
	};

	toggleZen = () => {
		if (this.zen) {
			this.exitZen();
			return;
		}
		const pane = this.#pane;
		this.enterZen();
		if (pane?.requestFullscreen)
			pane.requestFullscreen()
				.then(() => (this.native = true))
				.catch(() => this.#overlay());
		else this.#overlay();
		this.view?.focus();
	};

	#overlay() {
		const pane = this.#pane;
		if (!pane || !this.zen) return;
		pane.setAttribute('popover', 'manual');
		pane.showPopover();
		this.overlay = true;
	}

	fullscreenChanged = () => {
		if (
			this.zen &&
			this.native &&
			document.fullscreenElement !== this.#pane
		)
			this.exitZen();
	};

	enterZen() {
		this.zen = true;
		this.toolbarVisible = true;
		window.addEventListener('mousemove', this.zenActivity);
		document.addEventListener('keydown', this.zenKeydown);
		this.armHideTimer();
		this.scheduleMeasure();
	}

	exitZen() {
		this.zen = false;
		this.toolbarVisible = true;
		window.removeEventListener('mousemove', this.zenActivity);
		document.removeEventListener('keydown', this.zenKeydown);
		if (this.hideTimer) clearTimeout(this.hideTimer);
		if (this.native && document.fullscreenElement === this.#pane)
			void document.exitFullscreen().catch(() => {});
		if (this.overlay) {
			this.#pane?.hidePopover();
			this.#pane?.removeAttribute('popover');
		}
		this.native = false;
		this.overlay = false;
		this.scheduleMeasure();
	}

	zenActivity = () => {
		this.toolbarVisible = true;
		this.armHideTimer();
	};

	zenKeydown = (event: KeyboardEvent) => {
		if (
			event.key === 'Escape' &&
			!this.#menuPanel?.matches(':popover-open') &&
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
		<div
			class="text-editor"
			{{filePaste this.readFile accept=ACCEPT}}
			{{on "drop" this.drop}}
			{{on "dragover" this.dragOver}}
		>
			<input
				type="file"
				class="dt-sr-only"
				accept={{ACCEPT}}
				tabindex="-1"
				aria-hidden="true"
				aria-label="Files"
				{{this.keepPicker}}
				{{on "change" this.chooseFile}}
			/>
			<CanonGrid class="te-bar">
				<CanonButton
					class="te-files"
					@text="Files"
					@icon={{FolderIcon}}
					@onClick={{this.openFile}}
				/>
				<CanonButton
					class="te-clear"
					@text="Clear"
					@icon={{ClearIcon}}
					@disabled={{this.isEmpty}}
					@onClick={{this.clear}}
				/>
				<CanonButton
					class="te-source-toggle"
					@text="Source"
					@icon={{SourceIcon}}
					@selected={{this.settings.codeMode}}
					title="Toggle raw Markdown source"
					aria-pressed={{if
						this.settings.codeMode
						"true"
						"false"
					}}
					@onClick={{this.toggleCodeMode}}
				/>
				<CanonButton
					class="te-full"
					@text="Full Screen"
					@icon={{FullIcon}}
					title="Distraction-free focus mode"
					@onClick={{this.toggleZen}}
				/>
				<CanonMenu
					@items={{this.exportItems}}
					@onSelect={{this.doExport}}
					as |menu|
				>
					<CanonButton
						class="te-export"
						@text="Export"
						@icon={{ExportIcon}}
						@disabled={{this.isEmpty}}
						{{menu.trigger}}
					/>
				</CanonMenu>
				<CanonButton
					class="te-copy"
					@kind="primary"
					@text="Copy"
					@icon={{CopyIcon}}
					@disabled={{this.isEmpty}}
					@onClick={{this.copy}}
				/>
				<CanonButton
					class="te-settings-cell"
					@text="Settings"
					@icon={{SettingsIcon}}
					aria-haspopup="dialog"
					aria-expanded={{if
						this.settingsOpen
						"true"
						"false"
					}}
					@onClick={{this.openSettings}}
					{{this.keepSettingsCell}}
				/>
			</CanonGrid>
			<div class={{this.paneClass}} {{this.keepPane}}>
				{{#if this.zen}}
					<div class="te-zen-bar">
						<CanonButton
							@kind="cell"
							@text="Exit"
							@icon={{ExitIcon}}
							title="Exit focus mode"
							@onClick={{this.toggleZen}}
						/>
					</div>
				{{/if}}
				<div
					class="te-scroll"
					{{on "scroll" this.rescroll}}
				>
					{{#if this.settings.codeMode}}
						<textarea
							class="te-source"
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
						class="te-page
							{{if
								this.settings.codeMode
								'te-page--hidden'
							}}
							{{if
								this.empty
								'te-page--empty'
							}}"
					>
						{{#if this.settings.showGutter}}
							<div class="te-gutter">
								{{#each
									this.gutterRows
									key="key"
									as |r|
								}}
									<div
										class="te-gutter-row
											{{if
												r.active
												'te-gutter-row--lit'
											}}"
										style={{r.style}}
									>
										<button
											type="button"
											class="te-block-trigger"
											title="Change block type"
											aria-label={{r.name}}
											aria-haspopup="menu"
											{{on
												"click"
												(fn
													this.openBlockMenu
													r.row
												)
											}}
										>{{r.mark}}</button>
										{{#each
											r.row.fields
											key="id"
											as |f|
										}}
											<span
												class="te-gutter-field"
												aria-hidden="true"
											>{{f.value}}
												{{f.label}}</span>
										{{/each}}
									</div>
								{{/each}}
							</div>
						{{/if}}
						{{#if
							this.settings.showMarginLine
						}}
							<div
								class="te-margin"
								aria-hidden="true"
							></div>
						{{/if}}
						<div
							class="te-host"
							{{this.mount}}
						></div>
						<span
							class="te-menu-point"
							aria-hidden="true"
						></span>
						<CanonMenuList
							@items={{this.menuItems}}
							@onSelect={{this.pickBlock}}
							{{this.keepMenu}}
						/>
					</div>
				</div>

				{{#if this.bubble}}
					{{! template-lint-disable no-pointer-down-event-binding no-invalid-interactive }}
					<div
						class="te-bubble
							{{if
								this.bubble.below
								'te-bubble--below'
							}}"
						role="toolbar"
						aria-label="Format"
						style={{this.bubbleStyle}}
						{{on
							"mousedown"
							this.eatMousedown
						}}
					>
						<button
							type="button"
							class="te-bubble-btn"
							title="Bold"
							aria-label="Bold"
							aria-pressed={{if
								this.bubble.strong
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.applyMark
									"strong"
								)
							}}
						><IconSvg
								@name="bold"
							/></button>
						<button
							type="button"
							class="te-bubble-btn"
							title="Italic"
							aria-label="Italic"
							aria-pressed={{if
								this.bubble.em
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.applyMark
									"em"
								)
							}}
						><IconSvg
								@name="italic"
							/></button>
						<button
							type="button"
							class="te-bubble-btn"
							title="Strikethrough"
							aria-label="Strikethrough"
							aria-pressed={{if
								this.bubble.strikethrough
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.applyMark
									"strikethrough"
								)
							}}
						><IconSvg
								@name="strikethrough"
							/></button>
						<button
							type="button"
							class="te-bubble-btn"
							title="Code"
							aria-label="Code"
							aria-pressed={{if
								this.bubble.code
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.applyMark
									"code"
								)
							}}
						><IconSvg
								@name="code"
							/></button>
						<button
							type="button"
							class="te-bubble-btn"
							title="Link"
							aria-label="Link"
							aria-pressed={{if
								this.bubble.link
								"true"
								"false"
							}}
							{{on
								"click"
								this.addLink
							}}
						><IconSvg
								@name="link"
							/></button>
					</div>
				{{/if}}

				{{#if this.zen}}
					<output
						class="te-count"
					>{{this.wordCountLabel}}</output>
				{{/if}}
			</div>
			<output class="te-figures">
				{{#each this.figures as |figure|}}
					<span class="te-figure"><span
							class="te-figure-value"
						>{{figure.value}}</span>
						<span
							class="te-figure-label"
						>{{figure.label}}</span></span>
				{{/each}}
			</output>
			<CanonSheet
				class="te-settings"
				@edge="end"
				@title="Editor Settings"
				@open={{this.settingsOpen}}
				@onClose={{this.closeSettings}}
			>
				<CanonRow @title="Font" @form="flush">
					<CanonSegmented
						aria-label="Font"
						@items={{this.fonts}}
						@selected={{this.font}}
						@onChange={{this.setFont}}
					/>
				</CanonRow>
				{{#each this.switchRows key="key" as |row|}}
					<CanonRow
						@title={{row.title}}
						as |titleId|
					>
						<CanonSwitch
							class="te-switch-{{row.key}}"
							aria-labelledby={{titleId}}
							@on={{row.on}}
							@onChange={{fn
								this.setBool
								row.key
							}}
						/>
					</CanonRow>
				{{/each}}
				<CanonHeading @text="Gutter fields" />
				{{#each this.fieldRows key="field.id" as |row|}}
					<CanonRow
						@title={{row.title}}
						as |titleId|
					>
						<CanonSwitch
							class="te-field-{{row.field.id}}"
							aria-labelledby={{titleId}}
							@on={{row.enabled}}
							@disabled={{if
								this.settings.showGutter
								false
								true
							}}
							@onChange={{fn
								this.setField
								row.field.id
							}}
						/>
					</CanonRow>
				{{/each}}
			</CanonSheet>
		</div>
	</template>
}
