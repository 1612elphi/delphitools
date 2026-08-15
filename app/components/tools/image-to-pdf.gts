import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob, downloadUrl } from 'delphitools-v2/lib/download';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import {
	fitPlacement,
	MATCH_IMAGE_SIZE,
	PAGE_SIZE_OPTIONS,
	pageSetupPt,
	type FitMode,
	type PageOrientation,
} from 'delphitools-v2/lib/pdf-pages';
import { loadPdfDocument } from 'delphitools-v2/lib/pdfjs';

type Direction = 'to-pdf' | 'to-png';

const IMAGE_ACCEPT = 'image/*';
const PDF_ACCEPT = '.pdf,application/pdf';

const ORIENTATIONS: PageOrientation[] = ['auto', 'portrait', 'landscape'];
const FIT_MODES: { value: FitMode; label: string }[] = [
	{ value: 'contain', label: 'Fit' },
	{ value: 'cover', label: 'Fill' },
	{ value: 'stretch', label: 'Stretch' },
];
const MARGINS_MM = [0, 5, 10, 20];

/** Render scales for PDF → PNG, labelled by their effective resolution. */
const SCALES: { value: number; label: string }[] = [
	{ value: 1, label: '72 DPI' },
	{ value: 2, label: '144 DPI' },
	{ value: 3, label: '216 DPI' },
];

interface QueuedImage {
	id: number;
	file: File;
	url: string;
	width: number;
	height: number;
}

interface RenderedPage {
	page: number;
	name: string;
	url: string;
	blob: Blob;
}

let nextId = 1;

function loadImageSize(
	file: File,
): Promise<{ url: string; width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const url = URL.createObjectURL(file);
		image.onload = () =>
			resolve({
				url,
				width: image.naturalWidth,
				height: image.naturalHeight,
			});
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error(`Could not read ${file.name}`));
		};
		image.src = url;
	});
}

/** Non-png/jpeg formats are rasterised once so pdf-lib can embed them. */
async function pngBytes(file: File): Promise<ArrayBuffer> {
	const bitmap = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
	bitmap.close();
	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(result) =>
				result
					? resolve(result)
					: reject(new Error('encode failed')),
			'image/png',
		),
	);
	return blob.arrayBuffer();
}

export default class ImageToPdfTool extends Component {
	@tracked direction: Direction = 'to-pdf';

	// Images → PDF
	@tracked images: QueuedImage[] = [];
	@tracked pageSizeId = 'a4';
	@tracked orientation: PageOrientation = 'auto';
	@tracked fitMode: FitMode = 'contain';
	@tracked marginMm = 0;
	@tracked building = false;

	// PDF → PNG
	@tracked pdfName: string | null = null;
	@tracked pdfBytes: ArrayBuffer | null = null;
	@tracked renders: RenderedPage[] = [];
	@tracked rendering = false;
	@tracked scale = 2;

	@tracked error: string | null = null;
	@tracked draggedId: number | null = null;
	@tracked dragOverId: number | null = null;

	// Bumped per render run, so a stale loop from a replaced PDF stops early.
	#renderRun = 0;

	willDestroy() {
		super.willDestroy();
		this.#releaseImages();
		this.#releaseRenders();
	}

	get imageCountLabel() {
		const count = this.images.length;
		return `${count} image${count === 1 ? '' : 's'}`;
	}

	get pdfInfoLabel() {
		const count = this.renders.length;
		return `${this.pdfName} · ${count} page${count === 1 ? '' : 's'}`;
	}

	get canBuild() {
		return !this.building && this.images.length > 0;
	}

	get canZip() {
		return !this.rendering && this.renders.length > 0;
	}

	get matchSize() {
		return this.pageSizeId === MATCH_IMAGE_SIZE;
	}

	#releaseImages() {
		for (const image of this.images) URL.revokeObjectURL(image.url);
	}

	#releaseRenders() {
		for (const render of this.renders)
			URL.revokeObjectURL(render.url);
	}

	setDirection = (direction: string) => {
		this.direction = direction as Direction;
		this.error = null;
	};

	// ------------------------------------------------------ images → pdf

	readImage = (file: File) => this.#addImages([file]);

	chooseImages = (event: Event) => {
		const input = event.target as HTMLInputElement;
		this.#addImages([...(input.files ?? [])]);
		input.value = '';
	};

	dropImages = (event: DragEvent) => {
		event.preventDefault();
		this.#addImages([...(event.dataTransfer?.files ?? [])]);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	#addImages(files: File[]) {
		const images = files.filter((file) =>
			file.type.startsWith('image/'),
		);
		if (images.length === 0) return;
		this.error = null;
		for (const file of images) {
			void loadImageSize(file)
				.then(({ url, width, height }) => {
					if (this.isDestroyed) {
						URL.revokeObjectURL(url);
						return;
					}
					this.images = [
						...this.images,
						{
							id: nextId++,
							file,
							url,
							width,
							height,
						},
					];
				})
				.catch(
					(error: Error) =>
						(this.error = error.message),
				);
		}
	}

	removeImage = (image: QueuedImage) => {
		URL.revokeObjectURL(image.url);
		this.images = this.images.filter(
			(entry) => entry.id !== image.id,
		);
	};

	clearImages = () => {
		this.#releaseImages();
		this.images = [];
		this.error = null;
	};

	// ------------------------------------------------------ drag reorder

	dragStart = (id: number, event: DragEvent) => {
		this.draggedId = id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(id));
		}
	};

	dragOver = (id: number, event: DragEvent) => {
		event.preventDefault();
		this.dragOverId = id === this.draggedId ? null : id;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect =
				this.draggedId === null ? 'copy' : 'move';
		}
	};

	dragEnd = () => {
		this.draggedId = null;
		this.dragOverId = null;
	};

	dropOnCell = (id: number, event: DragEvent) => {
		event.preventDefault();
		this.dragOverId = null;

		// A file dropped on the grid is intake, not a reorder.
		if (event.dataTransfer?.files.length) {
			this.draggedId = null;
			this.#addImages([...event.dataTransfer.files]);
			return;
		}

		const from = this.images.findIndex(
			(image) => image.id === this.draggedId,
		);
		this.draggedId = null;
		const to = this.images.findIndex((image) => image.id === id);
		if (from < 0 || to < 0 || from === to) return;

		const next = [...this.images];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved!);
		this.images = next;
	};

	// ------------------------------------------------------------ build

	setPageSize = (event: Event) =>
		(this.pageSizeId = (event.target as HTMLSelectElement).value);
	setOrientation = (value: PageOrientation) => (this.orientation = value);
	setFitMode = (value: FitMode) => (this.fitMode = value);
	setMargin = (mm: number) => (this.marginMm = mm);

	marginLabel = (mm: number) => (mm === 0 ? 'None' : `${mm} mm`);

	buildPdf = async () => {
		if (!this.canBuild) return;
		this.building = true;
		this.error = null;
		try {
			const { PDFDocument } = await import('pdf-lib');
			const doc = await PDFDocument.create();
			const marginPt = this.marginMm * MM_TO_POINTS;

			for (const image of this.images) {
				const embedded =
					image.file.type === 'image/jpeg'
						? await doc.embedJpg(
								await image.file.arrayBuffer(),
							)
						: image.file.type ===
							  'image/png'
							? await doc.embedPng(
									await image.file.arrayBuffer(),
								)
							: await doc.embedPng(
									await pngBytes(
										image.file,
									),
								);

				const setup = pageSetupPt(
					this.pageSizeId,
					this.orientation,
					image.width,
					image.height,
					marginPt,
				);
				const page = doc.addPage([
					setup.width,
					setup.height,
				]);

				const areaW = setup.width - marginPt * 2;
				const areaH = setup.height - marginPt * 2;
				// Match-image pages are the image's own size, so contain
				// lands it back at natural size inside the margin.
				const mode = this.matchSize
					? 'contain'
					: this.fitMode;
				const placement = fitPlacement(
					image.width,
					image.height,
					areaW,
					areaH,
					mode,
				);
				page.drawImage(embedded, {
					x: marginPt + placement.x,
					y: marginPt + placement.y,
					width: placement.width,
					height: placement.height,
				});
			}

			if (this.isDestroyed) return;
			// Copied into a fresh buffer: pdf-lib types its output over
			// ArrayBufferLike, which BlobPart does not accept.
			const bytes = await doc.save();
			downloadBlob(
				new Blob([new Uint8Array(bytes)], {
					type: 'application/pdf',
				}),
				'images.pdf',
			);
		} catch {
			this.error = 'Build failed';
		} finally {
			this.building = false;
		}
	};

	// ------------------------------------------------------ pdf → png

	choosePdf = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void this.#loadPdf(file);
	};

	dropPdf = (event: DragEvent) => {
		event.preventDefault();
		const file = [...(event.dataTransfer?.files ?? [])].find(
			(candidate) =>
				candidate.type === 'application/pdf' ||
				/\.pdf$/i.test(candidate.name),
		);
		if (file) void this.#loadPdf(file);
	};

	async #loadPdf(file: File) {
		this.error = null;
		try {
			const bytes = await file.arrayBuffer();
			if (this.isDestroyed) return;
			this.pdfBytes = bytes;
			this.pdfName = file.name.replace(/\.pdf$/i, '');
			await this.#renderPages();
		} catch {
			this.error = `Could not read ${file.name}`;
		}
	}

	setScale = (value: number) => {
		this.scale = value;
		if (this.pdfBytes) void this.#renderPages();
	};

	clearPdf = () => {
		this.#renderRun++;
		this.pdfBytes = null;
		this.pdfName = null;
		this.#releaseRenders();
		this.renders = [];
		this.error = null;
	};

	async #renderPages() {
		const bytes = this.pdfBytes;
		if (!bytes) return;

		const run = ++this.#renderRun;
		this.rendering = true;
		this.#releaseRenders();
		this.renders = [];
		try {
			// A copy: pdf.js detaches the buffer it is handed.
			const doc = await loadPdfDocument(bytes.slice(0));
			const base = this.pdfName ?? 'pages';
			const renders: RenderedPage[] = [];

			for (let n = 1; n <= doc.numPages; n++) {
				const page = await doc.getPage(n);
				const viewport = page.getViewport({
					scale: this.scale,
				});
				const canvas = document.createElement('canvas');
				canvas.width = Math.ceil(viewport.width);
				canvas.height = Math.ceil(viewport.height);
				await page.render({ canvas, viewport }).promise;
				const blob = await new Promise<Blob | null>(
					(resolve) =>
						canvas.toBlob(
							resolve,
							'image/png',
						),
				);
				if (
					!blob ||
					this.isDestroyed ||
					run !== this.#renderRun
				)
					return;
				renders.push({
					page: n,
					name: `${base}-page-${n}.png`,
					url: URL.createObjectURL(blob),
					blob,
				});
				this.renders = [...renders];
			}
		} catch {
			if (run === this.#renderRun)
				this.error = 'Render failed';
		} finally {
			if (run === this.#renderRun) this.rendering = false;
		}
	}

	downloadPage = (render: RenderedPage) => {
		downloadUrl(render.url, render.name);
	};

	downloadZip = async () => {
		if (!this.canZip) return;
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		for (const render of this.renders) {
			zip.file(render.name, render.blob);
		}
		const blob = await zip.generateAsync({ type: 'blob' });
		if (this.isDestroyed) return;
		downloadBlob(blob, `${this.pdfName ?? 'pages'}-pages.zip`);
	};

	<template>
		<div
			class="dt-i2p"
			{{filePaste this.readImage accept=IMAGE_ACCEPT}}
		>
			<div class="dt-i2p-frame">
				<Tabs
					@value={{this.direction}}
					@onValueChange={{this.setDirection}}
				>
					<TabsList class="dt-i2p-tabs">
						<TabsTrigger
							class="dt-i2p-tab"
							@value="to-pdf"
						>Image to PDF</TabsTrigger>
						<TabsTrigger
							class="dt-i2p-tab"
							@value="to-png"
						>PDF to Image</TabsTrigger>
					</TabsList>

					<TabsContent
						class="dt-i2p-panel"
						@value="to-pdf"
					>
						<div
							{{on
								"drop"
								this.dropImages
							}}
							{{on
								"dragover"
								this.allowDrop
							}}
						>
							{{#unless
								this.images.length
							}}
								<label
									class="dt-i2p-drop"
								>
									<input
										type="file"
										accept={{IMAGE_ACCEPT}}
										multiple
										class="dt-sr-only"
										{{on
											"change"
											this.chooseImages
										}}
									/>
									<Icon
										@name="upload"
									/>
									<span
										class="dt-i2p-drop-title"
									>Drop
										images
										here</span>
									<span
										class="dt-i2p-drop-hint"
									>click
										or
										paste</span>
								</label>
							{{/unless}}

							{{#if
								this.images.length
							}}
								<div
									class="dt-i2p-bar"
								>
									<div
										class="dt-i2p-info"
									>
										<span
											class="dt-i2p-count"
										>{{this.imageCountLabel}}</span>
									</div>
									<label
										class="dt-i2p-btn"
									>
										<input
											type="file"
											accept={{IMAGE_ACCEPT}}
											multiple
											class="dt-sr-only"
											{{on
												"change"
												this.chooseImages
											}}
										/>
										<Icon
											@name="image-plus"
										/>
										Add
										images
									</label>
									<button
										type="button"
										class="dt-i2p-btn"
										{{on
											"click"
											this.clearImages
										}}
									>
										<Icon
											@name="trash-2"
										/>
										Clear
									</button>
									<button
										type="button"
										class="dt-i2p-btn is-primary"
										disabled={{not
											this.canBuild
										}}
										{{on
											"click"
											this.buildPdf
										}}
									>
										<Icon
											@name="file-output"
										/>
										Build
										PDF
									</button>
								</div>

								<div
									class="dt-i2p-settings"
								>
									<label
										class="dt-i2p-field"
									>
										<span
										>Page
											size</span>
										<select
											{{on
												"change"
												this.setPageSize
											}}
										>
											{{#each
												PAGE_SIZE_OPTIONS
												key="id"
												as |sizeOption|
											}}
												<option
													value={{sizeOption.id}}
													selected={{eq
														this.pageSizeId
														sizeOption.id
													}}
												>{{sizeOption.label}}</option>
											{{/each}}
										</select>
									</label>

									<div
										class="dt-i2p-field"
									>
										<span
										>Orientation</span>
										<div
											class="segmented dt-i2p-orient"
										>
											{{#each
												ORIENTATIONS
												key="@index"
												as |option|
											}}
												<button
													type="button"
													class="dt-i2p-opt
														{{if
															(eq
																this.orientation
																option
															)
															'is-active'
														}}"
													disabled={{this.matchSize}}
													{{on
														"click"
														(fn
															this.setOrientation
															option
														)
													}}
												>{{option}}</button>
											{{/each}}
										</div>
									</div>

									<div
										class="dt-i2p-field"
									>
										<span
										>Fit</span>
										<div
											class="segmented dt-i2p-fit"
										>
											{{#each
												FIT_MODES
												key="value"
												as |option|
											}}
												<button
													type="button"
													class="dt-i2p-opt
														{{if
															(eq
																this.fitMode
																option.value
															)
															'is-active'
														}}"
													disabled={{this.matchSize}}
													{{on
														"click"
														(fn
															this.setFitMode
															option.value
														)
													}}
												>{{option.label}}</button>
											{{/each}}
										</div>
									</div>

									<div
										class="dt-i2p-field"
									>
										<span
										>Margin</span>
										<div
											class="segmented dt-i2p-margin"
										>
											{{#each
												MARGINS_MM
												key="@index"
												as |mm|
											}}
												<button
													type="button"
													class="dt-i2p-opt
														{{if
															(eq
																this.marginMm
																mm
															)
															'is-active'
														}}"
													{{on
														"click"
														(fn
															this.setMargin
															mm
														)
													}}
												>{{this.marginLabel
														mm
													}}</button>
											{{/each}}
										</div>
									</div>
								</div>

								<ol
									class="dt-i2p-grid"
								>
									{{#each
										this.images
										key="id"
										as |image|
									}}
										<li
											class="dt-i2p-cell
												{{if
													(eq
														this.dragOverId
														image.id
													)
													'is-drag-over'
												}}"
											draggable="true"
											{{on
												"dragstart"
												(fn
													this.dragStart
													image.id
												)
											}}
											{{on
												"dragover"
												(fn
													this.dragOver
													image.id
												)
											}}
											{{on
												"drop"
												(fn
													this.dropOnCell
													image.id
												)
											}}
											{{on
												"dragend"
												this.dragEnd
											}}
										>
											<img
												class="dt-i2p-thumb"
												src={{image.url}}
												alt={{image.file.name}}
											/>
											<div
												class="dt-i2p-cell-foot"
											>
												<span
													class="dt-i2p-badge"
												>{{image.file.name}}</span>
												<button
													type="button"
													class="dt-i2p-tool"
													title="Remove"
													{{on
														"click"
														(fn
															this.removeImage
															image
														)
													}}
												>
													<Icon
														@name="x"
													/>
												</button>
											</div>
										</li>
									{{/each}}
								</ol>
							{{/if}}
						</div>
					</TabsContent>

					<TabsContent
						class="dt-i2p-panel"
						@value="to-png"
					>
						<div
							{{on
								"drop"
								this.dropPdf
							}}
							{{on
								"dragover"
								this.allowDrop
							}}
						>
							{{#unless
								this.pdfBytes
							}}
								<label
									class="dt-i2p-drop"
								>
									<input
										type="file"
										accept={{PDF_ACCEPT}}
										class="dt-sr-only"
										{{on
											"change"
											this.choosePdf
										}}
									/>
									<Icon
										@name="upload"
									/>
									<span
										class="dt-i2p-drop-title"
									>Drop
										PDF
										here</span>
									<span
										class="dt-i2p-drop-hint"
									>click
										to
										select</span>
								</label>
							{{/unless}}

							{{#if this.pdfBytes}}
								<div
									class="dt-i2p-bar"
								>
									<div
										class="dt-i2p-info"
									>
										<span
											class="dt-i2p-count"
										>{{this.pdfInfoLabel}}</span>
									</div>
									<button
										type="button"
										class="dt-i2p-btn"
										{{on
											"click"
											this.clearPdf
										}}
									>
										<Icon
											@name="trash-2"
										/>
										Clear
									</button>
									<button
										type="button"
										class="dt-i2p-btn is-primary"
										disabled={{not
											this.canZip
										}}
										{{on
											"click"
											this.downloadZip
										}}
									>
										<Icon
											@name="download"
										/>
										Download
										zip
									</button>
								</div>

								<div
									class="dt-i2p-settings"
								>
									<div
										class="dt-i2p-field"
									>
										<span
										>Scale</span>
										<div
											class="segmented dt-i2p-scale"
										>
											{{#each
												SCALES
												key="value"
												as |option|
											}}
												<button
													type="button"
													class="dt-i2p-opt
														{{if
															(eq
																this.scale
																option.value
															)
															'is-active'
														}}"
													{{on
														"click"
														(fn
															this.setScale
															option.value
														)
													}}
												>{{option.label}}</button>
											{{/each}}
										</div>
									</div>
									{{#if
										this.rendering
									}}
										<div
											class="dt-i2p-field"
										>
											<span
											>Status</span>
											<span
												class="dt-i2p-status"
											>Rendering…</span>
										</div>
									{{/if}}
								</div>

								<ol
									class="dt-i2p-grid"
								>
									{{#each
										this.renders
										key="page"
										as |render|
									}}
										<li
											class="dt-i2p-cell"
										>
											<img
												class="dt-i2p-thumb"
												src={{render.url}}
												alt={{render.name}}
											/>
											<div
												class="dt-i2p-cell-foot"
											>
												<span
													class="dt-i2p-badge"
												>p.
													{{render.page}}</span>
												<button
													type="button"
													class="dt-i2p-tool"
													title="Download"
													{{on
														"click"
														(fn
															this.downloadPage
															render
														)
													}}
												>
													<Icon
														@name="download"
													/>
												</button>
											</div>
										</li>
									{{/each}}
								</ol>
							{{/if}}
						</div>
					</TabsContent>
				</Tabs>

				{{#if this.error}}
					<p
						class="dt-i2p-error"
					>{{this.error}}</p>
				{{/if}}
			</div>
		</div>
	</template>
}
