import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import Dialog from 'delphitools-v2/components/ui/dialog';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	hexToRgb,
	rgbToHex,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

type SimulationType =
	| 'normal'
	| 'protanopia'
	| 'deuteranopia'
	| 'tritanopia'
	| 'protanomaly'
	| 'deuteranomaly'
	| 'tritanomaly'
	| 'achromatopsia'
	| 'achromatomaly';

type Severity = 'none' | 'partial' | 'full';

type Mode = 'colour' | 'image';

interface SimulationInfo {
	name: string;
	description: string;
	severity: Severity;
	prevalence: string;
}

// Names, descriptions and prevalences carried over verbatim from the Next app.
const SIMULATIONS: Record<SimulationType, SimulationInfo> = {
	normal: {
		name: 'Normal Vision',
		description: 'No colour vision deficiency',
		severity: 'none',
		prevalence: '~92% of population',
	},
	protanopia: {
		name: 'Protanopia',
		description: 'Red-blind, cannot perceive red light',
		severity: 'full',
		prevalence: '~1% of AMAB',
	},
	deuteranopia: {
		name: 'Deuteranopia',
		description: 'Green-blind, cannot perceive green light',
		severity: 'full',
		prevalence: '~1% of AMAB',
	},
	tritanopia: {
		name: 'Tritanopia',
		description: 'Blue-blind, cannot perceive blue light',
		severity: 'full',
		prevalence: '~0.003% of population',
	},
	protanomaly: {
		name: 'Protanomaly',
		description: 'Red-weak, reduced sensitivity to red',
		severity: 'partial',
		prevalence: '~1% of AMAB',
	},
	deuteranomaly: {
		name: 'Deuteranomaly',
		description: 'Green-weak, reduced sensitivity to green',
		severity: 'partial',
		prevalence: '~5% of AMAB',
	},
	tritanomaly: {
		name: 'Tritanomaly',
		description: 'Blue-weak, reduced sensitivity to blue',
		severity: 'partial',
		prevalence: '~0.01% of population',
	},
	achromatopsia: {
		name: 'Achromatopsia',
		description: 'Total colour blindness, sees only grayscale',
		severity: 'full',
		prevalence: '~0.003% of population',
	},
	achromatomaly: {
		name: 'Achromatomaly',
		description:
			'Partial colour blindness, reduced colour perception',
		severity: 'partial',
		prevalence: 'Very rare',
	},
};

const SIM_KEYS = Object.keys(SIMULATIONS) as SimulationType[];

const SEVERITY_LABEL: Record<Severity, string> = {
	none: 'Normal',
	partial: 'Partial',
	full: 'Full',
};

/** Rows of an sRGB-to-sRGB mixing matrix, each row summing to 1. */
type Matrix = readonly [Triple, Triple, Triple];

// Carried over byte-for-byte from the Next app so both render the same colours.
// Its comment credits Machado, Oliveira and Fernandes (2009), but the values are
// not that paper's: they are the older HCIRN/"Color Blindness Simulation" set,
// which also mixes gamma-encoded sRGB rather than linear light. Correcting
// either would break parity with the CLI and iOS repos.
const MATRICES: Record<SimulationType, Matrix> = {
	normal: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
	protanopia: [
		[0.567, 0.433, 0],
		[0.558, 0.442, 0],
		[0, 0.242, 0.758],
	],
	deuteranopia: [
		[0.625, 0.375, 0],
		[0.7, 0.3, 0],
		[0, 0.3, 0.7],
	],
	tritanopia: [
		[0.95, 0.05, 0],
		[0, 0.433, 0.567],
		[0, 0.475, 0.525],
	],
	protanomaly: [
		[0.817, 0.183, 0],
		[0.333, 0.667, 0],
		[0, 0.125, 0.875],
	],
	deuteranomaly: [
		[0.8, 0.2, 0],
		[0.258, 0.742, 0],
		[0, 0.142, 0.858],
	],
	tritanomaly: [
		[0.967, 0.033, 0],
		[0, 0.733, 0.267],
		[0, 0.183, 0.817],
	],
	achromatopsia: [
		[0.299, 0.587, 0.114],
		[0.299, 0.587, 0.114],
		[0.299, 0.587, 0.114],
	],
	achromatomaly: [
		[0.618, 0.32, 0.062],
		[0.163, 0.775, 0.062],
		[0.163, 0.32, 0.516],
	],
};

/** Six digits behind a #, the only form `<input type="color">` accepts. */
const HEX = /^#[0-9a-f]{6}$/i;

// Every row is non-negative and sums to 1, so the result is already within
// 0-255 and needs no clamp.
function applyMatrix(matrix: Matrix, r: number, g: number, b: number): Triple {
	return [
		Math.round(
			matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b,
		),
		Math.round(
			matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b,
		),
		Math.round(
			matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b,
		),
	];
}

/** Null when the hex does not parse, which blanks the dependent swatch. */
function simulateHex(hex: string, type: SimulationType): string | null {
	const rgb = hexToRgb(hex);
	if (!rgb) return null;
	return rgbToHex(...applyMatrix(MATRICES[type], ...rgb));
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('image failed to load'));
		image.src = src;
	});
}

function fill(hex: string | null) {
	return htmlSafe(hex ? `background-color: ${hex}` : '');
}

export default class ColorblindSimTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked mode: Mode = 'colour';
	@tracked colour = '#e63946';
	@tracked selectedSim: SimulationType = 'normal';
	@tracked sourceImage: string | null = null;
	@tracked simulatedImage: string | null = null;
	@tracked zoomed: { src: string; label: string } | null = null;

	#destroyed = false;
	/** Bumped per run, so a slow decode cannot overwrite a newer result. */
	#run = 0;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
	}

	get isColourMode() {
		return this.mode === 'colour';
	}

	/** Null while the typed hex is half-finished, matching the Next app. */
	get validColour(): string | null {
		return HEX.test(this.colour) ? this.colour : null;
	}

	/** `<input type="color">` resets itself on a value it cannot parse. */
	get pickerValue() {
		return this.validColour ?? '#000000';
	}

	get pickerStyle() {
		return fill(this.pickerValue);
	}

	get originalStyle() {
		return fill(this.validColour);
	}

	get selectedInfo() {
		return SIMULATIONS[this.selectedSim];
	}

	get selectedHex() {
		return this.validColour
			? simulateHex(this.validColour, this.selectedSim)
			: null;
	}

	get selectedStyle() {
		return fill(this.selectedHex);
	}

	/** Both halves are the Next app's wording; only the join is local. */
	get selectedDetail() {
		const info = this.selectedInfo;
		return `${info.description} — ${info.prevalence}`;
	}

	get simulations() {
		return SIM_KEYS.map((key) => {
			const info = SIMULATIONS[key];
			const hex = this.validColour
				? simulateHex(this.validColour, key)
				: null;
			return {
				key,
				name: info.name,
				value: hex
					? this.colourNotation.format(hex)
					: '',
				badge: SEVERITY_LABEL[info.severity],
				badgeClass: `dt-cbs-badge is-${info.severity}`,
				swatchStyle: fill(hex),
				isActive: key === this.selectedSim,
			};
		});
	}

	setColour = (event: Event) => {
		this.colour = (event.target as HTMLInputElement).value;
	};

	setMode = (mode: Mode) => {
		this.mode = mode;
		void this.process();
	};

	chooseSim = (type: SimulationType) => {
		this.selectedSim = type;
		void this.process();
	};

	readFile = (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const reader = new FileReader();
		reader.onload = () => {
			this.sourceImage = reader.result as string;
			this.simulatedImage = null;
			void this.process();
		};
		reader.readAsDataURL(file);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	clearImage = () => {
		this.sourceImage = null;
		this.simulatedImage = null;
	};

	/**
	 * Redraws the simulated image. This replaces the Next app's effect on
	 * [sourceImage, selectedSim, mode]: each of those changes through an action
	 * here, so the redraw starts from the action instead.
	 *
	 * The previous result stays on screen until the new one is ready, as in the
	 * Next app — blanking it first flashes the placeholder on every type change.
	 */
	process = async () => {
		const source = this.sourceImage;
		const type = this.selectedSim;
		if (this.mode !== 'image' || !source) return;

		const run = ++this.#run;

		if (type === 'normal') {
			this.simulatedImage = source;
			return;
		}

		let image: HTMLImageElement;
		try {
			image = await loadImage(source);
		} catch {
			return;
		}
		if (this.#destroyed || run !== this.#run) return;

		const canvas = document.createElement('canvas');
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(image, 0, 0);

		const imageData = ctx.getImageData(
			0,
			0,
			canvas.width,
			canvas.height,
		);
		const data = imageData.data;
		const matrix = MATRICES[type];

		for (let i = 0; i < data.length; i += 4) {
			const [r, g, b] = applyMatrix(
				matrix,
				data[i]!,
				data[i + 1]!,
				data[i + 2]!,
			);
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
		}

		ctx.putImageData(imageData, 0, 0);
		this.simulatedImage = canvas.toDataURL('image/png');
	};

	zoomSource = (open: () => void) => {
		if (!this.sourceImage) return;
		this.zoomed = { src: this.sourceImage, label: 'Original' };
		open();
	};

	zoomResult = (open: () => void) => {
		if (!this.simulatedImage) return;
		this.zoomed = {
			src: this.simulatedImage,
			label: this.selectedInfo.name,
		};
		open();
	};

	clearZoom = () => {
		this.zoomed = null;
	};

	<template>
		<Dialog @onClose={{this.clearZoom}} as |d|>
			<div
				class="dt-cbs"
				{{filePaste this.readFile accept="image/*"}}
			>
				<div class="dt-cbs-frame">
					<div class="segmented dt-cbs-modes">
						<button
							type="button"
							class="dt-cbs-mode
								{{if
									this.isColourMode
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setMode
									"colour"
								)
							}}
						>
							<Icon @name="palette" />
							{{! wording carried over from the Next app }}
							Colour Mode
						</button>
						<button
							type="button"
							class="dt-cbs-mode
								{{unless
									this.isColourMode
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setMode
									"image"
								)
							}}
						>
							<Icon @name="image" />
							{{! wording carried over from the Next app }}
							Image Mode
						</button>
					</div>

					{{#if this.isColourMode}}
						<div class="dt-cbs-pick">
							{{! wording carried over from the Next app }}
							<span
								class="dt-cbs-label"
							>Select Colour</span>
							<div
								class="dt-cbs-field"
							>
								<span
									class="dt-cbs-picker"
								>
									<span
										style={{this.pickerStyle}}
										aria-hidden="true"
									></span>
									<input
										type="color"
										value={{this.pickerValue}}
										aria-label="Pick colour"
										{{on
											"input"
											this.setColour
										}}
									/>
								</span>
								<input
									type="text"
									class="dt-cbs-hex"
									value={{this.colour}}
									placeholder="#e63946"
									aria-label="Colour"
									{{on
										"input"
										this.setColour
									}}
								/>
							</div>
						</div>

						<div class="dt-cbs-types">
							<div
								class="dt-cbs-types-head"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-cbs-label"
								>Vision Types</span>
							</div>
							<div
								class="dt-cbs-grid"
							>
								{{#each
									this.simulations
									key="key"
									as |sim|
								}}
									<button
										type="button"
										class="dt-cbs-cell
											{{if
												sim.isActive
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.chooseSim
												sim.key
											)
										}}
									>
										<span
											class="dt-cbs-cell-top"
										>
											<span
												class="dt-cbs-cell-swatch"
												style={{sim.swatchStyle}}
											></span>
											<span
												class="dt-cbs-cell-text"
											>
												<span
													class="dt-cbs-cell-name"
												>{{sim.name}}</span>
												<span
													class="dt-cbs-cell-value"
												>{{sim.value}}</span>
											</span>
										</span>
										<span
											class={{sim.badgeClass}}
										>{{sim.badge}}</span>
									</button>
								{{/each}}
							</div>
						</div>

						<div class="dt-cbs-head">
							{{! wording carried over from the Next app }}
							<span
								class="dt-cbs-label"
							>Comparison</span>
						</div>
						<div class="dt-cbs-compare">
							<div
								class="dt-cbs-pane"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-cbs-pane-title"
								>Original</span>
								<span
									class="dt-cbs-fill"
									style={{this.originalStyle}}
								></span>
								<span
									class="dt-cbs-pane-value"
								>{{this.colour}}</span>
							</div>
							<div
								class="dt-cbs-pane"
							>
								<span
									class="dt-cbs-pane-title"
								>{{this.selectedInfo.name}}</span>
								<span
									class="dt-cbs-fill"
									style={{this.selectedStyle}}
								></span>
								<span
									class="dt-cbs-pane-value"
								>{{this.selectedHex}}</span>
							</div>
						</div>

						<div class="dt-cbs-desc">
							<span
								class="dt-cbs-desc-name"
							>{{this.selectedInfo.name}}</span>
							{{! wording carried over from the Next app }}
							<span
								class="dt-cbs-desc-text"
							>{{this.selectedDetail}}</span>
						</div>
					{{else if this.sourceImage}}
						<div class="dt-cbs-bar">
							{{! wording carried over from the Next app }}
							<span
								class="dt-cbs-bar-title"
							>Simulation Preview</span>
							<button
								type="button"
								class="dt-cbs-bar-btn"
								{{on
									"click"
									this.clearImage
								}}
							>
								<Icon
									@name="trash-2"
								/>
								Clear
							</button>
						</div>

						<div class="dt-cbs-types">
							<div
								class="dt-cbs-types-head"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-cbs-label"
								>Vision Type</span>
							</div>
							<div
								class="segmented dt-cbs-type-grid"
							>
								{{#each
									this.simulations
									key="key"
									as |sim|
								}}
									<button
										type="button"
										class="dt-cbs-type
											{{if
												sim.isActive
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.chooseSim
												sim.key
											)
										}}
									>{{sim.name}}</button>
								{{/each}}
							</div>
						</div>

						<div
							class="dt-cbs-desc is-shaded"
						>
							<span
								class="dt-cbs-desc-name"
							>{{this.selectedInfo.name}}</span>
							{{! wording carried over from the Next app }}
							<span
								class="dt-cbs-desc-text"
							>{{this.selectedDetail}}</span>
						</div>

						<div class="dt-cbs-compare">
							<div
								class="dt-cbs-pane"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-cbs-pane-title"
								>Original</span>
								<button
									type="button"
									class="dt-cbs-zoom"
									{{on
										"click"
										(fn
											this.zoomSource
											d.open
										)
									}}
								>
									<img
										src={{this.sourceImage}}
										alt="Original"
									/>
								</button>
							</div>
							<div
								class="dt-cbs-pane"
							>
								<span
									class="dt-cbs-pane-title"
								>{{this.selectedInfo.name}}</span>
								{{#if
									this.simulatedImage
								}}
									<button
										type="button"
										class="dt-cbs-zoom"
										{{on
											"click"
											(fn
												this.zoomResult
												d.open
											)
										}}
									>
										<img
											src={{this.simulatedImage}}
											alt="Simulated
												{{this.selectedInfo.name}}"
										/>
									</button>
								{{else}}
									{{! wording carried over from the Next app }}
									<span
										class="dt-cbs-pending"
									>Processing...</span>
								{{/if}}
							</div>
						</div>
					{{else}}
						<label
							class="dt-cbs-drop"
							{{on
								"drop"
								this.handleDrop
							}}
							{{on
								"dragover"
								this.allowDrop
							}}
						>
							<input
								type="file"
								accept="image/*"
								class="dt-sr-only"
								{{on
									"change"
									this.handleFileSelect
								}}
							/>
							<Icon @name="upload" />
							{{! wording carried over from the Next app }}
							<span
								class="dt-cbs-drop-title"
							>Drop image here</span>
							{{! wording carried over from the Next app }}
							<span
								class="dt-cbs-drop-hint"
							>or click to select, or
								paste</span>
						</label>
					{{/if}}
				</div>

				<div class="dt-cbs-about">
					{{! wording carried over from the Next app }}
					<span class="dt-cbs-about-title">About
						Colour Blindness</span>
					{{! wording carried over from the Next app }}
					<p>Colour blindness affects
						approximately 8% of AMAB and
						0.5% of AFAB people worldwide.
						The most common types are
						red-green deficiencies
						(protanopia/deuteranopia).</p>
					{{! wording carried over from the Next app }}
					<p>When designing, ensure sufficient
						contrast and don't rely solely
						on colour to convey information.
						Use patterns, labels, or icons
						as additional indicators.</p>
				</div>

				<d.Content class="dt-cbs-lightbox">
					{{#if this.zoomed}}
						<h2
							class="dt-sr-only"
						>{{this.zoomed.label}}</h2>
						<button
							type="button"
							class="dt-cbs-lightbox-btn"
							{{on "click" d.close}}
						>
							<img
								src={{this.zoomed.src}}
								alt={{this.zoomed.label}}
							/>
						</button>
					{{/if}}
				</d.Content>
			</div>
		</Dialog>
	</template>
}
