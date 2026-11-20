import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonFigure from 'delphicanon/components/canon-figure';
import FabricCanvas from 'delphitools-v2/components/substrata/fabric-canvas';
import Sheets from 'delphitools-v2/components/substrata/pages/sheets';
import { pageState } from 'delphitools-v2/components/substrata/pages/page-state';
import SecureContextNotice from 'delphitools-v2/components/substrata/secure-context-notice';
import NewStart from 'delphitools-v2/components/substrata/pages/new-start';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import ToolBar from 'delphitools-v2/components/substrata/editor/tool-bar';
import StatusNote from 'delphitools-v2/components/substrata/editor/status-note';
import ColourKey from 'delphitools-v2/components/substrata/editor/colour-key';
import Overlays from 'delphitools-v2/components/substrata/editor/overlays';
import LayersPanel from 'delphitools-v2/components/substrata/panels/layers';
import InspectorPanel from 'delphitools-v2/components/substrata/panels/inspector';
import AssetsPanel from 'delphitools-v2/components/substrata/panels/assets';
import FxPanel from 'delphitools-v2/components/substrata/panels/fx';
import ColourTray from 'delphitools-v2/components/substrata/colour/tray';
import {
	EDITOR_TOOLS,
	PANEL_DEFS,
	chooseTool,
	currentEditorTool,
	toolForKey,
	type EditorTool,
} from 'delphitools-v2/components/substrata/editor/tools';
import editorShortcuts from 'delphitools-v2/modifiers/editor-shortcuts';
import { ensureScene } from 'delphitools-v2/lib/substrata/file-ops';
import {
	canRedo,
	canUndo,
	getSnapshot,
	redo,
	subscribe,
	undo,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	editorUi,
	type EditorPanel,
} from 'delphitools-v2/lib/substrata/editor-ui';
import {
	getActiveSubs,
	getActiveTool,
	setActiveSub,
	subscribeTool,
} from 'delphitools-v2/lib/substrata/tool';
import {
	getZoom,
	subscribeViewport,
	viewport,
} from 'delphitools-v2/lib/substrata/viewport';
import { sharePanels } from 'delphitools-v2/lib/substrata/rail-share';
import { isTextEntry } from 'delphitools-v2/lib/text-entry';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './editor/editor.css';

const CELL = 44;
const FRAME = 2;
const BOX = CELL + FRAME * 2;
const PAD = 16;
const GAP = 8;
const SEAM = FRAME * 2 + GAP;
const TAB = 28 + FRAME * 2 - FRAME;
const PHONE_WIDTH = 600;

const length = (cells: number, seams = 0) =>
	cells * CELL + (cells - 1 - seams) + seams * SEAM + FRAME * 2;

const STACK_FULL = length(4);
const OMNIBAR_FULL = length(EDITOR_TOOLS.length + PANEL_DEFS.length + 1, 1);

const TRAY_SHARE = { short: 0.42, tall: 0.75, full: 1 } as const;

export default class SubstrataEditor extends Component {
	@tracked width = 1400;
	@tracked height = 1000;

	doc = new TrackedExternal(subscribe, () => ({
		doc: getSnapshot(),
		undo: canUndo(),
		redo: canRedo(),
	}));
	tool = new TrackedExternal(subscribeTool, () => ({
		tool: getActiveTool(),
		sub: getActiveSubs()[getActiveTool()],
	}));
	zoom = new TrackedExternal(subscribeViewport, getZoom);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.tool.unsubscribe();
		this.zoom.unsubscribe();
	}

	get phone() {
		return this.width < PHONE_WIDTH && this.height > this.width;
	}

	get compact() {
		if (this.phone) return true;
		const room =
			this.height -
			PAD * 2 -
			STACK_FULL -
			GAP -
			BOX -
			GAP -
			GAP -
			TAB;
		return room < OMNIBAR_FULL;
	}

	get activeTool(): EditorTool {
		void this.tool.current;
		return currentEditorTool();
	}

	get activeToolDef() {
		return (
			EDITOR_TOOLS.find((t) => t.id === this.activeTool) ??
			EDITOR_TOOLS[0]!
		);
	}

	get title() {
		return this.doc.current.doc?.name.trim() || 'Untitled scene';
	}

	get zoomPercent() {
		return String(Math.round(this.zoom.current * 100));
	}

	get trayStyle() {
		const room = this.height - 220;
		return htmlSafe(
			`--sub-tray-max: ${Math.max(CELL, room * TRAY_SHARE[editorUi.trayStop])}px`,
		);
	}

	get layoutClass() {
		if (this.phone) return 'is-phone';
		const ring = editorUi.ringOpen ? ' is-ringing' : '';
		return (this.compact ? 'is-compact' : 'is-full') + ring;
	}

	isToolOn = (id: EditorTool) => this.activeTool === id;

	pick = (id: EditorTool) => {
		chooseTool(id);
		editorUi.bloomOpen = false;
	};

	togglePanel = (id: EditorPanel) => editorUi.toggle(id, this.phone);
	toggleAssets = () => editorUi.toggleAssets(this.phone);

	get trayEmpty() {
		return (
			editorUi.panels.length === 0 &&
			!(this.phone && editorUi.assetsOpen)
		);
	}

	toggleBloom = () => {
		editorUi.bloomOpen = !editorUi.bloomOpen;
	};

	openMenu = () => {
		if (!getSnapshot()) ensureScene();
		editorUi.newOpen = false;
		editorUi.pageOpen = !(
			editorUi.pageOpen || editorUi.galleryOpen
		);
		editorUi.galleryOpen = false;
	};

	openNew = () => {
		if (editorUi.newOpen && !getSnapshot()) ensureScene();
		editorUi.toggleNew();
	};

	openShare = () => {
		editorUi.exportOpen = !editorUi.exportOpen;
	};

	openHelp = () => {
		editorUi.helpOpen = true;
	};

	rename = (event: Event) => {
		const doc = this.doc.current.doc;
		if (!doc) return;
		pageState.openRename(
			{ id: doc.id, name: doc.name },
			event.currentTarget as HTMLElement,
		);
	};

	doUndo = () => undo();
	doRedo = () => redo();
	cycleZoom = () => viewport.cycle();

	bloomStyle = (index: number) => {
		const count = EDITOR_TOOLS.length;
		const spread = (110 * Math.PI) / 180;
		const radius = Math.max(
			120,
			((count - 1) * (BOX + 4)) / spread,
		);
		const a = ((125 + (110 * index) / (count - 1)) * Math.PI) / 180;
		const x = Math.cos(a) * radius;
		const y = Math.sin(a) * radius;
		return htmlSafe(
			`--sub-bloom-x: ${x.toFixed(1)}px; --sub-bloom-y: ${y.toFixed(1)}px; --sub-bloom-i: ${count - 1 - index}`,
		);
	};

	measure = modifier((root: HTMLElement) => {
		editorUi.hydrate();
		if (import.meta.env.DEV)
			(window as unknown as Record<string, unknown>)[
				'__substrataUi'
			] = editorUi;
		const ro = new ResizeObserver(() => {
			this.width = root.clientWidth;
			this.height = root.clientHeight;
			this.placeInset(root);
		});
		ro.observe(root);
		let fitted = getZoom();
		const tray = new ResizeObserver(([entry]) => {
			const h = entry?.contentRect.height ?? 0;
			root.style.setProperty(
				'--sub-tray-h',
				`${h ? h + GAP : 0}px`,
			);
			if (!this.phone) return;
			requestAnimationFrame(() => {
				this.placeInset(root);
				if (Math.abs(getZoom() - fitted) < 1e-3)
					viewport.fit();
				fitted = getZoom();
			});
		});
		const rail = root.querySelector<HTMLElement>('.sub-ed-rail');
		if (rail) tray.observe(rail);
		const stop = rail ? this.shareRail(rail) : () => {};
		const hand = new MutationObserver(() => this.placeInset(root));
		hand.observe(root, { attributeFilter: ['data-hand'] });
		return () => {
			ro.disconnect();
			tray.disconnect();
			hand.disconnect();
			stop();
		};
	});

	shareRail = (rail: HTMLElement) => {
		let frame = 0;
		const content = new ResizeObserver(() => schedule());
		const watched = new Set<Element>();
		const lay = () => {
			frame = 0;
			const panels = [
				...rail.querySelectorAll<HTMLElement>(
					':scope > .sub-rail-panel',
				),
			];
			const now = new Set<Element>([rail]);
			for (const p of panels)
				for (const c of p.querySelectorAll(
					':scope > .sub-rail-body > *',
				))
					now.add(c);
			for (const el of watched)
				if (!now.has(el)) {
					content.unobserve(el);
					watched.delete(el);
				}
			for (const el of now)
				if (!watched.has(el)) {
					content.observe(el);
					watched.add(el);
				}
			const bodies = panels.map((p) =>
				p.querySelector<HTMLElement>(
					':scope > .sub-rail-body',
				),
			);
			const scrolls = bodies.map((b) => b?.scrollTop ?? 0);
			for (const p of panels)
				p.style.removeProperty('block-size');
			if (!this.phone) {
				const naturals = panels.map(
					(p) => p.offsetHeight,
				);
				const room =
					rail.clientHeight -
					GAP * Math.max(0, panels.length - 1);
				sharePanels(room, naturals).forEach((h, i) =>
					panels[i]!.style.setProperty(
						'block-size',
						`${h}px`,
					),
				);
			}
			bodies.forEach((b, i) => {
				if (b) b.scrollTop = scrolls[i]!;
			});
		};
		let held = false;
		const schedule = () => {
			if (!held) frame ||= requestAnimationFrame(lay);
		};
		const hold = () => (held = true);
		const release = () => {
			if (!held) return;
			held = false;
			schedule();
		};
		rail.addEventListener('pointerdown', hold, true);
		window.addEventListener('pointerup', release, true);
		window.addEventListener('pointercancel', release, true);
		const children = new MutationObserver(schedule);
		children.observe(rail, { childList: true, subtree: true });
		schedule();
		return () => {
			cancelAnimationFrame(frame);
			content.disconnect();
			children.disconnect();
			rail.removeEventListener('pointerdown', hold, true);
			window.removeEventListener('pointerup', release, true);
			window.removeEventListener(
				'pointercancel',
				release,
				true,
			);
		};
	};

	placeInset = (root: HTMLElement) => {
		const area = root.querySelector<HTMLElement>(
			'.sub-shell-canvas-area',
		);
		if (!area) return;
		const box = area.getBoundingClientRect();
		const inset = { top: PAD, right: PAD, bottom: PAD, left: PAD };
		const rect = (sel: string) =>
			root.querySelector(sel)?.getBoundingClientRect();
		const title = rect('.sub-ed-title');
		if (title) inset.top = title.bottom - box.top + PAD;
		const onLeft = (r: DOMRect) =>
			r.left + r.width / 2 < box.left + box.width / 2;
		const column = rect('.sub-ed-column');
		if (column && column.width) {
			if (onLeft(column))
				inset.left = column.right - box.left + PAD;
			else inset.right = box.right - column.left + PAD;
		}
		const row = rect('.sub-ed-row');
		if (row && row.height)
			inset.bottom = box.bottom - row.top + PAD;
		const bar = rect('.sub-ed-bar');
		if (bar && bar.width) {
			const edge = editorUi.settingsEdge;
			if (edge === 'bottom')
				inset.bottom = Math.max(
					inset.bottom,
					box.bottom - bar.top + PAD,
				);
			else if (edge === 'top')
				inset.top = Math.max(
					inset.top,
					bar.bottom - box.top + PAD,
				);
			else if (onLeft(bar))
				inset.left = Math.max(
					inset.left,
					bar.right - box.left + PAD,
				);
			else
				inset.right = Math.max(
					inset.right,
					box.right - bar.left + PAD,
				);
		}
		area.dataset['inset'] = [
			inset.top,
			inset.right,
			inset.bottom,
			inset.left,
		].join(',');
	};

	bloomClose = modifier((el: HTMLElement) => {
		const close = () => (editorUi.bloomOpen = false);
		const onDown = (e: PointerEvent) => {
			const target = e.target as Element;
			if (
				!el.contains(target) &&
				!target.closest('.sub-ed-tools')
			)
				close();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		window.addEventListener('pointerdown', onDown, true);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('keydown', onKey);
		};
	});

	toolKeys = modifier(() => {
		const onKey = (e: KeyboardEvent) => {
			if (
				e.defaultPrevented ||
				e.metaKey ||
				e.ctrlKey ||
				e.altKey ||
				isTextEntry(e.target) ||
				(e.target instanceof Element &&
					e.target.closest(
						'[role=menu], [role=dialog], [role=listbox]',
					))
			)
				return;
			const hit = toolForKey(e.key);
			if (!hit) return;
			e.preventDefault();
			setActiveSub(hit[0], hit[1]);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	<template>
		<div
			class="sub-ed {{this.layoutClass}}"
			style={{this.trayStyle}}
			{{this.measure}}
			{{this.toolKeys}}
			{{editorShortcuts}}
		>
			<div class="sub-shell-canvas-area">
				<FabricCanvas />
				<NewStart />
			</div>
			<StatusNote />
			<SecureContextNotice />

			<Cells class="sub-ed-help" @small={{true}}>
				<Cell
					@label="Help"
					@text="?"
					@onClick={{this.openHelp}}
				/>
			</Cells>

			<div
				class="sub-ed-title"
				role="group"
				aria-label="Document"
			>
				<button
					type="button"
					class="sub-ed-title-name"
					title="Rename"
					{{on "click" this.rename}}
				>{{this.title}}</button>
				<button
					type="button"
					class="sub-ed-title-zoom"
					aria-label="Cycle zoom"
					{{on "click" this.cycleZoom}}
				><CanonFigure
						@text={{this.zoomPercent}}
						@unit="%"
						@size={{13}}
						@colour="var(--canon-muted-foreground)"
					/></button>
			</div>

			{{#if this.phone}}
				<Cells
					class="sub-ed-phone-stack"
					@axis="row"
					@small={{true}}
				>
					<Cell
						@label="Menu"
						@icon="menu"
						@selected={{editorUi.pageOpen}}
						@onClick={{this.openMenu}}
					/>
					<Cell
						@label="New"
						@icon="plus"
						@selected={{editorUi.newOpen}}
						@onClick={{this.openNew}}
					/>
					<Cell
						@label="Share"
						@icon="share"
						@onClick={{this.openShare}}
					/>
				</Cells>
				<div class="sub-ed-row">
					<Cells @axis="row">
						<Cell
							@label={{this.activeToolDef.title}}
							@icon={{this.activeToolDef.icon}}
							@selected={{true}}
							@onClick={{this.toggleBloom}}
						/>
					</Cells>
					<Cells @axis="row">
						<Cell
							@label="Undo"
							@icon="undo-2"
							@disabled={{this.undoOff}}
							@onClick={{this.doUndo}}
						/>
						<Cell
							@label="Redo"
							@icon="redo-2"
							@disabled={{this.redoOff}}
							@onClick={{this.doRedo}}
						/>
					</Cells>
					<Cells @axis="row">
						{{#each PANEL_DEFS as |p|}}
							<Cell
								@label={{p.title}}
								@icon={{p.icon}}
								@text={{if
									p.icon
									""
									p.title
								}}
								@selected={{editorUi.isOpen
									p.id
								}}
								@onClick={{fn
									this.togglePanel
									p.id
								}}
							/>
						{{/each}}
					</Cells>
					<span class="sub-ed-row-fill"></span>
					<ColourKey @phone={{true}} />
				</div>
				{{#if editorUi.bloomOpen}}
					<button
						type="button"
						class="sub-ed-dim"
						aria-label="Close"
						{{on "click" this.toggleBloom}}
					></button>
					<div class="sub-ed-phone-tools">
						{{#each EDITOR_TOOLS as |t|}}
							<Cells @axis="row">
								<Cell
									@label={{t.title}}
									@icon={{t.icon}}
									@text={{t.title}}
									@selected={{this.isToolOn
										t.id
									}}
									@onClick={{fn
										this.pick
										t.id
									}}
								/>
							</Cells>
						{{/each}}
					</div>
				{{/if}}
			{{else}}
				<div class="sub-ed-column">
					<Cells class="sub-ed-stack">
						<Cell
							@label="Menu"
							@icon="menu"
							@selected={{editorUi.pageOpen}}
							@onClick={{this.openMenu}}
						/>
						<Cell
							@label="New"
							@icon="plus"
							@selected={{editorUi.newOpen}}
							@onClick={{this.openNew}}
						/>
						<Cell
							@label="Undo"
							@icon="undo-2"
							@disabled={{this.undoOff}}
							@onClick={{this.doUndo}}
						/>
						{{#unless this.compact}}
							<Cell
								@label="Redo"
								@icon="redo-2"
								@disabled={{this.redoOff}}
								@onClick={{this.doRedo}}
							/>
						{{/unless}}
						<Cell
							@label="Share"
							@icon="share"
							@selected={{editorUi.exportOpen}}
							@onClick={{this.openShare}}
						/>
					</Cells>
					<div
						class="sub-ed-omni
							{{if
								editorUi.toolsHidden
								'is-hidden'
							}}"
					>
						<Cells class="sub-ed-tools">
							{{#if this.compact}}
								<Cell
									@label={{this.activeToolDef.title}}
									@icon={{this.activeToolDef.icon}}
									@selected={{true}}
									aria-expanded={{if
										editorUi.bloomOpen
										"true"
										"false"
									}}
									@onClick={{this.toggleBloom}}
								/>
							{{else}}
								{{#each
									EDITOR_TOOLS
									as |t|
								}}
									<Cell
										@label={{t.title}}
										@icon={{t.icon}}
										@selected={{this.isToolOn
											t.id
										}}
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
							{{#each
								PANEL_DEFS
								as |p|
							}}
								<Cell
									@label={{p.title}}
									@icon={{p.icon}}
									@text={{if
										p.icon
										""
										p.title
									}}
									@selected={{editorUi.isOpen
										p.id
									}}
									@onClick={{fn
										this.togglePanel
										p.id
									}}
								/>
							{{/each}}
							<Cell
								@label="Assets"
								@icon="images"
								@selected={{editorUi.assetsOpen}}
								@onClick={{this.toggleAssets}}
							/>
						</Cells>
						{{#if
							(this.showBloom
								this.compact
							)
						}}
							<div
								class="sub-ed-bloom"
								{{this.bloomClose}}
							>
								{{#each
									EDITOR_TOOLS
									as |t i|
								}}
									<Cells
										class="sub-ed-bloom-cell"
										style={{this.bloomStyle
											i
										}}
									>
										<Cell
											@label={{t.title}}
											@icon={{t.icon}}
											@selected={{this.isToolOn
												t.id
											}}
											@onClick={{fn
												this.pick
												t.id
											}}
										/>
									</Cells>
								{{/each}}
							</div>
						{{/if}}
					</div>
					<Cells class="sub-ed-tab">
						<Cell
							@label={{if
								editorUi.toolsHidden
								"Show Tools"
								"Hide Tools"
							}}
							@icon={{if
								editorUi.toolsHidden
								"chevron-down"
								"chevron-up"
							}}
							@onClick={{editorUi.toggleTools}}
						/>
					</Cells>
					<span class="sub-ed-column-fill"></span>
					<ColourKey />
				</div>
			{{/if}}

			<div
				class="sub-ed-rail
					{{if this.phone 'is-tray'}}
					{{if this.trayEmpty 'is-empty'}}"
			>
				{{#each editorUi.panels as |p|}}
					{{#if (eq p "layers")}}
						<LayersPanel />
					{{else if (eq p "inspector")}}
						<InspectorPanel />
					{{else if (eq p "colour")}}
						<ColourTray />
					{{else}}
						<FxPanel
							@phone={{this.phone}}
						/>
					{{/if}}
				{{/each}}
				{{#if this.phone}}
					{{#if editorUi.assetsOpen}}
						<AssetsPanel />
					{{/if}}
				{{/if}}
			</div>
			{{#unless this.phone}}
				{{#if editorUi.assetsOpen}}
					<div class="sub-ed-assets">
						<AssetsPanel />
					</div>
				{{/if}}
			{{/unless}}

			<ToolBar
				@tool={{this.activeTool}}
				@phone={{this.phone}}
			/>

			<Overlays @phone={{this.phone}} />
			<Sheets @phone={{this.phone}} />
		</div>
	</template>

	get undoOff() {
		return !this.doc.current.undo;
	}

	get redoOff() {
		return !this.doc.current.redo;
	}

	showBloom = (compact: boolean) => compact && editorUi.bloomOpen;
}
