import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import ToolPanel from 'delphitools-v2/components/errata/tool-panel';
import { paintThumb } from 'delphitools-v2/components/errata/page-rail';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import type { ErrataPage } from 'delphitools-v2/lib/errata/doc-model';
import {
	deletePages,
	duplicatePages,
	insertBlank,
	movePages,
	rotatePages,
	updatePages,
} from 'delphitools-v2/lib/errata/page-ops';
import { setPageIndex, store } from 'delphitools-v2/lib/errata/store';
import { closeMode, onMode } from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './organise.css';

const THUMB_PX = 280;

export default class Organise extends Component {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	@tracked selected: ReadonlySet<string> = new Set();
	@tracked dropAt: number | null = null;
	#anchor: string | null = null;
	#dragging = false;
	#off = onMode('organise', {
		key: (e) => {
			const mod = e.metaKey || e.ctrlKey;
			if (
				!mod &&
				(e.key === 'Delete' || e.key === 'Backspace')
			)
				this.remove();
			else if (mod && e.key.toLowerCase() === 'a')
				this.selectAll();
			else return false;
			return true;
		},
	});
	#visible = new WeakSet<Element>();
	#pageOf = new WeakMap<Element, ErrataPage>();
	#seen = new IntersectionObserver((entries) => {
		for (const e of entries) {
			if (!e.isIntersecting) {
				this.#visible.delete(e.target);
				continue;
			}
			this.#visible.add(e.target);
			const page = this.#pageOf.get(e.target);
			if (page)
				paintThumb(
					e.target as HTMLImageElement,
					page,
					THUMB_PX,
				);
		}
	});

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.#off();
		this.#seen.disconnect();
		const first = this.pages.findIndex((p) =>
			this.selected.has(p.id),
		);
		if (first !== -1) setPageIndex(first);
	}

	get pages(): readonly ErrataPage[] {
		return this.doc.current?.pages ?? [];
	}

	get rows() {
		const last = this.pages.length - 1;
		return this.pages.map((page, index) => ({
			page,
			index,
			number: index + 1,
			selected: this.selected.has(page.id),
			dropBefore: this.dropAt === index,
			dropAfter: index === last && this.dropAt === index + 1,
		}));
	}

	get count() {
		return this.pages.filter((p) => this.selected.has(p.id)).length;
	}

	get none() {
		return this.count === 0;
	}

	get cannotDelete() {
		return this.none || this.count === this.pages.length;
	}

	get actions() {
		const none = this.none;
		return [
			{
				label: 'Rotate left',
				icon: 'rotate-ccw',
				run: () => this.rotate(-1),
				disabled: none,
			},
			{
				label: 'Rotate right',
				icon: 'rotate-cw',
				run: () => this.rotate(1),
				disabled: none,
			},
			{
				label: 'Duplicate',
				icon: 'copy',
				run: this.duplicate,
				disabled: none,
			},
			{
				label: 'Insert blank page',
				icon: 'file-plus',
				run: this.insert,
				disabled: false,
			},
			{
				label: 'Delete',
				icon: 'trash-2',
				run: this.remove,
				disabled: this.cannotDelete,
			},
		];
	}

	select = (index: number, event: MouseEvent) => {
		const id = this.pages[index]!.id;
		const anchor = this.pages.findIndex(
			(p) => p.id === this.#anchor,
		);
		if (event.shiftKey && anchor !== -1) {
			const [a, b] = [anchor, index].sort((x, y) => x - y);
			this.selected = new Set(
				this.pages.slice(a, b! + 1).map((p) => p.id),
			);
			return;
		}
		this.#anchor = id;
		if (event.metaKey || event.ctrlKey) {
			const next = new Set(this.selected);
			if (!next.delete(id)) next.add(id);
			this.selected = next;
		} else this.selected = new Set([id]);
	};

	selectAll = () => {
		this.selected = new Set(this.pages.map((p) => p.id));
	};

	open = (index: number) => {
		this.selected = new Set([this.pages[index]!.id]);
		closeMode();
	};

	lazyThumb = modifier((img: HTMLImageElement, [page]: [ErrataPage]) => {
		this.#pageOf.set(img, page);
		if (this.#visible.has(img)) paintThumb(img, page, THUMB_PX);
		else this.#seen.observe(img);
	});

	rotate = (turns: 1 | -1) =>
		updatePages((p) => rotatePages(p, this.selected, turns));

	remove = () => {
		if (this.cannotDelete) return;
		updatePages((p) => deletePages(p, this.selected));
		this.selected = new Set();
	};

	#selectAdded(before: readonly ErrataPage[]) {
		const old = new Set(before.map((p) => p.id));
		this.selected = new Set(
			this.pages
				.filter((p) => !old.has(p.id))
				.map((p) => p.id),
		);
	}

	duplicate = () => {
		const before = this.pages;
		updatePages((p) => duplicatePages(p, this.selected));
		this.#selectAdded(before);
	};

	insert = () => {
		const before = this.pages;
		updatePages((p) => insertBlank(p, this.selected));
		this.#selectAdded(before);
	};

	dragStart = (index: number, event: DragEvent) => {
		const id = this.pages[index]!.id;
		if (!this.selected.has(id)) {
			this.selected = new Set([id]);
			this.#anchor = id;
		}
		this.#dragging = true;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', id);
		}
	};

	dragOver = (index: number, event: DragEvent) => {
		if (!this.#dragging) return;
		event.preventDefault();
		const r = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const at =
			event.clientX < r.left + r.width / 2
				? index
				: index + 1;
		if (at !== this.dropAt) this.dropAt = at;
	};

	drop = (event: DragEvent) => {
		event.preventDefault();
		const to = this.dropAt;
		if (this.#dragging && to !== null)
			updatePages((p) => movePages(p, this.selected, to));
		this.dragEnd();
	};

	dragEnd = () => {
		this.#dragging = false;
		this.dropAt = null;
	};

	inset = modifier((grid: HTMLElement) => {
		const area = grid
			.closest('.sub-ed')
			?.querySelector<HTMLElement>(
				':scope > .sub-shell-canvas-area',
			);
		if (!area) return;
		const place = () => {
			const sides = (area.dataset['inset'] ?? '').split(',');
			['top', 'right', 'bottom', 'left'].forEach((side, i) =>
				grid.style.setProperty(
					`--err-org-${side}`,
					`${sides[i] || 16}px`,
				),
			);
		};
		place();
		area.addEventListener('err-inset', place);
		return () => area.removeEventListener('err-inset', place);
	});

	deselect = modifier((grid: HTMLElement) => {
		const onClick = (e: MouseEvent) => {
			if (e.target === grid) this.selected = new Set();
		};
		grid.addEventListener('click', onClick);
		return () => grid.removeEventListener('click', onClick);
	});

	<template>
		<div class="err-organise">
			<div
				class="err-organise-grid"
				{{this.inset}}
				{{this.deselect}}
			>
				{{#each this.rows key="page.id" as |row|}}
					<button
						type="button"
						class="err-organise-cell
							{{if
								row.selected
								'is-selected'
							}}
							{{if
								row.dropBefore
								'is-drop-before'
							}}
							{{if
								row.dropAfter
								'is-drop-after'
							}}"
						draggable="true"
						aria-label="Page {{row.number}}"
						aria-pressed={{if
							row.selected
							"true"
							"false"
						}}
						{{on
							"click"
							(fn
								this.select
								row.index
							)
						}}
						{{on
							"dblclick"
							(fn this.open row.index)
						}}
						{{on
							"dragstart"
							(fn
								this.dragStart
								row.index
							)
						}}
						{{on
							"dragover"
							(fn
								this.dragOver
								row.index
							)
						}}
						{{on "drop" this.drop}}
						{{on "dragend" this.dragEnd}}
					>
						<span
							class="err-organise-frame"
						>
							<img
								alt=""
								class="err-page-thumb"
								{{this.lazyThumb
									row.page
								}}
							/>
						</span>
						<span
							class="err-page-num"
						>{{row.number}}</span>
					</button>
				{{/each}}
			</div>

			<ToolPanel
				@open={{true}}
				@mode="organise"
				@icon="layout-grid"
				@label="Organise"
				@onApply={{closeMode}}
				@applyLabel="Done"
			>
				<:status>
					<span
						class="err-mode-tag"
					>{{this.count}}
						selected</span>
				</:status>
				<:actions>
					{{#each
						this.actions key="label"
						as |a|
					}}
						<Cell
							@label={{a.label}}
							@icon={{a.icon}}
							@disabled={{a.disabled}}
							@onClick={{a.run}}
						/>
					{{/each}}
				</:actions>
			</ToolPanel>
		</div>
	</template>
}
