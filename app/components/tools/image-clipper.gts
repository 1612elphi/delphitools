import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';

// Error wording carried over from the Next app.
const LOAD_FAILED = 'Failed to load image.';
const FULLY_TRANSPARENT = 'Image is fully transparent — nothing to clip.';
const ENCODE_FAILED = 'Failed to encode clipped image.';
const PNG_ONLY = 'Only PNG files are supported.';

export interface TrimBounds {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

interface ClipResult extends TrimBounds {
	originalWidth: number;
	originalHeight: number;
	clippedWidth: number;
	clippedHeight: number;
	url: string;
	fileName: string;
}

/**
 * Width of the fully transparent margin on each edge of an RGBA buffer, in
 * pixels. Null when no pixel has any alpha at all, so there is nothing to keep.
 */
export function findTrimBounds(
	data: Uint8ClampedArray,
	width: number,
	height: number,
): TrimBounds | null {
	let top = height;
	let bottom = 0;
	let left = width;
	let right = 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// The x/y bounds prove the index, so the alpha byte is present.
			if (data[(y * width + x) * 4 + 3]! === 0) continue;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
			if (x < left) left = x;
			if (x > right) right = x;
		}
	}

	if (top > bottom || left > right) return null;

	return {
		top,
		right: width - 1 - right,
		bottom: height - 1 - bottom,
		left,
	};
}

export default class ImageClipperTool extends Component {
	@tracked result: ClipResult | null = null;
	@tracked preview: string | null = null;
	@tracked error = '';
	@tracked processing = false;

	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		this.releasePreview();
	}

	get noChange() {
		const result = this.result;
		return (
			!!result &&
			result.originalWidth === result.clippedWidth &&
			result.originalHeight === result.clippedHeight
		);
	}

	releasePreview = () => {
		if (this.preview) URL.revokeObjectURL(this.preview);
		this.preview = null;
	};

	fail = (message: string) => {
		this.processing = false;
		this.error = message;
	};

	processImage = (file: File) => {
		// A second file can arrive by paste while a result is on screen, so the
		// previous object URL is released here rather than only in `reset`.
		this.releasePreview();
		this.result = null;
		this.error = '';
		this.processing = true;

		const image = new Image();
		const fileUrl = URL.createObjectURL(file);

		image.onload = () => {
			if (this.#destroyed) {
				URL.revokeObjectURL(fileUrl);
				return;
			}

			const width = image.naturalWidth;
			const height = image.naturalHeight;

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			// The Next version asserted the context non-null, so a browser that
			// refused the canvas threw inside onload and left the spinner up.
			if (!ctx) {
				URL.revokeObjectURL(fileUrl);
				this.fail(LOAD_FAILED);
				return;
			}
			ctx.drawImage(image, 0, 0);

			const bounds = findTrimBounds(
				ctx.getImageData(0, 0, width, height).data,
				width,
				height,
			);
			if (!bounds) {
				URL.revokeObjectURL(fileUrl);
				this.fail(FULLY_TRANSPARENT);
				return;
			}

			const clippedWidth = width - bounds.left - bounds.right;
			const clippedHeight =
				height - bounds.top - bounds.bottom;

			if (
				clippedWidth === width &&
				clippedHeight === height
			) {
				this.preview = fileUrl;
				this.result = {
					...bounds,
					originalWidth: width,
					originalHeight: height,
					clippedWidth,
					clippedHeight,
					url: fileUrl,
					fileName: file.name,
				};
				this.processing = false;
				return;
			}

			const out = document.createElement('canvas');
			out.width = clippedWidth;
			out.height = clippedHeight;
			const outCtx = out.getContext('2d');
			if (!outCtx) {
				URL.revokeObjectURL(fileUrl);
				this.fail(LOAD_FAILED);
				return;
			}
			outCtx.drawImage(
				canvas,
				bounds.left,
				bounds.top,
				clippedWidth,
				clippedHeight,
				0,
				0,
				clippedWidth,
				clippedHeight,
			);

			out.toBlob((blob) => {
				URL.revokeObjectURL(fileUrl);
				if (this.#destroyed) return;
				if (!blob) {
					this.fail(ENCODE_FAILED);
					return;
				}

				this.preview = URL.createObjectURL(blob);
				this.result = {
					...bounds,
					originalWidth: width,
					originalHeight: height,
					clippedWidth,
					clippedHeight,
					url: this.preview,
					fileName: file.name.replace(
						/\.png$/i,
						'-clipped.png',
					),
				};
				this.processing = false;
			}, 'image/png');
		};

		image.onerror = () => {
			URL.revokeObjectURL(fileUrl);
			if (this.#destroyed) return;
			this.fail(LOAD_FAILED);
		};

		image.src = fileUrl;
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.processImage(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type === 'image/png') this.processImage(file);
		else this.error = PNG_ONLY;
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	reset = () => {
		this.releasePreview();
		this.result = null;
		this.error = '';
	};

	download = () => {
		const result = this.result;
		if (!result) return;
		const link = document.createElement('a');
		link.download = result.fileName;
		link.href = result.url;
		link.click();
	};

	<template>
		<div
			class="dt-clip"
			{{filePaste this.processImage accept="image/png"}}
		>
			<div class="dt-clip-frame">
				{{#unless this.result}}
					<label
						class="dt-clip-drop"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
					>
						<input
							type="file"
							accept="image/png"
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						{{! wording carried over from the Next app }}
						<span
							class="dt-clip-drop-title"
						>Drop a PNG here or click to
							upload</span>
						<span
							class="dt-clip-drop-hint"
						>or paste from clipboard</span>
					</label>
				{{/unless}}

				{{#if this.processing}}
					<p class="dt-clip-status">
						<Icon
							@name="scissors"
							class="dt-clip-pulse"
						/>
						{{! wording carried over from the Next app }}
						<span>Clipping…</span>
					</p>
				{{/if}}

				{{#if this.result}}
					<div class="dt-clip-bar">
						<div class="dt-clip-info">
							<p
								class="dt-clip-dims"
							>{{this.result.originalWidth}}
								×
								{{this.result.originalHeight}}
								→
								{{this.result.clippedWidth}}
								×
								{{this.result.clippedHeight}}</p>
							{{#if this.noChange}}
								{{! wording carried over from the Next app }}
								<p
									class="dt-clip-note"
								>No transparent
									edges
									found —
									image is
									already
									minimal</p>
							{{else}}
								{{! wording carried over from the Next app }}
								<p
									class="dt-clip-note"
								>Trimmed
									{{this.result.top}}px
									top,
									{{this.result.right}}px
									right,
									{{this.result.bottom}}px
									bottom,
									{{this.result.left}}px
									left</p>
							{{/if}}
						</div>
						<button
							type="button"
							class="dt-clip-btn"
							{{on
								"click"
								this.reset
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-clip-btn is-primary"
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name="download"
							/>
							{{! wording carried over from the Next app }}
							Download PNG
						</button>
					</div>

					{{#if this.preview}}
						<div class="dt-clip-preview">
							<img
								src={{this.preview}}
								alt="Clipped result"
							/>
						</div>
					{{/if}}
				{{/if}}
			</div>

			{{#if this.error}}
				<p
					class="dt-clip-error"
					role="alert"
				>{{this.error}}</p>
			{{/if}}
		</div>
	</template>
}
