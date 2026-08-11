import { cached } from '@glimmer/tracking';
import { findLayer } from 'delphitools-v2/lib/substrata/layer-tree';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	getActiveLayerId,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * Doc + selection → the primary selected layer, as tracked state. Every module
 * panel that reflects "the layer you are working on" needs the same pair of
 * subscriptions and the same unsubscribe contract; this owns both so a
 * staleness or leak fix lands once.
 *
 * The caller owns the lifetime — call `teardown` from `willDestroy`, the same
 * rule TrackedExternal sets.
 */
export class ActiveLayer {
	#doc = new TrackedExternal(subscribe, getSnapshot);
	#active = new TrackedExternal(subscribeSelection, getActiveLayerId);

	/** The whole document, for panels that also need the artboard. */
	get doc() {
		return this.#doc.current;
	}

	@cached
	get layer(): Layer | null {
		const doc = this.#doc.current;
		const id = this.#active.current;
		return doc && id ? findLayer(doc.layers, id) : null;
	}

	teardown = () => {
		this.#doc.unsubscribe();
		this.#active.unsubscribe();
	};
}
