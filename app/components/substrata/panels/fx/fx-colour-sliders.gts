import type { TOC } from '@ember/component/template-only';
import FxColourSliderRow from './fx-colour-slider-row';
import FxRows from './fx-rows';
import type { FxContext } from './fx-context';

function longest(ctx: FxContext) {
	return ctx.def.params
		.map((p) => p.label)
		.reduce((a, b) => (b.length > a.length ? b : a), '');
}

function sliders(ctx: FxContext) {
	return ctx.def.params.filter((p) => p.kind === 'slider');
}

function others(ctx: FxContext) {
	return ctx.def.params
		.filter((p) => p.kind !== 'slider')
		.map((p) => p.key);
}

const FxColourSliders: TOC<{ Args: { ctx: FxContext } }> = <template>
	{{#each (sliders @ctx) as |p|}}
		<FxColourSliderRow
			@ctx={{@ctx}}
			@key={{p.key}}
			@sizingTitle={{longest @ctx}}
		/>
	{{/each}}
	<FxRows @ctx={{@ctx}} @keys={{others @ctx}} />
</template>;

export default FxColourSliders;
