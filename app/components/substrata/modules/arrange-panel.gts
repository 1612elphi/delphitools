import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import type { Layer, Transform } from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { setTransforms } from 'delphitools-v2/lib/substrata/layer-ops';
import {
	findLayer,
	leafLayers,
	leafRenderList,
} from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getActiveLayerId,
	getSelectedLayerIds,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { layerDims } from 'delphitools-v2/lib/substrata/shape-geometry';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const wrap360 = (a: number) => ((a % 360) + 360) % 360;

interface Dims {
	w: number;
	h: number;
}

function dimsOf(layer: Layer): Dims | null {
	const d = layerDims(layer);
	return d
		? {
				w: d.width * layer.transform.scaleX,
				h: d.height * layer.transform.scaleY,
			}
		: null;
}

interface IconBtnSignature {
	Element: HTMLButtonElement;
	Args: {
		icon: string;
		aria: string;
		onClick: () => void;
		disabled?: boolean;
		active?: boolean;
	};
}

const IconBtn: TOC<IconBtnSignature> = <template>
	<button
		type="button"
		class="sub-arr-btn {{if @active 'is-active'}}"
		disabled={{@disabled}}
		aria-label={{@aria}}
		title={{@aria}}
		{{on "click" @onClick}}
	>
		<Icon @name={{@icon}} />
	</button>
</template>;

export class ArrangeBody extends Component {
	#doc = new TrackedExternal(subscribe, getSnapshot);
	#selected = new TrackedExternal(
		subscribeSelection,
		getSelectedLayerIds,
	);
	#active = new TrackedExternal(subscribeSelection, getActiveLayerId);

	get doc() {
		return this.#doc.current;
	}

	get primary(): Layer | null {
		const doc = this.doc;
		const id = this.#active.current;
		return doc && id ? findLayer(doc.layers, id) : null;
	}

	@cached
	get leaves(): Layer[] {
		const doc = this.doc;
		if (!doc) return [];
		const effective = new Map(
			leafRenderList(doc.layers).map((e) => [e.layer.id, e]),
		);
		const out: Layer[] = [];
		for (const id of this.#selected.current) {
			const layer = findLayer(doc.layers, id);
			if (!layer) continue;
			for (const leaf of leafLayers(layer)) {
				const e = effective.get(leaf.id);
				if (
					e &&
					e.visible &&
					!e.locked &&
					!out.includes(leaf)
				)
					out.push(leaf);
			}
		}
		return out;
	}

	@cached
	get sized(): Layer[] {
		return this.leaves.filter((l) => dimsOf(l) !== null);
	}

	get cannotAlign() {
		return this.sized.length === 0;
	}

	get cannotDistribute() {
		return this.sized.length < 3;
	}

	get flippedX() {
		return this.primary?.transform.flipX ?? false;
	}

	get flippedY() {
		return this.primary?.transform.flipY ?? false;
	}

	#alignAll(patch: (d: Dims) => Partial<Transform>) {
		setTransforms(
			this.sized.map((l) => ({
				id: l.id,
				transform: {
					...l.transform,
					...patch(dimsOf(l) as Dims),
				},
			})),
		);
	}

	alignLeft = () => this.#alignAll((d) => ({ x: d.w / 2 }));
	alignRight = () =>
		this.#alignAll((d) => ({
			x: (this.doc?.artboard.width ?? 0) - d.w / 2,
		}));
	alignTop = () => this.#alignAll((d) => ({ y: d.h / 2 }));
	alignBottom = () =>
		this.#alignAll((d) => ({
			y: (this.doc?.artboard.height ?? 0) - d.h / 2,
		}));
	alignCentreX = () =>
		this.#alignAll(() => ({
			x: (this.doc?.artboard.width ?? 0) / 2,
		}));
	alignCentreY = () =>
		this.#alignAll(() => ({
			y: (this.doc?.artboard.height ?? 0) / 2,
		}));

	distribute = (axis: 'x' | 'y') => {
		const sorted = [...this.sized].sort(
			(a, b) => a.transform[axis] - b.transform[axis],
		);
		const first = sorted[0];
		const last = sorted[sorted.length - 1];
		if (!first || !last) return;
		const lo = first.transform[axis];
		const step = (last.transform[axis] - lo) / (sorted.length - 1);
		setTransforms(
			sorted.map((l, i) => ({
				id: l.id,
				transform: {
					...l.transform,
					[axis]: lo + i * step,
				},
			})),
		);
	};

	rotate = (delta: number) => {
		setTransforms(
			this.leaves.map((l) => ({
				id: l.id,
				transform: {
					...l.transform,
					angle: wrap360(
						l.transform.angle + delta,
					),
				},
			})),
		);
	};

	flip = (axis: 'flipX' | 'flipY') => {
		setTransforms(
			this.leaves.map((l) => ({
				id: l.id,
				transform: {
					...l.transform,
					[axis]: !l.transform[axis],
				},
			})),
		);
	};

	willDestroy() {
		super.willDestroy();
		this.#doc.unsubscribe();
		this.#selected.unsubscribe();
		this.#active.unsubscribe();
	}

	<template>
		{{#if this.primary}}
			<div class="sub-arr">
				<div class="sub-arr-title">Align</div>
				<div class="segmented sub-arr-row is-6">
					<IconBtn
						@icon="align-start-vertical"
						@aria="Left align"
						@disabled={{this.cannotAlign}}
						@onClick={{this.alignLeft}}
					/>
					<IconBtn
						@icon="align-center-vertical"
						@aria="Centre align (hor)"
						@disabled={{this.cannotAlign}}
						@onClick={{this.alignCentreX}}
					/>
					<IconBtn
						@icon="align-end-vertical"
						@aria="Right align"
						@disabled={{this.cannotAlign}}
						@onClick={{this.alignRight}}
					/>
					<IconBtn
						@icon="align-start-horizontal"
						@aria="Top align"
						@disabled={{this.cannotAlign}}
						@onClick={{this.alignTop}}
					/>
					<IconBtn
						@icon="align-center-horizontal"
						@aria="Centre align (ver)"
						@disabled={{this.cannotAlign}}
						@onClick={{this.alignCentreY}}
					/>
					<IconBtn
						@icon="align-end-horizontal"
						@aria="Bottom align"
						@disabled={{this.cannotAlign}}
						@onClick={{this.alignBottom}}
					/>
				</div>

				<div class="sub-arr-title">Distribute</div>
				<div class="segmented sub-arr-row is-2">
					<IconBtn
						@icon="align-horizontal-distribute-center"
						@aria="Distribute horizontally"
						@disabled={{this.cannotDistribute}}
						@onClick={{fn
							this.distribute
							"x"
						}}
					/>
					<IconBtn
						@icon="align-vertical-distribute-center"
						@aria="Distribute vertically"
						@disabled={{this.cannotDistribute}}
						@onClick={{fn
							this.distribute
							"y"
						}}
					/>
				</div>

				<div class="sub-arr-title">Rotate &amp; flip</div>
				<div class="segmented sub-arr-row is-4">
					<IconBtn
						@icon="rotate-ccw"
						@aria="Rotate left"
						@onClick={{fn this.rotate -90}}
					/>
					<IconBtn
						@icon="rotate-cw"
						@aria="Rotate right"
						@onClick={{fn this.rotate 90}}
					/>
					<IconBtn
						@icon="flip-horizontal-2"
						@aria="Flip horizontal"
						@active={{this.flippedX}}
						@onClick={{fn
							this.flip
							"flipX"
						}}
					/>
					<IconBtn
						@icon="flip-vertical-2"
						@aria="Flip vertical"
						@active={{this.flippedY}}
						@onClick={{fn
							this.flip
							"flipY"
						}}
					/>
				</div>
			</div>
		{{else}}
			<div class="sub-arr-empty">Select a layer to arrange
				it...</div>
		{{/if}}
	</template>
}
