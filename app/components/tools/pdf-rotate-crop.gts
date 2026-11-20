import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { array, fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import { IconSvg } from 'delphitools-v2/components/icon';
import Fresh from 'delphitools-v2/components/substrata/panels/inspector/fresh';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import { paperSizeFor } from 'delphitools-v2/lib/paper-sizes';
import PaperPopover from 'delphitools-v2/components/tools/paper-sizes/popover';
import { normaliseRotation } from 'delphitools-v2/lib/pdf-pages';
import {
	cropFromInsets,
	cropToPaper,
	displaySize,
	insetsOf,
	intersectBox,
	toDisplay,
	toPage,
	type CropBox,
	type Insets,
	type Size,
} from 'delphitools-v2/lib/pdf-crop';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { open, thumbnails } from 'delphitools-v2/lib/pdfjs';
import { integral } from 'delphitools-v2/lib/crop-rect';
import Picture from 'delphitools-v2/components/tools/pdf-rotate-crop/picture';
import Pager from 'delphitools-v2/components/tools/media/pager';
import {
	geometry,
	picture,
	samplePdf,
	type Edit,
	type Geometry,
} from 'delphitools-v2/components/tools/pdf-rotate-crop/pages';
import './media/media.css';
import './pdf-rotate-crop/pdf-rotate-crop.css';

const ACCEPT = '.pdf,application/pdf';
const A4_ASPECT = 210 / 297;
type Edge = keyof Insets;
const EDGES: { edge: Edge; title: string }[] = [
	{ edge: 'left', title: 'Left' },
	{ edge: 'top', title: 'Top' },
	{ edge: 'right', title: 'Right' },
	{ edge: 'bottom', title: 'Bottom' },
];

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Left = <template><IconSvg @name="rotate-ccw" /></template>;
const Right = <template><IconSvg @name="rotate-cw" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Cross = <template><IconSvg @name="x" /></template>;
const Crop = <template><IconSvg @name="crop" /></template>;

const query = () => new URLSearchParams(window.location.search);

const sameSize = (a: Size, b: Size) =>
	Math.abs(a.width - b.width) < 0.5 &&
	Math.abs(a.height - b.height) < 0.5;

const sameRect = (a: CropBox, b: CropBox) => {
	const p = integral(a);
	const q = integral(b);
	return (
		p.x === q.x &&
		p.y === q.y &&
		p.width === q.width &&
		p.height === q.height
	);
};

interface Exported {
	blob: Blob;
	name: string;
}

export default class PdfRotateCrop extends Component {
	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked file: File | null = null;
	@tracked unreadable = false;
	@tracked geometry: Geometry[] = [];
	@tracked edits: Edit[] = [];
	@tracked page = 0;
	@tracked papers: Record<number, string> = {};
	@tracked thumbs: string[] = [];
	@tracked picture: {
		url: string;
		page: number;
		rotation: number;
	} | null = null;
	@tracked live: CropBox | null = null;
	@tracked refused = 0;
	@tracked busy = false;
	@tracked failed = false;
	@tracked exported: Exported | null = null;

	#bytes: ArrayBuffer | null = null;
	#pdf?: PDFDocumentProxy;
	#token = 0;
	#run = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		if (query().has('rcSample'))
			void samplePdf().then((file) => this.load(file));
	}

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#close();
	}

	get loaded() {
		return this.edits.length > 0;
	}

	get detail() {
		const { file } = this;
		if (!file) return '';
		if (this.unreadable) return `Could not read ${file.name}`;
		const n = this.edits.length;
		if (!n) return ' ';
		return `${n === 1 ? '1 page' : `${n} pages`} · ${formatBytes(file.size)}`;
	}

	get baseName() {
		return (
			(this.file?.name ?? '').replace(/\.pdf$/i, '') ||
			'document'
		);
	}

	totalRotation(index: number) {
		return normaliseRotation(
			this.geometry[index]!.rotation +
				this.edits[index]!.rotation,
		);
	}

	displaySize(index: number): Size {
		return displaySize(
			this.geometry[index]!.box,
			this.totalRotation(index),
		);
	}

	cropRect(index: number): CropBox {
		const size = this.displaySize(index);
		const whole = { x: 0, y: 0, ...size };
		const crop = this.edits[index]!.crop;
		if (!crop) return whole;
		const shown = toDisplay(
			crop,
			this.geometry[index]!.box,
			this.totalRotation(index),
		);
		return intersectBox(shown, whole) ?? whole;
	}

	get size(): Size | undefined {
		return this.loaded ? this.displaySize(this.page) : undefined;
	}

	get crop(): CropBox {
		if (this.live) return this.live;
		if (this.loaded) return this.cropRect(this.page);
		return { x: 0, y: 0, width: 595.28, height: 841.89 };
	}

	get aspect() {
		const { size } = this;
		return size
			? Math.max(0.2, size.width / Math.max(size.height, 1))
			: A4_ASPECT;
	}

	get pictureUrl() {
		const shown = this.picture;
		return shown &&
			shown.page === this.page &&
			shown.rotation === this.edits[this.page]?.rotation
			? shown.url || undefined
			: undefined;
	}

	get pages(): CanonPage[] {
		return this.edits.map((edit, index) => {
			const full = this.displaySize(index);
			const rect = this.cropRect(index);
			return {
				size: {
					width: rect.width,
					height: rect.height,
				},
				placement: {
					x: -rect.x,
					y: rect.y + rect.height - full.height,
					width: full.width,
					height: full.height,
				},
				picture: this.thumbs[index] || undefined,
				name: edit.crop ? 'Cropped' : undefined,
				turn: edit.rotation,
			};
		});
	}

	get margins() {
		const insets = this.loaded
			? insetsOf(this.crop, this.displaySize(this.page))
			: undefined;
		const size = this.size;
		const max = size
			? Math.max(size.width, size.height) / MM_TO_POINTS
			: 0;
		return EDGES.map(({ edge, title }) => ({
			edge,
			title,
			value: insets ? insets[edge] / MM_TO_POINTS : 0,
			max,
		}));
	}

	get paperId() {
		return this.papers[this.page];
	}

	get noFile() {
		return !this.loaded;
	}

	get uncropped() {
		return !this.edits[this.page]?.crop;
	}

	get resultRow() {
		const { exported } = this;
		return exported
			? {
					name: exported.name,
					detail: formatBytes(exported.blob.size),
				}
			: null;
	}

	#changed() {
		this.exported = null;
		this.failed = false;
		this.#renderPicture();
	}

	setCrop(rect: CropBox | null, index = this.page, keepsPaper = false) {
		if (!this.edits[index]) return;
		if (!keepsPaper) this.#paper(index, undefined);
		const size = this.displaySize(index);
		const whole = { x: 0, y: 0, ...size };
		const crop =
			rect &&
			rect.width >= 4 &&
			rect.height >= 4 &&
			!sameRect(rect, whole)
				? toPage(
						rect,
						this.geometry[index]!.box,
						this.totalRotation(index),
					)
				: null;
		this.#edit(index, { ...this.edits[index], crop });
		this.#changed();
	}

	#edit(index: number, edit: Edit) {
		const edits = [...this.edits];
		edits[index] = edit;
		this.edits = edits;
	}

	#paper(index: number, id: string | undefined) {
		if (this.papers[index] === id) return;
		const papers = { ...this.papers };
		if (id) papers[index] = id;
		else delete papers[index];
		this.papers = papers;
	}

	rotate = (delta: number, all: boolean) => {
		this.edits = this.edits.map((edit, index) =>
			all || index === this.page
				? {
						...edit,
						rotation: normaliseRotation(
							edit.rotation + delta,
						),
					}
				: edit,
		);
		this.#changed();
	};

	dragged = (rect: CropBox) => {
		this.live = rect;
	};

	settled = () => {
		const rect = this.live;
		if (!rect) return;
		this.live = null;
		const before = this.cropRect(this.page);
		this.setCrop(
			rect,
			this.page,
			sameSize(rect, {
				width: before.width,
				height: before.height,
			}),
		);
	};

	setMargin = (edge: Edge, value: number) => {
		if (!this.loaded) return;
		const size = this.displaySize(this.page);
		const insets = insetsOf(this.cropRect(this.page), size);
		insets[edge] = value * MM_TO_POINTS;
		const rect = cropFromInsets(size, insets);
		if (!rect) {
			this.refused++;
			return;
		}
		this.setCrop(rect);
	};

	#paperCrop(index: number, id: string) {
		const paper = paperSizeFor(id);
		if (!paper) return undefined;
		const size = this.displaySize(index);
		const width = paper.widthMm * MM_TO_POINTS;
		const height = paper.heightMm * MM_TO_POINTS;
		const turned = size.width > size.height && width < height;
		const target = cropToPaper(
			size,
			turned
				? { width: height, height: width }
				: { width, height },
		);
		return intersectBox(target, { x: 0, y: 0, ...size });
	}

	pickPaper = (id: string) => {
		if (!this.loaded) return;
		const rect = this.#paperCrop(this.page, id);
		if (rect === undefined) return;
		this.setCrop(rect, this.page, true);
		this.#paper(this.page, id);
	};

	cropAll = () => {
		if (!this.loaded) return;
		const { page } = this;
		const size = this.displaySize(page);
		const rect = this.cropRect(page);
		const paper = this.papers[page];
		const edits = [...this.edits];
		const papers = { ...this.papers };
		edits.forEach((edit, index) => {
			if (index === page) return;
			const target = this.displaySize(index);
			const whole = { x: 0, y: 0, ...target };
			const scaled = paper
				? (this.#paperCrop(index, paper) ?? whole)
				: {
						x:
							(rect.x / size.width) *
							target.width,
						y:
							(rect.y / size.height) *
							target.height,
						width:
							(rect.width /
								size.width) *
							target.width,
						height:
							(rect.height /
								size.height) *
							target.height,
					};
			if (paper) papers[index] = paper;
			else delete papers[index];
			edits[index] = {
				...edit,
				crop: sameRect(scaled, whole)
					? null
					: toPage(
							scaled,
							this.geometry[index]!
								.box,
							this.totalRotation(
								index,
							),
						),
			};
		});
		this.edits = edits;
		this.papers = papers;
		this.#changed();
	};

	clearCrop = () => this.setCrop(null);

	select = (index: number) => {
		if (!this.edits[index] || index === this.page) return;
		this.live = null;
		this.page = index;
		this.#renderPicture();
	};

	step = (delta: number) => this.select(this.page + delta);

	load = (file: File) => {
		if (
			file.type !== 'application/pdf' &&
			!/\.pdf$/i.test(file.name)
		)
			return;
		void this.#load(file);
	};

	async #load(file: File) {
		this.clear();
		const token = this.#token;
		this.file = file;
		try {
			const bytes = await file.arrayBuffer();
			if (token !== this.#token) return;
			const pdf = await open(bytes);
			if (token !== this.#token) return void pdf.destroy();
			const found = await geometry(pdf);
			if (token !== this.#token) return void pdf.destroy();
			this.#bytes = bytes;
			this.#pdf = pdf;
			this.geometry = found;
			this.edits = found.map(() => ({
				rotation: 0,
				crop: null,
			}));
			this.#launch();
			this.#changed();
			await thumbnails(
				pdf,
				() => token === this.#token,
				(index, url) => {
					const thumbs = [...this.thumbs];
					thumbs[index] = url;
					this.thumbs = thumbs;
				},
			);
		} catch {
			if (token === this.#token) this.unreadable = true;
		}
	}

	#launch() {
		const flags = query();
		const turn = Number(flags.get('rcRotate') ?? NaN);
		if (this.edits[turn])
			this.#edit(turn, { ...this.edits[turn], rotation: 90 });
		const inset = Number(flags.get('rcCrop') ?? NaN);
		if (inset >= 0) {
			const size = this.displaySize(0);
			this.setCrop(
				{
					x: inset,
					y: inset * 1.4,
					width: size.width - inset * 2,
					height: size.height - inset * 2.8,
				},
				0,
			);
		}
		const paper = paperSizeFor(flags.get('rcPaper') ?? '')?.id;
		if (paper) {
			this.pickPaper(paper);
			if (flags.get('rcNudge') === 'yes')
				this.setMargin(
					'left',
					this.margins[0]!.value + 1,
				);
		}
	}

	#renderPicture() {
		const pdf = this.#pdf;
		const { page } = this;
		const edit = this.edits[page];
		if (!pdf || !edit) return;
		const shown = this.picture;
		if (
			shown &&
			shown.page === page &&
			shown.rotation === edit.rotation
		)
			return;
		const run = ++this.#run;
		const rotation = edit.rotation;
		void picture(pdf, page, this.totalRotation(page)).then(
			(url) => {
				if (run !== this.#run || this.isDestroyed) {
					if (url) URL.revokeObjectURL(url);
					return;
				}
				if (this.picture?.url)
					URL.revokeObjectURL(this.picture.url);
				this.picture = { url, page, rotation };
			},
		);
	}

	export = () => void this.#export();

	async #export() {
		const bytes = this.#bytes;
		if (!bytes || this.busy) return;
		const edits = this.edits;
		const token = this.#token;
		this.busy = true;
		this.failed = false;
		try {
			const { PDFDocument, degrees } =
				await import('pdf-lib');
			const doc = await PDFDocument.load(bytes, {
				ignoreEncryption: true,
			});
			doc.getPages().forEach((page, index) => {
				const edit = edits[index];
				if (!edit) return;
				if (edit.rotation)
					page.setRotation(
						degrees(
							normaliseRotation(
								page.getRotation()
									.angle +
									edit.rotation,
							),
						),
					);
				const box =
					edit.crop &&
					intersectBox(
						edit.crop,
						page.getCropBox(),
					);
				if (box)
					page.setCropBox(
						box.x,
						box.y,
						box.width,
						box.height,
					);
			});
			const saved = await doc.save();
			if (token !== this.#token || edits !== this.edits)
				return;
			this.exported = {
				blob: new Blob([new Uint8Array(saved)], {
					type: 'application/pdf',
				}),
				name: `${this.baseName}-rotate-crop.pdf`,
			};
		} catch {
			if (token === this.#token) this.failed = true;
		} finally {
			if (token === this.#token) this.busy = false;
		}
	}

	save = () => {
		if (this.exported)
			downloadBlob(this.exported.blob, this.exported.name);
	};

	clear = () => {
		this.#token++;
		this.#run++;
		this.#close();
		this.file = null;
		this.unreadable = false;
		this.#bytes = null;
		this.geometry = [];
		this.edits = [];
		this.page = 0;
		this.papers = {};
		this.live = null;
		this.busy = false;
		this.failed = false;
		this.exported = null;
	};

	#close() {
		for (const url of this.thumbs)
			if (url) URL.revokeObjectURL(url);
		if (this.picture?.url) URL.revokeObjectURL(this.picture.url);
		this.thumbs = [];
		this.picture = null;
		void this.#pdf?.destroy();
		this.#pdf = undefined;
	}

	<template>
		<CanonSplit
			class="pdf-rotate-crop"
			@mainLeadsStacked={{this.loaded}}
			{{filePaste this.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@height={{pageStripHeight}}
					@background="var(--canon-muted)"
				>
					{{#if this.loaded}}
						<CanonPageStrip
							@pages={{this.pages}}
							@selected={{this.page}}
							@onSelect={{this.select}}
						/>
					{{else}}
						<CanonPageStrip
							class="prc-blank-strip"
							@pages={{(array)}}
							@blank={{true}}
						/>
					{{/if}}
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.file}}
						<CanonRow
							class="prc-source
								{{if
									this.unreadable
									'prc-source--failed'
								}}"
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
						<Slot
							class="prc-slot"
							@prompt="Drop PDF here"
							@icon="file-text"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.load}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}} class="prc-rotate">
					<CanonHeading @text="Rotate" />
					<CanonRow
						class="prc-rotate-page"
						@title="This page"
						@form="flush"
					>
						<CanonGrid>
							<CanonButton
								@kind="cell"
								@icon={{Left}}
								@label="Rotate left"
								@disabled={{this.noFile}}
								@onClick={{fn
									this.rotate
									-90
									false
								}}
							/>
							<CanonButton
								@kind="cell"
								@icon={{Right}}
								@label="Rotate right"
								@disabled={{this.noFile}}
								@onClick={{fn
									this.rotate
									90
									false
								}}
							/>
						</CanonGrid>
					</CanonRow>
					<CanonRow
						class="prc-rotate-all"
						@title="All pages"
						@form="flush"
					>
						<CanonGrid>
							<CanonButton
								@kind="cell"
								@icon={{Left}}
								@label="Rotate left"
								@disabled={{this.noFile}}
								@onClick={{fn
									this.rotate
									-90
									true
								}}
							/>
							<CanonButton
								@kind="cell"
								@icon={{Right}}
								@label="Rotate right"
								@disabled={{this.noFile}}
								@onClick={{fn
									this.rotate
									90
									true
								}}
							/>
						</CanonGrid>
					</CanonRow>
				</CanonRows>
				<CanonRows @framed={{true}} class="prc-margins">
					<CanonHeading
						@text="Crop margins (mm)"
					/>
					<Fresh @value={{this.refused}}>
						{{#each
							this.margins
							as |margin|
						}}
							<CanonRow
								class="prc-margin prc-margin--{{margin.edge}}"
								@title={{margin.title}}
								@form="flush"
								as |titleId|
							>
								<CanonDecimalField
									@value={{margin.value}}
									@max={{margin.max}}
									@unit="mm"
									@step={{1}}
									@decimals={{1}}
									@labelledBy={{titleId}}
									@disabled={{this.noFile}}
									@onChange={{fn
										this.setMargin
										margin.edge
									}}
								/>
							</CanonRow>
						{{/each}}
					</Fresh>
					<CanonRow
						class="prc-paper"
						@title="Crop to size"
						@form="flush"
						as |titleId|
					>
						<PaperPopover
							class="prc-paper-menu"
							@value={{this.paperId}}
							@placeholder="None"
							@labelledBy={{titleId}}
							@disabled={{this.noFile}}
							@onPick={{this.pickPaper}}
						/>
					</CanonRow>
					<CanonGrid class="prc-crop-actions">
						<CanonButton
							class="prc-crop-all"
							@text="All pages"
							@icon={{Copy}}
							@disabled={{this.noFile}}
							@onClick={{this.cropAll}}
						/>
						<CanonButton
							class="prc-crop-clear"
							@text="Clear"
							@icon={{Cross}}
							@disabled={{this.uncropped}}
							@onClick={{this.clearCrop}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<Job
						@title="Export PDF"
						@icon={{Crop}}
						@failure="Save failed"
						@disabled={{this.noFile}}
						@busy={{this.busy}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.export}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonCanvas
					class="prc-canvas"
					@aspect={{this.aspect}}
					@maxHeight={{640}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
				>
					<Picture
						@url={{this.pictureUrl}}
						@size={{this.size}}
						@crop={{this.crop}}
						@onCrop={{this.dragged}}
						@onSettle={{this.settled}}
					/>
				</CanonCanvas>
				<Pager
					@page={{this.page}}
					@count={{this.edits.length}}
					@onStep={{this.step}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
