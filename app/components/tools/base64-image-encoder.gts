import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';

interface EncodedImage {
	id: string;
	name: string;
	base64: string;
	size: number;
}

// limits textarea cost
const MAX_BYTES = 5 * 1024 * 1024;

const COPIED_MS = 2000;

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function rawBase64(dataUrl: string): string {
	return dataUrl.split(',')[1] ?? '';
}

export default class Base64ImageEncoderTool extends Component {
	@tracked images: EncodedImage[] = [];
	@tracked dragging = false;
	@tracked copied: string | null = null;
	@tracked error: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get countLabel() {
		const n = this.images.length;
		return `${n} image${n === 1 ? '' : 's'} encoded`;
	}

	get rows() {
		return this.images.map((image) => ({
			id: image.id,
			name: image.name,
			base64: image.base64,
			raw: rawBase64(image.base64),
			sizeLabel: formatSize(image.size),
			rawCopied: this.copied === `raw-${image.id}`,
			uriCopied: this.copied === `uri-${image.id}`,
		}));
	}

	readFile = (file: File) => {
		this.error = null;

		if (!file.type.startsWith('image/')) {
			this.error = `Invalid file type: ${file.name}. Please upload an image file.`;
			return;
		}

		if (file.size > MAX_BYTES) {
			this.error = `File ${file.name} is too large (${formatSize(file.size)}). Max allowed size is 5MB to prevent browser freeze.`;
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			this.images = [
				{
					id: crypto.randomUUID(),
					name: file.name,
					base64: reader.result as string,
					size: file.size,
				},
				...this.images,
			];
		};
		reader.onerror = () => {
			this.error = `Failed to read file ${file.name}`;
		};
		reader.readAsDataURL(file);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		for (const file of Array.from(input.files ?? []))
			this.readFile(file);
		// reset permits reselect
		input.value = '';
	};

	handleDragOver = (event: DragEvent) => {
		event.preventDefault();
		this.dragging = true;
	};

	handleDragLeave = (event: DragEvent) => {
		event.preventDefault();
		this.dragging = false;
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		this.dragging = false;
		for (const file of Array.from(event.dataTransfer?.files ?? []))
			this.readFile(file);
	};

	remove = (id: string) => {
		this.images = this.images.filter((image) => image.id !== id);
	};

	clearAll = () => {
		this.images = [];
		this.error = null;
	};

	selectAll = (event: Event) => {
		(event.target as HTMLTextAreaElement).select();
	};

	copy = async (text: string, key: string) => {
		await navigator.clipboard.writeText(text);
		this.copied = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copyRaw = (row: { id: string; raw: string }) =>
		void this.copy(row.raw, `raw-${row.id}`);

	copyUri = (row: { id: string; base64: string }) =>
		void this.copy(row.base64, `uri-${row.id}`);

	<template>
		<div
			class="dt-b64"
			{{filePaste this.readFile accept="image/*"}}
		>
			{{#if this.error}}
				<p class="dt-b64-error">{{this.error}}</p>
			{{/if}}

			<div class="dt-b64-frame">
				<label
					class="dt-b64-drop
						{{if
							this.dragging
							'is-dragging'
						}}"
					{{on "dragover" this.handleDragOver}}
					{{on "dragleave" this.handleDragLeave}}
					{{on "drop" this.handleDrop}}
				>
					<input
						type="file"
						accept="image/*"
						multiple
						class="dt-sr-only"
						{{on
							"change"
							this.handleFileSelect
						}}
					/>
					<Icon @name="upload" />
					<span class="dt-b64-drop-title">Drop
						images here</span>
					<span class="dt-b64-drop-hint">or click
						to select files, or paste</span>
				</label>
			</div>

			{{#if this.rows.length}}
				<div class="dt-b64-frame">
					<div class="dt-b64-bar">
						<span
							class="dt-b64-bar-title"
						>{{this.countLabel}}</span>
						<button
							type="button"
							class="dt-b64-bar-btn"
							{{on
								"click"
								this.clearAll
							}}
						>Clear all</button>
					</div>

					{{#each this.rows key="id" as |row|}}
						<div class="dt-b64-item">
							<div
								class="dt-b64-head"
							>
								<span
									class="dt-b64-thumb"
								>
									<img
										src={{row.base64}}
										alt={{row.name}}
									/>
								</span>
								<span
									class="dt-b64-meta"
								>
									<span
										class="dt-b64-name"
									>{{row.name}}</span>
									<span
										class="dt-b64-size"
									>{{row.sizeLabel}}</span>
								</span>
								<button
									type="button"
									class="dt-b64-remove"
									aria-label="Remove"
									{{on
										"click"
										(fn
											this.remove
											row.id
										)
									}}
								>
									<Icon
										@name="x"
									/>
								</button>
							</div>

							<div
								class="dt-b64-body"
							>
								<textarea
									readonly
									rows="6"
									class="dt-b64-text"
									aria-label="Base64 data URI"
									value={{row.base64}}
									{{on
										"click"
										this.selectAll
									}}
								></textarea>

								<div
									class="segmented dt-b64-actions"
								>
									<button
										type="button"
										class="dt-b64-copy
											{{if
												row.rawCopied
												'is-copied'
											}}"
										{{on
											"click"
											(fn
												this.copyRaw
												row
											)
										}}
									>
										<Icon
											@name={{if
												row.rawCopied
												"check"
												"copy"
											}}
										/>
										{{! wording carried over from the Next app }}
										{{if
											row.rawCopied
											"Copied Raw Data"
											"Copy Raw Base64"
										}}
									</button>
									<button
										type="button"
										class="dt-b64-copy
											{{if
												row.uriCopied
												'is-copied'
											}}"
										{{on
											"click"
											(fn
												this.copyUri
												row
											)
										}}
									>
										<Icon
											@name={{if
												row.uriCopied
												"check"
												"copy"
											}}
										/>
										{{! wording carried over from the Next app }}
										{{if
											row.uriCopied
											"Copied Data URI"
											"Copy Data URI"
										}}
									</button>
								</div>
							</div>
						</div>
					{{/each}}
				</div>
			{{/if}}
		</div>
	</template>
}
