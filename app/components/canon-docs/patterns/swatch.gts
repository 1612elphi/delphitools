import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	formatColour,
	fromOklch,
	oklch,
	type Rgb,
} from 'delphicanon/lib/colour';

const neighbours = (colour: Rgb): Rgb[] => {
	const [l, c, h] = oklch(colour);
	return [-60, -30, 0, 30, 60].map((turn) => fromOklch(l, c, h + turn));
};

export default class SwatchPattern extends Component {
	@tracked colour: Rgb = [0.118, 0.4, 0.149];

	get palette() {
		return neighbours(this.colour);
	}

	get rgb() {
		return formatColour(this.colour, 'rgb');
	}

	get oklch() {
		return formatColour(this.colour, 'oklch');
	}

	pick = (colour: Rgb) => (this.colour = colour);

	<template>
		<CanonColourWell
			@label="Accent"
			@colour={{this.colour}}
			@format="oklch"
			@onChange={{this.pick}}
		/>
		<CanonColourStrip
			@colour={{this.colour}}
			@palette={{this.palette}}
		/>
		<CanonValueLine
			@label="RGB"
			@value={{this.rgb}}
			@labelWidth={{56}}
		/>
		<CanonValueLine
			@label="OKLCH"
			@value={{this.oklch}}
			@labelWidth={{56}}
		/>
	</template>
}
