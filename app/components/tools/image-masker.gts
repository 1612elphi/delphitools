import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { registerDestructor } from '@ember/destroyable';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonFileCell from 'delphicanon/components/canon-file-cell';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { stem } from 'delphicanon/lib/files';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	DEFAULT_MASK,
	MASK_SHAPES,
	type MaskShape,
} from 'delphitools-v2/lib/mask-shapes';
import { pinSvgSize } from 'delphitools-v2/lib/svg-size';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	clampZoom,
	clipRect,
	fileName,
	paint,
	scales,
	side,
	trimmed,
	zoomRange,
} from 'delphitools-v2/components/tools/image-masker/mask';
import Picker from 'delphitools-v2/components/tools/image-masker/picker';
import Picture from 'delphitools-v2/components/tools/image-masker/picture';
import './image-masker/image-masker.css';

const accept = 'image/*,.svg';
const svgAccept = '.svg,image/svg+xml';
const thumbSide = 144;

const scaleNames = scales.map((scale) => `${scale}×`);
const zoomMin = Math.log2(zoomRange.min);
const zoomMax = Math.log2(zoomRange.max);
const zoomText = (value: number) => `${Math.round(2 ** value * 100)} %`;
const pixelsText = ({ width, height }: { width: number; height: number }) =>
	`${width} × ${height}`;
const couldNotRead = (name: string) => `Could not read ${name}`;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Upload = <template><IconSvg @name="upload" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Reset = <template><IconSvg @name="rotate-ccw" /></template>;

interface Loaded {
	image: HTMLImageElement;
	url: string;
	name: string;
	stem: string;
}

function decode(blob: Blob): Promise<{ image: HTMLImageElement; url: string }> {
	const url = URL.createObjectURL(blob);
	const image = new Image();
	return new Promise((resolve, reject) => {
		image.onload = () => resolve({ image, url });
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('decode failed'));
		};
		image.src = url;
	});
}

async function decodeSvg(file: File) {
	const text = pinSvgSize(await file.text());
	if (text === null) throw new Error('svg parse failed');
	return decode(new Blob([text], { type: 'image/svg+xml' }));
}

const notch = () =>
	new File(
		[
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H5V5H0Z"/></svg>',
		],
		'notch.svg',
		{ type: 'image/svg+xml' },
	);

export default class ImageMasker extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked shape: MaskShape = DEFAULT_MASK;
	@tracked custom?: Loaded;
	@tracked source?: Loaded;
	@tracked zoom = 1;
	@tracked x = 0;
	@tracked y = 0;
	@tracked scale = 1;
	@tracked failedName?: string;
	@tracked svgFailedName?: string;
	@tracked exporting = false;

	drop = new Drop(accept, (file) => this.load(file));
	#input?: HTMLInputElement;
	#loading = 0;
	#maskLoading = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const found = MASK_SHAPES.find(
			(shape) => shape.id === query.get('maskShape'),
		);
		if (found) this.shape = found;
		const scale = scales[Number(query.get('maskScale') ?? NaN)];
		if (scale) this.scale = scale;
		const zoom = Number(query.get('maskZoom'));
		const offset = (query.get('maskOffset') ?? '')
			.split(',')
			.map(Number);
		const framed = () => {
			if (zoom > 0) this.zoom = clampZoom(zoom);
			if (
				offset.length === 2 &&
				offset.every(Number.isFinite)
			)
				[this.x, this.y] = offset as [number, number];
		};
		if (query.has('maskSample'))
			void drawnSample()
				.then((file) => this.loadSource(file))
				.then(framed);
		if (query.has('maskSVG')) void this.loadMask(notch());
		registerDestructor(this, () => {
			if (this.source) URL.revokeObjectURL(this.source.url);
			if (this.custom) URL.revokeObjectURL(this.custom.url);
		});
	}

	get view() {
		return { zoom: this.zoom, x: this.x, y: this.y };
	}

	get cut() {
		return this.custom?.image ?? this.shape;
	}

	get outline() {
		return this.custom ? undefined : this.shape.d;
	}

	get shapeName() {
		return this.custom?.stem ?? this.shape.label;
	}

	get side() {
		return side(this.source?.image, this.zoom, this.scale);
	}

	@cached
	get clip() {
		return clipRect(this.cut, this.side);
	}

	get sourceText() {
		return this.source ? pixelsText(this.source.image) : '';
	}

	get zoomValue() {
		return Math.log2(this.zoom);
	}

	get scaleIndex() {
		return scales.indexOf(this.scale);
	}

	get framed() {
		return this.zoom !== 1 || this.x !== 0 || this.y !== 0;
	}

	get resetDisabled() {
		return !this.source || !this.framed;
	}

	get tiles() {
		return [
			{
				label: 'Size',
				value: `${pixelsText(this.clip)} px`,
			},
			{ label: 'Shape', value: this.shapeName },
		];
	}

	get customStyle() {
		const { custom } = this;
		if (!custom) return undefined;
		const url = `url("${custom.url}")`;
		return htmlSafe(
			`mask-image: ${url}; -webkit-mask-image: ${url}${this.thumb ? `; background-image: url("${this.thumb}")` : ''}`,
		);
	}

	@cached
	get thumb() {
		const image = this.source?.image;
		if (!image) return undefined;
		const canvas = document.createElement('canvas');
		canvas.width = thumbSide;
		canvas.height = thumbSide;
		const context = canvas.getContext('2d');
		if (!context) return undefined;
		paint(context, thumbSide, 'square', image, this.view);
		return canvas.toDataURL();
	}

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) this.load(file);
	};

	load = (file: File) => {
		if (matchesAccept(file, svgAccept)) void this.loadMask(file);
		else void this.loadSource(file);
	};

	loadSource = async (file: File) => {
		const run = ++this.#loading;
		try {
			const { image, url } = await decode(file);
			if (run !== this.#loading || this.isDestroying) {
				URL.revokeObjectURL(url);
				return;
			}
			if (this.source) URL.revokeObjectURL(this.source.url);
			this.source = {
				image,
				url,
				name: file.name || 'Image',
				stem: stem(file.name),
			};
			this.failedName = undefined;
			this.resetView();
		} catch {
			if (run === this.#loading)
				this.failedName = file.name || 'Image';
		}
	};

	loadMask = async (file: File) => {
		const run = ++this.#maskLoading;
		try {
			const { image, url } = await decodeSvg(file);
			if (run !== this.#maskLoading || this.isDestroying) {
				URL.revokeObjectURL(url);
				return;
			}
			if (this.custom) URL.revokeObjectURL(this.custom.url);
			this.custom = {
				image,
				url,
				name: file.name,
				stem: stem(file.name) || 'SVG',
			};
			this.svgFailedName = undefined;
		} catch {
			if (run === this.#maskLoading)
				this.svgFailedName = file.name || 'SVG';
		}
	};

	clearSource = () => {
		this.#loading++;
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.source = undefined;
		this.failedName = undefined;
		this.resetView();
	};

	clearCustom = () => {
		this.#maskLoading++;
		if (this.custom) URL.revokeObjectURL(this.custom.url);
		this.custom = undefined;
	};

	pick = (shape: MaskShape) => {
		this.shape = shape;
		this.clearCustom();
	};

	resetView = () => {
		this.zoom = 1;
		this.x = 0;
		this.y = 0;
	};

	move = (x: number, y: number) => {
		this.x += x;
		this.y += y;
	};

	zoomBy = (factor: number) =>
		(this.zoom = clampZoom(this.zoom * factor));

	setZoom = (value: number) => (this.zoom = clampZoom(2 ** value));

	pickScale = (index: number) => (this.scale = scales[index]!);

	#png() {
		const { clip } = this;
		const canvas = document.createElement('canvas');
		canvas.width = clip.width;
		canvas.height = clip.height;
		const context = canvas.getContext('2d');
		if (!context) return Promise.resolve(null);
		context.translate(-clip.x, -clip.y);
		paint(
			context,
			this.side,
			this.cut,
			this.source?.image,
			this.view,
		);
		const out = trimmed(canvas);
		return new Promise<Blob | null>((resolve) =>
			out.toBlob(resolve, 'image/png'),
		);
	}

	copy = async () => {
		const blob = await this.#png();
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

	export = async () => {
		if (this.exporting) return;
		const name = fileName(
			this.source?.stem,
			this.custom?.stem ?? this.shape.id,
		);
		this.exporting = true;
		try {
			const blob = await this.#png();
			if (blob) downloadBlob(blob, name);
		} finally {
			this.exporting = false;
		}
	};

	<template>
		<CanonSplit
			class="image-masker"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.load accept=accept}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@image={{this.source.image}}
						@url={{this.source.url}}
						@cut={{this.cut}}
						@outline={{this.outline}}
						@view={{this.view}}
						@side={{this.side}}
						@label={{this.shapeName}}
						@busy={{this.exporting}}
						@over={{this.drop.over}}
						@onChoose={{this.choose}}
						@onMove={{this.move}}
						@onZoom={{this.zoomBy}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="masker-source"
							@title={{this.source.name}}
							@detail={{this.sourceText}}
							@form="flush"
						>
							<CanonButton
								class="masker-open"
								@kind="cell"
								@icon={{Upload}}
								@label="Open file"
								@onClick={{this.choose}}
							/>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clearSource}}
							/>
						</CanonRow>
					</CanonRows>
				{{else if this.failedName}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							class="masker-error"
							@text={{couldNotRead
								this.failedName
							}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Frame" />
					<CanonRow
						class="masker-zoom"
						@title="Zoom"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.zoomValue}}
							@min={{zoomMin}}
							@max={{zoomMax}}
							@step={{0.01}}
							@readout={{zoomText}}
							@labelledBy={{titleId}}
							@onChange={{this.setZoom}}
						/>
					</CanonRow>
					<CanonGrid>
						<CanonButton
							class="masker-reset"
							@kind="cell"
							@text="Reset"
							@icon={{Reset}}
							@disabled={{this.resetDisabled}}
							@onClick={{this.resetView}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Shape" />
					{{#if this.custom}}
						<div class="masker-custom">
							<span
								class="masker-cell masker-cell--chosen masker-custom-cell"
								role="img"
								aria-label={{this.custom.stem}}
							><span
									class="masker-custom-cut"
									style={{this.customStyle}}
								></span></span>
							<CanonRow
								class="masker-custom-file"
								@title={{this.custom.stem}}
								@detail="SVG"
								@form="flush"
							>
								<CanonButton
									@kind="cell"
									@text="Clear"
									@icon={{Trash}}
									@onClick={{this.clearCustom}}
								/>
							</CanonRow>
						</div>
					{{else}}
						<CanonRow
							class="masker-svg"
							@title="SVG"
							@form="flush"
							as |titleId|
						>
							<CanonFileCell
								@accept={{svgAccept}}
								@labelledBy={{titleId}}
								@onChange={{this.loadMask}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.svgFailedName}}
						<CanonStatus
							class="masker-svg-error"
							@text={{couldNotRead
								this.svgFailedName
							}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<Picker
						@shape={{this.shape}}
						@custom={{if
							this.custom
							true
							false
						}}
						@thumb={{this.thumb}}
						@onPick={{this.pick}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Output" />
					<CanonSegmented
						class="masker-scales"
						@items={{scaleNames}}
						@selected={{this.scaleIndex}}
						@onChange={{this.pickScale}}
					/>
					<CanonTiles @items={{this.tiles}} />
					<CanonGrid>
						<CanonButton
							class="masker-copy"
							@text="Copy"
							@icon={{Copy}}
							@disabled={{this.exporting}}
							@onClick={{this.copy}}
						/>
						<CanonButton
							class="masker-download"
							@kind="primary"
							@text={{passAlong
								"Download PNG"
							}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{this.exporting}}
							@onClick={{this.export}}
						/>
					</CanonGrid>
					{{#if this.exporting}}
						<CanonRow
							class="masker-busy"
							@title="Processing…"
						>
							<CanonLoader />
						</CanonRow>
					{{/if}}
				</CanonRows>
				{{! template-lint-disable require-input-label }}
				<input
					type="file"
					accept={{accept}}
					hidden
					{{this.keepInput}}
					{{on "change" this.picked}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
