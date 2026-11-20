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
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import type { Rect, Size } from 'delphicanon/lib/dimension-line';
import { stem } from 'delphicanon/lib/files';
import { reducedMotion, springEasing } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import {
	keptRect,
	margins,
	transparentSample,
	untrimmed,
} from 'delphitools-v2/components/tools/image-clipper/engine';
import Picture from 'delphitools-v2/components/tools/image-clipper/picture';
import AtlasOpenIn from 'delphitools-v2/components/atlas-open-in';
import { getToolById } from 'delphitools-v2/lib/tools';
import './media/open-in.css';
import './image-clipper/image-clipper.css';

const PNG_ONLY = 'Only PNG files are supported.';
const NOTHING_CLIPPED = 'Nothing was clipped. Is this a transparent PNG?';
const remover = [getToolById('background-remover')!];
const ENCODE_FAILED = 'Failed to encode clipped image.';

const spring = htmlSafe(`--clip-spring: ${springEasing(0.85)}`);
const springMs = 600;

const aspect = 4 / 3;
const emptyPixels: Size = { width: 1600, height: 1200 };
const emptyKept: Rect = { x: 340, y: 220, width: 1030, height: 700 };

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface Source {
	file: File;
	url: string;
	name: string;
	stem: string;
	canvas: HTMLCanvasElement;
	pixels: Size;
	kept: Rect | null;
}

const full = ({ width, height }: Size): Rect => ({ x: 0, y: 0, width, height });

export default class ImageClipper extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked source?: Source;
	@tracked shownKept: Rect | null = emptyKept;
	@tracked failure = '';
	@tracked working = false;
	@tracked exporting = false;
	@tracked springs = false;

	drop = new Drop('image/*', (file) => void this.load(file));
	#input?: HTMLInputElement;
	#loading = 0;
	#timers: number[] = [];
	#frame = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		if (query.has('clipSample')) {
			void transparentSample().then((file) =>
				this.load(file),
			);
			if (query.has('clipReplay'))
				this.#timers.push(
					window.setTimeout(() => {
						this.clear();
						void transparentSample().then(
							(file) =>
								this.load(file),
						);
					}, 3000),
				);
		}
		registerDestructor(this, () => {
			this.#timers.forEach((timer) =>
				window.clearTimeout(timer),
			);
			cancelAnimationFrame(this.#frame);
			if (this.source) URL.revokeObjectURL(this.source.url);
		});
	}

	get pixels() {
		return this.source?.pixels ?? emptyPixels;
	}

	get margins() {
		const { source } = this;
		return source?.kept
			? margins(source.kept, source.pixels)
			: undefined;
	}

	get sizeText() {
		const pixels = this.source?.pixels;
		return pixels ? `${pixels.width} × ${pixels.height}` : '';
	}

	get tiles() {
		const dash = '—';
		const kept = this.source?.kept;
		const m = this.margins;
		const pair = ({ width, height }: Size) =>
			`${width} × ${height} px`;
		const px = (value?: number) =>
			value === undefined ? dash : `${value} px`;
		return [
			{
				label: 'Original',
				value: this.source
					? pair(this.source.pixels)
					: dash,
			},
			{ label: 'Clipped', value: kept ? pair(kept) : dash },
			{
				label: 'Area',
				value: m
					? m.savedPercent > 0
						? `−${m.savedPercent} %`
						: '0 %'
					: dash,
				level: m ? m.savedPercent / 100 : undefined,
			},
			{ label: 'Top', value: px(m?.top) },
			{ label: 'Right', value: px(m?.right) },
			{ label: 'Bottom', value: px(m?.bottom) },
			{ label: 'Left', value: px(m?.left) },
		];
	}

	get note() {
		const { source } = this;
		if (!source) return undefined;
		return source.kept ? undefined : 'Fully transparent';
	}

	get nothingClipped() {
		const m = this.margins;
		return !!m && untrimmed(m);
	}

	get nothingClippedText() {
		return NOTHING_CLIPPED;
	}

	get remover() {
		return remover;
	}

	get clipDisabled() {
		return !this.source?.kept;
	}

	get exportDisabled() {
		return this.clipDisabled || this.exporting;
	}

	get busy() {
		return this.working || this.exporting;
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

	// ponytail: decodes and scans at full size on the main thread, as the web tool did; a worker if large PNGs stall
	load = async (file: File) => {
		if (!matchesAccept(file, 'image/png,.png')) {
			this.failure = PNG_ONLY;
			return;
		}
		const run = ++this.#loading;
		this.working = true;
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.src = url;
		try {
			await image.decode();
		} catch {
			URL.revokeObjectURL(url);
			if (run !== this.#loading) return;
			this.working = false;
			this.failure = `Could not read ${file.name}`;
			return;
		}
		if (run !== this.#loading || isDestroying(this)) {
			URL.revokeObjectURL(url);
			return;
		}
		const pixels = {
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
		const canvas = document.createElement('canvas');
		canvas.width = pixels.width;
		canvas.height = pixels.height;
		const context = canvas.getContext('2d', {
			willReadFrequently: true,
		})!;
		context.drawImage(image, 0, 0);
		const kept = keptRect(
			context.getImageData(0, 0, pixels.width, pixels.height)
				.data,
			pixels.width,
			pixels.height,
		);
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.source = {
			file,
			url,
			name: file.name || 'image.png',
			stem: stem(file.name) || 'image',
			canvas,
			pixels,
			kept,
		};
		this.working = false;
		this.failure = '';
		this.#show(kept, pixels);
	};

	#show(kept: Rect | null, pixels: Size) {
		cancelAnimationFrame(this.#frame);
		this.springs = false;
		if (!kept || reducedMotion()) {
			this.shownKept = kept;
			return;
		}
		this.shownKept = full(pixels);
		this.#frame = requestAnimationFrame(() => {
			this.#frame = requestAnimationFrame(() => {
				this.springs = true;
				this.shownKept = kept;
				this.#timers.push(
					window.setTimeout(
						() => (this.springs = false),
						springMs,
					),
				);
			});
		});
	}

	clear = () => {
		this.#loading++;
		cancelAnimationFrame(this.#frame);
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.source = undefined;
		this.shownKept = emptyKept;
		this.springs = false;
		this.working = false;
		this.failure = '';
	};

	#png(): Promise<Blob | null> {
		const kept = this.source?.kept;
		if (!this.source || !kept) return Promise.resolve(null);
		const canvas = document.createElement('canvas');
		canvas.width = kept.width;
		canvas.height = kept.height;
		const context = canvas.getContext('2d');
		if (!context) return Promise.resolve(null);
		context.drawImage(
			this.source.canvas,
			kept.x,
			kept.y,
			kept.width,
			kept.height,
			0,
			0,
			kept.width,
			kept.height,
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
		this.exporting = true;
		try {
			const blob = await this.#png();
			if (blob)
				downloadBlob(
					blob,
					`${source.stem}-clipped.png`,
				);
			else this.failure = ENCODE_FAILED;
		} finally {
			this.exporting = false;
		}
	};

	<template>
		<CanonSplit
			class="image-clipper"
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
					@aspect={{aspect}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@url={{this.source.url}}
						@pixels={{this.pixels}}
						@kept={{this.shownKept}}
						@springs={{this.springs}}
						@over={{this.drop.over}}
						@onChoose={{this.choose}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="clip-source"
							@title={{this.source.name}}
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
				{{/if}}
				{{#if this.failure}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							class="clip-failure"
							@text={{this.failure}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Output" />
					<CanonTiles @items={{this.tiles}} />
					{{#if this.note}}
						<CanonStatus
							class="clip-note"
							@text={{this.note}}
							@tone="muted"
							@row={{true}}
						/>
					{{/if}}
					{{#if this.nothingClipped}}
						<CanonStatus
							class="clip-nothing"
							@text={{this.nothingClippedText}}
							@tone="warn"
							@row={{true}}
						/>
						<div
							class="media-open clip-elsewhere"
						>
							<AtlasOpenIn
								@file={{this.source.file}}
								@tools={{this.remover}}
							/>
						</div>
					{{/if}}
					<CanonGrid>
						<CanonButton
							class="clip-copy"
							@text="Copy"
							@icon={{Copy}}
							@disabled={{this.clipDisabled}}
							@onClick={{this.copy}}
						/>
						<CanonButton
							class="clip-download"
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
					{{#if this.busy}}
						<CanonRow
							class="clip-busy"
							@title="Processing…"
						>
							<CanonLoader />
						</CanonRow>
					{{/if}}
				</CanonRows>
				{{! template-lint-disable require-input-label }}
				<input
					type="file"
					accept="image/png"
					hidden
					{{this.keepInput}}
					{{on "change" this.picked}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
