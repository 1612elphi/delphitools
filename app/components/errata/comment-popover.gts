import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { attach } from 'delphicanon/lib/popover';
import { modifier } from 'ember-modifier';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import type { CommentObject } from 'delphitools-v2/lib/errata/doc-model';
import {
	findObject,
	patchObjects,
	removeObjects,
	store,
} from 'delphitools-v2/lib/errata/store';
import {
	objectRect,
	openNote,
	pushDismiss,
} from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './comment-popover.css';

interface Open {
	pageId: string;
	note: CommentObject;
}

export default class CommentPopover extends Component {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	openId = new TrackedExternal(openNote.subscribe, openNote.get);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.openId.unsubscribe();
	}

	get open(): Open | null {
		const hit = findObject(this.doc.current, this.openId.current);
		return hit?.object.kind === 'comment'
			? { pageId: hit.page.id, note: hit.object }
			: null;
	}

	get date(): string {
		const iso = this.open?.note.date;
		return iso
			? new Date(iso).toLocaleString(undefined, {
					dateStyle: 'medium',
					timeStyle: 'short',
				})
			: '';
	}

	#text: HTMLTextAreaElement | null = null;

	commit = () => {
		const open = this.open;
		const text = this.#text?.value;
		if (!open || text === undefined || text === open.note.text)
			return;
		patchObjects(
			open.pageId,
			new Map([
				[
					open.note.id,
					{
						text,
						date: new Date().toISOString(),
					},
				],
			]),
		);
	};

	close = () => {
		this.commit();
		openNote.set(null);
	};

	remove = () => {
		const open = this.open;
		openNote.set(null);
		if (open) removeObjects(open.pageId, [open.note.id]);
	};

	place = modifier((el: HTMLElement, [id]: [string]) => {
		const anchor = el.previousElementSibling as HTMLElement;
		let frame = 0;
		const follow = () => {
			const r = objectRect(id);
			if (r) {
				anchor.style.left = `${r.x}px`;
				anchor.style.top = `${r.y}px`;
				anchor.style.width = `${r.w}px`;
				anchor.style.height = `${r.h}px`;
			}
			frame = requestAnimationFrame(follow);
		};
		follow();
		const detach = attach(el, anchor, {
			placement: 'right-start',
			gap: '6px',
		});
		el.showPopover();
		const onDown = (e: PointerEvent) => {
			if (!el.contains(e.target as Node)) this.close();
		};
		window.addEventListener('pointerdown', onDown, true);
		const undismiss = pushDismiss(this.close);
		return () => {
			cancelAnimationFrame(frame);
			detach();
			if (el.isConnected) el.hidePopover();
			window.removeEventListener('pointerdown', onDown, true);
			undismiss();
		};
	});

	fill = modifier(
		(el: HTMLTextAreaElement, [id, text]: [string, string]) => {
			this.#text = el;
			if (el.dataset.note === id) return;
			el.dataset.note = id;
			el.value = text;
			if (text === '') setTimeout(() => el.focus());
		},
	);

	<template>
		{{#if this.open}}
			<div class="err-note-anchor"></div>
			<div
				class="err-note"
				popover="manual"
				role="dialog"
				aria-label="Comment"
				{{this.place this.open.note.id}}
			>
				<textarea
					class="err-note-text"
					rows="4"
					aria-label="Note"
					{{on "blur" this.commit}}
					{{this.fill
						this.open.note.id
						this.open.note.text
					}}
				></textarea>
				<div class="err-note-meta">
					<span
						class="err-note-author"
					>{{this.open.note.author}}</span>
					<time
						datetime={{this.open.note.date}}
					>{{this.date}}</time>
					<Cell
						class="err-note-delete"
						@label="Delete"
						@icon="trash-2"
						@onClick={{this.remove}}
					/>
				</div>
			</div>
		{{/if}}
	</template>
}
