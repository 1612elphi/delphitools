import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import {
	pointFor,
	solidSpaces,
	spaceNames,
	type SolidSpace,
} from 'delphicanon/lib/colour-space';
import { IconSvg } from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { carryColour } from 'delphitools-v2/lib/colour-query';
import {
	colourOf,
	decimalRgb,
	examples,
	format,
	launchFlags,
	pointOf,
	read,
	valuesAt,
	valuesOf,
} from 'delphitools-v2/components/tools/colour-converter/notation';
import Ribbons from 'delphitools-v2/components/tools/colour-converter/ribbons';
import './colour-converter/colour-converter.css';

const startColour = parseHex('3B82F6')!;

const labelWidth = 76;

const closestName = (colour: Rgb) => getColourName(hex(colour));

const Grid = <template><IconSvg @name="layout-grid" /></template>;

export default class ColourConverter extends Component {
	state: CanonColourSolidState;
	@tracked grid = false;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.state = new CanonColourSolidState({
			space: flags.space ?? 'rgb',
			colour: flags.colour ?? startColour,
			activeRow: flags.row ?? 2,
		});
		this.state.viewPlane = flags.ortho;
		this.grid = flags.grid;
		if (flags.typed) this.#take(flags.typed);
	}

	get colour(): Rgb {
		return this.state.colour;
	}

	get hex() {
		return hex(this.colour);
	}

	get carried() {
		return this.hex.toLowerCase();
	}

	values(space: SolidSpace) {
		return space === this.state.space
			? valuesAt(this.state.point, space)
			: valuesOf(this.colour, space);
	}

	get text() {
		return format(this.values(this.state.space), this.state.space);
	}

	get placeholder() {
		return examples[this.state.space];
	}

	get lit() {
		return this.state.slices
			? Math.min(this.state.activeRow, 2)
			: undefined;
	}

	get spaces() {
		return solidSpaces.map((space) => {
			const values = this.values(space);
			return {
				space,
				label: spaceNames[space].toUpperCase(),
				value: format(values, space),
				values,
				lit:
					space === this.state.space
						? this.lit
						: undefined,
				rgb: space === 'rgb',
				oklch: space === 'oklch',
			};
		});
	}

	get cells() {
		return solidSpaces.map((space) => ({
			space,
			label: spaceNames[space],
			point:
				space === this.state.space
					? this.state.point
					: pointFor(space, this.colour),
			current: space === this.state.space,
		}));
	}

	toggleGrid = () => (this.grid = !this.grid);

	pickColour = (_point: unknown, colour: Rgb) =>
		this.state.setPoint(pointFor(this.state.space, colour), false);

	get name() {
		return getColourName(this.hex);
	}

	get decimal() {
		return decimalRgb(this.colour);
	}

	pick = (space: SolidSpace, values: number[], animated: boolean) => {
		const point =
			space === this.state.space
				? pointOf(values, space)
				: pointFor(
						this.state.space,
						colourOf(values, space),
					);
		this.state.setPoint(point, animated);
	};

	#take(text: string) {
		const values = read(text, this.state.space);
		if (values) this.pick(this.state.space, values, true);
		return values;
	}

	parse = (text: string) =>
		this.#take(text) !== undefined || text.trim() === '';

	typeLive = (event: Event) =>
		void this.#take((event.target as HTMLInputElement).value);

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	<template>
		<CanonSplit
			class="colour-converter"
			@halves={{true}}
			@collapsesTo={{240}}
			{{carryColour this.carried}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1.4}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<div class="cc-picture">
						{{#if this.grid}}
							<div class="cc-grid">
								{{#each
									this.cells
									key="space"
									as |cell|
								}}
									<div
										class="cc-cell
											{{if
												cell.current
												'cc-cell--current'
											}}"
									>
										<CanonColourSolid
											@space={{cell.space}}
											@point={{cell.point}}
											@animated={{this.state.animated}}
											@onChange={{this.pickColour}}
											@closestName={{closestName}}
										/>
										<span
											class="cc-cell-label"
											aria-hidden="true"
										>{{cell.label}}</span>
									</div>
								{{/each}}
							</div>
						{{else}}
							<CanonColourSolid
								class="cc-solid"
								@space={{this.state.space}}
								@point={{this.state.point}}
								@animated={{this.state.animated}}
								@sliceAxis={{this.state.sliceAxis}}
								@isOrtho={{this.state.isOrtho}}
								@showsWhole={{this.state.showsWhole}}
								@onChange={{this.state.pick}}
								@closestName={{closestName}}
							/>
						{{/if}}
						<CanonButton
							class="cc-grid-toggle"
							@kind="segment"
							@icon={{Grid}}
							@label="All spaces"
							@selected={{this.grid}}
							@onClick={{this.toggleGrid}}
							aria-pressed={{if
								this.grid
								"true"
								"false"
							}}
						/>
						<CanonColourStrip
							@colour={{this.colour}}
							@nameOf={{getColourName}}
						/>
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonColourNotationInput
						class="cc-input"
						@colour={{this.colour}}
						@text={{this.text}}
						@onColour={{this.state.use}}
						@parse={{this.parse}}
						@placeholder={{this.placeholder}}
						@label="Any notation"
						{{on "input" this.typeLive}}
						{{on "focusin" this.selectAll}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="All Formats" />
					<CanonValueLine
						@label="Name"
						@value={{this.name}}
						@labelWidth={{labelWidth}}
					/>
					{{#each
						this.spaces key="space"
						as |line|
					}}
						{{#if line.rgb}}
							<CanonHeading
								@text="sRGB"
							/>
							<CanonValueLine
								@label="HEX"
								@value={{this.hex}}
								@labelWidth={{labelWidth}}
							/>
						{{else if line.oklch}}
							<CanonHeading
								@text="D65"
							/>
						{{/if}}
						<CanonValueLine
							@label={{line.label}}
							@value={{line.value}}
							@labelWidth={{labelWidth}}
						/>
						{{#if line.rgb}}
							<CanonValueLine
								@label="Decimal RGB"
								@value={{this.decimal}}
								@labelWidth={{labelWidth}}
							/>
						{{/if}}
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonColourControls
						@state={{this.state}}
						@hidesNotation={{true}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Channels" />
					{{#each
						this.spaces key="space"
						as |line|
					}}
						<CanonHeading
							@text={{line.label}}
						/>
						<Ribbons
							@space={{line.space}}
							@values={{line.values}}
							@lit={{line.lit}}
							@animated={{this.state.animated}}
							@onPick={{this.pick}}
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
