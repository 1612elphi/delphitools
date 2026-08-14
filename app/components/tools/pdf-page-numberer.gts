import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	ANCHORS,
	expandNumber,
	pageLabelNumber,
	placeText,
	type Anchor,
} from 'delphitools-v2/lib/pdf-stamp';

const ACCEPT = '.pdf';

export default class PdfPageNumbererTool extends Component {
	@tracked fileName = '';
	@tracked pageCount = 0;
	@tracked reading = false;
	@tracked working = false;
	@tracked error = '';

	@tracked numbersOn = true;
	@tracked numberTemplate = '{n} / {N}';
	@tracked numberAnchor: Anchor = 'bottom-center';

	@tracked stampOn = false;
	@tracked stampText = '';
	@tracked stampAnchor: Anchor = 'top-right';

	@tracked fontSize = 11;
	@tracked margin = 24;
	@tracked startAt = 1;
	@tracked skipFirst = false;

	#bytes: ArrayBuffer | null = null;

	get anchors() {
		return ANCHORS;
	}

	get ready() {
		return this.pageCount > 0 && !this.working;
	}

	readFile = async (file: File) => {
		this.error = '';
		this.reading = true;
		try {
			const bytes = await file.arrayBuffer();
			const { PDFDocument } = await import('pdf-lib');
			const doc = await PDFDocument.load(bytes, {
				updateMetadata: false,
			});
			this.#bytes = bytes;
			this.fileName = file.name;
			this.pageCount = doc.getPageCount();
		} catch {
			this.error = 'notpdf';
			this.pageCount = 0;
			this.#bytes = null;
		} finally {
			this.reading = false;
		}
	};

	onPick = (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) void this.readFile(file);
	};

	setTemplate = (event: Event) => {
		this.numberTemplate = (event.target as HTMLInputElement).value;
	};
	setStampText = (event: Event) => {
		this.stampText = (event.target as HTMLInputElement).value;
	};
	setNumberAnchor = (a: Anchor) => (this.numberAnchor = a);
	setStampAnchor = (a: Anchor) => (this.stampAnchor = a);
	toggleNumbers = () => (this.numbersOn = !this.numbersOn);
	toggleStamp = () => (this.stampOn = !this.stampOn);
	toggleSkipFirst = () => (this.skipFirst = !this.skipFirst);

	setNumber = (key: 'fontSize' | 'margin' | 'startAt', event: Event) => {
		const n = Number.parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (Number.isFinite(n)) this[key] = n;
	};

	apply = async () => {
		if (!this.#bytes) return;
		this.working = true;
		this.error = '';
		try {
			const { PDFDocument, StandardFonts, rgb } =
				await import('pdf-lib');
			const doc = await PDFDocument.load(this.#bytes, {
				updateMetadata: false,
			});
			const font = await doc.embedFont(
				StandardFonts.Helvetica,
			);
			const size = Math.max(4, this.fontSize);
			const pages = doc.getPages();
			const total = pages.length;

			pages.forEach((page, index) => {
				const { width, height } = page.getSize();

				if (this.numbersOn) {
					const n = pageLabelNumber(
						index,
						this.startAt,
						this.skipFirst,
					);
					if (n !== null) {
						const text = expandNumber(
							this.numberTemplate,
							n,
							total,
						);
						const w =
							font.widthOfTextAtSize(
								text,
								size,
							);
						const { x, y } = placeText(
							width,
							height,
							w,
							size,
							this.numberAnchor,
							this.margin,
						);
						page.drawText(text, {
							x,
							y,
							size,
							font,
							color: rgb(0, 0, 0),
						});
					}
				}

				if (
					this.stampOn &&
					this.stampText.trim() !== ''
				) {
					const text = this.stampText;
					const w = font.widthOfTextAtSize(
						text,
						size,
					);
					const { x, y } = placeText(
						width,
						height,
						w,
						size,
						this.stampAnchor,
						this.margin,
					);
					page.drawText(text, {
						x,
						y,
						size,
						font,
						color: rgb(0.4, 0.4, 0.4),
					});
				}
			});

			const out = await doc.save();
			const stem = this.fileName.replace(/\.pdf$/i, '');
			downloadBlob(
				new Blob([new Uint8Array(out)], {
					type: 'application/pdf',
				}),
				`${stem}-numbered.pdf`,
			);
		} catch {
			this.error = 'failed';
		} finally {
			this.working = false;
		}
	};

	<template>
		<div class="dt-ppn" {{filePaste this.readFile accept=ACCEPT}}>
			{{#if (eq this.pageCount 0)}}
				<label class="dt-ppn-drop">
					<input
						type="file"
						accept={{ACCEPT}}
						class="dt-sr-only"
						{{on "change" this.onPick}}
					/>
					<Icon @name="file-plus" />
					<span class="dt-ppn-drop-title">Drop a
						PDF</span>
					<span class="dt-ppn-drop-hint">or click</span>
				</label>
			{{else}}
				<div class="dt-ppn-bar">
					<span
						class="dt-ppn-name"
					>{{this.fileName}}</span>
					<span
						class="dt-ppn-count"
					>{{this.pageCount}} pp.</span>
					<button
						type="button"
						class="dt-ppn-go"
						disabled={{this.working}}
						{{on "click" this.apply}}
					>
						<Icon @name="stamp" />
						Apply
					</button>
				</div>

				<div class="dt-ppn-grid">
					<section class="dt-ppn-block">
						<label class="dt-ppn-toggle">
							<input
								type="checkbox"
								checked={{this.numbersOn}}
								{{on
									"change"
									this.toggleNumbers
								}}
							/>
							Page numbers
						</label>
						<label class="dt-ppn-field">
							<span>Format</span>
							<input
								type="text"
								value={{this.numberTemplate}}
								placeholder="{n} / {N}"
								{{on
									"input"
									this.setTemplate
								}}
							/>
						</label>
						<div class="dt-ppn-field">
							<span>Position</span>
							<span
								class="segmented dt-ppn-anchors"
							>
								{{#each
									this.anchors
									key="."
									as |a|
								}}
									<button
										type="button"
										aria-label={{a}}
										class="dt-ppn-anchor
											{{if
												(eq
													a
													this.numberAnchor
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setNumberAnchor
												a
											)
										}}
									></button>
								{{/each}}
							</span>
						</div>
					</section>

					<section class="dt-ppn-block">
						<label class="dt-ppn-toggle">
							<input
								type="checkbox"
								checked={{this.stampOn}}
								{{on
									"change"
									this.toggleStamp
								}}
							/>
							Stamp text
						</label>
						<label class="dt-ppn-field">
							<span>Text</span>
							<input
								type="text"
								value={{this.stampText}}
								placeholder="DRAFT"
								{{on
									"input"
									this.setStampText
								}}
							/>
						</label>
						<div class="dt-ppn-field">
							<span>Position</span>
							<span
								class="segmented dt-ppn-anchors"
							>
								{{#each
									this.anchors
									key="."
									as |a|
								}}
									<button
										type="button"
										aria-label={{a}}
										class="dt-ppn-anchor
											{{if
												(eq
													a
													this.stampAnchor
												)
												'is-active'
											}}"
										{{on
											"click"
											(fn
												this.setStampAnchor
												a
											)
										}}
									></button>
								{{/each}}
							</span>
						</div>
					</section>

					<section
						class="dt-ppn-block dt-ppn-common"
					>
						<label class="dt-ppn-field">
							<span>Font size</span>
							<input
								type="number"
								value={{this.fontSize}}
								{{on
									"input"
									(fn
										this.setNumber
										"fontSize"
									)
								}}
							/>
						</label>
						<label class="dt-ppn-field">
							<span>Margin</span>
							<input
								type="number"
								value={{this.margin}}
								{{on
									"input"
									(fn
										this.setNumber
										"margin"
									)
								}}
							/>
						</label>
						<label class="dt-ppn-field">
							<span>Start at</span>
							<input
								type="number"
								value={{this.startAt}}
								{{on
									"input"
									(fn
										this.setNumber
										"startAt"
									)
								}}
							/>
						</label>
						<label class="dt-ppn-toggle">
							<input
								type="checkbox"
								checked={{this.skipFirst}}
								{{on
									"change"
									this.toggleSkipFirst
								}}
							/>
							Skip first page
						</label>
					</section>
				</div>
			{{/if}}
		</div>
	</template>
}
