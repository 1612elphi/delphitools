import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { registerDestructor } from '@ember/destroyable';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { parseHex, type Rgb } from 'delphicanon/lib/colour';
import { stem } from 'delphicanon/lib/files';
import { springEasing } from 'delphicanon/lib/motion';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import {
	autoStops,
	bytes,
	defaultAngle,
	defaultDominant,
	fileName,
	fit,
	gradient,
	heightOf,
	maxRatio,
	minWidth,
	ratios,
	solid,
	widthLimit,
	widths,
	type Bytes,
	type MatteSpec,
	type MatteStyle,
	type Size,
} from 'delphitools-v2/components/tools/matte-genny/matte';
import type {
	MatteReply,
	MatteRequest,
} from 'delphitools-v2/components/tools/matte-genny/matte-worker';
import Picture from 'delphitools-v2/components/tools/matte-genny/picture';
import './matte-genny/matte-genny.css';

const loadFailed = 'Image could not be read. Try another file?';

const spring = htmlSafe(`--matte-spring: ${springEasing(0.82)}`);

const styleNames = ['Blur', 'Solid', 'Gradient'];
const ratioNames = [...ratios.map(([w, h]) => `${w}:${h}`), 'Custom'];
const widthNames = widths.map(String);
const clampRatio = (side: number) =>
	Math.min(Math.max(Math.round(side), 1), maxRatio);
const sameRatio = ([a, b]: [number, number], w: number, h: number) =>
	(a === w && b === h) || (a === h && b === w);
const pixelsText = (value: number) => `${value} px`;
const stopLabel = (index: number) => `Stop ${index + 1}`;
const degreesText = (value: number) => `${value}°`;
const rgbOf = (stop: Bytes): Rgb => [
	stop[0] / 255,
	stop[1] / 255,
	stop[2] / 255,
];

const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Swap = <template><IconSvg @name="arrow-left-right" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Plus = <template><IconSvg @name="plus" /></template>;
const Minus = <template><IconSvg @name="minus" /></template>;

interface Source {
	url: string;
	pixels: Size;
	stem: string;
}

function launchFlags() {
	const query = new URLSearchParams(window.location.search);
	const flag = (name: string) => {
		const value = query.get(name);
		return value === null ? undefined : Number(value) || 0;
	};
	const ratio = (query.get('matteRatio') ?? '')
		.split(':')
		.map(Number)
		.filter((side) => side > 0);
	return {
		style: ((flag('matteStyle') ?? 0) % 3) as MatteStyle,
		colour: parseHex(query.get('matteColour') ?? '') ?? [1, 1, 1],
		across: ratio.length === 2 ? clampRatio(ratio[0]!) : 1,
		down: ratio.length === 2 ? clampRatio(ratio[1]!) : 1,
		width: flag('matteWidth') ?? 1080,
		padding: Math.min(Math.max(flag('mattePadding') ?? 40, 0), 200),
		angle:
			(((flag('matteAngle') ?? defaultAngle) % 360) + 360) %
			360,
	};
}

export default class MatteGenny extends Component {
	@tracked style: MatteStyle;
	@tracked colour: Rgb;
	@tracked ratioW: number;
	@tracked ratioH: number;
	@tracked isCustom: boolean;
	@tracked widthValue: number;
	@tracked padding: number;
	@tracked dominant: Bytes = defaultDominant;
	@tracked customStops?: Bytes[];
	@tracked angle: number;
	@tracked source?: Source;
	@tracked failed = false;
	@tracked exporting = false;
	@tracked guides = false;
	@tracked over = false;

	#worker = new Worker(
		new URL('./matte-genny/matte-worker.ts', import.meta.url),
		{ type: 'module' },
	);
	#input?: HTMLInputElement;
	#request = 0;
	#loading = 0;
	#exporting = 0;
	#pending?: { url: string; stem: string };
	#guideTimer?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags();
		this.style = flags.style;
		this.colour = flags.colour;
		this.ratioW = flags.across;
		this.ratioH = flags.down;
		this.isCustom = !ratios.some((pair) =>
			sameRatio(pair, this.ratioW, this.ratioH),
		);
		this.widthValue = flags.width;
		this.padding = flags.padding;
		this.angle = flags.angle;
		this.#worker.onmessage = (event: MessageEvent<MatteReply>) =>
			this.#reply(event.data);
		this.#worker.onerror = () => {
			this.#exporting = 0;
			this.exporting = false;
		};
		registerDestructor(this, () => {
			window.clearTimeout(this.#guideTimer);
			this.#worker.terminate();
			if (this.#pending)
				URL.revokeObjectURL(this.#pending.url);
			if (this.source) URL.revokeObjectURL(this.source.url);
		});
	}

	get limit() {
		return widthLimit(this.ratioW, this.ratioH);
	}

	get width() {
		return Math.min(
			Math.max(this.widthValue, minWidth),
			this.limit,
		);
	}

	get spec(): MatteSpec {
		return {
			style: this.style,
			colour: bytes(this.colour),
			stops: this.stops,
			angle: this.angle,
			ratioW: this.ratioW,
			ratioH: this.ratioH,
			width: this.width,
			padding: this.padding,
		};
	}

	get stops() {
		return this.customStops ?? autoStops(this.dominant);
	}

	get stopWells() {
		return this.stops.map(rgbOf);
	}

	get isGradient() {
		return this.style === gradient;
	}

	get height() {
		return heightOf(this.width, this.ratioW, this.ratioH);
	}

	get aspect() {
		return Math.min(1.5, Math.max(0.8, this.ratioW / this.ratioH));
	}

	get ratioIndex() {
		if (this.isCustom) return ratios.length;
		const index = ratios.findIndex((pair) =>
			sameRatio(pair, this.ratioW, this.ratioH),
		);
		return index < 0 ? ratios.length : index;
	}

	get widthIndex() {
		return widths.indexOf(this.width);
	}

	get shape() {
		if (this.ratioW === this.ratioH) return 'Square';
		return this.ratioW > this.ratioH ? 'Landscape' : 'Portrait';
	}

	get square() {
		return this.ratioW === this.ratioH;
	}

	get isSolid() {
		return this.style === solid;
	}

	get ratioText() {
		return `${this.ratioW}:${this.ratioH}`;
	}

	get sourceText() {
		const pixels = this.source?.pixels;
		return pixels ? `${pixels.width} × ${pixels.height}` : '';
	}

	get tiles() {
		const { source } = this;
		if (!source) return [];
		const photo = fit(
			source.pixels,
			{ width: this.width, height: this.height },
			this.padding,
		);
		return [
			{ label: 'Source', value: this.sourceText },
			{
				label: 'Photo',
				value: `${Math.round(photo.width)} × ${Math.round(photo.height)}`,
			},
			{
				label: 'Scale',
				value: `${Math.round((photo.width / source.pixels.width) * 100)} %`,
			},
		];
	}

	get exportDisabled() {
		return !this.source || this.exporting;
	}

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) this.load(file);
	};

	dragOver = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		this.over = true;
	};

	dragLeave = (event: DragEvent) => {
		const root = event.currentTarget as Element;
		if (!root.contains(event.relatedTarget as Node | null))
			this.over = false;
	};

	drop = (event: DragEvent) => {
		this.over = false;
		const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
			matchesAccept(f, 'image/*'),
		);
		if (!file) return;
		event.preventDefault();
		this.load(file);
	};

	#reply(reply: MatteReply) {
		if (reply.id === this.#exporting) {
			this.#exporting = 0;
			this.exporting = false;
			if (reply.kind === 'rendered' && this.source)
				downloadBlob(
					reply.blob,
					fileName(
						this.source.stem,
						this.width,
						this.height,
					),
				);
			return;
		}
		const pending = this.#pending;
		if (reply.id !== this.#loading || !pending) return;
		this.#loading = 0;
		this.#pending = undefined;
		if (reply.kind !== 'loaded') {
			URL.revokeObjectURL(pending.url);
			this.clear();
			this.failed = true;
			return;
		}
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.source = {
			url: pending.url,
			stem: pending.stem,
			pixels: { width: reply.width, height: reply.height },
		};
		this.dominant = reply.dominant;
		this.failed = false;
	}

	#post(request: MatteRequest) {
		this.#worker.postMessage(request);
	}

	load = (file: File) => {
		if (this.#pending) URL.revokeObjectURL(this.#pending.url);
		this.#pending = {
			url: URL.createObjectURL(file),
			stem: stem(file.name) || 'image',
		};
		this.#loading = ++this.#request;
		this.#post({ kind: 'load', id: this.#loading, file });
	};

	clear = () => {
		if (this.#pending) URL.revokeObjectURL(this.#pending.url);
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.#pending = undefined;
		this.#loading = 0;
		this.#exporting = 0;
		this.source = undefined;
		this.dominant = defaultDominant;
		this.failed = false;
		this.exporting = false;
	};

	pickStyle = (index: number) => (this.style = index as MatteStyle);

	pickColour = (colour: Rgb) => (this.colour = colour);

	pickRatio = (index: number) => {
		this.isCustom = index === ratios.length;
		if (this.isCustom) return;
		const [short, long] = ratios[index]!;
		[this.ratioW, this.ratioH] =
			this.ratioW > this.ratioH
				? [long, short]
				: [short, long];
	};

	pickStop = (index: number, colour: Rgb) => {
		const stops = [...this.stops];
		stops[index] = bytes(colour);
		this.customStops = stops;
	};

	addStop = () => {
		const { stops } = this;
		this.customStops = [...stops, stops[stops.length - 1]!];
	};

	removeStop = () => {
		this.customStops = this.stops.slice(0, -1);
	};

	get removeStopDisabled() {
		return this.stops.length <= 2;
	}

	setAngle = (value: number) => (this.angle = value);

	swap = () => {
		[this.ratioW, this.ratioH] = [this.ratioH, this.ratioW];
	};

	setAcross = (value: number) => (this.ratioW = value);

	setDown = (value: number) => (this.ratioH = value);

	pickWidth = (index: number) => (this.widthValue = widths[index]!);

	setWidth = (value: number) => (this.widthValue = value);

	setPadding = (value: number) => {
		this.padding = value;
		this.guides = true;
		window.clearTimeout(this.#guideTimer);
		this.#guideTimer = window.setTimeout(
			() => (this.guides = false),
			1000,
		);
	};

	export = () => {
		if (this.exportDisabled) return;
		this.exporting = true;
		this.#exporting = ++this.#request;
		this.#post({
			kind: 'render',
			id: this.#exporting,
			spec: this.spec,
		});
	};

	<template>
		<CanonSplit
			class="matte-genny"
			@halves={{true}}
			@collapsesTo={{200}}
			style={{spring}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.dragOver}}
			{{on "dragleave" this.dragLeave}}
			{{on "drop" this.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@spec={{this.spec}}
						@photo={{this.source.url}}
						@pixels={{this.source.pixels}}
						@guides={{this.guides}}
						@busy={{this.exporting}}
						@onChoose={{this.choose}}
						@over={{this.over}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="matte-source"
							@title={{this.source.stem}}
							@detail={{this.sourceText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					</CanonRows>
				{{else if this.failed}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							@text={{loadFailed}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Style" />
					<CanonSegmented
						class="matte-styles"
						@items={{styleNames}}
						@selected={{this.style}}
						@onChange={{this.pickStyle}}
					/>
					{{#if this.isSolid}}
						<CanonColourWell
							@label="Colour"
							@colour={{this.colour}}
							@onChange={{this.pickColour}}
						/>
					{{/if}}
					{{#if this.isGradient}}
						{{#each
							this.stopWells
							as |stop index|
						}}
							<CanonColourWell
								class="matte-stop"
								@label={{stopLabel
									index
								}}
								@colour={{stop}}
								@onChange={{fn
									this.pickStop
									index
								}}
							/>
						{{/each}}
						<CanonGrid @columns={{2}}>
							<CanonButton
								class="matte-add-stop"
								@kind="cell"
								@text="Add Stop"
								@icon={{Plus}}
								@onClick={{this.addStop}}
							/>
							<CanonButton
								class="matte-remove-stop"
								@kind="cell"
								@text="Remove Stop"
								@icon={{Minus}}
								@disabled={{this.removeStopDisabled}}
								@onClick={{this.removeStop}}
							/>
						</CanonGrid>
						<CanonRow
							class="matte-angle"
							@title="Angle"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.angle}}
								@min={{0}}
								@max={{359}}
								@step={{1}}
								@readout={{degreesText}}
								@labelledBy={{titleId}}
								@onChange={{this.setAngle}}
							/>
						</CanonRow>
					{{/if}}
					<CanonHeading @text="Ratio" />
					<CanonSegmented
						class="matte-ratios"
						@items={{ratioNames}}
						@selected={{this.ratioIndex}}
						@onChange={{this.pickRatio}}
					/>
					{{#if this.isCustom}}
						<CanonGrid @columns={{2}}>
							<CanonNumberField
								@value={{this.ratioW}}
								@min={{1}}
								@max={{maxRatio}}
								@label="Ratio width"
								@onChange={{this.setAcross}}
							/>
							<CanonNumberField
								@value={{this.ratioH}}
								@min={{1}}
								@max={{maxRatio}}
								@label="Ratio height"
								@onChange={{this.setDown}}
							/>
						</CanonGrid>
					{{/if}}
					<CanonRow
						class="matte-orientation"
						@title={{this.ratioText}}
						@detail={{this.shape}}
						@form="flush"
					>
						<CanonButton
							@kind="cell"
							@text="Swap"
							@icon={{Swap}}
							@disabled={{this.square}}
							@onClick={{this.swap}}
						/>
					</CanonRow>
					<CanonHeading @text="Output" />
					<CanonSegmented
						class="matte-widths"
						@items={{widthNames}}
						@selected={{this.widthIndex}}
						@onChange={{this.pickWidth}}
					/>
					<CanonRow
						class="matte-width"
						@title="Width"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.width}}
							@min={{minWidth}}
							@max={{this.limit}}
							@step={{10}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setWidth}}
						/>
					</CanonRow>
					<CanonRow
						class="matte-padding"
						@title="Padding"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.padding}}
							@min={{0}}
							@max={{200}}
							@step={{10}}
							@readout={{pixelsText}}
							@labelledBy={{titleId}}
							@onChange={{this.setPadding}}
						/>
					</CanonRow>
					<CanonButton
						class="matte-download"
						@kind="primary"
						@text={{passAlong "Download"}}
						@icon={{Save}}
						@iconStyle="oversized"
						@disabled={{this.exportDisabled}}
						@onClick={{this.export}}
					/>
				</CanonRows>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Image" />
						<CanonTiles
							@items={{this.tiles}}
						/>
					</CanonRows>
				{{/if}}
				{{! template-lint-disable require-input-label }}
				<input
					type="file"
					accept="image/*"
					hidden
					{{this.keepInput}}
					{{on "change" this.picked}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
