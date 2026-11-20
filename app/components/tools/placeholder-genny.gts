import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { springEasing } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob, downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import {
	aspect,
	base64Utf8,
	baseName,
	maxDimension,
	monoFont,
	placeholderFontSize,
	placeholderLabel,
	placeholderSvg,
	presets,
	type PlaceholderSpec,
} from 'delphitools-v2/components/tools/placeholder-genny/placeholder';
import Picture from 'delphitools-v2/components/tools/placeholder-genny/picture';
import './placeholder-genny/placeholder-genny.css';

const formats = ['PNG', 'SVG'];
const presetNames = presets.map((preset) => preset.label);
const measureMs = 300;

const spring = htmlSafe(`--ph-spring: ${springEasing(0.82)}`);

const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const toBlob = (canvas: HTMLCanvasElement) =>
	new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);

function launchFlags() {
	const query = new URLSearchParams(window.location.search);
	const size = (query.get('phSize') ?? '')
		.split('x')
		.map(Number)
		.filter((side) => side > 0);
	const colours = (query.get('phColours') ?? '').split(',').map(parseHex);
	return {
		width: size.length === 2 ? size[0]! : 800,
		height: size.length === 2 ? size[1]! : 600,
		text: query.get('phText') ?? '',
		format: query.get('phFormat') === '1' ? 1 : 0,
		background: colours[0] ?? parseHex('#e2e2e2')!,
		foreground: colours[1] ?? parseHex('#666666')!,
	};
}

export default class PlaceholderGenny extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked width: number;
	@tracked height: number;
	@tracked background: Rgb;
	@tracked foreground: Rgb;
	@tracked text: string;
	@tracked format: number;
	@tracked png?: { spec: PlaceholderSpec; bytes: number };

	#canvas?: HTMLCanvasElement;
	#timer?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags();
		const side = (value: number) =>
			Math.min(Math.max(Math.round(value), 1), maxDimension);
		this.width = side(flags.width);
		this.height = side(flags.height);
		this.text = flags.text;
		this.format = flags.format;
		this.background = flags.background;
		this.foreground = flags.foreground;
		registerDestructor(this, () =>
			window.clearTimeout(this.#timer),
		);
	}

	get spec(): PlaceholderSpec {
		return {
			width: this.width,
			height: this.height,
			background: hex(this.background).toLowerCase(),
			foreground: hex(this.foreground).toLowerCase(),
			text: this.text,
		};
	}

	get isSvg() {
		return this.format === 1;
	}

	get svg() {
		return placeholderSvg(this.spec, monoFont());
	}

	get sizeLabel() {
		return placeholderLabel('', this.width, this.height);
	}

	get presetIndex() {
		return presets.findIndex(
			(p) =>
				p.width === this.width &&
				p.height === this.height,
		);
	}

	get fileBytes() {
		if (this.isSvg)
			return new TextEncoder().encode(this.svg).length;
		const { png } = this;
		return png && sameSpec(png.spec, this.spec)
			? png.bytes
			: undefined;
	}

	get tiles() {
		const { width, height } = this;
		const bytes = this.fileBytes;
		return [
			{ label: 'Aspect', value: aspect(width, height) },
			{
				label: 'Pixels',
				value: `${((width * height) / 1_000_000).toFixed(2)} MP`,
			},
			{
				label: 'Text',
				value: `${Math.round(placeholderFontSize(width, height))} px`,
			},
			{
				label: formats[this.format]!,
				value:
					bytes === undefined
						? '…'
						: formatBytes(bytes),
			},
		];
	}

	get exportLabel() {
		return passAlong(`Download ${formats[this.format]!}`);
	}

	keepCanvas = (canvas: HTMLCanvasElement) => {
		this.#canvas = canvas;
		const spec = this.spec;
		window.clearTimeout(this.#timer);
		this.#timer = window.setTimeout(() => {
			void toBlob(canvas).then((blob) => {
				if (blob && !this.isDestroying)
					this.png = { spec, bytes: blob.size };
			});
		}, measureMs);
	};

	setWidth = (value: number) => (this.width = value);

	setHeight = (value: number) => (this.height = value);

	pickPreset = (index: number) => {
		const preset = presets[index];
		if (!preset) return;
		this.width = preset.width;
		this.height = preset.height;
	};

	setBackground = (colour: Rgb) => (this.background = colour);

	setForeground = (colour: Rgb) => (this.foreground = colour);

	setText = (value: string) => (this.text = value);

	pickFormat = (index: number) => (this.format = index);

	get dataUrl() {
		if (this.isSvg)
			return `data:image/svg+xml;base64,${base64Utf8(this.svg)}`;
		return this.#canvas?.toDataURL('image/png') ?? '';
	}

	copy = () => {
		const url = this.dataUrl;
		if (url) void this.toast.copy(url);
	};

	download = async () => {
		const name = baseName(this.spec);
		if (this.isSvg) {
			downloadText(this.svg, `${name}.svg`, 'image/svg+xml');
			return;
		}
		const blob = this.#canvas && (await toBlob(this.#canvas));
		if (blob) downloadBlob(blob, `${name}.png`);
	};

	<template>
		<CanonSplit
			class="placeholder-genny"
			@halves={{true}}
			@collapsesTo={{200}}
			style={{spring}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1.25}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@spec={{this.spec}}
						@onCanvas={{this.keepCanvas}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Size" />
					<CanonRow
						class="ph-width"
						@title="Width"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.width}}
							@min={{1}}
							@max={{maxDimension}}
							@step={{10}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setWidth}}
						/>
					</CanonRow>
					<CanonRow
						class="ph-height"
						@title="Height"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.height}}
							@min={{1}}
							@max={{maxDimension}}
							@step={{10}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setHeight}}
						/>
					</CanonRow>
					<CanonHeading @text="Presets" />
					<CanonSegmented
						class="ph-presets"
						@items={{presetNames}}
						@selected={{this.presetIndex}}
						@columns={{3}}
						@onChange={{this.pickPreset}}
					/>
					<CanonHeading @text="Colours" />
					<CanonColourWell
						class="ph-background"
						@label="Background"
						@colour={{this.background}}
						@onChange={{this.setBackground}}
					/>
					<CanonColourWell
						class="ph-foreground"
						@label="Text"
						@colour={{this.foreground}}
						@onChange={{this.setForeground}}
					/>
					<CanonHeading @text="Label" />
					<CanonTextCell
						class="ph-label"
						aria-label="Label"
						autocomplete="off"
						spellcheck="false"
						@value={{this.text}}
						@placeholder={{this.sizeLabel}}
						@onChange={{this.setText}}
					/>
					<CanonHeading @text="Format" />
					<CanonSegmented
						class="ph-formats"
						@items={{formats}}
						@selected={{this.format}}
						@onChange={{this.pickFormat}}
					/>
					<CanonGrid>
						<CanonButton
							class="ph-copy"
							@text="Copy Data URI"
							@icon={{Copy}}
							@onClick={{this.copy}}
						/>
						<CanonButton
							class="ph-download"
							@kind="primary"
							@text={{this.exportLabel}}
							@icon={{Save}}
							@iconStyle="oversized"
							@onClick={{this.download}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Image" />
					<CanonTiles
						class="ph-tiles"
						@items={{this.tiles}}
					/>
					{{#if this.isSvg}}
						<CanonCodeBlock
							class="ph-code"
							@code={{this.svg}}
							@language="SVG"
						/>
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}

function sameSpec(a: PlaceholderSpec, b: PlaceholderSpec) {
	return (
		a.width === b.width &&
		a.height === b.height &&
		a.background === b.background &&
		a.foreground === b.foreground &&
		a.text === b.text
	);
}
