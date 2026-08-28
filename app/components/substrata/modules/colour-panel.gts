import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	ColourSwatchCell,
	DeferredHexInput,
} from 'delphitools-v2/components/colour-field';
import { Knob } from 'delphitools-v2/components/substrata/modules/colour-picker-kit';
import TriangleMode from 'delphitools-v2/components/substrata/modules/colour-modes/triangle';
import SlidersMode from 'delphitools-v2/components/substrata/modules/colour-modes/sliders';
import SwatchesMode from 'delphitools-v2/components/substrata/modules/colour-modes/swatches';
import PrismMode from 'delphitools-v2/components/substrata/modules/colour-modes/prism';
import SpectrumMode from 'delphitools-v2/components/substrata/modules/colour-modes/spectrum';
import ShadeMode from 'delphitools-v2/components/substrata/modules/colour-modes/shade';
import pointerArea from 'delphitools-v2/modifiers/pointer-area';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	getColour,
	setAlpha,
	setHex,
	setHsv,
	subscribeColour,
	type ColourSnapshot,
} from 'delphitools-v2/lib/substrata/colour-store';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

type ModeId =
	| 'cube'
	| 'triangle'
	| 'sliders'
	| 'swatches'
	| 'prism'
	| 'spectrum'
	| 'shade';

interface ModeDef {
	id: ModeId;
	icon: string;
	label: string;
}

const MODES: ModeDef[] = [
	{ id: 'cube', icon: 'square', label: 'Hue cube' },
	{ id: 'triangle', icon: 'triangle', label: 'HSV triangle' },
	{ id: 'sliders', icon: 'sliders-horizontal', label: 'Sliders' },
	{ id: 'swatches', icon: 'grid-3x3', label: 'Swatches' },
	{ id: 'prism', icon: 'rainbow', label: 'Prism' },
	{ id: 'spectrum', icon: 'audio-lines', label: 'Spectrum' },
	{ id: 'shade', icon: 'palette', label: 'Shade' },
];

function svStyle(hue: number) {
	return htmlSafe(
		`background-color: hsl(${hue}, 100%, 50%); background-image: linear-gradient(to right,#fff,rgba(255,255,255,0)),linear-gradient(to top,#000,rgba(0,0,0,0))`,
	);
}

function alphaStyle(hex: string) {
	return htmlSafe(
		`background-image: linear-gradient(to right, transparent, ${hex}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%); background-size: 100% 100%, 10px 10px`,
	);
}

function oneMinus(v: number): number {
	return 1 - v;
}

function over360(v: number): number {
	return v / 360;
}

const writeSv = (x: number, y: number) => setHsv({ s: x, v: 1 - y });
const writeHue = (x: number) => setHsv({ h: x * 360 });
const writeAlpha = (x: number) => setAlpha(x);

interface CubeSignature {
	Args: { colour: ColourSnapshot };
}

const HueCube: TOC<CubeSignature> = <template>
	<div class="sub-cp-cube">
		<div
			class="sub-cp-sv"
			style={{svStyle @colour.hsv.h}}
			{{pointerArea writeSv}}
		>
			<Knob
				@x={{@colour.hsv.s}}
				@y={{oneMinus @colour.hsv.v}}
			/>
		</div>
		<div class="sub-cp-hue" {{pointerArea writeHue}}>
			<Knob @x={{over360 @colour.hsv.h}} @y={{0.5}} />
		</div>
		<div
			class="sub-cp-alpha"
			style={{alphaStyle @colour.hex}}
			{{pointerArea writeAlpha}}
		>
			<Knob @x={{@colour.alpha}} @y={{0.5}} />
		</div>
	</div>
</template>;

interface EyeDropperCtor {
	new (): { open: () => Promise<{ sRGBHex: string }> };
}

const hasEyeDropper = (): boolean =>
	typeof window !== 'undefined' && 'EyeDropper' in window;

interface FooterSignature {
	Args: { hex: string; alpha: number };
}

class Footer extends Component<FooterSignature> {
	hasEyeDropper = hasEyeDropper();

	apply = (hex: string) => {
		setHex(hex);
	};

	pick = () => {
		const Ctor = (
			window as unknown as { EyeDropper?: EyeDropperCtor }
		).EyeDropper;
		if (!Ctor) return;
		void new Ctor()
			.open()
			.then((res) => setHex(res.sRGBHex))
			.catch(() => {});
	};

	<template>
		<div class="sub-cp-footer">
			<div class="sub-cp-footer-swatch">
				<ColourSwatchCell
					@colour={{@hex}}
					@onChange={{this.apply}}
					@label="Current colour"
					@fillOpacity={{@alpha}}
				/>
			</div>
			<DeferredHexInput
				@value={{@hex}}
				@onChange={{this.apply}}
				@label="Hex value"
				class="sub-cp-footer-hex"
			/>
			{{#if this.hasEyeDropper}}
				<button
					type="button"
					class="sub-cp-footer-pipette"
					aria-label="Pick from screen"
					title="Pick from screen"
					{{on "click" this.pick}}
				>
					<Icon @name="pipette" />
				</button>
			{{/if}}
		</div>
	</template>
}

export class ColourName extends Component {
	#colour = new TrackedExternal(subscribeColour, getColour);

	get name() {
		return getColourName(this.#colour.current.hex);
	}

	willDestroy() {
		super.willDestroy();
		this.#colour.unsubscribe();
	}

	<template>{{this.name}}</template>
}

export class ColourBody extends Component {
	#colour = new TrackedExternal(subscribeColour, getColour);

	@tracked mode: ModeId = 'cube';

	modes = MODES;

	get colour() {
		return this.#colour.current;
	}

	pickMode = (id: ModeId) => {
		this.mode = id;
	};

	willDestroy() {
		super.willDestroy();
		this.#colour.unsubscribe();
	}

	<template>
		<div class="sub-cp">
			<div class="segmented sub-cp-tabs">
				{{#each this.modes key="id" as |m|}}
					<button
						type="button"
						class="sub-cp-tab
							{{if
								(eq
									this.mode
									m.id
								)
								'is-active'
							}}"
						aria-label={{m.label}}
						title={{m.label}}
						{{on
							"click"
							(fn this.pickMode m.id)
						}}
					>
						<Icon @name={{m.icon}} />
					</button>
				{{/each}}
			</div>

			<div class="sub-cp-stage">
				{{#if (eq this.mode "cube")}}
					<HueCube @colour={{this.colour}} />
				{{else if (eq this.mode "triangle")}}
					<TriangleMode @colour={{this.colour}} />
				{{else if (eq this.mode "sliders")}}
					<SlidersMode @colour={{this.colour}} />
				{{else if (eq this.mode "swatches")}}
					<SwatchesMode @colour={{this.colour}} />
				{{else if (eq this.mode "prism")}}
					<PrismMode @colour={{this.colour}} />
				{{else if (eq this.mode "spectrum")}}
					<SpectrumMode @colour={{this.colour}} />
				{{else}}
					<ShadeMode @colour={{this.colour}} />
				{{/if}}
			</div>

			<Footer
				@hex={{this.colour.hex}}
				@alpha={{this.colour.alpha}}
			/>
		</div>
	</template>
}
