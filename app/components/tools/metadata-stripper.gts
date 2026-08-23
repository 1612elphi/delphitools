import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	parseMetadata,
	stripMetadata,
	type ImageContainer,
	type MetadataReport,
} from 'delphitools-v2/lib/metadata';

const FILE_ACCEPT = 'image/*';

const MIME: Record<ImageContainer, string> = {
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
};

/** Mimes canvas can re-encode without a format change. */
const REENCODABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface StripState {
	blob: Blob;
	removed: string[];
}

export default class MetadataStripperTool extends Component {
	@tracked fileName = '';
	@tracked fileSize = 0;
	@tracked report: MetadataReport | null = null;
	@tracked afterReport: MetadataReport | null = null;
	@tracked result: StripState | null = null;
	@tracked keepColourProfile = true;
	@tracked error = '';

	#bytes: Uint8Array | null = null;

	get loaded() {
		return this.report !== null;
	}

	get entries() {
		return this.report?.entries ?? [];
	}

	get afterEntries() {
		return this.afterReport?.entries ?? [];
	}

	get sizeLabel() {
		if (!this.result) return formatBytes(this.fileSize);
		return `${formatBytes(this.fileSize)} → ${formatBytes(this.result.blob.size)}`;
	}

	get removedLabel() {
		const removed = this.result?.removed ?? [];
		return removed.length ? removed.join(' · ') : 'Nothing';
	}

	get c2pa() {
		return this.report?.c2pa ?? false;
	}

	/** The container is outside the four the parser reads. */
	get unreadable() {
		return this.report !== null && this.report.format === null;
	}

	get clean() {
		return (
			this.report !== null &&
			this.entries.length === 0 &&
			(this.result?.removed.length ?? 0) === 0
		);
	}

	get downloadName() {
		const dot = this.fileName.lastIndexOf('.');
		const base =
			dot > 0 ? this.fileName.slice(0, dot) : this.fileName;
		const type = this.result?.blob.type ?? '';
		const ext =
			type === 'image/jpeg'
				? 'jpg'
				: type.startsWith('image/')
					? type.slice('image/'.length)
					: dot > 0
						? this.fileName.slice(dot + 1)
						: 'png';
		return `${base || 'image'}-cleaned.${ext}`;
	}

	readFile = (file: File) => void this.#load(file);

	async #load(file: File) {
		this.error = '';
		this.fileName = file.name;
		this.fileSize = file.size;
		this.#bytes = new Uint8Array(await file.arrayBuffer());
		this.report = parseMetadata(this.#bytes);
		await this.#restrip();
	}

	async #restrip() {
		if (!this.#bytes) return;
		const stripped = stripMetadata(this.#bytes, {
			keepColourProfile: this.keepColourProfile,
		});
		if (stripped) {
			this.result = {
				blob: new Blob([stripped.data as BlobPart], {
					type: MIME[stripped.format],
				}),
				removed: stripped.removed,
			};
			this.afterReport = parseMetadata(stripped.data);
		} else {
			await this.#canvasStrip();
		}
	}

	/** Fallback for containers the parser cannot edit: a canvas re-encode
	 *  drops every metadata block, at the cost of recompressing the pixels. */
	async #canvasStrip() {
		if (!this.#bytes) return;
		const type = REENCODABLE.has(this.report?.format ?? '')
			? MIME[this.report!.format!]
			: 'image/png';
		try {
			const bitmap = await createImageBitmap(
				new Blob([this.#bytes as BlobPart]),
			);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
			bitmap.close();
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, type, 0.92),
			);
			if (!blob) throw new Error('encode failed');
			this.result = {
				blob,
				removed: ['All metadata (re-encoded)'],
			};
			this.afterReport = parseMetadata(
				new Uint8Array(await blob.arrayBuffer()),
			);
		} catch {
			this.result = null;
			this.afterReport = null;
			this.error = 'This file could not be read as an image.';
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

	toggleColourProfile = (event: Event) => {
		this.keepColourProfile = (
			event.target as HTMLInputElement
		).checked;
		void this.#restrip();
	};

	clear = () => {
		this.#bytes = null;
		this.fileName = '';
		this.fileSize = 0;
		this.report = null;
		this.afterReport = null;
		this.result = null;
		this.error = '';
	};

	download = () => {
		if (!this.result) return;
		downloadBlob(this.result.blob, this.downloadName);
	};

	<template>
		<div
			class="dt-strip"
			{{filePaste this.readFile accept=FILE_ACCEPT}}
		>
			<div
				class="dt-strip-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				{{#if this.loaded}}
					<div class="dt-strip-bar">
						<Icon @name="file-image" />
						<span
							class="dt-strip-name"
						>{{this.fileName}}</span>
						<span
							class="dt-strip-size"
						>{{this.sizeLabel}}</span>
						<div class="dt-strip-bar-tools">
							<label
								class="dt-strip-btn"
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
								class="dt-strip-btn"
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
								class="dt-strip-btn is-primary"
								disabled={{unless
									this.result
									true
								}}
								{{on
									"click"
									this.download
								}}
							>
								<DownloadLabel
								/>
							</button>
						</div>
					</div>

					<div class="dt-strip-settings">
						<label class="dt-strip-cell">
							<span>Colour profile</span>
							<span
								class="dt-strip-cell-row"
							>
								<input
									type="checkbox"
									class="dt-strip-switch"
									checked={{this.keepColourProfile}}
									{{on
										"change"
										this.toggleColourProfile
									}}
								/>
								<span>Keep ICC</span>
							</span>
						</label>
						<div class="dt-strip-cell">
							<span>Content
								Credentials</span>
							<span
								class="dt-strip-cell-value"
							>
								{{if
									this.c2pa
									"C2PA found"
									"None"
								}}
							</span>
						</div>
						<div class="dt-strip-cell">
							<span>Removed</span>
							<span
								class="dt-strip-cell-value"
							>
								{{this.removedLabel}}
							</span>
						</div>
					</div>

					<div class="dt-strip-panes">
						<div class="dt-strip-pane">
							<div
								class="dt-strip-pane-head"
							>
								<span
									class="dt-strip-pane-label"
								>Found in
									original</span>
							</div>
							{{#if this.unreadable}}
								<p
									class="dt-strip-note"
								>Format not
									readable</p>
							{{else if
								this.entries.length
							}}
								<ul
									class="dt-strip-list"
								>
									{{#each
										this.entries
										key="@index"
										as |entry|
									}}
										<li
											class="dt-strip-row
												{{if
													(eq
														entry.label
														'GPS coordinates'
													)
													'is-gps'
												}}"
										>
											{{#if
												(eq
													entry.label
													"GPS coordinates"
												)
											}}
												<Icon
													@name="map-pin"
												/>
											{{/if}}
											<span
												class="dt-strip-row-label"
											>{{entry.label}}</span>
											<span
												class="dt-strip-row-detail"
											>{{entry.detail}}</span>
										</li>
									{{/each}}
								</ul>
							{{else}}
								<p
									class="dt-strip-note"
								>No metadata
									found</p>
							{{/if}}
						</div>

						<div
							class="dt-strip-pane is-right"
						>
							<div
								class="dt-strip-pane-head"
							>
								<span
									class="dt-strip-pane-label"
								>After stripping</span>
							</div>
							{{#if
								this.afterEntries.length
							}}
								<ul
									class="dt-strip-list"
								>
									{{#each
										this.afterEntries
										key="@index"
										as |entry|
									}}
										<li
											class="dt-strip-row"
										>
											<span
												class="dt-strip-row-label"
											>{{entry.label}}</span>
											<span
												class="dt-strip-row-detail"
											>{{entry.detail}}</span>
										</li>
									{{/each}}
								</ul>
							{{else}}
								<p
									class="dt-strip-clean"
								>
									<Icon
										@name="shield-check"
									/>
									{{#if
										this.clean
									}}
										Already
										clean
									{{else}}
										Nothing
										left
									{{/if}}
								</p>
							{{/if}}
						</div>
					</div>
				{{else}}
					<label class="dt-strip-drop">
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
						{{! wording carried over from the Next app }}
						<span
							class="dt-strip-drop-title"
						>Drop an image here</span>
						<span
							class="dt-strip-drop-hint"
						>or click to select a file, or
							paste</span>
					</label>
				{{/if}}
			</div>

			{{#if this.error}}
				<p
					class="dt-strip-error"
					role="alert"
				>{{this.error}}</p>
			{{/if}}
		</div>
	</template>
}
