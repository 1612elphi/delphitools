import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonAspectPopover from 'delphicanon/components/canon-aspect-popover';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { stem } from 'delphicanon/lib/files';
import { springEasing } from 'delphicanon/lib/motion';
import { IconSvg } from 'delphitools-v2/components/icon';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	ASPECTS,
	fitAspect,
	insetQuad,
	outputSize,
	warp,
	type Quad,
} from 'delphitools-v2/lib/deskew';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import Board from 'delphitools-v2/components/tools/image-deskewer/board';
import Result from 'delphitools-v2/components/tools/image-deskewer/result';
import {
	capped,
	isConvex,
	toRatio,
} from 'delphitools-v2/components/tools/image-deskewer/geometry';
import './image-deskewer/image-deskewer.css';

const accept = 'image/*';
const unreadable = "That file can't be read as an image";
const crossed = "Don't let the streams cross!";
const resultAspect = 4 / 3;
const spring = htmlSafe(`--deskew-spring: ${springEasing(0.82)}`);
const custom = ASPECTS.length;
const aspectNames = [...ASPECTS.map(({ label }) => label), 'Custom'];
const previewEdge = { resting: 1024, dragging: 720 };

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Upload = <template><IconSvg @name="upload" /></template>;
const Undo = <template><IconSvg @name="rotate-ccw" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface Source {
	canvas: HTMLCanvasElement;
	data: ImageData;
	stem: string;
}

const nextFrame = () =>
	new Promise((resolve) => requestAnimationFrame(resolve));

export default class ImageDeskewer extends Component {
	@tracked source?: Source;
	@tracked quad: Quad = insetQuad(1, 1);
	@tracked aspect = 0;
	@tracked ratio = { width: 4, height: 5 };
	@tracked failed = false;
	@tracked exporting = false;
	@tracked dragging = false;
	@tracked drawn = false;
	@tracked stamp = 0;
	@tracked held?: number;

	drop = new Drop(accept, (file) => void this.load(file));
	preview = document.createElement('canvas');
	#input?: HTMLInputElement;
	#loading = 0;
	#frame = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const aspect = Number(query.get('deskewAspect'));
		if (aspect)
			this.aspect = Math.min(
				Math.max(Math.round(aspect), 0),
				custom,
			);
		const [rw, rh] = (query.get('deskewRatio') ?? '')
			.split(':')
			.map(Number);
		if (rw! >= 1 && rh! >= 1) {
			this.ratio = { width: rw!, height: rh! };
			this.aspect = custom;
		}
		const corners = (query.get('deskewCorners') ?? '')
			.split(';')
			.map((pair) => pair.split(',').map(Number))
			.filter(
				(pair) =>
					pair.length === 2 &&
					pair.every(Number.isFinite),
			);
		const grab = query.get('deskewGrab');
		if (query.has('deskewSample'))
			void drawnSample()
				.then((file) => this.load(file))
				.then(() => {
					const { source } = this;
					if (!source) return;
					const { width, height } = source.canvas;
					if (corners.length === 4) {
						this.quad = corners.map(
							([x, y]) => ({
								x: x! * width,
								y: y! * height,
							}),
						) as Quad;
						this.#changed();
					}
					if (grab !== null)
						this.held = Math.min(
							Math.max(
								Number(grab) ||
									0,
								0,
							),
							3,
						);
				});
		registerDestructor(this, () =>
			cancelAnimationFrame(this.#frame),
		);
	}

	get valid() {
		return isConvex(this.quad);
	}

	get custom() {
		return this.aspect === custom;
	}

	get output() {
		const size = outputSize(this.quad);
		const { width, height } = this.ratio;
		return capped(
			this.custom
				? toRatio(size, width, height)
				: fitAspect(size, ASPECTS[this.aspect]!.ratio),
		);
	}

	get pixelsText() {
		const { source } = this;
		return source
			? `${source.canvas.width} × ${source.canvas.height}`
			: '';
	}

	get exportDisabled() {
		return !this.source || !this.valid || this.exporting;
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
		const run = ++this.#loading;
		let source: Source;
		try {
			const bitmap = await decodeImage(file);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const context = canvas.getContext('2d', {
				willReadFrequently: true,
			})!;
			context.drawImage(bitmap, 0, 0);
			bitmap.close();
			source = {
				canvas,
				data: context.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				),
				stem: stem(file.name) || 'image',
			};
		} catch {
			if (run !== this.#loading || isDestroying(this)) return;
			this.failed = true;
			return;
		}
		if (run !== this.#loading || isDestroying(this)) return;
		this.source = source;
		this.failed = false;
		this.held = undefined;
		this.drawn = false;
		this.quad = insetQuad(
			source.canvas.width,
			source.canvas.height,
		);
		this.#changed();
	};

	clear = () => {
		this.#loading++;
		cancelAnimationFrame(this.#frame);
		this.source = undefined;
		this.failed = false;
		this.held = undefined;
		this.drawn = false;
	};

	reset = () => {
		const { source } = this;
		if (!source) return;
		this.quad = insetQuad(
			source.canvas.width,
			source.canvas.height,
		);
		this.#changed();
	};

	pickAspect = (index: number) => {
		this.aspect = index;
		this.#changed();
	};

	setRatio = (width: number, height: number) => {
		this.ratio = { width, height };
		this.aspect = custom;
		this.#changed();
	};

	setQuad = (quad: Quad) => {
		this.quad = quad;
		this.held = undefined;
		this.dragging = true;
		this.#changed();
	};

	settle = () => {
		this.dragging = false;
		this.#changed();
	};

	#changed() {
		this.stamp++;
		cancelAnimationFrame(this.#frame);
		this.#frame = requestAnimationFrame(() => this.#draw());
	}

	#draw() {
		const { source, quad } = this;
		if (!source || !this.valid) return;
		const edge = this.dragging
			? previewEdge.dragging
			: previewEdge.resting;
		const { width, height } = capped(this.output, edge);
		const image = warp(source.data, quad, width, height);
		const { preview } = this;
		preview.width = width;
		preview.height = height;
		preview.getContext('2d')?.putImageData(image, 0, 0);
		this.drawn = true;
	}

	export = async () => {
		const { source } = this;
		if (this.exportDisabled || !source) return;
		this.exporting = true;
		try {
			await nextFrame();
			const { width, height } = this.output;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			canvas.getContext('2d')?.putImageData(
				warp(source.data, this.quad, width, height),
				0,
				0,
			);
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/png'),
			);
			if (blob)
				downloadBlob(
					blob,
					`${source.stem}-deskewed.png`,
				);
		} finally {
			this.exporting = false;
		}
	};

	get springs() {
		return !this.dragging;
	}

	get resetDisabled() {
		return !this.source;
	}

	get showsCrossed() {
		return !!this.source && !this.valid;
	}

	get boardAspect() {
		const { source } = this;
		if (!source) return 4 / 3;
		const { width, height } = source.canvas;
		return Math.min(Math.max(width / Math.max(height, 1), 0.6), 2);
	}

	<template>
		<CanonSplit
			class="image-deskewer"
			@halves={{true}}
			@collapsesTo={{240}}
			style={{spring}}
			{{filePaste this.load accept=accept}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.boardAspect}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Board
						@canvas={{this.source.canvas}}
						@quad={{this.quad}}
						@valid={{this.valid}}
						@over={{this.drop.over}}
						@held={{this.held}}
						@onChoose={{this.choose}}
						@onMove={{this.setQuad}}
						@onSettle={{this.settle}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="deskew-source"
							@title={{this.source.stem}}
							@detail={{this.pixelsText}}
							@form="flush"
						>
							<CanonButton
								class="deskew-open"
								@kind="cell"
								@icon={{Upload}}
								@label="Open file"
								@onClick={{this.choose}}
							/>
							<CanonButton
								class="deskew-clear"
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					</CanonRows>
					<CanonCanvas
						class="deskew-result-canvas"
						@aspect={{resultAspect}}
						@boxing="unlessWide"
						@maxHeight={{460}}
						@background="var(--canon-muted)"
					>
						<Result
							@canvas={{this.preview}}
							@size={{this.output}}
							@valid={{this.valid}}
							@drawn={{this.drawn}}
							@stamp={{this.stamp}}
							@springs={{this.springs}}
						/>
					</CanonCanvas>
				{{else if this.failed}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							class="deskew-unreadable"
							@text={{unreadable}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Aspect" />
					<CanonSegmented
						class="deskew-aspects"
						@items={{aspectNames}}
						@columns={{4}}
						@selected={{this.aspect}}
						@onChange={{this.pickAspect}}
					/>
					{{#if this.custom}}
						<CanonRow
							class="deskew-ratio"
							@title="Ratio"
							@form="flush"
							as |titleId|
						>
							<CanonAspectPopover
								@width={{this.ratio.width}}
								@height={{this.ratio.height}}
								@labelledBy={{titleId}}
								@onChange={{this.setRatio}}
							/>
						</CanonRow>
					{{/if}}
					<CanonRow
						@title="Corners"
						@form="flush"
					>
						<CanonButton
							class="deskew-reset"
							@kind="cell"
							@text="Reset"
							@icon={{Undo}}
							@disabled={{this.resetDisabled}}
							@onClick={{this.reset}}
						/>
					</CanonRow>
					{{#if this.showsCrossed}}
						<CanonStatus
							class="deskew-crossed"
							@text={{crossed}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonButton
						class="deskew-export"
						@kind="primary"
						@text={{passAlong
							"Download PNG"
						}}
						@icon={{Save}}
						@iconStyle="oversized"
						@disabled={{this.exportDisabled}}
						@onClick={{this.export}}
					/>
					{{#if this.exporting}}
						<CanonRow @title="Processing…">
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
