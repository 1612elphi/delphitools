import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCompressionScale from 'delphicanon/components/canon-compression-scale';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonImageCompare from 'delphicanon/components/canon-image-compare';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	MAX_SIZES,
	compressPdf,
	formatBytes,
	savingsPercent,
} from 'delphitools-v2/lib/pdf-compress';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { comparison, open, sizes, thumbnails } from 'delphitools-v2/lib/pdfjs';
import './media/media.css';

const ACCEPT = '.pdf,application/pdf';
const modes = ['Recompress', 'Keep'];
const losses = ['Lossy images', 'Lossless'];
const sizeLabels = MAX_SIZES.map((s) => s.label);
const whole = (value: number) => String(Math.round(value));

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Shrink = <template><IconSvg @name="shrink" /></template>;

interface Compressed {
	blob: Blob;
	size: number;
	imagesTouched: number;
}

export default class PdfCompressor extends Component {
	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked file: File | null = null;
	@tracked pages: CanonPage[] = [];
	@tracked page = 0;
	@tracked before = '';
	@tracked after = '';
	@tracked recompressImages = true;
	@tracked quality = 65;
	@tracked maxEdge = 0;
	@tracked compressed: Compressed | null = null;
	@tracked compressing = false;
	@tracked failed = false;

	#bytes: ArrayBuffer | null = null;
	#pdf?: PDFDocumentProxy;
	#result?: PDFDocumentProxy;
	#token = 0;
	#seq = 0;
	#shown = 0;

	willDestroy() {
		super.willDestroy();
		this.#close();
	}

	get modeIndex() {
		return this.recompressImages ? 0 : 1;
	}

	get loss() {
		return losses[this.modeIndex]!;
	}

	get sizeIndex() {
		return MAX_SIZES.findIndex((s) => s.value === this.maxEdge);
	}

	get detail() {
		if (!this.file) return '';
		const parts = [formatBytes(this.file.size)];
		const n = this.pages.length;
		if (n) parts.push(n === 1 ? '1 page' : `${n} pages`);
		return parts.join(' · ');
	}

	get aspect() {
		const size = this.pages[this.page]?.size;
		return size
			? Math.max(0.2, size.width / Math.max(size.height, 1))
			: 210 / 297;
	}

	get fileName() {
		return `${(this.file?.name ?? '').replace(/\.pdf$/i, '')}-small.pdf`;
	}

	get resultRow() {
		const { compressed, file } = this;
		if (!compressed || !file) return null;
		const savings = savingsPercent(file.size, compressed.size);
		const parts = [
			formatBytes(compressed.size),
			savings === 0
				? '±0%'
				: `${savings < 0 ? '−' : '+'}${Math.abs(savings)}%`,
		];
		const n = compressed.imagesTouched;
		if (n > 0) parts.push(`${n} image${n === 1 ? '' : 's'}`);
		return { name: this.fileName, detail: parts.join(' · ') };
	}

	load = (file: File) => {
		if (
			file.type !== 'application/pdf' &&
			!/\.pdf$/i.test(file.name)
		)
			return;
		void this.#load(file);
	};

	async #load(file: File) {
		this.clear();
		const token = this.#token;
		this.file = file;
		const bytes = await file.arrayBuffer();
		if (token !== this.#token) return;
		this.#bytes = bytes;
		let pdf: PDFDocumentProxy;
		try {
			pdf = await open(bytes);
		} catch {
			return;
		}
		if (token !== this.#token) return void pdf.destroy();
		this.#pdf = pdf;
		this.pages = (await sizes(pdf)).map((size) => ({ size }));
		if (token !== this.#token) return;
		void this.#compare();
		await thumbnails(
			pdf,
			() => token === this.#token,
			(index, picture) => {
				const pages = [...this.pages];
				pages[index] = { ...pages[index]!, picture };
				this.pages = pages;
			},
		);
	}

	async #compare() {
		const shown = ++this.#shown;
		const [before, after] = await Promise.all([
			this.#pdf ? comparison(this.#pdf, this.page) : '',
			this.#result ? comparison(this.#result, this.page) : '',
		]);
		if (shown !== this.#shown) {
			for (const url of [before, after])
				if (url) URL.revokeObjectURL(url);
			return;
		}
		this.#revokeCompare();
		this.before = before;
		this.after = after;
	}

	selectPage = (index: number) => {
		if (index === this.page) return;
		this.page = index;
		void this.#compare();
	};

	pickMode = (index: number) => {
		const recompress = index === 0;
		if (recompress === this.recompressImages) return;
		this.recompressImages = recompress;
		this.#invalidate();
	};

	pickQuality = (value: number) => {
		if (value === this.quality) return;
		this.quality = value;
		this.#invalidate();
	};

	pickSize = (index: number) => {
		const value = MAX_SIZES[index]?.value;
		if (value === undefined || value === this.maxEdge) return;
		this.maxEdge = value;
		this.#invalidate();
	};

	#invalidate() {
		this.#seq++;
		this.compressing = false;
		this.compressed = null;
		this.failed = false;
		void this.#result?.destroy();
		this.#result = undefined;
		if (this.after) {
			URL.revokeObjectURL(this.after);
			this.after = '';
		}
	}

	compress = () => void this.#compress();

	async #compress() {
		const bytes = this.#bytes;
		if (!bytes || this.compressing) return;
		const seq = ++this.#seq;
		this.compressing = true;
		this.failed = false;
		try {
			const result = await compressPdf(bytes.slice(0), {
				recompressImages: this.recompressImages,
				quality: this.quality,
				maxEdge: this.maxEdge,
			});
			if (seq !== this.#seq) return;
			this.compressed = {
				blob: new Blob([result.bytes], {
					type: 'application/pdf',
				}),
				size: result.bytes.byteLength,
				imagesTouched: result.imagesTouched,
			};
			const pdf = await open(result.bytes).catch(
				() => undefined,
			);
			if (seq !== this.#seq) return void pdf?.destroy();
			this.#result = pdf;
			void this.#compare();
		} catch {
			if (seq === this.#seq) this.failed = true;
		} finally {
			if (seq === this.#seq) this.compressing = false;
		}
	}

	save = () => {
		if (this.compressed)
			downloadBlob(this.compressed.blob, this.fileName);
	};

	clear = () => {
		this.#token++;
		this.#close();
		this.#invalidate();
		this.#shown++;
		this.file = null;
		this.#bytes = null;
		this.pages = [];
		this.page = 0;
	};

	#revokeCompare() {
		for (const url of [this.before, this.after])
			if (url) URL.revokeObjectURL(url);
	}

	#close() {
		for (const page of this.pages)
			if (page.picture) URL.revokeObjectURL(page.picture);
		this.#revokeCompare();
		this.before = '';
		this.after = '';
		void this.#pdf?.destroy();
		void this.#result?.destroy();
		this.#pdf = undefined;
		this.#result = undefined;
	}

	<template>
		<CanonSplit
			class="pdf-compressor"
			{{filePaste this.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@height={{pageStripHeight}}
					@background="var(--canon-muted)"
				>
					{{#if this.file}}
						<CanonPageStrip
							@pages={{this.pages}}
							@selected={{this.page}}
							@onSelect={{this.selectPage}}
						/>
					{{else}}
						<Slot
							class="pc-slot"
							@prompt="Drop PDF here"
							@icon="shrink"
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.load}}
						/>
					{{/if}}
				</CanonCanvas>
			</:banner>
			<:sidebar>
				{{#if this.file}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="pc-source"
							@title={{this.file.name}}
							@detail={{this.detail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Images" />
					<CanonSegmented
						class="pc-modes"
						@items={{modes}}
						@selected={{this.modeIndex}}
						@disabled={{this.compressing}}
						@onChange={{this.pickMode}}
					/>
					<CanonStatus
						class="pc-loss"
						@text={{this.loss}}
						@tone="muted"
						@row={{true}}
					/>
					{{#if this.recompressImages}}
						<CanonRow
							class="pc-quality"
							@title="Quality"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.quality}}
								@min={{30}}
								@max={{90}}
								@step={{1}}
								@readout={{whole}}
								@labelledBy={{titleId}}
								@onChange={{this.pickQuality}}
							/>
						</CanonRow>
						<CanonHeading
							@text="Max size"
						/>
						<CanonSegmented
							class="pc-sizes"
							@items={{sizeLabels}}
							@selected={{this.sizeIndex}}
							@disabled={{this.compressing}}
							@onChange={{this.pickSize}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<Job
						@title="Compress"
						@icon={{Shrink}}
						@failure="Failed"
						@disabled={{if
							this.file
							false
							true
						}}
						@busy={{this.compressing}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.compress}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonCanvas
					@height={{150}}
					@boxing="unlessWide"
				>
					<CanonCompressionScale
						@before={{if
							this.file
							this.file.size
							0
						}}
						@after={{if
							this.compressed
							this.compressed.size
							0
						}}
						@format="Compressed"
						@working={{this.compressing}}
					/>
				</CanonCanvas>
				{{#if this.file}}
					<CanonCanvas
						class="pc-compare"
						@aspect={{this.aspect}}
						@maxHeight={{640}}
						@boxing="unlessWide"
						@background="var(--canon-muted)"
					>
						<CanonImageCompare
							@before={{if
								this.before
								this.before
							}}
							@after={{if
								this.after
								this.after
							}}
						/>
					</CanonCanvas>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
