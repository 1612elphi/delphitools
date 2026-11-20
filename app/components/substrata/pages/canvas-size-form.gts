import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	DEFAULT_ARTBOARD,
	type Artboard,
} from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot } from 'delphitools-v2/lib/substrata/doc-store';
import {
	resizeArtboardReflow,
	setArtboard,
} from 'delphitools-v2/lib/substrata/artboard-ops';
import { createScene } from 'delphitools-v2/lib/substrata/file-ops';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import type { CanvasSize } from 'delphitools-v2/lib/substrata/canvas-sizes';
import { clampSide } from './figures';
import SizePopover from './size-popover';

interface Signature {
	Args: {
		new?: boolean;
		onDone: () => void;
	};
}

const WHITE: Rgb = [255, 255, 255];

export default class CanvasSizeForm extends Component<Signature> {
	seed: Artboard = this.args.new
		? DEFAULT_ARTBOARD
		: (getSnapshot()?.artboard ?? DEFAULT_ARTBOARD);

	@tracked width = this.seed.width;
	@tracked height = this.seed.height;
	@tracked reflow = false;
	@tracked transparent = this.seed.background === null;
	@tracked colour: Rgb = parseHex(this.seed.background ?? '') ?? WHITE;

	@tracked picked?: string;

	#file: HTMLInputElement | null = null;

	pickSize = (size: CanvasSize) => {
		this.picked = size.id;
		this.width = size.width;
		this.height = size.height;
	};

	setWidth = (v: number) => (this.width = v);
	setHeight = (v: number) => (this.height = v);
	setReflow = (on: boolean) => (this.reflow = on);
	setTransparent = (on: boolean) => (this.transparent = on);
	setColour = (c: Rgb) => (this.colour = c);

	apply = () => {
		const width = clampSide(this.width);
		const height = clampSide(this.height);
		if (this.args.new) {
			createScene({
				...DEFAULT_ARTBOARD,
				width,
				height,
				background: this.transparent
					? null
					: hex(this.colour),
			});
			viewport.fit();
		} else {
			const ab = getSnapshot()?.artboard;
			if (
				this.reflow &&
				ab &&
				(width !== ab.width || height !== ab.height)
			) {
				resizeArtboardReflow({ width, height });
				viewport.fit();
			} else {
				setArtboard({ width, height });
			}
		}
		this.args.onDone();
	};

	registerFile = modifier((input: HTMLInputElement) => {
		this.#file = input;
		return () => {
			this.#file = null;
		};
	});

	pickPhoto = () => this.#file?.click();

	fromPhoto = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		let size: { width: number; height: number };
		try {
			const bmp = await createImageBitmap(file);
			size = { width: bmp.width, height: bmp.height };
			bmp.close();
		} catch {
			return;
		}
		createScene({ ...DEFAULT_ARTBOARD, ...size });
		await importImageFile(file);
		viewport.fit();
		this.args.onDone();
	};

	<template>
		<CanonHeading @text={{if @new "New" "Canvas Size"}} />
		<SizePopover
			@width={{this.width}}
			@height={{this.height}}
			@picked={{this.picked}}
			@onPick={{this.pickSize}}
		/>
		<CanonRow @title="Width" @form="flush" as |id|>
			<CanonNumberField
				@value={{this.width}}
				@min={{1}}
				@max={{20000}}
				@unit="px"
				@labelledBy={{id}}
				@onChange={{this.setWidth}}
			/>
		</CanonRow>
		<CanonRow @title="Height" @form="flush" as |id|>
			<CanonNumberField
				@value={{this.height}}
				@min={{1}}
				@max={{20000}}
				@unit="px"
				@labelledBy={{id}}
				@onChange={{this.setHeight}}
			/>
		</CanonRow>
		{{#if @new}}
			<CanonRow @title="Transparent" as |id|>
				<CanonSwitch
					@on={{this.transparent}}
					@onChange={{this.setTransparent}}
					aria-labelledby={{id}}
				/>
			</CanonRow>
			{{#unless this.transparent}}
				<CanonColourWell
					@label="Background"
					@colour={{this.colour}}
					@onChange={{this.setColour}}
				/>
			{{/unless}}
		{{else}}
			<CanonRow @title="Reflow layers" as |id|>
				<CanonSwitch
					@on={{this.reflow}}
					@onChange={{this.setReflow}}
					aria-labelledby={{id}}
				/>
			</CanonRow>
		{{/if}}
		<CanonButton
			class="sub-pg-primary"
			@kind="primary"
			@text={{if @new "Create" "Apply"}}
			@icon={{component IconSvg name="check"}}
			@onClick={{this.apply}}
		/>
		{{#if @new}}
			<input
				type="file"
				accept="image/*"
				class="dt-sr-only"
				tabindex="-1"
				aria-label="From Photo"
				{{this.registerFile}}
				{{on "change" this.fromPhoto}}
			/>
			<CanonButton
				@kind="secondary"
				@text="From Photo"
				@icon={{component IconSvg name="image"}}
				@onClick={{this.pickPhoto}}
			/>
		{{/if}}
	</template>
}
