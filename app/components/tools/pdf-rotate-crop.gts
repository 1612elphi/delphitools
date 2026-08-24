import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { normaliseRotation } from 'delphitools-v2/lib/pdf-pages';
import {
	boxFromPoints,
	cropFromInsets,
	cropToPaper,
	dragRect,
	insetsFromBox,
	intersectBox,
	type CropBox,
} from 'delphitools-v2/lib/pdf-crop';
import { loadPdfDocument } from 'delphitools-v2/lib/pdfjs';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import { findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import PaperSizeCombobox from 'delphitools-v2/components/ui/paper-size-combobox';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';

const ACCEPT = '.pdf,application/pdf';

const THUMB_WIDTH = 96;
const PREVIEW_MAX_W = 720;
const PREVIEW_MAX_H = 980;
const MIN_DRAG_PX = 4;

interface PageState {
	/** 90° steps atop page's own */
	rotation: number;
	/** user-space pts; null = whole */
	crop: CropBox | null;
	thumb: string;
}

interface Preview {
	url: string;
	width: number;
	height: number;
}

export default class PdfRotateCropTool extends Component {
	@tracked fileName: string | null = null;
	@tracked pages: PageState[] = [];
	@tracked current = 0;
	@tracked preview: Preview | null = null;
	@tracked pending: CropBox | null = null;
	@tracked error: string | null = null;
	@tracked busy = false;
	@tracked loading = false;

	/** crop margins, mm */
	@tracked insetLeft = '0';
	@tracked insetTop = '0';
	@tracked insetRight = '0';
	@tracked insetBottom = '0';
	/** paper size id; '' = none */
	@tracked paperId = '';
	/** points, at preview rotation */
	@tracked pagePointW = 0;
	@tracked pagePointH = 0;

	/** pdf-lib re-parses per export */
	#bytes: ArrayBuffer | null = null;
	#js: PDFDocumentProxy | null = null;
	#viewport: PageViewport | null = null;
	/** drag start, preview px */
	#dragStart: { x: number; y: number } | null = null;
	/** latest-wins preview renders */
	#renderToken = 0;

	get loaded() {
		return this.pages.length > 0;
	}

	get countLabel() {
		return `${this.pages.length} page${this.pages.length === 1 ? '' : 's'}`;
	}

	get baseName() {
		return this.fileName?.replace(/\.pdf$/i, '') || 'document';
	}

	get currentPage(): PageState | undefined {
		return this.pages[this.current];
	}

	get previewStyle() {
		if (!this.preview) return null;
		return htmlSafe(
			`width: ${this.preview.width}px; height: ${this.preview.height}px`,
		);
	}

	get pendingStyle() {
		if (!this.pending) return null;
		return htmlSafe(
			`left: ${this.pending.x}px; top: ${this.pending.y}px; ` +
				`width: ${this.pending.width}px; height: ${this.pending.height}px`,
		);
	}

	get existingCropStyle() {
		const crop = this.currentPage?.crop;
		const viewport = this.#viewport;
		if (!crop || !viewport || !this.preview) return null;
		const [x1, y1] = viewport.convertToViewportPoint(
			crop.x,
			crop.y,
		) as [number, number];
		const [x2, y2] = viewport.convertToViewportPoint(
			crop.x + crop.width,
			crop.y + crop.height,
		) as [number, number];
		const rect = dragRect(
			x1,
			y1,
			x2,
			y2,
			this.preview.width,
			this.preview.height,
		);
		return htmlSafe(
			`left: ${rect.x}px; top: ${rect.y}px; ` +
				`width: ${rect.width}px; height: ${rect.height}px`,
		);
	}

	get canApplyCrop() {
		return (
			!this.busy &&
			this.pending !== null &&
			this.pending.width >= MIN_DRAG_PX &&
			this.pending.height >= MIN_DRAG_PX
		);
	}

	get canClearCrop() {
		return (
			!this.busy &&
			(this.pending !== null || !!this.currentPage?.crop)
		);
	}

	get canApplyPaper() {
		return !this.busy && !!findPaperSize(this.paperId);
	}

	/** rounded to 0.1mm */
	#ptToMmStr(pt: number) {
		return String(Math.round((pt / MM_TO_POINTS) * 10) / 10);
	}

	#syncInsets() {
		const crop = this.currentPage?.crop;
		if (crop && this.pagePointW > 0 && this.pagePointH > 0) {
			const ins = insetsFromBox(
				crop,
				this.pagePointW,
				this.pagePointH,
			);
			this.insetLeft = this.#ptToMmStr(ins.left);
			this.insetTop = this.#ptToMmStr(ins.top);
			this.insetRight = this.#ptToMmStr(ins.right);
			this.insetBottom = this.#ptToMmStr(ins.bottom);
		} else {
			this.insetLeft = '0';
			this.insetTop = '0';
			this.insetRight = '0';
			this.insetBottom = '0';
		}
	}

	setInset = (
		edge: 'Left' | 'Top' | 'Right' | 'Bottom',
		event: Event,
	) => {
		const value = (event.target as HTMLInputElement).value;
		this[`inset${edge}`] = value;
	};

	setPaper = (id: string) => {
		this.paperId = id;
	};

	pageLabel = (index: number) => `p. ${index + 1}`;

	rotationClass = (page: PageState) =>
		page.rotation ? `is-rot-${page.rotation}` : '';

	readFile = (file: File) => void this.#load(file);

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void this.#load(file);
		// allow re-picking same file
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = [...(event.dataTransfer?.files ?? [])].find(
			(f) =>
				f.type === 'application/pdf' ||
				/\.pdf$/i.test(f.name),
		);
		if (file) void this.#load(file);
	};

	// default drop navigates
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	async #load(file: File) {
		this.loading = true;
		this.error = null;
		try {
			const bytes = await file.arrayBuffer();
			const js: PDFDocumentProxy = await loadPdfDocument(
				// pdf.js detaches input buffer
				bytes.slice(0),
			);

			const pages: PageState[] = [];
			for (let n = 1; n <= js.numPages; n++) {
				const page = await js.getPage(n);
				const base = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({
					scale: THUMB_WIDTH / base.width,
				});
				const canvas = document.createElement('canvas');
				canvas.width = Math.ceil(viewport.width);
				canvas.height = Math.ceil(viewport.height);
				await page.render({ canvas, viewport }).promise;
				pages.push({
					rotation: 0,
					crop: null,
					thumb: canvas.toDataURL('image/png'),
				});
			}
			if (this.isDestroyed) return;

			this.#bytes = bytes;
			this.#js = js;
			this.fileName = file.name;
			this.pages = pages;
			this.current = 0;
			this.pending = null;
			await this.#renderPreview();
		} catch {
			if (!this.isDestroyed) this.error = 'Unreadable PDF';
		} finally {
			if (!this.isDestroyed) this.loading = false;
		}
	}

	clearAll = () => {
		this.fileName = null;
		this.pages = [];
		this.preview = null;
		this.pending = null;
		this.error = null;
		this.#bytes = null;
		this.#js = null;
		this.#viewport = null;
		this.paperId = '';
		this.pagePointW = 0;
		this.pagePointH = 0;
		this.#syncInsets();
	};

	async #renderPreview() {
		const js = this.#js;
		const page = this.currentPage;
		if (!js || !page) return;
		const token = ++this.#renderToken;
		try {
			const jsPage = await js.getPage(this.current + 1);
			const rotation = normaliseRotation(
				jsPage.rotate + page.rotation,
			);
			const base = jsPage.getViewport({ scale: 1, rotation });
			const scale = Math.min(
				PREVIEW_MAX_W / base.width,
				PREVIEW_MAX_H / base.height,
			);
			const viewport = jsPage.getViewport({
				scale,
				rotation,
			});
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			await jsPage.render({ canvas, viewport }).promise;
			if (this.isDestroyed || token !== this.#renderToken)
				return;
			this.#viewport = viewport;
			this.pagePointW = base.width;
			this.pagePointH = base.height;
			this.preview = {
				url: canvas.toDataURL('image/png'),
				width: viewport.width,
				height: viewport.height,
			};
			// stale viewport px
			this.pending = null;
			this.#syncInsets();
		} catch {
			if (!this.isDestroyed && token === this.#renderToken) {
				this.preview = null;
			}
		}
	}

	selectPage = (index: number) => {
		if (this.busy || index === this.current) return;
		this.current = index;
		void this.#renderPreview();
	};

	#rotate(delta: number, page: PageState): PageState {
		return {
			...page,
			rotation: normaliseRotation(page.rotation + delta),
		};
	}

	rotatePage = (delta: number) => {
		this.pages = this.pages.map((page, index) =>
			index === this.current
				? this.#rotate(delta, page)
				: page,
		);
		void this.#renderPreview();
	};

	rotateAll = (delta: number) => {
		this.pages = this.pages.map((page) =>
			this.#rotate(delta, page),
		);
		void this.#renderPreview();
	};

	#eventPoint(event: PointerEvent) {
		const bounds = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		return {
			x: event.clientX - bounds.left,
			y: event.clientY - bounds.top,
		};
	}

	cropStart = (event: PointerEvent) => {
		if (!this.preview) return;
		(event.currentTarget as HTMLElement).setPointerCapture(
			event.pointerId,
		);
		this.#dragStart = this.#eventPoint(event);
		this.pending = null;
	};

	cropMove = (event: PointerEvent) => {
		if (!this.#dragStart || !this.preview) return;
		const point = this.#eventPoint(event);
		this.pending = dragRect(
			this.#dragStart.x,
			this.#dragStart.y,
			point.x,
			point.y,
			this.preview.width,
			this.preview.height,
		);
	};

	cropEnd = () => {
		if (
			this.pending &&
			(this.pending.width < MIN_DRAG_PX ||
				this.pending.height < MIN_DRAG_PX)
		) {
			this.pending = null;
		}
		this.#dragStart = null;
	};

	/** preview fractions: same visible region per page */
	applyCrop = async (scope: 'page' | 'all') => {
		const pending = this.pending;
		const viewport = this.#viewport;
		const js = this.#js;
		if (!pending || !viewport || !js || !this.preview) return;

		const fx = pending.x / this.preview.width;
		const fy = pending.y / this.preview.height;
		const fw = pending.width / this.preview.width;
		const fh = pending.height / this.preview.height;

		const targets =
			scope === 'page'
				? [this.current]
				: this.pages.map((_, index) => index);
		const pages = [...this.pages];
		for (const index of targets) {
			const jsPage = await js.getPage(index + 1);
			const rotation = normaliseRotation(
				jsPage.rotate + pages[index]!.rotation,
			);
			const vp = jsPage.getViewport({ scale: 1, rotation });
			const [ax, ay] = vp.convertToPdfPoint(
				fx * vp.width,
				fy * vp.height,
			) as [number, number];
			const [bx, by] = vp.convertToPdfPoint(
				(fx + fw) * vp.width,
				(fy + fh) * vp.height,
			) as [number, number];
			pages[index] = {
				...pages[index]!,
				crop: boxFromPoints(ax, ay, bx, by),
			};
		}
		if (this.isDestroyed) return;
		this.pages = pages;
		this.pending = null;
		this.#syncInsets();
	};

	/** uniform mm per page */
	applyManualCrop = async (scope: 'page' | 'all') => {
		const js = this.#js;
		if (this.busy || !js) return;
		const left = (parseFloat(this.insetLeft) || 0) * MM_TO_POINTS;
		const top = (parseFloat(this.insetTop) || 0) * MM_TO_POINTS;
		const right = (parseFloat(this.insetRight) || 0) * MM_TO_POINTS;
		const bottom =
			(parseFloat(this.insetBottom) || 0) * MM_TO_POINTS;

		const targets =
			scope === 'page'
				? [this.current]
				: this.pages.map((_, index) => index);
		const pages = [...this.pages];
		for (const index of targets) {
			const jsPage = await js.getPage(index + 1);
			const rotation = normaliseRotation(
				jsPage.rotate + pages[index]!.rotation,
			);
			const vp = jsPage.getViewport({ scale: 1, rotation });
			const box = cropFromInsets(
				vp.width,
				vp.height,
				left,
				top,
				right,
				bottom,
			);
			if (box) pages[index] = { ...pages[index]!, crop: box };
		}
		if (this.isDestroyed) return;
		this.pages = pages;
		this.pending = null;
		this.#syncInsets();
	};

	/** portrait rotated for landscape */
	applyPaper = async (scope: 'page' | 'all') => {
		const js = this.#js;
		const size = findPaperSize(this.paperId);
		if (this.busy || !js || !size) return;
		const paperW = size.widthMm * MM_TO_POINTS;
		const paperH = size.heightMm * MM_TO_POINTS;

		const targets =
			scope === 'page'
				? [this.current]
				: this.pages.map((_, index) => index);
		const pages = [...this.pages];
		for (const index of targets) {
			const jsPage = await js.getPage(index + 1);
			const rotation = normaliseRotation(
				jsPage.rotate + pages[index]!.rotation,
			);
			const vp = jsPage.getViewport({ scale: 1, rotation });
			const landscape = vp.width > vp.height;
			const pw =
				landscape && paperW < paperH ? paperH : paperW;
			const ph =
				landscape && paperW < paperH ? paperW : paperH;
			pages[index] = {
				...pages[index]!,
				crop: cropToPaper(vp.width, vp.height, pw, ph),
			};
		}
		if (this.isDestroyed) return;
		this.pages = pages;
		this.pending = null;
		this.#syncInsets();
	};

	clearCrop = () => {
		this.pending = null;
		const page = this.currentPage;
		if (!page?.crop) return;
		this.pages = this.pages.map((entry, index) =>
			index === this.current
				? { ...entry, crop: null }
				: entry,
		);
		this.#syncInsets();
	};

	download = async () => {
		if (this.busy || !this.#bytes) return;
		this.busy = true;
		this.error = null;
		try {
			const { PDFDocument, degrees } =
				await import('pdf-lib');
			const doc = await PDFDocument.load(this.#bytes, {
				ignoreEncryption: true,
			});
			doc.getPages().forEach((page, index) => {
				const state = this.pages[index]!;
				if (state.rotation) {
					page.setRotation(
						degrees(
							normaliseRotation(
								page.getRotation()
									.angle +
									state.rotation,
							),
						),
					);
				}
				if (state.crop) {
					// never exceed current cropbox
					const box = intersectBox(
						state.crop,
						page.getCropBox(),
					);
					if (box) {
						page.setCropBox(
							box.x,
							box.y,
							box.width,
							box.height,
						);
					}
				}
			});
			// BlobPart rejects ArrayBufferLike view
			downloadBlob(
				new Blob([new Uint8Array(await doc.save())], {
					type: 'application/pdf',
				}),
				`${this.baseName}-rotate-crop.pdf`,
			);
		} catch {
			this.error = 'Save failed';
		} finally {
			this.busy = false;
		}
	};

	<template>
		<div class="dt-prc" {{filePaste this.readFile accept=ACCEPT}}>
			<div
				class="dt-prc-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				{{#unless this.loaded}}
					<label class="dt-prc-drop">
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						<span class="dt-prc-drop-title">
							{{~#if this.loading~}}
								Reading…
							{{~else~}}
								Drop PDF here
							{{~/if~}}
						</span>
						<span
							class="dt-prc-drop-hint"
						>click or paste</span>
					</label>
				{{/unless}}

				{{#if this.loaded}}
					<div class="dt-prc-bar">
						<div class="dt-prc-info">
							<span
								class="dt-prc-count"
							>{{this.fileName}}</span>
							<span
								class="dt-prc-pages"
							>{{this.countLabel}}</span>
						</div>
						<button
							type="button"
							class="dt-prc-btn"
							{{on
								"click"
								this.clearAll
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-prc-btn is-primary"
							disabled={{this.busy}}
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel
								@label="Download PDF"
							/>
						</button>
					</div>

					<div class="dt-prc-settings">
						<div class="dt-prc-field">
							<span>Rotate page</span>
							<div
								class="segmented dt-prc-rotate"
							>
								<button
									type="button"
									class="dt-prc-opt"
									title="Rotate left"
									{{on
										"click"
										(fn
											this.rotatePage
											-90
										)
									}}
								>
									<Icon
										@name="rotate-ccw"
									/>
								</button>
								<button
									type="button"
									class="dt-prc-opt"
									title="Rotate right"
									{{on
										"click"
										(fn
											this.rotatePage
											90
										)
									}}
								>
									<Icon
										@name="rotate-cw"
									/>
								</button>
							</div>
						</div>

						<div class="dt-prc-field">
							<span>Rotate all</span>
							<div
								class="segmented dt-prc-rotate"
							>
								<button
									type="button"
									class="dt-prc-opt"
									title="Rotate left"
									{{on
										"click"
										(fn
											this.rotateAll
											-90
										)
									}}
								>
									<Icon
										@name="rotate-ccw"
									/>
								</button>
								<button
									type="button"
									class="dt-prc-opt"
									title="Rotate right"
									{{on
										"click"
										(fn
											this.rotateAll
											90
										)
									}}
								>
									<Icon
										@name="rotate-cw"
									/>
								</button>
							</div>
						</div>

						<div class="dt-prc-field">
							<span>Crop (drag)</span>
							<div
								class="segmented dt-prc-cropmode"
							>
								<button
									type="button"
									class="dt-prc-opt"
									disabled={{not
										this.canApplyCrop
									}}
									{{on
										"click"
										(fn
											this.applyCrop
											"page"
										)
									}}
								>This page</button>
								<button
									type="button"
									class="dt-prc-opt"
									disabled={{not
										this.canApplyCrop
									}}
									{{on
										"click"
										(fn
											this.applyCrop
											"all"
										)
									}}
								>All pages</button>
								<button
									type="button"
									class="dt-prc-opt"
									disabled={{not
										this.canClearCrop
									}}
									{{on
										"click"
										this.clearCrop
									}}
								>Clear</button>
							</div>
						</div>
					</div>

					<div
						class="dt-prc-settings dt-prc-settings-2"
					>
						<div
							class="dt-prc-field dt-prc-margins"
						>
							<span>Crop margins (mm)</span>
							<div
								class="dt-prc-insets"
							>
								<label
									class="dt-prc-inset"
								>
									<span
									>L</span>
									<input
										type="number"
										step="0.1"
										min="0"
										inputmode="decimal"
										value={{this.insetLeft}}
										{{on
											"input"
											(fn
												this.setInset
												"Left"
											)
										}}
									/>
								</label>
								<label
									class="dt-prc-inset"
								>
									<span
									>T</span>
									<input
										type="number"
										step="0.1"
										min="0"
										inputmode="decimal"
										value={{this.insetTop}}
										{{on
											"input"
											(fn
												this.setInset
												"Top"
											)
										}}
									/>
								</label>
								<label
									class="dt-prc-inset"
								>
									<span
									>R</span>
									<input
										type="number"
										step="0.1"
										min="0"
										inputmode="decimal"
										value={{this.insetRight}}
										{{on
											"input"
											(fn
												this.setInset
												"Right"
											)
										}}
									/>
								</label>
								<label
									class="dt-prc-inset"
								>
									<span
									>B</span>
									<input
										type="number"
										step="0.1"
										min="0"
										inputmode="decimal"
										value={{this.insetBottom}}
										{{on
											"input"
											(fn
												this.setInset
												"Bottom"
											)
										}}
									/>
								</label>
							</div>
							<div
								class="segmented dt-prc-applyscope"
							>
								<button
									type="button"
									class="dt-prc-opt"
									disabled={{this.busy}}
									{{on
										"click"
										(fn
											this.applyManualCrop
											"page"
										)
									}}
								>This page</button>
								<button
									type="button"
									class="dt-prc-opt"
									disabled={{this.busy}}
									{{on
										"click"
										(fn
											this.applyManualCrop
											"all"
										)
									}}
								>All pages</button>
							</div>
						</div>

						<div class="dt-prc-field">
							<span>Crop to size</span>
							<PaperSizeCombobox
								@value={{this.paperId}}
								@onValueChange={{this.setPaper}}
								@showCustom={{false}}
								@triggerClass="dt-prc-paper"
							/>
							<div
								class="segmented dt-prc-applyscope"
							>
								<button
									type="button"
									class="dt-prc-opt"
									disabled={{not
										this.canApplyPaper
									}}
									{{on
										"click"
										(fn
											this.applyPaper
											"page"
										)
									}}
								>This page</button>
								<button
									type="button"
									class="dt-prc-opt"
									disabled={{not
										this.canApplyPaper
									}}
									{{on
										"click"
										(fn
											this.applyPaper
											"all"
										)
									}}
								>All pages</button>
							</div>
						</div>
					</div>

					{{#if this.error}}
						<p
							class="dt-prc-error"
						>{{this.error}}</p>
					{{/if}}

					<div class="dt-prc-stage">
						{{#if this.preview}}
							<div
								class="dt-prc-preview"
								style={{this.previewStyle}}
							>
								<img
									src={{this.preview.url}}
									alt="Page preview"
									draggable="false"
								/>
								{{! keyboard path: thumbnail strip }}
								{{! template-lint-disable no-pointer-down-event-binding }}
								<div
									class="dt-prc-crop-layer"
									title="Drag to crop"
									{{on
										"pointerdown"
										this.cropStart
									}}
									{{on
										"pointermove"
										this.cropMove
									}}
									{{on
										"pointerup"
										this.cropEnd
									}}
								>
									{{#if
										this.existingCropStyle
									}}
										<div
											class="dt-prc-cropbox"
											style={{this.existingCropStyle}}
										></div>
									{{/if}}
									{{#if
										this.pendingStyle
									}}
										<div
											class="dt-prc-pending"
											style={{this.pendingStyle}}
										></div>
									{{/if}}
								</div>
							</div>
						{{/if}}
					</div>

					<ol class="dt-prc-strip">
						{{#each
							this.pages key="@index"
							as |page index|
						}}
							<li>
								<button
									type="button"
									class="dt-prc-cell
										{{if
											(eq
												index
												this.current
											)
											'is-active'
										}}"
									title={{this.pageLabel
										index
									}}
									{{on
										"click"
										(fn
											this.selectPage
											index
										)
									}}
								>
									{{#if
										page.thumb
									}}
										<img
											class="dt-prc-thumb
												{{this.rotationClass
													page
												}}"
											src={{page.thumb}}
											alt={{this.pageLabel
												index
											}}
											draggable="false"
										/>
									{{else}}
										<span
											class="dt-prc-thumb-fallback"
										>
											<Icon
												@name="file-stack"
											/>
										</span>
									{{/if}}
									<span
										class="dt-prc-cell-foot"
									>
										<span
											class="dt-prc-badge"
										>{{this.pageLabel
												index
											}}</span>
										{{#if
											page.crop
										}}
											<span
												class="dt-prc-cropdot"
												title="Cropped"
											>
												<Icon
													@name="crop"
												/>
											</span>
										{{/if}}
									</span>
								</button>
							</li>
						{{/each}}
					</ol>
				{{/if}}
			</div>
		</div>
	</template>
}
