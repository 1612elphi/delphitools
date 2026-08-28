import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';

const FONT_EXTENSION = /\.(ttf|otf|woff2?)$/i;

export function isFontFile(fileName: string): boolean {
	return FONT_EXTENSION.test(fileName);
}

export function baseName(fileName: string): string {
	return fileName.replace(FONT_EXTENSION, '');
}

export function postScriptName(fileName: string): string {
	return baseName(fileName).replace(/\s+/g, '-');
}

export function fontFormat(fileName: string): string {
	const name = fileName.toLowerCase();
	if (name.endsWith('.woff2')) return 'woff2';
	if (name.endsWith('.woff')) return 'woff';
	if (name.endsWith('.otf')) return 'opentype';
	return 'truetype';
}

export function cssUsage(fileName: string): string {
	const name = baseName(fileName);
	return `@font-face {
  font-family: '${name}';
  src: url('${fileName}') format('${fontFormat(fileName)}');
  font-weight: normal;
  font-style: normal;
}

.my-text {
  font-family: '${name}', sans-serif;
}`;
}

const ACCEPT = '.ttf,.otf,.woff,.woff2';

const PREVIEW_SIZES = [12, 14, 16, 18, 24, 32, 48, 64, 72, 96];
const WATERFALL_SIZES = [12, 14, 16, 18, 24, 32, 48, 64];

const SAMPLE_TEXTS = [
	'The quick brown fox jumps over the lazy dog',
	'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	'abcdefghijklmnopqrstuvwxyz',
	'0123456789',
	'!@#$%^&*()_+-=[]{}|;\':",./<>?',
	'Sphinx of black quartz, judge my vow',
	'Pack my box with five dozen liquor jugs',
];
const WATERFALL_TEXT = 'Aa Bb Cc Dd Ee Ff Gg';
const DEFAULT_PREVIEW = 'The quick brown fox jumps over the lazy dog';
const PREVIEW_PLACEHOLDER = 'Type to preview…';
const PREVIEW_EMPTY = 'Type something to preview…';
const NOT_A_FONT = 'Please upload a font file (.ttf, .otf, .woff, .woff2)';
const LOAD_FAILED =
	'Failed to load font. The file may be corrupted or invalid.';
const METADATA_NOTE =
	'Note: Full font metadata extraction requires specialised font parsing libraries. This tool provides basic font preview functionality.';

let familySeq = 0;

export default class FontExplorerTool extends Component {
	@tracked fileName = '';
	@tracked family: string | null = null;
	@tracked error: string | null = null;
	@tracked previewText = DEFAULT_PREVIEW;
	@tracked previewSize = 48;

	#objectUrl: string | null = null;
	#fontFace: FontFace | null = null;
	// ignore stale font loads
	#runId = 0;

	willDestroy() {
		super.willDestroy();
		this.#release();
	}

	get accept() {
		return ACCEPT;
	}

	get hasFont() {
		return this.family !== null;
	}

	get fullName() {
		return baseName(this.fileName);
	}

	get postScript() {
		return postScriptName(this.fileName);
	}

	get css() {
		return cssUsage(this.fileName);
	}

	get placeholder() {
		return PREVIEW_PLACEHOLDER;
	}

	get metadataNote() {
		return METADATA_NOTE;
	}

	get sizes() {
		return PREVIEW_SIZES;
	}

	get sizeLabel() {
		return `${this.previewSize}px`;
	}

	get previewValue() {
		return String(this.previewSize);
	}

	get previewBody() {
		return this.previewText || PREVIEW_EMPTY;
	}

	get previewStyle() {
		return this.#fontStyle(this.previewSize, 1.4);
	}

	get sampleRows() {
		return SAMPLE_TEXTS.map((text, index) => ({
			text,
			style: this.#fontStyle(index < 2 ? 24 : 18),
		}));
	}

	get waterfallRows() {
		return WATERFALL_SIZES.map((size) => ({
			size,
			label: `${size}px`,
			text: WATERFALL_TEXT,
			style: this.#fontStyle(size, size > 40 ? 1.2 : 1.5),
		}));
	}

	#fontStyle(size: number, lineHeight?: number) {
		const family = this.family ?? 'inherit';
		const line =
			lineHeight === undefined
				? ''
				: `; line-height: ${lineHeight}`;
		return htmlSafe(
			`font-family: ${family}; font-size: ${size}px${line}`,
		);
	}

	#release() {
		if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
		this.#objectUrl = null;
		if (this.#fontFace) document.fonts.delete(this.#fontFace);
		this.#fontFace = null;
	}

	readFile = async (file: File) => {
		if (!isFontFile(file.name)) {
			this.error = NOT_A_FONT;
			return;
		}

		const runId = ++this.#runId;
		this.#release();
		this.error = null;
		this.family = null;
		this.fileName = file.name;

		const url = URL.createObjectURL(file);
		this.#objectUrl = url;

		const family = `preview-${familySeq++}`;
		const fontFace = new FontFace(family, `url(${url})`);

		try {
			await fontFace.load();
			if (runId !== this.#runId) {
				URL.revokeObjectURL(url);
				return;
			}
			document.fonts.add(fontFace);
			this.#fontFace = fontFace;
			this.family = family;
		} catch (loadError) {
			if (runId !== this.#runId) return;
			console.error('Font load failed:', loadError);
			this.#release();
			this.fileName = '';
			this.error = LOAD_FAILED;
		}
	};

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void this.readFile(file);
		// allow file reselection
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) void this.readFile(file);
		else this.error = NOT_A_FONT;
	};

	// prevent dropped-file navigation
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setPreviewText = (event: Event) => {
		this.previewText = (event.target as HTMLInputElement).value;
	};

	setPreviewSize = (value: string) => {
		this.previewSize = Number.parseInt(value, 10);
	};

	clear = () => {
		this.#runId++;
		this.#release();
		this.fileName = '';
		this.family = null;
		this.error = null;
	};

	<template>
		<div class="dt-fx" {{filePaste this.readFile accept=ACCEPT}}>
			{{#if this.hasFont}}
				<div class="dt-fx-panel">
					<div class="dt-fx-head">
						<span class="dt-fx-head-names">
							<span
								class="dt-fx-title"
							>{{this.fullName}}</span>
							<span
								class="dt-fx-file"
							>{{this.fileName}}</span>
						</span>
						<button
							type="button"
							class="dt-fx-clear"
							aria-label="Clear font"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
						</button>
					</div>

					<div class="dt-fx-preview">
						<div class="dt-fx-preview-bar">
							{{! wording carried over from the Next app }}
							<label
								class="dt-fx-preview-label"
								for="dt-fx-preview-text"
							>Preview</label>
							<input
								id="dt-fx-preview-text"
								type="text"
								class="dt-fx-preview-input"
								placeholder={{this.placeholder}}
								value={{this.previewText}}
								{{on
									"input"
									this.setPreviewText
								}}
							/>
							<span
								class="dt-fx-size"
							>
								<Select
									@value={{this.previewValue}}
									@onValueChange={{this.setPreviewSize}}
								>
									<SelectTrigger
									>
										<SelectValue
										>{{this.sizeLabel}}</SelectValue>
									</SelectTrigger>
									<SelectContent
									>
										{{#each
											this.sizes
											key="@index"
											as |size|
										}}
											<SelectItem
												@value="{{size}}"
											>{{size}}px</SelectItem>
										{{/each}}
									</SelectContent>
								</Select>
							</span>
						</div>

						<div
							class="dt-fx-canvas"
							style={{this.previewStyle}}
						>{{this.previewBody}}</div>
					</div>

					<div class="dt-fx-block">
						<div class="dt-fx-block-head">
							{{! wording carried over from the Next app }}
							<span
								class="dt-fx-block-label"
							>Sample Texts</span>
						</div>
						{{#each
							this.sampleRows
							key="text"
							as |row|
						}}
							<div
								class="dt-fx-sample"
								style={{row.style}}
							>{{row.text}}</div>
						{{/each}}
					</div>

					<div class="dt-fx-block">
						<div class="dt-fx-block-head">
							{{! wording carried over from the Next app }}
							<span
								class="dt-fx-block-label"
							>Size Waterfall</span>
						</div>
						{{#each
							this.waterfallRows
							key="size"
							as |row|
						}}
							<div class="dt-fx-step">
								<span
									class="dt-fx-step-size"
								>{{row.label}}</span>
								<span
									class="dt-fx-step-text"
									style={{row.style}}
								>{{row.text}}</span>
							</div>
						{{/each}}
					</div>

					<div class="dt-fx-block">
						<div class="dt-fx-block-head">
							{{! wording carried over from the Next app }}
							<span
								class="dt-fx-block-label"
							>Font Information</span>
						</div>
						<div class="dt-fx-info">
							{{! wording carried over from the Next app }}
							<span
								class="dt-fx-info-key"
							>File Name</span>
							<span
								class="dt-fx-info-value"
							>{{this.fileName}}</span>
						</div>
						<div class="dt-fx-info">
							{{! wording carried over from the Next app }}
							<span
								class="dt-fx-info-key"
							>PostScript Name</span>
							<span
								class="dt-fx-info-value"
							>{{this.postScript}}</span>
						</div>
						{{! wording carried over from the Next app }}
						<p
							class="dt-fx-note"
						>{{this.metadataNote}}</p>
					</div>

					<div class="dt-fx-block is-last">
						<div class="dt-fx-block-head">
							{{! wording carried over from the Next app }}
							<span
								class="dt-fx-block-label"
							>CSS Usage</span>
						</div>
						<pre
							class="dt-fx-css"
						>{{this.css}}</pre>
					</div>
				</div>
			{{else}}
				<div class="dt-fx-panel">
					{{#if this.error}}
						<p
							class="dt-fx-error"
						>{{this.error}}</p>
					{{/if}}
					<label
						class="dt-fx-drop"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
					>
						<input
							type="file"
							class="dt-sr-only"
							accept={{this.accept}}
							{{on
								"change"
								this.chooseFile
							}}
						/>
						<Icon @name="upload" />
						{{! wording carried over from the Next app }}
						<span
							class="dt-fx-drop-title"
						>Drop font file here</span>
						{{! wording carried over from the Next app }}
						<span
							class="dt-fx-drop-hint"
						>TTF, OTF, WOFF, or WOFF2, or
							paste</span>
					</label>
				</div>
			{{/if}}
		</div>
	</template>
}
