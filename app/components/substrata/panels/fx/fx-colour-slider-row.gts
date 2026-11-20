import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import CanonRow from 'delphicanon/components/canon-row';
import type { SliderParam } from 'delphitools-v2/lib/substrata/param-spec';
import FxColourSlider from './fx-colour-slider';
import {
	commit,
	numberOf,
	preview,
	resetOnDouble,
	specOf,
	write,
	type FxContext,
} from './fx-context';
import { formatValue, signed, trackStops } from './fx-maths';

interface Signature {
	Args: {
		ctx: FxContext;
		key: string;
		fill?: string;
		sizingTitle?: string;
	};
}

export default class FxColourSliderRow extends Component<Signature> {
	get spec() {
		return specOf(this.args.ctx, this.args.key) as SliderParam;
	}

	get value() {
		return numberOf(this.args.ctx, this.args.key);
	}

	get stops() {
		return this.args.fill
			? null
			: trackStops(this.args.ctx.fx.type, this.args.key);
	}

	get reset() {
		return resetOnDouble(this.args.ctx, this.args.key);
	}

	readout = (v: number) => {
		const text = formatValue(v, this.spec);
		return this.spec.min < 0 ? signed(text, v) : text;
	};

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
			@sizingTitle={{@sizingTitle}}
			data-fx-param={{@key}}
			{{on "dblclick" this.reset}}
			as |titleId|
		>
			<FxColourSlider
				@value={{this.value}}
				@min={{this.spec.min}}
				@max={{this.spec.max}}
				@step={{this.spec.step}}
				@origin={{this.spec.default}}
				@stops={{this.stops}}
				@fill={{@fill}}
				@readout={{this.readout}}
				@labelledBy={{titleId}}
				@onChange={{this.change}}
				@onEnd={{this.settle}}
			/>
		</CanonRow>
	</template>
}
