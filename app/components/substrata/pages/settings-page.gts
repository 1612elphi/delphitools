import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { LinkTo } from '@ember/routing';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	Cell,
	Cells,
	PanelHeader,
} from 'delphitools-v2/components/substrata/editor/cells';
import { VERSION } from 'delphitools-v2/lib/build-flags';
import { COLOUR_NOTATIONS } from 'delphitools-v2/lib/colour-notation';
import { setArtboard } from 'delphitools-v2/lib/substrata/artboard-ops';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import {
	canRedo,
	canUndo,
	getSnapshot,
	redo,
	subscribe,
	update,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	editorUi,
	type EditorEdge,
} from 'delphitools-v2/lib/substrata/editor-ui';
import { EXPORT_FORMATS } from 'delphitools-v2/lib/substrata/export-core';
import {
	openScene,
	saveScene,
	saveTemplate,
} from 'delphitools-v2/lib/substrata/file-ops';
import {
	getGuides,
	subscribeGuides,
	toggleGuide,
	type GuidesPref,
} from 'delphitools-v2/lib/substrata/guides-pref';
import { selectableLeafIds } from 'delphitools-v2/lib/substrata/layer-tree';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import {
	getPersistenceEnabled,
	setPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import { setSelection } from 'delphitools-v2/lib/substrata/selection';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import type ThemeService from 'delphitools-v2/services/theme';
import ThumbnailArt from './thumbnail-art';
import { pageState, type Hand } from './page-state';
import { ActionTile, flow, Rule } from './drawer-parts';

const BUG_MAILTO = 'mailto:tools@rmv.fyi?subject=substrata%20bug%20report';
const REPO_URL = 'https://github.com/1612elphi/delphitools';
const GUIDE_DEFAULTS: GuidesPref = {
	rulers: false,
	guides: true,
	grid: false,
	snap: true,
};
const EDGES = ['top', 'bottom', 'left', 'right'] as const;
const NOTATIONS = COLOUR_NOTATIONS.map((n) => n.label);
const DATE = new Intl.DateTimeFormat(undefined, {
	dateStyle: 'medium',
	timeStyle: 'short',
});

function countLayers(layers: Layer[]): number {
	return layers.reduce(
		(n, l) =>
			n +
			1 +
			(l.kind === 'group' ? countLayers(l.children) : 0),
		0,
	);
}

export default class SettingsPage extends Component<{
	Args: { phone: boolean };
}> {
	@service declare theme: ThemeService;
	@service declare router: RouterService;
	@service('colour-notation') declare notation: ColourNotationService;

	doc = new TrackedExternal(subscribe, () => ({
		doc: getSnapshot(),
		undo: canUndo(),
		redo: canRedo(),
	}));
	guides = new TrackedExternal(subscribeGuides, getGuides);
	persist = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);

	@tracked compact = false;
	@tracked asking = false;
	@tracked thumbnail: string | null = null;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.guides.unsubscribe();
		this.persist.unsubscribe();
	}

	get current() {
		return this.doc.current.doc;
	}

	get name() {
		return this.current?.name ?? '';
	}

	get layerCount() {
		return String(countLayers(this.current?.layers ?? []));
	}

	get created() {
		return this.current ? DATE.format(this.current.createdAt) : '—';
	}

	get modified() {
		return this.current ? DATE.format(this.current.updatedAt) : '—';
	}

	get size() {
		const ab = this.current?.artboard;
		return ab ? `${ab.width} × ${ab.height} px` : '—';
	}

	get resolution() {
		return this.current?.artboard.resolution ?? 72;
	}

	get background() {
		return this.current?.artboard.background ?? null;
	}

	get transparent() {
		return this.current !== null && this.background === null;
	}

	get wellStyle() {
		return htmlSafe(
			`--sub-pg-well: ${this.background ?? 'transparent'}`,
		);
	}

	get appearance() {
		return this.theme.dark ? 1 : 0;
	}

	get handIndex() {
		return pageState.hand === 'left' ? 0 : 1;
	}

	get edgeIndex() {
		const edge = editorUi.settingsEdge;
		if (edge === 'top' || edge === 'bottom')
			return EDGES.indexOf(edge);
		const left = pageState.hand === 'left' ? 'trailing' : 'leading';
		return edge === left ? 2 : 3;
	}

	get notationIndex() {
		return COLOUR_NOTATIONS.findIndex(
			(n) => n.id === this.notation.notation,
		);
	}

	get status() {
		if (this.persist.current) return 'Saved in browser';
		if (this.doc.current.undo) return 'Not saved';
		return 'Storage off';
	}

	get noSelectable() {
		return (
			!this.current ||
			selectableLeafIds(this.current.layers).length === 0
		);
	}

	close = () => {
		editorUi.pageOpen = false;
	};

	applyLayout = modifier(
		(el: HTMLElement, [hand, help]: [Hand, boolean]) => {
			const root = el.closest<HTMLElement>('.sub-ed');
			if (!root) return;
			const flips =
				!!root.dataset['hand'] &&
				root.dataset['hand'] !== hand;
			root.dataset['hand'] = hand;
			root.dataset['help'] = help ? 'on' : 'off';
			if (flips) requestAnimationFrame(() => viewport.fit());
		},
	);

	noteCompact = (scroller: HTMLElement) => {
		this.compact = !!scroller
			.closest('.sub-ed')
			?.classList.contains('is-compact');
	};

	leave = () => void this.router.transitionTo('index');

	openGallery = () => editorUi.openGallery('projects');

	openExport = () => {
		editorUi.exportOpen = true;
	};

	save = () => void saveScene();
	open = () => void openScene();
	doRedo = () => redo();

	commitName = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const typed = input.value.trim();
		if (!typed || typed === this.name.trim()) {
			input.value = this.name;
			return;
		}
		update((doc) => ({ ...doc, name: typed }));
	};

	openCanvasSize = (event: Event) => {
		pageState.anchor = event.currentTarget as HTMLElement;
		openModal('canvas-size');
	};

	setResolution = (resolution: number) => setArtboard({ resolution });

	setTransparent = (on: boolean) =>
		setArtboard({ background: on ? null : '#ffffff' });

	pickBackground = () => {
		editorUi.openRingFor({
			hex: this.background ?? '#ffffff',
			alpha: 1,
			send: (hex) => setArtboard({ background: hex }),
		});
	};

	setAppearance = (index: number) => {
		if ((index === 1) !== this.theme.dark) this.theme.toggle();
	};

	setHand = (index: number) => {
		const edge = this.edgeIndex;
		pageState.setHand(index === 0 ? 'left' : 'right');
		this.setEdge(edge);
	};

	setEdge = (index: number) => {
		const side = EDGES[index] ?? 'bottom';
		const left: EditorEdge =
			pageState.hand === 'left' ? 'trailing' : 'leading';
		const right: EditorEdge =
			left === 'leading' ? 'trailing' : 'leading';
		editorUi.setSettingsEdge(
			side === 'left'
				? left
				: side === 'right'
					? right
					: side,
		);
	};

	setNotation = (index: number) => {
		const n = COLOUR_NOTATIONS[index];
		if (n) this.notation.setNotation(n.id);
	};

	toggle = (key: keyof GuidesPref) => toggleGuide(key);

	setPersist = (on: boolean) => {
		setPersistenceEnabled(on);
		toast(on ? 'saved' : 'storage-off');
	};

	selectAll = () => {
		if (this.current)
			setSelection(selectableLeafIds(this.current.layers));
	};

	zoomOut = () => viewport.zoomOut();
	zoomIn = () => viewport.zoomIn();
	actualSize = () => viewport.setZoom(1);
	fit = () => {
		viewport.fit();
		toast('canvas-fit');
	};

	ask = (on: boolean) => {
		this.asking = on;
	};

	reset = () => {
		this.asking = false;
		pageState.setHand('right');
		pageState.setHelpButton(true);
		editorUi.setSettingsEdge('bottom');
		const g = getGuides();
		for (const key of Object.keys(
			GUIDE_DEFAULTS,
		) as (keyof GuidesPref)[])
			if (g[key] !== GUIDE_DEFAULTS[key]) toggleGuide(key);
	};

	openShortcuts = () => openModal('shortcuts');
	openAboutDelphitools = () => openModal('about-delphitools');

	<template>
		<span
			hidden
			{{this.applyLayout pageState.hand pageState.helpButton}}
		></span>
		{{#if editorUi.pageOpen}}
			<section
				class="sub-pg-drawer is-settings
					{{if @phone 'is-phone'}}"
				aria-label="Settings"
			>
				<PanelHeader
					@title="Settings"
					@onClose={{this.close}}
				>
					<Cell
						class="sub-pg-back"
						@label="Back to delphitools"
						@text="Back to delphitools"
						@icon="arrow-left"
						@onClick={{this.leave}}
					/>
				</PanelHeader>
				<div
					class="sub-pg-scroller"
					{{flow this.noteCompact}}
				>
					<div
						class="sub-pg-actions"
						data-section="actions"
					>
						{{#if this.compact}}
							<Cells
								class="sub-pg-redo"
							>
								<Cell
									@label="Redo"
									@icon="redo-2"
									@text="Redo"
									@disabled={{if
										this.doc.current.redo
										false
										true
									}}
									@onClick={{this.doRedo}}
								/>
							</Cells>
						{{/if}}
						<ActionTile
							@title="Gallery"
							@onClick={{this.openGallery}}
						>
							<ThumbnailArt
								@kind="fan"
							/>
						</ActionTile>
						<ActionTile
							@title="Export"
							@onClick={{this.openExport}}
						>
							<span
								class="sub-pg-reels"
							>
								{{#each
									REELS
									as |label|
								}}
									<span
									>{{label}}</span>
								{{/each}}
							</span>
						</ActionTile>
						<div class="sub-pg-tile-pair">
							<ActionTile
								@title="Save"
								@onClick={{this.save}}
							>
								<ThumbnailArt
									@kind="pages"
								/>
							</ActionTile>
							<ActionTile
								@title="Save Template"
								@onClick={{saveTemplate}}
							>
								<IconSvg
									@name="layout-template"
								/>
							</ActionTile>
						</div>
					</div>

					<Rule @icon="file" />
					<div
						class="sub-pg-block"
						data-section="project"
					>
						<CanonHeading
							@text="This Project"
						/>
						<CanonRow
							@title="Name"
							@form="flush"
							as |id|
						>
							<CanonTextCell
								@value={{this.name}}
								@placeholder="Untitled scene"
								aria-labelledby={{id}}
								{{on
									"change"
									this.commitName
								}}
							/>
						</CanonRow>
						<CanonRow @title="Layers">
							<span
								class="sub-pg-value"
							>{{this.layerCount}}</span>
						</CanonRow>
						<CanonRow @title="Created">
							<span
								class="sub-pg-value"
							>{{this.created}}</span>
						</CanonRow>
						<CanonRow @title="Modified">
							<span
								class="sub-pg-value"
							>{{this.modified}}</span>
						</CanonRow>
					</div>
					<div
						class="sub-pg-block is-continued"
						data-section="canvas"
					>
						<CanonHeading @text="Canvas" />
						<CanonRow
							@title="Canvas Size"
							@form="flush"
						>
							<button
								type="button"
								class="sub-pg-link-cell"
								aria-label="Canvas Size"
								{{on
									"click"
									this.openCanvasSize
								}}
							>{{this.size}}<IconSvg
									@name="chevron-right"
								/></button>
						</CanonRow>
						<CanonRow
							@title="Resolution"
							@form="flush"
							as |id|
						>
							<CanonNumberField
								@value={{this.resolution}}
								@min={{1}}
								@max={{10000}}
								@unit="ppi"
								@labelledBy={{id}}
								@onChange={{this.setResolution}}
							/>
						</CanonRow>
						<CanonRow
							@title="Colour Profile"
						>
							<span
								class="sub-pg-value"
							>sRGB, 8-bit</span>
						</CanonRow>
					</div>
					<div
						class="sub-pg-block is-continued"
						data-section="surface"
					>
						<CanonHeading @text="Surface" />
						<CanonRow
							@title="Transparent"
							as |id|
						>
							<CanonSwitch
								@on={{this.transparent}}
								@onChange={{this.setTransparent}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow
							@title="Background"
							@form="flush"
							class={{if
								this.transparent
								"sub-pg-dim"
							}}
						>
							<button
								type="button"
								class="sub-pg-well"
								style={{this.wellStyle}}
								aria-label="Background"
								disabled={{this.transparent}}
								{{on
									"click"
									this.pickBackground
								}}
							><span
									class="sub-pg-well-swatch"
								></span><span
									class="sub-pg-well-hex"
								>{{if
										this.background
										this.background
										"—"
									}}</span></button>
						</CanonRow>
					</div>

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
						<CanonRow
							@title="Colour Format"
							@form="flush"
							as |id|
						>
							<CanonMenuCell
								@items={{NOTATIONS}}
								@selected={{this.notationIndex}}
								@labelledBy={{id}}
								@onChange={{this.setNotation}}
							/>
						</CanonRow>
						<CanonRow
							@title="Help Button"
							as |id|
						>
							<CanonSwitch
								@on={{pageState.helpButton}}
								@onChange={{pageState.setHelpButton}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow
							@title="Handedness"
							@form="stacked"
						>
							<CanonSegmented
								@items={{HANDS}}
								@selected={{this.handIndex}}
								@onChange={{this.setHand}}
							/>
						</CanonRow>
						<CanonRow
							@title="Tool Settings"
							@form="stacked"
						>
							<CanonSegmented
								@items={{SIDES}}
								@selected={{this.edgeIndex}}
								@onChange={{this.setEdge}}
							/>
						</CanonRow>
					</div>

					<Rule @icon="image" />
					<div
						class="sub-pg-block"
						data-section="editing"
					>
						<CanonHeading @text="Editing" />
						<CanonRow
							@title="Snapping"
							as |id|
						>
							<CanonSwitch
								@on={{this.guides.current.snap}}
								@onChange={{fn
									this.toggle
									"snap"
								}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow @title="Grid" as |id|>
							<CanonSwitch
								@on={{this.guides.current.grid}}
								@onChange={{fn
									this.toggle
									"grid"
								}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow
							@title="Guides"
							as |id|
						>
							<CanonSwitch
								@on={{this.guides.current.guides}}
								@onChange={{fn
									this.toggle
									"guides"
								}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow
							@title="Rulers"
							as |id|
						>
							<CanonSwitch
								@on={{this.guides.current.rulers}}
								@onChange={{fn
									this.toggle
									"rulers"
								}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow
							@title="Zoom"
							@form="stacked"
						>
							<CanonGrid
								class="sub-pg-zoom"
							>
								<CanonButton
									@kind="cell"
									@label="Zoom out"
									@icon={{component
										IconSvg
										name="minus"
									}}
									@onClick={{this.zoomOut}}
								/>
								<CanonButton
									@kind="cell"
									@text="Fit"
									@onClick={{this.fit}}
								/>
								<CanonButton
									@kind="cell"
									@text="100 %"
									@onClick={{this.actualSize}}
								/>
								<CanonButton
									@kind="cell"
									@label="Zoom in"
									@icon={{component
										IconSvg
										name="plus"
									}}
									@onClick={{this.zoomIn}}
								/>
							</CanonGrid>
						</CanonRow>
						<CanonButton
							class="sub-pg-row-button"
							@kind="cell"
							@text="Select all"
							@icon={{component
								IconSvg
								name="box-select"
							}}
							@disabled={{this.noSelectable}}
							@onClick={{this.selectAll}}
						/>
					</div>

					<Rule @icon="hard-drive" />
					<div
						class="sub-pg-block"
						data-section="storage"
					>
						<CanonHeading @text="Storage" />
						<CanonRow
							@title="Save in this browser"
							as |id|
						>
							<CanonSwitch
								@on={{this.persist.current}}
								@onChange={{this.setPersist}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						<CanonRow @title="Status">
							<span
								class="sub-pg-value"
							>{{this.status}}</span>
						</CanonRow>
						<CanonGrid class="sub-pg-files">
							<CanonButton
								@kind="cell"
								@text="Open…"
								@icon={{component
									IconSvg
									name="folder-open"
								}}
								@onClick={{this.open}}
							/>
							<CanonButton
								@kind="cell"
								@text="Save"
								@icon={{component
									IconSvg
									name="download"
								}}
								@onClick={{this.save}}
							/>
						</CanonGrid>
					</div>

					<Rule @icon="rotate-ccw" />
					<div
						class="sub-pg-block"
						data-section="reset"
					>
						<CanonHeading
							@text="Reset Settings"
						/>
						{{#if this.asking}}
							<CanonGrid
								class="sub-pg-confirm"
							>
								<CanonButton
									@kind="cell"
									@text="Cancel"
									@onClick={{fn
										this.ask
										false
									}}
								/>
								<CanonButton
									@kind="primary"
									@text="Confirm"
									@icon={{component
										IconSvg
										name="check"
									}}
									@onClick={{this.reset}}
								/>
							</CanonGrid>
						{{else}}
							<CanonButton
								class="sub-pg-row-button"
								@kind="cell"
								@text="Reset"
								@icon={{component
									IconSvg
									name="rotate-ccw"
								}}
								@onClick={{fn
									this.ask
									true
								}}
							/>
						{{/if}}
					</div>

					<Rule @icon="info" />
					<div
						class="sub-pg-block"
						data-section="about"
					>
						<CanonHeading @text="About" />
						<CanonRow @title="Version">
							<span
								class="sub-pg-value"
							>v{{VERSION}}</span>
						</CanonRow>
						<p class="sub-pg-statement">
							Substrata is a simple,
							uncomplicated image
							editor for the browser,
							based on Fabric.JS.
						</p>
						<button
							type="button"
							class="sub-pg-link"
							{{on
								"click"
								this.openShortcuts
							}}
						>Keyboard shortcuts<IconSvg
								@name="chevron-right"
							/></button>
						<button
							type="button"
							class="sub-pg-link"
							{{on
								"click"
								this.openAboutDelphitools
							}}
						>About delphitools<IconSvg
								@name="chevron-right"
							/></button>
						<a
							class="sub-pg-link"
							href={{REPO_URL}}
							target="_blank"
							rel="noopener noreferrer"
						>Source · GitHub<IconSvg
								@name="arrow-up-right"
							/></a>
						<a
							class="sub-pg-link"
							href={{BUG_MAILTO}}
						>Feedback<IconSvg
								@name="message-square-plus"
							/></a>
						<LinkTo
							@route="index"
							class="sub-pg-link"
						>Back to delphitools<IconSvg
								@name="arrow-left"
							/></LinkTo>
					</div>
				</div>
			</section>
		{{/if}}
	</template>
}

const APPEARANCES = ['Light', 'Dark'];
const HANDS = ['Left', 'Right'];
const SIDES = ['Top', 'Bottom', 'Left', 'Right'];
const REELS = [0, 1, 2].flatMap((reel) =>
	[0, 1, 2].map(
		(row) =>
			EXPORT_FORMATS[(reel + row) % EXPORT_FORMATS.length]!
				.label,
	),
);
