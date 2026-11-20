import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonRule from 'delphicanon/components/canon-rule';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { hex, type Rgb } from 'delphicanon/lib/colour';
import type { SolidPoint } from 'delphicanon/lib/colour-space';
import { IconSvg } from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { colourFromUrl } from 'delphitools-v2/lib/colour-query';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import {
	kitFormat,
	readColour,
} from 'delphitools-v2/components/tools/colour-atlas/atlas';
import AngleDial from 'delphitools-v2/components/tools/gradient-genny/dial';
import { GradientModel } from 'delphitools-v2/components/tools/gradient-genny/model';
import {
	clamp,
	colourAt,
	cornerKeys,
	cornerTitles,
	gradientCss,
	launchFlags,
	maxExport,
	minExport,
	modes,
	modeTitles,
	renderGradient,
	rgbOf,
	sizePresets,
	spaces,
	spaceTitles,
	type CornerKey,
	type GridSize,
} from 'delphitools-v2/components/tools/gradient-genny/paint';
import GradientPicture from 'delphitools-v2/components/tools/gradient-genny/picture';
import './gradient-genny/gradient-genny.css';

const Plus = <template><IconSvg @name="plus" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Blend = <template><IconSvg @name="blend" /></template>;
const Crosshair = <template><IconSvg @name="crosshair" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const gridTitles = ['2×2', '3×3'];
const gridSizes: GridSize[] = [2, 3];
const sizeLabels = sizePresets.map((preset) => preset.label);
const closestName = (colour: Rgb) => getColourName(hex(colour));
const readNoise = (value: number) => `${Math.round(value)} %`;

class PickState extends CanonColourSolidState {
	onPick?: (colour: Rgb) => void;

	setPoint(point: SolidPoint, animated: boolean) {
		super.setPoint(point, animated);
		this.onPick?.(this.colour);
	}
}

export default class GradientGenny extends Component {
	@service declare colourNotation: ColourNotationService;

	model: GradientModel;
	state: PickState;
	@tracked width = 800;
	@tracked height = 600;
	@tracked solidAspect = 1;
	#selecting = false;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		const carried = colourFromUrl();
		const model = new GradientModel({
			carried: carried ? hex(rgbOf(carried)) : undefined,
			mode: flags.mode,
			space: flags.space,
			angle:
				flags.angle === undefined
					? undefined
					: Math.round(flags.angle) % 360,
			centre: flags.centre,
			stops: flags.stops,
			blends: flags.blends,
			noise: flags.noise,
			select: flags.select,
		});
		if (flags.size) {
			this.width = flags.size.width;
			this.height = flags.size.height;
		}
		this.model = model;
		const first = model.selectedColour ?? '#3B82F6';
		this.state = new PickState({
			space: 'rgb',
			colour: rgbOf(first),
			activeRow: 2,
		});
		this.state.onPick = this.picked;
	}

	get format() {
		return kitFormat(this.colourNotation.notation);
	}

	get css() {
		return gradientCss(this.model, this.colourNotation.format);
	}

	get modeIndex() {
		return modes.indexOf(this.model.mode);
	}

	get spaceIndex() {
		return spaces.indexOf(this.model.space);
	}

	get isFreeform() {
		return this.model.mode === 'freeform';
	}

	get isCorners() {
		return this.model.mode === 'corners';
	}

	get showsSpace() {
		return this.model.isStops;
	}

	get showsAngle() {
		const { mode } = this.model;
		return mode === 'linear' || mode === 'conic';
	}

	get angleTitle() {
		return this.model.mode === 'conic' ? 'Start' : 'Angle';
	}

	get showsCentre() {
		const { mode } = this.model;
		return mode === 'radial' || mode === 'conic';
	}

	get centreText() {
		const { x, y } = this.model.centre;
		return `${Math.round(x * 100)} %, ${Math.round(y * 100)} %`;
	}

	get centred() {
		const { x, y } = this.model.centre;
		return x === 0.5 && y === 0.5;
	}

	get gridIndex() {
		return gridSizes.indexOf(this.model.gridSize);
	}

	get colourHeading() {
		const { mode } = this.model;
		if (mode === 'corners') return 'Corner Colours';
		return mode === 'freeform' ? 'Points' : 'Colour Stops';
	}

	get cornerIndex() {
		return cornerKeys.indexOf(this.model.selected as CornerKey);
	}

	get selectedHex() {
		return this.model.selectedColour ?? '#000000';
	}

	get colourText() {
		return this.colourNotation.format(this.selectedHex);
	}

	get colour(): Rgb {
		return this.state.colour;
	}

	get position() {
		return this.model.selectedStop?.position ?? 0;
	}

	get marks(): Rgb[] {
		const { model } = this;
		if (model.mode === 'corners')
			return cornerKeys
				.filter((key) => key !== model.selected)
				.map((key) => rgbOf(model.corners[key]));
		if (model.mode === 'freeform')
			return model.points
				.filter((point) => point.id !== model.selected)
				.map((point) => rgbOf(point.colour));
		return Array.from({ length: 17 }, (_, i) =>
			rgbOf(
				colourAt(
					model.stops,
					(i / 16) * 100,
					model.space,
				),
			),
		);
	}

	get presetIndex() {
		return sizePresets.findIndex(
			(preset) =>
				preset.width === this.width &&
				preset.height === this.height,
		);
	}

	get pictureAspect() {
		return clamp(this.width / this.height, 0.8, 1.6);
	}

	#sync() {
		const colour = this.model.selectedColour;
		if (!colour) return;
		this.#selecting = true;
		this.state.use(rgbOf(colour));
		this.#selecting = false;
	}

	select = (id: string) => {
		this.model.selected = id;
		this.#sync();
	};

	picked = (colour: Rgb) => {
		if (this.#selecting) return;
		this.model.setColour(hex(colour));
	};

	pickMode = (index: number) => {
		this.model.setMode(modes[index]!);
		this.#sync();
	};

	pickCorner = (index: number) => this.select(cornerKeys[index]!);

	parse = (text: string) => {
		const colour = readColour(text);
		if (!colour) return false;
		this.model.setColour(hex(colour));
		this.#sync();
		return true;
	};

	typeLive = (event: Event) =>
		void this.parse((event.target as HTMLInputElement).value);

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	pickSpace = (index: number) => (this.model.space = spaces[index]!);

	setAngle = (degrees: number) =>
		(this.model.angle = Math.round(((degrees % 360) + 360) % 360));

	resetCentre = () => (this.model.centre = { x: 0.5, y: 0.5 });

	pickGrid = (index: number) => {
		this.model.setGrid(gridSizes[index]!);
		this.#sync();
	};

	setPosition = (value: number) => {
		this.model.setPosition(this.model.selected, value);
	};

	addStop = () => {
		this.model.addStop();
		this.#sync();
	};

	addPoint = () => {
		this.model.addPointAt({ x: 0.5, y: 0.5 });
		this.#sync();
	};

	remove = () => {
		this.model.removeSelected();
		this.#sync();
	};

	blend = () => this.model.blend();

	pickPreset = (index: number) => {
		const preset = sizePresets[index];
		if (!preset) return;
		this.width = preset.width;
		this.height = preset.height;
	};

	setWidth = (value: number) => (this.width = value);

	setHeight = (value: number) => (this.height = value);

	setNoise = (value: number) => (this.model.noise = Math.round(value));

	download = () => {
		const canvas = document.createElement('canvas');
		renderGradient(
			canvas,
			Math.round(clamp(this.width, minExport, maxExport)),
			Math.round(clamp(this.height, minExport, maxExport)),
			this.model,
		);
		canvas.toBlob((blob) => {
			if (blob)
				downloadBlob(
					blob,
					`gradient-${this.model.mode}.png`,
				);
		}, 'image/png');
	};

	measureSolid = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			const width = element.clientWidth;
			if (!width) return;
			const aspect = Math.max(
				1,
				Math.round((width / 420) * 20) / 20,
			);
			if (aspect !== this.solidAspect)
				this.solidAspect = aspect;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	<template>
		<CanonSplit
			class="gradient-genny"
			@halves={{true}}
			@collapsesTo={{240}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.pictureAspect}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<GradientPicture
						@model={{this.model}}
						@width={{this.width}}
						@height={{this.height}}
						@onSelect={{this.select}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows class="gg-type" @framed={{true}}>
					<CanonSegmented
						class="gg-modes"
						@items={{modeTitles}}
						@selected={{this.modeIndex}}
						@onChange={{this.pickMode}}
						aria-label="Type"
					/>
					{{#if this.showsSpace}}
						<CanonRow
							@title="Interpolation"
							@form="flush"
						>
							<CanonSegmented
								@items={{spaceTitles}}
								@selected={{this.spaceIndex}}
								@onChange={{this.pickSpace}}
								aria-label="Interpolation"
							/>
						</CanonRow>
					{{/if}}
					{{#if this.showsAngle}}
						<CanonRow
							@title={{this.angleTitle}}
							@form="flush"
							as |titleId|
						>
							<div class="gg-angle">
								<AngleDial
									@value={{this.model.angle}}
									@label={{this.angleTitle}}
									@onChange={{this.setAngle}}
								/>
								<CanonRule
									@vertical={{true}}
								/>
								<CanonDecimalField
									@value={{this.model.angle}}
									@max={{359}}
									@unit="°"
									@step={{15}}
									@decimals={{0}}
									@labelledBy={{titleId}}
									@onChange={{this.setAngle}}
								/>
							</div>
						</CanonRow>
					{{/if}}
					{{#if this.showsCentre}}
						<CanonRow
							@title="Centre"
							@detail={{this.centreText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Reset"
								@icon={{Crosshair}}
								@disabled={{this.centred}}
								@onClick={{this.resetCentre}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.isFreeform}}
						<CanonRow
							@title="Grid"
							@form="flush"
						>
							<CanonSegmented
								@items={{gridTitles}}
								@selected={{this.gridIndex}}
								@onChange={{this.pickGrid}}
								aria-label="Grid"
							/>
						</CanonRow>
					{{/if}}
				</CanonRows>
				<CanonCanvas
					@aspect={{this.solidAspect}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
					{{this.measureSolid}}
				>
					<div class="gg-solid">
						<CanonColourSolid
							class="gg-solid-body"
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
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text={{this.colourHeading}}
					/>
					{{#if this.isCorners}}
						<CanonSegmented
							@items={{cornerTitles}}
							@selected={{this.cornerIndex}}
							@columns={{2}}
							@onChange={{this.pickCorner}}
							aria-label="Corner"
						/>
					{{/if}}
					<CanonColourNotationInput
						class="gg-colour"
						@colour={{this.colour}}
						@text={{this.colourText}}
						@onColour={{this.state.use}}
						@parse={{this.parse}}
						@label="Colour"
						{{on "input" this.typeLive}}
						{{on "focusin" this.selectAll}}
					/>
					<CanonColourControls
						@state={{this.state}}
						@hidesNotation={{true}}
					/>
					{{#if this.model.isStops}}
						<CanonRow
							@title="Position"
							@form="flush"
							as |titleId|
						>
							<CanonDecimalField
								@value={{this.position}}
								@max={{100}}
								@unit="%"
								@step={{1}}
								@decimals={{0}}
								@labelledBy={{titleId}}
								@onChange={{this.setPosition}}
							/>
						</CanonRow>
						<CanonGrid @columns={{3}}>
							<CanonButton
								@kind="cell"
								@text="Add Stop"
								@icon={{Plus}}
								@onClick={{this.addStop}}
							/>
							<CanonButton
								@kind="cell"
								@text="Remove"
								@icon={{Trash}}
								@disabled={{if
									this.model.canRemove
									false
									true
								}}
								@onClick={{this.remove}}
							/>
							<CanonButton
								@kind="cell"
								@text="Pigment Blend"
								@icon={{Blend}}
								@disabled={{if
									this.model.canBlend
									false
									true
								}}
								@onClick={{this.blend}}
								title="Add intermediate colours using OKLab blending for vibrant, paint-like transitions"
							/>
						</CanonGrid>
					{{else if this.isFreeform}}
						<CanonGrid @columns={{2}}>
							<CanonButton
								@kind="cell"
								@text="Add Point"
								@icon={{Plus}}
								@onClick={{this.addPoint}}
							/>
							<CanonButton
								@kind="cell"
								@text="Remove"
								@icon={{Trash}}
								@disabled={{if
									this.model.canRemove
									false
									true
								}}
								@onClick={{this.remove}}
							/>
						</CanonGrid>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Image" />
					<CanonSegmented
						@items={{sizeLabels}}
						@selected={{this.presetIndex}}
						@columns={{4}}
						@onChange={{this.pickPreset}}
						aria-label="Size"
					/>
					<CanonRow
						@title="Width"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.width}}
							@min={{minExport}}
							@max={{maxExport}}
							@step={{100}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setWidth}}
						/>
					</CanonRow>
					<CanonRow
						@title="Height"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.height}}
							@min={{minExport}}
							@max={{maxExport}}
							@step={{100}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setHeight}}
						/>
					</CanonRow>
					<CanonRow
						@title="Noise"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.model.noise}}
							@max={{100}}
							@step={{1}}
							@readout={{readNoise}}
							@labelledBy={{titleId}}
							@onChange={{this.setNoise}}
						/>
					</CanonRow>
					<CanonStatus
						@text="Adds grain texture to reduce banding. Only applies to image export, not CSS."
						@tone="muted"
						@row={{true}}
					/>
					<CanonButton
						class="gg-download"
						@kind="primary"
						@text={{passAlong
							"Download PNG"
						}}
						@icon={{Save}}
						@iconStyle="oversized"
						@onClick={{this.download}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonCodeBlock
						@code={{this.css}}
						@language="CSS"
					/>
					{{#if this.isFreeform}}
						<CanonStatus
							@text="Approximate"
							@tone="muted"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
