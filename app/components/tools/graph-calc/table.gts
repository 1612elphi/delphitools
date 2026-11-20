import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { reducedMotion, springEasing } from 'delphicanon/lib/motion';
import {
	format,
	paint,
	rowX,
} from 'delphitools-v2/components/tools/graph-calc/graph';
import type { PlotCurve } from 'delphitools-v2/components/tools/graph-calc/plot';

export const reach = 3;
export const rowHeight = 34;
const pitch = rowHeight + 1;

export interface Slide {
	id: number;
	by: -1 | 0 | 1;
}

interface TableSignature {
	Args: {
		x: number;
		step: number;
		curves: PlotCurve[];
		slide: Slide;
	};
}

const easing = springEasing(0.86);

const slides = modifier((body: HTMLElement, [slide]: [Slide]) => {
	if (slide.by === 0 || reducedMotion()) return;
	body.getAnimations().forEach((a) => a.cancel());
	body.animate(
		[
			{ translate: `0 ${slide.by * pitch}px` },
			{ translate: '0 0' },
		],
		{ duration: 400, easing },
	);
});

export default class GraphTable extends Component<TableSignature> {
	get columns() {
		return [
			{ name: 'x', style: undefined },
			...this.args.curves.map((curve) => {
				const { fill, ink } = paint(curve.colour);
				return {
					name: curve.name,
					style: htmlSafe(
						`background: ${fill}; color: ${ink}`,
					),
				};
			}),
		];
	}

	get rows() {
		const { x, step, curves } = this.args;
		return Array.from({ length: reach * 2 + 3 }, (_, offset) => {
			const value = rowX(x, offset - reach - 1, step);
			return {
				key: offset,
				cells: [
					format(value),
					...curves.map((curve) =>
						format(curve.evaluate(value)),
					),
				],
			};
		});
	}

	get readout() {
		const centre = this.rows[reach + 1]!.cells;
		return this.columns
			.map((column, i) => `${column.name} ${centre[i]}`)
			.join(', ');
	}

	<template>
		<div class="graph-table">
			<div class="graph-table-head" aria-hidden="true">
				{{#each this.columns as |column|}}
					<span
						class="graph-table-name"
						style={{column.style}}
					>{{column.name}}</span>
				{{/each}}
			</div>
			<div class="graph-table-viewport" aria-hidden="true">
				<div class="graph-table-band"></div>
				<div class="graph-table-body" {{slides @slide}}>
					{{#each this.rows key="key" as |row|}}
						<div class="graph-table-row">
							{{#each
								row.cells
								as |cell|
							}}
								<span
								>{{cell}}</span>
							{{/each}}
						</div>
					{{/each}}
				</div>
			</div>
			<output
				class="dt-sr-only"
				aria-label="Table"
			>{{this.readout}}</output>
		</div>
	</template>
}
