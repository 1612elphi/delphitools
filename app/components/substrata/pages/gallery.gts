import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonContextMenu from 'delphicanon/components/canon-context-menu';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonSwitch from 'delphicanon/components/canon-switch';
import type { CanonMenuItem } from 'delphicanon/components/canon-menu';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	Cell,
	PanelHeader,
} from 'delphitools-v2/components/substrata/editor/cells';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import {
	listTemplates,
	startBlank,
	openScene,
	openTemplate,
	templateUrl,
	type TemplateEntry,
} from 'delphitools-v2/lib/substrata/file-ops';
import {
	getPersistenceEnabled,
	setPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import {
	deleteProject,
	duplicateProject,
	listProjects,
	projectTitle,
	saveThumbnail,
	switchProject,
	type ProjectSummary,
} from 'delphitools-v2/lib/substrata/projects';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import { pageState } from './page-state';
import { renderThumbnail } from './thumbnail-art';
import './pages.css';

interface Tile {
	id: string;
	name: string;
	date: string;
	src: string | null;
	current: boolean;
}

const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const MENU: CanonMenuItem[] = [
	{ title: 'Duplicate' },
	{ title: 'Rename' },
	{ title: 'Delete', destructive: true },
];

export default class Gallery extends Component<{ Args: { phone: boolean } }> {
	doc = new TrackedExternal(subscribe, getSnapshot);
	persist = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);

	@tracked projects: (ProjectSummary & { src: string | null })[] = [];
	@tracked current: string | null = null;
	@tracked deleting: Tile | null = null;
	@tracked templates: TemplateEntry[] = [];
	#urls: string[] = [];

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.persist.unsubscribe();
		this.#revoke();
	}

	#revoke() {
		this.#urls.forEach((u) => URL.revokeObjectURL(u));
		this.#urls = [];
	}

	get tiles(): Tile[] {
		const open = this.doc.current;
		const listed = this.projects.map((p) => ({
			id: p.id,
			name: projectTitle(p.name),
			date: DAY.format(p.updatedAt),
			src: p.id === open?.id ? this.current : p.src,
			current: p.id === open?.id,
		}));
		if (open && !listed.some((t) => t.current))
			listed.unshift({
				id: open.id,
				name: projectTitle(open.name),
				date: DAY.format(open.updatedAt),
				src: this.current,
				current: true,
			});
		return listed;
	}

	#show(list: ProjectSummary[]) {
		this.#revoke();
		this.projects = list.map((p) => {
			const src = p.thumbnail
				? URL.createObjectURL(p.thumbnail)
				: null;
			if (src) this.#urls.push(src);
			return { ...p, src };
		});
	}

	load = modifier(() => {
		let gone = false;
		const frame = requestAnimationFrame(() => {
			void (async () => {
				const canvas = renderThumbnail(480);
				const open = getSnapshot();
				if (canvas && open) {
					this.current = canvas.toDataURL();
					const blob =
						await new Promise<Blob | null>(
							(r) => canvas.toBlob(r),
						);
					if (blob)
						await saveThumbnail(
							open.id,
							blob,
						);
				}
				const list = await listProjects();
				if (!gone) this.#show(list);
			})();
		});
		return () => {
			gone = true;
			cancelAnimationFrame(frame);
		};
	});

	reload = async () => {
		const list = await listProjects();
		if (!this.isDestroyed) this.#show(list);
	};

	close = () => {
		editorUi.galleryOpen = false;
		if (!getSnapshot()) editorUi.newOpen = true;
	};

	get templateMode() {
		return editorUi.galleryMode === 'templates';
	}

	get title() {
		return this.templateMode ? 'Templates' : 'Projects';
	}

	loadTemplates = modifier(() => {
		void listTemplates().then((list) => {
			if (!this.isDestroyed) this.templates = list;
		});
	});

	sizeOf = (t: TemplateEntry) => `${t.width} × ${t.height}`;

	thumbOf = (t: TemplateEntry) => (t.thumb ? templateUrl(t.thumb) : null);

	useTemplate = async (t: TemplateEntry) => {
		if (!(await openTemplate(t))) return;
		viewport.fit();
		this.close();
	};

	openFile = () => void openScene();

	newDocument = (event: Event) => {
		pageState.anchor = event.currentTarget as HTMLElement;
		startBlank();
	};

	open = async (tile: Tile) => {
		if (!(await switchProject(tile.id))) {
			toast('open-failed');
			return;
		}
		viewport.fit();
		this.close();
	};

	act = (tile: Tile, item: CanonMenuItem, anchor?: HTMLElement) => {
		if (item.title === 'Duplicate')
			void duplicateProject(tile.id).then(this.reload);
		else if (item.title === 'Rename')
			pageState.openRename(
				{
					id: tile.id,
					name: tile.name,
					after: () => void this.reload(),
				},
				anchor ?? null,
			);
		else this.deleting = tile;
	};

	menuFor = (tile: Tile) => (item: CanonMenuItem) =>
		this.act(tile, item, this.tileEl(tile.id));

	tileEl = (id: string) =>
		document.querySelector<HTMLElement>(
			`.sub-gal-tile[data-project="${CSS.escape(id)}"]`,
		) ?? undefined;

	confirmDelete = async () => {
		const tile = this.deleting;
		this.deleting = null;
		if (!tile) return;
		await deleteProject(tile.id);
		await this.reload();
	};

	cancelDelete = () => {
		this.deleting = null;
	};

	setPersist = (on: boolean) => {
		setPersistenceEnabled(on);
		toast(on ? 'saved' : 'storage-off');
		if (on) void this.reload();
	};

	<template>
		{{#if editorUi.galleryOpen}}
			<section
				class="sub-pg-drawer {{if @phone 'is-phone'}}"
				aria-label={{this.title}}
				{{this.load}}
			>
				<PanelHeader
					@title={{this.title}}
					@onClose={{this.close}}
				>
					<Cell
						@label="Open…"
						@icon="folder-open"
						@onClick={{this.openFile}}
					/>
				</PanelHeader>
				{{#if this.templateMode}}
					<div
						class="sub-gal-scroller"
						{{this.loadTemplates}}
					>
						{{#each this.templates as |t|}}
							<button
								type="button"
								class="sub-gal-tile is-template"
								aria-label="{{t.name}}, {{this.sizeOf
									t
								}}"
								{{on
									"click"
									(fn
										this.useTemplate
										t
									)
								}}
							>
								<span
									class="sub-gal-picture"
								>
									{{#let
										(this.thumbOf
											t
										)
										as |src|
									}}
										{{#if
											src
										}}
											<img
												src={{src}}
												alt=""
											/>
										{{else}}
											<IconSvg
												@name="layout-template"
											/>
										{{/if}}
									{{/let}}
								</span>
								<span
									class="sub-gal-name"
								>{{t.name}}</span>
								<span
									class="sub-gal-date"
								>{{this.sizeOf
										t
									}}</span>
							</button>
						{{/each}}
					</div>
				{{else}}
					<div class="sub-gal-scroller">
						<button
							type="button"
							class="sub-gal-tile is-new"
							{{on
								"click"
								this.newDocument
							}}
						>
							<span
								class="sub-gal-picture"
							><IconSvg
									@name="plus"
								/></span>
							<span
								class="sub-gal-name"
							>New</span>
						</button>
						{{#each
							this.tiles key="id"
							as |tile|
						}}
							<CanonContextMenu
								class="sub-gal-menu"
								@items={{MENU}}
								@onSelect={{this.menuFor
									tile
								}}
							>
								<button
									type="button"
									class="sub-gal-tile
										{{if
											tile.current
											'is-current'
										}}"
									data-project={{tile.id}}
									aria-pressed={{if
										tile.current
										"true"
										"false"
									}}
									aria-label="{{tile.name}}, {{tile.date}}"
									{{on
										"click"
										(fn
											this.open
											tile
										)
									}}
								>
									<span
										class="sub-gal-picture"
									>
										{{#if
											tile.src
										}}
											<img
												src={{tile.src}}
												alt=""
											/>
										{{else}}
											<IconSvg
												@name="image"
											/>
										{{/if}}
									</span>
									<span
										class="sub-gal-name"
									>{{tile.name}}</span>
									<span
										class="sub-gal-date"
									>{{tile.date}}</span>
								</button>
							</CanonContextMenu>
						{{/each}}
						{{#unless this.persist.current}}
							<label
								class="sub-gal-tile is-persist"
							>
								<span
									class="sub-gal-picture"
								><IconSvg
										@name="hard-drive"
									/></span>
								<span
									class="sub-gal-name"
								>Save in this
									browser</span>
								<CanonSwitch
									@on={{false}}
									@onChange={{this.setPersist}}
								/>
							</label>
						{{/unless}}
					</div>
				{{/if}}
			</section>
		{{/if}}
		<CanonDialog
			@open={{if this.deleting true false}}
			@alert={{true}}
			@title={{if this.deleting this.deleting.name ""}}
			@onClose={{this.cancelDelete}}
		>
			<:footer>
				<CanonButton
					@kind="cell"
					@text="Cancel"
					@onClick={{this.cancelDelete}}
				/>
				<CanonButton
					@kind="primary"
					class="sub-pg-destructive"
					@text="Delete"
					@icon={{component
						IconSvg
						name="trash-2"
					}}
					@onClick={{this.confirmDelete}}
				/>
			</:footer>
		</CanonDialog>
	</template>
}
