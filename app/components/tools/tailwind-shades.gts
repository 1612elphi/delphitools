import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import { readColour } from 'delphitools-v2/components/tools/colour-atlas/atlas';
import Ramp, {
	rampHeight,
} from 'delphitools-v2/components/tools/tailwind-shades/ramp';
import {
	cleanName,
	cssBlock,
	generateShades,
	GENERATION_MODES,
	oklchBlock,
	tailwindBlock,
} from 'delphitools-v2/components/tools/tailwind-shades/shades';
import './tailwind-shades/tailwind-shades.css';

const startColour = parseHex('3B82F6')!;
const modeTitles = GENERATION_MODES.map((mode) => mode.title);

function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const typed = query.get('tailwindColour');
	const carried = query.get('color');
	const mode = Number(query.get('tailwindMode') ?? NaN);
	return {
		colour:
			(typed ? readColour(typed) : undefined) ??
			(carried ? readColour(carried) : undefined),
		mode:
			Number.isInteger(mode) && GENERATION_MODES[mode]
				? mode
				: 0,
	};
}

export default class TailwindShades extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked base: Rgb;
	@tracked mode: number;
	@tracked name = 'primary';

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.base = flags.colour ?? startColour;
		this.mode = flags.mode;
	}

	get hex() {
		return hex(this.base);
	}

	get text() {
		return this.colourNotation.format(this.hex);
	}

	get shades() {
		return generateShades(
			this.hex,
			GENERATION_MODES[this.mode]!.value,
		)!;
	}

	get description() {
		return GENERATION_MODES[this.mode]!.description;
	}

	format = (code: string) => this.colourNotation.format(code);

	get lines() {
		return this.shades.map((shade) => ({
			label: String(shade.level),
			value: this.format(shade.hex),
		}));
	}

	get blocks() {
		const { shades, name, format } = this;
		return [
			{
				language: 'CSS Variables',
				code: cssBlock(shades, name, format),
			},
			{
				language: 'CSS Variables (OKLCH)',
				code: oklchBlock(shades, name),
			},
			{
				language: 'Tailwind Config',
				code: tailwindBlock(shades, name, format),
			},
		];
	}

	use = (colour: Rgb) => (this.base = colour);

	parse = (text: string) => {
		const colour = readColour(text);
		if (colour) this.base = colour;
		return colour !== undefined;
	};

	typeLive = (event: Event) =>
		void this.parse((event.target as HTMLInputElement).value);

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	setName = (event: Event) => {
		const field = event.target as HTMLInputElement;
		const cleaned = cleanName(field.value);
		if (field.value !== cleaned) field.value = cleaned;
		this.name = cleaned;
	};

	selectMode = (index: number) => (this.mode = index);

	<template>
		<CanonSplit class="tailwind-shades" @collapsesTo={{rampHeight}}>
			<:banner>
				<CanonCanvas
					@height={{rampHeight}}
					@background="var(--canon-muted)"
				>
					<Ramp
						@shades={{this.shades}}
						@base={{this.base}}
						@hex={{this.hex}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonColourNotationInput
						class="tw-input"
						@colour={{this.base}}
						@text={{this.text}}
						@onColour={{this.use}}
						@parse={{this.parse}}
						@label="Base"
						{{on "input" this.typeLive}}
						{{on "focusin" this.selectAll}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonRow
						@title="Name"
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="tw-name"
							@value={{this.name}}
							@placeholder="primary"
							aria-labelledby={{titleId}}
							spellcheck="false"
							autocomplete="off"
							autocapitalize="off"
							{{on
								"input"
								this.setName
							}}
						/>
					</CanonRow>
					<CanonRow @title="Mode" @form="stacked">
						<CanonSegmented
							@items={{modeTitles}}
							@selected={{this.mode}}
							@columns={{3}}
							@onChange={{this.selectMode}}
						/>
					</CanonRow>
					<p
						class="tw-description"
					>{{this.description}}</p>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Shades" />
					{{#each this.lines as |line|}}
						<CanonValueLine
							@label={{line.label}}
							@value={{line.value}}
							@labelWidth={{40}}
						/>
					{{/each}}
				</CanonRows>
				{{#each this.blocks key="language" as |block|}}
					<CanonCodeBlock
						@code={{block.code}}
						@language={{block.language}}
					/>
				{{/each}}
			</:main>
		</CanonSplit>
	</template>
}
