import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import FxSliderRow from './fx-slider-row';
import FxStepperRow from './fx-stepper-row';
import FxColourRow from './fx-colour-row';
import FxSelectRow from './fx-select-row';
import { specOf, type FxContext } from './fx-context';

function kindOf(ctx: FxContext, key: string) {
	return specOf(ctx, key)?.kind;
}

function keysOf(ctx: FxContext, keys?: string[]) {
	return (
		keys ??
		ctx.def.params
			.filter(
				(p) =>
					p.kind !== 'pairs' &&
					p.kind !== 'presets',
			)
			.map((p) => p.key)
	);
}

const FxRows: TOC<{ Args: { ctx: FxContext; keys?: string[] } }> = <template>
	{{#each (keysOf @ctx @keys) as |key|}}
		{{#let (kindOf @ctx key) as |kind|}}
			{{#if (eq kind "slider")}}
				<FxSliderRow @ctx={{@ctx}} @key={{key}} />
			{{else if (eq kind "stepper")}}
				<FxStepperRow @ctx={{@ctx}} @key={{key}} />
			{{else if (eq kind "colour")}}
				<FxColourRow @ctx={{@ctx}} @key={{key}} />
			{{else if (eq kind "select")}}
				<FxSelectRow @ctx={{@ctx}} @key={{key}} />
			{{/if}}
		{{/let}}
	{{/each}}
</template>;

export default FxRows;
