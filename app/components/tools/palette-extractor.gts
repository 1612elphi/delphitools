import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn, hash } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import { modifier } from 'ember-modifier';
import onClickOutside from 'ember-click-outside/modifiers/on-click-outside';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	rgbToOklab,
	oklabToRgb,
	rgbToHex,
	labToLch,
	contrastText,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';
import type BreakpointService from 'delphitools-v2/services/breakpoint';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

export type ExtractionStrategy =
	| 'dominant'
	| 'vibrant'
	| 'muted'
	| 'light'
	| 'dark'
	| 'warm'
	| 'cool'
	| 'accent';

export interface Cluster {
	// oklab [l, a, b]
	centroid: Triple;
	hex: string;
	count: number;
}

interface StrategyInfo {
	name: string;
	description: string;
}

const STRATEGIES: Record<ExtractionStrategy, StrategyInfo> = {
	dominant: {
		name: 'Dominant',
		description:
			'The most prominent colours by area — what the image is mostly made of',
	},
	vibrant: {
		name: 'Vibrant',
		description:
			'The most saturated, punchy colours — the ones that pop',
	},
	muted: {
		name: 'Muted',
		description:
			'Understated, desaturated tones — the quiet palette',
	},
	light: {
		name: 'Light',
		description:
			'The brightest colours — highlights, glows, and washed-out tones',
	},
	dark: {
		name: 'Dark',
		description:
			'Deep shadows and rich darks — moody and grounding',
	},
	warm: {
		name: 'Warm',
		description: 'Reds, oranges, yellows, and earthy tones',
	},
	cool: {
		name: 'Cool',
		description: 'Blues, greens, and icy tones',
	},
	accent: {
		name: 'Accent',
		description:
			'Rare standout colours that are far from the dominant palette',
	},
};

const STRATEGY_ORDER: ExtractionStrategy[] = [
	'dominant',
	'vibrant',
	'muted',
	'light',
	'dark',
	'warm',
	'cool',
	'accent',
];

// ≤22,500 pixels clustered
const SAMPLE_EDGE = 150;
const MAX_CLUSTERS = 32;
const KMEANS_ITERATIONS = 20;
const MIN_COLOURS = 3;
const MAX_COLOURS = 11;
const COPIED_MS = 1500;
const GRID_THRESHOLD_MOBILE = 4;
const GRID_THRESHOLD_TABLET = 5;

// squared omits sqrt
export function oklabDistance(a: Triple, b: Triple): number {
	const dL = a[0] - b[0];
	const da = a[1] - b[1];
	const db = a[2] - b[2];
	return dL * dL + da * da + db * db;
}

// zero-dim canvas throws
export function downsample(
	image: HTMLImageElement,
	edge = SAMPLE_EDGE,
): HTMLCanvasElement {
	let w = image.naturalWidth;
	let h = image.naturalHeight;
	const scale = edge / Math.max(w, h);
	if (scale < 1) {
		w = Math.max(1, Math.round(w * scale));
		h = Math.max(1, Math.round(h * scale));
	}

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	canvas.getContext('2d')?.drawImage(image, 0, 0, w, h);
	return canvas;
}

export function pixelsFromCanvas(canvas: HTMLCanvasElement): Triple[] {
	const ctx = canvas.getContext('2d');
	if (!ctx || canvas.width === 0 || canvas.height === 0) return [];

	const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const pixels: Triple[] = [];
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3]! < 128) continue;
		pixels.push(rgbToOklab(data[i]!, data[i + 1]!, data[i + 2]!));
	}
	return pixels;
}

// k-means++ seeding; random injectable
export function seedCentroids(
	pixels: Triple[],
	k: number,
	random: () => number = Math.random,
): Triple[] {
	const pick = (index: number) =>
		pixels[Math.min(pixels.length - 1, Math.max(0, index))]!;

	const centroids: Triple[] = [
		pick(Math.floor(random() * pixels.length)),
	];
	const nearest = new Float64Array(pixels.length).fill(Infinity);

	for (let c = 1; c < k; c++) {
		const last = centroids[c - 1]!;
		let total = 0;
		for (let i = 0; i < pixels.length; i++) {
			const d = oklabDistance(pixels[i]!, last);
			if (d < nearest[i]!) nearest[i] = d;
			total += nearest[i]!;
		}

		let r = random() * total;
		let index = 0;
		for (let i = 0; i < pixels.length; i++) {
			r -= nearest[i]!;
			if (r <= 0) {
				index = i;
				break;
			}
		}
		centroids.push(pick(index));
	}

	return centroids;
}

// lloyd's k-means, fixed iterations
export function clusterPixels(
	pixels: Triple[],
	k: number,
	random: () => number = Math.random,
): Cluster[] {
	if (pixels.length === 0) return [];

	let centroids = seedCentroids(
		pixels,
		Math.min(k, pixels.length),
		random,
	);
	const assignments = new Int32Array(pixels.length);

	for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
		for (let i = 0; i < pixels.length; i++) {
			let best = 0;
			let bestDistance = Infinity;
			for (let c = 0; c < centroids.length; c++) {
				const d = oklabDistance(
					pixels[i]!,
					centroids[c]!,
				);
				if (d < bestDistance) {
					bestDistance = d;
					best = c;
				}
			}
			assignments[i] = best;
		}

		const sums: Triple[] = centroids.map(() => [0, 0, 0]);
		const counts = new Int32Array(centroids.length);
		for (let i = 0; i < pixels.length; i++) {
			const c = assignments[i]!;
			const sum = sums[c]!;
			const pixel = pixels[i]!;
			sum[0] += pixel[0];
			sum[1] += pixel[1];
			sum[2] += pixel[2];
			counts[c] = counts[c]! + 1;
		}

		centroids = centroids.map((previous, c) => {
			const n = counts[c]!;
			if (n === 0) return previous;
			const sum = sums[c]!;
			return [sum[0] / n, sum[1] / n, sum[2] / n];
		});
	}

	const sizes = new Int32Array(centroids.length);
	for (let i = 0; i < pixels.length; i++) {
		const c = assignments[i]!;
		sizes[c] = sizes[c]! + 1;
	}

	return centroids
		.map((centroid, i) => ({
			centroid,
			hex: rgbToHex(...oklabToRgb(...centroid)),
			count: sizes[i]!,
		}))
		.filter((cluster) => cluster.count > 0);
}

function dominantCentroids(clusters: Cluster[]): Triple[] {
	const sorted = [...clusters].sort((a, b) => b.count - a.count);
	const threshold = sorted[Math.floor(sorted.length / 3)]?.count ?? 0;
	return sorted
		.filter((cluster) => cluster.count >= threshold)
		.map((cluster) => cluster.centroid);
}

function score(
	cluster: Cluster,
	strategy: ExtractionStrategy,
	large: Triple[],
): number {
	const [L, a, b] = cluster.centroid;
	const [, chroma, hue] = labToLch(L, a, b);

	switch (strategy) {
		case 'dominant':
			return cluster.count;
		case 'vibrant':
			return chroma;
		case 'muted':
			return 1 / (chroma + 0.001);
		case 'light':
			return L;
		case 'dark':
			return 1 - L;
		case 'warm': {
			const isWarm = (hue >= 0 && hue <= 70) || hue >= 320;
			return isWarm ? chroma + 0.5 : chroma * 0.1;
		}
		case 'cool': {
			const isCool = hue >= 150 && hue <= 300;
			return isCool ? chroma + 0.5 : chroma * 0.1;
		}
		case 'accent': {
			let nearest = Infinity;
			for (const centroid of large) {
				const d = oklabDistance(
					cluster.centroid,
					centroid,
				);
				if (d < nearest) nearest = d;
			}
			// rare colours outrank common
			return nearest / Math.log(cluster.count + 2);
		}
	}
}

export function rankClusters(
	clusters: Cluster[],
	strategy: ExtractionStrategy,
	count: number,
): Cluster[] {
	const large = strategy === 'accent' ? dominantCentroids(clusters) : [];
	return clusters
		.map((cluster) => ({
			cluster,
			score: score(cluster, strategy, large),
		}))
		.sort((x, y) => y.score - x.score)
		.slice(0, count)
		.map((scored) => scored.cluster);
}

export default class PaletteExtractorTool extends Component {
	@service declare breakpoint: BreakpointService;
	@service declare colourNotation: ColourNotationService;

	@tracked imageUrl: string | null = null;
	@tracked imageName = '';
	@tracked clusters: Cluster[] = [];
	@tracked strategy: ExtractionStrategy = 'dominant';
	@tracked count = 5;
	@tracked copied: string | null = null;
	@tracked selectedIndex: number | null = null;
	@tracked extracting = false;

	#sampleCanvas: HTMLCanvasElement | null = null;
	#frame?: number;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
		this.#cancelFrame();
		if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
	}

	#cancelFrame() {
		if (this.#frame === undefined) return;
		cancelAnimationFrame(this.#frame);
		this.#frame = undefined;
	}

	get strategyInfo() {
		return STRATEGIES[this.strategy];
	}

	get strategies() {
		return STRATEGY_ORDER.map((key) => ({
			key,
			name: STRATEGIES[key].name,
		}));
	}

	get palette() {
		if (this.clusters.length === 0) return [];
		return rankClusters(this.clusters, this.strategy, this.count);
	}

	get totalPixels() {
		return this.clusters.reduce((sum, c) => sum + c.count, 0);
	}

	get atMin() {
		return this.count <= MIN_COLOURS;
	}

	get atMax() {
		return this.count >= MAX_COLOURS;
	}

	get isGrid() {
		const b = this.breakpoint.current;
		return (
			(b === 'mobile' &&
				this.count > GRID_THRESHOLD_MOBILE) ||
			(b === 'tablet' && this.count > GRID_THRESHOLD_TABLET)
		);
	}

	get gridColumns() {
		return this.breakpoint.current === 'mobile' ? 2 : 3;
	}

	get swatches() {
		return this.palette.map((cluster, index) => ({
			index,
			hex: cluster.hex,
			value: this.colourNotation.format(cluster.hex),
			fillStyle: htmlSafe(`background-color: ${cluster.hex}`),
			// style-concatenation: rgbToHex literal
			textStyle: htmlSafe(
				`color: ${contrastText(cluster.hex)}`,
			),
			selected: this.selectedIndex === index,
			copyKey: `swatch-${index}`,
		}));
	}

	get rows() {
		const total = this.totalPixels;
		return this.palette.map((cluster, index) => ({
			index,
			hex: cluster.hex,
			value: this.colourNotation.format(cluster.hex),
			name: getColourName(cluster.hex),
			share:
				total > 0
					? (
							(cluster.count /
								total) *
							100
						).toFixed(1)
					: '0',
			fillStyle: htmlSafe(`background-color: ${cluster.hex}`),
			copyKey: `list-${index}`,
		}));
	}

	// palette-genny decodes this
	get gennyColours() {
		return this.palette.map((c) => c.hex.slice(1)).join(',');
	}

	get sourceTitle() {
		return `Source: ${this.imageName} — click to change`;
	}

	// listener dies with tool
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
					target.isContentEditable)
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

	extract = () => {
		const canvas = this.#sampleCanvas;
		if (!canvas) return;
		this.#cancelFrame();
		this.extracting = true;
		// lets dim state paint
		this.#frame = requestAnimationFrame(() => {
			this.#frame = undefined;
			if (this.isDestroying || this.isDestroyed) return;
			this.clusters = clusterPixels(
				pixelsFromCanvas(canvas),
				MAX_CLUSTERS,
			);
			this.selectedIndex = null;
			this.extracting = false;
		});
	};

	readFile = (file: File) => {
		if (!file.type.startsWith('image/')) return;
		if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
		this.#cancelFrame();

		const url = URL.createObjectURL(file);
		this.imageUrl = url;
		this.imageName = file.name;
		this.clusters = [];
		this.selectedIndex = null;
		this.extracting = false;
		this.#sampleCanvas = null;

		const image = new Image();
		image.addEventListener('load', () => {
			if (this.isDestroying || this.isDestroyed) return;
			this.#sampleCanvas = downsample(image);
			this.extract();
		});
		image.src = url;
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// lets same file re-fire
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = Array.from(event.dataTransfer?.files ?? []).find(
			(f) => f.type.startsWith('image/'),
		);
		if (file) this.readFile(file);
	};

	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	// re-rank invalidates selection index
	chooseStrategy = (value: string) => {
		this.strategy = value as ExtractionStrategy;
		this.selectedIndex = null;
	};

	fewer = () => {
		if (this.atMin) return;
		this.count -= 1;
		this.selectedIndex = null;
	};

	more = () => {
		if (this.atMax) return;
		this.count += 1;
		this.selectedIndex = null;
	};

	// touch has no hover
	selectSwatch = (index: number) => {
		if (!this.breakpoint.isTouch) return;
		this.selectedIndex =
			this.selectedIndex === index ? null : index;
	};

	deselect = () => {
		this.selectedIndex = null;
	};

	copy = async (value: string, key: string) => {
		await navigator.clipboard.writeText(value);
		this.copied = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copyValue = (value: string, key: string) => void this.copy(value, key);

	// copy without toggling swatch
	copySwatch = (value: string, key: string, event: MouseEvent) => {
		event.stopPropagation();
		this.copyValue(value, key);
	};

	copyAll = () =>
		this.copyValue(
			this.palette
				.map((c) => this.colourNotation.format(c.hex))
				.join(', '),
			'all',
		);

	copyCss = () =>
		this.copyValue(
			`:root {\n${this.palette
				.map(
					(c, i) =>
						`  --palette-${i + 1}: ${this.colourNotation.format(c.hex)};`,
				)
				.join('\n')}\n}`,
			'css',
		);

	<template>
		<div
			class="dt-extract"
			{{filePaste this.readFile accept="image/*"}}
			{{this.shortcuts}}
		>
			{{#if this.imageUrl}}
				<div class="dt-extract-frame">
					{{#if this.swatches}}
						<div
							class="dt-extract-strip
								{{if
									this.isGrid
									'is-grid'
									'is-row'
								}}
								cols-{{this.gridColumns}}
								{{if
									this.breakpoint.isTouch
									'is-touch'
								}}
								{{if
									this.extracting
									'is-busy'
								}}"
							{{onClickOutside
								this.deselect
							}}
						>
							{{#each
								this.swatches
								key="index"
								as |swatch|
							}}
								{{! template-lint-disable no-invalid-interactive }}
								<div
									class="dt-extract-swatch
										{{if
											swatch.selected
											'is-selected'
										}}"
									style={{swatch.fillStyle}}
									{{on
										"click"
										(fn
											this.selectSwatch
											swatch.index
										)
									}}
								>
									<button
										type="button"
										class="dt-extract-swatch-copy"
										style={{swatch.textStyle}}
										aria-label="Copy
											{{swatch.value}}"
										{{on
											"click"
											(fn
												this.copySwatch
												swatch.value
												swatch.copyKey
											)
										}}
									>
										{{#if
											(eq
												this.copied
												swatch.copyKey
											)
										}}
											<Icon
												@name="check"
											/>
											Copied!
										{{else}}
											<Icon
												@name="copy"
											/>
											{{swatch.value}}
										{{/if}}
									</button>
									<span
										class="dt-extract-swatch-value"
										style={{swatch.textStyle}}
									>{{swatch.value}}</span>
								</div>
							{{/each}}
						</div>
					{{/if}}

					<div class="dt-extract-controls">
						<label
							class="dt-extract-source"
							title={{this.sourceTitle}}
						>
							<input
								type="file"
								accept="image/*"
								class="dt-sr-only"
								{{on
									"change"
									this.handleFileSelect
								}}
							/>
							<img
								src={{this.imageUrl}}
								alt="Source"
							/>
						</label>

						<Select
							@value={{this.strategy}}
							@onValueChange={{this.chooseStrategy}}
						>
							<SelectTrigger
								class="dt-extract-strategy"
							>
								<SelectValue
								>{{this.strategyInfo.name}}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{{#each
									this.strategies
									key="key"
									as |option|
								}}
									<SelectItem
										@value={{option.key}}
									>{{option.name}}</SelectItem>
								{{/each}}
							</SelectContent>
						</Select>

						<button
							type="button"
							class="dt-extract-run"
							disabled={{this.extracting}}
							title="Re-extract with new seeds (Space)"
							{{on
								"click"
								this.extract
							}}
						>
							<Icon @name="shuffle" />
							Re-extract
						</button>

						<div class="dt-extract-count">
							<button
								type="button"
								aria-label="Fewer colours"
								title="Fewer colours"
								disabled={{this.atMin}}
								{{on
									"click"
									this.fewer
								}}
							>
								<Icon
									@name="minus"
								/>
							</button>
							<span
							>{{this.count}}</span>
							<button
								type="button"
								aria-label="More colours"
								title="More colours"
								disabled={{this.atMax}}
								{{on
									"click"
									this.more
								}}
							>
								<Icon
									@name="plus"
								/>
							</button>
						</div>
					</div>

					<p class="dt-extract-desc">
						<span
							class="dt-extract-desc-name"
						>{{this.strategyInfo.name}}</span>
						—
						{{this.strategyInfo.description}}
					</p>

					{{#if this.rows}}
						<div class="dt-extract-export">
							<span
								class="dt-extract-label"
							>Export</span>
							<div
								class="segmented dt-extract-export-grid"
							>
								<button
									type="button"
									{{on
										"click"
										this.copyAll
									}}
								>
									<Icon
										@name={{if
											(eq
												this.copied
												"all"
											)
											"check"
											"copy"
										}}
									/>
									Copy All
								</button>
								<button
									type="button"
									{{on
										"click"
										this.copyCss
									}}
								>
									<Icon
										@name={{if
											(eq
												this.copied
												"css"
											)
											"check"
											"copy"
										}}
									/>
									CSS
									Variables
								</button>
								<LinkTo
									@route="tools.tool"
									@model="palette-genny"
									@query={{hash
										colors=this.gennyColours
									}}
								>
									<Icon
										@name="palette"
									/>
									Open in
									Palette
									Generator
									<Icon
										@name="external-link"
										class="dt-extract-out"
									/>
								</LinkTo>
							</div>
						</div>

						<div class="dt-extract-list">
							<span
								class="dt-extract-label"
							>Colours</span>
							<div
								class="dt-extract-rows"
							>
								{{#each
									this.rows
									key="index"
									as |row|
								}}
									<div
										class="dt-extract-row"
									>
										<span
											class="dt-extract-row-swatch"
											style={{row.fillStyle}}
											aria-hidden="true"
										></span>
										<div
											class="dt-extract-row-info"
										>
											<div
												class="dt-extract-row-head"
											>
												<span
													class="dt-extract-row-value"
												>{{row.value}}</span>
												<span
													class="dt-extract-row-name"
												>{{row.name}}</span>
											</div>
											<div
												class="dt-extract-row-share"
											>{{row.share}}%
												of
												image</div>
										</div>
										<button
											type="button"
											class="dt-icon-btn"
											title="Copy colour"
											aria-label="Copy
												{{row.value}}"
											{{on
												"click"
												(fn
													this.copyValue
													row.value
													row.copyKey
												)
											}}
										>
											<Icon
												@name={{if
													(eq
														this.copied
														row.copyKey
													)
													"check"
													"copy"
												}}
											/>
										</button>
										<LinkTo
											@route="tools.tool"
											@model="tailwind-shades"
											@query={{hash
												color=row.hex
											}}
											class="dt-icon-btn"
											title="Generate Tailwind shades"
										>
											<Icon
												@name="wind"
											/>
										</LinkTo>
									</div>
								{{/each}}
							</div>
						</div>

						<p class="dt-extract-hint">
							Press
							<kbd>Space</kbd>
							to re-extract with new
							seeds
						</p>
					{{/if}}
				</div>
			{{else}}
				<div class="dt-extract-frame">
					<label
						class="dt-extract-drop"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
					>
						<input
							type="file"
							accept="image/*"
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-extract-drop-title"
						>Drop an image here</span>
						<span
							class="dt-extract-drop-hint"
						>or click to select a file, or
							paste</span>
					</label>
				</div>
			{{/if}}
		</div>
	</template>
}
