import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { BLEND_OPTIONS } from 'delphitools-v2/components/substrata/blend-options';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import {
	beginTransient,
	commitTransient,
	isGestureActive,
} from 'delphitools-v2/lib/substrata/doc-store';
import { renameLayer, setBlendModes, setOpacities } from './logic';

const BLEND_TITLES = BLEND_OPTIONS.map((o) => o.label);

export interface NameRowSignature {
	Args: { layer: Layer; placeholder?: string };
}

export class NameRow extends Component<NameRowSignature> {
	#id: string | null = null;

	focus = () => {
		this.#id = this.args.layer.id;
	};

	commit = (event: Event) => {
		const id = this.#id ?? this.args.layer.id;
		renameLayer(
			id,
			(event.target as HTMLInputElement).value.trim(),
		);
	};

	<template>
		<CanonRow @title="Name" @form="flush" as |titleId|>
			<CanonTextCell
				@value={{@layer.name}}
				@placeholder={{@placeholder}}
				aria-labelledby={{titleId}}
				{{on "focus" this.focus}}
				{{on "change" this.commit}}
			/>
		</CanonRow>
	</template>
}

export interface OpacityRowSignature {
	Args: { ids: readonly string[]; value: number };
}

export class OpacityRow extends Component<OpacityRowSignature> {
	#began = false;
	#ids: readonly string[] = [];

	change = (value: number, dragging: boolean) => {
		if (!dragging) {
			setOpacities(this.args.ids, value);
			return;
		}
		if (!this.#began) {
			this.#ids = this.args.ids;
			this.#began = !isGestureActive();
			if (this.#began) beginTransient();
		}
		setOpacities(this.#ids, value, true);
	};

	end = () => {
		if (!this.#began) return;
		this.#began = false;
		commitTransient();
	};

	willDestroy() {
		super.willDestroy();
		this.end();
	}

	<template>
		<CanonRow @title="Opacity" @form="flush" as |titleId|>
			<CanonSlider
				@value={{@value}}
				@labelledBy={{titleId}}
				@onChange={{this.change}}
				{{on "pointerup" this.end}}
				{{on "pointercancel" this.end}}
				{{on "lostpointercapture" this.end}}
			/>
		</CanonRow>
	</template>
}

export interface BlendRowSignature {
	Args: { ids: readonly string[]; layer: Layer };
}

export class BlendRow extends Component<BlendRowSignature> {
	get selected(): number | undefined {
		const i = BLEND_OPTIONS.findIndex(
			(o) => o.value === this.args.layer.blendMode,
		);
		return i < 0 ? undefined : i;
	}

	pick = (index: number) => {
		const option = BLEND_OPTIONS[index];
		if (option) setBlendModes(this.args.ids, option.value);
	};

	<template>
		<CanonRow @title="Blend" @form="flush" as |titleId|>
			<CanonMenuCell
				@items={{BLEND_TITLES}}
				@selected={{this.selected}}
				@labelledBy={{titleId}}
				@onChange={{this.pick}}
			/>
		</CanonRow>
	</template>
}
