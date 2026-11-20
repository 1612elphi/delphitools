import Component from '@glimmer/component';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import { layerDims } from 'delphitools-v2/lib/substrata/shape-geometry';
import NumField from './num-field';
import { patchTransform } from './logic';

const FAR = 100_000;

interface Field {
	key: string;
	title: string;
	unit: string;
	value: number;
	min: number;
	max: number;
	decimals: number;
	onCommit: (value: number) => void;
}

export default class TransformSection extends Component<{
	Args: { layer: Layer };
}> {
	get fields(): Field[] {
		const { layer } = this.args;
		const { id, transform: t } = layer;
		const dims = layerDims(layer);
		const fields: Field[] = [
			{
				key: 'x',
				title: 'X',
				unit: 'px',
				value: t.x,
				min: -FAR,
				max: FAR,
				decimals: 1,
				onCommit: (x) => patchTransform(id, { x }),
			},
			{
				key: 'y',
				title: 'Y',
				unit: 'px',
				value: t.y,
				min: -FAR,
				max: FAR,
				decimals: 1,
				onCommit: (y) => patchTransform(id, { y }),
			},
		];
		if (dims && dims.width > 0)
			fields.push({
				key: 'w',
				title: 'W',
				unit: 'px',
				value: dims.width * t.scaleX,
				min: 1,
				max: FAR,
				decimals: 1,
				onCommit: (w) =>
					patchTransform(id, {
						scaleX: w / dims.width,
					}),
			});
		if (dims && dims.height > 0)
			fields.push({
				key: 'h',
				title: 'H',
				unit: 'px',
				value: dims.height * t.scaleY,
				min: 1,
				max: FAR,
				decimals: 1,
				onCommit: (h) =>
					patchTransform(id, {
						scaleY: h / dims.height,
					}),
			});
		fields.push(
			{
				key: 'angle',
				title: 'Angle',
				unit: '°',
				value: t.angle,
				min: -360,
				max: 360,
				decimals: 1,
				onCommit: (angle) =>
					patchTransform(id, { angle }),
			},
			{
				key: 'scale',
				title: 'Scale',
				unit: '%',
				value: t.scaleX * 100,
				min: 1,
				max: 10_000,
				decimals: 0,
				onCommit: (scale) =>
					patchTransform(id, {
						scaleX: scale / 100,
						scaleY: scale / 100,
					}),
			},
		);
		return fields;
	}

	<template>
		<CanonHeading @text="Transform" />
		{{#each this.fields key="key" as |f|}}
			<CanonRow @title={{f.title}} @form="flush" as |titleId|>
				<NumField
					@value={{f.value}}
					@onCommit={{f.onCommit}}
					@min={{f.min}}
					@max={{f.max}}
					@decimals={{f.decimals}}
					@unit={{f.unit}}
					@labelledBy={{titleId}}
				/>
			</CanonRow>
		{{/each}}
	</template>
}
