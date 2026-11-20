import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonButton from 'delphicanon/components/canon-button';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	alphaMask,
	loadRemover,
	maskToCanvas,
	loadImage,
	type Remover,
} from 'delphitools-v2/lib/bg-removal';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import Picture from 'delphitools-v2/components/tools/background-remover/picture';
import './background-remover/background-remover.css';

type Status = 'idle' | 'downloading' | 'processing' | 'done' | 'error';

const modes = ['Transparent', 'Colour'];
const brushModes = ['Add', 'Remove'];
const pxText = (value: number) => `${value} px`;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Eraser = <template><IconSvg @name="eraser" /></template>;
const Undo = <template><IconSvg @name="undo-2" /></template>;
const Reset = <template><IconSvg @name="rotate-ccw" /></template>;

const blank = (width: number, height: number) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

function drawnMask(width: number, height: number) {
	const canvas = blank(width, height);
	const context = canvas.getContext('2d')!;
	context.fillStyle = '#000';
	context.fillRect(0, 0, width, height);
	context.fillStyle = '#fff';
	context.beginPath();
	context.ellipse(
		width / 2,
		height / 2,
		width * 0.3,
		height * 0.3,
		0,
		0,
		Math.PI * 2,
	);
	context.fill();
	return canvas;
}

function readDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () =>
			reject(new Error('image failed to load'));
		reader.readAsDataURL(file);
	});
}

function keptShare(mask: HTMLCanvasElement) {
	const scale = Math.min(1, 256 / Math.max(mask.width, mask.height));
	const canvas = blank(
		Math.max(1, Math.round(mask.width * scale)),
		Math.max(1, Math.round(mask.height * scale)),
	);
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(mask, 0, 0, canvas.width, canvas.height);
	const { data } = context.getImageData(
		0,
		0,
		canvas.width,
		canvas.height,
	);
	let sum = 0;
	for (let i = 3; i < data.length; i += 4) sum += data[i]!;
	return sum / 255 / (data.length / 4);
}

function cutOut(
	source: HTMLImageElement,
	mask: HTMLCanvasElement,
	fill?: string,
	into?: HTMLCanvasElement,
) {
	const canvas = into ?? blank(source.naturalWidth, source.naturalHeight);
	const context = canvas.getContext('2d')!;
	context.globalCompositeOperation = 'copy';
	context.drawImage(source, 0, 0);
	context.globalCompositeOperation = 'destination-in';
	context.drawImage(mask, 0, 0);
	if (fill) {
		context.globalCompositeOperation = 'destination-over';
		context.fillStyle = fill;
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.globalCompositeOperation = 'source-over';
	return canvas;
}

const pngOf = (canvas: HTMLCanvasElement) =>
	new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);

export default class BackgroundRemover extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked sourceImage: string | null = null;
	@tracked sourceName = '';
	@tracked width = 0;
	@tracked height = 0;
	@tracked done = false;
	@tracked kept?: number;
	@tracked status: Status = 'idle';
	@tracked percent = 0;
	@tracked errorDetail = '';
	@tracked mode = 0;
	@tracked colour: Rgb = [1, 1, 1];
	@tracked over = false;
	@tracked brushMode = 0;
	@tracked brush = 40;
	@tracked refined = false;
	@tracked canUndo = false;
	@tracked ring: { x: number; y: number } | null = null;

	#remover: Remover | null = null;
	#destroyed = false;
	#input?: HTMLInputElement;
	#loading = 0;
	#fakeMask = false;
	#image: HTMLImageElement | null = null;
	#mask: HTMLCanvasElement | null = null;
	#refined: HTMLCanvasElement | null = null;
	#undo: HTMLCanvasElement | null = null;
	#view: HTMLCanvasElement | null = null;
	#stroke: { x: number; y: number; scale: number } | null = null;
	#frame = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const fill = parseHex(query.get('bgFill') ?? '');
		if (fill) {
			this.mode = 1;
			this.colour = fill;
		}
		this.#fakeMask = import.meta.env.DEV && query.has('bgMask');
		if (query.has('bgSample'))
			void drawnSample().then((file) => this.readFile(file));
	}

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		cancelAnimationFrame(this.#frame);
		this.#remover?.dispose();
		this.#remover = null;
	}

	get isBusy() {
		return (
			this.status === 'downloading' ||
			this.status === 'processing'
		);
	}

	get canRun() {
		return !this.done;
	}

	get isDownloading() {
		return this.status === 'downloading';
	}

	get runText() {
		if (this.status === 'downloading')
			return `Downloading... ${this.percent}%`;
		if (this.status === 'processing')
			return 'Removing background...';
		return 'Remove Background';
	}

	get share() {
		return this.percent / 100;
	}

	get fill() {
		return this.mode === 1 ? hex(this.colour) : undefined;
	}

	get sizeText() {
		return `${this.width} × ${this.height}`;
	}

	get tiles() {
		return [
			{
				label: 'Kept',
				value:
					this.kept === undefined
						? '—'
						: `${Math.round(this.kept * 100)} %`,
				level: this.kept ?? 0,
			},
			{ label: 'Size', value: `${this.sizeText} px` },
		];
	}

	get hasError() {
		return this.status === 'error';
	}

	get ringStyle() {
		const { ring } = this;
		if (!ring) return undefined;
		return htmlSafe(
			`inset-inline-start: ${ring.x}px; inset-block-start: ${ring.y}px; --cutout-brush: ${this.brush}px`,
		);
	}

	cutCanvas = modifier((canvas: HTMLCanvasElement) => {
		this.#view = canvas;
		this.#draw();
		const down = (event: PointerEvent) => this.strokeStart(event);
		const move = (event: PointerEvent) => this.strokeMove(event);
		const up = () => this.strokeEnd();
		const leave = () => {
			if (!this.#stroke) this.ring = null;
		};
		canvas.addEventListener('pointerdown', down);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('pointercancel', up);
		canvas.addEventListener('pointerleave', leave);
		return () => {
			canvas.removeEventListener('pointerdown', down);
			canvas.removeEventListener('pointermove', move);
			canvas.removeEventListener('pointerup', up);
			canvas.removeEventListener('pointercancel', up);
			canvas.removeEventListener('pointerleave', leave);
			if (this.#view === canvas) this.#view = null;
		};
	});

	#draw() {
		const view = this.#view;
		const image = this.#image;
		const mask = this.#refined;
		if (!view || !image || !mask) return;
		if (view.width !== image.naturalWidth)
			view.width = image.naturalWidth;
		if (view.height !== image.naturalHeight)
			view.height = image.naturalHeight;
		cutOut(image, mask, undefined, view);
	}

	#redraw() {
		if (this.#frame) return;
		this.#frame = requestAnimationFrame(() => {
			this.#frame = 0;
			this.#draw();
		});
	}

	#point(event: PointerEvent) {
		const view = event.currentTarget as HTMLCanvasElement;
		const box = view.getBoundingClientRect();
		const scale = box.width > 0 ? view.width / box.width : 1;
		this.ring = {
			x: event.clientX - box.left,
			y: event.clientY - box.top,
		};
		return {
			x: (event.clientX - box.left) * scale,
			y: (event.clientY - box.top) * scale,
			scale,
		};
	}

	#paint(
		from: { x: number; y: number },
		to: { x: number; y: number },
		scale: number,
	) {
		const context = this.#refined?.getContext('2d');
		if (!context) return;
		context.globalCompositeOperation =
			this.brushMode === 0
				? 'source-over'
				: 'destination-out';
		context.strokeStyle = '#fff';
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.lineWidth = this.brush * scale;
		context.beginPath();
		context.moveTo(from.x, from.y);
		context.lineTo(to.x, to.y);
		context.stroke();
		context.globalCompositeOperation = 'source-over';
	}

	strokeStart = (event: PointerEvent) => {
		const refined = this.#refined;
		if (!refined || event.button > 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(
			event.pointerId,
		);
		this.#undo ??= blank(refined.width, refined.height);
		const undo = this.#undo.getContext('2d')!;
		undo.globalCompositeOperation = 'copy';
		undo.drawImage(refined, 0, 0);
		const point = this.#point(event);
		this.#stroke = point;
		this.#paint(point, point, point.scale);
		this.#redraw();
	};

	strokeMove = (event: PointerEvent) => {
		const point = this.#point(event);
		const stroke = this.#stroke;
		if (!stroke) return;
		this.#paint(stroke, point, point.scale);
		this.#stroke = point;
		this.#redraw();
	};

	strokeEnd = () => {
		if (!this.#stroke) return;
		this.#stroke = null;
		this.refined = true;
		this.canUndo = true;
		this.#measure();
	};

	#measure() {
		if (this.#refined) this.kept = keptShare(this.#refined);
	}

	undo = () => {
		const refined = this.#refined?.getContext('2d');
		if (!refined || !this.#undo || !this.canUndo) return;
		refined.globalCompositeOperation = 'copy';
		refined.drawImage(this.#undo, 0, 0);
		refined.globalCompositeOperation = 'source-over';
		this.canUndo = false;
		this.#draw();
		this.#measure();
	};

	resetRefine = () => {
		const refined = this.#refined?.getContext('2d');
		if (!refined || !this.#mask) return;
		refined.globalCompositeOperation = 'copy';
		refined.drawImage(this.#mask, 0, 0);
		refined.globalCompositeOperation = 'source-over';
		this.refined = false;
		this.canUndo = false;
		this.#draw();
		this.#measure();
	};

	pickBrushMode = (index: number) => (this.brushMode = index);

	setBrush = (value: number) => (this.brush = value);

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void this.readFile(file);
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
		if (!this.isBusy) void this.readFile(file);
	};

	readFile = async (file: File) => {
		if (!file.type.startsWith('image/') || this.isBusy) return;
		const run = ++this.#loading;
		try {
			const url = await readDataUrl(file);
			const image = await loadImage(url);
			if (run !== this.#loading || this.#destroyed) return;
			this.sourceImage = url;
			this.sourceName = file.name || 'image';
			this.width = image.naturalWidth;
			this.height = image.naturalHeight;
			this.#image = image;
			this.#dropCut();
			this.status = 'idle';
			this.errorDetail = '';
		} catch (error) {
			if (run !== this.#loading) return;
			this.report(
				error instanceof Error
					? error.message
					: String(error),
			);
		}
	};

	clear = () => {
		this.#loading++;
		this.sourceImage = null;
		this.#image = null;
		this.#dropCut();
		this.status = 'idle';
		this.errorDetail = '';
	};

	#dropCut() {
		this.done = false;
		this.kept = undefined;
		this.#mask = null;
		this.#refined = null;
		this.#undo = null;
		this.#stroke = null;
		this.refined = false;
		this.canUndo = false;
		this.ring = null;
	}

	report = (detail: string) => {
		this.status = 'error';
		this.errorDetail = detail;
	};

	remove = async () => {
		const source = this.sourceImage;
		if (!source || this.isBusy) return;

		if (this.#fakeMask) {
			this.#cut(drawnMask(this.width, this.height), source);
			return;
		}

		try {
			if (!this.#remover) {
				this.status = 'downloading';
				this.percent = 0;
				const remover = await loadRemover(
					({ percent }) => {
						if (!this.#destroyed)
							this.percent = percent;
					},
				);
				if (this.#destroyed) {
					remover.dispose();
					return;
				}
				this.#remover = remover;
			}

			this.status = 'processing';
			const segments = await this.#remover.segment(source);
			if (this.#destroyed) return;

			const mask = segments[0]?.mask;
			if (!mask)
				throw new Error('the model returned no mask');

			this.#cut(maskToCanvas(mask), source);
		} catch (error) {
			if (this.#destroyed) return;
			this.report(
				error instanceof Error
					? error.message
					: String(error),
			);
		}
	};

	#cut(grey: HTMLCanvasElement, source: string) {
		const image = this.#image;
		if (this.#destroyed || source !== this.sourceImage || !image)
			return;
		const { naturalWidth: width, naturalHeight: height } = image;
		this.#mask = alphaMask(grey, width, height);
		this.#refined = blank(width, height);
		this.#refined.getContext('2d')!.drawImage(this.#mask, 0, 0);
		this.done = true;
		this.status = 'done';
		this.#measure();
	}

	#export() {
		return this.#image && this.#refined
			? pngOf(cutOut(this.#image, this.#refined, this.fill))
			: Promise.resolve(null);
	}

	pickMode = (index: number) => (this.mode = index);

	pickColour = (colour: Rgb) => (this.colour = colour);

	copy = async () => {
		const blob = await this.#export();
		if (!blob) return;
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
		} catch {
			return;
		}
		this.toast.show();
	};

	download = async () => {
		const blob = await this.#export();
		if (blob) downloadBlob(blob, 'background-removed.png');
	};

	<template>
		<CanonSplit
			class="background-remover"
			@halves={{true}}
			@collapsesTo={{200}}
			{{filePaste this.readFile accept="image/*"}}
			{{on "dragover" this.dragOver}}
			{{on "dragleave" this.dragLeave}}
			{{on "drop" this.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@source={{this.sourceImage}}
						@width={{this.width}}
						@height={{this.height}}
						@done={{this.done}}
						@cut={{this.cutCanvas}}
						@ring={{this.ringStyle}}
						@fill={{this.fill}}
						@busy={{this.isBusy}}
						@over={{this.over}}
						@onChoose={{this.choose}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.sourceImage}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="bg-source"
							@title={{this.sourceName}}
							@detail={{this.sizeText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{this.isBusy}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
						{{#if this.isBusy}}
							<CanonRow
								class="bg-busy"
								@title={{this.runText}}
							>
								<CanonLoader
									@cell={{5}}
									@gap={{1}}
								/>
							</CanonRow>
							{{#if
								this.isDownloading
							}}
								<CanonBar
									class="bg-progress"
									@share={{this.share}}
								/>
							{{/if}}
						{{else if this.canRun}}
							<CanonButton
								class="bg-run"
								@kind="primary"
								@text={{this.runText}}
								@icon={{Eraser}}
								@onClick={{this.remove}}
							/>
						{{/if}}
					</CanonRows>
				{{/if}}
				{{#if this.hasError}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							class="bg-error"
							@text={{this.errorDetail}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				{{#if this.done}}
					<CanonRows
						class="bg-refine"
						@framed={{true}}
					>
						<CanonHeading @text="Refine" />
						<CanonSegmented
							class="bg-brush-modes"
							@items={{brushModes}}
							@selected={{this.brushMode}}
							@onChange={{this.pickBrushMode}}
						/>
						<CanonRow
							class="bg-brush"
							@title="Brush"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.brush}}
								@min={{4}}
								@max={{120}}
								@step={{2}}
								@readout={{pxText}}
								@labelledBy={{titleId}}
								@onChange={{this.setBrush}}
							/>
						</CanonRow>
						<CanonGrid>
							<CanonButton
								class="bg-undo"
								@text="Undo"
								@icon={{Undo}}
								@disabled={{if
									this.canUndo
									false
									true
								}}
								@onClick={{this.undo}}
							/>
							<CanonButton
								class="bg-reset"
								@text="Reset"
								@icon={{Reset}}
								@disabled={{if
									this.refined
									false
									true
								}}
								@onClick={{this.resetRefine}}
							/>
						</CanonGrid>
					</CanonRows>
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Subject" />
						<CanonTiles
							@items={{this.tiles}}
						/>
						<CanonHeading
							@text="Background"
						/>
						<CanonSegmented
							class="bg-modes"
							@items={{modes}}
							@selected={{this.mode}}
							@onChange={{this.pickMode}}
						/>
						{{#if this.fill}}
							<CanonColourWell
								@label="Background Colour"
								@colour={{this.colour}}
								@onChange={{this.pickColour}}
							/>
						{{/if}}
						<CanonGrid>
							<CanonButton
								class="bg-copy"
								@text="Copy Image"
								@icon={{Copy}}
								@onClick={{this.copy}}
							/>
							<CanonButton
								class="bg-download"
								@kind="primary"
								@text={{passAlong
									"Download PNG"
								}}
								@icon={{Save}}
								@iconStyle="oversized"
								@onClick={{this.download}}
							/>
						</CanonGrid>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonStatus
						@text="Processing happens entirely in your browser. On first use, a ~110MB processing engine is downloaded and cached."
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
