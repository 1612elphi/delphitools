import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { parseHex, type Rgb } from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import exifr from 'exifr';
import { IconSvg } from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { toolsForFile } from 'delphitools-v2/lib/omni';
import { sample } from 'delphitools-v2/lib/workflows';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import OpenIn from 'delphitools-v2/components/tools/media/open-in';
import {
	clusterPixels,
	downsample,
	pixelsFromCanvas,
	rankClusters,
} from 'delphitools-v2/components/tools/palette-extractor/engine';
import LocationMap from 'delphitools-v2/components/tools/image-atlas/map';
import Picture, {
	emptyPixels,
} from 'delphitools-v2/components/tools/image-atlas/picture';
import Scopes from 'delphitools-v2/components/tools/image-atlas/scopes';
import Tiles from 'delphitools-v2/components/tools/image-atlas/tiles';
import {
	gamutOverSRGB,
	pngIcc,
	profileName,
	sourceSpace,
	splitIcc,
} from 'delphitools-v2/components/tools/image-atlas/icc';
import {
	pixelFormat,
	type PixelFormat,
} from 'delphitools-v2/components/tools/image-atlas/header';
import {
	atlasSections,
	bannerHeight,
	blankSections,
	fieldCount,
	gpsFromExif,
	locationRows,
	percent,
	reportText,
	scanPixels,
	summary,
	type Dimensions,
	type ExifData,
	type GpsPoint,
	type Scan,
} from 'delphitools-v2/components/tools/image-atlas/report';
import './image-atlas/image-atlas.css';

const ACCEPT = 'image/*';
const NOT_AN_IMAGE = 'Only image files are supported.';
const READ_ERROR = "Couldn't read that file's metadata.";
const BLANK_OPEN = toolsForFile(sample('image/png')).filter(
	(tool) => tool.id !== 'image-atlas' && !tool.route,
);
const SCAN_EDGE = 512;
const PALETTE = 6;
const SCOPES_HEIGHT = 208;
const PERSONAL = new Set([
	'Camera',
	'Capture',
	'Location',
	'Dates',
	'IPTC',
	'XMP',
]);

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Down = <template><IconSvg @name="chevron-down" /></template>;
const Up = <template><IconSvg @name="chevron-up" /></template>;
const MapPin = <template><IconSvg @name="map-pin" /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

async function ownPixels(file: File, width: number, height: number) {
	const bitmap = await createImageBitmap(file, {
		colorSpaceConversion: 'none',
		resizeWidth: width,
		resizeHeight: height,
	});
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	return context.getImageData(0, 0, width, height).data;
}

async function scanOf(image: HTMLImageElement, file: File, icc: ExifData) {
	const scale = Math.min(
		1,
		SCAN_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
	);
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	const space = sourceSpace(icc);
	const pixels = space
		? await ownPixels(file, canvas.width, canvas.height).catch(
				(err: unknown) => {
					console.warn('raw decode failed', err);
					return null;
				},
			)
		: null;
	const scan = scanPixels(
		context.getImageData(0, 0, canvas.width, canvas.height).data,
		pixels && space ? { pixels, space } : undefined,
	);
	if (!pixels && Object.keys(icc).length && !('GrayTRC' in icc))
		scan.outside = null;
	const palette = rankClusters(
		clusterPixels(pixelsFromCanvas(downsample(canvas)), PALETTE),
		'dominant',
		PALETTE,
	).flatMap((cluster) => {
		const rgb = parseHex(cluster.hex);
		return rgb ? [rgb] : [];
	});
	return { scan, palette };
}

function drawnSample(): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = 1200;
	canvas.height = 800;
	const context = canvas.getContext('2d')!;
	const sky = context.createLinearGradient(0, 0, 1200, 800);
	sky.addColorStop(0, '#1d4e89');
	sky.addColorStop(0.5, '#f4a259');
	sky.addColorStop(1, '#bc4b51');
	context.fillStyle = sky;
	context.fillRect(0, 0, 1200, 800);
	context.fillStyle = '#5b8e7d';
	context.fillRect(0, 560, 1200, 240);
	context.clearRect(1000, 0, 200, 160);
	return new Promise((resolve) =>
		canvas.toBlob(
			(blob) =>
				resolve(
					new File([blob!], 'sample.png', {
						type: 'image/png',
					}),
				),
			'image/png',
		),
	);
}

export default class ImageAtlas extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked file: File | null = null;
	@tracked url: string | null = null;
	@tracked dims: Dimensions | null = null;
	@tracked exif: ExifData | null = null;
	@tracked icc: ExifData | null = null;
	@tracked format: PixelFormat | null = null;
	@tracked gps: GpsPoint | null = null;
	@tracked scan: Scan | null = null;
	@tracked palette: Rgb[] = [];
	@tracked busy = false;
	@tracked error = '';
	@tracked showsOther = false;
	@tracked bannerWidth = 390;

	#token = 0;
	#read: Promise<void> = Promise.resolve();
	#input?: HTMLInputElement;
	#otherFlag = false;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.#otherFlag = query.has('iaOther');
		if (query.has('iaSample'))
			void drawnSample().then((file) => {
				if (!this.isDestroying) this.load(file);
			});
	}

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#release();
	}

	get loaded() {
		return this.file !== null;
	}

	@cached
	get sections() {
		const { file } = this;
		if (!file) return blankSections;
		return atlasSections({
			name: file.name,
			size: file.size,
			type: file.type,
			dims: this.dims,
			exif: this.exif,
		});
	}

	get details() {
		return this.sections.filter((s) => s.title !== 'Location');
	}

	get location() {
		return locationRows(this.sections, this.gps);
	}

	get clean() {
		return (
			this.loaded &&
			this.exif !== null &&
			!this.sections.some((s) => PERSONAL.has(s.title))
		);
	}

	get otherCount() {
		const rows =
			this.sections.find((s) => s.title === 'Other')?.rows ??
			[];
		return `${rows.length} fields`;
	}

	get detail() {
		const { file } = this;
		if (!file) return '';
		if (this.busy) return 'Reading…';
		return summary(file.type, file.size, fieldCount(this.exif));
	}

	get noLocation() {
		return this.file !== null && !this.busy && !this.gps;
	}

	get gpsText() {
		const { gps } = this;
		return gps
			? `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}`
			: null;
	}

	get osm() {
		const { gps } = this;
		return gps
			? `https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lon}#map=15/${gps.lat}/${gps.lon}`
			: '';
	}

	get colourTiles() {
		const { scan, icc, format } = this;
		const gamut = icc
			? Object.keys(icc).length
				? gamutOverSRGB(icc)
				: 1
			: null;
		const outside = scan?.outside ?? null;
		return [
			{ label: 'Colour Model', value: format?.model ?? '—' },
			{
				label: 'Colour Profile',
				value: (icc && profileName(icc)) ?? '—',
			},
			{
				label: 'Bit Depth',
				value: format ? `${format.depth} bits` : '—',
			},
			{
				label: 'Alpha',
				value: format
					? format.alpha
						? 'Yes'
						: 'No'
					: '—',
			},
			{
				label: 'Gamut',
				value:
					gamut === null
						? '—'
						: `${gamut.toFixed(2)} × sRGB`,
			},
			{
				label: 'Outside sRGB',
				value:
					outside === null
						? '—'
						: percent(outside),
				level: outside ?? undefined,
			},
			{
				label: 'Transparent',
				value: scan ? percent(scan.transparent) : '—',
				level: scan?.transparent,
			},
		];
	}

	get paletteLead(): Rgb {
		return this.palette[0] ?? [0.5, 0.5, 0.5];
	}

	get pixels() {
		const { dims } = this;
		return dims ? { width: dims.w, height: dims.h } : null;
	}

	get bannerHeight() {
		return bannerHeight(
			this.bannerWidth,
			this.pixels ?? emptyPixels,
		);
	}

	get canCopy() {
		return this.exif !== null || this.gps !== null;
	}

	measureBanner = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width;
			if (width) this.bannerWidth = width;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

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

	loadFiles = (files: File[]) => {
		if (files[0]) this.load(files[0]);
	};

	dropAnywhere = (event: DragEvent) => {
		if (event.defaultPrevented) {
			this.drop.over = false;
			return;
		}
		this.drop.drop(event);
	};

	#release() {
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = null;
	}

	load = (file: File) => void (this.#read = this.#load(file));

	async #load(file: File) {
		if (!matchesAccept(file, ACCEPT)) {
			this.error = NOT_AN_IMAGE;
			return;
		}
		const token = ++this.#token;
		this.busy = true;
		this.error = '';
		this.dims = null;
		this.exif = null;
		this.icc = null;
		this.format = null;
		this.gps = null;
		this.scan = null;
		this.palette = [];
		this.showsOther = this.#otherFlag;
		this.#release();
		this.file = file;
		this.url = URL.createObjectURL(file);

		try {
			const data = (await exifr.parse(file, {
				tiff: true,
				exif: true,
				gps: true,
				ifd0: true,
				ifd1: true,
				xmp: true,
				iptc: true,
				icc: true,
				jfif: true,
				ihdr: true,
				makerNote: false,
				userComment: false,
				mergeOutput: true,
				translateKeys: true,
				translateValues: true,
				reviveValues: true,
			} as unknown as Record<string, unknown>)) as
				ExifData | undefined;

			if (token !== this.#token) return;

			let gps = gpsFromExif(data ?? {});
			if (!gps) {
				try {
					const g = (await exifr.gps(file)) as
						| {
								latitude?: unknown;
								longitude?: unknown;
						  }
						| undefined;
					gps = gpsFromExif({
						latitude: g?.latitude,
						longitude: g?.longitude,
					});
				} catch (err) {
					console.warn(
						'exifr.gps fallback failed',
						err,
					);
				}
			}
			const { exif, icc } = splitIcc(data ?? {});
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (
				file.type === 'image/png' &&
				!('ProfileDescription' in icc)
			)
				Object.assign(
					icc,
					await pngIcc(bytes).catch(() => null),
				);
			if (token !== this.#token) return;

			this.exif = exif;
			this.icc = icc;
			this.format = pixelFormat(bytes);
			this.gps = gps;
		} catch (err) {
			if (token !== this.#token) return;
			console.error('exifr failed:', err);
			this.error = READ_ERROR;
			this.exif = {};
		} finally {
			if (token === this.#token) this.busy = false;
		}
	}

	imageLoaded = (event: Event) => {
		const image = event.target as HTMLImageElement;
		if (!image.naturalWidth) return;
		this.dims = { w: image.naturalWidth, h: image.naturalHeight };
		void this.#scan(image);
	};

	async #scan(image: HTMLImageElement) {
		const token = this.#token;
		const { file } = this;
		await this.#read;
		await new Promise(requestAnimationFrame);
		if (token !== this.#token || this.isDestroying || !file) return;
		const read = await scanOf(image, file, this.icc ?? {});
		if (!read || token !== this.#token || this.isDestroying) return;
		this.scan = read.scan;
		this.palette = read.palette;
	}

	imageFailed = () => {
		this.error = READ_ERROR;
	};

	copy = () => {
		if (!this.canCopy || !this.file) return;
		void this.toast.copy(
			reportText(
				this.exif,
				this.gps,
				this.file.name,
				this.file.size,
				this.dims,
				this.colourTiles,
			),
		);
	};

	toggleOther = () => (this.showsOther = !this.showsOther);

	clear = () => {
		this.#token++;
		this.#release();
		this.file = null;
		this.dims = null;
		this.exif = null;
		this.icc = null;
		this.format = null;
		this.gps = null;
		this.scan = null;
		this.palette = [];
		this.busy = false;
		this.error = '';
		this.showsOther = false;
	};

	<template>
		<CanonSplit
			class="image-atlas"
			@mainLeadsStacked={{true}}
			{{filePaste this.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.dropAnywhere}}
		>
			<:banner>
				<CanonCanvas
					@height={{this.bannerHeight}}
					@background="var(--canon-muted)"
					{{this.measureBanner}}
				>
					<Picture
						@url={{this.url}}
						@pixels={{this.pixels}}
						@transparent={{if
							this.scan.transparent
							true
							false
						}}
						@busy={{this.busy}}
						@over={{this.drop.over}}
						@onChoose={{this.choose}}
						@onLoad={{this.imageLoaded}}
						@onError={{this.imageFailed}}
					/>
					{{! template-lint-disable require-input-label }}
					<input
						type="file"
						accept={{ACCEPT}}
						hidden
						{{this.keepInput}}
						{{on "change" this.picked}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows class="ia-details" @framed={{true}}>
					{{#each this.details as |section|}}
						{{#if
							(eq
								section.title
								"Other"
							)
						}}
							<CanonRow
								class="ia-other"
								@title="Other"
								@detail={{this.otherCount}}
								@form="flush"
							>
								<CanonButton
									@kind="cell"
									@text={{if
										this.showsOther
										"Hide"
										"Show"
									}}
									@icon={{if
										this.showsOther
										Up
										Down
									}}
									aria-expanded={{if
										this.showsOther
										"true"
										"false"
									}}
									@onClick={{this.toggleOther}}
								/>
							</CanonRow>
							{{#if this.showsOther}}
								<Tiles
									@rows={{section.rows}}
								/>
							{{/if}}
						{{else}}
							<CanonHeading
								@text={{section.title}}
							/>
							<Tiles
								@rows={{section.rows}}
							/>
						{{/if}}
					{{/each}}
					{{#if this.clean}}
						<CanonHeading @text="Clean" />
						<CanonEmptyRow
							class="ia-clean"
							@text="No EXIF, XMP or IPTC metadata found"
						/>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows class="ia-controls" @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.file}}
						<CanonRow
							class="ia-source"
							@title={{this.file.name}}
							@detail={{this.detail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<CanonDropZone
							class="ia-drop"
							@prompt="Drop an image"
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
					{{#if this.error}}
						<CanonStatus
							class="ia-error"
							@text={{this.error}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonButton
						class="ia-copy"
						@kind="primary"
						@text="Copy report"
						@icon={{Copy}}
						@disabled={{if
							this.canCopy
							false
							true
						}}
						@onClick={{this.copy}}
					/>
				</CanonRows>
				<CanonCanvas
					class="ia-scopes-canvas"
					@height={{SCOPES_HEIGHT}}
					@boxing="unlessWide"
					@background="#101210"
				>
					<Scopes @scan={{this.scan}} />
				</CanonCanvas>
				<CanonRows class="ia-colour" @framed={{true}}>
					<CanonHeading @text="Colour" />
					{{#if this.palette.length}}
						<CanonColourStrip
							class="ia-palette"
							@colour={{this.paletteLead}}
							@palette={{this.palette}}
							@nameOf={{getColourName}}
						/>
					{{else}}
						<div
							class="ia-palette-blank"
							aria-hidden="true"
						>
							<span></span><span
							></span><span
							></span><span
							></span><span
							></span><span></span>
						</div>
					{{/if}}
					<Tiles @rows={{this.colourTiles}} />
				</CanonRows>
				<CanonRows class="ia-location" @framed={{true}}>
					<CanonHeading @text="Location" />
					<LocationMap
						@gps={{this.gps}}
						@missing={{this.noLocation}}
					/>
					<CanonValueLine
						class="ia-gps"
						@label="GPS"
						@value={{this.gpsText}}
						@labelWidth={{36}}
					/>
					<Tiles @rows={{this.location}} />
					{{#if this.gps}}
						<a
							class="ia-osm"
							href={{this.osm}}
							target="_blank"
							rel="noopener noreferrer"
						><MapPin />Open location on
							OpenStreetMap</a>
					{{/if}}
				</CanonRows>
				{{#if this.file}}
					<OpenIn
						class="ia-open"
						@file={{this.file}}
						@self="image-atlas"
					/>
				{{else}}
					<OpenIn
						class="ia-open ia-open--blank"
						@tools={{BLANK_OPEN}}
						inert
					/>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
