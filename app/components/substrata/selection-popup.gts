import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	getActiveLayerId,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import {
	clearPixelSelection,
	getPixelSelection,
	subscribePixelSelection,
} from 'delphitools-v2/lib/substrata/pixel-selection';
import {
	canOperateOnActive,
	cutSelection,
	extractSelection,
	growSelection,
	invertSelection,
	shrinkSelection,
} from 'delphitools-v2/lib/substrata/select-ops';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

let anchor = { x: 0, y: 0, epoch: -1 };
const anchorListeners = new Set<() => void>();

export function reportSelectionAnchor(
	x: number,
	y: number,
	epoch: number,
): void {
	if (
		epoch === anchor.epoch &&
		Math.abs(x - anchor.x) < 0.5 &&
		Math.abs(y - anchor.y) < 0.5
	)
		return;
	anchor = { x, y, epoch };
	for (const l of anchorListeners) l();
}

function subscribeAnchor(l: () => void): () => void {
	anchorListeners.add(l);
	return () => {
		anchorListeners.delete(l);
	};
}

const getAnchor = () => anchor;

export default class SelectionPopup extends Component {
	sel = new TrackedExternal(subscribePixelSelection, getPixelSelection);
	doc = new TrackedExternal(subscribe, getSnapshot);
	anchor = new TrackedExternal(subscribeAnchor, getAnchor);
	active = new TrackedExternal(subscribeSelection, getActiveLayerId);

	willDestroy() {
		super.willDestroy();
		this.sel.unsubscribe();
		this.doc.unsubscribe();
		this.anchor.unsubscribe();
		this.active.unsubscribe();
	}

	get visible() {
		const sel = this.sel.current;
		return (
			sel !== null &&
			this.doc.current !== null &&
			this.anchor.current.epoch === sel.epoch
		);
	}

	get ready() {
		// track store dependencies
		const doc = this.doc.current;
		const active = this.active.current;
		return doc !== null && active !== null && canOperateOnActive();
	}

	get posStyle() {
		const a = this.anchor.current;
		return htmlSafe(`left: ${a.x}px; top: ${a.y}px`);
	}

	extract = () => void extractSelection();
	cut = () => void cutSelection();
	invert = () => invertSelection();
	grow = () => growSelection();
	shrink = () => shrinkSelection();
	deselect = () => clearPixelSelection();

	<template>
		{{#if this.visible}}
			<div class="sub-selpop" style={{this.posStyle}}>
				<button
					type="button"
					class="sub-selpop-btn is-primary"
					data-select-action="extract"
					title="Extract"
					aria-label="Extract"
					disabled={{unless this.ready true}}
					{{on "click" this.extract}}
				>
					<Icon @name="copy-plus" />
				</button>
				<button
					type="button"
					class="sub-selpop-btn is-destructive"
					data-select-action="cut"
					title="Cut"
					aria-label="Cut"
					disabled={{unless this.ready true}}
					{{on "click" this.cut}}
				>
					<Icon @name="scissors" />
				</button>
				<div class="sub-selpop-divider"></div>
				<button
					type="button"
					class="sub-selpop-btn"
					data-select-action="invert"
					title="Invert"
					aria-label="Invert"
					{{on "click" this.invert}}
				>
					<Icon @name="square-slash" />
				</button>
				<button
					type="button"
					class="sub-selpop-btn"
					data-select-action="grow"
					title="Grow"
					aria-label="Grow"
					{{on "click" this.grow}}
				>
					<Icon @name="expand" />
				</button>
				<button
					type="button"
					class="sub-selpop-btn"
					data-select-action="shrink"
					title="Shrink"
					aria-label="Shrink"
					{{on "click" this.shrink}}
				>
					<Icon @name="shrink" />
				</button>
				<div class="sub-selpop-divider"></div>
				<button
					type="button"
					class="sub-selpop-btn"
					data-select-action="deselect"
					title="Deselect"
					aria-label="Deselect"
					{{on "click" this.deselect}}
				>
					<Icon @name="x" />
				</button>
			</div>
		{{/if}}
	</template>
}
