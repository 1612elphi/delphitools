import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { stem } from 'delphicanon/lib/files';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob, downloadUrl } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { buildIco, dataUrlToBytes } from 'delphitools-v2/lib/ico';
import { pinSvgSize } from 'delphitools-v2/lib/svg-size';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	centred,
	fileName,
	icoSizes,
	render,
	role,
	sizes,
	snippet,
	type Icon,
	type Square,
} from 'delphitools-v2/components/tools/favicon-genny/favicon';
import Crop from 'delphitools-v2/components/tools/favicon-genny/crop';
import Scene from 'delphitools-v2/components/tools/favicon-genny/scene';
import DownloadAll from 'delphitools-v2/components/tools/media/download-all';
import './favicon-genny/favicon-genny.css';

const LOAD_FAILED = 'Image could not be read. Try another file?';
const sceneHeight = 196;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

interface Source {
	url: string;
	name: string;
	image: HTMLImageElement;
	width: number;
	height: number;
}

function readDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error('read'));
		reader.readAsDataURL(file);
	});
}

async function dataUrlOf(file: File) {
	if (file.type !== 'image/svg+xml') return readDataUrl(file);
	const svg = pinSvgSize(await file.text());
	if (svg === null) throw new Error('svg');
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default class FaviconGenny extends Component {
	@tracked source?: Source;
	@tracked square?: Square;
	@tracked icons: Icon[] = [];
	@tracked loadFailed = false;

	#loading = 0;
	#frame = 0;
	#requestedSide?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const side = Number(query.get('faviconCrop'));
		if (side > 0) this.#requestedSide = side;
		registerDestructor(this, () =>
			cancelAnimationFrame(this.#frame),
		);
		if (query.has('faviconSample'))
			void drawnSample().then((file) => this.load(file));
	}

	get title() {
		return this.source ? stem(this.source.name) || 'image' : '';
	}

	get detail() {
		const { source, square } = this;
		if (!source || !square) return '';
		return `${source.width} × ${source.height} → ${square.side} × ${square.side}`;
	}

	get ready() {
		return this.icons.length > 0;
	}

	get rows() {
		return sizes.map((size) => {
			const icon = this.icons.find((i) => i.size === size);
			const side = Math.min(size, 48);
			return {
				size,
				icon,
				pixels: `${size} × ${size}`,
				role: role(size),
				iconStyle: htmlSafe(
					`inline-size: ${side}px; block-size: ${side}px`,
				),
			};
		});
	}

	icon = (size: number) =>
		this.icons.find((i) => i.size === size)?.dataUrl;

	get tab() {
		return this.icon(32);
	}

	get touch() {
		return this.icon(180);
	}

	get app() {
		return this.icon(192);
	}

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
		const run = ++this.#loading;
		this.loadFailed = false;
		try {
			const url = await dataUrlOf(file);
			const image = new Image();
			image.src = url;
			await image.decode();
			if (!image.naturalWidth || !image.naturalHeight)
				throw new Error('empty');
			if (run !== this.#loading || this.isDestroying) return;
			const { naturalWidth: width, naturalHeight: height } =
				image;
			this.source = {
				url,
				name: file.name,
				image,
				width,
				height,
			};
			this.square = centred(
				width,
				height,
				this.#requestedSide,
			);
			this.#render();
		} catch {
			if (run !== this.#loading) return;
			this.clear();
			this.loadFailed = true;
		}
	};

	clear = () => {
		this.#loading++;
		cancelAnimationFrame(this.#frame);
		this.#frame = 0;
		this.source = undefined;
		this.square = undefined;
		this.icons = [];
		this.loadFailed = false;
	};

	crop = (square: Square) => {
		this.square = square;
		if (!this.#frame)
			this.#frame = requestAnimationFrame(() => {
				this.#frame = 0;
				this.#render();
			});
	};

	#render() {
		const { source, square } = this;
		if (source && square) this.icons = render(source.image, square);
	}

	download = (size: number) => {
		const url = this.icon(size);
		if (url) downloadUrl(url, fileName(size));
	};

	iconFiles = () =>
		this.icons.map((icon) => ({
			name: fileName(icon.size),
			blob: new Blob([dataUrlToBytes(icon.dataUrl)], {
				type: 'image/png',
			}),
		}));

	downloadIco = () => {
		const frames = this.icons
			.filter((icon) => icoSizes.includes(icon.size))
			.map((icon) => ({
				size: icon.size,
				data: dataUrlToBytes(icon.dataUrl),
			}));
		if (frames.length === 0) return;
		downloadBlob(
			new Blob([buildIco(frames)], { type: 'image/x-icon' }),
			'favicon.ico',
		);
	};

	<template>
		<CanonSplit
			class="favicon-genny"
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
		>
			<:banner>
				<CanonCanvas
					@height={{sceneHeight}}
					@background="var(--canon-muted)"
				>
					<Scene
						@tab={{this.tab}}
						@touch={{this.touch}}
						@app={{this.app}}
						@name={{this.title}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.source}}
						<CanonRow
							class="favicon-source"
							@title={{this.title}}
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
						{{#if this.square}}
							<Crop
								@url={{this.source.url}}
								@width={{this.source.width}}
								@height={{this.source.height}}
								@square={{this.square}}
								@onChange={{this.crop}}
							/>
						{{/if}}
						<CanonGrid @columns={{1}}>
							<CanonButton
								class="favicon-ico"
								@text="favicon.ico"
								@icon={{Save}}
								@disabled={{if
									this.ready
									false
									true
								}}
								@onClick={{this.downloadIco}}
							/>
							<DownloadAll
								class="favicon-all"
								@files={{this.iconFiles}}
								@zipName="favicons.zip"
								@disabled={{if
									this.ready
									false
									true
								}}
							/>
						</CanonGrid>
					{{else}}
						<CanonDropZone
							class="favicon-drop"
							@prompt="Drop an image here"
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
						{{#if this.loadFailed}}
							<CanonStatus
								class="favicon-error"
								@text={{LOAD_FAILED}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows
					class="favicon-sizes"
					@framed={{true}}
				>
					<CanonHeading @text="Sizes" />
					{{#each this.rows key="size" as |row|}}
						<div class="favicon-row">
							<span
								class="favicon-well"
							>
								{{#if row.icon}}
									<img
										src={{row.icon.dataUrl}}
										alt={{row.pixels}}
										style={{row.iconStyle}}
									/>
								{{else}}
									<span
										class="favicon-blank"
										style={{row.iconStyle}}
									></span>
								{{/if}}
							</span>
							<span
								class="favicon-meta"
							>
								<span
									class="favicon-pixels"
								>{{row.pixels}}</span>
								{{#if row.role}}
									<span
										class="favicon-role"
									>{{row.role}}</span>
								{{/if}}
							</span>
							<CanonButton
								class="favicon-save"
								@kind="cell"
								@icon={{Save}}
								@label={{passAlong
									"Download PNG"
								}}
								@disabled={{if
									row.icon
									false
									true
								}}
								@onClick={{fn
									this.download
									row.size
								}}
							/>
						</div>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonCodeBlock
						class="favicon-snippet"
						@code={{snippet}}
						@language="HTML"
					/>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
