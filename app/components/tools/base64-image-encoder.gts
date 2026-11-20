import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	maxBytes,
	rawBase64,
	tuning,
} from 'delphitools-v2/components/tools/base64-image-encoder/mosaic';
import Mosaic, {
	type MosaicImage,
} from 'delphitools-v2/components/tools/base64-image-encoder/picture';
import './base64-image-encoder/base64-image-encoder.css';

interface Encoded extends MosaicImage {
	dataUri: string;
	bytes: number;
	sizes: string;
}

const thumbnailSide = 240;

const Copy = <template><IconSvg @name="copy" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Remove = <template><IconSvg @name="x" /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

const selectAll = (event: Event) =>
	(event.target as HTMLTextAreaElement).select();

function readDataUri(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () =>
			reject(reader.error ?? new Error('read'));
		reader.readAsDataURL(file);
	});
}

async function thumbnailOf(dataUri: string) {
	const image = new Image();
	image.src = dataUri;
	try {
		await image.decode();
	} catch {
		return undefined;
	}
	const { naturalWidth: width, naturalHeight: height } = image;
	if (!width || !height) return undefined;
	const scale = Math.min(1, thumbnailSide / Math.max(width, height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	canvas.getContext('2d')?.drawImage(
		image,
		0,
		0,
		canvas.width,
		canvas.height,
	);
	return canvas;
}

export default class Base64ImageEncoder extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked images: Encoded[] = [];
	@tracked selected?: string;
	@tracked skipped: string[] = [];

	constructor(owner: Owner, args: object) {
		super(owner, args);
		if (
			new URLSearchParams(window.location.search).has(
				'b64Sample',
			)
		)
			void drawnSample().then((file) => this.load(file));
	}

	get shown() {
		return this.images.find((image) => image.id === this.selected);
	}

	get lit() {
		return this.images.length > 1 ? this.selected : undefined;
	}

	// ponytail: four sizes by count; past about 24 the strip clips; the encoded list names them all
	get thumbSize() {
		const count = this.images.length;
		if (count === 1) return 'one';
		if (count <= 6) return 'few';
		return count <= 12 ? 'many' : 'lots';
	}

	get hasList() {
		return this.images.length > 0 || this.skipped.length > 0;
	}

	loadFiles = (files: File[]) => {
		for (const file of files) void this.load(file);
	};

	allowDrop = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	dropAnywhere = (event: DragEvent) => {
		if (event.defaultPrevented) return;
		const files = [...(event.dataTransfer?.files ?? [])];
		if (files.length === 0) return;
		event.preventDefault();
		this.loadFiles(files);
	};

	load = async (file: File) => {
		const name = file.name || 'image';
		if (!matchesAccept(file, 'image/*')) {
			this.skipped = [
				...this.skipped,
				`${name} is not an image`,
			];
			return;
		}
		if (file.size > maxBytes) {
			this.skipped = [
				...this.skipped,
				`${name} is ${formatBytes(file.size)}, over the 5 MB limit`,
			];
			return;
		}
		let dataUri: string;
		try {
			dataUri = await readDataUri(file);
		} catch {
			this.skipped = [
				...this.skipped,
				`${name} is not an image`,
			];
			return;
		}
		const thumbnail = await thumbnailOf(dataUri);
		if (this.isDestroying) return;
		const raw = rawBase64(dataUri);
		const image: Encoded = {
			id: crypto.randomUUID(),
			name,
			raw,
			dataUri,
			bytes: file.size,
			uriBytes: dataUri.length,
			sizes: `${formatBytes(file.size)} → ${formatBytes(dataUri.length)}`,
			thumbnail,
		};
		this.images = [image, ...this.images];
		this.selected = image.id;
	};

	select = (id: string) => (this.selected = id);

	remove = (id: string) => {
		this.images = this.images.filter((image) => image.id !== id);
		if (this.selected === id) this.selected = this.images[0]?.id;
	};

	clearAll = () => {
		this.images = [];
		this.skipped = [];
		this.selected = undefined;
	};

	copyRaw = (image: Encoded) => void this.toast.copy(image.raw);

	copyUri = (image: Encoded) => void this.toast.copy(image.dataUri);

	<template>
		<CanonSplit
			class="b64-encoder"
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
		>
			<:banner>
				<CanonCanvas @height={{tuning.height}}>
					<Mosaic @image={{this.shown}} />
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Images" />
					<div
						class="b64-drop-wrap
							{{if
								this.images.length
								'b64-drop-wrap--filled'
							}}"
					>
						<CanonDropZone
							class="b64-drop"
							@prompt="Drop images here"
							@accept=""
							@multiple={{true}}
							@paste={{false}}
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
						{{#if this.images.length}}
							<div
								class="b64-drop-shown b64-drop-shown--{{this.thumbSize}}"
								aria-hidden="true"
							>
								{{#each
									this.images
									key="id"
									as |image|
								}}
									<img
										src={{image.dataUri}}
										alt=""
									/>
								{{/each}}
							</div>
						{{/if}}
					</div>
					{{#if this.skipped.length}}
						<CanonHeading @text="Skipped" />
						{{#each
							this.skipped
							as |reason|
						}}
							<CanonStatus
								@text={{reason}}
								@tone="warn"
								@row={{true}}
							/>
						{{/each}}
					{{/if}}
					{{#if this.hasList}}
						<CanonButton
							class="b64-clear"
							@text="Clear all"
							@icon={{Trash}}
							@onClick={{this.clearAll}}
						/>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				{{#each this.images key="id" as |image|}}
					<CanonRows
						class="b64-block"
						@framed={{true}}
					>
						<div class="b64-top">
							<button
								type="button"
								class="b64-head
									{{if
										(isLit
											this.lit
											image.id
										)
										'b64-head--lit'
									}}"
								aria-pressed={{if
									this.lit
									(if
										(isLit
											this.lit
											image.id
										)
										"true"
										"false"
									)
								}}
								{{on
									"click"
									(fn
										this.select
										image.id
									)
								}}
							>
								<span
									class="b64-thumb"
								>
									<img
										src={{image.dataUri}}
										alt=""
									/>
								</span>
								<span
									class="b64-meta"
								>
									<span
										class="b64-name"
									>{{image.name}}</span>
									<span
										class="b64-size"
									>{{image.sizes}}</span>
								</span>
							</button>
							<CanonButton
								class="b64-remove"
								@kind="cell"
								@icon={{Remove}}
								@label="Remove"
								@onClick={{fn
									this.remove
									image.id
								}}
							/>
						</div>
						<textarea
							class="b64-text"
							readonly
							rows="4"
							aria-label="Base64 data URI"
							value={{image.dataUri}}
							{{on "focus" selectAll}}
							{{on "click" selectAll}}
						></textarea>
						<CanonGrid>
							<CanonButton
								class="b64-copy-raw"
								@text="Copy Raw Base64"
								@icon={{Copy}}
								@onClick={{fn
									this.copyRaw
									image
								}}
							/>
							<CanonButton
								class="b64-copy-uri"
								@kind="primary"
								@text="Copy Data URI"
								@icon={{Copy}}
								@onClick={{fn
									this.copyUri
									image
								}}
							/>
						</CanonGrid>
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Encoded" />
						<CanonEmptyRow
							@text="Data URI"
						/>
					</CanonRows>
				{{/each}}
			</:main>
		</CanonSplit>
	</template>
}

function isLit(lit: string | undefined, id: string) {
	return lit === id;
}
