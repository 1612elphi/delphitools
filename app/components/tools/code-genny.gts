import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from 'delphitools-v2/components/ui/tooltip';

export type BarcodeType =
	| 'microqr'
	| 'datamatrix'
	| 'azteccode'
	| 'pdf417'
	| 'code128'
	| 'code39'
	| 'ean13'
	| 'upca';

export interface BarcodeInfo {
	name: string;
	category: '2d' | '1d';
	charHint: string;
	allowedPattern: RegExp;
	inventor: string;
	year: string;
	description: string;
	placeholder: string;
	validate?: (value: string) => string | null;
}

const GENERATE_DEBOUNCE_MS = 300;
const COPIED_MS = 1500;

/** Six digits behind a #, the only form `<input type="color">` accepts. */
const HEX = /^#[0-9a-f]{6}$/i;

// The Next app spelled this \x00-\x7F, which eslint rejects as a control-
// character range. \p{ASCII} is the same set, U+0000 to U+007F.
const ASCII = /^\p{ASCII}*$/u;
const CODE39 = /^[A-Z0-9\-. $/+%]*$/;
const DIGITS = /^\d*$/;

/**
 * Mod-10 check digit for the EAN/UPC family. `digits` is the data portion
 * without the trailing check digit (12 for EAN-13, 11 for UPC-A). The weight
 * pair differs per symbology: EAN-13 weights even/odd indices 1/3, UPC-A 3/1.
 */
export function mod10CheckDigit(
	digits: string,
	evenWeight: number,
	oddWeight: number,
): number {
	let sum = 0;
	for (let i = 0; i < digits.length; i++) {
		sum +=
			(digits.charCodeAt(i) - 48) *
			(i % 2 === 0 ? evenWeight : oddWeight);
	}
	return (10 - (sum % 10)) % 10;
}

// Every string in this table is carried over from the Next app unchanged.
export const BARCODE_TYPES: Record<BarcodeType, BarcodeInfo> = {
	microqr: {
		name: 'Micro QR',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Denso Wave',
		year: '2004',
		description:
			'Smaller version of QR code for space-constrained applications. Uses only one position detection pattern.',
		placeholder: 'Short text or URL',
	},
	datamatrix: {
		name: 'Data Matrix',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'International Data Matrix Inc. (RVSI Acuity CiMatrix)',
		year: '1987',
		description:
			'Used extensively in electronics, healthcare, and logistics. Can encode up to 2,335 alphanumeric characters.',
		placeholder: 'Product ID or serial number',
	},
	azteccode: {
		name: 'Aztec Code',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Andrew Longacre Jr. (Welch Allyn)',
		year: '1995',
		description:
			'Named for resemblance to Aztec pyramids. Used on airline boarding passes and by Deutsche Bahn.',
		placeholder: 'Boarding pass or ticket data',
	},
	pdf417: {
		name: 'PDF417',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Ynjiun Paul Wang (Symbol Technologies)',
		year: '1991',
		description:
			'Portable Data File with 4 bars and spaces in 17 modules. Used on IDs, shipping labels, and boarding passes.',
		placeholder: 'ID or license data',
	},
	code128: {
		name: 'Code 128',
		category: '1d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Computer Identics Corporation',
		year: '1981',
		description:
			'High-density barcode for alphanumeric data. Widely used in shipping and packaging industries.',
		placeholder: 'ABC-12345',
	},
	code39: {
		name: 'Code 39',
		category: '1d',
		charHint: 'A-Z (uppercase), 0-9, and - . $ / + % space',
		allowedPattern: CODE39,
		inventor: 'David Allais & Ray Stevens (Intermec)',
		year: '1974',
		description:
			'One of the first alphanumeric barcodes. Still used in automotive, defense, and healthcare.',
		placeholder: 'CODE39TEST',
		validate: (value) =>
			CODE39.test(value)
				? null
				: 'Code 39 only supports: A-Z (uppercase), 0-9, - . $ / + % and space',
	},
	ean13: {
		name: 'EAN-13',
		category: '1d',
		charHint: 'Numbers only (12-13 digits)',
		allowedPattern: DIGITS,
		inventor: 'George Laurer (IBM), adapted from UPC',
		year: '1976',
		description:
			'European Article Number. Standard barcode for retail products worldwide.',
		placeholder: '5901234123457',
		validate: (value) => {
			if (value.length === 0) return null;
			if (!/^\d{12,13}$/.test(value)) {
				return 'EAN-13 requires exactly 12 or 13 digits';
			}
			if (value.length === 13) {
				const expected = mod10CheckDigit(
					value.slice(0, 12),
					1,
					3,
				);
				if (value.charCodeAt(12) - 48 !== expected) {
					return `Check digit should be ${expected} — or enter just the first 12 digits to auto-fill it`;
				}
			}
			return null;
		},
	},
	upca: {
		name: 'UPC-A',
		category: '1d',
		charHint: 'Numbers only (11-12 digits)',
		allowedPattern: DIGITS,
		inventor: 'George Laurer (IBM)',
		year: '1973',
		description:
			'Universal Product Code. The original retail barcode, still dominant in North America.',
		placeholder: '012345678905',
		validate: (value) => {
			if (value.length === 0) return null;
			if (!/^\d{11,12}$/.test(value)) {
				return 'UPC-A requires exactly 11 or 12 digits';
			}
			if (value.length === 12) {
				const expected = mod10CheckDigit(
					value.slice(0, 11),
					3,
					1,
				);
				if (value.charCodeAt(11) - 48 !== expected) {
					return `Check digit should be ${expected} — or enter just the first 11 digits to auto-fill it`;
				}
			}
			return null;
		},
	},
};

/** Insertion order is the order the buttons appear in. */
const TYPE_LIST = Object.entries(BARCODE_TYPES) as [BarcodeType, BarcodeInfo][];

/** bwip-js bcid per type; the only one that differs from our own id. */
const BWIP_BCID: Record<BarcodeType, string> = {
	microqr: 'microqrcode',
	datamatrix: 'datamatrix',
	azteccode: 'azteccode',
	pdf417: 'pdf417',
	code128: 'code128',
	code39: 'code39',
	ean13: 'ean13',
	upca: 'upca',
};

export function isContentCompatible(
	content: string,
	type: BarcodeType,
): boolean {
	if (!content) return true;
	return BARCODE_TYPES[type].allowedPattern.test(content);
}

/** Drops every character the symbology cannot carry. Code 39 also uppercases. */
export function filterContent(content: string, type: BarcodeType): string {
	const text = type === 'code39' ? content.toUpperCase() : content;
	const pattern = BARCODE_TYPES[type].allowedPattern;
	return text
		.split('')
		.filter((char) => pattern.test(char))
		.join('');
}

export interface CodeOptions {
	padding: number;
	foregroundColour: string;
	backgroundColour: string;
	transparentBg: boolean;
	showText: boolean;
}

/**
 * Transparency relies on OMITTING backgroundcolor: bwip-js only paints a
 * background when the value is a valid 6-hex string, otherwise it clears the
 * canvas to alpha-0 (bwip-js 4.11.2, src/drawing-canvas.js).
 */
export function buildBwipOptions(
	type: BarcodeType,
	text: string,
	size: number,
	options: CodeOptions,
) {
	const is1D = BARCODE_TYPES[type].category === '1d';
	return {
		bcid: BWIP_BCID[type],
		text,
		scale: is1D ? 3 : Math.max(2, Math.floor(size / 100)),
		includetext: is1D && options.showText,
		textxalign: 'center' as const,
		paddingwidth: options.padding * 2,
		paddingheight: options.padding * 2,
		barcolor: options.foregroundColour.replace('#', ''),
		...(options.transparentBg
			? {}
			: {
					backgroundcolor:
						options.backgroundColour.replace(
							'#',
							'',
						),
				}),
		...(type === 'pdf417'
			? { height: 10 }
			: is1D
				? { height: 15 }
				: {}),
	};
}

/**
 * bwip-js raises errors as "bwipp.someCode#1234: message" or "bwip-js: message".
 * Strip the namespace so users see the human-readable part only.
 */
export function friendlyBwipError(err: unknown): string {
	const raw =
		err instanceof Error
			? err.message
			: 'Failed to generate barcode';
	return raw.replace(/^(bwipp\.[^:]*|bwip-js):\s*/, '');
}

function slug(name: string): string {
	return name.toLowerCase().replace(/\s+/g, '-');
}

class BatchItem {
	id = crypto.randomUUID();
	@tracked content: string;
	@tracked status: 'pending' | 'generating' | 'done' | 'error' =
		'pending';
	@tracked dataUrl: string | null = null;

	constructor(content: string) {
		this.content = content;
	}
}

export default class CodeGennyTool extends Component {
	@tracked codeType: BarcodeType = 'datamatrix';
	@tracked content = '';
	@tracked size = 300;
	@tracked padding = 2;
	@tracked foregroundColour = '#000000';
	@tracked backgroundColour = '#ffffff';
	@tracked transparentBg = false;
	@tracked showText = true;

	@tracked codeDataUrl: string | null = null;
	@tracked copied = false;
	@tracked generating = false;
	@tracked error: string | null = null;

	@tracked batchItems: BatchItem[] = [];
	@tracked batchGenerating = false;

	// Both option groups start open, as the Next app's accordion did.
	// <details> would carry this for free, but ember-template-lint's
	// no-nested-interactive forbids a form control inside one.
	@tracked basicOpen = true;
	@tracked coloursOpen = true;

	#timer: ReturnType<typeof setTimeout> | null = null;
	#copiedTimer: ReturnType<typeof setTimeout> | null = null;
	#run = 0;
	#destroyed = false;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		if (this.#timer) clearTimeout(this.#timer);
		if (this.#copiedTimer) clearTimeout(this.#copiedTimer);
	}

	get currentType(): BarcodeInfo {
		return BARCODE_TYPES[this.codeType];
	}

	get is1D() {
		return this.currentType.category === '1d';
	}

	get types() {
		return TYPE_LIST.map(([id, info]) => ({
			id,
			info,
			isActive: id === this.codeType,
		}));
	}

	get options(): CodeOptions {
		return {
			padding: this.padding,
			foregroundColour: this.foregroundColour,
			backgroundColour: this.backgroundColour,
			transparentBg: this.transparentBg,
			showText: this.showText,
		};
	}

	get noCode() {
		return this.codeDataUrl === null;
	}

	get batchBusy() {
		return this.batchItems.length === 0 || this.batchGenerating;
	}

	get batchRows() {
		return this.batchItems.map((item, index) => ({
			item,
			number: index + 1,
		}));
	}

	get batchHint() {
		return `${this.currentType.charHint}. Upload a text file with one item per line.`;
	}

	get emptyPreview() {
		return `Enter content to generate ${this.currentType.name}`;
	}

	/** `<input type="color">` resets itself on a value it cannot parse. */
	get foregroundSwatch() {
		return HEX.test(this.foregroundColour)
			? this.foregroundColour
			: '#000000';
	}

	get backgroundSwatch() {
		return HEX.test(this.backgroundColour)
			? this.backgroundColour
			: '#ffffff';
	}

	get backgroundField() {
		return this.transparentBg
			? 'transparent'
			: this.backgroundColour;
	}

	get foregroundStyle() {
		return htmlSafe(`background-color: ${this.foregroundSwatch}`);
	}

	get stageStyle() {
		return this.transparentBg
			? htmlSafe('')
			: htmlSafe(
					`background-color: ${this.backgroundSwatch}`,
				);
	}

	get imageStyle() {
		return htmlSafe(`max-width: ${this.size}px; height: auto`);
	}

	toggleBasic = () => (this.basicOpen = !this.basicOpen);

	toggleColours = () => (this.coloursOpen = !this.coloursOpen);

	selectType = (type: BarcodeType) => {
		if (!isContentCompatible(this.content, type)) this.content = '';
		this.codeType = type;
		this.queueGenerate();
	};

	/**
	 * The filtered value is written back to the element: when every typed
	 * character is rejected the tracked value does not change, so nothing
	 * re-renders and the rejected character would otherwise stay on screen.
	 */
	setContent = (event: Event) => {
		const input = event.target as HTMLInputElement;
		input.value = filterContent(input.value, this.codeType);
		this.content = input.value;
		this.queueGenerate();
	};

	setSize = (event: Event) => {
		this.size = Number((event.target as HTMLInputElement).value);
		this.queueGenerate();
	};

	setPadding = (event: Event) => {
		this.padding = Number((event.target as HTMLInputElement).value);
		this.queueGenerate();
	};

	setForeground = (event: Event) => {
		this.foregroundColour = (
			event.target as HTMLInputElement
		).value;
		this.queueGenerate();
	};

	setBackground = (event: Event) => {
		this.backgroundColour = (
			event.target as HTMLInputElement
		).value;
		this.queueGenerate();
	};

	setTransparent = (event: Event) => {
		this.transparentBg = (event.target as HTMLInputElement).checked;
		this.queueGenerate();
	};

	setShowText = (event: Event) => {
		this.showText = (event.target as HTMLInputElement).checked;
		this.queueGenerate();
	};

	queueGenerate = () => {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			void this.generate();
		}, GENERATE_DEBOUNCE_MS);
	};

	async generate() {
		if (!this.content.trim()) {
			this.codeDataUrl = null;
			this.error = null;
			return;
		}

		const validationError = this.currentType.validate?.(
			this.content,
		);
		if (validationError) {
			this.error = validationError;
			this.codeDataUrl = null;
			return;
		}

		this.generating = true;
		this.error = null;

		// Only the first call actually waits on the module, but a render that
		// resolved after a newer one started would otherwise overwrite it.
		const run = ++this.#run;

		try {
			const bwipjs = await import('bwip-js/browser');
			if (this.#destroyed || run !== this.#run) return;

			const canvas = document.createElement('canvas');
			bwipjs.toCanvas(
				canvas,
				buildBwipOptions(
					this.codeType,
					this.content,
					this.size,
					this.options,
				),
			);
			this.codeDataUrl = canvas.toDataURL('image/png');
		} catch (err) {
			if (this.#destroyed || run !== this.#run) return;
			this.error = friendlyBwipError(err);
			this.codeDataUrl = null;
		} finally {
			if (!this.#destroyed && run === this.#run) {
				this.generating = false;
			}
		}
	}

	download = () => {
		if (!this.codeDataUrl) return;
		const link = document.createElement('a');
		link.download = `${slug(this.currentType.name)}-${Date.now()}.png`;
		link.href = this.codeDataUrl;
		link.click();
	};

	copy = async () => {
		if (!this.codeDataUrl) return;

		try {
			const blob = await (
				await fetch(this.codeDataUrl)
			).blob();
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
		} catch {
			// Firefox has no image support in clipboard.write, and every
			// browser denies it outside a permitted gesture. The button not
			// flipping to Copied! is the whole report, as in the Next app.
			return;
		}
		if (this.#destroyed) return;

		this.copied = true;
		if (this.#copiedTimer) clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	addBatchItem = () => {
		this.batchItems = [...this.batchItems, new BatchItem('')];
	};

	removeBatchItem = (item: BatchItem) => {
		this.batchItems = this.batchItems.filter(
			(each) => each !== item,
		);
	};

	updateBatchItem = (item: BatchItem, event: Event) => {
		const input = event.target as HTMLInputElement;
		input.value = filterContent(input.value, this.codeType);
		item.content = input.value;
	};

	uploadList = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// Choosing the same file twice must still fire a change event.
		input.value = '';
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			if (this.#destroyed) return;
			const lines = (reader.result as string)
				.split(/\r?\n/)
				.map((line) =>
					filterContent(
						line.trim(),
						this.codeType,
					),
				)
				.filter((line) => line.length > 0);
			this.batchItems = [
				...this.batchItems,
				...lines.map((line) => new BatchItem(line)),
			];
		};
		reader.readAsText(file);
	};

	generateBatch = async () => {
		if (this.batchItems.length === 0) return;

		this.batchGenerating = true;
		const bwipjs = await import('bwip-js/browser');
		const JSZip = (await import('jszip')).default;
		if (this.#destroyed) return;

		const zip = new JSZip();
		const typeInfo = this.currentType;

		for (const item of this.batchItems) {
			if (this.#destroyed) return;
			if (!item.content.trim()) continue;

			if (typeInfo.validate?.(item.content)) {
				item.status = 'error';
				continue;
			}

			item.status = 'generating';

			try {
				const canvas = document.createElement('canvas');
				bwipjs.toCanvas(
					canvas,
					buildBwipOptions(
						this.codeType,
						item.content,
						this.size,
						this.options,
					),
				);
				const dataUrl = canvas.toDataURL('image/png');
				const blob = await (
					await fetch(dataUrl)
				).blob();
				if (this.#destroyed) return;

				const safeName = item.content
					.slice(0, 30)
					.replace(/[^a-zA-Z0-9]/g, '_');
				zip.file(
					`${slug(typeInfo.name)}-${safeName}.png`,
					blob,
				);
				item.dataUrl = dataUrl;
				item.status = 'done';
			} catch {
				if (this.#destroyed) return;
				item.status = 'error';
			}
		}

		const zipBlob = await zip.generateAsync({ type: 'blob' });
		if (this.#destroyed) return;

		const url = URL.createObjectURL(zipBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${slug(typeInfo.name)}-batch-${Date.now()}.zip`;
		link.click();
		// Revoking in the same task can cancel the download in Chrome.
		setTimeout(() => URL.revokeObjectURL(url), 0);

		this.batchGenerating = false;
	};

	<template>
		<div class="dt-code">
			<div class="dt-code-section">
				{{! wording carried over from the Next app }}
				<span class="dt-code-heading">Code Type</span>
				<div class="dt-code-types">
					{{#each this.types key="id" as |entry|}}
						<Tooltip>
							<TooltipTrigger>
								<button
									type="button"
									class="dt-code-type
										{{if
											entry.isActive
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.selectType
											entry.id
										)
									}}
								>{{entry.info.name}}</button>
							</TooltipTrigger>
							<TooltipContent
								class="dt-code-tip"
								@side="bottom"
							>
								<span
									class="dt-code-tip-name"
								>{{entry.info.name}}</span>
								<span
									class="dt-code-tip-desc"
								>{{entry.info.description}}</span>
							</TooltipContent>
						</Tooltip>
					{{/each}}
				</div>
			</div>

			<Tabs @defaultValue="single">
				<TabsList class="dt-code-tabs">
					<TabsTrigger
						class="dt-code-tab"
						@value="single"
					>Single</TabsTrigger>
					{{! wording carried over from the Next app }}
					<TabsTrigger
						class="dt-code-tab"
						@value="batch"
					>Batch Mode</TabsTrigger>
				</TabsList>

				<div class="dt-code-frame">
					<TabsContent
						class="dt-code-panel"
						@value="single"
					>
						<div class="dt-code-content">
							{{! wording carried over from the Next app }}
							<label
								class="dt-code-label"
								for="dt-code-text"
							>Content</label>
							<input
								id="dt-code-text"
								type="text"
								class="dt-code-field"
								value={{this.content}}
								placeholder={{this.currentType.placeholder}}
								{{on
									"input"
									this.setContent
								}}
							/>
							<p
								class="dt-code-hint"
							>{{this.currentType.charHint}}</p>
							{{#if this.error}}
								<p
									class="dt-code-error"
									role="alert"
								>{{this.error}}</p>
							{{/if}}
						</div>

						<div class="dt-code-main">
							<div
								class="dt-code-preview"
							>
								<div
									class="dt-code-preview-head"
								>
									{{! wording carried over from the Next app }}
									<span
										class="dt-code-heading"
									>Preview</span>
									{{#if
										this.is1D
									}}
										<label
											class="dt-code-toggle"
										>
											<input
												type="checkbox"
												class="dt-code-switch"
												checked={{this.showText}}
												{{on
													"change"
													this.setShowText
												}}
											/>
											{{! wording carried over from the Next app }}
											Show
											numbers
										</label>
									{{/if}}
								</div>

								<div
									class="dt-code-stage
										{{if
											this.transparentBg
											'is-checkered'
										}}"
									style={{this.stageStyle}}
								>
									{{#if
										this.generating
									}}
										<Icon
											class="dt-code-spinner"
											@name="loader-circle"
										/>
									{{else if
										this.codeDataUrl
									}}
										<img
											src={{this.codeDataUrl}}
											alt={{this.currentType.name}}
											style={{this.imageStyle}}
										/>
									{{else}}
										<p
											class="dt-code-empty"
										>{{this.emptyPreview}}</p>
									{{/if}}
								</div>

								<div
									class="dt-code-actions"
								>
									<button
										type="button"
										class="dt-code-action is-primary"
										disabled={{this.noCode}}
										{{on
											"click"
											this.download
										}}
									>
										<Icon
											@name="download"
										/>
										PNG
									</button>
									<button
										type="button"
										class="dt-code-action"
										disabled={{this.noCode}}
										{{on
											"click"
											this.copy
										}}
									>
										{{#if
											this.copied
										}}
											<Icon
												@name="check"
											/>
											Copied!
										{{else}}
											<Icon
												@name="copy"
											/>
											Copy
										{{/if}}
									</button>
								</div>
							</div>

							<div
								class="dt-code-options"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-code-heading"
								>Options</span>

								<div
									class="dt-code-group"
								>
									<button
										type="button"
										class="dt-code-group-head"
										aria-expanded={{if
											this.basicOpen
											"true"
											"false"
										}}
										{{on
											"click"
											this.toggleBasic
										}}
									>Basic
										Settings<Icon
											@name="chevron-down"
										/></button>
									{{#if
										this.basicOpen
									}}
										<div
											class="dt-code-group-body"
										>
											<div
												class="dt-code-slider"
											>
												{{! wording carried over from the Next app }}
												<label
													for="dt-code-size"
												>Size</label>
												<span
													class="dt-code-readout"
												>{{this.size}}px</span>
												<input
													id="dt-code-size"
													type="range"
													min="100"
													max="600"
													step="10"
													value={{this.size}}
													{{on
														"input"
														this.setSize
													}}
												/>
											</div>
											<div
												class="dt-code-slider"
											>
												{{! wording carried over from the Next app }}
												<label
													for="dt-code-padding"
												>Padding</label>
												<span
													class="dt-code-readout"
												>{{this.padding}}</span>
												<input
													id="dt-code-padding"
													type="range"
													min="0"
													max="10"
													step="1"
													value={{this.padding}}
													{{on
														"input"
														this.setPadding
													}}
												/>
											</div>
										</div>
									{{/if}}
								</div>

								<div
									class="dt-code-group"
								>
									<button
										type="button"
										class="dt-code-group-head"
										aria-expanded={{if
											this.coloursOpen
											"true"
											"false"
										}}
										{{on
											"click"
											this.toggleColours
										}}
									>Colours<Icon
											@name="chevron-down"
										/></button>
									{{#if
										this.coloursOpen
									}}
										<div
											class="dt-code-colours"
										>
											<div
												class="dt-code-colour"
											>
												{{! wording carried over from the Next app }}
												<span
													class="dt-code-colour-name"
												>Foreground</span>
												<span
													class="dt-code-swatch"
												>
													<span
														style={{this.foregroundStyle}}
														aria-hidden="true"
													></span>
													<input
														type="color"
														aria-label="Foreground colour"
														value={{this.foregroundSwatch}}
														{{on
															"input"
															this.setForeground
														}}
													/>
												</span>
												<input
													type="text"
													class="dt-code-hex"
													aria-label="Foreground colour"
													value={{this.foregroundColour}}
													{{on
														"input"
														this.setForeground
													}}
												/>
											</div>

											<div
												class="dt-code-colour"
											>
												{{! wording carried over from the Next app }}
												<span
													class="dt-code-colour-name"
												>Background</span>
												<span
													class="dt-code-swatch
														{{if
															this.transparentBg
															'is-checkered'
														}}"
												>
													<span
														style={{this.stageStyle}}
														aria-hidden="true"
													></span>
													<input
														type="color"
														aria-label="Background colour"
														value={{this.backgroundSwatch}}
														disabled={{this.transparentBg}}
														{{on
															"input"
															this.setBackground
														}}
													/>
												</span>
												<input
													type="text"
													class="dt-code-hex"
													aria-label="Background colour"
													value={{this.backgroundField}}
													disabled={{this.transparentBg}}
													{{on
														"input"
														this.setBackground
													}}
												/>
												<label
													class="dt-code-toggle"
												>
													<input
														type="checkbox"
														class="dt-code-switch"
														checked={{this.transparentBg}}
														{{on
															"change"
															this.setTransparent
														}}
													/>
													{{! wording carried over from the Next app }}
													Transparent
												</label>
											</div>
										</div>
									{{/if}}
								</div>
							</div>
						</div>
					</TabsContent>

					<TabsContent
						class="dt-code-panel is-batch"
						@value="batch"
					>
						{{#each
							this.batchRows
							key="item.id"
							as |row|
						}}
							<div
								class="dt-code-row"
							>
								<span
									class="dt-code-row-no"
								>{{row.number}}.</span>
								<input
									type="text"
									class="dt-code-field"
									value={{row.item.content}}
									placeholder={{this.currentType.placeholder}}
									aria-label="Batch item {{row.number}}"
									{{on
										"input"
										(fn
											this.updateBatchItem
											row.item
										)
									}}
								/>
								{{#if
									row.item.dataUrl
								}}
									<img
										class="dt-code-row-thumb"
										src={{row.item.dataUrl}}
										alt=""
									/>
								{{/if}}
								{{#if
									(eq
										row.item.status
										"generating"
									)
								}}
									<Icon
										class="dt-code-spinner"
										@name="loader-circle"
									/>
								{{/if}}
								{{#if
									(eq
										row.item.status
										"error"
									)
								}}
									<Icon
										class="dt-code-row-error"
										@name="alert-circle"
									/>
								{{/if}}
								<button
									type="button"
									class="dt-code-row-remove"
									aria-label="Remove item"
									{{on
										"click"
										(fn
											this.removeBatchItem
											row.item
										)
									}}
								><Icon
										@name="trash-2"
									/></button>
							</div>
						{{/each}}

						<div class="dt-code-batch-adds">
							<button
								type="button"
								class="dt-code-action"
								{{on
									"click"
									this.addBatchItem
								}}
							>
								<Icon
									@name="plus"
								/>
								{{! wording carried over from the Next app }}
								Add Item
							</button>
							<label
								class="dt-code-action"
							>
								<input
									type="file"
									class="dt-sr-only"
									accept=".txt,text/plain"
									{{on
										"change"
										this.uploadList
									}}
								/>
								<Icon
									@name="upload"
								/>
								{{! wording carried over from the Next app }}
								Upload List
							</label>
						</div>

						<p
							class="dt-code-hint"
						>{{this.batchHint}}</p>

						<button
							type="button"
							class="dt-code-run"
							disabled={{this.batchBusy}}
							{{on
								"click"
								this.generateBatch
							}}
						>
							{{#if
								this.batchGenerating
							}}
								<Icon
									class="dt-code-spinner"
									@name="loader-circle"
								/>
							{{else}}
								<Icon
									@name="package"
								/>
							{{/if}}
							{{! wording carried over from the Next app }}
							Generate &amp; Download
							ZIP
						</button>
					</TabsContent>
				</div>
			</Tabs>

			<div class="dt-code-about">
				<h3 class="dt-code-about-head">
					<Icon @name="info" />
					{{! wording carried over from the Next app }}
					About
					{{this.currentType.name}}
				</h3>
				<p>
					{{! wording carried over from the Next app }}
					<span class="dt-code-about-key">Invented
						by:</span>
					{{this.currentType.inventor}}
				</p>
				<p>
					{{! wording carried over from the Next app }}
					<span
						class="dt-code-about-key"
					>Year:</span>
					{{this.currentType.year}}
				</p>
				<p
					class="dt-code-about-desc"
				>{{this.currentType.description}}</p>
			</div>
		</div>
	</template>
}
