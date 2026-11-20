import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import CanonBar from 'delphicanon/components/canon-bar';
import { contrastFigure, contrastLevels } from 'delphicanon/lib/colour';
import { springEasing } from 'delphicanon/lib/motion';
import {
	notches,
	rules,
	share,
} from 'delphitools-v2/components/tools/contrast-checker/contrast';

const scaleStyle = htmlSafe(`--contrast-scale-spring: ${springEasing(0.85)}`);

const at = (ratio: number) =>
	htmlSafe(`inset-inline-start: ${(share(ratio) * 100).toFixed(3)}%`);

const scaleLabels = [1, ...notches, 21].map((ratio) => ({
	text: contrastFigure(ratio),
	style: ratio === 21 ? htmlSafe('inset-inline-end: 0') : at(ratio),
	edge: ratio === 1 || ratio === 21,
}));
const notchStyles = notches.map(at);

const fill = (ratio: number) =>
	ratio < contrastLevels.aaLarge
		? 'var(--canon-destructive)'
		: 'var(--canon-primary)';

const lampRows = rules.map((rule) => ({
	name: rule.name,
	lamps: [
		{ level: 'AA', threshold: rule.aa },
		{ level: 'AAA', threshold: rule.aaa },
	],
}));

const passes = (ratio: number, threshold: number) => ratio >= threshold;
const figure = (ratio: number) => `${contrastFigure(ratio)}:1`;

export const Scale: TOC<{ Args: { ratio: number } }> = <template>
	<div class="contrast-scale" style={{scaleStyle}}>
		<meter
			class="contrast-hidden"
			aria-label="Ratio"
			aria-valuetext={{figure @ratio}}
			min="1"
			max="21"
			value={{@ratio}}
		></meter>
		<div class="contrast-scale-track" aria-hidden="true">
			<CanonBar
				@share={{share @ratio}}
				@fill={{fill @ratio}}
			/>
			{{#each notchStyles as |notch|}}
				<span
					class="contrast-scale-notch"
					style={{notch}}
				></span>
			{{/each}}
			{{#each scaleLabels as |label|}}
				<span
					class="contrast-scale-label
						{{if
							label.edge
							'contrast-scale-label--edge'
						}}"
					style={{label.style}}
				>{{label.text}}</span>
			{{/each}}
		</div>
	</div>
</template>;

export const Lamps: TOC<{ Args: { ratio: number } }> = <template>
	<div class="contrast-lamps" role="table" aria-label="WCAG">
		<div class="contrast-lamps-row" role="row">
			<span
				class="contrast-lamps-head"
				role="columnheader"
			></span>
			<span
				class="contrast-lamps-head"
				role="columnheader"
			>AA</span>
			<span
				class="contrast-lamps-head"
				role="columnheader"
			>AAA</span>
		</div>
		{{#each lampRows as |row|}}
			<div class="contrast-lamps-row" role="row">
				<span
					class="contrast-lamps-name"
					role="rowheader"
				>{{row.name}}</span>
				{{#each row.lamps as |lamp|}}
					{{#if lamp.threshold}}
						<span
							class="contrast-lamp
								{{if
									(passes
										@ratio
										lamp.threshold
									)
									'contrast-lamp--lit'
								}}"
							role="cell"
						>
							<span
								class="contrast-lamp-dot"
								aria-hidden="true"
							></span>
							<span
								class="contrast-lamp-threshold"
							>{{figure
									lamp.threshold
								}}</span>
							<span
								class="contrast-hidden"
							>{{if
									(passes
										@ratio
										lamp.threshold
									)
									"Pass"
									"Fail"
								}}</span>
						</span>
					{{else}}
						<span
							class="contrast-lamp"
							role="cell"
						>
							<span
								class="contrast-lamp-threshold"
							>—</span>
						</span>
					{{/if}}
				{{/each}}
			</div>
		{{/each}}
	</div>
</template>;
