import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { array } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
} from 'delphicanon/components/canon-page-strip';
import CanonPopover from 'delphicanon/components/canon-popover';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonGrid from 'delphicanon/components/canon-grid';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/pdf-compress';
import {
	ANCHORS,
	resolvePageNumbers,
	type Anchor,
} from 'delphitools-v2/lib/pdf-stamp';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	open,
	pageUrl,
	sizes,
	thumbnails,
	type PageSize,
} from 'delphitools-v2/lib/pdfjs';
import { AnchorPicker } from 'delphitools-v2/components/tools/media/anchors';
import Pager from 'delphitools-v2/components/tools/media/pager';
import Picture from 'delphitools-v2/components/tools/pdf-page-numberer/picture';
import {
	STYLES,
	byStart,
	clampStart,
	fitSections,
	parseSections,
	section,
	sectionAt,
	sectionLabels,
	splitAt,
	type Section,
} from 'delphitools-v2/components/tools/pdf-page-numberer/sections';
import {
	FONTS,
	MODES,
	numberLines,
	stampOf,
	stampPdf,
	type FontFamily,
	type StampMode,
	type StampOptions,
} from 'delphitools-v2/components/tools/pdf-page-numberer/stamp';
import './media/media.css';
import './pdf-page-numberer/pdf-page-numberer.css';

const ACCEPT = '.pdf,application/pdf';
const previewEdge = 1200;
const styleLabels = STYLES.map((s) => s.label);
const fontLabels = ['Sans', 'Serif', 'Mono'];
const modeLabels = ['Label', 'Watermark'];
const FORMAT_TIP = [
	'{n} stands for the page number, {N} the page count.',
	'Page {n} of {N} prints Page 3 of 12.',
];
const points = (value: number) => `${Math.round(value)} pt`;
const percent = (value: number) => `${Math.round(value)}%`;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Info = <template><IconSvg @name="info" /></template>;
const Plus = <template><IconSvg @name="plus" /></template>;
const Minus = <template><IconSvg @name="minus" /></template>;
const Hash = <template><IconSvg @name="hash" /></template>;

interface Stamped {
	blob: Blob;
	name: string;
	size: number;
}

async function drawnSample(count: number) {
	const { PDFDocument, StandardFonts } = await import('pdf-lib');
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let n = 1; n <= count; n++) {
		const page = doc.addPage([595.28, 841.89]);
		page.drawText(`Body ${n}`, { x: 72, y: 770, size: 24, font });
	}
	const bytes = await doc.save();
	return new File([new Uint8Array(bytes)], 'sample.pdf', {
		type: 'application/pdf',
	});
}

export default class PdfPageNumberer extends Component {
	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked file: File | null = null;
	@tracked sizes: PageSize[] = [];
	@tracked thumbs: string[] = [];
	@tracked page = 0;
	@tracked picture = '';
	@tracked unreadable = false;

	@tracked numbersOn = true;
	@tracked template = '{n} / {N}';
	@tracked numberAnchor: Anchor = 'bottom-center';
	@tracked font: FontFamily = 'sans';
	@tracked fontSize = 11;
	@tracked margin = 24;
	@tracked stampOn = false;
	@tracked stampText = '';
	@tracked stampAnchor: Anchor = 'top-right';
	@tracked stampMode: StampMode = 'label';
	@tracked opacity = 15;
	@tracked sections: Section[] = [section()];
	@tracked sectionId = this.sections[0]!.id;

	@tracked busy = false;
	@tracked failed = false;
	@tracked stamped: Stamped | null = null;

	#bytes: ArrayBuffer | null = null;
	#pdf?: PDFDocumentProxy;
	#token = 0;
	#job = 0;
	#shown = 0;
	#queued?: Section[];

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const stamp = query.get('ppnStamp');
		if (stamp) {
			this.stampOn = true;
			this.stampText = stamp;
			this.stampMode = 'watermark';
		}
		const spec = query.get('ppnSections');
		if (spec) this.#queued = parseSections(spec);
		const sample = Number(query.get('ppnSample') ?? NaN);
		if (sample > 0)
			void drawnSample(Math.min(sample, 99)).then(this.load);
	}

	willDestroy() {
		super.willDestroy();
		this.#close();
	}

	get options(): StampOptions {
		return {
			numbersOn: this.numbersOn,
			template: this.template,
			numberAnchor: this.numberAnchor,
			font: this.font,
			fontSize: this.fontSize,
			margin: this.margin,
			stampOn: this.stampOn,
			stampText: this.stampText,
			stampAnchor: this.stampAnchor,
			stampMode: this.stampMode,
			opacity: this.opacity / 100,
			sections: this.sections,
		};
	}

	get count() {
		return this.sizes.length;
	}

	get loaded() {
		return this.count > 0;
	}

	get detail() {
		if (!this.file) return '';
		const parts = [formatBytes(this.file.size)];
		const n = this.count;
		if (n) parts.push(n === 1 ? '1 page' : `${n} pages`);
		return parts.join(' · ');
	}

	get labels() {
		return resolvePageNumbers(this.sections, this.count);
	}

	get strip(): CanonPage[] {
		const { labels, thumbs } = this;
		return this.sizes.map((size, index) => ({
			size,
			picture: thumbs[index] || undefined,
			name: labels[index] ?? undefined,
		}));
	}

	get size() {
		return this.sizes[this.page];
	}

	get aspect() {
		const size = this.size;
		return size
			? Math.max(0.2, size.width / Math.max(size.height, 1))
			: 210 / 297;
	}

	get number() {
		return this.loaded
			? (numberLines(this.options, this.count)[this.page] ??
					null)
			: null;
	}

	get stamp() {
		return this.loaded ? stampOf(this.options) : null;
	}

	get anchorIndex() {
		return ANCHORS.indexOf(this.numberAnchor);
	}

	get stampAnchorIndex() {
		return ANCHORS.indexOf(this.stampAnchor);
	}

	get fontIndex() {
		return FONTS.indexOf(this.font);
	}

	get modeIndex() {
		return MODES.indexOf(this.stampMode);
	}

	get isLabel() {
		return this.stampMode === 'label';
	}

	get ordered() {
		return byStart(this.sections);
	}

	get current() {
		return (
			this.sections.find((s) => s.id === this.sectionId) ??
			this.sections[0]!
		);
	}

	get currentKeys() {
		return [this.current.id];
	}

	get styleIndex() {
		return STYLES.findIndex((s) => s.id === this.current.style);
	}

	get sectionItems() {
		return sectionLabels(this.ordered, this.count);
	}

	get sectionIndex() {
		return this.ordered.indexOf(this.current);
	}

	selectSection = (index: number) => {
		const picked = this.ordered[index];
		if (picked) this.#select(picked.fromPage - 1);
	};

	get canRemove() {
		return this.sections.length > 1;
	}

	get resultRow() {
		const { stamped } = this;
		return stamped
			? {
					name: stamped.name,
					detail: formatBytes(stamped.size),
				}
			: null;
	}

	load = (file: File) => {
		if (
			file.type !== 'application/pdf' &&
			!/\.pdf$/i.test(file.name)
		)
			return;
		void this.#load(file);
	};

	async #load(file: File) {
		this.#reset();
		const token = this.#token;
		this.file = file;
		try {
			const bytes = await file.arrayBuffer();
			const pdf = await open(bytes);
			if (token !== this.#token) return void pdf.destroy();
			this.#bytes = bytes;
			this.#pdf = pdf;
			const found = await sizes(pdf);
			if (token !== this.#token) return;
			const queued = this.#queued;
			this.#queued = undefined;
			this.sections = fitSections(
				queued?.length ? queued : this.sections,
				found.length,
			);
			this.sizes = found;
			this.#select(0);
		} catch {
			if (token === this.#token) this.unreadable = true;
			return;
		}
		await thumbnails(
			this.#pdf,
			() => token === this.#token,
			(index, url) => {
				const thumbs = [...this.thumbs];
				thumbs[index] = url;
				this.thumbs = thumbs;
			},
		);
	}

	async #show() {
		const pdf = this.#pdf;
		if (!pdf) return;
		const shown = ++this.#shown;
		const url = await pageUrl(pdf, this.page, previewEdge);
		if (shown !== this.#shown) {
			if (url) URL.revokeObjectURL(url);
			return;
		}
		if (this.picture) URL.revokeObjectURL(this.picture);
		this.picture = url;
	}

	#select(index: number) {
		this.page = index;
		this.sectionId =
			sectionAt(this.sections, index + 1)?.id ??
			this.ordered[0]!.id;
		void this.#show();
	}

	selectPage = (index: number) => {
		if (index === this.page || index < 0 || index >= this.count)
			return;
		this.#select(index);
	};

	step = (delta: number) => this.selectPage(this.page + delta);

	#changed() {
		this.#job++;
		this.busy = false;
		this.stamped = null;
		this.failed = false;
	}

	#put = <K extends keyof this>(key: K, value: this[K]) => {
		this[key] = value;
		this.#changed();
	};

	setNumbersOn = (on: boolean) => this.#put('numbersOn', on);
	setTemplate = (text: string) => this.#put('template', text);
	pickAnchor = (index: number) =>
		this.#put('numberAnchor', ANCHORS[index]!);
	setStampOn = (on: boolean) => this.#put('stampOn', on);
	setStampText = (text: string) => this.#put('stampText', text);
	pickMode = (index: number) => this.#put('stampMode', MODES[index]!);
	pickStampAnchor = (index: number) =>
		this.#put('stampAnchor', ANCHORS[index]!);
	setOpacity = (value: number) => this.#put('opacity', value);
	pickFont = (index: number) => this.#put('font', FONTS[index]!);
	setFontSize = (value: number) => this.#put('fontSize', value);
	setMargin = (value: number) => this.#put('margin', value);

	#edit(change: Partial<Section>) {
		const id = this.current.id;
		this.sections = this.sections.map((s) =>
			s.id === id ? { ...s, ...change } : s,
		);
		this.#changed();
	}

	pickStyle = (index: number) => this.#edit({ style: STYLES[index]!.id });
	setStartAt = (value: number) => this.#edit({ startAt: value });

	setFrom = (value: number) => {
		const { ordered, current } = this;
		const start = clampStart(
			ordered,
			ordered.indexOf(current),
			value,
			this.count,
		);
		if (start !== current.fromPage) this.#edit({ fromPage: start });
	};

	addSection = () => {
		const added = splitAt(this.sections, this.page + 1, this.count);
		if (!added) return;
		this.sections = [...this.sections, added];
		this.#changed();
		this.#select(added.fromPage - 1);
	};

	removeSection = () => {
		if (!this.canRemove) return;
		const { ordered, current } = this;
		const index = ordered.indexOf(current);
		this.sections = this.sections.filter((s) => s !== current);
		this.sectionId = ordered[Math.max(0, index - 1)]!.id;
		if (this.sectionId === current.id)
			this.sectionId = ordered[1]!.id;
		this.#changed();
	};

	stampIt = () => void this.#stamp();

	async #stamp() {
		const bytes = this.#bytes;
		if (!bytes || this.busy || !this.file) return;
		const job = this.#job;
		const current = () => job === this.#job;
		this.busy = true;
		this.failed = false;
		try {
			const out = await stampPdf(
				bytes.slice(0),
				this.options,
			);
			if (!current()) return;
			const stem = this.file.name.replace(/\.pdf$/i, '');
			this.stamped = {
				blob: new Blob([new Uint8Array(out)], {
					type: 'application/pdf',
				}),
				name: `${stem}-numbered.pdf`,
				size: out.byteLength,
			};
		} catch {
			if (current()) this.failed = true;
		} finally {
			if (current()) this.busy = false;
		}
	}

	save = () => {
		if (this.stamped)
			downloadBlob(this.stamped.blob, this.stamped.name);
	};

	#reset() {
		this.#token++;
		this.#shown++;
		this.#close();
		this.#changed();
		this.busy = false;
		this.unreadable = false;
		this.file = null;
		this.#bytes = null;
		this.sizes = [];
		this.thumbs = [];
		this.page = 0;
	}

	clear = () => {
		this.#reset();
		this.sections = [section()];
		this.sectionId = this.sections[0]!.id;
	};

	#close() {
		for (const url of this.thumbs)
			if (url) URL.revokeObjectURL(url);
		if (this.picture) URL.revokeObjectURL(this.picture);
		this.picture = '';
		void this.#pdf?.destroy();
		this.#pdf = undefined;
	}

	<template>
		<CanonSplit
			class="pdf-page-numberer"
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
							class="ppn-strip"
							@pages={{this.strip}}
							@selected={{this.page}}
							@onSelect={{this.selectPage}}
						/>
					{{else}}
						<CanonPageStrip
							class="ppn-blank-strip"
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
							class="ppn-source"
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
							class="ppn-slot"
							@prompt="Drop PDF here"
							@icon="file-digit"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.load}}
						/>
					{{/if}}
					{{#if this.unreadable}}
						<CanonStatus
							class="ppn-unreadable"
							@text="Unreadable PDF"
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows class="ppn-numbers" @framed={{true}}>
					<CanonRow
						@title="Page numbers"
						as |titleId|
					>
						<CanonSwitch
							class="ppn-numbers-on"
							aria-labelledby={{titleId}}
							@on={{this.numbersOn}}
							@onChange={{this.setNumbersOn}}
						/>
					</CanonRow>
					{{#if this.numbersOn}}
						<CanonRow
							class="ppn-format"
							@title="Format"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								class="ppn-template"
								aria-labelledby={{titleId}}
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								@value={{this.template}}
								@placeholder="{n} / {N}"
								@onChange={{this.setTemplate}}
							/>
							<CanonPopover
								class="ppn-tip"
								@placement="bottom-end"
							>
								<:trigger
									as |p|
								>
									<CanonButton
										class="ppn-tip-open"
										@kind="cell"
										@label="Format"
										@icon={{Info}}
										{{p.trigger}}
									/>
								</:trigger>
								<:content>
									<CanonRows
										class="ppn-tip-panel"
										role="dialog"
										aria-label="Format"
										@framed={{true}}
									>
										<CanonHeading
											@text="Format"
										/>
										{{#each
											FORMAT_TIP
											as |line|
										}}
											<p
												class="ppn-tip-line"
											>{{line}}</p>
										{{/each}}
									</CanonRows>
								</:content>
							</CanonPopover>
						</CanonRow>
						<CanonHeading
							@text="Position"
						/>
						<AnchorPicker
							class="ppn-anchors"
							aria-label="Position"
							@selected={{this.anchorIndex}}
							@onChange={{this.pickAnchor}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows
					class="ppn-sections"
					@framed={{true}}
				>
					<CanonHeading @text="Sections" />
					<CanonSegmented
						class="ppn-section-list"
						aria-label="Sections"
						@items={{this.sectionItems}}
						@columns={{1}}
						@selected={{this.sectionIndex}}
						@disabled={{if
							this.loaded
							false
							true
						}}
						@onChange={{this.selectSection}}
					/>
					{{#each
						this.currentKeys key="@identity"
					}}
						<CanonRow
							class="ppn-from"
							@title="From page"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.current.fromPage}}
								@min={{1}}
								@max={{if
									this.count
									this.count
									1
								}}
								@labelledBy={{titleId}}
								@disabled={{if
									this.loaded
									false
									true
								}}
								@onChange={{this.setFrom}}
							/>
						</CanonRow>
						<CanonHeading @text="Style" />
						<CanonSegmented
							class="ppn-styles"
							aria-label="Style"
							@items={{styleLabels}}
							@columns={{3}}
							@selected={{this.styleIndex}}
							@onChange={{this.pickStyle}}
						/>
						<CanonRow
							class="ppn-start"
							@title="Start at"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.current.startAt}}
								@min={{0}}
								@max={{9999}}
								@labelledBy={{titleId}}
								@onChange={{this.setStartAt}}
							/>
						</CanonRow>
					{{/each}}
					<CanonGrid @columns={{2}}>
						<CanonButton
							class="ppn-add"
							@text="Add section"
							@icon={{Plus}}
							@disabled={{if
								this.loaded
								false
								true
							}}
							@onClick={{this.addSection}}
						/>
						<CanonButton
							class="ppn-remove"
							@text="Remove section"
							@icon={{Minus}}
							@disabled={{if
								this.canRemove
								false
								true
							}}
							@onClick={{this.removeSection}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows class="ppn-stamp" @framed={{true}}>
					<CanonRow
						@title="Stamp text"
						as |titleId|
					>
						<CanonSwitch
							class="ppn-stamp-on"
							aria-labelledby={{titleId}}
							@on={{this.stampOn}}
							@onChange={{this.setStampOn}}
						/>
					</CanonRow>
					{{#if this.stampOn}}
						<CanonRow
							class="ppn-stamp-text"
							@title="Text"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								class="ppn-stamp-field"
								aria-labelledby={{titleId}}
								autocomplete="off"
								spellcheck="false"
								@value={{this.stampText}}
								@placeholder="DRAFT"
								@onChange={{this.setStampText}}
							/>
						</CanonRow>
						<CanonHeading @text="Mode" />
						<CanonSegmented
							class="ppn-modes"
							aria-label="Mode"
							@items={{modeLabels}}
							@selected={{this.modeIndex}}
							@onChange={{this.pickMode}}
						/>
						{{#if this.isLabel}}
							<CanonHeading
								@text="Position"
							/>
							<AnchorPicker
								class="ppn-stamp-anchors"
								aria-label="Position"
								@selected={{this.stampAnchorIndex}}
								@onChange={{this.pickStampAnchor}}
							/>
						{{else}}
							<CanonRow
								class="ppn-opacity"
								@title="Opacity"
								@form="flush"
								as |titleId|
							>
								<CanonSlider
									@value={{this.opacity}}
									@min={{5}}
									@max={{60}}
									@step={{5}}
									@readout={{percent}}
									@labelledBy={{titleId}}
									@onChange={{this.setOpacity}}
								/>
							</CanonRow>
						{{/if}}
					{{/if}}
				</CanonRows>
				<CanonRows class="ppn-type" @framed={{true}}>
					<CanonHeading @text="Font" />
					<CanonSegmented
						class="ppn-fonts"
						aria-label="Font"
						@items={{fontLabels}}
						@selected={{this.fontIndex}}
						@onChange={{this.pickFont}}
					/>
					<CanonRow
						class="ppn-size"
						@title="Size"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.fontSize}}
							@min={{6}}
							@max={{48}}
							@step={{1}}
							@readout={{points}}
							@labelledBy={{titleId}}
							@onChange={{this.setFontSize}}
						/>
					</CanonRow>
					<CanonRow
						class="ppn-margin"
						@title="Margin"
						@form="flush"
						as |titleId|
					>
						<CanonSlider
							@value={{this.margin}}
							@min={{0}}
							@max={{120}}
							@step={{2}}
							@readout={{points}}
							@labelledBy={{titleId}}
							@onChange={{this.setMargin}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<Job
						@title="Export PDF"
						@icon={{Hash}}
						@failure="Numbering failed"
						@disabled={{if
							this.loaded
							false
							true
						}}
						@busy={{this.busy}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.stampIt}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonCanvas
					class="ppn-preview"
					@aspect={{this.aspect}}
					@maxHeight={{640}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
				>
					<Picture
						@size={{this.size}}
						@picture={{this.picture}}
						@number={{this.number}}
						@stamp={{this.stamp}}
						@options={{this.options}}
						@zones={{if
							this.numbersOn
							this.loaded
							false
						}}
						@onAnchor={{this.pickAnchor}}
					/>
				</CanonCanvas>
				<Pager
					@page={{this.page}}
					@count={{this.count}}
					@onStep={{this.step}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
