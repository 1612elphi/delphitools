import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import FxSelectRow from './fx-select-row';
import FxSliderRow from './fx-slider-row';
import { numberOf, stringOf, type FxContext } from './fx-context';
import { grain } from './fx-maths';

const SIDE = 52;

const paint = modifier(
	(canvas: HTMLCanvasElement, [amount, colour]: [number, boolean]) => {
		canvas.getContext('2d')?.putImageData(
			new ImageData(grain(SIDE, amount, colour), SIDE, SIDE),
			0,
			0,
		);
	},
);

function amountOf(ctx: FxContext) {
	return numberOf(ctx, 'amount') / 100;
}

function isColour(ctx: FxContext) {
	return stringOf(ctx, 'mode') === 'colour';
}

const FxNoise: TOC<{ Args: { ctx: FxContext } }> = <template>
	<div class="sub-fxp-noise">
		<canvas
			width="52"
			height="52"
			aria-hidden="true"
			{{paint (amountOf @ctx) (isColour @ctx)}}
		></canvas>
		<FxSelectRow @ctx={{@ctx}} @key="mode" @bare={{true}} />
	</div>
	<FxSliderRow @ctx={{@ctx}} @key="amount" />
</template>;

export default FxNoise;
