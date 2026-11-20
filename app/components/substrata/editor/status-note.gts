import Component from '@glimmer/component';
import {
	getToast,
	subscribeToast,
	type ToastId,
} from 'delphitools-v2/lib/substrata/toast';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const TEXT: Record<ToastId, string> = {
	'canvas-fit': 'Fit to view',
	saved: 'Saved',
	'storage-off': 'Storage off',
	'image-added': 'Image added',
	'zoom-100': 'Zoom 100%',
	copied: 'Copied',
	'paste-empty': 'Nothing to paste',
	exported: 'Exported',
	'wand-needs-layer': 'Select a layer first',
	'open-failed': "Couldn't open that file",
	'asset-failed': "Sorry, couldn't load that one.",
};

export default class StatusNote extends Component {
	note = new TrackedExternal(subscribeToast, getToast);

	willDestroy() {
		super.willDestroy();
		this.note.unsubscribe();
	}

	get notes() {
		const n = this.note.current;
		return n ? [{ seq: n.seq, text: TEXT[n.id] }] : [];
	}

	<template>
		<div class="sub-ed-note-slot" role="status" aria-live="polite">
			{{#each this.notes key="seq" as |n|}}
				<span class="sub-ed-note">{{n.text}}</span>
			{{/each}}
		</div>
	</template>
}
