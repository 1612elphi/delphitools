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
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import type {
	CanonMenuEntry,
	CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { stem } from 'delphicanon/lib/files';
import { springEasing } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	downloadIcon,
	passAlong,
	reducedMotion,
} from 'delphitools-v2/lib/flow-hooks';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import DownloadAll from 'delphitools-v2/components/tools/media/download-all';
import Drop from 'delphitools-v2/components/tools/media/drop';
import type { NamedBlob } from 'delphitools-v2/lib/zip-files';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	cellRect,
	cells,
	counts,
	tileSize,
	trimmed,
	type Cell,
	type Size,
} from 'delphitools-v2/components/tools/image-splitter/split';
import Picture from 'delphitools-v2/components/tools/image-splitter/picture';
import './image-splitter/image-splitter.css';

const spring = htmlSafe(`--split-spring: ${springEasing(0.62)}`);
const springMs = 650;
const emptyPixels = { width: 4, height: 3 };

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface Source {
	url: string;
	image: HTMLImageElement;
	pixels: Size;
	stem: string;
}

export default class ImageSplitter extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked rows = 3;
	@tracked cols = 3;
	@tracked source?: Source;
	@tracked exporting = false;
	@tracked joined = false;
	@tracked springs = false;

	drop = new Drop('image/*', (file) => void this.load(file));
	#input?: HTMLInputElement;
	#loading = 0;
	#frame?: number;
	#timers: number[] = [];

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const grid = /^(\d+)x(\d+)$/.exec(query.get('splitGrid') ?? '');
		if (grid) {
			this.cols = clampCount(Number(grid[1]));
			this.rows = clampCount(Number(grid[2]));
		}
		if (query.has('splitSample'))
			void drawnSample().then((file) => this.load(file));
		registerDestructor(this, () => {
			if (this.#frame) cancelAnimationFrame(this.#frame);
			this.#timers.forEach((timer) =>
				window.clearTimeout(timer),
			);
			if (this.source) URL.revokeObjectURL(this.source.url);
		});
	}

	get pixels() {
		return this.source?.pixels ?? emptyPixels;
	}

	get tile() {
		return tileSize(this.pixels, this.rows, this.cols);
	}

	get cuttable() {
		return (
			!!this.source &&
			this.tile.width > 0 &&
			this.tile.height > 0
		);
	}

	get sourceText() {
		const pixels = this.source?.pixels;
		return pixels ? `${pixels.width} × ${pixels.height}` : '';
	}

	get tiles() {
		const dash = '—';
		const { width, height } = trimmed(
			this.pixels,
			this.rows,
			this.cols,
		);
		return [
			{ label: 'Tiles', value: `${this.rows * this.cols}` },
			{
				label: 'Size',
				value: this.source
					? `${this.tile.width} × ${this.tile.height} px`
					: dash,
			},
			{
				label: 'Trimmed',
				value: !this.source
					? dash
					: width === 0 && height === 0
						? '0 px'
						: `${width} × ${height} px`,
			},
		];
	}

	get menu(): CanonMenuEntry[] {
		return [
			{ title: passAlong('Download'), icon: Save },
			{ title: 'Copy', icon: Copy },
		];
	}

	get exportDisabled() {
		return !this.cuttable || this.exporting;
	}

	get zipName() {
		return `${this.source?.stem ?? 'image'}-tiles.zip`;
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
			return;
		}
		if (run !== this.#loading || isDestroying(this)) {
			URL.revokeObjectURL(url);
			return;
		}
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.source = {
			url,
			image,
			pixels: {
				width: image.naturalWidth,
				height: image.naturalHeight,
			},
			stem: stem(file.name) || 'image',
		};
		this.#cut();
	};

	clear = () => {
		this.#loading++;
		if (this.source) URL.revokeObjectURL(this.source.url);
		this.source = undefined;
	};

	setCols = (value: number) => {
		this.cols = value;
		this.#cut();
	};

	setRows = (value: number) => {
		this.rows = value;
		this.#cut();
	};

	#cut() {
		if (!this.source || reducedMotion()) return;
		this.joined = true;
		this.springs = false;
		if (this.#frame) cancelAnimationFrame(this.#frame);
		this.#frame = requestAnimationFrame(() => {
			this.#frame = requestAnimationFrame(() => {
				this.#frame = undefined;
				this.joined = false;
				this.springs = true;
				this.#later(
					() => (this.springs = false),
					springMs,
				);
			});
		});
	}

	#later(run: () => void, ms: number) {
		this.#timers.push(window.setTimeout(run, ms));
	}

	#png(cell: Cell): Promise<Blob | null> {
		const { source } = this;
		if (!source) return Promise.resolve(null);
		const { x, y, width, height } = cellRect(
			cell,
			source.pixels,
			this.rows,
			this.cols,
		);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context || !width || !height) return Promise.resolve(null);
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

	#name(cell: Cell) {
		return `${this.source?.stem ?? 'image'}-${cell.label}.png`;
	}

	pick = async (cell: Cell, item: CanonMenuItem) => {
		const blob = await this.#png(cell);
		if (!blob) return;
		if (item.title !== 'Copy')
			return downloadBlob(blob, this.#name(cell));
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
		} catch {
			return;
		}
		this.toast.show();
	};

	tileFiles = async () => {
		const files: NamedBlob[] = [];
		if (!this.cuttable) return files;
		this.exporting = true;
		try {
			for (const cell of cells(this.rows, this.cols)) {
				const blob = await this.#png(cell);
				if (blob)
					files.push({
						name: this.#name(cell),
						blob,
					});
			}
		} finally {
			if (!isDestroying(this)) this.exporting = false;
		}
		return files;
	};

	<template>
		<CanonSplit
			class="image-splitter"
			@halves={{true}}
			@collapsesTo={{200}}
			style={{spring}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1.25}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@url={{this.source.url}}
						@pixels={{this.pixels}}
						@rows={{this.rows}}
						@cols={{this.cols}}
						@joined={{this.joined}}
						@springs={{this.springs}}
						@over={{this.drop.over}}
						@menu={{this.menu}}
						@onChoose={{this.choose}}
						@onPick={{this.pick}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="split-source"
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
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Grid" />
					<CanonRow
						@title="Columns"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							class="split-cols"
							@value={{this.cols}}
							@min={{counts.min}}
							@max={{counts.max}}
							@labelledBy={{titleId}}
							@onChange={{this.setCols}}
						/>
					</CanonRow>
					<CanonRow
						@title="Rows"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							class="split-rows"
							@value={{this.rows}}
							@min={{counts.min}}
							@max={{counts.max}}
							@labelledBy={{titleId}}
							@onChange={{this.setRows}}
						/>
					</CanonRow>
					<CanonHeading @text="Tiles" />
					<CanonTiles @items={{this.tiles}} />
					<DownloadAll
						class="split-download"
						@files={{this.tileFiles}}
						@zipName={{this.zipName}}
						@disabled={{this.exportDisabled}}
					/>
					{{#if this.exporting}}
						<CanonRow
							class="split-busy"
							@title="Processing…"
						>
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
					{{/if}}
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

function clampCount(value: number) {
	return Math.min(counts.max, Math.max(counts.min, value));
}
