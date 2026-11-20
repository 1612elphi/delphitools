import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';

export interface Preset {
	value: number;
	label: string;
}

export interface PresetsSignature {
	Args: {
		options: Preset[];
		value: number;
		onPick: (value: number) => void;
		eps?: number;
	};
	Element: HTMLDivElement;
}

export default class Presets extends Component<PresetsSignature> {
	get cells() {
		const eps = this.args.eps ?? 0.5;
		return this.args.options.map((o) => ({
			...o,
			selected: Math.abs(o.value - this.args.value) <= eps,
		}));
	}

	<template>
		<CanonGrid class="sub-ip-presets" ...attributes>
			{{#each this.cells as |cell|}}
				<CanonButton
					@kind="segment"
					@text={{cell.label}}
					@selected={{cell.selected}}
					@onClick={{fn @onPick cell.value}}
				/>
			{{/each}}
		</CanonGrid>
	</template>
}
