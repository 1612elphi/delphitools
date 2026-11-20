import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonImageCompare from 'delphicanon/components/canon-image-compare';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import { hex, parseHex, takesBlackInk, type Rgb } from 'delphicanon/lib/colour';
import { stem } from 'delphicanon/lib/files';
import { IconSvg } from 'delphitools-v2/components/icon';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	MATRICES,
	simulateHex,
	type SimulationType,
} from 'delphitools-v2/lib/colour-vision';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import { downloadUrl } from 'delphitools-v2/lib/download';
import { downloadIcon } from 'delphitools-v2/lib/flow-hooks';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import { readColour } from 'delphitools-v2/components/tools/colour-atlas/atlas';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import NotationStrip from 'delphitools-v2/components/tools/colour-tool/notation-strip';
import {
	launchFlags,
	simulatePixels,
	visionTypes,
} from 'delphitools-v2/components/tools/colorblind-sim/vision';
import './colorblind-sim/colorblind-sim.css';

const startColour = parseHex('E63946')!;
const modes = ['Colour', 'Image'];
const views = ['Split', 'Side by side'];
const maxEdge = 2048;
const thumbEdge = 160;

const closestName = (colour: Rgb) => getColourName(hex(colour));

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

function drawn(bitmap: ImageBitmap, edge: number) {
	const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	return { canvas, context };
}

function painted(pixels: ImageData, type: SimulationType) {
	const canvas = document.createElement('canvas');
	canvas.width = pixels.width;
	canvas.height = pixels.height;
	canvas.getContext('2d')!.putImageData(
		new ImageData(
			simulatePixels(pixels.data, type),
			pixels.width,
			pixels.height,
		),
		0,
		0,
	);
	return canvas;
}

async function blobUrl(canvas: HTMLCanvasElement) {
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);
	return blob ? URL.createObjectURL(blob) : undefined;
}

interface Source {
	name: string;
	width: number;
	height: number;
	url: string;
	pixels: ImageData;
}

export default class ColorblindSim extends Component {
	@service declare colourNotation: ColourNotationService;

	state: CanonColourSolidState;
	@tracked imageMode = false;
	@tracked selected: SimulationType;
	@tracked view = 0;
	@tracked source?: Source;
	@tracked results: Partial<Record<SimulationType, string>> = {};
	@tracked thumbs: Partial<Record<SimulationType, string>> = {};
	@tracked busy = false;
	#loading = 0;
	#input?: HTMLInputElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.state = new CanonColourSolidState({
			space: 'rgb',
			colour: flags.colour ?? startColour,
			activeRow: 2,
		});
		this.selected = flags.type ?? 'deuteranopia';
		registerDestructor(this, () => this.#release());
		if (flags.image)
			void drawnSample().then((file) => this.load(file));
		if (!flags.typeLater) return;
		const timers = [
			window.setTimeout(
				() => this.choose('achromatopsia'),
				2000,
			),
			window.setTimeout(
				() => this.choose('protanopia'),
				3000,
			),
		];
		registerDestructor(this, () =>
			timers.forEach((timer) => window.clearTimeout(timer)),
		);
	}

	get hex() {
		return hex(this.state.colour);
	}

	get text() {
		return this.colourNotation.format(this.hex);
	}

	get type() {
		return visionTypes.find((v) => v.type === this.selected)!;
	}

	get vision() {
		return MATRICES[this.selected];
	}

	simulated(type: SimulationType) {
		return simulateHex(this.hex, type)?.toUpperCase() ?? this.hex;
	}

	get rows() {
		return visionTypes.map((v) => {
			const code = this.simulated(v.type);
			return {
				...v,
				detail: v.severity
					? `${v.severity} · ${v.short}`
					: v.short,
				value: this.colourNotation.format(code),
				swatch: htmlSafe(`background: ${code}`),
				thumb: this.thumbs[v.type],
				selected: v.type === this.selected,
			};
		});
	}

	get panes() {
		return [
			{ title: 'Original', code: this.hex },
			{
				title: this.type.name,
				code: this.simulated(this.selected),
			},
		].map(({ title, code }) => ({
			title,
			value: this.colourNotation.format(code),
			style: htmlSafe(
				`background: ${code}; color: ${takesBlackInk(parseHex(code)!) ? 'black' : 'white'}`,
			),
		}));
	}

	get modeIndex() {
		return this.imageMode ? 1 : 0;
	}

	get sideBySide() {
		return this.view === 1;
	}

	get result() {
		return this.results[this.selected];
	}

	get sizeText() {
		const { source } = this;
		return source ? `${source.width} × ${source.height}` : '';
	}

	get simulatedAlt() {
		return `Simulated ${this.type.name}`;
	}

	pickMode = (index: number) => {
		this.imageMode = index === 1;
		void this.simulate();
	};

	pickView = (index: number) => (this.view = index);

	choose = (type: SimulationType) => {
		this.selected = type;
		void this.simulate();
	};

	parse = (text: string) => {
		const colour = readColour(text);
		if (colour) this.state.use(colour);
		return colour !== undefined;
	};

	typeLive = (event: Event) => {
		const colour = readColour(
			(event.target as HTMLInputElement).value,
		);
		if (colour) this.state.use(colour);
	};

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	chooseFile = () => this.#input?.click();

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

	load = async (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const run = ++this.#loading;
		let bitmap: ImageBitmap;
		try {
			bitmap = await decodeImage(file);
		} catch {
			return;
		}
		if (run !== this.#loading || isDestroying(this)) {
			bitmap.close();
			return;
		}
		const full = drawn(bitmap, maxEdge);
		const small = drawn(bitmap, thumbEdge);
		bitmap.close();
		const pixels = full.context.getImageData(
			0,
			0,
			full.canvas.width,
			full.canvas.height,
		);
		const thumbPixels = small.context.getImageData(
			0,
			0,
			small.canvas.width,
			small.canvas.height,
		);
		const url = await blobUrl(full.canvas);
		if (!url) return;
		if (run !== this.#loading || isDestroying(this)) {
			URL.revokeObjectURL(url);
			return;
		}
		this.#release();
		this.imageMode = true;
		this.source = {
			name: file.name || 'image',
			width: pixels.width,
			height: pixels.height,
			url,
			pixels,
		};
		this.thumbs = Object.fromEntries(
			visionTypes.map(({ type }) => [
				type,
				painted(thumbPixels, type).toDataURL(),
			]),
		);
		this.results = { normal: url };
		void this.simulate();
	};

	clear = () => {
		this.#loading++;
		this.#release();
		this.source = undefined;
		this.results = {};
		this.thumbs = {};
	};

	simulate = async () => {
		const { source, selected } = this;
		if (!this.imageMode || !source || this.busy) return;
		if (this.results[selected]) return;
		this.busy = true;
		await new Promise((resolve) => setTimeout(resolve, 16));
		const url = await blobUrl(painted(source.pixels, selected));
		this.busy = false;
		if (source !== this.source || isDestroying(this)) {
			if (url) URL.revokeObjectURL(url);
			return;
		}
		if (url) this.results = { ...this.results, [selected]: url };
		if (this.selected !== selected) void this.simulate();
	};

	download = () => {
		const { source, result } = this;
		if (source && result)
			downloadUrl(
				result,
				`${stem(source.name)}-${this.selected}.png`,
			);
	};

	#release() {
		for (const url of Object.values(this.results))
			if (url) URL.revokeObjectURL(url);
	}

	<template>
		<CanonSplit
			class="colorblind-sim"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					{{#if this.imageMode}}
						{{#if this.source}}
							{{#if this.sideBySide}}
								<div
									class="cbs-pair"
								>
									<figure
										class="cbs-pair-pane"
									>
										<img
											src={{this.source.url}}
											alt="Original"
										/>
										<figcaption
										>Original</figcaption>
									</figure>
									<figure
										class="cbs-pair-pane"
									>
										{{#if
											this.result
										}}
											<img
												src={{this.result}}
												alt={{this.simulatedAlt}}
											/>
										{{/if}}
										<figcaption
										>{{this.type.name}}</figcaption>
									</figure>
								</div>
							{{else}}
								<CanonImageCompare
									@before={{this.source.url}}
									@after={{this.result}}
									@beforeTitle="Original"
									@afterTitle={{this.type.name}}
								/>
							{{/if}}
							{{#if this.busy}}
								<CanonLoader
									class="cbs-loader"
								/>
							{{/if}}
						{{else}}
							<Slot
								class="cbs-slot"
								@prompt="Drop an image"
								@icon="image"
								@dashed={{true}}
								@fills={{true}}
								@onChoose={{this.chooseFile}}
							/>
						{{/if}}
					{{else}}
						<div class="cbs-picture">
							<CanonColourSolid
								class="cbs-solid"
								@space={{this.state.space}}
								@point={{this.state.point}}
								@animated={{this.state.animated}}
								@sliceAxis={{this.state.sliceAxis}}
								@isOrtho={{this.state.isOrtho}}
								@showsWhole={{this.state.showsWhole}}
								@vision={{this.vision}}
								@onChange={{this.state.pick}}
								@closestName={{closestName}}
							/>
							<NotationStrip
								@hex={{this.hex}}
							/>
						</div>
					{{/if}}
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonSegmented
						class="cbs-modes"
						@items={{modes}}
						@selected={{this.modeIndex}}
						@onChange={{this.pickMode}}
					/>
					{{#unless this.imageMode}}
						<CanonColourNotationInput
							class="cbs-input"
							@colour={{this.state.colour}}
							@text={{this.text}}
							@onColour={{this.state.use}}
							@parse={{this.parse}}
							@label="Colour"
							@placeholder="#e63946"
							{{on
								"input"
								this.typeLive
							}}
							{{on
								"focusin"
								this.selectAll
							}}
						/>
					{{/unless}}
				</CanonRows>
				{{#if this.imageMode}}
					<CanonRows @framed={{true}}>
						{{#if this.source}}
							<CanonRow
								class="cbs-source"
								@title={{this.source.name}}
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
							<CanonRow
								@title="View"
								@form="flush"
							>
								<CanonSegmented
									class="cbs-views"
									@items={{views}}
									@selected={{this.view}}
									@onChange={{this.pickView}}
								/>
							</CanonRow>
							<CanonGrid>
								<CanonButton
									class="cbs-download"
									@text="Download colourblind image"
									@icon={{Save}}
									@disabled={{if
										this.result
										false
										true
									}}
									@onClick={{this.download}}
								/>
							</CanonGrid>
						{{else}}
							<CanonDropZone
								class="cbs-drop"
								@prompt="Drop an image"
								@onFiles={{this.loadFiles}}
								{{on
									"paste"
									keepPaste
								}}
							/>
						{{/if}}
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonColourControls
							@state={{this.state}}
							@hidesNotation={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="Simulation Types"
					/>
					<div class="cbs-types">
						{{#each
							this.rows key="type"
							as |row|
						}}
							<button
								type="button"
								class="cbs-type
									{{if
										row.selected
										'cbs-type--selected'
									}}"
								aria-pressed={{if
									row.selected
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.choose
										row.type
									)
								}}
							>
								<span
									class="cbs-type-swatch"
									style={{unless
										this.imageMode
										row.swatch
									}}
								>
									{{#if
										this.imageMode
									}}
										{{#if
											row.thumb
										}}
											<img
												src={{row.thumb}}
												alt=""
											/>
										{{/if}}
									{{/if}}
								</span>
								<span
									class="cbs-type-cell"
								>
									<span
										class="cbs-type-text"
									>
										<span
											class="cbs-type-name"
										>{{row.name}}</span>
										<span
											class="cbs-type-detail"
										>{{row.detail}}</span>
									</span>
									{{#unless
										this.imageMode
									}}
										<span
											class="cbs-type-value"
										>{{row.value}}</span>
									{{/unless}}
								</span>
							</button>
						{{/each}}
					</div>
				</CanonRows>
				{{#unless this.imageMode}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Comparison"
						/>
						<div class="cbs-compare">
							{{#each
								this.panes
								as |pane|
							}}
								<div
									class="cbs-pane"
									style={{pane.style}}
								>
									<span
										class="cbs-pane-title"
									>{{pane.title}}</span>
									<span
										class="cbs-pane-value"
									>{{pane.value}}</span>
								</div>
							{{/each}}
						</div>
					</CanonRows>
				{{/unless}}
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="About Colour Blindness"
					/>
					<div class="cbs-about">
						<p>Colour blindness affects
							approximately 8% of AMAB
							and 0.5% of AFAB people
							worldwide. The most
							common types are
							red-green deficiencies
							(protanopia/deuteranopia).</p>
						<p>When designing, ensure
							sufficient contrast and
							don't rely solely on
							colour to convey
							information. Use
							patterns, labels, or
							icons as additional
							indicators.</p>
					</div>
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
