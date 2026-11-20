import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourCard from 'delphicanon/components/canon-colour-card';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonPaletteCard from 'delphicanon/components/canon-palette-card';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import OpenIn from 'delphitools-v2/components/tools/media/open-in';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { carryColour, colourToQuery } from 'delphitools-v2/lib/colour-query';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import {
	contrastRows,
	gamutTiles,
	harmonies,
	harmony,
	kitFormat,
	launchFlags,
	notationLines,
	readColour,
	scale,
	visionCards,
} from 'delphitools-v2/components/tools/colour-atlas/atlas';
import ContrastRow from 'delphitools-v2/components/tools/colour-atlas/contrast-row';
import './colour-atlas/colour-atlas.css';

const startColour = parseHex('3B82F6')!;
const harmonyTitles = harmonies.map((h) => h.title);
const urlPauseMs = 300;

const openIn = [
	{ id: 'contrast-checker', name: 'Contrast Checker', icon: 'contrast' },
	{ id: 'harmony-genny', name: 'Harmony Generator', icon: 'rainbow' },
	{ id: 'tailwind-shades', name: 'Tailwind Shades', icon: 'wind' },
	{ id: 'palette-genny', name: 'Palette Generator', icon: 'palette' },
	{ id: 'gradient-genny', name: 'Gradient Generator', icon: 'blend' },
	{ id: 'colorblind-sim', name: 'Blindness Simulator', icon: 'eye' },
];

const closestName = (colour: Rgb) => getColourName(hex(colour));

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.matches('input, textarea, select'));

export default class ColourAtlas extends Component {
	@service declare colourNotation: ColourNotationService;

	state: CanonColourSolidState;
	@tracked harmonyIndex = 0;
	#urlArmed = false;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.state = new CanonColourSolidState({
			space: flags.space ?? 'rgb',
			colour: flags.colour ?? startColour,
			activeRow: flags.row ?? 2,
		});
		this.state.viewPlane = flags.ortho;
		if (flags.harmony !== undefined)
			this.harmonyIndex = flags.harmony;
		if (!flags.orthoLater) return;
		const timers = [
			window.setTimeout(
				() => (this.state.viewPlane = true),
				2000,
			),
			window.setTimeout(
				() => (this.state.viewPlane = false),
				5000,
			),
		];
		registerDestructor(this, () =>
			timers.forEach((timer) => window.clearTimeout(timer)),
		);
	}

	get colour(): Rgb {
		return this.state.colour;
	}

	get hex() {
		return hex(this.colour);
	}

	get format() {
		return kitFormat(this.colourNotation.notation);
	}

	get text() {
		return this.colourNotation.format(this.hex);
	}

	get notations() {
		return notationLines(this.colour);
	}

	get gamut() {
		return gamutTiles(this.colour);
	}

	get contrast() {
		return contrastRows(this.colour);
	}

	get harmony() {
		return harmony(
			this.colour,
			harmonies[this.harmonyIndex]!.offsets,
		);
	}

	get marks() {
		const { offsets } = harmonies[this.harmonyIndex]!;
		return this.harmony.filter((_, i) => offsets[i] !== 0);
	}

	get tints() {
		return scale(this.colour, 1);
	}

	get shades() {
		return scale(this.colour, 0);
	}

	get vision() {
		return visionCards(this.colour);
	}

	get queryColour() {
		return colourToQuery(this.hex);
	}

	pickHarmony = (index: number) => (this.harmonyIndex = index);

	parse = (text: string) => {
		const colour = readColour(text);
		if (colour) this.state.use(colour);
		return colour !== undefined;
	};

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	typeLive = (event: Event) => {
		const colour = readColour(
			(event.target as HTMLInputElement).value,
		);
		if (colour) this.state.use(colour);
	};

	pasteAnywhere = modifier(() => {
		const paste = (event: ClipboardEvent) => {
			if (editable(event.target)) return;
			const colour = readColour(
				event.clipboardData?.getData('text') ?? '',
			);
			if (!colour) return;
			event.preventDefault();
			this.state.use(colour);
		};
		document.addEventListener('paste', paste);
		return () => document.removeEventListener('paste', paste);
	});

	syncUrl = modifier((_element: Element, [code]: [string]) => {
		if (!this.#urlArmed) {
			this.#urlArmed = true;
			return;
		}
		const timer = window.setTimeout(() => {
			const url = new URL(window.location.href);
			url.searchParams.set('color', colourToQuery(code));
			window.history.replaceState(
				window.history.state,
				'',
				url,
			);
		}, urlPauseMs);
		return () => window.clearTimeout(timer);
	});

	<template>
		<CanonSplit
			class="colour-atlas"
			@halves={{true}}
			@collapsesTo={{240}}
			{{this.pasteAnywhere}}
			{{this.syncUrl this.hex}}
			{{carryColour this.hex}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<div class="colour-atlas-picture">
						<CanonColourSolid
							class="colour-atlas-solid"
							@space={{this.state.space}}
							@point={{this.state.point}}
							@animated={{this.state.animated}}
							@sliceAxis={{this.state.sliceAxis}}
							@isOrtho={{this.state.isOrtho}}
							@showsWhole={{this.state.showsWhole}}
							@marks={{this.marks}}
							@onChange={{this.state.pick}}
							@closestName={{closestName}}
						/>
						<CanonColourStrip
							@colour={{this.colour}}
							@nameOf={{getColourName}}
							@format={{this.format}}
						/>
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonColourNotationInput
						class="colour-atlas-input"
						@colour={{this.colour}}
						@text={{this.text}}
						@onColour={{this.state.use}}
						@parse={{this.parse}}
						@label="Any notation"
						{{on "input" this.typeLive}}
						{{on "focusin" this.selectAll}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonColourControls
						@state={{this.state}}
						@hidesNotation={{true}}
					/>
				</CanonRows>
				<CanonColourCard
					@colour={{this.colour}}
					@nameOf={{getColourName}}
					@primaryFormat={{this.format}}
				/>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Notations" />
					{{#each this.notations as |line|}}
						<CanonValueLine
							@label={{line.label}}
							@value={{line.value}}
							@labelWidth={{92}}
						/>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Gamut" />
					<CanonTiles @items={{this.gamut}} />
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Contrast" />
					{{#each this.contrast as |row|}}
						<ContrastRow
							@colour={{this.colour}}
							@row={{row}}
						/>
					{{/each}}
				</CanonRows>
				<CanonPaletteCard
					@title="Harmonies"
					@colours={{this.harmony}}
					@height={{96}}
					@nameOf={{getColourName}}
					@primaryFormat={{this.format}}
				>
					<:picker>
						<CanonSegmented
							@items={{harmonyTitles}}
							@selected={{this.harmonyIndex}}
							@columns={{2}}
							@onChange={{this.pickHarmony}}
						/>
					</:picker>
				</CanonPaletteCard>
				<CanonPaletteCard
					@title="Tints"
					@colours={{this.tints}}
					@height={{96}}
					@nameOf={{getColourName}}
					@primaryFormat={{this.format}}
				/>
				<CanonPaletteCard
					@title="Shades"
					@colours={{this.shades}}
					@height={{96}}
					@nameOf={{getColourName}}
					@primaryFormat={{this.format}}
				/>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="Colour blindness"
					/>
					{{#each this.vision as |card|}}
						<CanonColourCard
							@colour={{card.colour}}
							@name={{card.name}}
							@layout="row"
							@primaryFormat={{this.format}}
						/>
					{{/each}}
				</CanonRows>
				<OpenIn
					@tools={{openIn}}
					@query={{hash color=this.queryColour}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
