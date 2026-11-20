import type { TOC } from '@ember/component/template-only';
import { array } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import FxRows from './fx-rows';
import FxLevels from './fx-levels';
import FxThreshold from './fx-threshold';
import FxPosterise from './fx-posterise';
import FxColourSliders from './fx-colour-sliders';
import FxGamma from './fx-gamma';
import FxHue from './fx-hue';
import FxDuotone from './fx-duotone';
import FxVignette from './fx-vignette';
import FxNoise from './fx-noise';
import FxPixelate from './fx-pixelate';
import FxShadowPad from './fx-shadow-pad';
import FxEffectsSample from './fx-effects-sample';
import FxStrokePosition from './fx-stroke-position';
import FxMatte from './fx-matte';
import { specOf, type FxContext } from './fx-context';

const COLOUR = new Set([
	'brightness',
	'contrast',
	'exposure',
	'saturation',
	'vibrance',
	'temperature',
	'tint',
	'highlights',
	'shadows',
	'colour-balance',
]);

function editorOf(ctx: FxContext): string {
	const type = ctx.fx.type;
	if (ctx.stack === 'effects') {
		if (type === 'drop-shadow' || type === 'inner-shadow')
			return 'shadow';
		if (
			type === 'outer-glow' ||
			type === 'inner-glow' ||
			type === 'colour-overlay'
		)
			return 'sampled';
		if (type === 'stroke') return 'stroke';
		if (type === 'remove-background') return 'matte';
		return 'rows';
	}
	if (COLOUR.has(type)) return 'colour';
	return type;
}

function present(ctx: FxContext, keys: string[]) {
	return keys.filter((k) => specOf(ctx, k));
}

const FxEditor: TOC<{ Args: { ctx: FxContext } }> = <template>
	{{#let (editorOf @ctx) as |kind|}}
		{{#if (eq kind "levels")}}
			<FxLevels @ctx={{@ctx}} />
		{{else if (eq kind "threshold")}}
			<FxThreshold @ctx={{@ctx}} />
		{{else if (eq kind "posterize")}}
			<FxPosterise @ctx={{@ctx}} />
		{{else if (eq kind "colour")}}
			<FxColourSliders @ctx={{@ctx}} />
		{{else if (eq kind "gamma")}}
			<FxGamma @ctx={{@ctx}} />
		{{else if (eq kind "hue-rotate")}}
			<FxHue @ctx={{@ctx}} />
		{{else if (eq kind "duotone")}}
			<FxDuotone @ctx={{@ctx}} />
		{{else if (eq kind "vignette")}}
			<FxVignette @ctx={{@ctx}} />
		{{else if (eq kind "noise")}}
			<FxNoise @ctx={{@ctx}} />
		{{else if (eq kind "pixelate")}}
			<FxPixelate @ctx={{@ctx}} />
		{{else if (eq kind "shadow")}}
			<FxShadowPad @ctx={{@ctx}} />
			<FxRows
				@ctx={{@ctx}}
				@keys={{present
					@ctx
					(array
						"colour"
						"opacity"
						"blur"
						"spread"
					)
				}}
			/>
		{{else if (eq kind "sampled")}}
			<FxEffectsSample
				class="sub-fxp-sample-row"
				@ctx={{@ctx}}
				@scale={{0.5}}
				@side={{56}}
			/>
			<FxRows @ctx={{@ctx}} />
		{{else if (eq kind "stroke")}}
			<FxEffectsSample
				class="sub-fxp-sample-row"
				@ctx={{@ctx}}
				@scale={{1}}
				@side={{56}}
			/>
			<FxStrokePosition @ctx={{@ctx}} />
			<FxRows
				@ctx={{@ctx}}
				@keys={{present @ctx (array "width" "colour")}}
			/>
		{{else if (eq kind "matte")}}
			<FxMatte @ctx={{@ctx}} />
		{{else}}
			<FxRows @ctx={{@ctx}} />
		{{/if}}
	{{/let}}
</template>;

export default FxEditor;
