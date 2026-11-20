import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	Cell,
	PanelHeader,
} from 'delphitools-v2/components/substrata/editor/cells';
import {
	ActionTile,
	flow,
	Rule,
} from 'delphitools-v2/components/substrata/pages/drawer-parts';
import { imagePage } from 'delphitools-v2/lib/errata/source';
import {
	cropPage,
	deletePage,
	insertBlankAfter,
	insertPageAfter,
	resizePage,
	rotateCurrent,
} from 'delphitools-v2/lib/errata/page-ops';
import {
	currentPage,
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { deleteSelection, setMode } from 'delphitools-v2/lib/errata/ui';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import {
	insertToc,
	invisibles,
	marginGuide,
	focusMode,
	rulers,
	typewriter,
	run,
	type MarginGuide,
} from 'delphitools-v2/lib/errata/write/editor';
import { applySuggestedHeadings } from 'delphitools-v2/lib/errata/write/model';
import {
	exportRtf,
	newDocument,
	saveWrite,
} from 'delphitools-v2/lib/errata/write/session';
import { writePanel } from 'delphitools-v2/lib/errata/write/view';
import { activeDoc, subscribeActive } from 'delphitools-v2/lib/errata/active';
import type ThemeService from 'delphitools-v2/services/theme';

const APPEARANCES = ['Light', 'Dark'];
const GUIDES: MarginGuide[] = ['off', 'border', 'corners'];
const GUIDE_TITLES = ['Off', 'Border', 'Corners'];

interface Signature {
	Args: {
		phone: boolean;
		onOpenPdf: () => void;
		onLibrary: () => void;
		onExport: () => void;
		onClose: () => void;
	};
}

export default class ErrataMenu extends Component<Signature> {
	@service declare theme: ThemeService;
	@service declare router: RouterService;

	active = new TrackedExternal(subscribeActive, activeDoc);
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	shown = new TrackedExternal(invisibles.subscribe, invisibles.get);
	ruled = new TrackedExternal(rulers.subscribe, rulers.get);
	typed = new TrackedExternal(typewriter.subscribe, typewriter.get);
	focused = new TrackedExternal(focusMode.subscribe, focusMode.get);
	guide = new TrackedExternal(marginGuide.subscribe, marginGuide.get);
	#imageInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.active.unsubscribe();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
		this.shown.unsubscribe();
		this.ruled.unsubscribe();
		this.guide.unsubscribe();
		this.typed.unsubscribe();
		this.focused.unsubscribe();
	}

	get noDoc() {
		return this.doc.current === null;
	}

	get nothingOpen() {
		return this.active.current === null;
	}

	get writing() {
		return this.active.current?.kind === 'write';
	}

	get guideIndex() {
		return GUIDES.indexOf(this.guide.current);
	}

	get page() {
		return this.doc.current?.pages[this.pageIndex.current] ?? null;
	}

	get cannotDeletePage() {
		return (this.doc.current?.pages.length ?? 0) < 2;
	}

	get noCrop() {
		return this.page?.crop == null;
	}

	get noResize() {
		return this.page?.resize == null;
	}

	get appearance() {
		return this.theme.dark ? 1 : 0;
	}

	setAppearance = (index: number) => {
		if ((index === 1) !== this.theme.dark) this.theme.toggle();
	};

	setInvisibles = (on: boolean) => invisibles.set(on);
	setRulers = (on: boolean) => rulers.set(on);
	setTypewriter = (on: boolean) => typewriter.set(on);
	setFocus = (on: boolean) => focusMode.set(on);
	setGuide = (index: number) => marginGuide.set(GUIDES[index] ?? 'off');

	#then = (action: () => void) => () => {
		action();
		this.args.onClose();
	};

	leave = this.#then(() => void this.router.transitionTo('index'));
	open = this.#then(() => this.args.onOpenPdf());
	library = this.#then(() => this.args.onLibrary());
	export = this.#then(() => this.args.onExport());
	addBlank = this.#then(() => {
		const page = currentPage();
		if (page) insertBlankAfter(page.id);
	});
	addImage = () => this.#imageInput?.click();
	rotate = this.#then(() => {
		const page = currentPage();
		if (page) rotateCurrent(page.id, 1);
	});
	deletePage = this.#then(() => {
		const page = currentPage();
		if (page) deletePage(page.id);
	});
	pageSize = this.#then(() => setMode('page-size'));
	resetSize = this.#then(() => {
		if (this.page) resizePage(this.page.id, null);
	});
	resetCrop = this.#then(() => {
		if (this.page) cropPage(this.page.id, null);
	});
	closeDoc = this.#then(() => activeDoc()?.close());
	newDoc = this.#then(() => newDocument());
	exportRtf = this.#then(() => exportRtf());
	saveDoc = this.#then(() => saveWrite());
	setup = this.#then(() => writePanel.set('setup'));
	find = this.#then(() => writePanel.set('find'));
	detectHeadings = this.#then(() =>
		run((d, sel) => ({ doc: applySuggestedHeadings(d), sel })),
	);
	contents = this.#then(() => insertToc());
	deleteSelection = this.#then(() => deleteSelection());
	fit = this.#then(() => activeDoc()?.fit());
	actual = this.#then(() => viewport.reset());

	closeOnEscape = modifier(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			this.args.onClose();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	registerImageInput = modifier((el: HTMLInputElement) => {
		this.#imageInput = el;
		return () => {
			this.#imageInput = null;
		};
	});

	onPickImage = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		this.args.onClose();
		if (!file) return;
		const page = await imagePage(file);
		insertPageAfter(currentPage()?.id ?? null, page);
	};

	<template>
		<section
			class="sub-pg-drawer is-settings err-menu
				{{if @phone 'is-phone'}}"
			aria-label="Menu"
			{{this.closeOnEscape}}
		>
			<input
				type="file"
				accept="image/*"
				class="dt-sr-only"
				aria-label="Add image page"
				{{this.registerImageInput}}
				{{on "change" this.onPickImage}}
			/>
			<PanelHeader @title="Menu" @onClose={{@onClose}}>
				<Cell
					class="sub-pg-back"
					@label="Documents"
					@text="Documents"
					@icon="library"
					data-menu="library"
					@onClick={{this.library}}
				/>
				<Cell
					class="sub-pg-back"
					@label="Back to delphitools"
					@text="Back to delphitools"
					@icon="arrow-left"
					@onClick={{this.leave}}
				/>
			</PanelHeader>
			<div class="sub-pg-scroller" {{flow}}>
				<div
					class="sub-pg-actions"
					data-section="actions"
				>
					<ActionTile
						@title="New document"
						@onClick={{this.newDoc}}
					>
						<IconSvg @name="file-plus" />
					</ActionTile>
					<div class="sub-pg-tile-pair">
						<ActionTile
							@title="Open…"
							@onClick={{this.open}}
						>
							<IconSvg
								@name="folder-open"
							/>
						</ActionTile>
						<ActionTile
							@title="Export…"
							@disabled={{this.nothingOpen}}
							@onClick={{this.export}}
						>
							<IconSvg
								@name="download"
							/>
						</ActionTile>
					</div>
					<div class="sub-pg-tile-pair">
						{{#if this.writing}}
							<ActionTile
								@title="Save"
								@onClick={{this.saveDoc}}
							>
								<IconSvg
									@name="file-down"
								/>
							</ActionTile>
						{{/if}}
						<ActionTile
							@title="Close"
							@disabled={{this.nothingOpen}}
							@onClick={{this.closeDoc}}
						>
							<IconSvg @name="x" />
						</ActionTile>
					</div>
				</div>

				{{#if this.writing}}
					<Rule @icon="file-text" />
					<div
						class="sub-pg-block"
						data-section="document"
					>
						<CanonHeading
							@text="Document"
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Document setup…"
							@icon={{component
								IconSvg
								name="settings-2"
							}}
							@onClick={{this.setup}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Fit page"
							@icon={{component
								IconSvg
								name="maximize-2"
							}}
							@onClick={{this.fit}}
						/>
					</div>
					<div
						class="sub-pg-block is-continued"
						data-section="view"
					>
						<CanonHeading @text="View" />
						<CanonRow
							@title="Invisibles"
							as |id|
						>
							<CanonSwitch
								@on={{this.shown.current}}
								@onChange={{this.setInvisibles}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow
							@title="Rulers"
							as |id|
						>
							<CanonSwitch
								@on={{this.ruled.current}}
								@onChange={{this.setRulers}}
								aria-labelledby={{id}}
								data-menu="rulers"
							/>
						</CanonRow>
						<CanonRow
							@title="Typewriter"
							as |id|
						>
							<CanonSwitch
								@on={{this.typed.current}}
								@onChange={{this.setTypewriter}}
								aria-labelledby={{id}}
								data-menu="typewriter"
							/>
						</CanonRow>
						<CanonRow
							@title="Focus"
							as |id|
						>
							<CanonSwitch
								@on={{this.focused.current}}
								@onChange={{this.setFocus}}
								aria-labelledby={{id}}
								data-menu="focus"
							/>
						</CanonRow>
						<CanonRow
							@title="Margins"
							@form="stacked"
						>
							<CanonSegmented
								@items={{GUIDE_TITLES}}
								@selected={{this.guideIndex}}
								@onChange={{this.setGuide}}
								data-menu="margins"
							/>
						</CanonRow>
					</div>

					<Rule @icon="search" />
					<div
						class="sub-pg-block"
						data-section="edit"
					>
						<CanonHeading @text="Edit" />
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Find…"
							@icon={{component
								IconSvg
								name="search"
							}}
							data-menu="find"
							@onClick={{this.find}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Export RTF"
							@icon={{component
								IconSvg
								name="file-text"
							}}
							data-menu="export-rtf"
							@onClick={{this.exportRtf}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Detect headings"
							@icon={{component
								IconSvg
								name="wand-sparkles"
							}}
							data-menu="detect-headings"
							@onClick={{this.detectHeadings}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Table of contents"
							@icon={{component
								IconSvg
								name="book-open"
							}}
							data-menu="toc"
							@onClick={{this.contents}}
						/>
					</div>
				{{else}}
					<Rule @icon="file" />
					<div
						class="sub-pg-block"
						data-section="page"
					>
						<CanonHeading @text="Page" />
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Add blank page"
							@icon={{component
								IconSvg
								name="file-plus"
							}}
							@disabled={{this.noDoc}}
							@onClick={{this.addBlank}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Add image page"
							@icon={{component
								IconSvg
								name="image-plus"
							}}
							@disabled={{this.noDoc}}
							@onClick={{this.addImage}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Rotate page"
							@icon={{component
								IconSvg
								name="rotate-cw"
							}}
							@disabled={{this.noDoc}}
							@onClick={{this.rotate}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Page size…"
							@icon={{component
								IconSvg
								name="scaling"
							}}
							data-menu="page-size"
							@disabled={{this.noDoc}}
							@onClick={{this.pageSize}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Reset size"
							@icon={{component
								IconSvg
								name="undo-2"
							}}
							@disabled={{this.noResize}}
							@onClick={{this.resetSize}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Reset crop"
							@icon={{component
								IconSvg
								name="crop"
							}}
							@disabled={{this.noCrop}}
							@onClick={{this.resetCrop}}
						/>
						<CanonButton
							class="sub-pg-row-button err-menu-destructive"
							@kind="cell"
							@text="Delete page"
							@icon={{component
								IconSvg
								name="trash-2"
							}}
							@disabled={{this.cannotDeletePage}}
							@onClick={{this.deletePage}}
						/>
					</div>
					<div
						class="sub-pg-block is-continued"
						data-section="edit"
					>
						<CanonHeading @text="Edit" />
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Delete"
							@icon={{component
								IconSvg
								name="trash-2"
							}}
							@disabled={{this.noDoc}}
							@onClick={{this.deleteSelection}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Fit page"
							@icon={{component
								IconSvg
								name="maximize-2"
							}}
							@disabled={{this.noDoc}}
							@onClick={{this.fit}}
						/>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Actual size"
							@icon={{component
								IconSvg
								name="scan"
							}}
							@disabled={{this.noDoc}}
							@onClick={{this.actual}}
						/>
					</div>
				{{/if}}

				<Rule @icon="settings" />
				<div
					class="sub-pg-block"
					data-section="general"
				>
					<CanonHeading @text="General" />
					<CanonRow
						@title="Appearance"
						@form="stacked"
					>
						<CanonSegmented
							@items={{APPEARANCES}}
							@selected={{this.appearance}}
							@onChange={{this.setAppearance}}
						/>
					</CanonRow>
				</div>
			</div>
		</section>
	</template>
}
