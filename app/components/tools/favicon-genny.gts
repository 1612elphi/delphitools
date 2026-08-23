import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob, downloadUrl } from 'delphitools-v2/lib/download';
import { buildIco, dataUrlToBytes } from 'delphitools-v2/lib/ico';

const FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 512];

/** The sizes that go into favicon.ico; the rest ship as loose PNGs. */
const ICO_SIZES = [16, 32, 48, 64];

/** Preview cap, so 512 does not blow the row height out. */
const PREVIEW_MAX = 48;

/** Staggered so the browser does not drop all but the first download. */
const DOWNLOAD_GAP_MS = 100;

const HTML_SNIPPET = `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon-512x512.png">`;

const LOAD_FAILED = 'Image could not be read. Try another file?';

interface GeneratedFavicon {
	size: number;
	dataUrl: string;
}

function sizeLabel(size: number): string {
	if (size === 180) return 'Apple Touch';
	if (size === 192) return 'Android';
	if (size === 512) return 'PWA';
	return `${size}×${size}`;
}

export default class FaviconGennyTool extends Component {
	@tracked sourceImage: string | null = null;
	@tracked fileName = '';
	@tracked favicons: GeneratedFavicon[] = [];
	@tracked generating = false;
	@tracked loadFailed = false;

	#timers: ReturnType<typeof setTimeout>[] = [];

	willDestroy() {
		super.willDestroy();
		this.#timers.forEach(clearTimeout);
	}

	get title() {
		return this.fileName || 'Source Image';
	}

	get rows() {
		return this.favicons.map((favicon) => {
			const px = Math.min(favicon.size, PREVIEW_MAX);
			return {
				favicon,
				label: sizeLabel(favicon.size),
				dimensions: `${favicon.size}×${favicon.size}`,
				// px is derived from FAVICON_SIZES, so the style string
				// never carries anything a caller supplied.
				boxStyle: htmlSafe(
					`width: ${px + 8}px; height: ${px + 8}px`,
				),
				imageStyle: htmlSafe(
					`width: ${px}px; height: ${px}px`,
				),
			};
		});
	}

	get snippet() {
		return HTML_SNIPPET;
	}

	readFile = (file: File) => {
		this.fileName = file.name.replace(/\.[^.]+$/, '');
		this.loadFailed = false;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			this.sourceImage = dataUrl;
			this.generate(dataUrl);
		};
		reader.onerror = () => this.fail();
		reader.readAsDataURL(file);
	};

	handleFileSelect = (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) this.readFile(file);
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) this.readFile(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	clear = () => {
		this.sourceImage = null;
		this.fileName = '';
		this.favicons = [];
		this.loadFailed = false;
	};

	// The Next version left `generating` true forever when an image failed to
	// decode, so a file with an image mime type but junk bytes hung the tool.
	fail = () => {
		this.generating = false;
		this.sourceImage = null;
		this.favicons = [];
		this.loadFailed = true;
	};

	/**
	 * One canvas, resized per size. Centre-crops to a square first, so a
	 * portrait or landscape source keeps its middle rather than squashing.
	 */
	generate = (imageDataUrl: string) => {
		this.generating = true;
		const image = new Image();

		image.onload = () => {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return this.fail();

			const edge = Math.min(image.width, image.height);
			const sx = (image.width - edge) / 2;
			const sy = (image.height - edge) / 2;

			this.favicons = FAVICON_SIZES.map((size) => {
				canvas.width = size;
				canvas.height = size;
				ctx.clearRect(0, 0, size, size);
				ctx.drawImage(
					image,
					sx,
					sy,
					edge,
					edge,
					0,
					0,
					size,
					size,
				);
				return {
					size,
					dataUrl: canvas.toDataURL('image/png'),
				};
			});
			this.generating = false;
		};

		image.onerror = () => this.fail();
		image.src = imageDataUrl;
	};

	download = (favicon: GeneratedFavicon) => {
		downloadUrl(
			favicon.dataUrl,
			`favicon-${favicon.size}x${favicon.size}.png`,
		);
	};

	downloadAll = () => {
		this.favicons.forEach((favicon, i) => {
			this.#timers.push(
				setTimeout(
					() => this.download(favicon),
					i * DOWNLOAD_GAP_MS,
				),
			);
		});
	};

	downloadIco = () => {
		const frames = this.favicons
			.filter((f) => ICO_SIZES.includes(f.size))
			.map((f) => ({
				size: f.size,
				data: dataUrlToBytes(f.dataUrl),
			}));
		if (frames.length === 0) return;

		const blob = new Blob([buildIco(frames)], {
			type: 'image/x-icon',
		});
		downloadBlob(blob, 'favicon.ico');
	};

	<template>
		<div
			class="dt-favicon"
			{{filePaste this.readFile accept="image/*"}}
		>
			<div class="dt-favicon-frame">
				{{#if this.sourceImage}}
					<div class="dt-favicon-bar">
						<span
							class="dt-favicon-bar-title"
						>{{this.title}}</span>
						<button
							type="button"
							class="dt-favicon-bar-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					</div>
					<div class="dt-favicon-source">
						<span class="dt-favicon-thumb">
							<img
								src={{this.sourceImage}}
								alt="Source"
							/>
						</span>
						{{! wording carried over from the Next app }}
						<p>Image will be centre-cropped
							to a square for each
							size.</p>
					</div>
				{{else}}
					<label
						class="dt-favicon-drop"
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
							class="dt-favicon-drop-title"
						>Drop image here</span>
						<span
							class="dt-favicon-drop-hint"
						>PNG, JPG, SVG or any image
							format, or paste</span>
					</label>
				{{/if}}

				{{#if this.loadFailed}}
					<p
						class="dt-favicon-error"
					>{{LOAD_FAILED}}</p>
				{{/if}}

				{{#if this.generating}}
					{{! wording carried over from the Next app }}
					<p class="dt-favicon-status">Generating
						favicons…</p>
				{{/if}}

				{{#if this.favicons.length}}
					<div class="dt-favicon-bar is-actions">
						{{! wording carried over from the Next app }}
						<span
							class="dt-favicon-bar-title"
						>Generated Favicons</span>
						<button
							type="button"
							class="dt-favicon-bar-btn"
							{{on
								"click"
								this.downloadIco
							}}
						>
							<DownloadLabel
								@label="Download .ico"
							/>
						</button>
						<button
							type="button"
							class="dt-favicon-bar-btn is-primary"
							{{on
								"click"
								this.downloadAll
							}}
						>
							<DownloadLabel
								@label="Download All"
							/>
						</button>
					</div>

					<div class="dt-favicon-list">
						{{#each
							this.rows
							key="favicon.size"
							as |row|
						}}
							<button
								type="button"
								class="dt-favicon-row"
								{{on
									"click"
									(fn
										this.download
										row.favicon
									)
								}}
							>
								<span
									class="dt-favicon-cell"
								>
									<span
										class="dt-favicon-chip"
										style={{row.boxStyle}}
									>
										<img
											src={{row.favicon.dataUrl}}
											alt={{row.dimensions}}
											style={{row.imageStyle}}
										/>
									</span>
								</span>
								<span
									class="dt-favicon-meta"
								>
									<span
										class="dt-favicon-size"
									>{{row.dimensions}}</span>
									<span
										class="dt-favicon-role"
									>{{row.label}}</span>
								</span>
								<span
									class="dt-favicon-hint"
								>
									<DownloadLabel
										@label="Download PNG"
									/>
								</span>
							</button>
						{{/each}}
					</div>

					<div class="dt-favicon-snippet">
						{{! wording carried over from the Next app }}
						<span
							class="dt-favicon-snippet-label"
						>HTML Snippet</span>
						<pre>{{this.snippet}}</pre>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
