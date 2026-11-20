import Component from '@glimmer/component';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { findLayer } from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getActiveLayerId,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import DevelopView from './develop-view';

interface DevelopSignature {
	Args: { phone: boolean };
}

export default class Develop extends Component<DevelopSignature> {
	active = new TrackedExternal(subscribeSelection, getActiveLayerId);
	doc = new TrackedExternal(subscribe, getSnapshot);

	get layerId() {
		const id = this.active.current;
		const doc = this.doc.current;
		if (!editorUi.developOpen || !id || !doc) return null;
		return findLayer(doc.layers, id)?.kind === 'raster' ? id : null;
	}

	willDestroy() {
		super.willDestroy();
		this.active.unsubscribe();
		this.doc.unsubscribe();
	}

	<template>
		{{#if this.layerId}}
			<DevelopView @layerId={{this.layerId}} />
		{{/if}}
	</template>
}
