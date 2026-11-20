import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { array, fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import Icon, { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	formatSize,
	runPreflight,
	type FontInfo,
	type PreflightIssue,
	type PreflightReport,
} from 'delphitools-v2/lib/pdf-preflight';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { comparison, sizes, thumbnails } from 'delphitools-v2/lib/pdfjs';
import {
	boxMarks,
	samplePdf,
	type PageBoxMark,
} from 'delphitools-v2/components/tools/pdf-preflight/pages';
import {
	DASH,
	checkTiles,
	isError,
	dimensionTiles,
	groups,
	onPage,
	pageMarks,
	propertyTiles,
	rectInsets,
	resultTiles,
	verdict,
} from 'delphitools-v2/components/tools/pdf-preflight/report';
import './pdf-preflight/pdf-preflight.css';

const ACCEPT = '.pdf,application/pdf';
const A4 = { width: 595, height: 842 };

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Cross = <template><IconSvg @name="x" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

export default class PdfPreflight extends Component {
	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked file: File | null = null;
	@tracked error: string | null = null;
	@tracked analysing = false;
	@tracked report: PreflightReport | null = null;
	@tracked pages: CanonPage[] = [];
	@tracked page: number | null = null;
	@tracked preview = '';
	@tracked boxes: PageBoxMark[] = [];
	@tracked flagged: PreflightIssue | null = null;

	#pdf: PDFDocumentProxy | null = null;
	#token = 0;
	#shown = 0;
	#startPage: number | null = null;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const start = Number(query.get('pfPage') ?? NaN);
		if (Number.isInteger(start) && start >= 0)
			this.#startPage = start;
		if (query.has('pfSample'))
			void samplePdf().then((file) => this.load(file));
	}

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#close();
	}

	get loaded() {
		return this.file !== null;
	}

	get stripPages(): CanonPage[] {
		const names = pageMarks(
			this.report?.issues ?? [],
			this.pages.length,
		);
		return this.pages.map((page, index) => ({
			...page,
			name: names[index] || undefined,
		}));
	}

	get detail() {
		const report = this.report;
		if (!report) return this.file ? formatSize(this.file.size) : '';
		const n = report.pageCount;
		return `${n === 1 ? '1 page' : `${n} pages`} · ${formatSize(report.fileSize)} · PDF ${report.pdfVersion}`;
	}

	get visible() {
		const { page } = this;
		return (this.report?.issues ?? []).filter((issue) =>
			onPage(issue, page),
		);
	}

	get results() {
		return resultTiles(this.report?.issues ?? null);
	}

	get verdict() {
		return this.report ? verdict(this.report.issues) : DASH;
	}

	get tone() {
		if (!this.report) return 'muted';
		return this.report.issues.some(isError) ? 'warn' : 'ok';
	}

	get checks() {
		return checkTiles(this.report ? this.visible : null);
	}

	get groups() {
		return groups(this.visible);
	}

	get properties() {
		return propertyTiles(this.report);
	}

	get fonts() {
		return (this.report?.fonts ?? []).map((font, index) => ({
			font,
			key: String(index),
			detail: [
				font.type,
				font.embedded ? 'Embedded' : 'Not embedded',
			]
				.filter(Boolean)
				.join(' · '),
			download: `Download ${font.name}${font.extension ?? ''}`,
		}));
	}

	get selected() {
		return this.page ?? undefined;
	}

	get pageInfo() {
		return this.page === null
			? undefined
			: this.report?.pages[this.page];
	}

	get pageTitle() {
		return this.page === null ? '' : `Page ${this.page + 1}`;
	}

	get dimensions() {
		return this.pageInfo ? dimensionTiles(this.pageInfo) : [];
	}

	get paperStyle() {
		const size =
			this.page === null ? A4 : this.pages[this.page]?.size;
		const ratio =
			(size?.width ?? 1) / Math.max(size?.height ?? 1, 1);
		return htmlSafe(`--pf-ratio: ${ratio}`);
	}

	load = (file: File) => {
		this.error = null;
		if (file.type && file.type !== 'application/pdf') {
			this.error = 'Please upload a PDF file.';
			return;
		}
		if (!file.name.toLowerCase().endsWith('.pdf')) {
			this.error =
				'Please upload a file with a .pdf extension.';
			return;
		}
		void this.#read(file);
	};

	async #read(file: File) {
		let buffer: ArrayBuffer;
		try {
			buffer = await file.arrayBuffer();
		} catch {
			this.error =
				'Failed to read the file. Please try again.';
			return;
		}
		const magic = String.fromCharCode(
			...new Uint8Array(buffer.slice(0, 5)),
		);
		if (!magic.startsWith('%PDF')) {
			this.error =
				'The file does not appear to be a valid PDF.';
			return;
		}
		this.clear();
		this.file = file;
		await this.#analyse(file, buffer);
	}

	async #analyse(file: File, buffer: ArrayBuffer) {
		const token = this.#token;
		const live = () => token === this.#token;
		this.analysing = true;
		try {
			const { report, pdfDoc } = await runPreflight(
				buffer,
				file.name,
				file.size,
				() => !live(),
			);
			if (!live()) return void pdfDoc?.destroy();
			this.report = report;
			this.#pdf = pdfDoc;
			this.analysing = false;
			this.pages = pdfDoc
				? (await sizes(pdfDoc)).map((size) => ({
						size,
					}))
				: report.pages.map(({ width, height }) => ({
						size: { width, height },
					}));
			if (!live()) return;
			const start = this.#startPage;
			this.#startPage = null;
			if (start !== null && start < this.pages.length)
				this.select(start);
			if (!pdfDoc) return;
			await thumbnails(pdfDoc, live, (index, picture) => {
				const pages = [...this.pages];
				pages[index] = { ...pages[index]!, picture };
				this.pages = pages;
			});
		} catch (e) {
			if (!live()) return;
			console.error('pdf-preflight analysis failed:', e);
			const message = e instanceof Error ? e.message : '';
			this.error =
				message.includes('encrypted') ||
				message.includes('password')
					? 'This PDF is encrypted or password-protected and cannot be analysed.'
					: 'Could not parse this PDF file.';
		} finally {
			if (live()) this.analysing = false;
		}
	}

	get flags() {
		const size =
			this.page === null ? null : this.pages[this.page]?.size;
		return size
			? rectInsets(this.flagged?.rects, size).map((style) =>
					htmlSafe(style),
				)
			: [];
	}

	select = (index: number | null) => {
		const page = index === this.page ? null : index;
		this.page = page;
		this.flagged = null;
		void this.#showPage(page);
	};

	selectStrip = (index: number) => this.select(index);
	allPages = () => this.select(null);

	showIssue = (issue: PreflightIssue) => {
		const { page } = issue;
		if (!page) return;
		if (page - 1 !== this.page) this.select(page - 1);
		this.flagged = issue;
	};

	revealFlags = modifier((paper: HTMLElement, [count]: [number]) => {
		if (count) paper.scrollIntoView({ block: 'nearest' });
	});

	async #showPage(page: number | null) {
		const shown = ++this.#shown;
		const pdf = this.#pdf;
		const info =
			page === null ? undefined : this.report?.pages[page];
		const [preview, boxes] =
			pdf && info && page !== null
				? await Promise.all([
						comparison(pdf, page),
						boxMarks(pdf, info).catch(
							() => [],
						),
					])
				: ['', []];
		if (shown !== this.#shown) {
			if (preview) URL.revokeObjectURL(preview);
			return;
		}
		if (this.preview) URL.revokeObjectURL(this.preview);
		this.preview = preview;
		this.boxes = boxes;
	}

	downloadFont = (font: FontInfo) => {
		const bytes = font.data;
		if (!bytes) return;
		const buffer = bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer;
		downloadBlob(
			new Blob([buffer], {
				type: 'application/octet-stream',
			}),
			`${font.name}${font.extension ?? ''}`,
		);
	};

	clear = () => {
		this.#token++;
		this.#shown++;
		this.#close();
		this.file = null;
		this.error = null;
		this.report = null;
		this.analysing = false;
		this.page = null;
	};

	#close() {
		for (const page of this.pages)
			if (page.picture) URL.revokeObjectURL(page.picture);
		if (this.preview) URL.revokeObjectURL(this.preview);
		this.pages = [];
		this.preview = '';
		this.boxes = [];
		void this.#pdf?.destroy();
		this.#pdf = null;
	}

	<template>
		<CanonSplit
			class="pdf-preflight"
			@collapsesTo={{120}}
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
					{{#if this.pages.length}}
						<CanonPageStrip
							class="pf-strip"
							@pages={{this.stripPages}}
							@selected={{this.selected}}
							@onSelect={{this.selectStrip}}
						/>
					{{else}}
						<CanonPageStrip
							class="pf-strip--blank"
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
							class="pf-source"
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
							class="pf-slot"
							@prompt="Drop PDF here"
							@icon="file-search"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.load}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows
					class="pf-properties"
					@framed={{true}}
				>
					<CanonHeading
						@text="Document Properties"
					/>
					<CanonTiles
						@items={{this.properties}}
					/>
				</CanonRows>
				{{#if this.pageInfo}}
					<CanonRows
						class="pf-page"
						@framed={{true}}
					>
						<CanonHeading @text="Page" />
						<CanonRow
							class="pf-page-row"
							@title={{this.pageTitle}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="All pages"
								@icon={{Cross}}
								@onClick={{this.allPages}}
							/>
						</CanonRow>
						<div class="pf-preview">
							<div
								class="pf-paper"
								style={{this.paperStyle}}
								{{this.revealFlags
									this.flags.length
								}}
							>
								{{#if
									this.preview
								}}
									<img
										class="pf-picture"
										src={{this.preview}}
										alt={{this.pageTitle}}
									/>
								{{/if}}
								{{#each
									this.boxes
									as |box|
								}}
									<span
										class="pf-box pf-box--{{box.kind}}"
										style={{box.style}}
									></span>
								{{/each}}
								{{#each
									this.flags
									as |flag|
								}}
									<span
										class="pf-flag"
										style={{flag}}
									></span>
								{{/each}}
							</div>
						</div>
						<div class="pf-legend">
							<span
								class="pf-legend-item pf-box--trim"
							>Trim</span>
							<span
								class="pf-legend-item pf-box--bleed"
							>Bleed</span>
							<span
								class="pf-legend-item pf-box--crop"
							>Crop</span>
						</div>
						<CanonTiles
							@items={{this.dimensions}}
						/>
					</CanonRows>
				{{/if}}
			</:sidebar>
			<:main>
				<CanonRows class="pf-result" @framed={{true}}>
					<CanonHeading @text="Result" />
					{{#if this.analysing}}
						<CanonRow
							class="pf-busy"
							@title="Analysing…"
						>
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.error}}
						<CanonStatus
							class="pf-error"
							@text={{this.error}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonTiles
						class="pf-tiles"
						@items={{this.results}}
					/>
					<CanonStatus
						class="pf-verdict"
						@text={{this.verdict}}
						@tone={{this.tone}}
						@row={{true}}
					/>
				</CanonRows>
				<CanonRows class="pf-checks" @framed={{true}}>
					<CanonHeading @text="Checks" />
					<CanonTiles @items={{this.checks}} />
				</CanonRows>
				{{#each this.groups key="id" as |group|}}
					<CanonRows
						class="pf-group"
						data-category={{group.id}}
						@framed={{true}}
					>
						<CanonHeading
							@text={{group.label}}
						/>
						{{#each
							group.issues key="key"
							as |issue|
						}}
							<button
								type="button"
								class="pf-issue"
								disabled={{if
									issue.page
									false
									true
								}}
								{{on
									"click"
									(fn
										this.showIssue
										issue
									)
								}}
							>
								<Icon
									@name={{issue.icon}}
									class="pf-sev pf-sev--{{issue.severity}}"
								/>
								<span
									class="pf-issue-text"
								>
									<span
										class="pf-issue-message"
									>{{issue.message}}</span>
									{{#if
										issue.details
									}}
										<span
											class="pf-issue-detail"
										>{{issue.details}}</span>
									{{/if}}
								</span>
								{{#if
									issue.page
								}}
									<span
										class="pf-issue-page"
									>p.{{issue.page}}</span>
								{{/if}}
							</button>
						{{/each}}
					</CanonRows>
				{{/each}}
				{{#if this.fonts.length}}
					<CanonRows
						class="pf-fonts"
						@framed={{true}}
					>
						<CanonHeading
							@text="Font Inventory"
						/>
						{{#each
							this.fonts key="key"
							as |row|
						}}
							<CanonRow
								class="pf-font
									{{unless
										row.font.embedded
										'pf-font--missing'
									}}"
								@title={{row.font.name}}
								@detail={{row.detail}}
								@form="flush"
							>
								{{#if
									row.font.data
								}}
									<CanonButton
										class="pf-font-save"
										@kind="cell"
										@icon={{Save}}
										@label={{passAlong
											row.download
										}}
										@onClick={{fn
											this.downloadFont
											row.font
										}}
									/>
								{{/if}}
							</CanonRow>
						{{/each}}
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
