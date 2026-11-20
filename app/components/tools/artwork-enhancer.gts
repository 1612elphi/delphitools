import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonImageCompare from 'delphicanon/components/canon-image-compare';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { stem } from 'delphicanon/lib/files';
import { IconSvg } from 'delphitools-v2/components/icon';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	busyMask,
	detail,
	detailRect,
	enhance,
	magnified,
	noiseCanvas,
} from 'delphitools-v2/components/tools/artwork-enhancer/noise';
import './artwork-enhancer/artwork-enhancer.css';

const RENDER_DEBOUNCE_MS = 120;
const scales = [1, 2, 3, 4];
const scaleNames = scales.map((scale) => `${scale}×`);
const modes = ['Classic', 'Intelligent'];
const percentText = (value: number) => `${Math.round(value)} %`;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Again = <template><IconSvg @name="refresh-cw" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface Pair {
	before: string;
	after: string;
}

const toBlob = (canvas: HTMLCanvasElement) =>
	new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);

const fitStyle = (width: number, height: number) =>
	htmlSafe(`--artwork-aspect: ${width} / ${height}`);

function launchFlags() {
	const query = new URLSearchParams(window.location.search);
	const clamp = (
		key: string,
		min: number,
		max: number,
		fallback: number,
	) => {
		const value = Math.round(Number(query.get(key) ?? fallback));
		return Number.isFinite(value)
			? Math.min(max, Math.max(min, value))
			: fallback;
	};
	return {
		sample: query.has('artSample'),
		opacity: clamp('artOpacity', 1, 20, 2),
		scale: clamp('artScale', 1, 4, 1),
		intelligent: query.has('artIntelligent'),
	};
}

export default class ArtworkEnhancer extends Component {
	@tracked fileName = '';
	@tracked imageWidth = 0;
	@tracked imageHeight = 0;
	@tracked opacity: number;
	@tracked noiseScale: number;
	@tracked intelligent: boolean;
	@tracked centre: { x: number; y: number } | null = null;
	@tracked picture?: Pair;
	@tracked grain?: Pair;
	@tracked result?: Blob;
	@tracked over = false;
	@tracked failed = false;

	#image: HTMLImageElement | null = null;
	#noise: HTMLCanvasElement | null = null;
	#busy: HTMLCanvasElement | null = null;
	#enhanced: HTMLCanvasElement | null = null;
	#timer?: ReturnType<typeof setTimeout>;
	#frame = 0;
	#input?: HTMLInputElement;
	#sourceUrl?: string;
	#run = 0;
	#grainRun = 0;
	#grab: {
		x: number;
		y: number;
		centre: { x: number; y: number };
		scale: number;
	} | null = null;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags();
		this.opacity = flags.opacity;
		this.noiseScale = flags.scale;
		this.intelligent = flags.intelligent;
		registerDestructor(this, () => {
			clearTimeout(this.#timer);
			cancelAnimationFrame(this.#frame);
			this.#release();
		});
		if (flags.sample)
			void drawnSample().then((file) => this.readFile(file));
	}

	get hasImage() {
		return this.imageWidth > 0;
	}

	get sizeText() {
		return `${this.imageWidth} × ${this.imageHeight}`;
	}

	get aspect() {
		return this.hasImage
			? Math.min(
					Math.max(
						this.imageWidth /
							this.imageHeight,
						0.6,
					),
					2,
				)
			: 4 / 3;
	}

	get pictureFit() {
		return this.hasImage
			? fitStyle(this.imageWidth, this.imageHeight)
			: fitStyle(4, 3);
	}

	get loupe() {
		const start = {
			x: this.imageWidth / 4,
			y: this.imageHeight / 2,
		};
		return detailRect(
			this.imageWidth,
			this.imageHeight,
			detail.side,
			this.centre ?? start,
		);
	}

	get grainSide() {
		return this.loupe.side;
	}

	get loupeStyle() {
		const { x, y, side } = this.loupe;
		const share = (value: number, of: number) =>
			`${(value / of) * 100}%`;
		return htmlSafe(
			[
				`inset-inline-start: ${share(x, this.imageWidth)}`,
				`inset-block-start: ${share(y, this.imageHeight)}`,
				`inline-size: ${share(side, this.imageWidth)}`,
				`block-size: ${share(side, this.imageHeight)}`,
			].join('; '),
		);
	}

	get loupeText() {
		const { x, y, side } = this.loupe;
		return `${x + side / 2}, ${y + side / 2}`;
	}

	get modeIndex() {
		return this.intelligent ? 1 : 0;
	}

	get grainFit() {
		return fitStyle(1, 1);
	}

	get grainCaption() {
		return `${this.grainSide}×${this.grainSide} px · ${detail.factor}×`;
	}

	get scaleIndex() {
		return this.noiseScale - 1;
	}

	get busy() {
		return this.hasImage && !this.picture?.after && !this.failed;
	}

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) this.readFile(file);
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
		this.readFile(file);
	};

	readFile = (file: File) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		const run = ++this.#run;
		image.onload = () => {
			if (run !== this.#run || this.isDestroying) {
				URL.revokeObjectURL(url);
				return;
			}
			this.clear();
			this.#run = run;
			this.#sourceUrl = url;
			this.#image = image;
			this.fileName = stem(file.name);
			this.imageWidth = image.width;
			this.imageHeight = image.height;
			this.picture = { before: url, after: '' };
			void this.render();
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			if (run === this.#run) this.failed = true;
		};
		image.src = url;
	};

	setOpacity = (value: number) => {
		if (value === this.opacity) return;
		this.opacity = value;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(
			() => void this.render(),
			RENDER_DEBOUNCE_MS,
		);
	};

	pickScale = (index: number) => {
		const scale = scales[index];
		if (!scale || scale === this.noiseScale) return;
		this.noiseScale = scale;
		this.#noise = null;
		void this.render();
	};

	pickMode = (index: number) => {
		const intelligent = index === 1;
		if (intelligent === this.intelligent) return;
		this.intelligent = intelligent;
		void this.render();
	};

	regenerate = () => {
		this.#noise = null;
		void this.render();
	};

	clear = () => {
		clearTimeout(this.#timer);
		this.#run++;
		this.#release();
		this.#image = null;
		this.#noise = null;
		this.#busy = null;
		this.#enhanced = null;
		this.centre = null;
		this.fileName = '';
		this.imageWidth = 0;
		this.imageHeight = 0;
		this.picture = undefined;
		this.grain = undefined;
		this.result = undefined;
		this.failed = false;
	};

	render = async () => {
		const image = this.#image;
		if (!image) return;
		const run = this.#run;
		this.#noise ??= noiseCanvas(
			image.width,
			image.height,
			this.noiseScale,
		);
		if (this.intelligent) this.#busy ??= busyMask(image);
		const canvas =
			this.#noise &&
			enhance(
				image,
				this.#noise,
				this.opacity,
				this.intelligent ? this.#busy : null,
			);
		this.#enhanced = canvas;
		const blob = canvas ? await toBlob(canvas) : null;
		if (run !== this.#run || this.isDestroying) return;
		if (this.picture?.after)
			URL.revokeObjectURL(this.picture.after);
		this.result = blob ?? undefined;
		this.failed = !blob;
		this.picture = {
			before: this.#sourceUrl ?? '',
			after: blob ? URL.createObjectURL(blob) : '',
		};
		await this.paintGrain();
	};

	paintGrain = async () => {
		const image = this.#image;
		if (!image) return;
		const run = this.#run;
		const grainRun = ++this.#grainRun;
		const at = this.loupe;
		const before = magnified(image, at);
		const after = this.#enhanced && magnified(this.#enhanced, at);
		const [beforeBlob, afterBlob] = await Promise.all([
			before ? toBlob(before) : null,
			after ? toBlob(after) : null,
		]);
		if (
			run !== this.#run ||
			grainRun !== this.#grainRun ||
			this.isDestroying
		)
			return;
		if (this.grain?.before) URL.revokeObjectURL(this.grain.before);
		if (this.grain?.after) URL.revokeObjectURL(this.grain.after);
		this.grain = {
			before: beforeBlob
				? URL.createObjectURL(beforeBlob)
				: '',
			after: afterBlob ? URL.createObjectURL(afterBlob) : '',
		};
	};

	moveLoupe(centre: { x: number; y: number }) {
		const { x, y, side } = detailRect(
			this.imageWidth,
			this.imageHeight,
			detail.side,
			centre,
		);
		this.centre = { x: x + side / 2, y: y + side / 2 };
		if (this.#frame) return;
		this.#frame = requestAnimationFrame(() => {
			this.#frame = 0;
			void this.paintGrain();
		});
	}

	grab = (event: PointerEvent) => {
		const loupe = event.currentTarget as HTMLElement;
		const box = loupe.parentElement!.getBoundingClientRect();
		if (box.width <= 0) return;
		event.preventDefault();
		loupe.setPointerCapture(event.pointerId);
		const { x, y, side } = this.loupe;
		this.#grab = {
			x: event.clientX,
			y: event.clientY,
			centre: { x: x + side / 2, y: y + side / 2 },
			scale: this.imageWidth / box.width,
		};
	};

	drag = (event: PointerEvent) => {
		const grab = this.#grab;
		if (!grab) return;
		this.moveLoupe({
			x:
				grab.centre.x +
				(event.clientX - grab.x) * grab.scale,
			y:
				grab.centre.y +
				(event.clientY - grab.y) * grab.scale,
		});
	};

	letGo = () => {
		this.#grab = null;
	};

	nudge = (event: KeyboardEvent) => {
		const { x, y, side } = this.loupe;
		const step = event.shiftKey ? side : Math.max(1, side / 4);
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step],
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		this.moveLoupe({
			x: x + side / 2 + move[0],
			y: y + side / 2 + move[1],
		});
	};

	download = () => {
		if (this.result)
			downloadBlob(
				this.result,
				`${this.fileName || 'artwork'}-enhanced.png`,
			);
	};

	#release() {
		for (const url of [
			this.#sourceUrl,
			this.picture?.after,
			this.grain?.before,
			this.grain?.after,
		])
			if (url) URL.revokeObjectURL(url);
		this.#sourceUrl = undefined;
	}

	<template>
		<CanonSplit
			class="artwork-enhancer"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.readFile accept="image/*"}}
			{{on "dragover" this.dragOver}}
			{{on "dragleave" this.dragLeave}}
			{{on "drop" this.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<div class="artwork-frame">
						<div class="artwork-area">
							{{#if this.picture}}
								<div
									class="artwork-box"
									style={{this.pictureFit}}
								>
									<CanonImageCompare
										class="artwork-compare"
										@before={{this.picture.before}}
										@after={{this.picture.after}}
										@failed={{this.failed}}
										@failure="Failed"
										@beforeTitle="Original"
										@afterTitle="Result"
									/>
									{{! template-lint-disable no-pointer-down-event-binding }}
									<div
										class="artwork-loupe"
										role="slider"
										tabindex="0"
										aria-label="Detail"
										aria-valuemin="0"
										aria-valuemax={{this.imageWidth}}
										aria-valuenow={{this.loupe.x}}
										aria-valuetext={{this.loupeText}}
										style={{this.loupeStyle}}
										{{on
											"pointerdown"
											this.grab
										}}
										{{on
											"pointermove"
											this.drag
										}}
										{{on
											"pointerup"
											this.letGo
										}}
										{{on
											"pointercancel"
											this.letGo
										}}
										{{on
											"keydown"
											this.nudge
										}}
									></div>
								</div>
							{{else}}
								<div
									class="artwork-box"
									style={{this.pictureFit}}
								>
									<Slot
										class="artwork-slot"
										@prompt="Drop your artwork here"
										@icon="sparkles"
										@dashed={{true}}
										@fills={{true}}
										@over={{this.over}}
										@onChoose={{this.choose}}
									/>
								</div>
							{{/if}}
						</div>
						{{#if this.busy}}
							<CanonLoader
								class="artwork-loader"
							/>
						{{/if}}
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.hasImage}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="artwork-source"
							@title={{this.fileName}}
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
					</CanonRows>
					<CanonCanvas
						class="artwork-grain"
						@aspect={{1.5}}
						@maxHeight={{360}}
						@boxing="unlessWide"
						@background="var(--canon-muted)"
					>
						<div
							class="artwork-frame artwork-frame--captioned"
						>
							<div
								class="artwork-area"
							>
								<div
									class="artwork-box"
									style={{this.grainFit}}
								>
									<CanonImageCompare
										class="artwork-compare"
										@before={{this.grain.before}}
										@after={{this.grain.after}}
										@beforeTitle="Original"
										@afterTitle="Result"
									/>
								</div>
							</div>
							<span
								class="artwork-caption"
							>{{this.grainCaption}}</span>
						</div>
					</CanonCanvas>
				{{else if this.failed}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							@text="Failed"
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Noise" />
					<CanonSegmented
						class="artwork-modes"
						@items={{modes}}
						@selected={{this.modeIndex}}
						@onChange={{this.pickMode}}
					/>
					<CanonRow
						class="artwork-opacity"
						@title="Opacity"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.opacity}}
							@min={{1}}
							@max={{20}}
							@step={{1}}
							@readout={{percentText}}
							@labelledBy={{titleId}}
							@onChange={{this.setOpacity}}
						/>
					</CanonRow>
					<CanonStatus
						@text="Classic trick uses 2% opacity"
						@tone="muted"
						@row={{true}}
					/>
					<CanonHeading @text="Scale" />
					<CanonSegmented
						class="artwork-scales"
						@items={{scaleNames}}
						@selected={{this.scaleIndex}}
						@onChange={{this.pickScale}}
					/>
					<CanonStatus
						@text="Higher = blockier noise"
						@tone="muted"
						@row={{true}}
					/>
					<CanonGrid>
						<CanonButton
							class="artwork-regenerate"
							@text="Regenerate"
							@icon={{Again}}
							@disabled={{if
								this.hasImage
								false
								true
							}}
							@onClick={{this.regenerate}}
						/>
						<CanonButton
							class="artwork-download"
							@kind="primary"
							@text={{passAlong
								"Download PNG"
							}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{if
								this.result
								false
								true
							}}
							@onClick={{this.download}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="About this technique"
					/>
					<CanonStatus
						@text="Adding colour noise at low opacity with overlay blend mode is a classic digital art trick. It adds subtle texture and colour variation that makes artwork feel more organic and cohesive, similar to the natural grain in traditional media."
						@tone="muted"
						@row={{true}}
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
