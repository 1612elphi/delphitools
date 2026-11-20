import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonPaletteCard from 'delphicanon/components/canon-palette-card';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import {
	kitFormat,
	readColour,
} from 'delphitools-v2/components/tools/colour-atlas/atlas';
import {
	colourIn,
	harmony,
	labels,
	launchFlags,
	lightnessScale,
	maxRadius,
	modes,
	partsOf,
	reach,
	wheelSpaceNames,
	wheelSpaces,
	wrapped,
	type Parts,
	type WheelSpace,
} from 'delphitools-v2/components/tools/harmony-genny/harmony';
import Wheel from 'delphitools-v2/components/tools/harmony-genny/wheel';
import './harmony-genny/harmony-genny.css';

const Copy = <template><IconSvg @name="copy" /></template>;

const startColour = parseHex('3B82F6')!;
const modeTitles = modes.map((mode) => mode.title);

export default class HarmonyGenny extends Component {
	@service declare colourNotation: ColourNotationService;
	@service('canon-toast') declare toast: CanonToastService;

	@tracked space: WheelSpace;
	@tracked mode: number;
	@tracked asked: Parts;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.space = flags.space;
		this.mode = flags.mode ?? 0;
		this.asked = partsOf(this.space, flags.colour ?? startColour);
	}

	get parts(): Parts {
		const { l, r, h } = this.asked;
		return { l, r: Math.min(r, maxRadius(this.space, l, h)), h };
	}

	get base(): Rgb {
		const { l, r, h } = this.parts;
		return colourIn(this.space, l, r, h);
	}

	get colours() {
		return harmony(this.space, this.parts, this.mode);
	}

	get format() {
		return kitFormat(this.colourNotation.notation);
	}

	get text() {
		return this.colourNotation.format(hex(this.base));
	}

	get description() {
		return modes[this.mode]!.description;
	}

	get spaceIndex() {
		return wheelSpaces.indexOf(this.space);
	}

	get chromaTitle() {
		return this.space === 'hsl' ? 'Saturation' : 'Chroma';
	}

	get scale() {
		return lightnessScale(this.space);
	}

	get reach() {
		return reach[this.space];
	}

	get lightness() {
		return this.asked.l * this.scale;
	}

	get chroma() {
		return Math.min(this.asked.r, 1) * this.reach;
	}

	readLightness = (value: number) =>
		value.toFixed(this.space === 'oklch' ? 2 : 0);

	readChroma = (value: number) =>
		value.toFixed(this.space === 'oklch' ? 3 : 0);

	readHue = (value: number) => `${value.toFixed(0)}°`;

	get notations() {
		return this.colours.map((colour) =>
			this.colourNotation.format(hex(colour)),
		);
	}

	get lines() {
		const names = labels(this.space, this.mode, this.colours);
		return this.notations.map((value, i) => ({
			label: names[i]!,
			value,
		}));
	}

	get css() {
		const lines = this.notations.map(
			(value, i) => `  --harmony-${i + 1}: ${value};`,
		);
		return `:root {\n${lines.join('\n')}\n}`;
	}

	take(colour: Rgb) {
		const parts = partsOf(this.space, colour);
		this.asked =
			parts.r < 0.002 ? { ...parts, h: this.asked.h } : parts;
	}

	useColour = (colour: Rgb) => this.take(colour);

	parse = (text: string) => {
		const colour = readColour(text);
		if (colour) this.take(colour);
		return colour !== undefined;
	};

	typeLive = (event: Event) =>
		void this.parse((event.target as HTMLInputElement).value);

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	selectSpace = (index: number) => {
		const base = this.base;
		this.space = wheelSpaces[index]!;
		this.take(base);
	};

	selectMode = (index: number) => (this.mode = index);

	setLightness = (value: number) =>
		(this.asked = { ...this.asked, l: value / this.scale });

	setChroma = (value: number) =>
		(this.asked = { ...this.asked, r: value / this.reach });

	setHue = (value: number) =>
		(this.asked = { ...this.asked, h: wrapped(value) });

	turn = (h: number, r: number) => (this.asked = { ...this.asked, h, r });

	copyAll = () => void this.toast.copy(this.notations.join(', '));

	<template>
		<CanonSplit
			class="harmony-genny"
			@halves={{true}}
			@collapsesTo={{240}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<div class="hg-picture">
						<Wheel
							@space={{this.space}}
							@parts={{this.parts}}
							@mode={{this.mode}}
							@colours={{this.colours}}
							@onTurn={{this.turn}}
						/>
						<CanonColourStrip
							@colour={{this.base}}
							@palette={{this.colours}}
							@nameOf={{getColourName}}
						/>
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonColourNotationInput
						class="hg-input"
						@colour={{this.base}}
						@text={{this.text}}
						@onColour={{this.useColour}}
						@parse={{this.parse}}
						@label="Base"
						{{on "input" this.typeLive}}
						{{on "focusin" this.selectAll}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonRow @title="Space" @form="flush">
						<CanonSegmented
							@items={{wheelSpaceNames}}
							@selected={{this.spaceIndex}}
							@onChange={{this.selectSpace}}
						/>
					</CanonRow>
					<CanonRow
						@title="Lightness"
						@form="flush"
						@sizingTitle="Saturation"
						as |titleId|
					>
						<CanonSlider
							@value={{this.lightness}}
							@max={{this.scale}}
							@readout={{this.readLightness}}
							@labelledBy={{titleId}}
							@onChange={{this.setLightness}}
						/>
					</CanonRow>
					<CanonRow
						@title={{this.chromaTitle}}
						@form="flush"
						@sizingTitle="Saturation"
						as |titleId|
					>
						<CanonSlider
							@value={{this.chroma}}
							@max={{this.reach}}
							@readout={{this.readChroma}}
							@labelledBy={{titleId}}
							@onChange={{this.setChroma}}
						/>
					</CanonRow>
					<CanonRow
						@title="Hue"
						@form="flush"
						@sizingTitle="Saturation"
						as |titleId|
					>
						<CanonSlider
							@value={{this.parts.h}}
							@max={{360}}
							@readout={{this.readHue}}
							@labelledBy={{titleId}}
							@onChange={{this.setHue}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonPaletteCard
					@title="Harmony"
					@colours={{this.colours}}
					@height={{96}}
					@nameOf={{getColourName}}
					@primaryFormat={{this.format}}
				>
					<:picker>
						<CanonSegmented
							@items={{modeTitles}}
							@selected={{this.mode}}
							@columns={{2}}
							@onChange={{this.selectMode}}
						/>
						<p
							class="hg-description"
						>{{this.description}}</p>
					</:picker>
					<:actions>
						<CanonButton
							@kind="cell"
							@text="Copy All"
							@icon={{Copy}}
							@onClick={{this.copyAll}}
						/>
					</:actions>
				</CanonPaletteCard>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Colours" />
					{{#each this.lines as |line|}}
						<CanonValueLine
							@label={{line.label}}
							@value={{line.value}}
							@labelWidth={{56}}
						/>
					{{/each}}
				</CanonRows>
				<CanonCodeBlock
					@code={{this.css}}
					@language="CSS"
				/>
			</:main>
		</CanonSplit>
	</template>
}
