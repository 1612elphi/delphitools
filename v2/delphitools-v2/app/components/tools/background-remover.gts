import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	loadRemover,
	maskToCanvas,
	applyMask,
	loadImage,
	type Remover,
} from 'delphitools-v2/lib/bg-removal';

type Status = 'idle' | 'downloading' | 'processing' | 'done' | 'error';

export default class BackgroundRemoverTool extends Component {
	@tracked sourceImage: string | null = null;
	@tracked resultImage: string | null = null;
	@tracked status: Status = 'idle';
	@tracked percent = 0;
	@tracked errorDetail = '';

	#remover: Remover | null = null;
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		// The weights are tens of megabytes of GPU or wasm memory; leaving them
		// attached to a torn-down component keeps them for the tab's lifetime.
		this.#remover?.dispose();
		this.#remover = null;
	}

	get isBusy() {
		return (
			this.status === 'downloading' ||
			this.status === 'processing'
		);
	}

	get isDownloading() {
		return this.status === 'downloading';
	}

	get progressStyle() {
		return htmlSafe(`width: ${this.percent}%`);
	}

	readFile = (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const reader = new FileReader();
		reader.onload = () => {
			this.sourceImage = reader.result as string;
			this.resultImage = null;
			this.status = 'idle';
			this.errorDetail = '';
		};
		reader.onerror = () => this.report('image failed to load');
		reader.readAsDataURL(file);
	};

	handleFileSelect = (event: Event) => {
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

	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	clear = () => {
		this.sourceImage = null;
		this.resultImage = null;
		this.status = 'idle';
		this.errorDetail = '';
	};

	report = (detail: string) => {
		this.status = 'error';
		this.errorDetail = detail;
	};

	remove = async () => {
		const source = this.sourceImage;
		if (!source || this.isBusy) return;

		try {
			if (!this.#remover) {
				this.status = 'downloading';
				this.percent = 0;
				const remover = await loadRemover(
					({ percent }) => {
						if (!this.#destroyed)
							this.percent = percent;
					},
				);
				// Unmounted mid-download: free what just finished
				// building rather than holding it for the tab.
				if (this.#destroyed) {
					remover.dispose();
					return;
				}
				this.#remover = remover;
			}

			this.status = 'processing';
			const segments = await this.#remover.segment(source);
			if (this.#destroyed) return;

			const mask = segments[0]?.mask;
			if (!mask)
				throw new Error('the model returned no mask');

			const image = await loadImage(source);
			if (this.#destroyed) return;

			this.resultImage = applyMask(image, maskToCanvas(mask));
			this.status = 'done';
		} catch (error) {
			if (this.#destroyed) return;
			this.report(
				error instanceof Error
					? error.message
					: String(error),
			);
		}
	};

	download = () => {
		if (!this.resultImage) return;
		const link = document.createElement('a');
		link.download = 'background-removed.png';
		link.href = this.resultImage;
		link.click();
	};

	<template>
		<div class="dt-bg" {{filePaste this.readFile accept="image/*"}}>
			<div class="dt-bg-frame">
				{{#if this.resultImage}}
					<div class="dt-bg-bar">
						{{! wording carried over from the Next app }}
						<span
							class="dt-bg-bar-title"
						>Result</span>
						<button
							type="button"
							class="dt-bg-bar-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-bg-bar-btn is-primary"
							{{on
								"click"
								this.download
							}}
						>
							<Icon
								@name="download"
							/>
							Download PNG
						</button>
					</div>
					<div class="dt-bg-compare">
						<figure class="dt-bg-pane">
							{{! wording carried over from the Next app }}
							<figcaption
							>Original</figcaption>
							<span
								class="dt-bg-canvas"
							>
								<img
									src={{this.sourceImage}}
									alt="Original"
								/>
							</span>
						</figure>
						<figure class="dt-bg-pane">
							{{! wording carried over from the Next app }}
							<figcaption>Background
								Removed</figcaption>
							<span
								class="dt-bg-canvas is-checkered"
							>
								<img
									src={{this.resultImage}}
									alt="Background removed"
								/>
							</span>
						</figure>
					</div>
				{{else if this.sourceImage}}
					<div class="dt-bg-bar">
						{{! wording carried over from the Next app }}
						<span
							class="dt-bg-bar-title"
						>Your Image</span>
						<button
							type="button"
							class="dt-bg-bar-btn"
							disabled={{this.isBusy}}
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>
					<label class="dt-bg-source">
						<input
							type="file"
							accept="image/*"
							class="dt-sr-only"
							disabled={{this.isBusy}}
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<img
							src={{this.sourceImage}}
							alt="Source"
						/>
					</label>

					<div class="dt-bg-action">
						<button
							type="button"
							class="dt-bg-run"
							disabled={{this.isBusy}}
							{{on
								"click"
								this.remove
							}}
						>
							{{#if this.isBusy}}
								<Icon
									@name="loader-circle"
									class="dt-bg-spinner"
								/>
								{{#if
									this.isDownloading
								}}
									{{! wording carried over from the Next app }}
									Downloading...
									{{this.percent}}%
								{{else}}
									{{! wording carried over from the Next app }}
									Removing
									background...
								{{/if}}
							{{else}}
								{{! wording carried over from the Next app }}
								Remove
								Background
							{{/if}}
						</button>
						{{#if this.isDownloading}}
							<span
								class="dt-bg-progress"
							>
								<span
									style={{this.progressStyle}}
								></span>
							</span>
						{{/if}}
					</div>
				{{else}}
					<label
						class="dt-bg-drop"
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
						{{! wording carried over from the Next app }}
						<span
							class="dt-bg-drop-title"
						>Drop an image here</span>
						<span class="dt-bg-drop-hint">or
							click to select a file,
							or paste</span>
					</label>
				{{/if}}
			</div>

			{{#if (eq this.status "error")}}
				<div class="dt-bg-error" role="alert">
					<Icon @name="circle-alert" />
					<div>
						{{! wording carried over from the Next app }}
						<p
							class="dt-bg-error-title"
						>Error</p>
						<p
							class="dt-bg-error-detail"
						>{{this.errorDetail}}</p>
					</div>
				</div>
			{{/if}}

			<div class="dt-bg-note">
				<Icon @name="info" />
				{{! wording carried over from the Next app }}
				<p>Processing happens entirely in your browser.
					On first use, a ~180MB processing engine
					is downloaded and cached.</p>
			</div>
		</div>
	</template>
}
