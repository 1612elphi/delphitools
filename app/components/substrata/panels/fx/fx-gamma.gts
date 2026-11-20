import type { TOC } from '@ember/component/template-only';
import FxColourSliderRow from './fx-colour-slider-row';
import { numberOf, type FxContext } from './fx-context';
import { gammaPath } from './fx-maths';

const CHANNELS = [
	{ key: 'red', colour: 'rgb(235 66 61)', width: 6 },
	{ key: 'green', colour: 'rgb(46 173 77)', width: 4 },
	{ key: 'blue', colour: 'rgb(66 117 245)', width: 2 },
];

function curve(ctx: FxContext, key: string) {
	return gammaPath(numberOf(ctx, key) || 1, 100, 100);
}

function longest(ctx: FxContext) {
	return ctx.def.params
		.map((p) => p.label)
		.reduce((a, b) => (b.length > a.length ? b : a), '');
}

const FxGamma: TOC<{ Args: { ctx: FxContext } }> = <template>
	<div class="sub-fxp-gamma" aria-hidden="true">
		<svg viewBox="0 0 100 100" preserveAspectRatio="none">
			<rect
				class="sub-fxp-gamma-frame"
				x="0"
				y="0"
				width="100"
				height="100"
			/>
			<path class="sub-fxp-gamma-identity" d="M0 100L100 0" />
			{{#each CHANNELS as |c|}}
				<path
					d={{curve @ctx c.key}}
					stroke={{c.colour}}
					stroke-width={{c.width}}
				/>
			{{/each}}
		</svg>
	</div>
	{{#each CHANNELS as |c|}}
		<FxColourSliderRow
			@ctx={{@ctx}}
			@key={{c.key}}
			@fill={{c.colour}}
			@sizingTitle={{longest @ctx}}
		/>
	{{/each}}
</template>;

export default FxGamma;
