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
import { pushDismiss } from 'delphitools-v2/lib/errata/ui';
import { currentLayout } from 'delphitools-v2/lib/errata/write/editor';
import {
	currentId,
	deleteDoc,
	duplicateDoc,
	flush,
	listDocs,
	persist,
	saveOpen,
	saveThumbnail,
	type StoredDoc,
} from 'delphitools-v2/lib/errata/write/library';
import { blockLength } from 'delphitools-v2/lib/errata/write/model';
import { paintPage } from 'delphitools-v2/lib/errata/write/paint';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import 'delphitools-v2/components/substrata/pages/pages.css';

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
	{ title: 'Delete', destructive: true },
];
const THUMB = 264;

function firstPage(): HTMLCanvasElement | null {
	const s = writeStore.get();
	const page = s && currentLayout(s.doc)?.pages[0];
	if (!s || !page) return null;
	const k = THUMB / page.width;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(page.width * k);
	canvas.height = Math.round(page.height * k);
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.setTransform(k, 0, 0, k, 0, 0);
	paintPage(ctx, page, {
		scale: k,
		invisibles: false,
		ink: '#000',
		paraEnd: (i) => blockLength(s.doc.blocks[i]),
		images: s.doc.images,
	});
	return canvas;
}

interface Signature {
	Args: {
		phone: boolean;
		onNew: () => void;
		onOpen: (id: string) => Promise<void>;
		onOpenFile: () => void;
		onClose: () => void;
	};
}

export default class Library extends Component<Signature> {
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);
	persist = new TrackedExternal(persist.subscribe, persist.get);

	@tracked docs: (StoredDoc & { src: string | null })[] = [];
	@tracked current: string | null = null;
	@tracked deleting: Tile | null = null;
	#urls: string[] = [];

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
		this.persist.unsubscribe();
		this.#revoke();
	}

	#revoke() {
		this.#urls.forEach((u) => URL.revokeObjectURL(u));
		this.#urls = [];
	}

	get tiles(): Tile[] {
		const open = this.state.current && currentId();
		const listed = this.docs.map((d) => ({
			id: d.id,
			name: d.name,
			date: DAY.format(d.updatedAt),
			src: d.id === open ? this.current : d.src,
			current: d.id === open,
		}));
		if (open && !listed.some((t) => t.current))
			listed.unshift({
				id: open,
				name: this.state.current!.doc.name,
				date: DAY.format(Date.now()),
				src: this.current,
				current: true,
			});
		return listed;
	}

	#show(list: StoredDoc[]) {
		this.#revoke();
		this.docs = list.map((d) => {
			const src = d.thumbnail
				? URL.createObjectURL(d.thumbnail)
				: null;
			if (src) this.#urls.push(src);
			return { ...d, src };
		});
	}

	reload = async () => {
		const list = await listDocs();
		if (!this.isDestroyed) this.#show(list);
	};

	load = modifier(() => {
		const undismiss = pushDismiss(this.args.onClose);
		void (async () => {
			await flush();
			const canvas = firstPage();
			const id = currentId();
			if (canvas && id) {
				this.current = canvas.toDataURL();
				const blob = await new Promise<Blob | null>(
					(r) => canvas.toBlob(r),
				);
				if (blob) await saveThumbnail(id, blob);
			}
			await this.reload();
		})();
		return undismiss;
	});

	openFile = () => {
		this.args.onClose();
		this.args.onOpenFile();
	};

	newDocument = () => {
		this.args.onNew();
		this.args.onClose();
	};

	open = async (tile: Tile) => {
		await this.args.onOpen(tile.id);
		this.args.onClose();
	};

	menuFor = (tile: Tile) => (item: CanonMenuItem) => {
		if (item.title === 'Duplicate')
			void duplicateDoc(tile.id).then(this.reload);
		else this.deleting = tile;
	};

	confirmDelete = async () => {
		const tile = this.deleting;
		this.deleting = null;
		if (!tile) return;
		await deleteDoc(tile.id);
		await this.reload();
	};

	cancelDelete = () => {
		this.deleting = null;
	};

	setPersist = (on: boolean) => {
		persist.set(on);
		if (on) void saveOpen().then(this.reload);
	};

	<template>
		<section
			class="sub-pg-drawer err-library
				{{if @phone 'is-phone'}}"
			aria-label="Documents"
			data-library
			{{this.load}}
		>
			<PanelHeader @title="Documents" @onClose={{@onClose}}>
				<Cell
					@label="Open…"
					@icon="folder-open"
					@onClick={{this.openFile}}
				/>
			</PanelHeader>
			<div class="sub-gal-scroller">
				<button
					type="button"
					class="sub-gal-tile is-new"
					data-library-new
					{{on "click" this.newDocument}}
				>
					<span class="sub-gal-picture"><IconSvg
							@name="plus"
						/></span>
					<span class="sub-gal-name">New</span>
				</button>
				{{#each this.tiles key="id" as |tile|}}
					<CanonContextMenu
						class="sub-gal-menu"
						@items={{MENU}}
						@onSelect={{this.menuFor tile}}
					>
						<button
							type="button"
							class="sub-gal-tile
								{{if
									tile.current
									'is-current'
								}}"
							data-library-doc={{tile.id}}
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
								{{#if tile.src}}
									<img
										src={{tile.src}}
										alt=""
									/>
								{{else}}
									<IconSvg
										@name="file-text"
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
						data-library-persist
					>
						<span
							class="sub-gal-picture"
						><IconSvg
								@name="hard-drive"
							/></span>
						<span class="sub-gal-name">Save
							in this browser</span>
						<CanonSwitch
							@on={{false}}
							@onChange={{this.setPersist}}
						/>
					</label>
				{{/unless}}
			</div>
		</section>
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
