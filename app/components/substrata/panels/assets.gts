import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonButton from 'delphicanon/components/canon-button';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { IconSvg } from 'delphitools-v2/components/icon';
import { RailPanel } from 'delphitools-v2/components/substrata/editor/cells';
import {
	allowAssets,
	assetsAllowed,
	AssetError,
	ASSET_DRAG,
	placeAsset,
	searchAssets,
	setDraggedAsset,
	type Asset,
	type AssetKind,
} from 'delphitools-v2/lib/substrata/assets';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import './assets.css';

const KINDS: AssetKind[] = ['photos', 'icons'];
const TABS = ['Photos', 'Icons'];

const NOTE = 'Photos from Flickr and Wikimedia Commons. Icons from Iconify.';

const LIMITED = 'Search limit reached. Try again in a minute.';

const OFFLINE = "Couldn't reach the catalogue.";

const close = () => {
	editorUi.assetsOpen = false;
};

const swap = modifier((img: HTMLImageElement, [full]: [string]) => {
	const fail = () => {
		if (img.src !== full) img.src = full;
		else
			img.closest<HTMLElement>('.sub-asset')?.toggleAttribute(
				'hidden',
				true,
			);
	};
	img.addEventListener('error', fail);
	return () => img.removeEventListener('error', fail);
});

export default class AssetsPanel extends Component<{
	Args: { phone?: boolean };
}> {
	@tracked allowed = assetsAllowed();
	@tracked kind: AssetKind = 'photos';
	@tracked query = '';
	@tracked items: Asset[] = [];
	@tracked page = 0;
	@tracked more = false;
	@tracked status: 'idle' | 'loading' | 'limited' | 'offline' = 'idle';
	@tracked searched = false;
	@tracked placing: string | null = null;
	#token = 0;

	note = NOTE;
	limited = LIMITED;
	offline = OFFLINE;
	tabs = TABS;

	get tab() {
		return KINDS.indexOf(this.kind);
	}

	get empty() {
		return (
			this.searched &&
			this.status === 'idle' &&
			this.items.length === 0
		);
	}

	get loadingFirst() {
		return this.status === 'loading' && this.items.length === 0;
	}

	turnOn = () => {
		allowAssets();
		this.allowed = true;
	};

	pickTab = (index: number) => {
		this.kind = KINDS[index] ?? 'photos';
		if (this.query.trim()) void this.load(0);
	};

	typed = (e: Event) => {
		this.query = (e.target as HTMLInputElement).value;
	};

	key = (e: KeyboardEvent) => {
		if (e.key !== 'Enter' || !this.query.trim()) return;
		e.preventDefault();
		void this.load(0);
	};

	loadMore = () => void this.load(this.page + 1);

	async load(page: number) {
		const token = ++this.#token;
		if (page === 0) this.items = [];
		this.status = 'loading';
		try {
			const result = await searchAssets(
				this.kind,
				this.query,
				page,
			);
			if (token !== this.#token || this.isDestroyed) return;
			this.items =
				page === 0
					? result.items
					: [...this.items, ...result.items];
			this.page = page;
			this.more = result.more;
			this.status = 'idle';
		} catch (e) {
			if (token !== this.#token || this.isDestroyed) return;
			this.more = false;
			this.status =
				e instanceof AssetError && e.kind === 'limited'
					? 'limited'
					: 'offline';
		}
		this.searched = true;
	}

	place = async (asset: Asset) => {
		if (this.placing) return;
		this.placing = asset.id;
		try {
			await placeAsset(asset);
		} finally {
			if (!this.isDestroyed) this.placing = null;
		}
	};

	dragStart = (asset: Asset, e: DragEvent) => {
		setDraggedAsset(asset);
		e.dataTransfer?.setData(ASSET_DRAG, asset.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
	};

	dragEnd = () => setDraggedAsset(null);

	thumbOf = (asset: Asset) =>
		asset.source.provider === 'iconify'
			? `${asset.thumb}?height=96&color=%23888888`
			: asset.thumb;

	<template>
		<RailPanel
			@id="assets"
			@title="Assets"
			@onClose={{close}}
			class="sub-assets-panel"
		>
			{{#if this.allowed}}
				<CanonSegmented
					@items={{this.tabs}}
					@selected={{this.tab}}
					@onChange={{this.pickTab}}
				/>
				<input
					type="search"
					class="canon-text-cell sub-assets-search"
					placeholder="Search"
					aria-label="Search assets"
					value={{this.query}}
					{{on "input" this.typed}}
					{{on "keydown" this.key}}
				/>
				{{#if (eq this.status "limited")}}
					<CanonEmptyRow @text={{this.limited}} />
				{{else if (eq this.status "offline")}}
					<CanonEmptyRow @text={{this.offline}} />
				{{else if this.empty}}
					<CanonEmptyRow @text="No results" />
				{{/if}}
				{{#if this.loadingFirst}}
					<div class="sub-assets-loading">
						<CanonLoader />
					</div>
				{{/if}}
				<div class="sub-assets-grid is-{{this.kind}}">
					{{#each this.items key="id" as |asset|}}
						<button
							type="button"
							class="sub-asset
								{{if
									(eq
										this.placing
										asset.id
									)
									'is-placing'
								}}"
							title="{{asset.source.title}}, {{asset.source.creator}}, {{asset.source.licence}}"
							aria-label="{{asset.source.title}}, {{asset.source.licence}}"
							draggable="true"
							{{on
								"dragstart"
								(fn
									this.dragStart
									asset
								)
							}}
							{{on
								"dragend"
								this.dragEnd
							}}
							{{on
								"click"
								(fn
									this.place
									asset
								)
							}}
						>
							<img
								src={{this.thumbOf
									asset
								}}
								alt=""
								loading="lazy"
								{{swap
									asset.full
								}}
							/>
							<span
								class="sub-asset-licence"
							>{{asset.source.licence}}</span>
						</button>
					{{/each}}
				</div>
				{{#if this.more}}
					<CanonButton
						class="sub-assets-more"
						@kind="cell"
						@text="Load more"
						@disabled={{eq
							this.status
							"loading"
						}}
						@onClick={{this.loadMore}}
					/>
				{{/if}}
			{{else}}
				<p class="sub-assets-note">{{this.note}}</p>
				<CanonButton
					class="sub-assets-on"
					@kind="cell"
					@text="Turn on"
					@icon={{component
						IconSvg
						name="images"
					}}
					@onClick={{this.turnOn}}
				/>
			{{/if}}
		</RailPanel>
	</template>
}
