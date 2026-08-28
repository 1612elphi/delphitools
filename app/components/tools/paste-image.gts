import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadUrl } from 'delphitools-v2/lib/download';

export interface CropArea {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type DragMode =
	'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'move';

const MIN_CROP = 20;

// room needed for badge
const BADGE_MIN_WIDTH = 50;
const BADGE_MIN_HEIGHT = 30;

// crop coords are display px
const RESIZE_DEBOUNCE_MS = 150;

const RULE_OF_THIRDS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const HANDLES: { mode: DragMode; className: string }[] = [
	{ mode: 'move', className: 'is-move' },
	{ mode: 'n', className: 'is-n' },
	{ mode: 's', className: 'is-s' },
	{ mode: 'w', className: 'is-w' },
	{ mode: 'e', className: 'is-e' },
	{ mode: 'nw', className: 'is-nw' },
	{ mode: 'ne', className: 'is-ne' },
	{ mode: 'sw', className: 'is-sw' },
	{ mode: 'se', className: 'is-se' },
];

interface Shot {
	url: string;
	type: string;
}

export function resizeCrop(
	mode: DragMode,
	initial: CropArea,
	dx: number,
	dy: number,
	maxWidth: number,
	maxHeight: number,
): CropArea {
	let { x, y, width, height } = initial;

	if (mode === 'move') {
		return {
			x: Math.max(0, Math.min(x + dx, maxWidth - width)),
			y: Math.max(0, Math.min(y + dy, maxHeight - height)),
			width,
			height,
		};
	}

	if (mode.includes('n')) {
		const proposedY = y + dy;
		const proposedHeight = height - dy;
		if (proposedHeight >= MIN_CROP && proposedY >= 0) {
			y = proposedY;
			height = proposedHeight;
		} else if (proposedY < 0) {
			y = 0;
			height = initial.y + initial.height;
		}
	} else if (mode.includes('s')) {
		const proposedHeight = height + dy;
		if (
			proposedHeight >= MIN_CROP &&
			y + proposedHeight <= maxHeight
		) {
			height = proposedHeight;
		} else if (y + proposedHeight > maxHeight) {
			height = maxHeight - y;
		}
	}

	if (mode.includes('w')) {
		const proposedX = x + dx;
		const proposedWidth = width - dx;
		if (proposedWidth >= MIN_CROP && proposedX >= 0) {
			x = proposedX;
			width = proposedWidth;
		} else if (proposedX < 0) {
			x = 0;
			width = initial.x + initial.width;
		}
	} else if (mode.includes('e')) {
		const proposedWidth = width + dx;
		if (
			proposedWidth >= MIN_CROP &&
			x + proposedWidth <= maxWidth
		) {
			width = proposedWidth;
		} else if (x + proposedWidth > maxWidth) {
			width = maxWidth - x;
		}
	}

	return { x, y, width, height };
}

export function extensionFor(type: string): string {
	const subtype = type.split('/')[1]?.replace(/\+.*$/, '') ?? 'png';
	return subtype === 'jpeg' ? 'jpg' : subtype;
}

export function downloadName(date: Date, type: string): string {
	return `delphitools-paste-image-${date.toLocaleDateString('en-CA')}.${extensionFor(type)}`;
}

export default class PasteImageTool extends Component {
	@tracked current: Shot | null = null;
	@tracked original: Shot | null = null;
	@tracked isCropping = false;
	@tracked crop: CropArea | null = null;

	// natural px per display px
	@tracked scaleX = 1;
	@tracked scaleY = 1;

	#image: HTMLImageElement | null = null;
	#canvas: HTMLCanvasElement | null = null;
	#urls = new Set<string>();
	#frame: number | null = null;
	#resizeTimer?: ReturnType<typeof setTimeout>;
	#dragMode: DragMode | null = null;
	#dragOrigin = { x: 0, y: 0 };
	#dragStartCrop: CropArea | null = null;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		window.addEventListener('resize', this.onResize);
	}

	willDestroy() {
		super.willDestroy();
		window.removeEventListener('resize', this.onResize);
		clearTimeout(this.#resizeTimer);
		if (this.#frame !== null) cancelAnimationFrame(this.#frame);
		this.#releaseAll();
	}

	registerImage = modifier((element: HTMLImageElement) => {
		this.#image = element;
		return () => {
			if (this.#image === element) this.#image = null;
		};
	});

	registerCanvas = modifier((element: HTMLCanvasElement) => {
		this.#canvas = element;
		return () => {
			if (this.#canvas === element) this.#canvas = null;
		};
	});

	get handles() {
		return HANDLES;
	}

	get gridCells() {
		return RULE_OF_THIRDS;
	}

	get imageUrl() {
		return this.current?.url ?? null;
	}

	get isEdited() {
		return (
			this.current != null &&
			this.original != null &&
			this.current.url !== this.original.url
		);
	}

	get showCrop() {
		return this.isCropping && this.crop != null;
	}

	get cropStyle() {
		const crop = this.crop;
		if (!crop) return htmlSafe('');
		return htmlSafe(
			`left: ${crop.x}px; top: ${crop.y}px; width: ${crop.width}px; height: ${crop.height}px`,
		);
	}

	get showBadge() {
		const crop = this.crop;
		return (
			crop != null &&
			crop.width > BADGE_MIN_WIDTH &&
			crop.height > BADGE_MIN_HEIGHT
		);
	}

	get badge() {
		const crop = this.crop;
		if (!crop) return '';
		const width = Math.round(crop.width * this.scaleX);
		const height = Math.round(crop.height * this.scaleY);
		return `${width} × ${height} px`;
	}

	#createUrl(blob: Blob): string {
		const url = URL.createObjectURL(blob);
		this.#urls.add(url);
		return url;
	}

	#release(url: string | null | undefined) {
		if (!url || !this.#urls.has(url)) return;
		URL.revokeObjectURL(url);
		this.#urls.delete(url);
	}

	#releaseAll() {
		for (const url of this.#urls) URL.revokeObjectURL(url);
		this.#urls.clear();
	}

	readFile = (file: File) => {
		this.#releaseAll();
		const shot = {
			url: this.#createUrl(file),
			type: file.type || 'image/png',
		};
		this.current = shot;
		this.original = shot;
		this.stopCropping();
	};

	onResize = () => {
		clearTimeout(this.#resizeTimer);
		this.#resizeTimer = setTimeout(() => {
			if (this.isCropping) this.stopCropping();
		}, RESIZE_DEBOUNCE_MS);
	};

	startCropping = () => {
		const image = this.#image;
		if (!image || image.width === 0) return;
		this.crop = {
			x: 0,
			y: 0,
			width: image.width,
			height: image.height,
		};
		this.scaleX = image.naturalWidth / image.width;
		this.scaleY = image.naturalHeight / image.height;
		this.isCropping = true;
	};

	stopCropping = () => {
		this.isCropping = false;
		this.crop = null;
	};

	// capture keeps drag events here
	startDrag = (mode: DragMode, event: PointerEvent) => {
		if (!this.crop) return;
		event.preventDefault();
		event.stopPropagation();
		this.#dragMode = mode;
		this.#dragOrigin = { x: event.clientX, y: event.clientY };
		this.#dragStartCrop = { ...this.crop };
		(event.currentTarget as HTMLElement).setPointerCapture(
			event.pointerId,
		);
	};

	moveDrag = (event: PointerEvent) => {
		const mode = this.#dragMode;
		const initial = this.#dragStartCrop;
		const image = this.#image;
		if (!mode || !initial || !image) return;
		if (event.cancelable) event.preventDefault();

		const dx = event.clientX - this.#dragOrigin.x;
		const dy = event.clientY - this.#dragOrigin.y;
		const next = resizeCrop(
			mode,
			initial,
			dx,
			dy,
			image.width,
			image.height,
		);

		if (this.#frame !== null) return;
		this.#frame = requestAnimationFrame(() => {
			this.crop = next;
			this.#frame = null;
		});
	};

	endDrag = () => {
		if (this.#frame !== null) {
			cancelAnimationFrame(this.#frame);
			this.#frame = null;
		}
		this.#dragMode = null;
		this.#dragStartCrop = null;
	};

	applyCrop = () => {
		const crop = this.crop;
		const image = this.#image;
		const canvas = this.#canvas;
		if (!crop || !image || !canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const scaleX = image.naturalWidth / image.width;
		const scaleY = image.naturalHeight / image.height;

		canvas.width = crop.width * scaleX;
		canvas.height = crop.height * scaleY;

		ctx.drawImage(
			image,
			crop.x * scaleX,
			crop.y * scaleY,
			crop.width * scaleX,
			crop.height * scaleY,
			0,
			0,
			canvas.width,
			canvas.height,
		);

		canvas.toBlob((blob) => {
			if (!blob) return;
			const previous = this.current;
			if (previous && previous.url !== this.original?.url) {
				this.#release(previous.url);
			}
			this.current = {
				url: this.#createUrl(blob),
				type: 'image/png',
			};
			this.stopCropping();
		}, 'image/png');
	};

	download = () => {
		const shot = this.current;
		if (!shot) return;
		downloadUrl(shot.url, downloadName(new Date(), shot.type));
	};

	reset = () => {
		const previous = this.current;
		if (previous && previous.url !== this.original?.url) {
			this.#release(previous.url);
		}
		this.current = this.original;
		this.stopCropping();
	};

	clear = () => {
		this.#releaseAll();
		this.current = null;
		this.original = null;
		this.stopCropping();
	};

	<template>
		<div class="dt-pi" {{filePaste this.readFile accept="image/*"}}>
			<canvas
				class="dt-pi-canvas"
				{{this.registerCanvas}}
			></canvas>

			<div class="dt-pi-frame">
				{{#if this.imageUrl}}
					<div class="dt-pi-bar">
						{{#if this.isCropping}}
							<button
								type="button"
								class="dt-pi-btn is-primary"
								{{on
									"click"
									this.applyCrop
								}}
							>
								<Icon
									@name="check"
								/>
								Apply Crop
							</button>
							<button
								type="button"
								class="dt-pi-btn"
								{{on
									"click"
									this.stopCropping
								}}
							>
								Cancel
							</button>
						{{else}}
							<button
								type="button"
								class="dt-pi-btn"
								{{on
									"click"
									this.startCropping
								}}
							>
								<Icon
									@name="scissors"
								/>
								Crop
							</button>
							{{#if this.isEdited}}
								<button
									type="button"
									class="dt-pi-btn"
									{{on
										"click"
										this.reset
									}}
								>
									<Icon
										@name="rotate-ccw"
									/>
									Reset
								</button>
							{{/if}}
							<span
								class="dt-pi-spacer"
							></span>
							<button
								type="button"
								class="dt-pi-btn is-trailing"
								{{on
									"click"
									this.clear
								}}
							>
								<Icon
									@name="x"
								/>
								Clear
							</button>
							<button
								type="button"
								class="dt-pi-btn is-trailing is-primary"
								{{on
									"click"
									this.download
								}}
							>
								<DownloadLabel
									@label="Download PNG"
								/>
							</button>
						{{/if}}
					</div>

					<div class="dt-pi-stage">
						<div class="dt-pi-holder">
							<img
								src={{this.imageUrl}}
								alt="Pasted content"
								class="dt-pi-image"
								draggable="false"
								{{this.registerImage}}
							/>

							{{#if this.showCrop}}
								<div
									class="dt-pi-crop"
									style={{this.cropStyle}}
								>
									<div
										class="dt-pi-grid"
									>
										{{#each
											this.gridCells
											key="@index"
										}}
											<span
												class="dt-pi-grid-cell"
											></span>
										{{/each}}
									</div>

									{{! template-lint-disable no-pointer-down-event-binding }}
									{{#each
										this.handles
										key="mode"
										as |handle|
									}}
										<span
											class="dt-pi-handle
												{{handle.className}}"
											{{on
												"pointerdown"
												(fn
													this.startDrag
													handle.mode
												)
											}}
											{{on
												"pointermove"
												this.moveDrag
											}}
											{{on
												"pointerup"
												this.endDrag
											}}
											{{on
												"pointercancel"
												this.endDrag
											}}
										></span>
									{{/each}}
									{{! template-lint-enable no-pointer-down-event-binding }}

									{{#if
										this.showBadge
									}}
										<span
											class="dt-pi-badge"
										>{{this.badge}}</span>
									{{/if}}
								</div>
							{{/if}}
						</div>
					</div>
				{{else}}
					<div class="dt-pi-empty">
						<Icon @name="clipboard-paste" />
						<h2 class="dt-pi-empty-title">
							Press
							<kbd>Ctrl</kbd>/<kbd
							>Cmd</kbd>
							+
							<kbd>V</kbd>
							to paste
						</h2>
						<p class="dt-pi-empty-hint">Copy
							any image to your
							clipboard and paste it
							directly here.</p>
					</div>
				{{/if}}
			</div>

			<p class="dt-pi-credit">Contributed by
				<a
					href="https://github.com/himanshubalani"
					target="_blank"
					rel="noopener noreferrer"
				>@himanshubalani</a></p>
		</div>
	</template>
}
