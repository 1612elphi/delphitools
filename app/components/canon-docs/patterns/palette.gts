import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonPaletteCard from 'delphicanon/components/canon-palette-card';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSlider from 'delphicanon/components/canon-slider';
import { fromOklch, type Rgb } from 'delphicanon/lib/colour';

const steps = [0.95, 0.87, 0.77, 0.67, 0.57, 0.47, 0.38, 0.29, 0.21];
const degrees = (value: number) => `${Math.round(value)}°`;

export default class PalettePattern extends Component {
	@tracked hue = 145;
	@tracked selected?: number = 5;

	get shades(): Rgb[] {
		return steps.map((l) =>
			fromOklch(
				l,
				0.16 * Math.sin(Math.PI * l) ** 1.5,
				this.hue,
			),
		);
	}

	setHue = (hue: number) => (this.hue = hue);
	select = (index: number | undefined) => (this.selected = index);

	<template>
		<CanonPaletteCard
			@title="Shades"
			@colours={{this.shades}}
			@height={{120}}
			@selected={{this.selected}}
			@onSelect={{this.select}}
		/>
		<CanonRow @title="Hue" @form="stacked" as |titleId|>
			<CanonSlider
				@value={{this.hue}}
				@min={{0}}
				@max={{360}}
				@step={{1}}
				@readout={{degrees}}
				@labelledBy={{titleId}}
				@onChange={{this.setHue}}
			/>
		</CanonRow>
	</template>
}
