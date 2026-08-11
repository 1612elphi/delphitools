import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import type {
	Layer,
	RasterLayer,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	beginTransient,
	commitTransient,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	FILM_SIM_GRADES,
	FILM_SIM_PRESETS,
	applyGradeToImageData,
} from 'delphitools-v2/lib/substrata/filters';
import { isGroup } from 'delphitools-v2/lib/substrata/layer-tree';
import {
	LUT_LOOKS,
	applyLutToImageData,
	ensureAllLuts,
	getLoadedLut,
	lutEpoch,
	subscribeLuts,
} from 'delphitools-v2/lib/substrata/lut-data';
import {
	clearLook,
	getLook,
	setLook,
	setLookIntensity,
} from 'delphitools-v2/lib/substrata/look-ops';
import { getRaster } from 'delphitools-v2/lib/substrata/raster-cache';
import { ActiveLayer } from 'delphitools-v2/lib/substrata/active-layer';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * LOOKS module — the bespoke home of the film-sim/LUT family (Ruby,
 * 2026-07-03: pulled OUT of the FX pipeline; a look is browsed with the eyes,
 * not tuned with sliders). Gallery of the preset shelf rendered as LIVE
 * thumbnails — the selected layer's own pixels through each grade (the same
 * pure maths the engine's Canvas2D fallback uses) — plus a None card and one
 * intensity slider. A look is still the one film-sim entry in `layer.filters[]`,
 * pinned to the stack's END (grades after adjustments); look-ops is the only
 * writer.
 */

/** Thumbnail geometry: 3:2 cover-crop, 2-up in the module. */
const THUMB_W = 148;
const THUMB_H = 99;

interface Shelf {
	id: string;
	label: string;
	swatch: [string, string, string];
}

const SHELF: Shelf[] = [...FILM_SIM_PRESETS, ...LUT_LOOKS];

/** id → label across both shelves (authored grades + film LUTs). */
function lookLabel(presetId: string): string | null {
	return SHELF.find((p) => p.id === presetId)?.label ?? null;
}

function swatchStyle(swatch: [string, string, string]) {
	return htmlSafe(
		`background: linear-gradient(135deg, ${swatch[0]}, ${swatch[1]} 55%, ${swatch[2]})`,
	);
}

/**
 * Build the base thumbnail (cover-cropped) once per layer, then run each grade
 * over its pixels. Pure canvas work on ~15k pixels × N looks — cheap enough to
 * do synchronously.
 */
function buildThumbs(blobHash: string): Record<string, string> | null {
	const src = getRaster(blobHash);
	if (!src) return null;

	const base = document.createElement('canvas');
	base.width = THUMB_W;
	base.height = THUMB_H;
	const ctx = base.getContext('2d');
	if (!ctx) return null;
	// cover-crop: fill the 3:2 card from the source's centre
	const scale = Math.max(THUMB_W / src.width, THUMB_H / src.height);
	const w = src.width * scale;
	const h = src.height * scale;
	ctx.drawImage(src, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
	const basePixels = ctx.getImageData(0, 0, THUMB_W, THUMB_H);

	const work = document.createElement('canvas');
	work.width = THUMB_W;
	work.height = THUMB_H;
	const workCtx = work.getContext('2d');
	if (!workCtx) return null;

	const byPreset: Record<string, string> = {};
	const render = (
		id: string,
		apply: (data: Uint8ClampedArray) => void,
	) => {
		const px = new ImageData(
			new Uint8ClampedArray(basePixels.data),
			THUMB_W,
			THUMB_H,
		);
		apply(px.data);
		workCtx.putImageData(px, 0, 0);
		byPreset[id] = work.toDataURL();
	};
	for (const preset of FILM_SIM_PRESETS) {
		const grade = FILM_SIM_GRADES[preset.id];
		if (grade)
			render(preset.id, (data) =>
				applyGradeToImageData(data, grade, 1),
			);
	}
	for (const look of LUT_LOOKS) {
		const lut = getLoadedLut(look.id);
		if (lut)
			render(look.id, (data) =>
				applyLutToImageData(data, lut, 1),
			);
	}
	return byPreset;
}

/**
 * One-entry memo over buildThumbs. Sixteen PNG encodes is far too much to
 * repeat per render, and the result depends on nothing but the (immutable,
 * content-addressed) raster and which LUT strips have loaded. Single-entry
 * rather than a Map: each set holds ~16 data URLs, so keeping every layer's
 * would grow without bound for a case — flipping between layers mid-browse —
 * that is not worth the memory.
 */
let thumbMemo: { key: string; value: Record<string, string> | null } | null =
	null;

function cachedThumbs(
	blobHash: string,
	lutEpochValue: number,
): Record<string, string> | null {
	// Never memoise a miss: raster-cache has no subscription and the LUT epoch
	// stops moving once all strips load, so caching null for a still-hydrating
	// raster would leave that layer on swatch placeholders permanently.
	if (!getRaster(blobHash)) return null;
	const key = `${blobHash}:${lutEpochValue}`;
	if (thumbMemo?.key !== key)
		thumbMemo = { key, value: buildThumbs(blobHash) };
	return thumbMemo.value;
}

/** Active look's name for the module box header (sub slot). */
export class LooksSub extends Component {
	#active = new ActiveLayer();

	get label(): string | null {
		const layer = this.#active.layer;
		const look = layer && !isGroup(layer) ? getLook(layer) : null;
		return look ? lookLabel(String(look.params['preset'])) : null;
	}

	willDestroy() {
		super.willDestroy();
		this.#active.teardown();
	}

	<template>{{this.label}}</template>
}

interface LookCardSignature {
	Element: HTMLButtonElement;
	Args: {
		look: Shelf;
		image: string | undefined;
		active: boolean;
		onPick: () => void;
	};
}

const LookCard: TOC<LookCardSignature> = <template>
	<button
		type="button"
		class="sub-look-card {{if @active 'is-active'}}"
		title={{@look.label}}
		aria-label={{@look.label}}
		aria-pressed={{if @active "true" "false"}}
		{{on "click" @onPick}}
	>
		<span class="sub-look-thumb">
			{{#if @image}}
				<img src={{@image}} alt="" />
			{{else}}
				{{! shelf-swatch stand-in until the raster/LUT is ready }}
				<span
					aria-hidden="true"
					class="sub-look-swatch"
					style={{swatchStyle @look.swatch}}
				></span>
			{{/if}}
		</span>
		<span class="sub-look-name">{{@look.label}}</span>
	</button>
</template>;

interface GallerySignature {
	Args: { layer: RasterLayer };
}

class LooksGallery extends Component<GallerySignature> {
	// The gallery is the natural preload point for the LUT strips (~50 KB
	// each); the epoch subscription re-renders as each arrives so its thumb
	// fades in.
	#luts = new TrackedExternal(subscribeLuts, lutEpoch);

	constructor(
		...args: ConstructorParameters<
			typeof Component<GallerySignature>
		>
	) {
		super(...args);
		ensureAllLuts();
	}

	get shelf() {
		return SHELF;
	}

	get look() {
		// No doc subscription here: every look write goes through fx-ops, which
		// rebuilds the layer, so LooksBody hands down a new `@layer` and this
		// getter invalidates on the arg alone.
		return getLook(this.args.layer);
	}

	get activePreset(): string | null {
		const look = this.look;
		return look ? String(look.params['preset']) : null;
	}

	get noLook() {
		return this.look === null;
	}

	get intensity(): number {
		const value = this.look?.params['intensity'];
		return typeof value === 'number' ? value : 100;
	}

	/**
	 * Memoised on the blobHash and the LUT epoch, which are the only two
	 * things the thumbnails depend on — NOT `@cached`, which entangles every
	 * tracked read the getter makes and so would re-encode all sixteen PNGs on
	 * every doc emit, including each frame of an intensity drag.
	 */
	get thumbs(): Record<string, string> | null {
		return cachedThumbs(
			this.args.layer.blobHash,
			this.#luts.current,
		);
	}

	thumbFor = (id: string) => this.thumbs?.[id];

	isActive = (id: string) => this.activePreset === id;

	pick = (id: string) => {
		if (this.activePreset !== id)
			setLook(this.args.layer.id, this.args.layer, id);
	};

	clear = () => {
		if (this.activePreset !== null)
			clearLook(this.args.layer.id, this.args.layer);
	};

	#dragging = false;

	// One undo step per gesture (transient-colour's pattern): the first `input`
	// opens the transient, `change` settles it. A range input fires `change` at
	// drag end and once per keypress, so keyboard steps commit singly.
	setIntensity = (event: Event) => {
		if (!this.#dragging) {
			this.#dragging = true;
			beginTransient();
		}
		const value = Number((event.target as HTMLInputElement).value);
		setLookIntensity(this.args.layer.id, this.args.layer, value, {
			transient: true,
		});
	};

	settle = () => {
		if (!this.#dragging) return;
		commitTransient();
		this.#dragging = false;
	};

	willDestroy() {
		super.willDestroy();
		// A still-open gesture must not outlive the gallery (transient-colour's
		// rule): destroyed mid-drag, `change` never fires, the transient never
		// commits, and doc-store's undo/redo early-return on isGestureActive()
		// for the rest of the session.
		this.settle();
		this.#luts.unsubscribe();
	}

	<template>
		{{! The 16-card gallery outgrows a hover-bloom (natural height) — cap it
			to the viewport and scroll the grid inside; None + Intensity stay
			pinned. In the rail the 300px box wins, so the cap is inert there. }}
		<div class="sub-looks">
			{{! "None" is conventional chrome (the no-selection cell every
				picker has); a slim full-width row — it is the absence of a
				look, not a look — which leaves the grades in a clean 2-up. }}
			<button
				type="button"
				class="sub-look-none
					{{if this.noLook 'is-active'}}"
				aria-label="None"
				aria-pressed={{if this.noLook "true" "false"}}
				{{on "click" this.clear}}
			>
				<Icon @name="circle-slash" />
				None
			</button>
			<div class="sub-look-grid">
				{{#each this.shelf key="id" as |look|}}
					<LookCard
						@look={{look}}
						@image={{this.thumbFor look.id}}
						@active={{this.isActive
							look.id
						}}
						@onPick={{fn this.pick look.id}}
					/>
				{{/each}}
			</div>
			<div
				class="sub-look-intensity
					{{if this.noLook 'is-disabled'}}"
			>
				<span
					class="sub-look-intensity-label"
				>Intensity</span>
				<input
					type="range"
					class="sub-slider"
					min="0"
					max="100"
					step="1"
					value={{this.intensity}}
					disabled={{this.noLook}}
					aria-label="Intensity"
					{{on "input" this.setIntensity}}
					{{on "change" this.settle}}
				/>
				<span
					class="sub-look-intensity-value"
				>{{this.intensity}}%</span>
			</div>
		</div>
	</template>
}

function isRaster(layer: Layer | null): layer is RasterLayer {
	return layer !== null && layer.kind === 'raster';
}

export class LooksBody extends Component {
	#active = new ActiveLayer();

	get raster(): RasterLayer | null {
		// Looks grade PIXELS — raster layers only (a shape gets a look after
		// rasterize, M3-15).
		const layer = this.#active.layer;
		return isRaster(layer) ? layer : null;
	}

	willDestroy() {
		super.willDestroy();
		this.#active.teardown();
	}

	<template>
		{{#if this.raster}}
			<LooksGallery @layer={{this.raster}} />
		{{else}}
			{{! wording carried over from the Next app }}
			<div class="sub-look-empty">To pick a look, first pick
				an image layer</div>
		{{/if}}
	</template>
}
