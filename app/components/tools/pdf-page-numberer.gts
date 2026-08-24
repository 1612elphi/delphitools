import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn, get } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import Switch from 'delphitools-v2/components/ui/switch';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { loadPdfDocument } from 'delphitools-v2/lib/pdfjs';
import {
	ANCHORS,
	expandNumber,
	placeText,
	resolvePageNumbers,
	type Anchor,
	type NumberSection,
	type NumeralStyle,
} from 'delphitools-v2/lib/pdf-stamp';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const ACCEPT = '.pdf,application/pdf';

const PREVIEW_MAX_W = 460;
const PREVIEW_MAX_H = 620;

type FontFamily = 'sans' | 'serif' | 'mono';

const FONTS: { value: FontFamily; label: string }[] = [
	{ value: 'sans', label: 'Sans' },
	{ value: 'serif', label: 'Serif' },
	{ value: 'mono', label: 'Mono' },
];

type StampMode = 'label' | 'watermark';

const STAMP_MODES: { value: StampMode; label: string }[] = [
	{ value: 'label', label: 'Label' },
	{ value: 'watermark', label: 'Watermark' },
];

// 80% diagonal; helvetica caps ~0.55em
function watermarkSize(pageW: number, pageH: number, textLen: number) {
	const raw =
		(0.8 * Math.hypot(pageW, pageH)) /
		(0.55 * Math.max(1, textLen));
	return Math.min(raw, Math.min(pageW, pageH) * 0.9);
}

// pdf base-14 ≈ css generics
const FONT_CSS: Record<FontFamily, string> = {
	sans: 'ui-sans-serif, system-ui, sans-serif',
	serif: 'ui-serif, Georgia, serif',
	mono: 'ui-monospace, "SFMono-Regular", monospace',
};

const NUMERAL_STYLES: { value: NumeralStyle; label: string }[] = [
	{ value: 'arabic', label: '1, 2, 3' },
	{ value: 'roman-lower', label: 'i, ii, iii' },
	{ value: 'roman-upper', label: 'I, II, III' },
	{ value: 'alpha-lower', label: 'a, b, c' },
	{ value: 'alpha-upper', label: 'A, B, C' },
];

const STYLE_LABEL = Object.fromEntries(
	NUMERAL_STYLES.map((s) => [s.value, s.label]),
) as Record<NumeralStyle, string>;

// via get(); see gen-icons.mjs EXTRA
const ANCHOR_ICON: Record<Anchor, string> = {
	'top-left': 'arrow-up-left',
	'top-center': 'arrow-up',
	'top-right': 'arrow-up-right',
	'middle-left': 'arrow-left',
	'middle-center': 'dot',
	'middle-right': 'arrow-right',
	'bottom-left': 'arrow-down-left',
	'bottom-center': 'arrow-down',
	'bottom-right': 'arrow-down-right',
};

interface Preview {
	url: string;
	width: number;
	height: number;
	/** px per pdf point */
	scale: number;
}

export default class PdfPageNumbererTool extends Component {
	@tracked fileName = '';
	@tracked pageCount = 0;
	@tracked reading = false;
	@tracked working = false;
	@tracked error = '';

	@tracked numbersOn = true;
	@tracked numberTemplate = '{n} / {N}';
	@tracked numberAnchor: Anchor = 'bottom-center';
	@tracked fontFamily: FontFamily = 'sans';
	@tracked fontSize = 11;
	@tracked margin = 24;

	@tracked stampOn = false;
	@tracked stampText = '';
	@tracked stampAnchor: Anchor = 'top-right';
	@tracked stampMode: StampMode = 'label';
	@tracked watermarkOpacity = 0.15;

	// debounced slider mirrors
	@tracked previewSize = 11;
	@tracked previewMargin = 24;
	@tracked previewOpacity = 0.15;

	#previewTimer?: ReturnType<typeof setTimeout>;

	@tracked sections: NumberSection[] = [
		{ fromPage: 1, style: 'arabic', startAt: 1 },
	];

	@tracked previewIndex = 0;
	@tracked preview: Preview | null = null;

	#bytes: ArrayBuffer | null = null;
	#js: PDFDocumentProxy | null = null;
	// latest-wins preview renders
	#renderToken = 0;

	get anchors() {
		return ANCHORS;
	}
	get fonts() {
		return FONTS;
	}
	get numeralStyles() {
		return NUMERAL_STYLES;
	}
	get anchorIcons() {
		return ANCHOR_ICON;
	}
	get styleLabels() {
		return STYLE_LABEL;
	}
	get stampModes() {
		return STAMP_MODES;
	}
	get opacityPct() {
		return Math.round(this.watermarkOpacity * 100);
	}

	get ready() {
		return this.pageCount > 0 && !this.working;
	}

	get canRemoveSection() {
		return this.sections.length > 1;
	}

	get previewPage() {
		return this.previewIndex + 1;
	}
	get atFirstPage() {
		return this.previewIndex <= 0;
	}
	get atLastPage() {
		return this.previewIndex >= this.pageCount - 1;
	}

	get previewStyle() {
		if (!this.preview) return null;
		// overlays scale via cqw
		return htmlSafe(
			`width: ${this.preview.width}px; aspect-ratio: ${this.preview.width} / ${this.preview.height}`,
		);
	}

	get previewNumber(): string | null {
		if (!this.numbersOn) return null;
		const label = resolvePageNumbers(this.sections, this.pageCount)[
			this.previewIndex
		];
		if (label == null) return null;
		return expandNumber(
			this.numberTemplate,
			label,
			String(this.pageCount),
		);
	}

	get previewStamp(): string | null {
		return this.stampOn && this.stampText.trim() !== ''
			? this.stampText
			: null;
	}

	#overlayStyle(anchor: Anchor) {
		const preview = this.preview;
		if (!preview) return null;
		// cqw = 1% container width
		const pageW = preview.width / preview.scale;
		const marginCqw = (this.previewMargin / pageW) * 100;
		const fontCqw = (Math.max(4, this.previewSize) / pageW) * 100;
		const [v, h] = anchor.split('-') as [string, string];

		const parts = [
			`font-family: ${FONT_CSS[this.fontFamily]}`,
			`font-size: ${fontCqw}cqw`,
		];
		let tx = '0';
		let ty = '0';

		if (h === 'left') parts.push(`left: ${marginCqw}cqw`);
		else if (h === 'right') parts.push(`right: ${marginCqw}cqw`);
		else {
			parts.push('left: 50%');
			tx = '-50%';
		}

		if (v === 'top') parts.push(`top: ${marginCqw}cqw`);
		else if (v === 'bottom') parts.push(`bottom: ${marginCqw}cqw`);
		else {
			parts.push('top: 50%');
			ty = '-50%';
		}

		if (tx !== '0' || ty !== '0') {
			parts.push(`transform: translate(${tx}, ${ty})`);
		}
		return htmlSafe(parts.join('; '));
	}

	get numberOverlayStyle() {
		return this.#overlayStyle(this.numberAnchor);
	}

	get stampOverlayStyle() {
		if (this.stampMode === 'watermark')
			return this.#watermarkStyle();
		return this.#overlayStyle(this.stampAnchor);
	}

	#watermarkStyle() {
		const preview = this.preview;
		if (!preview) return null;
		const pageW = preview.width / preview.scale;
		const pageH = preview.height / preview.scale;
		const size = watermarkSize(
			pageW,
			pageH,
			this.stampText.trim().length,
		);
		return htmlSafe(
			[
				`font-family: ${FONT_CSS[this.fontFamily]}`,
				`font-size: ${(size / pageW) * 100}cqw`,
				`opacity: ${this.previewOpacity}`,
				'left: 50%',
				'top: 50%',
				'color: #000',
				'transform: translate(-50%, -50%) rotate(-45deg)',
			].join('; '),
		);
	}

	readFile = async (file: File) => {
		this.error = '';
		this.reading = true;
		try {
			const bytes = await file.arrayBuffer();
			const js = await loadPdfDocument(bytes.slice(0));
			if (this.isDestroyed) return;
			this.#bytes = bytes;
			this.#js = js;
			this.fileName = file.name;
			this.pageCount = js.numPages;
			this.previewIndex = 0;
			this.sections = [
				{ fromPage: 1, style: 'arabic', startAt: 1 },
			];
			await this.#renderPreview();
		} catch {
			this.error = 'notpdf';
			this.pageCount = 0;
			this.#bytes = null;
			this.#js = null;
		} finally {
			this.reading = false;
		}
	};

	onPick = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void this.readFile(file);
	};

	onDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = [...(event.dataTransfer?.files ?? [])].find(
			(f) =>
				f.type === 'application/pdf' ||
				/\.pdf$/i.test(f.name),
		);
		if (file) void this.readFile(file);
	};

	// default drop navigates
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	clear = () => {
		this.#renderToken++;
		this.fileName = '';
		this.pageCount = 0;
		this.#bytes = null;
		this.#js = null;
		this.preview = null;
		this.error = '';
		this.previewIndex = 0;
		this.sections = [{ fromPage: 1, style: 'arabic', startAt: 1 }];
	};

	async #renderPreview() {
		const js = this.#js;
		if (!js || this.pageCount === 0) return;
		const token = ++this.#renderToken;
		const index = Math.min(
			Math.max(0, this.previewIndex),
			this.pageCount - 1,
		);
		try {
			const page = await js.getPage(index + 1);
			const base = page.getViewport({ scale: 1 });
			const scale = Math.min(
				PREVIEW_MAX_W / base.width,
				PREVIEW_MAX_H / base.height,
				2,
			);
			const viewport = page.getViewport({ scale });
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			await page.render({ canvas, viewport }).promise;
			if (this.isDestroyed || token !== this.#renderToken)
				return;
			this.preview = {
				url: canvas.toDataURL('image/png'),
				width: viewport.width,
				height: viewport.height,
				scale,
			};
		} catch {
			if (!this.isDestroyed && token === this.#renderToken) {
				this.preview = null;
			}
		}
	}

	setPreviewIndex = (index: number) => {
		const next = Math.min(Math.max(0, index), this.pageCount - 1);
		if (next === this.previewIndex) return;
		this.previewIndex = next;
		void this.#renderPreview();
	};

	prevPage = () => this.setPreviewIndex(this.previewIndex - 1);
	nextPage = () => this.setPreviewIndex(this.previewIndex + 1);

	setTemplate = (event: Event) => {
		this.numberTemplate = (event.target as HTMLInputElement).value;
	};
	setStampText = (event: Event) => {
		this.stampText = (event.target as HTMLInputElement).value;
	};
	setNumberAnchor = (a: Anchor) => (this.numberAnchor = a);
	setStampAnchor = (a: Anchor) => (this.stampAnchor = a);
	setFontFamily = (family: FontFamily) => (this.fontFamily = family);
	setNumbersOn = (on: boolean) => (this.numbersOn = on);
	setStampOn = (on: boolean) => (this.stampOn = on);

	setNumber = (key: 'fontSize' | 'margin', event: Event) => {
		const n = Number.parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (Number.isFinite(n)) {
			this[key] = n;
			this.#schedulePreview();
		}
	};

	setOpacity = (event: Event) => {
		const n = Number.parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (Number.isFinite(n)) {
			this.watermarkOpacity = n / 100;
			this.#schedulePreview();
		}
	};

	setStampMode = (mode: StampMode) => (this.stampMode = mode);

	#schedulePreview() {
		clearTimeout(this.#previewTimer);
		this.#previewTimer = setTimeout(() => {
			if (this.isDestroyed) return;
			this.previewSize = this.fontSize;
			this.previewMargin = this.margin;
			this.previewOpacity = this.watermarkOpacity;
		}, 100);
	}

	addSection = () => {
		const maxFrom = this.sections.reduce(
			(m, s) => Math.max(m, s.fromPage),
			0,
		);
		const fromPage = Math.min(this.pageCount || 1, maxFrom + 1);
		this.sections = [
			...this.sections,
			{ fromPage, style: 'arabic', startAt: 1 },
		];
	};

	removeSection = (index: number) => {
		if (this.sections.length <= 1) return;
		this.sections = this.sections.filter((_, i) => i !== index);
	};

	setSectionFrom = (index: number, event: Event) => {
		const n = Number.parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (!Number.isFinite(n)) return;
		const clamped = Math.min(Math.max(1, n), this.pageCount || 1);
		this.sections = this.sections.map((s, i) =>
			i === index ? { ...s, fromPage: clamped } : s,
		);
	};

	setSectionStart = (index: number, event: Event) => {
		const n = Number.parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (!Number.isFinite(n)) return;
		this.sections = this.sections.map((s, i) =>
			i === index ? { ...s, startAt: n } : s,
		);
	};

	setSectionStyle = (index: number, value: string) => {
		this.sections = this.sections.map((s, i) =>
			i === index
				? { ...s, style: value as NumeralStyle }
				: s,
		);
	};

	apply = async () => {
		if (!this.#bytes) return;
		this.working = true;
		this.error = '';
		try {
			const { PDFDocument, StandardFonts, rgb, degrees } =
				await import('pdf-lib');
			const doc = await PDFDocument.load(this.#bytes, {
				updateMetadata: false,
			});
			const fontName =
				this.fontFamily === 'serif'
					? StandardFonts.TimesRoman
					: this.fontFamily === 'mono'
						? StandardFonts.Courier
						: StandardFonts.Helvetica;
			const font = await doc.embedFont(fontName);
			const size = Math.max(4, this.fontSize);
			const pages = doc.getPages();
			const total = String(pages.length);
			const labels = resolvePageNumbers(
				this.sections,
				pages.length,
			);

			pages.forEach((page, index) => {
				const { width, height } = page.getSize();

				if (this.numbersOn) {
					const label = labels[index];
					if (label != null) {
						const text = expandNumber(
							this.numberTemplate,
							label,
							total,
						);
						const w =
							font.widthOfTextAtSize(
								text,
								size,
							);
						const { x, y } = placeText(
							width,
							height,
							w,
							size,
							this.numberAnchor,
							this.margin,
						);
						page.drawText(text, {
							x,
							y,
							size,
							font,
							color: rgb(0, 0, 0),
						});
					}
				}

				if (
					this.stampOn &&
					this.stampText.trim() !== ''
				) {
					const text = this.stampText;
					if (this.stampMode === 'watermark') {
						const wmSize = watermarkSize(
							width,
							height,
							text.length,
						);
						const w =
							font.widthOfTextAtSize(
								text,
								wmSize,
							);
						const cos = Math.cos(
							Math.PI / 4,
						);
						const sin = Math.sin(
							Math.PI / 4,
						);
						const hh = wmSize * 0.35;
						page.drawText(text, {
							x:
								width / 2 -
								(w / 2) * cos +
								(hh / 2) * sin,
							y:
								height / 2 -
								(w / 2) * sin -
								(hh / 2) * cos,
							size: wmSize,
							font,
							color: rgb(0, 0, 0),
							opacity: this
								.watermarkOpacity,
							rotate: degrees(45),
						});
					} else {
						const w =
							font.widthOfTextAtSize(
								text,
								size,
							);
						const { x, y } = placeText(
							width,
							height,
							w,
							size,
							this.stampAnchor,
							this.margin,
						);
						page.drawText(text, {
							x,
							y,
							size,
							font,
							color: rgb(
								0.4,
								0.4,
								0.4,
							),
						});
					}
				}
			});

			const out = await doc.save();
			const stem = this.fileName.replace(/\.pdf$/i, '');
			downloadBlob(
				new Blob([new Uint8Array(out)], {
					type: 'application/pdf',
				}),
				`${stem}-numbered.pdf`,
			);
		} catch {
			this.error = 'failed';
		} finally {
			this.working = false;
		}
	};

	<template>
		<div class="dt-ppn" {{filePaste this.readFile accept=ACCEPT}}>
			{{#if (eq this.pageCount 0)}}
				<label
					class="dt-ppn-drop"
					{{on "drop" this.onDrop}}
					{{on "dragover" this.allowDrop}}
				>
					<input
						type="file"
						accept={{ACCEPT}}
						class="dt-sr-only"
						{{on "change" this.onPick}}
					/>
					<Icon @name="file-plus" />
					<span class="dt-ppn-drop-title">
						{{~#if this.reading~}}
							Reading…
						{{~else~}}
							Drop a PDF
						{{~/if~}}
					</span>
					<span class="dt-ppn-drop-hint">click or
						paste</span>
				</label>
			{{else}}
				<div class="dt-ppn-frame">
					<div class="dt-ppn-bar">
						<span
							class="dt-ppn-name"
						>{{this.fileName}}</span>
						<span
							class="dt-ppn-count"
						>{{this.pageCount}} pp.</span>
						<button
							type="button"
							class="dt-ppn-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>

					<div class="dt-ppn-body">
						<div class="dt-ppn-preview-col">
							{{#if this.preview}}
								<div
									class="dt-ppn-preview"
									style={{this.previewStyle}}
								>
									<img
										src={{this.preview.url}}
										alt="Page preview"
										draggable="false"
									/>
									{{#if
										this.previewNumber
									}}
										<span
											class="dt-ppn-overlay dt-ppn-overlay-num"
											style={{this.numberOverlayStyle}}
										>{{this.previewNumber}}</span>
									{{/if}}
									{{#if
										this.previewStamp
									}}
										<span
											class="dt-ppn-overlay dt-ppn-overlay-stamp"
											style={{this.stampOverlayStyle}}
										>{{this.previewStamp}}</span>
									{{/if}}
								</div>
							{{/if}}

							<div
								class="dt-ppn-pager"
							>
								<button
									type="button"
									class="dt-ppn-page-btn"
									aria-label="Previous page"
									disabled={{this.atFirstPage}}
									{{on
										"click"
										this.prevPage
									}}
								>
									<Icon
										@name="chevron-left"
									/>
								</button>
								<span
									class="dt-ppn-pager-label"
								>
									Page
									{{this.previewPage}}
									/
									{{this.pageCount}}
								</span>
								<button
									type="button"
									class="dt-ppn-page-btn"
									aria-label="Next page"
									disabled={{this.atLastPage}}
									{{on
										"click"
										this.nextPage
									}}
								>
									<Icon
										@name="chevron-right"
									/>
								</button>
							</div>
						</div>

						<div class="dt-ppn-controls">
							<section
								class="dt-ppn-block"
							>
								<label
									class="dt-ppn-toggle"
								>
									<Switch
										@checked={{this.numbersOn}}
										@onChange={{this.setNumbersOn}}
										@label="Page numbers"
									/>
									<span
									>Page
										numbers</span>
								</label>

								<label
									class="dt-ppn-set"
								>
									<span
										class="dt-ppn-set-label"
									>Format</span>
									<input
										class="dt-ppn-input"
										type="text"
										value={{this.numberTemplate}}
										placeholder="{n} / {N}"
										{{on
											"input"
											this.setTemplate
										}}
									/>
								</label>

								<div
									class="dt-ppn-set"
								>
									<span
										class="dt-ppn-set-label"
									>Font</span>
									<span
										class="segmented dt-ppn-font"
									>
										{{#each
											this.fonts
											key="value"
											as |font|
										}}
											<button
												type="button"
												class="dt-ppn-opt
													{{if
														(eq
															this.fontFamily
															font.value
														)
														'is-active'
													}}"
												{{on
													"click"
													(fn
														this.setFontFamily
														font.value
													)
												}}
											>{{font.label}}</button>
										{{/each}}
									</span>
								</div>

								<label
									class="dt-ppn-set"
								>
									<span
										class="dt-ppn-set-label"
									>Size</span>
									<span
										class="dt-ppn-slider"
									>
										<input
											type="range"
											min="6"
											max="48"
											value={{this.fontSize}}
											{{on
												"input"
												(fn
													this.setNumber
													"fontSize"
												)
											}}
										/>
										<span
											class="dt-ppn-readout"
										>{{this.fontSize}}</span>
									</span>
								</label>

								<label
									class="dt-ppn-set"
								>
									<span
										class="dt-ppn-set-label"
									>Margin</span>
									<span
										class="dt-ppn-slider"
									>
										<input
											type="range"
											min="0"
											max="120"
											step="2"
											value={{this.margin}}
											{{on
												"input"
												(fn
													this.setNumber
													"margin"
												)
											}}
										/>
										<span
											class="dt-ppn-readout"
										>{{this.margin}}</span>
									</span>
								</label>

								<div
									class="dt-ppn-set"
								>
									<span
										class="dt-ppn-set-label"
									>Position</span>
									<span
										class="segmented dt-ppn-anchors"
									>
										{{#each
											this.anchors
											key="."
											as |a|
										}}
											<button
												type="button"
												aria-label={{a}}
												class="dt-ppn-anchor
													{{if
														(eq
															a
															this.numberAnchor
														)
														'is-active'
													}}"
												{{on
													"click"
													(fn
														this.setNumberAnchor
														a
													)
												}}
											>
												<Icon
													@name={{get
														this.anchorIcons
														a
													}}
												/>
											</button>
										{{/each}}
									</span>
								</div>
							</section>

							<section
								class="dt-ppn-block"
							>
								<div
									class="dt-ppn-block-head"
								>
									<span
										class="dt-ppn-block-title"
									>Sections</span>
									<button
										type="button"
										class="dt-ppn-add"
										{{on
											"click"
											this.addSection
										}}
									>
										<Icon
											@name="plus"
										/>
										Add
										section
									</button>
								</div>
								<div
									class="dt-ppn-sections"
								>
									<div
										class="dt-ppn-section-head"
									>
										<span
										>From</span>
										<span
										>Style</span>
										<span
										>Start</span>
										<span
											aria-hidden="true"
										></span>
									</div>
									<ol
										class="dt-ppn-section-list"
									>
										{{#each
											this.sections
											key="@index"
											as |section index|
										}}
											<li
												class="dt-ppn-section"
											>
												<input
													class="dt-ppn-section-num"
													type="number"
													min="1"
													max={{this.pageCount}}
													aria-label="From page"
													value={{section.fromPage}}
													{{on
														"input"
														(fn
															this.setSectionFrom
															index
														)
													}}
												/>
												<div
													class="dt-ppn-section-style"
												>
													<Select
														@value={{section.style}}
														@onValueChange={{fn
															this.setSectionStyle
															index
														}}
													>
														<SelectTrigger
															aria-label="Numeral style"
														>
															<SelectValue
															>{{get
																	this.styleLabels
																	section.style
																}}</SelectValue>
														</SelectTrigger>
														<SelectContent
														>
															{{#each
																this.numeralStyles
																key="value"
																as |numeral|
															}}
																<SelectItem
																	@value={{numeral.value}}
																>{{numeral.label}}</SelectItem>
															{{/each}}
														</SelectContent>
													</Select>
												</div>
												<input
													class="dt-ppn-section-num"
													type="number"
													aria-label="Start at"
													value={{section.startAt}}
													{{on
														"input"
														(fn
															this.setSectionStart
															index
														)
													}}
												/>
												<button
													type="button"
													class="dt-ppn-section-x"
													aria-label="Remove section"
													disabled={{not
														this.canRemoveSection
													}}
													{{on
														"click"
														(fn
															this.removeSection
															index
														)
													}}
												>
													<Icon
														@name="x"
													/>
												</button>
											</li>
										{{/each}}
									</ol>
								</div>
							</section>

							<section
								class="dt-ppn-block"
							>
								<label
									class="dt-ppn-toggle"
								>
									<Switch
										@checked={{this.stampOn}}
										@onChange={{this.setStampOn}}
										@label="Stamp text"
									/>
									<span
									>Stamp
										text</span>
								</label>

								<div
									class="dt-ppn-set"
								>
									<span
										class="dt-ppn-set-label"
									>Mode</span>
									<span
										class="segmented dt-ppn-modes"
									>
										{{#each
											this.stampModes
											key="value"
											as |mode|
										}}
											<button
												type="button"
												class="dt-ppn-opt
													{{if
														(eq
															this.stampMode
															mode.value
														)
														'is-active'
													}}"
												{{on
													"click"
													(fn
														this.setStampMode
														mode.value
													)
												}}
											>{{mode.label}}</button>
										{{/each}}
									</span>
								</div>

								<label
									class="dt-ppn-set"
								>
									<span
										class="dt-ppn-set-label"
									>Text</span>
									<input
										class="dt-ppn-input"
										type="text"
										value={{this.stampText}}
										placeholder="DRAFT"
										{{on
											"input"
											this.setStampText
										}}
									/>
								</label>

								{{#if
									(eq
										this.stampMode
										"watermark"
									)
								}}
									<label
										class="dt-ppn-set"
									>
										<span
											class="dt-ppn-set-label"
										>Opacity</span>
										<span
											class="dt-ppn-slider"
										>
											<input
												type="range"
												min="5"
												max="60"
												step="5"
												value={{this.opacityPct}}
												{{on
													"input"
													this.setOpacity
												}}
											/>
											<span
												class="dt-ppn-readout"
											>{{this.opacityPct}}%</span>
										</span>
									</label>
								{{else}}
									<div
										class="dt-ppn-set"
									>
										<span
											class="dt-ppn-set-label"
										>Position</span>
										<span
											class="segmented dt-ppn-anchors"
										>
											{{#each
												this.anchors
												key="."
												as |a|
											}}
												<button
													type="button"
													aria-label={{a}}
													class="dt-ppn-anchor
														{{if
															(eq
																a
																this.stampAnchor
															)
															'is-active'
														}}"
													{{on
														"click"
														(fn
															this.setStampAnchor
															a
														)
													}}
												>
													<Icon
														@name={{get
															this.anchorIcons
															a
														}}
													/>
												</button>
											{{/each}}
										</span>
									</div>
								{{/if}}
							</section>
						</div>
					</div>

					<button
						type="button"
						class="dt-ppn-apply"
						disabled={{this.working}}
						{{on "click" this.apply}}
					>
						{{#if this.working}}
							<Icon @name="stamp" />
							Working…
						{{else}}
							<DownloadLabel
								@label="Apply"
							/>
						{{/if}}
					</button>

					{{#if this.error}}
						<p class="dt-ppn-error">
							{{~#if
								(eq
									this.error
									"notpdf"
								)
							~}}
								Unreadable PDF
							{{~else~}}
								Numbering failed
							{{~/if~}}
						</p>
					{{/if}}
				</div>
			{{/if}}
		</div>
	</template>
}
