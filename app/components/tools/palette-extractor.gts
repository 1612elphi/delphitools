import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { hash } from '@ember/helper';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { LinkTo } from '@ember/routing';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonImageCompare from 'delphicanon/components/canon-image-compare';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { parseHex, takesBlackInk } from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import {
	clusterPixels,
	coverage,
	downsample,
	MAX_CLUSTERS,
	MAX_COLOURS,
	MIN_COLOURS,
	PAINT_EDGE,
	paint,
	pixelsFromCanvas,
	rankClusters,
	STRATEGIES,
	type Cluster,
} from 'delphitools-v2/components/tools/palette-extractor/engine';
import {
	ShareBand,
	ShareRows,
	ShareStrip,
	type Swatch,
} from 'delphitools-v2/components/tools/palette-extractor/share';
import './palette-extractor/palette-extractor.css';

const strategyNames = STRATEGIES.map((s) => s.name);

const Shuffle = <template><IconSvg @name="shuffle" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Code = <template><IconSvg @name="code" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Choose = <template><IconSvg @name="image" /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

interface Source {
	url: string;
	bitmap: ImageBitmap;
	stem: string;
}

function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const count = Number(query.get('extractCount'));
	const strategy = Number(query.get('extractStrategy'));
	return {
		sample: query.has('extractSample'),
		count:
			Number.isInteger(count) &&
			count >= MIN_COLOURS &&
			count <= MAX_COLOURS
				? count
				: 5,
		strategy: STRATEGIES[strategy] ? strategy : 0,
	};
}

const pngOf = (canvas: HTMLCanvasElement) =>
	new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);

const percentText = (share: number) =>
	share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;

export default class PaletteExtractor extends Component {
	@service declare colourNotation: ColourNotationService;
	@service('canon-toast') declare toast: CanonToastService;

	@tracked source?: Source;
	@tracked clusters: Cluster[] = [];
	@tracked run = 0;
	@tracked strategy: number;
	@tracked count: number;
	@tracked extracting = false;
	@tracked painted?: string;
	@tracked over = false;

	#sample?: HTMLCanvasElement;
	#frame?: number;
	#paintFrame?: number;
	#input?: HTMLInputElement;
	#loading = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.count = flags.count;
		this.strategy = flags.strategy;
		if (flags.sample)
			void drawnSample().then((file) => this.readFile(file));
	}

	willDestroy() {
		super.willDestroy();
		if (this.#frame !== undefined)
			cancelAnimationFrame(this.#frame);
		if (this.#paintFrame !== undefined)
			cancelAnimationFrame(this.#paintFrame);
		this.#release();
	}

	#release() {
		if (this.source) {
			URL.revokeObjectURL(this.source.url);
			this.source.bitmap.close();
		}
		if (this.painted) URL.revokeObjectURL(this.painted);
	}

	get info() {
		return STRATEGIES[this.strategy]!;
	}

	get palette(): Cluster[] {
		return rankClusters(this.clusters, this.info.key, this.count);
	}

	@cached
	get swatches(): Swatch[] {
		const { palette } = this;
		const shares = coverage(this.clusters, palette);
		return palette.map((cluster, i) => {
			const share = shares[i]!;
			const ink = takesBlackInk(parseHex(cluster.hex)!)
				? 'black'
				: 'white';
			return {
				key: `${this.run}-${i}`,
				hex: cluster.hex,
				name: getColourName(cluster.hex),
				value: this.colourNotation.format(cluster.hex),
				share,
				percent: percentText(share),
				figure: (share * 100).toFixed(1),
				fill: htmlSafe(`background: ${cluster.hex}`),
				segment: htmlSafe(
					`flex-grow: ${Math.max(share, 0.012)}; background: ${cluster.hex}; color: ${ink}`,
				),
				delay: htmlSafe(
					`--pe-delay: ${100 + i * 50}ms`,
				),
			};
		});
	}

	get aspect() {
		const bitmap = this.source?.bitmap;
		if (!bitmap) return 4 / 3;
		return Math.min(
			Math.max(
				bitmap.width / Math.max(bitmap.height, 1),
				0.8,
			),
			1.6,
		);
	}

	get stageStyle() {
		const bitmap = this.source?.bitmap;
		return htmlSafe(
			bitmap
				? `--pe-aspect: ${bitmap.width} / ${bitmap.height}`
				: '',
		);
	}

	get sizeText() {
		const bitmap = this.source?.bitmap;
		return bitmap ? `${bitmap.width} × ${bitmap.height}` : '';
	}

	get loading() {
		return this.extracting && this.clusters.length === 0;
	}

	get gennyColours() {
		return this.palette.map((c) => c.hex.slice(1)).join(',');
	}

	shortcuts = modifier((element: HTMLElement) => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				([
					'INPUT',
					'TEXTAREA',
					'SELECT',
					'BUTTON',
					'A',
				].includes(target.tagName) ||
					target.isContentEditable ||
					target.getAttribute('role') ===
						'slider')
			)
				return;
			if (
				event.code !== 'Space' ||
				this.clusters.length === 0
			)
				return;
			event.preventDefault();
			this.extract();
		};
		const doc = element.ownerDocument;
		doc.addEventListener('keydown', onKeyDown);
		return () => doc.removeEventListener('keydown', onKeyDown);
	});

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	extract = () => {
		const canvas = this.#sample;
		if (!canvas) return;
		if (this.#frame !== undefined)
			cancelAnimationFrame(this.#frame);
		this.extracting = true;
		this.#frame = requestAnimationFrame(() => {
			this.#frame = undefined;
			if (this.isDestroying || this.isDestroyed) return;
			this.clusters = clusterPixels(
				pixelsFromCanvas(canvas),
				MAX_CLUSTERS,
			);
			this.run += 1;
			this.extracting = false;
			this.repaint();
		});
	};

	repaint() {
		if (this.#paintFrame !== undefined)
			cancelAnimationFrame(this.#paintFrame);
		this.#paintFrame = requestAnimationFrame(() => {
			this.#paintFrame = undefined;
			const source = this.source;
			if (!source) return;
			const hexes = this.palette.map((c) => c.hex);
			void pngOf(
				paint(source.bitmap, hexes, PAINT_EDGE),
			).then((blob) => {
				if (
					!blob ||
					this.isDestroying ||
					this.source !== source
				)
					return;
				if (this.painted)
					URL.revokeObjectURL(this.painted);
				this.painted = URL.createObjectURL(blob);
			});
		});
	}

	readFile = async (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const run = ++this.#loading;
		let bitmap: ImageBitmap;
		try {
			bitmap = await decodeImage(file);
		} catch {
			return;
		}
		if (run !== this.#loading || this.isDestroying) {
			bitmap.close();
			return;
		}
		this.#release();
		this.painted = undefined;
		this.clusters = [];
		this.source = {
			url: URL.createObjectURL(file),
			bitmap,
			stem: file.name.replace(/\.[^.]*$/, '') || 'image',
		};
		this.#sample = downsample(bitmap);
		this.extract();
	};

	loadFiles = (files: File[]) => {
		const file = files.find((f) => matchesAccept(f, 'image/*'));
		if (file) void this.readFile(file);
	};

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
		void this.readFile(file);
	};

	pickStrategy = (index: number) => {
		this.strategy = index;
		this.repaint();
	};

	setCount = (value: number) => {
		this.count = value;
		this.repaint();
	};

	copy = (value: string) => void this.toast.copy(value);

	copyAll = () => this.copy(this.swatches.map((s) => s.value).join(', '));

	copyCss = () =>
		this.copy(
			`:root {\n${this.swatches
				.map(
					(s, i) =>
						`  --palette-${i + 1}: ${s.value};`,
				)
				.join('\n')}\n}`,
		);

	download = async () => {
		const source = this.source;
		if (!source || this.palette.length === 0) return;
		const blob = await pngOf(
			paint(
				source.bitmap,
				this.palette.map((c) => c.hex),
			),
		);
		if (blob) downloadBlob(blob, `${source.stem}-palette.png`);
	};

	<template>
		<CanonSplit
			class="palette-extractor"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.readFile accept="image/*"}}
			{{this.shortcuts}}
			{{on "dragover" this.dragOver}}
			{{on "dragleave" this.dragLeave}}
			{{on "drop" this.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<div class="pe-picture">
						<div
							class="pe-stage"
							style={{this.stageStyle}}
						>
							{{#if this.source}}
								<CanonImageCompare
									class="pe-compare"
									@before={{this.source.url}}
									@after={{this.painted}}
									@beforeTitle="Original"
									@afterTitle="Palette"
								/>
								{{#if
									this.loading
								}}
									<CanonLoader
										class="pe-loader"
									/>
								{{/if}}
							{{else}}
								<Slot
									class="pe-slot"
									@prompt="Drop an image here"
									@icon="palette"
									@dashed={{true}}
									@fills={{true}}
									@over={{this.over}}
									@onChoose={{this.choose}}
								/>
							{{/if}}
						</div>
						{{#if this.swatches.length}}
							<ShareStrip
								@swatches={{this.swatches}}
								@onCopy={{this.copy}}
							/>
						{{/if}}
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					{{#if this.source}}
						<CanonRow
							class="pe-source"
							@title="Image"
							@detail={{this.sizeText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Choose"
								@icon={{Choose}}
								@onClick={{this.choose}}
							/>
						</CanonRow>
					{{else}}
						<CanonDropZone
							class="pe-drop"
							@prompt="Drop an image"
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
				</CanonRows>
				{{#if this.source}}
					<CanonRows
						class="pe-controls"
						@framed={{true}}
					>
						<CanonHeading
							@text="Strategy"
						/>
						<CanonSegmented
							class="pe-strategies"
							@items={{strategyNames}}
							@selected={{this.strategy}}
							@columns={{4}}
							@onChange={{this.pickStrategy}}
						/>
						<CanonStatus
							class="pe-detail"
							@text={{this.info.description}}
							@tone="muted"
							@row={{true}}
						/>
						<CanonRow
							@title="Colours"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								class="pe-count"
								@value={{this.count}}
								@min={{MIN_COLOURS}}
								@max={{MAX_COLOURS}}
								@labelledBy={{titleId}}
								@onChange={{this.setCount}}
							/>
						</CanonRow>
					</CanonRows>
				{{/if}}
				{{#if this.swatches.length}}
					<CanonRows
						class="pe-result
							{{if
								this.extracting
								'pe-result--busy'
							}}"
						@framed={{true}}
					>
						<CanonHeading @text="Palette" />
						<ShareBand
							@swatches={{this.swatches}}
							@onCopy={{this.copy}}
						/>
						<ShareRows
							@swatches={{this.swatches}}
							@onCopy={{this.copy}}
						/>
						<CanonGrid @columns={{3}}>
							<CanonButton
								class="pe-shuffle"
								@kind="cell"
								@text="Shuffle"
								@icon={{Shuffle}}
								@disabled={{this.extracting}}
								@onClick={{this.extract}}
								title="Re-extract with new seeds (Space)"
								aria-keyshortcuts="Space"
							/>
							<CanonButton
								class="pe-copy-all"
								@kind="cell"
								@text="Copy All"
								@icon={{Copy}}
								@onClick={{this.copyAll}}
							/>
							<CanonButton
								class="pe-css"
								@kind="cell"
								@text="CSS Variables"
								@icon={{Code}}
								@onClick={{this.copyCss}}
							/>
							<CanonButton
								class="pe-download"
								@kind="cell"
								@text={{passAlong
									"Palettised Image"
								}}
								@icon={{Save}}
								@onClick={{this.download}}
							/>
							<LinkTo
								class="pe-open"
								@route="tools.tool"
								@model="palette-genny"
								@query={{hash
									colors=this.gennyColours
								}}
							>
								<IconSvg
									@name="palette"
								/>
								Open in Palette
								Generator
							</LinkTo>
						</CanonGrid>
					</CanonRows>
				{{/if}}
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
