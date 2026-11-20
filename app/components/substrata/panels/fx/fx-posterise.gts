import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import FxStepperRow from './fx-stepper-row';
import { numberOf, type FxContext } from './fx-context';
import { band } from './fx-maths';

function bands(ctx: FxContext) {
	const count = Math.min(
		32,
		Math.max(2, Math.round(numberOf(ctx, 'levels'))),
	);
	return Array.from({ length: count }, (_, i) => {
		const b = band(i, count);
		const grey = Math.round(b.grey * 255);
		return htmlSafe(
			`inset-inline-start: ${b.from * 100}%; inline-size: ${(b.to - b.from) * 100}%; background: rgb(${grey} ${grey} ${grey})`,
		);
	});
}

const FxPosterise: TOC<{ Args: { ctx: FxContext } }> = <template>
	<FxStepperRow @ctx={{@ctx}} @key="levels" />
	<div class="sub-fxp-bands" aria-hidden="true">
		<div class="sub-fxp-bands-strip">
			{{#each (bands @ctx) as |style|}}
				<span style={{style}}></span>
			{{/each}}
		</div>
	</div>
</template>;

export default FxPosterise;
