import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { PanelHeader } from 'delphitools-v2/components/substrata/editor/cells';
import {
	blankPage,
	insertSize,
	type ErrataPage,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	deletePage,
	insertPageAt,
	movePage,
	rotateCurrent,
} from 'delphitools-v2/lib/errata/page-ops';
import {
	imagePage,
	pageKey,
	renderThumb,
} from 'delphitools-v2/lib/errata/source';
import {
	getPageIndex,
	setPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const painted = new WeakMap<HTMLImageElement, string>();

export function paintThumb(
	img: HTMLImageElement,
	page: ErrataPage,
	width?: number,
): void {
	const key = `${width}:${pageKey(page)}`;
	if (painted.get(img) === key) return;
	painted.set(img, key);
	void renderThumb(page, width).then(
		(url) => {
			if (painted.get(img) === key) img.src = url;
		},
		() => {
			if (painted.get(img) === key) painted.delete(img);
		},
	);
}

const thumb = modifier(
	(img: HTMLImageElement, [page, width]: [ErrataPage, number?]) =>
		paintThumb(img, page, width),
);

const Gap: TOC<{
	Args: {
		index: number;
		onBlank: (index: number) => void;
		onImage: (index: number) => void;
	};
}> = <template>
	<div class="err-page-gap" data-index={{@index}}>
		<button
			type="button"
			class="err-page-gap-btn"
			aria-label="Insert blank page"
			title="Insert blank page"
			{{on "click" (fn @onBlank @index)}}
		>
			<Icon @name="file-plus" />
		</button>
		<button
			type="button"
			class="err-page-gap-btn"
			aria-label="Insert image page"
			title="Insert image page"
			{{on "click" (fn @onImage @index)}}
		>
			<Icon @name="image-plus" />
		</button>
	</div>
</template>;

export default class PageRail extends Component<{
	Args: { onClose: () => void };
	Element: HTMLElement;
}> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	@tracked dragOverId: string | null = null;
	#dragId: string | null = null;
	#input: HTMLInputElement | null = null;
	#insertAt = 0;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get pages(): readonly ErrataPage[] {
		return this.doc.current?.pages ?? [];
	}

	get rows(): { page: ErrataPage; index: number; number: number }[] {
		return this.pages.map((page, index) => ({
			page,
			index,
			number: index + 1,
		}));
	}

	get currentId(): string | null {
		return this.pages[this.pageIndex.current]?.id ?? null;
	}

	select = (index: number) => setPageIndex(index);
	rotate = (id: string) => rotateCurrent(id, 1);
	remove = (id: string) => deletePage(id);

	insertBlank = (index: number) => {
		const { width, height } = insertSize(this.pages, index);
		insertPageAt(index, blankPage(width, height));
	};

	insertImage = (index: number) => {
		this.#insertAt = index;
		this.#input?.click();
	};

	registerInput = modifier((el: HTMLInputElement) => {
		this.#input = el;
		return () => {
			this.#input = null;
		};
	});

	onPickImage = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const page = await imagePage(file);
		insertPageAt(this.#insertAt, page);
	};

	dragStart = (id: string, event: DragEvent) => {
		this.#dragId = id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', id);
		}
	};

	dragOver = (id: string, event: DragEvent) => {
		if (!this.#dragId) return;
		event.preventDefault();
		this.dragOverId = id;
	};

	dragEnd = () => {
		this.#dragId = null;
		this.dragOverId = null;
	};

	drop = (id: string, event: DragEvent) => {
		event.preventDefault();
		if (this.#dragId) movePage(this.#dragId, id);
		this.dragEnd();
	};

	<template>
		<section class="err-pages" aria-label="Pages" ...attributes>
			<PanelHeader @title="Pages" @onClose={{@onClose}} />
			<input
				type="file"
				accept="image/*"
				class="dt-sr-only"
				aria-label="Add image page"
				{{this.registerInput}}
				{{on "change" this.onPickImage}}
			/>
			<div class="err-pages-list">
				{{#each this.rows as |row|}}
					<Gap
						@index={{row.index}}
						@onBlank={{this.insertBlank}}
						@onImage={{this.insertImage}}
					/>
					{{#let
						row.page row.index
						as |page index|
					}}
						<div
							class="err-page-cell
								{{if
									(eq
										page.id
										this.currentId
									)
									'is-current'
								}}
								{{if
									(eq
										page.id
										this.dragOverId
									)
									'is-drag-over'
								}}"
							draggable="true"
							{{on
								"dragstart"
								(fn
									this.dragStart
									page.id
								)
							}}
							{{on
								"dragover"
								(fn
									this.dragOver
									page.id
								)
							}}
							{{on
								"drop"
								(fn
									this.drop
									page.id
								)
							}}
							{{on
								"dragend"
								this.dragEnd
							}}
						>
							<button
								type="button"
								class="err-page-pick"
								aria-label="Page {{row.number}}"
								{{on
									"click"
									(fn
										this.select
										index
									)
								}}
							>
								<img
									alt=""
									class="err-page-thumb"
									{{thumb
										page
									}}
								/>
								<span
									class="err-page-num"
								>{{row.number}}</span>
							</button>
							{{#if
								(eq
									page.id
									this.currentId
								)
							}}
								<div
									class="err-page-actions"
								>
									<button
										type="button"
										class="err-page-action"
										aria-label="Rotate page"
										{{on
											"click"
											(fn
												this.rotate
												page.id
											)
										}}
									>
										<Icon
											@name="rotate-cw"
										/>
									</button>
									<button
										type="button"
										class="err-page-action"
										aria-label="Delete page"
										disabled={{eq
											this.pages.length
											1
										}}
										{{on
											"click"
											(fn
												this.remove
												page.id
											)
										}}
									>
										<Icon
											@name="trash-2"
										/>
									</button>
								</div>
							{{/if}}
						</div>
					{{/let}}
				{{/each}}
				<Gap
					@index={{this.pages.length}}
					@onBlank={{this.insertBlank}}
					@onImage={{this.insertImage}}
				/>
			</div>
		</section>
	</template>
}
