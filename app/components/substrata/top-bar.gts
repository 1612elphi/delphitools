import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import ThemeToggle from 'delphitools-v2/components/theme-toggle';
import PersistenceToggle from 'delphitools-v2/components/substrata/persistence-toggle';
import ToastSlot from 'delphitools-v2/components/substrata/toast-slot';
import {
	subscribe,
	getSnapshot,
	undo,
	redo,
	canUndo,
	canRedo,
	update,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	getPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import {
	getGuides,
	subscribeGuides,
	toggleGuide,
} from 'delphitools-v2/lib/substrata/guides-pref';
import {
	getZoom,
	subscribeViewport,
	viewport,
} from 'delphitools-v2/lib/substrata/viewport';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import {
	newScene,
	openRecent,
	openScene,
	saveScene,
} from 'delphitools-v2/lib/substrata/file-ops';
import {
	listRecentProjects,
	type RecentProject,
} from 'delphitools-v2/lib/substrata/autosave';
import {
	duplicateLayers,
	deleteLayers,
} from 'delphitools-v2/lib/substrata/layer-ops';
import { selectableLeafIds } from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getSelectedLayerIds,
	setSelection,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import type { SubstrataDoc } from 'delphitools-v2/lib/substrata/doc-model';
import type ThemeService from 'delphitools-v2/services/theme';

type MenuId = 'scene' | 'edit' | 'workspace' | 'help';

interface MenuSignature {
	Element: HTMLDivElement;
	Args: {
		id: MenuId;
		label: string;
		open: MenuId | null;
		onToggle: (id: MenuId) => void;
	};
	Blocks: { default: [] };
}

const Menu: TOC<MenuSignature> = <template>
	<div data-menu-root class="sub-topbar-menu-root">
		<button
			type="button"
			class="sub-topbar-menu-btn
				{{if (eq @open @id) 'is-open'}}"
			{{on "click" (fn @onToggle @id)}}
		>
			{{@label}}
		</button>
		{{#if (eq @open @id)}}
			<div class="sub-topbar-menu-pop">
				{{yield}}
			</div>
		{{/if}}
	</div>
</template>;

interface BoxSignature {
	Element: HTMLDivElement;
	Blocks: { default: [] };
}

// shadow-lg test hook
const Box: TOC<BoxSignature> = <template>
	<div class="sub-topbar-box shadow-lg" ...attributes>{{yield}}</div>
</template>;

interface ItemSignature {
	Element: HTMLButtonElement;
	Args: {
		label: string;
		hint?: string;
		onClick?: () => void;
		disabled?: boolean;
	};
}

function fireOptional(onClick: (() => void) | undefined): void {
	onClick?.();
}

const Item: TOC<ItemSignature> = <template>
	<button
		type="button"
		disabled={{@disabled}}
		class="sub-topbar-item {{if @disabled 'is-disabled'}}"
		...attributes
		{{on "click" (fn fireOptional @onClick)}}
	>
		<span class="sub-topbar-item-label">{{@label}}</span>
		{{#if @hint}}
			<span class="sub-topbar-item-hint">{{@hint}}</span>
		{{/if}}
	</button>
</template>;

const Sep: TOC<{ Element: HTMLDivElement }> = <template>
	<div class="sub-topbar-sep"></div>
</template>;

interface DiRowSignature {
	Element: HTMLDivElement;
	Args: { label: string; value: string };
}

const DiRow: TOC<DiRowSignature> = <template>
	<div class="sub-topbar-di-row">
		<span class="sub-topbar-di-label">{{@label}}</span>
		<span class="sub-topbar-di-value">{{@value}}</span>
	</div>
</template>;

function recentLabel(r: RecentProject): string {
	return r.name.trim() || 'Untitled scene';
}

function formatRecentDate(ms: number): string {
	return new Date(ms).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
	});
}

interface SceneMenuSignature {
	Args: {
		doc: SubstrataDoc | null;
		persistOn: boolean;
		onImport: () => void;
		onClose: () => void;
	};
}

class SceneMenu extends Component<SceneMenuSignature> {
	@tracked recents: RecentProject[] = [];
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
	}

	// gate indexeddb reads
	loadRecents = modifier(() => {
		if (this.args.persistOn) {
			void listRecentProjects().then((recents) => {
				if (!this.#destroyed) this.recents = recents;
			});
		}
	});

	get others() {
		return this.recents.filter((r) => r.id !== this.args.doc?.id);
	}

	get hasOthers() {
		return this.others.length > 0;
	}

	get artboard() {
		return this.args.doc?.artboard;
	}

	get dimensions() {
		const ab = this.artboard;
		return ab ? `${ab.width} × ${ab.height} px` : '—';
	}

	get resolution() {
		const ab = this.artboard;
		return ab ? `${ab.resolution} ppi` : '—';
	}

	get layerCount() {
		return String(this.args.doc?.layers.length ?? 0);
	}

	get storedLabel() {
		return this.args.persistOn ? 'Local' : 'Off';
	}

	doNewScene = () => {
		this.args.onClose();
		newScene();
	};

	doOpenScene = () => {
		this.args.onClose();
		void openScene();
	};

	doCanvasSize = () => {
		this.args.onClose();
		openModal('canvas-size');
	};

	doSaveScene = () => {
		this.args.onClose();
		void saveScene();
	};

	doSaveCopy = () => {
		this.args.onClose();
		void saveScene(true);
	};

	doExport = () => {
		this.args.onClose();
		openModal('export');
	};

	openRecentProject = (id: string) => {
		this.args.onClose();
		void openRecent(id);
	};

	<template>
		<div class="sub-topbar-scene-menu" {{this.loadRecents}}>
			<Box>
				<div class="sub-topbar-scene-items">
					<Item
						@label="New scene"
						@onClick={{this.doNewScene}}
					/>
					<Item
						@label="Open…"
						@hint="⌘O"
						@onClick={{this.doOpenScene}}
					/>
					<Item
						@label="Open recent"
						@disabled={{eq
							this.others.length
							0
						}}
						class={{if
							this.hasOthers
							"sub-topbar-item-recents-label"
						}}
					/>
					{{#each this.others key="id" as |r|}}
						<Item
							@label={{recentLabel r}}
							@hint={{formatRecentDate
								r.updatedAt
							}}
							class="sub-topbar-item-indent"
							@onClick={{fn
								this.openRecentProject
								r.id
							}}
						/>
					{{/each}}
					<Item
						@label="Import image…"
						@hint="⌘I"
						@onClick={{@onImport}}
					/>
					<Item
						@label="Canvas size…"
						@onClick={{this.doCanvasSize}}
					/>
					<Sep />
					<Item
						@label="Save"
						@hint="⌘S"
						@onClick={{this.doSaveScene}}
					/>
					<Item
						@label="Save a copy…"
						@hint="⇧⌘S"
						@onClick={{this.doSaveCopy}}
					/>
					<Item
						@label="Export…"
						@hint="⌘E"
						@onClick={{this.doExport}}
					/>
					<Sep />
					<Item
						@label="Rename"
						@disabled={{true}}
					/>
					<Item
						@label="Duplicate"
						@disabled={{true}}
					/>
					<Item
						@label="Delete"
						@disabled={{true}}
					/>
					<Sep />
					{{! avoid nested buttons }}
					<LinkTo
						@route="index"
						class="sub-topbar-item"
					>
						<span
							class="sub-topbar-item-label"
						>Back to delphitools</span>
					</LinkTo>
				</div>
			</Box>
			<Box>
				<div class="sub-topbar-scene-info-head">Scene
					info</div>
				<DiRow
					@label="Dimensions"
					@value={{this.dimensions}}
				/>
				<DiRow
					@label="Resolution"
					@value={{this.resolution}}
				/>
				<DiRow @label="Bit depth" @value="8-bit / ch" />
				<DiRow @label="Colour" @value="sRGB" />
				<DiRow
					@label="Layers"
					@value={{this.layerCount}}
				/>
				<DiRow
					@label="Stored"
					@value={{this.storedLabel}}
				/>
			</Box>
			<Box>
				<PersistenceToggle />
			</Box>
		</div>
	</template>
}

interface UrButtonSignature {
	Element: HTMLButtonElement;
	Args: {
		icon: string;
		label: string;
		hint: string;
		disabled?: boolean;
		onClick: () => void;
	};
}

const UrButton: TOC<UrButtonSignature> = <template>
	<button
		type="button"
		class="sub-topbar-ur-btn"
		disabled={{@disabled}}
		...attributes
		{{on "click" @onClick}}
	>
		<Icon @name={{@icon}} />
		{{@label}}
		<span class="sub-topbar-ur-hint">{{@hint}}</span>
	</button>
</template>;

interface AbSignature {
	Element: HTMLButtonElement;
	Args: {
		icon: string;
		label: string;
		hint?: string;
		onClick?: () => void;
		disabled?: boolean;
	};
}

const Ab: TOC<AbSignature> = <template>
	<button
		type="button"
		class="sub-topbar-ab"
		disabled={{@disabled}}
		{{on "click" (fn fireOptional @onClick)}}
	>
		<Icon @name={{@icon}} />
		<span class="sub-topbar-ab-label">
			{{@label}}
			{{#if @hint}}
				<span
					class="sub-topbar-ab-hint"
				>{{@hint}}</span>
			{{/if}}
		</span>
	</button>
</template>;

interface EditMenuSignature {
	Args: {
		undoable: boolean;
		redoable: boolean;
		onClose: () => void;
	};
}

class EditMenu extends Component<EditMenuSignature> {
	doc = new TrackedExternal(subscribe, getSnapshot);
	selection = new TrackedExternal(
		subscribeSelection,
		getSelectedLayerIds,
	);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selection.unsubscribe();
	}

	get hasSelection() {
		return this.selection.current.length > 0;
	}

	// skip hidden locked layers
	get selectable() {
		const doc = this.doc.current;
		return doc ? selectableLeafIds(doc.layers) : [];
	}

	doUndo = () => undo();
	doRedo = () => redo();

	doDuplicate = () => {
		duplicateLayers(this.selection.current);
		this.args.onClose();
	};

	doDelete = () => {
		deleteLayers(this.selection.current);
		this.args.onClose();
	};

	doSelectAll = () => {
		setSelection(this.selectable);
		this.args.onClose();
	};

	<template>
		<div class="sub-topbar-edit-menu">
			<Box>
				<div class="sub-topbar-ur-row">
					<UrButton
						@icon="undo-2"
						@label="Undo"
						@hint="⌘Z"
						@disabled={{not @undoable}}
						@onClick={{this.doUndo}}
					/>
					<UrButton
						@icon="redo-2"
						@label="Redo"
						@hint="⇧⌘Z"
						@disabled={{not @redoable}}
						@onClick={{this.doRedo}}
						class="sub-topbar-ur-btn-bordered"
					/>
				</div>
			</Box>
			<Box>
				<div class="segmented sub-topbar-ab-grid">
					<Ab
						@icon="scissors"
						@label="Cut"
						@disabled={{true}}
					/>
					<Ab
						@icon="copy"
						@label="Copy"
						@disabled={{true}}
					/>
					<Ab
						@icon="clipboard-paste"
						@label="Paste"
						@disabled={{true}}
					/>
					<Ab
						@icon="copy-plus"
						@label="Duplicate"
						@hint="⌘D"
						@disabled={{not
							this.hasSelection
						}}
						@onClick={{this.doDuplicate}}
					/>
					<Ab
						@icon="trash-2"
						@label="Delete"
						@hint="⌫"
						@disabled={{not
							this.hasSelection
						}}
						@onClick={{this.doDelete}}
					/>
					<Ab
						@icon="box-select"
						@label="Select all"
						@hint="⌘A"
						@disabled={{eq
							this.selectable.length
							0
						}}
						@onClick={{this.doSelectAll}}
					/>
				</div>
			</Box>
		</div>
	</template>
}

function segIconName(s: string): string | null {
	switch (s) {
		case '−':
			return 'minus';
		case '+':
			return 'plus';
		case 'Fit':
			return 'maximize-2';
		case 'Rulers':
			return 'ruler';
		case 'Guides':
			return 'frame';
		case 'Grid':
			return 'grid-3x3';
		case 'Snap':
			return 'magnet';
		default:
			return null;
	}
}

function isSegOn(seg: string, on: string[] | undefined): boolean {
	return (on ?? []).includes(seg);
}

interface WRowSignature {
	Element: HTMLDivElement;
	Args: {
		label: string;
		seg: string[];
		on?: string[];
		onSelect: (seg: string) => void;
	};
}

const WRow: TOC<WRowSignature> = <template>
	<div class="sub-topbar-wrow">
		<span>{{@label}}</span>
		<span class="segmented sub-topbar-wrow-seg">
			{{#each @seg as |s|}}
				<button
					type="button"
					title={{s}}
					class="sub-topbar-seg-cell
						{{if
							(isSegOn s @on)
							'is-active'
						}}"
					{{on "click" (fn @onSelect s)}}
				>
					{{! span title test hook }}
					<span
						title={{s}}
						class="sub-topbar-seg-hook"
					>
						{{#let
							(segIconName s)
							as |iconName|
						}}
							{{#if iconName}}
								<Icon
									@name={{iconName}}
								/>
							{{else}}
								{{s}}
							{{/if}}
						{{/let}}
					</span>
				</button>
			{{/each}}
		</span>
	</div>
</template>;

class WorkspaceMenu extends Component {
	@service declare theme: ThemeService;

	guides = new TrackedExternal(subscribeGuides, getGuides);
	zoomStore = new TrackedExternal(subscribeViewport, getZoom);

	willDestroy() {
		super.willDestroy();
		this.guides.unsubscribe();
		this.zoomStore.unsubscribe();
	}

	get pct() {
		return `${Math.round(this.zoomStore.current * 100)}%`;
	}

	get zoomSeg() {
		return ['−', this.pct, '+', 'Fit'];
	}

	get guidesSeg() {
		return ['Rulers', 'Guides', 'Grid', 'Snap'];
	}

	get guidesOn() {
		const g = this.guides.current;
		const flags: Array<string | false> = [
			g.rulers && 'Rulers',
			g.guides && 'Guides',
			g.grid && 'Grid',
			g.snap && 'Snap',
		];
		return flags.filter((s): s is string => typeof s === 'string');
	}

	onZoomSelect = (s: string) => {
		if (s === '−') viewport.zoomOut();
		else if (s === '+') viewport.zoomIn();
		else if (s === 'Fit') {
			viewport.fit();
			toast('canvas-fit');
		} else viewport.cycle();
	};

	onGuideSelect = (s: string) => {
		toggleGuide(
			s.toLowerCase() as
				'rulers' | 'guides' | 'grid' | 'snap',
		);
	};

	<template>
		<Box class="sub-topbar-workspace-box">
			<WRow
				@label="Zoom"
				@seg={{this.zoomSeg}}
				@onSelect={{this.onZoomSelect}}
			/>
			<WRow
				@label="Guides"
				@seg={{this.guidesSeg}}
				@on={{this.guidesOn}}
				@onSelect={{this.onGuideSelect}}
			/>
			<Sep />
			<Item @label="Theme" @onClick={{this.theme.toggle}} />
		</Box>
	</template>
}

function showHelpModal(
	onClose: () => void,
	id: 'shortcuts' | 'about-substrata' | 'about-delphitools',
): void {
	openModal(id);
	onClose();
}

interface HelpMenuSignature {
	Args: { onClose: () => void };
}

const HelpMenu: TOC<HelpMenuSignature> = <template>
	<Box class="sub-topbar-help-box">
		<Item
			@label="Keyboard shortcuts"
			@onClick={{fn showHelpModal @onClose "shortcuts"}}
		/>
		<Item
			@label="About Substrata"
			@onClick={{fn showHelpModal @onClose "about-substrata"}}
		/>
		<Item
			@label="About delphitools"
			@onClick={{fn
				showHelpModal
				@onClose
				"about-delphitools"
			}}
		/>
		{{! avoid nested buttons }}
		<a
			href="https://github.com/1612elphi/delphitools"
			target="_blank"
			rel="noopener noreferrer"
			class="sub-topbar-item"
		>
			<span class="sub-topbar-item-label">Source · GitHub</span>
		</a>
	</Box>
</template>;

interface SceneNameSignature {
	Args: {
		name: string;
		hasDoc: boolean;
	};
}

class SceneName extends Component<SceneNameSignature> {
	@tracked editing = false;
	@tracked draft = '';

	get displayName() {
		return this.args.name.trim()
			? this.args.name
			: 'Untitled scene';
	}

	startEdit = () => {
		this.draft = this.args.name;
		this.editing = true;
	};

	updateDraft = (event: Event) => {
		this.draft = (event.target as HTMLInputElement).value;
	};

	selectOnFocus = (event: Event) => {
		(event.target as HTMLInputElement).select();
	};

	commit = () => {
		this.editing = false;
		const next = this.draft.trim();
		if (next === this.args.name.trim()) return;
		update((doc) => ({ ...doc, name: next }));
	};

	onKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter') this.commit();
		if (event.key === 'Escape') this.editing = false;
	};

	focusInput = modifier((element: HTMLInputElement) => {
		element.focus();
	});

	<template>
		{{#if this.editing}}
			<input
				data-scene-name-input
				aria-label="Rename scene"
				value={{this.draft}}
				class="sub-topbar-scene-input"
				{{on "input" this.updateDraft}}
				{{on "focus" this.selectOnFocus}}
				{{on "blur" this.commit}}
				{{on "keydown" this.onKeydown}}
				{{! attach focus handler first }}
				{{this.focusInput}}
			/>
		{{else}}
			<button
				type="button"
				data-scene-name
				disabled={{not @hasDoc}}
				aria-label="Rename scene"
				title="Rename scene"
				class="sub-topbar-scene-btn"
				{{on "click" this.startEdit}}
			>
				{{this.displayName}}
			</button>
		{{/if}}
	</template>
}

export default class TopBar extends Component {
	@tracked open: MenuId | null = null;

	doc = new TrackedExternal(subscribe, getSnapshot);
	undoable = new TrackedExternal(subscribe, canUndo);
	redoable = new TrackedExternal(subscribe, canRedo);
	persistOn = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);
	zoom = new TrackedExternal(subscribeViewport, getZoom);

	#fileInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.undoable.unsubscribe();
		this.redoable.unsubscribe();
		this.persistOn.unsubscribe();
		this.zoom.unsubscribe();
	}

	registerFileInput = modifier((element: HTMLInputElement) => {
		this.#fileInput = element;
		return () => {
			this.#fileInput = null;
		};
	});

	watchOutsideClick = modifier(() => {
		if (!this.open) return;
		const onDown = (event: MouseEvent) => {
			if (
				!(event.target as HTMLElement).closest(
					'[data-menu-root]',
				)
			)
				this.close();
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	});

	toggle = (id: MenuId) => {
		this.open = this.open === id ? null : id;
	};

	close = () => {
		this.open = null;
	};

	doImport = () => {
		this.#fileInput?.click();
		this.close();
	};

	onPickFiles = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (files) {
			for (const f of Array.from(files)) {
				if (f.type.startsWith('image/'))
					void importImageFile(f);
			}
		}
		input.value = '';
	};

	zoomOut = () => viewport.zoomOut();
	zoomIn = () => viewport.zoomIn();
	cycleZoom = () => viewport.cycle();

	fit = () => {
		viewport.fit();
		toast('canvas-fit');
	};

	openExport = () => openModal('export');

	get docName() {
		return this.doc.current?.name ?? '';
	}

	get hasDoc() {
		return this.doc.current !== null;
	}

	get zoomPct() {
		return Math.round(this.zoom.current * 100);
	}

	get statusDotClass() {
		if (this.persistOn.current) return 'is-saved';
		if (this.undoable.current) return 'is-unsaved';
		return 'is-off';
	}

	get statusText() {
		if (this.persistOn.current) return 'Saved in browser';
		if (this.undoable.current) return 'Not saved';
		return 'Storage off';
	}

	<template>
		<div class="sub-topbar" {{this.watchOutsideClick}}>
			<input
				type="file"
				accept="image/*"
				multiple
				class="sub-topbar-file-input"
				aria-label="Import image…"
				{{this.registerFileInput}}
				{{on "change" this.onPickFiles}}
			/>

			<LinkTo
				@route="index"
				aria-label="back to delphitools"
				class="sub-topbar-home"
			>
				<img
					src="/delphi-lowlod.png"
					alt=""
					class="sub-topbar-home-img"
				/>
			</LinkTo>
			<span class="sub-topbar-wordmark">Substrata</span>
			<span class="sub-topbar-divider"></span>

			<nav class="sub-topbar-nav">
				<Menu
					@id="scene"
					@label="Scene"
					@open={{this.open}}
					@onToggle={{this.toggle}}
				>
					<SceneMenu
						@doc={{this.doc.current}}
						@persistOn={{this.persistOn.current}}
						@onImport={{this.doImport}}
						@onClose={{this.close}}
					/>
				</Menu>
				<Menu
					@id="edit"
					@label="Edit"
					@open={{this.open}}
					@onToggle={{this.toggle}}
				>
					<EditMenu
						@undoable={{this.undoable.current}}
						@redoable={{this.redoable.current}}
						@onClose={{this.close}}
					/>
				</Menu>
				<Menu
					@id="workspace"
					@label="Workspace"
					@open={{this.open}}
					@onToggle={{this.toggle}}
				>
					<WorkspaceMenu />
				</Menu>
				<Menu
					@id="help"
					@label="Help"
					@open={{this.open}}
					@onToggle={{this.toggle}}
				>
					<HelpMenu @onClose={{this.close}} />
				</Menu>
			</nav>

			<div class="sub-topbar-centre">
				<SceneName
					@name={{this.docName}}
					@hasDoc={{this.hasDoc}}
				/>
				<span class="sub-topbar-status">
					<span
						class="sub-topbar-status-dot
							{{this.statusDotClass}}"
					></span>
					{{this.statusText}}
				</span>
			</div>

			<div class="sub-topbar-right">
				<ToastSlot />
				<span class="sub-topbar-divider"></span>
				<div class="sub-topbar-zoom">
					<button
						type="button"
						class="sub-topbar-zoom-btn"
						aria-label="Zoom out"
						title="Zoom out"
						{{on "click" this.zoomOut}}
					>−</button>
					<button
						type="button"
						class="sub-topbar-zoom-pct"
						aria-label="Cycle zoom"
						title="Cycle zoom"
						{{on "click" this.cycleZoom}}
					>{{this.zoomPct}}%</button>
					<button
						type="button"
						class="sub-topbar-zoom-btn"
						aria-label="Zoom in"
						title="Zoom in"
						{{on "click" this.zoomIn}}
					>+</button>
				</div>
				<button
					type="button"
					class="sub-topbar-fit-btn"
					aria-label="Fit to view"
					title="Fit to view"
					{{on "click" this.fit}}
				>
					<Icon @name="maximize-2" />
				</button>
				<span class="sub-topbar-divider"></span>
				<a
					href="mailto:tools@rmv.fyi?subject=substrata%20bug%20report"
					class="sub-topbar-feedback"
				>
					<Icon @name="message-square-plus" />
					Feedback
				</a>
				<button
					type="button"
					class="sub-topbar-export"
					{{on "click" this.openExport}}
				>
					<Icon @name="download" />
					Export
				</button>
				<ThemeToggle />
			</div>
		</div>
	</template>
}
