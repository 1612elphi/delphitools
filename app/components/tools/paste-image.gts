import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	integral,
	isWhole,
	whole,
	type Rect,
	type Size,
} from 'delphitools-v2/lib/crop-rect';
import {
	downloadName,
	extensionFor,
} from 'delphitools-v2/components/tools/paste-image/file-name';
import Picture from 'delphitools-v2/components/tools/paste-image/picture';
import './paste-image/paste-image.css';

const Paste = <template><IconSvg @name="clipboard-paste" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Reset = <template><IconSvg @name="rotate-ccw" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface Pasted {
	file: Blob;
	type: string;
	url: string;
	image: HTMLImageElement;
	pixels: Size;
}

const none: Size = { width: 0, height: 0 };

export default class PasteImage extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked pasted?: Pasted;
	@tracked crop: Rect = whole(none);
	@tracked exporting = false;

	drop = new Drop('image/*', (file) => void this.load(file));
	#loading = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const [x, y, width, height] = (query.get('pasteCrop') ?? '')
			.split(',')
			.map(Number);
		if (query.has('pasteSample'))
			void drawnSample()
				.then((file) => this.load(file))
				.then(() => {
					if (height) {
						this.setCrop({
							x: x!,
							y: y!,
							width: width!,
							height,
						});
						this.settle();
					}
				});
		registerDestructor(this, () => {
			if (this.pasted) URL.revokeObjectURL(this.pasted.url);
		});
	}

	get aspect() {
		const { width, height } = this.pasted?.pixels ?? none;
		return height > 0
			? Math.min(Math.max(width / height, 0.75), 1.5)
			: 4 / 3;
	}

	get kind() {
		return this.pasted
			? extensionFor(this.pasted.type).toUpperCase()
			: '';
	}

	get pixelsText() {
		const { width, height } = this.pasted?.pixels ?? none;
		return `${width} × ${height} px`;
	}

	get isCropped() {
		return !!this.pasted && !isWhole(this.crop, this.pasted.pixels);
	}

	get tiles() {
		const loaded = !!this.pasted;
		const dash = '—';
		const { x, y, width, height } = this.crop;
		return [
			{
				label: 'Crop size',
				value: loaded
					? `${Math.round(width)} × ${Math.round(height)} px`
					: dash,
			},
			{
				label: 'Offset',
				value: loaded
					? `${Math.round(x)}, ${Math.round(y)}`
					: dash,
			},
		];
	}

	get exportDisabled() {
		return !this.pasted || this.exporting;
	}

	load = async (file: Blob) => {
		if (!file.type.startsWith('image/')) return;
		const run = ++this.#loading;
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.src = url;
		try {
			await image.decode();
		} catch {
			URL.revokeObjectURL(url);
			return;
		}
		if (run !== this.#loading || isDestroying(this)) {
			URL.revokeObjectURL(url);
			return;
		}
		if (this.pasted) URL.revokeObjectURL(this.pasted.url);
		const pixels = {
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
		this.pasted = { file, type: file.type, url, image, pixels };
		this.crop = whole(pixels);
	};

	paste = async () => {
		try {
			for (const item of await navigator.clipboard.read()) {
				const type = item.types.find((t) =>
					t.startsWith('image/'),
				);
				if (!type) continue;
				await this.load(await item.getType(type));
				return;
			}
		} catch {
			return;
		}
	};

	clear = () => {
		this.#loading++;
		if (this.pasted) URL.revokeObjectURL(this.pasted.url);
		this.pasted = undefined;
		this.crop = whole(none);
	};

	setCrop = (crop: Rect) => (this.crop = crop);

	settle = () => (this.crop = integral(this.crop));

	reset = () => {
		if (this.pasted) this.crop = whole(this.pasted.pixels);
	};

	#png(): Promise<Blob | null> {
		const { pasted } = this;
		if (!pasted) return Promise.resolve(null);
		const { x, y, width, height } = this.crop;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return Promise.resolve(null);
		context.drawImage(
			pasted.image,
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

	async #exported(use: (blob: Blob) => Promise<void> | void) {
		if (this.exportDisabled) return;
		this.exporting = true;
		try {
			const blob = await this.#png();
			if (blob) await use(blob);
		} finally {
			this.exporting = false;
		}
	}

	copy = () =>
		this.#exported(async (blob) => {
			try {
				await navigator.clipboard.write([
					new ClipboardItem({
						'image/png': blob,
					}),
				]);
			} catch {
				return;
			}
			this.toast.show();
		});

	save = () => {
		const { pasted } = this;
		if (!pasted || this.exporting) return;
		if (!this.isCropped) {
			downloadBlob(
				pasted.file,
				downloadName(new Date(), pasted.type),
			);
			return;
		}
		void this.#exported((blob) =>
			downloadBlob(
				blob,
				downloadName(new Date(), 'image/png'),
			),
		);
	};

	<template>
		<CanonSplit
			class="paste-image"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@url={{this.pasted.url}}
						@pixels={{if
							this.pasted
							this.pasted.pixels
							none
						}}
						@crop={{this.crop}}
						@over={{this.drop.over}}
						@onFile={{this.load}}
						@onCrop={{this.setCrop}}
						@onSettle={{this.settle}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Pasted Image" />
					{{#if this.pasted}}
						<CanonRow
							class="pi-file"
							@title={{this.kind}}
							@detail={{this.pixelsText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{/if}}
					<CanonGrid>
						<CanonButton
							class="pi-paste"
							@text="Paste"
							@icon={{Paste}}
							@onClick={{this.paste}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Crop" />
					<CanonTiles @items={{this.tiles}} />
					<CanonGrid>
						<CanonButton
							class="pi-reset"
							@text="Reset"
							@icon={{Reset}}
							@disabled={{if
								this.isCropped
								false
								true
							}}
							@onClick={{this.reset}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Output" />
					<CanonGrid>
						<CanonButton
							class="pi-copy"
							@text="Copy"
							@icon={{Copy}}
							@disabled={{this.exportDisabled}}
							@onClick={{this.copy}}
						/>
						<CanonButton
							class="pi-save"
							@kind="primary"
							@text={{passAlong
								"Download"
							}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{this.exportDisabled}}
							@onClick={{this.save}}
						/>
					</CanonGrid>
					{{#if this.exporting}}
						<CanonRow @title="Processing…">
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
					{{/if}}
				</CanonRows>
			</:main>
			<:end>
				<p class="pi-credit">Contributed by
					<a
						href="https://github.com/himanshubalani"
						target="_blank"
						rel="noopener noreferrer"
					>@himanshubalani</a></p>
			</:end>
		</CanonSplit>
	</template>
}
