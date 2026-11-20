import Component from '@glimmer/component';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import { BLEND_OPTIONS } from 'delphitools-v2/components/substrata/blend-options';
import {
	beginTransient,
	commitTransient,
	isGestureActive,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	setBlendMode,
	setOpacity,
} from 'delphitools-v2/lib/substrata/layer-ops';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';

const BLEND_TITLES = BLEND_OPTIONS.map((o) => o.label);

export default class LayerControls extends Component<{
	Args: { layers: readonly Layer[] };
	Element: HTMLDivElement;
}> {
	get primary(): Layer | undefined {
		return this.args.layers[this.args.layers.length - 1];
	}

	get opacity() {
		return this.primary?.opacity ?? 1;
	}

	get blendIndex() {
		const mode = this.primary?.blendMode;
		const i = BLEND_OPTIONS.findIndex((o) => o.value === mode);
		return i < 0 ? undefined : i;
	}

	get blendOff() {
		return this.args.layers.some((l) => l.kind === 'group');
	}

	setOpacity = (value: number, dragging: boolean) => {
		if (dragging && !isGestureActive()) {
			beginTransient();
			const done = () => {
				window.removeEventListener('pointerup', done);
				window.removeEventListener(
					'pointercancel',
					done,
				);
				commitTransient();
			};
			window.addEventListener('pointerup', done);
			window.addEventListener('pointercancel', done);
		}
		for (const l of this.args.layers)
			setOpacity(l.id, value, { transient: dragging });
	};

	setBlend = (index: number) => {
		const mode = BLEND_OPTIONS[index]?.value;
		if (!mode) return;
		for (const l of this.args.layers) setBlendMode(l.id, mode);
	};

	<template>
		<div class="sub-layer-controls" ...attributes>
			<CanonRow @title="Opacity" @form="flush" as |titleId|>
				<CanonSlider
					@value={{this.opacity}}
					@labelledBy={{titleId}}
					@onChange={{this.setOpacity}}
				/>
			</CanonRow>
			<CanonRow @title="Blend as" @form="flush" as |titleId|>
				<CanonMenuCell
					@items={{BLEND_TITLES}}
					@selected={{this.blendIndex}}
					@labelledBy={{titleId}}
					@disabled={{this.blendOff}}
					@onChange={{this.setBlend}}
				/>
			</CanonRow>
		</div>
	</template>
}
