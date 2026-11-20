import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { stem } from 'delphicanon/lib/files';
import { springEasing } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	crop,
	emptyPixels,
	fileName,
	instagram,
	leastFraction,
	middle,
	platforms,
	sameRatio,
	type CropPlatform,
	type CropRatio,
	type Point,
	type Size,
} from 'delphitools-v2/components/tools/social-cropper/crop';
import Picture, {
	maxZoom,
} from 'delphitools-v2/components/tools/social-cropper/picture';
import './social-cropper/social-cropper.css';

const loadFailed = 'Image could not be read. Try another file?';

const spring = htmlSafe(`--social-spring: ${springEasing(0.725)}`);
const springMs = 500;

const platformNames = platforms.map(({ name }) => name);
const percentText = (value: number) => `${value} %`;
const leastPercent = leastFraction * 100;
const mostZoomPercent = maxZoom * 100;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface Source {
	url: string;
	image: HTMLImageElement;
	pixels: Size;
	stem: string;
}

export default class SocialCropper extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked platform: CropPlatform;
	@tracked ratio: CropRatio;
	@tracked centre: Point = middleOf(emptyPixels);
	@tracked fraction = 1;
	@tracked zoom = 1;
	@tracked source?: Source;
	@tracked failed = false;
	@tracked exporting = false;
	@tracked springs = false;

	drop = new Drop('image/*', (file) => void this.load(file));
	#input?: HTMLInputElement;
	#loading = 0;
	#springTimer?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const platform =
			platforms.find(
				({ id }) => id === query.get('cropPlatform'),
			) ?? instagram;
		const { ratios } = platform;
		const index = Number(query.get('cropRatio')) || 0;
		this.platform = platform;
		this.ratio =
			ratios[
				Math.min(Math.max(index, 0), ratios.length - 1)
			]!;
		const move = Number(query.get('cropMove'));
		if (query.has('cropSample'))
			void drawnSample()
				.then((file) => this.load(file))
				.then(() => {
					if (move)
						this.move({ x: move, y: move });
				});
		registerDestructor(this, () => {
			window.clearTimeout(this.#springTimer);
			if (this.source) URL.revokeObjectURL(this.source.url);
		});
	}

	get pixels() {
		return this.source?.pixels ?? emptyPixels;
	}

	get aspect() {
		return this.ratio.width / this.ratio.height;
	}

	get crop() {
		return crop(
			this.aspect,
			this.pixels,
			this.centre,
			this.fraction,
		);
	}

	get sizePercent() {
		return Math.round(this.fraction * 100);
	}

	get zoomPercent() {
		return Math.round(this.zoom * 100);
	}

	get others() {
		const centre = middle(this.crop);
		return this.platform.ratios
			.filter((ratio) => ratio !== this.ratio)
			.map((ratio) => ({
				label: ratio.label,
				rect: crop(
					ratio.width / ratio.height,
					this.pixels,
					centre,
					this.fraction,
				),
			}));
	}

	get pictureAspect() {
		const { width, height } = this.pixels;
		return Math.max(0.5, width / height);
	}

	get platformIndex() {
		return platforms.indexOf(this.platform);
	}

	get ratioNames() {
		return this.platform.ratios.map(
			({ name, label }) => `${name} ${label}`,
		);
	}

	get ratioIndex() {
		return this.platform.ratios.indexOf(this.ratio);
	}

	get sourceText() {
		const pixels = this.source?.pixels;
		return pixels ? `${pixels.width} × ${pixels.height}` : '';
	}

	get tiles() {
		const loaded = !!this.source;
		const dash = '—';
		const { x, y, width, height } = this.crop;
		return [
			{
				label: 'Crop size',
				value: loaded
					? `${width} × ${height} px`
					: dash,
			},
			{
				label: 'Offset',
				value: loaded ? `${x}, ${y}` : dash,
			},
			{
				label: 'Original',
				value: loaded ? `${this.sourceText} px` : dash,
			},
		];
	}

	get exportDisabled() {
		return !this.source || this.exporting;
	}

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

	load = async (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const run = ++this.#loading;
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.src = url;
		try {
			await image.decode();
		} catch {
			URL.revokeObjectURL(url);
			if (run !== this.#loading) return;
			this.clear();
			this.failed = true;
			return;
		}
		if (run !== this.#loading || isDestroying(this)) {
			URL.revokeObjectURL(url);
			return;
		}
		if (this.source) URL.revokeObjectURL(this.source.url);
		const pixels = {
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
		this.source = {
			url,
			image,
			pixels,
			stem: stem(file.name) || 'image',
		};
		this.centre = middleOf(pixels);
		this.fraction = 1;
		this.zoom = 1;
		this.failed = false;
	};

	clear = () => {
		this.#loading++;
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.source = undefined;
		this.centre = middleOf(emptyPixels);
		this.fraction = 1;
		this.zoom = 1;
		this.failed = false;
	};

	#spring() {
		this.springs = true;
		window.clearTimeout(this.#springTimer);
		this.#springTimer = window.setTimeout(
			() => (this.springs = false),
			springMs,
		);
	}

	#settle() {
		this.centre = middle(this.crop);
	}

	pickPlatform = (index: number) => {
		this.platform = platforms[index]!;
		this.ratio = sameRatio(this.platform, this.ratio);
		this.#settle();
		this.#spring();
	};

	pickRatio = (index: number) => {
		this.ratio = this.platform.ratios[index]!;
		this.#settle();
		this.#spring();
	};

	move = ({ x, y }: Point) => {
		this.centre = { x: this.centre.x + x, y: this.centre.y + y };
		this.#settle();
	};

	resize = (fraction: number, centre: Point) => {
		this.fraction = fraction;
		this.centre = centre;
		this.#settle();
	};

	setSize = (percent: number) => {
		this.fraction = percent / 100;
		this.#settle();
	};

	setZoom = (zoom: number) => (this.zoom = zoom);

	setZoomPercent = (percent: number) => (this.zoom = percent / 100);

	#png(): Promise<Blob | null> {
		const { source } = this;
		if (!source) return Promise.resolve(null);
		const { x, y, width, height } = this.crop;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return Promise.resolve(null);
		context.drawImage(
			source.image,
			x,
			y,
			width,
			height,
			0,
			0,
			width,
			height,
		);
		return new Promise((resolve) =>
			canvas.toBlob(resolve, 'image/png'),
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
		const { source } = this;
		if (this.exportDisabled || !source) return;
		const name = fileName(source.stem, this.platform, this.ratio);
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
			class="social-cropper"
			@halves={{true}}
			@collapsesTo={{240}}
			style={{spring}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.pictureAspect}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@url={{this.source.url}}
						@pixels={{this.pixels}}
						@crop={{this.crop}}
						@aspect={{this.aspect}}
						@zoom={{this.zoom}}
						@label={{this.ratio.label}}
						@others={{this.others}}
						@springs={{this.springs}}
						@busy={{this.exporting}}
						@over={{this.drop.over}}
						@onChoose={{this.choose}}
						@onMove={{this.move}}
						@onResize={{this.resize}}
						@onZoom={{this.setZoom}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="social-source"
							@title={{this.source.stem}}
							@detail={{this.sourceText}}
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
				{{else if this.failed}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							@text={{loadFailed}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Platform" />
					<CanonSegmented
						class="social-platforms"
						@items={{platformNames}}
						@columns={{3}}
						@selected={{this.platformIndex}}
						@onChange={{this.pickPlatform}}
					/>
					<CanonHeading @text="Ratio" />
					<CanonSegmented
						class="social-ratios"
						@items={{this.ratioNames}}
						@columns={{2}}
						@selected={{this.ratioIndex}}
						@onChange={{this.pickRatio}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Crop" />
					<CanonRow
						class="social-size"
						@title="Size"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.sizePercent}}
							@min={{leastPercent}}
							@max={{100}}
							@step={{1}}
							@readout={{percentText}}
							@labelledBy={{titleId}}
							@onChange={{this.setSize}}
						/>
					</CanonRow>
					<CanonRow
						class="social-zoom"
						@title="Zoom"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.zoomPercent}}
							@min={{100}}
							@max={{mostZoomPercent}}
							@step={{10}}
							@readout={{percentText}}
							@labelledBy={{titleId}}
							@onChange={{this.setZoomPercent}}
						/>
					</CanonRow>
					<CanonTiles @items={{this.tiles}} />
					<CanonGrid>
						<CanonButton
							class="social-copy"
							@text="Copy"
							@icon={{Copy}}
							@disabled={{this.exportDisabled}}
							@onClick={{this.copy}}
						/>
						<CanonButton
							class="social-download"
							@kind="primary"
							@text={{passAlong
								"Download PNG"
							}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{this.exportDisabled}}
							@onClick={{this.export}}
						/>
					</CanonGrid>
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

function middleOf({ width, height }: Size): Point {
	return { x: width / 2, y: height / 2 };
}
