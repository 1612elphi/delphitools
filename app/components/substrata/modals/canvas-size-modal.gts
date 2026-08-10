import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	ColourSwatchCell,
	DeferredHexInput,
	normalizeHex,
} from 'delphitools-v2/components/colour-field';
import Switch from 'delphitools-v2/components/ui/switch';
import { getSnapshot } from 'delphitools-v2/lib/substrata/doc-store';
import {
	resizeArtboardReflow,
	setArtboard,
} from 'delphitools-v2/lib/substrata/artboard-ops';
import { createScene } from 'delphitools-v2/lib/substrata/file-ops';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import { closeModal } from 'delphitools-v2/lib/substrata/modal';
import { DEFAULT_ARTBOARD } from 'delphitools-v2/lib/substrata/doc-model';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';

/**
 * Canvas size modal (blocking, §7) — edits the document artboard. Reads the
 * current artboard once to seed a LOCAL DRAFT; editing only touches the draft.
 * Apply commits the draft through `setArtboard` (a single undoable step) then
 * closes; Cancel discards it. The modal is remounted per open (ModalHost
 * renders it conditionally), so a constructor seed is the right shape — no
 * need to resync on later doc changes.
 *
 * Field labels + preset dimensions are functional chrome / data, not authored
 * copy. British spelling in our own identifiers ("colour").
 */

/** Common canvas sizes, shown as DIMENSION labels (data). First is the
 *  default. */
const PRESETS: { w: number; h: number }[] = [
	{ w: 2000, h: 1500 },
	{ w: 1080, h: 1080 },
	{ w: 1080, h: 1920 },
	{ w: 1920, h: 1080 },
	{ w: 1200, h: 630 },
	{ w: 1600, h: 900 },
];

/** Greatest common divisor for the aspect-ratio readout. */
function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

interface NumberFieldSignature {
	Element: HTMLLabelElement;
	Args: {
		label: string;
		unit?: string;
		value: string;
		onChange: (next: string) => void;
	};
}

/** A flush, labelled numeric cell (draft-as-string; parsed/clamped on Apply).
 *  Wrapped in <label> so the visible label is the accessible name. */
class NumberField extends Component<NumberFieldSignature> {
	onInput = (event: Event) => {
		this.args.onChange(
			(event.currentTarget as HTMLInputElement).value,
		);
	};

	onFocus = (event: FocusEvent) => {
		(event.currentTarget as HTMLInputElement).select();
	};

	<template>
		<label class="sub-csm-field" ...attributes>
			<span class="sub-csm-field-label">{{@label}}</span>
			<input
				type="text"
				inputmode="numeric"
				value={{@value}}
				class="sub-csm-field-input"
				{{on "input" this.onInput}}
				{{on "focus" this.onFocus}}
			/>
			{{#if @unit}}
				<span
					class="sub-csm-field-unit"
				>{{@unit}}</span>
			{{/if}}
		</label>
	</template>
}

export interface CanvasSizeModalSignature {
	Args: {
		mode?: 'resize' | 'new';
	};
}

export default class CanvasSizeModal extends Component<CanvasSizeModalSignature> {
	mode = this.args.mode ?? 'resize';
	seedArtboard =
		this.mode === 'new'
			? DEFAULT_ARTBOARD
			: (getSnapshot()?.artboard ?? DEFAULT_ARTBOARD);

	@tracked width = String(this.seedArtboard.width);
	@tracked height = String(this.seedArtboard.height);
	@tracked resolution = String(this.seedArtboard.resolution);
	@tracked colour =
		normalizeHex(this.seedArtboard.background ?? '') ?? '#ffffff';
	@tracked transparent = this.seedArtboard.background === null;
	// Magic resize (M7-8/9): reflow layers with the artboard. Off by default —
	// a plain canvas-size edit stays a plain canvas-size edit.
	@tracked reflow = false;
	// "new" mode is TWO steps (Ruby 2026-07-12): a chooser — upload an image
	// or create an empty scene — then the size form for the blank path only.
	@tracked step: 'choose' | 'size' =
		this.mode === 'new' ? 'choose' : 'size';

	#fileInput: HTMLInputElement | null = null;

	registerInput = modifier((element: HTMLInputElement) => {
		this.#fileInput = element;
		return () => {
			this.#fileInput = null;
		};
	});

	// "new" mode's second door: a scene built FROM an image — artboard sized
	// to the picture, the file imported as its first layer (placeOnArtboard
	// lands it full-bleed; a GPU-clamped decode scales to fit the same frame).
	fromImage = async (file: File) => {
		let w = DEFAULT_ARTBOARD.width;
		let h = DEFAULT_ARTBOARD.height;
		try {
			const bmp = await createImageBitmap(file);
			w = bmp.width;
			h = bmp.height;
			bmp.close();
		} catch {
			return; // undecodable file — leave the dialog open
		}
		createScene({ ...DEFAULT_ARTBOARD, width: w, height: h });
		await importImageFile(file);
		viewport.fit();
		closeModal();
	};

	onPickFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const f = input.files?.[0];
		if (f) void this.fromImage(f);
		input.value = '';
	};

	pickUpload = () => this.#fileInput?.click();

	toSizeStep = () => {
		this.step = 'size';
	};

	setWidth = (next: string) => {
		this.width = next;
	};
	setHeight = (next: string) => {
		this.height = next;
	};
	setResolution = (next: string) => {
		this.resolution = next;
	};

	// Picking any colour implies an opaque background.
	pickColour = (hex: string) => {
		this.colour = hex;
		this.transparent = false;
	};

	toggleTransparent = () => {
		this.transparent = !this.transparent;
	};

	setReflow = (next: boolean) => {
		this.reflow = next;
	};

	applyPreset = (p: { w: number; h: number }) => {
		this.width = String(p.w);
		this.height = String(p.h);
	};

	isPresetActive = (p: { w: number; h: number }) =>
		this.wNum === p.w && this.hNum === p.h;

	get wNum() {
		return parseInt(this.width, 10);
	}
	get hNum() {
		return parseInt(this.height, 10);
	}
	get dimsValid() {
		return (
			Number.isFinite(this.wNum) &&
			Number.isFinite(this.hNum) &&
			this.wNum >= 1 &&
			this.hNum >= 1
		);
	}
	// Live readout (data): parse the draft; only valid, ≥1 integers get an
	// aspect.
	get readout() {
		if (!this.dimsValid) return '—';
		const g = gcd(this.wNum, this.hNum);
		return `${this.wNum} × ${this.hNum} px · ${this.wNum / g}:${this.hNum / g}`;
	}

	get swatchOpacity() {
		return this.transparent ? 0 : undefined;
	}

	cancel = () => {
		// new mode: Cancel steps back to the two-door chooser; only
		// dialog-level dismissal (Esc/X) falls back via ensureScene
		if (this.mode === 'new') this.step = 'choose';
		else closeModal();
	};

	apply = () => {
		const w = Math.max(
			1,
			Math.round(
				Number(this.width) || DEFAULT_ARTBOARD.width,
			),
		);
		const h = Math.max(
			1,
			Math.round(
				Number(this.height) || DEFAULT_ARTBOARD.height,
			),
		);
		const res = Math.max(
			1,
			Math.round(
				Number(this.resolution) ||
					DEFAULT_ARTBOARD.resolution,
			),
		);
		const artboard = {
			width: w,
			height: h,
			resolution: res,
			background: this.transparent ? null : this.colour,
		};
		const ab = getSnapshot()?.artboard ?? DEFAULT_ARTBOARD;
		if (this.mode === 'new') {
			// bitDepth/colourMode ride the defaults — the dialog only drafts
			// dims + background
			createScene({ ...DEFAULT_ARTBOARD, ...artboard }); // fresh doc, history reset
			viewport.fit();
		} else if (this.reflow && (w !== ab.width || h !== ab.height)) {
			// one undoable step: artboard + layer reflow
			resizeArtboardReflow(artboard);
			// aspect jumps reframe — the reconciler never refits itself
			viewport.fit();
		} else {
			setArtboard(artboard);
		}
		closeModal();
	};

	<template>
		<div class="sub-modal-frame sub-csm">
			<div class="sub-modal-header">
				<h2 class="sub-modal-title">
					{{! "New scene" reuses the Scene-menu item's shipped label }}
					{{if
						(eq this.mode "new")
						"New scene"
						"Canvas size"
					}}
				</h2>
			</div>

			{{#if (eq this.step "choose")}}
				{{! Step 1 (new mode only): the two-door chooser — labels +
					"or" are Ruby's wording verbatim. }}
				<div class="sub-csm-choose">
					<input
						type="file"
						accept="image/*"
						class="dt-sr-only"
						aria-label="Upload an image"
						{{this.registerInput}}
						{{on "change" this.onPickFile}}
					/>
					<button
						type="button"
						class="sub-csm-door"
						{{on "click" this.pickUpload}}
					>
						<Icon @name="image-plus" />
						Upload an image
					</button>
					<div
						class="sub-csm-or"
						aria-hidden="true"
					>
						<span
							class="sub-csm-or-line"
						></span>
						<span
							class="sub-csm-or-word"
						>or</span>
						<span
							class="sub-csm-or-line"
						></span>
					</div>
					<button
						type="button"
						class="sub-csm-door"
						{{on "click" this.toSizeStep}}
					>
						<Icon @name="square-dashed" />
						Create an empty scene
					</button>
				</div>
			{{else}}
				<div class="sub-csm-body">
					{{! Presets — dimension labels are data, not copy. }}
					<section class="sub-csm-section">
						<div
							class="sub-csm-heading"
						>Presets</div>
						<div
							class="segmented sub-csm-presets"
						>
							{{#each
								PRESETS key="w"
								as |p|
							}}
								<button
									type="button"
									class="sub-csm-preset
										{{if
											(this.isPresetActive
												p
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.applyPreset
											p
										)
									}}
								>
									{{p.w}}
									×
									{{p.h}}
								</button>
							{{/each}}
						</div>
					</section>

					{{! Dimensions — Width | Height, then Resolution across
						both cells. }}
					<section class="sub-csm-section">
						<div
							class="segmented sub-csm-dims"
						>
							<NumberField
								@label="Width"
								@unit="px"
								@value={{this.width}}
								@onChange={{this.setWidth}}
							/>
							<NumberField
								@label="Height"
								@unit="px"
								@value={{this.height}}
								@onChange={{this.setHeight}}
							/>
							<NumberField
								@label="Resolution"
								@unit="ppi"
								@value={{this.resolution}}
								@onChange={{this.setResolution}}
								class="sub-csm-field-wide"
							/>
						</div>
						<div
							class="sub-csm-readout"
						>{{this.readout}}</div>
					</section>

					{{! Magic resize (M7): when on, Apply re-anchors +
						proportionally scales every layer with the artboard
						(anchor+proportional, ratified). Hidden in "new" mode —
						a fresh scene has no layers to reflow. }}
					{{#unless (eq this.mode "new")}}
						<section class="sub-csm-reflow">
							<span
								class="sub-csm-reflow-label"
							>Reflow layers to fit</span>
							<Switch
								@checked={{this.reflow}}
								@onChange={{this.setReflow}}
								@label="Reflow layers to fit"
							/>
						</section>
					{{/unless}}

					{{! Background — swatch + hex, plus a Transparent toggle
						(→ background null). }}
					<section class="sub-csm-section">
						<div
							class="sub-csm-heading"
						>Background</div>
						<div class="sub-csm-bg">
							<div
								class="sub-csm-swatch-cell"
							>
								<ColourSwatchCell
									@colour={{this.colour}}
									@onChange={{this.pickColour}}
									@label="Background colour"
									@fillOpacity={{this.swatchOpacity}}
									class="sub-csm-swatch"
								/>
							</div>
							<DeferredHexInput
								@value={{this.colour}}
								@onChange={{this.pickColour}}
								@label="Background hex value"
								class="sub-csm-hex
									{{if
										this.transparent
										'is-transparent'
									}}"
							/>
							<button
								type="button"
								aria-pressed={{if
									this.transparent
									"true"
									"false"
								}}
								class="sub-csm-transparent
									{{if
										this.transparent
										'is-active'
									}}"
								{{on
									"click"
									this.toggleTransparent
								}}
							>
								Transparent
							</button>
						</div>
					</section>
				</div>

				{{! Footer — flush bar closed off by a 2px major divider
					(§5/§9). The primary Apply dominates the width; Cancel
					discards and closes. }}
				<div class="sub-modal-footer">
					<button
						type="button"
						class="sub-modal-btn is-ghost"
						{{on "click" this.cancel}}
					>
						Cancel
					</button>
					<button
						type="button"
						class="sub-modal-btn is-primary"
						{{on "click" this.apply}}
					>
						{{if
							(eq this.mode "new")
							"Create"
							"Apply"
						}}
					</button>
				</div>
			{{/if}}
		</div>
	</template>
}
