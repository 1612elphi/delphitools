import Component from '@glimmer/component';
import { service } from '@ember/service';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourCard from 'delphicanon/components/canon-colour-card';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonPaletteCard from 'delphicanon/components/canon-palette-card';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	formatColour,
	formatLabel,
	fromOklch,
	hex,
	oklch,
	type ColourFormat,
	type Rgb,
} from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';

const formats: ColourFormat[] = ['hex', 'rgb', 'hsl', 'oklch', 'lab'];
const Copy = <template><IconSvg @name="copy" /></template>;

const turned = (colour: Rgb, turns: number[]): Rgb[] => {
	const [l, c, h] = oklch(colour);
	return turns.map((turn) => fromOklch(l, c, h + turn));
};

export default class ColourPickerScreen extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	state = new CanonColourSolidState({ space: 'rgb' });

	get colour() {
		return this.state.colour;
	}

	get lines() {
		return formats.map((format) => ({
			label: formatLabel(format),
			value: formatColour(this.colour, format),
		}));
	}

	get harmonies() {
		return [
			{
				title: 'Triad',
				colours: turned(this.colour, [0, 120, 240]),
			},
			{
				title: 'Analogous',
				colours: turned(
					this.colour,
					[-40, -20, 0, 20, 40],
				),
			},
		];
	}

	copy = () => void this.toast.copy(hex(this.colour));

	<template>
		<CanonSplit @halves={{true}}>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@background="var(--canon-muted)"
				>
					<CanonColourSolid
						@space={{this.state.space}}
						@point={{this.state.point}}
						@animated={{this.state.animated}}
						@sliceAxis={{this.state.sliceAxis}}
						@isOrtho={{this.state.isOrtho}}
						@showsWhole={{this.state.showsWhole}}
						@onChange={{this.state.pick}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonColourCard
						@colour={{this.colour}}
						@layout="row"
					/>
					<CanonButton
						@kind="primary"
						@text="Copy hex"
						@icon={{Copy}}
						@onClick={{this.copy}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonColourControls
						@state={{this.state}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Values" />
					{{#each this.lines as |line|}}
						<CanonValueLine
							@label={{line.label}}
							@value={{line.value}}
							@labelWidth={{64}}
						/>
					{{/each}}
				</CanonRows>
				{{#each this.harmonies as |harmony|}}
					<CanonPaletteCard
						@title={{harmony.title}}
						@colours={{harmony.colours}}
					/>
				{{/each}}
			</:main>
		</CanonSplit>
	</template>
}
