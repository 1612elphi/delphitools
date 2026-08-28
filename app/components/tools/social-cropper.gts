import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadUrl } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	SOCIAL_PLATFORMS,
	type SocialPlatform,
	type SocialRatio,
} from 'delphitools-v2/lib/social-presets';

const LOAD_FAILED = 'Image could not be read. Try another file?';

const FIRST_PLATFORM = SOCIAL_PLATFORMS[0]!;
const FIRST_RATIO = FIRST_PLATFORM.ratios[0]!;

interface Size {
	width: number;
	height: number;
}

export function cropSize(
	imageWidth: number,
	imageHeight: number,
	aspect: number,
): Size {
	if (!imageWidth || !imageHeight) return { width: 0, height: 0 };
	if (aspect > imageWidth / imageHeight) {
		return { width: imageWidth, height: imageWidth / aspect };
	}
	return { width: imageHeight * aspect, height: imageHeight };
}

function clamp(value: number, max: number): number {
	return Math.max(0, Math.min(max, value));
}

export default class SocialCropperTool extends Component {
	@tracked sourceImage: string | null = null;
	@tracked fileName = '';
	@tracked imageWidth = 0;
	@tracked imageHeight = 0;
	@tracked platform: SocialPlatform = FIRST_PLATFORM;
	@tracked ratio: SocialRatio = FIRST_RATIO;
	@tracked cropX = 0;
	@tracked cropY = 0;
	@tracked dragging = false;
	@tracked croppedImage: string | null = null;
	@tracked loadFailed = false;

	#image: HTMLImageElement | null = null;
	#drag: {
		scale: number;
		pointerX: number;
		pointerY: number;
		x: number;
		y: number;
	} | null = null;
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
	}

	get aspect() {
		return this.ratio.width / this.ratio.height;
	}

	get crop(): Size {
		return cropSize(this.imageWidth, this.imageHeight, this.aspect);
	}

	get cropLabel() {
		const { width, height } = this.crop;
		return `${Math.round(width)} × ${Math.round(height)}`;
	}

	get offsetLabel() {
		return `${Math.round(this.cropX)}, ${Math.round(this.cropY)}`;
	}

	get frameStyle() {
		if (!this.imageWidth || !this.imageHeight) return htmlSafe('');
		const { width, height } = this.crop;
		const percent = (part: number, whole: number) =>
			(part / whole) * 100;
		return htmlSafe(
			`left: ${percent(this.cropX, this.imageWidth)}%;` +
				`top: ${percent(this.cropY, this.imageHeight)}%;` +
				`width: ${percent(width, this.imageWidth)}%;` +
				`height: ${percent(height, this.imageHeight)}%`,
		);
	}

	readFile = (file: File) => {
		this.fileName = file.name.replace(/\.[^.]+$/, '');
		this.loadFailed = false;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const image = new Image();
			image.onload = () => {
				if (this.#destroyed) return;
				this.#image = image;
				this.imageWidth = image.width;
				this.imageHeight = image.height;
				this.sourceImage = dataUrl;
				this.cropX = 0;
				this.cropY = 0;
				this.render();
			};
			// decode errors must surface
			image.onerror = this.fail;
			image.src = dataUrl;
		};
		reader.onerror = this.fail;
		reader.readAsDataURL(file);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// rearm for same-file change
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) this.readFile(file);
	};

	// else browser navigates to file
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	fail = () => {
		if (this.#destroyed) return;
		this.clear();
		this.loadFailed = true;
	};

	clear = () => {
		this.#image = null;
		this.sourceImage = null;
		this.fileName = '';
		this.imageWidth = 0;
		this.imageHeight = 0;
		this.cropX = 0;
		this.cropY = 0;
		this.croppedImage = null;
		this.loadFailed = false;
	};

	selectPlatform = (platform: SocialPlatform) => {
		this.platform = platform;
		this.ratio = platform.ratios[0] ?? this.ratio;
		this.recrop();
	};

	selectRatio = (ratio: SocialRatio) => {
		this.ratio = ratio;
		this.recrop();
	};

	recrop = () => {
		this.cropX = 0;
		this.cropY = 0;
		this.render();
	};

	setOffset(x: number, y: number) {
		const { width, height } = this.crop;
		this.cropX = clamp(x, this.imageWidth - width);
		this.cropY = clamp(y, this.imageHeight - height);
	}

	// pointer path; capture keeps moves outside preview
	startDrag = (event: PointerEvent) => {
		const stage = event.currentTarget as HTMLElement;
		const rect = stage.getBoundingClientRect();
		if (!rect.width || !this.imageWidth) return;

		this.#drag = {
			scale: this.imageWidth / rect.width,
			pointerX: event.clientX,
			pointerY: event.clientY,
			x: this.cropX,
			y: this.cropY,
		};
		this.dragging = true;
		stage.setPointerCapture(event.pointerId);
	};

	moveDrag = (event: PointerEvent) => {
		const drag = this.#drag;
		if (!drag) return;
		this.setOffset(
			drag.x + (event.clientX - drag.pointerX) * drag.scale,
			drag.y + (event.clientY - drag.pointerY) * drag.scale,
		);
	};

	endDrag = (event: PointerEvent) => {
		const stage = event.currentTarget as HTMLElement;
		if (stage.hasPointerCapture(event.pointerId)) {
			stage.releasePointerCapture(event.pointerId);
		}
		if (!this.#drag) return;
		this.#drag = null;
		this.dragging = false;
		this.render();
	};

	render = () => {
		if (this.#destroyed) return;
		this.croppedImage = null;

		const image = this.#image;
		if (!image) return;

		const { width, height } = this.crop;
		if (width < 1 || height < 1) return;

		const canvas = document.createElement('canvas');
		canvas.width = Math.round(width);
		canvas.height = Math.round(height);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.drawImage(
			image,
			this.cropX,
			this.cropY,
			width,
			height,
			0,
			0,
			canvas.width,
			canvas.height,
		);
		this.croppedImage = canvas.toDataURL('image/png');
	};

	download = () => {
		if (!this.croppedImage) return;
		downloadUrl(
			this.croppedImage,
			`${this.fileName}-${this.platform.name.toLowerCase()}-${this.ratio.label}.png`,
		);
	};

	<template>
		<div
			class="dt-cropper"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-cropper-frame">
				{{#if this.sourceImage}}
					<div class="dt-cropper-bar">
						<span class="dt-cropper-source">
							<Icon @name="image" />
							<span
								class="dt-cropper-name"
							>{{this.fileName}}</span>
							<span
								class="dt-cropper-dims"
							>{{this.imageWidth}}
								×
								{{this.imageHeight}}</span>
						</span>
						<button
							type="button"
							class="dt-cropper-bar-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>

					<div class="dt-cropper-section">
						<span
							class="dt-cropper-label"
						>Platform</span>
						<div
							class="segmented dt-cropper-platforms"
						>
							{{#each
								SOCIAL_PLATFORMS
								key="name"
								as |option|
							}}
								<button
									type="button"
									class="dt-cropper-choice
										{{if
											(eq
												option
												this.platform
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.selectPlatform
											option
										)
									}}
								>{{option.name}}</button>
							{{/each}}
						</div>
					</div>

					<div class="dt-cropper-section">
						<span
							class="dt-cropper-label"
						>Ratio</span>
						<div
							class="segmented dt-cropper-ratios"
						>
							{{#each
								this.platform.ratios
								key="name"
								as |option|
							}}
								<button
									type="button"
									class="dt-cropper-choice is-stacked
										{{if
											(eq
												option
												this.ratio
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.selectRatio
											option
										)
									}}
								>
									<span
										class="dt-cropper-choice-label"
									>{{option.label}}</span>
									<span
										class="dt-cropper-choice-name"
									>{{option.name}}</span>
								</button>
							{{/each}}
						</div>
					</div>

					<div
						class="dt-cropper-section is-stage"
					>
						<span class="dt-cropper-label">
							<Icon @name="move" />
							{{! wording from next app }}
							Drag to reposition
						</span>
						{{! drag, not click }}
						{{! template-lint-disable no-pointer-down-event-binding }}
						<div
							class="dt-cropper-stage
								{{if
									this.dragging
									'is-dragging'
								}}"
							{{on
								"pointerdown"
								this.startDrag
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
						>
							<img
								src={{this.sourceImage}}
								alt="Source"
								draggable="false"
							/>
							<div
								class="dt-cropper-window"
								style={{this.frameStyle}}
							></div>
						</div>
					</div>

					<div class="dt-cropper-stats">
						<span>Crop:
							{{this.cropLabel}}
							px</span>
						<span>Offset:
							{{this.offsetLabel}}</span>
					</div>

					{{#if this.croppedImage}}
						<div class="dt-cropper-result">
							<img
								src={{this.croppedImage}}
								alt="Cropped"
							/>
						</div>

						<div class="dt-cropper-actions">
							<span
								class="dt-cropper-summary"
							>
								{{this.platform.name}}
								·
								{{this.ratio.label}}
								{{this.ratio.name}}
							</span>
							<button
								type="button"
								class="dt-cropper-download"
								{{on
									"click"
									this.download
								}}
							>
								<DownloadLabel
									@label="Download PNG"
								/>
							</button>
						</div>
					{{/if}}
				{{else}}
					<label
						class="dt-cropper-drop"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
					>
						<input
							type="file"
							accept="image/*"
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						{{! wording from next app }}
						<span
							class="dt-cropper-drop-title"
						>Drop image here</span>
						{{! wording from next app }}
						<span
							class="dt-cropper-drop-hint"
						>PNG, JPG, or any image format,
							or paste</span>
					</label>
				{{/if}}

				{{#if this.loadFailed}}
					<p
						class="dt-cropper-error"
						role="alert"
					>{{LOAD_FAILED}}</p>
				{{/if}}
			</div>
		</div>
	</template>
}
