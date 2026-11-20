import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSlider from 'delphicanon/components/canon-slider';
import type { SliderParam } from 'delphitools-v2/lib/substrata/param-spec';
import {
	commit,
	numberOf,
	preview,
	resetOnDouble,
	specOf,
	write,
	type FxContext,
} from './fx-context';
import { formatValue } from './fx-maths';

interface Signature {
	Args: { ctx: FxContext; key: string };
}

export default class FxSliderRow extends Component<Signature> {
	get spec() {
		return specOf(this.args.ctx, this.args.key) as SliderParam;
	}

	get value() {
		return numberOf(this.args.ctx, this.args.key);
	}

	get reset() {
		return resetOnDouble(this.args.ctx, this.args.key);
	}

	readout = (v: number) => formatValue(v, this.spec);

	change = (v: number, dragging: boolean) => {
		const patch = { [this.args.key]: v };
		if (dragging) preview(this.args.ctx, patch);
		else write(this.args.ctx, patch);
	};

	settle = () => commit();

	willDestroy() {
		super.willDestroy();
		commit();
	}

	<template>
		<CanonRow
			class="sub-fxp-row"
			@title={{this.spec.label}}
			@form="flush"
			data-fx-param={{@key}}
			{{on "dblclick" this.reset}}
			as |titleId|
		>
			<CanonSlider
				@value={{this.value}}
				@min={{this.spec.min}}
				@max={{this.spec.max}}
				@step={{this.spec.step}}
				@readout={{this.readout}}
				@labelledBy={{titleId}}
				@onChange={{this.change}}
				{{on "pointerup" this.settle}}
				{{on "pointercancel" this.settle}}
			/>
		</CanonRow>
	</template>
}
