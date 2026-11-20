import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonLoader from 'delphicanon/components/canon-loader';
import { IconSvg } from 'delphitools-v2/components/icon';
import CommentPopover from 'delphitools-v2/components/errata/comment-popover';
import Onboarding from 'delphitools-v2/components/errata/onboarding';
import Library from 'delphitools-v2/components/errata/library';
import ErrataMenu from 'delphitools-v2/components/errata/menu';
import PageCanvas from 'delphitools-v2/components/errata/page-canvas';
import PageRail from 'delphitools-v2/components/errata/page-rail';
import PreflightPanel from 'delphitools-v2/components/errata/preflight-panel';
import SettingsBar from 'delphitools-v2/components/errata/settings-bar';
import SignatureModal from 'delphitools-v2/components/errata/signature-modal';
import Toolbox from 'delphitools-v2/components/errata/toolbox';
import UndoCells from 'delphitools-v2/components/errata/undo-cells';
import FormatBar from 'delphitools-v2/components/errata/write/format-bar';
import FindPanel from 'delphitools-v2/components/errata/write/find-panel';
import LinkPanel from 'delphitools-v2/components/errata/write/link-panel';
import SetupPanel from 'delphitools-v2/components/errata/write/setup-panel';
import NumbersPanel from 'delphitools-v2/components/errata/write/numbers-panel';
import TableMenu from 'delphitools-v2/components/errata/write/table-menu';
import WriteRail from 'delphitools-v2/components/errata/write/write-rail';
import WriteView from 'delphitools-v2/components/errata/write/write-view';
import { currentLayout, inner } from 'delphitools-v2/lib/errata/write/editor';
import type { WriteDoc } from 'delphitools-v2/lib/errata/write/types';
import {
	newDocument,
	ataBytes,
	openWriteFile,
	pdfBytes,
	rtfText,
} from 'delphitools-v2/lib/errata/write/session';
import { openDoc } from 'delphitools-v2/lib/errata/write/library';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { insertImageFile } from 'delphitools-v2/lib/errata/write/image-edit';
import { focusEditor, writePanel } from 'delphitools-v2/lib/errata/write/view';
import {
	markup,
	startMarkup,
	stopMarkup,
} from 'delphitools-v2/lib/errata/write/markup';
import { activeDoc, subscribeActive } from 'delphitools-v2/lib/errata/active';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	menuIcon,
	type BarMenuEntry,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import errataShortcuts from 'delphitools-v2/modifiers/errata-shortcuts';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { exportPdf } from 'delphitools-v2/lib/errata/export';
import {
	getSourceBytes,
	openFile,
	opening,
	pageFontFace,
	debugActivePdf,
} from 'delphitools-v2/lib/errata/source';
import type { PageCrop, PageResize } from 'delphitools-v2/lib/errata/doc-model';
import {
	cropPage,
	placeImage,
	resizePage,
} from 'delphitools-v2/lib/errata/page-ops';
import {
	currentPage,
	getPageIndex,
	setPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import {
	TOOL_ORDER,
	activeTool,
	type ToolEntry,
	type ToolId,
} from 'delphitools-v2/lib/errata/tool';
import {
	boxMode,
	debugBoxes,
	modal,
	pageRect,
	pickImageFile,
	registerImagePicker,
	setMode,
	toolbox,
	type BoxMode,
	type ModalId,
} from 'delphitools-v2/lib/errata/ui';
import { pageContent } from 'delphitools-v2/lib/errata/content';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import 'delphitools-v2/components/substrata/editor/editor.css';
import 'delphitools-v2/components/substrata/editor/tool-bar/tools.css';
import './errata.css';

const CELL = 44;
const FRAME = 2;
const PAD = 16;
const GAP = 8;
const PHONE_WIDTH = 600;
const RAIL_ROOM = 1080;
const BOX_KEY = 112;
const COLUMN_FULL =
	(4 + TOOL_ORDER.length + 1) * CELL +
	BOX_KEY +
	(4 - 1) +
	(TOOL_ORDER.length - 1) +
	(2 - 1) +
	2 * GAP +
	6 * FRAME;

const WRITE_FULL =
	(4 + 3 + TOOL_ORDER.length) * CELL + BOX_KEY + 2 * GAP + 6 * FRAME + 16;

function toolTitle(tool: ToolEntry): string {
	return `${tool.label} (${tool.key})`;
}

export default class ErrataShell extends Component {
	@tracked width = 1400;
	@tracked height = 1000;
	@tracked pagesChoice: boolean | null = null;
	@tracked menuOpen = false;
	@tracked libraryOpen = false;
	@tracked exporting = false;
	@tracked exportFailed = false;
	@tracked openFailed = false;

	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	active = new TrackedExternal(subscribeActive, activeDoc);
	title = new TrackedExternal(
		subscribeActive,
		() => activeDoc()?.title() ?? '',
	);
	zoom = new TrackedExternal(subscribeActive, () =>
		Math.round((activeDoc()?.zoom() ?? 1) * 100),
	);
	mode = new TrackedExternal(boxMode.subscribe, boxMode.get);
	sheet = new TrackedExternal(modal.subscribe, modal.get);
	boxOpen = new TrackedExternal(toolbox.subscribe, toolbox.get);
	tool = new TrackedExternal(activeTool.subscribe, activeTool.get);
	loading = new TrackedExternal(opening.subscribe, opening.get);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	panel = new TrackedExternal(writePanel.subscribe, writePanel.get);
	marking = new TrackedExternal(markup.subscribe, markup.get);
	inner = new TrackedExternal(inner.subscribe, inner.get);
	#pdfInput: HTMLInputElement | null = null;
	#imageInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.active.unsubscribe();
		this.title.unsubscribe();
		this.zoom.unsubscribe();
		this.panel.unsubscribe();
		this.marking.unsubscribe();
		this.inner.unsubscribe();
		this.doc.unsubscribe();
		this.mode.unsubscribe();
		this.sheet.unsubscribe();
		this.boxOpen.unsubscribe();
		this.tool.unsubscribe();
		this.loading.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get phone() {
		return this.width < PHONE_WIDTH && this.height > this.width;
	}

	get formatBarShown() {
		return (
			this.inner.current?.kind === 'cell' &&
			!this.panel.current
		);
	}

	get writing() {
		return this.active.current?.kind === 'write';
	}

	get pdfOpen() {
		return this.active.current?.kind === 'pdf';
	}

	get writeRailShown() {
		const panel = this.panel.current;
		return (
			this.pagesOpen &&
			panel !== 'setup' &&
			!(this.phone && panel)
		);
	}

	get titleOnPage() {
		return this.writing && !this.phone;
	}

	get toolboxShown() {
		return (
			this.pdfOpen ||
			(this.writing && (!this.phone || this.marking.current))
		);
	}

	get setupShown() {
		return this.panel.current === 'setup';
	}

	newDocument = () => {
		stopMarkup();
		newDocument();
	};

	openLibrary = () => {
		this.libraryOpen = true;
	};

	closeLibrary = () => {
		this.libraryOpen = false;
	};

	openStored = async (id: string) => {
		stopMarkup();
		this.openFailed = !(await openDoc(id).catch(() => false));
	};
	openSetup = () =>
		writePanel.set(writePanel.get() === 'setup' ? null : 'setup');

	get compact() {
		return this.phone || this.height - 2 * PAD < COLUMN_FULL;
	}

	get writeCompact() {
		return this.height - 2 * PAD < WRITE_FULL;
	}

	get markupEntry(): ToolEntry {
		return (
			TOOL_ORDER.find((m) => this.isMarkup(m.id)) ??
			TOOL_ORDER[0]!
		);
	}

	get markupItems(): BarMenuEntry[] {
		return TOOL_ORDER.map((m) => ({
			title: m.label,
			kind: 'radio',
			checked: this.isMarkup(m.id),
			icon: menuIcon(m.icon),
			run: () => this.pickMarkup(m.id),
		}));
	}

	isMarkup = (id: ToolId) => {
		if (!this.marking.current) return id === 'content';
		return !this.mode.current && this.tool.current === id;
	};

	pickMarkup = (id: ToolId) => {
		if (id === 'content') return this.pickWrite();
		this.#imageOnly = id === 'image' && !this.marking.current;
		startMarkup();
		setMode(null);
		if (id === 'image') return pickImageFile();
		if (id === 'signature') modal.set('signature');
		else activeTool.set(id);
	};

	#imageOnly = false;
	imageCancel = () => {
		if (this.#imageOnly) this.pickWrite();
		this.#imageOnly = false;
	};

	pickWrite = () => {
		stopMarkup();
		focusEditor();
	};

	get layoutClass() {
		if (this.phone) return 'is-phone';
		return this.compact ? 'is-compact' : 'is-full';
	}

	get pageLabel() {
		const total = this.doc.current?.pages.length ?? 0;
		return `Page ${this.pageIndex.current + 1} / ${total}`;
	}

	get zoomPercent() {
		return String(this.zoom.current);
	}

	get pagesOpen() {
		return (
			this.pagesChoice ??
			(!this.phone &&
				!(this.writing && this.width < RAIL_ROOM))
		);
	}

	get phonePanel() {
		return (
			this.phone &&
			(this.boxOpen.current || this.mode.current !== null)
		);
	}

	get railShown() {
		return this.pagesOpen && !this.phonePanel;
	}

	get barShown() {
		return (
			!this.boxOpen.current &&
			this.mode.current === null &&
			this.sheet.current === null
		);
	}

	get activeToolEntry(): ToolEntry {
		return (
			TOOL_ORDER.find((t) => t.id === this.tool.current) ??
			TOOL_ORDER[0]!
		);
	}

	get toolItems(): BarMenuEntry[] {
		return TOOL_ORDER.map((t) => ({
			title: toolTitle(t),
			kind: 'radio',
			checked: t.id === this.tool.current,
			icon: menuIcon(t.icon),
			run: () => this.pick(t.id),
		}));
	}

	isTool = (id: ToolId) => this.tool.current === id;

	toolLabel = (tool: ToolEntry) => toolTitle(tool);

	pick = (id: ToolId) => {
		if (id === 'signature') {
			modal.set('signature');
			return;
		}
		if (id === 'image') {
			pickImageFile();
			return;
		}
		activeTool.set(id);
	};

	openMenu = () => {
		this.menuOpen = !this.menuOpen;
	};

	closeMenu = () => {
		this.menuOpen = false;
	};

	togglePages = () => {
		this.pagesChoice = !this.pagesOpen;
	};

	toggleBox = () => toolbox.set(!this.boxOpen.current);

	fit = () => activeDoc()?.fit();

	get renamable() {
		return !!this.active.current?.rename;
	}

	rename = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const name = input.value.trim() || 'Untitled';
		input.value = name;
		this.active.current?.rename?.(name);
	};

	renameKey = (event: KeyboardEvent) => {
		const input = event.target as HTMLInputElement;
		if (event.key === 'Escape') input.value = this.title.current;
		else if (event.key !== 'Enter') return;
		event.preventDefault();
		input.blur();
		focusEditor();
	};
	prev = () => setPageIndex(getPageIndex() - 1);
	next = () => setPageIndex(getPageIndex() + 1);

	export = async () => {
		const doc = activeDoc();
		if (!doc || this.exporting) return;
		this.exporting = true;
		this.exportFailed = false;
		this.exportFailed = !(await doc.exportFile());
		this.exporting = false;
	};

	rig = modifier(() => {
		if (!import.meta.env.DEV) return;
		const w = window as unknown as Record<string, unknown>;
		w.__write = {
			state: () => writeStore.get(),
			layout: () => {
				const s = writeStore.get();
				return s ? currentLayout(s.doc) : null;
			},
			exportPdf: async () => [...((await pdfBytes()) ?? [])],
			ata: () => [...(ataBytes() ?? [])],
			rtf: rtfText,
			open: (bytes: number[], name: string) =>
				openWriteFile(
					new File([new Uint8Array(bytes)], name),
				),
			setDoc: (doc: WriteDoc) => writeStore.open(doc),
			insertImage: (bytes: number[], type: string) =>
				insertImageFile(
					new Blob([new Uint8Array(bytes)], {
						type,
					}),
				),
			cell: () => {
				const e = inner.get();
				return e?.kind === 'cell' ? e : null;
			},
			note: () => {
				const e = inner.get();
				return e?.kind === 'note' ? e : null;
			},
			mode: () => boxMode.get(),
		};
		w.__errata = {
			open: (
				bytes: ArrayBuffer,
				name: string,
				type: string,
			) => openFile(new File([bytes], name, { type })),
			doc: () => store.getSnapshot(),
			pageIndex: () => getPageIndex(),
			setTool: (id: ToolId) => activeTool.set(id),
			setMode: (id: BoxMode | null) => setMode(id),
			pageRect: (index: number) => pageRect(index),
			activePdf: () => debugActivePdf(),
			fontFace: async (index: number, baseFont: string) => {
				const face = await pageFontFace(
					index,
					baseFont,
				);
				return face
					? {
							family: face.family,
							sample: face.display([
								116, 119, 111,
							]),
						}
					: null;
			},
			content: async (index: number) => {
				const page = store.getSnapshot()?.pages[index];
				const view = page
					? await pageContent(page)
					: null;
				if (!view) return null;
				return {
					items: view.content.items.map((it) => ({
						kind: it.kind,
						stream: it.stream,
						text:
							it.kind === 'text'
								? it.text
								: undefined,
						box: view.toDisplayed(it.bbox),
					})),
					lines: view.lines.map((l) => ({
						text: l.text,
						box: view.toDisplayed(l.bbox),
					})),
					warnings: view.content.warnings,
				};
			},
			showContent: async (index: number, on = true) => {
				const page = store.getSnapshot()?.pages[index];
				const view =
					page && on
						? await pageContent(page)
						: null;
				const colours = {
					text: '#d33',
					image: '#36c',
					form: '#c93',
					path: '#3a3',
				};
				debugBoxes(
					index,
					view
						? [
								...view.content.items
									.filter(
										(
											it,
										) =>
											it.kind !==
											'text',
									)
									.map(
										(
											it,
										) => ({
											...view.toDisplayed(
												it.bbox,
											),
											colour: colours[
												it
													.kind
											],
										}),
									),
								...view.lines.map(
									(
										l,
									) => ({
										...view.toDisplayed(
											l.bbox,
										),
										colour: colours.text,
									}),
								),
							]
						: [],
				);
			},
			resize: (resize: PageResize | null) => {
				const page = currentPage();
				if (page) resizePage(page.id, resize);
			},
			crop: (crop: PageCrop | null) => {
				const page = currentPage();
				if (page) cropPage(page.id, crop);
			},
			export: async () => {
				const doc = store.getSnapshot();
				if (!doc) return null;
				return [
					...(await exportPdf(
						doc,
						getSourceBytes(),
					)),
				];
			},
		};
		return () => {
			delete w.__errata;
		};
	});

	measure = modifier((root: HTMLElement) => {
		const pieces = new ResizeObserver(() => this.placeInset(root));
		const watch = () => {
			pieces.disconnect();
			pieces.observe(root);
			for (const el of root.querySelectorAll(
				':scope > .sub-ed-title, :scope > .sub-ed-column, :scope > .sub-ed-row, :scope > .err-rail, :scope > .sub-ed-bar',
			))
				pieces.observe(el);
		};
		const size = new ResizeObserver(() => {
			this.width = root.clientWidth;
			this.height = root.clientHeight;
		});
		size.observe(root);
		const vv = window.visualViewport;
		let kbFrame = 0;
		const keyboard = () => {
			if (!vv || kbFrame) return;
			kbFrame = requestAnimationFrame(() => {
				kbFrame = 0;
				const kb =
					root.getBoundingClientRect().bottom -
					vv.offsetTop -
					vv.height;
				root.style.setProperty(
					'--err-kb',
					`${Math.max(0, Math.round(kb))}px`,
				);
				if (
					kb > 0 &&
					!root.querySelector(
						'.err-write-input[data-tracking]',
					)
				)
					root.querySelector(
						'.err-write-caret',
					)?.scrollIntoView({ block: 'nearest' });
				this.placeInset(root);
			});
		};
		vv?.addEventListener('resize', keyboard);
		vv?.addEventListener('scroll', keyboard);
		const children = new MutationObserver(() => {
			watch();
			this.placeInset(root);
		});
		children.observe(root, { childList: true });
		watch();
		return () => {
			pieces.disconnect();
			size.disconnect();
			children.disconnect();
			vv?.removeEventListener('resize', keyboard);
			vv?.removeEventListener('scroll', keyboard);
			cancelAnimationFrame(kbFrame);
		};
	});

	placeInset = (root: HTMLElement) => {
		const area = root.querySelector<HTMLElement>(
			':scope > .sub-shell-canvas-area',
		);
		if (!area) return;
		const box = area.getBoundingClientRect();
		const inset = { top: PAD, right: PAD, bottom: PAD, left: PAD };
		const rect = (sel: string) => {
			const r = root
				.querySelector(`:scope > ${sel}`)
				?.getBoundingClientRect();
			return r && r.width && r.height ? r : null;
		};
		const title = rect('.sub-ed-title');
		if (title) inset.top = title.bottom - box.top + PAD;
		const column = rect('.sub-ed-column');
		if (column) inset.right = box.right - column.left + PAD;
		const findings = root.querySelector<HTMLElement>(
			':scope > .err-preflight.is-open',
		);
		if (findings && !this.phone)
			inset.right = Math.max(
				inset.right,
				root.clientWidth - findings.offsetLeft + PAD,
			);
		const rail = rect('.err-rail');
		root.style.setProperty(
			'--sub-tray-h',
			`${rail && this.phone ? rail.height + GAP : 0}px`,
		);
		if (rail && !this.phone)
			inset.left = rail.right - box.left + PAD;
		const row = rect('.sub-ed-row');
		if (row) inset.bottom = box.bottom - row.top + PAD;
		const bar = rect('.sub-ed-bar');
		if (bar)
			inset.bottom = Math.max(
				inset.bottom,
				box.bottom - bar.top + PAD,
			);
		const next = [
			inset.top,
			inset.right,
			inset.bottom,
			inset.left,
		].join(',');
		if (area.dataset['inset'] === next) return;
		area.dataset['inset'] = next;
		area.dispatchEvent(new CustomEvent('err-inset'));
	};

	reinset = modifier(
		(
			root: HTMLElement,
			[mode, sheet]: [BoxMode | null, ModalId | null],
		) => {
			void mode;
			void sheet;
			const frame = requestAnimationFrame(() =>
				this.placeInset(root),
			);
			return () => cancelAnimationFrame(frame);
		},
	);

	take = async (file: File) => {
		this.openFailed = false;
		try {
			await this.#open(file);
		} catch {
			this.openFailed = true;
		}
	};

	#open = async (file: File) => {
		const image = file.type.startsWith('image/');
		if (image && this.marking.current) return placeImage(file);
		if (image && this.writing) return insertImageFile(file);
		if (image && this.pdfOpen) return placeImage(file);
		stopMarkup();
		if (await openWriteFile(file)) return;
		await openFile(file);
	};

	paste = (file: File) => void this.take(file);

	registerPdfInput = modifier((el: HTMLInputElement) => {
		this.#pdfInput = el;
		return () => {
			this.#pdfInput = null;
		};
	});

	registerImageInput = modifier((el: HTMLInputElement) => {
		this.#imageInput = el;
		registerImagePicker(() => el.click());
		return () => {
			this.#imageInput = null;
			registerImagePicker(null);
		};
	});

	pickPdf = () => this.#pdfInput?.click();
	pickImage = () => this.#imageInput?.click();

	onPick = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		this.#imageOnly = false;
		if (file) void this.take(file);
	};

	dragOver = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	drop = (event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		void this.take(file);
	};

	<template>
		<div
			class="sub-ed err-ed
				{{this.layoutClass}}
				{{if this.writing 'is-writing'}}
				{{if this.marking.current 'is-marking'}}"
			{{this.measure}}
			{{this.reinset this.mode.current this.sheet.current}}
			{{this.rig}}
			{{errataShortcuts}}
			{{filePaste
				this.paste
				accept="application/pdf,image/*"
			}}
			{{on "dragover" this.dragOver}}
			{{on "drop" this.drop}}
		>
			<div class="sub-shell-canvas-area">
				<input
					type="file"
					accept="application/pdf,.ata,.rtf"
					class="dt-sr-only"
					aria-label="Open PDF"
					{{this.registerPdfInput}}
					{{on "change" this.onPick}}
				/>
				<input
					type="file"
					accept="image/*"
					class="dt-sr-only"
					aria-label="Open image"
					{{this.registerImageInput}}
					{{on "change" this.onPick}}
					{{on "cancel" this.imageCancel}}
				/>
				<PageCanvas />
				{{#if this.writing}}
					<WriteView
						@phone={{this.phone}}
						@onImage={{this.pickImage}}
					>
						<:title>
							<TitleChip
								@shell={{this}}
							/>
						</:title>
					</WriteView>
				{{/if}}
				{{#unless this.active.current}}
					{{#unless this.loading.current}}
						<div
							class="sub-empty"
							data-empty-hint
						>
							<div
								class="sub-empty-card"
							>
								<div
									class="sub-empty-actions"
								>
									<Cell
										@label="New document"
										@text="New document"
										@icon="file-plus"
										data-new-document
										@onClick={{this.newDocument}}
									/>
									<Cell
										@label="Documents"
										@text="Documents"
										@icon="library"
										data-open-library
										@onClick={{this.openLibrary}}
									/>
									<Cell
										@label="Open PDF"
										@text="Open PDF"
										@icon="file-text"
										@onClick={{this.pickPdf}}
									/>
									<Cell
										@label="Open image"
										@text="Open image"
										@icon="image-plus"
										@onClick={{this.pickImage}}
									/>
								</div>
								<p
									class="sub-empty-note"
								>Drop or paste</p>
							</div>
						</div>
					{{/unless}}
				{{/unless}}
				{{#if this.loading.current}}
					<div class="err-opening">
						<CanonLoader />
					</div>
				{{/if}}
			</div>

			{{#if this.active.current}}
				{{#unless this.titleOnPage}}
					<TitleChip @shell={{this}} />
				{{/unless}}
				{{#if this.exportFailed}}
					<div class="sub-ed-note-slot">
						<span
							class="sub-ed-note err-export-failed"
							role="status"
						>Export failed</span>
					</div>
				{{/if}}
			{{/if}}
			{{#if this.openFailed}}
				<div class="sub-ed-note-slot">
					<span
						class="sub-ed-note err-open-failed"
						role="status"
					>Open failed</span>
				</div>
			{{/if}}

			{{#if this.phone}}
				<Cells
					class="sub-ed-phone-stack"
					@axis="row"
					@small={{true}}
				>
					<Cell
						@label="Menu"
						@icon="menu"
						@selected={{this.menuOpen}}
						@onClick={{this.openMenu}}
					/>
					{{#if this.writing}}
						<MenuCell
							@label={{this.markupEntry.label}}
							@icon={{this.markupEntry.icon}}
							@items={{this.markupItems}}
							@placement="bottom-start"
							data-tool-menu
						/>
						<UndoCells />
						<Cell
							@label="Document setup"
							@icon="settings-2"
							@selected={{this.setupShown}}
							data-tool="setup"
							@onClick={{this.openSetup}}
						/>
						<Cell
							@label="Pages"
							@icon="panel-left"
							@selected={{this.pagesOpen}}
							data-tool="pages"
							@onClick={{this.togglePages}}
						/>
					{{/if}}
					<Cell
						@label="Export"
						@icon="download"
						@disabled={{if
							this.active.current
							false
							true
						}}
						@onClick={{this.export}}
					/>
				</Cells>
				{{#if this.pdfOpen}}
					<div class="sub-ed-row">
						<Cells @axis="row">
							<MenuCell
								@label={{this.activeToolEntry.label}}
								@icon={{this.activeToolEntry.icon}}
								@items={{this.toolItems}}
								@placement="top-start"
							/>
						</Cells>
						<Cells @axis="row">
							<UndoCells />
						</Cells>
						<span
							class="sub-ed-row-fill"
						></span>
						<Cells @axis="row">
							<Cell
								@label="Pages"
								@icon="panel-left"
								@selected={{this.pagesOpen}}
								@onClick={{this.togglePages}}
							/>
							<BoxKey
								@shell={{this}}
							/>
						</Cells>
					</div>
				{{/if}}
			{{else}}
				<div class="sub-ed-column">
					<Cells class="sub-ed-stack">
						<Cell
							@tip="left"
							@label="Menu"
							@icon="menu"
							@selected={{this.menuOpen}}
							@onClick={{this.openMenu}}
						/>
						<UndoCells @tip="left" />
						<Cell
							@tip="left"
							@label="Export"
							@icon="download"
							@disabled={{if
								this.active.current
								false
								true
							}}
							@onClick={{this.export}}
						/>
					</Cells>
					{{#if this.writing}}
						<div class="sub-ed-omni">
							<Cells
								class="sub-ed-tools"
							>
								{{#if
									this.writeCompact
								}}
									<MenuCell
										@label={{this.markupEntry.label}}
										@icon={{this.markupEntry.icon}}
										@items={{this.markupItems}}
										@placement="left-start"
										data-markup-menu
									/>
								{{else}}
									{{#each
										TOOL_ORDER
										as |m|
									}}
										<Cell
											@tip="left"
											@label={{m.label}}
											@icon={{m.icon}}
											@selected={{this.isMarkup
												m.id
											}}
											aria-pressed={{if
												(this.isMarkup
													m.id
												)
												"true"
												"false"
											}}
											data-markup={{m.id}}
											@onClick={{fn
												this.pickMarkup
												m.id
											}}
										/>
									{{/each}}
								{{/if}}
								<TableMenu
									@cellOnly={{true}}
								/>
								<Cell
									@tip="left"
									@label="Document setup"
									@icon="settings-2"
									@selected={{this.setupShown}}
									data-tool="setup"
									@onClick={{this.openSetup}}
								/>
							</Cells>
							<Cells
								class="sub-ed-panel-keys"
							>
								<Cell
									@tip="left"
									@label="Pages"
									@icon="panel-left"
									@selected={{this.pagesOpen}}
									@onClick={{this.togglePages}}
								/>
								<BoxKey
									@shell={{this}}
									@tip="left"
								/>
							</Cells>
						</div>
					{{else if this.pdfOpen}}
						<div class="sub-ed-omni">
							<Cells
								class="sub-ed-tools"
							>
								{{#if
									this.compact
								}}
									<MenuCell
										@label={{this.activeToolEntry.label}}
										@icon={{this.activeToolEntry.icon}}
										@items={{this.toolItems}}
										@placement="left-start"
									/>
								{{else}}
									{{#each
										TOOL_ORDER
										as |t|
									}}
										<Cell
											@tip="left"
											@label={{this.toolLabel
												t
											}}
											@icon={{t.icon}}
											@selected={{this.isTool
												t.id
											}}
											aria-pressed={{if
												(this.isTool
													t.id
												)
												"true"
												"false"
											}}
											data-tool={{t.id}}
											@onClick={{fn
												this.pick
												t.id
											}}
										/>
									{{/each}}
								{{/if}}
							</Cells>
							<Cells
								class="sub-ed-panel-keys"
							>
								<Cell
									@tip="left"
									@label="Pages"
									@icon="panel-left"
									@selected={{this.pagesOpen}}
									@onClick={{this.togglePages}}
								/>
								<BoxKey
									@shell={{this}}
									@tip="left"
								/>
							</Cells>
						</div>
					{{/if}}
				</div>
			{{/if}}

			{{#if this.toolboxShown}}
				<Toolbox
					@phone={{this.phone}}
					@write={{this.writing}}
				/>
			{{/if}}
			{{#if this.writing}}
				{{#if this.writeRailShown}}
					<WriteRail
						class="err-rail
							{{if
								this.phone
								'is-tray'
							}}"
						@onClose={{this.togglePages}}
					/>
				{{/if}}
				{{#if this.marking.current}}
					{{#if this.barShown}}
						<SettingsBar
							@phone={{this.phone}}
						/>
					{{/if}}
					<CommentPopover />
				{{else if this.formatBarShown}}
					<FormatBar
						@onImage={{this.pickImage}}
					/>
				{{/if}}
				<SetupPanel />
				<NumbersPanel />
				<FindPanel />
				<LinkPanel />
			{{else if this.pdfOpen}}
				{{#if this.railShown}}
					<PageRail
						class="err-rail
							{{if
								this.phone
								'is-tray'
							}}"
						@onClose={{this.togglePages}}
					/>
				{{/if}}
				{{#if this.barShown}}
					<SettingsBar @phone={{this.phone}} />
				{{/if}}
				<PreflightPanel
					@open={{eq
						this.mode.current
						"preflight"
					}}
				/>
				<CommentPopover />
			{{/if}}

			{{#if this.menuOpen}}
				<ErrataMenu
					@phone={{this.phone}}
					@onOpenPdf={{this.pickPdf}}
					@onLibrary={{this.openLibrary}}
					@onExport={{this.export}}
					@onClose={{this.closeMenu}}
				/>
			{{/if}}
			{{#if this.libraryOpen}}
				<Library
					@phone={{this.phone}}
					@onNew={{this.newDocument}}
					@onOpen={{this.openStored}}
					@onOpenFile={{this.pickPdf}}
					@onClose={{this.closeLibrary}}
				/>
			{{/if}}
			<Onboarding @phone={{this.phone}} />
			<SignatureModal />
		</div>
	</template>
}

const BoxKey: TOC<{ Args: { shell: ErrataShell; tip?: 'left' } }> = <template>
	<Cell
		@tip={{@tip}}
		@label="Toolbox"
		@text="Toolbox"
		class="err-box-key"
		@icon="briefcase"
		@selected={{@shell.boxOpen.current}}
		aria-expanded={{if @shell.boxOpen.current "true" "false"}}
		data-toolbox
		@onClick={{@shell.toggleBox}}
	/>
</template>;

const TitleChip: TOC<{ Args: { shell: ErrataShell } }> = <template>
	<div class="sub-ed-title" role="group" aria-label="Document">
		{{#if @shell.renamable}}
			<input
				class="sub-ed-title-name err-title-name"
				value={{@shell.title.current}}
				aria-label="Document name"
				spellcheck="false"
				autocomplete="off"
				data-title-name
				{{on "change" @shell.rename}}
				{{on "keydown" @shell.renameKey}}
			/>
		{{else}}
			<span
				class="sub-ed-title-name"
			>{{@shell.title.current}}</span>
		{{/if}}
		{{#if @shell.pdfOpen}}
			<button
				type="button"
				class="err-title-step"
				aria-label="Previous page"
				title="Previous page"
				{{on "click" @shell.prev}}
			><IconSvg @name="chevron-left" /></button>
			<span
				class="err-title-page"
				data-page-label
			>{{@shell.pageLabel}}</span>
			<button
				type="button"
				class="err-title-step"
				aria-label="Next page"
				title="Next page"
				{{on "click" @shell.next}}
			><IconSvg @name="chevron-right" /></button>
		{{/if}}
		<button
			type="button"
			class="sub-ed-title-zoom"
			aria-label="Fit page"
			title="Fit page"
			{{on "click" @shell.fit}}
		><CanonFigure
				@text={{@shell.zoomPercent}}
				@unit="%"
				@size={{13}}
				@colour="var(--err-title-muted, var(--canon-muted-foreground))"
			/></button>
	</div>
</template>;
