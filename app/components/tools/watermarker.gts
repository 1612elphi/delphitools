import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { registerDestructor } from '@ember/destroyable';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { hex, type Rgb } from 'delphicanon/lib/colour';
import { stem } from 'delphicanon/lib/files';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import { AnchorPicker } from 'delphitools-v2/components/tools/media/anchors';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import Picture from 'delphitools-v2/components/tools/watermarker/picture';
import {
	blends,
	fileName,
	marks,
	paint,
	zones,
	type BlendMode,
	type Position,
	type WatermarkSpec,
} from 'delphitools-v2/components/tools/watermarker/watermark';
import './watermarker/watermarker.css';

const loadFailed = 'Image could not be read. Try another file?';

const kinds = ['Text', 'Image'];
const blendNames = blends.map((blend) => blend.name);

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Shuffle = <template><IconSvg @name="shuffle" /></template>;

const points = (value: number) => `${value} pt`;
const percent = (value: number) => `${value}%`;
const pixels = ({ width, height }: { width: number; height: number }) =>
	`${width} × ${height}`;

const keepPaste = (event: Event) => event.stopPropagation();

interface Loaded {
	image: ImageBitmap;
	name: string;
}

const decode = (file: Blob) =>
	createImageBitmap(file, { imageOrientation: 'from-image' });

function drawnStamp() {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	const context = canvas.getContext('2d')!;
	context.fillStyle = '#ffffff';
	context.beginPath();
	context.arc(128, 128, 120, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = '#1e6626';
	context.fillRect(64, 64, 128, 128);
	return createImageBitmap(canvas);
}

export default class Watermarker extends Component {
	@tracked source?: Loaded;
	@tracked stamp?: Loaded;
	@tracked kind = 0;
	@tracked text = 'Watermark';
	@tracked fontSize = 48;
	@tracked colour: Rgb = [1, 1, 1];
	@tracked scale = 20;
	@tracked opacity = 0.3;
	@tracked padding = 5;
	@tracked position: Position = 'br';
	@tracked random = { x: 0, y: 0 };
	@tracked tiling = false;
	@tracked blend: BlendMode = 'normal';
	@tracked failed = false;
	@tracked exporting = false;

	drop = new Drop('image/*', (file) => void this.loadSource(file));
	#input?: HTMLInputElement;
	#loading = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.tiling = query.has('wmTile');
		const tap = zones[Number(query.get('wmTap') ?? NaN)];
		if (tap) this.position = tap;
		if (query.has('wmSample'))
			void drawnSample().then((file) =>
				this.loadSource(file),
			);
		if (query.has('wmStamp')) {
			this.kind = 1;
			void drawnStamp().then((image) =>
				this.keepStamp(image, 'Logo'),
			);
		}
		registerDestructor(this, () => {
			this.source?.image.close();
			this.stamp?.image.close();
		});
	}

	get isText() {
		return this.kind === 0;
	}

	get spec(): WatermarkSpec {
		return {
			kind: this.isText ? 'text' : 'image',
			text: this.text,
			fontSize: this.fontSize,
			colour: hex(this.colour),
			stamp: this.stamp?.image,
			scale: this.scale,
			opacity: this.opacity,
			padding: this.padding,
			position: this.position,
			random: this.random,
			tiling: this.tiling,
			blend: this.blend,
		};
	}

	get sourceText() {
		return this.source ? pixels(this.source.image) : '';
	}

	get stampText() {
		return this.stamp ? pixels(this.stamp.image) : '';
	}

	get zoneIndex() {
		return zones.indexOf(this.position);
	}

	get isRandom() {
		return this.position === 'random';
	}

	get blendIndex() {
		return blends.findIndex((blend) => blend.id === this.blend);
	}

	get exportDisabled() {
		return !this.source || !marks(this.spec) || this.exporting;
	}

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void this.loadSource(file);
	};

	dropped = (event: DragEvent) => {
		if (event.defaultPrevented) this.drop.over = false;
		else this.drop.drop(event);
	};

	pasted = (file: File) => {
		if (this.source && !this.isText) void this.loadStamp(file);
		else void this.loadSource(file);
	};

	loadSource = async (file: File) => {
		const run = ++this.#loading;
		try {
			const image = await decode(file);
			if (run !== this.#loading || this.isDestroying) {
				image.close();
				return;
			}
			this.source?.image.close();
			this.source = {
				image,
				name: stem(file.name) || 'Image',
			};
			this.failed = false;
		} catch {
			if (run === this.#loading) this.failed = true;
		}
	};

	loadStamp = async (file: File) => {
		try {
			this.keepStamp(await decode(file), stem(file.name));
		} catch {
			this.failed = true;
		}
	};

	keepStamp = (image: ImageBitmap, name: string) => {
		if (this.isDestroying) return image.close();
		this.stamp?.image.close();
		this.stamp = { image, name: name || 'Logo' };
		this.failed = false;
	};

	droppedStamp = (images: ImageBitmap[], names: string[]) => {
		const [image, ...rest] = images;
		for (const extra of rest) extra.close();
		if (image) this.keepStamp(image, names[0] ?? '');
	};

	clearSource = () => {
		this.#loading++;
		this.source?.image.close();
		this.source = undefined;
		this.failed = false;
	};

	clearStamp = () => {
		this.stamp?.image.close();
		this.stamp = undefined;
	};

	pickKind = (index: number) => (this.kind = index);

	setText = (text: string) => (this.text = text);

	setFontSize = (value: number) => (this.fontSize = value);

	pickColour = (colour: Rgb) => (this.colour = colour);

	setScale = (value: number) => (this.scale = value);

	setOpacity = (value: number) => (this.opacity = value);

	setPadding = (value: number) => (this.padding = value);

	pickBlend = (index: number) => (this.blend = blends[index]!.id);

	pickZone = (index: number) => (this.position = zones[index]!);

	randomise = () => {
		this.position = 'random';
		this.random = { x: Math.random(), y: Math.random() };
	};

	setTiling = (on: boolean) => (this.tiling = on);

	export = async () => {
		const { source } = this;
		if (!source || this.exportDisabled) return;
		this.exporting = true;
		try {
			const { image, name } = source;
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d');
			if (!context) return;
			const size = {
				width: image.width,
				height: image.height,
			};
			paint(context, image, size, size, this.spec);
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/png'),
			);
			if (blob) downloadBlob(blob, fileName(name));
		} finally {
			this.exporting = false;
		}
	};

	<template>
		<CanonSplit
			class="watermarker"
			@halves={{true}}
			@collapsesTo={{200}}
			{{filePaste this.pasted accept="image/*"}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.dropped}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1.25}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@base={{this.source.image}}
						@spec={{this.spec}}
						@over={{this.drop.over}}
						@onChoose={{this.choose}}
						@zone={{this.zoneIndex}}
						@onZone={{this.pickZone}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="wm-source"
							@title={{this.source.name}}
							@detail={{this.sourceText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clearSource}}
							/>
						</CanonRow>
					</CanonRows>
				{{/if}}
				{{#if this.failed}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							class="wm-error"
							@text={{loadFailed}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Watermark" />
					<CanonSegmented
						class="wm-kinds"
						@items={{kinds}}
						@selected={{this.kind}}
						@onChange={{this.pickKind}}
					/>
					{{#if this.isText}}
						<CanonTextCell
							class="wm-text"
							aria-label="Watermark text"
							autocomplete="off"
							spellcheck="false"
							@value={{this.text}}
							@placeholder="Watermark text"
							@onChange={{this.setText}}
						/>
						<CanonRow
							class="wm-font-size"
							@title="Font Size"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.fontSize}}
								@min={{12}}
								@max={{200}}
								@step={{1}}
								@readout={{points}}
								@labelledBy={{titleId}}
								@onChange={{this.setFontSize}}
							/>
						</CanonRow>
						<CanonColourWell
							class="wm-colour"
							@label="Text Colour"
							@colour={{this.colour}}
							@onChange={{this.pickColour}}
						/>
					{{else}}
						{{#if this.stamp}}
							<CanonRow
								class="wm-stamp"
								@title={{this.stamp.name}}
								@detail={{this.stampText}}
								@form="flush"
							>
								<CanonButton
									@kind="cell"
									@text="Clear"
									@icon={{Trash}}
									@onClick={{this.clearStamp}}
								/>
							</CanonRow>
						{{else}}
							<CanonDropZone
								class="wm-stamp-drop"
								@prompt="Drop a watermark image"
								@onImages={{this.droppedStamp}}
								{{on
									"paste"
									keepPaste
								}}
							/>
						{{/if}}
						<CanonRow
							class="wm-size"
							@title="Size"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.scale}}
								@min={{5}}
								@max={{50}}
								@step={{5}}
								@readout={{percent}}
								@labelledBy={{titleId}}
								@onChange={{this.setScale}}
							/>
						</CanonRow>
					{{/if}}
					<CanonRow
						class="wm-opacity"
						@title="Opacity"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.opacity}}
							@min={{0.05}}
							@max={{1}}
							@step={{0.05}}
							@labelledBy={{titleId}}
							@onChange={{this.setOpacity}}
						/>
					</CanonRow>
					<CanonHeading @text="Blend Mode" />
					<CanonSegmented
						class="wm-blends"
						@items={{blendNames}}
						@selected={{this.blendIndex}}
						@onChange={{this.pickBlend}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Position" />
					<AnchorPicker
						class="wm-zones-picker"
						@selected={{this.zoneIndex}}
						@disabled={{this.tiling}}
						@onChange={{this.pickZone}}
					/>
					<CanonGrid>
						<CanonButton
							class="wm-random"
							aria-pressed={{if
								this.isRandom
								"true"
								"false"
							}}
							@kind="segment"
							@text="Random"
							@icon={{Shuffle}}
							@selected={{this.isRandom}}
							@disabled={{this.tiling}}
							@onClick={{this.randomise}}
						/>
					</CanonGrid>
					<CanonRow
						class="wm-padding"
						@title="Padding"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.padding}}
							@min={{0}}
							@max={{20}}
							@step={{1}}
							@readout={{percent}}
							@labelledBy={{titleId}}
							@onChange={{this.setPadding}}
						/>
					</CanonRow>
					<CanonRow
						class="wm-tile"
						@title="Tile Watermark"
						as |titleId|
					>
						<CanonSwitch
							aria-labelledby={{titleId}}
							@on={{this.tiling}}
							@onChange={{this.setTiling}}
						/>
					</CanonRow>
					<CanonButton
						class="wm-download"
						@kind="primary"
						@text={{passAlong "Download"}}
						@icon={{Save}}
						@iconStyle="oversized"
						@disabled={{this.exportDisabled}}
						@onClick={{this.export}}
					/>
				</CanonRows>
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
