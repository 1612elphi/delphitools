import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	parseMetadata,
	stripMetadata,
	type ImageContainer,
	type MetadataEntry,
	type MetadataReport,
} from 'delphitools-v2/lib/metadata';
import {
	parsePdfMetadata,
	stripPdfMetadata,
	type PdfMetadataReport,
} from 'delphitools-v2/lib/pdf-metadata';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Slot from 'delphitools-v2/components/tools/media/slot';
import Dossier from 'delphitools-v2/components/tools/metadata-stripper/dossier';
import {
	blocksOf,
	type Block,
} from 'delphitools-v2/components/tools/metadata-stripper/blocks';
import './media/media.css';
import './metadata-stripper/metadata-stripper.css';

const FILE_ACCEPT = 'image/*,application/pdf';
const SLOT_PROMPT = 'Drop an image or PDF';
const EMPTY_PROMPT = 'Add an image or PDF to see its metadata';
const UNREADABLE = 'Format not readable';
const READ_ERROR = 'This file could not be read as an image.';

const MIME: Record<ImageContainer, string> = {
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
};

const REENCODABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

const isPdf = (file: File, bytes: Uint8Array) =>
	file.type === 'application/pdf' ||
	String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';

const pdfBlocks = (report: PdfMetadataReport | null) =>
	new Set<Block>(report?.xmp ? ['XMP'] : []);

const asReport = (report: PdfMetadataReport): MetadataReport => ({
	format: null,
	entries: report.entries,
	gps: null,
	c2pa: false,
});

const tilesOf = (entries: MetadataEntry[]) =>
	entries.map((entry) => ({ label: entry.label, value: entry.detail }));

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

interface StripState {
	blob: Blob;
	removed: string[];
}

export default class MetadataStripper extends Component {
	drop = new Drop(FILE_ACCEPT, (file) => this.readFile(file));

	@tracked fileName = '';
	@tracked fileSize = 0;
	@tracked report: MetadataReport | null = null;
	@tracked afterReport: MetadataReport | null = null;
	@tracked pdf: PdfMetadataReport | null = null;
	@tracked afterPdf: PdfMetadataReport | null = null;
	@tracked result: StripState | null = null;
	@tracked keepColourProfile = true;
	@tracked error = '';

	#bytes: Uint8Array | null = null;
	#token = 0;

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

	get unreadable() {
		if (this.pdf) return !this.pdf.readable;
		return this.report !== null && this.report.format === null;
	}

	get clean() {
		return (
			this.report !== null &&
			this.entries.length === 0 &&
			(this.result?.removed.length ?? 0) === 0
		);
	}

	get afterStatus() {
		if (!this.result) return UNREADABLE;
		return this.clean ? 'Already clean' : 'Nothing left';
	}

	get found() {
		if (!this.loaded) return null;
		return this.pdf ? pdfBlocks(this.pdf) : blocksOf(this.report);
	}

	get left() {
		if (!this.result) return null;
		return this.pdf
			? pdfBlocks(this.afterPdf)
			: blocksOf(this.afterReport);
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
		const token = ++this.#token;
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (token !== this.#token) return;
		this.error = '';
		this.fileName = file.name;
		this.fileSize = file.size;
		this.#bytes = bytes;
		this.result = null;
		this.afterReport = null;
		this.afterPdf = null;
		if (isPdf(file, bytes)) await this.#loadPdf(bytes, token);
		else {
			this.pdf = null;
			this.report = parseMetadata(bytes);
			await this.#restrip();
		}
	}

	async #loadPdf(bytes: Uint8Array, token: number) {
		const pdf = await parsePdfMetadata(bytes);
		const stripped = pdf.readable
			? await stripPdfMetadata(bytes)
			: null;
		const after = stripped
			? await parsePdfMetadata(stripped.data)
			: null;
		if (token !== this.#token) return;
		this.pdf = pdf;
		this.report = asReport(pdf);
		if (!stripped || !after) return;
		this.result = {
			blob: new Blob([stripped.data as BlobPart], {
				type: 'application/pdf',
			}),
			removed: stripped.removed,
		};
		this.afterPdf = after;
		this.afterReport = asReport(after);
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

	async #canvasStrip() {
		const bytes = this.#bytes;
		if (!bytes) return;
		const token = this.#token;
		const type = REENCODABLE.has(this.report?.format ?? '')
			? MIME[this.report!.format!]
			: 'image/png';
		try {
			const bitmap = await createImageBitmap(
				new Blob([bytes as BlobPart]),
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
			const after = parseMetadata(
				new Uint8Array(await blob.arrayBuffer()),
			);
			if (token !== this.#token) return;
			this.result = {
				blob,
				removed: ['All metadata (re-encoded)'],
			};
			this.afterReport = after;
		} catch {
			if (token !== this.#token) return;
			this.result = null;
			this.afterReport = null;
			this.error = READ_ERROR;
		}
	}

	toggleColourProfile = (keep: boolean) => {
		this.keepColourProfile = keep;
		void this.#restrip();
	};

	clear = () => {
		this.#token++;
		this.#bytes = null;
		this.fileName = '';
		this.fileSize = 0;
		this.report = null;
		this.afterReport = null;
		this.pdf = null;
		this.afterPdf = null;
		this.result = null;
		this.error = '';
	};

	download = () => {
		if (this.result)
			downloadBlob(this.result.blob, this.downloadName);
	};

	<template>
		<CanonSplit
			class="metadata-stripper"
			{{filePaste this.readFile accept=FILE_ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@fitting={{true}}
					@background="var(--canon-muted)"
				>
					{{#if this.loaded}}
						<Dossier
							@found={{this.found}}
							@left={{this.left}}
							@location={{if
								this.report.gps
								this.report.gps
								null
							}}
						/>
					{{else}}
						<div class="ms-slot-box">
							<Slot
								class="ms-slot"
								@prompt={{SLOT_PROMPT}}
								@icon="upload"
								@accept={{FILE_ACCEPT}}
								@over={{this.drop.over}}
								@onFile={{this.readFile}}
							/>
						</div>
					{{/if}}
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="ms-source"
							@title={{this.fileName}}
							@detail={{this.sizeLabel}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.error}}
						<CanonStatus
							@text={{this.error}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					{{#unless this.pdf}}
						<CanonRow
							class="ms-icc"
							@title="Colour profile"
							@detail="Keep ICC"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.keepColourProfile}}
								@onChange={{this.toggleColourProfile}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					{{/unless}}
					{{#if this.loaded}}
						{{#unless this.pdf}}
							<CanonRow
								class="ms-c2pa"
								@title="Content Credentials"
								@detail={{if
									this.report.c2pa
									"C2PA found"
									"None"
								}}
							/>
						{{/unless}}
						<CanonRow
							class="ms-removed"
							@title="Removed"
							@detail={{this.removedLabel}}
						/>
					{{/if}}
					<CanonButton
						class="ms-download"
						@kind="primary"
						@text={{passAlong "Download"}}
						@icon={{Save}}
						@iconStyle="oversized"
						@disabled={{if
							this.result
							false
							true
						}}
						@onClick={{this.download}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				{{#if this.loaded}}
					<CanonRows
						class="ms-found"
						@framed={{true}}
					>
						<CanonHeading
							@text="Found in original"
						/>
						{{#if this.unreadable}}
							<CanonStatus
								@text={{UNREADABLE}}
								@tone="warn"
								@row={{true}}
							/>
						{{else if this.entries.length}}
							<CanonTiles
								@items={{tilesOf
									this.entries
								}}
							/>
						{{else}}
							<CanonStatus
								@text="No metadata found"
								@tone="muted"
								@row={{true}}
							/>
						{{/if}}
					</CanonRows>
					<CanonRows
						class="ms-after"
						@framed={{true}}
					>
						<CanonHeading
							@text="After stripping"
						/>
						{{#if this.afterEntries.length}}
							<CanonTiles
								@items={{tilesOf
									this.afterEntries
								}}
							/>
						{{else}}
							<CanonStatus
								@text={{this.afterStatus}}
								@tone={{if
									this.result
									"ok"
									"warn"
								}}
								@row={{true}}
							/>
						{{/if}}
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonEmptyRow
							@text={{EMPTY_PROMPT}}
						/>
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
