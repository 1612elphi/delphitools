import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	contrastFigure,
	contrastLevels,
	contrastRatio,
	hex,
	type Rgb,
} from 'delphicanon/lib/colour';
import { reducedMotion } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { COLOUR_NOTATIONS } from 'delphitools-v2/lib/colour-notation';
import { carryColour } from 'delphitools-v2/lib/colour-query';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import NotationStrip from 'delphitools-v2/components/tools/colour-tool/notation-strip';
import {
	clampPixel,
	launchFlags,
	type Point,
} from 'delphitools-v2/components/tools/pixel-picker/geometry';
import Picture from 'delphitools-v2/components/tools/pixel-picker/picture';
import 'delphicanon/components/canon-colour-card.css';
import './pixel-picker/pixel-picker.css';

const loupeRadius = 7;
const loupeSide = loupeRadius * 2 + 1;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Remove = <template><IconSvg @name="x" /></template>;
const Eyedropper = <template><IconSvg @name="pipette" /></template>;

const NOTE = 'Drag or tap to move the lens, then Pick to select the colour';

const keepPaste = (event: Event) => event.stopPropagation();

const p3Supported =
	typeof CSS !== 'undefined' &&
	CSS.supports('color', 'color(display-p3 1 0 0)');

interface Loaded {
	name: string;
	canvas: HTMLCanvasElement;
	srgb: CanvasRenderingContext2D;
	p3?: CanvasRenderingContext2D;
}

interface Pick {
	id: number;
	hex: string;
	pixel: Point;
}

function context(canvas: HTMLCanvasElement, colorSpace: PredefinedColorSpace) {
	return canvas.getContext('2d', {
		colorSpace,
		willReadFrequently: true,
	});
}

export default class PixelPicker extends Component {
	@service declare colourNotation: ColourNotationService;
	@service('canon-toast') declare toast: CanonToastService;

	@tracked image?: Loaded;
	@tracked pixel: Point = { x: 0, y: 0 };
	@tracked picks: Pick[] = [];
	readonly p3Supported = p3Supported;
	#loading = 0;
	#nextId = 0;
	#input?: HTMLInputElement;
	#list?: HTMLElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		if (!flags.image) return;
		void drawnSample()
			.then((file) => this.load(file))
			.then(() => {
				for (const pixel of flags.picks) {
					this.moveTo(pixel);
					this.pick();
				}
				if (flags.pixel) this.moveTo(flags.pixel);
			});
		if (!flags.later) return;
		const steps: [number, Point | undefined][] = [
			[2000, { x: 0.8, y: 0.22 }],
			[3000, undefined],
			[4000, { x: 0.26, y: 0.74 }],
			[5000, undefined],
		];
		const timers = steps.map(([delay, target]) =>
			window.setTimeout(() => {
				const canvas = this.image?.canvas;
				if (!canvas) return;
				if (!target) return this.pick();
				this.moveTo({
					x: target.x * canvas.width,
					y: target.y * canvas.height,
				});
			}, delay),
		);
		registerDestructor(this, () =>
			timers.forEach((timer) => window.clearTimeout(timer)),
		);
	}

	get shown() {
		return this.pixel;
	}

	@cached
	get sampled(): Rgb {
		const { image } = this;
		if (!image) return [0.5, 0.5, 0.5];
		const { x, y } = this.shown;
		const [r, g, b] = image.srgb.getImageData(x, y, 1, 1).data;
		return [r! / 255, g! / 255, b! / 255];
	}

	get hex() {
		return hex(this.sampled);
	}

	get p3() {
		const context = this.image?.p3;
		if (!context) return undefined;
		const { x, y } = this.shown;
		const [r, g, b] = context.getImageData(x, y, 1, 1).data;
		const parts = [r, g, b].map((v) => (v! / 255).toFixed(4));
		return `color(display-p3 ${parts.join(' ')})`;
	}

	get loupe() {
		const { image } = this;
		if (!image) return undefined;
		const { x, y } = this.shown;
		return image.srgb.getImageData(
			x - loupeRadius,
			y - loupeRadius,
			loupeSide,
			loupeSide,
		);
	}

	get name() {
		return getColourName(this.hex);
	}

	get value() {
		return this.colourNotation.format(this.hex);
	}

	get reading() {
		return `${this.name}, ${this.value}`;
	}

	get notationLabel() {
		const { notation } = this.colourNotation;
		return (
			COLOUR_NOTATIONS.find((n) => n.id === notation)
				?.label ?? ''
		);
	}

	get showsHex() {
		return this.colourNotation.notation !== 'hex';
	}

	get swatchStyle() {
		return htmlSafe(`background: ${this.hex}`);
	}

	get inks() {
		return [1, 0].map((level) => {
			const ratio = contrastRatio(this.sampled, [
				level,
				level,
				level,
			]);
			return {
				figure: contrastFigure(ratio),
				style: htmlSafe(
					`color: ${level ? 'white' : 'black'}; opacity: ${ratio < contrastLevels.aa ? 0.45 : 1}`,
				),
			};
		});
	}

	get sizeText() {
		const canvas = this.image?.canvas;
		return canvas ? `${canvas.width} × ${canvas.height}` : '';
	}

	get aspect() {
		const canvas = this.image?.canvas;
		if (!canvas) return 4 / 3;
		return Math.min(
			Math.max(canvas.width / canvas.height, 0.8),
			1.6,
		);
	}

	get rows() {
		const { x, y } = this.shown;
		return this.picks.map((pick, index) => ({
			pick,
			index,
			name: getColourName(pick.hex),
			value: this.colourNotation.format(pick.hex),
			swatch: htmlSafe(`background: ${pick.hex}`),
			lit: pick.pixel.x === x && pick.pixel.y === y,
		}));
	}

	get noPicks() {
		return this.picks.length === 0;
	}

	get carried() {
		return this.image ? this.hex : undefined;
	}

	moveTo(pixel: Point) {
		const canvas = this.image?.canvas;
		if (canvas) this.pixel = clampPixel(pixel, canvas);
	}

	move = (pixel: Point) => (this.pixel = pixel);

	pick = () => {
		if (!this.image) return;
		this.picks = [
			...this.picks,
			{
				id: this.#nextId++,
				hex: this.hex,
				pixel: this.shown,
			},
		];
		const list = this.#list;
		requestAnimationFrame(() =>
			list?.scrollTo({
				top: list.scrollHeight,
				behavior: reducedMotion() ? 'auto' : 'smooth',
			}),
		);
	};

	recall = (pick: Pick) => (this.pixel = pick.pixel);

	copy = (value: string) => void this.toast.copy(value);

	remove = (index: number) => {
		this.picks = this.picks.filter((_, i) => i !== index);
	};

	clearPicks = () => (this.picks = []);

	keepList = modifier((list: HTMLElement) => {
		this.#list = list;
	});

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void this.load(file);
	};

	loadFiles = (files: File[]) => {
		if (files[0]) void this.load(files[0]);
	};

	allowDrop = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	dropAnywhere = (event: DragEvent) => {
		if (event.defaultPrevented) return;
		const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
			matchesAccept(f, 'image/*'),
		);
		if (!file) return;
		event.preventDefault();
		void this.load(file);
	};

	// ponytail: full-size canvases (two with Display P3), as iOS samples at full size; cap the edge if memory bites
	load = async (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const run = ++this.#loading;
		let bitmap: ImageBitmap;
		try {
			bitmap = await createImageBitmap(file, {
				imageOrientation: 'from-image',
			});
		} catch {
			return;
		}
		if (run !== this.#loading || isDestroying(this)) {
			bitmap.close();
			return;
		}
		const drawn = (space: PredefinedColorSpace) => {
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = context(canvas, space);
			ctx?.drawImage(bitmap, 0, 0);
			return { canvas, ctx };
		};
		const srgb = drawn('srgb');
		const p3 = p3Supported ? drawn('display-p3').ctx : null;
		bitmap.close();
		if (!srgb.ctx) return;
		srgb.canvas.classList.add('pp-canvas');
		this.image = {
			name: file.name || 'image',
			canvas: srgb.canvas,
			srgb: srgb.ctx,
			p3: p3 ?? undefined,
		};
		this.picks = [];
		this.pixel = {
			x: Math.floor(srgb.canvas.width / 2),
			y: Math.floor(srgb.canvas.height / 2),
		};
	};

	clear = () => {
		this.#loading++;
		this.image = undefined;
		this.picks = [];
	};

	<template>
		<CanonSplit
			class="pixel-picker"
			@halves={{true}}
			@collapsesTo={{240}}
			@footerHidden={{if this.image false true}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
			{{carryColour this.carried}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<div class="pp-stage">
						<Picture
							@canvas={{this.image.canvas}}
							@pixel={{this.shown}}
							@loupe={{this.loupe}}
							@colour={{this.sampled}}
							@value={{this.value}}
							@reading={{this.reading}}
							@onMove={{this.move}}
							@onPick={{this.pick}}
							@onChoose={{this.choose}}
						/>
						{{#if this.image}}
							<NotationStrip
								@hex={{this.hex}}
							/>
						{{/if}}
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					{{#if this.image}}
						<CanonRow
							class="pp-source"
							@title={{this.image.name}}
							@detail={{this.sizeText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
						<p class="pp-note">{{NOTE}}</p>
					{{else}}
						<CanonDropZone
							class="pp-drop"
							@prompt="Drop an image"
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
				</CanonRows>
				{{#if this.image}}
					<div
						class="canon-colour-card canon-colour-card--chip pp-card"
					>
						<div
							class="canon-colour-card-swatch"
							style={{this.swatchStyle}}
						>
							{{#each
								this.inks
								as |ink|
							}}
								<span
									class="canon-colour-card-ink"
									style={{ink.style}}
									aria-hidden="true"
								>
									<span
										class="canon-colour-card-specimen"
									>Aa</span>
									<span
										class="canon-colour-card-ratio"
									>{{ink.figure}}</span>
								</span>
							{{/each}}
						</div>
						<div
							class="canon-colour-card-info"
						>
							<div
								class="canon-colour-card-name"
							>{{this.name}}</div>
							<CanonValueLine
								@label={{this.notationLabel}}
								@value={{this.value}}
							/>
							{{#if this.showsHex}}
								<CanonValueLine
									@label="HEX"
									@value={{this.hex}}
								/>
							{{/if}}
						</div>
					</div>
					{{#if this.p3}}
						<CanonRows @framed={{true}}>
							<CanonValueLine
								class="pp-p3"
								@label="P3"
								@value={{this.p3}}
							/>
						</CanonRows>
					{{/if}}
				{{/if}}
				{{#if this.image}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Picked" />
						<div
							class="pp-picks"
							{{this.keepList}}
						>
							{{#each
								this.rows
								key="pick.id"
								as |row|
							}}
								<div
									class="pp-pick
										{{if
											row.lit
											'pp-pick--lit'
										}}"
								>
									<span
										class="pp-pick-swatch"
										style={{row.swatch}}
									></span>
									<button
										type="button"
										class="pp-pick-cell"
										aria-current={{if
											row.lit
											"true"
										}}
										{{on
											"click"
											(fn
												this.recall
												row.pick
											)
										}}
									>
										<span
											class="pp-pick-name"
										>{{row.name}}</span>
										<span
											class="pp-pick-value"
										>{{row.value}}</span>
									</button>
									<CanonButton
										class="pp-pick-copy"
										@kind="cell"
										@icon={{Copy}}
										@label="Copy"
										@onClick={{fn
											this.copy
											row.value
										}}
									/>
									<CanonButton
										class="pp-pick-remove"
										@kind="cell"
										@icon={{Remove}}
										@label="Remove"
										@onClick={{fn
											this.remove
											row.index
										}}
									/>
								</div>
							{{/each}}
							{{#unless this.rows}}
								<p
									class="pp-picks-empty"
								>No colours
									picked</p>
							{{/unless}}
						</div>
						<CanonGrid>
							<CanonButton
								class="pp-clear"
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{this.noPicks}}
								@onClick={{this.clearPicks}}
							/>
						</CanonGrid>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<p class="pp-note"><span
							class="pp-note-title"
						>About colour spaces —
						</span>Colours are sampled in
						sRGB by default. Images with
						wide-gamut colour profiles
						(Display P3, Adobe RGB) are
						converted to sRGB, which may
						shift some colours.
						{{#unless this.p3Supported}}
							Your browser does not
							support Display P3
							colour sampling.
						{{/unless}}
					</p>
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
			<:footer>
				<CanonButton
					class="pp-pick-button"
					@kind="primary"
					@text="Pick"
					@icon={{Eyedropper}}
					@iconStyle="oversized"
					@onClick={{this.pick}}
				/>
			</:footer>
		</CanonSplit>
	</template>
}
