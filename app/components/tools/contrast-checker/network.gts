import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import press from 'delphicanon/modifiers/canon-press';
import {
	contrastFigure,
	contrastRatio,
	hex,
	type Rgb,
} from 'delphicanon/lib/colour';
import {
	grade,
	pair,
	swatch,
} from 'delphitools-v2/components/tools/contrast-checker/contrast';

export interface Pair {
	text: number;
	ground: number;
}

export function matrix(colours: Rgb[], focus: Pair) {
	const columns = htmlSafe(
		`grid-template-columns: 44px repeat(${colours.length}, minmax(64px, 1fr))`,
	);
	const heads = colours.map((colour) => ({
		hex: hex(colour),
		swatch: swatch(colour),
	}));
	const rows = colours.map((text, t) => ({
		head: heads[t]!,
		cells: colours.map((ground, g) => {
			const ratio = contrastRatio(text, ground);
			const level = grade(ratio);
			return {
				text: t,
				ground: g,
				same: t === g,
				focused: focus.text === t && focus.ground === g,
				style: pair(text, ground),
				ratio: `${contrastFigure(ratio)}:1`,
				grade: level,
				fails: level === 'Fail',
				label: `${heads[t]!.hex} on ${heads[g]!.hex}`,
			};
		}),
	}));
	return { columns, heads, rows };
}

export const Network: TOC<{
	Args: {
		colours: Rgb[];
		focus: Pair;
		onFocus: (text: number, ground: number) => void;
	};
}> = <template>
	{{#let (matrix @colours @focus) as |m|}}
		<div class="contrast-net-scroll">
			<div
				class="contrast-net"
				style={{m.columns}}
				role="grid"
				aria-label="Network"
			>
				<div class="contrast-net-row" role="row">
					<span
						class="contrast-net-corner"
						role="columnheader"
					></span>
					{{#each m.heads key="@index" as |head|}}
						<span
							class="contrast-net-head"
							role="columnheader"
							aria-label={{head.hex}}
						><span
								class="contrast-net-chip"
								style={{head.swatch}}
							></span></span>
					{{/each}}
				</div>
				{{#each m.rows key="@index" as |row|}}
					<div
						class="contrast-net-row"
						role="row"
					>
						<span
							class="contrast-net-head"
							role="rowheader"
							aria-label={{row.head.hex}}
						><span
								class="contrast-net-chip"
								style={{row.head.swatch}}
							></span></span>
						{{#each
							row.cells key="@index"
							as |cell|
						}}
							{{#if cell.same}}
								<span
									class="contrast-net-cell contrast-net-cell--same"
									role="gridcell"
								></span>
							{{else}}
								<button
									type="button"
									class="contrast-net-cell
										{{if
											cell.focused
											'contrast-net-cell--on'
										}}"
									role="gridcell"
									aria-selected={{if
										cell.focused
										"true"
										"false"
									}}
									aria-label="{{cell.label}}, {{cell.ratio}}, {{cell.grade}}"
									{{press}}
									{{on
										"click"
										(fn
											@onFocus
											cell.text
											cell.ground
										)
									}}
								>
									<span
										class="contrast-net-sample"
										style={{cell.style}}
									>Aa</span>
									<span
										class="contrast-net-ratio"
									>{{cell.ratio}}</span>
									<span
										class="contrast-net-grade
											{{if
												cell.fails
												'contrast-net-grade--fail'
											}}"
									>{{cell.grade}}</span>
								</button>
							{{/if}}
						{{/each}}
					</div>
				{{/each}}
			</div>
		</div>
	{{/let}}
</template>;
