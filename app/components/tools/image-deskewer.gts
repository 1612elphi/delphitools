import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	ASPECTS,
	fitAspect,
	insetQuad,
	outputSize,
	warp,
	type Aspect,
	type Point,
	type Quad,
} from 'delphitools-v2/lib/deskew';

const FILE_ACCEPT = 'image/*';
// wording carried over from Metadata Stripper
const LOAD_FAILED = 'This file could not be read as an image.';
/** Long edge of the live preview while a corner is dragged. */
const PREVIEW_EDGE = 720;
const CORNERS = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];

const NUDGE: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

const cornerLabel = (index: number) => CORNERS[index];

const cornerStyle = (corner: Point, width: number, height: number) =>
	htmlSafe(
		`left: ${(corner.x / width) * 100}%; top: ${(corner.y / height) * 100}%`,
	);

interface Drag {
	index: number;
	left: number;
	top: number;
	scale: number;
}

export default class ImageDeskewerTool extends Component {
	@tracked fileName = '';
	@tracked width = 0;
	@tracked height = 0;
	@tracked quad: Quad | null = null;
	@tracked aspect: Aspect = ASPECTS[0]!;
	@tracked dragging = -1;
	@tracked busy = false;
	@tracked error = '';

	#source: ImageData | null = null;
	#result: HTMLCanvasElement | null = null;
	#drag: Drag | null = null;
	#frame = 0;
	#fullDrawn = false;

	willDestroy() {
		super.willDestroy();
		cancelAnimationFrame(this.#frame);
	}

	get output() {
		return fitAspect(outputSize(this.quad!), this.aspect.ratio);
	}

	get points() {
		return this.quad!.map((p) => `${p.x},${p.y}`).join(' ');
	}

	/** Everything outside the quad, for the evenodd shade. */
	get shade() {
		const [tl, tr, br, bl] = this.quad!;
		return (
			`M0 0H${this.width}V${this.height}H0Z` +
			`M${tl.x} ${tl.y}L${tr.x} ${tr.y}L${br.x} ${br.y}L${bl.x} ${bl.y}Z`
		);
	}

	/** The source canvas redraws when a new image replaces the old one. */
	source = modifier((canvas: HTMLCanvasElement) => {
		canvas.width = this.width;
		canvas.height = this.height;
		if (this.#source)
			canvas.getContext('2d')?.putImageData(
				this.#source,
				0,
				0,
			);
	});

	result = modifier((canvas: HTMLCanvasElement) => {
		this.#result = canvas;
		this.#queue(true);
		return () => {
			this.#result = null;
		};
	});

	readFile = (file: File) => void this.#load(file);

	async #load(file: File) {
		this.error = '';
		try {
			const bitmap = await createImageBitmap(file);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bitmap, 0, 0);
			bitmap.close();
			if (this.isDestroying) return;
			this.#source = ctx.getImageData(
				0,
				0,
				canvas.width,
				canvas.height,
			);
			this.fileName = file.name;
			this.width = canvas.width;
			this.height = canvas.height;
			this.quad = insetQuad(canvas.width, canvas.height);
			this.#queue(true);
		} catch {
			this.error = LOAD_FAILED;
		}
	}

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	clear = () => {
		cancelAnimationFrame(this.#frame);
		this.#source = null;
		this.quad = null;
		this.fileName = '';
		this.width = 0;
		this.height = 0;
		this.error = '';
	};

	reset = () => {
		this.quad = insetQuad(this.width, this.height);
		this.#queue(true);
	};

	selectAspect = (aspect: Aspect) => {
		this.aspect = aspect;
		this.#queue(true);
	};

	#setCorner(index: number, x: number, y: number) {
		const next = [...this.quad!] as Quad;
		next[index] = {
			x: Math.max(0, Math.min(this.width, x)),
			y: Math.max(0, Math.min(this.height, y)),
		};
		this.quad = next;
	}

	// Capture on the handle keeps the moves coming once the pointer leaves it.
	startDrag = (index: number, event: PointerEvent) => {
		const handle = event.currentTarget as HTMLElement;
		const rect = handle.parentElement!.getBoundingClientRect();
		if (!rect.width) return;
		this.#drag = {
			index,
			left: rect.left,
			top: rect.top,
			scale: this.width / rect.width,
		};
		this.dragging = index;
		handle.setPointerCapture(event.pointerId);
		event.preventDefault();
	};

	moveDrag = (event: PointerEvent) => {
		const drag = this.#drag;
		if (!drag) return;
		this.#setCorner(
			drag.index,
			(event.clientX - drag.left) * drag.scale,
			(event.clientY - drag.top) * drag.scale,
		);
		this.#queue(false);
	};

	endDrag = (event: PointerEvent) => {
		const handle = event.currentTarget as HTMLElement;
		if (handle.hasPointerCapture(event.pointerId)) {
			handle.releasePointerCapture(event.pointerId);
		}
		if (!this.#drag) return;
		this.#drag = null;
		this.dragging = -1;
		this.#queue(true);
	};

	nudge = (index: number, event: KeyboardEvent) => {
		const delta = NUDGE[event.key];
		if (!delta) return;
		event.preventDefault();
		const step = event.shiftKey ? 10 : 1;
		const corner = this.quad![index]!;
		this.#setCorner(
			index,
			corner.x + delta[0] * step,
			corner.y + delta[1] * step,
		);
		this.#queue(true);
	};

	/** One draw per frame; a preview draw is downscaled, a full one is the output. */
	#queue(full: boolean) {
		cancelAnimationFrame(this.#frame);
		this.#frame = requestAnimationFrame(() => this.#draw(full));
	}

	#draw(full: boolean) {
		const canvas = this.#result;
		if (!canvas || !this.#source || !this.quad) return;
		const { width, height } = this.output;
		const scale = full
			? 1
			: Math.min(1, PREVIEW_EDGE / Math.max(width, height));
		const image = warp(
			this.#source,
			this.quad,
			Math.max(1, Math.round(width * scale)),
			Math.max(1, Math.round(height * scale)),
		);
		canvas.width = image.width;
		canvas.height = image.height;
		canvas.getContext('2d')?.putImageData(image, 0, 0);
		this.#fullDrawn = full;
	}

	download = async () => {
		const canvas = this.#result;
		if (!canvas || this.busy) return;
		this.busy = true;
		try {
			if (!this.#fullDrawn) this.#draw(true);
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/png'),
			);
			if (blob) {
				const base =
					this.fileName.replace(/\.[^.]+$/, '') ||
					'image';
				downloadBlob(blob, `${base}-deskewed.png`);
			}
		} finally {
			this.busy = false;
		}
	};

	<template>
		<div
			class="dt-dsk"
			{{filePaste this.readFile accept=FILE_ACCEPT}}
		>
			<div
				class="dt-dsk-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				{{#if this.quad}}
					<div class="dt-dsk-bar">
						<Icon @name="file-image" />
						<span
							class="dt-dsk-name"
						>{{this.fileName}}</span>
						<span
							class="dt-dsk-size"
						>{{this.width}}
							×
							{{this.height}}</span>
						<div class="dt-dsk-bar-tools">
							<label
								class="dt-dsk-btn"
								aria-label="Open file"
							>
								<input
									type="file"
									class="dt-sr-only"
									accept={{FILE_ACCEPT}}
									{{on
										"change"
										this.chooseFile
									}}
								/>
								<Icon
									@name="upload"
								/>
							</label>
							<button
								type="button"
								class="dt-dsk-btn"
								{{on
									"click"
									this.reset
								}}
							>
								<Icon
									@name="rotate-ccw"
								/>
								<span
									class="dt-dsk-btn-text"
								>Reset</span>
							</button>
							<button
								type="button"
								class="dt-dsk-btn"
								aria-label="Clear"
								{{on
									"click"
									this.clear
								}}
							>
								<Icon
									@name="x"
								/>
							</button>
							<button
								type="button"
								class="dt-dsk-btn is-primary"
								disabled={{this.busy}}
								{{on
									"click"
									this.download
								}}
							>
								<DownloadLabel
									@busy={{this.busy}}
								/>
							</button>
						</div>
					</div>

					<div class="dt-dsk-settings">
						<div class="dt-dsk-cell">
							<span>Aspect</span>
							<div
								class="segmented dt-dsk-aspects"
							>
								{{#each
									ASPECTS
									key="label"
									as |option|
								}}
									<button
										type="button"
										class="dt-dsk-aspect
											{{if
												(eq
													option
													this.aspect
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.selectAspect
												option
											)
										}}
									>{{option.label}}</button>
								{{/each}}
							</div>
						</div>
						<div class="dt-dsk-cell">
							<span>Output</span>
							<span
								class="dt-dsk-cell-value"
							>{{this.output.width}}
								×
								{{this.output.height}}
								px</span>
						</div>
					</div>

					<div class="dt-dsk-panes">
						<div class="dt-dsk-pane">
							<div
								class="dt-dsk-pane-head"
							>
								<span
									class="dt-dsk-pane-label"
								>Source</span>
								<span
									class="dt-dsk-pane-hint"
								>
									<Icon
										@name="move"
									/>
									Drag the
									corners
								</span>
							</div>
							<div
								class="dt-dsk-stage-wrap"
							>
								{{! pointerdown starts a drag here rather than standing in for a click, which is what the rule guards against }}
								{{! template-lint-disable no-pointer-down-event-binding }}
								<div
									class="dt-dsk-stage
										{{if
											(eq
												this.dragging
												-1
											)
											''
											'is-dragging'
										}}"
								>
									<canvas
										class="dt-dsk-source"
										{{this.source}}
									></canvas>
									<svg
										class="dt-dsk-overlay"
										viewBox="0 0 {{this.width}} {{this.height}}"
										preserveAspectRatio="none"
										aria-hidden="true"
									>
										<path
											class="dt-dsk-shade"
											d={{this.shade}}
											fill-rule="evenodd"
										/>
										<polygon
											class="dt-dsk-quad"
											points={{this.points}}
											vector-effect="non-scaling-stroke"
										/>
									</svg>
									{{#each
										this.quad
										as |corner index|
									}}
										<button
											type="button"
											class="dt-dsk-handle
												{{if
													(eq
														index
														this.dragging
													)
													'is-active'
												}}"
											aria-label={{cornerLabel
												index
											}}
											style={{cornerStyle
												corner
												this.width
												this.height
											}}
											{{on
												"pointerdown"
												(fn
													this.startDrag
													index
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
											{{on
												"keydown"
												(fn
													this.nudge
													index
												)
											}}
										></button>
									{{/each}}
								</div>
							</div>
						</div>

						<div
							class="dt-dsk-pane is-right"
						>
							<div
								class="dt-dsk-pane-head"
							>
								<span
									class="dt-dsk-pane-label"
								>Corrected</span>
							</div>
							<div
								class="dt-dsk-stage-wrap"
							>
								<canvas
									class="dt-dsk-result"
									{{this.result}}
								></canvas>
							</div>
						</div>
					</div>
				{{else}}
					<label class="dt-dsk-drop">
						<input
							type="file"
							accept={{FILE_ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.chooseFile
							}}
						/>
						<Icon @name="upload" />
						{{! wording carried over from Metadata Stripper }}
						<span
							class="dt-dsk-drop-title"
						>Drop an image here</span>
						<span
							class="dt-dsk-drop-hint"
						>or click to select a file, or
							paste</span>
					</label>
				{{/if}}
			</div>

			{{#if this.error}}
				<p
					class="dt-dsk-error"
					role="alert"
				>{{this.error}}</p>
			{{/if}}
		</div>
	</template>
}
