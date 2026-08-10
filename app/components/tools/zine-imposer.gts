import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { eq } from 'ember-truth-helpers';

import type { PDFDocument } from 'pdf-lib';

import Icon from 'delphitools-v2/components/icon';
import PaperSizeCombobox from 'delphitools-v2/components/ui/paper-size-combobox';
import { MM_TO_POINTS, PAPER_SIZES } from 'delphitools-v2/lib/imposition';
import { findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import {
	ZINE_FOLDS,
	buildFoldLayout,
	getFoldOption,
	type ZineFoldId,
	type ZineFoldLayout,
	type ZineSide,
} from 'delphitools-v2/lib/zine-folds';
import filePaste from 'delphitools-v2/modifiers/file-paste';

const DPI_OPTIONS = [72, 150, 300, 600];

/** Preview canvas resolution, in pixels per millimetre. */
const PREVIEW_SCALE = 2;

/** Bleed depth. 3mm is what UK and EU print shops ask for; US shops use 1/8in. */
const BLEED_MM = 3;

const FALLBACK_PAPER = PAPER_SIZES[0]!;

interface ZineImage {
	id: string;
	dataUrl: string;
	/** Decoded once at upload, so preview and PDF never wait on a load. */
	element: HTMLImageElement;
	fitMode: 'fit' | 'fill';
}

function loadImage(file: File): Promise<ZineImage> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const element = new Image();
			element.onload = () =>
				resolve({
					id: Math.random()
						.toString(36)
						.slice(2, 9),
					dataUrl: element.src,
					element,
					fitMode: 'fill',
				});
			element.onerror = reject;
			element.src = reader.result as string;
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

function drawImageInCell(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	targetX: number,
	targetY: number,
	targetWidth: number,
	targetHeight: number,
	fitMode: 'fit' | 'fill',
	rotation: number,
) {
	ctx.save();
	ctx.translate(targetX + targetWidth / 2, targetY + targetHeight / 2);
	ctx.rotate((rotation * Math.PI) / 180);

	const imgAspect = img.width / img.height;
	const targetAspect = targetWidth / targetHeight;

	let drawWidth = targetWidth;
	let drawHeight = targetHeight;
	let sourceX = 0;
	let sourceY = 0;
	let sourceWidth = img.width;
	let sourceHeight = img.height;

	if (fitMode === 'fit') {
		if (imgAspect > targetAspect) {
			drawHeight = targetWidth / imgAspect;
		} else {
			drawWidth = targetHeight * imgAspect;
		}
	} else if (imgAspect > targetAspect) {
		sourceWidth = img.height * targetAspect;
		sourceX = (img.width - sourceWidth) / 2;
	} else {
		sourceHeight = img.width / targetAspect;
		sourceY = (img.height - sourceHeight) / 2;
	}

	ctx.drawImage(
		img,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		-drawWidth / 2,
		-drawHeight / 2,
		drawWidth,
		drawHeight,
	);

	ctx.restore();
}

/** Fold creases (dashed grey) and, on the front only, cut lines (solid red). */
function drawGuides(
	ctx: CanvasRenderingContext2D,
	layout: ZineFoldLayout,
	side: ZineSide,
	width: number,
	height: number,
) {
	ctx.strokeStyle = '#888888';
	ctx.lineWidth = 1;
	ctx.setLineDash([8, 4]);

	for (const fold of layout.foldLines) {
		ctx.beginPath();
		if (fold.axis === 'v') {
			const x = fold.pos * width;
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
		} else {
			const y = fold.pos * height;
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
		}
		ctx.stroke();
	}

	ctx.setLineDash([]);

	if (side.side !== 'front') return;

	ctx.strokeStyle = '#cc0000';
	ctx.lineWidth = 2;
	for (const cut of layout.cutLines) {
		ctx.beginPath();
		ctx.moveTo(cut.x1 * width, cut.y1 * height);
		ctx.lineTo(cut.x2 * width, cut.y2 * height);
		ctx.stroke();

		const mx = ((cut.x1 + cut.x2) / 2) * width;
		const my = ((cut.y1 + cut.y2) / 2) * height;
		ctx.fillStyle = '#cc0000';
		ctx.font = 'bold 10px monospace';
		ctx.textAlign = 'center';
		ctx.fillText('✂ CUT', mx, my - 6);
	}
}

function drawPageNumbers(
	ctx: CanvasRenderingContext2D,
	side: ZineSide,
	cellWidth: number,
	cellHeight: number,
) {
	ctx.font = 'bold 24px monospace';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	for (const placement of side.placements) {
		ctx.save();
		ctx.translate(
			placement.col * cellWidth + cellWidth / 2,
			placement.row * cellHeight + cellHeight / 2,
		);
		ctx.rotate((placement.rotation * Math.PI) / 180);

		ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
		ctx.beginPath();
		ctx.arc(0, 0, 20, 0, Math.PI * 2);
		ctx.fill();

		ctx.fillStyle = '#ffffff';
		ctx.fillText(placement.page.toString(), 0, 0);

		ctx.restore();
	}
}

/** Centre-crop to the cell's aspect ratio, because pdf-lib cannot clip. */
function cropToAspect(img: HTMLImageElement, targetAspect: number): string {
	const imgAspect = img.width / img.height;
	let sourceX = 0;
	let sourceY = 0;
	let sourceWidth = img.width;
	let sourceHeight = img.height;

	if (imgAspect > targetAspect) {
		sourceWidth = img.height * targetAspect;
		sourceX = (img.width - sourceWidth) / 2;
	} else {
		sourceHeight = img.width / targetAspect;
		sourceY = (img.height - sourceHeight) / 2;
	}

	const canvas = document.createElement('canvas');
	canvas.width = sourceWidth;
	canvas.height = sourceHeight;
	canvas.getContext('2d')?.drawImage(
		img,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		sourceWidth,
		sourceHeight,
	);
	return canvas.toDataURL('image/png');
}

function embedImage(pdfDoc: PDFDocument, bytes: ArrayBuffer, isPng: boolean) {
	// A data URL's mime type is the only hint available, and a mislabelled
	// upload is common enough that the other decoder is worth a second try.
	return isPng
		? pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes))
		: pdfDoc.embedJpg(bytes).catch(() => pdfDoc.embedPng(bytes));
}

export default class ZineImposerTool extends Component {
	@tracked foldId: ZineFoldId = 'mini-8';
	@tracked panels = 8;
	@tracked doubleSided = false;
	@tracked split = false;
	@tracked paperSizeId = 'a4';
	@tracked bleedEnabled = false;
	@tracked selectedDpi = 300;
	@tracked isGenerating = false;
	@tracked draggedIndex: number | null = null;
	@tracked dragOverIndex: number | null = null;

	@tracked images: (ZineImage | null)[] = Array<ZineImage | null>(
		this.layout.pageCount,
	).fill(null);

	@cached
	get layout(): ZineFoldLayout {
		return buildFoldLayout(this.foldId, {
			panels: this.panels,
			doubleSided: this.doubleSided,
			split: this.split,
		});
	}

	get foldOption() {
		return getFoldOption(this.foldId);
	}

	get panelOptions() {
		return this.foldOption.panelOptions ?? [];
	}

	get hasOptions() {
		const {
			configurablePanels,
			supportsDoubleSided,
			supportsSplit,
		} = this.foldOption;
		return (
			configurablePanels ||
			supportsDoubleSided ||
			supportsSplit
		);
	}

	get isDuplex() {
		return this.layout.sides.length > 1;
	}

	get duplexLabel() {
		return this.layout.duplexFlip === 'long-edge'
			? 'long edge'
			: 'short edge';
	}

	get paperSize() {
		return findPaperSize(this.paperSizeId) ?? FALLBACK_PAPER;
	}

	// The sheet is always printed landscape, whichever way round the size reads.
	get sheetWidthMm() {
		return Math.max(
			this.paperSize.widthMm,
			this.paperSize.heightMm,
		);
	}

	get sheetHeightMm() {
		return Math.min(
			this.paperSize.widthMm,
			this.paperSize.heightMm,
		);
	}

	get imageCount() {
		return this.images.filter((img) => img !== null).length;
	}

	get slots() {
		return this.images.map((image, index) => ({
			image,
			index,
			number: index + 1,
			// wording carried over from the Next app
			alt: `Page ${index + 1}`,
		}));
	}

	get generateDisabled() {
		return this.imageCount === 0 || this.isGenerating;
	}

	get doubleSidedHint() {
		// wording carried over from the Next app
		return this.doubleSided
			? `Front + back · print flip on ${this.duplexLabel}`
			: 'Single side · fold-out strip';
	}

	get splitHint() {
		// wording carried over from the Next app
		return this.split
			? 'Two copies stacked · cut in half · shorter panels'
			: 'One full-height strip';
	}

	get sideRanges() {
		if (!this.isDuplex) return '';
		const parts = this.layout.sides.map((side) => {
			const pages = side.placements.map((p) => p.page);
			return `${side.side} ${Math.min(...pages)}–${Math.max(...pages)}`;
		});
		return ` · ${parts.join(', ')}`;
	}

	get pageStats() {
		const widthMm = this.sheetWidthMm / this.layout.cols;
		const heightMm = this.sheetHeightMm / this.layout.rows;
		const widthPx = Math.round((widthMm / 25.4) * this.selectedDpi);
		const heightPx = Math.round(
			(heightMm / 25.4) * this.selectedDpi,
		);
		return {
			mm: `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm`,
			px: `${widthPx} × ${heightPx} px @ ${this.selectedDpi} dpi`,
			ratio: `${(widthMm / heightMm).toFixed(3)}:1`,
			orientation:
				widthMm < heightMm ? 'Portrait' : 'Landscape',
		};
	}

	get previewNote() {
		// wording carried over from the Next app
		const base = this.isDuplex
			? `Double-sided print. Print both pages, flip on the ${this.duplexLabel}.`
			: 'Single-sided print.';
		return this.layout.cutLines.length > 0
			? `${base} The red line shows where to cut.`
			: base;
	}

	@cached
	get previews() {
		if (!this.images.some((img) => img !== null)) return [];

		const layout = this.layout;
		const sheetWidthPx = this.sheetWidthMm * PREVIEW_SCALE;
		const sheetHeightPx = this.sheetHeightMm * PREVIEW_SCALE;
		const cellWidthPx = sheetWidthPx / layout.cols;
		const cellHeightPx = sheetHeightPx / layout.rows;

		return layout.sides.map((side) => {
			const canvas = document.createElement('canvas');
			canvas.width = sheetWidthPx;
			canvas.height = sheetHeightPx;
			const ctx = canvas.getContext('2d');
			const alt = `Zine imposition preview ${side.side}`;
			if (!ctx) return { side: side.side, alt, src: '' };

			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);

			for (const placement of side.placements) {
				const zineImage =
					this.images[placement.page - 1];
				if (!zineImage) continue;
				drawImageInCell(
					ctx,
					zineImage.element,
					placement.col * cellWidthPx,
					placement.row * cellHeightPx,
					cellWidthPx,
					cellHeightPx,
					zineImage.fitMode,
					placement.rotation,
				);
			}

			drawGuides(
				ctx,
				layout,
				side,
				sheetWidthPx,
				sheetHeightPx,
			);
			drawPageNumbers(ctx, side, cellWidthPx, cellHeightPx);

			return {
				side: side.side,
				alt,
				src: canvas.toDataURL(),
			};
		});
	}

	/** Keep the slot array the length the fold asks for, preserving what fits. */
	#resizeSlots() {
		const count = this.layout.pageCount;
		if (this.images.length === count) return;
		const next = Array<ZineImage | null>(count).fill(null);
		for (let i = 0; i < Math.min(this.images.length, count); i++) {
			next[i] = this.images[i] ?? null;
		}
		this.images = next;
	}

	#setAt(index: number, image: ZineImage | null) {
		const next = [...this.images];
		next[index] = image;
		this.images = next;
	}

	setFold = (id: ZineFoldId) => {
		this.foldId = id;
		this.#resizeSlots();
	};

	setPanels = (count: number) => {
		this.panels = count;
		this.#resizeSlots();
	};

	setDoubleSided = (event: Event) => {
		this.doubleSided = (event.target as HTMLInputElement).checked;
		this.#resizeSlots();
	};

	setSplit = (event: Event) => {
		this.split = (event.target as HTMLInputElement).checked;
		this.#resizeSlots();
	};

	setPaperSize = (id: string) => {
		this.paperSizeId = id;
	};

	setDpi = (dpi: number) => {
		this.selectedDpi = dpi;
	};

	setBleed = (event: Event) => {
		this.bleedEnabled = (event.target as HTMLInputElement).checked;
	};

	clearAll = () => {
		this.images = Array<ZineImage | null>(
			this.layout.pageCount,
		).fill(null);
	};

	removeImage = (index: number) => {
		this.#setAt(index, null);
	};

	toggleFitMode = (index: number) => {
		const image = this.images[index];
		if (!image) return;
		this.#setAt(index, {
			...image,
			fitMode: image.fitMode === 'fit' ? 'fill' : 'fit',
		});
	};

	async #place(index: number, file: File) {
		try {
			this.#setAt(index, await loadImage(file));
		} catch {
			// An undecodable file leaves the slot as it was.
		}
	}

	/** Fill the empty slots in order, skipping whatever failed to decode. */
	async #fill(files: FileList | null) {
		const imageFiles = Array.from(files ?? []).filter((f) =>
			f.type.startsWith('image/'),
		);
		if (imageFiles.length === 0) return;

		const settled = await Promise.all(
			imageFiles.map((file) =>
				loadImage(file).catch(() => null),
			),
		);
		const loaded = settled.filter(
			(img): img is ZineImage => img !== null,
		);
		if (loaded.length === 0) return;

		const next = [...this.images];
		let slot = 0;
		for (const image of loaded) {
			while (slot < next.length && next[slot] !== null)
				slot++;
			if (slot >= next.length) break;
			next[slot++] = image;
		}
		this.images = next;
	}

	pasteFile = (file: File) => {
		const empty = this.images.findIndex((img) => img === null);
		if (empty === -1) return;
		void this.#place(empty, file);
	};

	selectForSlot = (index: number, event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// Cleared so the same file can be picked again.
		input.value = '';
		if (file?.type.startsWith('image/'))
			void this.#place(index, file);
	};

	selectBulk = (event: Event) => {
		const input = event.target as HTMLInputElement;
		void this.#fill(input.files);
		input.value = '';
	};

	dropBulk = (event: DragEvent) => {
		event.preventDefault();
		void this.#fill(event.dataTransfer?.files ?? null);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	dragStart = (index: number, event: DragEvent) => {
		if (!this.images[index]) return;
		this.draggedIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(index));
		}
	};

	dragOver = (index: number, event: DragEvent) => {
		event.preventDefault();
		if (this.draggedIndex === index) return;
		this.dragOverIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect =
				this.draggedIndex === null ? 'copy' : 'move';
		}
	};

	dragLeave = () => {
		this.dragOverIndex = null;
	};

	dragEnd = () => {
		this.draggedIndex = null;
		this.dragOverIndex = null;
	};

	drop = (index: number, event: DragEvent) => {
		event.preventDefault();
		this.dragOverIndex = null;

		const file = event.dataTransfer?.files[0];
		if (file) {
			if (file.type.startsWith('image/'))
				void this.#place(index, file);
			this.draggedIndex = null;
			return;
		}

		const from = this.draggedIndex;
		this.draggedIndex = null;
		if (from === null || from === index) return;

		const next = [...this.images];
		next[from] = this.images[index] ?? null;
		next[index] = this.images[from] ?? null;
		this.images = next;
	};

	generatePdf = async () => {
		this.isGenerating = true;

		try {
			const { PDFDocument, degrees } =
				await import('pdf-lib');
			const pdfDoc = await PDFDocument.create();

			const layout = this.layout;
			const sheetWidthPt = this.sheetWidthMm * MM_TO_POINTS;
			const sheetHeightPt = this.sheetHeightMm * MM_TO_POINTS;
			const cellWidthPt = sheetWidthPt / layout.cols;
			const cellHeightPt = sheetHeightPt / layout.rows;
			const targetAspect = cellWidthPt / cellHeightPt;

			// With bleed on, the page grows by the bleed on all four sides
			// and the sheet sits inside it, so artwork on an outer panel can
			// run past the trim line. The margin is outside every cell, so
			// nothing a panel draws into it can reach a neighbour.
			const bleedPt = this.bleedEnabled
				? BLEED_MM * MM_TO_POINTS
				: 0;
			const pageWidthPt = sheetWidthPt + bleedPt * 2;
			const pageHeightPt = sheetHeightPt + bleedPt * 2;

			for (const side of layout.sides) {
				const page = pdfDoc.addPage([
					pageWidthPt,
					pageHeightPt,
				]);
				if (bleedPt) {
					// Where the sheet actually gets cut. A print shop reads
					// this rather than guessing from the page size.
					page.setTrimBox(
						bleedPt,
						bleedPt,
						sheetWidthPt,
						sheetHeightPt,
					);
					page.setBleedBox(
						0,
						0,
						pageWidthPt,
						pageHeightPt,
					);
				}

				for (const placement of side.placements) {
					const zineImage =
						this.images[placement.page - 1];
					if (!zineImage) continue;

					// Only the sides of this cell that sit on the sheet's
					// own edge get bleed. An interior edge is a fold or a
					// cut between two panels, and both sides of it are
					// already covered by artwork.
					const out = bleedPt
						? {
								left:
									placement.col ===
									0
										? bleedPt
										: 0,
								right:
									placement.col ===
									layout.cols -
										1
										? bleedPt
										: 0,
								top:
									placement.row ===
									0
										? bleedPt
										: 0,
								bottom:
									placement.row ===
									layout.rows -
										1
										? bleedPt
										: 0,
							}
						: {
								left: 0,
								right: 0,
								top: 0,
								bottom: 0,
							};

					const boxWidthPt =
						cellWidthPt +
						out.left +
						out.right;
					const boxHeightPt =
						cellHeightPt +
						out.top +
						out.bottom;
					const boxAspect =
						boxWidthPt / boxHeightPt;

					// fill crops the source to the box it has to cover, so
					// growing the box for bleed crops slightly less rather
					// than stretching. fit letterboxes inside the cell and
					// never reaches an edge, so bleed cannot apply to it.
					const dataUrl =
						zineImage.fitMode === 'fill'
							? cropToAspect(
									zineImage.element,
									boxAspect,
								)
							: zineImage.dataUrl;
					const bytes = await fetch(dataUrl).then(
						(r) => r.arrayBuffer(),
					);
					const embedded = await embedImage(
						pdfDoc,
						bytes,
						dataUrl.includes('image/png'),
					);

					// The PDF origin is bottom-left; row 0 is the top
					// row. Everything shifts by the bleed, because the
					// sheet now sits inside a larger page.
					const cellX =
						bleedPt +
						placement.col * cellWidthPt;
					const cellY =
						bleedPt +
						(layout.rows -
							1 -
							placement.row) *
							cellHeightPt;

					let drawWidth = boxWidthPt;
					let drawHeight = boxHeightPt;
					let drawX = cellX - out.left;
					let drawY = cellY - out.bottom;

					if (zineImage.fitMode === 'fit') {
						const imgAspect =
							embedded.width /
							embedded.height;
						drawWidth = cellWidthPt;
						drawHeight = cellHeightPt;
						if (imgAspect > targetAspect) {
							drawHeight =
								cellWidthPt /
								imgAspect;
						} else {
							drawWidth =
								cellHeightPt *
								imgAspect;
						}
						drawX =
							cellX +
							(cellWidthPt -
								drawWidth) /
								2;
						drawY =
							cellY +
							(cellHeightPt -
								drawHeight) /
								2;
					}

					if (placement.rotation === 180) {
						// pdf-lib rotates about the origin it is given,
						// so a 180 draw starts from the far corner.
						page.drawImage(embedded, {
							x: drawX + drawWidth,
							y: drawY + drawHeight,
							width: drawWidth,
							height: drawHeight,
							rotate: degrees(180),
						});
					} else {
						page.drawImage(embedded, {
							x: drawX,
							y: drawY,
							width: drawWidth,
							height: drawHeight,
						});
					}
				}
			}

			// Copied into a fresh buffer: pdf-lib types its output over
			// ArrayBufferLike, which BlobPart does not accept.
			const blob = new Blob(
				[new Uint8Array(await pdfDoc.save())],
				{
					type: 'application/pdf',
				},
			);
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = [
				`zine-${this.foldId}-${this.paperSize.id}`,
				this.isDuplex ? '-duplex' : '',
				this.bleedEnabled ? '-bleed' : '',
				'.pdf',
			].join('');
			link.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('zine pdf generation failed', err);
		} finally {
			this.isGenerating = false;
		}
	};

	<template>
		<div
			class="dt-zine"
			{{filePaste this.pasteFile accept="image/*"}}
		>
			<div class="dt-zine-panel">
				<div class="dt-zine-folds">
					{{! wording carried over from the Next app }}
					<span class="dt-zine-title">Fold type</span>
					<div
						class="segmented dt-zine-fold-tabs"
						role="group"
						aria-label="Fold type"
					>
						{{#each
							ZINE_FOLDS key="id"
							as |fold|
						}}
							<button
								type="button"
								aria-pressed={{if
									(eq
										fold.id
										this.foldId
									)
									"true"
									"false"
								}}
								class="dt-zine-fold
									{{if
										(eq
											fold.id
											this.foldId
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setFold
										fold.id
									)
								}}
							>
								{{#if
									(eq
										fold.id
										"accordion"
									)
								}}
									<svg
										class="dt-zine-glyph"
										viewBox="0 0 44 28"
										fill="none"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linejoin="round"
										stroke-linecap="round"
										aria-hidden="true"
									><polyline
											points="3,23 11,5 19,23 27,5 35,23 42,9"
										/></svg>
								{{else}}
									<svg
										class="dt-zine-glyph"
										viewBox="0 0 44 28"
										fill="none"
										stroke="currentColor"
										aria-hidden="true"
									><rect
											x="2"
											y="2"
											width="40"
											height="24"
											stroke-width="1.6"
										/><path
											d="M12 2v24M22 2v24M32 2v24M2 14h40"
											stroke-width="1"
											opacity="0.55"
										/><path
											d="M12 14h20"
											stroke-width="2.6"
											stroke-linecap="round"
										/></svg>
								{{/if}}
								<span
									class="dt-zine-fold-text"
								>
									<span
										class="dt-zine-fold-name"
									>{{fold.name}}</span>
									<span
										class="dt-zine-fold-tagline"
									>{{fold.tagline}}</span>
								</span>
							</button>
						{{/each}}
					</div>
				</div>

				<div class="dt-zine-setup">
					<div class="dt-zine-options">
						{{! wording carried over from the Next app }}
						<span
							class="dt-zine-title"
						>Options</span>
						<p
							class="dt-zine-note"
						>{{this.foldOption.description}}</p>

						{{#if this.hasOptions}}
							{{#if
								this.foldOption.configurablePanels
							}}
								<div
									class="dt-zine-field"
								>
									{{! wording carried over from the Next app }}
									<span
										class="dt-zine-label"
									>Panels</span>
									<div
										class="segmented dt-zine-segments"
										role="radiogroup"
										aria-label="Panels"
									>
										{{#each
											this.panelOptions
											key="@index"
											as |count|
										}}
											<button
												type="button"
												role="radio"
												aria-checked={{if
													(eq
														count
														this.panels
													)
													"true"
													"false"
												}}
												class="dt-zine-segment
													{{if
														(eq
															count
															this.panels
														)
														'is-active'
													}}"
												{{on
													"click"
													(fn
														this.setPanels
														count
													)
												}}
											>{{count}}</button>
										{{/each}}
									</div>
								</div>
							{{/if}}

							{{#if
								this.foldOption.supportsDoubleSided
							}}
								<div
									class="dt-zine-switch-row"
								>
									<label
										class="dt-zine-switch-text"
										for="zine-double-sided"
									>
										{{! wording carried over from the Next app }}
										<span
											class="dt-zine-switch-label"
										>Double-sided</span>
										<span
											class="dt-zine-switch-hint"
										>{{this.doubleSidedHint}}</span>
									</label>
									<input
										id="zine-double-sided"
										type="checkbox"
										class="dt-zine-switch"
										checked={{this.doubleSided}}
										{{on
											"change"
											this.setDoubleSided
										}}
									/>
								</div>
							{{/if}}

							{{#if
								this.foldOption.supportsSplit
							}}
								<div
									class="dt-zine-switch-row"
								>
									<label
										class="dt-zine-switch-text"
										for="zine-split"
									>
										{{! wording carried over from the Next app }}
										<span
											class="dt-zine-switch-label"
										>Split
											in
											half
											(two-up)</span>
										<span
											class="dt-zine-switch-hint"
										>{{this.splitHint}}</span>
									</label>
									<input
										id="zine-split"
										type="checkbox"
										class="dt-zine-switch"
										checked={{this.split}}
										{{on
											"change"
											this.setSplit
										}}
									/>
								</div>
							{{/if}}
						{{else}}
							{{! wording carried over from the Next app }}
							<p
								class="dt-zine-hint"
							>Fixed
								{{this.layout.pageCount}}-page
								layout — no
								options to set.</p>
						{{/if}}
					</div>

					<div class="dt-zine-output">
						{{! wording carried over from the Next app }}
						<span
							class="dt-zine-title"
						>Sheet & output</span>

						<div class="dt-zine-field">
							{{! wording carried over from the Next app }}
							<span
								class="dt-zine-label"
							>Paper size</span>
							<PaperSizeCombobox
								@value={{this.paperSizeId}}
								@onValueChange={{this.setPaperSize}}
								@triggerClass="dt-zine-combo"
							/>
						</div>

						<div class="dt-zine-field">
							{{! wording carried over from the Next app }}
							<span
								class="dt-zine-label"
							>Reference DPI</span>
							<div
								class="segmented dt-zine-segments"
								role="radiogroup"
								aria-label="Reference DPI"
							>
								{{#each
									DPI_OPTIONS
									key="@index"
									as |dpi|
								}}
									<button
										type="button"
										role="radio"
										aria-checked={{if
											(eq
												dpi
												this.selectedDpi
											)
											"true"
											"false"
										}}
										class="dt-zine-segment
											{{if
												(eq
													dpi
													this.selectedDpi
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setDpi
												dpi
											)
										}}
									>{{dpi}}</button>
								{{/each}}
							</div>
						</div>

						<div class="dt-zine-switch-row">
							{{! wording carried over from the Next app }}
							<label
								class="dt-zine-switch-label"
								for="zine-bleed"
							>Add 3mm bleed</label>
							<input
								id="zine-bleed"
								type="checkbox"
								class="dt-zine-switch"
								checked={{this.bleedEnabled}}
								{{on
									"change"
									this.setBleed
								}}
							/>
						</div>
					</div>
				</div>

				<div class="dt-zine-stats">
					{{! wording carried over from the Next app }}
					<span class="dt-zine-label">Each page</span>
					<span
						class="dt-zine-stat is-strong"
					>{{this.pageStats.mm}}</span>
					<span
						class="dt-zine-stat"
					>{{this.pageStats.px}}</span>
					<span
						class="dt-zine-stat"
					>{{this.pageStats.ratio}}</span>
					<span
						class="dt-zine-stat"
					>{{this.pageStats.orientation}}</span>
				</div>
			</div>

			<label
				class="dt-zine-bulk"
				{{on "drop" this.dropBulk}}
				{{on "dragover" this.allowDrop}}
			>
				<input
					type="file"
					accept="image/*"
					multiple
					class="dt-sr-only"
					{{on "change" this.selectBulk}}
				/>
				<Icon @name="upload" />
				{{! wording carried over from the Next app }}
				<span class="dt-zine-bulk-title">Drop images
					here to fill empty slots</span>
				{{! wording carried over from the Next app }}
				<span class="dt-zine-bulk-hint">or click to
					select multiple files, or paste</span>
			</label>

			<div class="dt-zine-panel">
				<div class="dt-zine-grid-head">
					{{! wording carried over from the Next app }}
					<span class="dt-zine-title">Zine pages
						<span class="dt-zine-subtle">·
							drag to reorder</span></span>
					<div class="dt-zine-grid-actions">
						{{! wording carried over from the Next app }}
						<span
							class="dt-zine-subtle"
						>{{this.imageCount}}/{{this.layout.pageCount}}
							filled{{this.sideRanges}}</span>
						{{#if this.imageCount}}
							{{! wording carried over from the Next app }}
							<button
								type="button"
								class="dt-zine-clear"
								{{on
									"click"
									this.clearAll
								}}
							>Clear all</button>
						{{/if}}
					</div>
				</div>

				<div class="dt-zine-grid">
					{{#each
						this.slots key="index"
						as |slot|
					}}
						{{#if slot.image}}
							<div
								class="dt-zine-slot is-filled
									{{if
										(eq
											this.draggedIndex
											slot.index
										)
										'is-dragging'
									}}
									{{if
										(eq
											this.dragOverIndex
											slot.index
										)
										'is-over'
									}}"
								draggable="true"
								{{on
									"dragstart"
									(fn
										this.dragStart
										slot.index
									)
								}}
								{{on
									"dragover"
									(fn
										this.dragOver
										slot.index
									)
								}}
								{{on
									"dragleave"
									this.dragLeave
								}}
								{{on
									"drop"
									(fn
										this.drop
										slot.index
									)
								}}
								{{on
									"dragend"
									this.dragEnd
								}}
							>
								<img
									class="dt-zine-thumb
										{{if
											(eq
												slot.image.fitMode
												'fill'
											)
											'is-fill'
										}}"
									src={{slot.image.dataUrl}}
									alt={{slot.alt}}
								/>
								<div
									class="dt-zine-overlay"
								>
									<Icon
										@name="grip-vertical"
										class="dt-zine-grip"
									/>
									<span
										class="dt-zine-number"
									>{{slot.number}}</span>
									<div
										class="dt-zine-slot-actions"
									>
										<button
											type="button"
											class="dt-zine-fit"
											{{on
												"click"
												(fn
													this.toggleFitMode
													slot.index
												)
											}}
										>
											{{#if
												(eq
													slot.image.fitMode
													"fill"
												)
											}}
												<Icon
													@name="minimize"
												/>
												Fit
											{{else}}
												<Icon
													@name="maximize"
												/>
												Fill
											{{/if}}
										</button>
										<button
											type="button"
											class="dt-zine-remove"
											aria-label="Remove"
											{{on
												"click"
												(fn
													this.removeImage
													slot.index
												)
											}}
										>
											<Icon
												@name="x"
											/>
										</button>
									</div>
								</div>
							</div>
						{{else}}
							<label
								class="dt-zine-slot is-empty
									{{if
										(eq
											this.dragOverIndex
											slot.index
										)
										'is-over'
									}}"
								{{on
									"dragover"
									(fn
										this.dragOver
										slot.index
									)
								}}
								{{on
									"dragleave"
									this.dragLeave
								}}
								{{on
									"drop"
									(fn
										this.drop
										slot.index
									)
								}}
							>
								<input
									type="file"
									accept="image/*"
									class="dt-sr-only"
									{{on
										"change"
										(fn
											this.selectForSlot
											slot.index
										)
									}}
								/>
								<Icon
									@name="upload"
								/>
								{{! wording carried over from the Next app }}
								<span
									class="dt-zine-slot-label"
								>Page
									{{slot.number}}</span>
							</label>
						{{/if}}
					{{/each}}
				</div>
			</div>

			{{#if this.previews.length}}
				<div class="dt-zine-panel">
					<div class="dt-zine-preview-head">
						{{! wording carried over from the Next app }}
						<span
							class="dt-zine-title"
						>Imposition Preview</span>
						<p
							class="dt-zine-note"
						>{{this.previewNote}}</p>
					</div>
					<div
						class="dt-zine-previews
							{{if
								this.isDuplex
								'is-duplex'
							}}"
					>
						{{#each
							this.previews key="side"
							as |preview|
						}}
							<div
								class="dt-zine-preview"
							>
								{{#if
									this.isDuplex
								}}
									<span
										class="dt-zine-preview-label"
									>{{preview.side}}</span>
								{{/if}}
								<img
									src={{preview.src}}
									alt={{preview.alt}}
								/>
							</div>
						{{/each}}
					</div>
				</div>
			{{/if}}

			<button
				type="button"
				class="dt-zine-generate"
				disabled={{this.generateDisabled}}
				{{on "click" this.generatePdf}}
			>
				{{#if this.isGenerating}}
					{{! wording carried over from the Next app }}
					Generating PDF...
				{{else}}
					<Icon @name="download" />
					{{! wording carried over from the Next app }}
					Download Zine PDF
				{{/if}}
			</button>

			<div class="dt-zine-panel">
				{{! wording carried over from the Next app }}
				<p class="dt-zine-steps-title">How to fold your
					zine:</p>
				<ol class="dt-zine-steps">
					{{#each
						this.layout.instructions
						key="@index"
						as |step|
					}}
						<li>{{step}}</li>
					{{/each}}
				</ol>
			</div>
		</div>
	</template>
}
