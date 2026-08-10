import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	subscribe,
	undo,
	redo,
	canUndo,
	canRedo,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	getToast,
	subscribeToast,
	type ToastId,
} from 'delphitools-v2/lib/substrata/toast';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * Top-bar status slot: shows the undo/redo buttons, but when a toast fires it
 * shows a transient status pill to their left, then hides it again. Reduced
 * motion respected via a scss media guard (no motion/react in this app).
 */

function toastIcon(id: ToastId): string {
	switch (id) {
		case 'canvas-fit':
			return 'maximize-2';
		case 'saved':
			return 'check';
		case 'storage-off':
			return 'trash-2';
		case 'image-added':
			return 'image-plus';
		case 'zoom-100':
			return 'search';
		case 'copied':
			return 'copy';
		case 'paste-empty':
			return 'clipboard-x';
		case 'exported':
			return 'download';
		case 'wand-needs-layer':
			return 'image-plus';
		case 'open-failed':
			return 'clipboard-x';
	}
}

function toastText(id: ToastId): string {
	switch (id) {
		case 'canvas-fit':
			return 'Fit to view';
		case 'saved':
			return 'Saved';
		case 'storage-off':
			return 'Storage off';
		case 'image-added':
			return 'Image added';
		case 'zoom-100':
			return 'Zoom 100%';
		case 'copied':
			return 'Copied';
		case 'paste-empty':
			return 'Nothing to paste';
		case 'exported':
			return 'Exported';
		case 'wand-needs-layer':
			return 'Select a layer first';
		case 'open-failed':
			return "Couldn't open that file";
	}
}

export default class ToastSlot extends Component {
	toastState = new TrackedExternal(subscribeToast, getToast);
	undoable = new TrackedExternal(subscribe, canUndo);
	redoable = new TrackedExternal(subscribe, canRedo);

	willDestroy() {
		super.willDestroy();
		this.toastState.unsubscribe();
		this.undoable.unsubscribe();
		this.redoable.unsubscribe();
	}

	// A single-item array keyed by `seq`: re-firing the same toast id bumps
	// `seq`, so `{{#each}}` tears down and recreates the pill (replaying the
	// scss entrance animation) exactly like the source's `key={toast-${seq}}`.
	get toastList() {
		const t = this.toastState.current;
		return t ? [t] : [];
	}

	undo = () => undo();
	redo = () => redo();

	<template>
		<div class="sub-toast-slot">
			{{#each this.toastList key="seq" as |t|}}
				<span class="sub-toast-pill">
					<Icon @name={{toastIcon t.id}} />
					{{toastText t.id}}
				</span>
			{{/each}}
			<button
				type="button"
				class="sub-toast-btn"
				disabled={{not this.undoable.current}}
				aria-label="Undo"
				title="Undo"
				{{on "click" this.undo}}
			>
				<Icon @name="undo-2" />
			</button>
			<button
				type="button"
				class="sub-toast-btn"
				disabled={{not this.redoable.current}}
				aria-label="Redo"
				title="Redo"
				{{on "click" this.redo}}
			>
				<Icon @name="redo-2" />
			</button>
		</div>
	</template>
}
